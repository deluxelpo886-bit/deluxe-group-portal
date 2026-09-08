'use strict';
/*
 * Data flags - the in-app "things to resolve" notification list.
 *
 * Whenever a cross-check (service card vs portal, Netsonic vs portal, a map
 * pin that is still a zone-centre placeholder, a meter reading that looks
 * wrong) turns up something the office should look at, it is recorded here as
 * an open flag. The operations head clears each one from the app once it is
 * sorted, so nothing quietly falls through the cracks.
 *
 * Stored as a small JSON file next to the database so it lives on the same
 * persistent disk and survives deploys/restarts (same approach as the
 * breakdown log). A versioned seed can pre-load known flags on first boot
 * without ever wiping the ones already resolved in the app.
 */

const fs = require('fs');
const path = require('path');

const DIR = path.dirname(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'deluxe.db'));
const FILE = path.join(DIR, 'dataflags.json');
const SEED_MARKER = path.join(DIR, 'dataflags-seed.json');

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

// What kind of thing needs resolving, and how loud it should be.
const TYPES = ['location-missing', 'meter-confirm', 'hours-mismatch', 'filter-pending', 'customer-confirm', 'service-due', 'other'];
const SEVERITIES = ['high', 'medium', 'low'];

function normType(v) {
  const t = String(v || '').trim().toLowerCase();
  return TYPES.find((x) => x === t) || 'other';
}
function normSeverity(v) {
  const s = String(v || '').trim().toLowerCase();
  return SEVERITIES.find((x) => x === s) || 'medium';
}

// A stable key lets the seed stay idempotent: the same (dg + type) flag is
// never added twice, so re-seeding after a redeploy will not resurrect a flag
// the office already resolved, nor stack duplicates.
function keyOf(dg, type, extra) {
  return [String(dg || '').trim().toUpperCase(), normType(type), String(extra || '').trim().toLowerCase()]
    .filter(Boolean).join('|');
}

function add(rec) {
  const dg = String((rec && rec.dg) || '').trim().toUpperCase();
  const type = normType(rec && rec.type);
  const key = (rec && rec.key) ? String(rec.key) : keyOf(dg, type, rec && rec.extra);
  // Never duplicate an open flag for the same issue.
  const dup = items.find((x) => x.key === key && x.status === 'open');
  if (dup) return dup;
  const it = {
    id: 'FL' + Date.now().toString(36) + Math.floor(Math.random() * 1000),
    key,
    dg,
    type,
    severity: normSeverity(rec && rec.severity),
    message: String((rec && rec.message) || '').trim(),
    source: String((rec && rec.source) || 'manual').trim(),
    status: 'open',
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    resolvedNote: '',
    updatedAt: new Date().toISOString(),
  };
  items.unshift(it);
  persist();
  return it;
}

function resolve(id, note) {
  const it = items.find((x) => x.id === id);
  if (!it) throw new Error('Flag not found');
  it.status = 'resolved';
  it.resolvedAt = new Date().toISOString();
  if (note != null && String(note).trim()) it.resolvedNote = String(note).trim();
  it.updatedAt = new Date().toISOString();
  persist();
  return it;
}

function reopen(id) {
  const it = items.find((x) => x.id === id);
  if (!it) throw new Error('Flag not found');
  it.status = 'open';
  it.resolvedAt = null;
  it.updatedAt = new Date().toISOString();
  persist();
  return it;
}

function remove(id) {
  items = items.filter((x) => x.id !== id);
  persist();
}

// Open flags first, loudest (high severity) and oldest at the top so the most
// important, longest-waiting item is dealt with first; then resolved history,
// most-recently resolved first.
function getAll() {
  const rank = { high: 0, medium: 1, low: 2 };
  const open = items.filter((x) => x.status === 'open')
    .sort((a, b) => ((rank[a.severity] ?? 1) - (rank[b.severity] ?? 1)) || String(a.createdAt).localeCompare(String(b.createdAt)));
  const done = items.filter((x) => x.status === 'resolved')
    .sort((a, b) => String(b.resolvedAt || '').localeCompare(String(a.resolvedAt || '')));
  return open.concat(done);
}

function stats() {
  const open = items.filter((x) => x.status === 'open');
  const byType = {};
  open.forEach((x) => { byType[x.type] = (byType[x.type] || 0) + 1; });
  return {
    total: items.length,
    open: open.length,
    high: open.filter((x) => x.severity === 'high').length,
    resolved: items.filter((x) => x.status === 'resolved').length,
    byType,
  };
}

// Pre-load known flags once per version. Idempotent: a seed row is only added
// if no flag with its key already exists (open OR resolved), so nothing the
// office has already cleared comes back, and nothing is duplicated.
function applySeed(records, version) {
  if (!Array.isArray(records) || !version) return { skipped: true };
  let applied = {};
  try {
    if (fs.existsSync(SEED_MARKER)) applied = JSON.parse(fs.readFileSync(SEED_MARKER, 'utf8')) || {};
  } catch (_) { applied = {}; }
  if (applied[version]) return { skipped: true, version };

  const existing = new Set(items.map((x) => x.key));
  let n = 0;
  for (const r of records) {
    const dg = String((r && r.dg) || '').trim().toUpperCase();
    const type = normType(r && r.type);
    const key = (r && r.key) ? String(r.key) : keyOf(dg, type, r && r.extra);
    if (existing.has(key)) continue;
    existing.add(key);
    items.unshift({
      id: 'FL' + Date.now().toString(36) + Math.floor(Math.random() * 1000) + n,
      key,
      dg,
      type,
      severity: normSeverity(r && r.severity),
      message: String((r && r.message) || '').trim(),
      source: String((r && r.source) || 'cross-check').trim(),
      status: 'open',
      createdAt: new Date().toISOString(),
      resolvedAt: null,
      resolvedNote: '',
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

module.exports = { add, resolve, reopen, remove, getAll, stats, applySeed, TYPES, SEVERITIES };
