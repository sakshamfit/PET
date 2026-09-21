/**
 * /api/me — authenticated user's own profile, dashboard, notifications,
 * team directory and unread counts.
 */

import { Router } from 'express';
import { ok, errors } from '../../lib/respond.js';
import { requirePetAuth } from '../auth.js';
import { publicUser } from '../services/common.js';
import { employeeDashboard, myNotifications, markNotificationsRead, teamDirectory } from '../services/reports.js';
import { getTodayRecord } from '../services/attendance.js';

const router = Router();
router.use(requirePetAuth);

router.get('/', (req, res, next) => {
  try {
    ok(res, { user: publicUser(req.petAuth.user) });
  } catch (err) { next(err); }
});

router.get('/dashboard', (req, res, next) => {
  try {
    ok(res, employeeDashboard(req.petAuth.user));
  } catch (err) { next(err); }
});

router.get('/attendance/today', (req, res, next) => {
  try {
    ok(res, { record: getTodayRecord(req.petAuth.user.id) || null });
  } catch (err) { next(err); }
});

router.get('/notifications', (req, res, next) => {
  try {
    ok(res, myNotifications(req.petAuth.user, req.query));
  } catch (err) { next(err); }
});

router.post('/notifications/read', (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
    markNotificationsRead(req.petAuth.user, ids);
    ok(res, { read: true });
  } catch (err) { next(err); }
});

/** Active team members (for chat + task assignment pickers). */
router.get('/directory', (req, res, next) => {
  try {
    ok(res, { members: teamDirectory(req.petAuth.user) });
  } catch (err) { next(err); }
});

export default router;
