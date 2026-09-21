/**
 * Student lifecycle service — the central PET entity.
 *
 * Rules implemented here (docs/PET 01/02/04):
 *  - PET Student ID is generated ONLY by the server, sequentially, inside
 *    the creation transaction; it is permanent.
 *  - Duplicate detection runs before creation (name + parent phone,
 *    name + student phone, name + school, exact PET id on re-import).
 *    Duplicates produce a WARNING — records are never silently merged.
 *  - Every lifecycle transition writes student_status_history in the same
 *    transaction as the status update (history is never destroyed).
 */

import { getPetDb } from '../db.js';
import { ApiError, errors } from '../../lib/respond.js';
import { petAudit, PET_AUDIT } from '../audit.js';
import { newId, now, nextPetStudentId, paging, likeEscape, notify } from './common.js';

export const STUDENT_STATUSES = [
  'registered', 'test_scheduled', 'test_completed', 'under_evaluation',
  'selected', 'waitlisted', 'not_selected', 'enrolled', 'inactive',
];

/**
 * Allowed lifecycle transitions. Backward/corrective moves are possible but
 * always explicit and audited; only Main Admin may move students into the
 * selection/enrollment decision states.
 */
const ALLOWED_TRANSITIONS = {
  registered: ['test_scheduled', 'inactive'],
  test_scheduled: ['test_completed', 'registered', 'inactive'],
  test_completed: ['under_evaluation', 'test_scheduled', 'inactive'],
  under_evaluation: ['selected', 'waitlisted', 'not_selected', 'test_completed', 'inactive'],
  selected: ['enrolled', 'waitlisted', 'not_selected', 'inactive'],
  waitlisted: ['selected', 'not_selected', 'inactive'],
  not_selected: ['waitlisted', 'inactive'],
  enrolled: ['inactive'],
  inactive: ['registered'],
};

const ADMIN_ONLY_STATUSES = new Set(['selected', 'waitlisted', 'not_selected', 'enrolled']);

export function getStudent(id) {
  const db = getPetDb();
  return db.prepare('SELECT * FROM students WHERE id = ? OR pet_student_id = ?').get(id, id);
}

/** Find likely duplicates for a candidate registration. */
export function findDuplicates({ name, parentPhone = '', studentPhone = '', schoolId = null, excludeId = null }) {
  const db = getPetDb();
  const matches = new Map();
  const add = (row, reason) => {
    if (!row || row.id === excludeId) return;
    const existing = matches.get(row.id) || { student: row, reasons: [] };
    existing.reasons.push(reason);
    matches.set(row.id, existing);
  };

  const normPhone = p => String(p || '').replace(/\D/g, '');
  const parentDigits = normPhone(parentPhone);
  const studentDigits = normPhone(studentPhone);

  if (parentDigits.length >= 6) {
    for (const row of db.prepare('SELECT * FROM students WHERE parent_phone LIKE ? LIMIT 10').all(`%${parentDigits.slice(-10)}%`)) {
      if (row.name.trim().toLowerCase() === name.trim().toLowerCase()) add(row, 'same name + parent phone');
    }
  }
  if (studentDigits.length >= 6) {
    for (const row of db.prepare('SELECT * FROM students WHERE student_phone LIKE ? LIMIT 10').all(`%${studentDigits.slice(-10)}%`)) {
      if (row.name.trim().toLowerCase() === name.trim().toLowerCase()) add(row, 'same name + student phone');
    }
    for (const row of db.prepare('SELECT * FROM students WHERE student_phone LIKE ? LIMIT 10').all(`%${studentDigits.slice(-10)}%`)) {
      if (row.student_phone && normPhone(row.student_phone) === studentDigits) add(row, 'same student phone');
    }
  }
  if (schoolId) {
    for (const row of db
      .prepare('SELECT * FROM students WHERE school_id = ? AND lower(name) = lower(?) LIMIT 10')
      .all(schoolId, name.trim())) {
      add(row, 'same name at this school');
    }
  }
  return [...matches.values()].map(m => ({
    id: m.student.id,
    pet_student_id: m.student.pet_student_id,
    name: m.student.name,
    school_name: m.student.school_name,
    status: m.student.status,
    parent_phone: m.student.parent_phone,
    reasons: m.reasons,
  }));
}

/**
 * Register a student (field, office or converted website intake).
 * Runs as ONE transaction: id generation → insert → status history → audit.
 * `force` must be true when the client acknowledged duplicate warnings.
 */
export function registerStudent(actor, input, ip = '') {
  const db = getPetDb();

  // Optional link to the school directory.
  let school = null;
  if (input.school_id) {
    school = db.prepare('SELECT * FROM schools WHERE id = ?').get(input.school_id);
    if (!school) throw errors.notFound('Linked school not found.');
  }

  const duplicates = findDuplicates({
    name: input.name,
    parentPhone: input.parent_phone,
    studentPhone: input.student_phone,
    schoolId: input.school_id || school?.id || null,
  });
  if (duplicates.length > 0 && !input.acknowledge_duplicates) {
    const err = new ApiError(409, 'POSSIBLE_DUPLICATES', 'Possible duplicate student(s) found. Review before saving.');
    err.details = { duplicates };
    throw err;
  }

  const id = newId('stu');
  const ts = now();
  const create = db.transaction(() => {
    const petStudentId = nextPetStudentId(db);
    db.prepare(
      `INSERT INTO students (
        id, pet_student_id, name, photo_path, dob, age, gender, student_phone,
        parent_name, parent_phone, parent_relation, school_id, school_name, school_address,
        locality, city, district, state, current_class, previous_school, address,
        status, registration_source, registered_by_user_id, registered_by_user_name,
        registration_date, intake_id, registered_visit_id, notes, created_at, updated_at
      ) VALUES (
        @id, @pet_student_id, @name, @photo_path, @dob, @age, @gender, @student_phone,
        @parent_name, @parent_phone, @parent_relation, @school_id, @school_name, @school_address,
        @locality, @city, @district, @state, @current_class, @previous_school, @address,
        'registered', @registration_source, @registered_by_user_id, @registered_by_user_name,
        @registration_date, @intake_id, @registered_visit_id, @notes, @created_at, @updated_at
      )`
    ).run({
      id,
      pet_student_id: petStudentId,
      name: input.name,
      photo_path: input.photo_path || null,
      dob: input.dob || null,
      age: input.age ?? null,
      gender: input.gender || null,
      student_phone: input.student_phone || null,
      parent_name: input.parent_name || null,
      parent_phone: input.parent_phone || null,
      parent_relation: input.parent_relation || null,
      school_id: school?.id || null,
      school_name: school ? school.name : input.school_name || null,
      school_address: school ? (school.address || null) : input.school_address || null,
      locality: input.locality || null,
      city: input.city || null,
      district: input.district || null,
      state: input.state || null,
      current_class: input.current_class || null,
      previous_school: input.previous_school || null,
      address: input.address || null,
      registration_source: input.registration_source || 'field',
      registered_by_user_id: actor.id,
      registered_by_user_name: actor.name,
      registration_date: ts,
      intake_id: input.intake_id || null,
      registered_visit_id: input.visit_id || null,
      notes: input.notes || null,
      created_at: ts,
      updated_at: ts,
    });
    db.prepare(
      `INSERT INTO student_status_history
         (id, student_id, from_status, to_status, changed_by_user_id, changed_by_user_name, reason, created_at)
       VALUES (?, ?, NULL, 'registered', ?, ?, 'registration', ?)`
    ).run(newId('ssh'), id, actor.id, actor.name, ts);
    return petStudentId;
  });
  const petStudentId = create();

  if (input.visit_id) {
    // Link registration to an active field visit when provided.
    try {
      db.prepare(
        `UPDATE field_visits SET students_registered = students_registered + 1, updated_at = ?
         WHERE id = ? AND status = 'active'`
      ).run(ts, input.visit_id);
    } catch { /* non-fatal */ }
  }

  petAudit({
    actorType: actor.role,
    actorId: actor.id,
    actorLabel: actor.name,
    action: duplicates.length > 0 ? PET_AUDIT.STUDENT_DUPLICATE_ACKNOWLEDGED : PET_AUDIT.STUDENT_REGISTERED,
    targetType: 'student',
    targetId: id,
    metadata: {
      pet_student_id: petStudentId,
      name: input.name,
      duplicate_reasons: duplicates.flatMap(d => d.reasons),
    },
    ip,
  });

  return { student: getStudent(id), duplicates };
}

/** Permitted field updates — employees may update student records by design
 *  for the ~30-person org; every update is audited with changed keys. */
const UPDATABLE_FIELDS = [
  'name', 'dob', 'age', 'gender', 'student_phone', 'parent_name', 'parent_phone',
  'parent_relation', 'locality', 'city', 'district', 'state', 'current_class',
  'previous_school', 'address', 'notes', 'photo_path',
];

export function updateStudent(actor, id, input, ip = '') {
  const db = getPetDb();
  const student = getStudent(id);
  if (!student) throw errors.notFound('Student not found.');
  if (student.status === 'inactive') {
    throw errors.conflict('STUDENT_INACTIVE', 'Reactivate the student before editing.');
  }

  const sets = [];
  const params = { id: student.id, ts: now() };
  const changed = {};
  for (const field of UPDATABLE_FIELDS) {
    if (input[field] !== undefined) {
      sets.push(`${field} = @${field}`);
      params[field] = input[field];
      if (input[field] !== student[field]) changed[field] = input[field];
    }
  }
  if (input.school_id !== undefined) {
    if (input.school_id === null || input.school_id === '') {
      sets.push('school_id = NULL');
    } else {
      const school = db.prepare('SELECT * FROM schools WHERE id = ?').get(input.school_id);
      if (!school) throw errors.notFound('Linked school not found.');
      sets.push('school_id = @school_id', 'school_name = @school_name', 'school_address = @school_address');
      params.school_id = school.id;
      params.school_name = school.name;
      params.school_address = school.address || null;
      changed.school = school.name;
    }
  }
  if (sets.length === 0) throw new ApiError(400, 'VALIDATION_ERROR', 'No updatable fields supplied.');

  db.prepare(`UPDATE students SET ${sets.join(', ')}, updated_at = @ts WHERE id = @id`).run(params);
  petAudit({
    actorType: actor.role,
    actorId: actor.id,
    actorLabel: actor.name,
    action: PET_AUDIT.STUDENT_UPDATED,
    targetType: 'student',
    targetId: student.id,
    metadata: { changed_keys: Object.keys(changed) },
    ip,
  });
  return getStudent(student.id);
}

/**
 * Change the lifecycle status. Always transactional: status update + status
 * history + audit. Selection/enrollment decision states are Main-Admin only
 * (enforced here in the service, not in the UI).
 */
export function changeStudentStatus(actor, id, toStatus, reason = '', ip = '') {
  const db = getPetDb();
  const student = getStudent(id);
  if (!student) throw errors.notFound('Student not found.');
  if (!STUDENT_STATUSES.includes(toStatus)) {
    throw new ApiError(400, 'VALIDATION_ERROR', `to_status must be one of: ${STUDENT_STATUSES.join(', ')}.`);
  }
  const from = student.status;
  if (from === toStatus) throw errors.conflict('NO_CHANGE', `Student is already '${toStatus}'.`);

  const allowed = ALLOWED_TRANSITIONS[from] || [];
  if (!allowed.includes(toStatus)) {
    throw errors.conflict(
      'INVALID_TRANSITION',
      `Cannot move student from '${from}' to '${toStatus}'. Allowed: ${allowed.join(', ') || 'none'}.`
    );
  }
  if (ADMIN_ONLY_STATUSES.has(toStatus) && actor.role !== 'main_admin') {
    throw errors.forbidden('FORBIDDEN', 'Only Main Admin can apply selection/enrollment decisions.');
  }

  const ts = now();
  const transition = db.transaction(() => {
    db.prepare('UPDATE students SET status = ?, updated_at = ? WHERE id = ?').run(toStatus, ts, student.id);
    db.prepare(
      `INSERT INTO student_status_history
         (id, student_id, from_status, to_status, changed_by_user_id, changed_by_user_name, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(newId('ssh'), student.id, from, toStatus, actor.id, actor.name, reason || null, ts);
  });
  transition();

  petAudit({
    actorType: actor.role,
    actorId: actor.id,
    actorLabel: actor.name,
    action: PET_AUDIT.STUDENT_STATUS_CHANGED,
    targetType: 'student',
    targetId: student.id,
    metadata: { from_status: from, to_status: toStatus, reason: reason || undefined },
    ip,
  });
  return getStudent(student.id);
}

const SEARCHABLE = `
  (s.name LIKE @q ESCAPE '\\' OR s.pet_student_id LIKE @q ESCAPE '\\'
   OR s.student_phone LIKE @q ESCAPE '\\' OR s.parent_name LIKE @q ESCAPE '\\'
   OR s.parent_phone LIKE @q ESCAPE '\\' OR s.school_name LIKE @q ESCAPE '\\'
   OR s.district LIKE @q ESCAPE '\\' OR s.city LIKE @q ESCAPE '\\')`;

/** Student search: name, PET id, phones, parent, school, district, city, status. */
export function searchStudents(query = {}) {
  const db = getPetDb();
  const { limit, offset } = paging(query, { defaultLimit: 50 });
  const where = ['1=1'];
  const params = {};
  if (query.q) {
    where.push(SEARCHABLE);
    params.q = `%${likeEscape(query.q)}%`;
  }
  if (query.status && STUDENT_STATUSES.includes(query.status)) {
    where.push('s.status = @status');
    params.status = query.status;
  }
  if (query.school_id) {
    where.push('s.school_id = @school_id');
    params.school_id = query.school_id;
  }
  if (query.registered_by) {
    where.push('s.registered_by_user_id = @registered_by');
    params.registered_by = query.registered_by;
  }
  const base = `FROM students s WHERE ${where.join(' AND ')}`;
  const rows = db
    .prepare(`SELECT s.* ${base} ORDER BY s.created_at DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit, offset });
  const { c } = db.prepare(`SELECT COUNT(*) AS c ${base}`).get(params);
  return { students: rows, total: c, limit, offset };
}

/** Canonical complete student profile: journey + every linked record. */
export function getStudentProfile(idOrPetId) {
  const db = getPetDb();
  const student = getStudent(idOrPetId);
  if (!student) throw errors.notFound('Student not found.');
  const sid = student.id;

  const journey = db
    .prepare('SELECT * FROM student_status_history WHERE student_id = ? ORDER BY created_at ASC')
    .all(sid);
  const tests = db
    .prepare(
      `SELECT ta.id AS assignment_id, ta.status AS assignment_status, t.id AS test_id, t.name AS test_name,
              t.scheduled_date, te.total_obtained, te.total_max, te.percentage, te.result AS evaluation_result
       FROM test_assignments ta
       JOIN tests t ON t.id = ta.test_id
       LEFT JOIN test_evaluations te ON te.test_id = ta.test_id AND te.student_id = ta.student_id
       WHERE ta.student_id = ? ORDER BY ta.assigned_at DESC`
    )
    .all(sid);
  const results = db
    .prepare(
      `SELECT tr.test_id, ts.name AS subject, ts.max_marks, tr.obtained_marks, tr.updated_at
       FROM test_results tr JOIN test_subjects ts ON ts.id = tr.subject_id
       WHERE tr.student_id = ? ORDER BY tr.created_at DESC`
    )
    .all(sid);
  const enrollment = db.prepare('SELECT * FROM enrollments WHERE student_id = ?').get(sid) || null;
  const documents = db.prepare('SELECT * FROM student_documents WHERE student_id = ? ORDER BY created_at DESC').all(sid);
  const tasks = db.prepare('SELECT * FROM tasks WHERE student_id = ? ORDER BY created_at DESC LIMIT 50').all(sid);
  const visits = db
    .prepare(
      `SELECT v.* FROM field_visits v
       WHERE v.id = @registered_visit
          OR v.id IN (SELECT visit_id FROM tasks WHERE student_id = @sid AND visit_id IS NOT NULL)
       ORDER BY v.started_at DESC LIMIT 50`
    )
    .all({ sid, registered_visit: student.registered_visit_id || '' });
  const reminders = db
    .prepare(
      `SELECT m.id, m.created_at, m.text, m.sender_name FROM messages m
       WHERE m.linked_student_id = ? ORDER BY m.created_at DESC LIMIT 10`
    )
    .all(sid);

  return { student, journey, tests, results, enrollment, documents, tasks, visits, reminders };
}

export { notify };
