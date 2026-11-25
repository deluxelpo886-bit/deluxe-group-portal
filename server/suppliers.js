'use strict';
/*
 * Supplier registration submissions.
 *
 * Collected from the PUBLIC supplier form (/supplier) that the office shares
 * with vendors — like a Microsoft/Google Form, but Deluxe-branded and the data
 * stays in-house. Each submission is stored in a JSON file next to the database
 * so it survives deploys. The office reviews them on the (login-protected)
 * /suppliers page.
 */
const fs = require('fs');
const path = require('path');

const DIR = path.dirname(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'deluxe.db'));
const FILE = path.join(DIR, 'suppliers.json');

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

// The fields the public form collects. notes/address can be longer.
const FIELDS = [
  'companyName', 'tradeName', 'tradeLicenseNo', 'tradeLicenseExpiry', 'trn',
  'emirate', 'address', 'contactPerson', 'designation', 'mobile', 'email',
  'website', 'category', 'yearsInBusiness', 'bankName', 'iban', 'accountName', 'notes',
];
const LONG = { address: 1000, notes: 2000 };

function clean(s, max) { return String(s == null ? '' : s).replace(/\u0000/g, '').trim().slice(0, max || 300); }

function add(rec) {
  rec = rec || {};
  const companyName = clean(rec.companyName, 300);
  if (!companyName) throw new Error('Legal company name is required');
  const entry = {
    id: 'SUP' + Date.now().toString(36) + Math.floor(Math.random() * 1000),
    submittedAt: new Date().toISOString(),
    status: 'new',
  };
  FIELDS.forEach((f) => { entry[f] = clean(rec[f], LONG[f]); });
  items.unshift(entry); // newest first
  if (items.length > 5000) items = items.slice(0, 5000);
  persist();
  return entry;
}

function all() { return items.slice(); }
function count() { return items.length; }
function setStatus(id, status) {
  const it = items.find((x) => x.id === id);
  if (it) { it.status = String(status || 'new').slice(0, 20); persist(); }
  return it || null;
}
function remove(id) {
  const i = items.findIndex((x) => x.id === id);
  if (i >= 0) { items.splice(i, 1); persist(); return true; }
  return false;
}

module.exports = { add, all, count, setStatus, remove, FIELDS };
