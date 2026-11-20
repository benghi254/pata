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
- **Sign up / log in**: accounts are stored with scrypt-hashed passwords.
- **Sell**: logged-in users list a product (`/sell/goods`) or a service (`/sell/services`), and the
  listing appears on its category page right away.

## Project layout

```
server.js      routes (pages, sign up, login, sell)
db.js          SQLite setup and tables
auth.js        password hashing and the login guard
categories.js  the list of categories - add a new one here
views/         EJS page templates (partials/ holds the shared header and footer)
public/        CSS and images
```

## Settings

| Variable         | Default                       |
| ---------------- | ----------------------------- |
| `PORT`           | `3000`                        |
| `SESSION_SECRET` | a dev-only value; set it in production |
| `DB_PATH`        | `data/pata.db`                |
