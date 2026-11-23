# PATA

An online marketplace that links local buyers with sellers of goods (groceries, mutura, clothing,
foodstuff) and services (barbers, cleaners, tailors, technicians).

Built with **Node.js + Express**, **EJS** templates and **Postgres**. Live at **https://pata.unknownkenya.com**,
hosted on **Vercel** with the database on **Neon** (Lakebase Postgres).

## Run it

Requires Node.js 24.

```
npm install
npm start
```

Then open http://localhost:3000. Use `npm run dev` instead to restart automatically when you edit files.

Locally there is nothing else to install: without `DATABASE_URL`, the app runs an embedded Postgres (PGlite)
in `data/pgdata`, so local work never touches live data. Delete that folder to start fresh.

`npm run build` checks that the server loads and every template compiles, then applies the schema
(`npm run migrate`) when a database is configured.

## Deploying

- Hosting: Vercel project `pata` (region `fra1`, Frankfurt), framework Express, set in `vercel.json`.
  The project is connected to GitHub: every push to `main` deploys production, and every other branch or
  pull request gets a preview deployment. Each production build runs the migration before going live.
  Previews have no access to the live database; they use a throwaway embedded one (`PGLITE_DIR=/tmp/...`).
- Database: Neon project `pata`, branch `production` (linked in `.neon`, services in `neon.ts`).
  The app uses the pooled `DATABASE_URL`; migrations use the direct `DATABASE_URL_UNPOOLED`.
- Logins are kept in a signed cookie (`cookie-session`), so they work across serverless instances.
- Production settings live in Vercel: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `SESSION_SECRET`, `SITE_URL`.

## What it does

- **Browse**: the home page lists 52 categories: 6 kinds of goods and 46 services and trades (plumbers,
  electricians, masons, mjengo labourers, mama fua, mechanics, boda riders, salons, tutors and more) in
  groups, with a search box that also understands Swahili terms. Each category page shows its sellers.
- **Accounts are for sellers only.** Buyers browse shops, see maps and hours, and call sellers without
  signing up. Sellers create an account (`/signup`) and log in (`/login`) to list and manage their
  shops; passwords are stored scrypt-hashed.
- **Sell**: logged-in users list a product (`/sell/goods`) or a service (`/sell/services`). Sellers give
  their street, building or landmark, drop a pin on a map (or use their phone's location), and set
  opening and closing times for each day of the week. They pick their county, then constituency, then
  ward from Kenya's official lists (47 counties, 290 constituencies, 1,450 wards): each list fills in
  once the one before it is chosen, and the server checks the ward really is in that constituency and
  county. The search page's "pick your area" uses the same pickers.
- **My shops** (`/my/listings`): sellers see all their listings and can edit any of them (details,
  location pin, opening hours) or delete them. Only the owner can edit or delete a listing.
- **Inventory** (`/listing/<id>/inventory`): each shop owner manages their own catalogue. They can add,
  edit, hide/show and delete items, each with a price, unit ("per kg"), code/SKU and optional stock
  count. Stock changes are recorded as movements (sold, restocked, returned, damaged, lost, or a stock
  count), with quick "−1 Sold" / "+1" buttons for phones; stock can never go below zero. The page
  shows totals (units, stock value), low-stock and out-of-stock alerts, filters and search. Every
  change (who, when, what changed, stock before → after) is kept in a history
  (`/listing/<id>/inventory/history`, also per item), even for deleted items. Both the catalogue and
  the history download as CSV. Only the shop's owner and their team can see any of this.
- **Team** (`/listing/<id>/team`): an owner can give employees their own logins. They create a
  one-time invite link (valid 7 days, shown once, shareable on WhatsApp); the employee opens it, signs
  up or logs in, and joins. For each person the owner ticks what they may do: update stock, add and
  edit items, delete items, see reports (history, stock value, CSV), edit shop details. Presets:
  Shop attendant, Supervisor, Manager. Owners can change permissions, cancel unused links or remove
  people at any time; employees can leave. Only the owner can manage the team or delete the shop.
  The history shows who made each change. Employees see the shops they work at on My shops.
- **Shop pages**: every listing gets its own page (`/listing/<id>/<name>-<area>`) with a map, a
  "Get directions" link, the weekly hours and a live "Open now" / "Closed" badge in East Africa Time.
  Hours that run past midnight (e.g. 6 PM to 2 AM) are supported. Shops with a catalogue also show
  their visible items with prices and "In stock" / "Only 3 left" / "Out of stock".

## Search engines (SEO)

- Each page has its own title, meta description, canonical link and Open Graph / Twitter tags, so
  links shared on WhatsApp, Facebook or X show a proper preview.
- Shop pages include schema.org `LocalBusiness` data (address, map coordinates, phone, opening hours)
  that Google uses for local results, plus breadcrumbs.
- `/sitemap.xml` lists every category and shop; `/robots.txt` points to it and keeps the login and
  sell forms out of search results.
- **In production, set `SITE_URL`** (e.g. `https://pata.co.ke`) so links in the sitemap and tags use
  your real domain, then submit `https://your-domain/sitemap.xml` in Google Search Console.

Maps use [Leaflet](https://leafletjs.com) with OpenStreetMap tiles (no API key needed). OpenStreetMap's
free tile server is for light use; on a busy site switch to another tile provider in `public/js/`.

## Project layout

```
server.js      routes (pages, sign up, login, sell, sitemap, robots.txt)
db.js          Postgres connection, schema and migration (PGlite locally)
scripts/       build check and migration scripts
neon.ts        Neon services for the project (Postgres, Neon Auth)
vercel.json    Vercel settings (Express, Frankfurt region)
auth.js        password hashing and the login guard
hours.js       opening hours: form parsing, "open now", schema.org output
inventory.js   shop catalogues: items, stock movements and the change history
team.js        shop teams: invites, employee permissions and the access check on shop routes
places.js      counties, constituencies and wards (places.json) for the place pickers
seo.js         shop URLs, page descriptions and structured data
categories.js  the list of categories and their groups - add a new one here
views/         EJS page templates (partials/ holds the shared header and footer)
public/        CSS, images and the map scripts (js/)
```

## Settings

| Variable         | Default                       |
| ---------------- | ----------------------------- |
| `PORT`           | `3000`                        |
| `SESSION_SECRET` | a dev-only value; set it in production |
| `DATABASE_URL`   | none: embedded local Postgres; Neon pooled URL in production |
| `DATABASE_URL_UNPOOLED` | direct Neon URL, used only for migrations |
| `SITE_URL`       | taken from the request; set it in production |
| `TZ_SHOPS`       | `Africa/Nairobi` (time zone for "Open now") |
