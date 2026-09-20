# PET Domain Model

## Storage

Primary operational datastore: SQLite on the PET-owned production server.

Access pattern:

Web / Android
→ HTTPS
→ Express API
→ Data Access Layer
→ SQLite

Large files are stored on the PET server filesystem. SQLite stores metadata and relative file paths.

## Core Entities

- Organization
- Users / Employees
- Teams
- Schools
- Students
- Student Status History
- Student Documents
- Tasks
- Task Events
- Conversations
- Messages
- Field Visits
- Field Media
- Employee Attendance
- Tests
- Test Subjects
- Test Assignments
- Test Results
- Enrollments
- Website Form Submissions
- Notifications
- Audit Logs
- Sessions

## User

Suggested fields:

id, name, email, phone, role, employeeCode, photoPath, department, teamId, status, joiningDate, mustChangePassword, createdAt, updatedAt.

Role values initially:

main_admin
employee

Passwords exist only as strong server-side password hashes.

## School

Suggested fields:

id, schoolCode, name, address, locality, city, district, state, phone, contactPersonName, contactPersonPhone, latitude, longitude, status, notes, createdAt, updatedAt.

## Student

Suggested fields:

id, petStudentId, name, photoPath, dob, age, gender, studentPhone, parentName, parentPhone, parentRelation, schoolId, schoolName, schoolAddress, locality, city, district, state, currentClass, previousSchool, address, status, registeredByUserId, registeredByUserName, registrationSource, registrationDate, intakeId, notes, createdAt, updatedAt.

Student statuses:

registered
test_scheduled
test_completed
under_evaluation
selected
waitlisted
not_selected
enrolled
inactive

## Student Status History

Store every lifecycle transition separately.

Fields:

id, studentId, fromStatus, toStatus, changedByUserId, changedByUserName, reason, createdAt.

## Field Visit

Fields:

id, schoolId, schoolName, employeeId, employeeName, purpose, status, startedAt, endedAt, startLatitude, startLongitude, endLatitude, endLongitude, studentsContacted, studentsRegistered, documentsCollected, notes, createdAt, updatedAt.

Location fields are optional and policy-controlled.

## Field Media

Fields:

id, visitId, schoolId, uploadedByUserId, uploadedByUserName, type, relativePath, originalName, caption, createdAt.

## Task

Fields:

id, title, description, createdByUserId, createdByUserName, assignedToUserId, assignedToUserName, priority, status, dueDate, schoolId, studentId, visitId, createdAt, updatedAt, completedAt.

Task statuses:

pending
accepted
in_progress
submitted
completed
cancelled

## Conversation / Message

Conversation fields:

id, participantIds, lastMessageAt, createdAt.

Message fields:

id, conversationId, senderId, senderName, text, attachmentPaths, linkedTaskId, linkedStudentId, linkedSchoolId, linkedVisitId, createdAt.

## Employee Attendance

Fields:

id, employeeId, employeeName, date, checkInAt, checkOutAt, status, latitude, longitude, remarks.

## Tests

Tests have configurable subjects and selection criteria. Store tests and results separately.

## Enrollment

Store enrollment separately so the student journey is preserved.

## Website Form

Fields:

id, formType, name, phone, email, payloadJson, status, assignedToUserId, createdAt, updatedAt.

## Audit Log

Every important mutation records:

- actor
- action
- target
- metadata
- timestamp
- IP where appropriate
