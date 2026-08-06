'use strict';

// ---------------------------------------------------------------------------
// Deluxe Ops - REST API router (mounted at /api/ops by server.js).
//
// Reuses the portal's JWT auth (authRequired is injected by server.js) and adds
// role-based gating on top: admin, ops_head, technician. See server/ops-db.js
// for the data layer and OPS.md for the product spec.
// ---------------------------------------------------------------------------

const express = require('express');
const bcrypt = require('bcryptjs');
const { findUser } = require('./db');
const ops = require('./ops-db');

// Build the router. `authRequired` (JWT verify -> req.user) is passed in from
// server.js so both apps share exactly one auth implementation.
module.exports = function createOpsRouter({ authRequired }) {
  const router = express.Router();

  // Attach the caller's effective ops role to the request.
  function withRole(req, res, next) {
    const user = findUser(req.user.username);
    if (!user) return res.status(401).json({ error: 'Unknown user' });
    req.opsRole = ops.effectiveRole(user);
    req.opsUser = user;
    next();
  }
  // Gate a route to one or more roles.
  function requireRole(...roles) {
    return (req, res, next) => {
      if (!req.opsRole) return res.status(403).json({ error: 'No operations access. Ask an admin to assign you a role.' });
      if (!roles.includes(req.opsRole)) return res.status(403).json({ error: 'This action requires role: ' + roles.join(' or ') });
      next();
    };
  }

  // Every ops route requires a valid token and resolves the role first.
  router.use(authRequired, withRole);

  const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;

  function validCompany(c) { return ops.COMPANIES.includes(c); }

  // ---- Who am I (role, display name, constants for the frontend) ----
  router.get('/me', (req, res) => {
    res.json({
      username: req.opsUser.username,
      displayName: req.opsUser.display_name || req.opsUser.username,
      role: req.opsRole,
      isAdmin: !!req.opsUser.is_admin,
      meta: {
        companies: ops.COMPANIES,
        companyLabels: ops.COMPANY_LABELS,
        companyColors: ops.COMPANY_COLORS,
        generatorStatuses: ops.GENERATOR_STATUSES,
        jobTypes: ops.JOB_TYPES,
        jobTypeLabels: ops.JOB_TYPE_LABELS,
        pipelines: ops.JOB_PIPELINES
      }
    });
  });

  // =========================================================================
  // Generators (fleet) - admin manages; everyone with a role can read.
  // =========================================================================
  router.get('/generators', (req, res) => {
    res.json(ops.listGenerators());
  });

  router.post('/generators', requireRole('admin'), (req, res) => {
    const { dg_number, kva, company, status, location, client } = req.body || {};
    if (!dg_number || !String(dg_number).trim()) return res.status(400).json({ error: 'DG number is required' });
    if (!validCompany(company)) return res.status(400).json({ error: 'company must be one of: ' + ops.COMPANIES.join(', ') });
    if (status && !ops.GENERATOR_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    if (ops.getGeneratorByDg(String(dg_number).trim())) return res.status(409).json({ error: 'A generator with that DG number already exists' });
    const gen = ops.createGenerator({ dg_number: String(dg_number).trim(), kva, company, status, location, client });
    res.json(gen);
  });

  router.put('/generators/:id', requireRole('admin'), (req, res) => {
    const id = Number(req.params.id);
    const cur = ops.getGenerator(id);
    if (!cur) return res.status(404).json({ error: 'Generator not found' });
    const { dg_number, company, status } = req.body || {};
    if (company !== undefined && !validCompany(company)) return res.status(400).json({ error: 'Invalid company' });
    if (status !== undefined && !ops.GENERATOR_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    if (dg_number && String(dg_number).trim() !== cur.dg_number) {
      const clash = ops.getGeneratorByDg(String(dg_number).trim());
      if (clash && clash.id !== id) return res.status(409).json({ error: 'Another generator already uses that DG number' });
    }
    res.json(ops.updateGenerator(id, req.body || {}));
  });

  router.delete('/generators/:id', requireRole('admin'), (req, res) => {
    const id = Number(req.params.id);
    if (!ops.getGenerator(id)) return res.status(404).json({ error: 'Generator not found' });
    ops.deleteGenerator(id);
    res.json({ ok: true });
  });

  // =========================================================================
  // Technicians & roles - admin only for writes; ops_head can read the roster.
  // =========================================================================
  router.get('/technicians', requireRole('admin', 'ops_head'), (req, res) => {
    res.json(ops.listTechnicians().map((t) => ({ username: t.username, displayName: t.display_name || t.username, created_at: t.created_at })));
  });

  // Full ops roster (all roles) - admin only.
  router.get('/users', requireRole('admin'), (req, res) => {
    res.json(ops.listOpsUsers());
  });

  // Create a technician (or any role) account.
  router.post('/technicians', requireRole('admin'), (req, res) => {
    const { username, password, displayName, role } = req.body || {};
    const uname = (username || '').trim();
    const r = role || 'technician';
    if (!uname || !password) return res.status(400).json({ error: 'Username and password are required' });
    if (!USERNAME_RE.test(uname)) return res.status(400).json({ error: 'Username must be 3-32 chars: letters, numbers, . _ -' });
    if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (!ops.ROLES.includes(r)) return res.status(400).json({ error: 'Invalid role' });
    if (findUser(uname)) return res.status(409).json({ error: 'That username already exists' });
    ops.createOpsUser(uname, password, r, displayName || uname);
    res.json({ ok: true });
  });

  // Change an existing account's role / display name.
  router.put('/users/:username/role', requireRole('admin'), (req, res) => {
    const target = req.params.username;
    const u = findUser(target);
    if (!u) return res.status(404).json({ error: 'User not found' });
    const { role, displayName } = req.body || {};
    if (role && !ops.ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });
    ops.setUserRole(target, role || ops.effectiveRole(u) || 'technician', displayName);
    res.json({ ok: true });
  });

  // =========================================================================
  // Jobs - admin creates; admin/ops_head assign; technician advances stages.
  // =========================================================================
  router.get('/jobs', (req, res) => {
    // Technicians only ever see their own jobs.
    if (req.opsRole === 'technician') return res.json(ops.listJobs({ tech: req.opsUser.username }));
    res.json(ops.listJobs());
  });

  router.get('/jobs/:id', (req, res) => {
    const job = ops.getJob(Number(req.params.id));
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (req.opsRole === 'technician' && job.assigned_tech !== req.opsUser.username) {
      return res.status(403).json({ error: 'That job is not assigned to you' });
    }
    res.json(Object.assign({}, job, { events: ops.getJobEvents(job.id) }));
  });

  router.post('/jobs', requireRole('admin'), (req, res) => {
    const { type, generator_id, company, assigned_tech, title, description, location, client, vendor } = req.body || {};
    if (!ops.JOB_TYPES.includes(type)) return res.status(400).json({ error: 'type must be one of: ' + ops.JOB_TYPES.join(', ') });
    if (!validCompany(company)) return res.status(400).json({ error: 'Invalid company' });
    if (generator_id && !ops.getGenerator(Number(generator_id))) return res.status(400).json({ error: 'Unknown generator' });
    if (assigned_tech && ops.roleOf(assigned_tech) !== 'technician') return res.status(400).json({ error: 'assigned_tech must be a technician' });
    try {
      const job = ops.createJob({ type, generator_id, company, assigned_tech, title, description, location, client, vendor }, req.opsUser.username);
      res.json(job);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.put('/jobs/:id/assign', requireRole('admin', 'ops_head'), (req, res) => {
    const id = Number(req.params.id);
    if (!ops.getJob(id)) return res.status(404).json({ error: 'Job not found' });
    const { tech } = req.body || {};
    if (tech && ops.roleOf(tech) !== 'technician') return res.status(400).json({ error: 'That user is not a technician' });
    res.json(ops.assignJob(id, tech || null, req.opsUser.username));
  });

  // Advance / set a job's stage. Technicians may only move their own jobs.
  router.put('/jobs/:id/stage', (req, res) => {
    const id = Number(req.params.id);
    const job = ops.getJob(id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (req.opsRole === 'technician' && job.assigned_tech !== req.opsUser.username) {
      return res.status(403).json({ error: 'That job is not assigned to you' });
    }
    if (!req.opsRole) return res.status(403).json({ error: 'No operations access' });
    const { stage } = req.body || {};
    try {
      res.json(ops.setJobStage(id, stage, req.opsUser.username));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.delete('/jobs/:id', requireRole('admin'), (req, res) => {
    const id = Number(req.params.id);
    if (!ops.getJob(id)) return res.status(404).json({ error: 'Job not found' });
    ops.deleteJob(id);
    res.json({ ok: true });
  });

  // =========================================================================
  // Daily service-due feed (from Netsonic "Machinery Service Due" report).
  // Admin / ops_head enter DG + days-remaining each morning; all roles read it.
  // =========================================================================
  router.get('/service-due', (req, res) => {
    res.json(ops.listServiceDue());
  });

  router.post('/service-due', requireRole('admin', 'ops_head'), (req, res) => {
    const { dgNumber, daysRemaining, company } = req.body || {};
    const dg = (dgNumber || '').trim();
    if (!dg) return res.status(400).json({ error: 'DG number is required' });
    if (daysRemaining === undefined || daysRemaining === null || isNaN(Number(daysRemaining))) {
      return res.status(400).json({ error: 'daysRemaining must be a number' });
    }
    // If the DG matches a known generator, inherit its company automatically.
    const gen = ops.getGeneratorByDg(dg);
    res.json(ops.upsertServiceDue(dg, Number(daysRemaining), company || (gen && gen.company) || null, req.opsUser.username));
  });

  router.delete('/service-due/:dg', requireRole('admin', 'ops_head'), (req, res) => {
    ops.deleteServiceDue(req.params.dg);
    res.json({ ok: true });
  });

  // =========================================================================
  // Per-technician alerts. Admin / ops_head raise an alert for a specific
  // technician; it shows as a ringing banner in that technician's app until
  // they acknowledge it.
  // =========================================================================
  router.get('/tech-alerts', (req, res) => {
    if (req.opsRole === 'technician') return res.json(ops.listTechAlerts(req.opsUser.username));
    if (req.opsRole === 'admin' || req.opsRole === 'ops_head') {
      if (req.query.tech) return res.json(ops.listTechAlerts(req.query.tech));
      return res.json(ops.listAllTechAlerts());
    }
    return res.status(403).json({ error: 'No operations access' });
  });

  // Unacknowledged counts per technician (admin roster badges).
  router.get('/tech-alerts/counts', requireRole('admin', 'ops_head'), (req, res) => {
    res.json(ops.unackAlertCounts());
  });

  router.post('/tech-alerts', requireRole('admin', 'ops_head'), (req, res) => {
    const { tech, message, level } = req.body || {};
    if (!tech || ops.roleOf(tech) !== 'technician') return res.status(400).json({ error: 'tech must be a technician username' });
    const msg = (message || '').trim();
    if (!msg) return res.status(400).json({ error: 'Alert message is required' });
    if (msg.length > 500) return res.status(400).json({ error: 'Alert message is too long (max 500 chars)' });
    if (level && !ops.ALERT_LEVELS.includes(level)) return res.status(400).json({ error: 'level must be info or urgent' });
    res.json(ops.createTechAlert(tech, msg, level || 'info', req.opsUser.username));
  });

  // Acknowledge: a technician may clear their own; admin/ops_head may clear any.
  router.post('/tech-alerts/:id/ack', (req, res) => {
    const id = Number(req.params.id);
    const alert = ops.getTechAlert(id);
    if (!alert) return res.status(404).json({ error: 'Alert not found' });
    if (req.opsRole === 'technician' && alert.tech_username !== req.opsUser.username) {
      return res.status(403).json({ error: 'That alert is not yours' });
    }
    if (!req.opsRole) return res.status(403).json({ error: 'No operations access' });
    res.json(ops.acknowledgeTechAlert(id));
  });

  router.delete('/tech-alerts/:id', requireRole('admin', 'ops_head'), (req, res) => {
    const id = Number(req.params.id);
    if (!ops.getTechAlert(id)) return res.status(404).json({ error: 'Alert not found' });
    ops.deleteTechAlert(id);
    res.json({ ok: true });
  });

  return router;
};
