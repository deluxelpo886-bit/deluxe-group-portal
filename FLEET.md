# Live Fleet Tracking — Total Secure → the Fleet Master map

This wires **live vehicle positions from Total Secure** (your Traccar GPS
server at `https://tracking.totalsecureme.com`) into the **Fleet Master & Live
Dispatch** map, served as a **shareable link** at **`/fleet`**.

## How it works (and why it's safe to share)

A plain HTML file can't talk to Total Secure directly — the browser blocks it,
and any login written into the page would be visible to everyone you share it
with. So the login stays **on the server**:

```
Total Secure (Traccar)  →  portal server logs in privately, every 30s
                        →  publishes ONLY coordinates at /api/positions
                        →  /fleet page reads that and moves the markers
```

Your Total Secure password lives **only** in the server's private settings
(environment variables) — never in the code, the repo, or the shared page. That
means the `/fleet` link is safe to send to anyone: they see live vehicles, not
your password.

## What was added

| File | Purpose |
| --- | --- |
| `server/positions.js` | Logs into Total Secure, polls devices + positions every 30s, keeps the latest snapshot (also cached to `data/positions.json` so a restart isn't blank). |
| `server/server.js` | New `GET /api/positions` (the coordinates feed) and `GET /fleet` (the map page, served with a map-friendly security policy). |
| `server/fleet.html` | Your Fleet Master dashboard, now driven live: the vehicle markers move, and the badge shows `● live · N vehicles · Ns ago`. |

Nothing else in the portal changes; if the tracking env vars aren't set, live
tracking is simply off and the rest of the portal runs normally.

## Setup on Render (one time, ~5 minutes)

1. Merge this branch and let Render deploy it (or push and it auto-deploys).
2. In the Render dashboard → your portal service → **Environment** → add:

   | Key | Value |
   | --- | --- |
   | `TRACCAR_URL` | `https://tracking.totalsecureme.com` |
   | `TRACCAR_USER` | your Total Secure username (e.g. `DELUXEMOTOR`) |
   | `TRACCAR_PASSWORD` | your Total Secure password |

   Optional:
   | Key | Value |
   | --- | --- |
   | `TRACCAR_POLL_MS` | how often to refresh, in milliseconds (default `30000` = 30s) |
   | `FLEET_TOKEN` | if set, the link needs `?key=<token>` — see *Locking it down* |

3. Save (Render restarts the service). Open **`https://<your-portal>/fleet`** —
   within ~30s the badge turns green and the vehicles appear.

> Type the password directly into Render. Don't put it in the code or send it in
> chat/email. And please **change your Total Secure password** if it's weak or has
> been shared anywhere — update it in Total Secure, then in the Render value.

## Keeping it always-on (24/7)

The poller only runs while the portal service is awake.

- **Recommended — Render "Starter" instance (~$7/month):** the service never
  sleeps, so tracking runs true 24/7 with zero babysitting. In Render, change
  the service's **Instance Type** from Free to Starter. Simplest and most
  reliable — this is the right choice given you want always-on.
- **Free alternative:** stay on the Free instance but add a free uptime pinger
  (e.g. UptimeRobot or cron-job.org) that requests
  `https://<your-portal>/api/health` every 5 minutes so the service doesn't fall
  asleep. Works, but Free instances have monthly hour limits and can still be
  briefly unavailable, so it's less dependable than Starter.

## Sharing the link

Send anyone **`https://<your-portal>/fleet`**. It's a live web page — it keeps
updating on their screen, no login, no app install, and no password inside it.

## Locking it down (optional)

If you don't want the link to be fully public, set a `FLEET_TOKEN` (any hard-to-
guess word) in Render. Then only `https://<your-portal>/fleet?key=<token>` works,
and the same `?key=` is passed through to the data feed automatically. Share the
full link *with* the `?key=` part to the people who should see it.

## Matching vehicles to generators

The map shows every device in your Total Secure account, labelled with that
device's name from Total Secure (e.g. "Truck DXB-1"). Rename devices in Total
Secure and the new names show up automatically. The breakdown-dispatch tool
("nearest vehicle") now uses these **live** positions.

## Troubleshooting (the badge tells you)

- **`● live · N vehicles · Ns ago`** — working.
- **`GPS error: login failed …`** — check `TRACCAR_USER` / `TRACCAR_PASSWORD`.
  (If your account signs in by username, put the username in `TRACCAR_USER`.)
- **`connected · waiting for first GPS fix`** — logged in, but no device is
  reporting a position yet.
- **`GPS offline … retrying`** — the page can't reach the portal server (asleep
  or deploying); it retries automatically.
