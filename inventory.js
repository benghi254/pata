// A shop's catalogue (items) and its change history (item_changes).
// Every write here also records who changed what, so owners can see how their stock moved.
const db = require('./db');

const trim = (v) => (typeof v === 'string' ? v.trim() : '');

// Ways stock can change. sign: +1 adds, -1 removes, 0 sets the count (a stocktake).
const MOVES = {
  restock: { label: 'Restocked', sign: 1 },
  returned: { label: 'Returned by customer', sign: 1 },
  sold: { label: 'Sold', sign: -1 },
  damaged: { label: 'Damaged / expired', sign: -1 },
  lost: { label: 'Lost / stolen', sign: -1 },
  count: { label: 'Stock count', sign: 0 },
};

const ACTIONS = {
  added: 'Added',
  edited: 'Edited',
  stock: 'Stock',
  hidden: 'Hidden',
  shown: 'Shown',
  deleted: 'Deleted',
};

const kes = (n) => (n == null ? '' : `KSh ${Number(n).toLocaleString('en-KE', { maximumFractionDigits: 2 })}`);

// What a buyer sees: price, and whether it's in stock.
function stockState(item) {
  if (item.quantity == null) return { key: 'untracked', label: 'Available' };
  if (item.quantity === 0) return { key: 'out', label: 'Out of stock' };
  if (item.low_stock_at != null && item.quantity <= item.low_stock_at) return { key: 'low', label: `Only ${item.quantity} left` };
  return { key: 'in', label: 'In stock' };
}

const wholeNumber = (s) => (/^\d{1,9}$/.test(s) ? Number(s) : null);

// Reads and checks the add / edit item form. On add, `quantity` is the opening stock.
function readItemForm(body, { adding }) {
  const fields = ['name', 'description', 'sku', 'price', 'unit', 'quantity', 'lowStockAt'];
  const values = Object.fromEntries(fields.map((f) => [f, trim(body[f])]));
  values.tracked = body.tracked === 'on' || body.tracked === '1';
  values.visible = body.visible === 'on';

  const errors = [];
  if (!values.name) errors.push('Item name is required.');
  if (values.name.length > 120) errors.push('Item name is too long (120 characters at most).');
  if (values.description.length > 1000) errors.push('Description is too long (1000 characters at most).');

  let price = null;
  if (values.price) {
    const cleaned = values.price.replace(/[, ]/g, '').replace(/^(ksh|kes)\.?/i, '');
    price = /^\d{1,10}(\.\d{1,2})?$/.test(cleaned) ? Number(cleaned) : NaN;
    if (Number.isNaN(price)) errors.push('Enter the price as a number, e.g. 150 or 1,200.');
  }

  let quantity = null;
  let lowStockAt = null;
  if (values.tracked) {
    if (adding) {
      quantity = values.quantity ? wholeNumber(values.quantity) : 0;
      if (quantity === null) errors.push('Opening stock must be a whole number, 0 or more.');
    }
    if (values.lowStockAt) {
      lowStockAt = wholeNumber(values.lowStockAt);
      if (lowStockAt === null) errors.push('Low-stock alert must be a whole number, 0 or more.');
    }
  }

  return {
    values,
    errors,
    item: {
      name: values.name,
      description: values.description,
      sku: values.sku.slice(0, 60),
      price,
      unit: values.unit.slice(0, 40),
      quantity,
      low_stock_at: lowStockAt,
      tracked: values.tracked,
      visible: values.visible,
    },
  };
}

function itemToValues(i) {
  return {
    name: i.name,
    description: i.description,
    sku: i.sku,
    price: i.price == null ? '' : String(Number(i.price)),
    unit: i.unit,
    quantity: i.quantity ?? '',
    lowStockAt: i.low_stock_at ?? '',
    tracked: i.quantity != null,
    visible: i.visible,
  };
}

function log(listingId, userId, item, action, detail = '', before = null, after = null) {
  return db.query(`
    INSERT INTO item_changes (listing_id, item_id, item_name, user_id, action, detail, qty_before, qty_after)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [listingId, item.id, item.name, userId, action, detail, before, after]);
}

async function addItem(listingId, userId, item) {
  const row = await db.one(`
    INSERT INTO items (listing_id, name, description, sku, price, unit, quantity, low_stock_at, visible)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `, [listingId, item.name, item.description, item.sku, item.price, item.unit, item.quantity, item.low_stock_at, item.visible]);
  const bits = [item.price != null ? kes(item.price) + (item.unit ? ` ${item.unit}` : '') : null,
    item.quantity != null ? `opening stock ${item.quantity}` : 'stock not counted'];
  await log(listingId, userId, row, 'added', bits.filter(Boolean).join(', '), null, row.quantity);
  return row;
}

// Saves edits and logs each field that changed, e.g. "Price KSh 50 → KSh 60".
async function editItem(listingId, userId, old, item) {
  // Turning counting on starts at 0 (then use a stock count); turning it off forgets the count.
  const quantity = item.tracked ? (old.quantity ?? 0) : null;
  const row = await db.one(`
    UPDATE items SET name = ?, description = ?, sku = ?, price = ?, unit = ?, quantity = ?,
      low_stock_at = ?, visible = ?, updated_at = now()
    WHERE id = ? AND listing_id = ?
    RETURNING *
  `, [item.name, item.description, item.sku, item.price, item.unit, quantity,
    item.tracked ? item.low_stock_at : null, item.visible, old.id, listingId]);

  const changes = [];
  const diff = (label, a, b, fmt = (x) => x || '(none)') => {
    if (String(a ?? '') !== String(b ?? '')) changes.push(`${label} ${fmt(a)} → ${fmt(b)}`);
  };
  diff('Name', old.name, row.name);
  diff('Price', old.price == null ? null : Number(old.price), row.price == null ? null : Number(row.price), (x) => (x == null ? '(none)' : kes(x)));
  diff('Unit', old.unit, row.unit);
  diff('SKU', old.sku, row.sku);
  if (old.description !== row.description) changes.push('Description updated');
  diff('Low-stock alert', old.low_stock_at, row.low_stock_at, (x) => (x == null ? 'off' : x));
  if ((old.quantity == null) !== (row.quantity == null)) changes.push(row.quantity == null ? 'Stopped counting stock' : 'Started counting stock');

  if (changes.length) await log(listingId, userId, row, 'edited', changes.join('; '), old.quantity, row.quantity);
  if (old.visible !== row.visible) await log(listingId, userId, row, row.visible ? 'shown' : 'hidden', row.visible ? 'Shown to buyers' : 'Hidden from buyers');
  return row;
}

// Changes stock in one statement: locks the row, updates it and logs before/after together,
// so two quick updates (e.g. from two phones) can't lose a sale.
// Returns the updated item, or { error } when the move isn't possible.
async function moveStock(listingId, userId, itemId, moveKey, amountText, note) {
  const move = MOVES[moveKey];
  if (!move) return { error: 'Choose what happened to the stock.' };
  const amount = wholeNumber(trim(amountText));
  if (amount === null || (move.sign !== 0 && amount === 0)) {
    return { error: move.sign === 0 ? 'Enter how many you counted (0 or more).' : 'Enter how many, 1 or more.' };
  }
  const newQty = move.sign === 0 ? '?::int' : `old.quantity + (?::int * ${move.sign})`;
  const detail = [move.label, trim(note).slice(0, 200)].filter(Boolean).join(': ');

  const row = await db.one(`
    WITH old AS (
      SELECT id, quantity FROM items
      WHERE id = ? AND listing_id = ? AND quantity IS NOT NULL
      FOR UPDATE
    ), upd AS (
      UPDATE items i SET quantity = ${newQty}, updated_at = now()
      FROM old WHERE i.id = old.id AND ${newQty} >= 0
      RETURNING i.id, i.name, old.quantity AS before, i.quantity AS after
    )
    INSERT INTO item_changes (listing_id, item_id, item_name, user_id, action, detail, qty_before, qty_after)
    SELECT ?, id, name, ?, 'stock', ?, before, after FROM upd
    RETURNING qty_before, qty_after
  `, [itemId, listingId, amount, amount, listingId, userId, detail]);
  if (!row) {
    const item = await db.one('SELECT quantity FROM items WHERE id = ? AND listing_id = ?', [itemId, listingId]);
    if (!item) return { error: 'That item no longer exists.' };
    if (item.quantity == null) return { error: 'This item does not count stock. Turn on stock counting in Edit first.' };
    return { error: `You only have ${item.quantity} in stock.` };
  }
  return row;
}

async function setVisible(listingId, userId, item, visible) {
  if (item.visible === visible) return;
  await db.query('UPDATE items SET visible = ?, updated_at = now() WHERE id = ? AND listing_id = ?', [visible, item.id, listingId]);
  await log(listingId, userId, item, visible ? 'shown' : 'hidden', visible ? 'Shown to buyers' : 'Hidden from buyers');
}

async function deleteItem(listingId, userId, item) {
  await log(listingId, userId, item, 'deleted', item.quantity != null ? `Removed with ${item.quantity} in stock` : 'Removed from catalogue', item.quantity, null);
  await db.query('DELETE FROM items WHERE id = ? AND listing_id = ?', [item.id, listingId]);
}

// Totals for the top of the inventory page.
function summarize(items) {
  const tracked = items.filter((i) => i.quantity != null);
  return {
    items: items.length,
    units: tracked.reduce((s, i) => s + i.quantity, 0),
    value: tracked.reduce((s, i) => s + (i.price == null ? 0 : Number(i.price) * i.quantity), 0),
    low: tracked.filter((i) => stockState(i).key === 'low').length,
    out: tracked.filter((i) => i.quantity === 0).length,
  };
}

const csvCell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // stop spreadsheets running it as a formula
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (header, rows) => [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

module.exports = {
  MOVES, ACTIONS, kes, stockState, readItemForm, itemToValues,
  addItem, editItem, moveStock, setVisible, deleteItem, summarize, toCsv,
};
