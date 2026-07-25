'use strict';

// Real automated WhatsApp sending via Twilio's WhatsApp Business API.
//
// Credentials come from environment variables (never hardcoded):
//   TWILIO_ACCOUNT_SID   - your Twilio Account SID
//   TWILIO_AUTH_TOKEN    - your Twilio Auth Token
//   TWILIO_WHATSAPP_FROM - the WhatsApp sender, e.g. "whatsapp:+14155238886"
//                          (the Twilio Sandbox number while testing, or your
//                          approved WhatsApp Business sender in production)
//
// If any of these are missing the module reports itself unconfigured and the
// caller falls back to opening a wa.me link, so the app keeps working without
// Twilio set up. See WHATSAPP.md.

const twilio = require('twilio');

const SID = process.env.TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TWILIO_AUTH_TOKEN;
const FROM = process.env.TWILIO_WHATSAPP_FROM;

function isConfigured() {
  return !!(SID && TOKEN && FROM);
}

function normalizeAddress(value) {
  const v = String(value || '').trim();
  if (v.indexOf('whatsapp:') === 0) return v;
  let digits = v.replace(/[^\d+]/g, '');
  if (digits && digits[0] !== '+') digits = '+' + digits;
  return 'whatsapp:' + digits;
}

// opts: { to, body?, contentSid?, contentVariables? }
// Use `body` for freeform text (Twilio Sandbox, or within a 24h session window).
// Use `contentSid` (+ optional contentVariables) for an approved template, which
// is required for business-initiated production messages.
// Returns { ok, sid?, status?, configured?, message? } - never throws for the
// unconfigured case; real Twilio/network errors reject and are handled by the route.
async function sendWhatsApp(opts) {
  if (!isConfigured()) {
    return { ok: false, configured: false, message: 'Twilio WhatsApp is not configured' };
  }
  const client = twilio(SID, TOKEN);
  const params = { from: normalizeAddress(FROM), to: normalizeAddress(opts.to) };
  if (opts.contentSid) {
    params.contentSid = opts.contentSid;
    if (opts.contentVariables) {
      params.contentVariables = typeof opts.contentVariables === 'string'
        ? opts.contentVariables
        : JSON.stringify(opts.contentVariables);
    }
  } else {
    params.body = opts.body;
  }
  const msg = await client.messages.create(params);
  return { ok: true, sid: msg.sid, status: msg.status };
}

module.exports = { sendWhatsApp, isConfigured };
