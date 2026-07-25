'use strict';

// Automated email sending over SMTP (nodemailer). Provider-agnostic - works
// with Gmail app passwords, SendGrid/Mailgun/Postmark SMTP, etc.
//
// Environment variables (never hardcoded):
//   SMTP_HOST          - SMTP server host (e.g. smtp.gmail.com)
//   SMTP_PORT          - SMTP port (587 STARTTLS default, 465 = implicit TLS)
//   SMTP_USER          - SMTP username
//   SMTP_PASS          - SMTP password / app password / API key
//   ALERT_EMAIL_FROM   - From address (defaults to SMTP_USER)
//
// If SMTP isn't configured the caller degrades gracefully (email is skipped).

const nodemailer = require('nodemailer');

const HOST = process.env.SMTP_HOST;
const PORT = process.env.SMTP_PORT;
const USER = process.env.SMTP_USER;
const PASS = process.env.SMTP_PASS;
const FROM = process.env.ALERT_EMAIL_FROM || USER;

function isConfigured() {
  return !!(HOST && USER && PASS);
}

let transporter = null;
function getTransport() {
  if (!isConfigured()) return null;
  if (!transporter) {
    const port = Number(PORT) || 587;
    transporter = nodemailer.createTransport({
      host: HOST,
      port: port,
      secure: port === 465,
      auth: { user: USER, pass: PASS }
    });
  }
  return transporter;
}

// opts: { to, subject, text }
async function sendEmail(opts) {
  if (!isConfigured()) {
    return { ok: false, configured: false, message: 'Email (SMTP) is not configured' };
  }
  const info = await getTransport().sendMail({
    from: FROM,
    to: opts.to,
    subject: opts.subject,
    text: opts.text
  });
  return { ok: true, id: info.messageId };
}

module.exports = { sendEmail, isConfigured };
