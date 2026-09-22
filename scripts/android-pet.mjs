#!/usr/bin/env node
/**
 * PET Ops Android wrapper (in.plusoneco.pet).
 *
 *   npm run android:pet:init   one-time: create android-pet/ if it is missing
 *   npm run android:pet:sync   build the PET web app, then cap sync into android-pet/
 *   npm run android:pet:apk    sync, then assembleRelease → PET-Ops.apk
 *
 * Capacitor's CLI only reads capacitor.config.ts. For the duration of each
 * `npx cap` call this script swaps in capacitor.pet.config.ts (app id
 * in.plusoneco.pet, android.path = android-pet) and restores the legacy
 * config afterwards — including on failure. It then refuses to continue if
 * `android/` (the school app) changed.
 *
 * Signing (optional; without it the release APK is debug-signed for sideload
 * testing only — see docs/PET/14_OFFICE_ROLLOUT.md):
 *   PET_ANDROID_KEYSTORE_FILE, PET_ANDROID_KEYSTORE_PASSWORD,
 *   PET_ANDROID_KEY_ALIAS, PET_ANDROID_KEY_PASSWORD
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const liveConfig = path.join(root, 'capacitor.config.ts');
const petConfig = path.join(root, 'capacitor.pet.config.ts');
const androidDir = path.join(root, 'android-pet');
const legacyDir = path.join(root, 'android');
const command = process.argv[2];

function fail(message) {
  console.error(`\n❌ ${message}`);
  process.exit(1);
}

function assertPetConfigFile() {
  if (!fs.existsSync(petConfig)) fail('Missing capacitor.pet.config.ts');
  const text = fs.readFileSync(petConfig, 'utf8');
  if (!/path:\s*['"]android-pet['"]/.test(text)) {
    fail("capacitor.pet.config.ts must set android.path to 'android-pet' so Capacitor does not rewrite android/.");
  }
  if (!text.includes('in.plusoneco.pet')) {
    fail('capacitor.pet.config.ts must keep appId in.plusoneco.pet (PET Ops).');
  }
}

function run(bin, args, cwd = root) {
  const result = spawnSync(bin, args, {
    cwd,
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  });
  if (result.error) fail(`${bin} failed to start: ${result.error.message}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function gitStatus(dir) {
  const result = spawnSync('git', ['status', '--short', '--', dir], { cwd: root, encoding: 'utf8' });
  return (result.stdout || '').trim();
}

/** Run `npx cap …` against capacitor.pet.config.ts without leaving it in place. */
function cap(args) {
  assertPetConfigFile();
  const backup = path.join(os.tmpdir(), `capacitor.config.ts.pet-${process.pid}`);
  const hadLive = fs.existsSync(liveConfig);
  if (hadLive) fs.copyFileSync(liveConfig, backup);
  fs.copyFileSync(petConfig, liveConfig);
  let failed = null;
  try {
    const result = spawnSync('npx', ['cap', ...args], {
      cwd: root,
      stdio: 'inherit',
      env: process.env,
      shell: process.platform === 'win32',
    });
    if (result.error) failed = result.error;
    else if (result.status !== 0) failed = new Error(`npx cap ${args.join(' ')} exited ${result.status}`);
  } catch (err) {
    failed = err;
  } finally {
    try {
      if (hadLive) fs.copyFileSync(backup, liveConfig);
      else fs.rmSync(liveConfig, { force: true });
    } finally {
      fs.rmSync(backup, { force: true });
    }
  }
  const legacyDirty = gitStatus(legacyDir);
  if (legacyDirty) {
    console.error(legacyDirty);
    spawnSync('git', ['checkout', '--', 'android'], { cwd: root, stdio: 'inherit' });
    fail('cap touched android/ (the legacy school app). Those changes were reverted. PET Ops must stay in android-pet/.');
  }
  if (failed) fail(failed.message || String(failed));
  const stamped = path.join(androidDir, 'app', 'src', 'main', 'assets', 'capacitor.config.json');
  if (fs.existsSync(stamped)) {
    const written = fs.readFileSync(stamped, 'utf8');
    if (!written.includes('in.plusoneco.pet')) {
      fail('android-pet assets were stamped with the wrong app id. Refusing to continue.');
    }
  }
}

function webDirReady() {
  const index = path.join(root, 'server', 'public', 'app', 'index.html');
  if (!fs.existsSync(index)) {
    fail('server/public/app is missing. android:pet:sync builds it; do not delete it before cap sync.');
  }
}

function sync() {
  console.log('Building the PET web app (office-server bundle, served at /app/)…');
  run('npm', ['run', 'build:pet']);
  webDirReady();
  console.log('Syncing into android-pet/ (in.plusoneco.pet, PET Ops)…');
  cap(['sync', 'android']);
}

function apk() {
  sync();
  const gradlew = path.join(androidDir, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
  if (!fs.existsSync(gradlew)) fail(`Gradle wrapper not found at ${gradlew}. Run npm run android:pet:init first.`);
  if (process.platform !== 'win32') fs.chmodSync(gradlew, 0o755);
  console.log('Assembling the release APK…');
  run(gradlew, ['assembleRelease'], androidDir);
  const built = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
  if (!fs.existsSync(built)) fail(`Gradle finished but ${built} is missing.`);
  const out = path.join(root, 'PET-Ops.apk');
  fs.copyFileSync(built, out);
  const signed = Boolean(process.env.PET_ANDROID_KEYSTORE_FILE);
  console.log('');
  console.log(`✅ ${out}`);
  console.log(signed
    ? '   Signed with PET_ANDROID_KEYSTORE_FILE.'
    : '   Debug-signed (no PET_ANDROID_KEYSTORE_FILE). Fine for a USB test; do not ship this build to the team.');
  console.log('   Package: in.plusoneco.pet   Name: PET Ops');
}

switch (command) {
  case 'init': {
    assertPetConfigFile();
    if (fs.existsSync(path.join(androidDir, 'settings.gradle'))) {
      console.log('android-pet/ already exists — in.plusoneco.pet, "PET Ops".');
      console.log('Nothing to add. Next: npm run android:pet:sync');
      process.exit(0);
    }
    console.log('android-pet/ is missing — creating it from capacitor.pet.config.ts…');
    run('npm', ['run', 'build:pet']);
    cap(['add', 'android']);
    if (!fs.existsSync(path.join(androidDir, 'settings.gradle'))) {
      fail('cap add finished but android-pet/settings.gradle is missing. Refusing to guess a different folder.');
    }
    console.log('Created android-pet/. Next: npm run android:pet:sync');
    break;
  }
  case 'sync':
    sync();
    break;
  case 'apk':
    apk();
    break;
  default:
    fail('Usage: node scripts/android-pet.mjs <init|sync|apk>');
}
