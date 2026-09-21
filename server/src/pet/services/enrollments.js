/**
 * Enrollment service: SELECTED → FOLLOW-UP → DOCUMENTS → VERIFICATION →
 * ENROLLED. The student's full journey is preserved — enrollment records
 * are separate from and additive to the lifecycle history.
 */

import { getPetDb } from '../db.js';
import { ApiError, errors } from '../../lib/respond.js';
import { petAudit, PET_AUDIT } from '../audit.js';
import { newId, now, paging } from './common.js';
import { changeStudentStatus, getStudent } from './students.js';

const STAGES = ['follow_up', 'documents', 'verification', 'enrolled'];
const STAGE_FLOW = { follow_up: ['documents'], documents: ['verification'], verification: ['enrolled'], enrolled: [] };

export function listEnrollments(query = {}) {
  const db = getPetDb();
  const { limit, offset } = paging(query);
  const where = ['1=1'];
  const params = {};
  if (query.stage && STAGES.includes(query.stage)) {
    where.push('stage = @stage');
    params.stage = query.stage;
  }
  if (query.status && ['active', 'completed', 'withdrawn'].includes(query.status)) {
    where.push('status = @status');
    params.status = query.status;
  }
  const base = `FROM enrollments WHERE ${where.join(' AND ')}`;
  const rows = db.prepare(`SELECT * ${base} ORDER BY updated_at DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit, offset });
  const { c } = db.prepare(`SELECT COUNT(*) AS c ${base}`).get(params);
  return { enrollments: rows, total: c, limit, offset };
}

export function getEnrollment(studentId) {
  const db = getPetDb();
  const student = getStudent(studentId);
  if (!student) throw errors.notFound('Student not found.');
  return db.prepare('SELECT * FROM enrollments WHERE student_id = ?').get(student.id) || null;
}

/** Start the enrollment pipeline for a SELECTED student. */
export function startEnrollment(actor, studentId, notes = '', ip = '') {
  const db = getPetDb();
  const student = getStudent(studentId);
  if (!student) throw errors.notFound('Student not found.');
  if (student.status !== 'selected') {
    throw errors.conflict('NOT_SELECTED', 'Only SELECTED students can start enrollment.');
  }
  const existing = db.prepare('SELECT * FROM enrollments WHERE student_id = ?').get(student.id);
  if (existing) return existing;

  const id = newId('enr');
  const ts = now();
  db.prepare(
    `INSERT INTO enrollments (id, student_id, stage, status, notes, started_by_user_id, started_by_user_name, created_at, updated_at)
     VALUES (?, ?, 'follow_up', 'active', ?, ?, ?, ?, ?)`
  ).run(id, student.id, notes || null, actor.id, actor.name, ts, ts);
  petAudit({
    actorType: actor.role, actorId: actor.id, actorLabel: actor.name,
    action: PET_AUDIT.ENROLLMENT_STARTED, targetType: 'student', targetId: student.id,
    metadata: {}, ip,
  });
  return db.prepare('SELECT * FROM enrollments WHERE id = ?').get(id);
}

/**
 * Advance the enrollment stage. Moving to ENROLLED is transactional:
 * enrollment completed + student status → enrolled + status history + audit.
 */
export function advanceStage(actor, studentId, toStage, { notes = '' } = {}, ip = '') {
  const db = getPetDb();
  const student = getStudent(studentId);
  if (!student) throw errors.notFound('Student not found.');
  const enrollment = db.prepare('SELECT * FROM enrollments WHERE student_id = ?').get(student.id);
  if (!enrollment) throw errors.notFound('No enrollment record. Start enrollment first.');
  if (enrollment.status !== 'active') {
    throw errors.conflict('ENROLLMENT_CLOSED', 'This enrollment is already closed.');
  }
  if (!STAGES.includes(toStage)) {
    throw new ApiError(400, 'VALIDATION_ERROR', `stage must be one of: ${STAGES.join(', ')}.`);
  }
  if (!(STAGE_FLOW[enrollment.stage] || []).includes(toStage)) {
    throw errors.conflict(
      'INVALID_TRANSITION',
      `Cannot move enrollment from '${enrollment.stage}' to '${toStage}'.`
    );
  }

  const ts = now();
  const run = db.transaction(() => {
    if (toStage === 'enrolled') {
      db.prepare(
        `UPDATE enrollments SET stage = 'enrolled', status = 'completed', verified_by_user_id = ?,
           enrolled_at = ?, notes = COALESCE(?, notes), updated_at = ? WHERE id = ?`
      ).run(actor.id, ts, notes || null, ts, enrollment.id);
      changeStudentStatus(actor, student.id, 'enrolled', notes || 'Enrollment verified and completed', ip);
    } else {
      db.prepare(
        `UPDATE enrollments SET stage = ?, notes = COALESCE(?, notes), updated_at = ? WHERE id = ?`
      ).run(toStage, notes || null, ts, enrollment.id);
    }
  });
  run();
  petAudit({
    actorType: actor.role, actorId: actor.id, actorLabel: actor.name,
    action: toStage === 'enrolled' ? PET_AUDIT.ENROLLMENT_COMPLETED : PET_AUDIT.ENROLLMENT_STAGE_CHANGED,
    targetType: 'student', targetId: student.id,
    metadata: { from_stage: enrollment.stage, to_stage: toStage }, ip,
  });
  return db.prepare('SELECT * FROM enrollments WHERE id = ?').get(enrollment.id);
}

/** Withdraw an active enrollment (the student journey stays intact). */
export function withdrawEnrollment(actor, studentId, reason = '', ip = '') {
  const db = getPetDb();
  const student = getStudent(studentId);
  if (!student) throw errors.notFound('Student not found.');
  const enrollment = db.prepare('SELECT * FROM enrollments WHERE student_id = ?').get(student.id);
  if (!enrollment || enrollment.status !== 'active') {
    throw errors.notFound('No active enrollment for this student.');
  }
  db.prepare(`UPDATE enrollments SET status = 'withdrawn', notes = COALESCE(?, notes), updated_at = ? WHERE id = ?`)
    .run(reason || null, now(), enrollment.id);
  petAudit({
    actorType: actor.role, actorId: actor.id, actorLabel: actor.name,
    action: PET_AUDIT.ENROLLMENT_STAGE_CHANGED, targetType: 'student', targetId: student.id,
    metadata: { outcome: 'withdrawn', reason }, ip,
  });
  return db.prepare('SELECT * FROM enrollments WHERE id = ?').get(enrollment.id);
}
