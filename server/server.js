require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const { findUser, updateUserPassword, listUsers, createUser, deleteUser, countAdmins, getState, saveState, logActivity, getActivity, recordAlertSent, getAlertStatus } = require('./db');
const { extractFields } = require('./extract');
const { sendWhatsApp } = require('./whatsapp');
const { sendEmail } = require('./email');
const { computeAlerts, buildMessage, buildHtml } = require('./alerts');
const createOpsRouter = require('./ops');
const positions = require('./positions');
const serviceLog = require('./service');
const schedule = require('./schedule');
const spares = require('./spares');
const sites = require('./sites');
const hire = require('./hire');
const serviceAlert = require('./service-alert');
const breakdowns = require('./breakdowns');
const rentals = require('./rentals');
const delivery = require('./delivery');

const fs = require('fs');
// Uploaded PDFs are stored on the persistent disk next to the database, keyed
// by a random id that the LPO/invoice record references.
const DATA_DIR = path.dirname(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'deluxe.db'));
const ATTACH_DIR = path.join(DATA_DIR, 'attachments');
try { fs.mkdirSync(ATTACH_DIR, { recursive: true }); } catch (e) { /* created on first write */ }

// --- Storage durability check ------------------------------------------------
// Everything the office enters (service logs, on/off-hire, delivery notes,
// rentals, spares, schedule, sites, uploaded files and the SQLite DB) is written
// under DATA_DIR. On Render a web service's ordinary filesystem is EPHEMERAL: it
// is wiped on every deploy and every restart. Data only survives if DATA_DIR
// points at a mounted persistent disk - which is exactly what setting DB_PATH to
// a path on that disk does. If DB_PATH is unset we are almost certainly writing
// to ephemeral storage, which is the usual cause of "my data disappeared after a
// deploy", so warn loudly and expose the status on /api/health so it can be
// verified after the disk is added. See STORAGE.md.
const STORAGE_PERSISTENT = !!process.env.DB_PATH;
if (!STORAGE_PERSISTENT) {
  console.warn('*****************************************************************');
  console.warn('[STORAGE] DB_PATH is NOT set - data is being written to a folder');
  console.warn('[STORAGE] inside the app (' + DATA_DIR + ').');
  console.warn('[STORAGE] On Render that folder is EPHEMERAL and is WIPED on every');
  console.warn('[STORAGE] deploy and restart, so everything entered in the portal');
  console.warn('[STORAGE] will be LOST. Add a persistent disk and set DB_PATH to a');
  console.warn('[STORAGE] path on it. Steps: see STORAGE.md.');
  console.warn('*****************************************************************');
} else {
  console.log('[STORAGE] Persistent storage enabled (DB_PATH set): ' + DATA_DIR);
}

// One-time import of the full fleet's service data from the final asset list.
// Guarded by a marker file per version, so it's safe to leave wired in across
// deploys/restarts; a new version cleanly rebuilds the seeded generators.
try {
  const seedPath = path.join(__dirname, 'seed', 'fleet-service.json');
  if (fs.existsSync(seedPath)) {
    const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
    const r = serviceLog.applySeed(seed, 'fleet-asset-list-2026-08-26a');
    if (r && r.applied) console.log('[seed] imported ' + r.applied + ' generator service records');
  }
} catch (e) { console.warn('[seed] service import skipped:', e && e.message); }

// One-time import of on-hire/off-hire status from the final asset list:
// everything not "ON HIRE" (in the workshop/yard/repair) starts off-hire so its
// service is paused. Runs once per version.
try {
  const hireSeedPath = path.join(__dirname, 'seed', 'fleet-hire.json');
  if (fs.existsSync(hireSeedPath)) {
    const hs = JSON.parse(fs.readFileSync(hireSeedPath, 'utf8'));
    const r = hire.applySeed(hs, 'fleet-hire-2026-08-25c');
    if (r && r.applied) console.log('[seed] set ' + r.applied + ' generators off-hire');
  }
} catch (e) { console.warn('[seed] hire import skipped:', e && e.message); }

// One-time import of rental contracts (monthly rate + customer per generator)
// from the fleet's rate data, so the income tracker and dashboard show the real
// monthly income instead of zero. On/off-hire status still decides earning vs
// idle at read time. Runs once per version.
try {
  const rentalSeedPath = path.join(__dirname, 'seed', 'fleet-rentals.json');
  if (fs.existsSync(rentalSeedPath)) {
    const rs = JSON.parse(fs.readFileSync(rentalSeedPath, 'utf8'));
    const r = rentals.applySeed(rs, 'fleet-rentals-2026-08-25a');
    if (r && r.applied) console.log('[seed] imported ' + r.applied + ' rental contracts');
  }
} catch (e) { console.warn('[seed] rentals import skipped:', e && e.message); }

const app = express();
const PORT = process.env.PORT || 3000;
// JWT signing secret. It MUST come from the environment - the old hardcoded
// fallback was public in the repo, so anyone could forge admin tokens. If it's
// missing (or still the placeholder), generate a strong random secret at
// startup and warn loudly. That closes the forgery hole; the trade-off is that
// tokens don't survive a restart until a stable JWT_SECRET is set in the env.
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'CHANGE_THIS_SECRET_BEFORE_DEPLOYING') {
  JWT_SECRET = crypto.randomBytes(48).toString('hex');
  console.warn('[SECURITY] JWT_SECRET is not set (or is the placeholder). Generated a random secret for this run. ' +
    'Set a strong JWT_SECRET environment variable so login sessions survive restarts and cannot be forged.');
}
const VALID_COMPANIES = ['energy', 'heavy'];

// Render (and most PaaS hosts) terminate TLS at a proxy and forward the real
// client IP in X-Forwarded-For. Trust the first proxy hop so req.ip reflects
// the actual visitor - required for the login rate limiter below to work per
// user instead of lumping everyone under the proxy's IP.
app.set('trust proxy', 1);

// Security headers via Helmet (HSTS, X-Content-Type-Options, frameguard, etc).
// Content-Security-Policy. The single inline <script> in index.html is allowed
// by its SHA-256 hash (INLINE_SCRIPT_HASH) rather than 'unsafe-inline', so the
// policy still blocks any injected script. A static hash (not a per-request
// nonce) is used deliberately: the service worker caches the HTML, and a hash
// stays valid across cached loads. Inline style= attributes remain allowed via
// style-src 'unsafe-inline' (low XSS risk, and there are ~100 of them).
// NOTE: if the inline <script> in public/index.html changes, recompute this
// hash (npm run csp-hash) or the page's own script will be blocked.
const INLINE_SCRIPT_HASH = "'sha256-BsFdV3Yzo2LfjIfAeLwy6x54vwvZ1d48RXYqV9ITrH4='";
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      scriptSrc: ["'self'", INLINE_SCRIPT_HASH, 'https://cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", 'https://api.emailjs.com'],
      workerSrc: ["'self'"],
      manifestSrc: ["'self'"],
      frameAncestors: ["'none'"]
    }
  }
}));

// CORS: only allow the deployed frontend origin (and localhost for dev).
// Configurable via ALLOWED_ORIGINS (comma-separated). Requests with no Origin
// header - same-origin browser calls, curl, health checks - are allowed.
const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS ||
  'https://deluxe-group-portal.onrender.com,http://localhost:3000'
).split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors({
  origin(origin, cb) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  }
}));

app.use(express.json({ limit: '5mb' })); // company state blobs can be a few hundred KB with lots of records

// Throttle login attempts to slow brute-force / credential-stuffing: at most
// 10 attempts per IP per 15-minute window. Applied only to /api/login below.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in a few minutes.' }
});

// ---------- Auth middleware ----------
function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing auth token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Admin gate - checks the live is_admin flag from the DB (not the token).
function adminRequired(req, res, next) {
  const u = findUser(req.user.username);
  if (!u || !u.is_admin) return res.status(403).json({ error: 'Admin access required' });
  next();
}

function validCompany(req, res, next) {
  const company = req.params.company;
  if (!VALID_COMPANIES.includes(company)) {
    return res.status(400).json({ error: 'Unknown company workspace: ' + company });
  }
  next();
}

// ---------- Auth routes ----------
app.post('/api/login', loginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const user = findUser(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, username, isAdmin: !!user.is_admin });
});

app.post('/api/change-password', authRequired, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both current and new password required' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
  const user = findUser(req.user.username);
  if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  updateUserPassword(req.user.username, newPassword);
  res.json({ ok: true });
});

// ---------- Current user ----------
app.get('/api/me', authRequired, (req, res) => {
  const u = findUser(req.user.username);
  if (!u) return res.status(401).json({ error: 'Unknown user' });
  res.json({ username: u.username, isAdmin: !!u.is_admin });
});

// ---------- User management (admin only) ----------
app.get('/api/users', authRequired, adminRequired, (req, res) => {
  res.json(listUsers().map((u) => ({ username: u.username, isAdmin: !!u.is_admin, created_at: u.created_at })));
});

app.post('/api/users', authRequired, adminRequired, (req, res) => {
  const { username, password, isAdmin } = req.body || {};
  const uname = (username || '').trim();
  if (!uname || !password) return res.status(400).json({ error: 'Username and password are required' });
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(uname)) return res.status(400).json({ error: 'Username must be 3-32 characters: letters, numbers, . _ -' });
  if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (findUser(uname)) return res.status(409).json({ error: 'That username already exists' });
  createUser(uname, password, !!isAdmin);
  res.json({ ok: true });
});

// Admin resets another user's password.
app.post('/api/users/:username/password', authRequired, adminRequired, (req, res) => {
  const target = req.params.username;
  const { newPassword } = req.body || {};
  if (!findUser(target)) return res.status(404).json({ error: 'User not found' });
  if (!newPassword || String(newPassword).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  updateUserPassword(target, newPassword);
  res.json({ ok: true });
});

app.delete('/api/users/:username', authRequired, adminRequired, (req, res) => {
  const target = req.params.username;
  const u = findUser(target);
  if (!u) return res.status(404).json({ error: 'User not found' });
  if (target === req.user.username) return res.status(400).json({ error: "You can't delete your own account" });
  if (u.is_admin && countAdmins() <= 1) return res.status(400).json({ error: "Can't delete the last remaining admin" });
  deleteUser(target);
  res.json({ ok: true });
});

// ---------- Company state routes ----------
// GET the full state blob for a company workspace
app.get('/api/state/:company', authRequired, validCompany, (req, res) => {
  const state = getState(req.params.company);
  if (!state) return res.json({ data: null, updated_at: null });
  res.json(state);
});

// PUT (replace) the full state blob for a company workspace.
// Optimistic concurrency: the client sends the `rev` it last loaded. If the
// stored rev has moved on (another device saved), respond 409 with the latest
// state so the client can re-sync instead of silently overwriting it.
app.put('/api/state/:company', authRequired, validCompany, (req, res) => {
  const { data, rev } = req.body || {};
  if (!data || typeof data !== 'object') return res.status(400).json({ error: 'Missing data payload' });
  const result = saveState(req.params.company, data, req.user.username, rev);
  if (result.conflict) {
    const current = getState(req.params.company);
    return res.status(409).json({
      error: 'conflict',
      message: 'This workspace was updated on another device since you loaded it.',
      rev: current.rev,
      updated_at: current.updated_at,
      updated_by: current.updated_by,
      data: current.data
    });
  }
  res.json({ ok: true, updated_at: result.updated_at, rev: result.rev });
});

// Lightweight activity log (who saved what, when) - useful once more than one person has access
app.get('/api/activity/:company', authRequired, validCompany, (req, res) => {
  res.json(getActivity(req.params.company, 50));
});
app.post('/api/activity/:company', authRequired, validCompany, (req, res) => {
  const { action } = req.body || {};
  logActivity(req.params.company, req.user.username, action || 'update');
  res.json({ ok: true });
});

// ---------- PDF extraction ----------
// Accepts a raw PDF (Content-Type: application/pdf), extracts LPO/invoice fields
// via the Anthropic API, and returns them for the frontend to pre-fill (never
// auto-saves). Always responds 200 with a `fields` object; on any failure the
// object is empty so the user can fill the form manually.
app.post('/api/extract/:type', authRequired, express.raw({ type: 'application/pdf', limit: '20mb' }), async (req, res) => {
  const type = req.params.type;
  if (type !== 'lpo' && type !== 'invoice') {
    return res.status(400).json({ ok: false, fields: {}, error: 'Unknown extract type: ' + type });
  }
  if (!req.body || !req.body.length) {
    return res.status(400).json({ ok: false, fields: {}, message: 'No PDF received' });
  }
  // Persist the uploaded PDF so it stays attached to the record. Keyed by a
  // random 32-hex id; failure to store must not block extraction.
  let attId = null;
  try {
    attId = crypto.randomBytes(16).toString('hex');
    fs.writeFileSync(path.join(ATTACH_DIR, attId + '.pdf'), req.body);
  } catch (e) {
    console.error('Attachment store failed:', e && e.message);
    attId = null;
  }
  try {
    const result = await extractFields(type, req.body);
    res.json(Object.assign({ attId: attId }, result));
  } catch (e) {
    console.error('PDF extraction failed:', e && e.message);
    res.json({ ok: false, fields: {}, attId: attId, message: 'Extraction failed - please enter the details manually' });
  }
});

// ---------- Serve a stored PDF attachment ----------
// Streams a previously-uploaded PDF inline. The id is validated to a strict
// 32-hex pattern so it can't escape the attachments directory.
app.get('/api/attachment/:id', authRequired, (req, res) => {
  const id = req.params.id;
  if (!/^[a-f0-9]{32}$/.test(id)) return res.status(400).json({ ok: false, message: 'Invalid attachment id' });
  const file = path.join(ATTACH_DIR, id + '.pdf');
  if (!fs.existsSync(file)) return res.status(404).json({ ok: false, message: 'Attachment not found' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="' + id + '.pdf"');
  fs.createReadStream(file).pipe(res);
});

// ---------- Automated WhatsApp send (Twilio) ----------
// Sends a WhatsApp message via Twilio. Responds 200 in all non-fatal cases so
// the frontend can fall back to a wa.me link: { ok:false, configured:false }
// when Twilio isn't set up, or { ok:false, message } on a send error.
app.post('/api/send-wa', authRequired, async (req, res) => {
  const { to, body, contentSid, contentVariables } = req.body || {};
  if (!to) return res.status(400).json({ ok: false, message: 'Recipient number is required' });
  if (!body && !contentSid) return res.status(400).json({ ok: false, message: 'Message body or template is required' });
  try {
    const result = await sendWhatsApp({ to, body, contentSid, contentVariables });
    res.json(result);
  } catch (e) {
    console.error('WhatsApp send failed:', e && e.message);
    res.json({ ok: false, message: (e && e.message) || 'WhatsApp send failed' });
  }
});

// ---------- Automated alerts (email + WhatsApp) ----------
const COMPANY_NAMES = {
  energy: 'Deluxe Energy Solutions L.L.C',
  heavy: 'Deluxe Heavy Equipment Rental L.L.C'
};

// Compute a company's alerts from stored state and send them by email and/or
// WhatsApp. Each channel degrades independently. With opts.force=false the send
// is skipped entirely when there are no alerts (used by the daily scheduler so
// it doesn't send an "all clear" every day).
async function runCompanyAlerts(company, opts) {
  const force = !!(opts && opts.force);
  const row = getState(company);
  const state = (row && row.data) ? row.data : {};
  const result = computeAlerts(state);
  const companyName = COMPANY_NAMES[company] || company;
  const out = { company: company, count: result.count, sent: false, email: null, whatsapp: null };

  if (!force && result.count === 0) {
    out.email = { ok: false, skipped: true, message: 'No alerts' };
    out.whatsapp = { ok: false, skipped: true, message: 'No alerts' };
    return out;
  }
  out.sent = true;

  const message = buildMessage(companyName, result);
  const subject = companyName + ' - ' + result.count + ' alert(s) need attention';

  const to = (state.email && state.email.to) || process.env.ALERT_EMAIL_TO;
  if (to) {
    try { out.email = await sendEmail({ to: to, subject: subject, text: message, html: buildHtml(companyName, result) }); }
    catch (e) { out.email = { ok: false, message: (e && e.message) || 'email failed' }; }
  } else {
    out.email = { ok: false, message: 'No recipient email configured' };
  }

  const waNum = state.settings && state.settings.wa;
  if (waNum) {
    try { out.whatsapp = await sendWhatsApp({ to: waNum, body: message }); }
    catch (e) { out.whatsapp = { ok: false, message: (e && e.message) || 'whatsapp failed' }; }
  } else {
    out.whatsapp = { ok: false, message: 'No WhatsApp number configured' };
  }
  if (out.sent) {
    try { recordAlertSent(company, out.count, channelStatus(out.email), channelStatus(out.whatsapp)); } catch (e) { /* non-fatal */ }
  }
  return out;
}

// Short channel status label for the dashboard "last alert sent" indicator.
function channelStatus(ch) {
  if (!ch) return 'n/a';
  if (ch.ok) return 'sent';
  if (ch.configured === false) return 'not configured';
  if (ch.skipped) return 'skipped';
  if (ch.message && /no recipient|no whatsapp/i.test(ch.message)) return 'no recipient';
  return 'failed';
}

// Last alert-send status for the dashboard indicator.
app.get('/api/alert-status/:company', authRequired, validCompany, (req, res) => {
  res.json(getAlertStatus(req.params.company) || {});
});

// Manual trigger: compute and send this company's alerts now (always sends).
app.post('/api/send-alerts/:company', authRequired, validCompany, async (req, res) => {
  try {
    const out = await runCompanyAlerts(req.params.company, { force: true });
    res.json(Object.assign({ ok: true }, out));
  } catch (e) {
    console.error('Alert send failed:', e && e.message);
    res.json({ ok: false, message: (e && e.message) || 'Alert send failed' });
  }
});

// ---------- Deluxe Ops (generator operations tracking) ----------
// Role-based app (admin / ops head / technician) mounted under /api/ops. It
// shares this server's JWT auth and SQLite database. See server/ops.js and OPS.md.
app.use('/api/ops', createOpsRouter({ authRequired }));

// ---------- Health check ----------
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString(), storagePersistent: STORAGE_PERSISTENT }));

// ---------- Live fleet: login + vehicle positions (Total Secure / Traccar) ----
// The /fleet map link is protected by a dedicated "Deluxe Operations" login.
// The Total Secure login itself lives only in env vars (see FLEET.md), is polled
// server-side by server/positions.js, and never reaches the browser. The live
// coordinates are served only to a signed-in user, so vehicle locations aren't
// public.
//
// The fleet login is overridable via env; the defaults match what was requested
// so the link works out of the box. Set FLEET_LOGIN_PASSWORD in the environment
// to change it for real use.
const FLEET_EMAIL = (process.env.FLEET_LOGIN_EMAIL || 'deluxeoperationhead').trim().toLowerCase();
const FLEET_PASSWORD = process.env.FLEET_LOGIN_PASSWORD || 'Deluxe123';
const FLEET_SECRET = process.env.JWT_SECRET || 'deluxe-fleet-dev-secret-change-me';

app.post('/api/fleet/login', loginLimiter, (req, res) => {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  const password = String((req.body && req.body.password) || '');
  if (email === FLEET_EMAIL && password === FLEET_PASSWORD) {
    const token = jwt.sign({ sub: 'fleet', role: 'fleet' }, FLEET_SECRET, { expiresIn: '30d' });
    return res.json({ token });
  }
  return res.status(401).json({ error: 'Wrong email or password' });
});

// Require a valid fleet login token (sent as "Authorization: Bearer <token>").
function fleetProtect(req, res, next) {
  const auth = req.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : (req.query.token || '');
  try {
    jwt.verify(token, FLEET_SECRET);
    return next();
  } catch (_) {
    return res.status(401).json({ error: 'login required' });
  }
}

app.get('/api/positions', fleetProtect, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(positions.getSnapshot());
});

// ---------- Map tile proxy (same-origin tiles for the fleet map) ----------
// Some mobile networks block third-party tile CDNs (OpenStreetMap etc.), which
// leaves the fleet map with a blank grey background. Relaying tiles through our
// own origin - which the client can always reach - keeps the map reliable, and
// same-origin tiles get cached by the browser and service worker for next time.
// Tiles are cached in memory to stay light on the upstream provider.
const tileCache = new Map(); // "z/x/y" -> { buf, type, ts }
const TILE_TTL = 7 * 24 * 3600 * 1000; // 7 days
const TILE_CACHE_MAX = 3000;
app.get('/tiles/:z/:x/:y.png', async (req, res) => {
  const { z, x, y } = req.params;
  if (!/^\d{1,2}$/.test(z) || !/^\d{1,7}$/.test(x) || !/^\d{1,7}$/.test(y)) {
    return res.status(400).end();
  }
  const key = z + '/' + x + '/' + y;
  const hit = tileCache.get(key);
  if (hit && (Date.now() - hit.ts) < TILE_TTL) {
    res.set('Content-Type', hit.type);
    res.set('Cache-Control', 'public, max-age=604800');
    return res.end(hit.buf);
  }
  try {
    const sub = ['a', 'b', 'c'][(Number(x) + Number(y)) % 3];
    const url = 'https://' + sub + '.tile.openstreetmap.org/' + z + '/' + x + '/' + y + '.png';
    const r = await fetch(url, { headers: { 'User-Agent': 'DeluxeFleet/1.0 (deluxe-group-portal)' } });
    if (!r.ok) return res.status(502).end();
    const buf = Buffer.from(await r.arrayBuffer());
    const type = r.headers.get('content-type') || 'image/png';
    if (tileCache.size > TILE_CACHE_MAX) tileCache.clear();
    tileCache.set(key, { buf, type, ts: Date.now() });
    res.set('Content-Type', type);
    res.set('Cache-Control', 'public, max-age=604800');
    return res.end(buf);
  } catch (e) {
    return res.status(502).end();
  }
});

// Satellite (aerial) tiles - Esri World Imagery - proxied the same way so the
// map can offer a Google-Maps-style satellite view on the restricted network.
// Note Esri's tile order is z/y/x.
const satCache = new Map();
app.get('/sat/:z/:x/:y.png', async (req, res) => {
  const { z, x, y } = req.params;
  if (!/^\d{1,2}$/.test(z) || !/^\d{1,7}$/.test(x) || !/^\d{1,7}$/.test(y)) {
    return res.status(400).end();
  }
  const key = z + '/' + x + '/' + y;
  const hit = satCache.get(key);
  if (hit && (Date.now() - hit.ts) < TILE_TTL) {
    res.set('Content-Type', hit.type);
    res.set('Cache-Control', 'public, max-age=604800');
    return res.end(hit.buf);
  }
  try {
    const url = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/'
      + z + '/' + y + '/' + x;
    const r = await fetch(url, { headers: { 'User-Agent': 'DeluxeFleet/1.0 (deluxe-group-portal)' } });
    if (!r.ok) return res.status(502).end();
    const buf = Buffer.from(await r.arrayBuffer());
    const type = r.headers.get('content-type') || 'image/jpeg';
    if (satCache.size > TILE_CACHE_MAX) satCache.clear();
    satCache.set(key, { buf, type, ts: Date.now() });
    res.set('Content-Type', type);
    res.set('Cache-Control', 'public, max-age=604800');
    return res.end(buf);
  } catch (e) {
    return res.status(502).end();
  }
});

// Driving-route proxy for the breakdown dispatch. The public OSRM routing
// server is often blocked on the office network (same reason we proxy tiles),
// so we route server-side and return the road geometry + distance/time. If OSRM
// is unreachable we fall back to a straight line so the map still shows a route.
app.get('/api/route', async (req, res) => {
  const q = req.query || {};
  const fLat = Number(q.fromLat), fLon = Number(q.fromLon), tLat = Number(q.toLat), tLon = Number(q.toLon);
  if (![fLat, fLon, tLat, tLon].every(Number.isFinite)) {
    return res.status(400).json({ error: 'fromLat, fromLon, toLat, toLon are required' });
  }
  res.set('Cache-Control', 'no-store');
  // Straight-line fallback (haversine distance, ~40 km/h for a rough ETA).
  const R = 6371000, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(tLat - fLat), dLon = toRad(tLon - fLon);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(fLat)) * Math.cos(toRad(tLat)) * Math.sin(dLon / 2) ** 2;
  const straight = 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  const fallback = {
    ok: true, approx: true, distance: Math.round(straight), duration: Math.round(straight / 11.1),
    geometry: { type: 'LineString', coordinates: [[fLon, fLat], [tLon, tLat]] },
  };
  try {
    const url = 'https://router.project-osrm.org/route/v1/driving/'
      + fLon + ',' + fLat + ';' + tLon + ',' + tLat + '?overview=full&geometries=geojson';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'DeluxeFleet/1.0' } });
    clearTimeout(timer);
    const data = await r.json();
    if (data && data.code === 'Ok' && data.routes && data.routes[0]) {
      const rt = data.routes[0];
      return res.json({ ok: true, approx: false, distance: Math.round(rt.distance), duration: Math.round(rt.duration), geometry: rt.geometry });
    }
    return res.json(fallback);
  } catch (e) {
    return res.json(fallback);
  }
});

// Location lookup (geocoding) for customer sites. Typing a company/site name
// searches OpenStreetMap (Nominatim), scoped to the UAE, and returns matching
// places with coordinates and address - so the office can locate a new site by
// name instead of hunting for a pin. Proxied server-side (the office network
// blocks external hosts) with a day-long cache to respect Nominatim's fair-use.
const geoCache = new Map();
app.get('/api/geosearch', fleetProtect, async (req, res) => {
  const q = String((req.query && req.query.q) || '').trim();
  res.set('Cache-Control', 'no-store');
  if (q.length < 2) return res.json({ results: [] });
  const key = q.toLowerCase();
  const hit = geoCache.get(key);
  if (hit && (Date.now() - hit.ts) < 24 * 3600 * 1000) return res.json({ results: hit.results });
  // A rough dust/harshness hint from the place description - only a suggestion.
  const dustHint = (text) => {
    const t = String(text || '').toLowerCase();
    if (/(quarry|mine|industrial|factory|cement|crusher|desert|sand|port|dockyard|icad|mussafah|musaffah|construction|labour camp|labor camp)/.test(t)) return 'High';
    if (/(farm|agri|depot|warehouse|yard|workshop|road|highway|outskirt)/.test(t)) return 'Medium';
    if (/(city|downtown|residential|tower|mall|villa|street|building|hotel|office)/.test(t)) return 'Low';
    return '';
  };
  try {
    const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=ae&q='
      + encodeURIComponent(q);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'DeluxeFleet/1.0 (deluxe-group-portal; site geocoding)' } });
    clearTimeout(timer);
    const data = await r.json();
    const results = (Array.isArray(data) ? data : []).map((d) => ({
      name: d.name || String(d.display_name || '').split(',')[0],
      address: d.display_name || '',
      lat: Number(d.lat),
      lon: Number(d.lon),
      kind: d.type || d.category || '',
      dustHint: dustHint((d.display_name || '') + ' ' + (d.type || '') + ' ' + (d.category || '')),
    })).filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lon));
    geoCache.set(key, { results, ts: Date.now() });
    res.json({ results });
  } catch (e) {
    res.json({ results: [], error: 'lookup-unavailable' });
  }
});

// ---------- Generator service log (hours-based servicing) ----------
// Technicians submit a generator's current running hours; the server computes
// the next service due (hours + interval, default 350) and stores it. Reuses the
// same fleet login as /fleet. See server/service.js.
app.post('/api/service/log', fleetProtect, (req, res) => {
  try {
    const entry = serviceLog.logService(req.body || {});
    res.json({ ok: true, entry });
  } catch (err) {
    res.status(400).json({ error: (err && err.message) || 'Invalid submission' });
  }
});
// Log a plain hours reading WITHOUT resetting the service. For low-usage / far
// sites (the Ruwais case): record the real current hours and hours-remaining
// while leaving the next-service target exactly where it was. See service.js.
app.post('/api/service/reading', fleetProtect, (req, res) => {
  try {
    const entry = serviceLog.logReading(req.body || {});
    res.json({ ok: true, entry });
  } catch (err) {
    res.status(400).json({ error: (err && err.message) || 'Invalid submission' });
  }
});
app.get('/api/service/status', fleetProtect, (req, res) => {
  res.set('Cache-Control', 'no-store');
  // Merge each generator's on-hire/off-hire status so the service list and the
  // live map can mute off-hire units and drop them from the service alarms.
  const hm = hire.getMap();
  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.ALERT_TIMEZONE || 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const generators = serviceLog.getAll().map((g) => {
    const h = hm[g.dg];
    if (h) { g.offHire = !!h.offHire; g.hireSince = h.since; g.hireNote = h.note; }
    // Attach the hours-first due classification so every view (service list,
    // schedule, dashboard) shares the same "confirm before dispatch" logic.
    g.due = serviceLog.classifyDue(g, todayStr);
    return g;
  });
  res.json({ generators, hire: hire.getAll() });
});
// On-hire / off-hire status for a generator.
app.post('/api/hire/set', fleetProtect, (req, res) => {
  try { res.json({ ok: true, entry: hire.setStatus(req.body || {}) }); }
  catch (e) { res.status(400).json({ error: (e && e.message) || 'Invalid' }); }
});
app.get('/api/hire', fleetProtect, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ hire: hire.getAll() });
});
// Morning WhatsApp service reminder: preview the digest, or send it now.
app.get('/api/service/alert/preview', fleetProtect, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(serviceAlert.preview());
});
app.post('/api/service/alert/send', fleetProtect, async (req, res) => {
  try { res.json(await serviceAlert.sendDigest({ force: true })); }
  catch (e) { res.status(500).json({ error: (e && e.message) || 'Send failed' }); }
});
app.get('/api/service/photo', fleetProtect, (req, res) => {
  const photo = serviceLog.getPhoto(req.query.dg);
  if (!photo) return res.status(404).json({ error: 'No photo' });
  res.set('Cache-Control', 'no-store');
  res.json({ photo });
});
app.post('/api/service/remove', fleetProtect, (req, res) => {
  serviceLog.remove((req.body || {}).dg);
  res.json({ ok: true });
});
// The technician-facing service page (shareable link). Its CSP additionally
// permits the Tesseract OCR library (loaded on demand from jsDelivr) for the
// optional "auto-read hours from photo" feature; everything else is same-origin.
app.get('/service', (req, res) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; "
      + "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net blob:; "
      + "style-src 'self' 'unsafe-inline'; "
      + "img-src 'self' data: blob:; "
      + "connect-src 'self' https://cdn.jsdelivr.net; "
      + "worker-src 'self' blob:; font-src 'self' data:; manifest-src 'self';"
  );
  res.sendFile(path.join(__dirname, 'service.html'));
});

// ---------- Daily servicing schedule (two teams) ----------
app.get('/api/schedule', fleetProtect, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(schedule.get(req.query.date));
});
app.post('/api/schedule/add', fleetProtect, (req, res) => {
  const b = req.body || {};
  try { res.json(schedule.add(b.date, b.team, b.dg, b.note)); }
  catch (e) { res.status(400).json({ error: (e && e.message) || 'Invalid' }); }
});
app.post('/api/schedule/update', fleetProtect, (req, res) => {
  const b = req.body || {};
  try { res.json(schedule.update(b.date, b.team, b.dg, b.done)); }
  catch (e) { res.status(400).json({ error: (e && e.message) || 'Invalid' }); }
});
app.post('/api/schedule/remove', fleetProtect, (req, res) => {
  const b = req.body || {};
  try { res.json(schedule.remove(b.date, b.team, b.dg)); }
  catch (e) { res.status(400).json({ error: (e && e.message) || 'Invalid' }); }
});
app.get('/schedule', (req, res) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; "
      + "img-src 'self' data:; connect-src 'self'; font-src 'self' data:; manifest-src 'self';"
  );
  res.sendFile(path.join(__dirname, 'schedule.html'));
});

// ---------- Spare-parts issue tracking ----------
app.get('/api/spares', fleetProtect, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ items: spares.getAll(), statuses: spares.STATUSES });
});
app.post('/api/spares/add', fleetProtect, (req, res) => {
  try { res.json({ ok: true, item: spares.add(req.body || {}) }); }
  catch (e) { res.status(400).json({ error: (e && e.message) || 'Invalid' }); }
});
app.post('/api/spares/update', fleetProtect, (req, res) => {
  const b = req.body || {};
  try { res.json({ ok: true, item: spares.update(b.id, b.status) }); }
  catch (e) { res.status(400).json({ error: (e && e.message) || 'Invalid' }); }
});
app.post('/api/spares/remove', fleetProtect, (req, res) => {
  spares.remove((req.body || {}).id);
  res.json({ ok: true });
});
app.get('/spares', (req, res) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; "
      + "img-src 'self' data:; connect-src 'self'; font-src 'self' data:; manifest-src 'self';"
  );
  res.sendFile(path.join(__dirname, 'spares.html'));
});

// ---------- Customer site profiles ----------
// Where each customer site is (map pin), how harsh it is (dust -> normal vs
// premium rate), gate-pass access notes, generators deployed, and a
// post-delivery review. Reuses the same fleet login. See server/sites.js.
app.get('/api/sites', fleetProtect, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ sites: sites.getAll(), dustLevels: sites.DUST_LEVELS, rates: sites.RATES });
});
app.post('/api/sites/save', fleetProtect, (req, res) => {
  try { res.json({ ok: true, site: sites.save(req.body || {}) }); }
  catch (e) { res.status(400).json({ error: (e && e.message) || 'Invalid' }); }
});
app.post('/api/sites/remove', fleetProtect, (req, res) => {
  sites.remove((req.body || {}).id);
  res.json({ ok: true });
});
app.get('/api/sites/photo', fleetProtect, (req, res) => {
  const photo = sites.getPhoto(req.query.id);
  if (!photo) return res.status(404).json({ error: 'No photo' });
  res.set('Cache-Control', 'no-store');
  res.json({ photo });
});
// The site-profiles page. It embeds the same local Leaflet map (vendored,
// same-origin) with our tile proxy so the office can drop/see a site pin.
app.get('/sites', (req, res) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; "
      + "img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; "
      + "worker-src 'self' blob:; manifest-src 'self';"
  );
  res.sendFile(path.join(__dirname, 'sites.html'));
});

// ---------- Breakdown log ----------
// Records generator breakdowns and their resolution, for response-time history
// and repeat-offender tracking. Same fleet login. See server/breakdowns.js.
app.get('/api/breakdowns', fleetProtect, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ breakdowns: breakdowns.getAll(), stats: breakdowns.stats() });
});
app.post('/api/breakdowns/add', fleetProtect, (req, res) => {
  try { res.json({ ok: true, item: breakdowns.add(req.body || {}) }); }
  catch (e) { res.status(400).json({ error: (e && e.message) || 'Invalid' }); }
});
app.post('/api/breakdowns/resolve', fleetProtect, (req, res) => {
  const b = req.body || {};
  try { res.json({ ok: true, item: breakdowns.resolve(b.id, b) }); }
  catch (e) { res.status(400).json({ error: (e && e.message) || 'Invalid' }); }
});
app.post('/api/breakdowns/reopen', fleetProtect, (req, res) => {
  try { res.json({ ok: true, item: breakdowns.reopen((req.body || {}).id) }); }
  catch (e) { res.status(400).json({ error: (e && e.message) || 'Invalid' }); }
});
app.post('/api/breakdowns/update', fleetProtect, (req, res) => {
  const b = req.body || {};
  try { res.json({ ok: true, item: breakdowns.update(b.id, b) }); }
  catch (e) { res.status(400).json({ error: (e && e.message) || 'Invalid' }); }
});
app.post('/api/breakdowns/remove', fleetProtect, (req, res) => {
  breakdowns.remove((req.body || {}).id);
  res.json({ ok: true });
});
// ---------- Rental income tracker ----------
// Per-generator rental terms (customer, monthly rate, start date). Combined with
// the on-hire/off-hire status for total income and earning-vs-idle. Same login.
app.get('/api/rentals', fleetProtect, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const hm = hire.getMap();
  const list = rentals.getAll().map((r) => Object.assign({}, r, {
    offHire: !!(hm[r.dg] && hm[r.dg].offHire),
    days: rentals.daysOnHire(r.startDate),
  })).sort((a, b) => (b.rate || 0) - (a.rate || 0));
  res.json({ rentals: list, stats: rentals.stats(hm) });
});
app.post('/api/rentals/save', fleetProtect, (req, res) => {
  try { res.json({ ok: true, item: rentals.save(req.body || {}) }); }
  catch (e) { res.status(400).json({ error: (e && e.message) || 'Invalid' }); }
});
app.post('/api/rentals/remove', fleetProtect, (req, res) => {
  rentals.remove((req.body || {}).dg);
  res.json({ ok: true });
});
app.get('/rentals', (req, res) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; "
      + "img-src 'self' data:; connect-src 'self'; font-src 'self' data:; manifest-src 'self';"
  );
  res.sendFile(path.join(__dirname, 'rentals.html'));
});

// ---------- Delivery / on-hire notes ----------
// A numbered hand-over note raised when a generator leaves the yard on hire.
// Optionally, saving a note can flip the generator on-hire and log its meter
// reading in one step, so the map, service list and rental tracker stay in sync
// with what physically went out. Same fleet login. See server/delivery.js.
app.get('/api/delivery', fleetProtect, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ notes: delivery.getAll() });
});
app.post('/api/delivery/create', fleetProtect, (req, res) => {
  try {
    const body = req.body || {};
    const note = delivery.create(body);
    // Keep the rest of the system in step with what left the yard.
    if (body.setOnHire) {
      try { hire.setStatus({ dg: note.dg, offHire: false, since: note.date, note: 'On hire — ' + note.number }); } catch (_) { /* best-effort */ }
    }
    if (note.meterReading != null) {
      try { serviceLog.logReading({ dg: note.dg, hours: note.meterReading, date: note.date, technician: note.driver }); } catch (_) { /* best-effort */ }
    }
    res.json({ ok: true, note });
  } catch (e) {
    res.status(400).json({ error: (e && e.message) || 'Invalid' });
  }
});
app.post('/api/delivery/remove', fleetProtect, (req, res) => {
  delivery.remove((req.body || {}).id);
  res.json({ ok: true });
});
app.get('/delivery', (req, res) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; "
      + "img-src 'self' data:; connect-src 'self'; font-src 'self' data:; manifest-src 'self';"
  );
  res.sendFile(path.join(__dirname, 'delivery.html'));
});

app.get('/breakdowns', (req, res) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; "
      + "img-src 'self' data:; connect-src 'self'; font-src 'self' data:; manifest-src 'self';"
  );
  res.sendFile(path.join(__dirname, 'breakdowns.html'));
});

// Operations dashboard: at-a-glance counts (fleet, service due, spares, sites)
// pulled from the existing APIs. Same fleet login as the other tools.
app.get('/dashboard', (req, res) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; "
      + "img-src 'self' data:; connect-src 'self'; font-src 'self' data:; manifest-src 'self';"
  );
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// Operations menu (a simple home page linking to all the tools).
app.get(['/menu', '/home'], (req, res) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; "
      + "img-src 'self' data:; connect-src 'self'; font-src 'self' data:; manifest-src 'self';"
  );
  res.sendFile(path.join(__dirname, 'menu.html'));
});

// ---------- Serve the frontends ----------
app.use(express.static(path.join(__dirname, '..', 'public')));
// Deluxe Ops ships as two installable apps sharing one codebase:
//   /ops/tech  -> the field Technician app (ops-tech.html)
//   /ops       -> the Office console for admin/ops-head (ops.html)
// The technician route must be registered first so it isn't swallowed by /ops/*.
app.get(['/ops/tech', '/ops/tech/*'], (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'ops-tech.html'));
});
// Self-contained demo (no login, no backend; runs on sample data) at /ops/demo.
app.get(['/ops/demo', '/ops/demo/*'], (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'ops-demo.html'));
});
app.get(['/ops', '/ops/*'], (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'ops.html'));
});
// Live Fleet Master & Dispatch map - a shareable link showing live vehicle
// positions from Total Secure. Served with a page-scoped Content-Security-Policy
// that permits exactly what this map page needs (Leaflet from unpkg, Esri map
// tiles, OSRM routing). The strict global CSP still applies to every other page.
app.get('/fleet', (req, res) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; "
      + "script-src 'self' 'unsafe-inline' https://unpkg.com; "
      + "style-src 'self' 'unsafe-inline' https://unpkg.com; "
      + "img-src 'self' data: https:; "
      + "connect-src 'self' https://router.project-osrm.org; "
      + "font-src 'self' data:; "
      + "manifest-src 'self'; "
      + "worker-src 'self';"
  );
  res.sendFile(path.join(__dirname, 'fleet.html'));
});

// Everything else falls back to the original LPO/invoice portal.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ---------- Optional: seed Deluxe Ops demo data on boot ----------
// Set ENABLE_OPS_DEMO=true to auto-populate the operations app with sample
// generators, jobs, technicians and a service feed the first time it boots with
// an empty fleet (handy for a live prototype). It never overwrites real data -
// if the fleet already has generators it does nothing. See scripts/ops-seed.js.
if (process.env.ENABLE_OPS_DEMO === 'true') {
  try {
    require('../scripts/ops-seed').seed();
  } catch (e) {
    console.error('Ops demo seed failed:', e && e.message);
  }
}

// ---------- Optional in-process daily backups ----------
// On Render, a separate cron-job container cannot see the web service's
// persistent disk, so the most reliable way to back up the SQLite file is from
// inside this process. Enable by setting ENABLE_DAILY_BACKUP=true. Runs once on
// startup, then every 24h. See scripts/backup-db.js and BACKUPS.md.
if (process.env.ENABLE_DAILY_BACKUP === 'true') {
  const { runBackup } = require('../scripts/backup-db');
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const tick = () => runBackup().catch((e) => console.error('Scheduled backup failed:', e));
  tick();
  setInterval(tick, ONE_DAY_MS);
  console.log('Daily in-process DB backups enabled');
}

// ---------- Optional daily automated alerts (email + WhatsApp) ----------
// Enable with ENABLE_DAILY_ALERTS=true. Sends each company's alert summary once
// a day at a configurable hour (per-company Settings -> "Send daily alerts at",
// default 07:00) in ALERT_TIMEZONE (default Asia/Dubai). The scheduler checks
// every 15 minutes and fires when the local hour matches, deduping per day.
// See server/alerts.js and ALERTS.md.
if (process.env.ENABLE_DAILY_ALERTS === 'true') {
  const ALERT_TZ = process.env.ALERT_TIMEZONE || 'Asia/Dubai';
  const CHECK_MS = 15 * 60 * 1000;
  const lastSent = {}; // company -> 'YYYY-MM-DD' (in ALERT_TZ) already handled today

  function tzNow() {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: ALERT_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false
    });
    const parts = {};
    fmt.formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
    return { date: parts.year + '-' + parts.month + '-' + parts.day, hour: parseInt(parts.hour, 10) };
  }

  const check = async () => {
    const now = tzNow();
    for (const company of VALID_COMPANIES) {
      try {
        const row = getState(company);
        const state = (row && row.data) ? row.data : {};
        const hour = (state.settings && state.settings.alertHour != null) ? Number(state.settings.alertHour) : 7;
        if (now.hour !== hour) continue;
        if (lastSent[company] === now.date) continue; // already handled today
        const out = await runCompanyAlerts(company, { force: false });
        lastSent[company] = now.date;
        if (out.sent) {
          console.log('Daily alerts [' + company + '] at ' + now.hour + ':00 ' + ALERT_TZ + ': ' + out.count +
            ' alert(s) - email ok=' + (out.email && out.email.ok) + ', whatsapp ok=' + (out.whatsapp && out.whatsapp.ok));
        }
      } catch (e) {
        console.error('Daily alerts failed for ' + company + ':', e && e.message);
      }
    }
  };

  setTimeout(check, 15000); // first check shortly after startup
  setInterval(check, CHECK_MS);
  console.log('Daily automated alerts enabled (' + ALERT_TZ + '; per-company hour, default 07:00)');
}

// ---------- Morning WhatsApp service reminder ----------
// Once a day (SERVICE_ALERT_HOUR, default 07:00 in ALERT_TIMEZONE) send a
// WhatsApp digest of the generators due for service to SERVICE_ALERT_WHATSAPP_TO.
// Runs only when Twilio WhatsApp is configured and at least one recipient is
// set; otherwise it stays dormant (the digest is still previewable in the app).
{
  const wa = require('./whatsapp');
  const mail = require('./email');
  const waRecips = serviceAlert.recipients();
  const emRecips = serviceAlert.emailRecipients();
  const waReady = wa.isConfigured() && waRecips.length;
  const emReady = mail.isConfigured() && emRecips.length;
  if (waReady || emReady) {
    const SA_TZ = process.env.ALERT_TIMEZONE || 'Asia/Dubai';
    const SA_HOUR = Number(process.env.SERVICE_ALERT_HOUR) >= 0 ? Number(process.env.SERVICE_ALERT_HOUR) : 7;
    const SA_CHECK_MS = 15 * 60 * 1000;
    let saLastSent = null; // 'YYYY-MM-DD' in SA_TZ already sent today
    const saNow = () => {
      const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: SA_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
      });
      const parts = {};
      fmt.formatToParts(new Date()).forEach((p) => { parts[p.type] = p.value; });
      return { date: parts.year + '-' + parts.month + '-' + parts.day, hour: parseInt(parts.hour, 10) };
    };
    const saCheck = async () => {
      const now = saNow();
      if (now.hour !== SA_HOUR) return;
      if (saLastSent === now.date) return;
      saLastSent = now.date;
      try {
        const out = await serviceAlert.sendDigest({});
        if (out.sent) console.log('[service-alert] sent ' + out.digest.count + ' due to ' + (out.recipients || []).length + ' recipient(s)');
      } catch (e) { console.error('[service-alert] failed:', e && e.message); }
    };
    setTimeout(saCheck, 20000);
    setInterval(saCheck, SA_CHECK_MS);
    const channels = [waReady ? 'WhatsApp' : null, emReady ? 'email' : null].filter(Boolean).join(' + ');
    console.log('[service-alert] morning reminder enabled via ' + channels + ' (' + SA_TZ + ' ' + SA_HOUR + ':00)');
  } else {
    console.log('[service-alert] morning reminder DORMANT - no channel ready. '
      + 'Set SMTP_* + SERVICE_ALERT_EMAIL_TO for email, and/or TWILIO_* + SERVICE_ALERT_WHATSAPP_TO for WhatsApp.');
  }
}

// Start polling Total Secure for live vehicle positions (no-op unless the
// TRACCAR_* env vars are set). Runs in the background; failures never crash the
// server - the last good positions stay on the map and the badge shows status.
positions.startPolling();

// ---------- Keep-alive (stop the free instance sleeping) ----------
// A free Render web service sleeps after ~15 min without inbound traffic, which
// pauses live GPS polling and makes the map look frozen. Ping our own public URL
// every 10 minutes so the service stays awake 24/7 on its own - no external
// uptime monitor required. Render provides RENDER_EXTERNAL_URL automatically;
// override with KEEPALIVE_URL, or set KEEPALIVE_URL=off to disable.
// Fallback chain: explicit KEEPALIVE_URL, then Render's auto-provided external
// URL, then the known production URL - so the keep-alive works even if
// RENDER_EXTERNAL_URL isn't present. Set KEEPALIVE_URL=off to disable.
const KEEPALIVE_URL = process.env.KEEPALIVE_URL
  || process.env.RENDER_EXTERNAL_URL
  || 'https://deluxe-group-portal.onrender.com';
if (KEEPALIVE_URL && KEEPALIVE_URL.toLowerCase() !== 'off') {
  const pingUrl = KEEPALIVE_URL.replace(/\/+$/, '') + '/api/health';
  const ping = () => {
    fetch(pingUrl).catch((e) => console.warn('[keepalive] ping failed:', e && e.message));
  };
  setInterval(ping, 5 * 60 * 1000); // every 5 minutes, well under the ~15 min sleep timer
  setTimeout(ping, 30 * 1000);       // first ping shortly after startup
  console.log('[keepalive] self-ping enabled -> ' + pingUrl + ' (every 5 min)');
}

app.listen(PORT, () => {
  console.log('Deluxe Group Portal server running on port ' + PORT);
  console.log('Open http://localhost:' + PORT + ' in your browser');
});
