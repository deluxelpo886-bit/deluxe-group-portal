'use strict';
/*
 * Spare-parts issue tracking.
 *
 * Log spare parts a generator needs and track them through Needed -> Ordered ->
 * Received -> Fitted. Stored in a small JSON file under data/ so it's shared and
 * survives restarts.
 */

const fs = require('fs');
const path = require('path');

// Store next to the database so the data lives on the same persistent disk
// (a plain app-folder path is wiped on every Render deploy).
const DIR = path.dirname(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'deluxe.db'));
const FILE = path.join(DIR, 'spares.json');
const SEED_MARKER = path.join(DIR, 'spares-seed-applied.json');
const STATUSES = ['Needed', 'Ordered', 'Received', 'Fitted'];

let items = [];
try {
  if (fs.existsSync(FILE)) {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    items = Array.isArray(raw) ? raw : (raw && raw.items) || [];
  }
} catch (_) { items = []; }

function persist() {
  try {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(items, null, 2));
  } catch (_) { /* best-effort */ }
}

function add(rec) {
  const dg = String((rec && rec.dg) || '').trim().toUpperCase();
  const part = String((rec && rec.part) || '').trim();
  if (!dg) throw new Error('Generator (DG) number is required');
  if (!part) throw new Error('Part name is required');
  const it = {
    id: 'S' + Date.now().toString(36) + Math.floor(Math.random() * 1000),
    dg,
    part,
    qty: Number(rec.qty) > 0 ? Number(rec.qty) : 1,
    status: 'Needed',
    requestedBy: String(rec.requestedBy || '').trim(),
    notes: String(rec.notes || '').trim(),
    date: new Date().toISOString().slice(0, 10),
    updatedAt: new Date().toISOString(),
  };
  items.unshift(it);
  persist();
  return it;
}

function update(id, status) {
  const it = items.find((x) => x.id === id);
  if (!it) throw new Error('Item not found');
  if (STATUSES.indexOf(status) < 0) throw new Error('Unknown status');
  it.status = status;
  it.updatedAt = new Date().toISOString();
  persist();
  return it;
}

function remove(id) {
  items = items.filter((x) => x.id !== id);
  persist();
}

function getAll() { return items.slice(); }

// One-time, versioned import of office-known parts requests (e.g. a filter a
// service card said was not fitted), so they survive a Render deploy even when
// the runtime store lives on an ephemeral disk. Mirrors dataflags.applySeed:
// each version string is applied at most once, and a part already on the list
// (same DG + part name) is never duplicated.
function seedKey(dg, part) {
  return String(dg || '').trim().toUpperCase() + '|' + String(part || '').trim().toLowerCase();
}
function applySeed(records, version) {
  if (!Array.isArray(records) || !version) return { skipped: true };
  let applied = {};
  try {
    if (fs.existsSync(SEED_MARKER)) applied = JSON.parse(fs.readFileSync(SEED_MARKER, 'utf8')) || {};
  } catch (_) { applied = {}; }
  if (applied[version]) return { skipped: true, version };

  const existing = new Set(items.map((x) => seedKey(x.dg, x.part)));
  let n = 0;
  for (const r of records) {
    const dg = String((r && r.dg) || '').trim().toUpperCase();
    const part = String((r && r.part) || '').trim();
    if (!dg || !part) continue;
    const k = seedKey(dg, part);
    if (existing.has(k)) continue;
    existing.add(k);
    items.unshift({
      id: 'S' + Date.now().toString(36) + Math.floor(Math.random() * 1000) + n,
      dg,
      part,
      qty: Number(r.qty) > 0 ? Number(r.qty) : 1,
      status: STATUSES.indexOf(r.status) >= 0 ? r.status : 'Needed',
      requestedBy: String((r && r.requestedBy) || '').trim(),
      notes: String((r && r.notes) || '').trim(),
      date: (r && r.date) ? String(r.date) : new Date().toISOString().slice(0, 10),
      updatedAt: new Date().toISOString(),
    });
    n += 1;
  }
  if (n) persist();
  applied[version] = { at: new Date().toISOString(), count: n };
  try {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(SEED_MARKER, JSON.stringify(applied, null, 2));
  } catch (_) { /* best-effort */ }
  return { applied: n, version };
}

module.exports = { add, update, remove, getAll, applySeed, STATUSES };
