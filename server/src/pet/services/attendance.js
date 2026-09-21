/**
 * Employee attendance service.
 *
 * Check In → work → Check Out. Statuses: present, absent, leave, half_day,
 * late. Location check-in is optional and event-based only. Admin can mark
 * absences/leave. One record per employee per date (UNIQUE constraint).
 */

import { getPetDb } from '../db.js';
import { ApiError, errors } from '../../lib/respond.js';
import { petAudit, PET_AUDIT } from '../audit.js';
import config from '../../config.js';
import { newId, now, paging } from './common.js';

export const ATTENDANCE_STATUSES = ['present', 'absent', 'leave', 'half_day', 'late'];

function todayLocal() {
  return new Date().toISOString().slice(0, 10);
}

/** Determine whether a check-in is LATE per org work-start policy. */
function computeCheckInStatus(checkInIso) {
  const [hh, mm] = String(config.pet.workStartTime || '10:00').split(':').map(Number);
  const d = new Date(checkInIso);
  const limit = new Date(d);
  limit.setHours(hh, mm + (config.pet.workStartGraceMinutes || 0), 0, 0);
  return d > limit ? 'late' : 'present';
}

export function getTodayRecord(employeeId, date = todayLocal()) {
  return getPetDb()
    .prepare('SELECT * FROM employee_attendance WHERE employee_id = ? AND date = ?')
    .get(employeeId, date);
}

/** Employee self check-in. Idempotent for the day (returns existing record). */
export function checkIn(actor, { latitude = null, longitude = null, date = null } = {}, ip = '') {
  const db = getPetDb();
  const day = date || todayLocal();
  const existing = getTodayRecord(actor.id, day);
  if (existing && existing.check_in_at) {
    return { record: existing, alreadyCheckedIn: true };
  }
  const ts = now();
  const status = computeCheckInStatus(ts);
  if (existing) {
    db.prepare(
      `UPDATE employee_attendance SET check_in_at = ?, status = ?, latitude = ?, longitude = ?, updated_at = ?
       WHERE id = ?`
    ).run(ts, existing.status === 'leave' ? 'leave' : status, latitude, longitude, ts, existing.id);
  } else {
    db.prepare(
      `INSERT INTO employee_attendance (id, employee_id, employee_name, date, check_in_at, status, latitude, longitude, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(newId('att'), actor.id, actor.name, day, ts, status, latitude, longitude, ts, ts);
  }
  petAudit({
    actorType: actor.role,
    actorId: actor.id,
    actorLabel: actor.name,
    action: PET_AUDIT.ATTENDANCE_CHECK_IN,
    targetType: 'employee_attendance',
    targetId: actor.id,
    metadata: { date: day, status },
    ip,
  });
  return { record: getTodayRecord(actor.id, day), alreadyCheckedIn: false };
}

/** Employee self check-out. Requires a check-in first. */
export function checkOut(actor, { latitude = null, longitude = null, date = null } = {}, ip = '') {
  const db = getPetDb();
  const day = date || todayLocal();
  const existing = getTodayRecord(actor.id, day);
  if (!existing || !existing.check_in_at) {
    throw errors.conflict('NOT_CHECKED_IN', 'Check in before checking out.');
  }
  if (existing.check_out_at) {
    return { record: existing, alreadyCheckedOut: true };
  }
  const ts = now();
  db.prepare('UPDATE employee_attendance SET check_out_at = ?, updated_at = ? WHERE id = ?').run(ts, ts, existing.id);
  petAudit({
    actorType: actor.role,
    actorId: actor.id,
    actorLabel: actor.name,
    action: PET_AUDIT.ATTENDANCE_CHECK_OUT,
    targetType: 'employee_attendance',
    targetId: actor.id,
    metadata: { date: day },
    ip,
  });
  return { record: getTodayRecord(actor.id, day), alreadyCheckedOut: false };
}

/** Main Admin marks a record (absent/leave/half_day/present) for a day. */
export function markAttendance(actor, { employee_id, date, status, remarks = '' }, ip = '') {
  const db = getPetDb();
  if (!ATTENDANCE_STATUSES.includes(status)) {
    throw new ApiError(400, 'VALIDATION_ERROR', `status must be one of: ${ATTENDANCE_STATUSES.join(', ')}.`);
  }
  const employee = db.prepare('SELECT * FROM users WHERE id = ?').get(employee_id);
  if (!employee || employee.role !== 'employee') throw errors.notFound('Employee not found.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'date must be YYYY-MM-DD.');
  }
  const ts = now();
  const existing = getTodayRecord(employee_id, date);
  if (existing) {
    db.prepare(
      'UPDATE employee_attendance SET status = ?, remarks = ?, marked_by_user_id = ?, updated_at = ? WHERE id = ?'
    ).run(status, remarks || null, actor.id, ts, existing.id);
  } else {
    db.prepare(
      `INSERT INTO employee_attendance (id, employee_id, employee_name, date, status, remarks, marked_by_user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(newId('att'), employee_id, employee.name, date, status, remarks || null, actor.id, ts, ts);
  }
  petAudit({
    actorType: actor.role,
    actorId: actor.id,
    actorLabel: actor.name,
    action: PET_AUDIT.ATTENDANCE_MARKED,
    targetType: 'employee_attendance',
    targetId: employee_id,
    metadata: { date, status },
    ip,
  });
  return getTodayRecord(employee_id, date);
}

/** History & admin reporting. */
export function listAttendance(actor, query = {}) {
  const db = getPetDb();
  const { limit, offset } = paging(query, { defaultLimit: 100 });
  const where = ['1=1'];
  const params = {};
  if (actor.role !== 'main_admin') {
    where.push('a.employee_id = @actor');
    params.actor = actor.id;
  } else if (query.employee_id) {
    where.push('a.employee_id = @employee_id');
    params.employee_id = query.employee_id;
  }
  if (query.date) {
    where.push('a.date = @date');
    params.date = query.date;
  }
  if (query.from) {
    where.push('a.date >= @from');
    params.from = query.from;
  }
  if (query.to) {
    where.push('a.date <= @to');
    params.to = query.to;
  }
  const base = `FROM employee_attendance a WHERE ${where.join(' AND ')}`;
  const rows = db
    .prepare(`SELECT a.* ${base} ORDER BY a.date DESC, a.employee_name LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit, offset });
  const { c } = db.prepare(`SELECT COUNT(*) AS c ${base}`).get(params);
  return { attendance: rows, total: c, limit, offset };
}

/** Monthly summary per employee (admin report). */
export function monthlySummary(month /* YYYY-MM */) {
  const db = getPetDb();
  return db
    .prepare(
      `SELECT employee_id, employee_name,
         COUNT(*) AS days_recorded,
         SUM(CASE WHEN status IN ('present','late') THEN 1 ELSE 0 END) AS days_present,
         SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) AS days_late,
         SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) AS days_absent,
         SUM(CASE WHEN status = 'leave' THEN 1 ELSE 0 END) AS days_leave,
         SUM(CASE WHEN status = 'half_day' THEN 1 ELSE 0 END) AS days_half,
         SUM(CASE WHEN check_in_at IS NOT NULL AND check_out_at IS NOT NULL
              THEN (julianday(check_out_at) - julianday(check_in_at)) * 24.0 ELSE 0 END) AS hours_worked
       FROM employee_attendance
       WHERE date LIKE @month || '-%'
       GROUP BY employee_id ORDER BY employee_name`
    )
    .all({ month });
}
