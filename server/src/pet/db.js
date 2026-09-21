/**
 * PET operational database (SQLite via better-sqlite3).
 *
 * This database stores the Purvanchal Education Trust operational data:
 * employees, students, schools (directory), field visits, tasks, chat,
 * attendance, tests, enrollments, website submissions, notifications,
 * sessions and audit logs. It is completely separate from the
 * control-plane database (licensing) and the frontend never touches it
 * directly — access is exclusively through the Express API.
 *
 * Rules enforced here (docs/PET/08):
 *   WAL mode, foreign keys ON, busy timeout.
 *   All callers use parameterized statements only.
 *   Large binary files live on the filesystem; only relative paths are
 *   stored here.
 */

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import config from '../config.js';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS organization (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  tagline       TEXT,
  address       TEXT,
  phone         TEXT,
  email         TEXT,
  logo_path     TEXT,
  settings_json TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS teams (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  description TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id                   TEXT PRIMARY KEY,
  name                 TEXT NOT NULL,
  email                TEXT NOT NULL UNIQUE COLLATE NOCASE,
  phone                TEXT,
  role                 TEXT NOT NULL CHECK (role IN ('main_admin','employee')),
  employee_code        TEXT UNIQUE COLLATE NOCASE,
  password_hash        TEXT NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  status               TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED')),
  department           TEXT,
  team_id              TEXT REFERENCES teams(id) ON DELETE SET NULL,
  photo_path           TEXT,
  joining_date         TEXT,
  failed_logins        INTEGER NOT NULL DEFAULT 0,
  locked_until         TEXT,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pet_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_pet_users_employee_code ON users(employee_code);
CREATE INDEX IF NOT EXISTS idx_pet_users_role_status ON users(role, status);

CREATE TABLE IF NOT EXISTS schools (
  id                   TEXT PRIMARY KEY,
  school_code          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name                 TEXT NOT NULL,
  address              TEXT,
  locality             TEXT,
  city                 TEXT,
  district             TEXT,
  state                TEXT,
  phone                TEXT,
  contact_person_name  TEXT,
  contact_person_phone TEXT,
  latitude             REAL,
  longitude            REAL,
  status               TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  notes                TEXT,
  created_by_user_id   TEXT,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pet_schools_name ON schools(name);
CREATE INDEX IF NOT EXISTS idx_pet_schools_district ON schools(district);
CREATE INDEX IF NOT EXISTS idx_pet_schools_status ON schools(status);

CREATE TABLE IF NOT EXISTS students (
  id                      TEXT PRIMARY KEY,
  pet_student_id          TEXT NOT NULL UNIQUE,
  name                    TEXT NOT NULL,
  photo_path              TEXT,
  dob                     TEXT,
  age                     INTEGER,
  gender                  TEXT CHECK (gender IN ('male','female','other') OR gender IS NULL),
  student_phone           TEXT,
  parent_name             TEXT,
  parent_phone            TEXT,
  parent_relation         TEXT,
  school_id               TEXT REFERENCES schools(id) ON DELETE SET NULL,
  school_name             TEXT,
  school_address          TEXT,
  locality                TEXT,
  city                    TEXT,
  district                TEXT,
  state                   TEXT,
  current_class           TEXT,
  previous_school         TEXT,
  address                 TEXT,
  status                  TEXT NOT NULL DEFAULT 'registered' CHECK (status IN
    ('registered','test_scheduled','test_completed','under_evaluation',
     'selected','waitlisted','not_selected','enrolled','inactive')),
  registration_source     TEXT NOT NULL DEFAULT 'field',
  registered_by_user_id   TEXT NOT NULL,
  registered_by_user_name TEXT NOT NULL,
  registration_date       TEXT NOT NULL,
  intake_id               TEXT,
  registered_visit_id     TEXT REFERENCES field_visits(id) ON DELETE SET NULL,
  notes                   TEXT,
  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pet_students_pet_id ON students(pet_student_id);
CREATE INDEX IF NOT EXISTS idx_pet_students_name ON students(name);
CREATE INDEX IF NOT EXISTS idx_pet_students_parent_phone ON students(parent_phone);
CREATE INDEX IF NOT EXISTS idx_pet_students_student_phone ON students(student_phone);
CREATE INDEX IF NOT EXISTS idx_pet_students_school ON students(school_id);
CREATE INDEX IF NOT EXISTS idx_pet_students_status ON students(status);
CREATE INDEX IF NOT EXISTS idx_pet_students_district ON students(district);
CREATE INDEX IF NOT EXISTS idx_pet_students_city ON students(city);
CREATE INDEX IF NOT EXISTS idx_pet_students_registered_by ON students(registered_by_user_id);

CREATE TABLE IF NOT EXISTS student_status_history (
  id                  TEXT PRIMARY KEY,
  student_id          TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  from_status         TEXT,
  to_status           TEXT NOT NULL,
  changed_by_user_id  TEXT NOT NULL,
  changed_by_user_name TEXT NOT NULL,
  reason              TEXT,
  created_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pet_status_history_student ON student_status_history(student_id, created_at);

CREATE TABLE IF NOT EXISTS student_documents (
  id                   TEXT PRIMARY KEY,
  student_id           TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  uploaded_by_user_id  TEXT NOT NULL,
  uploaded_by_user_name TEXT NOT NULL,
  type                 TEXT NOT NULL DEFAULT 'document' CHECK (type IN ('photo','document','other')),
  relative_path        TEXT NOT NULL,
  original_name        TEXT,
  caption              TEXT,
  status               TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('pending_upload','ready')),
  created_at           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pet_student_docs ON student_documents(student_id);

CREATE TABLE IF NOT EXISTS tasks (
  id                   TEXT PRIMARY KEY,
  title                TEXT NOT NULL,
  description          TEXT,
  created_by_user_id   TEXT NOT NULL,
  created_by_user_name TEXT NOT NULL,
  assigned_to_user_id  TEXT NOT NULL,
  assigned_to_user_name TEXT NOT NULL,
  priority             TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status               TEXT NOT NULL DEFAULT 'pending' CHECK (status IN
    ('pending','accepted','in_progress','submitted','completed','cancelled')),
  due_date             TEXT,
  school_id            TEXT REFERENCES schools(id) ON DELETE SET NULL,
  student_id           TEXT REFERENCES students(id) ON DELETE SET NULL,
  visit_id             TEXT,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL,
  completed_at         TEXT
);
CREATE INDEX IF NOT EXISTS idx_pet_tasks_assignee ON tasks(assigned_to_user_id, status);
CREATE INDEX IF NOT EXISTS idx_pet_tasks_creator ON tasks(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_pet_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_pet_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_pet_tasks_student ON tasks(student_id);
CREATE INDEX IF NOT EXISTS idx_pet_tasks_school ON tasks(school_id);

CREATE TABLE IF NOT EXISTS task_events (
  id              TEXT PRIMARY KEY,
  task_id         TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  actor_user_id   TEXT NOT NULL,
  actor_user_name TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  from_status     TEXT,
  to_status       TEXT,
  note            TEXT,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pet_task_events_task ON task_events(task_id, created_at);

CREATE TABLE IF NOT EXISTS conversations (
  id              TEXT PRIMARY KEY,
  type            TEXT NOT NULL DEFAULT 'direct' CHECK (type IN ('direct','group')),
  title           TEXT,
  created_by_user_id TEXT NOT NULL,
  last_message_at TEXT,
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at    TEXT,
  joined_at       TEXT NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_pet_conv_members_user ON conversation_members(user_id);

CREATE TABLE IF NOT EXISTS messages (
  id                TEXT PRIMARY KEY,
  conversation_id   TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id         TEXT NOT NULL,
  sender_name       TEXT NOT NULL,
  text              TEXT NOT NULL,
  attachment_paths  TEXT,
  linked_task_id    TEXT,
  linked_student_id TEXT,
  linked_school_id  TEXT,
  linked_visit_id   TEXT,
  created_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pet_messages_conversation ON messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS field_visits (
  id                  TEXT PRIMARY KEY,
  school_id           TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  school_name         TEXT NOT NULL,
  employee_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employee_name       TEXT NOT NULL,
  purpose             TEXT,
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')),
  started_at          TEXT NOT NULL,
  ended_at            TEXT,
  start_latitude      REAL,
  start_longitude     REAL,
  end_latitude        REAL,
  end_longitude       REAL,
  students_contacted  INTEGER NOT NULL DEFAULT 0,
  students_registered INTEGER NOT NULL DEFAULT 0,
  documents_collected INTEGER NOT NULL DEFAULT 0,
  notes               TEXT,
  report              TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pet_visits_employee ON field_visits(employee_id, started_at);
CREATE INDEX IF NOT EXISTS idx_pet_visits_school ON field_visits(school_id, started_at);
CREATE INDEX IF NOT EXISTS idx_pet_visits_started ON field_visits(started_at);
CREATE INDEX IF NOT EXISTS idx_pet_visits_status ON field_visits(status);

CREATE TABLE IF NOT EXISTS field_media (
  id                   TEXT PRIMARY KEY,
  visit_id             TEXT REFERENCES field_visits(id) ON DELETE SET NULL,
  school_id            TEXT REFERENCES schools(id) ON DELETE SET NULL,
  uploaded_by_user_id  TEXT NOT NULL,
  uploaded_by_user_name TEXT NOT NULL,
  type                 TEXT NOT NULL DEFAULT 'photo' CHECK (type IN ('photo','document','video')),
  relative_path        TEXT,
  original_name        TEXT,
  caption              TEXT,
  status               TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('pending_upload','ready')),
  created_at           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pet_field_media_visit ON field_media(visit_id);
CREATE INDEX IF NOT EXISTS idx_pet_field_media_school ON field_media(school_id);

CREATE TABLE IF NOT EXISTS employee_attendance (
  id            TEXT PRIMARY KEY,
  employee_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employee_name TEXT NOT NULL,
  date          TEXT NOT NULL,
  check_in_at   TEXT,
  check_out_at  TEXT,
  status        TEXT NOT NULL DEFAULT 'present' CHECK (status IN
    ('present','absent','leave','half_day','late')),
  latitude      REAL,
  longitude     REAL,
  remarks       TEXT,
  marked_by_user_id TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE (employee_id, date)
);
CREATE INDEX IF NOT EXISTS idx_pet_attendance_emp_date ON employee_attendance(employee_id, date);
CREATE INDEX IF NOT EXISTS idx_pet_attendance_date ON employee_attendance(date);

CREATE TABLE IF NOT EXISTS tests (
  id                   TEXT PRIMARY KEY,
  name                 TEXT NOT NULL,
  description          TEXT,
  passing_percentage   REAL NOT NULL DEFAULT 33,
  scheduled_date       TEXT,
  status               TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','completed','finalized')),
  created_by_user_id   TEXT NOT NULL,
  created_by_user_name TEXT NOT NULL,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS test_subjects (
  id            TEXT PRIMARY KEY,
  test_id       TEXT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  max_marks     REAL NOT NULL CHECK (max_marks > 0),
  passing_marks REAL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  UNIQUE (test_id, name)
);

CREATE TABLE IF NOT EXISTS test_assignments (
  id                  TEXT PRIMARY KEY,
  test_id             TEXT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  student_id          TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status              TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','absent','cancelled')),
  assigned_by_user_id TEXT NOT NULL,
  assigned_at         TEXT NOT NULL,
  UNIQUE (test_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_pet_assignments_test ON test_assignments(test_id);
CREATE INDEX IF NOT EXISTS idx_pet_assignments_student ON test_assignments(student_id);

CREATE TABLE IF NOT EXISTS test_results (
  id                  TEXT PRIMARY KEY,
  test_id             TEXT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  student_id          TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id          TEXT NOT NULL REFERENCES test_subjects(id) ON DELETE CASCADE,
  obtained_marks      REAL NOT NULL,
  entered_by_user_id  TEXT NOT NULL,
  entered_by_user_name TEXT NOT NULL,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  UNIQUE (test_id, student_id, subject_id)
);
CREATE INDEX IF NOT EXISTS idx_pet_results_student ON test_results(student_id);

CREATE TABLE IF NOT EXISTS test_evaluations (
  id                   TEXT PRIMARY KEY,
  test_id              TEXT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  student_id           TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  total_obtained       REAL NOT NULL,
  total_max            REAL NOT NULL,
  percentage           REAL NOT NULL,
  result               TEXT NOT NULL DEFAULT 'pending' CHECK (result IN ('eligible','not_eligible','pending')),
  remarks              TEXT,
  evaluated_by_user_id TEXT NOT NULL,
  evaluated_by_user_name TEXT NOT NULL,
  evaluated_at         TEXT NOT NULL,
  updated_at           TEXT NOT NULL,
  UNIQUE (test_id, student_id)
);

CREATE TABLE IF NOT EXISTS enrollments (
  id                  TEXT PRIMARY KEY,
  student_id          TEXT NOT NULL UNIQUE REFERENCES students(id) ON DELETE CASCADE,
  stage               TEXT NOT NULL DEFAULT 'follow_up' CHECK (stage IN ('follow_up','documents','verification','enrolled')),
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','withdrawn')),
  notes               TEXT,
  started_by_user_id  TEXT NOT NULL,
  started_by_user_name TEXT NOT NULL,
  verified_by_user_id TEXT,
  enrolled_at         TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS website_form_submissions (
  id                  TEXT PRIMARY KEY,
  form_type           TEXT NOT NULL CHECK (form_type IN
    ('student_registration','enquiry','volunteer','school_partnership','contact')),
  name                TEXT NOT NULL,
  phone               TEXT NOT NULL,
  email               TEXT,
  payload_json        TEXT,
  status              TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','assigned','in_progress','converted','closed')),
  assigned_to_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  assigned_to_user_name TEXT,
  converted_student_id TEXT REFERENCES students(id) ON DELETE SET NULL,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pet_forms_status ON website_form_submissions(status, created_at);
CREATE INDEX IF NOT EXISTS idx_pet_forms_assignee ON website_form_submissions(assigned_to_user_id);

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  message    TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'info',
  is_read    INTEGER NOT NULL DEFAULT 0,
  link_type  TEXT,
  link_id    TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pet_notifications_user ON notifications(user_id, is_read, created_at);

CREATE TABLE IF NOT EXISTS sessions (
  id                TEXT PRIMARY KEY,
  subject_type      TEXT NOT NULL CHECK (subject_type IN ('pet_user')),
  subject_id        TEXT NOT NULL,
  refresh_hash      TEXT NOT NULL UNIQUE,
  prev_refresh_hash TEXT,
  family_id         TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVOKED','REUSED')),
  user_agent        TEXT,
  ip                TEXT,
  created_at        TEXT NOT NULL,
  expires_at        TEXT NOT NULL,
  rotated_at        TEXT,
  revoked_at        TEXT
);
CREATE INDEX IF NOT EXISTS idx_pet_sessions_subject ON sessions(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_pet_sessions_family ON sessions(family_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_type  TEXT,
  actor_id    TEXT,
  actor_label TEXT,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  metadata    TEXT,
  ip          TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pet_audit_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pet_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_pet_audit_target ON audit_logs(target_type, target_id);

CREATE TABLE IF NOT EXISTS sync_operations (
  id              TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  user_id         TEXT NOT NULL,
  operation_type  TEXT NOT NULL,
  entity_type     TEXT,
  entity_id       TEXT,
  status          TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','failed')),
  result_json     TEXT,
  error           TEXT,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pet_sync_user ON sync_operations(user_id, created_at);

CREATE TABLE IF NOT EXISTS counters (
  name  TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
`;

let db = null;

export function getPetDb() {
  if (!db) {
    throw new Error('PET database not initialized. Call initPetDb() first.');
  }
  return db;
}

export function initPetDb(dbPath = config.pet.dbPath) {
  if (db) return db;
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(SCHEMA_SQL);
  return db;
}

export function closePetDb() {
  if (db) {
    db.close();
    db = null;
  }
}

/** Integrity check used by the PET backup script and /health. */
export function checkPetIntegrity() {
  try {
    const row = getPetDb().pragma('integrity_check', { simple: true });
    return row === 'ok' || row?.integrity_check === 'ok';
  } catch {
    return false;
  }
}
