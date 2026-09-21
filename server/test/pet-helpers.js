/**
 * Shared PET test harness: in-memory pet.db + real app on an ephemeral
 * port, exercising the exact production code paths.
 *
 * Environment is configured BEFORE any server module is imported.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = ':memory:';
process.env.PET_DATABASE_PATH = ':memory:';
process.env.LICENSE_TOKEN_SECRET = 'test-suite-license-token-secret-32chars-minimum!';
process.env.CORS_ORIGINS = 'https://app.pet.test';

const tmpUploads = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-uploads-'));
const tmpBackups = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-backups-'));
process.env.PET_UPLOAD_DIR = tmpUploads;
process.env.PET_BACKUP_DIR = tmpBackups;

const { initPetDb, getPetDb } = await import('../src/pet/db.js');
const { initDb } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const cryptoLib = await import('../src/lib/crypto.js');
const { _resetLockouts } = await import('../src/lib/lockout.js');

initDb(':memory:');
initPetDb(':memory:');

let server = null;
let baseUrl = '';

export async function startTestServer() {
  const app = createApp();
  await new Promise(resolve => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  return baseUrl;
}

export async function stopTestServer() {
  if (server) await new Promise(resolve => server.close(resolve));
  server = null;
}

/** Minimal JSON fetch helper. */
export function makeClient() {
  async function request(method, pathName, { body, headers = {}, token = null } = {}) {
    const res = await fetch(`${baseUrl}${pathName}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* binary/non-JSON */ }
    return { status: res.status, body: json, text, headers: res.headers };
  }
  return {
    get: (p, opts) => request('GET', p, opts),
    post: (p, body, opts) => request('POST', p, { ...opts, body }),
    patch: (p, body, opts) => request('PATCH', p, { ...opts, body }),
    raw: request,
  };
}

export function petDb() { return getPetDb(); }
export function uploadDir() { return tmpUploads; }

/** Full reset of PET + control-plane tables between scenarios. */
export function resetPetDatabase() {
  const db = getPetDb();
  db.exec(`
    DELETE FROM sync_operations; DELETE FROM audit_logs; DELETE FROM notifications;
    DELETE FROM website_form_submissions; DELETE FROM enrollments; DELETE FROM test_evaluations;
    DELETE FROM test_results; DELETE FROM test_assignments; DELETE FROM test_subjects;
    DELETE FROM tests; DELETE FROM employee_attendance; DELETE FROM field_media;
    DELETE FROM field_visits; DELETE FROM messages; DELETE FROM conversation_members;
    DELETE FROM conversations; DELETE FROM task_events; DELETE FROM tasks;
    DELETE FROM student_documents; DELETE FROM student_status_history; DELETE FROM students;
    DELETE FROM schools; DELETE FROM sessions; DELETE FROM users; DELETE FROM teams;
    DELETE FROM organization; DELETE FROM counters;
  `);
  _resetLockouts();
}

export function hashPassword(pw) { return cryptoLib.hashPassword(pw); }

/** Seed an organization + Main Admin directly (fast path). */
export function seedMainAdmin({ email = 'admin@pet.test', password = 'AdminPass-12345', name = 'Main Admin' } = {}) {
  const id = cryptoLib.randomId('usr');
  const db = getPetDb();
  const ts = new Date().toISOString();
  db.prepare(
    `INSERT INTO users (id, name, email, role, employee_code, password_hash, must_change_password, status, created_at, updated_at)
     VALUES (?, ?, ?, 'main_admin', 'ADMIN-001', ?, 0, 'ACTIVE', ?, ?)`
  ).run(id, name, email, hashPassword(password), ts, ts);
  db.prepare(
    `INSERT INTO organization (id, name, created_at, updated_at) VALUES (?, 'Purvanchal Education Trust', ?, ?)`
  ).run(cryptoLib.randomId('org'), ts, ts);
  return { id, email, password, name };
}

/** Seed an employee directly (skips admin API for setup speed). */
export function seedEmployee({ email, password = 'EmpPass-12345', name = 'Field Employee', status = 'ACTIVE', mustChange = false } = {}) {
  const id = cryptoLib.randomId('usr');
  const db = getPetDb();
  const ts = new Date().toISOString();
  const code = `EMP-${String(db.prepare(`SELECT COUNT(*) AS c FROM users WHERE role='employee'`).get().c + 1).padStart(3, '0')}`;
  db.prepare(
    `INSERT INTO users (id, name, email, role, employee_code, password_hash, must_change_password, status, created_at, updated_at)
     VALUES (?, ?, ?, 'employee', ?, ?, ?, ?, ?, ?)`
  ).run(id, name, email, code, hashPassword(password), mustChange ? 1 : 0, status, ts, ts);
  return { id, email, password, name, employee_code: code };
}

/** Log in via the real endpoint; returns the token payload. */
export async function petLogin(client, email, password) {
  const res = await client.post('/api/auth/login', { email, password });
  return res;
}

export function auth(token) {
  return { token };
}

export function bearer(login) {
  return { Authorization: `Bearer ${login.access_token}` };
}
