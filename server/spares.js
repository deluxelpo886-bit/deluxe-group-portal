'use strict';
/*
 * Spare-parts issue tracking.
 *
 * Log spare parts a generator needs and track them through Needed -> Ordered ->
 * Received -> Fitted. Stored in a small JSON file under data/ so it's shared and
 * survives restarts.
 */

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DIR, 'spares.json');
const STATUSES = ['Needed', 'Ordered', 'Received', 'Fitted'];

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

function add(rec) {
  const dg = String((rec && rec.dg) || '').trim().toUpperCase();
  const part = String((rec && rec.part) || '').trim();
  if (!dg) throw new Error('Generator (DG) number is required');
  if (!part) throw new Error('Part name is required');
  const it = {
    id: 'S' + Date.now().toString(36) + Math.floor(Math.random() * 1000),
    dg,
    part,
    qty: Number(rec.qty) > 0 ? Number(rec.qty) : 1,
    status: 'Needed',
    requestedBy: String(rec.requestedBy || '').trim(),
    notes: String(rec.notes || '').trim(),
    date: new Date().toISOString().slice(0, 10),
    updatedAt: new Date().toISOString(),
  };
  items.unshift(it);
  persist();
  return it;
}

function update(id, status) {
  const it = items.find((x) => x.id === id);
  if (!it) throw new Error('Item not found');
  if (STATUSES.indexOf(status) < 0) throw new Error('Unknown status');
  it.status = status;
  it.updatedAt = new Date().toISOString();
  persist();
  return it;
}

function remove(id) {
  items = items.filter((x) => x.id !== id);
  persist();
}

function getAll() { return items.slice(); }

module.exports = { add, update, remove, getAll, STATUSES };
