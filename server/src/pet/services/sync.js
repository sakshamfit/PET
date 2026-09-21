/**
 * Offline sync service — field work continues in weak network environments.
 *
 * The client queues mutations with an idempotency key; the server recognizes
 * previously processed keys and returns the ORIGINAL result instead of
 * creating duplicates (students, visits, attendance, tasks).
 *
 * Each operation is processed inside its own SQLite transaction; one bad
 * operation never blocks the rest of the queue.
 */

import { getPetDb } from '../db.js';
import { newId, now } from './common.js';
import { petAudit, PET_AUDIT } from '../audit.js';
import { registerStudent } from './students.js';
import { checkIn, checkOut } from './attendance.js';
import { startVisit, endVisit } from './visits.js';
import { createTask, changeTaskStatus } from './tasks.js';
import { registerFieldMedia } from './uploads.js';

/** Queue operation vocabulary. Payloads mirror the online endpoints. */
const OPERATIONS = {
  'student.register': (actor, p, ip) => registerStudent(actor, { ...p, acknowledge_duplicates: true }, ip),
  'attendance.check_in': (actor, p, ip) => checkIn(actor, p, ip),
  'attendance.check_out': (actor, p, ip) => checkOut(actor, p, ip),
  'visit.start': (actor, p, ip) => startVisit(actor, p, ip),
  'visit.end': (actor, p, ip) => endVisit(actor, p.visit_id, p, ip),
  'task.create': (actor, p, ip) => createTask(actor, p, ip),
  'task.status': (actor, p, ip) => changeTaskStatus(actor, p.task_id, p.status, p.note, ip),
  'media.register': (actor, p, ip) => registerFieldMedia(actor, p, ip),
};

function entityOf(result) {
  if (result && typeof result === 'object') {
    if (result.student) return { entity_type: 'student', entity_id: result.student.id, out: result.student };
    if (result.record) return { entity_type: 'employee_attendance', entity_id: result.record.id, out: result.record };
    if (result.id && result.started_at) return { entity_type: 'field_visit', entity_id: result.id, out: result };
    if (result.id && result.title !== undefined && result.assigned_to_user_id) return { entity_type: 'task', entity_id: result.id, out: result };
    if (result.id && result.relative_path) return { entity_type: 'field_media', entity_id: result.id, out: result };
  }
  return { entity_type: null, entity_id: null, out: result };
}

/**
 * Process a batch of queued operations for the authenticated employee.
 * Returns one result per operation in request order. Duplicate submissions
 * of the same idempotency key return the stored original result with
 * `deduplicated: true`.
 */
export function processSyncBatch(actor, operations, ip = '') {
  const db = getPetDb();
  const results = [];

  for (const op of operations) {
    const key = `${actor.id}:${op.idempotency_key}`;
    const existing = db.prepare('SELECT * FROM sync_operations WHERE idempotency_key = ?').get(key);
    if (existing && existing.status === 'completed') {
      results.push({
        idempotency_key: op.idempotency_key,
        status: 'ok',
        deduplicated: true,
        result: existing.result_json ? JSON.parse(existing.result_json) : null,
      });
      continue;
    }

    const handler = OPERATIONS[op.type];
    if (!handler) {
      results.push({ idempotency_key: op.idempotency_key, status: 'error', code: 'UNKNOWN_OPERATION', message: `Unknown operation type '${op.type}'.` });
      continue;
    }

    const record = {
      id: newId('syn'),
      key,
      user_id: actor.id,
      op_type: op.type,
      entity_type: null,
      entity_id: null,
      status: 'completed',
      result_json: null,
      error: null,
    };

    try {
      const run = db.transaction(() => handler(actor, op.payload || {}, ip));
      const raw = run();
      const { entity_type, entity_id, out } = entityOf(raw);
      record.entity_type = entity_type;
      record.entity_id = entity_id;
      record.result_json = JSON.stringify(out ?? null);
      db.prepare(
        `INSERT INTO sync_operations (id, idempotency_key, user_id, operation_type, entity_type, entity_id, status, result_json, created_at)
         VALUES (@id, @key, @user_id, @op_type, @entity_type, @entity_id, @status, @result_json, @ts)`
      ).run({ ...record, ts: now() });
      results.push({
        idempotency_key: op.idempotency_key,
        status: 'ok',
        deduplicated: false,
        result: out ?? null,
      });
    } catch (err) {
      record.status = 'failed';
      record.error = (err.message || 'error').slice(0, 300);
      try {
        db.prepare(
          `INSERT INTO sync_operations (id, idempotency_key, user_id, operation_type, status, error, created_at)
           VALUES (@id, @key, @user_id, @op_type, @status, @error, @ts)
           ON CONFLICT(idempotency_key) DO UPDATE SET status = @status, error = @error`
        ).run({ ...record, ts: now() });
      } catch { /* best effort */ }
      results.push({
        idempotency_key: op.idempotency_key,
        status: 'error',
        code: err.code || 'OPERATION_FAILED',
        message: err.message || 'Operation failed.',
      });
    }
  }

  petAudit({
    actorType: actor.role, actorId: actor.id, actorLabel: actor.name,
    action: PET_AUDIT.SYNC_PROCESSED, targetType: 'sync', targetId: null,
    metadata: {
      total: operations.length,
      ok: results.filter(r => r.status === 'ok').length,
      failed: results.filter(r => r.status === 'error').length,
    },
    ip,
  });
  return { results, processed_at: now() };
}
