'use strict';
/*
 * Technician job alert over WhatsApp / SMS (backup to the app's push).
 *
 * When the office dispatches a job we also try to reach the technician on
 * WhatsApp, and fall back to SMS - so they get the job even if they haven't
 * installed the app or push isn't available on their phone (e.g. an iPhone not
 * added to the home screen).
 *
 * Reuses the WhatsApp sender (whatsapp.js) and adds SMS. Everything degrades
 * gracefully and never throws: if Twilio isn't configured the call is a no-op.
 *   WhatsApp: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM
 *   SMS:      TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SMS_FROM (a Twilio number)
 */

const { sendWhatsApp, isConfigured: waConfigured } = require('./whatsapp');

const SID = process.env.TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TWILIO_AUTH_TOKEN;
const SMS_FROM = process.env.TWILIO_SMS_FROM || process.env.TWILIO_FROM || process.env.TWILIO_PHONE_NUMBER;

function smsConfigured() { return !!(SID && TOKEN && SMS_FROM); }
function ready() { return waConfigured() || smsConfigured(); }

function normalizePhone(v) {
  let d = String(v || '').replace(/[^\d+]/g, '');
  if (d && d[0] !== '+') d = '+' + d;
  return d;
}

async function sendSms(to, body) {
  if (!smsConfigured()) return { ok: false, configured: false };
  const twilio = require('twilio');
  const client = twilio(SID, TOKEN);
  const msg = await client.messages.create({ from: SMS_FROM, to: normalizePhone(to), body });
  return { ok: true, sid: msg.sid, status: msg.status };
}

// Try WhatsApp first; if it isn't configured or fails, try SMS. Best-effort.
async function alertTech(phone, text) {
  const out = { wa: null, sms: null };
  if (!phone) return out;
  if (waConfigured()) {
    try { out.wa = await sendWhatsApp({ to: phone, body: text }); }
    catch (e) { out.wa = { ok: false, message: (e && e.message) || 'wa failed' }; }
  }
  if (!(out.wa && out.wa.ok) && smsConfigured()) {
    try { out.sms = await sendSms(phone, text); }
    catch (e) { out.sms = { ok: false, message: (e && e.message) || 'sms failed' }; }
  }
  return out;
}

module.exports = { alertTech, ready, waConfigured, smsConfigured };
