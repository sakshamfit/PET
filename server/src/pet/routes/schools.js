/**
 * /api/schools — school directory + profiles.
 * Employees may create/update schools (they discover them in the field);
 * archiving is Main Admin only.
 */

import { Router } from 'express';
import { ok, ApiError } from '../../lib/respond.js';
import { assertAllowedKeys, vOptionalString, vString } from '../../lib/validate.js';
import { requirePetAuth, requireMainAdmin } from '../auth.js';
import { clientIp } from '../../middleware/auth.js';
import {
  listSchools, createSchool, updateSchool, archiveSchool, getSchool, getSchoolProfile,
} from '../services/schools.js';

const router = Router();
router.use(requirePetAuth);

const FIELDS = [
  'name', 'address', 'locality', 'city', 'district', 'state', 'phone',
  'contact_person_name', 'contact_person_phone', 'latitude', 'longitude', 'notes',
];

function parseSchool(body, partial = false) {
  assertAllowedKeys(body, FIELDS);
  const input = {};
  const opt = (k, max) => (body[k] === undefined ? undefined : vOptionalString(body[k], k, { max }) || null);
  if (!partial || body.name !== undefined) input.name = vString(body.name, 'name', { min: 2, max: 200 });
  for (const [k, max] of [
    ['address', 300], ['locality', 150], ['city', 100], ['district', 100], ['state', 100],
    ['phone', 40], ['contact_person_name', 150], ['contact_person_phone', 40], ['notes', 1000],
  ]) {
    const v = opt(k, max);
    if (v !== undefined) input[k] = v;
  }
  for (const k of ['latitude', 'longitude']) {
    if (body[k] !== undefined) {
      const n = Number(body[k]);
      if (!Number.isFinite(n) || Math.abs(n) > 180) throw new ApiError(400, 'VALIDATION_ERROR', `${k} is invalid.`);
      input[k] = n;
    }
  }
  return input;
}

router.get('/', (req, res, next) => {
  try { ok(res, listSchools(req.query)); } catch (err) { next(err); }
});

router.post('/', (req, res, next) => {
  try {
    ok(res, { school: createSchool(req.petAuth.user, parseSchool(req.body), clientIp(req)) }, 201);
  } catch (err) { next(err); }
});

router.get('/:id/profile', (req, res, next) => {
  try { ok(res, getSchoolProfile(req.params.id)); } catch (err) { next(err); }
});

router.get('/:id', (req, res, next) => {
  try {
    const school = getSchool(req.params.id);
    if (!school) throw new ApiError(404, 'NOT_FOUND', 'School not found.');
    ok(res, { school });
  } catch (err) { next(err); }
});

router.patch('/:id', (req, res, next) => {
  try {
    ok(res, { school: updateSchool(req.petAuth.user, req.params.id, parseSchool(req.body, true), clientIp(req)) });
  } catch (err) { next(err); }
});

router.post('/:id/archive', requireMainAdmin, (req, res, next) => {
  try {
    ok(res, { school: archiveSchool(req.petAuth.user, req.params.id, clientIp(req)) });
  } catch (err) { next(err); }
});

export default router;
