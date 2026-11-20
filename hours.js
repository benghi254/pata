// Opening hours: parsing the sell form, "open now" status, and display helpers.
// Hours are stored as JSON: { mon: { open: "08:00", close: "18:00" } | null, ... }.
// A close time earlier than the open time means the shop closes after midnight.

const DAYS = [
  ['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'],
  ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday'],
];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const TIME_ZONE = process.env.TZ_SHOPS || 'Africa/Nairobi';

// Pre-filled on a new listing: Monday to Saturday 8am to 6pm, Sunday closed.
const DEFAULT_HOURS = Object.fromEntries(
  DAYS.map(([k]) => [k, k === 'sun' ? null : { open: '08:00', close: '18:00' }]),
);

function fromForm(body) {
  const hours = {};
  const errors = [];
  for (const [key, label] of DAYS) {
    if (body[`${key}_isOpen`] !== 'on') { hours[key] = null; continue; }
    const open = String(body[`${key}_open`] || '');
    const close = String(body[`${key}_close`] || '');
    hours[key] = { open, close };
    if (!TIME.test(open) || !TIME.test(close)) errors.push(`${label}: enter both an opening and a closing time.`);
    else if (open === close) errors.push(`${label}: opening and closing times can't be the same.`);
  }
  if (DAYS.every(([k]) => !hours[k])) errors.push('Tick at least one day that you are open.');
  return { hours, errors };
}

function parse(json) {
  try {
    const h = JSON.parse(json);
    return h && typeof h === 'object' ? h : null;
  } catch {
    return null;
  }
}

const toMinutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

// "08:00" -> "8:00 AM"
function fmt(t) {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

function nowLocal(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TIME_ZONE, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).map((p) => [p.type, p.value]),
  );
  const dayIndex = DAYS.findIndex(([k]) => k === parts.weekday.slice(0, 3).toLowerCase());
  return { dayIndex, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

// Returns { isOpen, label } or null when no hours are set.
function status(hours, date = new Date()) {
  if (!hours || DAYS.every(([k]) => !hours[k])) return null;
  const { dayIndex, minutes } = nowLocal(date);
  const today = hours[DAYS[dayIndex][0]];
  const yesterday = hours[DAYS[(dayIndex + 6) % 7][0]];

  // Still open from a shift that started yesterday and runs past midnight.
  if (yesterday && toMinutes(yesterday.close) < toMinutes(yesterday.open) && minutes < toMinutes(yesterday.close)) {
    return { isOpen: true, label: `Open now · until ${fmt(yesterday.close)}` };
  }
  if (today) {
    const o = toMinutes(today.open);
    const c = toMinutes(today.close);
    const overnight = c < o;
    if (minutes >= o && (overnight || minutes < c)) {
      return { isOpen: true, label: `Open now · until ${fmt(today.close)}` };
    }
    if (minutes < o) return { isOpen: false, label: `Closed · opens ${fmt(today.open)}` };
  }
  for (let i = 1; i <= 7; i++) {
    const [key, name] = DAYS[(dayIndex + i) % 7];
    if (hours[key]) {
      const when = i === 1 ? 'tomorrow' : name.slice(0, 3);
      return { isOpen: false, label: `Closed · opens ${when} ${fmt(hours[key].open)}` };
    }
  }
  return null;
}

// Rows for the weekly table on the listing page.
function table(hours, date = new Date()) {
  const { dayIndex } = nowLocal(date);
  return DAYS.map(([key, name], i) => ({
    name,
    isToday: i === dayIndex,
    text: hours && hours[key] ? `${fmt(hours[key].open)} – ${fmt(hours[key].close)}` : 'Closed',
  }));
}

// schema.org openingHoursSpecification for search engines.
function toSchema(hours) {
  if (!hours) return undefined;
  const spec = DAYS.filter(([k]) => hours[k]).map(([k, name]) => ({
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: `https://schema.org/${name}`,
    opens: hours[k].open,
    closes: hours[k].close,
  }));
  return spec.length ? spec : undefined;
}

module.exports = { DAYS, DEFAULT_HOURS, fromForm, parse, status, table, toSchema, fmt };
