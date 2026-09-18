'use strict';
/*
 * Reminders / follow-ups.
 *
 * Small "don't forget" notes the office wants surfaced on a given day — e.g.
 * "cross-check DG-476 hours tomorrow, it ran ~24h last run". Not a breakdown and
 * not a service; just a dated nudge that shows up in the app until it's ticked
 * off. Stored in a JSON file next to the database so it survives deploys.
 */

const fs = require('fs');
const path = require('path');

const DIR = path.dirname(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'deluxe.db'));
const FILE = path.join(DIR, 'reminders.json');
const SEED_MARKER = path.join(DIR, 'reminders-seed-applied.json');

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

function isDate(s) { return /^\d{4}-\d\d-\d\d/.test(String(s || '')); }

function add(rec) {
  const note = String((rec && rec.note) || '').trim();
  if (!note) throw new Error('A reminder note is required');
  const it = {
    id: 'RM' + Date.now().toString(36) + Math.floor(Math.random() * 1000),
    seedKey: null,
    dg: String((rec && rec.dg) || '').trim().toUpperCase(),
    note,
    dueDate: isDate(rec && rec.dueDate) ? String(rec.dueDate).slice(0, 10) : new Date().toISOString().slice(0, 10),
    createdBy: String((rec && rec.createdBy) || '').trim(),
    status: 'open',
    resolvedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  items.unshift(it);
  persist();
  return it;
}

function resolve(id) {
  const it = items.find((x) => x.id === id);
  if (!it) throw new Error('Reminder not found');
  it.status = 'done';
  it.resolvedAt = new Date().toISOString();
  it.updatedAt = new Date().toISOString();
  persist();
  return it;
}

function reopen(id) {
  const it = items.find((x) => x.id === id);
  if (!it) throw new Error('Reminder not found');
  it.status = 'open';
  it.resolvedAt = null;
  it.updatedAt = new Date().toISOString();
  persist();
  return it;
}

function remove(id) {
  const n = items.length;
  items = items.filter((x) => x.id !== id);
  if (items.length !== n) persist();
  return n - items.length;
}

// Open reminders first, soonest due at the top; done ones after, most-recent first.
function getAll() {
  const open = items.filter((x) => x.status !== 'done')
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  const done = items.filter((x) => x.status === 'done')
    .sort((a, b) => String(b.resolvedAt || '').localeCompare(String(a.resolvedAt || '')));
  return open.concat(done);
}

function stats(todayStr) {
  const today = todayStr || new Date().toISOString().slice(0, 10);
  const open = items.filter((x) => x.status !== 'done');
  const due = open.filter((x) => String(x.dueDate) <= today);
  return { total: items.length, open: open.length, due: due.length };
}

// Idempotent seed replay, matching the other stores: applied once per version,
// de-duplicated by a stable `key`.
function applySeed(records, version) {
  if (!Array.isArray(records) || !version) return { skipped: true };
  let applied = {};
  try {
    if (fs.existsSync(SEED_MARKER)) applied = JSON.parse(fs.readFileSync(SEED_MARKER, 'utf8')) || {};
  } catch (_) { applied = {}; }
  if (applied[version]) return { skipped: true, version };

  const existing = new Set(items.map((x) => x.seedKey).filter(Boolean));
  let n = 0;
  for (const r of records) {
    const note = String((r && r.note) || '').trim();
    if (!note) continue;
    const sk = String((r && r.key) || (String((r && r.dg) || '') + '|' + (r && r.dueDate) + '|' + note)).trim();
    if (existing.has(sk)) continue;
    existing.add(sk);
    items.unshift({
      id: 'RM' + Date.now().toString(36) + Math.floor(Math.random() * 1000) + n,
      seedKey: sk,
      dg: String((r && r.dg) || '').trim().toUpperCase(),
      note,
      dueDate: isDate(r && r.dueDate) ? String(r.dueDate).slice(0, 10) : new Date().toISOString().slice(0, 10),
      createdBy: String((r && r.createdBy) || '').trim(),
      status: 'open',
      resolvedAt: null,
      createdAt: new Date().toISOString(),
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

module.exports = { add, resolve, reopen, remove, getAll, stats, applySeed };
