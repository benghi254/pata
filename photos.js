// Photos sellers upload for their shop and for each product or service in their catalogue.
// They are stored in Postgres (the photos table), so they work the same on Vercel, where the
// file system is read-only, and locally. The browser shrinks photos before uploading
// (public/js/photos.js), so each is usually a few hundred KB.
const multer = require('multer');
const db = require('./db');

const MAX_PHOTOS = 4; // per shop, and per item
const MAX_BYTES = 4 * 1024 * 1024; // per photo, as received

// Only real JPEG, PNG and WebP files, recognised by their first bytes (not the name the browser sent).
function imageType(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

const parser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: MAX_PHOTOS, fields: 200 },
}).array('photos', MAX_PHOTOS);

// Route middleware for forms with enctype="multipart/form-data". It reads the text fields into
// req.body and the photos into req.files. Upload problems become req.photoError for the form to show.
function upload(req, res, next) {
  parser(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      req.photoError = {
        LIMIT_FILE_SIZE: 'Each photo must be smaller than 4 MB.',
        LIMIT_FILE_COUNT: `You can add up to ${MAX_PHOTOS} photos.`,
        LIMIT_UNEXPECTED_FILE: `You can add up to ${MAX_PHOTOS} photos.`,
      }[err.code] || 'Those photos could not be uploaded. Try again.';
      req.body ||= {};
      req.files = [];
      return next();
    }
    req.files = (req.files || []).filter((f) => f.size > 0); // an empty file input sends one blank part
    next(err);
  });
}

// The photos the form asked to remove, as ids.
const removalsFrom = (body) => [].concat(body.removePhoto || []).map(Number).filter(Number.isInteger);

// Checks the uploaded photos. `existing` is the list of photos already saved for this shop / item.
function check(req, existing = []) {
  if (req.photoError) return [req.photoError];
  const errors = [];
  if (req.files.some((f) => !imageType(f.buffer))) errors.push('Photos must be JPG, PNG or WebP images.');
  const removing = new Set(removalsFrom(req.body));
  const kept = existing.filter((p) => !removing.has(p.id)).length;
  if (kept + req.files.length > MAX_PHOTOS) {
    errors.push(`You can have up to ${MAX_PHOTOS} photos. Remove some before adding more.`);
  }
  return errors;
}

// Photos (without the image data) for a shop (itemId null) or one item, in display order.
function list(listingId, itemId = null) {
  return db.query(`SELECT id, listing_id, item_id, position FROM photos
    WHERE listing_id = ? AND item_id IS NOT DISTINCT FROM ?::int ORDER BY position, id`, [listingId, itemId]);
}

// Every item's photo ids for one shop, as { itemId: [id, ...] }.
async function byItem(listingId) {
  const rows = await db.query(`SELECT id, item_id FROM photos
    WHERE listing_id = ? AND item_id IS NOT NULL ORDER BY position, id`, [listingId]);
  const out = {};
  for (const r of rows) (out[r.item_id] ||= []).push(r.id);
  return out;
}

// Removes the photos the form ticked, then adds the new uploads after the ones kept.
async function apply(req, listingId, itemId = null) {
  const remove = removalsFrom(req.body);
  if (remove.length) {
    await db.query(`DELETE FROM photos WHERE listing_id = ? AND item_id IS NOT DISTINCT FROM ?::int
      AND id = ANY(?::int[])`, [listingId, itemId, remove]);
  }
  if (!req.files.length) return;
  const last = await db.one(`SELECT COALESCE(MAX(position), -1)::int AS n FROM photos
    WHERE listing_id = ? AND item_id IS NOT DISTINCT FROM ?::int`, [listingId, itemId]);
  let position = last.n;
  for (const f of req.files) {
    position += 1;
    await db.query('INSERT INTO photos (listing_id, item_id, mime, data, position) VALUES (?, ?, ?, ?, ?)',
      [listingId, itemId, imageType(f.buffer), f.buffer, position]);
  }
}

async function get(id) {
  return db.one('SELECT mime, data FROM photos WHERE id = ?', [id]);
}

// The shop's first photo, for listing cards, as `photo_id` on each row of a listings query.
const coverSql = (alias = 'listings') => `(SELECT p.id FROM photos p WHERE p.listing_id = ${alias}.id
  AND p.item_id IS NULL ORDER BY p.position, p.id LIMIT 1) AS photo_id`;

const url = (id) => `/photos/${id}`;

module.exports = { MAX_PHOTOS, upload, check, list, byItem, apply, get, coverSql, url };
