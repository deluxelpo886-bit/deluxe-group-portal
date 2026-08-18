'use strict';
/*
 * Daily servicing schedule.
 *
 * The office plans, per day, which generators each of the two servicing teams
 * will visit. Technicians can tick items off as done. Stored in a small JSON
 * file under data/ so it's shared across everyone and survives restarts.
 */

const fs = require('fs');
const path = require('path');

// Store next to the database so the data lives on the same persistent disk
// (a plain app-folder path is wiped on every Render deploy).
const DIR = path.dirname(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'deluxe.db'));
const FILE = path.join(DIR, 'schedule.json');
const TEAMS = ['Team 1', 'Team 2'];

let store = {}; // "YYYY-MM-DD" -> { "Team 1": [ {dg, note, done} ], "Team 2": [...] }
try {
  if (fs.existsSync(FILE)) store = JSON.parse(fs.readFileSync(FILE, 'utf8')) || {};
} catch (_) { store = {}; }

function persist() {
  try {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(store, null, 2));
  } catch (_) { /* best-effort */ }
}

function day(d) {
  d = (d && String(d).slice(0, 10)) || new Date().toISOString().slice(0, 10);
  if (!store[d]) store[d] = {};
  TEAMS.forEach((t) => { if (!Array.isArray(store[d][t])) store[d][t] = []; });
  return d;
}

function get(d) {
  d = day(d);
  const teams = {};
  TEAMS.forEach((t) => { teams[t] = store[d][t]; });
  return { date: d, teams };
}

function validTeam(team) {
  if (TEAMS.indexOf(team) < 0) throw new Error('Unknown team');
}

function add(d, team, dg, note) {
  d = day(d); validTeam(team);
  dg = String(dg || '').trim().toUpperCase();
  if (!dg) throw new Error('Generator (DG) number is required');
  if (!store[d][team].some((x) => x.dg === dg)) {
    store[d][team].push({ dg, note: String(note || '').trim(), done: false });
  }
  persist();
  return get(d);
}

function update(d, team, dg, done) {
  d = day(d); validTeam(team);
  dg = String(dg || '').trim().toUpperCase();
  const it = (store[d][team] || []).find((x) => x.dg === dg);
  if (it) it.done = !!done;
  persist();
  return get(d);
}

function remove(d, team, dg) {
  d = day(d); validTeam(team);
  dg = String(dg || '').trim().toUpperCase();
  store[d][team] = (store[d][team] || []).filter((x) => x.dg !== dg);
  persist();
  return get(d);
}

module.exports = { get, add, update, remove, TEAMS };
