/**
 * Tests & evaluation service (repurposes the old Exams/Results concept).
 *
 * Admin defines tests with configurable subjects and passing criteria —
 * no single hardcoded selection rule. Marks are stored per subject; totals,
 * percentages and eligibility are computed deterministically from the
 * stored rows. Lifecycle transitions go through the students service so
 * status history is always written.
 */

import { getPetDb } from '../db.js';
import { ApiError, errors } from '../../lib/respond.js';
import { petAudit, PET_AUDIT } from '../audit.js';
import { newId, now, paging } from './common.js';
import { changeStudentStatus, getStudent } from './students.js';

export function getTest(id) {
  const db = getPetDb();
  const test = db.prepare('SELECT * FROM tests WHERE id = ?').get(id);
  if (!test) return null;
  const subjects = db.prepare('SELECT * FROM test_subjects WHERE test_id = ? ORDER BY sort_order, name').all(id);
  return { ...test, subjects };
}

export function listTests(query = {}) {
  const db = getPetDb();
  const { limit, offset } = paging(query);
  const where = ['1=1'];
  const params = {};
  if (query.status && ['draft', 'scheduled', 'completed', 'finalized'].includes(query.status)) {
    where.push('status = @status');
    params.status = query.status;
  }
  const base = `FROM tests WHERE ${where.join(' AND ')}`;
  const rows = db.prepare(`SELECT * ${base} ORDER BY created_at DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit, offset });
  const { c } = db.prepare(`SELECT COUNT(*) AS c ${base}`).get(params);
  return { tests: rows.map(t => getTest(t.id)), total: c, limit, offset };
}

/** Create a test with subjects in one transaction. */
export function createTest(actor, input, ip = '') {
  const db = getPetDb();
  const id = newId('tst');
  const ts = now();
  if (!Array.isArray(input.subjects) || input.subjects.length === 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'At least one subject is required.');
  }
  const create = db.transaction(() => {
    db.prepare(
      `INSERT INTO tests (id, name, description, passing_percentage, scheduled_date, status,
          created_by_user_id, created_by_user_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`
    ).run(
      id, input.name, input.description || null, input.passing_percentage ?? 33,
      input.scheduled_date || null, actor.id, actor.name, ts, ts
    );
    input.subjects.forEach((s, idx) => {
      db.prepare(
        `INSERT INTO test_subjects (id, test_id, name, max_marks, passing_marks, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(newId('sub'), id, s.name, s.max_marks, s.passing_marks ?? null, idx);
    });
  });
  create();
  petAudit({
    actorType: actor.role, actorId: actor.id, actorLabel: actor.name,
    action: PET_AUDIT.TEST_CREATED, targetType: 'test', targetId: id,
    metadata: { name: input.name, subjects: input.subjects.length }, ip,
  });
  return getTest(id);
}

export function updateTest(actor, id, input, ip = '') {
  const db = getPetDb();
  const test = getTest(id);
  if (!test) throw errors.notFound('Test not found.');
  const sets = [];
  const params = { id, ts: now() };
  for (const f of ['name', 'description', 'scheduled_date']) {
    if (input[f] !== undefined) { sets.push(`${f} = @${f}`); params[f] = input[f]; }
  }
  if (input.passing_percentage !== undefined) {
    sets.push('passing_percentage = @pp');
    params.pp = input.passing_percentage;
  }
  if (input.status && ['draft', 'scheduled', 'completed', 'finalized'].includes(input.status)) {
    sets.push('status = @status');
    params.status = input.status;
  }
  if (sets.length) {
    db.prepare(`UPDATE tests SET ${sets.join(', ')}, updated_at = @ts WHERE id = @id`).run(params);
  }
  // Replace subjects only if explicitly supplied and no marks exist yet.
  if (Array.isArray(input.subjects)) {
    const marks = db.prepare('SELECT COUNT(*) AS c FROM test_results WHERE test_id = ?').get(id).c;
    if (marks > 0) throw errors.conflict('MARKS_EXIST', 'Subjects cannot change after marks were entered.');
    const replace = db.transaction(() => {
      db.prepare('DELETE FROM test_subjects WHERE test_id = ?').run(id);
      input.subjects.forEach((s, idx) => {
        db.prepare('INSERT INTO test_subjects (id, test_id, name, max_marks, passing_marks, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
          .run(newId('sub'), id, s.name, s.max_marks, s.passing_marks ?? null, idx);
      });
    });
    replace();
  }
  petAudit({
    actorType: actor.role, actorId: actor.id, actorLabel: actor.name,
    action: PET_AUDIT.TEST_UPDATED, targetType: 'test', targetId: id,
    metadata: { changed_keys: Object.keys(input) }, ip,
  });
  return getTest(id);
}

/**
 * Assign students to a test. Transactional: assignments created, students
 * moved REGISTERED → TEST_SCHEDULED through the lifecycle service.
 * Skips students already assigned (scheduling is idempotent).
 */
export function assignStudents(actor, testId, studentIds, ip = '') {
  const db = getPetDb();
  const test = getTest(testId);
  if (!test) throw errors.notFound('Test not found.');
  if (test.status === 'finalized') throw errors.conflict('TEST_FINALIZED', 'A finalized test cannot be changed.');

  const results = { assigned: [], skipped: [], errors: [] };
  const run = db.transaction(() => {
    for (const sid of studentIds) {
      const student = getStudent(sid);
      if (!student) { results.errors.push({ student_id: sid, error: 'not_found' }); continue; }
      const existing = db.prepare('SELECT 1 FROM test_assignments WHERE test_id = ? AND student_id = ?').get(testId, student.id);
      if (existing) { results.skipped.push(student.id); continue; }
      db.prepare(
        `INSERT INTO test_assignments (id, test_id, student_id, status, assigned_by_user_id, assigned_at)
         VALUES (?, ?, ?, 'scheduled', ?, ?)`
      ).run(newId('tas'), testId, student.id, actor.id, now());
      if (student.status === 'registered') {
        changeStudentStatus(actor, student.id, 'test_scheduled', `Assigned to test: ${test.name}`, ip);
      }
      results.assigned.push(student.id);
    }
    if (test.status === 'draft') {
      db.prepare(`UPDATE tests SET status = 'scheduled', updated_at = ? WHERE id = ?`).run(now(), testId);
    }
  });
  run();
  petAudit({
    actorType: actor.role, actorId: actor.id, actorLabel: actor.name,
    action: PET_AUDIT.TEST_STUDENTS_ASSIGNED, targetType: 'test', targetId: testId,
    metadata: { assigned: results.assigned.length, skipped: results.skipped.length }, ip,
  });
  return results;
}

/**
 * Enter (or correct) marks for one student. Any ACTIVE staff member may
 * enter marks (authorized field testing); Main Admin finalizes.
 * Stored per subject; marks must be within the subject's max.
 */
export function enterMarks(actor, testId, studentId, marks, ip = '') {
  const db = getPetDb();
  const test = getTest(testId);
  if (!test) throw errors.notFound('Test not found.');
  if (test.status === 'finalized') throw errors.conflict('TEST_FINALIZED', 'This test is finalized.');
  const student = getStudent(studentId);
  if (!student) throw errors.notFound('Student not found.');
  const assignment = db
    .prepare('SELECT * FROM test_assignments WHERE test_id = ? AND student_id = ?')
    .get(testId, student.id);
  if (!assignment) throw errors.conflict('NOT_ASSIGNED', 'Student is not assigned to this test.');
  if (assignment.status === 'absent') throw errors.conflict('MARKED_ABSENT', 'Student is marked absent.');

  const subjectById = new Map(test.subjects.map(s => [s.id, s]));
  const ts = now();
  const run = db.transaction(() => {
    for (const m of marks) {
      const subject = subjectById.get(m.subject_id);
      if (!subject) throw new ApiError(400, 'VALIDATION_ERROR', `Unknown subject_id ${m.subject_id}.`);
      if (m.obtained_marks < 0 || m.obtained_marks > subject.max_marks) {
        throw new ApiError(400, 'VALIDATION_ERROR',
          `Marks for ${subject.name} must be between 0 and ${subject.max_marks}.`);
      }
      db.prepare(
        `INSERT INTO test_results (id, test_id, student_id, subject_id, obtained_marks,
            entered_by_user_id, entered_by_user_name, created_at, updated_at)
         VALUES (@id, @test_id, @student_id, @subject_id, @obtained, @by, @by_name, @ts, @ts)
         ON CONFLICT(test_id, student_id, subject_id)
         DO UPDATE SET obtained_marks = @obtained, entered_by_user_id = @by,
           entered_by_user_name = @by_name, updated_at = @ts`
      ).run({
        id: newId('res'), test_id: testId, student_id: student.id, subject_id: subject.id,
        obtained: m.obtained_marks, by: actor.id, by_name: actor.name, ts,
      });
    }
  });
  run();
  petAudit({
    actorType: actor.role, actorId: actor.id, actorLabel: actor.name,
    action: PET_AUDIT.TEST_MARKS_ENTERED, targetType: 'test', targetId: testId,
    metadata: { student: student.name, subjects: marks.length }, ip,
  });
  return computeScore(testId, student.id);
}

/** Deterministic score sheet from stored rows. */
export function computeScore(testId, studentId) {
  const db = getPetDb();
  const test = getTest(testId);
  if (!test) throw errors.notFound('Test not found.');
  const student = getStudent(studentId);
  if (!student) throw errors.notFound('Student not found.');
  const rows = db
    .prepare('SELECT * FROM test_results WHERE test_id = ? AND student_id = ?')
    .all(testId, student.id);
  const bySubject = new Map(rows.map(r => [r.subject_id, r]));
  let totalObtained = 0;
  let totalMax = 0;
  let allSubjectsEntered = true;
  let anySubjectFailed = false;
  const subjects = test.subjects.map(s => {
    const r = bySubject.get(s.id);
    const obtained = r ? r.obtained_marks : null;
    if (obtained === null) allSubjectsEntered = false;
    totalObtained += obtained || 0;
    totalMax += s.max_marks;
    if (obtained !== null && s.passing_marks != null && obtained < s.passing_marks) {
      anySubjectFailed = true;
    }
    return {
      subject_id: s.id, name: s.name, max_marks: s.max_marks,
      passing_marks: s.passing_marks, obtained_marks: obtained,
    };
  });
  const percentage = totalMax > 0 ? Math.round((totalObtained / totalMax) * 10000) / 100 : 0;
  const eligible =
    allSubjectsEntered && percentage >= test.passing_percentage && !anySubjectFailed;
  return {
    test_id: testId, student_id: student.id, subjects,
    total_obtained: totalObtained, total_max: totalMax, percentage,
    complete: allSubjectsEntered,
    suggested_result: eligible ? 'eligible' : 'not_eligible',
    passing_percentage: test.passing_percentage,
  };
}

/**
 * Finalize a student's test: requires complete marks; assignment → completed;
 * student TEST_SCHEDULED → TEST_COMPLETED → UNDER_EVALUATION via lifecycle.
 */
export function finalizeStudentTest(actor, testId, studentId, ip = '') {
  const db = getPetDb();
  const test = getTest(testId);
  if (!test) throw errors.notFound('Test not found.');
  const student = getStudent(studentId);
  if (!student) throw errors.notFound('Student not found.');
  const score = computeScore(testId, student.id);
  if (!score.complete) {
    throw errors.conflict('MARKS_INCOMPLETE', 'Enter marks for every subject before finalizing.');
  }
  const ts = now();
  const run = db.transaction(() => {
    db.prepare(
      `UPDATE test_assignments SET status = 'completed' WHERE test_id = ? AND student_id = ?`
    ).run(testId, student.id);
    db.prepare(
      `INSERT INTO test_evaluations (id, test_id, student_id, total_obtained, total_max, percentage,
          result, evaluated_by_user_id, evaluated_by_user_name, evaluated_at, updated_at)
       VALUES (@id, @test_id, @student_id, @obtained, @max, @pct, 'pending', @by, @by_name, @ts, @ts)
       ON CONFLICT(test_id, student_id)
       DO UPDATE SET total_obtained = @obtained, total_max = @max, percentage = @pct, updated_at = @ts`
    ).run({
      id: newId('eva'), test_id: testId, student_id: student.id,
      obtained: score.total_obtained, max: score.total_max, pct: score.percentage,
      by: actor.id, by_name: actor.name, ts,
    });
    if (student.status === 'test_scheduled') {
      changeStudentStatus(actor, student.id, 'test_completed', `Test finalized: ${test.name}`, ip);
    }
    const fresh = getStudent(student.id);
    if (fresh.status === 'test_completed') {
      changeStudentStatus(actor, student.id, 'under_evaluation', 'Evaluation started', ip);
    }
  });
  run();
  petAudit({
    actorType: actor.role, actorId: actor.id, actorLabel: actor.name,
    action: PET_AUDIT.TEST_FINALIZED, targetType: 'test', targetId: testId,
    metadata: { student: student.name, percentage: score.percentage }, ip,
  });
  return computeScore(testId, student.id);
}

/** Mark a student absent for a test. */
export function markAbsent(actor, testId, studentId, ip = '') {
  const db = getPetDb();
  const test = getTest(testId);
  if (!test) throw errors.notFound('Test not found.');
  const student = getStudent(studentId);
  if (!student) throw errors.notFound('Student not found.');
  db.prepare(`UPDATE test_assignments SET status = 'absent' WHERE test_id = ? AND student_id = ?`)
    .run(testId, student.id);
  petAudit({
    actorType: actor.role, actorId: actor.id, actorLabel: actor.name,
    action: PET_AUDIT.TEST_UPDATED, targetType: 'test', targetId: testId,
    metadata: { student: student.name, outcome: 'absent' }, ip,
  });
  return db.prepare('SELECT * FROM test_assignments WHERE test_id = ? AND student_id = ?')
    .get(testId, student.id);
}

/**
 * Evaluation decision (Main Admin): applies the configured criteria result
 * (or an explicit override) to the student's evaluation record and moves
 * the student to SELECTED / WAITLISTED / NOT_SELECTED via the lifecycle.
 */
export function decideSelection(actor, testId, studentId, decision, remarks = '', ip = '') {
  const db = getPetDb();
  if (!['selected', 'waitlisted', 'not_selected'].includes(decision)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'decision must be selected, waitlisted or not_selected.');
  }
  const test = getTest(testId);
  if (!test) throw errors.notFound('Test not found.');
  const student = getStudent(studentId);
  if (!student) throw errors.notFound('Student not found.');

  const ts = now();
  const evaluationResult = decision === 'not_selected' ? 'not_eligible' : 'eligible';
  const run = db.transaction(() => {
    db.prepare(
      `UPDATE test_evaluations SET result = @result, remarks = @remarks, updated_at = @ts
       WHERE test_id = @test_id AND student_id = @student_id`
    ).run({ result: evaluationResult, remarks: remarks || null, ts, test_id: testId, student_id: student.id });
    changeStudentStatus(actor, student.id, decision, remarks || `Decision on ${test.name}`, ip);
  });
  run();
  petAudit({
    actorType: actor.role, actorId: actor.id, actorLabel: actor.name,
    action: PET_AUDIT.SELECTION_DECIDED, targetType: 'student', targetId: student.id,
    metadata: { decision, test: test.name }, ip,
  });
  return getStudent(student.id);
}

/** Test detail: definition + assignments + per-student scores. */
export function getTestDetail(testId) {
  const db = getPetDb();
  const test = getTest(testId);
  if (!test) throw errors.notFound('Test not found.');
  const assignments = db
    .prepare(
      `SELECT ta.*, s.name AS student_name, s.pet_student_id, s.status AS student_status, s.school_name
       FROM test_assignments ta JOIN students s ON s.id = ta.student_id
       WHERE ta.test_id = ? ORDER BY s.name`
    )
    .all(testId);
  const scores = assignments.map(a => {
    const score = computeScore(testId, a.student_id);
    const evaluation = db
      .prepare('SELECT * FROM test_evaluations WHERE test_id = ? AND student_id = ?')
      .get(testId, a.student_id) || null;
    return { assignment: a, score, evaluation };
  });
  return { test, scores };
}

export { getStudent };
