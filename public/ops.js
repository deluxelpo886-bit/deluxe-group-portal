/* Deluxe Ops - generator operations tracker (frontend SPA).
   Talks to /api/ops/*. Auth token is the same JWT issued by /api/login.
   Everything is built with DOM APIs (no inline handlers) so the strict CSP
   on this server is satisfied without per-page script hashes. */
(function () {
  'use strict';

  var TOKEN_KEY = 'deluxe_ops_token';
  var app = document.getElementById('app');
  var toastEl = document.getElementById('toast');

  var state = { me: null, meta: null, rerender: null };

  // ---------- tiny DOM helper ----------
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        var v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'style' && typeof v === 'object') { for (var s in v) el.style[s] = v[s]; }
        else el.setAttribute(k, v);
      }
    }
    for (var i = 2; i < arguments.length; i++) {
      var kids = arguments[i];
      if (!Array.isArray(kids)) kids = [kids];
      for (var j = 0; j < kids.length; j++) {
        var kid = kids[j];
        if (kid == null || kid === false) continue;
        el.appendChild(typeof kid === 'object' ? kid : document.createTextNode(String(kid)));
      }
    }
    return el;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function mount(node) { clear(app); app.appendChild(node); }

  var toastTimer;
  function toast(msg, isErr) {
    toastEl.textContent = msg;
    toastEl.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.className = 'toast'; }, 3200);
  }

  // ---------- API ----------
  function token() { return localStorage.getItem(TOKEN_KEY); }
  function setToken(t) { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); }

  async function api(path, opts) {
    opts = opts || {};
    var headers = opts.headers || {};
    if (opts.body !== undefined) { headers['Content-Type'] = 'application/json'; }
    if (token()) headers['Authorization'] = 'Bearer ' + token();
    var res = await fetch(path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
    });
    var data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (res.status === 401) { setToken(null); renderLogin('Session expired - please sign in again.'); throw new Error('unauthorized'); }
    if (!res.ok) { throw new Error((data && data.error) || ('Request failed (' + res.status + ')')); }
    return data;
  }

  // ---------- brand helpers ----------
  function coLabel(co) { return co === 'heavy' ? 'Deluxe HE' : co === 'energy' ? 'Deluxe Energy' : co; }
  function coColor(co) { return (state.meta && state.meta.companyColors[co]) || '#4a6198'; }
  function companyChip(co) {
    return h('span', { class: 'chip chip-co ' + co, style: { background: coColor(co) } }, coLabel(co));
  }
  function statusLabel(s) { return (s || '').replace(/_/g, ' '); }

  // ============================================================
  // Login
  // ============================================================
  function renderLogin(msg) {
    var userIn = h('input', { type: 'text', autocomplete: 'username', autofocus: 'true' });
    var passIn = h('input', { type: 'password', autocomplete: 'current-password' });
    var errEl = h('div', { class: 'err' }, msg || '');
    var btn = h('button', { class: 'btn btn-gold btn-full', type: 'submit' }, 'Sign in');

    async function submit(e) {
      e.preventDefault();
      errEl.textContent = '';
      btn.disabled = true; btn.textContent = 'Signing in…';
      try {
        var r = await fetch('/api/login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: userIn.value.trim(), password: passIn.value })
        });
        var data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Login failed');
        setToken(data.token);
        await boot();
      } catch (err) {
        errEl.textContent = err.message;
        btn.disabled = false; btn.textContent = 'Sign in';
      }
    }

    var form = h('form', { onsubmit: submit, class: 'stack' },
      h('label', null, 'Username'), userIn,
      h('label', null, 'Password'), passIn,
      errEl, btn
    );
    mount(h('div', { class: 'login-wrap' },
      h('div', { class: 'login-card' },
        h('div', { class: 'brand' },
          h('div', { class: 'brand-badge' }, 'DO'),
          h('div', null,
            h('h1', null, 'Deluxe Ops'),
            h('p', null, 'Generator operations · Abu Dhabi')
          )
        ),
        form
      )
    ));
  }

  // ============================================================
  // App shell (topbar + role tabs)
  // ============================================================
  function logout() { setToken(null); state.me = null; renderLogin(); }

  function renderChrome(tabs, activeTab, onTab, fill) {
    var me = state.me;
    var content = h('div', { class: 'container' });
    var tabBar = h('div', { class: 'tabs' }, tabs.map(function (t) {
      return h('button', {
        class: 'tab' + (t.id === activeTab ? ' active' : ''),
        onclick: function () { onTab(t.id); }
      }, t.label);
    }));
    var shell = h('div', null,
      h('div', { class: 'topbar' },
        h('div', { class: 'brand-badge' }, 'DO'),
        h('div', { class: 'topbar-title' }, 'Deluxe Ops', h('small', null, 'Generator Operations')),
        h('div', { class: 'spacer' }),
        h('button', { class: 'btn btn-ghost btn-sm', onclick: function () { state.rerender && state.rerender(); toast('Refreshed'); } }, '↻ Refresh'),
        h('div', { class: 'whoami' },
          h('div', { class: 'username' }, me.displayName || me.username),
          h('div', { class: 'role' }, me.role)
        ),
        h('button', { class: 'btn btn-ghost btn-sm', onclick: logout }, 'Sign out')
      ),
      tabs.length > 1 ? tabBar : null,
      content
    );
    mount(shell);
    fill(content);
  }

  // ============================================================
  // Boot / routing
  // ============================================================
  async function boot() {
    if (!token()) return renderLogin();
    try {
      var me = await api('/api/ops/me');
      state.me = me;
      state.meta = me.meta;
      if (!me.role) return renderNoAccess();
      if (me.role === 'technician') return renderTechnician();
      return renderStaff(); // admin or ops_head
    } catch (e) {
      if (e.message !== 'unauthorized') renderLogin(e.message);
    }
  }

  function renderNoAccess() {
    mount(h('div', { class: 'login-wrap' },
      h('div', { class: 'login-card' },
        h('div', { class: 'brand' },
          h('div', { class: 'brand-badge' }, 'DO'),
          h('div', null, h('h1', null, 'Deluxe Ops'))
        ),
        h('p', { class: 'muted' }, 'Your account (' + (state.me.username) + ') has no operations role yet. Ask an administrator to grant you access.'),
        h('button', { class: 'btn btn-ghost btn-full', onclick: logout }, 'Sign out')
      )
    ));
  }

  // ============================================================
  // Staff app (admin + ops_head): tabbed board / fleet / techs / service due
  // ============================================================
  function renderStaff() {
    var isAdmin = state.me.role === 'admin';
    var tabs = [{ id: 'board', label: 'Job Board' }];
    if (isAdmin) tabs.push({ id: 'fleet', label: 'Generators' });
    if (isAdmin) tabs.push({ id: 'techs', label: 'Technicians' });
    tabs.push({ id: 'service', label: 'Service Due' });

    var activeTab = 'board';
    function go(tab) { activeTab = tab; draw(); }
    function draw() {
      var renderer = { board: viewBoard, fleet: viewFleet, techs: viewTechs, service: viewServiceDue }[activeTab];
      state.rerender = draw;
      renderChrome(tabs, activeTab, go, function (content) { renderer(content); });
    }
    draw();
  }

  // ---------- Job Board ----------
  async function viewBoard(content) {
    clear(content);
    content.appendChild(h('div', { class: 'muted' }, 'Loading board…'));
    var isAdmin = state.me.role === 'admin';
    var jobs, techs, dueMap = {};
    try {
      jobs = await api('/api/ops/jobs');
      techs = await api('/api/ops/technicians');
      var due = await api('/api/ops/service-due');
      due.forEach(function (d) { dueMap[d.dg_number] = d; });
    } catch (e) { clear(content); content.appendChild(errBox(e)); return; }

    // filters
    var fCompany = h('select', null, opt('', 'All companies'), opt('heavy', 'Deluxe HE'), opt('energy', 'Deluxe Energy'));
    var fType = h('select', null, [opt('', 'All types')].concat(state.meta.jobTypes.map(function (t) { return opt(t, state.meta.jobTypeLabels[t]); })));
    var fState = h('select', null, opt('', 'Open + done'), opt('open', 'Open only'), opt('done', 'Completed'));
    [fCompany, fType, fState].forEach(function (s) { s.addEventListener('change', renderList); });

    clear(content);
    content.appendChild(h('div', { class: 'section-head' },
      h('h2', null, 'Job Board'),
      h('span', { class: 'muted' }, jobs.length + ' job(s)'),
      h('div', { class: 'spacer' }),
      isAdmin ? h('button', { class: 'btn btn-gold', onclick: function () { openJobModal(techs); } }, '+ New Job') : null
    ));
    content.appendChild(h('div', { class: 'row', style: { marginBottom: '1rem' } }, fCompany, fType, fState));
    var listWrap = h('div');
    content.appendChild(listWrap);

    function renderList() {
      var filtered = jobs.filter(function (j) {
        if (fCompany.value && j.company !== fCompany.value) return false;
        if (fType.value && j.type !== fType.value) return false;
        if (fState.value && j.state !== fState.value) return false;
        return true;
      });
      clear(listWrap);
      if (!filtered.length) { listWrap.appendChild(h('div', { class: 'empty' }, 'No jobs match these filters.')); return; }
      var grid = h('div', { class: 'grid' }, filtered.map(function (j) { return boardCard(j, techs, dueMap, isAdmin); }));
      listWrap.appendChild(grid);
    }
    renderList();
  }

  function boardCard(j, techs, dueMap, isAdmin) {
    var due = j.dg_number && dueMap[j.dg_number];
    var pipe = j.pipeline || [];
    var stageIdx = pipe.indexOf(j.stage);

    var assignSel = h('select', null,
      [opt('', '— unassigned —')].concat(techs.map(function (t) { return opt(t.username, t.displayName, t.username === j.assigned_tech); })));
    assignSel.value = j.assigned_tech || '';
    assignSel.addEventListener('change', async function () {
      try { await api('/api/ops/jobs/' + j.id + '/assign', { method: 'PUT', body: { tech: assignSel.value } }); toast('Assignment updated'); state.rerender(); }
      catch (e) { toast(e.message, true); }
    });

    return h('div', { class: 'card company-strip', style: { '--co': coColor(j.company) } },
      h('div', { class: 'between' },
        h('div', { class: 'row' },
          h('span', { class: 'chip chip-type' }, j.typeLabel),
          j.type === 'breakdown' && j.state === 'open' ? h('span', { class: 'chip chip-urgent' }, 'URGENT') : null
        ),
        companyChip(j.company)
      ),
      h('h3', { class: 'mt' }, j.title || (j.typeLabel + (j.dg_number ? ' · ' + j.dg_number : ''))),
      h('div', { class: 'muted' },
        (j.dg_number ? 'DG ' + j.dg_number + (j.kva ? ' · ' + j.kva + ' KVA' : '') : 'No generator') +
        (j.client ? ' · ' + j.client : '') + (j.location ? ' · ' + j.location : '')
      ),
      j.vendor ? h('div', { class: 'muted' }, 'Vendor: ' + j.vendor) : null,
      pipelineBar(pipe, stageIdx, j.type === 'breakdown'),
      h('div', { class: 'row mt' },
        h('span', { class: 'chip chip-stage' + (j.state === 'done' ? ' done' : '') }, j.stage),
        due ? dueTag(due.days_remaining) : null
      ),
      h('label', { style: { marginBottom: '0' } }, 'Assigned technician'),
      assignSel,
      isAdmin ? h('div', { class: 'row mt' },
        h('button', { class: 'btn btn-ghost btn-sm', onclick: function () { openJobDetail(j.id); } }, 'History'),
        h('button', { class: 'btn btn-danger btn-sm', onclick: function () { deleteJob(j.id); } }, 'Delete')
      ) : h('button', { class: 'btn btn-ghost btn-sm mt', onclick: function () { openJobDetail(j.id); } }, 'History')
    );
  }

  function pipelineBar(pipe, stageIdx, urgent) {
    return h('div', { class: 'pipeline' }, pipe.map(function (s, i) {
      return h('div', { class: 'seg' + (i <= stageIdx ? ' on' : '') + (urgent && i <= stageIdx ? ' urgent' : ''), title: s });
    }));
  }
  function dueTag(days) {
    var cls = days <= 1 ? 'chip-urgent' : days <= 7 ? 'chip-type' : 'chip-stage';
    var txt = days < 0 ? 'Service overdue' : days === 0 ? 'Service due today' : 'Service in ' + days + 'd';
    return h('span', { class: 'chip ' + cls }, txt);
  }

  async function deleteJob(id) {
    if (!confirm('Delete this job permanently?')) return;
    try { await api('/api/ops/jobs/' + id, { method: 'DELETE' }); toast('Job deleted'); state.rerender(); }
    catch (e) { toast(e.message, true); }
  }

  // ---------- New Job modal ----------
  async function openJobModal(techs) {
    var gens;
    try { gens = await api('/api/ops/generators'); } catch (e) { toast(e.message, true); return; }

    var typeSel = h('select', null, state.meta.jobTypes.map(function (t) { return opt(t, state.meta.jobTypeLabels[t]); }));
    var coSel = h('select', null, opt('heavy', 'Deluxe HE'), opt('energy', 'Deluxe Energy'));
    var genSel = h('select', null, [opt('', '— none —')].concat(gens.map(function (g) {
      return opt(String(g.id), g.dg_number + (g.kva ? ' (' + g.kva + ' KVA)' : '') + ' · ' + coLabel(g.company));
    })));
    genSel.addEventListener('change', function () {
      var g = gens.find(function (x) { return String(x.id) === genSel.value; });
      if (g) { coSel.value = g.company; if (g.client) clientIn.value = g.client; if (g.location) locIn.value = g.location; }
    });
    var titleIn = h('input', { type: 'text', placeholder: 'e.g. Monthly service - Site A' });
    var clientIn = h('input', { type: 'text' });
    var locIn = h('input', { type: 'text' });
    var vendorIn = h('input', { type: 'text', placeholder: 'External workshop name' });
    var vendorWrap = h('div', null, h('label', null, 'Vendor (outside repair)'), vendorIn);
    vendorWrap.style.display = 'none';
    typeSel.addEventListener('change', function () { vendorWrap.style.display = typeSel.value === 'outside' ? 'block' : 'none'; });
    var descIn = h('textarea', { placeholder: 'Details / fault reported…' });
    var techSel = h('select', null, [opt('', '— assign later —')].concat(techs.map(function (t) { return opt(t.username, t.displayName); })));
    var err = h('div', { class: 'err' });

    async function save() {
      err.textContent = '';
      try {
        var body = {
          type: typeSel.value, company: coSel.value,
          generator_id: genSel.value || null, title: titleIn.value.trim() || null,
          description: descIn.value.trim() || null, client: clientIn.value.trim() || null,
          location: locIn.value.trim() || null, vendor: typeSel.value === 'outside' ? (vendorIn.value.trim() || null) : null,
          assigned_tech: techSel.value || null
        };
        await api('/api/ops/jobs', { method: 'POST', body: body });
        closeModal(); toast('Job created'); state.rerender();
      } catch (e) { err.textContent = e.message; }
    }

    openModal('New job', [
      h('label', null, 'Job type'), typeSel,
      h('label', null, 'Company'), coSel,
      h('label', null, 'Generator'), genSel,
      h('label', null, 'Title'), titleIn,
      h('label', null, 'Client'), clientIn,
      h('label', null, 'Location'), locIn,
      vendorWrap,
      h('label', null, 'Assign technician'), techSel,
      h('label', null, 'Description'), descIn,
      err
    ], save, 'Create job');
  }

  async function openJobDetail(id) {
    var job;
    try { job = await api('/api/ops/jobs/' + id); } catch (e) { toast(e.message, true); return; }
    var events = (job.events || []).map(function (ev) {
      return h('div', { class: 'between', style: { padding: '.4rem 0', borderBottom: '1px solid var(--line)' } },
        h('div', null, h('b', null, ev.event === 'stage' ? '→ ' + ev.detail : (ev.event + (ev.detail ? ': ' + ev.detail : ''))),
          h('div', { class: 'muted' }, (ev.username || 'system'))),
        h('span', { class: 'muted' }, ev.at)
      );
    });
    openModal('Job history · ' + (job.dg_number || job.typeLabel),
      [h('div', { class: 'stack' }, events.length ? events : [h('div', { class: 'muted' }, 'No history yet.')])],
      null, null);
  }

  // ---------- Fleet (generators) ----------
  async function viewFleet(content) {
    clear(content);
    content.appendChild(h('div', { class: 'muted' }, 'Loading generators…'));
    var gens;
    try { gens = await api('/api/ops/generators'); } catch (e) { clear(content); content.appendChild(errBox(e)); return; }
    clear(content);
    content.appendChild(h('div', { class: 'section-head' },
      h('h2', null, 'Generator Fleet'),
      h('span', { class: 'muted' }, gens.length + ' unit(s)'),
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn btn-gold', onclick: function () { openGenModal(null); } }, '+ Add Generator')
    ));
    if (!gens.length) { content.appendChild(h('div', { class: 'empty' }, 'No generators yet. Add your first unit.')); return; }
    var rows = gens.map(function (g) {
      return h('tr', null,
        h('td', null, h('b', null, g.dg_number)),
        h('td', null, g.kva ? g.kva + ' KVA' : '—'),
        h('td', null, companyChip(g.company)),
        h('td', null, h('span', { class: 'row' }, h('span', { class: 'status-dot st-' + g.status }), h('span', null, statusLabel(g.status)))),
        h('td', null, g.client || '—'),
        h('td', null, g.location || '—'),
        h('td', null, h('div', { class: 'row' },
          h('button', { class: 'btn btn-ghost btn-sm', onclick: function () { openGenModal(g); } }, 'Edit'),
          h('button', { class: 'btn btn-danger btn-sm', onclick: function () { delGen(g); } }, 'Delete')
        ))
      );
    });
    content.appendChild(h('div', { class: 'table-wrap' },
      h('table', null,
        h('thead', null, h('tr', null, ['DG Number', 'Rating', 'Company', 'Status', 'Client', 'Location', ''].map(function (t) { return h('th', null, t); }))),
        h('tbody', null, rows)
      )
    ));
  }

  function openGenModal(g) {
    var isEdit = !!g;
    var dgIn = h('input', { type: 'text', value: g ? g.dg_number : '', placeholder: 'e.g. DG-114' });
    var kvaIn = h('input', { type: 'number', value: g && g.kva != null ? g.kva : '', placeholder: 'e.g. 500' });
    var coSel = h('select', null, opt('heavy', 'Deluxe HE'), opt('energy', 'Deluxe Energy'));
    if (g) coSel.value = g.company;
    var stSel = h('select', null, state.meta.generatorStatuses.map(function (s) { return opt(s, statusLabel(s)); }));
    if (g) stSel.value = g.status;
    var clientIn = h('input', { type: 'text', value: g && g.client ? g.client : '' });
    var locIn = h('input', { type: 'text', value: g && g.location ? g.location : '' });
    var err = h('div', { class: 'err' });

    async function save() {
      err.textContent = '';
      var body = {
        dg_number: dgIn.value.trim(), kva: kvaIn.value ? Number(kvaIn.value) : null,
        company: coSel.value, status: stSel.value, client: clientIn.value.trim(), location: locIn.value.trim()
      };
      try {
        if (isEdit) await api('/api/ops/generators/' + g.id, { method: 'PUT', body: body });
        else await api('/api/ops/generators', { method: 'POST', body: body });
        closeModal(); toast(isEdit ? 'Generator updated' : 'Generator added'); state.rerender();
      } catch (e) { err.textContent = e.message; }
    }
    openModal(isEdit ? 'Edit generator' : 'Add generator', [
      h('label', null, 'DG number'), dgIn,
      h('label', null, 'KVA rating'), kvaIn,
      h('label', null, 'Company'), coSel,
      h('label', null, 'Status'), stSel,
      h('label', null, 'Current client'), clientIn,
      h('label', null, 'Current location'), locIn,
      err
    ], save, isEdit ? 'Save changes' : 'Add generator');
  }
  async function delGen(g) {
    if (!confirm('Delete generator ' + g.dg_number + '?')) return;
    try { await api('/api/ops/generators/' + g.id, { method: 'DELETE' }); toast('Generator deleted'); state.rerender(); }
    catch (e) { toast(e.message, true); }
  }

  // ---------- Technicians / roles ----------
  async function viewTechs(content) {
    clear(content);
    content.appendChild(h('div', { class: 'muted' }, 'Loading team…'));
    var users;
    try { users = await api('/api/ops/users'); } catch (e) { clear(content); content.appendChild(errBox(e)); return; }
    clear(content);
    content.appendChild(h('div', { class: 'section-head' },
      h('h2', null, 'Team & Technicians'),
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn btn-gold', onclick: function () { openUserModal(); } }, '+ Add Member')
    ));
    var rows = users.map(function (u) {
      return h('tr', null,
        h('td', null, h('b', null, u.displayName), u.username !== u.displayName ? h('div', { class: 'muted' }, '@' + u.username) : null),
        h('td', null, h('span', { class: 'chip chip-type' }, u.role)),
        h('td', null, h('div', { class: 'row' },
          h('button', { class: 'btn btn-ghost btn-sm', onclick: function () { openRoleModal(u); } }, 'Change role'),
          h('button', { class: 'btn btn-ghost btn-sm', onclick: function () { openPwModal(u); } }, 'Reset password')
        ))
      );
    });
    content.appendChild(h('div', { class: 'table-wrap' },
      h('table', null,
        h('thead', null, h('tr', null, ['Member', 'Role', ''].map(function (t) { return h('th', null, t); }))),
        h('tbody', null, rows)
      )
    ));
  }

  function roleSelect(current) {
    var sel = h('select', null,
      opt('technician', 'Technician'), opt('ops_head', 'Ops Head'), opt('admin', 'Admin'));
    if (current) sel.value = current;
    return sel;
  }
  function openUserModal() {
    var nameIn = h('input', { type: 'text', placeholder: 'Full name' });
    var userIn = h('input', { type: 'text', placeholder: 'login username' });
    var passIn = h('input', { type: 'password', placeholder: 'min 6 characters' });
    var roleSel = roleSelect('technician');
    var err = h('div', { class: 'err' });
    async function save() {
      err.textContent = '';
      try {
        await api('/api/ops/technicians', { method: 'POST', body: {
          username: userIn.value.trim(), password: passIn.value, displayName: nameIn.value.trim(), role: roleSel.value
        } });
        closeModal(); toast('Member added'); state.rerender();
      } catch (e) { err.textContent = e.message; }
    }
    openModal('Add team member', [
      h('label', null, 'Full name'), nameIn,
      h('label', null, 'Username'), userIn,
      h('label', null, 'Password'), passIn,
      h('label', null, 'Role'), roleSel,
      err
    ], save, 'Create account');
  }
  function openRoleModal(u) {
    var nameIn = h('input', { type: 'text', value: u.displayName });
    var roleSel = roleSelect(u.role);
    var err = h('div', { class: 'err' });
    async function save() {
      err.textContent = '';
      try {
        await api('/api/ops/users/' + u.username + '/role', { method: 'PUT', body: { role: roleSel.value, displayName: nameIn.value.trim() } });
        closeModal(); toast('Role updated'); state.rerender();
      } catch (e) { err.textContent = e.message; }
    }
    openModal('Change role · ' + u.username, [
      h('label', null, 'Display name'), nameIn,
      h('label', null, 'Role'), roleSel,
      err
    ], save, 'Save');
  }
  function openPwModal(u) {
    var passIn = h('input', { type: 'password', placeholder: 'new password (min 6)' });
    var err = h('div', { class: 'err' });
    async function save() {
      err.textContent = '';
      try {
        await api('/api/users/' + u.username + '/password', { method: 'POST', body: { newPassword: passIn.value } });
        closeModal(); toast('Password reset');
      } catch (e) { err.textContent = e.message; }
    }
    openModal('Reset password · ' + u.username, [h('label', null, 'New password'), passIn, err], save, 'Reset');
  }

  // ---------- Service due feed ----------
  async function viewServiceDue(content) {
    clear(content);
    content.appendChild(h('div', { class: 'muted' }, 'Loading…'));
    var due, gens = [];
    try {
      due = await api('/api/ops/service-due');
      try { gens = await api('/api/ops/generators'); } catch (e) { /* ops_head may still read via generators route */ }
    } catch (e) { clear(content); content.appendChild(errBox(e)); return; }

    var dgIn = h('input', { type: 'text', placeholder: 'DG number', list: 'dglist' });
    var dl = h('datalist', { id: 'dglist' }, gens.map(function (g) { return h('option', { value: g.dg_number }); }));
    var daysIn = h('input', { type: 'number', placeholder: 'days remaining' });
    var addBtn = h('button', { class: 'btn btn-gold', onclick: addDue }, 'Save');
    async function addDue() {
      if (!dgIn.value.trim()) { toast('DG number required', true); return; }
      try {
        await api('/api/ops/service-due', { method: 'POST', body: { dgNumber: dgIn.value.trim(), daysRemaining: Number(daysIn.value) } });
        dgIn.value = ''; daysIn.value = ''; toast('Saved'); state.rerender();
      } catch (e) { toast(e.message, true); }
    }

    clear(content);
    content.appendChild(h('div', { class: 'section-head' },
      h('h2', null, 'Daily Service Feed'),
      h('span', { class: 'muted' }, 'From Netsonic "Machinery Service Due"')
    ));
    content.appendChild(h('div', { class: 'card', style: { marginBottom: '1rem' } },
      h('div', { class: 'muted', style: { marginBottom: '.6rem' } }, 'Enter each morning: DG number + days remaining. Technicians see these as countdown rings on their jobs.'),
      h('div', { class: 'row' }, dgIn, dl, daysIn, addBtn)
    ));
    if (!due.length) { content.appendChild(h('div', { class: 'empty' }, 'No service-due entries yet.')); return; }
    var rows = due.map(function (d) {
      return h('tr', null,
        h('td', null, h('b', null, d.dg_number)),
        h('td', null, d.company ? companyChip(d.company) : '—'),
        h('td', null, dueTag(d.days_remaining)),
        h('td', null, h('span', { class: 'muted' }, (d.updated_by || '') + ' · ' + d.updated_at)),
        h('td', null, h('button', { class: 'btn btn-danger btn-sm', onclick: function () { delDue(d.dg_number); } }, 'Remove'))
      );
    });
    content.appendChild(h('div', { class: 'table-wrap' },
      h('table', null,
        h('thead', null, h('tr', null, ['DG Number', 'Company', 'Countdown', 'Updated', ''].map(function (t) { return h('th', null, t); }))),
        h('tbody', null, rows)
      )
    ));
  }
  async function delDue(dg) {
    try { await api('/api/ops/service-due/' + encodeURIComponent(dg), { method: 'DELETE' }); toast('Removed'); state.rerender(); }
    catch (e) { toast(e.message, true); }
  }

  // ============================================================
  // Technician "alarm clock" dashboard
  // ============================================================
  function renderTechnician() {
    async function draw() {
      state.rerender = draw;
      var content = h('div', { class: 'tech-wrap' });
      renderChrome([{ id: 'me', label: 'My Jobs' }], 'me', function () {}, function (c) {
        clear(c); c.appendChild(content);
      });
      content.appendChild(h('div', { class: 'muted' }, 'Loading your jobs…'));

      var jobs, dueMap = {};
      try {
        jobs = await api('/api/ops/jobs');
        var due = await api('/api/ops/service-due');
        due.forEach(function (d) { dueMap[d.dg_number] = d; });
      } catch (e) { clear(content); content.appendChild(errBox(e)); return; }

      clear(content);
      content.appendChild(h('div', { class: 'tech-hello' },
        h('h2', null, 'Hi ' + (state.me.displayName || state.me.username)),
        h('div', { class: 'muted' }, greeting(jobs))
      ));

      var openJobs = jobs.filter(function (j) { return j.state === 'open'; });
      var breakdowns = openJobs.filter(function (j) { return j.type === 'breakdown'; });

      // 1) Ringing breakdown alarms at the very top
      breakdowns.forEach(function (j) {
        content.appendChild(h('div', { class: 'breakdown-alarm' },
          h('div', { class: 'bell' }, '🔔'),
          h('div', { class: 'ba-body' },
            h('h3', null, 'BREAKDOWN' + (j.dg_number ? ' · DG ' + j.dg_number : '')),
            h('div', { class: 'ba-sub' }, (j.client || j.location || 'Urgent call-out') + ' — current stage: ' + j.stage)
          )
        ));
      });

      if (!jobs.length) { content.appendChild(h('div', { class: 'empty' }, 'No jobs assigned to you right now.')); return; }

      // 2) Job cards (open first), with service countdown rings
      var ordered = openJobs.concat(jobs.filter(function (j) { return j.state === 'done'; }));
      ordered.forEach(function (j) {
        content.appendChild(techJobCard(j, dueMap[j.dg_number]));
      });
    }
    draw();
  }

  function greeting(jobs) {
    var open = jobs.filter(function (j) { return j.state === 'open'; }).length;
    var bd = jobs.filter(function (j) { return j.type === 'breakdown' && j.state === 'open'; }).length;
    if (bd) return bd + ' urgent breakdown(s) need you now · ' + open + ' open job(s)';
    if (open) return open + ' open job(s) today';
    return 'All caught up — no open jobs';
  }

  function techJobCard(j, due) {
    var pipe = j.pipeline || [];
    var idx = pipe.indexOf(j.stage);
    var next = idx >= 0 && idx < pipe.length - 1 ? pipe[idx + 1] : null;
    var isBreakdown = j.type === 'breakdown';

    var left = h('div', { style: { flex: '1' } },
      h('div', { class: 'between' },
        h('div', { class: 'row' },
          h('span', { class: 'chip chip-type' }, j.typeLabel),
          isBreakdown && j.state === 'open' ? h('span', { class: 'chip chip-urgent' }, 'URGENT') : null
        ),
        companyChip(j.company)
      ),
      h('h3', { class: 'mt' }, (j.title || j.typeLabel) + (j.dg_number ? ' · DG ' + j.dg_number : '')),
      h('div', { class: 'muted' }, [j.kva ? j.kva + ' KVA' : null, j.client, j.location, j.vendor ? 'Vendor: ' + j.vendor : null].filter(Boolean).join(' · ') || '—'),
      j.description ? h('div', { class: 'muted mt' }, j.description) : null,
      pipelineBar(pipe, idx, isBreakdown),
      h('div', { class: 'row mt' }, h('span', { class: 'chip chip-stage' + (j.state === 'done' ? ' done' : '') }, 'Now: ' + j.stage)),
      h('div', { class: 'stage-btns' },
        next ? h('button', { class: 'btn btn-gold btn-sm', onclick: function () { advance(j.id, next); } }, 'Mark: ' + next + ' ▸') : null,
        j.state === 'done' ? h('span', { class: 'chip chip-stage done' }, '✓ ' + j.stage) : null
      )
    );

    var kids = [left];
    if (due) kids.unshift(ringWrap(due.days_remaining));
    return h('div', { class: 'card company-strip job-card', style: { '--co': coColor(j.company) } },
      h('div', { class: 'ring-wrap' }, kids));
  }

  function ringWrap(days) {
    var NS = 'http://www.w3.org/2000/svg';
    var size = 92, stroke = 9, r = (size - stroke) / 2, c = 2 * Math.PI * r, max = 14;
    var frac = Math.max(0, Math.min(1, days / max));
    var color, pulse = false;
    if (days <= 1) { color = 'var(--red)'; pulse = true; }
    else if (days <= 3) { color = 'var(--red)'; }
    else if (days <= 7) { color = 'var(--gold)'; }
    else { color = 'var(--green)'; }

    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', size); svg.setAttribute('height', size); svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
    var bg = document.createElementNS(NS, 'circle');
    setNS(bg, { cx: size / 2, cy: size / 2, r: r, fill: 'none', stroke: 'var(--surface-2)', 'stroke-width': stroke });
    var fg = document.createElementNS(NS, 'circle');
    setNS(fg, {
      cx: size / 2, cy: size / 2, r: r, fill: 'none', stroke: color, 'stroke-width': stroke,
      'stroke-linecap': 'round', 'stroke-dasharray': c, 'stroke-dashoffset': c * (1 - frac)
    });
    svg.appendChild(bg); svg.appendChild(fg);

    var label = days < 0 ? 'over' : days === 0 ? 'today' : 'days left';
    var num = days < 0 ? '!' : String(days);
    var ring = h('div', { class: 'ring' + (pulse ? ' pulse' : '') }, svg,
      h('div', { class: 'ring-num' }, h('b', { style: { color: color } }, num), h('span', null, label)));
    return ring;
  }
  function setNS(el, attrs) { for (var k in attrs) el.setAttributeNS(null, k, attrs[k]); }

  async function advance(id, stage) {
    try { await api('/api/ops/jobs/' + id + '/stage', { method: 'PUT', body: { stage: stage } }); toast('Updated to ' + stage); state.rerender(); }
    catch (e) { toast(e.message, true); }
  }

  // ============================================================
  // shared modal + small helpers
  // ============================================================
  function openModal(title, bodyNodes, onSave, saveLabel) {
    closeModal();
    var actions = [h('button', { class: 'btn btn-ghost', onclick: closeModal }, onSave ? 'Cancel' : 'Close')];
    if (onSave) actions.push(h('button', { class: 'btn btn-gold', onclick: onSave }, saveLabel || 'Save'));
    var back = h('div', { class: 'modal-back', id: 'modal-back', onclick: function (e) { if (e.target.id === 'modal-back') closeModal(); } },
      h('div', { class: 'modal' },
        h('h3', null, title),
        h('div', { class: 'stack' }, bodyNodes),
        h('div', { class: 'modal-actions' }, actions)
      )
    );
    document.body.appendChild(back);
  }
  function closeModal() { var m = document.getElementById('modal-back'); if (m) m.remove(); }

  function opt(value, label, selected) {
    var o = h('option', { value: value }, label);
    if (selected) o.selected = true;
    return o;
  }
  function errBox(e) { return h('div', { class: 'empty' }, 'Could not load: ' + (e.message || e)); }

  // go
  boot();
})();
