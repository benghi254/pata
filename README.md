# PATA

An online marketplace that links local buyers with sellers of goods (groceries, mutura, clothing,
foodstuff) and services (barbers, cleaners, tailors, technicians).

Built with **Node.js + Express**, **EJS** templates and **SQLite** (Node's built-in driver, so there is
no database server to install).

## Run it

Requires Node.js 22.13 or newer.

```
npm install
npm start
```

Then open http://localhost:3000. Use `npm run dev` instead to restart automatically when you edit files.

The database is created automatically at `data/pata.db`. Delete that file to start fresh.

## What it does

- **Browse**: the home page lists every category. Each category page shows the sellers listed in it.
- **Accounts are for sellers only.** Buyers browse shops, see maps and hours, and call sellers without
  signing up. Sellers create an account (`/signup`) and log in (`/login`) to list and manage their
  shops; passwords are stored scrypt-hashed.
- **Sell**: logged-in users list a product (`/sell/goods`) or a service (`/sell/services`). Sellers give
  their street, building or landmark, drop a pin on a map (or use their phone's location), and set
  opening and closing times for each day of the week.
- **My shops** (`/my/listings`): sellers see all their listings and can edit any of them (details,
  location pin, opening hours) or delete them. Only the owner can edit or delete a listing.
- **Shop pages**: every listing gets its own page (`/listing/<id>/<name>-<area>`) with a map, a
  "Get directions" link, the weekly hours and a live "Open now" / "Closed" badge in East Africa Time.
  Hours that run past midnight (e.g. 6 PM to 2 AM) are supported.

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
db.js          SQLite setup and tables
auth.js        password hashing and the login guard
hours.js       opening hours: form parsing, "open now", schema.org output
seo.js         shop URLs, page descriptions and structured data
categories.js  the list of categories - add a new one here
views/         EJS page templates (partials/ holds the shared header and footer)
public/        CSS, images and the map scripts (js/)
```

## Settings

| Variable         | Default                       |
| ---------------- | ----------------------------- |
| `PORT`           | `3000`                        |
| `SESSION_SECRET` | a dev-only value; set it in production |
| `DB_PATH`        | `data/pata.db`                |
| `SITE_URL`       | taken from the request; set it in production |
| `TZ_SHOPS`       | `Africa/Nairobi` (time zone for "Open now") |
