'use strict';
/*
 * Return notes (off-hire hand-back).
 *
 * The mirror of the delivery note: when a generator comes OFF hire and returns
 * to the yard, the store keeper raises a numbered return note recording its
 * condition on arrival — meter reading, whether it runs, any damage, which
 * accessories came back, fuel level — and signs it. This is Step 19 of the
 * rental process, and filed together with the delivery note and hire contract.
 *
 * Numbered RN-0001, RN-0002 … and stored in a JSON file next to the database so
 * it lives on the persistent disk and survives deploys/restarts.
 */

const fs = require('fs');
const path = require('path');

const DIR = path.dirname(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'deluxe.db'));
const FILE = path.join(DIR, 'returnnotes.json');

let seq = 0;
let items = [];
try {
  if (fs.existsSync(FILE)) {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (Array.isArray(raw)) { items = raw; }
    else if (raw && typeof raw === 'object') { items = Array.isArray(raw.items) ? raw.items : []; seq = Number(raw.seq) || 0; }
  }
} catch (_) { items = []; seq = 0; }
if (!seq) { items.forEach((x) => { const n = Number(x && x.seq) || 0; if (n > seq) seq = n; }); }

function persist() {
  try {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify({ seq, items }, null, 2));
  } catch (_) { /* best-effort */ }
}

function num(n) { return 'RN-' + String(n).padStart(4, '0'); }

// Create a return note. Only DG is strictly required; everything else is
// captured as given so a note can be raised quickly when the unit arrives.
function create(rec) {
  const dg = String((rec && rec.dg) || '').trim().toUpperCase();
  if (!dg) throw new Error('Generator (DG) number is required');
  seq += 1;
  const str = (v) => String((v == null ? '' : v)).trim();
  const it = {
    id: 'RN' + Date.now().toString(36) + Math.floor(Math.random() * 1000),
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
    // Condition on return
    working: (rec.working === 'no' || rec.working === false) ? 'no' : (rec.working ? 'yes' : ''),
    damage: str(rec.damage),          // description of any physical damage
    accessories: str(rec.accessories), // what came back (batteries, cables…)
    fuelLevel: str(rec.fuelLevel),     // e.g. Full / Half / Empty
    notes: str(rec.notes),
    createdAt: new Date().toISOString(),
  };
  items.unshift(it);
  if (items.length > 1000) items = items.slice(0, 1000);
  persist();
  return it;
}

function get(id) { return items.find((x) => x.id === id) || null; }
function getAll() { return items.slice(); }
function remove(id) {
  const before = items.length;
  items = items.filter((x) => x.id !== id);
  if (items.length !== before) persist();
  return items.length !== before;
}

module.exports = { create, get, getAll, remove };
