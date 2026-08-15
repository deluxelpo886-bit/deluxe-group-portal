'use strict';
/*
 * Live vehicle positions from Total Secure (a Traccar GPS server).
 *
 * This module logs into the Traccar server using credentials kept ONLY in
 * environment variables (never in the repo or the browser), polls the fleet's
 * live positions on an interval, and keeps the latest snapshot in memory. The
 * snapshot is also mirrored to a small JSON file under data/ so that a restart
 * doesn't blank the map. The web server exposes the snapshot at /api/positions;
 * the /fleet page reads that. The Total Secure password never reaches the
 * browser, so the /fleet link is safe to share.
 *
 * Environment variables:
 *   TRACCAR_URL       e.g. https://tracking.totalsecureme.com   (required to enable)
 *   TRACCAR_USER      Total Secure / Traccar username (or email)
 *   TRACCAR_PASSWORD  Total Secure / Traccar password
 *   TRACCAR_POLL_MS   poll interval in ms (default 30000, minimum 10000)
 *
 * If TRACCAR_* are not set, live tracking is simply disabled (the rest of the
 * portal is unaffected and /api/positions reports "not configured").
 */

const fs = require('fs');
const path = require('path');

const URL_BASE = (process.env.TRACCAR_URL || '').replace(/\/+$/, '');
const USER = process.env.TRACCAR_USER || '';
const PASS = process.env.TRACCAR_PASSWORD || '';
const POLL_MS = Math.max(10000, parseInt(process.env.TRACCAR_POLL_MS || '30000', 10) || 30000);

const CACHE_DIR = path.join(__dirname, '..', 'data');
const CACHE_FILE = path.join(CACHE_DIR, 'positions.json');

let cookie = null;
let snapshot = { vehicles: [], updatedAt: null, source: 'totalsecure', error: null };

// Best-effort: load the last snapshot from disk on boot so the map isn't blank
// during the first poll (or if Total Secure is briefly unreachable at startup).
try {
  if (fs.existsSync(CACHE_FILE)) {
    const saved = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    if (saved && Array.isArray(saved.vehicles)) {
      snapshot = Object.assign(snapshot, saved, { error: null });
    }
  }
} catch (_) { /* ignore a corrupt/missing cache */ }

function isConfigured() {
  return !!(URL_BASE && USER && PASS);
}

function persist() {
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(snapshot));
  } catch (_) { /* cache is best-effort only */ }
}

// Log into Traccar and keep the session cookie. Traccar's login endpoint takes
// form-encoded email + password and returns a JSESSIONID cookie.
async function login() {
  const body = new URLSearchParams({ email: USER, password: PASS }).toString();
  const r = await fetch(URL_BASE + '/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  });
  if (!r.ok) {
    throw new Error('login failed (HTTP ' + r.status + ') - check TRACCAR_USER/PASSWORD');
  }
  const setCookie = r.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0]; // keep just "JSESSIONID=..."
  if (!cookie) throw new Error('login succeeded but no session cookie was returned');
  return cookie;
}

async function api(pathname) {
  const r = await fetch(URL_BASE + pathname, {
    headers: Object.assign({ Accept: 'application/json' }, cookie ? { Cookie: cookie } : {}),
  });
  if (r.status === 401 || r.status === 403) { cookie = null; throw new Error('unauthorized'); }
  if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + pathname);
  return r.json();
}

async function refresh() {
  if (!isConfigured()) {
    snapshot = {
      vehicles: [],
      updatedAt: null,
      source: 'totalsecure',
      error: 'not configured (set TRACCAR_URL, TRACCAR_USER, TRACCAR_PASSWORD)',
    };
    return;
  }
  try {
    if (!cookie) await login();

    let devices;
    let livePositions;
    try {
      [devices, livePositions] = await Promise.all([api('/api/devices'), api('/api/positions')]);
    } catch (e) {
      // Session likely expired - log in once more and retry.
      if (String(e.message).includes('unauthorized')) {
        await login();
        [devices, livePositions] = await Promise.all([api('/api/devices'), api('/api/positions')]);
      } else {
        throw e;
      }
    }

    const nameById = {};
    const statusById = {};
    (devices || []).forEach((d) => { nameById[d.id] = d.name; statusById[d.id] = d.status; });

    const vehicles = (livePositions || [])
      .map((p) => ({
        id: p.deviceId,
        name: nameById[p.deviceId] || ('Device ' + p.deviceId),
        lat: p.latitude,
        lon: p.longitude,
        speed: p.speed,           // knots (Traccar default) - the page converts to km/h
        course: p.course,         // heading in degrees
        lastUpdate: p.deviceTime || p.fixTime || p.serverTime || null,
        status: statusById[p.deviceId] || null,
      }))
      .filter((v) => typeof v.lat === 'number' && typeof v.lon === 'number');

    snapshot = { vehicles, updatedAt: new Date().toISOString(), source: 'totalsecure', error: null };
    persist();
  } catch (e) {
    // Keep the last good vehicles on screen; just surface the error for the badge.
    snapshot = Object.assign({}, snapshot, { error: (e && e.message) || 'fetch failed' });
    console.error('[positions] refresh failed:', snapshot.error);
  }
}

let timer = null;
function startPolling() {
  if (!isConfigured()) {
    console.log('[positions] Total Secure not configured - set TRACCAR_URL / TRACCAR_USER / '
      + 'TRACCAR_PASSWORD to enable live tracking. (The rest of the portal runs normally.)');
    snapshot.error = 'not configured';
    return;
  }
  console.log('[positions] Live tracking enabled -> ' + URL_BASE
    + ' (polling every ' + Math.round(POLL_MS / 1000) + 's)');
  refresh();
  timer = setInterval(refresh, POLL_MS);
  if (timer && timer.unref) timer.unref();
}

function getSnapshot() {
  return snapshot;
}

module.exports = { startPolling, getSnapshot, isConfigured };
