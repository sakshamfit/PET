/**
 * PET audit logging — same hard rule as the control plane:
 * secrets are never written to the log; suspicious keys are redacted.
 * Every important mutation records actor, action, target, metadata, time.
 */

import { getPetDb } from './db.js';
import { sanitizeMetadata } from '../lib/audit.js';

/**
 * Write a PET audit entry. Never throws — auditing must not break requests.
 *
 * @param {object} entry
 * @param {'main_admin'|'employee'|'system'|null} entry.actorType
 * @param {string|null} entry.actorId
 * @param {string|null} entry.actorLabel
 * @param {string} entry.action           e.g. 'STUDENT_REGISTERED'
 * @param {string|null} entry.targetType  e.g. 'student'
 * @param {string|null} entry.targetId
 * @param {object|null} entry.metadata    automatically redacted
 * @param {string|null} entry.ip
 */
export function petAudit(entry) {
  try {
    getPetDb()
      .prepare(
        `INSERT INTO audit_logs
           (actor_type, actor_id, actor_label, action, target_type, target_id, metadata, ip, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        entry.actorType || null,
        entry.actorId || null,
        entry.actorLabel ? String(entry.actorLabel).slice(0, 200) : null,
        String(entry.action).slice(0, 80),
        entry.targetType ? String(entry.targetType).slice(0, 80) : null,
        entry.targetId ? String(entry.targetId).slice(0, 120) : null,
        entry.metadata ? JSON.stringify(sanitizeMetadata(entry.metadata)) : null,
        entry.ip || null,
        new Date().toISOString()
      );
  } catch (err) {
    console.error('[pet-audit] failed to write entry:', err.message);
  }
}

/** Standard PET action vocabulary. */
export const PET_AUDIT = {
  LOGIN: 'PET_LOGIN',
  LOGIN_FAILED: 'PET_LOGIN_FAILED',
  LOGOUT: 'PET_LOGOUT',
  PASSWORD_CHANGED: 'PET_PASSWORD_CHANGED',
  EMPLOYEE_CREATED: 'PET_EMPLOYEE_CREATED',
  EMPLOYEE_UPDATED: 'PET_EMPLOYEE_UPDATED',
  EMPLOYEE_DEACTIVATED: 'PET_EMPLOYEE_DEACTIVATED',
  EMPLOYEE_REACTIVATED: 'PET_EMPLOYEE_REACTIVATED',
  CREDENTIAL_RESET: 'PET_CREDENTIAL_RESET',
  SESSION_REVOKED: 'PET_SESSION_REVOKED',
  REFRESH_REPLAY_DETECTED: 'PET_REFRESH_REPLAY_DETECTED',
  SCHOOL_CREATED: 'PET_SCHOOL_CREATED',
  SCHOOL_UPDATED: 'PET_SCHOOL_UPDATED',
  SCHOOL_ARCHIVED: 'PET_SCHOOL_ARCHIVED',
  STUDENT_REGISTERED: 'PET_STUDENT_REGISTERED',
  STUDENT_UPDATED: 'PET_STUDENT_UPDATED',
  STUDENT_STATUS_CHANGED: 'PET_STUDENT_STATUS_CHANGED',
  STUDENT_DUPLICATE_ACKNOWLEDGED: 'PET_STUDENT_DUPLICATE_ACKNOWLEDGED',
  VISIT_STARTED: 'PET_VISIT_STARTED',
  VISIT_ENDED: 'PET_VISIT_ENDED',
  MEDIA_UPLOADED: 'PET_MEDIA_UPLOADED',
  STUDENT_DOCUMENT_UPLOADED: 'PET_STUDENT_DOCUMENT_UPLOADED',
  TASK_CREATED: 'PET_TASK_CREATED',
  TASK_STATUS_CHANGED: 'PET_TASK_STATUS_CHANGED',
  TASK_REASSIGNED: 'PET_TASK_REASSIGNED',
  MESSAGE_SENT: 'PET_MESSAGE_SENT',
  ATTENDANCE_CHECK_IN: 'PET_ATTENDANCE_CHECK_IN',
  ATTENDANCE_CHECK_OUT: 'PET_ATTENDANCE_CHECK_OUT',
  ATTENDANCE_MARKED: 'PET_ATTENDANCE_MARKED',
  TEST_CREATED: 'PET_TEST_CREATED',
  TEST_UPDATED: 'PET_TEST_UPDATED',
  TEST_STUDENTS_ASSIGNED: 'PET_TEST_STUDENTS_ASSIGNED',
  TEST_MARKS_ENTERED: 'PET_TEST_MARKS_ENTERED',
  TEST_FINALIZED: 'PET_TEST_FINALIZED',
  STUDENT_EVALUATED: 'PET_STUDENT_EVALUATED',
  SELECTION_DECIDED: 'PET_SELECTION_DECIDED',
  ENROLLMENT_STARTED: 'PET_ENROLLMENT_STARTED',
  ENROLLMENT_STAGE_CHANGED: 'PET_ENROLLMENT_STAGE_CHANGED',
  ENROLLMENT_COMPLETED: 'PET_ENROLLMENT_COMPLETED',
  WEBSITE_FORM_RECEIVED: 'PET_WEBSITE_FORM_RECEIVED',
  WEBSITE_FORM_ASSIGNED: 'PET_WEBSITE_FORM_ASSIGNED',
  WEBSITE_FORM_CONVERTED: 'PET_WEBSITE_FORM_CONVERTED',
  WEBSITE_FORM_CLOSED: 'PET_WEBSITE_FORM_CLOSED',
  SYNC_PROCESSED: 'PET_SYNC_PROCESSED',
  BACKUP_CREATED: 'PET_BACKUP_CREATED',
  RESTORE_COMPLETED: 'PET_RESTORE_COMPLETED',
  SETTINGS_UPDATED: 'PET_SETTINGS_UPDATED',
};
