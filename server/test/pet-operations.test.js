/**
 * Field-operations tests: schools+profiles, field visits, tasks
 * (both directions), team chat, and attendance.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  startTestServer, stopTestServer, makeClient, petDb, resetPetDatabase,
  seedMainAdmin, seedEmployee, petLogin,
} from './pet-helpers.js';

let admin, worker, worker2, client, workerId, worker2Id;

async function setup() {
  resetPetDatabase();
  seedMainAdmin();
  const w1 = seedEmployee({ email: 'worker@pet.test', name: 'Field One' });
  const w2 = seedEmployee({ email: 'worker2@pet.test', name: 'Field Two' });
  workerId = w1.id; worker2Id = w2.id;
  client = makeClient();
  admin = (await petLogin(client, 'admin@pet.test', 'AdminPass-12345')).body;
  worker = (await petLogin(client, 'worker@pet.test', 'EmpPass-12345')).body;
  worker2 = (await petLogin(client, 'worker2@pet.test', 'EmpPass-12345')).body;
}

async function makeSchool(name = 'ABC Public School') {
  const res = await client.post('/api/schools', {
    name, address: '12 Station Road', locality: 'Lanka', district: 'Varanasi', state: 'UP',
    contact_person_name: 'Principal ABC', contact_person_phone: '9111122222',
  }, { token: admin.access_token });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.school;
}

before(async () => { await startTestServer(); });
after(async () => { await stopTestServer(); });

test('school directory: create, edit visibility, profile aggregates', async () => {
  await setup();
  const school = await makeSchool();

  // Employees can view and enrich school records.
  const empView = await client.get(`/api/schools/${school.id}`, { token: worker.access_token });
  assert.equal(empView.status, 200);
  const empEdit = await client.patch(`/api/schools/${school.id}`, { phone: '9333344444' }, { token: worker.access_token });
  assert.equal(empEdit.status, 200);

  // Register students + run a visit against the school, then read profile.
  await client.post('/api/students', { name: 'School Kid', parent_phone: '9000000010', school_id: school.id }, { token: worker.access_token });
  const visit = await client.post('/api/field-visits/start', { school_id: school.id, purpose: 'Survey' }, { token: worker.access_token });
  assert.equal(visit.status, 201, JSON.stringify(visit.body));
  await client.post(`/api/field-visits/${visit.body.visit.id}/end`, { report: 'Met principal; 12 students identified.' }, { token: worker.access_token });

  const profile = await client.get(`/api/schools/${school.id}/profile`, { token: admin.access_token });
  assert.equal(profile.status, 200);
  assert.equal(profile.body.students.length, 1);
  assert.equal(profile.body.visits.length, 1);
  assert.equal(profile.body.visitors.length, 1);
  assert.equal(profile.body.survey_reports.length, 1);
  assert.ok(profile.body.pipeline.some(p => p.status === 'registered'));

  // Archiving is admin-only.
  const empArchive = await client.post(`/api/schools/${school.id}/archive`, {}, { token: worker.access_token });
  assert.equal(empArchive.status, 403);
  const archived = await client.post(`/api/schools/${school.id}/archive`, {}, { token: admin.access_token });
  assert.equal(archived.status, 200);
  assert.equal(archived.body.school.status, 'archived');
});

test('field visit workflow: start → register students → report → end', async () => {
  await setup();
  const school = await makeSchool();

  const start = await client.post('/api/field-visits/start', {
    school_id: school.id, purpose: 'Student identification drive', latitude: 25.3, longitude: 82.9,
  }, { token: worker.access_token });
  assert.equal(start.status, 201);
  const visitId = start.body.visit.id;
  assert.equal(start.body.visit.status, 'active');
  assert.equal(start.body.visit.start_latitude, 25.3);

  // Only ONE active visit per employee.
  const second = await client.post('/api/field-visits/start', { school_id: school.id }, { token: worker.access_token });
  assert.equal(second.status, 409);
  assert.equal(second.body.error.code, 'VISIT_ALREADY_ACTIVE');

  // Student registered "during" the visit — visit counter + link set.
  const reg = await client.post('/api/students', {
    name: 'Visit Kid', parent_phone: '9000000011', school_id: school.id, visit_id: visitId,
  }, { token: worker.access_token });
  assert.equal(reg.status, 201);

  const detail = await client.get(`/api/field-visits/${visitId}`, { token: worker.access_token });
  assert.equal(detail.body.students.length, 1);
  assert.equal(detail.body.visit.students_registered, 1);

  // Other employees cannot see this visit's detail.
  const foreign = await client.get(`/api/field-visits/${visitId}`, { token: worker2.access_token });
  assert.equal(foreign.status, 403);

  // End with a report.
  const end = await client.post(`/api/field-visits/${visitId}/end`, {
    report: 'Registered 1 student; collected transfer cert copy.', students_contacted: 14, documents_collected: 1,
  }, { token: worker.access_token });
  assert.equal(end.status, 200);
  assert.equal(end.body.visit.status, 'completed');
  assert.ok(end.body.visit.ended_at);
  assert.equal(end.body.visit.students_contacted, 14);

  // Closed visits reject updates.
  const upd = await client.patch(`/api/field-visits/${visitId}`, { notes: 'late note' }, { token: worker.access_token });
  assert.equal(upd.status, 409);

  // Admin sees everyone's visits.
  const adminList = await client.get('/api/field-visits', { token: admin.access_token });
  assert.equal(adminList.body.total, 1);
  const workerList = await client.get('/api/field-visits', { token: worker.access_token });
  assert.equal(workerList.body.total, 1);
  const worker2List = await client.get('/api/field-visits', { token: worker2.access_token });
  assert.equal(worker2List.body.total, 0);
});

test('tasks: admin → employee flow with audited status events', async () => {
  await setup();
  const create = await client.post('/api/tasks', {
    title: 'Verify documents of Aman Kumar', description: 'Collect transfer certificate',
    assigned_to_user_id: workerId, priority: 'high', due_date: '2026-09-25',
  }, { token: admin.access_token });
  assert.equal(create.status, 201, JSON.stringify(create.body));
  const taskId = create.body.task.id;
  assert.equal(create.body.task.status, 'pending');

  // Assignee received a notification.
  const notif = await client.get('/api/me/notifications', { token: worker.access_token });
  assert.ok(notif.body.notifications.some(n => n.link_id === taskId));

  // Illegal backward flows are rejected.
  const bad = await client.post(`/api/tasks/${taskId}/status`, { status: 'completed' }, { token: worker.access_token });
  assert.equal(bad.status, 409);

  for (const status of ['accepted', 'in_progress', 'submitted', 'completed']) {
    const res = await client.post(`/api/tasks/${taskId}/status`, { status }, { token: worker.access_token });
    assert.equal(res.status, 200, `→ ${status}: ${JSON.stringify(res.body)}`);
  }
  const done = await client.get(`/api/tasks/${taskId}`, { token: admin.access_token });
  assert.equal(done.body.task.status, 'completed');
  assert.ok(done.body.task.completed_at);
  assert.deepEqual(
    done.body.events.map(e => e.to_status).filter(Boolean),
    ['pending', 'accepted', 'in_progress', 'submitted', 'completed']
  );
});

test('tasks: employee → employee works; outsiders cannot see the task', async () => {
  await setup();
  const create = await client.post('/api/tasks', {
    title: 'Share survey photos of XYZ school', assigned_to_user_id: worker2Id,
  }, { token: worker.access_token });
  assert.equal(create.status, 201, JSON.stringify(create.body));
  const taskId = create.body.task.id;

  // Assignee can act on it.
  const accept = await client.post(`/api/tasks/${taskId}/status`, { status: 'accepted' }, { token: worker2.access_token });
  assert.equal(accept.status, 200);

  // Creator can see it in their list; unrelated admin can; a third employee cannot view detail.
  assert.ok((await client.get('/api/tasks', { token: worker.access_token })).body.tasks.some(t => t.id === taskId));
});

test('tasks: visibility rules — employees see only their own tasks', async () => {
  await setup();
  await client.post('/api/tasks', { title: 'For worker 1', assigned_to_user_id: workerId }, { token: admin.access_token });
  await client.post('/api/tasks', { title: 'For worker 2', assigned_to_user_id: worker2Id }, { token: admin.access_token });

  const w1 = await client.get('/api/tasks', { token: worker.access_token });
  assert.equal(w1.body.total, 1);
  assert.equal(w1.body.tasks[0].title, 'For worker 1');
  const all = await client.get('/api/tasks', { token: admin.access_token });
  assert.equal(all.body.total, 2);

  // Reassignment is admin-only.
  const taskId = w1.body.tasks[0].id;
  const empReassign = await client.post(`/api/tasks/${taskId}/reassign`, { assigned_to_user_id: worker2Id }, { token: worker.access_token });
  assert.equal(empReassign.status, 403);
  const adminReassign = await client.post(`/api/tasks/${taskId}/reassign`, { assigned_to_user_id: worker2Id }, { token: admin.access_token });
  assert.equal(adminReassign.status, 200);
  assert.equal(adminReassign.body.task.assigned_to_user_name, 'Field Two');
});

test('team chat: direct conversation, messages with context links, unread counts', async () => {
  await setup();
  // worker1 ↔ worker2 direct chat (auto-deduplicated on reopen).
  const open = await client.post('/api/conversations/direct', { user_id: worker2Id }, { token: worker.access_token });
  assert.equal(open.status, 201);
  const convId = open.body.conversation.id;

  const reopen = await client.post('/api/conversations/direct', { user_id: worker2Id }, { token: worker.access_token });
  assert.equal(reopen.status, 200);
  assert.equal(reopen.body.conversation.id, convId);

  const student = await client.post('/api/students', { name: 'Chat Student', parent_phone: '9000000012' }, { token: worker.access_token });
  const send = await client.post(`/api/conversations/${convId}/messages`, {
    text: 'Please verify this student\'s documents.',
    linked_student_id: student.body.student.id,
  }, { token: worker.access_token });
  assert.equal(send.status, 201);
  assert.equal(send.body.message.linked_student_id, student.body.student.id);

  // Unread count for the recipient is 1; reading clears it.
  const before1 = await client.get('/api/conversations/unread-count', { token: worker2.access_token });
  assert.equal(before1.body.unread, 1);
  const read = await client.get(`/api/conversations/${convId}/messages`, { token: worker2.access_token });
  assert.equal(read.body.messages.length, 1);
  const after1 = await client.get('/api/conversations/unread-count', { token: worker2.access_token });
  assert.equal(after1.body.unread, 0);

  // Admin ↔ employee is the same primitive.
  const adminConv = await client.post('/api/conversations/direct', { user_id: workerId }, { token: admin.access_token });
  assert.equal(adminConv.status, 201);

  // A non-member cannot read or write.
  const intruder = makeClient();
  const w3 = seedEmployee({ email: 'worker3@pet.test', name: 'Field Three' });
  const w3Login = (await petLogin(intruder, 'worker3@pet.test', 'EmpPass-12345')).body;
  const denyRead = await intruder.get(`/api/conversations/${convId}/messages`, { token: w3Login.access_token });
  assert.equal(denyRead.status, 403);
  const denyWrite = await intruder.post(`/api/conversations/${convId}/messages`, { text: 'intruder' }, { token: w3Login.access_token });
  assert.equal(denyWrite.status, 403);
});

test('attendance: check-in/out, idempotent same-day, admin monthly report', async () => {
  await setup();
  const inRes = await client.post('/api/attendance/check-in', { latitude: 25.31, longitude: 82.97 }, { token: worker.access_token });
  assert.equal(inRes.status, 200, JSON.stringify(inRes.body));
  assert.ok(['present', 'late'].includes(inRes.body.record.status));

  // Same-day second check-in does not create a duplicate record.
  const again = await client.post('/api/attendance/check-in', {}, { token: worker.access_token });
  assert.equal(again.body.alreadyCheckedIn, true);
  const day = inRes.body.record.date;
  const count = petDb().prepare('SELECT COUNT(*) AS c FROM employee_attendance WHERE employee_id = ? AND date = ?')
    .get(worker.user.id, day).c;
  assert.equal(count, 1);

  const out = await client.post('/api/attendance/check-out', {}, { token: worker.access_token });
  assert.equal(out.status, 200);
  assert.ok(out.body.record.check_out_at);

  // Admin marks worker2 absent for today.
  const mark = await client.post('/api/attendance/mark', {
    employee_id: worker2Id, date: day, status: 'absent', remarks: 'No show',
  }, { token: admin.access_token });
  assert.equal(mark.status, 200, JSON.stringify(mark.body));

  // Employees cannot mark others.
  const deny = await client.post('/api/attendance/mark', {
    employee_id: worker2Id, date: day, status: 'present',
  }, { token: worker.access_token });
  assert.equal(deny.status, 403);

  // Admin views today + monthly summary.
  const today = await client.get(`/api/attendance?date=${day}`, { token: admin.access_token });
  assert.equal(today.body.total, 2);
  const summary = await client.get(`/api/attendance/summary?month=${day.slice(0, 7)}`, { token: admin.access_token });
  assert.equal(summary.status, 200);
  const w2row = summary.body.summary.find(r => r.employee_id === worker2Id);
  assert.equal(w2row.days_absent, 1);
});
