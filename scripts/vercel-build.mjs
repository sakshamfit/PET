#!/usr/bin/env node
/**
 * vercel-build — the command Vercel runs (vercel.json → buildCommand).
 *
 * One deployment, two apps, deliberately different failure semantics:
 *
 *   1. legacy M.S. Public School portal  → dist/       FATAL
 *      This is the URL staff open every day. A broken build must stop the
 *      deployment so the previous, working bundle stays live.
 *
 *   2. PET field-operations app          → dist/app/   BEST EFFORT
 *      This is the static preview of the new PET app (the real PET server runs
 *      on the office PC, see docs/PET/13_OFFICE_PC_CLOUDFLARE_TUNNEL_GOLIVE.md).
 *      If it fails to compile, the school portal still ships and /app/ simply
 *      keeps the previous build — a missing preview must never block the site
 *      that people depend on, and must never be silent either.
 *
 * Run it locally to reproduce exactly what Vercel does:
 *     npm run build:vercel
 */

import { spawnSync } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

/** @param {string} script @returns {number} exit code */
function runScript(script) {
  const started = Date.now();
  const res = spawnSync(npm, ['run', script], { stdio: 'inherit' });
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  if (res.error) {
    console.error(`❌ ${script} could not start: ${res.error.message}`);
    return 1;
  }
  console.log(`   ${script} finished in ${secs}s (exit ${res.status ?? 1})\n`);
  return res.status ?? 1;
}

console.log('\n▶ vercel-build: 1/2 — legacy M.S. Public School portal → dist/');
if (runScript('build:legacy') !== 0) {
  console.error('❌ build:legacy failed → aborting the deployment.');
  console.error('   The previous deployment stays live (that is the point of failing here).');
  console.error('   Fix the build, push again, and Vercel will replace it.\n');
  process.exit(1);
}

console.log('▶ vercel-build: 2/2 — PET app (static preview) → dist/app/');
if (runScript('build:pet-vercel') !== 0) {
  console.error('\n⚠️  build:pet-vercel failed — shipping the portal WITHOUT the /app/ preview.');
  console.error('   The school portal is unaffected; /app/ will 404 until the PET build is fixed.\n');
  process.exit(0);
}

console.log('✅ vercel-build done — / is the school portal, /app/ is the PET app.');
console.log('   Verify with:  curl -s <url>/build-info.json  and  curl -s <url>/app/build-info.json\n');
