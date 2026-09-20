# PET SQLite Database Specification

## Database

Production database:

\`data/pet.db\`

SQLite configuration:

- WAL mode
- foreign keys enabled
- busy timeout enabled
- regular integrity checks

## Tables

### organization

Stores Trust-level configuration.

### users

Stores Main Admin and Employee profiles.

Important columns:

- id
- name
- email
- phone
- role
- employee_code
- password_hash
- must_change_password
- status
- department
- team_id
- created_at
- updated_at

### teams

Stores employee teams/departments.

### schools

Stores schools visited or managed by PET.

### students

Stores the canonical student record.

### student_status_history

Stores every lifecycle transition.

### student_documents

Stores metadata for student documents. Files remain on filesystem.

### tasks

Stores tasks and assignments.

### task_events

Stores task status/history events.

### conversations

Stores direct/team conversation metadata.

### conversation_members

Links employees to conversations.

### messages

Stores message text and file/context references.

### field_visits

Stores school visits.

### field_media

Stores uploaded media metadata.

### employee_attendance

Stores check-in/check-out records.

### tests

Stores test definitions.

### test_subjects

Stores subjects/mark configuration.

### test_assignments

Links tests to students.

### test_results

Stores test marks and outcomes.

### enrollments

Stores enrollment records.

### website_form_submissions

Stores public website submissions.

### notifications

Stores employee notifications.

### audit_logs

Stores security and business activity.

### sessions

Stores server-side refresh/session state.

## Required Indexes

Create indexes for:

- users.email
- users.employee_code
- students.pet_student_id
- students.name
- students.parent_phone
- students.student_phone
- students.school_id
- students.status
- tasks.assigned_to_user_id
- tasks.status
- tasks.due_date
- field_visits.employee_id
- field_visits.school_id
- field_visits.started_at
- employee_attendance.employee_id + date
- messages.conversation_id + created_at
- audit_logs.created_at

## Transactions

Use a transaction when one business action changes multiple records.

Examples:

Student selection:

1. update student status
2. insert status history
3. insert audit log

Enrollment:

1. create/update enrollment
2. update student status
3. insert status history
4. insert audit log

Task completion:

1. update task
2. insert task event
3. insert audit log

## Migration Rule

Do not drop old tables during migration until data has been validated and a verified backup exists.
