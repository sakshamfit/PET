# Purvanchal Education Trust — Product Transformation Specification

## 1. Purpose

Transform the existing `sakshamfit/PET` application from a school-management product into an internal operations platform for **Purvanchal Education Trust (PET)**.

The existing implementation must be evolved, not blindly replaced.

The new product is a centralized Trust Operating System that manages:

- employees and access
- field visits to schools
- student discovery and registration
- student testing and evaluation
- selected and enrolled students
- employee attendance
- tasks and task collaboration
- internal communication
- field survey reports and media
- website form submissions
- notifications
- reports and audit history

## 2. Core Product Principle

The **Student Lifecycle** is the primary business workflow.

```text
School / Field Discovery
        ↓
Registered Student
        ↓
Test Scheduled
        ↓
Test Completed
        ↓
Evaluation
        ↓
Selected / Waitlisted / Not Selected
        ↓
Enrollment
```

Every student keeps one permanent PET identity and one historical timeline.

## 3. Existing-to-New Mapping

| Current Concept | PET Concept | Action |
|---|---|---|
| Principal | Main Admin / Trust Admin | Rename and expand |
| Teacher | Employee | Rename and expand |
| Student | Student / Child | Keep and extend |
| Class | Team / Department / Region | Repurpose or replace |
| Teacher Attendance | Employee Attendance | Rename and extend |
| Results / Exams | PET Tests & Evaluation | Repurpose |
| Performance | Student Evaluation / Follow-up | Repurpose |
| Fees | Remove from primary navigation; retain only if needed later | De-emphasize |
| School Settings | Trust Settings | Rename |
| Faculty Roster | Employee Directory | Rename |
| Academic Year | Program / Intake Cycle | Replace where applicable |
| Audit Logs | Activity & Audit Logs | Keep and extend |

## 4. Main Admin

Main Admin has organization-wide access.

Main Admin can:

- create employee accounts
- activate/deactivate employees
- reset or revoke employee access
- assign tasks
- reassign tasks
- view all employee tasks
- view employee attendance
- see field visits
- see survey submissions and media
- see all students
- see all schools
- manage tests and selection criteria
- review enrollment
- see website-form submissions
- communicate with employees
- publish announcements
- see system-wide activity/audit history
- manage roles and permissions

### Credential rule

Do not store plaintext passwords in Firestore or application state.

Preferred employee access model:

1. Admin creates employee profile.
2. Auth identity is created through the configured authentication provider.
3. Employee receives a temporary credential/invite.
4. Employee must change the temporary credential at first login.
5. Password reset uses the authentication provider's secure mechanism.

The old repository already contains security logic that strips password data before Firestore persistence. Preserve this security behavior.

## 5. Employee

Employee can:

- log in
- mark own attendance
- see assigned tasks
- accept/start/complete tasks
- create a task for another permitted employee
- chat with permitted team members
- start and end field visits
- register students
- search students
- update records allowed by permission
- upload school/field survey photos
- submit field visit reports
- view assigned schools
- see relevant tests
- update test/evaluation information if authorized
- receive notifications

Employees do not automatically receive full organization-wide administrative access.

## 6. Student Record

The student record must be the single source of truth.

Minimum registration data:

- PET Student ID
- photo
- full name
- date of birth / age
- gender
- student phone if available
- parent/guardian name
- parent/guardian phone
- current class
- school name
- school address
- city
- district
- state
- registration date
- registered by employee
- registration source
- current lifecycle status
- notes

Recommended additional fields:

- previous school
- address
- village/locality
- documents
- emergency contact
- language preference
- consent/verification flags where required
- intake/program cycle

## 7. Student Statuses

Use explicit lifecycle states:

- `registered`
- `test_scheduled`
- `test_completed`
- `under_evaluation`
- `selected`
- `waitlisted`
- `not_selected`
- `enrolled`
- `inactive`

Do not rely only on free-text notes for workflow state.

## 8. Student Profile

Opening a student should provide:

- photo and identity
- current status
- school details
- parent/guardian details
- registered-by employee
- registration date
- test history
- score/result history
- selection decision
- enrollment information
- documents
- tasks linked to the student
- field visits linked to the student
- notes
- activity timeline

## 9. Global Search

Search must support:

- student name
- PET Student ID
- parent name
- student phone
- parent phone
- school name
- district
- city
- status

Search results should open the canonical student profile.

## 10. Success Criteria

The software should make these questions answerable immediately:

- How many students were registered?
- Which schools produced the registrations?
- Which employee registered a student?
- How many students are awaiting tests?
- How many completed testing?
- How many were selected?
- How many enrolled?
- Which employees are working today?
- Who is on field duty?
- Which field visits are active?
- Which tasks are overdue?
- What did a particular employee do today?
- What happened during a particular school visit?
- What media/report was uploaded?
