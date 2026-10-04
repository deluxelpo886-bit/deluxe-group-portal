'use strict';
/*
 * Netsonic integration (rental ERP).
 *
 * Pulls data from Netsonic on an interval and brings it into the portal:
 *   - On/off-hire events   -> hire status + yard list      (hire.setStatus)
 *   - Service-due report    -> service-due feed             (ops-db.upsertServiceDue)
 *   - Invoices              -> real income for the P&L      (staged; see applyInvoices)
 *   - Customers & sites     -> kept for reference           (staged)
 *
 * SAFETY / DESIGN (same pattern as positions.js / Traccar):
 *   - Credentials live ONLY in environment variables, never in the repo or the
 *     browser. If they are not set, the connector is simply DISABLED and the rest
 *     of the portal runs exactly as before.
 *   - Nothing is written into the portal's own stores until NETSONIC_APPLY=true.
 *     Until then it runs in VERIFY-ONLY mode: it fetches, counts and keeps a few
 *     sample rows so the office (and whoever finishes the field mapping) can
 *     confirm the data looks right at GET /api/netsonic/status BEFORE any auto
 *     update is switched on. This prevents a wrong field mapping from corrupting
 *     the live hire/service data.
 *
 * Environment variables:
 *   NETSONIC_URL            Base URL of the Netsonic API, e.g. https://api.netsonic.ae   (required to enable)
 *   NETSONIC_API_KEY        Bearer token / API key  (preferred)
 *   NETSONIC_USER           -- or -- username  (Basic auth, if Netsonic uses that)
 *   NETSONIC_PASSWORD       -- or -- password  (Basic auth)
 *   NETSONIC_POLL_MS        poll interval in ms (default 900000 = 15 min, min 60000)
 *   NETSONIC_APPLY          "true" to WRITE into the portal (default off = verify only)
 *   NETSONIC_HIRES_PATH     endpoint path for on/off-hire list   (default /api/hires)
 *   NETSONIC_INVOICES_PATH  endpoint path for invoices            (default /api/invoices)
 *   NETSONIC_SERVICEDUE_PATH endpoint path for service-due        (default /api/service-due)
 *   NETSONIC_CUSTOMERS_PATH endpoint path for customers           (default /api/customers)
 *
 * NOTE: the map*() adapter functions below convert Netsonic's response fields to
 * the portal's shape. The exact Netsonic field names are NOT yet confirmed, so
 * each adapter tries the most likely keys and is marked "ADJUST" - once Netsonic
 * API access + docs are in hand, confirm these against a real response (visible
 * at /api/netsonic/status) and tighten them before turning NETSONIC_APPLY on.
 */

const fs = require('fs');
const path = require('path');

const URL_BASE = (process.env.NETSONIC_URL || '').replace(/\/+$/, '');
const API_KEY = process.env.NETSONIC_API_KEY || '';
const USER = process.env.NETSONIC_USER || '';
const PASS = process.env.NETSONIC_PASSWORD || '';
const POLL_MS = Math.max(60000, parseInt(process.env.NETSONIC_POLL_MS || '900000', 10) || 900000);
const APPLY = String(process.env.NETSONIC_APPLY || '').toLowerCase() === 'true';

const PATHS = {
  hires: process.env.NETSONIC_HIRES_PATH || '/api/hires',
  invoices: process.env.NETSONIC_INVOICES_PATH || '/api/invoices',
  serviceDue: process.env.NETSONIC_SERVICEDUE_PATH || '/api/service-due',
  customers: process.env.NETSONIC_CUSTOMERS_PATH || '/api/customers',
};

const CACHE_DIR = path.dirname(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'deluxe.db'));
const CACHE_FILE = path.join(CACHE_DIR, 'netsonic.json');

let snapshot = {
  source: 'netsonic', configured: false, apply: APPLY, updatedAt: null,
  counts: { hires: 0, invoices: 0, serviceDue: 0, customers: 0 },
  samples: { hires: [], invoices: [], serviceDue: [], customers: [] },
  applied: { hires: 0, serviceDue: 0 },
  error: null,
};
try {
  if (fs.existsSync(CACHE_FILE)) {
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    if (raw && raw.source === 'netsonic') snapshot = Object.assign(snapshot, raw);
  }
} catch (_) { /* ignore a corrupt/missing cache */ }

function isConfigured() {
  return !!(URL_BASE && (API_KEY || (USER && PASS)));
}

function authHeaders() {
  if (API_KEY) return { Authorization: 'Bearer ' + API_KEY };
  if (USER && PASS) return { Authorization: 'Basic ' + Buffer.from(USER + ':' + PASS).toString('base64') };
  return {};
}

function persist() {
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    // Don't persist full payloads - only the compact snapshot (counts + samples).
    fs.writeFileSync(CACHE_FILE, JSON.stringify(snapshot));
  } catch (_) { /* best-effort */ }
}

// Generic authenticated GET. Returns parsed JSON (array or object). Tolerates the
// common "{ data: [...] }" / "{ items: [...] }" / "{ results: [...] }" wrappers.
async function api(pathname) {
  const r = await fetch(URL_BASE + pathname, {
    headers: Object.assign({ Accept: 'application/json' }, authHeaders()),
  });
  if (r.status === 401 || r.status === 403) throw new Error('unauthorized (check NETSONIC_API_KEY / USER / PASSWORD) for ' + pathname);
  if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + pathname);
  const j = await r.json();
  if (Array.isArray(j)) return j;
  if (j && Array.isArray(j.data)) return j.data;
  if (j && Array.isArray(j.items)) return j.items;
  if (j && Array.isArray(j.results)) return j.results;
  return j;
}

function dgNorm(v) {
  const s = String(v == null ? '' : v).toUpperCase().replace(/\s+/g, '');
  const m = s.match(/DG-?(\d{1,4})/);
  if (m) return 'DG-' + m[1];
  return s ? (s.indexOf('DG') === 0 ? s : 'DG-' + s.replace(/^DG-?/, '')) : '';
}
function pick(o, keys) { for (const k of keys) { if (o && o[k] != null && o[k] !== '') return o[k]; } return undefined; }

// ---- Field-mapping adapters (ADJUST to Netsonic's real response) -------------
// Each tries the most likely field names. Confirm against a real payload at
// /api/netsonic/status, then tighten before enabling NETSONIC_APPLY.
function mapHire(r) {
  const dg = dgNorm(pick(r, ['dg', 'dgNumber', 'equipment', 'equipmentNo', 'machine', 'assetCode', 'asset']));
  const statusTxt = String(pick(r, ['status', 'hireStatus', 'state']) || '').toLowerCase();
  const offHire = /off|return|closed|ended/.test(statusTxt)
    || pick(r, ['offHire', 'isOffHire']) === true;
  return {
    dg,
    offHire,
    since: pick(r, ['since', 'date', 'offHireDate', 'onHireDate', 'eventDate', 'updatedAt']) || null,
    customer: pick(r, ['customer', 'customerName', 'client', 'account']) || '',
    location: pick(r, ['location', 'site', 'address']) || '',
    contract: pick(r, ['contract', 'contractNo', 'reference', 'ref', 'orderNo']) || '',
    note: pick(r, ['note', 'remarks', 'notes']) || '',
  };
}
function mapInvoice(r) {
  return {
    dg: dgNorm(pick(r, ['dg', 'dgNumber', 'equipment', 'equipmentNo', 'asset'])),
    invoiceNo: pick(r, ['invoiceNo', 'invoiceNumber', 'number', 'docNo']) || '',
    customer: pick(r, ['customer', 'customerName', 'client']) || '',
    date: pick(r, ['date', 'invoiceDate', 'issueDate']) || null,
    amount: Number(pick(r, ['amount', 'total', 'netAmount', 'grandTotal', 'value'])) || 0,
    currency: pick(r, ['currency', 'ccy']) || 'AED',
  };
}
function mapServiceDue(r) {
  return {
    dg: dgNorm(pick(r, ['dg', 'dgNumber', 'equipment', 'equipmentNo', 'asset'])),
    daysRemaining: Number(pick(r, ['daysRemaining', 'days', 'dueInDays', 'remainingDays'])),
    company: pick(r, ['company', 'division']) || '',
  };
}
function mapCustomer(r) {
  return {
    name: pick(r, ['name', 'customerName', 'customer']) || '',
    code: pick(r, ['code', 'customerCode', 'id', 'accountNo']) || '',
    site: pick(r, ['site', 'location', 'address']) || '',
    phone: pick(r, ['phone', 'mobile', 'contact']) || '',
  };
}

// ---- Apply into the portal (only when NETSONIC_APPLY=true) -------------------
function applyHires(rows) {
  let n = 0;
  const hire = require('./hire');
  rows.forEach((h) => {
    if (!h.dg) return;
    try {
      hire.setStatus({
        dg: h.dg,
        offHire: !!h.offHire,
        since: (h.since && String(h.since).slice(0, 10)) || undefined,
        note: [h.customer, h.location, h.contract].filter(Boolean).join(' - ') || h.note || '',
      });
      n += 1;
    } catch (_) { /* skip a bad row, keep going */ }
  });
  return n;
}
function applyServiceDue(rows) {
  let n = 0;
  const opsDb = require('./ops-db');
  if (!opsDb || typeof opsDb.upsertServiceDue !== 'function') return 0;
  rows.forEach((s) => {
    if (!s.dg || !isFinite(s.daysRemaining)) return;
    try { opsDb.upsertServiceDue(s.dg, s.daysRemaining, s.company, 'netsonic'); n += 1; } catch (_) { /* skip */ }
  });
  return n;
}

async function refresh() {
  if (!isConfigured()) {
    snapshot = Object.assign({}, snapshot, {
      configured: false,
      error: 'not configured (set NETSONIC_URL and NETSONIC_API_KEY, or NETSONIC_USER/PASSWORD)',
    });
    return snapshot;
  }
  const next = {
    source: 'netsonic', configured: true, apply: APPLY, updatedAt: new Date().toISOString(),
    counts: { hires: 0, invoices: 0, serviceDue: 0, customers: 0 },
    samples: { hires: [], invoices: [], serviceDue: [], customers: [] },
    applied: { hires: 0, serviceDue: 0 },
    error: null,
  };
  const errs = [];
  async function pull(name, pathname, mapFn) {
    try {
      const raw = await api(pathname);
      const rows = (Array.isArray(raw) ? raw : []).map(mapFn);
      next.counts[name] = rows.length;
      next.samples[name] = rows.slice(0, 3);
      return rows;
    } catch (e) { errs.push(name + ': ' + ((e && e.message) || 'failed')); return []; }
  }
  const [hires, invoices, serviceDue, customers] = await Promise.all([
    pull('hires', PATHS.hires, mapHire),
    pull('invoices', PATHS.invoices, mapInvoice),
    pull('serviceDue', PATHS.serviceDue, mapServiceDue),
    pull('customers', PATHS.customers, mapCustomer),
  ]);

  if (APPLY) {
    try { next.applied.hires = applyHires(hires); } catch (e) { errs.push('applyHires: ' + e.message); }
    try { next.applied.serviceDue = applyServiceDue(serviceDue); } catch (e) { errs.push('applyServiceDue: ' + e.message); }
    // Invoices -> P&L income and customers -> directory are staged for now:
    // confirm the field mapping at /api/netsonic/status, then wire them in.
  }

  // Keep the latest full payloads in memory (not persisted) for the office to
  // inspect/verify before apply is enabled.
  lastPayloads = { hires, invoices, serviceDue, customers };
  next.error = errs.length ? errs.join(' | ') : null;
  snapshot = next;
  persist();
  return snapshot;
}

let lastPayloads = { hires: [], invoices: [], serviceDue: [], customers: [] };

let timer = null;
function startPolling() {
  if (!isConfigured()) {
    console.log('[netsonic] not configured - set NETSONIC_URL + NETSONIC_API_KEY (or USER/PASSWORD) to enable. '
      + '(The rest of the portal runs normally.)');
    snapshot.error = 'not configured';
    return;
  }
  console.log('[netsonic] enabled -> ' + URL_BASE + ' (polling every ' + Math.round(POLL_MS / 60000)
    + ' min; apply=' + APPLY + ')');
  refresh();
  timer = setInterval(refresh, POLL_MS);
  if (timer && timer.unref) timer.unref();
}

function getStatus() {
  return Object.assign({}, snapshot, { pollMs: POLL_MS, endpoints: PATHS });
}
// Full fetched rows for verification (office only). Not persisted to disk.
function getPayloads() { return lastPayloads; }
// Manual "sync now" trigger (office button / cron).
async function syncNow() { return refresh(); }

module.exports = {
  startPolling, refresh, syncNow, getStatus, getPayloads, isConfigured,
  // exported for unit-testing the adapters
  _map: { mapHire, mapInvoice, mapServiceDue, mapCustomer, dgNorm },
};
