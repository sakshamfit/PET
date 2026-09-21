#!/usr/bin/env node
/**
 * Bootstrap the FIRST administrator account (no public signup anywhere).
 *
 * Usage:
 *   node server/scripts/bootstrap.js --email you@company.com --name "Owner Name" [--password 'S0mething-Strong']
 *
 * Safety:
 *  - Refuses to run when NODE_ENV=production without ADMIN_BOOTSTRAP_SECRET
 *    being set in the environment (the value itself is not echoed).
 *  - If no --password is provided, a temporary one is generated and printed
 *    ONCE. Only its scrypt hash is stored. Never logged to any file.
 *  - Refuses to create a second owner silently: use --allow-additional to
 *    add more admin accounts. New admins are audited.
 */

// Loads .env.production / .env before anything reads configuration. Must be
// the first import so that C:\PET\data\... (production paths) are in effect
// and this command never touches the wrong database.
import { envLoadInfo } from '../src/lib/env-file.js';

import { initDb } from '../src/db.js';
import { randomId, hashPassword, generateTemporaryPassword } from '../src/lib/crypto.js';
import { audit, AUDIT_ACTIONS } from '../src/lib/audit.js';
import config from '../src/config.js';

function arg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx > -1 ? process.argv[idx + 1] : null;
}

const email = (arg('email') || '').trim().toLowerCase();
const name = (arg('name') || 'System Administrator').trim();
const providedPassword = arg('password');
const allowAdditional = process.argv.includes('--allow-additional');

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Usage: node server/scripts/bootstrap.js --email you@company.com --name "Owner" [--password ...] [--allow-additional]');
  process.exit(64);
}

if (config.isProduction && !config.secrets.adminBootstrapSecret) {
  console.error('❌ Refusing to bootstrap in production without ADMIN_BOOTSTRAP_SECRET set.');
  process.exit(78);
}

const db = initDb();

const existing = db.prepare('SELECT COUNT(*) c FROM admins').get().c;
if (existing > 0 && !allowAdditional) {
  console.error(`❌ ${existing} administrator(s) already exist. Pass --allow-additional to add another.`);
  process.exit(65);
}
if (db.prepare('SELECT 1 FROM admins WHERE email = ?').get(email)) {
  console.error(`❌ An administrator with email ${email} already exists.`);
  process.exit(65);
}

const password = providedPassword || generateTemporaryPassword();
if (password.length < 10) {
  console.error('❌ Password must be at least 10 characters.');
  process.exit(64);
}

const id = randomId('adm');
const nowIso = new Date().toISOString();
db.prepare(
  `INSERT INTO admins (id, email, name, password_hash, role, status, created_at)
   VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?)`
).run(id, email, name, hashPassword(password), existing === 0 ? 'owner' : 'admin', nowIso);

audit({
  actorType: 'system',
  actorLabel: 'bootstrap-script',
  action: AUDIT_ACTIONS.ADMIN_CREATED,
  targetType: 'admin_account',
  targetId: id,
  metadata: { email, role: existing === 0 ? 'owner' : 'admin' },
});

console.log('');
console.log('✅ Administrator created');
console.log(`   Email: ${email}`);
console.log(`   Role:  ${existing === 0 ? 'owner' : 'admin'}`);
if (!providedPassword) {
  console.log('');
  console.log('   ┌──────────────────────────────────────────────────────────────┐');
  console.log(`   │ Temporary password (shown ONCE, store it safely now):        │`);
  console.log(`   │   ${password}`);
  console.log('   └──────────────────────────────────────────────────────────────┘');
  console.log('   Only its scrypt hash was saved. It cannot be recovered later.');
}
console.log('');
console.log('Sign in at the admin panel: /admin');
console.log('');
