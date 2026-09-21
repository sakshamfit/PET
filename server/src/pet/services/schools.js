/**
 * School directory service — schools are first-class PET records.
 * Employees may create/enrich schools in the field (they discover them);
 * Main Admin has full control. All writes are audited.
 */

import { getPetDb } from '../db.js';
import { ApiError, errors } from '../../lib/respond.js';
import { petAudit, PET_AUDIT } from '../audit.js';
import { newId, now, nextSchoolCode, paging, likeEscape } from './common.js';

const UPDATABLE = [
  'name', 'address', 'locality', 'city', 'district', 'state', 'phone',
  'contact_person_name', 'contact_person_phone', 'latitude', 'longitude', 'notes',
];

export function getSchool(id) {
  return getPetDb().prepare('SELECT * FROM schools WHERE id = ?').get(id);
}

export function listSchools(query = {}) {
  const db = getPetDb();
  const { limit, offset } = paging(query);
  const where = ['1=1'];
  const params = {};
  if (query.status && ['active', 'archived'].includes(query.status)) {
    where.push('status = @status');
    params.status = query.status;
  } else {
    where.push(`status = 'active'`);
  }
  if (query.q) {
    where.push(
      `(name LIKE @q ESCAPE '\\' OR school_code LIKE @q ESCAPE '\\' OR locality LIKE @q ESCAPE '\\'
        OR city LIKE @q ESCAPE '\\' OR district LIKE @q ESCAPE '\\' OR contact_person_name LIKE @q ESCAPE '\\')`
    );
    params.q = `%${likeEscape(query.q)}%`;
  }
  const base = `FROM schools WHERE ${where.join(' AND ')}`;
  const rows = db
    .prepare(`SELECT * ${base} ORDER BY name COLLATE NOCASE LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit, offset });
  const { c } = db.prepare(`SELECT COUNT(*) AS c ${base}`).get(params);
  return { schools: rows, total: c, limit, offset };
}

export function createSchool(actor, input, ip = '') {
  const db = getPetDb();
  const id = newId('sch');
  const ts = now();
  db.prepare(
    `INSERT INTO schools (id, school_code, name, address, locality, city, district, state, phone,
        contact_person_name, contact_person_phone, latitude, longitude, status, notes,
        created_by_user_id, created_at, updated_at)
     VALUES (@id, @code, @name, @address, @locality, @city, @district, @state, @phone,
        @contact_person_name, @contact_person_phone, @latitude, @longitude, 'active', @notes,
        @created_by, @ts, @ts)`
  ).run({
    id,
    code: nextSchoolCode(db),
    name: input.name,
    address: input.address || null,
    locality: input.locality || null,
    city: input.city || null,
    district: input.district || null,
    state: input.state || null,
    phone: input.phone || null,
    contact_person_name: input.contact_person_name || null,
    contact_person_phone: input.contact_person_phone || null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    notes: input.notes || null,
    created_by: actor.id,
    ts,
  });
  petAudit({
    actorType: actor.role,
    actorId: actor.id,
    actorLabel: actor.name,
    action: PET_AUDIT.SCHOOL_CREATED,
    targetType: 'school',
    targetId: id,
    metadata: { name: input.name },
    ip,
  });
  return getSchool(id);
}

export function updateSchool(actor, id, input, ip = '') {
  const db = getPetDb();
  const school = getSchool(id);
  if (!school) throw errors.notFound('School not found.');

  const sets = [];
  const params = { id, ts: now() };
  for (const field of UPDATABLE) {
    if (input[field] !== undefined) {
      sets.push(`${field} = @${field}`);
      params[field] = input[field];
    }
  }
  if (sets.length === 0) throw new ApiError(400, 'VALIDATION_ERROR', 'No updatable fields supplied.');
  db.prepare(`UPDATE schools SET ${sets.join(', ')}, updated_at = @ts WHERE id = @id`).run(params);
  petAudit({
    actorType: actor.role,
    actorId: actor.id,
    actorLabel: actor.name,
    action: PET_AUDIT.SCHOOL_UPDATED,
    targetType: 'school',
    targetId: id,
    metadata: { changed_keys: Object.keys(input) },
    ip,
  });
  return getSchool(id);
}

/** Archive (never hard-delete) — Main Admin only. */
export function archiveSchool(actor, id, ip = '') {
  const db = getPetDb();
  const school = getSchool(id);
  if (!school) throw errors.notFound('School not found.');
  db.prepare(`UPDATE schools SET status = 'archived', updated_at = ? WHERE id = ?`).run(now(), id);
  petAudit({
    actorType: actor.role,
    actorId: actor.id,
    actorLabel: actor.name,
    action: PET_AUDIT.SCHOOL_ARCHIVED,
    targetType: 'school',
    targetId: id,
    ip,
  });
  return getSchool(id);
}

/** Canonical school profile: overview + visits + students + media + tasks. */
export function getSchoolProfile(id) {
  const db = getPetDb();
  const school = getSchool(id);
  if (!school) throw errors.notFound('School not found.');

  const visits = db
    .prepare('SELECT * FROM field_visits WHERE school_id = ? ORDER BY started_at DESC LIMIT 100')
    .all(id);
  const visitors = db
    .prepare(
      `SELECT employee_id, employee_name, COUNT(*) AS visit_count, MAX(started_at) AS last_visit_at
       FROM field_visits WHERE school_id = ? GROUP BY employee_id ORDER BY last_visit_at DESC`
    )
    .all(id);
  const students = db
    .prepare('SELECT id, pet_student_id, name, status, current_class, created_at FROM students WHERE school_id = ? ORDER BY created_at DESC LIMIT 200')
    .all(id);
  const pipeline = db
    .prepare('SELECT status, COUNT(*) AS count FROM students WHERE school_id = ? GROUP BY status')
    .all(id);
  const media = db
    .prepare('SELECT * FROM field_media WHERE school_id = ? ORDER BY created_at DESC LIMIT 200')
    .all(id);
  const tasks = db
    .prepare('SELECT * FROM tasks WHERE school_id = ? ORDER BY created_at DESC LIMIT 100')
    .all(id);
  const surveyReports = visits
    .filter(v => v.report)
    .map(v => ({
      visit_id: v.id,
      employee_name: v.employee_name,
      started_at: v.started_at,
      ended_at: v.ended_at,
      report: v.report,
      students_contacted: v.students_contacted,
      students_registered: v.students_registered,
      documents_collected: v.documents_collected,
    }));

  return { school, visits, visitors, students, pipeline, media, tasks, survey_reports: surveyReports };
}
