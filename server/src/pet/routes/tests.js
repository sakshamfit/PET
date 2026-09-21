/**
 * /api/tests — test definitions, assignments, marks, finalization and
 * selection decisions. Admin manages definitions; authorized staff enter
 * marks; Main Admin applies selection decisions.
 */

import { Router } from 'express';
import { ok, ApiError } from '../../lib/respond.js';
import { assertAllowedKeys, vOptionalString, vString, vEnum } from '../../lib/validate.js';
import { requirePetAuth, requireMainAdmin } from '../auth.js';
import { clientIp } from '../../middleware/auth.js';
import {
  listTests, createTest, updateTest, assignStudents, enterMarks,
  finalizeStudentTest, markAbsent, decideSelection, getTestDetail, computeScore,
} from '../services/tests.js';
import { errors } from '../../lib/respond.js';

const router = Router();
router.use(requirePetAuth);

function parseSubjects(body) {
  if (body.subjects === undefined) return undefined;
  if (!Array.isArray(body.subjects)) throw new ApiError(400, 'VALIDATION_ERROR', 'subjects must be an array.');
  return body.subjects.slice(0, 30).map((s, i) => ({
    name: vString(s?.name, `subjects[${i}].name`, { min: 1, max: 80 }),
    max_marks: Number(s?.max_marks),
    passing_marks: s?.passing_marks === undefined || s?.passing_marks === null ? null : Number(s.passing_marks),
  })).map((s, i) => {
    if (!Number.isFinite(s.max_marks) || s.max_marks <= 0 || s.max_marks > 10000) {
      throw new ApiError(400, 'VALIDATION_ERROR', `subjects[${i}].max_marks must be a positive number.`);
    }
    if (s.passing_marks !== null && (!Number.isFinite(s.passing_marks) || s.passing_marks < 0 || s.passing_marks > s.max_marks)) {
      throw new ApiError(400, 'VALIDATION_ERROR', `subjects[${i}].passing_marks is invalid.`);
    }
    return s;
  });
}

router.get('/', (req, res, next) => {
  try { ok(res, listTests(req.query)); } catch (err) { next(err); }
});

router.post('/', requireMainAdmin, (req, res, next) => {
  try {
    assertAllowedKeys(req.body, ['name', 'description', 'passing_percentage', 'scheduled_date', 'subjects']);
    const pp = req.body.passing_percentage === undefined ? 33 : Number(req.body.passing_percentage);
    if (!Number.isFinite(pp) || pp < 0 || pp > 100) throw new ApiError(400, 'VALIDATION_ERROR', 'passing_percentage must be 0–100.');
    const input = {
      name: vString(req.body.name, 'name', { min: 2, max: 150 }),
      description: vOptionalString(req.body.description, 'description', { max: 1000 }) || null,
      passing_percentage: pp,
      scheduled_date: vOptionalString(req.body.scheduled_date, 'scheduled_date', { max: 25 }) || null,
      subjects: parseSubjects(req.body),
    };
    ok(res, { test: createTest(req.petAuth.user, input, clientIp(req)) }, 201);
  } catch (err) { next(err); }
});

router.get('/:id', (req, res, next) => {
  try { ok(res, getTestDetail(req.params.id)); } catch (err) { next(err); }
});

router.patch('/:id', requireMainAdmin, (req, res, next) => {
  try {
    assertAllowedKeys(req.body, ['name', 'description', 'passing_percentage', 'scheduled_date', 'status', 'subjects']);
    const input = {};
    if (req.body.name !== undefined) input.name = vString(req.body.name, 'name', { min: 2, max: 150 });
    if (req.body.description !== undefined) input.description = vOptionalString(req.body.description, 'description', { max: 1000 }) || null;
    if (req.body.scheduled_date !== undefined) input.scheduled_date = vOptionalString(req.body.scheduled_date, 'scheduled_date', { max: 25 }) || null;
    if (req.body.status !== undefined) input.status = vEnum(req.body.status, 'status', ['draft', 'scheduled', 'completed', 'finalized']);
    if (req.body.passing_percentage !== undefined) {
      const pp = Number(req.body.passing_percentage);
      if (!Number.isFinite(pp) || pp < 0 || pp > 100) throw new ApiError(400, 'VALIDATION_ERROR', 'passing_percentage must be 0–100.');
      input.passing_percentage = pp;
    }
    const subjects = parseSubjects(req.body);
    if (subjects !== undefined) input.subjects = subjects;
    ok(res, { test: updateTest(req.petAuth.user, req.params.id, input, clientIp(req)) });
  } catch (err) { next(err); }
});

router.post('/:id/assign', requireMainAdmin, (req, res, next) => {
  try {
    assertAllowedKeys(req.body, ['student_ids']);
    if (!Array.isArray(req.body.student_ids) || req.body.student_ids.length === 0) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'student_ids must be a non-empty array.');
    }
    const ids = req.body.student_ids.slice(0, 500).map(s => vString(s, 'student_ids[]', { min: 1, max: 80 }));
    ok(res, assignStudents(req.petAuth.user, req.params.id, ids, clientIp(req)));
  } catch (err) { next(err); }
});

/** Enter marks — any active staff member assigned to field testing. */
router.post('/:id/marks/:studentId', (req, res, next) => {
  try {
    assertAllowedKeys(req.body, ['marks']);
    if (!Array.isArray(req.body.marks) || req.body.marks.length === 0) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'marks must be a non-empty array.');
    }
    const marks = req.body.marks.slice(0, 50).map((m, i) => ({
      subject_id: vString(m?.subject_id, `marks[${i}].subject_id`, { min: 1, max: 80 }),
      obtained_marks: Number(m?.obtained_marks),
    }));
    for (const [i, m] of marks.entries()) {
      if (!Number.isFinite(m.obtained_marks)) throw new ApiError(400, 'VALIDATION_ERROR', `marks[${i}].obtained_marks must be a number.`);
    }
    ok(res, { score: enterMarks(req.petAuth.user, req.params.id, req.params.studentId, marks, clientIp(req)) });
  } catch (err) { next(err); }
});

router.get('/:id/scores/:studentId', (req, res, next) => {
  try { ok(res, { score: computeScore(req.params.id, req.params.studentId) }); } catch (err) { next(err); }
});

router.post('/:id/finalize/:studentId', requireMainAdmin, (req, res, next) => {
  try { ok(res, { score: finalizeStudentTest(req.petAuth.user, req.params.id, req.params.studentId, clientIp(req)) }); } catch (err) { next(err); }
});

router.post('/:id/absent/:studentId', requireMainAdmin, (req, res, next) => {
  try { ok(res, { assignment: markAbsent(req.petAuth.user, req.params.id, req.params.studentId, clientIp(req)) }); } catch (err) { next(err); }
});

/** Selection decision — Main Admin only. */
router.post('/:id/decision/:studentId', requireMainAdmin, (req, res, next) => {
  try {
    assertAllowedKeys(req.body, ['decision', 'remarks']);
    const decision = vEnum(req.body.decision, 'decision', ['selected', 'waitlisted', 'not_selected']);
    const remarks = vOptionalString(req.body.remarks, 'remarks', { max: 500 });
    ok(res, { student: decideSelection(req.petAuth.user, req.params.id, req.params.studentId, decision, remarks, clientIp(req)) });
  } catch (err) { next(err); }
});

export default router;
