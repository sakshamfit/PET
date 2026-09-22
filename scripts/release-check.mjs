#!/usr/bin/env node
/**
 * release:check — pre-flight gate for producing the customer installer.
 *
 * Verifies the non-negotiables:
 *   1. Production desktop builds have a configured https API URL
 *      (electron/build-config.json, written by write-build-config.mjs from
 *      SMS_API_URL) — never localhost.
 *   2. Version consistency (package.json ↔ installer artifact name).
 *   3. Windows icon present (assets/icon.png).
 *   4. electron-builder excludes server/admin/secrets from the package.
 *   5. No real .env files or databases are tracked in the repo.
 *   6. dist/ and admin build exist (run npm run build && build:admin first).
 *   7. Control-plane server tests exist and config gate is present.
 *
 * Exit 1 on any FAIL. WARN items must be acknowledged by a human.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { getAppBuild } from '../server/src/lib/build-info.js';

const ROOT = process.cwd();
const results = [];
const record = (status, item, detail = '') => {
  results.push({ status, item, detail });
};

function check(name, fn) {
  try {
    const detail = fn();
    record('PASS', name, detail || '');
  } catch (err) {
    record(err.level === 'warn' ? 'WARN' : 'FAIL', name, err.message);
  }
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

check('package.json version present', () => {
  if (!pkg.version) throw new Error('missing version');
  return pkg.version;
});

check('electron-builder artifact name matches version', () => {
  const artifact = pkg.build?.win?.artifactName || '';
  if (!artifact.includes('${version}')) throw new Error('artifactName must include ${version}');
  return artifact;
});

check('electron-builder package excludes control-plane server code', () => {
  const files = pkg.build?.files || [];
  for (const forbidden of ['!server/**', '!admin/**', '!scripts/**']) {
    if (!files.includes(forbidden)) {
      throw new Error(`build.files missing exclusion ${forbidden} — the EXE must not ship server code`);
    }
  }
});

check('Windows icon exists', () => {
  const icon = path.join(ROOT, pkg.build?.win?.icon || 'assets/icon.png');
  if (!fs.existsSync(icon)) {
    const e = new Error('assets/icon.png missing — generate before packaging');
    e.level = 'warn';
    throw e;
  }
  const size = fs.statSync(icon).size;
  if (size < 10_000) throw new Error('icon.png suspiciously small');
  return `${(size / 1024).toFixed(0)} KB`;
});

check('production build-config: HTTPS API URL, no localhost', () => {
  const cfgPath = path.join(ROOT, 'electron', 'build-config.json');
  if (!fs.existsSync(cfgPath)) {
    const e = new Error(
      'electron/build-config.json not found — run: SMS_API_URL=https://api.YOURDOMAIN node scripts/write-build-config.mjs (required for customer builds)'
    );
    e.level = 'warn'; // local dev builds legitimately omit it
    throw e;
  }
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  if (!cfg.apiBaseUrl) {
    const e = new Error('apiBaseUrl empty — set SMS_API_URL for customer builds');
    e.level = 'warn';
    throw e;
  }
  if (!cfg.apiBaseUrl.startsWith('https://')) throw new Error(`apiBaseUrl must be https (got ${cfg.apiBaseUrl})`);
  if (/localhost|127\.0\.0\.1|\[?::1\]?/.test(cfg.apiBaseUrl)) {
    throw new Error('apiBaseUrl points to localhost — not allowed for customer builds');
  }
  return cfg.apiBaseUrl;
});

check('legacy desktop web build (dist/) exists', () => {
  const indexFile = path.join(ROOT, 'dist', 'index.html');
  if (!fs.existsSync(indexFile)) {
    const e = new Error('run npm run build:legacy first');
    e.level = 'warn';
    throw e;
  }
  // dist/ is also where `npm run build:vercel` puts the PET Vercel deployment.
  // Electron packages dist/**/*, so the wrong artefact here means shipping the
  // wrong app inside the installer — check what it actually is, not just that
  // something is there.
  const html = fs.readFileSync(indexFile, 'utf8');
  if (/<meta[^>]+name="pet-build"/i.test(html)) {
    throw new Error(
      'dist/ contains the PET Vercel deployment (from npm run build:vercel), not the legacy ' +
        'desktop portal — packaging this would ship the PET app in the desktop installer. ' +
        'Run: npm run build:legacy'
    );
  }
  let app = null;
  try {
    app = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'build-info.json'), 'utf8')).app ?? null;
  } catch {
    /* unstamped/older build — the HTML check above is the authority */
  }
  if (app && app !== 'legacy') {
    throw new Error(`dist/build-info.json says app="${app}", not "legacy" — run: npm run build:legacy`);
  }
  return app ? `app=${app}` : '';
});

check('PET operations app build exists and matches this checkout', () => {
  const b = getAppBuild('pet');
  if (!b.present) {
    const e = new Error('no build in server/public/app — run: npm run build:pet');
    e.level = 'warn';
    throw e;
  }
  if (b.stale) {
    throw new Error(
      `stale bundle (${b.buildId ?? 'unstamped'}) vs sources — run: npm run build:pet (or npm start)`
    );
  }
  return `build ${b.buildId}`;
});

check('admin panel build exists', () => {
  if (!fs.existsSync(path.join(ROOT, 'server', 'public', 'admin', 'index.html'))) {
    const e = new Error('run npm run build:admin first');
    e.level = 'warn';
    throw e;
  }
});

check('no tracked .env / database files in git', () => {
  let tracked = '';
  try {
    tracked = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' });
  } catch {
    return 'git not available — skipped';
  }
  const bad = tracked
    .split('\n')
    // Real .env files are forbidden; `.example` templates are deliberately
    // tracked (.gitignore un-ignores them) — the old pattern flagged
    // `.env.production.example` and made this gate fail on every run, which is
    // how a gate stops being read.
    .filter(
      f =>
        (/^\.env(?!.*\.example$)/.test(f) && !/\.example$/.test(f)) ||
        /\.(db|sqlite|sqlite3)$/i.test(f) ||
        /service-?account.*\.json$/i.test(f)
    );
  if (bad.length) throw new Error(`forbidden tracked files: ${bad.join(', ')}`);
});

check('server production config gate exists', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server', 'src', 'config.js'), 'utf8');
  if (!src.includes('PRODUCTION CONFIGURATION REJECTED')) throw new Error('production gate missing');
});

check('no hardcoded legacy credentials remain in source', () => {
  let tracked = [];
  try {
    tracked = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return 'git not available — skipped';
  }
  const scanTargets = tracked.filter(f => /\.(ts|tsx|js|mjs|cjs|json|md)$/.test(f));
  for (const f of scanTargets) {
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const legacyPw = '99310' + '66436@';
    if (text.includes(legacyPw)) {
      throw new Error(`legacy plaintext password still present in ${f}`);
    }
  }
});

check('electron entrypoint has no insecure localhost fallback', () => {
  const mainSrc = fs.readFileSync(path.join(ROOT, 'electron', 'windows.cjs'), 'utf8');
  if (/loadURL\(['"]http:\/\/localhost:3000/.test(mainSrc)) {
    throw new Error('production localhost fallback still present');
  }
});

console.log('');
console.log('════════ release:check ════════');
let failed = 0;
let warned = 0;
for (const r of results) {
  const icon = r.status === 'PASS' ? '✅' : r.status === 'WARN' ? '⚠️ ' : '❌';
  console.log(`${icon} ${r.status.padEnd(4)}  ${r.item}${r.detail ? ` — ${r.detail}` : ''}`);
  if (r.status === 'FAIL') failed++;
  if (r.status === 'WARN') warned++;
}
console.log('');

if (failed > 0) {
  console.log(`❌ release:check FAILED (${failed} failing, ${warned} warnings). Do not build the customer installer.`);
  process.exit(1);
}
if (warned > 0) {
  console.log(`⚠️  release:check passed with ${warned} warning(s) — review them; they become FAILURES for customer distribution.`);
  process.exit(0);
}
console.log('✅ release:check PASSED.');
process.exit(0);
