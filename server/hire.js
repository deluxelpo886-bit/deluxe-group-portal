'use strict';
/*
 * On-hire / off-hire status per generator.
 *
 * A generator marked off-hire has been returned by the customer and is sitting
 * in the yard (shown red in the old system). Off-hire units are muted on the map
 * and dropped from the "service due" alarms - there's no point chasing a service
 * on a machine nobody is running. Stored in a small JSON file next to the
 * database so it lives on the persistent disk and survives deploys/restarts.
 */

const fs = require('fs');
const path = require('path');

// Store next to the database so the data lives on the same persistent disk
// (a plain app-folder path is wiped on every Render deploy).
const DIR = path.dirname(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'deluxe.db'));
const FILE = path.join(DIR, 'hire.json');

let store = {}; // DG (upper) -> { dg, offHire, since, note, updatedAt }
try {
  if (fs.existsSync(FILE)) store = JSON.parse(fs.readFileSync(FILE, 'utf8')) || {};
} catch (_) { store = {}; }

function persist() {
  try {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(store, null, 2));
  } catch (_) { /* best-effort */ }
}

// Set a generator's hire status. offHire true = returned to the yard.
function setStatus(rec) {
  const dg = String((rec && rec.dg) || '').trim().toUpperCase();
  if (!dg) throw new Error('Generator (DG) number is required');
  const offHire = !!(rec && rec.offHire);
  const entry = {
    dg,
    offHire,
    // The date it went off-hire (or came back on-hire). Defaults to today.
    since: (rec.since && String(rec.since).slice(0, 10)) || new Date().toISOString().slice(0, 10),
    note: String((rec && rec.note) || '').trim(),
    updatedAt: new Date().toISOString(),
  };
  store[dg] = entry;
  persist();
  return entry;
}

function getAll() {
  return Object.keys(store).map((k) => Object.assign({}, store[k]))
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

// DG -> record, for merging hire status into other views (map, service list).
function getMap() {
  const out = {};
  Object.keys(store).forEach((k) => { out[k] = store[k]; });
  return out;
}

function remove(dg) {
  const key = String(dg || '').trim().toUpperCase();
  if (store[key]) { delete store[key]; persist(); return true; }
  return false;
}

// One-time bulk import of on-hire/off-hire status (e.g. from the asset list).
// Guarded by a marker file keyed by version, so it applies at most once and is
// safe to leave wired into startup. Only sets the generators listed; others are
// left untouched (default on-hire).
function applySeed(records, version) {
  if (!Array.isArray(records) || !version) return { skipped: true };
  const marker = path.join(DIR, 'hire-seed.json');
  let applied = {};
  try { if (fs.existsSync(marker)) applied = JSON.parse(fs.readFileSync(marker, 'utf8')) || {}; } catch (_) { applied = {}; }
  if (applied[version]) return { skipped: true, version };
  let n = 0;
  for (const r of records) {
    try { setStatus(r); n += 1; } catch (_) { /* skip bad row */ }
  }
  applied[version] = { at: new Date().toISOString(), count: n };
  try {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(marker, JSON.stringify(applied, null, 2));
  } catch (_) { /* best-effort */ }
  return { applied: n, version };
}

module.exports = { setStatus, getAll, getMap, remove, applySeed };
