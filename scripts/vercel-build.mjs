#!/usr/bin/env node
/**
 * vercel-build — the ONLY command any Vercel project on this repository runs
 * (vercel.json → buildCommand). It builds the PET field-operations app and
 * nothing else, straight to the root of the deployment.
 *
 * WHY IT IS WRITTEN THIS WAY
 * --------------------------
 * This file used to build the legacy M.S. Public School portal into `dist/`
 * and the PET app into `dist/app/`, "best effort". The portal succeeded, the
 * PET build was allowed to fail silently, and the result was a deployment that
 * was *current* while serving an app that had never contained a line of
 * `pet-web/` — "Vercel still shows the old build", with no way to see why.
 *
 * Two things follow from that:
 *
 *   1. ONE app per deployment, built into `dist/`, and the school portal is not
 *      published on Vercel at all. It still exists as the desktop/Android build
 *      and on the office server (`npm run build:legacy`).
 *   2. A failure is FATAL. Vercel keeps the previous deployment live, so the
 *      worst case is "nothing changed", never "the app is gone".
 *
 * The build then *proves* what it produced, because "the deployment succeeded"
 * and "the deployment contains the PET app" turned out to be different claims:
 * it reads back dist/build-info.json and the HTML shell, and refuses to ship an
 * artefact that says anything other than `app: pet`.
 *
 * Run it locally to reproduce exactly what Vercel does:
 *     npm run build:vercel
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const red = s => `\x1b[31m${s}\x1b[0m`;
const green = s => `\x1b[32m${s}\x1b[0m`;
const yellow = s => `\x1b[33m${s}\x1b[0m`;

/**
 * @param {string} script
 * @returns {number} exit code
 */
function runScript(script) {
  const started = Date.now();
  const res = spawnSync(npm, ['run', script], { stdio: 'inherit', cwd: ROOT });
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  if (res.error) {
    console.error(red(`❌ ${script} could not start: ${res.error.message}`));
    return 1;
  }
  console.log(`   ${script} finished in ${secs}s (exit ${res.status ?? 1})\n`);
  return res.status ?? 1;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

console.log('\n▶ vercel-build — PET field-operations app → dist/  (served at /)\n');

if (runScript('build:pet-vercel') !== 0) {
  console.error(red('❌ build:pet-vercel failed → aborting the deployment.'));
  console.error('   The previous deployment stays live; nothing is replaced.');
  console.error('   Fix the build, push again, and Vercel will deploy it.\n');
  process.exit(1);
}

// ── Prove what was built, instead of trusting that "the build succeeded" ────

const problems = [];

const indexPath = path.join(DIST, 'index.html');
const infoPath = path.join(DIST, 'build-info.json');

const html = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : null;
if (html === null) problems.push('dist/index.html was not produced.');

const info = readJson(infoPath);
if (!info) {
  problems.push('dist/build-info.json was not produced — the deployment would be unidentifiable.');
} else if (info.app !== 'pet') {
  problems.push(
    `dist/build-info.json says app="${info.app}", not "pet". This is the exact failure that caused ` +
      'months of "Vercel shows the old build": the deployment was current, and it contained the ' +
      'wrong application. Nothing is deployed until this says "pet".'
  );
}

if (html) {
  if (!/<meta[^>]+name="pet-build"/i.test(html)) {
    problems.push('dist/index.html has no <meta name="pet-build"> — it is not the PET shell.');
  }
  if (/M\.S\.\s*PUBLIC\s*SCHOOL/i.test(html)) {
    problems.push(
      'dist/index.html is the legacy M.S. Public School portal, not the PET app. ' +
        'Check permissions in vercel.json / the build command.'
    );
  }
  if (!/id="pet-runtime-config"/.test(html)) {
    problems.push('dist/index.html has no runtime config block (vite.pet-vercel.config.ts).');
  }
}

if (problems.length > 0) {
  console.error(red('❌ The build produced something that is not the PET app — refusing to deploy.\n'));
  for (const p of problems) console.error(`   • ${p}`);
  console.error('');
  process.exit(1);
}

const apiBase = typeof info.api === 'string' ? info.api : null;
const wired = apiBase && !apiBase.startsWith('none');

console.log(green('✅ vercel-build done — the deployment contains the PET app at /.\n'));
console.log('   app        : pet            (pet-web/ → dist/)');
console.log(`   build      : ${info.buildId}   commit ${info.commit ?? 'unknown'}`);
console.log(`   built at   : ${info.builtAt}`);
console.log(`   api        : ${wired ? apiBase : yellow('none — interface preview, cannot sign anyone in')}`);

if (!wired) {
  console.log('');
  console.log(yellow('   ⚠️  PET_API_BASE is not set for this deployment.'));
  console.log('      The app is published and honest about it, but staff cannot sign in.');
  console.log('      Vercel → project → Settings → Environment Variables →');
  console.log('      PET_API_BASE = https://<your-tunnel-domain>   (then redeploy).');
  console.log('      The office PC must list this deployment in CORS_ORIGINS.');
}

console.log('');
console.log('   Verify the live URL from anywhere:');
console.log('      npm run verify:deploy -- --url https://<your-deployment>\n');
