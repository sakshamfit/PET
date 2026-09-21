/**
 * Testing, evaluation, selection and enrollment — the old Exams/Results
 * concept, repurposed for PET with configurable criteria.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  startTestServer, stopTestServer, makeClient, petDb, resetPetDatabase,
  seedMainAdmin, seedEmployee, petLogin,
} from './pet-helpers.js';

let admin, worker, client, workerId;

async function setup() {
  resetPetDatabase();
  seedMainAdmin();
  const w = seedEmployee({ email: 'worker@pet.test' });
  workerId = w.id;
  client = makeClient();
  admin = (await petLogin(client, 'admin@pet.test', 'AdminPass-12345')).body;
  worker = (await petLogin(client, 'worker@pet.test', 'EmpPass-12345')).body;
}

async function makeStudent(name = 'Test Candidate', phone = '9000000020') {
  const res = await client.post('/api/students', { name, parent_phone: phone }, { token: worker.access_token });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.student;
}

async function makeTest() {
  const res = await client.post('/api/tests', {
    name: 'PET Scholarship Test 2026', scheduled_date: '2026-10-01', passing_percentage: 60,
    subjects: [
      { name: 'Math', max_marks: 100, passing_marks: 30 },
      { name: 'English', max_marks: 100, passing_marks: 30 },
      { name: 'GK', max_marks: 100, passing_marks: 25 },
    ],
  }, { token: admin.access_token });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.test;
}

before(async () => { await startTestServer(); });
after(async () => { await stopTestServer(); });

test('full journey: register → assign → marks → finalize → select → enroll', async () => {
  await setup();
  const student = await makeStudent();
  const testDef = await makeTest();

  // Assign → student moves REGISTERED → TEST_SCHEDULED (lifecycle service).
  const assign = await client.post(`/api/tests/${testDef.id}/assign`, { student_ids: [student.id] }, { token: admin.access_token });
  assert.equal(assign.status, 200, JSON.stringify(assign.body));
  assert.equal(assign.body.assigned.length, 1);
  let s = petDb().prepare('SELECT status FROM students WHERE id = ?').get(student.id);
  assert.equal(s.status, 'test_scheduled');

  // Re-assignment is idempotent (skipped, not duplicated).
  const again = await client.post(`/api/tests/${testDef.id}/assign`, { student_ids: [student.id] }, { token: admin.access_token });
  assert.deepEqual(again.body.skipped, [student.id]);

  // Employee enters marks (authorized field testing).
  const [math, eng, gk] = testDef.subjects;
  const wrong = await client.post(`/api/tests/${testDef.id}/marks/${student.id}`, {
    marks: [{ subject_id: math.id, obtained_marks: 150 }],
  }, { token: worker.access_token });
  assert.equal(wrong.status, 400); // over max → rejected

  const marks = await client.post(`/api/tests/${testDef.id}/marks/${student.id}`, {
    marks: [
      { subject_id: math.id, obtained_marks: 72 },
      { subject_id: eng.id, obtained_marks: 81 },
      { subject_id: gk.id, obtained_marks: 65 },
    ],
  }, { token: worker.access_token });
  assert.equal(marks.status, 200, JSON.stringify(marks.body));
  assert.equal(marks.body.score.total_obtained, 218);
  assert.equal(marks.body.score.total_max, 300);
  assert.equal(marks.body.score.percentage, 72.67);
  assert.equal(marks.body.score.suggested_result, 'eligible');

  // Finalize (admin) → assignment completed + student UNDER_EVALUATION.
  const fin = await client.post(`/api/tests/${testDef.id}/finalize/${student.id}`, {}, { token: admin.access_token });
  assert.equal(fin.status, 200);
  s = petDb().prepare('SELECT status FROM students WHERE id = ?').get(student.id);
  assert.equal(s.status, 'under_evaluation');

  // Selection decision → SELECTED.
  const decide = await client.post(`/api/tests/${testDef.id}/decision/${student.id}`, {
    decision: 'selected', remarks: 'Above cut-off',
  }, { token: admin.access_token });
  assert.equal(decide.status, 200);
  assert.equal(decide.body.student.status, 'selected');

  // Enrollment pipeline.
  const start = await client.post(`/api/enrollments/${student.id}/start`, {}, { token: admin.access_token });
  assert.equal(start.status, 201);
  assert.equal(start.body.enrollment.stage, 'follow_up');

  const badJump = await client.post(`/api/enrollments/${student.id}/stage`, { stage: 'enrolled' }, { token: admin.access_token });
  assert.equal(badJump.status, 409);

  for (const stage of ['documents', 'verification', 'enrolled']) {
    const step = await client.post(`/api/enrollments/${student.id}/stage`, { stage }, { token: admin.access_token });
    assert.equal(step.status, 200, `stage ${stage}: ${JSON.stringify(step.body)}`);
  }
  s = petDb().prepare('SELECT status FROM students WHERE id = ?').get(student.id);
  assert.equal(s.status, 'enrolled');

  // The complete journey is preserved.
  const profile = await client.get(`/api/students/${student.id}/profile`, { token: admin.access_token });
  assert.deepEqual(
    profile.body.journey.map(j => j.to_status),
    ['registered', 'test_scheduled', 'test_completed', 'under_evaluation', 'selected', 'enrolled']
  );
  assert.equal(profile.body.enrollment.status, 'completed');
  assert.equal(profile.body.results.length, 3);
  assert.equal(profile.body.tests.length, 1);
});

test('eligibility respects per-subject passing marks', async () => {
  await setup();
  const student = await makeStudent('Borderline', '9000000021');
  const testDef = await makeTest();
  await client.post(`/api/tests/${testDef.id}/assign`, { student_ids: [student.id] }, { token: admin.access_token });
  const [math, eng, gk] = testDef.subjects;
  // 70% overall but Math below the 30-mark subject floor.
  const marks = await client.post(`/api/tests/${testDef.id}/marks/${student.id}`, {
    marks: [
      { subject_id: math.id, obtained_marks: 20 },
      { subject_id: eng.id, obtained_marks: 95 },
      { subject_id: gk.id, obtained_marks: 95 },
    ],
  }, { token: worker.access_token });
  assert.equal(marks.body.score.percentage, 70);
  assert.equal(marks.body.score.suggested_result, 'not_eligible');
});

test('finalizing with incomplete marks is blocked', async () => {
  await setup();
  const student = await makeStudent('Incomplete', '9000000022');
  const testDef = await makeTest();
  await client.post(`/api/tests/${testDef.id}/assign`, { student_ids: [student.id] }, { token: admin.access_token });
  await client.post(`/api/tests/${testDef.id}/marks/${student.id}`, {
    marks: [{ subject_id: testDef.subjects[0].id, obtained_marks: 50 }],
  }, { token: worker.access_token });
  const fin = await client.post(`/api/tests/${testDef.id}/finalize/${student.id}`, {}, { token: admin.access_token });
  assert.equal(fin.status, 409);
  assert.equal(fin.body.error.code, 'MARKS_INCOMPLETE');
});

test('non-admin cannot create tests or make selection decisions', async () => {
  await setup();
  const create = await client.post('/api/tests', { name: 'X', subjects: [{ name: 'Math', max_marks: 100 }] }, { token: worker.access_token });
  assert.equal(create.status, 403);
  const testDef = await makeTest();
  const student = await makeStudent('DecideMe', '9000000023');
  const decide = await client.post(`/api/tests/${testDef.id}/decision/${student.id}`, { decision: 'selected' }, { token: worker.access_token });
  assert.equal(decide.status, 403);
});

test('enrollment requires a SELECTED student', async () => {
  await setup();
  const student = await makeStudent('NotSelected', '9000000024');
  const res = await client.post(`/api/enrollments/${student.id}/start`, {}, { token: admin.access_token });
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'NOT_SELECTED');
});

test('admin dashboard returns operational KPIs', async () => {
  await setup();
  const student = await makeStudent('Dash Kid', '9000000025');
  const school = await client.post('/api/schools', { name: 'Dash School' }, { token: admin.access_token });
  await client.post('/api/field-visits/start', { school_id: school.body.school.id }, { token: worker.access_token });
  await client.post('/api/tasks', { title: 'Dash task', assigned_to_user_id: workerId }, { token: admin.access_token });

  const dash = await client.get('/api/reports/dashboard', { token: admin.access_token });
  assert.equal(dash.status, 200);
  assert.equal(dash.body.kpis.registered_students >= 1, true);
  assert.equal(dash.body.kpis.todays_field_visits, 1);
  assert.equal(dash.body.kpis.pending_tasks, 1);
  assert.ok(Array.isArray(dash.body.pipeline));
  assert.equal(dash.body.live_visits.length, 1);

  // Employees cannot read the admin dashboard.
  const deny = await client.get('/api/reports/dashboard', { token: worker.access_token });
  assert.equal(deny.status, 403);

  // Employee dashboard is personal.
  const mine = await client.get('/api/me/dashboard', { token: worker.access_token });
  assert.equal(mine.status, 200);
  assert.equal(mine.body.my_tasks.length, 1);
  assert.ok(mine.body.active_visit);
});
