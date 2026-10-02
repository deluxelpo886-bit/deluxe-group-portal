'use strict';
/*
 * Cost ledger for the fleet P&L.
 *
 * The office records what each generator COSTS to keep running - service jobs,
 * breakdown repairs and purchased parts - as dated entries tagged to a DG. The
 * P&L dashboard sums these against rental income (monthly rate x time on hire)
 * to show per-unit and fleet profit/loss.
 *
 * Kept in a small JSON file on the same persistent disk as the other stores so
 * it survives deploys without touching the main DB schema.
 */
const fs = require('fs');
const path = require('path');

const DIR = path.dirname(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'deluxe.db'));
const FILE = path.join(DIR, 'costs.json');

const TYPES = ['service', 'breakdown', 'parts', 'other'];

let store = []; // array of { id, dg, type, amount, date, note, createdBy, createdAt }
try {
  if (fs.existsSync(FILE)) store = JSON.parse(fs.readFileSync(FILE, 'utf8')) || [];
  if (!Array.isArray(store)) store = [];
} catch (_) { store = []; }

function persist() {
  try {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(store, null, 2));
  } catch (_) { /* best-effort */ }
}

function newId() {
  return 'C' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function normType(v) {
  const t = String(v || '').trim().toLowerCase();
  return TYPES.indexOf(t) !== -1 ? t : 'other';
}

// Add a cost entry. Returns the stored entry.
function add(rec) {
  const dg = String((rec && rec.dg) || '').trim().toUpperCase();
  if (!dg) throw new Error('Generator (DG) number is required');
  const amount = Number(rec.amount);
  if (!isFinite(amount) || amount < 0) throw new Error('A valid amount is required');
  const entry = {
    id: newId(),
    dg,
    type: normType(rec.type),
    amount: Math.round(amount * 100) / 100,
    date: (rec.date && /^\d{4}-\d\d-\d\d/.test(String(rec.date))) ? String(rec.date).slice(0, 10) : new Date().toISOString().slice(0, 10),
    note: String((rec.note) || '').trim().slice(0, 300),
    createdBy: String((rec.createdBy) || '').trim().slice(0, 60),
    createdAt: new Date().toISOString(),
  };
  store.push(entry);
  persist();
  return entry;
}

function remove(id) {
  const key = String(id || '');
  const i = store.findIndex((e) => e.id === key);
  if (i === -1) return false;
  store.splice(i, 1);
  persist();
  return true;
}

function getAll() { return store.slice(); }

// Seed one-time import of historical costs, guarded by a marker keyed by version.
function applySeed(records, version) {
  if (!Array.isArray(records) || !version) return { skipped: true };
  const marker = path.join(DIR, 'costs-seed.json');
  let applied = {};
  try { if (fs.existsSync(marker)) applied = JSON.parse(fs.readFileSync(marker, 'utf8')) || {}; } catch (_) { applied = {}; }
  if (applied[version]) return { skipped: true, version };
  let n = 0;
  for (const r of records) { try { add(r); n += 1; } catch (_) { /* skip bad row */ } }
  applied[version] = { at: new Date().toISOString(), count: n };
  try {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(marker, JSON.stringify(applied, null, 2));
  } catch (_) { /* best-effort */ }
  return { applied: n, version };
}

module.exports = { add, remove, getAll, applySeed, TYPES };
