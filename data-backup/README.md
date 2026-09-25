# Data backups

Three layers keep the portal's data safe:

1. **Committed seed snapshots** (this folder) — `seed-backup-YYYY-MM-DD.json`
   bundles the seed files (service log, reminders, breakdowns, hire) at a point
   in time. These are in git, so they are safe even if a server disk is lost.

2. **Live working files on the Render persistent disk** — `service.json`,
   `overrides.json` (+ a one-behind `overrides.backup.json`), etc. These hold
   runtime changes (technician readings, manual overrides) and survive deploys
   because they live on the mounted disk, not the app folder.

3. **On-demand full export** — the **⬇ Backup** button on the fleet page (and
   `GET /api/fleet/backup`) downloads the entire live state — service log,
   manual overrides, reminders, breakdowns and hire — as one dated JSON file the
   office can keep off-server.

To restore from a backup JSON, feed the relevant arrays back through the seed
files (bump the seed version string) or the override API.
