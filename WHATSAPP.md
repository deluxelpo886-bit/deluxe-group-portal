# WhatsApp alerts via Twilio

The portal can send alert summaries over WhatsApp automatically through Twilio's
WhatsApp Business API. If Twilio isn't configured, the **Send WhatsApp** buttons
fall back to opening a pre-filled `wa.me` link (the original behaviour), so
nothing breaks without setup.

## Configuration (environment variables)

Set these in your host (e.g. Render → Environment). Never hardcode them.

| Variable | Example | Purpose |
| --- | --- | --- |
| `TWILIO_ACCOUNT_SID` | `ACxxxxxxxx…` | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | `your-auth-token` | Twilio Auth Token |
| `TWILIO_WHATSAPP_FROM` | `whatsapp:+14155238886` | Your WhatsApp sender (Sandbox number while testing, or your approved Business sender in production) |

The recipient is the number set in the app under **Settings → WhatsApp number**.

## Testing quickly with the Twilio Sandbox

1. In the Twilio Console: **Messaging → Try it out → Send a WhatsApp message**.
2. From your phone, send the sandbox `join <code>` message to the sandbox number
   to opt in.
3. Set `TWILIO_WHATSAPP_FROM=whatsapp:+14155238886` (the sandbox number) and your
   SID/token.
4. Put your opted-in phone number in **Settings → WhatsApp number** and click
   **Send WhatsApp** — it sends for real.

The sandbox allows freeform text, which is what the alert summary uses.

## Going to production

Production **business-initiated** messages (sending before the recipient has
messaged you in the last 24 hours) must use a **pre-approved message template**,
not freeform text. To support that:

1. Complete Meta Business Verification and register your WhatsApp sender
   (see the setup notes discussed in-app; typically ~1–3 weeks, mostly Meta
   verification).
2. Create and get an approval for a Content template in Twilio; note its
   Content SID (`HXxxxxxxxx…`).
3. The backend already accepts a template: `POST /api/send-wa` takes
   `{ to, contentSid, contentVariables }` in addition to `{ to, body }`.
   Wire the alert buttons to pass `contentSid` + the variables your template
   expects instead of `body`.

Utility templates (transactional alerts like these) are the low-cost category
and, in the UAE, are roughly ~US$0.03/message including Twilio's per-message fee.

## Morning service reminder (why it may not arrive)

The daily 07:00 digest of generators due for service can be sent by **WhatsApp,
email, or both**. Two things stop the WhatsApp version from arriving:

1. **The service must be awake at 07:00.** The reminder runs *inside* the web
   service. On Render's **Free** plan the service sleeps after ~15 min idle, so
   at 7 AM it's usually asleep and the timer never fires. Fix: use the **Starter**
   instance (never sleeps — this also makes your data permanent, see
   [STORAGE.md](STORAGE.md)), or add an external uptime pinger (UptimeRobot /
   cron-job.org) hitting `/api/health` every 5 minutes.

2. **The Twilio WhatsApp *Sandbox* only allows freeform messages within 24 hours
   of your last message to it.** An unprompted 7 AM WhatsApp therefore gets
   blocked on any day you didn't just message the sandbox. Reliable daily WhatsApp
   needs an approved **template** on a real Business sender (see *Going to
   production* above) — that's paid and takes Meta verification.

**Recommended: send the morning reminder by email** — it has no 24-hour window
and no template approval, so it "just works". The SMTP mailer is already built
in. Set these in Render → Environment:

| Variable | Example | Purpose |
| --- | --- | --- |
| `SMTP_HOST` | `smtp.gmail.com` | SMTP server |
| `SMTP_PORT` | `587` | 587 (STARTTLS) or 465 (TLS) |
| `SMTP_USER` | `you@gmail.com` | SMTP username |
| `SMTP_PASS` | *(app password)* | Gmail **App Password**, not your login password |
| `SERVICE_ALERT_EMAIL_TO` | `you@gmail.com` | who receives the morning digest (comma-separate for several) |

Optional: `SERVICE_ALERT_HOUR` (0–23, default 7), `ALERT_TIMEZONE` (default
`Asia/Dubai`). With email configured, the boot log shows
`[service-alert] morning reminder enabled via email`. You can send it on demand
any time from the dashboard's **Send now** button to test.

## Endpoint reference

`POST /api/send-wa` (auth required)

```json
{ "to": "+9715XXXXXXXX", "body": "Alert text..." }
```

Response: `{ "ok": true, "sid": "SM...", "status": "queued" }` on success, or
`{ "ok": false, "configured": false }` when Twilio isn't set up (frontend falls
back to `wa.me`), or `{ "ok": false, "message": "..." }` on a send error.
