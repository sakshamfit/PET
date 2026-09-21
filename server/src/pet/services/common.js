/**
 * Shared helpers for the PET service layer.
 * Services own all SQL and transactions; routes stay free of raw SQL.
 */

import { getPetDb } from '../db.js';
import { randomId } from '../../lib/crypto.js';

export const now = () => new Date().toISOString();
export const newId = prefix => randomId(prefix);

/** Parse ?limit/?offset with hard caps. */
export function paging(query, { defaultLimit = 50, maxLimit = 200 } = {}) {
  let limit = parseInt(query?.limit ?? '', 10);
  let offset = parseInt(query?.offset ?? '', 10);
  if (!Number.isFinite(limit) || limit < 1) limit = defaultLimit;
  if (limit > maxLimit) limit = maxLimit;
  if (!Number.isFinite(offset) || offset < 0) offset = 0;
  return { limit, offset };
}

/** LIKE-escape a user search fragment. */
export function likeEscape(s) {
  return String(s).replace(/[\\%_]/g, c => `\\${c}`);
}

/**
 * Generate the next permanent PET Student ID: PET-YYYY-NNNNN.
 * Uses the counters table inside the caller's transaction, so concurrent
 * registrations can never receive the same id.
 */
export function nextPetStudentId(db = getPetDb()) {
  const year = new Date().getFullYear();
  const key = `pet_student_id:${year}`;
  db.prepare(`INSERT INTO counters (name, value) VALUES (?, 0) ON CONFLICT(name) DO NOTHING`).run(key);
  db.prepare(`UPDATE counters SET value = value + 1 WHERE name = ?`).run(key);
  const { value } = db.prepare(`SELECT value FROM counters WHERE name = ?`).get(key);
  return `PET-${year}-${String(value).padStart(5, '0')}`;
}

/** Generate a unique school code like SCH-4821 (retries on collision). */
export function nextSchoolCode(db = getPetDb()) {
  const exists = code => !!db.prepare('SELECT 1 FROM schools WHERE school_code = ?').get(code);
  for (let i = 0; i < 50; i++) {
    const code = `SCH-${Math.floor(1000 + Math.random() * 9000)}`;
    if (!exists(code)) return code;
  }
  return `SCH-${Date.now().toString(36).toUpperCase()}`;
}

/** Generate the next employee code: EMP-NNN. */
export function nextEmployeeCode(db = getPetDb()) {
  db.prepare(
    `INSERT INTO counters (name, value) VALUES ('employee_code', 0) ON CONFLICT(name) DO NOTHING`
  ).run();
  db.prepare(`UPDATE counters SET value = value + 1 WHERE name = 'employee_code'`).run();
  const { value } = db.prepare(`SELECT value FROM counters WHERE name = 'employee_code'`).get();
  return `EMP-${String(value).padStart(3, '0')}`;
}

/** Create an in-app notification for a PET user. Never throws. */
export function notify(userId, { title, message, type = 'info', linkType = null, linkId = null }) {
  try {
    getPetDb()
      .prepare(
        `INSERT INTO notifications (id, user_id, title, message, type, is_read, link_type, link_id, created_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`
      )
      .run(newId('ntf'), userId, String(title).slice(0, 200), String(message).slice(0, 500), type, linkType, linkId, now());
  } catch (err) {
    console.error('[pet-notify] failed:', err.message);
  }
}

/** Users serializer — never exposes password_hash or lockout internals. */
export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone || null,
    role: u.role,
    employee_code: u.employee_code || null,
    status: u.status,
    department: u.department || null,
    team_id: u.team_id || null,
    photo_path: u.photo_path || null,
    joining_date: u.joining_date || null,
    must_change_password: !!u.must_change_password,
    created_at: u.created_at,
    updated_at: u.updated_at,
  };
}

export function publicStudent(s) {
  if (!s) return null;
  const { ...rest } = s;
  return rest; // students table contains no credentials; expose the full record.
}
