# PET Operational Workflows

## 1. Field Visit Workflow

```text
Employee logs in
      ↓
Mark attendance
      ↓
Open Field Visits
      ↓
Select school
      ↓
Start visit
      ↓
Visit dashboard
      ├── Register students
      ├── Upload photos
      ├── Add notes
      ├── Create tasks
      └── Update existing student records
      ↓
Submit visit report
      ↓
End visit
```

## 2. Student Registration Workflow

```text
Start student registration
      ↓
Capture photo
      ↓
Enter identity information
      ↓
Enter parent/guardian information
      ↓
Select school
      ↓
Enter educational/location information
      ↓
Validate required fields
      ↓
Detect possible duplicate
      ↓
Create PET Student ID
      ↓
Status = REGISTERED
      ↓
Show student profile
```

### Duplicate detection

Before creating a new student, check combinations such as:

- name + parent phone
- name + student phone
- name + school
- exact PET Student ID when importing

Do not silently merge records. Present a possible duplicate warning and let an authorized user decide.

## 3. Testing Workflow

```text
Admin creates test
      ↓
Student assigned/scheduled
      ↓
Test conducted
      ↓
Marks entered
      ↓
Automatic total/percentage
      ↓
Eligibility evaluation
      ↓
Status update
```

Suggested transition:

```text
REGISTERED
    ↓
TEST_SCHEDULED
    ↓
TEST_COMPLETED
    ↓
UNDER_EVALUATION
    ↓
SELECTED / WAITLISTED / NOT_SELECTED
```

## 4. Enrollment Workflow

```text
SELECTED
   ↓
Enrollment follow-up
   ↓
Required documents verified
   ↓
Enrollment approved/completed
   ↓
Status = ENROLLED
```

## 5. Task Workflow

Tasks can originate from Admin or employees.

```text
CREATE
  ↓
PENDING
  ↓
ACCEPTED
  ↓
IN_PROGRESS
  ↓
SUBMITTED
  ↓
COMPLETED
```

Cancellation must be explicit and audited.

## 6. Task Assignment Examples

### Admin → Employee

```text
Visit ABC School tomorrow
Collect student data
Upload visit photos
Submit field report
```

### Employee → Employee

```text
Verify documents for Aman Kumar
Please contact the school coordinator
Review today's survey
```

## 7. Communication Workflow

Chat should support context links.

An employee can send:

```text
Message
+ student link
+ school link
+ task link
+ photo/document attachment
```

This avoids conversations becoming disconnected from operational records.

## 8. Field Survey Workflow

```text
Start visit
   ↓
Capture school information
   ↓
Upload images
   ↓
Enter student count
   ↓
Enter registrations
   ↓
Add notes
   ↓
Submit survey
```

Example report:

```text
School: ABC Public School
Employee: Rahul Singh
Students contacted: 58
Students registered: 42
Documents collected: 31
Photos: 12
Notes: Follow-up required
```

## 9. Attendance Workflow

```text
Login
 ↓
Mark check-in
 ↓
Work / field visit
 ↓
Mark check-out
```

Admin can view daily, weekly and monthly attendance.

## 10. Website Form Workflow

```text
Public website
     ↓
PET backend/API
     ↓
Website Form Submission
     ↓
Admin / assigned employee
     ↓
Follow-up task
     ↓
Student / enquiry / school record
```

The website integration should be API-based where possible, not dependent on copying/pasting emails.

## 11. Search Workflow

Search should be available globally.

```text
Search
  ↓
Student / School / Employee / Task
  ↓
Result
  ↓
Context profile
```

Student search should be the highest-priority global search use case.
