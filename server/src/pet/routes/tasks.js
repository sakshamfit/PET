/**
 * /api/tasks — create (admin↔employee / employee→employee), status flow,
 * reassignment and audit events.
 */

import { Router } from 'express';
import { ok } from '../../lib/respond.js';
import { assertAllowedKeys, vOptionalString, vString, vEnum } from '../../lib/validate.js';
import { requirePetAuth, requireMainAdmin } from '../auth.js';
import { clientIp } from '../../middleware/auth.js';
import {
  listTasks, createTask, changeTaskStatus, reassignTask, getTaskWithEvents, TASK_STATUSES,
} from '../services/tasks.js';

const router = Router();
router.use(requirePetAuth);

router.get('/', (req, res, next) => {
  try { ok(res, listTasks(req.petAuth.user, req.query)); } catch (err) { next(err); }
});

router.post('/', (req, res, next) => {
  try {
    assertAllowedKeys(req.body, [
      'title', 'description', 'assigned_to_user_id', 'priority', 'due_date',
      'school_id', 'student_id', 'visit_id',
    ]);
    const input = {
      title: vString(req.body.title, 'title', { min: 2, max: 200 }),
      description: vOptionalString(req.body.description, 'description', { max: 2000 }) || null,
      assigned_to_user_id: vString(req.body.assigned_to_user_id, 'assigned_to_user_id', { min: 1, max: 80 }),
      priority: vOptionalString(req.body.priority, 'priority', { max: 10 }) || 'normal',
      due_date: vOptionalString(req.body.due_date, 'due_date', { max: 10 }) || null,
      school_id: vOptionalString(req.body.school_id, 'school_id', { max: 80 }) || null,
      student_id: vOptionalString(req.body.student_id, 'student_id', { max: 80 }) || null,
      visit_id: vOptionalString(req.body.visit_id, 'visit_id', { max: 80 }) || null,
    };
    if (input.priority && !['low', 'normal', 'high', 'urgent'].includes(input.priority)) {
      input.priority = 'normal';
    }
    ok(res, { task: createTask(req.petAuth.user, input, clientIp(req)) }, 201);
  } catch (err) { next(err); }
});

router.get('/:id', (req, res, next) => {
  try { ok(res, getTaskWithEvents(req.petAuth.user, req.params.id)); } catch (err) { next(err); }
});

router.post('/:id/status', (req, res, next) => {
  try {
    assertAllowedKeys(req.body, ['status', 'note']);
    const status = vEnum(req.body.status, 'status', TASK_STATUSES);
    const note = vOptionalString(req.body.note, 'note', { max: 500 });
    ok(res, { task: changeTaskStatus(req.petAuth.user, req.params.id, status, note, clientIp(req)) });
  } catch (err) { next(err); }
});

router.post('/:id/reassign', requireMainAdmin, (req, res, next) => {
  try {
    assertAllowedKeys(req.body, ['assigned_to_user_id', 'note']);
    const assignee = vString(req.body.assigned_to_user_id, 'assigned_to_user_id', { min: 1, max: 80 });
    const note = vOptionalString(req.body.note, 'note', { max: 500 });
    ok(res, { task: reassignTask(req.petAuth.user, req.params.id, assignee, note, clientIp(req)) });
  } catch (err) { next(err); }
});

export default router;
