'use strict';
/*
 * Breakdown log.
 *
 * Records every generator breakdown - when it was reported, which truck/team was
 * sent, and when it was resolved - so the office can see response times and spot
 * repeat-offender generators. Stored in a small JSON file next to the database so
 * it lives on the persistent disk and survives deploys/restarts.
 */

const fs = require('fs');
const path = require('path');

// Store next to the database so the data lives on the same persistent disk
// (a plain app-folder path is wiped on every Render deploy).
const DIR = path.dirname(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'deluxe.db'));
const FILE = path.join(DIR, 'breakdowns.json');
const SEED_MARKER = path.join(DIR, 'breakdowns-seed-applied.json');

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

// Allowed values. A breakdown moves Open -> Assigned -> On the way -> On site
// -> Resolved. Anything that is not "Resolved" is still an ACTIVE job that the
// office should be chasing. Priority decides which active job is chased first.
const STATUSES = ['Open', 'Assigned', 'On the way', 'On site', 'Waiting parts', 'Resolved'];
const PRIORITIES = ['Critical', 'High', 'Normal'];
const PRIORITY_RANK = { Critical: 0, High: 1, Normal: 2 };

function normStatus(v) {
  const s = String(v || '').trim();
  return STATUSES.find((x) => x.toLowerCase() === s.toLowerCase()) || null;
}
function normPriority(v) {
  const p = String(v || '').trim();
  return PRIORITIES.find((x) => x.toLowerCase() === p.toLowerCase()) || null;
}

function add(rec) {
  const dg = String((rec && rec.dg) || '').trim().toUpperCase();
  if (!dg) throw new Error('Generator (DG) number is required');
  const it = {
    id: 'BD' + Date.now().toString(36) + Math.floor(Math.random() * 1000),
    dg,
    // How urgent: Critical (down, on-hire customer) / High / Normal.
    priority: normPriority(rec && rec.priority) || 'Normal',
    location: String((rec && rec.location) || '').trim(),
    truck: String((rec && rec.truck) || '').trim(),
    notes: String((rec && rec.notes) || '').trim(),
    // Triage: the reported symptom and the likely fault category (Electrical,
    // Mechanical, Fuel, Cooling, Control panel, Other). Recorded at report time
    // so patterns ("why do our breakdowns happen?") build up over time.
    symptom: String((rec && rec.symptom) || '').trim(),
    category: String((rec && rec.category) || '').trim(),
    // Confirmed root cause, filled when the breakdown is resolved.
    cause: String((rec && rec.cause) || '').trim(),
    // Next-service info the technician reports when closing the job (free text,
    // e.g. "next 9559h" or "next 20/10"). Kept with the breakdown for the record.
    nextService: String((rec && rec.nextService) || '').trim(),
    reportedBy: String((rec && rec.reportedBy) || '').trim(),
    reportedAt: (rec && rec.reportedAt) ? new Date(rec.reportedAt).toISOString() : new Date().toISOString(),
    status: 'Open',
    resolvedAt: null,
    // Timeline of status changes (customer tracker). First entry is "Open".
    history: [{ status: 'Open', at: new Date().toISOString() }],
    // Secret share token for the public customer tracker (null until shared).
    track: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  items.unshift(it);
  persist();
  return it;
}

// Record a status change on the timeline (deduped: no repeat of the same
// status back-to-back). Used by update()/resolve() so the customer tracker can
// show a stamped Reported -> Assigned -> ... -> Resolved history.
function pushHistory(it, status) {
  if (!Array.isArray(it.history)) it.history = [];
  const last = it.history[it.history.length - 1];
  if (last && last.status === status) return;
  it.history.push({ status, at: new Date().toISOString() });
}

function resolve(id, fields) {
  const it = items.find((x) => x.id === id);
  if (!it) throw new Error('Breakdown not found');
  it.status = 'Resolved';
  it.resolvedAt = new Date().toISOString();
  pushHistory(it, 'Resolved');
  // Capture what was actually wrong (and confirm/correct the category) so the
  // record teaches you the real cause, not just the reported symptom.
  if (fields && fields.cause != null && String(fields.cause).trim()) it.cause = String(fields.cause).trim();
  if (fields && fields.category != null && String(fields.category).trim()) it.category = String(fields.category).trim();
  it.updatedAt = new Date().toISOString();
  persist();
  return it;
}

function reopen(id) {
  const it = items.find((x) => x.id === id);
  if (!it) throw new Error('Breakdown not found');
  it.status = 'Open';
  it.resolvedAt = null;
  it.updatedAt = new Date().toISOString();
  persist();
  return it;
}

function update(id, fields) {
  const it = items.find((x) => x.id === id);
  if (!it) throw new Error('Breakdown not found');
  ['location', 'truck', 'notes', 'reportedBy', 'symptom', 'category', 'cause', 'nextService'].forEach((k) => {
    if (fields && fields[k] != null) it[k] = String(fields[k]).trim();
  });
  if (fields && fields.dg) it.dg = String(fields.dg).trim().toUpperCase();
  // Priority change (Critical / High / Normal).
  if (fields && fields.priority != null) {
    const p = normPriority(fields.priority);
    if (p) it.priority = p;
  }
  // Status change along the dispatch flow. Moving to Resolved stamps the
  // resolved time (and clears it if the job is moved back to an active state)
  // so the response-time stats stay correct.
  if (fields && fields.status != null) {
    const s = normStatus(fields.status);
    if (s) {
      it.status = s;
      if (s === 'Resolved') { it.resolvedAt = it.resolvedAt || new Date().toISOString(); }
      else { it.resolvedAt = null; }
      pushHistory(it, s);
    }
  }
  it.updatedAt = new Date().toISOString();
  persist();
  return it;
}

// ---- Customer status tracker (public, no login) ----------------------------
// Each breakdown can get one secret share token. The token is the ONLY key to
// its status page: it maps to exactly one breakdown, cannot be guessed, and
// exposes nothing else (no other units, no rates, no map). Links auto-expire a
// week after the job is Resolved.
const crypto = require('crypto');
const TRACK_EXPIRE_DAYS = 7;

// Friendly labels shown to the customer for each internal status.
const PUBLIC_STAGE = {
  'Open': 'Breakdown reported',
  'Assigned': 'Technician assigned',
  'On the way': 'Technician on the way',
  'On site': 'Arrived on site',
  'Waiting parts': 'Awaiting parts',
  'Resolved': 'Resolved — running',
};
const STAGE_ORDER = ['Open', 'Assigned', 'On the way', 'On site', 'Resolved'];

function ensureToken(id) {
  const it = items.find((x) => x.id === id);
  if (!it) throw new Error('Breakdown not found');
  if (!it.track) {
    it.track = crypto.randomBytes(12).toString('base64url'); // 16-char unguessable token
    it.updatedAt = new Date().toISOString();
    persist();
  }
  return it.track;
}

// Look up a breakdown by its share token and return a SAFE public view, or
// null if the token is unknown or the link has expired.
function getPublic(token) {
  const t = String(token || '').trim();
  if (!t) return null;
  const it = items.find((x) => x.track && x.track === t);
  if (!it) return null;
  // Auto-expire: a week after resolution the link stops working.
  if (it.status === 'Resolved' && it.resolvedAt) {
    const ageDays = (Date.now() - new Date(it.resolvedAt).getTime()) / 86400000;
    if (ageDays > TRACK_EXPIRE_DAYS) return { expired: true };
  }
  const hist = (Array.isArray(it.history) && it.history.length ? it.history : [{ status: 'Open', at: it.reportedAt }])
    .map((h) => ({ status: h.status, label: PUBLIC_STAGE[h.status] || h.status, at: h.at }));
  return {
    dg: it.dg,
    location: it.location || '',
    status: it.status,
    statusLabel: PUBLIC_STAGE[it.status] || it.status,
    priority: it.priority,
    symptom: it.symptom || '',
    team: it.truck || '',
    reportedAt: it.reportedAt,
    resolvedAt: it.resolvedAt,
    history: hist,
    stages: STAGE_ORDER.map((s) => ({ status: s, label: PUBLIC_STAGE[s] })),
    resolved: it.status === 'Resolved',
  };
}

function remove(id) {
  items = items.filter((x) => x.id !== id);
  persist();
}

// Active breakdowns first (anything not yet Resolved), ranked by priority then
// oldest-first so the most urgent, longest-waiting job is chased first. Then
// resolved history, most-recent first.
function getAll() {
  const rank = (x) => (PRIORITY_RANK[x.priority] != null ? PRIORITY_RANK[x.priority] : 2);
  const active = items.filter((x) => x.status !== 'Resolved')
    .sort((a, b) => (rank(a) - rank(b)) || String(a.reportedAt).localeCompare(String(b.reportedAt)));
  const done = items.filter((x) => x.status === 'Resolved')
    .sort((a, b) => String(b.reportedAt).localeCompare(String(a.reportedAt)));
  return active.concat(done);
}

function stats() {
  const open = items.filter((x) => x.status !== 'Resolved');
  const resolved = items.filter((x) => x.status === 'Resolved' && x.resolvedAt);
  const critical = open.filter((x) => x.priority === 'Critical').length;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const thisMonth = items.filter((x) => String(x.reportedAt) >= monthStart).length;

  let avgHours = null;
  if (resolved.length) {
    const total = resolved.reduce((s, x) => s + (new Date(x.resolvedAt) - new Date(x.reportedAt)), 0);
    avgHours = Math.round((total / resolved.length / 3600000) * 10) / 10;
  }

  const counts = {};
  items.forEach((x) => { counts[x.dg] = (counts[x.dg] || 0) + 1; });
  const repeat = Object.keys(counts).filter((dg) => counts[dg] >= 2)
    .map((dg) => ({ dg, count: counts[dg] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  // Breakdown counts by fault category, so the office can see the pattern -
  // e.g. mostly Fuel or Cooling (dust) - and act on it.
  const cat = {};
  items.forEach((x) => { if (x.category) cat[x.category] = (cat[x.category] || 0) + 1; });
  const byCategory = Object.keys(cat)
    .map((k) => ({ category: k, count: cat[k] }))
    .sort((a, b) => b.count - a.count);

  return { total: items.length, open: open.length, critical, resolved: resolved.length, thisMonth, avgHours, repeat, byCategory };
}

// One-time, versioned import of breakdowns reported to the office (e.g. by
// WhatsApp) so they land in the log durably even on Render's ephemeral disk.
// Mirrors the other modules' applySeed: each version string is applied at most
// once, and a record is de-duplicated by its stable `key` (or DG + reportedAt).
function applySeed(records, version) {
  if (!Array.isArray(records) || !version) return { skipped: true };
  let applied = {};
  try {
    if (fs.existsSync(SEED_MARKER)) applied = JSON.parse(fs.readFileSync(SEED_MARKER, 'utf8')) || {};
  } catch (_) { applied = {}; }
  if (applied[version]) return { skipped: true, version };

  const existing = new Set(items.map((x) => x.seedKey).filter(Boolean));
  let n = 0;
  for (const r of records) {
    const dg = String((r && r.dg) || '').trim().toUpperCase();
    if (!dg) continue;
    const reportedAt = (r && r.reportedAt) ? new Date(r.reportedAt).toISOString() : new Date().toISOString();
    const sk = String((r && r.key) || (dg + '|' + reportedAt)).trim();
    if (existing.has(sk)) continue;
    existing.add(sk);
    items.unshift({
      id: 'BD' + Date.now().toString(36) + Math.floor(Math.random() * 1000) + n,
      seedKey: sk,
      dg,
      priority: normPriority(r && r.priority) || 'Normal',
      location: String((r && r.location) || '').trim(),
      truck: String((r && r.truck) || '').trim(),
      notes: String((r && r.notes) || '').trim(),
      symptom: String((r && r.symptom) || '').trim(),
      category: String((r && r.category) || '').trim(),
      cause: String((r && r.cause) || '').trim(),
      nextService: String((r && r.nextService) || '').trim(),
      reportedBy: String((r && r.reportedBy) || '').trim(),
      reportedAt,
      status: normStatus(r && r.status) || 'Open',
      resolvedAt: null,
      history: [{ status: normStatus(r && r.status) || 'Open', at: reportedAt }],
      track: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    n += 1;
  }
  if (n) persist();
  applied[version] = { at: new Date().toISOString(), count: n };
  try {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(SEED_MARKER, JSON.stringify(applied, null, 2));
  } catch (_) { /* best-effort */ }
  return { applied: n, version };
}

module.exports = { add, resolve, reopen, update, remove, getAll, stats, applySeed, ensureToken, getPublic, STATUSES, PRIORITIES };
