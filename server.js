const path = require('node:path');
const express = require('express');
const session = require('express-session');

const db = require('./db');
const categories = require('./categories');
const hours = require('./hours');
const seo = require('./seo');
const { hashPassword, verifyPassword, requireLogin } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;
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

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-only-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax' },
}));

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.siteUrl = SITE_URL || `${req.protocol}://${req.get('host')}`;
  res.locals.path = req.path;
  next();
});

const KINDS = {
  goods: { label: 'Goods', sellHeading: 'Please fill out the details of the product you are selling' },
  services: { label: 'Services', sellHeading: 'Please fill out the details of the service you offer' },
};

const trim = (v) => (typeof v === 'string' ? v.trim() : '');
const safeNext = (v) => (typeof v === 'string' && /^\/(?!\/)/.test(v) ? v : '/');
const categoryBySlug = (slug) => categories.find((c) => c.slug === slug);

function signIn(req, user, cb) {
  req.session.regenerate((err) => {
    if (err) return cb(err);
    req.session.user = { id: user.id, firstName: user.first_name, email: user.email };
    cb();
  });
}

// ---------- Browsing ----------

app.get('/', (req, res) => {
  const counts = Object.fromEntries(
    db.prepare('SELECT category, COUNT(*) AS n FROM listings GROUP BY category').all()
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
    services: categories.filter((c) => c.kind === 'services'),
    counts,
  });
});

app.get('/category/:slug', (req, res, next) => {
  const category = categoryBySlug(req.params.slug);
  if (!category) return next();
  const listings = db.prepare(
    'SELECT * FROM listings WHERE category = ? ORDER BY created_at DESC, id DESC',
  ).all(category.slug);
  const { siteUrl } = res.locals;
  res.render('category', {
    title: `${category.name} near you`,
    description: `${category.blurb} Browse ${listings.length} ${category.name.toLowerCase()} listed on PATA, with locations, opening hours and phone numbers.`,
    canonical: `/category/${category.slug}`,
    ogImage: `/img/${category.image}`,
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
  });
});

app.get('/listing/:id{/:slug}', (req, res, next) => {
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(Number(req.params.id) || 0);
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
    ogImage: `/img/${category.image}`,
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
  });
});

// ---------- Accounts ----------

app.get('/signup', (req, res) => {
  res.render('signup', { title: 'Sign up', noindex: true, errors: [], values: {} });
});

app.post('/signup', (req, res, next) => {
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
  if (!errors.length && db.prepare('SELECT 1 FROM users WHERE email = ?').get(values.email)) {
    errors.push('An account with that email already exists. Try logging in.');
  }
  if (errors.length) {
    return res.status(400).render('signup', { title: 'Sign up', noindex: true, errors, values });
  }

  const result = db.prepare(
    'INSERT INTO users (email, first_name, other_name, password_hash) VALUES (?, ?, ?, ?)',
  ).run(values.email, values.firstName, values.otherName, hashPassword(password));

  const user = { id: Number(result.lastInsertRowid), first_name: values.firstName, email: values.email };
  signIn(req, user, (err) => (err ? next(err) : res.redirect('/')));
});

app.get('/login', (req, res) => {
  res.render('login', { title: 'Log in', noindex: true, error: null, email: '', next: safeNext(req.query.next) });
});

app.post('/login', (req, res, next) => {
  const email = trim(req.body.email).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const nextUrl = safeNext(req.body.next);

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).render('login', {
      title: 'Log in', noindex: true, error: 'Wrong email or password.', email, next: nextUrl,
    });
  }
  signIn(req, user, (err) => (err ? next(err) : res.redirect(nextUrl)));
});

app.post('/logout', (req, res, next) => {
  req.session.destroy((err) => (err ? next(err) : res.redirect('/')));
});

// ---------- Selling ----------

app.get('/sell', (req, res) => {
  res.render('sell', {
    title: 'Sell on PATA',
    description: 'List your shop, products or services on PATA for free and get found by buyers near you.',
    canonical: '/sell',
  });
});

function renderSellForm(res, kindKey, values, errors, status = 200) {
  const kind = KINDS[kindKey];
  res.status(status).render('sell-form', {
    title: `Sell ${kind.label.toLowerCase()}`,
    noindex: true,
    map: true,
    kind: kindKey,
    heading: kind.sellHeading,
    options: categories.filter((c) => c.kind === kindKey),
    days: hours.DAYS,
    errors,
    values,
  });
}

app.get('/sell/:kind', requireLogin, (req, res, next) => {
  if (!KINDS[req.params.kind]) return next();
  renderSellForm(res, req.params.kind, { hours: hours.DEFAULT_HOURS });
});

app.post('/sell/:kind', requireLogin, (req, res, next) => {
  const kindKey = req.params.kind;
  if (!KINDS[kindKey]) return next();

  const fields = ['category', 'title', 'shopName', 'description', 'phone', 'county', 'constituency', 'ward', 'street', 'latitude', 'longitude'];
  const values = Object.fromEntries(fields.map((f) => [f, trim(req.body[f])]));
  const parsedHours = hours.fromForm(req.body);
  values.hours = parsedHours.hours;

  const errors = [];
  if (!categories.some((c) => c.kind === kindKey && c.slug === values.category)) errors.push('Choose a category.');
  if (!values.title) errors.push(kindKey === 'goods' ? 'Product name is required.' : 'Service is required.');
  if (!values.shopName) errors.push('Shop / business name is required.');
  if (!/^\+?[0-9 ]{9,15}$/.test(values.phone)) errors.push('Enter a valid phone number, e.g. 0712 345678.');
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

  if (errors.length) return renderSellForm(res, kindKey, values, errors, 400);

  const result = db.prepare(`
    INSERT INTO listings (user_id, kind, category, title, shop_name, description, phone,
                          county, constituency, ward, street, latitude, longitude, hours)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.session.user.id, kindKey, values.category, values.title, values.shopName,
    values.description, values.phone, values.county, values.constituency, values.ward,
    values.street, lat, lng, JSON.stringify(parsedHours.hours),
  );
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(result.lastInsertRowid);
  res.redirect(seo.listingPath(listing));
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

app.get('/sitemap.xml', (req, res) => {
  const { siteUrl } = res.locals;
  const urls = [
    { loc: '/', priority: '1.0' },
    { loc: '/sell', priority: '0.5' },
    ...categories.map((c) => ({ loc: `/category/${c.slug}`, priority: '0.8' })),
    ...db.prepare('SELECT * FROM listings').all().map((l) => ({
      loc: seo.listingPath(l), lastmod: l.created_at.slice(0, 10), priority: '0.7',
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

app.listen(PORT, () => {
  console.log(`PATA running at http://localhost:${PORT}`);
});
