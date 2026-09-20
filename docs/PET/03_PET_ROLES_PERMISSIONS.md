# PET Roles & Permissions

## 1. Role Model

Initial roles:

- `main_admin`
- `employee`

Design the permission system so more roles can be added later without rewriting authorization logic.

## 2. Main Admin

Main Admin is organization-wide administrator.

### Access

```text
Employees             FULL
Students              FULL
Schools               FULL
Field Visits          FULL
Tasks                 FULL
Chat                  FULL
Attendance            FULL
Tests                 FULL
Evaluation            FULL
Enrollment            FULL
Website Forms         FULL
Reports               FULL
Notifications         FULL
Settings              FULL
Audit Logs            FULL
```

### Main Admin actions

- create employee
- edit employee
- activate/deactivate employee
- reset/revoke employee access
- assign/reassign tasks
- view every task
- create tasks for employees
- view all chats
- create announcements
- view all field visits
- view uploaded field media
- manage school directory
- manage student lifecycle
- configure tests
- review evaluations
- approve/complete enrollment where applicable
- view all attendance
- view analytics and audit logs

## 3. Employee

Employee permissions are work-focused.

### Access

```text
Own Dashboard          ALLOW
Own Attendance         ALLOW
Tasks                  OWN + permitted collaboration
Students               CREATE + permitted update
Schools                VIEW + field update
Field Visits           CREATE/UPDATE OWN
Field Media            UPLOAD
Tests                  VIEW + authorized entry
Chat                   ALLOW
Website Forms          ASSIGNED ONLY
Reports                LIMITED
Settings               OWN PROFILE ONLY
Audit Logs             OWN RELEVANT ACTIVITY
```

### Employee restrictions

An employee must not:

- create Main Admin accounts
- change organization-wide settings
- change another employee's permissions
- access passwords
- delete organization records permanently without elevated permission
- access confidential admin-only reports unless explicitly permitted

## 4. Task Collaboration

Employees may create tasks for each other only within the configured organization policy.

Example:

```text
Rahul
  ↓ creates
Task: Verify school documents
  ↓ assigns to
Arjun
```

Main Admin can always see the task.

## 5. Data Ownership

Never enforce business visibility only in the UI.

Authorization must be enforced in the data layer / backend / Firestore security rules.

## 6. Audit Requirements

Record:

- who performed the action
- what changed
- when
- entity affected
- previous value where appropriate
- new value where appropriate

Example:

```text
Rahul Singh
changed
Aman Kumar
REGISTERED → SELECTED
20 Sep 2026 16:42
```
