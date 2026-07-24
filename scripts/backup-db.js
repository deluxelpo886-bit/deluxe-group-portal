#!/usr/bin/env node
'use strict';

// Daily backup of the SQLite database.
//
// Uses better-sqlite3's online backup API (db.backup), which is safe to run
// while the server is live and correctly handles WAL-mode databases. A plain
// filesystem copy of a WAL database is NOT safe - it can miss committed data
// still sitting in the -wal file, or capture a torn write.
//
// Writes a timestamped copy into BACKUP_DIR and prunes copies older than
// BACKUP_RETENTION_DAYS.
//
// Run manually / from cron:   npm run backup
// Or enable the in-process daily scheduler in server.js with
//   ENABLE_DAILY_BACKUP=true

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'deluxe.db');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');
const RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS || '14', 10);

async function runBackup() {
  if (!fs.existsSync(DB_PATH)) {
    throw new Error('Database not found at ' + DB_PATH);
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(BACKUP_DIR, 'deluxe-' + stamp + '.db');

  const db = new Database(DB_PATH, { readonly: true });
  try {
    await db.backup(dest);
    console.log('Backup written to ' + dest);
  } finally {
    db.close();
  }

  pruneOld();
  return dest;
}

function pruneOld() {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  for (const file of fs.readdirSync(BACKUP_DIR)) {
    if (!file.startsWith('deluxe-') || !file.endsWith('.db')) continue;
    const full = path.join(BACKUP_DIR, file);
    if (fs.statSync(full).mtimeMs < cutoff) {
      fs.unlinkSync(full);
      console.log('Pruned old backup ' + file);
    }
  }
}

// Auto-run only when invoked directly (node scripts/backup-db.js), not when
// required by the in-process scheduler in server.js.
if (require.main === module) {
  runBackup().catch((err) => {
    console.error('Backup failed:', err.message);
    process.exit(1);
  });
}

module.exports = { runBackup };
