const path = require('node:path');
const express = require('express');
const cookieSession = require('cookie-session');

const db = require('./db');
const photos = require('./photos');
const categories = require('./categories');
const hours = require('./hours');
const payments = require('./payments');
const seo = require('./seo');
const inventory = require('./inventory');
const team = require('./team');
const areas = require('./areas');
const places = require('./places');
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
  kes: inventory.kes,
  stockState: inventory.stockState,
  photoUrl: photos.url,
  places,
});

// On Vercel, files in public/ are served by the CDN; locally Express serves them.
app.use(express.static(path.join(__dirname, 'public')));

// Counties, constituencies and wards for the place pickers. The URL carries a version, so it can be cached for long.
app.get('/places.json', (req, res) => {
  res.set('Cache-Control', 'public, max-age=31536000, immutable').type('application/json').send(places.RAW);
});
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
  // The constituency this buyer browses in (see /area). Shops elsewhere are never listed.
  res.locals.area = req.session.area || null;
  res.locals.here = req.originalUrl;
  // One-time messages after a redirect, e.g. "Stock updated."
  res.locals.flash = req.session.flash || null;
  if (req.session.flash) delete req.session.flash;
  next();
});

const flash = (req, type, text) => { req.session.flash = { type, text }; };

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

// ---------- The buyer's constituency ----------

// Buyers have no accounts, so they pick their county and constituency once; it is kept in
// their (signed) session cookie. Every list of shops (home counts, category pages, search)
// only shows shops in that constituency. Shop pages opened from a shared link still work.

// SQL that keeps only listings in the buyer's constituency.
function inArea(area) {
  return {
    sql: `${areas.normSql('county')} = ? AND ${areas.normSql('constituency')} = ?`,
    params: [areas.norm(area.county), areas.norm(area.constituency)],
  };
}

app.get('/area', (req, res) => {
  res.render('area', {
    title: 'Choose your constituency', noindex: true,
    next: safeNext(req.query.next, '/'), error: null,
  });
});

app.post('/area', (req, res) => {
  const nextUrl = safeNext(req.body.next, '/');
  const county = places.county(trim(req.body.county));
  const constituency = county && places.constituency(county, trim(req.body.constituency));
  const place = constituency ? { county, constituency } : null;
  if (!place) {
    return res.status(400).render('area', {
      title: 'Choose your constituency', noindex: true, next: nextUrl,
      error: 'Choose your county, then a constituency in that county.',
    });
  }
  req.session.area = place;
  res.redirect(nextUrl);
});

// ---------- Browsing ----------

app.get('/', async (req, res) => {
  const { area } = res.locals;
  let counts = null; // unknown until the buyer picks their constituency
  if (area) {
    const f = inArea(area);
    counts = Object.fromEntries(
      (await db.query(`SELECT category, COUNT(*)::int AS n FROM listings WHERE ${f.sql} GROUP BY category`, f.params))
        .map((r) => [r.category, r.n]),
    );
  }
  const { siteUrl } = res.locals;
  res.render('home', {
    title: 'Local marketplace for goods and services in Kenya',
    description: 'PATA connects you with local shops, vendors and fundis in your constituency: groceries, mutura, clothing, barbers, cleaners, tailors and technicians.',
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
  const { area, siteUrl } = res.locals;
  let listings = [];
  if (area) {
    const f = inArea(area);
    listings = await db.query(
      `SELECT *, ${photos.coverSql()} FROM listings WHERE category = ? AND ${f.sql} ORDER BY created_at DESC, id DESC`,
      [category.slug, ...f.params],
    );
  }
  res.render('category', {
    title: `${category.name} near you`,
    description: `${category.blurb} Find ${category.name.toLowerCase()} in your constituency on PATA, with locations, opening hours and phone numbers.`,
    canonical: `/category/${category.slug}`,
    ogImage: categories.photoFor(category),
    jsonLd: [
      seo.breadcrumbs(siteUrl, [['Home', '/'], [category.name, `/category/${category.slug}`]]),
    ],
    category,
    listings,
    related: categories.filter((c) => c.group === category.group && c.slug !== category.slug),
  });
});

// ---------- Search ----------

const MAX_RESULTS = 60;

// Each word must appear in the product/service, shop name, description or category.
function textFilter(words) {
  const sql = [];
  const params = [];
  for (const w of words) {
    const like = `%${w.replace(/[\%_]/g, '\$&')}%`;
    const cats = categories
      .filter((c) => [c.name, c.keywords, c.group, c.slug].join(' ').toLowerCase().includes(w))
      .map((c) => c.slug);
    sql.push(`(title ILIKE ? OR shop_name ILIKE ? OR description ILIKE ?${cats.length ? ` OR category IN (${cats.map(() => '?').join(', ')})` : ''})`);
    params.push(like, like, like, ...cats);
  }
  return { sql: sql.length ? sql.join(' AND ') : 'TRUE', params };
}

app.get('/search', async (req, res) => {
  const q = trim(req.query.q).slice(0, 100);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
  const { area } = res.locals;
  let listings = [];
  if (area) {
    const text = textFilter(words);
    const f = inArea(area);
    listings = await db.query(`SELECT *, ${photos.coverSql()} FROM listings WHERE ${text.sql} AND ${f.sql}
      ORDER BY created_at DESC, id DESC LIMIT ${MAX_RESULTS}`, [...text.params, ...f.params]);
  }
  res.render('search', {
    title: q ? `Search: ${q}` : 'Search shops and services in your constituency',
    noindex: true,
    q,
    listings,
    maxResults: MAX_RESULTS,
    categoryName: (slug) => (categoryBySlug(slug) || {}).name || slug,
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
// `shopPhotos` are the photos already saved for it.
function renderSellForm(res, kindKey, values, errors, status = 200, editing, shopPhotos = []) {
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
    payOptions: payments.OPTIONS,
    photos: shopPhotos,
    maxPhotos: photos.MAX_PHOTOS,
    errors,
    values,
  });
}

// Uploaded files can't be put back in the form, so after an error ask for them again.
const photosAgain = (req, errors) => (req.files && req.files.length && errors.length
  ? [...errors, 'Please choose your new photos again.'] : errors);

// Turns a listing row into the shape the form uses.
function listingToValues(l) {
  return {
    category: l.category,
    title: l.title,
    shopName: l.shop_name,
    description: l.description,
    phone: l.phone,
    website: l.website || '',
    payMethod: l.pay_method || '',
    payNumber: (payments.forListing(l) || {}).display || '',
    payAccount: l.pay_account || '',
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
// `current` is the listing being edited, if any (its saved place is accepted as it is).
function readListingForm(body, kindKey, current) {
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
  // Buyers only see shops in their own constituency, so sellers must give one (official list,
  // or the value an older listing already had).
  const place = places.check(values, { keep: current || {} });
  Object.assign(values, { county: place.county || values.county, constituency: place.constituency, ward: place.ward });
  errors.push(...place.errors);
  if (place.county && !place.constituency && !place.errors.length) errors.push('Choose the constituency your shop is in.');
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
  const pay = payments.fromForm(body);
  Object.assign(values, pay.values);
  errors.push(...pay.errors);

  // Column values in the order used by the INSERT and UPDATE below.
  const row = [
    values.category, values.title, values.shopName, values.description, values.phone,
    values.county, values.constituency, values.ward, values.street, lat, lng,
    JSON.stringify(parsedHours.hours), website || '', ...pay.row,
  ];
  return { values, errors, row };
}

app.get('/sell/:kind', requireLogin, (req, res, next) => {
  if (!KINDS[req.params.kind]) return next();
  renderSellForm(res, req.params.kind, { hours: hours.DEFAULT_HOURS });
});

app.post('/sell/:kind', requireLogin, photos.upload, async (req, res, next) => {
  const kindKey = req.params.kind;
  if (!KINDS[kindKey]) return next();

  const { values, errors, row } = readListingForm(req.body, kindKey);
  errors.push(...photos.check(req));
  if (errors.length) return renderSellForm(res, kindKey, values, photosAgain(req, errors), 400);

  const listing = await db.one(`
    INSERT INTO listings (user_id, kind, category, title, shop_name, description, phone,
                          county, constituency, ward, street, latitude, longitude, hours, website,
                          pay_method, pay_number, pay_account)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `, [req.session.user.id, kindKey, ...row]);
  await photos.apply(req, listing.id);
  res.redirect(seo.listingPath(listing));
});

// ---------- Managing your own listings ----------

const { shopAccess } = team;

app.get('/my/listings', requireLogin, async (req, res) => {
  const listings = await db.query(`
    SELECT l.*,
      (SELECT COUNT(*)::int FROM items i WHERE i.listing_id = l.id) AS item_count,
      (SELECT COUNT(*)::int FROM items i WHERE i.listing_id = l.id AND i.quantity IS NOT NULL
         AND (i.quantity = 0 OR i.quantity <= i.low_stock_at)) AS low_count
    FROM listings l WHERE l.user_id = ? ORDER BY l.created_at DESC, l.id DESC
  `, [req.session.user.id]);
  // Shops where this user is on the team (an employee), with what they're allowed to do.
  const work = await db.query(`
    SELECT l.*, m.can_stock, m.can_items, m.can_delete, m.can_reports, m.can_shop, u.first_name AS owner_name,
      (SELECT COUNT(*)::int FROM items i WHERE i.listing_id = l.id) AS item_count
    FROM listing_members m JOIN listings l ON l.id = m.listing_id JOIN users u ON u.id = l.user_id
    WHERE m.user_id = ? ORDER BY l.shop_name
  `, [req.session.user.id]);
  res.render('my-listings', {
    title: 'My shops',
    noindex: true,
    listings,
    work: work.map((l) => ({ ...l, perms: team.permsFromRow(l) })),
    permSummary: team.permSummary,
    categoryName: (slug) => (categoryBySlug(slug) || {}).name || slug,
    notice: { updated: 'Listing updated.', deleted: 'Listing deleted.', left: 'You have left that shop.' }[req.query.done] || null,
  });
});

app.get('/listing/:id/edit', requireLogin, shopAccess('shop'), async (req, res) => {
  const { listing } = res.locals;
  renderSellForm(res, listing.kind, listingToValues(listing), [], 200, listing, await photos.list(listing.id));
});

// multer runs after shopAccess, so nothing is read from people who may not edit this shop.
app.post('/listing/:id/edit', requireLogin, shopAccess('shop'), photos.upload, async (req, res) => {
  const { listing } = res.locals;
  const existing = await photos.list(listing.id);
  const { values, errors, row } = readListingForm(req.body, listing.kind, listing);
  errors.push(...photos.check(req, existing));
  if (errors.length) return renderSellForm(res, listing.kind, values, photosAgain(req, errors), 400, listing, existing);

  await db.query(`
    UPDATE listings SET category = ?, title = ?, shop_name = ?, description = ?, phone = ?,
      county = ?, constituency = ?, ward = ?, street = ?, latitude = ?, longitude = ?, hours = ?,
      website = ?, pay_method = ?, pay_number = ?, pay_account = ?, updated_at = now()
    WHERE id = ?
  `, [...row, listing.id]);
  await photos.apply(req, listing.id);
  res.redirect('/my/listings?done=updated');
});

app.post('/listing/:id/delete', requireLogin, shopAccess('owner'), async (req, res) => {
  await db.query('DELETE FROM listings WHERE id = ? AND user_id = ?', [res.locals.listing.id, req.session.user.id]);
  res.redirect('/my/listings?done=deleted');
});

// ---------- Inventory: each shop's catalogue, stock and change history (owner and team) ----------

const inventoryPath = (listing) => `/listing/${listing.id}/inventory`;
const notFound = (res) => res.status(404).render('message', { title: 'Not found', noindex: true, message: "Sorry, we couldn't find that page." });

// Loads the item in the URL if it belongs to the shop already loaded by shopAccess.
async function ownItem(req, res, next) {
  const item = await db.one('SELECT * FROM items WHERE id = ? AND listing_id = ?',
    [Number(req.params.itemId) || 0, res.locals.listing.id]);
  if (!item) return notFound(res);
  res.locals.item = item;
  next();
}

const FILTERS = {
  all: { label: 'All', sql: '' },
  low: { label: 'Low stock', sql: 'AND quantity IS NOT NULL AND quantity > 0 AND quantity <= low_stock_at' },
  out: { label: 'Out of stock', sql: 'AND quantity = 0' },
  hidden: { label: 'Hidden', sql: 'AND NOT visible' },
};

app.get('/listing/:id/inventory', requireLogin, shopAccess('view'), async (req, res) => {
  const { listing } = res.locals;
  const filter = FILTERS[req.query.show] ? req.query.show : 'all';
  const q = trim(req.query.q).slice(0, 80);
  const all = await db.query('SELECT * FROM items WHERE listing_id = ? ORDER BY lower(name), id', [listing.id]);
  const items = await db.query(`
    SELECT * FROM items WHERE listing_id = ? ${FILTERS[filter].sql}
      AND (? = '' OR name ILIKE ? OR sku ILIKE ?)
    ORDER BY lower(name), id
  `, [listing.id, q, `%${q}%`, `%${q}%`]);
  const recent = await db.query('SELECT * FROM item_changes WHERE listing_id = ? ORDER BY created_at DESC, id DESC LIMIT 8', [listing.id]);
  res.render('inventory', {
    title: `Inventory · ${listing.shop_name}`,
    noindex: true,
    items,
    summary: inventory.summarize(all),
    recent,
    filters: FILTERS,
    filter,
    q,
    moves: inventory.MOVES,
    actions: inventory.ACTIONS,
    permSummary: team.permSummary,
  });
});

function renderItemForm(res, values, errors = [], status = 200, itemPhotos = []) {
  const { listing, item } = res.locals;
  res.status(status).render('item-form', {
    title: item ? `Edit ${item.name}` : `Add an item · ${listing.shop_name}`,
    noindex: true,
    action: item ? `/listing/${listing.id}/items/${item.id}/edit` : `/listing/${listing.id}/items`,
    editing: item || null,
    photos: itemPhotos,
    maxPhotos: photos.MAX_PHOTOS,
    values,
    errors,
  });
}

app.get('/listing/:id/items/new', requireLogin, shopAccess('items'), (req, res) => {
  renderItemForm(res, { tracked: res.locals.listing.kind === 'goods', visible: true });
});

app.post('/listing/:id/items', requireLogin, shopAccess('items'), photos.upload, async (req, res) => {
  const { listing } = res.locals;
  const { values, errors, item } = inventory.readItemForm(req.body, { adding: true });
  errors.push(...photos.check(req));
  if (errors.length) return renderItemForm(res, values, photosAgain(req, errors), 400);
  const saved = await inventory.addItem(listing.id, req.session.user.id, item);
  await photos.apply(req, listing.id, saved.id);
  flash(req, 'ok', `Added ${item.name}.`);
  res.redirect(req.body.another ? `/listing/${listing.id}/items/new` : inventoryPath(listing));
});

app.get('/listing/:id/items/:itemId/edit', requireLogin, shopAccess('items'), ownItem, async (req, res) => {
  const { listing, item } = res.locals;
  renderItemForm(res, inventory.itemToValues(item), [], 200, await photos.list(listing.id, item.id));
});

app.post('/listing/:id/items/:itemId/edit', requireLogin, shopAccess('items'), ownItem, photos.upload, async (req, res) => {
  const { listing, item: old } = res.locals;
  const existing = await photos.list(listing.id, old.id);
  const { values, errors, item } = inventory.readItemForm(req.body, { adding: false });
  errors.push(...photos.check(req, existing));
  if (errors.length) return renderItemForm(res, values, photosAgain(req, errors), 400, existing);
  await inventory.editItem(listing.id, req.session.user.id, old, item);
  await photos.apply(req, listing.id, old.id);
  flash(req, 'ok', `Saved ${item.name}.`);
  res.redirect(inventoryPath(listing));
});

app.post('/listing/:id/items/:itemId/stock', requireLogin, shopAccess('stock'), ownItem, async (req, res) => {
  const { listing, item } = res.locals;
  const result = await inventory.moveStock(listing.id, req.session.user.id, item.id, req.body.move, req.body.amount, req.body.note);
  if (result.error) flash(req, 'bad', `${item.name}: ${result.error}`);
  else flash(req, 'ok', `${item.name}: stock ${result.qty_before} → ${result.qty_after}.`);
  res.redirect(safeNext(req.body.next, inventoryPath(listing)));
});

app.post('/listing/:id/items/:itemId/visibility', requireLogin, shopAccess('items'), ownItem, async (req, res) => {
  const { listing, item } = res.locals;
  const visible = req.body.visible === '1';
  await inventory.setVisible(listing.id, req.session.user.id, item, visible);
  flash(req, 'ok', visible ? `${item.name} is now shown to buyers.` : `${item.name} is now hidden from buyers.`);
  res.redirect(safeNext(req.body.next, inventoryPath(listing)));
});

app.post('/listing/:id/items/:itemId/delete', requireLogin, shopAccess('delete'), ownItem, async (req, res) => {
  const { listing, item } = res.locals;
  await inventory.deleteItem(listing.id, req.session.user.id, item);
  flash(req, 'ok', `Deleted ${item.name}. It stays in your history.`);
  res.redirect(inventoryPath(listing));
});

const HISTORY_PAGE = 50;

async function historyRows(listingId, itemId, limit, offset) {
  return db.query(`
    SELECT c.*, u.first_name FROM item_changes c LEFT JOIN users u ON u.id = c.user_id
    WHERE c.listing_id = ? AND (?::int IS NULL OR c.item_id = ?::int)
    ORDER BY c.created_at DESC, c.id DESC LIMIT ? OFFSET ?
  `, [listingId, itemId, itemId, limit, offset]);
}

app.get('/listing/:id/inventory/history', requireLogin, shopAccess('reports'), async (req, res) => {
  const { listing } = res.locals;
  const itemId = Number(req.query.item) || null;
  const page = Math.max(1, Number(req.query.page) || 1);
  const rows = await historyRows(listing.id, itemId, HISTORY_PAGE + 1, (page - 1) * HISTORY_PAGE);
  const item = itemId ? await db.one('SELECT * FROM items WHERE id = ? AND listing_id = ?', [itemId, listing.id]) : null;
  res.render('inventory-history', {
    title: `History · ${listing.shop_name}`,
    noindex: true,
    rows: rows.slice(0, HISTORY_PAGE),
    hasMore: rows.length > HISTORY_PAGE,
    page,
    itemId,
    item,
    actions: inventory.ACTIONS,
  });
});

const csvName = (listing, what) => `${listing.shop_name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'shop'}-${what}.csv`;

app.get('/listing/:id/inventory.csv', requireLogin, shopAccess('reports'), async (req, res) => {
  const { listing } = res.locals;
  const items = await db.query('SELECT * FROM items WHERE listing_id = ? ORDER BY lower(name), id', [listing.id]);
  res.attachment(csvName(listing, 'inventory')).type('text/csv').send(inventory.toCsv(
    ['Name', 'SKU', 'Price (KSh)', 'Unit', 'In stock', 'Low-stock alert', 'Stock value (KSh)', 'Shown to buyers', 'Description', 'Last changed'],
    items.map((i) => [i.name, i.sku, i.price == null ? '' : Number(i.price), i.unit, i.quantity ?? 'not counted',
      i.low_stock_at ?? '', i.price != null && i.quantity != null ? Number(i.price) * i.quantity : '',
      i.visible ? 'yes' : 'no', i.description, new Date(i.updated_at || i.created_at).toISOString()]),
  ));
});

app.get('/listing/:id/inventory/history.csv', requireLogin, shopAccess('reports'), async (req, res) => {
  const { listing } = res.locals;
  const rows = await historyRows(listing.id, null, 100000, 0);
  res.attachment(csvName(listing, 'history')).type('text/csv').send(inventory.toCsv(
    ['When', 'Item', 'What', 'Details', 'Stock before', 'Stock after', 'By'],
    rows.map((c) => [new Date(c.created_at).toISOString(), c.item_name, inventory.ACTIONS[c.action] || c.action,
      c.detail, c.qty_before ?? '', c.qty_after ?? '', c.first_name || '']),
  ));
});

// ---------- Team: the owner invites employees, each with their own login and permissions ----------

const teamPath = (listing) => `/listing/${listing.id}/team`;

app.get('/listing/:id/team', requireLogin, shopAccess('owner'), async (req, res) => {
  const { listing } = res.locals;
  const fresh = req.session.newInvite;
  if (fresh) delete req.session.newInvite;
  res.render('team', {
    newInvite: fresh && fresh.listingId === listing.id ? fresh : null,
    title: `Team · ${listing.shop_name}`,
    noindex: true,
    members: (await team.members(listing.id)).map((m) => ({ ...m, perms: team.permsFromRow(m) })),
    invites: (await team.pendingInvites(listing.id)).map((i) => ({ ...i, perms: team.permsFromRow(i) })),
    PERMS: team.PERMS,
    PRESETS: team.PRESETS,
    inviteDays: team.INVITE_DAYS,
    permSummary: team.permSummary,
  });
});

app.post('/listing/:id/team/invites', requireLogin, shopAccess('owner'), async (req, res) => {
  const { listing } = res.locals;
  const label = trim(req.body.label).slice(0, 60);
  const token = await team.createInvite(listing.id, req.session.user.id, label, team.permsFromForm(req.body));
  // The link is shown once (it isn't stored), so it travels to the next page in the signed session.
  req.session.newInvite = { listingId: listing.id, url: `${res.locals.siteUrl}/invite/${token}`, label };
  res.redirect(teamPath(listing));
});

app.post('/listing/:id/team/invites/:inviteId/revoke', requireLogin, shopAccess('owner'), async (req, res) => {
  const { listing } = res.locals;
  const done = await team.revokeInvite(listing.id, Number(req.params.inviteId) || 0);
  flash(req, done ? 'ok' : 'bad', done ? 'Invite link cancelled. It no longer works.' : 'That invite was already used or cancelled.');
  res.redirect(teamPath(listing));
});

app.post('/listing/:id/team/:userId', requireLogin, shopAccess('owner'), async (req, res) => {
  const { listing } = res.locals;
  const done = await team.updateMember(listing.id, Number(req.params.userId) || 0, team.permsFromForm(req.body));
  flash(req, done ? 'ok' : 'bad', done ? 'Permissions saved.' : 'That person is no longer on your team.');
  res.redirect(teamPath(listing));
});

app.post('/listing/:id/team/:userId/remove', requireLogin, shopAccess('owner'), async (req, res) => {
  const { listing } = res.locals;
  await team.removeMember(listing.id, Number(req.params.userId) || 0);
  flash(req, 'ok', 'Removed from your team. They can no longer see or change this shop.');
  res.redirect(teamPath(listing));
});

// An employee leaving a shop they work at.
app.post('/listing/:id/leave', requireLogin, shopAccess('view'), async (req, res) => {
  const { listing, can } = res.locals;
  if (can.role === 'owner') return res.redirect('/my/listings');
  await team.removeMember(listing.id, req.session.user.id);
  res.redirect('/my/listings?done=left');
});

// The link an owner sends. Anyone can open it; joining needs a login.
app.get('/invite/:token', async (req, res) => {
  const invite = await team.findInvite(req.params.token);
  const user = req.session.user;
  res.status(invite ? 200 : 404).render('invite', {
    title: invite ? `Join ${invite.shop_name}` : 'Invite not valid',
    noindex: true,
    invite,
    token: req.params.token,
    isOwner: Boolean(invite && user && invite.owner_id === user.id),
    permSummary: team.permSummary,
    perms: invite ? team.permsFromRow(invite) : null,
  });
});

app.post('/invite/:token', requireLogin, async (req, res) => {
  const joined = await team.acceptInvite(req.params.token, req.session.user.id);
  if (!joined) {
    return res.status(410).render('message', {
      title: 'Invite not valid', noindex: true,
      message: 'This invite link has already been used, has expired or was cancelled. Ask the shop owner for a new one.',
    });
  }
  flash(req, 'ok', 'Welcome to the team! You can now help manage this shop.');
  res.redirect(`/listing/${joined.listing_id}/inventory`);
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
  const items = await db.query('SELECT * FROM items WHERE listing_id = ? AND visible ORDER BY lower(name), id', [listing.id]);
  const shopPhotos = await photos.list(listing.id);
  res.render('listing', {
    title: `${listing.shop_name} – ${listing.title} in ${listing.ward || listing.constituency || listing.county}`,
    description: seo.listingDescription(listing, category),
    canonical,
    ogImage: shopPhotos.length ? photos.url(shopPhotos[0].id) : categories.photoFor(category),
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
    items,
    shopPhotos,
    itemPhotos: await photos.byItem(listing.id),
    payment: payments.forListing(listing),
    can: await team.access(listing, req.session.user && req.session.user.id),
  });
});

// Uploaded photos. A photo's id is never reused and its bytes never change, so browsers and
// Vercel's CDN may keep it for a year.
app.get('/photos/:id', async (req, res, next) => {
  const photo = /^\d{1,9}$/.test(req.params.id) && await photos.get(Number(req.params.id));
  if (!photo) return next();
  res.set({
    'Content-Type': photo.mime,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'",
  });
  res.send(Buffer.from(photo.data));
});

// ---------- Search engines ----------

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send([
    'User-agent: *',
    'Allow: /',
    'Disallow: /login',
    'Disallow: /signup',
    'Disallow: /sell/',
    'Disallow: /invite/',
    'Disallow: /area',
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
