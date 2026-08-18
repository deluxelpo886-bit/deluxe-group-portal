'use strict';
/*
 * Generator service log (hours-based servicing).
 *
 * Technicians submit a generator's current running hours after a service; the
 * system computes the next service due at (current hours + interval, default
 * 350) and stores it. The office can then see every generator's next-service
 * target. Data is kept in a small JSON file under data/ so it survives restarts
 * without touching the main database schema.
 */

const fs = require('fs');
const path = require('path');

// Store next to the database so the data lives on the same persistent disk
// (a plain app-folder path is wiped on every Render deploy).
const DIR = path.dirname(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'deluxe.db'));
const FILE = path.join(DIR, 'service.json');
const DEFAULT_INTERVAL = 350;

let store = {}; // DG (upper) -> latest record
try {
  if (fs.existsSync(FILE)) store = JSON.parse(fs.readFileSync(FILE, 'utf8')) || {};
} catch (_) { store = {}; }

function persist() {
  try {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(store, null, 2));
  } catch (_) { /* best-effort */ }
}

// Record a service. Returns the stored entry (with computed nextService).
function logService(rec) {
  const dg = String((rec && rec.dg) || '').trim().toUpperCase();
  if (!dg) throw new Error('Generator (DG) number is required');

  const hours = Number(rec.hours);
  if (!isFinite(hours) || hours < 0) throw new Error('A valid current hours reading is required');

  const interval = Number(rec.interval) > 0 ? Number(rec.interval) : DEFAULT_INTERVAL;
  const nextService = hours + interval;
  const date = (rec.date && String(rec.date).slice(0, 10)) || new Date().toISOString().slice(0, 10);
  const prev = store[dg];

  // Work out the real running rate (hours/day). Priority:
  //   1. an explicit value the technician entered,
  //   2. observed automatically from the gap between this reading and the last,
  //   3. the default 12h/day contract.
  // A 24h customer therefore reaches the next service (+interval hours) in about
  // half the days a 12h customer does - and the next-service DATE reflects that.
  const CONTRACT_DAILY_HOURS = 12;
  let observedDailyHours = null;
  if (prev && isFinite(prev.hours) && prev.date) {
    const days = (new Date(date + 'T00:00:00') - new Date(prev.date + 'T00:00:00')) / 86400000;
    const dh = hours - prev.hours;
    if (days > 0 && dh > 0) observedDailyHours = dh / days;
  }
  const explicitDaily = Number(rec.dailyHours) > 0 ? Number(rec.dailyHours) : null;
  const effectiveDailyHours = explicitDaily || observedDailyHours || CONTRACT_DAILY_HOURS;
  const daysToService = Math.max(1, Math.round(interval / effectiveDailyHours));
  const nsd = new Date(date + 'T00:00:00');
  nsd.setDate(nsd.getDate() + daysToService);
  const nextServiceDate = nsd.toISOString().slice(0, 10);
  const round1 = (n) => (n == null ? null : Math.round(n * 10) / 10);

  const entry = {
    dg,
    hours,
    interval,
    nextService,
    nextServiceDate,
    dailyHours: explicitDaily,
    observedDailyHours: round1(observedDailyHours),
    effectiveDailyHours: round1(effectiveDailyHours),
    daysToService,
    date,
    checks: {
      oil: !!rec.oil,
      oilFilter: !!rec.oilFilter,
      fuelFilter: !!rec.fuelFilter,
      airFilter: !!rec.airFilter,
    },
    technician: String((rec.technician) || '').trim(),
    notes: String((rec.notes) || '').trim(),
    // Optional photo of the controller / service card, already resized to a small
    // JPEG data URL on the client. Rejected if not an image or unreasonably large.
    photo: (typeof rec.photo === 'string' && rec.photo.slice(0, 11) === 'data:image/' && rec.photo.length < 3000000) ? rec.photo : null,
    updatedAt: new Date().toISOString(),
  };

  const history = (prev && Array.isArray(prev.history) ? prev.history : []).concat([{
    date: entry.date,
    hours: entry.hours,
    nextService: entry.nextService,
    technician: entry.technician,
    updatedAt: entry.updatedAt,
  }]).slice(-30);
  entry.history = history;

  store[dg] = entry;
  persist();
  return entry;
}

// All generators with a service record, most-recently-updated first. The photo
// is stripped from the list (fetched separately via getPhoto) to keep it light;
// a hasPhoto flag tells the UI whether one exists.
function getAll() {
  return Object.keys(store)
    .map((k) => {
      const copy = Object.assign({}, store[k]);
      copy.hasPhoto = !!copy.photo;
      delete copy.photo;
      return copy;
    })
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

function getPhoto(dg) {
  const e = store[String(dg || '').trim().toUpperCase()];
  return e && e.photo ? e.photo : null;
}

function remove(dg) {
  const key = String(dg || '').trim().toUpperCase();
  if (store[key]) { delete store[key]; persist(); return true; }
  return false;
}

module.exports = { logService, getAll, getPhoto, remove, DEFAULT_INTERVAL };
