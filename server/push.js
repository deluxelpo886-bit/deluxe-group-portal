'use strict';
/*
 * Web push for the technician app.
 *
 * Sends a real push notification to a technician's phone - even when the app is
 * closed - when the office dispatches a job. Uses VAPID; the keypair is taken
 * from the environment, else loaded from the persistent disk, else generated
 * once and saved there (so nothing secret lives in the repo and the office
 * never has to configure anything). Subscriptions are stored per technician.
 */

const fs = require('fs');
const path = require('path');

let webpush = null;
try { webpush = require('web-push'); } catch (_) { webpush = null; }

const DIR = path.dirname(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'deluxe.db'));
const KEYS_FILE = path.join(DIR, 'vapid-keys.json');
const SUBS_FILE = path.join(DIR, 'push-subs.json');

function ensureDir() { try { if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true }); } catch (_) { /* noop */ } }

// ---- VAPID keys ----
let keys = null;
function loadKeys() {
  if (keys) return keys;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    keys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
    return keys;
  }
  try { if (fs.existsSync(KEYS_FILE)) { keys = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8')); if (keys && keys.publicKey) return keys; } } catch (_) { keys = null; }
  if (webpush) {
    try {
      keys = webpush.generateVAPIDKeys();
      ensureDir();
      fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));
    } catch (_) { keys = null; }
  }
  return keys;
}

let configured = false;
function configure() {
  if (configured || !webpush) return configured;
  const k = loadKeys();
  if (!k || !k.publicKey || !k.privateKey) return false;
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:ops@deluxe.ae', k.publicKey, k.privateKey);
    configured = true;
  } catch (_) { configured = false; }
  return configured;
}

function publicKey() { const k = loadKeys(); return (k && k.publicKey) || ''; }
function isReady() { return !!webpush && configure(); }

// ---- Subscriptions (per technician id) ----
let subs = {};
try { if (fs.existsSync(SUBS_FILE)) subs = JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8')) || {}; } catch (_) { subs = {}; }
function persistSubs() { try { ensureDir(); fs.writeFileSync(SUBS_FILE, JSON.stringify(subs, null, 2)); } catch (_) { /* noop */ } }

function endpointOf(s) { return (s && s.endpoint) || ''; }

function subscribe(techId, subscription) {
  const id = String(techId || '').toLowerCase();
  if (!id || !subscription || !subscription.endpoint) return false;
  if (!Array.isArray(subs[id])) subs[id] = [];
  // de-dupe by endpoint
  subs[id] = subs[id].filter((s) => endpointOf(s) !== subscription.endpoint);
  subs[id].push(subscription);
  persistSubs();
  return true;
}

function unsubscribe(techId, endpoint) {
  const id = String(techId || '').toLowerCase();
  if (!subs[id]) return;
  subs[id] = subs[id].filter((s) => endpointOf(s) !== endpoint);
  persistSubs();
}

// Send a notification payload to every device a technician has registered.
// Prunes dead subscriptions (410/404). Best-effort and never throws.
async function sendToTech(techId, payload) {
  if (!isReady()) return { sent: 0, skipped: 'not-configured' };
  const id = String(techId || '').toLowerCase();
  const list = subs[id] || [];
  if (!list.length) return { sent: 0 };
  const body = JSON.stringify(payload || {});
  let sent = 0; const dead = [];
  await Promise.all(list.map(async (s) => {
    try { await webpush.sendNotification(s, body); sent += 1; }
    catch (e) { if (e && (e.statusCode === 410 || e.statusCode === 404)) dead.push(endpointOf(s)); }
  }));
  if (dead.length) { subs[id] = list.filter((s) => dead.indexOf(endpointOf(s)) === -1); persistSubs(); }
  return { sent };
}

module.exports = { isReady, publicKey, subscribe, unsubscribe, sendToTech };
