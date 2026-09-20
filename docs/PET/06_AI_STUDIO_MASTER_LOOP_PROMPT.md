# AI Studio Master Loop Prompt — Purvanchal Education Trust Transformation

You are modifying an existing production-oriented React/TypeScript application located in the repository:

`https://github.com/sakshamfit/PET`

The repository currently behaves like a school-management system.

Your mission is to transform the existing application into:

# PURVANCHAL EDUCATION TRUST — ORGANIZATION & FIELD OPERATIONS SYSTEM

Do NOT start by rebuilding the project from scratch.

Do NOT throw away working authentication, Firebase/Firestore synchronization, student modules, notifications, activity logs, responsive UI, or other reusable foundations.

You must inspect the repository first, understand the current architecture, and then incrementally transform it.

---

## NON-NEGOTIABLE ENGINEERING RULES

1. Preserve working functionality unless it conflicts with the new PET product requirements.
2. Prefer incremental refactoring over a destructive rewrite.
3. Do not introduce duplicate implementations when an existing service/component can be extended.
4. Do not store plaintext passwords in Firestore, localStorage, source code, or application state.
5. Enforce permissions in the data/backend/security layer, not only in the UI.
6. Do not replace real functionality with mock buttons, fake success messages, or hardcoded dashboards.
7. Every new CRUD flow must persist correctly to the configured backend.
8. Every important mutation must generate an audit/activity record.
9. Every new real-time collection must use the same synchronization pattern consistently.
10. Maintain strict TypeScript correctness.
11. Keep mobile field workers in mind for every new workflow.
12. Preserve existing data unless a deliberate migration is required.
13. Never silently delete or reset production data.
14. Do not expose secrets.
15. Do not use continuous background location tracking unless explicitly implemented later; field visit location can be event-based.
16. Avoid adding dependencies unless there is a concrete need.
17. Reuse Lucide icons and the existing styling system where practical.
18. Do not make broad visual changes to unrelated screens.
19. Fix TypeScript/build errors introduced by your work before moving on.
20. Keep the application deployable after every phase.

---

# BUSINESS CONTEXT

Purvanchal Education Trust provides free education opportunities to eligible children.

Trust employees perform field work.

Typical employee workflow:

1. Visit schools.
2. Meet/identify students.
3. Collect student information.
4. Take student photos.
5. Record school and location.
6. Register students.
7. Arrange tests.
8. Enter test results.
9. Evaluate eligibility.
10. Select eligible students.
11. Complete enrollment.
12. Continue follow-up.

The Trust also needs an internal company-style system where:

- Main Admin manages the entire team.
- Main Admin creates employee accounts/access.
- Main Admin assigns tasks.
- Employees can assign tasks to each other when permitted.
- Employees can communicate with each other.
- Employees can send photos/documents from field visits.
- Employees mark attendance.
- Main Admin can see organization-wide activity.
- Website forms can flow into the same system.
- Students remain searchable throughout their entire lifecycle.

---

# PRODUCT ROLE TRANSFORMATION

Current:

```text
Principal
Teacher
Student
```

New:

```text
Main Admin
Employee
Student
```

Do not merely change visible labels. Update:

- role types
- authorization checks
- component labels
- dashboards
- navigation
- database semantics
- activity logs
- authentication screens
- permission checks
- data model naming where appropriate

The Main Admin is the organization administrator, not a school principal.

Employees are organization/field employees, not teachers.

Students remain students/children.

---

# PHASE 0 — REPOSITORY AUDIT

Before editing:

Inspect:

- `src/App.tsx`
- `src/types.ts`
- `src/context/SchoolContext.tsx`
- `src/services/firestoreSync.ts`
- `src/services/firebaseAuth.ts`
- `src/data/initialData.ts`
- `src/components/Sidebar.tsx`
- `src/components/Navbar.tsx`
- authentication components
- dashboard components
- student components
- teacher components
- attendance components
- results components
- performance components
- reports
- admin app
- server
- Firebase configuration
- existing tests

Create or update:

`PET_TRANSFORMATION_STATUS.md`

At the top record:

```text
Repository audited: YES/NO
Build status before changes: ...
TypeScript status before changes: ...
Existing auth: ...
Existing database: ...
Existing reusable student workflow: ...
Existing employee/teacher workflow: ...
```

Never skip this phase.

---

# PHASE 1 — PET IDENTITY

Transform school-specific identity into PET identity.

Replace primary product concepts such as:

- School Management System
- Principal Administration
- Teacher / Faculty
- Classroom
- Class Section
- Fee Treasury
- Academic Year
- School Settings

with appropriate PET terminology.

Examples:

```text
Purvanchal Education Trust
Main Admin
Employees
Student Directory
Field Visits
Tests
Enrollment
Trust Settings
```

Do NOT delete historical data just because field names or labels are changing.

Where needed, introduce a migration layer.

---

# PHASE 2 — USER MODEL

Replace:

```ts
UserRole = 'principal' | 'teacher'
```

with an extensible role model, preferably:

```ts
type UserRole = 'main_admin' | 'employee';
```

or a compatible role/permission model that supports future roles.

Update all affected code paths.

Main Admin:

- full access

Employee:

- operational access

Add explicit permission helpers if necessary.

Examples:

```ts
canManageEmployees()
canManageOrganization()
canAssignTasks()
canViewAllStudents()
canManageTests()
canViewAllReports()
canManageWebsiteForms()
```

Do not scatter hard-coded role conditions across dozens of components if a reusable authorization layer can avoid that.

---

# PHASE 3 — EMPLOYEE ACCESS

The Main Admin must be able to:

- create employee
- edit employee
- deactivate employee
- restore employee
- reset/revoke access

Do not store plaintext passwords.

Use the existing Firebase authentication architecture or a secure backend flow compatible with the current application.

Preferred behavior:

```text
Admin creates employee
        ↓
Auth identity/invite/temporary credential
        ↓
Employee logs in
        ↓
Employee changes temporary credential if required
```

If the current authentication architecture cannot safely create employee credentials from the client, implement the necessary secure server-side/admin endpoint instead of placing privileged credentials in frontend code.

Never put Firebase service-account secrets into Vite client environment variables.

---

# PHASE 4 — STUDENT LIFECYCLE

This is the central business workflow.

Create these statuses:

```text
REGISTERED
TEST_SCHEDULED
TEST_COMPLETED
UNDER_EVALUATION
SELECTED
WAITLISTED
NOT_SELECTED
ENROLLED
INACTIVE
```

The Student entity must gain:

- PET Student ID
- photo
- name
- DOB/age
- gender
- student phone if available
- parent/guardian name
- parent phone
- parent relation
- school
- school address
- locality/city/district/state
- current class
- registration date
- registered by employee
- registration source
- current status
- notes
- timestamps

Use a duplicate-detection warning before creating a student.

The system must not silently create obvious duplicate records.

---

# PHASE 5 — STUDENT REGISTRATION UI

Create a fast mobile-friendly registration flow.

Required experience:

```text
+ Register Student
       ↓
Take/Upload Photo
       ↓
Student Details
       ↓
Parent Details
       ↓
School Details
       ↓
Review
       ↓
Save
       ↓
PET Student ID generated
       ↓
Status = REGISTERED
```

Make school selection reusable.

If the employee is visiting the same school for many students:

- select the school once
- reuse it for subsequent registrations

Do not force repetitive data entry.

---

# PHASE 6 — SCHOOL DIRECTORY

Create `Schools`.

A school record should support:

- name
- address
- city
- district
- state
- contact person
- phone
- optional coordinates
- notes
- status

School profile must show:

- total students
- registered
- tested
- selected
- enrolled
- visits
- employees who visited
- survey reports
- media
- tasks
- activity

---

# PHASE 7 — FIELD VISITS

Create first-class Field Visit functionality.

Employee:

```text
Field Visits
   ↓
Select School
   ↓
Start Visit
```

Start Visit records:

- school
- employee
- purpose
- start time
- optional event-based location
- status

During visit:

- register students
- upload survey images
- add notes
- create tasks
- link students
- link school

End visit:

- end time
- student count
- registration count
- document count
- final notes
- visit status = COMPLETED

Do not implement continuous GPS/background tracking by default.

---

# PHASE 8 — FIELD SURVEY MEDIA

Employees must be able to upload:

- school photos
- classroom photos
- survey images
- documents
- videos if supported

Every media record must have:

- uploader
- date/time
- visit link
- school link
- optional caption

Use Firebase Storage or the project's existing secure storage mechanism.

Do not store large binary content directly in Firestore documents.

---

# PHASE 9 — TASK MANAGEMENT

Create a real task system.

Task sources:

```text
MAIN ADMIN → EMPLOYEE
EMPLOYEE → EMPLOYEE
```

Task fields:

- title
- description
- creator
- assignee
- priority
- status
- due date
- school
- student
- field visit
- attachments
- timestamps

Statuses:

```text
PENDING
ACCEPTED
IN_PROGRESS
SUBMITTED
COMPLETED
CANCELLED
```

Main Admin can see everything.

Employee normally sees:

- tasks assigned to them
- tasks they created
- collaboration tasks they have permission to see

Every status change must be audited.

---

# PHASE 10 — INTERNAL CHAT

Create organization communication.

Minimum:

- employee-to-employee direct chat
- admin-to-employee chat
- team/group chat if practical
- text
- image/file attachments
- unread count
- timestamps

Most importantly, chat messages can link to:

- student
- school
- task
- field visit

Example:

```text
Please verify this student's documents.

[Student: Aman Kumar]
[Task: Verify Documents]
[School: ABC Public School]
```

Do not build a giant social network. Keep the UI business-focused.

---

# PHASE 11 — EMPLOYEE ATTENDANCE

Replace teacher attendance with employee attendance.

Support:

- check-in
- check-out
- present
- absent
- leave
- half-day
- late
- optional event-based location
- remarks

Admin sees:

- today's employee status
- attendance history
- working hours where available
- monthly reports

---

# PHASE 12 — TESTS & EVALUATION

Transform the old Exams/Results system into PET testing.

Admin can:

- create test
- define subjects
- define max marks
- define passing marks
- assign students
- schedule test
- record marks
- finalize results
- review eligibility

Student result example:

```text
Math 72/100
English 81/100
GK 65/100
Total 218/300
72.67%
Eligible
```

The configured selection criteria should drive status changes.

Do not hardcode a single eligibility formula if the business requirements can be configured.

---

# PHASE 13 — ENROLLMENT

Create explicit enrollment management.

Flow:

```text
SELECTED
   ↓
Enrollment Follow-up
   ↓
Documents
   ↓
Verification
   ↓
ENROLLED
```

Enrollment must preserve history.

Never overwrite a student's entire journey when changing status.

---

# PHASE 14 — WEBSITE FORMS

Create a system for website submissions.

Possible forms:

- Student Registration
- Enquiry
- Volunteer Registration
- School Partnership
- Contact

Flow:

```text
Website
  ↓
API / Backend
  ↓
Website Form Submission
  ↓
Admin Queue
  ↓
Assign Employee
  ↓
Follow-up Task
  ↓
Student/Enquiry/School
```

Do not rely only on email forwarding.

If a public API is added:

- validate input
- rate limit
- sanitize
- protect against abuse
- do not expose privileged Firebase credentials
- log submission events safely

---

# PHASE 15 — GLOBAL SEARCH

Upgrade Quick Search into a real organization search.

Search:

```text
Students
Schools
Employees
Tasks
```

Student search must support:

- name
- PET Student ID
- student phone
- parent name
- parent phone
- school
- district
- city
- status

Opening a student should show the full record and lifecycle.

---

# PHASE 16 — DASHBOARDS

Replace Principal Dashboard with Main Admin Dashboard.

Admin KPIs:

```text
Registered Students
Tests Completed
Selected Students
Enrolled Students
Active Employees
Today's Field Visits
Pending Tasks
Website Forms
```

Add:

- student pipeline
- field operation live view
- overdue tasks
- recent registrations
- test queue
- enrollment queue
- activity feed

Employee dashboard:

```text
My Attendance
My Tasks
Today's Visits
Register Student
Student Search
Team Chat
Notifications
```

Optimize for mobile field use.

---

# PHASE 17 — NAVIGATION

Main Admin:

```text
Dashboard

OPERATIONS
Tasks
Field Visits
Survey Reports

PEOPLE
Employees
Employee Attendance
Team Chat

STUDENTS
All Students
Registered
Test Scheduled
Test Completed
Selected
Enrolled

SCHOOLS
School Directory
School Visits

TESTING
Tests
Evaluation
Results

WEBSITE
Form Submissions
Enquiries

REPORTS
Student Reports
Employee Reports
School Reports
Field Reports
Activity & Audit Logs

SETTINGS
Trust Profile
Employees & Access
Roles & Permissions
System Settings
```

Employee:

```text
Dashboard

MY WORK
My Tasks
Field Visits
Survey Reports

STUDENTS
Register Student
Student Search
My Registered Students

TEAM
Team Chat
My Attendance

TESTS
Assigned Tests
Results

NOTIFICATIONS
```

Remove old school-specific navigation from the primary experience.

---

# PHASE 18 — FIRESTORE / DATA LAYER

Use consistent collections.

Preferred:

```text
organization
users
schools
students
tasks
conversations
messages
field_visits
field_media
employee_attendance
tests
test_results
enrollments
website_forms
notifications
activity_logs
```

Extend the existing Firestore synchronization service instead of creating a second synchronization architecture.

All new collections need:

- read strategy
- write strategy
- delete/restore strategy where required
- real-time updates where useful
- security rules
- TypeScript models

---

# PHASE 19 — SECURITY

Review Firebase/Firestore rules.

Ensure:

- unauthenticated users cannot access organizational data
- employees cannot read/write admin-only data
- users cannot impersonate another user through client-submitted IDs
- employee permissions are not trusted solely from frontend state
- privileged employee-account operations run server-side where required
- passwords are never stored as profile fields
- uploads are permission-controlled
- public website forms cannot read private collections

Do not weaken existing security to make development easier.

---

# PHASE 20 — MIGRATION

Existing school-management data may contain:

- principal
- teachers
- students
- classes
- exams
- results
- attendance
- activity logs

Create a migration strategy.

At minimum:

```text
principal → main_admin
teacher → employee
teacher attendance → employee attendance
results/exams → PET tests/results where compatible
students → retain
```

Do not delete unrelated student data.

If old fields must remain temporarily for compatibility, support a transition period.

---

# PHASE 21 — TESTING LOOP

After each major phase:

1. Run TypeScript check.
2. Run build.
3. Run existing server tests where applicable.
4. Fix errors.
5. Re-check affected workflows.
6. Update `PET_TRANSFORMATION_STATUS.md`.

Do not proceed while known compile-breaking errors remain.

---

# PHASE 22 — VISUAL REVIEW

Check:

- desktop admin dashboard
- mobile employee dashboard
- student registration
- student profile
- task creation
- task completion
- field visit start/end
- media upload
- chat
- attendance
- search
- test result
- enrollment
- website forms

No broken layouts.

No clipped forms.

No unusable mobile controls.

---

# PHASE 23 — LOOP CONTROL FILE

Maintain:

`PET_TRANSFORMATION_STATUS.md`

Use exactly this structure:

```md
# PET Transformation Status

## Current Phase
...

## Completed
- ...

## In Progress
- ...

## Remaining
- ...

## Known Issues
- ...

## Build
- TypeScript: PASS/FAIL
- Vite Build: PASS/FAIL
- Server Tests: PASS/FAIL

## Security Review
- Auth: PASS/FAIL
- Firestore Rules: PASS/FAIL
- Password Handling: PASS/FAIL
- Upload Security: PASS/FAIL

## Data Migration
- Status: ...

## Next Action
...
```

At the beginning of every loop:

1. Read `PET_TRANSFORMATION_STATUS.md`.
2. Inspect the current repository state.
3. Check what has actually been implemented.
4. Continue from the first unfinished item.
5. Never assume previous AI work was correct.
6. Verify the code.

At the end of every loop:

1. Update the status file.
2. Record tests run.
3. Record failures.
4. Record the exact next action.

---

# DEFINITION OF DONE

The transformation is complete only when all of these work end-to-end:

## Authentication

- Main Admin login works.
- Employee login works.
- Admin can manage employee access.
- No plaintext passwords stored.

## Students

- Register student.
- Photo upload.
- Search student.
- Duplicate warning.
- Student profile.
- Lifecycle status.
- Test linkage.
- Selection.
- Enrollment.
- Activity timeline.

## Schools

- Create/update school.
- View school profile.
- Link field visits.
- Link students.
- Link reports.

## Field Work

- Start visit.
- Record visit.
- Register students.
- Upload survey media.
- Add notes.
- End visit.
- Visit history.

## Tasks

- Admin creates task.
- Admin assigns task.
- Employee receives task.
- Employee updates task.
- Employee can create permitted task for another employee.
- Admin sees all task activity.

## Communication

- Employee-to-employee chat.
- Admin-to-employee communication.
- Attachments.
- Linked student/school/task context.

## Attendance

- Employee check-in.
- Employee check-out.
- Admin attendance view.

## Testing

- Create test.
- Schedule test.
- Enter marks.
- Calculate result.
- Evaluate eligibility.
- Update student lifecycle.

## Enrollment

- Selected student.
- Enrollment workflow.
- Enrollment history.

## Website

- Receive form.
- Display form.
- Assign employee.
- Create follow-up.
- Convert to student/enquiry/school.

## Reporting

- Student reports.
- Employee activity.
- Field visit reports.
- School reports.
- Task reports.
- Audit logs.

## Quality

- TypeScript passes.
- Production build passes.
- Existing relevant tests pass.
- No known critical runtime errors.
- Mobile field workflow is usable.
- No secret leakage.
- No plaintext password storage.
- Firestore rules enforce authorization.

---

# IMPORTANT BEHAVIOR

When implementation is large:

DO NOT answer with only a plan.

Actually implement the next safe phase.

When a component already exists:

EXTEND it.

When a feature is obsolete:

REPURPOSE it.

When naming is obsolete:

RENAME carefully.

When a schema is insufficient:

MIGRATE it safely.

When something is broken:

FIX it before adding unrelated functionality.

When requirements conflict:

Preserve working production behavior and choose the smallest safe migration path.

Never create fake/demo functionality just to make a screen appear complete.

The final application should feel like one coherent product:

**Purvanchal Education Trust — Education, Field Operations & Student Management System.**

Continue the implementation loop until the Definition of Done is genuinely satisfied.
