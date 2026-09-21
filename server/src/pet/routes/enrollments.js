/**
 * /api/enrollments — SELECTED → follow-up → documents → verification →
 * enrolled. Main Admin manages the pipeline.
 */

import { Router } from 'express';
import { ok, errors } from '../../lib/respond.js';
import { assertAllowedKeys, vOptionalString, vString, vEnum } from '../../lib/validate.js';
import { requirePetAuth, requireMainAdmin } from '../auth.js';
import { clientIp } from '../../middleware/auth.js';
import { listEnrollments, getEnrollment, startEnrollment, advanceStage, withdrawEnrollment } from '../services/enrollments.js';

const router = Router();
router.use(requirePetAuth);

router.get('/', (req, res, next) => {
  try { ok(res, listEnrollments(req.query)); } catch (err) { next(err); }
});

router.get('/:studentId', (req, res, next) => {
  try {
    const enrollment = getEnrollment(req.params.studentId);
    if (!enrollment) throw errors.notFound('No enrollment record for this student.');
    ok(res, { enrollment });
  } catch (err) { next(err); }
});

router.post('/:studentId/start', requireMainAdmin, (req, res, next) => {
  try {
    const notes = vOptionalString(req.body?.notes, 'notes', { max: 500 });
    ok(res, { enrollment: startEnrollment(req.petAuth.user, req.params.studentId, notes, clientIp(req)) }, 201);
  } catch (err) { next(err); }
});

router.post('/:studentId/stage', requireMainAdmin, (req, res, next) => {
  try {
    assertAllowedKeys(req.body, ['stage', 'notes']);
    const stage = vEnum(req.body.stage, 'stage', ['follow_up', 'documents', 'verification', 'enrolled']);
    const notes = vOptionalString(req.body.notes, 'notes', { max: 500 });
    ok(res, { enrollment: advanceStage(req.petAuth.user, req.params.studentId, stage, { notes }, clientIp(req)) });
  } catch (err) { next(err); }
});

router.post('/:studentId/withdraw', requireMainAdmin, (req, res, next) => {
  try {
    const reason = vOptionalString(req.body?.reason, 'reason', { max: 500 });
    ok(res, { enrollment: withdrawEnrollment(req.petAuth.user, req.params.studentId, reason, clientIp(req)) });
  } catch (err) { next(err); }
});

export default router;
