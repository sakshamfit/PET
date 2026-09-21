/**
 * Task service — works both directions:
 *   MAIN ADMIN → EMPLOYEE   (always)
 *   EMPLOYEE → EMPLOYEE     (when peer task creation is enabled)
 *
 * Every status change is recorded in task_events + the audit log, in one
 * transaction. Visibility: admin sees everything; employees see tasks they
 * created or are assigned to.
 */

import { getPetDb } from '../db.js';
import { ApiError, errors } from '../../lib/respond.js';
import { petAudit, PET_AUDIT } from '../audit.js';
import config from '../../config.js';
import { newId, now, paging, notify } from './common.js';

export const TASK_STATUSES = ['pending', 'accepted', 'in_progress', 'submitted', 'completed', 'cancelled'];

/** Assignee-driven flow; creator/admin may also complete or cancel. */
const FLOW = {
  pending: ['accepted', 'in_progress', 'cancelled'],
  accepted: ['in_progress', 'cancelled'],
  in_progress: ['submitted', 'completed', 'cancelled'],
  submitted: ['completed', 'in_progress', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function getTask(id) {
  return getPetDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id);
}

function canSee(actor, task) {
  return (
    actor.role === 'main_admin' ||
    task.assigned_to_user_id === actor.id ||
    task.created_by_user_id === actor.id
  );
}

export function listTasks(actor, query = {}) {
  const db = getPetDb();
  const { limit, offset } = paging(query);
  const where = ['1=1'];
  const params = {};
  if (actor.role !== 'main_admin') {
    where.push('(assigned_to_user_id = @actor OR created_by_user_id = @actor)');
    params.actor = actor.id;
  }
  if (query.status && TASK_STATUSES.includes(query.status)) {
    where.push('status = @status');
    params.status = query.status;
  }
  if (query.assigned_to) {
    where.push('assigned_to_user_id = @assigned_to');
    params.assigned_to = query.assigned_to;
  }
  if (query.school_id) {
    where.push('school_id = @school_id');
    params.school_id = query.school_id;
  }
  if (query.student_id) {
    where.push('student_id = @student_id');
    params.student_id = query.student_id;
  }
  const base = `FROM tasks WHERE ${where.join(' AND ')}`;
  const rows = db
    .prepare(
      `SELECT * ${base}
       ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'accepted' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'submitted' THEN 3 ELSE 4 END,
         due_date IS NULL, due_date ASC, created_at DESC
       LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit, offset });
  const { c } = db.prepare(`SELECT COUNT(*) AS c ${base}`).get(params);
  return { tasks: rows, total: c, limit, offset };
}

export function createTask(actor, input, ip = '') {
  const db = getPetDb();
  const assignee = db.prepare(`SELECT * FROM users WHERE id = ? AND status = 'ACTIVE'`).get(input.assigned_to_user_id);
  if (!assignee || assignee.role !== 'employee' && assignee.role !== 'main_admin') {
    throw errors.notFound('Assignee employee not found or inactive.');
  }
  if (actor.role !== 'main_admin' && !config.pet.peerTasksEnabled) {
    throw errors.forbidden('PEER_TASKS_DISABLED', 'Peer task creation is disabled by the organization.');
  }
  if (actor.role !== 'main_admin' && assignee.id === actor.id) {
    // Self-tasks are allowed (personal reminders) — no extra rule needed.
  }
  if (input.school_id && !db.prepare('SELECT 1 FROM schools WHERE id = ?').get(input.school_id)) {
    throw errors.notFound('Linked school not found.');
  }
  if (input.student_id && !db.prepare('SELECT 1 FROM students WHERE id = ?').get(input.student_id)) {
    throw errors.notFound('Linked student not found.');
  }
  if (input.visit_id && !db.prepare('SELECT 1 FROM field_visits WHERE id = ?').get(input.visit_id)) {
    throw errors.notFound('Linked field visit not found.');
  }

  const id = newId('tsk');
  const ts = now();
  const create = db.transaction(() => {
    db.prepare(
      `INSERT INTO tasks (id, title, description, created_by_user_id, created_by_user_name,
          assigned_to_user_id, assigned_to_user_name, priority, status, due_date,
          school_id, student_id, visit_id, created_at, updated_at)
       VALUES (@id, @title, @description, @created_by, @created_by_name,
          @assigned_to, @assigned_to_name, @priority, 'pending', @due_date,
          @school_id, @student_id, @visit_id, @ts, @ts)`
    ).run({
      id,
      title: input.title,
      description: input.description || null,
      created_by: actor.id,
      created_by_name: actor.name,
      assigned_to: assignee.id,
      assigned_to_name: assignee.name,
      priority: input.priority || 'normal',
      due_date: input.due_date || null,
      school_id: input.school_id || null,
      student_id: input.student_id || null,
      visit_id: input.visit_id || null,
      ts,
    });
    db.prepare(
      `INSERT INTO task_events (id, task_id, actor_user_id, actor_user_name, event_type, from_status, to_status, note, created_at)
       VALUES (?, ?, ?, ?, 'created', NULL, 'pending', NULL, ?)`
    ).run(newId('tev'), id, actor.id, actor.name, ts);
  });
  create();

  notify(assignee.id, {
    title: 'New task assigned',
    message: `${actor.name} assigned you: ${input.title}`,
    type: 'task',
    linkType: 'task',
    linkId: id,
  });
  petAudit({
    actorType: actor.role,
    actorId: actor.id,
    actorLabel: actor.name,
    action: PET_AUDIT.TASK_CREATED,
    targetType: 'task',
    targetId: id,
    metadata: { assignee: assignee.name, priority: input.priority || 'normal' },
    ip,
  });
  return getTask(id);
}

export function changeTaskStatus(actor, id, toStatus, note = '', ip = '') {
  const db = getPetDb();
  const task = getTask(id);
  if (!task) throw errors.notFound('Task not found.');
  if (!TASK_STATUSES.includes(toStatus)) {
    throw new ApiError(400, 'VALIDATION_ERROR', `status must be one of: ${TASK_STATUSES.join(', ')}.`);
  }

  const isAssignee = task.assigned_to_user_id === actor.id;
  const isCreator = task.created_by_user_id === actor.id;
  const isAdmin = actor.role === 'main_admin';

  const allowed = FLOW[task.status] || [];
  if (!allowed.includes(toStatus)) {
    throw errors.conflict(
      'INVALID_TRANSITION',
      `Cannot move task from '${task.status}' to '${toStatus}'.`
    );
  }
  if (toStatus === 'cancelled' && !isCreator && !isAdmin) {
    throw errors.forbidden('FORBIDDEN', 'Only the creator or Main Admin can cancel a task.');
  }
  if (!isAdmin && !isAssignee) {
    throw errors.forbidden('FORBIDDEN', 'Only the assignee can update this task status.');
  }

  const ts = now();
  const completedAt = toStatus === 'completed' ? ts : null;
  const change = db.transaction(() => {
    db.prepare(
      `UPDATE tasks SET status = @status, updated_at = @ts,
         completed_at = COALESCE(@completed, completed_at)
       WHERE id = @id`
    ).run({ id, status: toStatus, ts, completed: completedAt });
    db.prepare(
      `INSERT INTO task_events (id, task_id, actor_user_id, actor_user_name, event_type, from_status, to_status, note, created_at)
       VALUES (?, ?, ?, ?, 'status_change', ?, ?, ?, ?)`
    ).run(newId('tev'), id, actor.id, actor.name, task.status, toStatus, note || null, ts);
  });
  change();

  petAudit({
    actorType: actor.role,
    actorId: actor.id,
    actorLabel: actor.name,
    action: PET_AUDIT.TASK_STATUS_CHANGED,
    targetType: 'task',
    targetId: id,
    metadata: { from_status: task.status, to_status: toStatus },
    ip,
  });
  if (isAssignee && task.created_by_user_id !== actor.id) {
    notify(task.created_by_user_id, {
      title: 'Task updated',
      message: `${actor.name} moved "${task.title}" → ${toStatus}.`,
      type: 'task',
      linkType: 'task',
      linkId: id,
    });
  }
  return getTask(id);
}

/** Reassign — Main Admin only. */
export function reassignTask(actor, id, newAssigneeId, note = '', ip = '') {
  const db = getPetDb();
  const task = getTask(id);
  if (!task) throw errors.notFound('Task not found.');
  if (['completed', 'cancelled'].includes(task.status)) {
    throw errors.conflict('TASK_CLOSED', 'Closed tasks cannot be reassigned.');
  }
  const assignee = db.prepare(`SELECT * FROM users WHERE id = ? AND status = 'ACTIVE'`).get(newAssigneeId);
  if (!assignee) throw errors.notFound('New assignee not found or inactive.');

  const ts = now();
  const move = db.transaction(() => {
    db.prepare(
      `UPDATE tasks SET assigned_to_user_id = ?, assigned_to_user_name = ?,
         status = CASE WHEN status IN ('submitted') THEN status ELSE 'pending' END, updated_at = ? WHERE id = ?`
    ).run(assignee.id, assignee.name, ts, id);
    db.prepare(
      `INSERT INTO task_events (id, task_id, actor_user_id, actor_user_name, event_type, from_status, to_status, note, created_at)
       VALUES (?, ?, ?, ?, 'reassigned', ?, 'pending', ?, ?)`
    ).run(newId('tev'), id, actor.id, actor.name, task.status, note || null, ts);
  });
  move();

  notify(assignee.id, {
    title: 'Task reassigned to you',
    message: `${actor.name} reassigned: ${task.title}`,
    type: 'task',
    linkType: 'task',
    linkId: id,
  });
  petAudit({
    actorType: actor.role,
    actorId: actor.id,
    actorLabel: actor.name,
    action: PET_AUDIT.TASK_REASSIGNED,
    targetType: 'task',
    targetId: id,
    metadata: { from: task.assigned_to_user_name, to: assignee.name },
    ip,
  });
  return getTask(id);
}

export function getTaskWithEvents(actor, id) {
  const db = getPetDb();
  const task = getTask(id);
  if (!task) throw errors.notFound('Task not found.');
  if (!canSee(actor, task)) throw errors.forbidden('FORBIDDEN', 'You do not have access to this task.');
  const events = db.prepare('SELECT * FROM task_events WHERE task_id = ? ORDER BY created_at ASC').all(id);
  return { task, events };
}
