'use strict';
/*
 * Store keepers directory.
 *
 * The store keeper signs in to their installed app with a PIN and sees the
 * parts requests coming from dispatched jobs, plus the stock list. Mirrors
 * technicians.js. Tokens/PINs overridable via STORE_TOKENS / STORE_PINS.
 */

const DEFAULT_TOKENS = { ramesh: 'vofry0ehfPx2' };
const DEFAULT_PINS = { ramesh: '3001' };

function fromEnv(envName, defaults) {
  const out = Object.assign({}, defaults);
  const raw = String(process.env[envName] || '').trim();
  if (raw) raw.split(',').forEach((pair) => { const [id, v] = pair.split(':').map((s) => String(s || '').trim()); if (id && v) out[id.toLowerCase()] = v; });
  return out;
}
const TOKENS = fromEnv('STORE_TOKENS', DEFAULT_TOKENS);
const PINS = fromEnv('STORE_PINS', DEFAULT_PINS);

const KEEPERS = [
  { id: 'ramesh', name: 'Ramesh Kumar', phone: '' },
].map((k) => Object.assign(k, { token: TOKENS[k.id] || '', pin: PINS[k.id] || '' }));

function list() { return KEEPERS.map((k) => ({ id: k.id, name: k.name, phone: k.phone, token: k.token, pin: k.pin })); }
function names() { return KEEPERS.map((k) => ({ id: k.id, name: k.name })); }
function byId(id) { return KEEPERS.find((k) => k.id === String(id || '').toLowerCase()) || null; }
function byToken(token) { const t = String(token || '').trim(); if (!t) return null; return KEEPERS.find((k) => k.token && k.token === t) || null; }
function login(id, pin) { const k = byId(id); if (!k || !k.pin) return null; return (String(pin || '').trim() === String(k.pin)) ? k : null; }
// push subscription key namespace so it never collides with a technician id
function pushKey(id) { return 'store:' + String(id || '').toLowerCase(); }

module.exports = { list, names, byId, byToken, login, pushKey };
