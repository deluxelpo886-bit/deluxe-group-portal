'use strict';
/*
 * Technician jobs.
 *
 * The office dispatches a job (service / breakdown / other) to a technician;
 * the technician sees it in the field app (/tech/:token) with the parts to
 * carry, a map link and a Call button, and taps through a simple status flow
 * (New -> On the way -> Reached -> Done). Status flows back to the office live.
 *
 * Stored as JSON next to the database so it survives Render deploys/restarts.
 */

const fs = require('fs');
const path = require('path');

const DIR = path.dirname(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'deluxe.db'));
const FILE = path.join(DIR, 'jobs.json');

const TYPES = ['service', 'breakdown', 'other'];
const STATUSES = ['new', 'otw', 'reached', 'done']; // otw = on the way

let items = [];
try {
  if (fs.existsSync(FILE)) { const raw = JSON.parse(fs.readFileSync(FILE, 'utf8')); items = Array.isArray(raw) ? raw : []; }
} catch (_) { items = []; }

function persist() {
  try {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(items, null, 2));
  } catch (_) { /* best-effort */ }
}

function clean(v) { return String(v == null ? '' : v).trim(); }

// Create a job. `parts` is an array of { en, hi, qty }.
function add(rec) {
  const tech = clean(rec && rec.tech).toLowerCase();
  if (!tech) throw new Error('Technician is required');
  const type = TYPES.indexOf(clean(rec && rec.type).toLowerCase()) !== -1 ? clean(rec.type).toLowerCase() : 'other';
  const it = {
    id: 'JOB' + Date.now().toString(36) + Math.floor(Math.random() * 1000),
    tech,
    type,
    dg: clean(rec && rec.dg).toUpperCase(),
    kva: (rec && rec.kva != null && rec.kva !== '') ? Number(rec.kva) : null,
    title: clean(rec && rec.title),
    location: clean(rec && rec.location),
    mapLink: clean(rec && rec.mapLink),
    note: clean(rec && rec.note),
    parts: Array.isArray(rec && rec.parts) ? rec.parts.map((p) => ({
      en: clean(p.en), hi: clean(p.hi), qty: clean(p.qty),
    })).filter((p) => p.en) : [],
    status: 'new',
    // Store-keeper side: have the parts for this job been issued yet?
    partsIssued: false,
    partsIssuedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    history: [{ status: 'new', at: new Date().toISOString() }],
  };
  items.unshift(it);
  persist();
  return it;
}

function get(id) { return items.find((x) => x.id === id) || null; }

// Active + recent jobs for one technician (newest first). Keeps done jobs for a
// short while so the tech can see what they just finished.
function forTech(techId) {
  const t = String(techId || '').toLowerCase();
  return items.filter((x) => x.tech === t)
    .filter((x) => x.status !== 'done' || (Date.now() - new Date(x.updatedAt).getTime()) < 12 * 3600000)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function setStatus(id, status) {
  const it = items.find((x) => x.id === id);
  if (!it) throw new Error('Job not found');
  const s = String(status || '').toLowerCase();
  if (STATUSES.indexOf(s) === -1) throw new Error('Bad status');
  it.status = s;
  it.updatedAt = new Date().toISOString();
  if (!Array.isArray(it.history)) it.history = [];
  const last = it.history[it.history.length - 1];
  if (!last || last.status !== s) it.history.push({ status: s, at: new Date().toISOString() });
  persist();
  return it;
}

function remove(id) { items = items.filter((x) => x.id !== id); persist(); }

// Store keeper: jobs that need parts, pending-issue first, then recently issued.
function forStore() {
  return items
    .filter((x) => Array.isArray(x.parts) && x.parts.length)
    .filter((x) => x.status !== 'done' || (Date.now() - new Date(x.updatedAt).getTime()) < 12 * 3600000)
    .sort((a, b) => (Number(!!a.partsIssued) - Number(!!b.partsIssued)) || String(b.createdAt).localeCompare(String(a.createdAt)));
}
function setPartsIssued(id, issued) {
  const it = items.find((x) => x.id === id);
  if (!it) throw new Error('Job not found');
  it.partsIssued = !!issued;
  it.partsIssuedAt = issued ? new Date().toISOString() : null;
  it.updatedAt = new Date().toISOString();
  persist();
  return it;
}

// All jobs (office monitor), active first then recent done.
function all() {
  const rank = (s) => (s === 'done' ? 1 : 0);
  return items.slice().sort((a, b) => (rank(a.status) - rank(b.status)) || String(b.createdAt).localeCompare(String(a.createdAt)));
}

function stats() {
  const active = items.filter((x) => x.status !== 'done');
  return { total: items.length, active: active.length };
}

module.exports = { add, get, forTech, forStore, setStatus, setPartsIssued, remove, all, stats, TYPES, STATUSES };
