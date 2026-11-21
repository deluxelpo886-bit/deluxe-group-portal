'use strict';
/*
 * Live vehicle positions from the Oversee / Myrope "iCruise" GPS platform
 * (overseetracking.com) used by Total Secure.
 *
 * Unlike the Traccar feed (see positions.js), the Oversee web client encrypts
 * its requests to api.overseetracking.com:9090/WebProcessorApi.ashx, so we have
 * to learn the exact login + data protocol from the live server before we can
 * poll it from the portal. This module therefore ships in two layers:
 *
 *   1. debug()   - a SAFE, read-only recon probe. It fetches the public login
 *                  page and its scripts and reports how login + the data API
 *                  work (form fields, endpoints, how the request Token is made).
 *                  No credentials are required for the recon steps. This is how
 *                  we discover the protocol on Render (which CAN reach Oversee)
 *                  without shipping guesses.
 *
 *   2. the live connector (login/fetchVehicles/startPolling) - filled in once
 *                  debug() has shown us the real protocol. It keeps the latest
 *                  snapshot in memory + a small JSON cache, and the web server
 *                  exposes it at /api/oversee. Credentials live ONLY on the
 *                  server (DB secure-settings or env vars), never in the repo
 *                  or the browser.
 *
 * Credentials (either source works; DB takes priority so they can be entered
 * from the portal without a redeploy):
 *   - DB secure-settings keys: oversee_user, oversee_pass  (set via the portal)
 *   - Env vars:               OVERSEE_USER, OVERSEE_PASS
 *
 * If neither is set, the live feed is simply disabled - the recon probe still
 * works, and the rest of the portal is completely unaffected.
 */

const fs = require('fs');
const path = require('path');

// ---- hosts (confirmed from the live DevTools capture) ----
const WEB_BASE = 'https://www.overseetracking.com';       // login + web UI (443)
const API_BASE = 'https://api.overseetracking.com:9090';  // WebProcessorApi.ashx (data)

const CACHE_DIR = path.join(__dirname, '..', 'data');
const CACHE_FILE = path.join(CACHE_DIR, 'oversee.json');

// Credentials are read lazily so they can be entered from the portal at runtime.
let getCred = null; // injected by server.js: getCred('oversee_user') -> string|null
function configure(opts) {
  if (opts && typeof opts.getCred === 'function') getCred = opts.getCred;
}
function cred(key, envName) {
  try { if (getCred) { const v = getCred(key); if (v) return String(v); } } catch (_) {}
  return process.env[envName] || '';
}
function user() { return cred('oversee_user', 'OVERSEE_USER'); }
function pass() { return cred('oversee_pass', 'OVERSEE_PASS'); }
function isConfigured() { return !!(user() && pass()); }

let snapshot = { vehicles: [], updatedAt: null, source: 'oversee', live: false, error: null };
try {
  if (fs.existsSync(CACHE_FILE)) {
    const saved = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    if (saved && Array.isArray(saved.vehicles)) snapshot = Object.assign(snapshot, saved, { error: null });
  }
} catch (_) { /* ignore corrupt/missing cache */ }

function persist() {
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(snapshot));
  } catch (_) { /* best-effort */ }
}

// fetch with a hard timeout so a slow/blocked host never hangs the poller.
async function fetchT(url, options, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms || 20000);
  try {
    return await fetch(url, Object.assign({ redirect: 'manual' }, options || {}, { signal: ctrl.signal }));
  } finally { clearTimeout(t); }
}

// Pull the first few regex matches out of a big text blob, each with a little
// surrounding context, so we can inspect obfuscated JS without dumping all of it.
function excerpts(text, re, opts) {
  const o = opts || {};
  const before = o.before == null ? 60 : o.before;
  const after = o.after == null ? 120 : o.after;
  const max = o.max == null ? 8 : o.max;
  const out = [];
  let m; const rx = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  while ((m = rx.exec(text)) && out.length < max) {
    const s = Math.max(0, m.index - before);
    const e = Math.min(text.length, m.index + m[0].length + after);
    out.push(text.slice(s, e).replace(/\s+/g, ' ').trim());
    if (rx.lastIndex === m.index) rx.lastIndex++;
  }
  return out;
}

// Extract a whole JS function body by name (brace-balanced), so we can read the
// exact login/data calls rather than keyword-sized snippets. `name` may include
// the trailing "(" for an exact match, e.g. "SignIn(".
function funcBody(text, name, maxLen) {
  const idx = text.indexOf('function ' + name);
  if (idx < 0) return null;
  const open = text.indexOf('{', idx);
  if (open < 0) return text.slice(idx, idx + (maxLen || 1500));
  let depth = 0, i = open;
  const cap = open + (maxLen || 4000);
  for (; i < text.length && i < cap; i++) {
    const c = text[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return text.slice(idx, i).replace(/[ \t]+/g, ' ').trim();
}

/*
 * SAFE recon probe. Read-only. Fetches the public login page + its scripts from
 * Render and reports how the platform authenticates and fetches data, so we can
 * implement the live connector against the REAL protocol instead of guessing.
 * Optionally (step 3) attempts a login if credentials are configured.
 */
async function debug(opts) {
  const tryLogin = !!(opts && opts.login);
  const report = { ok: true, when: new Date().toISOString(), web: WEB_BASE, api: API_BASE, steps: {} };

  // --- Step 1: the login page (cookies, form, script srcs) ---
  try {
    const r = await fetchT(WEB_BASE + '/', { method: 'GET', headers: { 'User-Agent': 'DeluxePortal/1.0', Accept: 'text/html' } }, 8000);
    const body = await r.text();
    const scripts = excerpts(body, /<script[^>]+src=["']([^"']+)["']/i, { before: 0, after: 0, max: 40 })
      .map((s) => (s.match(/src=["']([^"']+)["']/i) || [])[1]).filter(Boolean);
    const forms = excerpts(body, /<form[^>]*>/i, { before: 0, after: 0, max: 5 });
    const inputs = excerpts(body, /<input[^>]*>/i, { before: 0, after: 0, max: 30 });
    report.steps.loginPage = {
      status: r.status,
      setCookie: r.headers.get('set-cookie') || null,
      location: r.headers.get('location') || null,
      title: (body.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || null,
      bytes: body.length,
      scriptSrcs: scripts,
      forms,
      inputs,
      // any inline hints at the login/data endpoints or crypto
      endpointHints: excerpts(body, /(WebProcessorApi|GetSession|Login|Logon|\.ashx|\.asmx|:9090)/i, { max: 12 }),
      // the login page's inline script defines SignIn / SignInByUserName -
      // pull the full bodies so we can see exactly how Arguments are built.
      functions: {
        SignIn: funcBody(body, 'SignIn(', 1400),
        SignInByUserName: funcBody(body, 'SignInByUserName(', 3000),
        SignInByPlateNo: funcBody(body, 'SignInByPlateNo(', 2400),
      },
    };
    report._scriptSrcs = scripts; // used by step 2
  } catch (e) {
    report.steps.loginPage = { error: String(e && e.message || e) };
  }

  // --- Step 2: fetch the key JS and report crypto/endpoint internals ---
  // We look at the scripts the page references (Public.js / index.js are the
  // ones that build the encrypted Token and call WebProcessorApi.ashx).
  const jsCandidates = [];
  (report._scriptSrcs || []).forEach((src) => {
    if (/public\.js|index\.js|common|login|main|app\.js|md5|aes|crypto|des/i.test(src)) jsCandidates.push(src);
  });
  // always try the two we saw in the capture, even if not parsed above
  ['/Public.js', '/index.js', '/js/Public.js', '/js/index.js'].forEach((p) => { if (!jsCandidates.includes(p)) jsCandidates.push(p); });

  report.steps.scripts = {};
  // Fetch the candidate scripts in PARALLEL with short timeouts so the whole
  // probe returns in a few seconds (a slow sequential crawl was timing out).
  await Promise.all(jsCandidates.slice(0, 3).map(async (src) => {
    const url = /^https?:/i.test(src) ? src : (src.startsWith('//') ? 'https:' + src : WEB_BASE + '/' + src.replace(/^\//, ''));
    try {
      const r = await fetchT(url, { method: 'GET', headers: { 'User-Agent': 'DeluxePortal/1.0' } }, 8000);
      const js = r.status === 200 ? await r.text() : '';
      report.steps.scripts[src] = {
        resolved: url,
        status: r.status,
        bytes: js.length,
        crypto: excerpts(js, /(CryptoJS|AES|DES|TripleDES|\.encrypt\s*\(|\.decrypt\s*\(|base64|md5|SHA|secretKey|parse\()/i, { max: 8 }),
        token: excerpts(js, /(Token|GetSession|jsession|account_name)/i, { max: 8 }),
        endpoints: excerpts(js, /(WebProcessorApi|\.ashx|GetSession|Login\.aspx|:9090|api\.overseetracking)/i, { max: 10 }),
        loginFn: excerpts(js, /(function\s+\w*[Ll]ogin|[Ll]ogin\s*[:=]\s*function|SignIn|userLogin|doLogin)/i, { max: 6 }),
        // full function bodies for the exact login + data-request protocol
        functions: js ? {
          SubmitData: funcBody(js, 'SubmitData(', 2600),
          SubmitDataByToken: funcBody(js, 'SubmitDataByToken(', 2200),
          SignInByUserName: funcBody(js, 'SignInByUserName(', 2600),
          SignIn: funcBody(js, 'SignIn(', 1400),
          GetApiUrl: funcBody(js, 'GetApiUrl(', 400),
        } : null,
      };
    } catch (e) {
      report.steps.scripts[src] = { resolved: url, error: String(e && e.message || e) };
    }
  }));
  delete report._scriptSrcs;

  // --- Step 3: data API endpoint reachability from Render ---
  try {
    const r = await fetchT(API_BASE + '/WebProcessorApi.ashx', { method: 'GET', headers: { 'User-Agent': 'DeluxePortal/1.0' } }, 8000);
    report.steps.apiReachable = { status: r.status, note: 'GET only - just a reachability check from Render' };
  } catch (e) {
    report.steps.apiReachable = { error: String(e && e.message || e) };
  }

  report.configured = isConfigured();
  if (tryLogin && isConfigured()) {
    report.steps.login = await tryLoginFlow();
  } else {
    report.steps.login = { skipped: tryLogin ? 'no credentials configured' : 'pass ?login=1 (and configure credentials) to attempt login' };
  }
  return report;
}

// Placeholder login attempt - refined once debug() reveals the real protocol.
// Reports raw results rather than throwing, so the diagnostic stays readable.
async function tryLoginFlow() {
  const out = { attempts: [] };
  const u = user(), p = pass();
  const candidates = [
    { url: WEB_BASE + '/Login.ashx', body: new URLSearchParams({ username: u, password: p }), type: 'form' },
    { url: WEB_BASE + '/GetSession.aspx', body: new URLSearchParams({ username: u, password: p }), type: 'form' },
  ];
  for (const c of candidates) {
    try {
      const r = await fetchT(c.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'DeluxePortal/1.0' },
        body: c.body.toString(),
      }, 15000);
      const txt = (await r.text()).slice(0, 600);
      out.attempts.push({ url: c.url, status: r.status, setCookie: r.headers.get('set-cookie') || null, bodyHead: txt });
    } catch (e) {
      out.attempts.push({ url: c.url, error: String(e && e.message || e) });
    }
  }
  return out;
}

// ---- live connector (to be completed after protocol discovery) ----
async function refresh() {
  if (!isConfigured()) {
    snapshot = Object.assign({}, snapshot, { live: false, error: 'not configured' });
    return;
  }
  // Implemented once debug() confirms the login + WebProcessorApi protocol.
  snapshot = Object.assign({}, snapshot, { error: 'connector pending protocol discovery' });
}

let timer = null;
function startPolling() {
  if (!isConfigured()) {
    console.log('[oversee] not configured - set oversee_user/oversee_pass (portal) or OVERSEE_USER/OVERSEE_PASS to enable the Oversee car feed. (Portal runs normally.)');
    return;
  }
  const POLL_MS = Math.max(60000, parseInt(process.env.OVERSEE_POLL_MS || '120000', 10) || 120000);
  console.log('[oversee] enabled -> polling every ' + Math.round(POLL_MS / 1000) + 's');
  refresh();
  timer = setInterval(refresh, POLL_MS);
  if (timer && timer.unref) timer.unref();
}

function getSnapshot() { return snapshot; }

module.exports = { configure, isConfigured, debug, startPolling, getSnapshot };
