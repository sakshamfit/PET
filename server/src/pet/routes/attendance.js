/**
 * /api/attendance — employee self check-in/out, admin marking and reports.
 */

import { Router } from 'express';
import { ok } from '../../lib/respond.js';
import { assertAllowedKeys, vOptionalString, vString, vEnum } from '../../lib/validate.js';
import { requirePetAuth, requireMainAdmin } from '../auth.js';
import { clientIp } from '../../middleware/auth.js';
import {
  checkIn, checkOut, markAttendance, listAttendance, monthlySummary, ATTENDANCE_STATUSES,
} from '../services/attendance.js';

const router = Router();
router.use(requirePetAuth);

router.get('/', (req, res, next) => {
  try { ok(res, listAttendance(req.petAuth.user, req.query)); } catch (err) { next(err); }
});

router.post('/check-in', (req, res, next) => {
  try {
    assertAllowedKeys(req.body || {}, ['latitude', 'longitude']);
    ok(res, checkIn(req.petAuth.user, req.body || {}, clientIp(req)));
  } catch (err) { next(err); }
});

router.post('/check-out', (req, res, next) => {
  try {
    assertAllowedKeys(req.body || {}, ['latitude', 'longitude']);
    ok(res, checkOut(req.petAuth.user, req.body || {}, clientIp(req)));
  } catch (err) { next(err); }
});

/** Admin: mark present/absent/leave/half_day/late for an employee + date. */
router.post('/mark', requireMainAdmin, (req, res, next) => {
  try {
    assertAllowedKeys(req.body, ['employee_id', 'date', 'status', 'remarks']);
    const record = markAttendance(req.petAuth.user, {
      employee_id: vString(req.body.employee_id, 'employee_id', { min: 1, max: 80 }),
      date: vString(req.body.date, 'date', { min: 10, max: 10 }),
      status: vEnum(req.body.status, 'status', ATTENDANCE_STATUSES),
      remarks: vOptionalString(req.body.remarks, 'remarks', { max: 300 }),
    }, clientIp(req));
    ok(res, { record });
  } catch (err) { next(err); }
});

/** Admin: monthly per-employee summary (?month=YYYY-MM). */
router.get('/summary', requireMainAdmin, (req, res, next) => {
  try {
    const month = vOptionalString(req.query.month, 'month', { max: 7 })
      || new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) throw Object.assign(new Error('month must be YYYY-MM.'), { status: 400, code: 'VALIDATION_ERROR' });
    ok(res, { month, summary: monthlySummary(month) });
  } catch (err) { next(err); }
});

export default router;
