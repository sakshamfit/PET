#!/usr/bin/env node
/**
 * check:build — "is the app I would serve actually the current build?"
 *
 *   npm run check:build          → human report, exit 1 when stale/missing
 *   npm run check:build -- --json
 *
 * Compares the bundle in server/public/app (+ server/public/admin) with the
 * source tree it was built from. Used by `npm start`, `release:check` and by
 * anyone who is staring at a screen wondering whether they are looking at the
 * new build.
 */

import { getAppBuild, formatAge } from '../server/src/lib/build-info.js';
import { REPO_ROOT } from '../server/src/lib/source-hash.js';

const asJson = process.argv.includes('--json');
const apps = ['pet', 'admin'];
const builds = apps.map(app => getAppBuild(app));

if (asJson) {
  console.log(JSON.stringify({ repoRoot: REPO_ROOT, apps: builds }, null, 2));
} else {
  console.log('');
  console.log('════════ check:build ════════');
  console.log(`repo: ${REPO_ROOT}`);
  console.log('');
  for (const b of builds) {
    const label = b.app === 'pet' ? '/app/  (employees)' : '/admin/ (control panel)';
    console.log(`${label}`);
    console.log(`  dist        : ${b.distDir}`);
    if (!b.present) {
      console.log('  state       : ❌ NOT BUILT');
      console.log(`  fix         : npm run ${b.app === 'pet' ? 'build:pet' : 'build:admin'}`);
    } else {
      console.log(`  build id    : ${b.buildId ?? '(unstamped — pre-existing build)'}`);
      console.log(`  built at    : ${b.builtAt ?? '(unknown)'}${b.ageSeconds != null ? `  — ${formatAge(b.ageSeconds)} ago` : ''}`);
      console.log(`  commit      : ${b.commit ?? '(unknown)'}`);
      console.log(
        `  state       : ${
          b.stale
            ? b.staleReason === 'source-changed'
              ? `❌ STALE — sources now ${b.currentSourceHash}`
              : '❌ STALE/UNVERIFIED'
            : '✅ current'
        }`
      );
      if (b.stale) console.log('  fix         : npm run build     (or: npm start — builds, then serves)');
    }
    console.log('');
  }
}

const bad = builds.filter(b => !b.present || b.stale);
if (bad.length > 0) {
  if (!asJson) {
    console.log('❌ check:build FAILED — the served bundle would not match this checkout.');
    console.log('   npm run build        (or: npm start — builds, then serves)');
    console.log('');
  }
  process.exit(1);
}
if (!asJson) console.log('✅ check:build PASSED — the served bundles match this checkout.\n');
process.exit(0);
