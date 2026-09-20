# PET Roles & Permissions

## Roles

Initial roles:

- main_admin
- employee

Future roles must be addable without rewriting authorization logic.

## Main Admin

Full access to:

Employees
Students
Schools
Field Visits
Tasks
Chat
Attendance
Tests
Evaluation
Enrollment
Website Forms
Reports
Notifications
Settings
Audit Logs

Main Admin can create/update/deactivate employees, initiate secure access resets, assign/reassign tasks, view all activity, manage students/schools/tests/enrollment, view attendance, website forms, reports and audit logs.

## Employee

Operational access:

- own dashboard
- own attendance
- assigned tasks
- permitted peer tasks
- student creation and permitted updates
- school viewing and permitted field updates
- own field visits
- field media uploads
- authorized test entry
- authorized enrollment work
- internal chat
- assigned website-form follow-up
- limited reports
- own profile

## Server Authorization

Never trust role, user ID, or ownership claims from the browser.

Every protected API request must:

1. verify the JWT
2. verify the live server-side session
3. load the user from SQLite
4. verify the user is active
5. resolve current role/permissions
6. check the target resource
7. execute only the authorized operation

## Task Collaboration

Main Admin may assign tasks to any employee.

Employees may assign tasks to other employees when peer task creation is enabled.

Main Admin can always see and audit all tasks.

## Password Handling

Never store or expose:

- plaintext passwords
- temporary passwords after provisioning
- passwords in JWTs
- passwords in frontend state
- passwords in browser localStorage

Store only a strong password hash and access metadata such as mustChangePassword.

## Data Ownership

The PET production database belongs to Purvanchal Education Trust.

Developer access should be controlled infrastructure access, not ownership of the client's production data.
