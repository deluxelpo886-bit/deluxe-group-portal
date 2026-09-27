'use strict';
/*
 * LPO / billing tracker.
 *
 * For every generator on hire we track the customer's LPO (Local Purchase
 * Order / PO) and the monthly billing paperwork - the TIMESHEET and the
 * INVOICE - because customers like Trojan run their own vendor portal and we
 * only get paid once the timesheet + invoice are uploaded against a valid PO.
 *
 * The store is keyed by DG number so it merges cleanly onto the live on-hire
 * fleet: the page lists every hired unit and overlays whatever billing data we
 * have saved for it. Data lives in a JSON file next to the database so it
 * survives Render deploys/restarts.
 */

const fs = require('fs');
const path = require('path');

const DIR = path.dirname(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'deluxe.db'));
const FILE = path.join(DIR, 'lpo.json');
const SEED_MARKER = path.join(DIR, 'lpo-seed-applied.json');

// Editable fields on an LPO record. Everything else (dg, history, timestamps)
// is managed here.
const FIELDS = [
  'customer', 'poNumber', 'poValue', 'poDate', 'validTo', 'portal', 'rate',
  'period', 'timesheetDone', 'timesheetDate', 'invoiceDone', 'invoiceNo',
  'invoiceDate', 'invoiceAmount', 'notes',
];

let store = {};
try {
  if (fs.existsSync(FILE)) store = JSON.parse(fs.readFileSync(FILE, 'utf8')) || {};
} catch (_) { store = {}; }

function persist() {
  try {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(store, null, 2));
  } catch (_) { /* best-effort */ }
}

function clean(v) { return String(v == null ? '' : v).trim(); }
function bool(v) { return v === true || v === 'true' || v === 1 || v === '1'; }
function numOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.]/g, ''));
  return isFinite(n) ? n : null;
}

function getAll() { return store; }
function get(dg) { return store[String(dg || '').trim().toUpperCase()] || null; }

// Create or update the billing record for a DG. Only known fields are written.
function save(dg, fields) {
  const key = String(dg || '').trim().toUpperCase();
  if (!key) throw new Error('DG number is required');
  const rec = store[key] || { dg: key, history: [], createdAt: new Date().toISOString() };
  FIELDS.forEach((f) => {
    if (fields && Object.prototype.hasOwnProperty.call(fields, f)) {
      if (f === 'timesheetDone' || f === 'invoiceDone') rec[f] = bool(fields[f]);
      else if (f === 'poValue' || f === 'rate' || f === 'invoiceAmount') rec[f] = numOrNull(fields[f]);
      else rec[f] = clean(fields[f]);
    }
  });
  rec.dg = key;
  if (!Array.isArray(rec.history)) rec.history = [];
  rec.updatedAt = new Date().toISOString();
  store[key] = rec;
  persist();
  return rec;
}

// Close the current billing month: archive the timesheet/invoice status into
// history and clear the flags for the new period, so the office starts each
// month with a fresh "timesheet / invoice pending" checklist per unit.
function newMonth(dg, period) {
  const key = String(dg || '').trim().toUpperCase();
  const rec = store[key];
  if (!rec) throw new Error('No LPO record for ' + key);
  if (!Array.isArray(rec.history)) rec.history = [];
  rec.history.unshift({
    period: rec.period || '',
    timesheetDone: !!rec.timesheetDone, timesheetDate: rec.timesheetDate || '',
    invoiceDone: !!rec.invoiceDone, invoiceNo: rec.invoiceNo || '',
    invoiceDate: rec.invoiceDate || '', invoiceAmount: rec.invoiceAmount != null ? rec.invoiceAmount : null,
    at: new Date().toISOString(),
  });
  rec.history = rec.history.slice(0, 24);
  rec.period = clean(period);
  rec.timesheetDone = false; rec.timesheetDate = '';
  rec.invoiceDone = false; rec.invoiceNo = ''; rec.invoiceDate = ''; rec.invoiceAmount = null;
  rec.updatedAt = new Date().toISOString();
  persist();
  return rec;
}

function remove(dg) {
  const key = String(dg || '').trim().toUpperCase();
  delete store[key];
  persist();
}

// One-time versioned seed (e.g. pre-fill known PO numbers). De-duplicated by
// version string; only writes fields that are still empty so it never clobbers
// office edits.
function applySeed(records, version) {
  if (!Array.isArray(records) || !version) return { skipped: true };
  let applied = {};
  try { if (fs.existsSync(SEED_MARKER)) applied = JSON.parse(fs.readFileSync(SEED_MARKER, 'utf8')) || {}; } catch (_) { applied = {}; }
  if (applied[version]) return { skipped: true, version };
  let n = 0;
  records.forEach((r) => {
    const key = String((r && r.dg) || '').trim().toUpperCase();
    if (!key) return;
    const rec = store[key] || { dg: key, history: [], createdAt: new Date().toISOString() };
    FIELDS.forEach((f) => {
      if (r && r[f] != null && r[f] !== '' && (rec[f] == null || rec[f] === '')) {
        if (f === 'timesheetDone' || f === 'invoiceDone') rec[f] = bool(r[f]);
        else if (f === 'poValue' || f === 'rate' || f === 'invoiceAmount') rec[f] = numOrNull(r[f]);
        else rec[f] = clean(r[f]);
      }
    });
    rec.dg = key;
    if (!Array.isArray(rec.history)) rec.history = [];
    store[key] = rec; n += 1;
  });
  if (n) persist();
  applied[version] = { at: new Date().toISOString(), count: n };
  try {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(SEED_MARKER, JSON.stringify(applied, null, 2));
  } catch (_) { /* best-effort */ }
  return { applied: n, version };
}

module.exports = { getAll, get, save, newMonth, remove, applySeed, FIELDS };
