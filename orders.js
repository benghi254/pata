// Pickup orders: a buyer with a verified phone orders items from a shop's catalogue and picks
// them up later. The shop accepts (stock is taken), marks it ready, and hands it over when the
// buyer shows their pickup code. Cancelling an accepted order puts the stock back.
const crypto = require('node:crypto');
const db = require('./db');
const hours = require('./hours');
const inventory = require('./inventory');
const sms = require('./sms');
const { readPhone } = require('./ratings');

const TZ_OFFSET = '+03:00'; // East Africa Time (no daylight saving), as used for opening hours
const DAYS_AHEAD = 7;
const MIN_LEAD_MINUTES = 15; // earliest pickup is this long from now
const MAX_OPEN_PER_BUYER = 5; // open orders across all shops
const MAX_OPEN_PER_SHOP = 2; // open orders at one shop
const MAX_LINES = 20;
const OPEN = ['pending', 'accepted', 'ready'];

const STATUS = {
  pending: { label: 'Waiting for the shop', tone: 'warn' },
  accepted: { label: 'Accepted, being prepared', tone: 'info' },
  ready: { label: 'Ready for pickup', tone: 'ok' },
  collected: { label: 'Collected', tone: 'done' },
  declined: { label: 'Declined by the shop', tone: 'bad' },
  cancelled: { label: 'Cancelled', tone: 'bad' },
};

// --- Pickup times ---

// The next DAYS_AHEAD days (in East Africa Time) on which the shop opens, for the day picker.
function pickupDays(h, now = new Date()) {
  if (!h) return [];
  const out = [];
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const d = new Date(now.getTime() + i * 86400000);
    const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    const wd = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Nairobi', weekday: 'short' }).format(d).slice(0, 3).toLowerCase();
    const day = h[wd];
    if (!day) continue;
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow'
      : new Intl.DateTimeFormat('en-KE', { timeZone: 'Africa/Nairobi', weekday: 'long', day: 'numeric', month: 'short' }).format(d);
    out.push({ value: ymd, label: `${label} (${hours.fmt(day.open)} – ${hours.fmt(day.close)})` });
  }
  return out;
}

// Checks a requested pickup day + time. Returns { at } or { error }.
function readPickup(h, day, time, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time || '')) {
    return { error: 'Choose a pickup day and time.' };
  }
  const at = new Date(`${day}T${time}:00${TZ_OFFSET}`);
  if (Number.isNaN(at.getTime())) return { error: 'Choose a pickup day and time.' };
  if (at.getTime() < now.getTime() + MIN_LEAD_MINUTES * 60000) {
    return { error: `Choose a pickup time at least ${MIN_LEAD_MINUTES} minutes from now.` };
  }
  if (at.getTime() > now.getTime() + DAYS_AHEAD * 86400000) return { error: `Choose a pickup time within the next ${DAYS_AHEAD} days.` };
  const st = h && hours.status(h, at);
  if (!st || !st.isOpen) return { error: 'The shop is closed at that time. Choose a time within its opening hours.' };
  return { at };
}

const fmtWhen = (d) => new Intl.DateTimeFormat('en-KE', {
  timeZone: 'Africa/Nairobi', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
}).format(new Date(d));

// --- Who may order ---

// Why this person may not order from this shop, or null.
async function blockedReason(listing, seller, buyer) {
  if (!listing.accept_orders) return 'This shop is not taking pickup orders right now.';
  if (seller) {
    if (seller.id === listing.user_id) return "You can't order from your own shop.";
    if (await db.one('SELECT 1 FROM listing_members WHERE listing_id = ? AND user_id = ?', [listing.id, seller.id])) {
      return "You help run this shop, so you can't order from it.";
    }
  }
  if (buyer && [listing.phone, listing.pay_number].map(readPhone).filter(Boolean).includes(buyer.phone)) {
    return "This is the shop's own phone number, so it can't order from the shop.";
  }
  return null;
}

// Items a buyer can order: shown, and in stock if the shop counts it.
const orderableItems = (listingId) => db.query(`
  SELECT * FROM items WHERE listing_id = ? AND visible AND (quantity IS NULL OR quantity > 0)
  ORDER BY lower(name), id
`, [listingId]);

// --- Placing an order ---

// Reads qty_<itemId> fields against the shop's items. Returns { lines, errors }.
function readLines(body, items) {
  const lines = [];
  const errors = [];
  for (const item of items) {
    const raw = String(body[`qty_${item.id}`] || '').trim();
    if (!raw || raw === '0') continue;
    const qty = /^\d{1,2}$/.test(raw) ? Number(raw) : NaN;
    if (!(qty >= 1 && qty <= 99)) { errors.push(`${item.name}: choose from 1 to 99.`); continue; }
    if (item.quantity != null && qty > item.quantity) { errors.push(`${item.name}: only ${item.quantity} left.`); continue; }
    lines.push({ item, qty });
  }
  if (!lines.length && !errors.length) errors.push('Choose how many of at least one item.');
  if (lines.length > MAX_LINES) errors.push(`Order at most ${MAX_LINES} different items at a time.`);
  return { lines, errors };
}

async function openCounts(buyerId, listingId) {
  return db.one(`SELECT
    COUNT(*) FILTER (WHERE status = ANY(?::text[]))::int AS all_open,
    COUNT(*) FILTER (WHERE status = ANY(?::text[]) AND listing_id = ?)::int AS shop_open
    FROM orders WHERE buyer_id = ?`, [OPEN, OPEN, listingId, buyerId]);
}

async function place(listing, buyer, { lines, name, note, at }) {
  const counts = await openCounts(buyer.id, listing.id);
  if (counts.shop_open >= MAX_OPEN_PER_SHOP) return { error: `You already have ${counts.shop_open} open orders at this shop. Wait for them to be collected or cancel one.` };
  if (counts.all_open >= MAX_OPEN_PER_BUYER) return { error: `You have ${counts.all_open} open orders. Collect or cancel some before ordering more.` };
  const priced = lines.filter((l) => l.item.price != null);
  const total = priced.reduce((s, l) => s + Number(l.item.price) * l.qty, 0);
  const code = String(crypto.randomInt(0, 10000)).padStart(4, '0');
  const order = await db.one(`
    INSERT INTO orders (listing_id, buyer_id, buyer_name, pickup_at, note, pickup_code, total, has_unpriced)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *
  `, [listing.id, buyer.id, name, at.toISOString(), note, code, total, priced.length < lines.length]);
  for (const l of lines) {
    await db.query('INSERT INTO order_items (order_id, item_id, name, unit, price, quantity) VALUES (?, ?, ?, ?, ?, ?)',
      [order.id, l.item.id, l.item.name, l.item.unit, l.item.price, l.qty]);
  }
  notify(readPhone(listing.phone), `PATA: New pickup order #${order.id} at ${listing.shop_name} for ${fmtWhen(at)}. Open My shops > Orders to accept it.`);
  return { order };
}

// --- Changing status ---

// action -> who may do it, from which statuses, to which status, and what happens to stock.
const ACTIONS = {
  accept: { by: 'shop', from: ['pending'], to: 'accepted', stock: 'take' },
  decline: { by: 'shop', from: ['pending'], to: 'declined' },
  ready: { by: 'shop', from: ['accepted'], to: 'ready' },
  collected: { by: 'shop', from: ['accepted', 'ready'], to: 'collected' },
  notcollected: { by: 'shop', from: ['accepted', 'ready'], to: 'cancelled', stock: 'return' },
  cancel: { by: 'buyer', from: ['pending', 'accepted'], to: 'cancelled', stock: 'return' },
};

const itemsOf = (orderId) => db.query('SELECT * FROM order_items WHERE order_id = ? ORDER BY name', [orderId]);

// Takes (or returns) the stock of an order's counted items. On a shortage, puts back what it took.
async function moveOrderStock(order, userId, direction) {
  const lines = (await itemsOf(order.id)).filter((l) => l.item_id);
  const done = [];
  for (const l of lines) {
    const item = await db.one('SELECT quantity FROM items WHERE id = ?', [l.item_id]);
    if (!item || item.quantity == null) continue; // deleted, or stock not counted
    const r = await inventory.moveStock(order.listing_id, userId, l.item_id, direction === 'take' ? 'order' : 'order_back', String(l.quantity), `#${order.id}`);
    if (r.error) {
      for (const d of done) await inventory.moveStock(order.listing_id, userId, d.item_id, 'order_back', String(d.quantity), `#${order.id} (undo)`);
      return { error: `${l.name}: ${r.error}` };
    }
    done.push(l);
  }
  return { ok: true };
}

// Moves an order to the action's status if it is still in an allowed one (so two people
// clicking at once can't both act). Returns { order } or { error }.
async function act(order, actionKey, { by, userId, reason = '', code = '', skipCode = false, listing }) {
  const a = ACTIONS[actionKey];
  if (!a || a.by !== by) return { error: 'That action is not available.' };
  if (!a.from.includes(order.status)) return { error: `This order is already ${STATUS[order.status].label.toLowerCase()}.` };
  if (actionKey === 'collected' && !skipCode && String(code).trim() !== order.pickup_code) {
    return { error: "That pickup code doesn't match. Ask the buyer for the 4-digit code on their order, or tick the box if you checked them another way." };
  }
  const updated = await db.one(`
    UPDATE orders SET status = ?, reason = ?, updated_at = now(), handled_by = COALESCE(?, handled_by)
    WHERE id = ? AND status = ANY(?::text[]) RETURNING *
  `, [a.to, String(reason).trim().slice(0, 200), userId || null, order.id, a.from]);
  if (!updated) return { error: 'Someone else just changed this order. Check it again.' };

  if (a.stock === 'take') {
    const r = await moveOrderStock(updated, userId, 'take');
    if (r.error) {
      await db.query("UPDATE orders SET status = 'pending', updated_at = now() WHERE id = ?", [order.id]);
      return { error: `Not enough stock to accept: ${r.error} Change your stock or decline the order.` };
    }
    await db.query('UPDATE orders SET stock_taken = true WHERE id = ?', [order.id]);
    updated.stock_taken = true;
  }
  if (a.stock === 'return' && updated.stock_taken) {
    await moveOrderStock(updated, userId || null, 'return');
    await db.query('UPDATE orders SET stock_taken = false WHERE id = ?', [order.id]);
  }

  const buyer = await db.one('SELECT phone FROM buyers WHERE id = ?', [order.buyer_id]);
  const shop = listing.shop_name;
  const msg = {
    accept: `PATA: ${shop} accepted order #${order.id}. Pickup ${fmtWhen(order.pickup_at)}. Your pickup code is ${order.pickup_code}.`,
    ready: `PATA: Order #${order.id} is ready at ${shop}. Show pickup code ${order.pickup_code} when you collect.`,
    decline: `PATA: ${shop} could not take order #${order.id}${updated.reason ? `: ${updated.reason}` : '.'}`,
    notcollected: `PATA: ${shop} cancelled order #${order.id} (not collected).`,
  }[actionKey];
  if (msg && buyer) notify(buyer.phone, msg);
  if (actionKey === 'cancel') notify(readPhone(listing.phone), `PATA: The buyer cancelled order #${order.id} at ${shop}.`);
  return { order: updated };
}

// SMS updates are a courtesy: a failure is logged, never shown as an error.
function notify(phone, message) {
  if (!phone || !sms.available()) return;
  sms.send(phone, message).catch((err) => console.error('order sms:', err.message));
}

// --- Lists ---

async function withItems(orders) {
  if (!orders.length) return orders;
  const rows = await db.query('SELECT * FROM order_items WHERE order_id = ANY(?::int[]) ORDER BY name', [orders.map((o) => o.id)]);
  orders.forEach((o) => { o.items = rows.filter((r) => r.order_id === o.id); });
  return orders;
}

const forShop = async (listingId, open) => withItems(await db.query(`
  SELECT o.*, b.phone AS buyer_phone FROM orders o JOIN buyers b ON b.id = o.buyer_id
  WHERE o.listing_id = ? AND ${open ? 'o.status = ANY(?::text[])' : 'NOT (o.status = ANY(?::text[]))'}
  ORDER BY ${open ? "CASE o.status WHEN 'pending' THEN 0 WHEN 'ready' THEN 1 ELSE 2 END, o.pickup_at" : 'COALESCE(o.updated_at, o.created_at) DESC'}
  LIMIT 100
`, [listingId, OPEN]));

const forBuyer = async (buyerId) => withItems(await db.query(`
  SELECT o.*, l.shop_name, l.street, l.county, l.constituency, l.ward, l.id AS lid, l.phone AS shop_phone
  FROM orders o JOIN listings l ON l.id = o.listing_id WHERE o.buyer_id = ?
  ORDER BY (o.status = ANY(?::text[])) DESC, o.pickup_at DESC LIMIT 50
`, [buyerId, OPEN]));

const newCounts = async (listingIds) => {
  if (!listingIds.length) return new Map();
  const rows = await db.query(`SELECT listing_id, COUNT(*)::int AS n FROM orders
    WHERE listing_id = ANY(?::int[]) AND status = 'pending' GROUP BY listing_id`, [listingIds]);
  return new Map(rows.map((r) => [r.listing_id, r.n]));
};

module.exports = {
  STATUS, OPEN, ACTIONS, MIN_LEAD_MINUTES, pickupDays, readPickup, fmtWhen, blockedReason, orderableItems,
  readLines, place, act, itemsOf, withItems, forShop, forBuyer, newCounts,
};
