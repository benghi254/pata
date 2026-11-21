const path = require('node:path');
const express = require('express');
const cookieSession = require('cookie-session');

const db = require('./db');
const categories = require('./categories');
const hours = require('./hours');
const seo = require('./seo');
const areas = require('./areas');
const { hashPassword, verifyPassword, requireLogin } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
// Public address of the site, used in canonical links, the sitemap and social previews.
// Set it in production, e.g. SITE_URL=https://pata.co.ke
const SITE_URL = (process.env.SITE_URL || '').replace(/\/+$/, '');

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Helpers every template can use.
Object.assign(app.locals, {
  listingPath: seo.listingPath,
  place: seo.place,
  jsonLdScript: seo.jsonLdScript,
  hoursStatus: (l) => hours.status(hours.parse(l.hours)),
});

// On Vercel, files in public/ are served by the CDN; locally Express serves them.
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: false }));

// Logins live in a signed cookie, so they survive across serverless instances.
if (IS_PROD && !process.env.SESSION_SECRET) throw new Error('Set SESSION_SECRET in production.');
if (IS_PROD) app.set('trust proxy', 1); // Vercel terminates HTTPS in front of the app
app.use(cookieSession({
  name: 'pata',
  keys: [process.env.SESSION_SECRET || 'dev-only-secret-change-me'],
  maxAge: 30 * 24 * 60 * 60 * 1000,
  httpOnly: true,
  sameSite: 'lax',
  secure: IS_PROD,
}));


app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.siteUrl = SITE_URL || `${req.protocol}://${req.get('host')}`;
  res.locals.path = req.path;
  next();
});

// Make sure the tables exist before the first query (once per cold start).
app.use(async (req, res, next) => {
  await db.init();
  next();
});

const KINDS = {
  goods: { label: 'Goods', sellHeading: 'Please fill out the details of the product you are selling' },
  services: { label: 'Services', sellHeading: 'Please fill out the details of the service you offer' },
};

const trim = (v) => (typeof v === 'string' ? v.trim() : '');
const safeNext = (v, fallback = '/') => (typeof v === 'string' && /^\/(?!\/)/.test(v) ? v : fallback);
const categoryBySlug = (slug) => categories.find((c) => c.slug === slug);

function signIn(req, user) {
  req.session.user = { id: user.id, firstName: user.first_name, email: user.email };
}

// ---------- Browsing ----------

app.get('/', async (req, res) => {
  const counts = Object.fromEntries(
    (await db.query('SELECT category, COUNT(*)::int AS n FROM listings GROUP BY category'))
      .map((r) => [r.category, r.n]),
  );
  const { siteUrl } = res.locals;
  res.render('home', {
    title: 'Local marketplace for goods and services in Kenya',
    description: 'PATA connects you with local shops, vendors and fundis near you: groceries, mutura, clothing, barbers, cleaners, tailors and technicians.',
    canonical: '/',
    jsonLd: [
      { '@context': 'https://schema.org', '@type': 'WebSite', name: 'PATA', url: `${siteUrl}/` },
      { '@context': 'https://schema.org', '@type': 'Organization', name: 'PATA', url: `${siteUrl}/`, logo: `${siteUrl}/img/veges.jpg` },
    ],
    goods: categories.filter((c) => c.kind === 'goods'),
    serviceGroups: categories.GROUPS.filter((g) => g.kind === 'services'),
    serviceCount: categories.filter((c) => c.kind === 'services').length,
    counts,
  });
});

app.get('/category/:slug', async (req, res, next) => {
  const category = categoryBySlug(req.params.slug);
  if (!category) return next();
  const listings = await db.query(
    'SELECT * FROM listings WHERE category = ? ORDER BY created_at DESC, id DESC', [category.slug],
  );
  const { siteUrl } = res.locals;
  res.render('category', {
    title: `${category.name} near you`,
    description: `${category.blurb} Browse ${listings.length} ${category.name.toLowerCase()} listed on PATA, with locations, opening hours and phone numbers.`,
    canonical: `/category/${category.slug}`,
    ogImage: categories.photoFor(category),
    jsonLd: [
      seo.breadcrumbs(siteUrl, [['Home', '/'], [category.name, `/category/${category.slug}`]]),
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: category.name,
        itemListElement: listings.map((l, i) => ({
          '@type': 'ListItem', position: i + 1, url: siteUrl + seo.listingPath(l), name: l.shop_name,
        })),
      },
    ],
    category,
    listings,
    related: categories.filter((c) => c.group === category.group && c.slug !== category.slug),
  });
});

// ---------- Search ----------

// Buyers have no accounts, so "your area" comes from the browser: either its location
// (lat/lng, rounded by the page) or an area the buyer picks (county, constituency, ward).
// Results never leave that area unless the buyer widens it.
const RADII = [5, 10, 25, 50, 100]; // km
const DEFAULT_RADIUS = 10;
const MAX_RESULTS = 60;

const num = (v) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);

// Reads the search address into { q, words, area }. area.mode is 'near', 'place', 'kenya' or null (not chosen yet).
function readSearch(query) {
  const q = trim(query.q).slice(0, 100);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
  const lat = num(query.lat);
  const lng = num(query.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    const r = RADII.includes(Number(query.r)) ? Number(query.r) : DEFAULT_RADIUS;
    // Listings without a map pin can't be measured, so match those on the county the buyer is in.
    const county = areas.countyByName(trim(query.county)) || areas.nearestCounty(lat, lng);
    return { q, words, area: { mode: 'near', lat, lng, r, county: county.name } };
  }
  const county = areas.countyByName(trim(query.county));
  if (county) {
    return {
      q, words,
      area: { mode: 'place', county: county.name, constituency: trim(query.constituency).slice(0, 80), ward: trim(query.ward).slice(0, 80) },
    };
  }
  if (query.area === 'kenya') return { q, words, area: { mode: 'kenya' } };
  return { q, words, area: null };
}

// The search address for the same words in another area.
function searchUrl(q, area) {
  const p = new URLSearchParams();
  if (q) p.set('q', q);
  if (area.mode === 'near') {
    p.set('lat', area.lat);
    p.set('lng', area.lng);
    if (area.r !== DEFAULT_RADIUS) p.set('r', area.r);
  } else if (area.mode === 'place') {
    p.set('county', area.county);
    if (area.constituency) p.set('constituency', area.constituency);
    if (area.ward) p.set('ward', area.ward);
  } else if (area.mode === 'kenya') {
    p.set('area', 'kenya');
  }
  return `/search?${p}`;
}

function describeArea(area) {
  if (area.mode === 'near') return `within ${area.r} km of you`;
  if (area.mode === 'kenya') return 'anywhere in Kenya';
  return `in ${[area.ward, area.constituency, `${area.county} County`].filter(Boolean).join(', ')}`;
}

// Each word must appear in the product/service, shop name, description or category.
function textFilter(words) {
  const sql = [];
  const params = [];
  for (const w of words) {
    const like = `%${w.replace(/[\\%_]/g, '\\$&')}%`;
    const cats = categories
      .filter((c) => [c.name, c.keywords, c.group, c.slug].join(' ').toLowerCase().includes(w))
      .map((c) => c.slug);
    sql.push(`(title ILIKE ? OR shop_name ILIKE ? OR description ILIKE ?${cats.length ? ` OR category IN (${cats.map(() => '?').join(', ')})` : ''})`);
    params.push(like, like, like, ...cats);
  }
  return { sql: sql.length ? sql.join(' AND ') : 'TRUE', params };
}

async function findListings(words, area) {
  const text = textFilter(words);
  if (area.mode === 'near') {
    // Pinned listings inside the radius, nearest first; then unpinned ones in the buyer's county.
    return db.query(`
      SELECT * FROM (
        SELECT *, ${areas.distanceSql} AS distance_km FROM listings WHERE ${text.sql}
      ) s
      WHERE distance_km <= ? OR (distance_km IS NULL AND ${areas.normSql('county')} = ?)
      ORDER BY distance_km ASC NULLS LAST, created_at DESC, id DESC
      LIMIT ${MAX_RESULTS}
    `, [area.lat, area.lat, area.lng, ...text.params, area.r, areas.norm(area.county)]);
  }
  const where = [text.sql];
  const params = [...text.params];
  if (area.mode === 'place') {
    for (const field of ['county', 'constituency', 'ward']) {
      if (!area[field]) continue;
      where.push(`${areas.normSql(field)} = ?`);
      params.push(areas.norm(area[field]));
    }
  }
  return db.query(`SELECT *, NULL::float AS distance_km FROM listings WHERE ${where.join(' AND ')}
    ORDER BY created_at DESC, id DESC LIMIT ${MAX_RESULTS}`, params);
}

// Bigger areas to offer, smallest first.
function widerAreas(area) {
  if (area.mode === 'near') {
    return [
      ...RADII.filter((r) => r > area.r).map((r) => ({ ...area, r })),
      { mode: 'place', county: area.county, constituency: '', ward: '' },
      { mode: 'kenya' },
    ];
  }
  if (area.mode === 'place') {
    const out = [];
    if (area.ward && area.constituency) out.push({ ...area, ward: '' });
    if (area.ward || area.constituency) out.push({ ...area, constituency: '', ward: '' });
    out.push({ mode: 'kenya' });
    return out;
  }
  return [];
}

app.get('/search', async (req, res) => {
  const { q, words, area } = readSearch(req.query);
  let listings = [];
  let wider = [];
  if (area) {
    listings = await findListings(words, area);
    // Nothing here? Say how many each wider area would show, so widening is one click.
    if (!listings.length) {
      for (const a of widerAreas(area)) {
        const n = (await findListings(words, a)).length;
        wider.push({ url: searchUrl(q, a), label: describeArea(a), n });
      }
    } else {
      wider = widerAreas(area).slice(0, 2).map((a) => ({ url: searchUrl(q, a), label: describeArea(a) }));
    }
  }
  // Constituencies and wards sellers have used, to suggest in the area picker.
  const places = await db.query(`SELECT DISTINCT county, constituency, ward FROM listings
    WHERE constituency <> '' OR ward <> ''`);
  const inCounty = (p) => !area || !area.county || areas.norm(p.county) === areas.norm(area.county);
  const uniq = (list) => [...new Map(list.filter(Boolean).map((v) => [areas.norm(v), v])).values()].sort();

  res.render('search', {
    title: q ? `Search: ${q}` : 'Search shops and services near you',
    noindex: true,
    q,
    area,
    areaLabel: area ? describeArea(area) : '',
    listings,
    wider,
    radii: RADII,
    counties: areas.COUNTIES.map((c) => c.name).sort(),
    constituencies: uniq(places.filter(inCounty).map((p) => p.constituency)),
    wards: uniq(places.filter(inCounty).map((p) => p.ward)),
    categoryName: (slug) => (categoryBySlug(slug) || {}).name || slug,
    geoFailed: req.query.geo === 'off',
  });
});

// ---------- Accounts ----------

// Accounts are only for sellers. Buyers browse and contact shops without one.
// Already logged in? Go straight to your shops.
const redirectIfLoggedIn = (req, res, next) => (req.session.user ? res.redirect('/my/listings') : next());

app.get('/signup', redirectIfLoggedIn, (req, res) => {
  res.render('signup', { title: 'Become a seller', noindex: true, errors: [], values: {}, next: safeNext(req.query.next, '/sell') });
});

app.post('/signup', redirectIfLoggedIn, async (req, res) => {
  const nextUrl = safeNext(req.body.next, '/sell');
  const values = {
    email: trim(req.body.email).toLowerCase(),
    firstName: trim(req.body.firstName),
    otherName: trim(req.body.otherName),
  };
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  const errors = [];
  if (!/^\S+@\S+\.\S+$/.test(values.email)) errors.push('Enter a valid email address.');
  if (!values.firstName) errors.push('First name is required.');
  if (password.length < 8) errors.push('Password must be at least 8 characters.');
  if (!errors.length && await db.one('SELECT 1 FROM users WHERE email = ?', [values.email])) {
    errors.push('An account with that email already exists. Try logging in.');
  }
  if (errors.length) {
    return res.status(400).render('signup', { title: 'Become a seller', noindex: true, errors, values, next: nextUrl });
  }

  const user = await db.one(
    'INSERT INTO users (email, first_name, other_name, password_hash) VALUES (?, ?, ?, ?) RETURNING id, email, first_name',
    [values.email, values.firstName, values.otherName, hashPassword(password)],
  );
  signIn(req, user);
  res.redirect(nextUrl);
});

app.get('/login', redirectIfLoggedIn, (req, res) => {
  res.render('login', { title: 'Seller login', noindex: true, error: null, email: '', next: safeNext(req.query.next, '/my/listings') });
});

app.post('/login', redirectIfLoggedIn, async (req, res) => {
  const email = trim(req.body.email).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const nextUrl = safeNext(req.body.next, '/my/listings');

  const user = await db.one('SELECT * FROM users WHERE email = ?', [email]);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).render('login', {
      title: 'Seller login', noindex: true, error: 'Wrong email or password.', email, next: nextUrl,
    });
  }
  signIn(req, user);
  res.redirect(nextUrl);
});

app.post('/logout', (req, res) => {
  req.session = null;
  res.redirect('/');
});

// ---------- Selling ----------

app.get('/sell', (req, res) => {
  res.render('sell', {
    title: 'Sell on PATA',
    description: 'List your shop, products or services on PATA for free and get found by buyers near you.',
    canonical: '/sell',
  });
});

// `editing` is the listing being edited, or undefined when creating a new one.
function renderSellForm(res, kindKey, values, errors, status = 200, editing) {
  const kind = KINDS[kindKey];
  res.status(status).render('sell-form', {
    title: editing ? `Edit ${editing.shop_name}` : `Sell ${kind.label.toLowerCase()}`,
    noindex: true,
    map: true,
    kind: kindKey,
    heading: editing ? 'Update your shop details, location and opening hours' : kind.sellHeading,
    action: editing ? `/listing/${editing.id}/edit` : `/sell/${kindKey}`,
    editing: editing || null,
    options: categories.filter((c) => c.kind === kindKey),
    days: hours.DAYS,
    counties: areas.COUNTIES.map((c) => c.name).sort(),
    errors,
    values,
  });
}

// Turns a listing row into the shape the form uses.
function listingToValues(l) {
  return {
    category: l.category,
    title: l.title,
    shopName: l.shop_name,
    description: l.description,
    phone: l.phone,
    website: l.website || '',
    county: l.county,
    constituency: l.constituency,
    ward: l.ward,
    street: l.street,
    latitude: l.latitude ?? '',
    longitude: l.longitude ?? '',
    hours: hours.parse(l.hours) || hours.DEFAULT_HOURS,
  };
}

// Turns what a seller typed as their website into a full http(s) address.
// Returns '' for blank, or null when it isn't a usable web address.
function normalizeWebsite(input) {
  if (!input) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(input) ? input : `https://${input}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !/\.[a-z]{2,}$/i.test(url.hostname)) return null;
  if (url.username || url.password || url.href.length > 500) return null;
  return url.href;
}

// Reads and checks the sell / edit form. Returns { values, errors, row }.
function readListingForm(body, kindKey) {
  const fields = ['category', 'title', 'shopName', 'description', 'phone', 'website', 'county', 'constituency', 'ward', 'street', 'latitude', 'longitude'];
  const values = Object.fromEntries(fields.map((f) => [f, trim(body[f])]));
  const parsedHours = hours.fromForm(body);
  values.hours = parsedHours.hours;

  const errors = [];
  if (!categories.some((c) => c.kind === kindKey && c.slug === values.category)) errors.push('Choose a category.');
  if (!values.title) errors.push(kindKey === 'goods' ? 'Product name is required.' : 'Service is required.');
  if (!values.shopName) errors.push('Shop / business name is required.');
  if (!/^\+?[0-9 ]{9,15}$/.test(values.phone)) errors.push('Enter a valid phone number, e.g. 0712 345678.');
  const website = normalizeWebsite(values.website);
  if (website === null) errors.push('Enter a valid website address, e.g. www.myshop.co.ke.');
  else values.website = website;
  if (!values.county) errors.push('County is required.');
  if (!values.street) errors.push('Enter the street, building or a landmark near your shop.');

  let lat = null;
  let lng = null;
  if (values.latitude || values.longitude) {
    lat = Number(values.latitude);
    lng = Number(values.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      errors.push('The map pin is not valid. Place it again.');
    }
  }
  errors.push(...parsedHours.errors);

  // Column values in the order used by the INSERT and UPDATE below.
  const row = [
    values.category, values.title, values.shopName, values.description, values.phone,
    values.county, values.constituency, values.ward, values.street, lat, lng,
    JSON.stringify(parsedHours.hours), website || '',
  ];
  return { values, errors, row };
}

app.get('/sell/:kind', requireLogin, (req, res, next) => {
  if (!KINDS[req.params.kind]) return next();
  renderSellForm(res, req.params.kind, { hours: hours.DEFAULT_HOURS });
});

app.post('/sell/:kind', requireLogin, async (req, res, next) => {
  const kindKey = req.params.kind;
  if (!KINDS[kindKey]) return next();

  const { values, errors, row } = readListingForm(req.body, kindKey);
  if (errors.length) return renderSellForm(res, kindKey, values, errors, 400);

  const listing = await db.one(`
    INSERT INTO listings (user_id, kind, category, title, shop_name, description, phone,
                          county, constituency, ward, street, latitude, longitude, hours, website)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `, [req.session.user.id, kindKey, ...row]);
  res.redirect(seo.listingPath(listing));
});

// ---------- Managing your own listings ----------

// Loads the listing in the URL if it belongs to the logged-in user; otherwise 404.
async function ownListing(req, res, next) {
  const listing = await db.one('SELECT * FROM listings WHERE id = ? AND user_id = ?',
    [Number(req.params.id) || 0, req.session.user.id]);
  if (!listing) {
    return res.status(404).render('message', { title: 'Not found', noindex: true, message: "Sorry, we couldn't find that page." });
  }
  res.locals.listing = listing;
  next();
}

app.get('/my/listings', requireLogin, async (req, res) => {
  const listings = await db.query('SELECT * FROM listings WHERE user_id = ? ORDER BY created_at DESC, id DESC',
    [req.session.user.id]);
  res.render('my-listings', {
    title: 'My shops',
    noindex: true,
    listings,
    categoryName: (slug) => (categoryBySlug(slug) || {}).name || slug,
    notice: { updated: 'Listing updated.', deleted: 'Listing deleted.' }[req.query.done] || null,
  });
});

app.get('/listing/:id/edit', requireLogin, ownListing, (req, res) => {
  const { listing } = res.locals;
  renderSellForm(res, listing.kind, listingToValues(listing), [], 200, listing);
});

app.post('/listing/:id/edit', requireLogin, ownListing, async (req, res) => {
  const { listing } = res.locals;
  const { values, errors, row } = readListingForm(req.body, listing.kind);
  if (errors.length) return renderSellForm(res, listing.kind, values, errors, 400, listing);

  await db.query(`
    UPDATE listings SET category = ?, title = ?, shop_name = ?, description = ?, phone = ?,
      county = ?, constituency = ?, ward = ?, street = ?, latitude = ?, longitude = ?, hours = ?,
      website = ?, updated_at = now()
    WHERE id = ? AND user_id = ?
  `, [...row, listing.id, req.session.user.id]);
  res.redirect('/my/listings?done=updated');
});

app.post('/listing/:id/delete', requireLogin, ownListing, async (req, res) => {
  await db.query('DELETE FROM listings WHERE id = ? AND user_id = ?', [res.locals.listing.id, req.session.user.id]);
  res.redirect('/my/listings?done=deleted');
});

// Public shop page. Registered after /listing/:id/edit so "edit" is never read as a slug.
app.get('/listing/:id{/:slug}', async (req, res, next) => {
  const listing = await db.one('SELECT * FROM listings WHERE id = ?', [Number(req.params.id) || 0]);
  if (!listing) return next();
  const canonical = seo.listingPath(listing);
  // Keep one address per listing so search engines don't see duplicates.
  if (req.path !== canonical) return res.redirect(301, canonical);

  const category = categoryBySlug(listing.category);
  const { siteUrl } = res.locals;
  const h = hours.parse(listing.hours);
  res.render('listing', {
    title: `${listing.shop_name} – ${listing.title} in ${listing.ward || listing.constituency || listing.county}`,
    description: seo.listingDescription(listing, category),
    canonical,
    ogImage: categories.photoFor(category),
    ogType: 'business.business',
    map: true,
    jsonLd: [
      seo.listingJsonLd(listing, category, siteUrl),
      seo.breadcrumbs(siteUrl, [['Home', '/'], [category.name, `/category/${category.slug}`], [listing.shop_name, canonical]]),
    ],
    listing,
    category,
    status: hours.status(h),
    week: h ? hours.table(h) : null,
    isOwner: Boolean(req.session.user && req.session.user.id === listing.user_id),
  });
});

// ---------- Search engines ----------

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send([
    'User-agent: *',
    'Allow: /',
    'Disallow: /login',
    'Disallow: /signup',
    'Disallow: /sell/',
    '',
    `Sitemap: ${res.locals.siteUrl}/sitemap.xml`,
    '',
  ].join('\n'));
});

app.get('/sitemap.xml', async (req, res) => {
  const { siteUrl } = res.locals;
  const urls = [
    { loc: '/', priority: '1.0' },
    { loc: '/sell', priority: '0.5' },
    ...categories.map((c) => ({ loc: `/category/${c.slug}`, priority: '0.8' })),
    ...(await db.query('SELECT * FROM listings')).map((l) => ({
      loc: seo.listingPath(l), lastmod: new Date(l.updated_at || l.created_at).toISOString().slice(0, 10), priority: '0.7',
    })),
  ];
  const body = urls.map((u) => [
    '  <url>',
    `    <loc>${seo.xmlEscape(siteUrl + u.loc)}</loc>`,
    u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>` : null,
    `    <priority>${u.priority}</priority>`,
    '  </url>',
  ].filter(Boolean).join('\n')).join('\n');
  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`,
  );
});

// ---------- Old .html links keep working ----------

const legacy = { '/buy.html': '/', '/login.html': '/signup', '/sell.html': '/sell',
  '/goodsell.html': '/sell/goods', '/servicesell.html': '/sell/services' };
for (const c of categories) legacy[`/${c.slug}.html`] = `/category/${c.slug}`;
app.get(Object.keys(legacy), (req, res) => res.redirect(301, legacy[req.path]));

// ---------- Errors ----------

app.use((req, res) => {
  res.status(404).render('message', { title: 'Not found', noindex: true, message: "Sorry, we couldn't find that page." });
});

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).render('message', { title: 'Error', noindex: true, message: 'Something went wrong. Please try again.' });
});

// Vercel imports the app; locally `npm start` runs this file and listens on a port.
module.exports = app;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`PATA running at http://localhost:${PORT}`);
  });
}
