# Automated alerts (email + WhatsApp)

The server can evaluate each company's alerts and send them automatically,
without anyone having the app open. Alerts cover:

- **Generators** due / overdue for service (by remaining hours vs `warnHrs`)
- **LPOs** expiring soon or expired (by days vs `lpoWarn` / 7 days)
- **Invoices** unapproved ≥30 / ≥60 days (excluding Paid)
- **Parts** low or out of stock (by qty vs reorder level)

These mirror the in-app alarm thresholds (`server/alerts.js`).

## Channels

- **Email** via SMTP (`server/email.js`). Recipient is the address configured
  in **Settings → Email** (`email.to`), falling back to `ALERT_EMAIL_TO`.
- **WhatsApp** via Twilio (`server/whatsapp.js`), sent to the **Settings →
  WhatsApp number**. See `WHATSAPP.md`.

Each channel degrades independently: if SMTP or Twilio isn't configured, that
channel is skipped and the other still sends.

## Environment variables

| Variable | Example | Purpose |
| --- | --- | --- |
| `ENABLE_DAILY_ALERTS` | `true` | Turn on the once-a-day scheduler |
| `SMTP_HOST` | `smtp.gmail.com` | SMTP server |
| `SMTP_PORT` | `587` | SMTP port (465 = implicit TLS) |
| `SMTP_USER` | `alerts@yourco.com` | SMTP username |
| `SMTP_PASS` | `app-password` | SMTP password / app password / API key |
| `ALERT_EMAIL_FROM` | `alerts@yourco.com` | From address (defaults to `SMTP_USER`) |
| `ALERT_EMAIL_TO` | `ops@yourco.com` | Fallback recipient if none set in Settings |
| `TWILIO_*` | — | WhatsApp sending (see `WHATSAPP.md`) |

Gmail example: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER` = your
Gmail address, `SMTP_PASS` = a 16-char **App Password** (not your login
password; requires 2FA on the Google account).

## Scheduler

With `ENABLE_DAILY_ALERTS=true`, the server checks every 15 minutes and sends
each company's summary **once a day at a configurable hour**. Set the hour per
company in **Settings → Server Alerts → "Send daily alerts at"** (default
**07:00**). The clock is `ALERT_TIMEZONE` (default **Asia/Dubai**). It sends
**only when there is at least one alert**, so a quiet day produces no message.

| Variable | Example | Purpose |
| --- | --- | --- |
| `ALERT_TIMEZONE` | `Asia/Dubai` | IANA timezone the send-hour is interpreted in |

> The "already sent today" marker is in memory, so a server restart during the
> configured hour could send a second time that day - a minor, rare edge.

## Manual trigger / testing

`POST /api/send-alerts/:company` (`energy` | `heavy`, auth required) computes
and sends that company's alerts immediately (always sends, even with zero
alerts, so you can test delivery). The JSON response reports per-channel
results:

```json
{
  "ok": true, "company": "energy", "count": 3, "sent": true,
  "email": { "ok": true, "id": "<...>" },
  "whatsapp": { "ok": true, "sid": "SM..." }
}
```

Without SMTP/Twilio configured you'll see `{ "ok": false, "configured": false }`
per channel instead — nothing errors out.
