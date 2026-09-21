/**
 * Website forms service — public intake from the PET website.
 *
 * Public endpoint validates + rate-limits submissions; the admin queue is
 * private. Assignee follow-up converts a student_registration submission
 * into a canonical student through the registration service (single
 * transaction, registration_source = 'website_form').
 * Public endpoints NEVER expose private records.
 */

import { getPetDb } from '../db.js';
import { ApiError, errors } from '../../lib/respond.js';
import { petAudit, PET_AUDIT } from '../audit.js';
import { newId, now, paging, notify } from './common.js';
import { registerStudent } from './students.js';

export const FORM_TYPES = ['student_registration', 'enquiry', 'volunteer', 'school_partnership', 'contact'];

export function createSubmission(input, ip = '') {
  const db = getPetDb();
  const id = newId('wfs');
  const ts = now();
  db.prepare(
    `INSERT INTO website_form_submissions (id, form_type, name, phone, email, payload_json, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'new', ?, ?)`
  ).run(id, input.form_type, input.name, input.phone, input.email || null,
    input.payload ? JSON.stringify(input.payload) : null, ts, ts);
  petAudit({
    actorType: 'system', actorLabel: 'website',
    action: PET_AUDIT.WEBSITE_FORM_RECEIVED, targetType: 'website_form', targetId: id,
    metadata: { form_type: input.form_type }, ip,
  });
  // Notify every Main Admin that a new submission arrived.
  for (const admin of db.prepare(`SELECT id FROM users WHERE role = 'main_admin' AND status = 'ACTIVE'`).all()) {
    notify(admin.id, {
      title: 'New website form',
      message: `${input.form_type.replaceAll('_', ' ')} from ${input.name} (${input.phone})`,
      type: 'website_form', linkType: 'website_form', linkId: id,
    });
  }
  return { id, received: true };
}

export function listSubmissions(query = {}) {
  const db = getPetDb();
  const { limit, offset } = paging(query);
  const where = ['1=1'];
  const params = {};
  if (query.status && ['new', 'assigned', 'in_progress', 'converted', 'closed'].includes(query.status)) {
    where.push('f.status = @status');
    params.status = query.status;
  }
  if (query.form_type && FORM_TYPES.includes(query.form_type)) {
    where.push('f.form_type = @form_type');
    params.form_type = query.form_type;
  }
  if (query.assigned_to) {
    where.push('f.assigned_to_user_id = @assigned_to');
    params.assigned_to = query.assigned_to;
  }
  const base = `FROM website_form_submissions f WHERE ${where.join(' AND ')}`;
  const rows = db.prepare(`SELECT f.* ${base} ORDER BY f.created_at DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit, offset });
  const { c } = db.prepare(`SELECT COUNT(*) AS c ${base}`).get(params);
  return { submissions: rows.map(r => ({ ...r, payload: r.payload_json ? JSON.parse(r.payload_json) : null, payload_json: undefined })), total: c, limit, offset };
}

/** Assign a submission to an employee for follow-up (Main Admin). */
export function assignSubmission(actor, id, assigneeId, ip = '') {
  const db = getPetDb();
  const form = db.prepare('SELECT * FROM website_form_submissions WHERE id = ?').get(id);
  if (!form) throw errors.notFound('Submission not found.');
  const assignee = db.prepare(`SELECT * FROM users WHERE id = ? AND status = 'ACTIVE'`).get(assigneeId);
  if (!assignee) throw errors.notFound('Employee not found or inactive.');
  db.prepare(
    `UPDATE website_form_submissions SET status = 'assigned', assigned_to_user_id = ?, assigned_to_user_name = ?, updated_at = ? WHERE id = ?`
  ).run(assignee.id, assignee.name, now(), id);
  notify(assignee.id, {
    title: 'Website form assigned',
    message: `${form.form_type.replaceAll('_', ' ')} from ${form.name} needs follow-up.`,
    type: 'website_form', linkType: 'website_form', linkId: id,
  });
  petAudit({
    actorType: actor.role, actorId: actor.id, actorLabel: actor.name,
    action: PET_AUDIT.WEBSITE_FORM_ASSIGNED, targetType: 'website_form', targetId: id,
    metadata: { assignee: assignee.name }, ip,
  });
  return db.prepare('SELECT * FROM website_form_submissions WHERE id = ?').get(id);
}

export function updateSubmissionStatus(actor, id, status, ip = '') {
  const db = getPetDb();
  const form = db.prepare('SELECT * FROM website_form_submissions WHERE id = ?').get(id);
  if (!form) throw errors.notFound('Submission not found.');
  if (!['in_progress', 'closed'].includes(status)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'status must be in_progress or closed.');
  }
  // Assignee or admin may progress it.
  if (actor.role !== 'main_admin' && form.assigned_to_user_id !== actor.id) {
    throw errors.forbidden('FORBIDDEN', 'Only the assignee or Main Admin can update this submission.');
  }
  db.prepare('UPDATE website_form_submissions SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), id);
  petAudit({
    actorType: actor.role, actorId: actor.id, actorLabel: actor.name,
    action: PET_AUDIT.WEBSITE_FORM_CLOSED, targetType: 'website_form', targetId: id,
    metadata: { status }, ip,
  });
  return db.prepare('SELECT * FROM website_form_submissions WHERE id = ?').get(id);
}

/**
 * Convert a student_registration submission into a canonical student.
 * The payload carries the same fields as field registration; the conversion
 * reuses registerStudent so PET ID generation, duplicate protection and
 * status history behave identically.
 */
export function convertSubmission(actor, id, { overrides = {}, acknowledge_duplicates = false } = {}, ip = '') {
  const db = getPetDb();
  const form = db.prepare('SELECT * FROM website_form_submissions WHERE id = ?').get(id);
  if (!form) throw errors.notFound('Submission not found.');
  if (form.status === 'converted') {
    throw errors.conflict('ALREADY_CONVERTED', 'This submission was already converted.');
  }
  const payload = form.payload_json ? JSON.parse(form.payload_json) : {};
  const input = {
    ...payload,
    ...overrides,
    name: overrides.name || payload.name || form.name,
    parent_phone: overrides.parent_phone || payload.parent_phone || form.phone,
    email: undefined,
    registration_source: 'website_form',
    intake_id: form.id,
    acknowledge_duplicates,
  };
  const { student, duplicates } = registerStudent(actor, input, ip);
  db.prepare(
    `UPDATE website_form_submissions SET status = 'converted', converted_student_id = ?, updated_at = ? WHERE id = ?`
  ).run(student.id, now(), id);
  petAudit({
    actorType: actor.role, actorId: actor.id, actorLabel: actor.name,
    action: PET_AUDIT.WEBSITE_FORM_CONVERTED, targetType: 'website_form', targetId: id,
    metadata: { student_id: student.id, pet_student_id: student.pet_student_id }, ip,
  });
  return { form: db.prepare('SELECT * FROM website_form_submissions WHERE id = ?').get(id), student, duplicates };
}
