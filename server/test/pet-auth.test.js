/**
 * PET authentication & employee access lifecycle tests.
 * Covers: login, uniform failures, lockout, refresh rotation + replay,
 * logout revocation, forced password change, employee provisioning,
 * deactivation (sessions die, history preserved), access reset.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  startTestServer, stopTestServer, makeClient, petDb, resetPetDatabase,
  seedMainAdmin, seedEmployee, petLogin, bearer,
} from './pet-helpers.js';

before(async () => { await startTestServer(); });
after(async () => { await stopTestServer(); });

test('employee login returns tokens + safe profile (no password data)', async () => {
  resetPetDatabase();
  seedMainAdmin();
  seedEmployee({ email: 'worker@pet.test' });
  const client = makeClient();

  const res = await petLogin(client, 'worker@pet.test', 'EmpPass-12345');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(res.body.access_token && res.body.refresh_token);
  assert.equal(res.body.user.role, 'employee');
  assert.equal(res.body.user.employee_code, 'EMP-001');
  assert.ok(!('password_hash' in res.body.user));
  assert.ok(!('password' in res.body.user));
});

test('login failure is uniform — account existence is not revealed', async () => {
  resetPetDatabase();
  seedMainAdmin();
  seedEmployee({ email: 'worker@pet.test' });
  const client = makeClient();

  const a = await petLogin(client, 'worker@pet.test', 'wrong-password');
  const b = await petLogin(client, 'ghost@pet.test', 'wrong-password');
  assert.equal(a.status, 401);
  assert.equal(b.status, 401);
  assert.equal(a.body.error.code, b.body.error.code);
  assert.equal(a.body.error.message, b.body.error.message);
});

test('refresh rotates the token; old refresh token replay kills the session', async () => {
  resetPetDatabase();
  seedMainAdmin();
  seedEmployee({ email: 'worker@pet.test' });
  const client = makeClient();

  const login = (await petLogin(client, 'worker@pet.test', 'EmpPass-12345')).body;
  const rotated = await client.post('/api/auth/refresh', { refresh_token: login.refresh_token });
  assert.equal(rotated.status, 200);
  assert.notEqual(rotated.body.refresh_token, login.refresh_token);

  // Replay the ORIGINAL refresh token → session family revoked.
  const replay = await client.post('/api/auth/refresh', { refresh_token: login.refresh_token });
  assert.equal(replay.status, 401);
  assert.equal(replay.body.error.code, 'REFRESH_REPLAY_DETECTED');

  // Even the newest refresh token is now dead.
  const dead = await client.post('/api/auth/refresh', { refresh_token: rotated.body.refresh_token });
  assert.equal(dead.status, 401);
});

test('logout revokes the session; both tokens die', async () => {
  resetPetDatabase();
  seedMainAdmin();
  seedEmployee({ email: 'worker@pet.test' });
  const client = makeClient();

  const login = (await petLogin(client, 'worker@pet.test', 'EmpPass-12345')).body;
  const out = await client.post('/api/auth/logout', { refresh_token: login.refresh_token });
  assert.equal(out.status, 200);

  const meAfter = await client.get('/api/me', { token: login.access_token });
  assert.equal(meAfter.status, 401);
  const refreshAfter = await client.post('/api/auth/refresh', { refresh_token: login.refresh_token });
  assert.equal(refreshAfter.status, 401);
});

test('main admin creates employee; one-time temp password; forced change; old sessions revoked', async () => {
  resetPetDatabase();
  const admin = seedMainAdmin();
  const client = makeClient();
  const adminLogin = (await petLogin(client, admin.email, admin.password)).body;

  const created = await client.post('/api/employees', {
    name: 'New Field Worker', email: 'newbie@pet.test', phone: '9000000001',
  }, { token: adminLogin.access_token });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.user.must_change_password, true);
  assert.ok(created.body.temporaryPassword, 'temp password returned once');

  // Temp password works, but the account must change it.
  const first = await petLogin(client, 'newbie@pet.test', created.body.temporaryPassword);
  assert.equal(first.status, 200);
  assert.equal(first.body.user.must_change_password, true);

  // The stored record only has a hash — never the plaintext.
  const row = petDb().prepare('SELECT * FROM users WHERE email = ?').get('newbie@pet.test');
  assert.ok(!row.password_hash.includes(created.body.temporaryPassword));

  // Change password → all sessions revoked → new password required.
  const change = await client.post('/api/auth/change-password', {
    current_password: created.body.temporaryPassword, new_password: 'NewStrong-123',
  }, { token: first.body.access_token });
  assert.equal(change.status, 200, JSON.stringify(change.body));

  const oldToken = await client.get('/api/me', { token: first.body.access_token });
  assert.equal(oldToken.status, 401);

  const reLogin = await petLogin(client, 'newbie@pet.test', 'NewStrong-123');
  assert.equal(reLogin.status, 200);
  assert.equal(reLogin.body.user.must_change_password, false);
});

test('deactivating an employee kills sessions immediately; history preserved', async () => {
  resetPetDatabase();
  const admin = seedMainAdmin();
  seedEmployee({ email: 'worker@pet.test' });
  const client = makeClient();
  const adminLogin = (await petLogin(client, admin.email, admin.password)).body;

  const list = await client.get('/api/employees', { token: adminLogin.access_token });
  const worker = list.body.employees.find(e => e.email === 'worker@pet.test');
  const workerLogin = (await petLogin(client, 'worker@pet.test', 'EmpPass-12345')).body;

  // Employee can work before deactivation.
  assert.equal((await client.get('/api/me', { token: workerLogin.access_token })).status, 200);

  const off = await client.post(`/api/employees/${worker.id}/status`, { status: 'DISABLED' }, { token: adminLogin.access_token });
  assert.equal(off.status, 200);

  // Live access token now rejected; fresh login rejected too.
  assert.equal((await client.get('/api/me', { token: workerLogin.access_token })).status, 401);
  assert.equal((await petLogin(client, 'worker@pet.test', 'EmpPass-12345')).status, 403);

  // The user row still exists (auditable history) — never hard-deleted.
  const row = petDb().prepare('SELECT * FROM users WHERE id = ?').get(worker.id);
  assert.equal(row.status, 'DISABLED');
});

test('access reset returns new temp password once and revokes sessions', async () => {
  resetPetDatabase();
  const admin = seedMainAdmin();
  seedEmployee({ email: 'worker@pet.test' });
  const client = makeClient();
  const adminLogin = (await petLogin(client, admin.email, admin.password)).body;
  const workerLogin = (await petLogin(client, 'worker@pet.test', 'EmpPass-12345')).body;

  const list = await client.get('/api/employees', { token: adminLogin.access_token });
  const worker = list.body.employees[0];

  const reset = await client.post(`/api/employees/${worker.id}/reset-access`, {}, { token: adminLogin.access_token });
  assert.equal(reset.status, 200);
  assert.ok(reset.body.temporaryPassword);

  assert.equal((await client.get('/api/me', { token: workerLogin.access_token })).status, 401);
  assert.equal((await petLogin(client, 'worker@pet.test', 'EmpPass-12345')).status, 401);
  assert.equal((await petLogin(client, 'worker@pet.test', reset.body.temporaryPassword)).status, 200);
});

test('employees cannot call admin-only employee management', async () => {
  resetPetDatabase();
  seedMainAdmin();
  seedEmployee({ email: 'worker@pet.test' });
  const client = makeClient();
  const workerLogin = (await petLogin(client, 'worker@pet.test', 'EmpPass-12345')).body;

  const res = await client.get('/api/employees', { token: workerLogin.access_token });
  assert.equal(res.status, 403);

  const create = await client.post('/api/employees', { name: 'X', email: 'x@pet.test' }, { token: workerLogin.access_token });
  assert.equal(create.status, 403);
});

test('unauthenticated requests to /api are rejected', async () => {
  resetPetDatabase();
  const client = makeClient();
  for (const path of ['/api/students', '/api/schools', '/api/tasks', '/api/me', '/api/reports/dashboard']) {
    const res = await client.get(path);
    assert.equal(res.status, 401, `${path} should require auth`);
  }
});

test('repeated failed logins lock the account temporarily', async () => {
  resetPetDatabase();
  seedMainAdmin();
  seedEmployee({ email: 'worker@pet.test' });
  const client = makeClient();

  for (let i = 0; i < 5; i++) {
    await client.post('/api/auth/login', { email: 'worker@pet.test', password: 'bad' });
  }
  const locked = await client.post('/api/auth/login', { email: 'worker@pet.test', password: 'EmpPass-12345' });
  assert.equal(locked.status, 429);
  assert.equal(locked.body.error.code, 'ACCOUNT_LOCKED');
});

test('audit log records logins and never contains secrets', async () => {
  resetPetDatabase();
  seedMainAdmin();
  seedEmployee({ email: 'worker@pet.test' });
  const client = makeClient();
  await petLogin(client, 'worker@pet.test', 'EmpPass-12345');

  const rows = petDb().prepare(`SELECT * FROM audit_logs WHERE action = 'PET_LOGIN'`).all();
  assert.ok(rows.length >= 1);
  const serialized = JSON.stringify(rows);
  assert.ok(!serialized.includes('EmpPass-12345'));
  assert.ok(!serialized.includes('refresh_token'));
});
