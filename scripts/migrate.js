// Applies the database schema to the Postgres server in DATABASE_URL_UNPOOLED / DATABASE_URL.
// Runs during `npm run build`, so every Vercel production deploy migrates before it goes live.
// Builds without a database (e.g. preview deploys) skip it.
const db = require('../db');

if (!process.env.DATABASE_URL_UNPOOLED && !process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
  console.log('migrate: no database configured, skipping.');
  process.exit(0);
}

db.migrate()
  .then(() => console.log('migrate: schema is up to date.'))
  .catch((err) => {
    console.error('migrate: failed:', err.message);
    process.exit(1);
  });
