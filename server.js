const path = require('node:path');
const express = require('express');
const session = require('express-session');

const db = require('./db');
const categories = require('./categories');
const { hashPassword, verifyPassword, requireLogin } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-only-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax' },
}));

// Make the logged-in user available to every template.
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

const KINDS = {
  goods: { label: 'Goods', sellHeading: 'Please fill out the details of the product you are selling' },
  services: { label: 'Services', sellHeading: 'Please fill out the details of the service you offer' },
};

const trim = (v) => (typeof v === 'string' ? v.trim() : '');
// Only allow redirects to pages on this site (blocks "next=https://evil.com").
const safeNext = (v) => (typeof v === 'string' && /^\/(?!\/)/.test(v) ? v : '/');

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
  res.render('home', {
    title: 'Home',
    goods: categories.filter((c) => c.kind === 'goods'),
    services: categories.filter((c) => c.kind === 'services'),
    counts,
  });
});

app.get('/category/:slug', (req, res, next) => {
  const category = categories.find((c) => c.slug === req.params.slug);
  if (!category) return next(); // falls through to 404
  const listings = db.prepare(
    'SELECT * FROM listings WHERE category = ? ORDER BY created_at DESC, id DESC',
  ).all(category.slug);
  res.render('category', { title: category.name, category, listings });
});

// ---------- Accounts ----------

app.get('/signup', (req, res) => {
  res.render('signup', { title: 'Sign up', errors: [], values: {} });
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
    return res.status(400).render('signup', { title: 'Sign up', errors, values });
  }

  const result = db.prepare(
    'INSERT INTO users (email, first_name, other_name, password_hash) VALUES (?, ?, ?, ?)',
  ).run(values.email, values.firstName, values.otherName, hashPassword(password));

  const user = { id: Number(result.lastInsertRowid), first_name: values.firstName, email: values.email };
  signIn(req, user, (err) => (err ? next(err) : res.redirect('/')));
});

app.get('/login', (req, res) => {
  res.render('login', { title: 'Log in', error: null, email: '', next: safeNext(req.query.next) });
});

app.post('/login', (req, res, next) => {
  const email = trim(req.body.email).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const nextUrl = safeNext(req.body.next);

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).render('login', {
      title: 'Log in', error: 'Wrong email or password.', email, next: nextUrl,
    });
  }
  signIn(req, user, (err) => (err ? next(err) : res.redirect(nextUrl)));
});

app.post('/logout', (req, res, next) => {
  req.session.destroy((err) => (err ? next(err) : res.redirect('/')));
});

// ---------- Selling ----------

app.get('/sell', (req, res) => {
  res.render('sell', { title: 'Sell' });
});

app.get('/sell/:kind', requireLogin, (req, res, next) => {
  const kind = KINDS[req.params.kind];
  if (!kind) return next();
  res.render('sell-form', {
    title: `Sell ${kind.label.toLowerCase()}`,
    kind: req.params.kind,
    heading: kind.sellHeading,
    options: categories.filter((c) => c.kind === req.params.kind),
    errors: [],
    values: {},
  });
});

app.post('/sell/:kind', requireLogin, (req, res, next) => {
  const kindKey = req.params.kind;
  const kind = KINDS[kindKey];
  if (!kind) return next();

  const fields = ['category', 'title', 'shopName', 'description', 'phone', 'county', 'constituency', 'ward'];
  const values = Object.fromEntries(fields.map((f) => [f, trim(req.body[f])]));
  const options = categories.filter((c) => c.kind === kindKey);

  const errors = [];
  if (!options.some((c) => c.slug === values.category)) errors.push('Choose a category.');
  if (!values.title) errors.push(kindKey === 'goods' ? 'Product name is required.' : 'Service is required.');
  if (!values.shopName) errors.push('Shop / business name is required.');
  if (!/^\+?[0-9 ]{9,15}$/.test(values.phone)) errors.push('Enter a valid phone number, e.g. 0712 345678.');
  if (!values.county) errors.push('County is required.');
  if (errors.length) {
    return res.status(400).render('sell-form', {
      title: `Sell ${kind.label.toLowerCase()}`, kind: kindKey, heading: kind.sellHeading, options, errors, values,
    });
  }

  db.prepare(`
    INSERT INTO listings (user_id, kind, category, title, shop_name, description, phone, county, constituency, ward)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.session.user.id, kindKey, values.category, values.title, values.shopName,
    values.description, values.phone, values.county, values.constituency, values.ward,
  );
  res.redirect(`/category/${values.category}`);
});

// ---------- Old .html links keep working ----------

const legacy = { '/buy.html': '/', '/login.html': '/signup', '/sell.html': '/sell',
  '/goodsell.html': '/sell/goods', '/servicesell.html': '/sell/services' };
for (const c of categories) legacy[`/${c.slug}.html`] = `/category/${c.slug}`;
app.get(Object.keys(legacy), (req, res) => res.redirect(301, legacy[req.path]));

// ---------- Errors ----------

app.use((req, res) => {
  res.status(404).render('message', { title: 'Not found', message: "Sorry, we couldn't find that page." });
});

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).render('message', { title: 'Error', message: 'Something went wrong. Please try again.' });
});

app.listen(PORT, () => {
  console.log(`PATA running at http://localhost:${PORT}`);
});
