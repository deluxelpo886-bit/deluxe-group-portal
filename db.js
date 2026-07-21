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
    updated_by TEXT
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company TEXT NOT NULL,
    username TEXT NOT NULL,
    action TEXT NOT NULL,
    at TEXT DEFAULT (datetime('now'))
  );
`);

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
  const row = db.prepare('SELECT data, updated_at, updated_by FROM company_state WHERE company = ?').get(company);
  if (!row) return null;
  return { data: JSON.parse(row.data), updated_at: row.updated_at, updated_by: row.updated_by };
}
function saveState(company, dataObj, username) {
  const json = JSON.stringify(dataObj);
  const existing = db.prepare('SELECT company FROM company_state WHERE company = ?').get(company);
  if (existing) {
    db.prepare("UPDATE company_state SET data = ?, updated_at = datetime('now'), updated_by = ? WHERE company = ?")
      .run(json, username, company);
  } else {
    db.prepare("INSERT INTO company_state (company, data, updated_at, updated_by) VALUES (?, ?, datetime('now'), ?)")
      .run(company, json, username);
  }
  const row = db.prepare('SELECT updated_at FROM company_state WHERE company = ?').get(company);
  return row.updated_at;
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
