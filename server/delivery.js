'use strict';
/*
 * Delivery / on-hire notes.
 *
 * When a generator leaves the yard on hire, the driver hands the customer a
 * delivery note: which generator (DG + KVA), where it went, who took it, the
 * meter reading at hand-over, and the agreed rate. This store keeps a numbered
 * record of every note so the office has a paper trail of what went out and
 * when, and the note can be re-printed. Stored in a small JSON file next to the
 * database so it lives on the persistent disk and survives deploys/restarts.
 */

const fs = require('fs');
const path = require('path');

// Store next to the database so the data lives on the same persistent disk
// (a plain app-folder path is wiped on every Render deploy).
const DIR = path.dirname(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'deluxe.db'));
const FILE = path.join(DIR, 'delivery.json');

let seq = 0;         // running delivery-note number
let items = [];      // list of notes, newest first
try {
  if (fs.existsSync(FILE)) {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (Array.isArray(raw)) { items = raw; }
    else if (raw && typeof raw === 'object') { items = Array.isArray(raw.items) ? raw.items : []; seq = Number(raw.seq) || 0; }
  }
} catch (_) { items = []; seq = 0; }
// Recover the counter if the file predates it, so numbers never go backwards.
if (!seq) {
  items.forEach((x) => { const n = Number(x && x.seq) || 0; if (n > seq) seq = n; });
}

function persist() {
  try {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify({ seq, items }, null, 2));
  } catch (_) { /* best-effort */ }
}

function num(n) { return 'DN-' + String(n).padStart(4, '0'); }

// Create a delivery note. Only DG is strictly required; everything else is
// captured as given so a note can be raised quickly at the gate.
function create(rec) {
  const dg = String((rec && rec.dg) || '').trim().toUpperCase();
  if (!dg) throw new Error('Generator (DG) number is required');
  seq += 1;
  const str = (v) => String((v == null ? '' : v)).trim();
  const it = {
    id: 'DN' + Date.now().toString(36) + Math.floor(Math.random() * 1000),
    seq,
    number: num(seq),
    dg,
    kva: str(rec.kva),
    brand: str(rec.brand),
    customer: str(rec.customer),
    site: str(rec.site),
    contact: str(rec.contact),
    date: (rec && rec.date && String(rec.date).slice(0, 10)) || new Date().toISOString().slice(0, 10),
    driver: str(rec.driver),
    vehicle: str(rec.vehicle),
    meterReading: (rec && rec.meterReading !== '' && isFinite(Number(rec.meterReading))) ? Number(rec.meterReading) : null,
    rateType: str(rec.rateType),
    rate: (rec && rec.rate !== '' && isFinite(Number(rec.rate))) ? Number(rec.rate) : null,
    notes: str(rec.notes),
    createdAt: new Date().toISOString(),
  };
  items.unshift(it);
  if (items.length > 1000) items = items.slice(0, 1000);
  persist();
  return it;
}

function get(id) {
  return items.find((x) => x.id === id) || null;
}

function getAll() {
  return items.slice();
}

function remove(id) {
  const before = items.length;
  items = items.filter((x) => x.id !== id);
  if (items.length !== before) persist();
  return items.length !== before;
}

module.exports = { create, get, getAll, remove };
