require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const { findUser, updateUserPassword, getState, saveState, logActivity, getActivity } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_THIS_SECRET_BEFORE_DEPLOYING';
const VALID_COMPANIES = ['energy', 'heavy'];

app.use(cors());
app.use(express.json({ limit: '5mb' })); // company state blobs can be a few hundred KB with lots of records

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
app.post('/api/login', (req, res) => {
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

app.listen(PORT, () => {
  console.log('Deluxe Group Portal server running on port ' + PORT);
  console.log('Open http://localhost:' + PORT + ' in your browser');
});
