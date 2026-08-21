'use strict';
/*
 * Rental income tracker.
 *
 * For each generator on hire, records who's renting it, the monthly rate, and
 * when it went out. Combined with the on-hire/off-hire status (see hire.js) this
 * gives total monthly income, earning-vs-idle counts, and a per-customer
 * breakdown. Stored in a JSON file next to the database (persistent disk).
 */

const fs = require('fs');
const path = require('path');

const DIR = path.dirname(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'deluxe.db'));
const FILE = path.join(DIR, 'rentals.json');

let store = {}; // DG (upper) -> { dg, customer, rate, startDate, endDate, notes, updatedAt }
try {
  if (fs.existsSync(FILE)) store = JSON.parse(fs.readFileSync(FILE, 'utf8')) || {};
} catch (_) { store = {}; }

function persist() {
  try {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(store, null, 2));
  } catch (_) { /* best-effort */ }
}

// Record or update the rental terms for a generator (one active rental per DG).
function save(rec) {
  const dg = String((rec && rec.dg) || '').trim().toUpperCase();
  if (!dg) throw new Error('Generator (DG) number is required');
  const rate = Number(rec.rate);
  const entry = {
    dg,
    customer: String((rec && rec.customer) || '').trim(),
    rate: isFinite(rate) && rate > 0 ? rate : 0,
    startDate: (rec.startDate && String(rec.startDate).slice(0, 10)) || '',
    endDate: (rec.endDate && String(rec.endDate).slice(0, 10)) || '',
    notes: String((rec && rec.notes) || '').trim(),
    updatedAt: new Date().toISOString(),
  };
  store[dg] = entry;
  persist();
  return entry;
}

function remove(dg) {
  const key = String(dg || '').trim().toUpperCase();
  if (store[key]) { delete store[key]; persist(); return true; }
  return false;
}

function getAll() {
  return Object.keys(store).map((k) => Object.assign({}, store[k]));
}
function getMap() {
  const out = {};
  Object.keys(store).forEach((k) => { out[k] = store[k]; });
  return out;
}

function daysOnHire(startDate) {
  if (!startDate) return null;
  const d = Math.round((Date.now() - new Date(startDate + 'T00:00:00')) / 86400000);
  return d >= 0 ? d : null;
}

// Income summary. `hireMap` is DG -> { offHire } from hire.js: an off-hire unit
// is idle (not earning) even if it has rental terms recorded.
function stats(hireMap) {
  hireMap = hireMap || {};
  const isOff = (dg) => !!(hireMap[dg] && hireMap[dg].offHire);
  let totalMonthly = 0, earningCount = 0, idleCount = 0, idlePotential = 0;
  const byCustomer = {};
  Object.values(store).forEach((r) => {
    if (isOff(r.dg)) {
      idleCount += 1;
      if (r.rate > 0) idlePotential += r.rate;
      return;
    }
    if (r.rate > 0) {
      totalMonthly += r.rate;
      earningCount += 1;
      const c = r.customer || '(no customer)';
      byCustomer[c] = byCustomer[c] || { customer: c, count: 0, total: 0, dgs: [] };
      byCustomer[c].count += 1;
      byCustomer[c].total += r.rate;
      byCustomer[c].dgs.push(r.dg);
    }
  });
  return {
    totalMonthly: Math.round(totalMonthly),
    earningCount,
    idleCount,
    idlePotential: Math.round(idlePotential),
    rentalCount: Object.keys(store).length,
    byCustomer: Object.values(byCustomer).sort((a, b) => b.total - a.total),
  };
}

module.exports = { save, remove, getAll, getMap, daysOnHire, stats };
