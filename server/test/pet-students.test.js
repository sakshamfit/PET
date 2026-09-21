/**
 * Student lifecycle tests: registration, server-side PET ID generation,
 * duplicate warnings (never silent merges), updates, status transitions
 * with full history, search and the canonical complete profile.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  startTestServer, stopTestServer, makeClient, petDb, resetPetDatabase,
  seedMainAdmin, seedEmployee, petLogin,
} from './pet-helpers.js';

/** 1x1 transparent PNG for photo upload tests. */
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let admin, worker, client;

async function setup() {
  resetPetDatabase();
  seedMainAdmin();
  seedEmployee({ email: 'worker@pet.test' });
  client = makeClient();
  admin = (await petLogin(client, 'admin@pet.test', 'AdminPass-12345')).body;
  worker = (await petLogin(client, 'worker@pet.test', 'EmpPass-12345')).body;
}

async function makeSchool(token, name = 'ABC Public School') {
  const res = await client.post('/api/schools', {
    name, address: '12 Station Road', district: 'Varanasi', state: 'UP',
  }, { token });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.school;
}

before(async () => { await new Promise(r => startTestServer().then(r)); });
after(async () => { await stopTestServer(); });

test('employee registers a student; server generates sequential PET ID', async () => {
  await setup();
  const school = await makeSchool(admin.access_token);

  const res = await client.post('/api/students', {
    name: 'Aman Kumar', dob: '2012-05-01', gender: 'male',
    parent_name: 'Ramesh Kumar', parent_phone: '9876543210', parent_relation: 'father',
    school_id: school.id, district: 'Varanasi', city: 'Varanasi', state: 'UP',
    current_class: '8', notes: 'First contact at school gate',
  }, { token: worker.access_token });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.match(res.body.student.pet_student_id, /^PET-\d{4}-\d{5}$/);
  assert.equal(res.body.student.status, 'registered');
  assert.equal(res.body.student.registered_by_user_name, 'Field Employee');
  assert.equal(res.body.student.school_name, 'ABC Public School');

  const second = await client.post('/api/students', {
    name: 'Priya Singh', parent_phone: '9000000002', school_id: school.id,
  }, { token: worker.access_token });
  assert.equal(second.status, 201);
  assert.ok(second.body.student.pet_student_id > res.body.student.pet_student_id);

  // Status history begins with the registration event.
  const history = petDb().prepare('SELECT * FROM student_status_history WHERE student_id = ?')
    .all(res.body.student.id);
  assert.equal(history.length, 1);
  assert.equal(history[0].to_status, 'registered');
});

test('registration with inline photo stores file + relative path', async () => {
  await setup();
  const res = await client.post('/api/students', {
    name: 'Photo Student', parent_phone: '9000000003',
    photo_data: { fileName: 'cam.png', mimeType: 'image/png', dataBase64: PNG_1PX },
  }, { token: worker.access_token });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.match(res.body.student.photo_path, /^students\//);
});

test('duplicate detection warns and never silently merges', async () => {
  await setup();
  const first = await client.post('/api/students', {
    name: 'Aman Kumar', parent_phone: '9876543210',
  }, { token: worker.access_token });
  assert.equal(first.status, 201);

  // Same name + parent phone → 409 with duplicate candidates.
  const dupe = await client.post('/api/students', {
    name: 'Aman Kumar', parent_phone: '+91 98765 43210',
  }, { token: worker.access_token });
  assert.equal(dupe.status, 409);
  assert.equal(dupe.body.error.code, 'POSSIBLE_DUPLICATES');
  assert.ok(dupe.body.error.details.duplicates.length >= 1);
  assert.ok(dupe.body.error.details.duplicates[0].reasons.some(r => r.includes('parent phone')));

  // Only ONE student exists — no silent merge happened.
  const count = petDb().prepare('SELECT COUNT(*) AS c FROM students').get().c;
  assert.equal(count, 1);

  // Acknowledged duplicates save explicitly under a NEW permanent ID.
  const forced = await client.post('/api/students', {
    name: 'Aman Kumar', parent_phone: '9876543210', acknowledge_duplicates: true,
  }, { token: worker.access_token });
  assert.equal(forced.status, 201);
  assert.notEqual(forced.body.student.id, first.body.student.id);
  assert.notEqual(forced.body.student.pet_student_id, first.body.student.pet_student_id);
});

test('duplicates-check endpoint is a pure read', async () => {
  await setup();
  const create = await client.post('/api/students', {
    name: 'Riya Verma', student_phone: '9111111111',
  }, { token: worker.access_token });
  assert.equal(create.status, 201);

  const check = await client.post('/api/students/duplicates-check', {
    name: 'Riya Verma', student_phone: '9111111111',
  }, { token: worker.access_token });
  assert.equal(check.status, 200);
  assert.ok(check.body.duplicates.length >= 1);
  assert.equal(petDb().prepare('SELECT COUNT(*) AS c FROM students').get().c, 1);
});

test('lifecycle transitions are validated + fully historied', async () => {
  await setup();
  const res = await client.post('/api/students', {
    name: 'Journey Student', parent_phone: '9000000004',
  }, { token: worker.access_token });
  const id = res.body.student.id;

  // Illegal jump: registered → enrolled.
  const bad = await client.post(`/api/students/${id}/status`, { to_status: 'enrolled' }, { token: worker.access_token });
  assert.equal(bad.status, 409);

  // Selection decisions are Main Admin only.
  const sched = await client.post(`/api/students/${id}/status`, { to_status: 'test_scheduled' }, { token: worker.access_token });
  assert.equal(sched.status, 200, JSON.stringify(sched.body));
  await client.post(`/api/students/${id}/status`, { to_status: 'test_completed' }, { token: worker.access_token });
  await client.post(`/api/students/${id}/status`, { to_status: 'under_evaluation' }, { token: worker.access_token });

  const employeeSelect = await client.post(`/api/students/${id}/status`, { to_status: 'selected' }, { token: worker.access_token });
  assert.equal(employeeSelect.status, 403);

  const adminSelect = await client.post(`/api/students/${id}/status`, { to_status: 'selected', reason: 'Strong test results' }, { token: admin.access_token });
  assert.equal(adminSelect.status, 200, JSON.stringify(adminSelect.body));

  const history = petDb().prepare(
    'SELECT from_status, to_status FROM student_status_history WHERE student_id = ? ORDER BY created_at, rowid'
  ).all(id);
  assert.deepEqual(
    history.map(h => h.to_status),
    ['registered', 'test_scheduled', 'test_completed', 'under_evaluation', 'selected']
  );
});

test('employee updates student fields; update is audited', async () => {
  await setup();
  const res = await client.post('/api/students', {
    name: 'Update Me', parent_phone: '9000000005',
  }, { token: worker.access_token });
  const id = res.body.student.id;

  const patch = await client.patch(`/api/students/${id}`, {
    current_class: '9', notes: 'Met parents on 2nd visit',
  }, { token: worker.access_token });
  assert.equal(patch.status, 200);
  assert.equal(patch.body.student.current_class, '9');

  const audit = petDb().prepare(
    `SELECT * FROM audit_logs WHERE action = 'PET_STUDENT_UPDATED' AND target_id = ?`
  ).get(id);
  assert.ok(audit);
});

test('student search covers name, PET id, phone, parent, district, status', async () => {
  await setup();
  await client.post('/api/students', { name: 'Search Name', parent_phone: '9222222222', district: 'Azamgarh' }, { token: worker.access_token });

  for (const q of ['Search Name', '9222222222', 'Azamgarh']) {
    const res = await client.get(`/api/students?q=${encodeURIComponent(q)}`, { token: worker.access_token });
    assert.equal(res.status, 200);
    assert.equal(res.body.total, 1, `search by ${q}`);
  }
  const byId = petDb().prepare(`SELECT pet_student_id FROM students`).get();
  const res2 = await client.get(`/api/students?q=${byId.pet_student_id}`, { token: worker.access_token });
  assert.equal(res2.body.total, 1);

  const byStatus = await client.get('/api/students?status=registered', { token: worker.access_token });
  assert.equal(byStatus.body.total, 1);
});

test('student profile returns journey + linked records', async () => {
  await setup();
  const res = await client.post('/api/students', {
    name: 'Profile Student', parent_phone: '9000000006',
  }, { token: worker.access_token });
  const id = res.body.student.id;
  await client.post(`/api/students/${id}/status`, { to_status: 'test_scheduled' }, { token: worker.access_token });

  const profile = await client.get(`/api/students/${id}/profile`, { token: worker.access_token });
  assert.equal(profile.status, 200);
  assert.equal(profile.body.student.id, id);
  assert.equal(profile.body.journey.length, 2);
  assert.ok(Array.isArray(profile.body.tasks));
  assert.ok(Array.isArray(profile.body.documents));
  assert.ok(Array.isArray(profile.body.tests));
});

test('global search finds students, schools and tasks', async () => {
  await setup();
  await client.post('/api/students', { name: 'Global Findme', parent_phone: '9000000007' }, { token: worker.access_token });
  await makeSchool(admin.access_token, 'Findme Valley School');

  const res = await client.get('/api/search?q=Findme', { token: admin.access_token });
  assert.equal(res.status, 200);
  assert.equal(res.body.students.length, 1);
  assert.equal(res.body.schools.length, 1);

  // Employees get student/school search but not the employee directory.
  const emp = await client.get('/api/search?q=worker', { token: worker.access_token });
  assert.equal(emp.status, 200);
  assert.equal(emp.body.employees.length, 0);
});
