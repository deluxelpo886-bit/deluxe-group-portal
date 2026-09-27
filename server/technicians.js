'use strict';
/*
 * Technicians directory.
 *
 * A short, fixed list of field technicians, each with a phone number (for the
 * customer-facing Call button and office dispatch) and a private access token.
 * The token is the ONLY key to that technician's job page (/tech/:token) - no
 * password, so a low-literacy tech just taps a saved link/home-screen icon and
 * sees their jobs. Tokens can be overridden per deploy with the TECH_TOKENS
 * env var ("sonu:xxx,imran:yyy,adeel:zzz").
 */

const DEFAULT_TOKENS = {
  sonu: 'MLK5vC7_Ncyo',
  imran: 'NsSWLPSe8CGg',
  adeel: 'zDc34XNmuUVT',
};

function tokensFromEnv() {
  const out = Object.assign({}, DEFAULT_TOKENS);
  const raw = String(process.env.TECH_TOKENS || '').trim();
  if (raw) {
    raw.split(',').forEach((pair) => {
      const [id, tok] = pair.split(':').map((s) => String(s || '').trim());
      if (id && tok) out[id.toLowerCase()] = tok;
    });
  }
  return out;
}

const TOKENS = tokensFromEnv();

// Each technician signs in to the installed app with a short PIN (tell each
// tech their own). PINs can be overridden per deploy with TECH_PINS
// ("sonu:1234,imran:5678,adeel:4321").
const DEFAULT_PINS = { sonu: '2001', imran: '2002', adeel: '2003' };
function pinsFromEnv() {
  const out = Object.assign({}, DEFAULT_PINS);
  const raw = String(process.env.TECH_PINS || '').trim();
  if (raw) raw.split(',').forEach((pair) => { const [id, pin] = pair.split(':').map((s) => String(s || '').trim()); if (id && pin) out[id.toLowerCase()] = pin; });
  return out;
}
const PINS = pinsFromEnv();

// name + phone (E.164 for tel: links). Phones match breakdowns.js TECH_PHONES.
const TECHS = [
  { id: 'sonu', name: 'Sonu Hussain', phone: '+971583883891' },
  { id: 'imran', name: 'Imran', phone: '+971568810583' },
  { id: 'adeel', name: 'Adeel', phone: '+971562534830' },
].map((t) => Object.assign(t, { token: TOKENS[t.id] || '', pin: PINS[t.id] || '' }));

// Public list for the office (includes token + pin so the office can tell each
// tech their PIN and share their link). Not exposed to the technician app.
function list() { return TECHS.map((t) => ({ id: t.id, name: t.name, phone: t.phone, token: t.token, pin: t.pin })); }
function byId(id) { return TECHS.find((t) => t.id === String(id || '').toLowerCase()) || null; }
function byToken(token) {
  const t = String(token || '').trim();
  if (!t) return null;
  return TECHS.find((x) => x.token && x.token === t) || null;
}
// Sign in with technician id + PIN -> returns the technician (with token) or null.
function login(id, pin) {
  const t = byId(id);
  if (!t || !t.pin) return null;
  return (String(pin || '').trim() === String(t.pin)) ? t : null;
}
// Names only, for the app's sign-in picker (no tokens/pins leaked).
function names() { return TECHS.map((t) => ({ id: t.id, name: t.name })); }

module.exports = { list, names, byId, byToken, login };
