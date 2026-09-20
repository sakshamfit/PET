# PET UI & Navigation Specification

## 1. Product Identity

Application name:

**Purvanchal Education Trust**

Suggested short label:

**PET**

Do not present the product as a generic school-management application.

## 2. Main Admin Sidebar

```text
Dashboard

OPERATIONS
├── Tasks
├── Field Visits
├── Survey Reports

PEOPLE
├── Employees
├── Employee Attendance
├── Team Chat

STUDENTS
├── All Students
├── Registered
├── Test Scheduled
├── Test Completed
├── Selected
├── Enrolled

SCHOOLS
├── School Directory
├── School Visits

TESTING
├── Tests
├── Evaluation
├── Results

WEBSITE
├── Form Submissions
├── Enquiries

REPORTS
├── Student Reports
├── Employee Reports
├── School Reports
├── Field Reports
├── Activity & Audit Logs

SETTINGS
├── Trust Profile
├── Employees & Access
├── Roles & Permissions
└── System Settings
```

## 3. Employee Sidebar

```text
Dashboard

MY WORK
├── My Tasks
├── Field Visits
├── Survey Reports

STUDENTS
├── Register Student
├── Student Search
├── My Registered Students

TEAM
├── Team Chat
├── My Attendance

TESTS
├── Assigned Tests
├── Results

NOTIFICATIONS
```

## 4. Admin Dashboard

The dashboard should prioritize operations instead of school fees.

Top KPI cards:

```text
Registered Students
Tests Completed
Selected Students
Enrolled Students
Active Employees
Today's Field Visits
Pending Tasks
New Website Forms
```

Then:

### Student Pipeline

```text
Registered → Test Scheduled → Tested → Selected → Enrolled
```

### Live Field Operations

Show:

- employee
- school
- visit status
- start time
- registered count
- latest update

### Tasks

Show:

- overdue
- high priority
- assigned
- in progress
- awaiting review

### Recent Activity

Show the latest organization events.

## 5. Employee Dashboard

Prioritize mobile field use.

Top actions:

```text
[ Check In ]
[ Register Student ]
[ Start School Visit ]
[ My Tasks ]
[ Team Chat ]
```

Use large touch targets and fast forms.

## 6. Student List

Filters:

- status
- school
- district
- registration date
- registered by
- test result

Search should be instant and persistent.

## 7. Student Profile

Header:

```text
Photo
Name
PET ID
Status
School
```

Tabs/sections:

```text
Overview
Journey
Tests
Enrollment
Documents
Tasks
Field Visits
Notes
Activity
```

## 8. School Profile

Sections:

```text
Overview
Visit History
Student Pipeline
Employees Who Visited
Survey Reports
Media
Tasks
Activity
```

## 9. Field Visit UI

Use a compact mobile-first layout.

```text
School
Visit purpose
Start time
Status
Student count
Registered count
Media
Notes
Tasks
```

A persistent "End Visit" action should be visible while a visit is in progress.

## 10. Task UI

Task card should show:

```text
Priority
Title
Assignee
Creator
Due date
Status
School / Student context
```

Actions change according to status.

## 11. Chat UI

Provide:

- direct employee chat
- team chat
- attachments
- linked student
- linked school
- linked task
- unread count

Do not make chat visually dominate the operational modules.

## 12. Design Direction

Retain the existing polished responsive UI foundations, but remove school-specific labels.

Recommended visual direction:

- clean B2B operations dashboard
- mobile-first field workflows
- high information density without clutter
- large action buttons on mobile
- clear status badges
- consistent cards
- accessible contrast
- minimal animation
- fast transitions
