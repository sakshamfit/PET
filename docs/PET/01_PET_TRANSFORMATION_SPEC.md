# Purvanchal Education Trust — Product Transformation Specification

## Purpose

Transform the existing PET school-management application into a private internal operations platform for Purvanchal Education Trust.

Target organization size: approximately 30 employees.

The product is centered on field operations, student discovery, testing, selection, enrollment, employee collaboration, attendance, website intake, reporting, and audit history.

## Production Architecture Decision

The target production system is self-hosted and Trust-owned.

Architecture:

React/TypeScript/Vite frontend
→ Node.js + Express API
→ JWT authentication
→ SQLite using better-sqlite3
→ PET-owned office PC / mini-PC
→ local file storage for photos/documents
→ automated backups

The frontend and Android app must never access the SQLite file directly.

The Trust owns the production computer, database, uploaded files, backups, secrets, and infrastructure.

Cloud services may be used for optional off-site backup only. They are not the primary operational datastore.

## Existing-to-New Mapping

| Existing | PET |
|---|---|
| Principal | Main Admin |
| Teacher | Employee |
| Student | Student |
| Teacher Attendance | Employee Attendance |
| Exams / Results | PET Tests & Evaluation |
| Performance | Student Evaluation / Follow-up |
| Class | Team / Department / Region where applicable |
| School Settings | Trust Settings |
| Faculty Roster | Employee Directory |
| Fees | Remove from primary workflow unless later required |

## Main Admin

Main Admin has organization-wide access.

Main Admin can:

- create and manage employees
- activate/deactivate employee access
- initiate secure password/access reset
- assign and reassign tasks
- see all task activity
- see all students
- see all schools
- see all field visits and media
- manage tests and evaluation
- manage enrollment
- see employee attendance
- see website submissions
- use internal communication
- view organization reports
- view audit logs

Plaintext passwords must never be stored.

## Employee

Employee can:

- log in
- mark attendance
- see own tasks
- accept/start/submit/complete tasks
- create permitted tasks for other employees
- communicate with team members
- start and end field visits
- register students
- search students
- update permitted records
- upload survey photos/documents
- submit field reports
- perform authorized test/evaluation work
- receive notifications

## Student Lifecycle

Registered
→ Test Scheduled
→ Test Completed
→ Under Evaluation
→ Selected / Waitlisted / Not Selected
→ Enrolled

Every student has one permanent PET Student ID and a historical lifecycle.

## Student Data

Required:

- PET Student ID
- photo
- full name
- DOB/age
- gender
- student phone where available
- parent/guardian name
- parent phone
- parent relation
- school
- school address
- locality/city/district/state
- current class
- registration date
- registering employee
- registration source
- lifecycle status
- notes

## Field Operations

Employees can start a visit against a school.

A field visit records:

- employee
- school
- purpose
- start/end time
- optional event-based location
- student counts
- uploaded media
- notes
- linked tasks

Do not implement continuous background location tracking by default.

## Success Criteria

The system must answer:

- Which students were registered?
- Who registered them?
- From which school?
- What is their current lifecycle state?
- Which students need tests?
- Which were selected?
- Which enrolled?
- Which employee visited a school?
- What happened during the visit?
- Which tasks are overdue?
- What is each employee's attendance?
- What website forms require follow-up?
