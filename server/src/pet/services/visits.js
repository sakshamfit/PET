/**
 * Field visits service — the core field-operations workflow.
 *
 * Start Visit → (register students / upload media / notes / tasks) →
 * Submit Visit Report → End Visit.
 * Location is optional and event-based only (start/end). No background GPS.
 */

import { getPetDb } from '../db.js';
import { ApiError, errors } from '../../lib/respond.js';
import { petAudit, PET_AUDIT } from '../audit.js';
import { newId, now, paging } from './common.js';

export function getVisit(id) {
  return getPetDb().prepare('SELECT * FROM field_visits WHERE id = ?').get(id);
}

export function listVisits(actor, query = {}) {
  const db = getPetDb();
  const { limit, offset } = paging(query);
  const where = ['1=1'];
  const params = {};
  // Employees see their own visits; Main Admin sees all (optionally filtered).
  if (actor.role !== 'main_admin') {
    where.push('employee_id = @actor');
    params.actor = actor.id;
  } else if (query.employee_id) {
    where.push('employee_id = @employee_id');
    params.employee_id = query.employee_id;
  }
  if (query.school_id) {
    where.push('school_id = @school_id');
    params.school_id = query.school_id;
  }
  if (query.status && ['active', 'completed', 'cancelled'].includes(query.status)) {
    where.push('status = @status');
    params.status = query.status;
  }
  const base = `FROM field_visits WHERE ${where.join(' AND ')}`;
  const rows = db
    .prepare(`SELECT * ${base} ORDER BY started_at DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit, offset });
  const { c } = db.prepare(`SELECT COUNT(*) AS c ${base}`).get(params);
  return { visits: rows, total: c, limit, offset };
}

/** Start a visit. An employee may only have ONE active visit at a time. */
export function startVisit(actor, input, ip = '') {
  const db = getPetDb();
  const school = db.prepare('SELECT * FROM schools WHERE id = ?').get(input.school_id);
  if (!school) throw errors.notFound('School not found.');
  if (school.status !== 'active') throw errors.conflict('SCHOOL_ARCHIVED', 'This school is archived.');

  const open = db
    .prepare(`SELECT id FROM field_visits WHERE employee_id = ? AND status = 'active'`)
    .get(actor.id);
  if (open) {
    throw errors.conflict(
      'VISIT_ALREADY_ACTIVE',
      'You already have an active visit. End it before starting another.'
    );
  }

  const id = newId('vis');
  const ts = now();
  db.prepare(
    `INSERT INTO field_visits (id, school_id, school_name, employee_id, employee_name, purpose,
        status, started_at, start_latitude, start_longitude, created_at, updated_at)
     VALUES (@id, @school_id, @school_name, @employee_id, @employee_name, @purpose,
        'active', @ts, @lat, @lng, @ts, @ts)`
  ).run({
    id,
    school_id: school.id,
    school_name: school.name,
    employee_id: actor.id,
    employee_name: actor.name,
    purpose: input.purpose || null,
    ts,
    lat: input.latitude ?? null,
    lng: input.longitude ?? null,
  });
  petAudit({
    actorType: actor.role,
    actorId: actor.id,
    actorLabel: actor.name,
    action: PET_AUDIT.VISIT_STARTED,
    targetType: 'field_visit',
    targetId: id,
    metadata: { school: school.name },
    ip,
  });
  return getVisit(id);
}

/** Update notes/counters while the visit is active (owner or admin). */
export function updateVisit(actor, id, input, ip = '') {
  const db = getPetDb();
  const visit = getVisit(id);
  if (!visit) throw errors.notFound('Visit not found.');
  if (actor.role !== 'main_admin' && visit.employee_id !== actor.id) {
    throw errors.forbidden('FORBIDDEN', 'You can only update your own visits.');
  }
  if (visit.status !== 'active') {
    throw errors.conflict('VISIT_CLOSED', 'Only an active visit can be updated.');
  }
  const sets = [];
  const params = { id, ts: now() };
  for (const f of ['purpose', 'notes', 'report', 'students_contacted', 'documents_collected']) {
    if (input[f] !== undefined) {
      sets.push(`${f} = @${f}`);
      params[f] = input[f];
    }
  }
  if (sets.length === 0) throw new ApiError(400, 'VALIDATION_ERROR', 'No updatable fields supplied.');
  db.prepare(`UPDATE field_visits SET ${sets.join(', ')}, updated_at = @ts WHERE id = @id`).run(params);
  return getVisit(id);
}

/** End the visit: optional report + event-based end location. Transactional. */
export function endVisit(actor, id, input, ip = '') {
  const db = getPetDb();
  const visit = getVisit(id);
  if (!visit) throw errors.notFound('Visit not found.');
  if (actor.role !== 'main_admin' && visit.employee_id !== actor.id) {
    throw errors.forbidden('FORBIDDEN', 'You can only end your own visits.');
  }
  if (visit.status !== 'active') {
    throw errors.conflict('VISIT_CLOSED', 'This visit is already closed.');
  }
  const ts = now();
  const close = db.transaction(() => {
    db.prepare(
      `UPDATE field_visits SET status = 'completed', ended_at = @ts, end_latitude = @lat,
         end_longitude = @lng,
         report = COALESCE(@report, report), notes = COALESCE(@notes, notes),
         students_contacted = COALESCE(@contacted, students_contacted),
         documents_collected = COALESCE(@docs, documents_collected),
         updated_at = @ts
       WHERE id = @id`
    ).run({
      id,
      ts,
      lat: input.latitude ?? null,
      lng: input.longitude ?? null,
      report: input.report ?? null,
      notes: input.notes ?? null,
      contacted: input.students_contacted ?? null,
      docs: input.documents_collected ?? null,
    });
  });
  close();
  petAudit({
    actorType: actor.role,
    actorId: actor.id,
    actorLabel: actor.name,
    action: PET_AUDIT.VISIT_ENDED,
    targetType: 'field_visit',
    targetId: id,
    metadata: { school: visit.school_name },
    ip,
  });
  return getVisit(id);
}

/** Visit detail: visit + media + students registered during it + linked tasks. */
export function getVisitDetail(actor, id) {
  const db = getPetDb();
  const visit = getVisit(id);
  if (!visit) throw errors.notFound('Visit not found.');
  if (actor.role !== 'main_admin' && visit.employee_id !== actor.id) {
    throw errors.forbidden('FORBIDDEN', 'You can only view your own visits.');
  }
  const media = db.prepare('SELECT * FROM field_media WHERE visit_id = ? ORDER BY created_at ASC').all(id);
  const students = db
    .prepare('SELECT id, pet_student_id, name, status, current_class, created_at FROM students WHERE registered_visit_id = ? ORDER BY created_at ASC')
    .all(id);
  const tasks = db.prepare('SELECT * FROM tasks WHERE visit_id = ? ORDER BY created_at ASC').all(id);
  return { visit, media, students, tasks };
}
