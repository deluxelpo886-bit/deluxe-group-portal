'use strict';

// ---------------------------------------------------------------------------
// Deluxe Ops - generator operations tracking data layer.
//
// This reuses the same better-sqlite3 connection as the existing LPO/invoice
// portal (server/db.js) so both apps share one database file and one set of
// user accounts. Everything here is namespaced with the `ops_` table prefix and
// the `/api/ops` route prefix so it lives alongside the original portal without
// touching it.
// ---------------------------------------------------------------------------

const { db, findUser } = require('./db');
const bcrypt = require('bcryptjs');

// ---- Domain constants (shared with the frontend) ----
const COMPANIES = ['heavy', 'energy'];
const COMPANY_LABELS = { heavy: 'Deluxe Heavy Equipment Rental', energy: 'Deluxe Energy Solutions' };
const COMPANY_COLORS = { heavy: '#152B54', energy: '#E8A93A' };

const GENERATOR_STATUSES = ['available', 'on_rent', 'workshop', 'breakdown', 'outside'];

const ROLES = ['admin', 'ops_head', 'technician'];

// Each job type has its own ordered stage pipeline. The first entry is the
// stage a new job of that type starts in; the last entry is the terminal stage.
const JOB_PIPELINES = {
  scheduled: ['Assigned', 'En Route', 'On Site', 'Completed'],
  breakdown: ['Reported', 'Assigned', 'En Route', 'On Site', 'Resolved'],
  workshop: ['Intake', 'Diagnosis', 'Repair', 'Testing', 'Ready'],
  outside: ['Sent Out', 'With Vendor', 'Returned']
};
const JOB_TYPES = Object.keys(JOB_PIPELINES);
const JOB_TYPE_LABELS = {
  scheduled: 'Scheduled service',
  breakdown: 'Breakdown',
  workshop: 'Workshop repair',
  outside: 'Outside repair'
};

// ---- Schema ----
db.exec(`
  CREATE TABLE IF NOT EXISTS ops_generators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dg_number TEXT NOT NULL UNIQUE,
    kva INTEGER,
    company TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'available',
    location TEXT,
    client TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ops_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    generator_id INTEGER,
    company TEXT NOT NULL,
    stage TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'open',
    assigned_tech TEXT,
    title TEXT,
    description TEXT,
    location TEXT,
    client TEXT,
    vendor TEXT,
    created_by TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ops_job_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL,
    username TEXT,
    event TEXT NOT NULL,
    detail TEXT,
    at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ops_service_due (
    dg_number TEXT PRIMARY KEY,
    days_remaining INTEGER NOT NULL,
    company TEXT,
    updated_by TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_ops_jobs_tech ON ops_jobs(assigned_tech);
  CREATE INDEX IF NOT EXISTS idx_ops_jobs_state ON ops_jobs(state);
  CREATE INDEX IF NOT EXISTS idx_ops_job_events_job ON ops_job_events(job_id);
`);

// Migration: give the shared users table an ops `role` and technician
// `display_name`. Existing accounts (the LPO portal admin) become ops admins so
// they don't get locked out; everyone else starts with no ops role until an
// admin assigns one.
const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
if (!userCols.includes('role')) {
  db.exec('ALTER TABLE users ADD COLUMN role TEXT');
  db.exec("UPDATE users SET role = 'admin' WHERE is_admin = 1 AND role IS NULL");
}
if (!userCols.includes('display_name')) {
  db.exec('ALTER TABLE users ADD COLUMN display_name TEXT');
}

// ---- Role helpers ----
// An account's effective ops role. is_admin (from the original portal) always
// wins so the seeded admin has full ops access.
function effectiveRole(user) {
  if (!user) return null;
  if (user.is_admin) return 'admin';
  return user.role || null;
}
function roleOf(username) {
  return effectiveRole(findUser(username));
}

// ---- Generator helpers ----
function listGenerators() {
  return db.prepare('SELECT * FROM ops_generators ORDER BY company, dg_number').all();
}
function getGenerator(id) {
  return db.prepare('SELECT * FROM ops_generators WHERE id = ?').get(id);
}
function getGeneratorByDg(dg) {
  return db.prepare('SELECT * FROM ops_generators WHERE dg_number = ?').get(dg);
}
function createGenerator(g) {
  const info = db.prepare(
    `INSERT INTO ops_generators (dg_number, kva, company, status, location, client)
     VALUES (@dg_number, @kva, @company, @status, @location, @client)`
  ).run({
    dg_number: g.dg_number,
    kva: g.kva != null ? Number(g.kva) : null,
    company: g.company,
    status: g.status || 'available',
    location: g.location || null,
    client: g.client || null
  });
  return getGenerator(info.lastInsertRowid);
}
function updateGenerator(id, g) {
  const cur = getGenerator(id);
  if (!cur) return null;
  db.prepare(
    `UPDATE ops_generators SET dg_number=@dg_number, kva=@kva, company=@company,
     status=@status, location=@location, client=@client, updated_at=datetime('now')
     WHERE id=@id`
  ).run({
    id,
    dg_number: g.dg_number != null ? g.dg_number : cur.dg_number,
    kva: g.kva != null ? Number(g.kva) : cur.kva,
    company: g.company != null ? g.company : cur.company,
    status: g.status != null ? g.status : cur.status,
    location: g.location !== undefined ? g.location : cur.location,
    client: g.client !== undefined ? g.client : cur.client
  });
  return getGenerator(id);
}
function deleteGenerator(id) {
  db.prepare('DELETE FROM ops_generators WHERE id = ?').run(id);
}

// ---- Technician / user helpers ----
function listTechnicians() {
  return db.prepare(
    "SELECT username, display_name, created_at FROM users WHERE role = 'technician' ORDER BY display_name, username"
  ).all();
}
// All accounts that participate in ops (admins, ops heads, technicians).
function listOpsUsers() {
  return db.prepare(
    "SELECT username, display_name, is_admin, role FROM users WHERE role IS NOT NULL OR is_admin = 1 ORDER BY role, username"
  ).all().map((u) => ({
    username: u.username,
    displayName: u.display_name || u.username,
    role: effectiveRole(u)
  }));
}
function createOpsUser(username, password, role, displayName) {
  const hash = bcrypt.hashSync(password, 10);
  const isAdmin = role === 'admin' ? 1 : 0;
  db.prepare(
    'INSERT INTO users (username, password_hash, is_admin, role, display_name) VALUES (?, ?, ?, ?, ?)'
  ).run(username, hash, isAdmin, role, displayName || username);
}
function setUserRole(username, role, displayName) {
  const isAdmin = role === 'admin' ? 1 : 0;
  if (displayName !== undefined) {
    db.prepare('UPDATE users SET role = ?, is_admin = ?, display_name = ? WHERE username = ?')
      .run(role, isAdmin, displayName, username);
  } else {
    db.prepare('UPDATE users SET role = ?, is_admin = ? WHERE username = ?').run(role, isAdmin, username);
  }
}

// ---- Job helpers ----
// Jobs are returned already joined with their generator's DG number / KVA /
// company so the board and technician views don't need a second lookup.
const JOB_SELECT = `
  SELECT j.*, g.dg_number AS dg_number, g.kva AS kva, g.status AS gen_status,
         u.display_name AS tech_name
  FROM ops_jobs j
  LEFT JOIN ops_generators g ON g.id = j.generator_id
  LEFT JOIN users u ON u.username = j.assigned_tech
`;
function mapJob(row) {
  if (!row) return row;
  return Object.assign({}, row, {
    pipeline: JOB_PIPELINES[row.type] || [],
    typeLabel: JOB_TYPE_LABELS[row.type] || row.type
  });
}
function listJobs(filter) {
  filter = filter || {};
  const where = [];
  const params = {};
  if (filter.tech) { where.push('j.assigned_tech = @tech'); params.tech = filter.tech; }
  if (filter.state) { where.push('j.state = @state'); params.state = filter.state; }
  const sql = JOB_SELECT + (where.length ? ' WHERE ' + where.join(' AND ') : '') +
    " ORDER BY (j.type = 'breakdown' AND j.state = 'open') DESC, j.updated_at DESC";
  return db.prepare(sql).all(params).map(mapJob);
}
function getJob(id) {
  return mapJob(db.prepare(JOB_SELECT + ' WHERE j.id = ?').get(id));
}
function createJob(job, username) {
  const pipeline = JOB_PIPELINES[job.type];
  if (!pipeline) throw new Error('Unknown job type: ' + job.type);
  const stage = pipeline[0];
  const info = db.prepare(
    `INSERT INTO ops_jobs (type, generator_id, company, stage, state, assigned_tech, title, description, location, client, vendor, created_by)
     VALUES (@type, @generator_id, @company, @stage, 'open', @assigned_tech, @title, @description, @location, @client, @vendor, @created_by)`
  ).run({
    type: job.type,
    generator_id: job.generator_id != null ? Number(job.generator_id) : null,
    company: job.company,
    stage,
    assigned_tech: job.assigned_tech || null,
    title: job.title || null,
    description: job.description || null,
    location: job.location || null,
    client: job.client || null,
    vendor: job.vendor || null,
    created_by: username
  });
  addJobEvent(info.lastInsertRowid, username, 'created', JOB_TYPE_LABELS[job.type] + ' - ' + stage);
  if (job.assigned_tech) addJobEvent(info.lastInsertRowid, username, 'assigned', job.assigned_tech);
  return getJob(info.lastInsertRowid);
}
function assignJob(id, tech, username) {
  const job = getJob(id);
  if (!job) return null;
  db.prepare("UPDATE ops_jobs SET assigned_tech = ?, updated_at = datetime('now') WHERE id = ?").run(tech || null, id);
  addJobEvent(id, username, tech ? 'assigned' : 'unassigned', tech || null);
  return getJob(id);
}
// Move a job to a target stage within its pipeline. Reaching the terminal stage
// closes the job (state = 'done').
function setJobStage(id, stage, username) {
  const job = getJob(id);
  if (!job) return null;
  const pipeline = JOB_PIPELINES[job.type] || [];
  if (!pipeline.includes(stage)) throw new Error('Invalid stage for ' + job.type + ': ' + stage);
  const isTerminal = pipeline[pipeline.length - 1] === stage;
  db.prepare("UPDATE ops_jobs SET stage = ?, state = ?, updated_at = datetime('now') WHERE id = ?")
    .run(stage, isTerminal ? 'done' : 'open', id);
  addJobEvent(id, username, 'stage', stage);
  return getJob(id);
}
function deleteJob(id) {
  db.prepare('DELETE FROM ops_job_events WHERE job_id = ?').run(id);
  db.prepare('DELETE FROM ops_jobs WHERE id = ?').run(id);
}
function addJobEvent(jobId, username, event, detail) {
  db.prepare('INSERT INTO ops_job_events (job_id, username, event, detail) VALUES (?, ?, ?, ?)')
    .run(jobId, username || null, event, detail || null);
}
function getJobEvents(jobId) {
  return db.prepare('SELECT username, event, detail, at FROM ops_job_events WHERE job_id = ? ORDER BY id ASC').all(jobId);
}

// ---- Service-due feed (Netsonic "Machinery Service Due" daily entry) ----
function listServiceDue() {
  return db.prepare('SELECT * FROM ops_service_due ORDER BY days_remaining ASC').all();
}
// Latest days-remaining keyed by DG number, for quick lookup in the technician UI.
function serviceDueMap() {
  const map = {};
  for (const r of listServiceDue()) map[r.dg_number] = r;
  return map;
}
function upsertServiceDue(dgNumber, daysRemaining, company, username) {
  db.prepare(
    `INSERT INTO ops_service_due (dg_number, days_remaining, company, updated_by, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(dg_number) DO UPDATE SET days_remaining = excluded.days_remaining,
       company = excluded.company, updated_by = excluded.updated_by, updated_at = datetime('now')`
  ).run(dgNumber, Number(daysRemaining), company || null, username || null);
  return db.prepare('SELECT * FROM ops_service_due WHERE dg_number = ?').get(dgNumber);
}
function deleteServiceDue(dgNumber) {
  db.prepare('DELETE FROM ops_service_due WHERE dg_number = ?').run(dgNumber);
}

module.exports = {
  COMPANIES, COMPANY_LABELS, COMPANY_COLORS, GENERATOR_STATUSES, ROLES,
  JOB_PIPELINES, JOB_TYPES, JOB_TYPE_LABELS,
  effectiveRole, roleOf,
  listGenerators, getGenerator, getGeneratorByDg, createGenerator, updateGenerator, deleteGenerator,
  listTechnicians, listOpsUsers, createOpsUser, setUserRole,
  listJobs, getJob, createJob, assignJob, setJobStage, deleteJob, getJobEvents,
  listServiceDue, serviceDueMap, upsertServiceDue, deleteServiceDue
};
