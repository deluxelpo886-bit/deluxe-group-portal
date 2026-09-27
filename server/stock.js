'use strict';
/*
 * Simple spare-parts stock for the store keeper.
 *
 * A short list of common consumables with a quantity and a "low" threshold, so
 * the store keeper can see at a glance what is running out and adjust counts as
 * parts go in and out. Stored on the persistent disk. This is a light running
 * count, not a full inventory system.
 */

const fs = require('fs');
const path = require('path');

const DIR = path.dirname(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'deluxe.db'));
const FILE = path.join(DIR, 'stock.json');

const DEFAULTS = [
  { key: 'oil15w40', en: 'Engine oil 15W-40', hi: 'इंजन ऑयल', unit: 'L', qty: 40, low: 20 },
  { key: 'oilfilter', en: 'Oil filter', hi: 'ऑयल फ़िल्टर', unit: 'pc', qty: 8, low: 4 },
  { key: 'fuelfilter', en: 'Fuel filter', hi: 'फ़्यूल फ़िल्टर', unit: 'pc', qty: 6, low: 4 },
  { key: 'airfilter', en: 'Air filter', hi: 'एयर फ़िल्टर', unit: 'pc', qty: 5, low: 3 },
  { key: 'coolant', en: 'Coolant', hi: 'कूलेंट', unit: 'L', qty: 25, low: 10 },
  { key: 'battery', en: 'Battery', hi: 'बैटरी', unit: 'pc', qty: 3, low: 2 },
  { key: 'vbelt', en: 'V-belt', hi: 'बेल्ट', unit: 'pc', qty: 4, low: 2 },
];

let items = null;
function load() {
  if (items) return items;
  try { if (fs.existsSync(FILE)) { const raw = JSON.parse(fs.readFileSync(FILE, 'utf8')); if (Array.isArray(raw) && raw.length) { items = raw; return items; } } } catch (_) { /* noop */ }
  items = DEFAULTS.map((x) => Object.assign({}, x));
  persist();
  return items;
}
function persist() {
  try { if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(items, null, 2)); } catch (_) { /* noop */ }
}

function getAll() { return load(); }

function adjust(key, delta) {
  load();
  const it = items.find((x) => x.key === key);
  if (!it) return null;
  it.qty = Math.max(0, Math.round((Number(it.qty) || 0) + Number(delta || 0)));
  persist();
  return it;
}
function setQty(key, qty) {
  load();
  const it = items.find((x) => x.key === key);
  if (!it) return null;
  const n = Number(qty);
  if (isFinite(n)) it.qty = Math.max(0, Math.round(n));
  persist();
  return it;
}

module.exports = { getAll, adjust, setQty };
