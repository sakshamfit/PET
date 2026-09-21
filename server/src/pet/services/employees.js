/**
 * Employee management service (Main Admin operated).
 *
 * Secure provisioning: a temporary password is generated and returned ONCE
 * to the Main Admin; only its scrypt hash is persisted. The employee is
 * forced to change it on first login. Deactivation revokes all sessions and
 * preserves history (employees are never hard-deleted).
 */

import { getPetDb } from '../db.js';
import { hashPassword, generateTemporaryPassword } from '../../lib/crypto.js';
import { ApiError, errors } from '../../lib/respond.js';
import { petAudit, PET_AUDIT } from '../audit.js';
import { revokeAllPetSessionsFor } from '../tokens.js';
import { newId, now, publicUser, nextEmployeeCode, paging, likeEscape } from './common.js';

export function getUserById(id) {
  return getPetDb().prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function listEmployees(query = {}) {
  const db = getPetDb();
  const { limit, offset } = paging(query);
  const where = [`role = 'employee'`];
  const params = {};
  if (query.status && ['ACTIVE', 'DISABLED'].includes(query.status)) {
    where.push('status = @status');
    params.status = query.status;
  }
  if (query.q) {
    where.push(`(name LIKE @q ESCAPE '\\' OR email LIKE @q ESCAPE '\\' OR employee_code LIKE @q ESCAPE '\\')`);
    params.q = `%${likeEscape(query.q)}%`;
  }
  const sql = `SELECT * FROM users WHERE ${where.join(' AND ')} ORDER BY name COLLATE NOCASE LIMIT @limit OFFSET @offset`;
  const countSql = `SELECT COUNT(*) AS c FROM users WHERE ${where.join(' AND ')}`;
  const rows = db.prepare(sql).all({ ...params, limit, offset });
  const { c } = db.prepare(countSql).get(params);
  return { employees: rows.map(publicUser), total: c, limit, offset };
}

/**
 * Create an employee account. Returns { user, temporaryPassword } — the
 * plaintext temporary password is never stored and never logged.
 */
export function createEmployee(actor, input, ip = '') {
  const db = getPetDb();
  const existing = db.prepare('SELECT 1 FROM users WHERE email = ?').get(input.email);
  if (existing) throw errors.conflict('EMAIL_TAKEN', 'An account with this email already exists.');

  const id = newId('usr');
  const code = nextEmployeeCode(db);
  const temporaryPassword = generateTemporaryPassword();
  const ts = now();
  db.prepare(
    `INSERT INTO users (id, name, email, phone, role, employee_code, password_hash,
        must_change_password, status, department, team_id, joining_date, created_at, updated_at)
     VALUES (@id, @name, @email, @phone, 'employee', @code, @hash, 1, 'ACTIVE',
        @department, @team_id, @joining_date, @ts, @ts)`
  ).run({
    id,
    name: input.name,
    email: input.email,
    phone: input.phone || null,
    code,
    hash: hashPassword(temporaryPassword),
    department: input.department || null,
    team_id: input.team_id || null,
    joining_date: input.joining_date || ts.slice(0, 10),
    ts,
  });

  petAudit({
    actorType: actor.role,
    actorId: actor.id,
    actorLabel: actor.name,
    action: PET_AUDIT.EMPLOYEE_CREATED,
    targetType: 'user',
    targetId: id,
    metadata: { employee_code: code, email: input.email },
    ip,
  });

  return { user: publicUser(getUserById(id)), temporaryPassword };
}

export function updateEmployee(actor, id, input, ip = '') {
  const db = getPetDb();
  const target = getUserById(id);
  if (!target || target.role !== 'employee') throw errors.notFound('Employee not found.');

  if (input.email && input.email !== target.email) {
    const clash = db.prepare('SELECT 1 FROM users WHERE email = ? AND id != ?').get(input.email, id);
    if (clash) throw errors.conflict('EMAIL_TAKEN', 'An account with this email already exists.');
  }

  db.prepare(
    `UPDATE users SET name = @name, email = @email, phone = @phone, department = @department,
       team_id = @team_id, joining_date = @joining_date, updated_at = @ts
     WHERE id = @id`
  ).run({
    id,
    name: input.name ?? target.name,
    email: input.email ?? target.email,
    phone: input.phone === undefined ? target.phone : input.phone,
    department: input.department === undefined ? target.department : input.department,
    team_id: input.team_id === undefined ? target.team_id : input.team_id,
    joining_date: input.joining_date === undefined ? target.joining_date : input.joining_date,
    ts: now(),
  });

  petAudit({
    actorType: actor.role,
    actorId: actor.id,
    actorLabel: actor.name,
    action: PET_AUDIT.EMPLOYEE_UPDATED,
    targetType: 'user',
    targetId: id,
    metadata: input,
    ip,
  });
  return publicUser(getUserById(id));
}

/**
 * Activate/deactivate an employee. Deactivation immediately revokes all
 * live sessions; history is preserved (no deletion).
 */
export function setEmployeeStatus(actor, id, status, ip = '') {
  const db = getPetDb();
  const target = getUserById(id);
  if (!target || target.role !== 'employee') throw errors.notFound('Employee not found.');
  if (!['ACTIVE', 'DISABLED'].includes(status)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'status must be ACTIVE or DISABLED.');
  }
  const ts = now();
  const change = db.transaction(() => {
    db.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?').run(status, ts, id);
    if (status === 'DISABLED') revokeAllPetSessionsFor(id);
  });
  change();

  petAudit({
    actorType: actor.role,
    actorId: actor.id,
    actorLabel: actor.name,
    action: status === 'DISABLED' ? PET_AUDIT.EMPLOYEE_DEACTIVATED : PET_AUDIT.EMPLOYEE_REACTIVATED,
    targetType: 'user',
    targetId: id,
    ip,
  });
  return publicUser(getUserById(id));
}

/**
 * Main-Admin-initiated access reset: new temporary password (returned once),
 * must-change flag set, every session revoked. The previous password is
 * never displayed or recoverable.
 */
export function resetEmployeeAccess(actor, id, ip = '') {
  const db = getPetDb();
  const target = getUserById(id);
  if (!target || target.role !== 'employee') throw errors.notFound('Employee not found.');

  const temporaryPassword = generateTemporaryPassword();
  const doReset = db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = ? WHERE id = ?')
      .run(hashPassword(temporaryPassword), now(), id);
    revokeAllPetSessionsFor(id);
  });
  doReset();

  petAudit({
    actorType: actor.role,
    actorId: actor.id,
    actorLabel: actor.name,
    action: PET_AUDIT.CREDENTIAL_RESET,
    targetType: 'user',
    targetId: id,
    ip,
  });
  return { user: publicUser(getUserById(id)), temporaryPassword };
}

/** Self-service password change (requires current password). */
export function changeOwnPassword(user, currentPassword, newPasswordHash) {
  const db = getPetDb();
  const doChange = db.transaction(() => {
    db.prepare(
      'UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?'
    ).run(newPasswordHash, now(), user.id);
    // Every session (including the caller's) is revoked; the client signs
    // back in with the new password. Matches the reset guarantee.
    revokeAllPetSessionsFor(user.id);
  });
  doChange();
  petAudit({
    actorType: user.role,
    actorId: user.id,
    actorLabel: user.name,
    action: PET_AUDIT.PASSWORD_CHANGED,
    targetType: 'user',
    targetId: user.id,
  });
}
