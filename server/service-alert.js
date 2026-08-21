'use strict';
/*
 * Morning WhatsApp service reminder.
 *
 * Builds a short digest of the generators due for service (overdue + due within
 * a window, off-hire units excluded) and sends it over WhatsApp via Twilio. Used
 * by a daily scheduler in server.js and by the "Send now" button on the
 * dashboard. Everything degrades gracefully when Twilio isn't configured - the
 * digest can still be previewed in the app without sending anything.
 *
 * Config (environment variables):
 *   SERVICE_ALERT_WHATSAPP_TO   comma-separated recipient numbers (e.g. +9715...)
 *   SERVICE_ALERT_HOUR          hour of day to send, 0-23 (default 7)
 *   SERVICE_ALERT_WINDOW_DAYS   how many days ahead counts as "due soon" (default 7)
 *   ALERT_TIMEZONE              timezone for "today" and the send hour (default Asia/Dubai)
 *   plus the TWILIO_* vars read by ./whatsapp
 */

const serviceLog = require('./service');
const hire = require('./hire');
const whatsapp = require('./whatsapp');

const PUBLIC_URL = (process.env.KEEPALIVE_URL || process.env.RENDER_EXTERNAL_URL
  || 'https://deluxe-group-portal.onrender.com').replace(/\/+$/, '');

function tz() { return process.env.ALERT_TIMEZONE || 'Asia/Dubai'; }
function windowDays() {
  const n = Number(process.env.SERVICE_ALERT_WINDOW_DAYS);
  return n > 0 ? n : 7;
}
function recipients() {
  return String(process.env.SERVICE_ALERT_WHATSAPP_TO || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
}

// Today's date (YYYY-MM-DD) in the alert timezone, so "due today" lines up with
// the customer's day rather than the server's UTC clock.
function todayInTz() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz(), year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = {};
  fmt.formatToParts(new Date()).forEach((p) => { parts[p.type] = p.value; });
  return parts.year + '-' + parts.month + '-' + parts.day;
}

function prettyDate(iso) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz(), weekday: 'short', day: '2-digit', month: 'short',
    }).format(new Date(iso + 'T00:00:00'));
  } catch (_) { return iso; }
}

// Compute the list of generators due for service and a ready-to-send text.
function buildDigest() {
  const win = windowDays();
  const todayStr = todayInTz();
  const today = new Date(todayStr + 'T00:00:00');
  const hm = hire.getMap();

  const due = [];
  serviceLog.getAll().forEach((g) => {
    const h = hm[g.dg];
    if (h && h.offHire) return;            // off-hire units are idle - skip
    if (!g.nextServiceDate) return;
    const days = Math.round((new Date(g.nextServiceDate + 'T00:00:00') - today) / 86400000);
    if (days <= win) due.push({ dg: g.dg, days, nextService: g.nextService, nextServiceDate: g.nextServiceDate });
  });
  due.sort((a, b) => a.days - b.days);

  const overdue = due.filter((x) => x.days < 0);
  const soon = due.filter((x) => x.days >= 0);

  const MAX = 25; // keep the WhatsApp message a sensible length
  function line(x) {
    const when = x.days < 0 ? ('overdue ' + Math.abs(x.days) + 'd')
      : (x.days === 0 ? 'due today' : ('in ' + x.days + 'd'));
    return '• ' + x.dg + ' — ' + when + ' (next @ ' + x.nextService + 'h)';
  }

  let text = '🔧 Deluxe — Generators due for service (' + prettyDate(todayStr) + ')\n';
  if (!due.length) {
    text += '\nNothing due in the next ' + win + ' days. 👍';
  } else {
    if (overdue.length) {
      text += '\n⚠ OVERDUE (' + overdue.length + '):\n' + overdue.slice(0, MAX).map(line).join('\n') + '\n';
    }
    if (soon.length) {
      text += '\n🟡 Due soon (' + soon.length + '):\n' + soon.slice(0, Math.max(0, MAX - overdue.length)).map(line).join('\n') + '\n';
    }
    if (due.length > MAX) text += '\n…and ' + (due.length - MAX) + ' more.\n';
    text += '\nOpen the schedule: ' + PUBLIC_URL + '/schedule';
  }

  return {
    date: todayStr,
    windowDays: win,
    count: due.length,
    overdueCount: overdue.length,
    soonCount: soon.length,
    due,
    text,
  };
}

// Preview for the UI - the digest plus whether sending is possible.
function preview() {
  const digest = buildDigest();
  return {
    digest,
    configured: whatsapp.isConfigured(),
    recipients: recipients(),
    hour: (Number(process.env.SERVICE_ALERT_HOUR) >= 0 ? Number(process.env.SERVICE_ALERT_HOUR) : 7),
    timezone: tz(),
  };
}

// Build and send the digest over WhatsApp. When there's nothing due and force
// isn't set, it sends nothing (so the morning job stays quiet on empty days).
async function sendDigest(opts) {
  opts = opts || {};
  const digest = buildDigest();
  const to = recipients();
  if (!digest.count && !opts.force) return { sent: false, reason: 'nothing-due', digest };
  if (!whatsapp.isConfigured()) return { sent: false, reason: 'whatsapp-not-configured', digest, recipients: to };
  if (!to.length) return { sent: false, reason: 'no-recipients', digest };

  const results = [];
  for (const num of to) {
    try {
      const r = await whatsapp.sendWhatsApp({ to: num, body: digest.text });
      results.push(Object.assign({ to: num }, r));
    } catch (e) {
      results.push({ to: num, ok: false, error: (e && e.message) || 'send failed' });
    }
  }
  const anyOk = results.some((r) => r.ok);
  return { sent: anyOk, digest, results, recipients: to };
}

module.exports = { buildDigest, preview, sendDigest, recipients, windowDays };
