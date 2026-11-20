// SQLite database using Node's built-in driver (no MySQL server needed).
// The database file lives in data/pata.db and is created on first run.
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(process.env.DB_PATH || path.join(dataDir, 'pata.db'));

db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    first_name    TEXT NOT NULL,
    other_name    TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS listings (
    id           INTEGER PRIMARY KEY,
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
    latitude     REAL,
    longitude    REAL,
    hours        TEXT,
    created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS listings_category ON listings(category);
`);

// Add columns introduced after the first version to databases created before them.
const existing = db.prepare('PRAGMA table_info(listings)').all().map((c) => c.name);
for (const [name, type] of [
  ['street', "TEXT NOT NULL DEFAULT ''"],
  ['latitude', 'REAL'],
  ['longitude', 'REAL'],
  ['hours', 'TEXT'],
]) {
  if (!existing.includes(name)) db.exec(`ALTER TABLE listings ADD COLUMN ${name} ${type}`);
}

module.exports = db;
