#!/usr/bin/env node
/**
 * Control-plane database backup.
 *
 * Backs up ONLY the license-server control-plane database (schools, users,
 * licenses, devices, sessions, audit logs, releases).
 *
 * This is NOT the school data backup: each school's operational data is
 * backed up by the desktop app to the SCHOOL OWNER's Google Drive. The
 * server-side database here is our own responsibility, so it gets its own
 * encrypted-at-rest, retained backups on the server infrastructure.
 *
 * Usage:
 *   node server/scripts/backup.js
 *   # schedule via cron/systemd timer, e.g. nightly:
 *   0 3 * * * /usr/bin/node /opt/sms/server/scripts/backup.js >> /var/log/sms-backup.log 2>&1
 */

// Loads .env.production / .env before anything reads configuration. Must be
// the first import so that C:\PET\data\... (production paths) are in effect
// and this command never touches the wrong database.
import { envLoadInfo } from '../src/lib/env-file.js';

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import config from '../src/config.js';
import { audit, AUDIT_ACTIONS } from '../src/lib/audit.js';

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function main() {
  const sourcePath = config.db.path;
  if (sourcePath === ':memory:') {
    console.error('❌ In-memory database — nothing to back up.');
    process.exit(64);
  }
  if (!fs.existsSync(sourcePath)) {
    console.error(`❌ Database file not found at ${sourcePath}`);
    process.exit(66);
  }

  fs.mkdirSync(config.backup.dir, { recursive: true });
  const dest = path.join(config.backup.dir, `control-plane-${timestamp()}.db`);

  // Use SQLite's online backup API (safe while the server is running).
  const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
  await source.backup(dest);
  source.close();

  // Verify the backup we just wrote.
  const check = new Database(dest, { readonly: true });
  const integrity = check.pragma('integrity_check', { simple: true });
  const tableCount = check
    .prepare(`SELECT COUNT(*) c FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
    .get().c;
  check.close();
  if (integrity !== 'ok' && integrity?.integrity_check !== 'ok') {
    fs.unlinkSync(dest);
    console.error('❌ Backup integrity check FAILED — backup deleted.');
    process.exit(70);
  }

  // Rotate: keep the newest N backups.
  const backups = fs
    .readdirSync(config.backup.dir)
    .filter(f => f.startsWith('control-plane-') && f.endsWith('.db'))
    .map(f => ({ f, m: fs.statSync(path.join(config.backup.dir, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  const removed = backups.slice(config.backup.keep);
  for (const old of removed) {
    fs.unlinkSync(path.join(config.backup.dir, old.f));
  }

  try {
    const { getDb, initDb } = await import('../src/db.js');
    initDb();
    audit({
      actorType: 'system',
      actorLabel: 'backup-script',
      action: AUDIT_ACTIONS.BACKUP_CREATED,
      targetType: 'database',
      metadata: { file: path.basename(dest), size_bytes: fs.statSync(dest).size, tables: tableCount },
    });
  } catch {
    /* auditing must never fail a backup */
  }

  console.log(`✅ Backup complete: ${dest}`);
  console.log(`   integrity: ok • tables: ${tableCount} • size: ${(fs.statSync(dest).size / 1024).toFixed(1)} KB`);
  console.log(`   retained: ${Math.min(backups.length, config.backup.keep)} (removed ${removed.length} old)`);
}

main().catch(err => {
  console.error('❌ Backup failed:', err.message);
  process.exit(70);
});
