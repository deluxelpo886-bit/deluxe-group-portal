require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const { findUser, updateUserPassword, getState, saveState, logActivity, getActivity } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_THIS_SECRET_BEFORE_DEPLOYING';
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
const INLINE_SCRIPT_HASH = "'sha256-DEXJOItMD1MNCUOdPwZlhFMovOJbOMkotjHjwY+Wn1Q='";
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
  res.json({ token, username });
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

// ---------- Company state routes ----------
// GET the full state blob for a company workspace
app.get('/api/state/:company', authRequired, validCompany, (req, res) => {
  const state = getState(req.params.company);
  if (!state) return res.json({ data: null, updated_at: null });
  res.json(state);
});

// PUT (replace) the full state blob for a company workspace
app.put('/api/state/:company', authRequired, validCompany, (req, res) => {
  const { data } = req.body || {};
  if (!data || typeof data !== 'object') return res.status(400).json({ error: 'Missing data payload' });
  const updated_at = saveState(req.params.company, data, req.user.username);
  res.json({ ok: true, updated_at });
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

app.listen(PORT, () => {
  console.log('Deluxe Group Portal server running on port ' + PORT);
  console.log('Open http://localhost:' + PORT + ' in your browser');
});
