// Shop teams: an owner (listings.user_id) and the employees they invite, each with their own login
// and the permissions the owner gives them. Only the owner can manage the team or delete the shop.
const crypto = require('node:crypto');
const db = require('./db');

// What an owner can allow an employee to do. Every member can see the inventory.
const PERMS = [
  ['stock', 'Update stock', 'Record sales, restocks, damages and stock counts'],
  ['orders', 'Handle orders', 'Accept, decline and hand over pickup orders'],
  ['items', 'Add and edit items', 'Add items, change names and prices, hide or show them'],
  ['delete', 'Delete items', 'Remove items from the catalogue'],
  ['reports', 'See reports', 'Change history, stock value and CSV downloads'],
  ['shop', 'Edit shop details', 'Shop name, phone, location and opening hours'],
];
const PERM_KEYS = PERMS.map(([k]) => k);
const COLUMNS = PERM_KEYS.map((k) => `can_${k}`);

// Ready-made sets so owners don't have to think about each box.
const PRESETS = {
  attendant: { label: 'Shop attendant', perms: ['stock', 'orders'] },
  supervisor: { label: 'Supervisor', perms: ['stock', 'orders', 'items', 'reports'] },
  manager: { label: 'Manager', perms: PERM_KEYS },
};

const INVITE_DAYS = 7;
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// Reads permission checkboxes (perm_stock=on, ...) into { stock: true, ... }.
const permsFromForm = (body) => Object.fromEntries(PERM_KEYS.map((k) => [k, body[`perm_${k}`] === 'on']));
const permsFromRow = (row) => Object.fromEntries(PERM_KEYS.map((k) => [k, Boolean(row[`can_${k}`])]));
const permValues = (perms) => PERM_KEYS.map((k) => Boolean(perms[k]));
const permSummary = (perms) => {
  const on = PERMS.filter(([k]) => perms[k]).map(([, label]) => label);
  return on.length ? on.join(', ') : 'View inventory only';
};

// What the user may do in this shop: null if they're neither its owner nor on its team.
async function access(listing, userId) {
  if (!userId) return null;
  if (listing.user_id === userId) {
    return { role: 'owner', ...Object.fromEntries(PERM_KEYS.map((k) => [k, true])), team: true };
  }
  const m = await db.one('SELECT * FROM listing_members WHERE listing_id = ? AND user_id = ?', [listing.id, userId]);
  return m ? { role: 'member', ...permsFromRow(m), team: false } : null;
}

// Route guard. Loads the shop in the URL and checks the user may `need` there:
// 'view' (any team member), a permission key, or 'owner'. Not on the team: 404. On it but not allowed: 403.
function shopAccess(need = 'view') {
  return async (req, res, next) => {
    const listing = await db.one('SELECT * FROM listings WHERE id = ?', [Number(req.params.id) || 0]);
    const can = listing && await access(listing, req.session.user.id);
    if (!can) {
      return res.status(404).render('message', { title: 'Not found', noindex: true, message: "Sorry, we couldn't find that page." });
    }
    const allowed = need === 'view' || (need === 'owner' ? can.role === 'owner' : can[need]);
    if (!allowed) {
      return res.status(403).render('message', {
        title: 'Not allowed', noindex: true,
        message: `You don't have permission to do that at ${listing.shop_name}. Ask the shop owner to change your permissions.`,
      });
    }
    res.locals.listing = listing;
    res.locals.can = can;
    next();
  };
}

async function members(listingId) {
  return db.query(`
    SELECT m.*, u.first_name, u.other_name, u.email FROM listing_members m JOIN users u ON u.id = m.user_id
    WHERE m.listing_id = ? ORDER BY m.created_at, u.first_name
  `, [listingId]);
}

async function pendingInvites(listingId) {
  return db.query(`
    SELECT * FROM listing_invites WHERE listing_id = ? AND used_at IS NULL AND expires_at > now()
    ORDER BY created_at DESC
  `, [listingId]);
}

// Makes a one-time link. Returns the secret token; only its hash is stored.
async function createInvite(listingId, userId, label, perms) {
  const token = crypto.randomBytes(24).toString('base64url');
  await db.query(`
    INSERT INTO listing_invites (listing_id, token_hash, label, ${COLUMNS.join(', ')}, created_by, expires_at)
    VALUES (?, ?, ?, ${COLUMNS.map(() => '?').join(', ')}, ?, now() + interval '${INVITE_DAYS} days')
  `, [listingId, hashToken(token), label, ...permValues(perms), userId]);
  return token;
}

// The invite behind a link, with its shop, if it's still usable.
async function findInvite(token) {
  if (typeof token !== 'string' || token.length > 100) return null;
  return db.one(`
    SELECT i.*, l.shop_name, l.user_id AS owner_id, l.title AS listing_title
    FROM listing_invites i JOIN listings l ON l.id = i.listing_id
    WHERE i.token_hash = ? AND i.used_at IS NULL AND i.expires_at > now()
  `, [hashToken(token)]);
}

// Uses up the invite and adds the user to the team (or updates their permissions if already on it).
// Claiming and joining happen in one statement, so a link can only ever be used once.
async function acceptInvite(token, userId) {
  return db.one(`
    WITH inv AS (
      UPDATE listing_invites SET used_by = ?, used_at = now()
      WHERE token_hash = ? AND used_at IS NULL AND expires_at > now()
        AND listing_id NOT IN (SELECT id FROM listings WHERE user_id = ?)
      RETURNING *
    )
    INSERT INTO listing_members (listing_id, user_id, ${COLUMNS.join(', ')}, added_by)
    SELECT listing_id, ?, ${COLUMNS.join(', ')}, created_by FROM inv
    ON CONFLICT (listing_id, user_id) DO UPDATE SET
      ${COLUMNS.map((c) => `${c} = EXCLUDED.${c}`).join(', ')}, updated_at = now()
    RETURNING listing_id
  `, [userId, hashToken(token), userId, userId]);
}

async function updateMember(listingId, userId, perms) {
  return db.one(`
    UPDATE listing_members SET ${COLUMNS.map((c) => `${c} = ?`).join(', ')}, updated_at = now()
    WHERE listing_id = ? AND user_id = ? RETURNING user_id
  `, [...permValues(perms), listingId, userId]);
}

const removeMember = (listingId, userId) =>
  db.one('DELETE FROM listing_members WHERE listing_id = ? AND user_id = ? RETURNING user_id', [listingId, userId]);

const revokeInvite = (listingId, inviteId) =>
  db.one('DELETE FROM listing_invites WHERE listing_id = ? AND id = ? AND used_at IS NULL RETURNING id', [listingId, inviteId]);

module.exports = {
  PERMS, PERM_KEYS, PRESETS, INVITE_DAYS, permsFromForm, permsFromRow, permSummary,
  access, shopAccess, members, pendingInvites, createInvite, findInvite, acceptInvite,
  updateMember, removeMember, revokeInvite,
};
