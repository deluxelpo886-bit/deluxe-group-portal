'use strict';
/*
 * Procurement officers directory (Hafeez).
 *
 * Signs in to the Procurement app with a PIN and sees parts-to-buy sent from
 * the store, then sends the RFQ to the supplier WhatsApp group. Mirrors
 * storekeepers.js. Tokens/PINs overridable via PROC_TOKENS / PROC_PINS.
 */
const DEFAULT_TOKENS = { hafeez: 'hRfq7Prock9' };
const DEFAULT_PINS = { hafeez: '4001' };

function fromEnv(envName, defaults) {
  const out = Object.assign({}, defaults);
  const raw = String(process.env[envName] || '').trim();
  if (raw) raw.split(',').forEach((pair) => { const [id, v] = pair.split(':').map((s) => String(s || '').trim()); if (id && v) out[id.toLowerCase()] = v; });
  return out;
}
const TOKENS = fromEnv('PROC_TOKENS', DEFAULT_TOKENS);
const PINS = fromEnv('PROC_PINS', DEFAULT_PINS);

const OFFICERS = [
  { id: 'hafeez', name: 'Hafeez', phone: '' },
].map((o) => Object.assign(o, { token: TOKENS[o.id] || '', pin: PINS[o.id] || '' }));

function list() { return OFFICERS.map((o) => ({ id: o.id, name: o.name, phone: o.phone, token: o.token, pin: o.pin })); }
function names() { return OFFICERS.map((o) => ({ id: o.id, name: o.name })); }
function byId(id) { return OFFICERS.find((o) => o.id === String(id || '').toLowerCase()) || null; }
function byToken(token) { const t = String(token || '').trim(); if (!t) return null; return OFFICERS.find((o) => o.token && o.token === t) || null; }
function login(id, pin) { const o = byId(id); if (!o || !o.pin) return null; return (String(pin || '').trim() === String(o.pin)) ? o : null; }

module.exports = { list, names, byId, byToken, login };
