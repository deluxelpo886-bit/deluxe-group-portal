'use strict';
/*
 * Manual fleet overrides (office-entered, persistent).
 *
 * The fleet map's asset details live in fleet.html as an embedded `let DATA`
 * array (the base list). This module lets the office manually correct or add a
 * few fields per generator WITHOUT a code change, and have those corrections
 * survive restarts AND deploys. Every read of the map, the location directory
 * and the service plan layers these overrides on top of the base list, so a
 * manual entry "seats" everywhere at once.
 *
 * Per-DG override fields (all optional):
 *   lat, lon           manually pinned GPS coordinates (locked - never auto-moved)
 *   coordsLocked       true once coordinates were set by hand
 *   currentHours       latest confirmed meter reading (drives hours-left + plan)
 *   currentHoursDate   date (YYYY-MM-DD) of that reading
 *   nextServiceDate    a forced next-service date (YYYY-MM-DD)
 *   location, customer manual text corrections
 *   removed            true => hide this unit from the map, plan and directory
 *   note               free-text note
 *
 * Storage: a small JSON file next to the database (same persistent disk the
 * service log uses), so a Render deploy - which wipes the app folder - does not
 * lose the office's manual entries.
 */

const fs = require('fs');
const path = require('path');

const DIR = path.dirname(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'deluxe.db'));
const FILE = path.join(DIR, 'overrides.json');
const BACKUP = path.join(DIR, 'overrides.backup.json');

// Fields the office may set. Anything else in a request body is ignored.
const FIELDS = [
  'lat', 'lon', 'coordsLocked', 'currentHours', 'currentHoursDate',
  'nextServiceDate', 'location', 'customer', 'removed', 'note',
];

let store = {};
try {
  if (fs.existsSync(FILE)) store = JSON.parse(fs.readFileSync(FILE, 'utf8')) || {};
} catch (_) { store = {}; }

function persist() {
  try {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    const json = JSON.stringify(store, null, 2);
    // Keep a one-behind backup copy so a bad write can't lose everything.
    try { if (fs.existsSync(FILE)) fs.copyFileSync(FILE, BACKUP); } catch (_) { /* best-effort */ }
    fs.writeFileSync(FILE, json);
  } catch (_) { /* best-effort */ }
}

function norm(dg) { return String(dg || '').trim().toUpperCase(); }

// Deep-ish clone of the whole store (values are plain data).
function getAll() {
  const out = {};
  Object.keys(store).forEach((k) => { out[k] = Object.assign({}, store[k]); });
  return out;
}

function get(dg) {
  const r = store[norm(dg)];
  return r ? Object.assign({}, r) : null;
}

// Merge a patch into a DG's override. A field set to null or '' is CLEARED
// (reverts to the base value). Numbers are coerced; unknown fields ignored.
function set(dg, patch, username) {
  dg = norm(dg);
  if (!dg) throw new Error('Generator (DG) number is required');
  patch = patch || {};
  const next = Object.assign({}, store[dg] || {});
  FIELDS.forEach((k) => {
    if (!(k in patch)) return;
    let v = patch[k];
    if (v === null || v === '' || (typeof v === 'string' && v.trim() === '')) { delete next[k]; return; }
    if (k === 'lat' || k === 'lon' || k === 'currentHours') {
      v = Number(v);
      if (!isFinite(v)) { delete next[k]; return; }
    }
    if (k === 'removed' || k === 'coordsLocked') { v = !!v; if (!v) { delete next[k]; return; } }
    next[k] = v;
  });
  // Coordinates entered by hand are locked automatically.
  if (('lat' in next) || ('lon' in next)) next.coordsLocked = true;
  next.updatedAt = new Date().toISOString();
  if (username) next.updatedBy = username;

  // If nothing meaningful remains, drop the whole entry.
  const meaningful = FIELDS.some((k) => k in next);
  if (!meaningful) { delete store[dg]; persist(); return null; }
  store[dg] = next;
  persist();
  return Object.assign({}, next);
}

// Fully remove a DG's override (revert entirely to the base list).
function clear(dg) {
  dg = norm(dg);
  if (store[dg]) { delete store[dg]; persist(); return true; }
  return false;
}

// Set of DGs currently hidden (removed) by an override.
function removedSet() {
  const s = {};
  Object.keys(store).forEach((k) => { if (store[k] && store[k].removed) s[k] = true; });
  return s;
}

module.exports = { getAll, get, set, clear, removedSet, FILE, FIELDS };
