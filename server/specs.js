'use strict';
/*
 * Service spec per generator — the parts the service team should pick and the
 * engine oil capacity, so a dispatch can say "for DG-XXX: this air/oil/fuel
 * filter, and N litres of oil".
 *
 * We store ONLY what the office enters (an override). When a field is blank the
 * UI falls back to a typical estimate worked out from the generator's kVA, shown
 * as "typical — confirm", so the page is useful before every unit is filled in.
 * Stored in a JSON file next to the database (persistent disk).
 */

const fs = require('fs');
const path = require('path');

const DIR = path.dirname(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'deluxe.db'));
const FILE = path.join(DIR, 'specs.json');

let store = {}; // DG(upper) -> { dg, air, oil, fuel, oilLitres, engine, notes, updatedAt }
try { if (fs.existsSync(FILE)) store = JSON.parse(fs.readFileSync(FILE, 'utf8')) || {}; } catch (_) { store = {}; }

function persist() {
  try {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(store, null, 2));
  } catch (_) { /* best-effort */ }
}

function save(rec) {
  const dg = String((rec && rec.dg) || '').trim().toUpperCase();
  if (!dg) throw new Error('Generator (DG) number is required');
  const str = (v) => String((v == null ? '' : v)).trim();
  const litres = Number(rec.oilLitres);
  const entry = {
    dg,
    air: str(rec.air),
    oil: str(rec.oil),
    fuel: str(rec.fuel),
    oilLitres: (isFinite(litres) && litres > 0) ? litres : null,
    oilGrade: str(rec.oilGrade),
    engine: str(rec.engine),
    notes: str(rec.notes),
    updatedAt: new Date().toISOString(),
  };
  // If every meaningful field is empty, treat a save as a delete (clear override).
  if (!entry.air && !entry.oil && !entry.fuel && entry.oilLitres == null && !entry.oilGrade && !entry.engine && !entry.notes) {
    delete store[dg]; persist(); return null;
  }
  store[dg] = entry;
  persist();
  return entry;
}

function remove(dg) {
  const k = String(dg || '').trim().toUpperCase();
  if (store[k]) { delete store[k]; persist(); return true; }
  return false;
}

function get(dg) { return store[String(dg || '').trim().toUpperCase()] || null; }
function getMap() { return Object.assign({}, store); }
function getAll() { return Object.keys(store).map((k) => Object.assign({}, store[k])); }

// One-time import of known filter part numbers (e.g. from the daily store issue
// register). Version-gated so it runs once and survives deploys. Only FILLS a
// field that is currently empty - it never overwrites what the office typed in
// the Parts & Oil page.
function applySeed(records, version) {
  if (!Array.isArray(records) || !version) return { skipped: true };
  const marker = path.join(DIR, 'specs-seed-applied.json');
  let applied = {};
  try { if (fs.existsSync(marker)) applied = JSON.parse(fs.readFileSync(marker, 'utf8')) || {}; } catch (_) { applied = {}; }
  if (applied[version]) return { skipped: true, version };
  let n = 0;
  records.forEach((r) => {
    const dg = String((r && r.dg) || '').trim().toUpperCase();
    if (!dg) return;
    const cur = store[dg] || { dg };
    const merged = Object.assign({}, cur);
    ['air', 'oil', 'fuel', 'oilLitres', 'oilGrade', 'engine', 'notes'].forEach((k) => {
      const v = r[k];
      const has = (v != null && String(v).trim() !== '');
      const curEmpty = (cur[k] == null || String(cur[k]).trim() === '');
      if (has && curEmpty) merged[k] = v;
    });
    try { save(merged); n += 1; } catch (_) { /* skip */ }
  });
  applied[version] = { at: new Date().toISOString(), count: n };
  try { if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(marker, JSON.stringify(applied, null, 2)); } catch (_) { /* best-effort */ }
  return { applied: n, version };
}

module.exports = { save, remove, get, getMap, getAll, applySeed };
