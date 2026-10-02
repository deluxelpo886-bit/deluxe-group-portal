'use strict';
/*
 * Rental enquiries from the public marketing site (/rent).
 *
 * A visitor submits a request (name, phone, what they need) and it is stored
 * here so the office sees it in the portal. Public submissions are untrusted,
 * so every field is length-capped and stored as plain data (rendered escaped by
 * the ops page). Kept in a small JSON file on the persistent disk.
 */
const fs = require('fs');
const path = require('path');

const DIR = path.dirname(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'deluxe.db'));
const FILE = path.join(DIR, 'enquiries.json');
const MAX = 2000; // keep at most this many, newest first

let store = [];
try {
  if (fs.existsSync(FILE)) store = JSON.parse(fs.readFileSync(FILE, 'utf8')) || [];
  if (!Array.isArray(store)) store = [];
} catch (_) { store = []; }

function persist() {
  try {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(store.slice(0, MAX), null, 2));
  } catch (_) { /* best-effort */ }
}

function newId() { return 'E' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function cap(v, n) { return String(v == null ? '' : v).trim().slice(0, n); }

// Add a public enquiry. Returns the stored entry (or throws on missing basics).
function add(rec) {
  const name = cap(rec && rec.name, 80);
  const phone = cap(rec && rec.phone, 40);
  if (!name && !phone) throw new Error('Name or phone is required');
  const entry = {
    id: newId(),
    name,
    phone,
    company: cap(rec && rec.company, 120),
    kva: cap(rec && rec.kva, 40),
    message: cap(rec && rec.message, 1000),
    status: 'New', // New | Contacted | Closed
    at: new Date().toISOString(),
  };
  store.unshift(entry);
  if (store.length > MAX) store = store.slice(0, MAX);
  persist();
  return entry;
}

function setStatus(id, status) {
  const it = store.find((e) => e.id === String(id || ''));
  if (!it) return null;
  const s = String(status || '').trim();
  if (['New', 'Contacted', 'Closed'].indexOf(s) !== -1) { it.status = s; persist(); }
  return it;
}

function remove(id) {
  const i = store.findIndex((e) => e.id === String(id || ''));
  if (i === -1) return false;
  store.splice(i, 1); persist(); return true;
}

function getAll() { return store.slice(); }
function stats() {
  return { total: store.length, new: store.filter((e) => e.status === 'New').length };
}

module.exports = { add, setStatus, remove, getAll, stats };
