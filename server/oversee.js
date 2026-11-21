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

  // --- Step 4: monitor-page scripts -> the real device/positions call ---
  report.steps.monitor = await reconMonitor();

  report.configured = isConfigured();
  if (tryLogin && isConfigured()) {
    report.steps.login = await tryLoginFlow();
  } else {
    report.steps.login = { skipped: tryLogin ? 'no credentials configured' : 'pass ?login=1 (and configure credentials) to attempt login' };
  }
  return report;
}

// ---- shared API call: multipart POST to WebProcessorApi.ashx ----
// Mirrors the site's SubmitData(): fields Token, OperationType, InformationType,
// LanguageType, Arguments (+ optional PageArguments). The Token is the opaque
// session token the server issues at SignIn - we just pass it back, no crypto.
let sessionToken = null;
function buildForm(fields) {
  const fd = new FormData();
  Object.keys(fields).forEach((k) => fd.append(k, fields[k] == null ? '' : String(fields[k])));
  return fd;
}
async function apiCall(operationType, informationType, argStr, opts) {
  opts = opts || {};
  const fd = buildForm({
    Token: opts.token != null ? opts.token : (sessionToken || ''),
    OperationType: operationType,
    InformationType: informationType,
    LanguageType: process.env.OVERSEE_LANG || '1',
    Arguments: argStr || '',
  });
  if (opts.pageSize && opts.pageIndex) fd.append('PageArguments', JSON.stringify({ PageSize: String(opts.pageSize), PageIndex: String(opts.pageIndex) }));
  const r = await fetchT(API_BASE + '/WebProcessorApi.ashx', {
    method: 'POST', body: fd, redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Origin: WEB_BASE,
      Referer: WEB_BASE + '/',
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
    },
  }, opts.timeout || 15000);
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch (_) {}
  return { status: r.status, json, text };
}
function argEsc(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
function loginArgs() { return "{'UserName':'" + argEsc(user()) + "','Password':'" + argEsc(pass()) + "'}"; }

// Log in with the stored credentials; stores + returns the session Token.
async function login() {
  if (!isConfigured()) throw new Error('not configured');
  const res = await apiCall('SignIn', 'User', loginArgs(), { token: '' });
  const j = res.json;
  if (!j) throw new Error('login: non-JSON response (HTTP ' + res.status + ')');
  if (String(j.State) !== '0') throw new Error('login rejected (State ' + j.State + ')');
  sessionToken = j.Token;
  return { token: j.Token, data: j.Data };
}

// Diagnostic SignIn used by the recon probe's ?login=1 - confirms login works
// and shows the response shape WITHOUT leaking the full token.
async function tryLoginFlow() {
  try {
    const res = await apiCall('SignIn', 'User', loginArgs(), { token: '' });
    const j = res.json;
    const out = { httpStatus: res.status };
    if (!j) { out.error = 'non-JSON response'; out.bodyHead = (res.text || '').slice(0, 400); return out; }
    out.State = j.State;
    out.success = String(j.State) === '0';
    out.hasToken = !!j.Token;
    out.tokenLen = j.Token ? String(j.Token).length : 0;
    out.serverError = j.Error || null;
    out.dataType = Array.isArray(j.Data) ? ('array[' + j.Data.length + ']') : (j.Data && typeof j.Data === 'object' ? 'object' : typeof j.Data);
    out.dataKeys = (j.Data && typeof j.Data === 'object' && !Array.isArray(j.Data)) ? Object.keys(j.Data).slice(0, 40) : null;
    if (out.success) { sessionToken = j.Token; out.afterLogin = await probeDeviceOps(); }
    return out;
  } catch (e) { return { error: String(e && e.message || e) }; }
}

// After login, run the REAL operations the monitor page uses, and show their
// response shape so we can map lat/lon/name/speed fields. Read-only.
async function probeDeviceOps() {
  const results = {};
  async function run(label, op, info, args, opts) {
    try {
      const res = await apiCall(op, info, args, Object.assign({ timeout: 10000 }, opts || {}));
      const j = res.json;
      if (!j) { results[label] = { http: res.status, bodyHead: (res.text || '').slice(0, 120) }; return j; }
      const sample = Array.isArray(j.Data) ? (j.Data[0] || null) : j.Data;
      results[label] = {
        State: j.State, DataCount: j.DataCount, Error: j.Error || null,
        dataType: Array.isArray(j.Data) ? ('array[' + j.Data.length + ']') : typeof j.Data,
        sample: sample, // first row - reveals the exact field names (ProductID, lat/lon, etc.)
      };
      return j;
    } catch (e) { results[label] = { error: String(e && e.message || e) }; return null; }
  }
  // validate token, then the device list; then newest position for the 1st tracker
  await run('ValidToken', 'Query', 'User', "{'ValidToken':'1'}");
  const trackers = await run('GetMyTracker', 'GetMyTracker', 'Product', "{'TrackerType':'0'}", { pageSize: 200, pageIndex: 1 });
  try {
    const first = trackers && Array.isArray(trackers.Data) ? trackers.Data[0] : null;
    const pid = first && (first.ProductID || first.ProductId || first.productID);
    if (pid) {
      await run('NewestPosition', 'Query', 'HistoricalLocation',
        "{'GetVehicleNewestPosition':'1','ProductID':'" + pid + "'}");
    }
  } catch (_) { /* ignore */ }
  return results;
}

// Recon the monitor page's own scripts to find the real device/positions call.
async function reconMonitor() {
  const out = {};
  try {
    const r = await fetchT(WEB_BASE + '/index.aspx', { method: 'GET', headers: { 'User-Agent': 'DeluxePortal/1.0', Accept: 'text/html' } }, 8000);
    const body = await r.text();
    const srcs = excerpts(body, /<script[^>]+src=["']([^"']+)["']/i, { before: 0, after: 0, max: 40 })
      .map((s) => (s.match(/src=["']([^"']+)["']/i) || [])[1]).filter(Boolean);
    out.page = { status: r.status, scriptSrcs: srcs };
    out.inlineSubmitCalls = excerpts(body, /Submit(Data|DataByToken)\s*\(/i, { before: 10, after: 170, max: 20 });
    const cand = srcs.filter((s) => /index|monitor|main|map|device|gps|common/i.test(s) && !/public\.js/i.test(s)).slice(0, 3);
    out.scripts = {};
    await Promise.all(cand.map(async (src) => {
      const url = /^https?:/i.test(src) ? src : (src.startsWith('//') ? 'https:' + src : WEB_BASE + '/' + src.replace(/^\//, ''));
      try {
        const rr = await fetchT(url, { method: 'GET', headers: { 'User-Agent': 'DeluxePortal/1.0' } }, 8000);
        const js = rr.status === 200 ? await rr.text() : '';
        out.scripts[src] = { status: rr.status, bytes: js.length,
          submitCalls: excerpts(js, /Submit(Data|DataByToken)\s*\(/i, { before: 10, after: 170, max: 24 }) };
      } catch (e) { out.scripts[src] = { error: String(e && e.message || e) }; }
    }));
  } catch (e) { out.error = String(e && e.message || e); }
  return out;
}

// ---- live connector ----
async function refresh() {
  if (!isConfigured()) {
    snapshot = Object.assign({}, snapshot, { live: false, error: 'not configured' });
    return;
  }
  try {
    if (!sessionToken) await login();
    // Device/position fetch is wired once probeDeviceOps/reconMonitor confirm the
    // exact operation; for now we keep the session established.
    snapshot = Object.assign({}, snapshot, { error: 'login ok; positions mapping pending' });
  } catch (e) {
    sessionToken = null;
    snapshot = Object.assign({}, snapshot, { error: (e && e.message) || 'refresh failed' });
    console.error('[oversee] refresh failed:', snapshot.error);
  }
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
