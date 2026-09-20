# AI Studio Master Loop Prompt — PET Self-Hosted Transformation

You are modifying the existing repository:
\`https://github.com/sakshamfit/PET\`

Transform it into:
**PURVANCHAL EDUCATION TRUST — ORGANIZATION & FIELD OPERATIONS SYSTEM**

The client has approximately 30 employees. This is a private organizational application, not a public SaaS.

## Primary Architecture

Use a self-hosted architecture:

React / Android
→ HTTPS
→ Node.js + Express API
→ JWT Authentication
→ SQLite via better-sqlite3
→ PET-owned office PC / mini-PC
→ local file storage
→ automated backups

The frontend and Android application must never access the SQLite file directly.

The Trust owns the production computer, database, uploads, backups, secrets and infrastructure.

Do not use Firebase/Firestore as the target primary operational database. Firebase may remain temporarily only during migration if required.

The existing repository already contains Node/Express, better-sqlite3, JWT token utilities, refresh-token rotation, rate limiting, audit logging and backup tooling. Reuse those foundations.

## Non-Negotiable Rules

1. Inspect before editing.
2. Extend existing architecture before adding a competing architecture.
3. Do not rebuild the whole application.
4. SQLite is accessed only through the API.
5. Never expose the database file to clients.
6. Never store plaintext passwords.
7. JWT secrets remain server-only.
8. Use short-lived access JWTs and rotating refresh tokens.
9. Validate JWTs against live server-side session/user state.
10. Enforce authorization on the server.
11. Audit important mutations.
12. Never silently delete production data.
13. Use transactions for multi-table operations.
14. Store large files on filesystem, not SQLite blobs.
15. Design field workflows for weak connectivity.
16. Do not implement continuous background GPS by default.
17. Maintain strict TypeScript correctness.
18. Test after each major phase.
19. Do not create fake functionality.
20. Keep the application deployable after every phase.

## Business Context

PET employees:

- visit schools
- identify students
- collect student data
- capture photos
- conduct surveys
- arrange tests
- enter results
- evaluate eligibility
- select students
- complete enrollment
- perform follow-up

The organization also needs:

- employee accounts
- tasks
- peer task assignment
- internal chat
- attendance
- field reports
- school directory
- website forms
- notifications
- reports
- audit history

## Role Transformation

Current:
Principal / Teacher / Student

New:
Main Admin / Employee / Student

Update roles, authorization, dashboards, navigation, database semantics and backend checks.

## Phase 0 — Repository Audit

Inspect:

- frontend application
- existing student modules
- authentication
- Firebase integration
- server/src/db.js
- server/src/lib/tokens.js
- server/src/middleware/auth.js
- server routes
- server tests
- deployment documentation

Create/update:
\`PET_TRANSFORMATION_STATUS.md\`

Record the actual architecture and baseline test state.

## Phase 1 — PET API

Create a clean route → service → repository/data-access structure.

Core API areas:

- /api/auth
- /api/me
- /api/employees
- /api/students
- /api/schools
- /api/tasks
- /api/conversations
- /api/messages
- /api/field-visits
- /api/uploads
- /api/attendance
- /api/tests
- /api/test-results
- /api/enrollments
- /api/website-forms
- /api/reports
- /api/activity

Do not put raw SQL in route handlers.

## Phase 2 — SQLite Operational Database

Create/migrate tables for:

organization
users
teams
schools
students
student_status_history
student_documents
tasks
task_events
conversations
conversation_members
messages
field_visits
field_media
employee_attendance
tests
test_subjects
test_assignments
test_results
enrollments
website_form_submissions
notifications
audit_logs
sessions

Add useful indexes and foreign keys.

Use transactions for business operations that change multiple tables.

## Phase 3 — JWT Authentication

Reuse existing token utilities.

Login:
Verify password hash → create session → issue short-lived JWT → issue rotating refresh token.

Authenticated request:
JWT verification → live session verification → active user lookup → role/permission check → operation.

Never trust role or user ID supplied by the browser.

## Phase 4 — Employee Management

Main Admin can:

- create employee
- edit employee
- activate/deactivate employee
- reset/revoke access
- assign team/department
- view employee activity

Use secure provisioning. Temporary credentials must never be stored as plaintext after use.

## Phase 5 — Student Lifecycle

Implement:

REGISTERED
TEST_SCHEDULED
TEST_COMPLETED
UNDER_EVALUATION
SELECTED
WAITLISTED
NOT_SELECTED
ENROLLED
INACTIVE

Student registration must support photo, identity, parent, school, location, class and notes.

Generate PET Student ID on the server.

Implement duplicate warnings.

## Phase 6 — Schools

Create school directory and profiles with:

- contact information
- address/location
- students
- visit history
- employees who visited
- survey reports
- media
- tasks
- activity

## Phase 7 — Field Visits

Employee:
Attendance check-in → Select School → Start Visit → Register Students → Upload Media → Notes → Tasks → Visit Report → End Visit.

Record timestamps.

Optional event-based location only.

## Phase 8 — Files

Use:

PET/data/pet.db
PET/uploads/students/
PET/uploads/schools/
PET/uploads/field-visits/
PET/uploads/documents/
PET/backups/
PET/logs/

SQLite stores relative paths and metadata.

Validate file type, size, authorization and filenames.

Prevent path traversal.

## Phase 9 — Tasks

Support:

MAIN ADMIN → EMPLOYEE
EMPLOYEE → EMPLOYEE

Statuses:

PENDING
ACCEPTED
IN_PROGRESS
SUBMITTED
COMPLETED
CANCELLED

Tasks can link to school/student/visit.

## Phase 10 — Chat

Implement direct chat and admin/employee communication.

Support text, attachments, unread counts and links to student/school/task/visit.

## Phase 11 — Attendance

Support check-in, check-out, present, absent, leave, half-day, late and optional event-based location.

## Phase 12 — Tests and Evaluation

Repurpose existing exam/result foundations.

Admin creates tests and criteria.

Calculate subject marks, totals, percentages and eligibility.

Use a controlled service for lifecycle transitions.

## Phase 13 — Enrollment

Selected → Follow-up → Documents → Verification → Enrolled.

Preserve historical states.

## Phase 14 — Website Forms

Public website → validation/rate limiting → website submissions → admin queue → employee assignment → follow-up.

Public endpoints must never expose private records.

## Phase 15 — Global Search

Search students, schools, employees and tasks.

Student search must include name, PET Student ID, phones, parent, school, district, city and status.

## Phase 16 — Offline-First Field Use

Use a local client queue.

Create operation → queue → reconnect → send idempotent request → server transaction → mark synced.

Every queued mutation needs an idempotency key.

Do not duplicate records during reconnect.

## Phase 17 — UI

Main Admin:
Dashboard, Tasks, Field Visits, Survey Reports, Employees, Attendance, Team Chat, Students, Schools, Tests, Evaluation, Enrollment, Website Forms, Reports, Audit Logs, Settings.

Employee:
Dashboard, My Tasks, Field Visits, Register Student, Student Search, My Students, Team Chat, My Attendance, Assigned Tests, Notifications.

Optimize field workflows for phones.

## Phase 18 — Backups

Back up:

- SQLite database
- uploaded files
- required restore metadata
- never raw secrets

Use daily and weekly retention, integrity checking, and a tested restore procedure.

At least one backup must exist on a different physical/storage system.

## Phase 19 — Deployment

Initial deployment target:

PET office PC / mini-PC
→ Node/Express API
→ SQLite
→ uploads + backups

Employees connect through HTTPS.

For private deployment, a VPN such as Tailscale may be used:

Employee Phone → Private VPN → PET Office PC → PET API.

A public HTTPS endpoint can be introduced later if needed.

## Phase 20 — Firebase Migration

If current data is in Firestore:

1. Export current data.
2. Normalize it.
3. Map Principal → Main Admin.
4. Map Teacher → Employee.
5. Retain students.
6. Map compatible exams/results.
7. Preserve historical IDs/timestamps.
8. Import to SQLite.
9. Validate counts and relationships.
10. Keep the old export read-only until validation is complete.
11. Only then cut production over.

Never delete the old dataset before verification.

## Phase 21 — Testing Loop

After each major phase run the project's actual lint, build and server tests.

Add API tests for authentication, authorization, students, schools, tasks, field visits, attendance, tests, enrollment, website forms, uploads, backups and idempotency.

## Phase 22 — Security Loop

Verify:

- password hashes
- server-only JWT secrets
- refresh token rotation
- revoked sessions rejected
- inactive employees rejected
- admin routes protected
- input validation
- rate limiting
- upload security
- path traversal protection
- parameterized SQL
- audit logging
- production HTTPS
- no committed secrets

## Phase 23 — Status File

Maintain \`PET_TRANSFORMATION_STATUS.md\`.

Record:

- current phase
- architecture
- completed work
- in-progress work
- remaining work
- known issues
- frontend build
- server tests
- JWT status
- authorization status
- upload security
- backup status
- migration status
- exact next action

At the start of every loop, read the status file and inspect the real code.

At the end, update it with tests, failures and the next action.

## Definition of Done

The product is complete only when:

- Main Admin authentication works.
- Employee JWT login works.
- Employee access is managed securely.
- Core operational data is in SQLite.
- Students can be registered and searched.
- Student lifecycle works.
- Schools work.
- Field visits work.
- Survey media works.
- Tasks work.
- Peer tasks work where permitted.
- Chat works.
- Attendance works.
- Tests/results work.
- Selection/enrollment work.
- Website forms work.
- Reports work.
- Audit logs work.
- Offline-safe field operations work.
- Backup and restore are tested.
- Production security checks pass.
- TypeScript/build/tests pass.

Do not stop at UI prototypes. Implement complete end-to-end behavior.
