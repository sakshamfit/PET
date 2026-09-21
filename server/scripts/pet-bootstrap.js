/**
 * PET bootstrap — creates the first Main Admin account.
 *
 * Usage:
 *   node server/scripts/pet-bootstrap.js --name "Main Admin" --email admin@pet.local
 *
 * The temporary password is printed ONCE to the console; only its scrypt
 * hash is stored. The Main Admin must change it on first login.
 * If a PET_BOOTSTRAP_SECRET is configured it must be supplied with --secret.
 * Existing Main Admins are never overwritten.
 */

// Loads .env.production / .env before anything reads configuration. Must be
// the first import so that C:\PET\data\... (production paths) are in effect
// and this command never touches the wrong database.
import { envLoadInfo } from '../src/lib/env-file.js';

import config from '../src/config.js';
import { initPetDb, getPetDb, closePetDb } from '../src/pet/db.js';
import { hashPassword, generateTemporaryPassword, randomId } from '../src/lib/crypto.js';

function arg(flag) {
  const idx = process.argv.indexOf(flag);
  return idx > -1 ? process.argv[idx + 1] : null;
}

function main() {
  const name = arg('--name') || 'Main Admin';
  const email = arg('--email');
  const secret = arg('--secret') || '';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('❌ Provide a valid --email (e.g. --email admin@purvanchal.org)');
    process.exit(64);
  }

  initPetDb();
  const db = getPetDb();

  if (config.pet.bootstrapSecret && secret !== config.pet.bootstrapSecret) {
    console.error('❌ PET_BOOTSTRAP_SECRET is set on this server. Re-run with --secret <value>.');
    process.exit(78);
  }

  const existingAdmin = db.prepare(`SELECT COUNT(*) AS c FROM users WHERE role = 'main_admin'`).get().c;
  if (existingAdmin > 0) {
    console.error('❌ A Main Admin already exists. Use the admin panel to manage accounts.');
    process.exit(1);
  }

  const taken = db.prepare('SELECT 1 FROM users WHERE email = ?').get(email);
  if (taken) {
    console.error('❌ That email is already in use.');
    process.exit(1);
  }

  const temporaryPassword = generateTemporaryPassword();
  const id = randomId('usr');
  const ts = new Date().toISOString();

  const bootstrap = db.transaction(() => {
    db.prepare(
      `INSERT INTO users (id, name, email, role, employee_code, password_hash, must_change_password,
         status, created_at, updated_at)
       VALUES (?, ?, ?, 'main_admin', 'ADMIN-001', ?, 1, 'ACTIVE', ?, ?)`
    ).run(id, name, email.toLowerCase(), hashPassword(temporaryPassword), ts, ts);
    db.prepare(
      `INSERT INTO organization (id, name, tagline, created_at, updated_at)
       VALUES (?, 'Purvanchal Education Trust', 'Internal Organization, Field Operations & Student Management System', ?, ?)`
    ).run(randomId('org'), ts, ts);
    db.prepare(
      `INSERT INTO teams (id, name, description, created_at) VALUES (?, 'Field Operations', 'Default field team', ?)`
    ).run(randomId('team'), ts);
  });
  bootstrap();

  console.log('');
  console.log('✅ PET bootstrap complete');
  console.log('   Organization: Purvanchal Education Trust');
  console.log(`   Main Admin:   ${name} <${email.toLowerCase()}>`);
  console.log('');
  console.log('   ── ONE-TIME CREDENTIALS ─────────────────────────');
  console.log(`   Temporary password: ${temporaryPassword}`);
  console.log('   Save it now. It is shown once, stored only as a');
  console.log('   scrypt hash, and must be changed at first login.');
  console.log('   ─────────────────────────────────────────────────');
  console.log('');
  closePetDb();
}

main();
