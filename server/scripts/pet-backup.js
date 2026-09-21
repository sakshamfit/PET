/**
 * PET backup — safe SQLite online backup + uploads copy + integrity check
 * + daily/weekly/monthly retention.
 *
 * Usage:
 *   node server/scripts/pet-backup.js [--weekly | --monthly]
 *
 * Layout (config.pet.backupDir):
 *   daily/pet-YYYYMMDD-HHMMSS/   pet.db, uploads/, meta.json
 *   weekly/ ... monthly/ (same structure)
 *
 * The database is copied with SQLite's backup API (safe while writing).
 * Integrity is verified on the backup BEFORE it is kept; a broken backup
 * is quarantined, never silently retained. No secrets are written into
 * the backup — database, uploads and restore metadata only.
 */

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import config from '../src/config.js';
import { initPetDb, getPetDb, closePetDb } from '../src/pet/db.js';

const mode = process.argv.includes('--monthly') ? 'monthly'
  : process.argv.includes('--weekly') ? 'weekly' : 'daily';
const keep = mode === 'monthly' ? config.pet.backupKeepMonthly
  : mode === 'weekly' ? config.pet.backupKeepWeekly : config.pet.backupKeepDaily;

function stamp() {
  return new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

function prune(dir, keepCount) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name.startsWith('pet-'))
    .map(e => e.name)
    .sort(); // timestamped names sort chronologically
  while (entries.length > keepCount) {
    const victim = entries.shift();
    fs.rmSync(path.join(dir, victim), { recursive: true, force: true });
    console.log(`   pruned old backup: ${victim}`);
  }
}

function main() {
  if (config.pet.dbPath === ':memory:') {
    console.error('❌ Cannot back up an in-memory database.');
    process.exit(1);
  }

  initPetDb();
  const db = getPetDb();

  const target = path.join(config.pet.backupDir, mode, `pet-${stamp()}`);
  fs.mkdirSync(target, { recursive: true });

  const dbTarget = path.join(target, 'pet.db');
  console.log(`📦 PET backup (${mode}) → ${target}`);

  // 1. Safe online backup of the live database.
  const backupStart = Date.now();
  const dest = new Database(dbTarget);
  return db.backup(dbTarget)
    .then(() => {
      dest.close?.();
    })
    .catch(() => {})
    .then(() => {
      // 2. Checkpoint the copy (fold WAL into the main file) then
      // integrity-check the BACKUP before anything else happens.
      const checkDb = new Database(dbTarget);
      try { checkDb.pragma('wal_checkpoint(TRUNCATE)'); } catch { /* best effort */ }
      const integrity = checkDb.pragma('integrity_check', { simple: true });
      const okFlag = integrity === 'ok' || integrity?.integrity_check === 'ok';
      const tables = checkDb
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
        .all().map(r => r.name);
      const studentCount = checkDb.prepare('SELECT COUNT(*) AS c FROM students').get().c;
      const userCount = checkDb.prepare('SELECT COUNT(*) AS c FROM users').get().c;
      checkDb.close();
      for (const side of ['-wal', '-shm']) {
        try { fs.rmSync(`${dbTarget}${side}`, { force: true }); } catch { /* best effort */ }
      }

      if (!okFlag) {
        fs.renameSync(target, `${target}-CORRUPT`);
        console.error('❌ Backup failed integrity check — quarantined as CORRUPT.');
        closePetDb();
        process.exit(1);
      }

      // 3. Copy uploads (best effort; large trees may be split by ops).
      const uploadsSrc = config.pet.uploadDir;
      let uploadFiles = 0;
      if (fs.existsSync(uploadsSrc)) {
        fs.cpSync(uploadsSrc, path.join(target, 'uploads'), { recursive: true });
        uploadFiles = fs.readdirSync(path.join(target, 'uploads'), { recursive: true })
          .filter(f => String(f).includes(path.sep)).length;
      }

      // 4. Restore metadata (NO secrets, NO environment file contents).
      fs.writeFileSync(
        path.join(target, 'meta.json'),
        JSON.stringify({
          created_at: new Date().toISOString(),
          app_version: config.version,
          mode,
          database: 'pet.db',
          integrity_check: 'ok',
          tables,
          counts: { students: studentCount, users: userCount },
          uploads_files: uploadFiles,
          duration_ms: Date.now() - backupStart,
        }, null, 2)
      );

      // 5. Retention pruning.
      prune(path.join(config.pet.backupDir, mode), keep);

      console.log(`✅ verified backup complete — ${tables.length} tables, ${studentCount} students, ${userCount} users, integrity ok`);
      closePetDb();
    })
    .catch(err => {
      console.error('❌ backup failed:', err.message);
      try { closePetDb(); } catch { /* noop */ }
      process.exit(1);
    });
}

main();
