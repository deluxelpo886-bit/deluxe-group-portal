'use strict';
/*
 * Procurement requests.
 *
 * When the store keeper does NOT have a part, they send it to Procurement
 * (Hafeez). Each request lists the parts to buy for a generator. Hafeez sees
 * them in his app and, with one tap, sends the RFQ to the supplier WhatsApp
 * group. Kept in a small JSON file on the persistent disk.
 */
const fs = require('fs');
const path = require('path');

const DIR = path.dirname(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'deluxe.db'));
const FILE = path.join(DIR, 'procurement.json');
const STATUSES = ['Pending', 'Sent', 'Received', 'Cancelled'];

let items = [];
try {
  if (fs.existsSync(FILE)) items = JSON.parse(fs.readFileSync(FILE, 'utf8')) || [];
  if (!Array.isArray(items)) items = [];
} catch (_) { items = []; }

function persist() {
  try {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(items, null, 2));
  } catch (_) { /* best-effort */ }
}
function newId() { return 'P' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function cap(v, n) { return String(v == null ? '' : v).trim().slice(0, n || 200); }

// Create a procurement request. parts = [{ en, hi, qty }].
function add(rec) {
  const dg = cap(rec && rec.dg, 30).toUpperCase();
  const parts = Array.isArray(rec && rec.parts) ? rec.parts.map((p) => ({
    en: cap(p.en, 120), hi: cap(p.hi, 120), qty: cap(p.qty, 20),
  })).filter((p) => p.en || p.hi) : [];
  if (!dg && !parts.length) throw new Error('A DG or parts are required');
  const entry = {
    id: newId(),
    dg,
    parts,
    tech: cap(rec && rec.tech, 60),
    location: cap(rec && rec.location, 160),
    note: cap(rec && rec.note, 400),
    fromJobId: cap(rec && rec.fromJobId, 40),
    sentBy: cap(rec && rec.sentBy, 60),
    status: 'Pending',
    createdAt: new Date().toISOString(),
    history: [{ status: 'Pending', at: new Date().toISOString() }],
  };
  items.unshift(entry);
  persist();
  return entry;
}

function get(id) { return items.find((x) => x.id === String(id || '')) || null; }

function setStatus(id, status) {
  const it = get(id);
  if (!it) return null;
  const s = String(status || '').trim();
  if (STATUSES.indexOf(s) === -1) return it;
  it.status = s;
  it.updatedAt = new Date().toISOString();
  const last = it.history[it.history.length - 1];
  if (!last || last.status !== s) it.history.push({ status: s, at: it.updatedAt });
  persist();
  return it;
}

function remove(id) {
  const i = items.findIndex((x) => x.id === String(id || ''));
  if (i === -1) return false;
  items.splice(i, 1); persist(); return true;
}

// Pending first, then recent.
function all() {
  return items.slice().sort((a, b) =>
    (Number(a.status !== 'Pending') - Number(b.status !== 'Pending')) || String(b.createdAt).localeCompare(String(a.createdAt)));
}
function stats() { return { total: items.length, pending: items.filter((x) => x.status === 'Pending').length }; }

module.exports = { add, get, setStatus, remove, all, stats, STATUSES };
