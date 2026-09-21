/**
 * /api/employees — Main Admin employee management.
 * Temporary passwords are returned exactly once in the creation/reset
 * response and never stored or logged.
 */

import { Router } from 'express';
import { ok } from '../../lib/respond.js';
import { assertAllowedKeys, vEmail, vOptionalString, vString } from '../../lib/validate.js';
import { requirePetAuth, requireMainAdmin } from '../auth.js';
import { clientIp } from '../../middleware/auth.js';
import {
  listEmployees, createEmployee, updateEmployee, setEmployeeStatus, resetEmployeeAccess,
} from '../services/employees.js';
import { publicUser } from '../services/common.js';
import { getPetDb } from '../db.js';

const router = Router();
router.use(requirePetAuth, requireMainAdmin);

router.get('/', (req, res, next) => {
  try {
    ok(res, listEmployees(req.query));
  } catch (err) { next(err); }
});

router.get('/:id', (req, res, next) => {
  try {
    const user = getPetDb().prepare(`SELECT * FROM users WHERE id = ? AND role = 'employee'`).get(req.params.id);
    if (!user) return next(Object.assign(new Error('Employee not found.'), { status: 404, code: 'NOT_FOUND' }));
    ok(res, { employee: publicUser(user) });
  } catch (err) { next(err); }
});

router.post('/', (req, res, next) => {
  try {
    assertAllowedKeys(req.body, ['name', 'email', 'phone', 'department', 'team_id', 'joining_date']);
    const input = {
      name: vString(req.body.name, 'name', { min: 2, max: 120 }),
      email: vEmail(req.body.email),
      phone: vOptionalString(req.body.phone, 'phone', { max: 40 }),
      department: vOptionalString(req.body.department, 'department', { max: 80 }) || null,
      team_id: vOptionalString(req.body.team_id, 'team_id', { max: 80 }) || null,
      joining_date: vOptionalString(req.body.joining_date, 'joining_date', { max: 10 }) || null,
    };
    const result = createEmployee(req.petAuth.user, input, clientIp(req));
    ok(res, result, 201);
  } catch (err) { next(err); }
});

router.patch('/:id', (req, res, next) => {
  try {
    assertAllowedKeys(req.body, ['name', 'email', 'phone', 'department', 'team_id', 'joining_date']);
    const input = {};
    if (req.body.name !== undefined) input.name = vString(req.body.name, 'name', { min: 2, max: 120 });
    if (req.body.email !== undefined) input.email = vEmail(req.body.email);
    if (req.body.phone !== undefined) input.phone = vOptionalString(req.body.phone, 'phone', { max: 40 }) || null;
    if (req.body.department !== undefined) input.department = vOptionalString(req.body.department, 'department', { max: 80 }) || null;
    if (req.body.team_id !== undefined) input.team_id = vOptionalString(req.body.team_id, 'team_id', { max: 80 }) || null;
    if (req.body.joining_date !== undefined) input.joining_date = vOptionalString(req.body.joining_date, 'joining_date', { max: 10 }) || null;
    ok(res, { employee: updateEmployee(req.petAuth.user, req.params.id, input, clientIp(req)) });
  } catch (err) { next(err); }
});

/** Activate / deactivate — sessions revoked on deactivate. */
router.post('/:id/status', (req, res, next) => {
  try {
    assertAllowedKeys(req.body, ['status']);
    const status = vString(req.body.status, 'status', { min: 1, max: 20 });
    ok(res, { employee: setEmployeeStatus(req.petAuth.user, req.params.id, status, clientIp(req)) });
  } catch (err) { next(err); }
});

/** Access reset — new temporary password returned once; sessions revoked. */
router.post('/:id/reset-access', (req, res, next) => {
  try {
    ok(res, resetEmployeeAccess(req.petAuth.user, req.params.id, clientIp(req)));
  } catch (err) { next(err); }
});

export default router;
