require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const { findUser, updateUserPassword, listUsers, createUser, deleteUser, countAdmins, getState, saveState, logActivity, getActivity } = require('./db');
const { extractFields } = require('./extract');
const { sendWhatsApp } = require('./whatsapp');
const { sendEmail } = require('./email');
const { computeAlerts, buildMessage, buildHtml } = require('./alerts');

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
const INLINE_SCRIPT_HASH = "'sha256-iEl7S+ADhnY11bTFGUb2RlzFiL5L6PtdQxOVi9tqdIA='";
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
  try {
    const result = await extractFields(type, req.body);
    res.json(result);
  } catch (e) {
    console.error('PDF extraction failed:', e && e.message);
    res.json({ ok: false, fields: {}, message: 'Extraction failed - please enter the details manually' });
  }
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
  return out;
}

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

// ---------- Health check ----------
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ---------- Serve the frontend ----------
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

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
// Enable with ENABLE_DAILY_ALERTS=true. Once a day, for each company, compute
// expiring-LPO / overdue-invoice / generator-service / low-parts alerts from
// stored state and send them by email (SMTP) and/or WhatsApp (Twilio) - only
// when there is at least one alert. See server/alerts.js and ALERTS.md.
if (process.env.ENABLE_DAILY_ALERTS === 'true') {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const tick = async () => {
    for (const company of VALID_COMPANIES) {
      try {
        const out = await runCompanyAlerts(company, { force: false });
        if (out.sent) {
          console.log('Daily alerts [' + company + ']: ' + out.count + ' alert(s) - email ok=' +
            (out.email && out.email.ok) + ', whatsapp ok=' + (out.whatsapp && out.whatsapp.ok));
        }
      } catch (e) {
        console.error('Daily alerts failed for ' + company + ':', e && e.message);
      }
    }
  };
  setTimeout(tick, 15000); // first run shortly after startup
  setInterval(tick, ONE_DAY_MS);
  console.log('Daily automated alerts enabled (email + WhatsApp)');
}

app.listen(PORT, () => {
  console.log('Deluxe Group Portal server running on port ' + PORT);
  console.log('Open http://localhost:' + PORT + ' in your browser');
});
