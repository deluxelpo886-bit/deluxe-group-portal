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
const email = require('./email');

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
// Email recipients for the morning digest. Falls back to the general alert
// recipient (ALERT_EMAIL_TO) so one address can cover everything.
function emailRecipients() {
  return String(process.env.SERVICE_ALERT_EMAIL_TO || process.env.ALERT_EMAIL_TO || '')
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

// Compute the generators needing attention and a ready-to-send text, using the
// hours-first "confirm before dispatch" logic: machines confirmed due by real
// running hours are separated from those only flagged by the calendar estimate
// (whose hours must be confirmed before a team is sent). Off-hire units are
// excluded.
function buildDigest() {
  const win = windowDays();
  const todayStr = todayInTz();
  const hm = hire.getMap();

  const send = [];    // confirmed due by hours -> send the team
  const confirm = []; // estimate flags due/soon but hours not confirmed
  serviceLog.getAll().forEach((g) => {
    const h = hm[g.dg];
    if (h) g.offHire = !!h.offHire;
    const d = serviceLog.classifyDue(g, todayStr, { windowDays: win });
    if (d.state === 'due') send.push({ dg: g.dg, nextService: g.nextService, currentHours: g.currentHours, hoursLeft: d.hoursLeft, nextServiceDate: g.nextServiceDate });
    else if (d.state === 'confirm') confirm.push({ dg: g.dg, nextService: g.nextService, days: d.daysEst, nextServiceDate: g.nextServiceDate });
  });
  send.sort((a, b) => (a.hoursLeft || 0) - (b.hoursLeft || 0));
  confirm.sort((a, b) => (a.days || 0) - (b.days || 0));

  const count = send.length + confirm.length;
  const MAX = 20; // keep the WhatsApp message a sensible length

  let text = '🔧 Deluxe — Service check (' + prettyDate(todayStr) + ')\n';
  if (!count) {
    text += '\nNothing due in the next ' + win + ' days. 👍';
  } else {
    if (send.length) {
      text += '\n🔴 SEND TEAM — confirmed due by hours (' + send.length + '):\n'
        + send.slice(0, MAX).map((x) => '• ' + x.dg + ' — ' + Math.abs(x.hoursLeft || 0) + 'h over (next @ ' + x.nextService + 'h)').join('\n') + '\n';
    }
    if (confirm.length) {
      text += '\n🔵 CONFIRM HOURS FIRST — flagged by date estimate (' + confirm.length + '):\n'
        + confirm.slice(0, Math.max(0, MAX - send.length)).map((x) => {
          const when = x.days < 0 ? ('est. due ' + Math.abs(x.days) + 'd ago') : (x.days === 0 ? 'est. due today' : ('est. in ' + x.days + 'd'));
          return '• ' + x.dg + ' — ' + when;
        }).join('\n') + '\n';
      text += '\nCheck the real running hours before sending anyone — low-usage units may not be due.\n';
    }
    text += '\nOpen the schedule: ' + PUBLIC_URL + '/schedule';
  }

  return {
    date: todayStr,
    windowDays: win,
    count,
    sendCount: send.length,
    confirmCount: confirm.length,
    send,
    confirm,
    // kept for the email HTML / backward compatibility: a flat "due" list
    due: send.map((x) => ({ dg: x.dg, days: 0, nextService: x.nextService, nextServiceDate: x.nextServiceDate }))
      .concat(confirm.map((x) => ({ dg: x.dg, days: x.days, nextService: x.nextService, nextServiceDate: x.nextServiceDate }))),
    text,
  };
}

// HTML version of the digest for the email channel: the same two groups as the
// text - confirmed due by hours (send the team) and estimate-flagged (confirm
// hours first).
function buildHtml(digest) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  function section(title, colour, note, rowsHtml) {
    return '<div style="margin:14px 0 4px;font-weight:700;color:' + colour + ';">' + title + '</div>'
      + (note ? '<div style="color:#666;font-size:13px;margin-bottom:6px;">' + note + '</div>' : '')
      + '<table style="border-collapse:collapse;width:100%;font-size:14px;">' + rowsHtml + '</table>';
  }
  const sendRows = (digest.send || []).map((x) => '<tr>'
    + '<td style="padding:6px 10px;border-bottom:1px solid #eee;font-family:monospace;font-weight:700;">' + esc(x.dg) + '</td>'
    + '<td style="padding:6px 10px;border-bottom:1px solid #eee;color:#c0392b;font-weight:600;">' + esc(Math.abs(x.hoursLeft || 0)) + 'h over</td>'
    + '<td style="padding:6px 10px;border-bottom:1px solid #eee;">next @ ' + esc(x.nextService) + 'h' + (x.currentHours != null ? (' &middot; now ' + esc(x.currentHours) + 'h') : '') + '</td></tr>').join('');
  const confirmRows = (digest.confirm || []).map((x) => {
    const when = x.days < 0 ? ('est. due ' + Math.abs(x.days) + 'd ago') : (x.days === 0 ? 'est. due today' : ('est. in ' + x.days + 'd'));
    return '<tr>'
      + '<td style="padding:6px 10px;border-bottom:1px solid #eee;font-family:monospace;font-weight:700;">' + esc(x.dg) + '</td>'
      + '<td style="padding:6px 10px;border-bottom:1px solid #eee;color:#1a6fd6;font-weight:600;">' + esc(when) + '</td>'
      + '<td style="padding:6px 10px;border-bottom:1px solid #eee;">next @ ' + esc(x.nextService) + 'h</td></tr>';
  }).join('');
  return '<div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:640px;">'
    + '<h2 style="margin:0 0 4px;">🔧 Service check</h2>'
    + '<div style="color:#666;margin-bottom:8px;">' + esc(prettyDate(digest.date)) + ' &middot; next ' + esc(digest.windowDays) + ' days</div>'
    + (digest.count
      ? ((digest.sendCount ? section('🔴 Send the team — confirmed due by hours (' + digest.sendCount + ')', '#c0392b', '', sendRows) : '')
        + (digest.confirmCount ? section('🔵 Confirm hours first — flagged by date estimate (' + digest.confirmCount + ')', '#1a6fd6', 'Check the real running hours before sending anyone — low-usage units may not be due.', confirmRows) : ''))
      : '<p style="font-size:15px;">Nothing due in the next ' + esc(digest.windowDays) + ' days. 👍</p>')
    + '<p style="margin-top:16px;"><a href="' + PUBLIC_URL + '/schedule" style="color:#1a6fd6;">Open the schedule →</a></p>'
    + '</div>';
}

// Preview for the UI - the digest plus whether sending is possible on each channel.
function preview() {
  const digest = buildDigest();
  return {
    digest,
    configured: whatsapp.isConfigured() || email.isConfigured(),
    whatsapp: { configured: whatsapp.isConfigured(), recipients: recipients() },
    email: { configured: email.isConfigured(), recipients: emailRecipients() },
    // kept for backwards-compatibility with the existing dashboard UI
    recipients: recipients(),
    hour: (Number(process.env.SERVICE_ALERT_HOUR) >= 0 ? Number(process.env.SERVICE_ALERT_HOUR) : 7),
    timezone: tz(),
  };
}

// Build and send the digest over every configured channel (WhatsApp and/or
// email), independently, so a failure or missing config on one channel never
// blocks the other. When there's nothing due and force isn't set it sends
// nothing, so the morning job stays quiet on empty days.
async function sendDigest(opts) {
  opts = opts || {};
  const digest = buildDigest();
  if (!digest.count && !opts.force) return { sent: false, reason: 'nothing-due', digest };

  const waTo = recipients();
  const emTo = emailRecipients();
  const out = { sent: false, digest, whatsapp: null, email: null, recipients: waTo };

  // WhatsApp channel
  if (whatsapp.isConfigured() && waTo.length) {
    const results = [];
    for (const num of waTo) {
      try {
        const r = await whatsapp.sendWhatsApp({ to: num, body: digest.text });
        results.push(Object.assign({ to: num }, r));
      } catch (e) {
        results.push({ to: num, ok: false, error: (e && e.message) || 'send failed' });
      }
    }
    out.whatsapp = { results, ok: results.some((r) => r.ok) };
  } else {
    out.whatsapp = { skipped: true, reason: whatsapp.isConfigured() ? 'no-recipients' : 'not-configured' };
  }

  // Email channel
  if (email.isConfigured() && emTo.length) {
    const subject = 'Deluxe — Generators due for service (' + prettyDate(digest.date) + ')';
    try {
      const r = await email.sendEmail({ to: emTo.join(','), subject, text: digest.text, html: buildHtml(digest) });
      out.email = Object.assign({ to: emTo }, r);
    } catch (e) {
      out.email = { ok: false, to: emTo, error: (e && e.message) || 'send failed' };
    }
  } else {
    out.email = { skipped: true, reason: email.isConfigured() ? 'no-recipients' : 'not-configured' };
  }

  out.sent = !!((out.whatsapp && out.whatsapp.ok) || (out.email && out.email.ok));
  if (!out.sent && !whatsapp.isConfigured() && !email.isConfigured()) out.reason = 'no-channel-configured';
  else if (!out.sent && !waTo.length && !emTo.length) out.reason = 'no-recipients';
  return out;
}

module.exports = { buildDigest, buildHtml, preview, sendDigest, recipients, emailRecipients, windowDays };
