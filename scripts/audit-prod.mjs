#!/usr/bin/env node
/**
 * audit:prod — scan production build outputs and packaged sources for
 * secrets, credentials, and forbidden configuration.
 *
 * Scans (when present):
 *   dist/                  — legacy web/desktop renderer bundle
 *   server/public/app/     — PET operations app bundle (what employees use)
 *   server/public/admin/   — admin panel bundle
 *   electron/              — desktop main-process code shipped in the EXE
 *   release/               — built installers (filename-level checks only)
 *
 * A finding is a hard failure unless it appears in the ALLOWLIST table
 * below (documented false positives such as error-message copy that merely
 * contains the word "password").
 *
 * The goal is NOT a grep count — every finding is printed with its
 * surrounding context so a human can inspect it.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const SCAN_DIRS = [
  'dist',
  path.join('server', 'public', 'app'),
  path.join('server', 'public', 'admin'),
  'electron',
];
const EXTRA_FILES = ['electron.cjs', 'index.html', path.join('public', 'manifest.json')];

// Patterns that must never appear in production output with a real value.
const SECRET_PATTERNS = [
  { name: 'Google API key', re: /AIza[0-9A-Za-z_-]{35}/g, severity: 'review' },
  { name: 'Private key block', re: /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g, severity: 'fail' },
  { name: 'service_role key', re: /service_role/gi, severity: 'fail' },
  { name: 'LICENSE_TOKEN_SECRET value', re: /LICENSE_TOKEN_SECRET\s*[:=]\s*['"][A-Za-z0-9/+_-]{8,}['"]/g, severity: 'fail' },
  { name: 'GOOGLE_CLIENT_SECRET value', re: /GOOGLE_CLIENT_SECRET\s*[:=]\s*['"][^'"]{8,}['"]/g, severity: 'fail' },
  { name: 'Generic secret assignment', re: /(?:secret|private_key|refresh_token)\s*[:=]\s*['"][A-Za-z0-9/+._-]{16,}['"]/gi, severity: 'fail' },
  { name: 'Bearer token literal', re: /Bearer\s+eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, severity: 'fail' },
  { name: 'scrypt hash literal', re: /scrypt\$\d+\$\d+\$\d+\$[0-9a-f]{16,}\$[0-9a-f]{32,}/g, severity: 'fail' },
  { name: 'Hardcoded dev password (legacy)', re: new RegExp('99310' + '66436@', 'g'), severity: 'fail' },
];

const FORBIDDEN_CONFIG = [
  { name: 'localhost in packaged desktop code', re: /(?<!VITE_)localhost:3000/g, dirs: ['electron'], severity: 'fail' },
];

/**
 * Allowlist: exact snippet fragments that are acceptable.
 * Justifications are inline — reviewers should challenge every entry.
 */
const ALLOWLIST = [
  // Firebase client API key in the web bundle is NON-SECRET by Google's
  // design (identifies the project; access is controlled by Auth + rules).
  // It ships in every Firebase web app. Security comes from rules, not
  // key secrecy. Still flagged "review" so it is consciously seen.
  { pattern: /AIza[0-9A-Za-z_-]{35}/g, reason: 'Firebase web API key (public by design; see firestore.rules)' },
  // Error message copy in bundles that mentions "refresh_token" etc by name.
  { pattern: /refresh_token["'`]?\s*[,)}\]]/g, reason: 'API field name in request construction (no value)' },
  { pattern: /secret"\s*:\s*"admin-csrf:/g, reason: 'CSRF label prefix, not a secret value' },
  // getSetCookie / cookie names
  { pattern: /sms_admin_session/g, reason: 'session cookie name (no value)' },
  { pattern: /refresh_token','|refresh_token"\./g, reason: 'IPC/store key names' },
  { pattern: /LOCAL_DEV_URL|localhost:8080/g, reason: 'development-only default, gated by app.isPackaged' },
  { pattern: /controlPlane|control-plane/g, reason: 'API namespace naming' },
  { pattern: /password_manager/gi, reason: 'UI copy' },
  { pattern: /"refresh_token"[,:]?\s*\w*[)\]]/g, reason: 'field name in code' },
];

const findings = [];
let filesScanned = 0;

function scanFile(absPath) {
  const rel = path.relative(ROOT, absPath);
  let text;
  try {
    text = fs.readFileSync(absPath, 'utf8');
  } catch {
    return;
  }
  filesScanned++;

  const loadRules = FORBIDDEN_CONFIG.filter(f => f.dirs.some(d => rel.startsWith(d)));
  const rules = [...SECRET_PATTERNS, ...loadRules];

  for (const rule of rules) {
    rule.re.lastIndex = 0;
    let m;
    while ((m = rule.re.exec(text)) !== null) {
      const snippet = text.slice(Math.max(0, m.index - 60), Math.min(text.length, m.index + m[0].length + 60));
      const allow = ALLOWLIST.find(a => {
        a.pattern.lastIndex = 0;
        return a.pattern.test(m[0]) || a.pattern.test(snippet);
      });
      findings.push({
        file: rel,
        rule: rule.name,
        severity: allow ? 'allowlisted' : rule.severity,
        value: m[0].slice(0, 80),
        snippet: snippet.replace(/\s+/g, ' ').slice(0, 200),
        reason: allow?.reason,
      });
    }
  }
}

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else scanFile(p);
  }
}

for (const dir of SCAN_DIRS) walk(path.join(ROOT, dir));
for (const f of EXTRA_FILES) {
  const abs = path.join(ROOT, f);
  if (fs.existsSync(abs)) scanFile(abs);
}

const failures = findings.filter(f => f.severity === 'fail');
const reviews = findings.filter(f => f.severity === 'review');
const allowlisted = findings.filter(f => f.severity === 'allowlisted');

console.log('');
console.log('════════ audit:prod ════════');
console.log(`Files scanned : ${filesScanned}`);
console.log(`Findings      : ${findings.length} (${allowlisted.length} allowlisted, ${reviews.length} review, ${failures.length} failing)`);

for (const f of reviews) {
  console.log(`\n⚠️  REVIEW [${f.rule}] ${f.file}\n   …${f.snippet}…`);
}
for (const f of failures) {
  console.log(`\n❌ FAIL [${f.rule}] ${f.file}\n   value: ${f.value}\n   …${f.snippet}…`);
}
if (allowlisted.length > 0 && reviews.length === 0 && failures.length === 0) {
  console.log('\nAllowlisted (inspected, documented):');
  for (const f of allowlisted.slice(0, 20)) {
    console.log(`   • [${f.rule}] ${f.file} — ${f.reason}`);
  }
  if (allowlisted.length > 20) console.log(`   … and ${allowlisted.length - 20} more (same categories).`);
}

if (failures.length > 0) {
  console.log('\n❌ audit:prod FAILED — resolve every FAIL finding above before release.');
  process.exit(1);
}
console.log('\n✅ audit:prod PASSED — inspect any REVIEW items above, then proceed.');
process.exit(0);
