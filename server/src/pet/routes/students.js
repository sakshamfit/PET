/**
 * /api/students — registration (with duplicate warnings), search, the
 * canonical complete profile, updates and lifecycle transitions.
 */

import { Router } from 'express';
import { ok, ApiError } from '../../lib/respond.js';
import { assertAllowedKeys, vOptionalString, vString, vInt, vEnum } from '../../lib/validate.js';
import { requirePetAuth } from '../auth.js';
import { clientIp } from '../../middleware/auth.js';
import { storeBase64Upload } from '../services/uploads.js';
import {
  registerStudent, updateStudent, changeStudentStatus, searchStudents,
  getStudentProfile, findDuplicates, STUDENT_STATUSES, getStudent,
} from '../services/students.js';

const router = Router();
router.use(requirePetAuth);

const REG_FIELDS = [
  'name', 'dob', 'age', 'gender', 'student_phone', 'parent_name', 'parent_phone',
  'parent_relation', 'school_id', 'school_name', 'school_address', 'locality', 'city',
  'district', 'state', 'current_class', 'previous_school', 'address', 'notes',
  'registration_source', 'intake_id', 'visit_id', 'acknowledge_duplicates', 'photo_data',
];

function parseRegistration(body) {
  assertAllowedKeys(body, REG_FIELDS);
  const gender = vOptionalString(body.gender, 'gender', { max: 10 });
  if (gender && !['male', 'female', 'other'].includes(gender)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'gender must be male, female or other.');
  }
  return {
    name: vString(body.name, 'name', { min: 2, max: 150 }),
    dob: vOptionalString(body.dob, 'dob', { max: 10 }) || null,
    age: body.age === undefined || body.age === null ? null : vInt(body.age, 'age', { min: 0, max: 120 }),
    gender: gender || null,
    student_phone: vOptionalString(body.student_phone, 'student_phone', { max: 40 }) || null,
    parent_name: vOptionalString(body.parent_name, 'parent_name', { max: 150 }) || null,
    parent_phone: vOptionalString(body.parent_phone, 'parent_phone', { max: 40 }) || null,
    parent_relation: vOptionalString(body.parent_relation, 'parent_relation', { max: 60 }) || null,
    school_id: vOptionalString(body.school_id, 'school_id', { max: 80 }) || null,
    school_name: vOptionalString(body.school_name, 'school_name', { max: 200 }) || null,
    school_address: vOptionalString(body.school_address, 'school_address', { max: 300 }) || null,
    locality: vOptionalString(body.locality, 'locality', { max: 150 }) || null,
    city: vOptionalString(body.city, 'city', { max: 100 }) || null,
    district: vOptionalString(body.district, 'district', { max: 100 }) || null,
    state: vOptionalString(body.state, 'state', { max: 100 }) || null,
    current_class: vOptionalString(body.current_class, 'current_class', { max: 60 }) || null,
    previous_school: vOptionalString(body.previous_school, 'previous_school', { max: 200 }) || null,
    address: vOptionalString(body.address, 'address', { max: 400 }) || null,
    notes: vOptionalString(body.notes, 'notes', { max: 1000 }) || null,
    visit_id: vOptionalString(body.visit_id, 'visit_id', { max: 80 }) || null,
    acknowledge_duplicates: body.acknowledge_duplicates === true,
  };
}

/** GET /api/students — search/list (q, status, school_id, registered_by). */
router.get('/', (req, res, next) => {
  try {
    ok(res, searchStudents(req.query));
  } catch (err) { next(err); }
});

/** POST /api/students/duplicates-check — pre-registration warning probe. */
router.post('/duplicates-check', (req, res, next) => {
  try {
    assertAllowedKeys(req.body, ['name', 'parent_phone', 'student_phone', 'school_id']);
    const name = vString(req.body.name, 'name', { min: 2, max: 150 });
    const matches = findDuplicates({
      name,
      parentPhone: vOptionalString(req.body.parent_phone, 'parent_phone', { max: 40 }),
      studentPhone: vOptionalString(req.body.student_phone, 'student_phone', { max: 40 }),
      schoolId: vOptionalString(req.body.school_id, 'school_id', { max: 80 }) || null,
    });
    ok(res, { duplicates: matches });
  } catch (err) { next(err); }
});

/** POST /api/students — register (409 + duplicates unless acknowledged). */
router.post('/', (req, res, next) => {
  try {
    const input = parseRegistration(req.body);
    // Optional inline photo (base64) stored atomically with registration.
    if (req.body.photo_data) {
      const { relativePath } = storeBase64Upload(req.petAuth.user, {
        category: 'students',
        fileName: req.body.photo_data.fileName || 'photo.jpg',
        mimeType: req.body.photo_data.mimeType || 'image/jpeg',
        dataBase64: req.body.photo_data.dataBase64,
      });
      input.photo_path = relativePath;
    }
    const result = registerStudent(req.petAuth.user, input, clientIp(req));
    ok(res, result, 201);
  } catch (err) { next(err); }
});

/** GET /api/students/:id/profile — canonical complete student profile. */
router.get('/:id/profile', (req, res, next) => {
  try {
    ok(res, getStudentProfile(req.params.id));
  } catch (err) { next(err); }
});

router.get('/:id', (req, res, next) => {
  try {
    const student = getStudent(req.params.id);
    if (!student) throw new ApiError(404, 'NOT_FOUND', 'Student not found.');
    ok(res, { student });
  } catch (err) { next(err); }
});

router.patch('/:id', (req, res, next) => {
  try {
    assertAllowedKeys(req.body, [
      'name', 'dob', 'age', 'gender', 'student_phone', 'parent_name', 'parent_phone',
      'parent_relation', 'locality', 'city', 'district', 'state', 'current_class',
      'previous_school', 'address', 'notes', 'photo_path', 'school_id',
    ]);
    const input = { ...req.body };
    if (input.gender !== undefined && input.gender !== null && !['male', 'female', 'other'].includes(input.gender)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'gender must be male, female or other.');
    }
    ok(res, { student: updateStudent(req.petAuth.user, req.params.id, input, clientIp(req)) });
  } catch (err) { next(err); }
});

/** POST /api/students/:id/status — lifecycle transition (audited). */
router.post('/:id/status', (req, res, next) => {
  try {
    assertAllowedKeys(req.body, ['to_status', 'reason']);
    const toStatus = vEnum(req.body.to_status, 'to_status', STUDENT_STATUSES);
    const reason = vOptionalString(req.body.reason, 'reason', { max: 300 });
    ok(res, { student: changeStudentStatus(req.petAuth.user, req.params.id, toStatus, reason, clientIp(req)) });
  } catch (err) { next(err); }
});

export default router;
