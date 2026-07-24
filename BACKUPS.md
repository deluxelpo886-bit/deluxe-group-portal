# Database backups

The portal stores everything in a single SQLite database (`data/deluxe.db` by
default, WAL mode). `scripts/backup-db.js` makes safe, timestamped copies using
better-sqlite3's online backup API and prunes old ones.

## What it does

- Copies the live DB to `backups/deluxe-<timestamp>.db` (safe on a running,
  WAL-mode database — do not just `cp` the file).
- Deletes backups older than `BACKUP_RETENTION_DAYS` (default 14).

## Configuration (env vars)

| Variable                 | Default          | Purpose                                  |
| ------------------------ | ---------------- | ---------------------------------------- |
| `DB_PATH`                | `data/deluxe.db` | Source database to back up.              |
| `BACKUP_DIR`             | `backups/`       | Where copies are written.                |
| `BACKUP_RETENTION_DAYS`  | `14`             | Delete backups older than this many days.|
| `ENABLE_DAILY_BACKUP`    | (unset)          | `true` turns on the in-process scheduler.|

## Running it

Manually / one-off:

```bash
npm run backup
```

## Scheduling daily backups

### Option A (recommended on Render): in-process scheduler

Set `ENABLE_DAILY_BACKUP=true` in the web service's environment. On boot the
server runs a backup immediately, then every 24 hours (see `server/server.js`).

Why this over a Render Cron Job: a Render Cron Job runs in a **separate
container** that does **not** share the web service's persistent disk, so it
can't see `data/deluxe.db`. Running the backup inside the web process keeps it
on the same disk as the database.

> Note: backups on the same disk protect against accidental data changes, not
> disk loss. For durability, periodically copy `backups/` off-box (e.g. upload
> to S3 / another provider) or download them.

### Option B: system cron (self-hosted / VPS)

```cron
# Daily at 02:30
30 2 * * * cd /path/to/deluxe-group-portal && /usr/bin/npm run backup >> /var/log/deluxe-backup.log 2>&1
```

## Restoring

Stop the app, replace the database with a chosen backup, then restart:

```bash
cp backups/deluxe-2026-07-24T02-30-00-000Z.db data/deluxe.db
```

(Remove any stale `data/deluxe.db-wal` / `data/deluxe.db-shm` files first.)
