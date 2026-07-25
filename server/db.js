const path = require('path');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'deluxe.db');

// Ensure data directory exists
const fs = require('fs');
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// ---- Schema ----
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS company_state (
    company TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now')),
    updated_by TEXT,
    rev INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company TEXT NOT NULL,
    username TEXT NOT NULL,
    action TEXT NOT NULL,
    at TEXT DEFAULT (datetime('now'))
  );
`);

// Migration: add the `rev` version column to pre-existing company_state tables.
const hasRev = db.prepare("PRAGMA table_info(company_state)").all().some(function (c) { return c.name === 'rev'; });
if (!hasRev) {
  db.exec('ALTER TABLE company_state ADD COLUMN rev INTEGER NOT NULL DEFAULT 0');
}

// ---- Seed default admin user (matches the original app's hardcoded login) ----
function seedDefaultUser() {
  const existing = db.prepare('SELECT username FROM users WHERE username = ?').get('deluxelpoadmin');
  if (!existing) {
    const hash = bcrypt.hashSync('Deluxe@123', 10);
    db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('deluxelpoadmin', hash);
    console.log('Seeded default user: deluxelpoadmin (password: Deluxe@123 - CHANGE THIS after first login)');
  }
}
seedDefaultUser();

// ---- User helpers ----
function findUser(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}
function updateUserPassword(username, newPassword) {
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE username = ?').run(hash, username);
}

// ---- Company state helpers ----
function getState(company) {
  const row = db.prepare('SELECT data, updated_at, updated_by, rev FROM company_state WHERE company = ?').get(company);
  if (!row) return null;
  return { data: JSON.parse(row.data), updated_at: row.updated_at, updated_by: row.updated_by, rev: row.rev };
}
// Optimistic concurrency: if expectedRev is provided and doesn't match the
// stored rev, the save is rejected as a conflict so the caller can re-sync
// instead of silently overwriting another device's changes. better-sqlite3 is
// synchronous, so the read-check-write below runs without interleaving.
function saveState(company, dataObj, username, expectedRev) {
  const json = JSON.stringify(dataObj);
  const existing = db.prepare('SELECT rev FROM company_state WHERE company = ?').get(company);
  if (existing) {
    if (expectedRev !== undefined && expectedRev !== null && Number(expectedRev) !== existing.rev) {
      return { conflict: true, currentRev: existing.rev };
    }
    const newRev = existing.rev + 1;
    db.prepare("UPDATE company_state SET data = ?, updated_at = datetime('now'), updated_by = ?, rev = ? WHERE company = ?")
      .run(json, username, newRev, company);
  } else {
    db.prepare("INSERT INTO company_state (company, data, updated_at, updated_by, rev) VALUES (?, ?, datetime('now'), ?, 1)")
      .run(company, json, username);
  }
  const row = db.prepare('SELECT updated_at, rev FROM company_state WHERE company = ?').get(company);
  return { updated_at: row.updated_at, rev: row.rev };
}
function logActivity(company, username, action) {
  db.prepare('INSERT INTO activity_log (company, username, action) VALUES (?, ?, ?)').run(company, username, action);
}
function getActivity(company, limit) {
  return db.prepare('SELECT username, action, at FROM activity_log WHERE company = ? ORDER BY id DESC LIMIT ?')
    .all(company, limit || 50);
}

module.exports = {
  db, findUser, updateUserPassword, getState, saveState, logActivity, getActivity
};
