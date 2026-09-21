/**
 * Website form routes:
 *   POST /api/public/forms        — PUBLIC intake (validated + rate-limited)
 *   /api/website-forms/*          — private admin queue & follow-up
 * Public endpoints never expose private records.
 */

import { Router } from 'express';
import { ok, errors } from '../../lib/respond.js';
import { assertAllowedKeys, vOptionalString, vString, vOptionalEmail, vEnum } from '../../lib/validate.js';
import { requirePetAuth, requireMainAdmin } from '../auth.js';
import { clientIp } from '../../middleware/auth.js';
import { publicFormLimiter } from '../../middleware/ratelimits.js';
import {
  createSubmission, listSubmissions, assignSubmission,
  updateSubmissionStatus, convertSubmission, FORM_TYPES,
} from '../services/websiteForms.js';

export const publicFormsRouter = Router();

/** Public website → PET intake. No authentication; never returns private data. */
publicFormsRouter.post('/', publicFormLimiter, (req, res, next) => {
  try {
    assertAllowedKeys(req.body, ['form_type', 'name', 'phone', 'email', 'payload']);
    const input = {
      form_type: vEnum(req.body.form_type, 'form_type', FORM_TYPES),
      name: vString(req.body.name, 'name', { min: 2, max: 150 }),
      phone: vString(req.body.phone, 'phone', { min: 5, max: 40 }),
      email: vOptionalEmail(req.body.email, 'email') || null,
      payload:
        req.body.payload && typeof req.body.payload === 'object' && !Array.isArray(req.body.payload)
          ? JSON.parse(JSON.stringify(req.body.payload).slice(0, 8000))
          : null,
    };
    const receipt = createSubmission(input, clientIp(req));
    ok(res, { received: true, reference: receipt.id }, 201);
  } catch (err) { next(err); }
});

const adminRouter = Router();
adminRouter.use(requirePetAuth);

adminRouter.get('/', (req, res, next) => {
  try { ok(res, listSubmissions(req.query)); } catch (err) { next(err); }
});

adminRouter.post('/:id/assign', requireMainAdmin, (req, res, next) => {
  try {
    assertAllowedKeys(req.body, ['assigned_to_user_id']);
    const assignee = vString(req.body.assigned_to_user_id, 'assigned_to_user_id', { min: 1, max: 80 });
    ok(res, { submission: assignSubmission(req.petAuth.user, req.params.id, assignee, clientIp(req)) });
  } catch (err) { next(err); }
});

adminRouter.post('/:id/status', (req, res, next) => {
  try {
    assertAllowedKeys(req.body, ['status']);
    const status = vString(req.body.status, 'status', { min: 1, max: 20 });
    ok(res, { submission: updateSubmissionStatus(req.petAuth.user, req.params.id, status, clientIp(req)) });
  } catch (err) { next(err); }
});

/** Convert a student_registration submission into a canonical student. */
adminRouter.post('/:id/convert', requireMainAdmin, (req, res, next) => {
  try {
    assertAllowedKeys(req.body || {}, ['overrides', 'acknowledge_duplicates']);
    ok(res, convertSubmission(req.petAuth.user, req.params.id, {
      overrides: req.body?.overrides && typeof req.body.overrides === 'object' ? req.body.overrides : {},
      acknowledge_duplicates: req.body?.acknowledge_duplicates === true,
    }, clientIp(req)));
  } catch (err) { next(err); }
});

export default adminRouter;
