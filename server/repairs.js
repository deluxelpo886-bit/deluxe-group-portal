'use strict';
/*
 * Workshop repair tracking.
 *
 * Generators sent to the workshop: what is queued, being repaired, awaiting
 * parts, or completed. Previously this lived only in the map page's memory and
 * was lost on refresh; now it is its own page backed by this store on the
 * persistent disk, so the workshop log survives deploys/restarts.
 */

const fs = require('fs');
const path = require('path');

const DIR = path.dirname(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'deluxe.db'));
const FILE = path.join(DIR, 'repairs.json');

const STATUSES = ['Under Repair', 'Repairing', 'Awaiting Parts', 'Repair Completed'];

let items = [];
try { if (fs.existsSync(FILE)) { const raw = JSON.parse(fs.readFileSync(FILE, 'utf8')); items = Array.isArray(raw) ? raw : []; } } catch (_) { items = []; }
function persist() { try { if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(items, null, 2)); } catch (_) { /* noop */ } }
function clean(v) { return String(v == null ? '' : v).trim(); }
function normStatus(v) { return STATUSES.find((s) => s.toLowerCase() === clean(v).toLowerCase()) || 'Under Repair'; }

function nextRepairNumber() {
  let max = 0;
  items.forEach((r) => { const m = /^RPR1-(\d+)$/.exec(r.repair_id || ''); if (m) max = Math.max(max, parseInt(m[1], 10)); });
  return 'RPR1-' + String(max + 1).padStart(6, '0');
}

function todayDMY() { const d = new Date(); const p = (n) => (n < 10 ? '0' : '') + n; return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear(); }

// Create or update a repair. Identified by `id`.
function save(rec) {
  const dg = clean(rec && rec.dg).toUpperCase();
  if (!dg) throw new Error('Generator (DG) is required');
  const status = normStatus(rec && rec.repair_status);
  let it = rec && rec.id ? items.find((x) => x.id === rec.id) : null;
  if (!it) {
    it = { id: 'RP' + Date.now().toString(36) + Math.floor(Math.random() * 1000), repair_id: nextRepairNumber(), createdAt: new Date().toISOString() };
    items.unshift(it);
  }
  it.dg = dg;
  it.kva = (rec && rec.kva != null && rec.kva !== '') ? Number(rec.kva) : (it.kva != null ? it.kva : null);
  it.issue = clean(rec && rec.issue) || it.issue || '-';
  it.technician = clean(rec && rec.technician) || it.technician || '-';
  it.date_in = clean(rec && rec.date_in) || it.date_in || todayDMY();
  it.repair_status = status;
  it.notes = clean(rec && rec.notes);
  it.date_completed = (status === 'Repair Completed') ? (clean(rec && rec.date_completed) || it.date_completed || todayDMY()) : null;
  it.updatedAt = new Date().toISOString();
  persist();
  return it;
}

function remove(id) { items = items.filter((x) => x.id !== id); persist(); }

function all() {
  const rank = (s) => (s === 'Repair Completed' ? 1 : 0);
  return items.slice().sort((a, b) => (rank(a.repair_status) - rank(b.repair_status)) || String(b.createdAt).localeCompare(String(a.createdAt)));
}

function stats() {
  const active = items.filter((r) => r.repair_status !== 'Repair Completed');
  return {
    inWorkshop: active.length,
    underRepair: items.filter((r) => r.repair_status === 'Under Repair').length,
    repairing: items.filter((r) => r.repair_status === 'Repairing').length,
    awaitingParts: items.filter((r) => r.repair_status === 'Awaiting Parts').length,
    completed: items.filter((r) => r.repair_status === 'Repair Completed').length,
  };
}

module.exports = { save, remove, all, stats, STATUSES };
