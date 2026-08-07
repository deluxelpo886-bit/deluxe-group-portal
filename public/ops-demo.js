/* Deluxe Ops - self-contained interactive demo (external, CSP-safe).
   Same UI as the deployed app, but the backend is replaced by an in-browser
   store (localStorage) seeded with demo data, so it runs with no server and
   works fully offline once installed. Served at /ops/demo. */
(function () {
  'use strict';
  var app = document.getElementById('app');
  var toastEl = document.getElementById('toast');
  var state = { me: null, meta: null, rerender: null };

  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'style' && typeof v === 'object') { for (var s in v) el.style[s] = v[s]; }
      else el.setAttribute(k, v);
    }
    for (var i = 2; i < arguments.length; i++) {
      var kids = arguments[i]; if (!Array.isArray(kids)) kids = [kids];
      for (var j = 0; j < kids.length; j++) {
        var kid = kids[j]; if (kid == null || kid === false) continue;
        el.appendChild(typeof kid === 'object' ? kid : document.createTextNode(String(kid)));
      }
    }
    return el;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function mount(node) { clear(app); app.appendChild(node); }
  var toastTimer;
  function toast(msg, isErr) {
    toastEl.textContent = msg; toastEl.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.className = 'toast'; }, 3000);
  }

  // ---- In-browser mock backend ----
  var COMPANY_LABELS = { heavy: 'Deluxe Heavy Equipment Rental', energy: 'Deluxe Energy Solutions' };
  var COMPANY_COLORS = { heavy: '#152B54', energy: '#E8A93A' };
  var GENERATOR_STATUSES = ['available', 'on_rent', 'workshop', 'breakdown', 'outside'];
  var PIPELINES = {
    scheduled: ['Assigned', 'En Route', 'On Site', 'Completed'],
    breakdown: ['Reported', 'Assigned', 'En Route', 'On Site', 'Resolved'],
    workshop: ['Intake', 'Diagnosis', 'Repair', 'Testing', 'Ready'],
    outside: ['Sent Out', 'With Vendor', 'Returned']
  };
  var JOB_TYPES = Object.keys(PIPELINES);
  var JOB_TYPE_LABELS = { scheduled: 'Scheduled service', breakdown: 'Breakdown', workshop: 'Workshop repair', outside: 'Outside repair' };
  var META = { companies: ['heavy', 'energy'], companyLabels: COMPANY_LABELS, companyColors: COMPANY_COLORS,
    generatorStatuses: GENERATOR_STATUSES, jobTypes: JOB_TYPES, jobTypeLabels: JOB_TYPE_LABELS, pipelines: PIPELINES };
  var STORE_KEY = 'deluxe_ops_demo_db_v1';
  var TOKEN_KEY = 'deluxe_ops_demo_token';
  var DB;

  function ls(get, val) {
    try { if (get) return localStorage.getItem(STORE_KEY); localStorage.setItem(STORE_KEY, val); }
    catch (e) { return null; }
  }
  function saveDB() { ls(false, JSON.stringify(DB)); }
  function nowStr() { var d = new Date(); return d.toISOString().slice(0, 10) + ' ' + d.toTimeString().slice(0, 5); }

  function seedDB() {
    var users = [
      { username: 'opsadmin', displayName: 'Operations Admin', role: 'admin' },
      { username: 'sara', displayName: 'Sara (Ops Head)', role: 'ops_head' },
      { username: 'rahul', displayName: 'Rahul Kumar', role: 'technician' },
      { username: 'imran', displayName: 'Imran Q.', role: 'technician' },
      { username: 'joseph', displayName: 'Joseph M.', role: 'technician' }
    ];
    var gens = [
      { dg_number: 'DG-114', kva: 500, company: 'heavy', status: 'on_rent', client: 'ADNOC', location: 'Al Reem Island' },
      { dg_number: 'DG-220', kva: 250, company: 'energy', status: 'breakdown', client: 'Emirates Steel', location: 'Musaffah' },
      { dg_number: 'DG-330', kva: 1000, company: 'heavy', status: 'workshop', client: '', location: 'Deluxe Workshop' },
      { dg_number: 'DG-410', kva: 400, company: 'energy', status: 'on_rent', client: 'Aldar', location: 'Yas Island' },
      { dg_number: 'DG-512', kva: 750, company: 'heavy', status: 'outside', client: 'NPCC', location: 'Al Habtoor Motors' },
      { dg_number: 'DG-088', kva: 150, company: 'energy', status: 'on_rent', client: 'Etihad', location: 'Khalifa City' }
    ].map(function (g, i) { g.id = i + 1; return g; });
    var byDg = {}; gens.forEach(function (g) { byDg[g.dg_number] = g; });

    var jobSpecs = [
      ['scheduled', 'DG-114', 'rahul', 'En Route', { title: 'Monthly 250h service' }],
      ['breakdown', 'DG-220', 'rahul', 'Reported', { title: 'Generator will not start' }],
      ['breakdown', 'DG-088', 'imran', 'On Site', { title: 'Overheating alarm' }],
      ['workshop', 'DG-330', 'joseph', 'Diagnosis', { title: 'Alternator noise investigation' }],
      ['outside', 'DG-512', 'joseph', 'With Vendor', { title: 'Control panel rebuild', vendor: 'Al Habtoor Motors' }],
      ['scheduled', 'DG-410', 'imran', 'On Site', { title: 'Quarterly inspection' }]
    ];
    var jobs = [], events = [], jid = 0;
    jobSpecs.forEach(function (sp) {
      var g = byDg[sp[1]], pipe = PIPELINES[sp[0]], stage = sp[3], terminal = pipe[pipe.length - 1] === stage, id = ++jid, extra = sp[4] || {};
      jobs.push({ id: id, type: sp[0], generator_id: g.id, company: g.company, stage: stage, state: terminal ? 'done' : 'open',
        assigned_tech: sp[2], title: extra.title || null, description: extra.description || null, client: g.client, location: g.location,
        vendor: extra.vendor || null, created_by: 'opsadmin', created_at: nowStr(), updated_at: nowStr() });
      events.push({ job_id: id, username: 'opsadmin', event: 'created', detail: JOB_TYPE_LABELS[sp[0]] + ' - ' + pipe[0], at: nowStr() });
      events.push({ job_id: id, username: 'opsadmin', event: 'assigned', detail: sp[2], at: nowStr() });
      if (stage !== pipe[0]) events.push({ job_id: id, username: sp[2], event: 'stage', detail: stage, at: nowStr() });
    });
    var due = { 'DG-114': 1, 'DG-088': 3, 'DG-410': 6, 'DG-330': 12, 'DG-220': 0 };
    var serviceDue = Object.keys(due).map(function (dg) { return { dg_number: dg, days_remaining: due[dg], company: byDg[dg].company, updated_by: 'sara', updated_at: nowStr() }; });
    var alerts = [
      { id: 1, tech_username: 'rahul', message: 'Bring the 500 KVA service kit — DG-114 filters are due.', level: 'info', created_by: 'opsadmin', acknowledged: 0, created_at: nowStr() },
      { id: 2, tech_username: 'rahul', message: 'Head to Musaffah first: DG-220 breakdown is a priority.', level: 'urgent', created_by: 'sara', acknowledged: 0, created_at: nowStr() }
    ];
    DB = { users: users, generators: gens, jobs: jobs, events: events, serviceDue: serviceDue, alerts: alerts, seq: { job: jid, gen: gens.length, alert: 2 } };
    saveDB();
  }
  function loadDB() { var raw = ls(true); if (raw) { try { DB = JSON.parse(raw); return; } catch (e) {} } seedDB(); }
  function resetDB() { try { localStorage.removeItem(STORE_KEY); } catch (e) {} seedDB(); }
  function token() { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return DB && DB._tok; } }
  function setToken(t) { try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch (e) {} if (DB) DB._tok = t || null; }

  function userByName(n) { return DB.users.filter(function (u) { return u.username === n; })[0]; }
  function currentUser() { return userByName(token()); }
  function genById(id) { return DB.generators.filter(function (g) { return g.id === Number(id); })[0]; }
  function genByDg(dg) { return DB.generators.filter(function (g) { return g.dg_number === dg; })[0]; }
  function mapJob(j) {
    var g = genById(j.generator_id) || {}; var u = userByName(j.assigned_tech) || {};
    return Object.assign({}, j, { dg_number: g.dg_number || null, kva: g.kva || null, gen_status: g.status || null,
      tech_name: u.displayName || null, pipeline: PIPELINES[j.type] || [], typeLabel: JOB_TYPE_LABELS[j.type] || j.type });
  }
  function err(msg) { return new Error(msg); }

  function mockApi(path, opts) {
    opts = opts || {}; var method = opts.method || 'GET'; var body = opts.body || {};
    var q = ''; var qi = path.indexOf('?'); if (qi >= 0) { q = path.slice(qi + 1); path = path.slice(0, qi); }
    var seg = path.split('/').filter(Boolean);
    var me = currentUser();
    return new Promise(function (resolve, reject) {
      try { resolve(route()); } catch (e) { reject(e); }
      function route() {
        if (path === '/api/ops/me') {
          if (!me) throw err('unauthorized');
          return { username: me.username, displayName: me.displayName, role: me.role, isAdmin: me.role === 'admin', meta: META };
        }
        if (!me) throw err('Please choose a role to continue');
        var role = me.role;
        function needStaff() { if (role !== 'admin' && role !== 'ops_head') throw err('This action requires admin or ops head'); }
        function needAdmin() { if (role !== 'admin') throw err('This action requires admin'); }

        if (path === '/api/ops/generators' && method === 'GET')
          return DB.generators.slice().sort(function (a, b) { return (a.company + a.dg_number).localeCompare(b.company + b.dg_number); });
        if (path === '/api/ops/generators' && method === 'POST') {
          needAdmin(); if (!body.dg_number) throw err('DG number is required');
          if (genByDg(body.dg_number)) throw err('A generator with that DG number already exists');
          var g = { id: ++DB.seq.gen, dg_number: body.dg_number, kva: body.kva != null ? Number(body.kva) : null, company: body.company, status: body.status || 'available', client: body.client || '', location: body.location || '' };
          DB.generators.push(g); saveDB(); return g;
        }
        if (seg[2] === 'generators' && seg[3] && method === 'PUT') {
          needAdmin(); var ge = genById(seg[3]); if (!ge) throw err('Generator not found');
          ['dg_number', 'company', 'status', 'client', 'location'].forEach(function (k) { if (body[k] !== undefined) ge[k] = body[k]; });
          if (body.kva !== undefined) ge.kva = body.kva != null ? Number(body.kva) : null; saveDB(); return ge;
        }
        if (seg[2] === 'generators' && seg[3] && method === 'DELETE') { needAdmin(); DB.generators = DB.generators.filter(function (x) { return x.id !== Number(seg[3]); }); saveDB(); return { ok: true }; }

        if (path === '/api/ops/technicians' && method === 'GET')
          return DB.users.filter(function (u) { return u.role === 'technician'; }).map(function (u) { return { username: u.username, displayName: u.displayName }; });
        if (path === '/api/ops/users' && method === 'GET') { needAdmin(); return DB.users.map(function (u) { return { username: u.username, displayName: u.displayName, role: u.role }; }); }
        if (path === '/api/ops/technicians' && method === 'POST') {
          needAdmin(); if (!body.username || !body.password) throw err('Username and password are required');
          if (String(body.password).length < 6) throw err('Password must be at least 6 characters');
          if (userByName(body.username)) throw err('That username already exists');
          DB.users.push({ username: body.username, displayName: body.displayName || body.username, role: body.role || 'technician' }); saveDB(); return { ok: true };
        }
        if (seg[2] === 'users' && seg[4] === 'role' && method === 'PUT') {
          needAdmin(); var u = userByName(seg[3]); if (!u) throw err('User not found');
          if (body.role) u.role = body.role; if (body.displayName !== undefined) u.displayName = body.displayName; saveDB(); return { ok: true };
        }
        if (seg[1] === 'users' && seg[3] === 'password' && method === 'POST') return { ok: true };

        if (path === '/api/ops/jobs' && method === 'GET') {
          var list = DB.jobs.slice();
          if (role === 'technician') list = list.filter(function (j) { return j.assigned_tech === me.username; });
          list.sort(function (a, b) {
            var ap = (a.type === 'breakdown' && a.state === 'open') ? 0 : 1, bp = (b.type === 'breakdown' && b.state === 'open') ? 0 : 1;
            if (ap !== bp) return ap - bp; return b.id - a.id;
          });
          return list.map(mapJob);
        }
        if (seg[2] === 'jobs' && seg[3] && !seg[4] && method === 'GET') {
          var j = DB.jobs.filter(function (x) { return x.id === Number(seg[3]); })[0]; if (!j) throw err('Job not found');
          if (role === 'technician' && j.assigned_tech !== me.username) throw err('That job is not assigned to you');
          return Object.assign({}, mapJob(j), { events: DB.events.filter(function (e) { return e.job_id === j.id; }) });
        }
        if (path === '/api/ops/jobs' && method === 'POST') {
          needAdmin(); var pipe = PIPELINES[body.type]; if (!pipe) throw err('Unknown job type');
          var g2 = body.generator_id ? genById(body.generator_id) : null; var id = ++DB.seq.job;
          var nj = { id: id, type: body.type, generator_id: g2 ? g2.id : null, company: body.company, stage: pipe[0], state: 'open',
            assigned_tech: body.assigned_tech || null, title: body.title || null, description: body.description || null,
            client: body.client || (g2 && g2.client) || null, location: body.location || (g2 && g2.location) || null, vendor: body.vendor || null,
            created_by: me.username, created_at: nowStr(), updated_at: nowStr() };
          DB.jobs.push(nj);
          DB.events.push({ job_id: id, username: me.username, event: 'created', detail: JOB_TYPE_LABELS[body.type] + ' - ' + pipe[0], at: nowStr() });
          if (body.assigned_tech) DB.events.push({ job_id: id, username: me.username, event: 'assigned', detail: body.assigned_tech, at: nowStr() });
          saveDB(); return mapJob(nj);
        }
        if (seg[2] === 'jobs' && seg[4] === 'assign' && method === 'PUT') {
          needStaff(); var j3 = DB.jobs.filter(function (x) { return x.id === Number(seg[3]); })[0]; if (!j3) throw err('Job not found');
          j3.assigned_tech = body.tech || null; j3.updated_at = nowStr();
          DB.events.push({ job_id: j3.id, username: me.username, event: body.tech ? 'assigned' : 'unassigned', detail: body.tech || null, at: nowStr() }); saveDB(); return mapJob(j3);
        }
        if (seg[2] === 'jobs' && seg[4] === 'stage' && method === 'PUT') {
          var j4 = DB.jobs.filter(function (x) { return x.id === Number(seg[3]); })[0]; if (!j4) throw err('Job not found');
          if (role === 'technician' && j4.assigned_tech !== me.username) throw err('That job is not assigned to you');
          var pipe4 = PIPELINES[j4.type]; if (pipe4.indexOf(body.stage) < 0) throw err('Invalid stage');
          j4.stage = body.stage; j4.state = (pipe4[pipe4.length - 1] === body.stage) ? 'done' : 'open'; j4.updated_at = nowStr();
          DB.events.push({ job_id: j4.id, username: me.username, event: 'stage', detail: body.stage, at: nowStr() }); saveDB(); return mapJob(j4);
        }
        if (seg[2] === 'jobs' && seg[3] && method === 'DELETE') {
          needAdmin(); DB.jobs = DB.jobs.filter(function (x) { return x.id !== Number(seg[3]); });
          DB.events = DB.events.filter(function (e) { return e.job_id !== Number(seg[3]); }); saveDB(); return { ok: true };
        }

        if (path === '/api/ops/service-due' && method === 'GET') return DB.serviceDue.slice().sort(function (a, b) { return a.days_remaining - b.days_remaining; });
        if (path === '/api/ops/service-due' && method === 'POST') {
          needStaff(); if (!body.dgNumber) throw err('DG number is required'); if (isNaN(Number(body.daysRemaining))) throw err('Days remaining must be a number');
          var g5 = genByDg(body.dgNumber); var ex = DB.serviceDue.filter(function (d) { return d.dg_number === body.dgNumber; })[0];
          if (ex) { ex.days_remaining = Number(body.daysRemaining); ex.updated_by = me.username; ex.updated_at = nowStr(); }
          else DB.serviceDue.push({ dg_number: body.dgNumber, days_remaining: Number(body.daysRemaining), company: g5 && g5.company, updated_by: me.username, updated_at: nowStr() });
          saveDB(); return { ok: true };
        }
        if (seg[2] === 'service-due' && seg[3] && method === 'DELETE') { needStaff(); var dg = decodeURIComponent(seg[3]); DB.serviceDue = DB.serviceDue.filter(function (d) { return d.dg_number !== dg; }); saveDB(); return { ok: true }; }

        if (path === '/api/ops/tech-alerts' && method === 'GET') {
          if (role === 'technician') return DB.alerts.filter(function (a) { return a.tech_username === me.username; }).sort(alertSort);
          var tq = qparam(q, 'tech'); var list2 = tq ? DB.alerts.filter(function (a) { return a.tech_username === tq; }) : DB.alerts.slice(); return list2.sort(alertSort);
        }
        if (path === '/api/ops/tech-alerts/counts' && method === 'GET') { needStaff(); var m = {}; DB.alerts.forEach(function (a) { if (!a.acknowledged) m[a.tech_username] = (m[a.tech_username] || 0) + 1; }); return m; }
        if (path === '/api/ops/tech-alerts' && method === 'POST') {
          needStaff(); var tgt = userByName(body.tech); if (!tgt || tgt.role !== 'technician') throw err('Pick a technician');
          if (!body.message || !body.message.trim()) throw err('Alert message is required');
          var a = { id: ++DB.seq.alert, tech_username: body.tech, message: body.message.trim(), level: body.level === 'urgent' ? 'urgent' : 'info', created_by: me.username, acknowledged: 0, created_at: nowStr() };
          DB.alerts.push(a); saveDB(); return a;
        }
        if (seg[2] === 'tech-alerts' && seg[4] === 'ack' && method === 'POST') {
          var a2 = DB.alerts.filter(function (x) { return x.id === Number(seg[3]); })[0]; if (!a2) throw err('Alert not found');
          if (role === 'technician' && a2.tech_username !== me.username) throw err('That alert is not yours');
          a2.acknowledged = 1; a2.acknowledged_at = nowStr(); saveDB(); return a2;
        }
        if (seg[2] === 'tech-alerts' && seg[3] && method === 'DELETE') { needStaff(); DB.alerts = DB.alerts.filter(function (x) { return x.id !== Number(seg[3]); }); saveDB(); return { ok: true }; }

        throw err('Not found: ' + method + ' ' + path);
      }
    });
  }
  function alertSort(a, b) { if (a.acknowledged !== b.acknowledged) return a.acknowledged - b.acknowledged; return b.id - a.id; }
  function qparam(q, key) { var parts = q.split('&'); for (var i = 0; i < parts.length; i++) { var kv = parts[i].split('='); if (kv[0] === key) return decodeURIComponent(kv[1] || ''); } return ''; }

  async function api(path, opts) { return mockApi(path, opts); }

  function coLabel(co) { return co === 'heavy' ? 'Deluxe HE' : co === 'energy' ? 'Deluxe Energy' : co; }
  function coColor(co) { return (state.meta && state.meta.companyColors[co]) || '#4a6198'; }
  function companyChip(co) { return h('span', { class: 'chip chip-co ' + co, style: { background: coColor(co) } }, coLabel(co)); }
  function statusLabel(s) { return (s || '').replace(/_/g, ' '); }

  function renderLogin(msg) {
    var choices = [
      { u: 'opsadmin', ic: '🛠️', t: 'Admin', s: 'Operations Admin — full control' },
      { u: 'sara', ic: '📋', t: 'Ops Head', s: 'Sara — board & assignments' },
      { u: 'rahul', ic: '🔧', t: 'Technician · Rahul', s: 'Has a breakdown + due-tomorrow service' },
      { u: 'imran', ic: '🔧', t: 'Technician · Imran', s: 'Overheating call-out on site' }
    ];
    var pick = h('div', { class: 'pick' }, choices.map(function (c) {
      return h('button', { class: 'pick-btn', onclick: function () { setToken(c.u); boot(); } }, h('div', { class: 'pb-ic' }, c.ic), h('div', null, h('b', null, c.t), h('small', null, c.s)));
    }));
    mount(h('div', { class: 'login-wrap' }, h('div', { class: 'login-card' },
      h('div', { class: 'brand' }, h('div', { class: 'brand-badge' }, 'DO'), h('div', null, h('h1', null, 'Deluxe Ops'), h('p', null, 'Generator operations · Abu Dhabi'))),
      msg ? h('div', { class: 'err' }, msg) : null,
      h('label', null, 'Open the demo as…'), pick,
      h('div', { class: 'demo-note' }, 'This is a self-contained demo — everything runs in your browser with sample data, no login or server needed. Advance job stages, send alerts, add generators; your changes are saved on this device. ',
        h('a', { href: '#', onclick: function (e) { e.preventDefault(); resetDB(); toast('Demo data reset'); renderLogin(); } }, 'Reset demo data'))
    )));
  }
  function logout() { setToken(null); state.me = null; renderLogin(); }

  function renderChrome(tabs, activeTab, onTab, fill) {
    var me = state.me; var content = h('div', { class: 'container' });
    var tabBar = h('div', { class: 'tabs' }, tabs.map(function (t) { return h('button', { class: 'tab' + (t.id === activeTab ? ' active' : ''), onclick: function () { onTab(t.id); } }, t.label); }));
    var shell = h('div', null,
      h('div', { class: 'topbar' }, h('div', { class: 'brand-badge' }, 'DO'), h('div', { class: 'topbar-title' }, 'Deluxe Ops', h('small', null, 'Generator Operations')),
        h('div', { class: 'spacer' }), h('button', { class: 'btn btn-ghost btn-sm', onclick: function () { state.rerender && state.rerender(); toast('Refreshed'); } }, '↻ Refresh'),
        h('div', { class: 'whoami' }, h('div', { class: 'username' }, me.displayName || me.username), h('div', { class: 'role' }, me.role)),
        h('button', { class: 'btn btn-ghost btn-sm', onclick: logout }, 'Switch role')),
      tabs.length > 1 ? tabBar : null, content);
    mount(shell); fill(content);
  }

  async function boot() {
    if (!token()) return renderLogin();
    try { var me = await api('/api/ops/me'); state.me = me; state.meta = me.meta; if (me.role === 'technician') return renderTechnician(); return renderStaff(); }
    catch (e) { renderLogin(e.message); }
  }

  function renderStaff() {
    var isAdmin = state.me.role === 'admin';
    var tabs = [{ id: 'board', label: 'Job Board' }];
    if (isAdmin) tabs.push({ id: 'fleet', label: 'Generators' });
    if (isAdmin) tabs.push({ id: 'techs', label: 'Technicians' });
    tabs.push({ id: 'service', label: 'Service Due' });
    var activeTab = 'board';
    function go(tab) { activeTab = tab; draw(); }
    function draw() { var renderer = { board: viewBoard, fleet: viewFleet, techs: viewTechs, service: viewServiceDue }[activeTab]; state.rerender = draw; renderChrome(tabs, activeTab, go, function (content) { renderer(content); }); }
    draw();
  }

  async function viewBoard(content) {
    clear(content); content.appendChild(h('div', { class: 'muted' }, 'Loading board…'));
    var isAdmin = state.me.role === 'admin'; var jobs, techs, dueMap = {};
    try { jobs = await api('/api/ops/jobs'); techs = await api('/api/ops/technicians'); var due = await api('/api/ops/service-due'); due.forEach(function (d) { dueMap[d.dg_number] = d; }); }
    catch (e) { clear(content); content.appendChild(errBox(e)); return; }
    var fCompany = h('select', null, opt('', 'All companies'), opt('heavy', 'Deluxe HE'), opt('energy', 'Deluxe Energy'));
    var fType = h('select', null, [opt('', 'All types')].concat(state.meta.jobTypes.map(function (t) { return opt(t, state.meta.jobTypeLabels[t]); })));
    var fState = h('select', null, opt('', 'Open + done'), opt('open', 'Open only'), opt('done', 'Completed'));
    [fCompany, fType, fState].forEach(function (s) { s.addEventListener('change', renderList); });
    clear(content);
    content.appendChild(h('div', { class: 'section-head' }, h('h2', null, 'Job Board'), h('span', { class: 'muted' }, jobs.length + ' job(s)'), h('div', { class: 'spacer' }),
      isAdmin ? h('button', { class: 'btn btn-gold', onclick: function () { openJobModal(techs); } }, '+ New Job') : null));
    content.appendChild(h('div', { class: 'row', style: { marginBottom: '1rem' } }, fCompany, fType, fState));
    var listWrap = h('div'); content.appendChild(listWrap);
    function renderList() {
      var filtered = jobs.filter(function (j) { if (fCompany.value && j.company !== fCompany.value) return false; if (fType.value && j.type !== fType.value) return false; if (fState.value && j.state !== fState.value) return false; return true; });
      clear(listWrap); if (!filtered.length) { listWrap.appendChild(h('div', { class: 'empty' }, 'No jobs match these filters.')); return; }
      listWrap.appendChild(h('div', { class: 'grid' }, filtered.map(function (j) { return boardCard(j, techs, dueMap, isAdmin); })));
    }
    renderList();
  }
  function boardCard(j, techs, dueMap, isAdmin) {
    var due = j.dg_number && dueMap[j.dg_number]; var pipe = j.pipeline || []; var stageIdx = pipe.indexOf(j.stage);
    var assignSel = h('select', null, [opt('', '— unassigned —')].concat(techs.map(function (t) { return opt(t.username, t.displayName, t.username === j.assigned_tech); })));
    assignSel.value = j.assigned_tech || '';
    assignSel.addEventListener('change', async function () { try { await api('/api/ops/jobs/' + j.id + '/assign', { method: 'PUT', body: { tech: assignSel.value } }); toast('Assignment updated'); state.rerender(); } catch (e) { toast(e.message, true); } });
    return h('div', { class: 'card company-strip', style: { '--co': coColor(j.company) } },
      h('div', { class: 'between' }, h('div', { class: 'row' }, h('span', { class: 'chip chip-type' }, j.typeLabel), j.type === 'breakdown' && j.state === 'open' ? h('span', { class: 'chip chip-urgent' }, 'URGENT') : null), companyChip(j.company)),
      h('h3', { class: 'mt' }, j.title || (j.typeLabel + (j.dg_number ? ' · ' + j.dg_number : ''))),
      h('div', { class: 'muted' }, (j.dg_number ? 'DG ' + j.dg_number + (j.kva ? ' · ' + j.kva + ' KVA' : '') : 'No generator') + (j.client ? ' · ' + j.client : '') + (j.location ? ' · ' + j.location : '')),
      j.vendor ? h('div', { class: 'muted' }, 'Vendor: ' + j.vendor) : null,
      pipelineBar(pipe, stageIdx, j.type === 'breakdown'),
      h('div', { class: 'row mt' }, h('span', { class: 'chip chip-stage' + (j.state === 'done' ? ' done' : '') }, j.stage), due ? dueTag(due.days_remaining) : null),
      h('label', { style: { marginBottom: '0' } }, 'Assigned technician'), assignSel,
      isAdmin ? h('div', { class: 'row mt' }, h('button', { class: 'btn btn-ghost btn-sm', onclick: function () { openJobDetail(j.id); } }, 'History'), h('button', { class: 'btn btn-danger btn-sm', onclick: function () { deleteJob(j.id); } }, 'Delete'))
        : h('button', { class: 'btn btn-ghost btn-sm mt', onclick: function () { openJobDetail(j.id); } }, 'History'));
  }
  function pipelineBar(pipe, stageIdx, urgent) { return h('div', { class: 'pipeline' }, pipe.map(function (s, i) { return h('div', { class: 'seg' + (i <= stageIdx ? ' on' : '') + (urgent && i <= stageIdx ? ' urgent' : ''), title: s }); })); }
  function dueTag(days) { var cls = days <= 1 ? 'chip-urgent' : days <= 7 ? 'chip-type' : 'chip-stage'; var txt = days < 0 ? 'Service overdue' : days === 0 ? 'Service due today' : 'Service in ' + days + 'd'; return h('span', { class: 'chip ' + cls }, txt); }
  async function deleteJob(id) { try { await api('/api/ops/jobs/' + id, { method: 'DELETE' }); toast('Job deleted'); state.rerender(); } catch (e) { toast(e.message, true); } }

  async function openJobModal(techs) {
    var gens; try { gens = await api('/api/ops/generators'); } catch (e) { toast(e.message, true); return; }
    var typeSel = h('select', null, state.meta.jobTypes.map(function (t) { return opt(t, state.meta.jobTypeLabels[t]); }));
    var coSel = h('select', null, opt('heavy', 'Deluxe HE'), opt('energy', 'Deluxe Energy'));
    var genSel = h('select', null, [opt('', '— none —')].concat(gens.map(function (g) { return opt(String(g.id), g.dg_number + (g.kva ? ' (' + g.kva + ' KVA)' : '') + ' · ' + coLabel(g.company)); })));
    genSel.addEventListener('change', function () { var g = gens.filter(function (x) { return String(x.id) === genSel.value; })[0]; if (g) { coSel.value = g.company; if (g.client) clientIn.value = g.client; if (g.location) locIn.value = g.location; } });
    var titleIn = h('input', { type: 'text', placeholder: 'e.g. Monthly service - Site A' });
    var clientIn = h('input', { type: 'text' }); var locIn = h('input', { type: 'text' });
    var vendorIn = h('input', { type: 'text', placeholder: 'External workshop name' });
    var vendorWrap = h('div', null, h('label', null, 'Vendor (outside repair)'), vendorIn); vendorWrap.style.display = 'none';
    typeSel.addEventListener('change', function () { vendorWrap.style.display = typeSel.value === 'outside' ? 'block' : 'none'; });
    var descIn = h('textarea', { placeholder: 'Details / fault reported…' });
    var techSel = h('select', null, [opt('', '— assign later —')].concat(techs.map(function (t) { return opt(t.username, t.displayName); })));
    var er = h('div', { class: 'err' });
    async function save() {
      er.textContent = '';
      try { await api('/api/ops/jobs', { method: 'POST', body: { type: typeSel.value, company: coSel.value, generator_id: genSel.value || null, title: titleIn.value.trim() || null, description: descIn.value.trim() || null, client: clientIn.value.trim() || null, location: locIn.value.trim() || null, vendor: typeSel.value === 'outside' ? (vendorIn.value.trim() || null) : null, assigned_tech: techSel.value || null } });
        closeModal(); toast('Job created'); state.rerender(); } catch (e) { er.textContent = e.message; }
    }
    openModal('New job', [h('label', null, 'Job type'), typeSel, h('label', null, 'Company'), coSel, h('label', null, 'Generator'), genSel, h('label', null, 'Title'), titleIn, h('label', null, 'Client'), clientIn, h('label', null, 'Location'), locIn, vendorWrap, h('label', null, 'Assign technician'), techSel, h('label', null, 'Description'), descIn, er], save, 'Create job');
  }
  async function openJobDetail(id) {
    var job; try { job = await api('/api/ops/jobs/' + id); } catch (e) { toast(e.message, true); return; }
    var events = (job.events || []).map(function (ev) { return h('div', { class: 'between', style: { padding: '.4rem 0', borderBottom: '1px solid var(--line)' } }, h('div', null, h('b', null, ev.event === 'stage' ? '→ ' + ev.detail : (ev.event + (ev.detail ? ': ' + ev.detail : ''))), h('div', { class: 'muted' }, ev.username || 'system')), h('span', { class: 'muted' }, ev.at)); });
    openModal('Job history · ' + (job.dg_number || job.typeLabel), [h('div', { class: 'stack' }, events.length ? events : [h('div', { class: 'muted' }, 'No history yet.')])], null, null);
  }

  async function viewFleet(content) {
    clear(content); content.appendChild(h('div', { class: 'muted' }, 'Loading generators…'));
    var gens; try { gens = await api('/api/ops/generators'); } catch (e) { clear(content); content.appendChild(errBox(e)); return; }
    clear(content);
    content.appendChild(h('div', { class: 'section-head' }, h('h2', null, 'Generator Fleet'), h('span', { class: 'muted' }, gens.length + ' unit(s)'), h('div', { class: 'spacer' }), h('button', { class: 'btn btn-gold', onclick: function () { openGenModal(null); } }, '+ Add Generator')));
    if (!gens.length) { content.appendChild(h('div', { class: 'empty' }, 'No generators yet.')); return; }
    var rows = gens.map(function (g) {
      return h('tr', null, h('td', null, h('b', null, g.dg_number)), h('td', null, g.kva ? g.kva + ' KVA' : '—'), h('td', null, companyChip(g.company)),
        h('td', null, h('span', { class: 'row' }, h('span', { class: 'status-dot st-' + g.status }), h('span', null, statusLabel(g.status)))), h('td', null, g.client || '—'), h('td', null, g.location || '—'),
        h('td', null, h('div', { class: 'row' }, h('button', { class: 'btn btn-ghost btn-sm', onclick: function () { openGenModal(g); } }, 'Edit'), h('button', { class: 'btn btn-danger btn-sm', onclick: function () { delGen(g); } }, 'Delete'))));
    });
    content.appendChild(h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, ['DG Number', 'Rating', 'Company', 'Status', 'Client', 'Location', ''].map(function (t) { return h('th', null, t); }))), h('tbody', null, rows))));
  }
  function openGenModal(g) {
    var isEdit = !!g;
    var dgIn = h('input', { type: 'text', value: g ? g.dg_number : '', placeholder: 'e.g. DG-114' });
    var kvaIn = h('input', { type: 'number', value: g && g.kva != null ? g.kva : '', placeholder: 'e.g. 500' });
    var coSel = h('select', null, opt('heavy', 'Deluxe HE'), opt('energy', 'Deluxe Energy')); if (g) coSel.value = g.company;
    var stSel = h('select', null, state.meta.generatorStatuses.map(function (s) { return opt(s, statusLabel(s)); })); if (g) stSel.value = g.status;
    var clientIn = h('input', { type: 'text', value: g && g.client ? g.client : '' });
    var locIn = h('input', { type: 'text', value: g && g.location ? g.location : '' });
    var er = h('div', { class: 'err' });
    async function save() {
      er.textContent = ''; var body = { dg_number: dgIn.value.trim(), kva: kvaIn.value ? Number(kvaIn.value) : null, company: coSel.value, status: stSel.value, client: clientIn.value.trim(), location: locIn.value.trim() };
      try { if (isEdit) await api('/api/ops/generators/' + g.id, { method: 'PUT', body: body }); else await api('/api/ops/generators', { method: 'POST', body: body }); closeModal(); toast(isEdit ? 'Generator updated' : 'Generator added'); state.rerender(); } catch (e) { er.textContent = e.message; }
    }
    openModal(isEdit ? 'Edit generator' : 'Add generator', [h('label', null, 'DG number'), dgIn, h('label', null, 'KVA rating'), kvaIn, h('label', null, 'Company'), coSel, h('label', null, 'Status'), stSel, h('label', null, 'Current client'), clientIn, h('label', null, 'Current location'), locIn, er], save, isEdit ? 'Save changes' : 'Add generator');
  }
  async function delGen(g) { try { await api('/api/ops/generators/' + g.id, { method: 'DELETE' }); toast('Generator deleted'); state.rerender(); } catch (e) { toast(e.message, true); } }

  async function viewTechs(content) {
    clear(content); content.appendChild(h('div', { class: 'muted' }, 'Loading team…'));
    var users, counts = {}; try { users = await api('/api/ops/users'); counts = await api('/api/ops/tech-alerts/counts'); } catch (e) { clear(content); content.appendChild(errBox(e)); return; }
    clear(content);
    content.appendChild(h('div', { class: 'section-head' }, h('h2', null, 'Team & Technicians'), h('div', { class: 'spacer' }), h('button', { class: 'btn btn-gold', onclick: function () { openUserModal(); } }, '+ Add Member')));
    var rows = users.map(function (u) {
      var isTech = u.role === 'technician'; var unack = counts[u.username] || 0;
      return h('tr', null, h('td', null, h('b', null, u.displayName), u.username !== u.displayName ? h('div', { class: 'muted' }, '@' + u.username) : null),
        h('td', null, h('span', { class: 'chip chip-type' }, u.role), isTech && unack ? h('span', { class: 'chip chip-urgent', style: { marginLeft: '.35rem' } }, unack + ' alert' + (unack > 1 ? 's' : '')) : null),
        h('td', null, h('div', { class: 'row' }, isTech ? h('button', { class: 'btn btn-gold btn-sm', onclick: function () { openAlertModal(u); } }, '🔔 Alert') : null, h('button', { class: 'btn btn-ghost btn-sm', onclick: function () { openRoleModal(u); } }, 'Change role'))));
    });
    content.appendChild(h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, ['Member', 'Role', ''].map(function (t) { return h('th', null, t); }))), h('tbody', null, rows))));
  }
  async function openAlertModal(u) {
    var msgIn = h('textarea', { placeholder: 'e.g. Collect spare filters from stores before your first job', maxlength: '500' });
    var levelSel = h('select', null, opt('info', 'Info (📢 notice)'), opt('urgent', 'Urgent (🔔 ringing)'));
    var er = h('div', { class: 'err' });
    var listWrap = h('div', { class: 'stack', style: { marginTop: '1rem' } }, h('div', { class: 'muted' }, 'Loading current alerts…'));
    async function refreshList() {
      try {
        var existing = await api('/api/ops/tech-alerts?tech=' + encodeURIComponent(u.username)); clear(listWrap);
        if (!existing.length) { listWrap.appendChild(h('div', { class: 'muted' }, 'No alerts sent yet.')); return; }
        listWrap.appendChild(h('div', { class: 'muted' }, 'Sent alerts:'));
        existing.forEach(function (a) {
          listWrap.appendChild(h('div', { class: 'between', style: { padding: '.4rem 0', borderBottom: '1px solid var(--line)' } }, h('div', null, h('div', null, (a.level === 'urgent' ? '🔔 ' : '📢 ') + a.message), h('div', { class: 'muted' }, (a.acknowledged ? '✓ acknowledged' : 'waiting') + ' · ' + a.created_at)),
            h('button', { class: 'btn btn-danger btn-sm', onclick: async function () { try { await api('/api/ops/tech-alerts/' + a.id, { method: 'DELETE' }); refreshList(); } catch (e) { toast(e.message, true); } } }, 'Remove')));
        });
      } catch (e) { clear(listWrap); listWrap.appendChild(h('div', { class: 'err' }, e.message)); }
    }
    async function send() { er.textContent = ''; if (!msgIn.value.trim()) { er.textContent = 'Enter an alert message'; return; } try { await api('/api/ops/tech-alerts', { method: 'POST', body: { tech: u.username, message: msgIn.value.trim(), level: levelSel.value } }); msgIn.value = ''; toast('Alert sent to ' + u.displayName); refreshList(); } catch (e) { er.textContent = e.message; } }
    openModal('Alert · ' + u.displayName, [h('label', null, 'Message'), msgIn, h('label', null, 'Level'), levelSel, er, listWrap], send, 'Send alert'); refreshList();
  }
  function roleSelect(current) { var sel = h('select', null, opt('technician', 'Technician'), opt('ops_head', 'Ops Head'), opt('admin', 'Admin')); if (current) sel.value = current; return sel; }
  function openUserModal() {
    var nameIn = h('input', { type: 'text', placeholder: 'Full name' }); var userIn = h('input', { type: 'text', placeholder: 'login username' });
    var passIn = h('input', { type: 'password', placeholder: 'min 6 characters' }); var roleSel = roleSelect('technician'); var er = h('div', { class: 'err' });
    async function save() { er.textContent = ''; try { await api('/api/ops/technicians', { method: 'POST', body: { username: userIn.value.trim(), password: passIn.value, displayName: nameIn.value.trim(), role: roleSel.value } }); closeModal(); toast('Member added'); state.rerender(); } catch (e) { er.textContent = e.message; } }
    openModal('Add team member', [h('label', null, 'Full name'), nameIn, h('label', null, 'Username'), userIn, h('label', null, 'Password'), passIn, h('label', null, 'Role'), roleSel, er], save, 'Create account');
  }
  function openRoleModal(u) {
    var nameIn = h('input', { type: 'text', value: u.displayName }); var roleSel = roleSelect(u.role); var er = h('div', { class: 'err' });
    async function save() { er.textContent = ''; try { await api('/api/ops/users/' + u.username + '/role', { method: 'PUT', body: { role: roleSel.value, displayName: nameIn.value.trim() } }); closeModal(); toast('Role updated'); state.rerender(); } catch (e) { er.textContent = e.message; } }
    openModal('Change role · ' + u.username, [h('label', null, 'Display name'), nameIn, h('label', null, 'Role'), roleSel, er], save, 'Save');
  }

  async function viewServiceDue(content) {
    clear(content); content.appendChild(h('div', { class: 'muted' }, 'Loading…'));
    var due, gens = []; try { due = await api('/api/ops/service-due'); gens = await api('/api/ops/generators'); } catch (e) { clear(content); content.appendChild(errBox(e)); return; }
    var dgIn = h('input', { type: 'text', placeholder: 'DG number', list: 'dglist' });
    var dl = h('datalist', { id: 'dglist' }, gens.map(function (g) { return h('option', { value: g.dg_number }); }));
    var daysIn = h('input', { type: 'number', placeholder: 'days remaining' });
    var addBtn = h('button', { class: 'btn btn-gold', onclick: addDue }, 'Save');
    async function addDue() { if (!dgIn.value.trim()) { toast('DG number required', true); return; } try { await api('/api/ops/service-due', { method: 'POST', body: { dgNumber: dgIn.value.trim(), daysRemaining: Number(daysIn.value) } }); dgIn.value = ''; daysIn.value = ''; toast('Saved'); state.rerender(); } catch (e) { toast(e.message, true); } }
    clear(content);
    content.appendChild(h('div', { class: 'section-head' }, h('h2', null, 'Daily Service Feed'), h('span', { class: 'muted' }, 'From Netsonic "Machinery Service Due"')));
    content.appendChild(h('div', { class: 'card', style: { marginBottom: '1rem' } }, h('div', { class: 'muted', style: { marginBottom: '.6rem' } }, 'Enter each morning: DG number + days remaining. Technicians see these as countdown rings on their jobs.'), h('div', { class: 'row' }, dgIn, dl, daysIn, addBtn)));
    if (!due.length) { content.appendChild(h('div', { class: 'empty' }, 'No service-due entries yet.')); return; }
    var rows = due.map(function (d) { return h('tr', null, h('td', null, h('b', null, d.dg_number)), h('td', null, d.company ? companyChip(d.company) : '—'), h('td', null, dueTag(d.days_remaining)), h('td', null, h('span', { class: 'muted' }, (d.updated_by || '') + ' · ' + d.updated_at)), h('td', null, h('button', { class: 'btn btn-danger btn-sm', onclick: function () { delDue(d.dg_number); } }, 'Remove'))); });
    content.appendChild(h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, ['DG Number', 'Company', 'Countdown', 'Updated', ''].map(function (t) { return h('th', null, t); }))), h('tbody', null, rows))));
  }
  async function delDue(dg) { try { await api('/api/ops/service-due/' + encodeURIComponent(dg), { method: 'DELETE' }); toast('Removed'); state.rerender(); } catch (e) { toast(e.message, true); } }

  function renderTechnician() {
    async function draw() {
      state.rerender = draw; var content = h('div', { class: 'tech-wrap' });
      renderChrome([{ id: 'me', label: 'My Jobs' }], 'me', function () {}, function (c) { clear(c); c.appendChild(content); });
      content.appendChild(h('div', { class: 'muted' }, 'Loading your jobs…'));
      var jobs, dueMap = {}, alerts = [];
      try { jobs = await api('/api/ops/jobs'); var due = await api('/api/ops/service-due'); due.forEach(function (d) { dueMap[d.dg_number] = d; }); alerts = await api('/api/ops/tech-alerts'); } catch (e) { clear(content); content.appendChild(errBox(e)); return; }
      clear(content);
      content.appendChild(h('div', { class: 'tech-hello' }, h('h2', null, 'Hi ' + (state.me.displayName || state.me.username)), h('div', { class: 'muted' }, greeting(jobs))));
      alerts.filter(function (a) { return !a.acknowledged; }).forEach(function (a) { content.appendChild(techAlertBanner(a)); });
      var openJobs = jobs.filter(function (j) { return j.state === 'open'; });
      openJobs.filter(function (j) { return j.type === 'breakdown'; }).forEach(function (j) {
        content.appendChild(h('div', { class: 'breakdown-alarm' }, h('div', { class: 'bell' }, '🔔'), h('div', { class: 'ba-body' }, h('h3', null, 'BREAKDOWN' + (j.dg_number ? ' · DG ' + j.dg_number : '')), h('div', { class: 'ba-sub' }, (j.client || j.location || 'Urgent call-out') + ' — current stage: ' + j.stage))));
      });
      if (!jobs.length) { content.appendChild(h('div', { class: 'empty' }, 'No jobs assigned to you right now.')); return; }
      openJobs.concat(jobs.filter(function (j) { return j.state === 'done'; })).forEach(function (j) { content.appendChild(techJobCard(j, dueMap[j.dg_number])); });
    }
    draw();
  }
  function greeting(jobs) {
    var open = jobs.filter(function (j) { return j.state === 'open'; }).length; var bd = jobs.filter(function (j) { return j.type === 'breakdown' && j.state === 'open'; }).length;
    if (bd) return bd + ' urgent breakdown(s) need you now · ' + open + ' open job(s)'; if (open) return open + ' open job(s) today'; return 'All caught up — no open jobs';
  }
  function techAlertBanner(a) {
    var urgent = a.level === 'urgent';
    return h('div', { class: 'tech-alert ' + (urgent ? 'urgent' : 'info') }, h('div', { class: 'ta-icon' }, urgent ? '🔔' : '📢'), h('div', { class: 'ta-body' }, h('div', { class: 'ta-msg' }, a.message), h('div', { class: 'ta-meta' }, 'From ' + (a.created_by || 'office') + ' · ' + a.created_at)),
      h('button', { class: 'btn ' + (urgent ? 'btn-ghost' : 'btn-gold') + ' btn-sm ta-ack', onclick: function () { ackAlert(a.id); } }, 'Got it'));
  }
  async function ackAlert(id) { try { await api('/api/ops/tech-alerts/' + id + '/ack', { method: 'POST' }); toast('Alert acknowledged'); state.rerender(); } catch (e) { toast(e.message, true); } }
  function techJobCard(j, due) {
    var pipe = j.pipeline || []; var idx = pipe.indexOf(j.stage); var next = idx >= 0 && idx < pipe.length - 1 ? pipe[idx + 1] : null; var isBreakdown = j.type === 'breakdown';
    var left = h('div', { style: { flex: '1' } },
      h('div', { class: 'between' }, h('div', { class: 'row' }, h('span', { class: 'chip chip-type' }, j.typeLabel), isBreakdown && j.state === 'open' ? h('span', { class: 'chip chip-urgent' }, 'URGENT') : null), companyChip(j.company)),
      h('h3', { class: 'mt' }, (j.title || j.typeLabel) + (j.dg_number ? ' · DG ' + j.dg_number : '')),
      h('div', { class: 'muted' }, [j.kva ? j.kva + ' KVA' : null, j.client, j.location, j.vendor ? 'Vendor: ' + j.vendor : null].filter(Boolean).join(' · ') || '—'),
      j.description ? h('div', { class: 'muted mt' }, j.description) : null,
      pipelineBar(pipe, idx, isBreakdown),
      h('div', { class: 'row mt' }, h('span', { class: 'chip chip-stage' + (j.state === 'done' ? ' done' : '') }, 'Now: ' + j.stage)),
      h('div', { class: 'stage-btns' }, next ? h('button', { class: 'btn btn-gold btn-sm', onclick: function () { advance(j.id, next); } }, 'Mark: ' + next + ' ▸') : null, j.state === 'done' ? h('span', { class: 'chip chip-stage done' }, '✓ ' + j.stage) : null));
    var kids = [left]; if (due) kids.unshift(ringWrap(due.days_remaining));
    return h('div', { class: 'card company-strip job-card', style: { '--co': coColor(j.company) } }, h('div', { class: 'ring-wrap' }, kids));
  }
  function ringWrap(days) {
    var NS = 'http://www.w3.org/2000/svg'; var size = 92, stroke = 9, r = (size - stroke) / 2, c = 2 * Math.PI * r, max = 14;
    var frac = Math.max(0, Math.min(1, days / max)); var color, pulse = false;
    if (days <= 1) { color = 'var(--red)'; pulse = true; } else if (days <= 3) { color = 'var(--red)'; } else if (days <= 7) { color = 'var(--gold)'; } else { color = 'var(--green)'; }
    var svg = document.createElementNS(NS, 'svg'); svg.setAttribute('width', size); svg.setAttribute('height', size); svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
    var bg = document.createElementNS(NS, 'circle'); setNS(bg, { cx: size / 2, cy: size / 2, r: r, fill: 'none', stroke: 'var(--surface-2)', 'stroke-width': stroke });
    var fg = document.createElementNS(NS, 'circle'); setNS(fg, { cx: size / 2, cy: size / 2, r: r, fill: 'none', stroke: color, 'stroke-width': stroke, 'stroke-linecap': 'round', 'stroke-dasharray': c, 'stroke-dashoffset': c * (1 - frac) });
    svg.appendChild(bg); svg.appendChild(fg);
    var label = days < 0 ? 'over' : days === 0 ? 'today' : 'days left'; var num = days < 0 ? '!' : String(days);
    return h('div', { class: 'ring' + (pulse ? ' pulse' : '') }, svg, h('div', { class: 'ring-num' }, h('b', { style: { color: color } }, num), h('span', null, label)));
  }
  function setNS(el, attrs) { for (var k in attrs) el.setAttributeNS(null, k, attrs[k]); }
  async function advance(id, stage) { try { await api('/api/ops/jobs/' + id + '/stage', { method: 'PUT', body: { stage: stage } }); toast('Updated to ' + stage); state.rerender(); } catch (e) { toast(e.message, true); } }

  function openModal(title, bodyNodes, onSave, saveLabel) {
    closeModal();
    var actions = [h('button', { class: 'btn btn-ghost', onclick: closeModal }, onSave ? 'Cancel' : 'Close')];
    if (onSave) actions.push(h('button', { class: 'btn btn-gold', onclick: onSave }, saveLabel || 'Save'));
    var back = h('div', { class: 'modal-back', id: 'modal-back', onclick: function (e) { if (e.target.id === 'modal-back') closeModal(); } }, h('div', { class: 'modal' }, h('h3', null, title), h('div', { class: 'stack' }, bodyNodes), h('div', { class: 'modal-actions' }, actions)));
    document.body.appendChild(back);
  }
  function closeModal() { var m = document.getElementById('modal-back'); if (m) m.remove(); }
  function opt(value, label, selected) { var o = h('option', { value: value }, label); if (selected) o.selected = true; return o; }
  function errBox(e) { return h('div', { class: 'empty' }, 'Could not load: ' + (e.message || e)); }

  // Register the demo service worker so the installed app works fully offline.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('/ops-demo-sw.js', { scope: '/ops/demo' }).catch(function () {}); });
  }

  loadDB();
  boot();
})();
