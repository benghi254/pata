// Postgres database (Lakebase Postgres on Neon in production).
// - With DATABASE_URL set, it connects with node-postgres. DATABASE_URL is Neon's *pooled*
//   connection string, which is what serverless app traffic should use.
// - Without it (local development), it runs an embedded Postgres (PGlite) stored in data/pgdata,
//   so `npm run dev` works with nothing to install and never touches live data.
// Queries use `?` placeholders; they are converted to Postgres' $1, $2, ... here.
// Schema changes live in SCHEMA below and run with `npm run migrate` (part of `npm run build`).
const fs = require('node:fs');
const path = require('node:path');

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    first_name    TEXT NOT NULL,
    other_name    TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS listings (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind         TEXT NOT NULL CHECK (kind IN ('goods', 'services')),
    category     TEXT NOT NULL,
    title        TEXT NOT NULL,
    shop_name    TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    phone        TEXT NOT NULL,
    county       TEXT NOT NULL,
    constituency TEXT NOT NULL DEFAULT '',
    ward         TEXT NOT NULL DEFAULT '',
    street       TEXT NOT NULL DEFAULT '',
    latitude     DOUBLE PRECISION,
    longitude    DOUBLE PRECISION,
    hours        TEXT,
    website      TEXT NOT NULL DEFAULT '',
    pay_method   TEXT NOT NULL DEFAULT '',
    pay_number   TEXT NOT NULL DEFAULT '',
    pay_account  TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ
  );

  -- Added after launch: existing databases get the column here.
  ALTER TABLE listings ADD COLUMN IF NOT EXISTS website TEXT NOT NULL DEFAULT '';
  ALTER TABLE listings ADD COLUMN IF NOT EXISTS pay_method TEXT NOT NULL DEFAULT '';
  ALTER TABLE listings ADD COLUMN IF NOT EXISTS pay_number TEXT NOT NULL DEFAULT '';
  ALTER TABLE listings ADD COLUMN IF NOT EXISTS pay_account TEXT NOT NULL DEFAULT '';

  CREATE INDEX IF NOT EXISTS listings_category ON listings(category);
  CREATE INDEX IF NOT EXISTS listings_user ON listings(user_id);

  -- A shop's catalogue: the products or services it sells, with prices and stock.
  -- quantity is NULL for things that aren't counted (services, made to order).
  CREATE TABLE IF NOT EXISTS items (
    id            SERIAL PRIMARY KEY,
    listing_id    INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    sku           TEXT NOT NULL DEFAULT '',
    price         NUMERIC(12, 2),
    unit          TEXT NOT NULL DEFAULT '',
    quantity      INTEGER CHECK (quantity >= 0),
    low_stock_at  INTEGER CHECK (low_stock_at >= 0),
    visible       BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS items_listing ON items(listing_id);

  -- Every change to a shop's catalogue, newest last. Kept when an item is deleted
  -- (item_id becomes NULL; item_name keeps what it was called).
  CREATE TABLE IF NOT EXISTS item_changes (
    id          SERIAL PRIMARY KEY,
    listing_id  INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    item_id     INTEGER REFERENCES items(id) ON DELETE SET NULL,
    item_name   TEXT NOT NULL,
    user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action      TEXT NOT NULL,
    detail      TEXT NOT NULL DEFAULT '',
    qty_before  INTEGER,
    qty_after   INTEGER,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS item_changes_listing ON item_changes(listing_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS item_changes_item ON item_changes(item_id);

  -- People who help run a shop besides its owner (listings.user_id), and what each may do.
  -- Everyone listed here can see the shop's inventory; the can_* columns allow more.
  CREATE TABLE IF NOT EXISTS listing_members (
    listing_id   INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    can_stock    BOOLEAN NOT NULL DEFAULT true,
    can_items    BOOLEAN NOT NULL DEFAULT false,
    can_delete   BOOLEAN NOT NULL DEFAULT false,
    can_reports  BOOLEAN NOT NULL DEFAULT false,
    can_shop     BOOLEAN NOT NULL DEFAULT false,
    added_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ,
    PRIMARY KEY (listing_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS listing_members_user ON listing_members(user_id);

  -- One-time invite links an owner shares with an employee. Only a hash of the token is kept.
  CREATE TABLE IF NOT EXISTS listing_invites (
    id           SERIAL PRIMARY KEY,
    listing_id   INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    token_hash   TEXT NOT NULL UNIQUE,
    label        TEXT NOT NULL DEFAULT '',
    can_stock    BOOLEAN NOT NULL DEFAULT true,
    can_items    BOOLEAN NOT NULL DEFAULT false,
    can_delete   BOOLEAN NOT NULL DEFAULT false,
    can_reports  BOOLEAN NOT NULL DEFAULT false,
    can_shop     BOOLEAN NOT NULL DEFAULT false,
    created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at   TIMESTAMPTZ NOT NULL,
    used_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    used_at      TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS listing_invites_listing ON listing_invites(listing_id);

  -- Photos sellers upload: of the shop (item_id NULL) or of one catalogue item.
  CREATE TABLE IF NOT EXISTS photos (
    id          SERIAL PRIMARY KEY,
    listing_id  INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    item_id     INTEGER REFERENCES items(id) ON DELETE CASCADE,
    mime        TEXT NOT NULL,
    data        BYTEA NOT NULL,
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS photos_owner ON photos(listing_id, item_id, position);
  -- Buyers who proved a phone number with an SMS code. One phone = one buyer, so one
  -- person can't rate a shop many times. phone is 07XXXXXXXX / 01XXXXXXXX.
  CREATE TABLE IF NOT EXISTS buyers (
    id           SERIAL PRIMARY KEY,
    phone        TEXT NOT NULL UNIQUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    verified_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- SMS codes sent to prove a phone. Only a hash of each code is kept. ip_hash limits how many
  -- codes one network can request (the raw address is not stored).
  CREATE TABLE IF NOT EXISTS phone_codes (
    id          SERIAL PRIMARY KEY,
    phone       TEXT NOT NULL,
    code_hash   TEXT NOT NULL,
    ip_hash     TEXT NOT NULL DEFAULT '',
    attempts    INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS phone_codes_phone ON phone_codes(phone, created_at DESC);
  CREATE INDEX IF NOT EXISTS phone_codes_ip ON phone_codes(ip_hash, created_at DESC);

  -- One rating per verified buyer per shop; rating again replaces it.
  CREATE TABLE IF NOT EXISTS ratings (
    listing_id    INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    buyer_id      INTEGER NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
    stars         INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
    comment       TEXT NOT NULL DEFAULT '',
    display_name  TEXT NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ,
    PRIMARY KEY (listing_id, buyer_id)
  );
  CREATE INDEX IF NOT EXISTS ratings_listing ON ratings(listing_id, created_at DESC);

  -- Pickup orders: a verified buyer orders items from a shop's catalogue and collects them later.
  -- Shops opt in with accept_orders; team members need can_orders to handle them.
  ALTER TABLE listings ADD COLUMN IF NOT EXISTS accept_orders BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE listing_members ADD COLUMN IF NOT EXISTS can_orders BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE listing_invites ADD COLUMN IF NOT EXISTS can_orders BOOLEAN NOT NULL DEFAULT false;

  -- status: pending -> accepted -> ready -> collected, or declined / cancelled.
  -- stock_taken: the items were taken out of stock (on accept) and must go back if it's cancelled.
  CREATE TABLE IF NOT EXISTS orders (
    id            SERIAL PRIMARY KEY,
    listing_id    INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    buyer_id      INTEGER NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
    buyer_name    TEXT NOT NULL DEFAULT '',
    status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'accepted', 'ready', 'collected', 'declined', 'cancelled')),
    pickup_at     TIMESTAMPTZ NOT NULL,
    note          TEXT NOT NULL DEFAULT '',
    pickup_code   TEXT NOT NULL,
    total         NUMERIC(12, 2) NOT NULL DEFAULT 0,
    has_unpriced  BOOLEAN NOT NULL DEFAULT false,
    stock_taken   BOOLEAN NOT NULL DEFAULT false,
    reason        TEXT NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ,
    handled_by    INTEGER REFERENCES users(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS orders_listing ON orders(listing_id, status, pickup_at);
  CREATE INDEX IF NOT EXISTS orders_buyer ON orders(buyer_id, created_at DESC);

  -- What was ordered, with the name and price at the time (items can change or be deleted later).
  CREATE TABLE IF NOT EXISTS order_items (
    order_id  INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    item_id   INTEGER REFERENCES items(id) ON DELETE SET NULL,
    name      TEXT NOT NULL,
    unit      TEXT NOT NULL DEFAULT '',
    price     NUMERIC(12, 2),
    quantity  INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 99)
  );
  CREATE INDEX IF NOT EXISTS order_items_order ON order_items(order_id);
`;

// Neon URLs say sslmode=require; pin the strict certificate check pg uses today
// (verify-full) so a future pg release can't silently weaken it.
const strictSsl = (url) => url && url.replace(/sslmode=(require|prefer|verify-ca)\b/, 'sslmode=verify-full');
const serverUrl = () => strictSsl(process.env.DATABASE_URL || process.env.POSTGRES_URL);

let backend; // { query(sql, params) -> { rows }, exec(sql), local }

function connect() {
  if (backend) return backend;
  const url = serverUrl();
  if (url) {
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 5_000 });
    // On Vercel (Fluid compute), let the platform close idle connections before an
    // instance is suspended, so the pool doesn't leak connections to Neon.
    if (process.env.VERCEL) require('@vercel/functions').attachDatabasePool(pool);
    backend = { query: (sql, params) => pool.query(sql, params), exec: (sql) => pool.query(sql), local: false };
  } else {
    const { PGlite } = require('@electric-sql/pglite');
    const dir = process.env.PGLITE_DIR || path.join(__dirname, 'data', 'pgdata');
    fs.mkdirSync(dir, { recursive: true });
    const lite = new PGlite(dir);
    backend = { query: (sql, params) => lite.query(sql, params), exec: (sql) => lite.exec(sql), local: true };
  }
  return backend;
}

const toPg = (sql) => {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
};

async function query(sql, params = []) {
  const { rows } = await connect().query(toPg(sql), params);
  return rows;
}

async function one(sql, params = []) {
  return (await query(sql, params))[0];
}

// Applies SCHEMA over a *direct* (unpooled) connection, as Neon recommends for schema changes.
async function migrate() {
  const url = strictSsl(process.env.DATABASE_URL_UNPOOLED) || serverUrl();
  if (!url) throw new Error('No DATABASE_URL_UNPOOLED or DATABASE_URL to migrate.');
  const { Client } = require('pg');
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(SCHEMA);
  } finally {
    await client.end();
  }
}

// The embedded local database creates its tables on first use. A real server is
// migrated by `npm run migrate` instead, so requests never run DDL.
let ready;
function init() {
  if (!connect().local) return Promise.resolve();
  if (!ready) ready = connect().exec(SCHEMA).catch((err) => { ready = null; throw err; });
  return ready;
}

module.exports = { query, one, init, migrate };
