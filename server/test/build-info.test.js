/**
 * Build-identity tests — the "it is still showing the old build" class of bug.
 *
 * These assert the guarantees the deployment relies on:
 *   • build stamping is deterministic (same sources → same build id);
 *   • /health reports which build is being served;
 *   • the app shell carries no-cache headers and a build stamp;
 *   • the bare-root redirect actively clears browser caches;
 *   • production configuration for a same-origin tunnel deployment is accepted.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startTestServer, stopTestServer } from './pet-helpers.js';
import { getAppBuild, petBuildStartupProblems, healthBuildSummary } from '../src/lib/build-info.js';
import { createBuildInfo, computeSourceHash, REPO_ROOT } from '../src/lib/source-hash.js';
import { validateProductionConfig } from '../src/config.js';
import config from '../src/config.js';

let base;

before(async () => { base = await startTestServer(); });
after(async () => { await stopTestServer(); });

test('source fingerprint is stable for the same tree and covers real files', () => {
  const a = computeSourceHash(REPO_ROOT);
  const b = computeSourceHash(REPO_ROOT);
  assert.equal(a, b, 'same tree must fingerprint identically');
  assert.ok(/^[0-9a-f]{16}$/.test(a), `expected a 16-char hex fingerprint, got ${a}`);
});

test('build id is derived from commit + sources, never from the clock', () => {
  const one = createBuildInfo({ root: REPO_ROOT, version: '9.9.9', now: new Date('2026-01-01T00:00:00Z') });
  const two = createBuildInfo({
    root: REPO_ROOT,
    version: '9.9.9',
    now: new Date('2027-06-06T06:06:06Z'),
  });
  assert.equal(one.buildId, two.buildId, 'a rebuild of unchanged sources is the same build');
  assert.notEqual(one.builtAt, two.builtAt, 'build time still records when it was produced');
  assert.equal(one.version, '9.9.9');
  assert.match(one.buildId, /^[0-9a-z]+-[0-9a-f]{16}$/);
});

test('build descriptor reports presence, staleness and provenance', () => {
  const b = getAppBuild('pet');
  assert.equal(b.app, 'pet');
  assert.equal(typeof b.present, 'boolean');
  assert.ok(b.distDir.endsWith(path.join('server', 'public', 'app')));
  if (b.present) {
    assert.ok(b.buildId, 'an installed build must carry a build id');
    assert.ok(b.builtAt, 'an installed build must carry a build time');
    assert.equal(typeof b.stale, 'boolean');
  } else {
    assert.equal(b.stale, true, 'a missing build is always stale');
    assert.equal(b.staleReason, 'missing');
  }
});

test('startup gate refuses to serve a missing bundle in production, warns in development', () => {
  const b = getAppBuild('pet');
  if (b.present && !b.stale) {
    // A current build is accepted in both modes.
    assert.deepEqual(petBuildStartupProblems({ strict: true }), { blocking: [], warnings: [] });
    return;
  }
  const strict = petBuildStartupProblems({ strict: true });
  assert.ok(strict.blocking.length > 0, 'production must refuse to start');
  assert.match(strict.blocking.join('\n'), /npm run build|npm start/);
  const lenient = petBuildStartupProblems({ strict: false });
  assert.equal(lenient.blocking.length, 0);
  assert.ok(lenient.warnings.length > 0, 'development must still warn loudly');
});

test('GET /health reports the served build without leaking anything', async () => {
  const res = await fetch(`${base}/health`);
  assert.ok([200, 503].includes(res.status), `unexpected status ${res.status}`);
  const body = await res.json();

  assert.ok(body.app_build, 'health must expose app_build');
  assert.equal(typeof body.app_build.present, 'boolean');
  assert.equal(typeof body.app_build.stale, 'boolean');
  assert.ok('build_id' in body.app_build && 'built_at' in body.app_build);
  assert.ok(body.admin_build, 'health must expose admin_build');

  // The status must degrade when the employees' app is not installed, so a
  // monitor notices a broken deployment instead of seeing a healthy API.
  if (!body.app_build.present) {
    assert.equal(res.status, 503);
    assert.equal(body.status, 'degraded');
  }

  const text = JSON.stringify(body);
  assert.ok(!/secret|password|token/i.test(text), 'health must not leak config');
  assert.deepEqual(
    Object.keys(healthBuildSummary('pet')).sort(),
    ['age_seconds', 'build_id', 'built_at', 'commit', 'present', 'stale', 'stale_reason', 'version'].sort()
  );
});

test('bare root redirect is never cached and clears the HTTP cache', async () => {
  const res = await fetch(`${base}/`, { redirect: 'manual' });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/app/');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.match(res.headers.get('clear-site-data') || '', /cache/);
});

test('app shell is served no-store and stamped with the build id', async () => {
  const res = await fetch(`${base}/app/`);
  const admin = await fetch(`${base}/admin/`);

  for (const r of [res, admin]) {
    assert.ok([200, 503].includes(r.status), `unexpected status ${r.status}`);
  }

  if (res.status === 200) {
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.ok(res.headers.get('x-app-build'), 'shell must be stamped with X-App-Build');
    const html = await res.text();
    assert.match(html, /name="pet-build"/, 'shell must embed its build id');
    const seoHeader = res.headers.get('content-security-policy') || '';
    assert.match(seoHeader, /default-src 'self'/);
  } else {
    const text = await res.text();
    assert.match(text, /npm run build/, 'the 503 must say how to fix it');
  }

  // A deep client route must behave exactly like the shell (SPA fallback).
  const deep = await fetch(`${base}/app/students`);
  assert.equal(deep.status, res.status === 503 ? 503 : 200);
  if (deep.status === 200) assert.equal(deep.headers.get('cache-control'), 'no-store');
});

test('build-info.json is never cached when it is served', async () => {
  const res = await fetch(`${base}/app/build-info.json`);
  if (res.status !== 200) return; // no build installed in this run
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const body = await res.json();
  assert.ok(body.buildId, 'build-info.json must carry the build id');
});

test('production config accepts a same-origin tunnel deployment, still rejects wildcards', () => {
  process.env.PET_DATABASE_PATH = '/var/lib/pet/pet.db';
  process.env.PET_UPLOAD_DIR = '/var/lib/pet/uploads';

  const tunnelDeployment = validateProductionConfig({
    ...config,
    secrets: { licenseTokenSecret: 'x'.repeat(48), adminBootstrapSecret: 'y', petJwtSecret: 'z'.repeat(48) },
    tls: { trustProxy: true, certFile: '', keyFile: '' },
    server: { ...config.server, publicBaseUrl: 'https://app.purvanchaltrust.org' },
    cors: { origins: [] }, // same-origin: no cross-origin callers at all
  });
  delete process.env.PET_DATABASE_PATH;
  delete process.env.PET_UPLOAD_DIR;
  assert.deepEqual(tunnelDeployment, [], `tunnel deployment must be accepted: ${tunnelDeployment.join('; ')}`);

  const wildcard = validateProductionConfig({
    ...config,
    secrets: { licenseTokenSecret: 'x'.repeat(48), adminBootstrapSecret: 'y' },
    tls: { trustProxy: true, certFile: '', keyFile: '' },
    server: { ...config.server, publicBaseUrl: 'https://app.example.org' },
    cors: { origins: ['*'] },
  });
  assert.ok(wildcard.some(p => p.includes('wildcard')), 'must reject a wildcard origin');
});

test('the built bundle on disk, when present, matches build-info.json', () => {
  const distDir = path.join(REPO_ROOT, 'server', 'public', 'app');
  if (!fs.existsSync(path.join(distDir, 'index.html'))) return;
  const info = JSON.parse(fs.readFileSync(path.join(distDir, 'build-info.json'), 'utf8'));
  assert.equal(info.app, 'pet');
  assert.ok(info.buildId);
  // The HTML shell must embed the same id the descriptor advertises, or a
  // client could end up comparing two different builds' identifiers.
  const html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
  assert.match(html, new RegExp(`name="pet-build" content="${info.buildId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
});
