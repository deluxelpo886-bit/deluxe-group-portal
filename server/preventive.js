'use strict';
/*
 * Preventive service plan (weekly / Sunday service round).
 *
 * The office runs a planned PREVENTIVE service every Sunday - a team is put
 * aside for it and a set of generators is listed to be serviced that day,
 * independent of the hours-due engine. This is that living list: dated entries
 * {date, dg, team, note, status} that surface in the morning plan on the day,
 * so the Sunday service round is never forgotten and the team knows its list.
 *
 * Stored in a JSON file next to the database so it survives deploys.
 */

const fs = require('fs');
const path = require('path');

const DIR = path.dirname(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'deluxe.db'));
const FILE = path.join(DIR, 'preventive.json');

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

// Nearest Sunday on/after a given date (YYYY-MM-DD). Used to snap a plan entry
// to the Sunday service round when no explicit date is given.
function nextSunday(fromISO) {
  const base = isDate(fromISO) ? new Date(fromISO + 'T00:00:00') : new Date();
  const day = base.getDay(); // 0 = Sunday
  const add = (7 - day) % 7; // 0 if already Sunday
  const d = new Date(base.getTime() + add * 86400000);
  return d.toISOString().slice(0, 10);
}

function getAll() { return items.map((x) => Object.assign({}, x)); }

function add(rec) {
  const dg = clean(rec && rec.dg, 20).toUpperCase();
  if (!dg) throw new Error('Generator (DG) number is required');
  const date = isDate(rec && rec.date) ? String(rec.date).slice(0, 10) : nextSunday();
  const it = {
    id: 'PV' + Date.now().toString(36) + Math.floor(Math.random() * 1000),
    dg,
    date,
    team: clean(rec && rec.team, 60),
    teamName: clean(rec && rec.teamName, 80),
    note: clean(rec && rec.note, 500),
    status: 'open',
    createdBy: clean(rec && rec.createdBy, 60) || 'Operations Head',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  items.unshift(it);
  persist();
  return it;
}

function update(id, patch) {
  const it = items.find((x) => x.id === id);
  if (!it) throw new Error('Preventive entry not found');
  ['dg', 'date', 'team', 'teamName', 'note'].forEach((k) => {
    if (patch && k in patch) {
      let v = clean(patch[k], 500);
      if (k === 'dg') v = v.toUpperCase();
      if (k === 'date') v = isDate(patch[k]) ? String(patch[k]).slice(0, 10) : it.date;
      it[k] = v;
    }
  });
  it.updatedAt = new Date().toISOString();
  persist();
  return Object.assign({}, it);
}

function resolve(id) {
  const it = items.find((x) => x.id === id);
  if (!it) return false;
  it.status = 'done';
  it.updatedAt = new Date().toISOString();
  persist();
  return true;
}

function reopen(id) {
  const it = items.find((x) => x.id === id);
  if (!it) return false;
  it.status = 'open';
  it.updatedAt = new Date().toISOString();
  persist();
  return true;
}

function remove(id) {
  const n = items.length;
  items = items.filter((x) => x.id !== id);
  if (items.length !== n) persist();
  return items.length !== n;
}

module.exports = { getAll, add, update, resolve, reopen, remove, nextSunday, FILE };
