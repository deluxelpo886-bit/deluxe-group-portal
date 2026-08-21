'use strict';
/*
 * Breakdown log.
 *
 * Records every generator breakdown - when it was reported, which truck/team was
 * sent, and when it was resolved - so the office can see response times and spot
 * repeat-offender generators. Stored in a small JSON file next to the database so
 * it lives on the persistent disk and survives deploys/restarts.
 */

const fs = require('fs');
const path = require('path');

// Store next to the database so the data lives on the same persistent disk
// (a plain app-folder path is wiped on every Render deploy).
const DIR = path.dirname(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'deluxe.db'));
const FILE = path.join(DIR, 'breakdowns.json');

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
  if (!dg) throw new Error('Generator (DG) number is required');
  const it = {
    id: 'BD' + Date.now().toString(36) + Math.floor(Math.random() * 1000),
    dg,
    location: String((rec && rec.location) || '').trim(),
    truck: String((rec && rec.truck) || '').trim(),
    notes: String((rec && rec.notes) || '').trim(),
    reportedBy: String((rec && rec.reportedBy) || '').trim(),
    reportedAt: (rec && rec.reportedAt) ? new Date(rec.reportedAt).toISOString() : new Date().toISOString(),
    status: 'Open',
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
  if (!it) throw new Error('Breakdown not found');
  it.status = 'Resolved';
  it.resolvedAt = new Date().toISOString();
  it.updatedAt = new Date().toISOString();
  persist();
  return it;
}

function reopen(id) {
  const it = items.find((x) => x.id === id);
  if (!it) throw new Error('Breakdown not found');
  it.status = 'Open';
  it.resolvedAt = null;
  it.updatedAt = new Date().toISOString();
  persist();
  return it;
}

function update(id, fields) {
  const it = items.find((x) => x.id === id);
  if (!it) throw new Error('Breakdown not found');
  ['location', 'truck', 'notes', 'reportedBy'].forEach((k) => {
    if (fields && fields[k] != null) it[k] = String(fields[k]).trim();
  });
  if (fields && fields.dg) it.dg = String(fields.dg).trim().toUpperCase();
  it.updatedAt = new Date().toISOString();
  persist();
  return it;
}

function remove(id) {
  items = items.filter((x) => x.id !== id);
  persist();
}

// Open breakdowns first (oldest open at top so they're chased), then resolved
// history most-recent first.
function getAll() {
  const open = items.filter((x) => x.status === 'Open')
    .sort((a, b) => String(a.reportedAt).localeCompare(String(b.reportedAt)));
  const done = items.filter((x) => x.status !== 'Open')
    .sort((a, b) => String(b.reportedAt).localeCompare(String(a.reportedAt)));
  return open.concat(done);
}

function stats() {
  const open = items.filter((x) => x.status === 'Open');
  const resolved = items.filter((x) => x.status === 'Resolved' && x.resolvedAt);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const thisMonth = items.filter((x) => String(x.reportedAt) >= monthStart).length;

  let avgHours = null;
  if (resolved.length) {
    const total = resolved.reduce((s, x) => s + (new Date(x.resolvedAt) - new Date(x.reportedAt)), 0);
    avgHours = Math.round((total / resolved.length / 3600000) * 10) / 10;
  }

  const counts = {};
  items.forEach((x) => { counts[x.dg] = (counts[x.dg] || 0) + 1; });
  const repeat = Object.keys(counts).filter((dg) => counts[dg] >= 2)
    .map((dg) => ({ dg, count: counts[dg] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  return { total: items.length, open: open.length, resolved: resolved.length, thisMonth, avgHours, repeat };
}

module.exports = { add, resolve, reopen, update, remove, getAll, stats };
