// Buyer ratings of shops. To rate, a buyer proves a phone number with a 6-digit SMS code; each
// verified phone can rate a shop once (rating again replaces it). A shop's own people can't rate it.
const crypto = require('node:crypto');
const db = require('./db');
const sms = require('./sms');
const { normalizePhone } = require('./payments');

const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5; // wrong guesses per code
const RESEND_SECONDS = 60; // between codes to the same phone
const PER_PHONE_HOUR = 4; // codes per phone per hour
const PER_IP_HOUR = 10; // codes per network per hour

const secret = () => process.env.SESSION_SECRET || 'dev-only-secret-change-me';
const hmac = (s) => crypto.createHmac('sha256', secret()).update(s).digest('hex');
const codeHash = (phone, code) => hmac(`code:${phone}:${code}`);
const ipHash = (ip) => hmac(`ip:${ip || ''}`);

// "0712 345 678", "+254712345678", "254712345678" -> "0712345678"; null if not a Kenyan mobile.
const readPhone = (input) => normalizePhone(String(input || '').trim());
// 0712345678 -> 0712 ••• 678, for showing which phone is signed in.
const maskPhone = (p) => `${p.slice(0, 4)} ••• ${p.slice(-3)}`;

// Sends a code, unless limits say wait. Returns { ok, error, devCode }.
async function sendCode(phone, ip) {
  if (!sms.available()) return { error: 'Rating by phone is not switched on yet. Please check back soon.' };
  const ipH = ipHash(ip);
  const recent = await db.one(`
    SELECT
      (SELECT COUNT(*)::int FROM phone_codes WHERE phone = ? AND created_at > now() - interval '1 hour') AS phone_hour,
      (SELECT COUNT(*)::int FROM phone_codes WHERE ip_hash = ? AND created_at > now() - interval '1 hour') AS ip_hour,
      (SELECT EXTRACT(EPOCH FROM now() - MAX(created_at))::int FROM phone_codes WHERE phone = ?) AS since_last
  `, [phone, ipH, phone]);
  if (recent.since_last != null && recent.since_last < RESEND_SECONDS) {
    return { error: `We just sent a code. You can ask for another in ${RESEND_SECONDS - recent.since_last} seconds.`, wait: true };
  }
  if (recent.phone_hour >= PER_PHONE_HOUR || recent.ip_hour >= PER_IP_HOUR) {
    return { error: 'Too many codes asked for. Please try again in an hour.' };
  }
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  // A new code replaces any unused one for this phone.
  await db.query('UPDATE phone_codes SET used_at = now() WHERE phone = ? AND used_at IS NULL', [phone]);
  await db.query(`INSERT INTO phone_codes (phone, code_hash, ip_hash, expires_at)
    VALUES (?, ?, ?, now() + interval '${CODE_MINUTES} minutes')`, [phone, codeHash(phone, code), ipH]);
  try {
    await sms.send(phone, `Your PATA code is ${code}. It expires in ${CODE_MINUTES} minutes. Don't share it with anyone.`);
  } catch (err) {
    console.error(err.message);
    return { error: "We couldn't send the SMS. Check the number and try again." };
  }
  return { ok: true, devCode: sms.devMode() ? code : null };
}

// Checks a code. On success returns { buyer }; otherwise { error }.
async function checkCode(phone, code) {
  if (!/^\d{6}$/.test(String(code || '').trim())) return { error: 'Enter the 6-digit code from the SMS.' };
  const row = await db.one(`
    SELECT * FROM phone_codes WHERE phone = ? AND used_at IS NULL AND expires_at > now()
    ORDER BY created_at DESC LIMIT 1
  `, [phone]);
  if (!row) return { error: 'That code has expired. Ask for a new one.', expired: true };
  if (row.attempts >= MAX_ATTEMPTS) return { error: 'Too many wrong tries. Ask for a new code.', expired: true };
  // Count the try first, so guesses are limited even when requests arrive at the same time.
  const tried = await db.one(`UPDATE phone_codes SET attempts = attempts + 1
    WHERE id = ? AND attempts < ? AND used_at IS NULL RETURNING attempts`, [row.id, MAX_ATTEMPTS]);
  if (!tried) return { error: 'Too many wrong tries. Ask for a new code.', expired: true };
  const ok = crypto.timingSafeEqual(Buffer.from(row.code_hash), Buffer.from(codeHash(phone, String(code).trim())));
  if (!ok) {
    const left = MAX_ATTEMPTS - tried.attempts;
    return left > 0 ? { error: `That code is not right. ${left} ${left === 1 ? 'try' : 'tries'} left.` } : { error: 'Too many wrong tries. Ask for a new code.', expired: true };
  }
  const used = await db.one('UPDATE phone_codes SET used_at = now() WHERE id = ? AND used_at IS NULL RETURNING id', [row.id]);
  if (!used) return { error: 'That code was already used. Ask for a new one.', expired: true };
  const buyer = await db.one(`
    INSERT INTO buyers (phone) VALUES (?)
    ON CONFLICT (phone) DO UPDATE SET verified_at = now()
    RETURNING id, phone
  `, [phone]);
  return { buyer };
}

// Why this person may not rate this shop, or null if they may.
// `seller` is the logged-in seller (if any); `buyer` the verified phone (if any).
async function blockedReason(listing, seller, buyer) {
  if (seller) {
    if (seller.id === listing.user_id) return "You can't rate your own shop.";
    const member = await db.one('SELECT 1 FROM listing_members WHERE listing_id = ? AND user_id = ?', [listing.id, seller.id]);
    if (member) return "You help run this shop, so you can't rate it.";
  }
  if (buyer) {
    const shopPhones = [listing.phone, listing.pay_number].map(readPhone).filter(Boolean);
    if (shopPhones.includes(buyer.phone)) return "This is the shop's own phone number, so it can't rate the shop.";
  }
  return null;
}

function readRating(body) {
  const stars = Number(body.stars);
  const comment = String(body.comment || '').trim().replace(/\s+\n/g, '\n').slice(0, 600);
  const name = String(body.displayName || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  const errors = [];
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) errors.push('Choose from 1 to 5 stars.');
  if (comment.length > 500) errors.push('Keep your comment under 500 characters.');
  return { stars, comment: comment.slice(0, 500), name, errors };
}

const saveRating = (listingId, buyerId, r) => db.one(`
  INSERT INTO ratings (listing_id, buyer_id, stars, comment, display_name) VALUES (?, ?, ?, ?, ?)
  ON CONFLICT (listing_id, buyer_id) DO UPDATE SET stars = EXCLUDED.stars, comment = EXCLUDED.comment,
    display_name = EXCLUDED.display_name, updated_at = now()
  RETURNING (xmax = 0) AS created
`, [listingId, buyerId, r.stars, r.comment, r.name]);

const deleteRating = (listingId, buyerId) =>
  db.query('DELETE FROM ratings WHERE listing_id = ? AND buyer_id = ?', [listingId, buyerId]);

const myRating = (listingId, buyerId) =>
  db.one('SELECT * FROM ratings WHERE listing_id = ? AND buyer_id = ?', [listingId, buyerId]);

// Average, count and how many of each star, for a shop page.
async function summary(listingId) {
  const rows = await db.query('SELECT stars, COUNT(*)::int AS n FROM ratings WHERE listing_id = ? GROUP BY stars', [listingId]);
  const counts = [0, 0, 0, 0, 0, 0];
  rows.forEach((r) => { counts[r.stars] = r.n; });
  const count = counts.reduce((a, b) => a + b, 0);
  const average = count ? counts.reduce((s, n, stars) => s + n * stars, 0) / count : null;
  return { count, average, counts };
}

const recent = (listingId, limit = 20) => db.query(`
  SELECT stars, comment, display_name, created_at, updated_at FROM ratings
  WHERE listing_id = ? ORDER BY COALESCE(updated_at, created_at) DESC LIMIT ?
`, [listingId, limit]);

// Adds rating_avg and rating_count to each listing (for listing cards), in one query.
async function attach(listings) {
  if (!listings.length) return listings;
  const ids = listings.map((l) => l.id);
  const rows = await db.query(`SELECT listing_id, AVG(stars)::float AS avg, COUNT(*)::int AS n
    FROM ratings WHERE listing_id = ANY(?::int[]) GROUP BY listing_id`, [ids]);
  const by = new Map(rows.map((r) => [r.listing_id, r]));
  listings.forEach((l) => {
    const r = by.get(l.id);
    l.rating_avg = r ? r.avg : null;
    l.rating_count = r ? r.n : 0;
  });
  return listings;
}

module.exports = {
  CODE_MINUTES, readPhone, maskPhone, sendCode, checkCode, blockedReason,
  readRating, saveRating, deleteRating, myRating, summary, recent, attach,
};
