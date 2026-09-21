#!/usr/bin/env node
/**
 * PET production launcher — the ONE command that starts the office PC.
 *
 *   npm start
 *
 * What it does, in order:
 *   1. loads .env.production (or .env) without clobbering the service manager's
 *      environment, and defaults NODE_ENV to production when .env.production
 *      exists;
 *   2. checks whether the web bundle in server/public/app matches this
 *      checkout and rebuilds it when it does not;
 *   3. prints the exact build id it is about to serve;
 *   4. starts the API + web server in this process.
 *
 * Because step 2 happens on every start, the machine cannot come up on an old
 * build accidentally. That was the bug: `node server/src/index.js` (or a
 * service pointing straight at it) happily served whatever bundle happened to
 * be sitting on disk.
 *
 * Flags:
 *   --no-build        never rebuild (server still refuses a stale bundle in production)
 *   --allow-stale     set PET_ALLOW_STALE_BUILD=1 (emergency restart)
 *   --port <n>        override PORT
 *   --check           report build state and exit (no server, no build)
 */

// MUST be the first import: it loads .env.production / .env before any other
// module reads configuration (see server/src/lib/env-file.js).
import { envLoadInfo } from '../server/src/lib/env-file.js';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const has = n => args.includes(n);
const valueOf = (n, fallback = null) => {
  const i = args.indexOf(n);
  return i > -1 && args[i + 1] ? args[i + 1] : fallback;
};

// ── 1. environment (must happen before anything imports server/src/config.js)
// Same loader the one-off admin scripts use, so `npm start`, `pet:bootstrap`
// and `pet:backup` always agree on which database they are talking to.
const { source: envSource, loaded: envLoaded } = envLoadInfo;

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = envSource && envSource.endsWith('.env.production') ? 'production' : 'development';
}
const portOverride = valueOf('--port');
if (portOverride) process.env.PORT = portOverride;
if (has('--allow-stale')) process.env.PET_ALLOW_STALE_BUILD = '1';

// ── 2. build freshness
const { getAppBuild, describeBuild, formatAge } = await import('../server/src/lib/build-info.js');
const { REPO_ROOT } = await import('../server/src/lib/source-hash.js');

function report(build) {
  console.log('');
  console.log('════════ PET server start ════════');
  console.log(`  repo      : ${REPO_ROOT}`);
  console.log(`  env file  : ${envSource ? `${envSource} (${envLoaded} vars)` : '(none — using the process environment)'}`);
  console.log(`  mode      : ${process.env.NODE_ENV}`);
  console.log(`  app build : ${build.buildId ?? '(none)'}`);
  console.log(`  built at  : ${build.builtAt ?? '(unknown)'}${build.ageSeconds != null ? ` (${formatAge(build.ageSeconds)} ago)` : ''}`);
  console.log(`  commit    : ${build.commit ?? '(git not available)'}`);
  console.log(`  state     : ${build.present ? (build.stale ? 'STALE — sources have changed' : 'current') : 'MISSING'}`);
  if (build.stale && build.staleReason === 'source-changed') {
    console.log(`  sources   : ${build.commit ?? 'nogit'}-${build.currentSourceHash ?? 'unknown'} (this checkout)`);
  }
  console.log('');
}

let build = getAppBuild('pet');

if (has('--check')) {
  report(build);
  process.exit(build.present && !build.stale ? 0 : 1);
}

if ((!build.present || build.stale || !build.hasBuildInfo) && !has('--no-build')) {
  console.log('⏳ the web bundle does not match this checkout — building the current source…');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const res = spawnSync(npm, ['run', 'build'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (res.status !== 0) {
    console.error('');
    console.error('❌ `npm run build` failed — not starting the server with an outdated bundle.');
    console.error('   Nothing is lost: fix the build error above and run `npm start` again.');
    process.exit(res.status || 1);
  }
  build = getAppBuild('pet');
}

report(build);

if (!build.present) {
  console.error('❌ Still no web app build after the build step — refusing to start.');
  console.error('   Run: npm run build   (see the errors above)');
  process.exit(78);
}

// ── 3. start the server (in-process; it handles SIGINT/SIGTERM itself)
await import('../server/src/index.js');
