# Making the portal's data permanent (IMPORTANT)

**Read this if data you entered in the portal disappears after a deploy.**

## What is happening

Everything the office enters in the portal — service logs, on-hire/off-hire
status, delivery notes, rentals, spares, schedule, customer sites, uploaded
files — is saved into a folder on the server (`data/` by default).

On Render, a web service's normal filesystem is **ephemeral**: it is a fresh
copy of the code every time the service is deployed **or** restarted. Anything
written to the ordinary folder is **wiped** on the next deploy/restart. That is
why entries vanish whenever a new version goes out.

To keep the data, it has to live on a **persistent disk** — a separate storage
volume that stays put across deploys and restarts. You tell the portal to use it
by pointing the `DB_PATH` environment variable at a path on that disk.

> How to check which mode you're in: open
> `https://<your-portal>/api/health`. If it shows `"storagePersistent": true`
> the disk is set up correctly. If it shows `false`, data is still ephemeral and
> will be lost on the next deploy — follow the steps below.

## Fix: add a persistent disk (one time, ~10 minutes)

Persistent disks on Render require a **paid instance** (the Free instance can't
have a disk). The **Starter** plan (~$7/month) is the simplest option, and it
also keeps the service always-on, which you want anyway.

1. **Render dashboard → your portal service → Settings → Instance Type** →
   change **Free** to **Starter** and save.

2. **Render dashboard → your portal service → Disks → Add Disk:**

   | Field | Value |
   | --- | --- |
   | **Name** | `data` (any name) |
   | **Mount Path** | `/var/data` |
   | **Size** | `1 GB` (plenty) |

   Save. Render will restart the service with the disk mounted at `/var/data`.

3. **Render dashboard → your portal service → Environment → Add Environment
   Variable:**

   | Key | Value |
   | --- | --- |
   | `DB_PATH` | `/var/data/deluxe.db` |

   Save (Render restarts again).

4. Open `https://<your-portal>/api/health` and confirm it now shows
   `"storagePersistent": true`.

From this point on, **deploys and restarts no longer erase anything.** The one
initial data set (the imported asset list) loads once onto the fresh disk, and
everything you enter after that is kept permanently.

## What about the data already lost?

Data entered while on ephemeral storage can't be recovered after a deploy. Once
the disk is in place, re-enter anything current and it will stick. Going forward,
turn on the built-in daily backup too: add `ENABLE_DAILY_BACKUP=true` in the
Environment (see `BACKUPS.md`) so timestamped copies are made on the same disk.

## Free-tier alternative (more work, less recommended)

If paying isn't an option, the data would have to move to an external free
database (e.g. Neon Postgres, Turso, or Supabase) instead of local files. That's
a code change and adds a network dependency; for a live business system the
$7/month disk is far simpler and more reliable. Ask and it can be built if you
truly need the free route.
