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
  // Next-service hours: use an explicit value when given (e.g. from an imported
  // asset list), otherwise current hours + interval.
  const nextService = Number(rec.nextService) > 0 ? Number(rec.nextService) : hours + interval;
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
  // Next-service date: use an explicit date when given (e.g. the authoritative
  // date from an imported asset list), otherwise the projected estimate.
  const nextServiceDate = (rec.nextServiceDate && /^\d{4}-\d\d-\d\d/.test(String(rec.nextServiceDate)))
    ? String(rec.nextServiceDate).slice(0, 10)
    : nsd.toISOString().slice(0, 10);
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

// Record a plain hours reading WITHOUT performing a service. Use this for the
// low-usage / far-site case (e.g. a generator in Ruwais that has only run 100h
// against a 350h interval): the office wants the real current hours and the
// real hours-remaining, but the generator is NOT due yet and its next-service
// target must stay exactly where it was. So we update currentHours /
// currentHoursDate / hoursToService on the existing entry and leave nextService,
// nextServiceDate and the service history untouched. If the generator has no
// service record yet we create a light one (nextService = hours + interval) so
// there is something to measure against.
function logReading(rec) {
  const dg = String((rec && rec.dg) || '').trim().toUpperCase();
  if (!dg) throw new Error('Generator (DG) number is required');

  const hours = Number(rec.hours);
  if (!isFinite(hours) || hours < 0) throw new Error('A valid current hours reading is required');

  const date = (rec.date && String(rec.date).slice(0, 10)) || new Date().toISOString().slice(0, 10);
  const prev = store[dg];

  // Base entry: keep the existing service record if there is one, otherwise
  // create a minimal one so the reading has a next-service target to count down
  // towards.
  let entry;
  if (prev) {
    entry = Object.assign({}, prev);
  } else {
    const interval = Number(rec.interval) > 0 ? Number(rec.interval) : DEFAULT_INTERVAL;
    entry = {
      dg,
      hours,
      interval,
      nextService: hours + interval,
      nextServiceDate: null,
      dailyHours: null,
      observedDailyHours: null,
      effectiveDailyHours: null,
      daysToService: null,
      date,
      checks: { oil: false, oilFilter: false, fuelFilter: false, airFilter: false },
      technician: '',
      notes: '',
      photo: null,
      history: [],
    };
  }

  // Observed running rate since the last known hours point (a previous reading
  // or the last service), used only to project a rough date for the remaining
  // hours - it does not move the service target.
  const lastHours = isFinite(entry.currentHours) ? Number(entry.currentHours) : Number(entry.hours);
  const lastDate = entry.currentHoursDate || entry.date;
  let observed = null;
  if (isFinite(lastHours) && lastDate) {
    const days = (new Date(date + 'T00:00:00') - new Date(lastDate + 'T00:00:00')) / 86400000;
    const dh = hours - lastHours;
    if (days > 0 && dh > 0) observed = dh / days;
  }
  const round1 = (n) => (n == null ? null : Math.round(n * 10) / 10);

  entry.currentHours = hours;
  entry.currentHoursDate = date;
  const target = Number(entry.nextService);
  entry.hoursToService = isFinite(target) ? Math.round(target - hours) : null;
  if (observed) entry.readingDailyHours = round1(observed);
  entry.updatedAt = new Date().toISOString();

  // Log the reading in history, tagged so it is distinguishable from a service.
  const history = (Array.isArray(entry.history) ? entry.history : []).concat([{
    date,
    hours,
    reading: true,
    hoursToService: entry.hoursToService,
    technician: String((rec.technician) || '').trim(),
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

// One-time bulk import of historical service records (e.g. from an existing
// service report). Records are replayed in the order given through logService,
// so running-rate detection, next-service hours and next-service dates are all
// computed exactly as if a technician had entered each one by hand. Guarded by a
// marker file on the persistent disk keyed by `version`, so it imports at most
// once and is safe to leave wired into startup across deploys and restarts.
function applySeed(records, version) {
  if (!Array.isArray(records) || !version) return { skipped: true };
  const marker = path.join(DIR, 'service-seed.json');
  let applied = {};
  try {
    if (fs.existsSync(marker)) applied = JSON.parse(fs.readFileSync(marker, 'utf8')) || {};
  } catch (_) { applied = {}; }
  if (applied[version]) return { skipped: true, version };

  // Clean rebuild of exactly the generators in this seed: wipe their existing
  // records first so re-importing an updated report replaces the data instead of
  // stacking duplicate history. Generators not in the seed are left untouched.
  const seededDgs = new Set(records.map((r) => String((r && r.dg) || '').trim().toUpperCase()).filter(Boolean));
  seededDgs.forEach((dg) => { if (store[dg]) delete store[dg]; });

  let n = 0;
  for (const r of records) {
    try { logService(r); n += 1; } catch (_) { /* skip an unparseable row */ }
  }
  applied[version] = { at: new Date().toISOString(), count: n };
  try {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(marker, JSON.stringify(applied, null, 2));
  } catch (_) { /* best-effort */ }
  return { applied: n, version };
}

// Classify a generator's service urgency the way an operation head should read
// it: by real running HOURS when we have a confirmed reading (from an "Hours
// check"), and only falling back to the calendar-date estimate when we don't -
// and in that case telling the office to CONFIRM the hours before sending a team
// rather than treating the estimate as gospel. This is what stops a low-usage
// machine (ran 100h of 350) being dispatched just because a date passed.
//
// States: 'paused' (off-hire), 'due' (confirmed by hours - send), 'plan'
// (confirmed, within hoursSoon of due), 'confirm' (estimate says due/soon but
// hours not confirmed - verify first), 'ok' (not due).
function classifyDue(g, todayStr, opts) {
  opts = opts || {};
  const hoursSoon = opts.hoursSoon > 0 ? opts.hoursSoon : 50;
  const windowDays = opts.windowDays > 0 ? opts.windowDays : 7;
  if (!g) return { state: 'ok', send: false, confirmed: false, label: '' };
  if (g.offHire) return { state: 'paused', send: false, confirmed: false, label: 'Paused (off-hire)' };

  const hasReading = g.currentHours != null && isFinite(Number(g.currentHours));
  if (hasReading) {
    const left = Math.round(Number(g.nextService) - Number(g.currentHours));
    if (left <= 0) return { state: 'due', send: true, confirmed: true, hoursLeft: left, label: 'Due now — ' + Math.abs(left) + ' h over (confirmed)' };
    if (left <= hoursSoon) return { state: 'plan', send: false, confirmed: true, hoursLeft: left, label: left + ' h left (confirmed) — plan soon' };
    return { state: 'ok', send: false, confirmed: true, hoursLeft: left, label: left + ' h left (confirmed)' };
  }

  if (g.nextServiceDate && /^\d{4}-\d\d-\d\d/.test(String(g.nextServiceDate))) {
    const days = Math.round((new Date(g.nextServiceDate + 'T00:00:00') - new Date(todayStr + 'T00:00:00')) / 86400000);
    if (days <= windowDays) {
      const when = days < 0 ? ('due ' + Math.abs(days) + 'd ago') : (days === 0 ? 'due today' : ('due in ' + days + 'd'));
      return { state: 'confirm', send: false, confirmed: false, daysEst: days, label: 'Estimate: ' + when + ' — confirm hours first' };
    }
  }
  return { state: 'ok', send: false, confirmed: false, label: 'Not due' };
}

module.exports = { logService, logReading, getAll, getPhoto, remove, applySeed, classifyDue, DEFAULT_INTERVAL };
