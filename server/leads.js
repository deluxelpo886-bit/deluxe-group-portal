'use strict';
/*
 * Sales leads / direct-marketing tracker.
 *
 * Companies and project sites to visit for new generator-rental orders. The ops
 * head does direct (face-to-face) marketing - this keeps a living list of who to
 * visit, what stage each is at, the next action date and notes, so nothing is
 * forgotten and progress is visible. Stored in a JSON file next to the database
 * so it survives deploys.
 */

const fs = require('fs');
const path = require('path');

const DIR = path.dirname(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'deluxe.db'));
const FILE = path.join(DIR, 'leads.json');
const SEED_MARKER = path.join(DIR, 'leads-seed-applied.json');

const STAGES = ['lead', 'visiting', 'quoted', 'won', 'lost', 'hold'];

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
function clean(s, n) { return String(s == null ? '' : s).trim().slice(0, n || 200); }

function shape(rec) {
  const stage = STAGES.indexOf(String((rec && rec.stage) || '').toLowerCase()) >= 0
    ? String(rec.stage).toLowerCase() : 'lead';
  return {
    company: clean(rec && rec.company, 140),
    sector: clean(rec && rec.sector, 60),
    contact: clean(rec && rec.contact, 120),
    phone: clean(rec && rec.phone, 60),
    location: clean(rec && rec.location, 160),
    need: clean(rec && rec.need, 160),
    stage,
    nextDate: isDate(rec && rec.nextDate) ? String(rec.nextDate).slice(0, 10) : '',
    notes: clean(rec && rec.notes, 1000),
  };
}

function getAll() { return items.map((x) => Object.assign({}, x)); }

function add(rec) {
  const s = shape(rec);
  if (!s.company) throw new Error('Company name is required');
  const it = Object.assign({
    id: 'LD' + Date.now().toString(36) + Math.floor(Math.random() * 1000),
    seedKey: (rec && rec.seedKey) || null,
    createdBy: clean(rec && rec.createdBy, 60),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }, s);
  items.unshift(it);
  persist();
  return it;
}

function update(id, patch) {
  const it = items.find((x) => x.id === id);
  if (!it) throw new Error('Lead not found');
  const fields = ['company', 'sector', 'contact', 'phone', 'location', 'need', 'stage', 'nextDate', 'notes'];
  const s = shape(Object.assign({}, it, patch));
  fields.forEach((k) => { if (k in (patch || {})) it[k] = s[k]; });
  it.updatedAt = new Date().toISOString();
  persist();
  return Object.assign({}, it);
}

function remove(id) {
  const n = items.length;
  items = items.filter((x) => x.id !== id);
  if (items.length !== n) persist();
  return items.length !== n;
}

function applySeed(seed, version) {
  if (!Array.isArray(seed) || !version) return { skipped: true };
  let applied = {};
  try { if (fs.existsSync(SEED_MARKER)) applied = JSON.parse(fs.readFileSync(SEED_MARKER, 'utf8')) || {}; } catch (_) { applied = {}; }
  if (applied[version]) return { skipped: true, version };
  let n = 0;
  seed.forEach((r) => {
    if (r && r.seedKey && items.some((x) => x.seedKey === r.seedKey)) return;
    try { add(r); n += 1; } catch (_) { /* skip */ }
  });
  applied[version] = { at: new Date().toISOString(), count: n };
  try { fs.writeFileSync(SEED_MARKER, JSON.stringify(applied, null, 2)); } catch (_) { /* best-effort */ }
  return { applied: n, version };
}

module.exports = { getAll, add, update, remove, applySeed, STAGES, FILE };
