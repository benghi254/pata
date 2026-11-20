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
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ
  );

  CREATE INDEX IF NOT EXISTS listings_category ON listings(category);
  CREATE INDEX IF NOT EXISTS listings_user ON listings(user_id);
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
