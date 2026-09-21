/**
 * Offline sync idempotency, website form intake/conversion, upload
 * security, and server-side authorization boundaries.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  startTestServer, stopTestServer, makeClient, petDb, resetPetDatabase,
  seedMainAdmin, seedEmployee, petLogin, uploadDir,
} from './pet-helpers.js';

const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

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

before(async () => { await startTestServer(); });
after(async () => { await stopTestServer(); });

test('sync: queued student registration is idempotent — replays never duplicate', async () => {
  await setup();
  const school = await client.post('/api/schools', { name: 'Sync School' }, { token: worker.access_token });

  const op = {
    idempotency_key: 'queue-7f91-student-1',
    type: 'student.register',
    payload: { name: 'Offline Kid', parent_phone: '9000000030', school_id: school.body.school.id },
  };
  const first = await client.post('/api/sync', { operations: [op] }, { token: worker.access_token });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.results[0].status, 'ok');
  assert.equal(first.body.results[0].deduplicated, false);
  const originalId = first.body.results[0].result.id;
  assert.match(first.body.results[0].result.pet_student_id, /^PET-/);

  // Retried (connectivity flap) — original result returned, no second record.
  const replay = await client.post('/api/sync', { operations: [op] }, { token: worker.access_token });
  assert.equal(replay.body.results[0].deduplicated, true);
  assert.equal(replay.body.results[0].result.id, originalId);
  assert.equal(petDb().prepare('SELECT COUNT(*) AS c FROM students').get().c, 1);
});

test('sync: visit + attendance + task batch works end-to-end without duplicates', async () => {
  await setup();
  const school = await client.post('/api/schools', { name: 'Batch School' }, { token: worker.access_token });

  const ops = [
    { idempotency_key: 'batch-checkin-1', type: 'attendance.check_in', payload: {} },
    { idempotency_key: 'batch-visit-1', type: 'visit.start', payload: { school_id: school.body.school.id, purpose: 'Offline survey' } },
  ];
  const res1 = await client.post('/api/sync', { operations: ops }, { token: worker.access_token });
  assert.equal(res1.status, 200);
  assert.ok(res1.body.results.every(r => r.status === 'ok'), JSON.stringify(res1.body));
  const visitId = res1.body.results[1].result.id;

  // Full replay returns originals.
  const res2 = await client.post('/api/sync', { operations: ops }, { token: worker.access_token });
  assert.ok(res2.body.results.every(r => r.deduplicated === true));

  const day = new Date().toISOString().slice(0, 10);
  const att = petDb().prepare('SELECT COUNT(*) AS c FROM employee_attendance WHERE employee_id = ? AND date = ?')
    .get(worker.user.id, day).c;
  assert.equal(att, 1);
  assert.equal(petDb().prepare(`SELECT COUNT(*) AS c FROM field_visits WHERE status = 'active'`).get().c, 1);

  // Unknown operations fail without breaking the batch.
  const mixed = await client.post('/api/sync', {
    operations: [
      { idempotency_key: 'unknown-op-1', type: 'teleport.to_school', payload: {} },
      { idempotency_key: 'batch-end-1', type: 'visit.end', payload: { visit_id: visitId, report: 'done' } },
    ],
  }, { token: worker.access_token });
  assert.equal(mixed.body.results[0].status, 'error');
  assert.equal(mixed.body.results[0].code, 'UNKNOWN_OPERATION');
  assert.equal(mixed.body.results[1].status, 'ok');
});

test('website forms: public intake → admin queue → assign → convert', async () => {
  await setup();
  // Public endpoint: no auth required.
  const pub = await client.post('/api/public/forms', {
    form_type: 'student_registration',
    name: 'Website Student', phone: '9888877777', email: 'parent@example.com',
    payload: {
      parent_name: 'Web Parent', current_class: '7', district: 'Jaunpur',
      school_name: 'Web Public School', gender: 'female',
    },
  });
  assert.equal(pub.status, 201, JSON.stringify(pub.body));

  // Public endpoints never expose private records.
  const listPublic = await client.get('/api/website-forms');
  assert.equal(listPublic.status, 401);

  // Admin sees the queue; admin got a notification.
  const queue = await client.get('/api/website-forms?status=new', { token: admin.access_token });
  assert.equal(queue.status, 200);
  assert.equal(queue.body.total, 1);
  const form = queue.body.submissions[0];
  assert.equal(form.payload.parent_name, 'Web Parent');
  const notif = await client.get('/api/me/notifications', { token: admin.access_token });
  assert.ok(notif.body.notifications.some(n => n.link_id === form.id));

  // Assign to the employee.
  const assign = await client.post(`/api/website-forms/${form.id}/assign`, { assigned_to_user_id: workerId }, { token: admin.access_token });
  assert.equal(assign.status, 200);
  assert.equal(assign.body.submission.assigned_to_user_name, 'Field Employee');

  // Assignee gets notified and moves it in_progress.
  const empNotif = await client.get('/api/me/notifications', { token: worker.access_token });
  assert.ok(empNotif.body.notifications.some(n => n.link_id === form.id));
  const prog = await client.post(`/api/website-forms/${form.id}/status`, { status: 'in_progress' }, { token: worker.access_token });
  assert.equal(prog.status, 200);

  // Convert → real student with website_form source, linked back.
  const convert = await client.post(`/api/website-forms/${form.id}/convert`, {}, { token: admin.access_token });
  assert.equal(convert.status, 200, JSON.stringify(convert.body));
  assert.match(convert.body.student.pet_student_id, /^PET-/);
  assert.equal(convert.body.student.registration_source, 'website_form');
  assert.equal(convert.body.form.status, 'converted');
  assert.equal(convert.body.form.converted_student_id, convert.body.student.id);

  // Second conversion is rejected.
  const again = await client.post(`/api/website-forms/${form.id}/convert`, {}, { token: admin.access_token });
  assert.equal(again.status, 409);
});

test('website forms: validation rejects malformed public submissions', async () => {
  await setup();
  const bad = await client.post('/api/public/forms', { form_type: 'ransom', name: 'X', phone: '1' });
  assert.equal(bad.status, 400);
  const noPhone = await client.post('/api/public/forms', { form_type: 'enquiry', name: 'Valid Name' });
  assert.equal(noPhone.status, 400);
});

test('uploads: validated type/size/content; stored outside the database', async () => {
  await setup();
  const up = await client.post('/api/uploads', {
    category: 'students', fileName: 'pic.png', mimeType: 'image/png', dataBase64: PNG_1PX,
  }, { token: worker.access_token });
  assert.equal(up.status, 201, JSON.stringify(up.body));
  assert.match(up.body.relative_path, /^students\//);
  const abs = path.join(uploadDir(), up.body.relative_path);
  assert.ok(fs.existsSync(abs), 'file exists on disk under upload root');

  // No client-controlled names: server generated a random safe name.
  assert.ok(!up.body.relative_path.includes('pic.png'));

  // Disguised content is rejected (declared png, actually text).
  const fake = await client.post('/api/uploads', {
    category: 'students', fileName: 'evil.png', mimeType: 'image/png',
    dataBase64: Buffer.from('<script>alert(1)</script>'.repeat(4)).toString('base64'),
  }, { token: worker.access_token });
  assert.equal(fake.status, 400);
  assert.equal(fake.body.error.code, 'CONTENT_MISMATCH');

  // Disallowed extension.
  const exe = await client.post('/api/uploads', {
    category: 'documents', fileName: 'evil.exe', mimeType: 'application/octet-stream',
    dataBase64: Buffer.from('MZ90fakebinary0000').toString('base64'),
  }, { token: worker.access_token });
  assert.equal(exe.status, 400);

  // Bad category (path traversal attempts) rejected.
  const trav = await client.post('/api/uploads', {
    category: '../../etc', fileName: 'x.png', mimeType: 'image/png', dataBase64: PNG_1PX,
  }, { token: worker.access_token });
  assert.equal(trav.status, 400);

  // Unauthenticated never works.
  const anon = await client.post('/api/uploads', { category: 'students', fileName: 'x.png', dataBase64: PNG_1PX });
  assert.equal(anon.status, 401);
});

test('files: reads require auth; path traversal contained; content served', async () => {
  await setup();
  const up = await client.post('/api/uploads', {
    category: 'students', fileName: 'pic.png', mimeType: 'image/png', dataBase64: PNG_1PX,
  }, { token: worker.access_token });
  const rel = up.body.relative_path;

  const anon = await client.get(`/api/files/${rel}`);
  assert.equal(anon.status, 401);

  const okRead = await client.raw('GET', `/api/files/${rel}`, { token: worker.access_token });
  assert.equal(okRead.status, 200);
  assert.match(okRead.headers.get('content-type') || '', /image\/png/);

  const trav = await client.get('/api/files/..%2F..%2Fserver%2Fsrc%2Fconfig.js', { token: worker.access_token });
  assert.ok([400, 404].includes(trav.status), `traversal contained (${trav.status})`);
});

test('field media metadata links visits + uploads; student documents tracked', async () => {
  await setup();
  const school = await client.post('/api/schools', { name: 'Media School' }, { token: worker.access_token });
  const visit = await client.post('/api/field-visits/start', { school_id: school.body.school.id }, { token: worker.access_token });
  const up = await client.post('/api/uploads', {
    category: 'field-visits', fileName: 'survey.png', mimeType: 'image/png', dataBase64: PNG_1PX,
  }, { token: worker.access_token });

  const media = await client.post('/api/media/field', {
    visit_id: visit.body.visit.id, type: 'photo', relative_path: up.body.relative_path,
    original_name: 'survey.png', caption: 'Classroom block',
  }, { token: worker.access_token });
  assert.equal(media.status, 201, JSON.stringify(media.body));
  assert.equal(media.body.media.school_id, school.body.school.id);

  // Student document attachment.
  const stu = await client.post('/api/students', { name: 'Doc Kid', parent_phone: '9000000031' }, { token: worker.access_token });
  const doc = await client.post('/api/media/student', {
    student_id: stu.body.student.id, relative_path: up.body.relative_path, type: 'document',
  }, { token: worker.access_token });
  assert.equal(doc.status, 201);

  const profile = await client.get(`/api/students/${stu.body.student.id}/profile`, { token: worker.access_token });
  assert.equal(profile.body.documents.length, 1);

  // Dangling metadata is rejected (file must exist).
  const dangling = await client.post('/api/media/field', {
    visit_id: visit.body.visit.id, relative_path: 'field-visits/2026-09/ghost.png',
  }, { token: worker.access_token });
  assert.equal(dangling.status, 404);
});

test('media on another employee\'s visit is rejected', async () => {
  await setup();
  const w2 = seedEmployee({ email: 'worker2@pet.test' });
  const worker2 = (await petLogin(client, 'worker2@pet.test', 'EmpPass-12345')).body;
  const school = await client.post('/api/schools', { name: 'Guard School' }, { token: worker.access_token });
  const visit = await client.post('/api/field-visits/start', { school_id: school.body.school.id }, { token: worker.access_token });
  const up = await client.post('/api/uploads', {
    category: 'field-visits', fileName: 'survey.png', mimeType: 'image/png', dataBase64: PNG_1PX,
  }, { token: worker2.access_token });

  const res = await client.post('/api/media/field', {
    visit_id: visit.body.visit.id, relative_path: up.body.relative_path,
  }, { token: worker2.access_token });
  assert.equal(res.status, 403);
});

test('activity feed is admin-only and records the audit trail', async () => {
  await setup();
  await client.post('/api/students', { name: 'Audit Kid', parent_phone: '9000000032' }, { token: worker.access_token });

  const deny = await client.get('/api/activity', { token: worker.access_token });
  assert.equal(deny.status, 403);

  const feed = await client.get('/api/activity', { token: admin.access_token });
  assert.equal(feed.status, 200);
  assert.ok(feed.body.activity.some(a => a.action === 'PET_STUDENT_REGISTERED'));
  // Secrets never appear in the feed.
  assert.ok(!JSON.stringify(feed.body).includes('EmpPass-12345'));
});
