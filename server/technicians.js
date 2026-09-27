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

// name + phone (E.164 for tel: links). Phones match breakdowns.js TECH_PHONES.
const TECHS = [
  { id: 'sonu', name: 'Sonu Hussain', phone: '+971583883891' },
  { id: 'imran', name: 'Imran', phone: '+971568810583' },
  { id: 'adeel', name: 'Adeel', phone: '+971562534830' },
].map((t) => Object.assign(t, { token: TOKENS[t.id] || '' }));

function list() { return TECHS.map((t) => ({ id: t.id, name: t.name, phone: t.phone, token: t.token })); }
function byId(id) { return TECHS.find((t) => t.id === String(id || '').toLowerCase()) || null; }
function byToken(token) {
  const t = String(token || '').trim();
  if (!t) return null;
  return TECHS.find((x) => x.token && x.token === t) || null;
}

module.exports = { list, byId, byToken };
