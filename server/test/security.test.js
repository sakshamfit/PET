/**
 * Security hardening tests: production config gate, error sanitization,
 * input validation, security headers, CORS allowlist, rate limiting,
 * SQL-injection resistance, audit redaction, scrypt hashing.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  startTestServer,
  stopTestServer,
  makeClient,
  resetDatabase,
  seedAdmin,
  db,
} from './helpers.js';
import { sanitizeMetadata } from '../src/lib/audit.js';
import { hashPassword, verifyPassword } from '../src/lib/crypto.js';
import { validateProductionConfig } from '../src/config.js';
import config from '../src/config.js';

let client;
let base;

before(async () => {
  base = await startTestServer();
  resetDatabase();
  seedAdmin();
  client = makeClient();
});

after(async () => {
  await stopTestServer();
});

test('production config gate rejects insecure settings; accepts a complete one', () => {
  const problems = validateProductionConfig({
    ...config,
    secrets: { licenseTokenSecret: 'short', adminBootstrapSecret: '' },
    tls: { trustProxy: false, certFile: '', keyFile: '' },
    server: { ...config.server, publicBaseUrl: 'http://localhost:8080' },
    cors: { origins: ['http://localhost:3000'] },
  });
  assert.ok(problems.some(p => p.includes('LICENSE_TOKEN_SECRET')), 'must demand strong secret');
  assert.ok(problems.some(p => p.includes('TLS')), 'must demand TLS');
  assert.ok(problems.some(p => p.includes('https')), 'must demand https public URL');
  assert.ok(problems.some(p => p.toLowerCase().includes('localhost')), 'must reject localhost URL');
  assert.ok(problems.some(p => p.includes('local origin')), 'must reject local CORS origin');
  // PET production deployment must also declare its data/upload paths.
  assert.ok(problems.some(p => p.includes('PET_DATABASE_PATH')), 'must demand PET_DATABASE_PATH');

  // Simulate the complete production environment (as spec 12 requires).
  process.env.PET_DATABASE_PATH = '/var/pet/data/pet.db';
  process.env.PET_UPLOAD_DIR = '/var/pet/uploads';
  const ok = validateProductionConfig({
    ...config,
    secrets: { licenseTokenSecret: 'x'.repeat(48), adminBootstrapSecret: 'y' },
    tls: { trustProxy: true, certFile: '', keyFile: '' },
    server: { ...config.server, publicBaseUrl: 'https://api.example.com' },
    cors: { origins: ['https://admin.example.com'] },
  });
  delete process.env.PET_DATABASE_PATH;
  delete process.env.PET_UPLOAD_DIR;
  assert.deepEqual(ok, [], `unexpected problems: ${ok.join('; ')}`);
});

test('scrypt password hashing: salted, verifiable, robust against bad input', () => {
  const h1 = hashPassword('same-plaintext-1');
  const h2 = hashPassword('same-plaintext-1');
  assert.notEqual(h1, h2, 'salts must differ');
  assert.ok(h1.startsWith('scrypt$'));
  assert.ok(verifyPassword('same-plaintext-1', h1));
  assert.ok(!verifyPassword('same-plaintext-2', h1));
  assert.ok(!verifyPassword('same-plaintext-1', 'garbage'));
  assert.ok(!verifyPassword('same-plaintext-1', ''));
});

test('audit redactor strips anything sensitive-shaped', () => {
  const clean = sanitizeMetadata({
    email: 'a@b.c',
    password: 'x',
    password_hash: 'scrypt$...',
    access_token: 'abc',
    refreshToken: 'def',
    google_oauth_token: 'ghi',
    backup_encryption_key: 'jkl',
    license_secret: 'mno',
    nested: { api_key: 'pqr', note: 'ok' },
  });
  assert.equal(clean.email, 'a@b.c');
  for (const k of ['password', 'password_hash', 'access_token', 'refreshToken', 'google_oauth_token', 'backup_encryption_key', 'license_secret']) {
    assert.equal(clean[k], '[redacted]', `${k} must be redacted`);
  }
  assert.equal(clean.nested.api_key, '[redacted]');
  assert.equal(clean.nested.note, 'ok');
});

test('malformed JSON and unknown routes return sanitized errors', async () => {
  const res = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{invalid json!!!',
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.code, 'VALIDATION_ERROR');
  assert.ok(!JSON.stringify(body).includes('SyntaxError'), 'must not leak parser internals');

  const unknown = await client.get('/definitely-not-a-route');
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.error.code, 'NOT_FOUND');
});

test('validation rejects malformed inputs and unexpected fields with 400', async () => {
  const res1 = await client.post('/auth/login', { email: 'not-an-email', password: 'x' });
  assert.equal(res1.status, 400);
  assert.equal(res1.body.error.code, 'VALIDATION_ERROR');

  const res2 = await client.post('/auth/login', { email: 'a@b.co', password: 'x', hacker: true });
  assert.equal(res2.status, 400);
  assert.ok(res2.body.error.message.includes('Unexpected field'));

  const res3 = await client.post('/auth/login', ['array-body']);
  assert.equal(res3.status, 400);
});

test('security headers are present; framework banner is not', async () => {
  const res = await client.get('/health');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.ok(!res.headers.get('x-powered-by'));
});

test('CORS: allowlisted origin gets headers, foreign origin does not', async () => {
  const allowed = await client.raw('GET', '/health', {
    headers: { Origin: 'https://admin.example.com' },
  });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://admin.example.com');

  const denied = await client.raw('GET', '/health', {
    headers: { Origin: 'https://evil.example.net' },
  });
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
});

test('no SQL injection via email field (parameterized statements)', async () => {
  const res = await client.post('/auth/login', {
    email: "attacker@example.com' OR '1'='1",
    password: 'irrelevant-123',
  });
  assert.ok([400, 401].includes(res.status));
  assert.equal(db().prepare('SELECT COUNT(*) c FROM admins').get().c, 1);
});

test('rate limiting on /auth/login trips with 429 and the correct code', async () => {
  process.env.TEST_ENABLE_RATE_LIMITS = '1';
  try {
    let last;
    for (let i = 0; i < 25; i++) {
      last = await fetch(`${base}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: `burst${i}@x.test`, password: 'nope-nope-nope' }),
      });
    }
    assert.equal(last.status, 429);
    const body = await last.json();
    assert.equal(body.error.code, 'RATE_LIMITED');
    assert.ok(last.headers.get('ratelimit-limit'), 'standard rate limit headers expected');
  } finally {
    delete process.env.TEST_ENABLE_RATE_LIMITS;
  }
});
