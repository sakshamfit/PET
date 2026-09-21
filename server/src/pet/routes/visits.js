/**
 * /api/field-visits — start/update/end visits and retrieve visit detail.
 * Employees operate their own visits; Main Admin has full visibility.
 */

import { Router } from 'express';
import { ok, ApiError } from '../../lib/respond.js';
import { assertAllowedKeys, vOptionalString, vString, vInt } from '../../lib/validate.js';
import { requirePetAuth } from '../auth.js';
import { clientIp } from '../../middleware/auth.js';
import { listVisits, startVisit, updateVisit, endVisit, getVisitDetail } from '../services/visits.js';

const router = Router();
router.use(requirePetAuth);

function optLatLng(body) {
  const out = {};
  for (const k of ['latitude', 'longitude']) {
    if (body[k] !== undefined && body[k] !== null) {
      const n = Number(body[k]);
      if (!Number.isFinite(n) || Math.abs(n) > 180) throw new ApiError(400, 'VALIDATION_ERROR', `${k} is invalid.`);
      out[k] = n;
    } else {
      out[k] = null;
    }
  }
  return out;
}

router.get('/', (req, res, next) => {
  try { ok(res, listVisits(req.petAuth.user, req.query)); } catch (err) { next(err); }
});

router.post('/start', (req, res, next) => {
  try {
    assertAllowedKeys(req.body, ['school_id', 'purpose', 'latitude', 'longitude']);
    const input = {
      school_id: vString(req.body.school_id, 'school_id', { min: 1, max: 80 }),
      purpose: vOptionalString(req.body.purpose, 'purpose', { max: 300 }) || null,
      ...optLatLng(req.body),
    };
    ok(res, { visit: startVisit(req.petAuth.user, input, clientIp(req)) }, 201);
  } catch (err) { next(err); }
});

router.get('/:id', (req, res, next) => {
  try { ok(res, getVisitDetail(req.petAuth.user, req.params.id)); } catch (err) { next(err); }
});

router.patch('/:id', (req, res, next) => {
  try {
    assertAllowedKeys(req.body, ['purpose', 'notes', 'report', 'students_contacted', 'documents_collected']);
    const input = {};
    for (const k of ['purpose', 'notes', 'report']) {
      if (req.body[k] !== undefined) input[k] = vOptionalString(req.body[k], k, { max: 2000 }) || null;
    }
    for (const k of ['students_contacted', 'documents_collected']) {
      if (req.body[k] !== undefined) input[k] = vInt(req.body[k], k, { min: 0, max: 100000 });
    }
    ok(res, { visit: updateVisit(req.petAuth.user, req.params.id, input, clientIp(req)) });
  } catch (err) { next(err); }
});

router.post('/:id/end', (req, res, next) => {
  try {
    assertAllowedKeys(req.body, ['report', 'notes', 'students_contacted', 'documents_collected', 'latitude', 'longitude']);
    const input = { ...optLatLng(req.body) };
    if (req.body.report !== undefined) input.report = vOptionalString(req.body.report, 'report', { max: 4000 }) || null;
    if (req.body.notes !== undefined) input.notes = vOptionalString(req.body.notes, 'notes', { max: 2000 }) || null;
    if (req.body.students_contacted !== undefined) input.students_contacted = vInt(req.body.students_contacted, 'students_contacted', { min: 0, max: 100000 });
    if (req.body.documents_collected !== undefined) input.documents_collected = vInt(req.body.documents_collected, 'documents_collected', { min: 0, max: 100000 });
    ok(res, { visit: endVisit(req.petAuth.user, req.params.id, input, clientIp(req)) });
  } catch (err) { next(err); }
});

export default router;
