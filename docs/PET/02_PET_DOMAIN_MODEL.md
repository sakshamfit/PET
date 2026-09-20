# PET Domain Model

## 1. Core Entities

The new system should be modeled around these entities:

```text
Organization
 ├── Users / Employees
 ├── Schools
 ├── Tasks
 ├── Conversations / Messages
 ├── Field Visits
 ├── Students
 │    ├── Test Registrations
 │    ├── Test Attempts / Results
 │    ├── Evaluations
 │    ├── Documents
 │    ├── Enrollment
 │    └── Activity Timeline
 ├── Website Forms / Enquiries
 ├── Attendance
 ├── Notifications
 └── Audit Logs
```

## 2. User

Suggested fields:

```ts
interface User {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role: 'main_admin' | 'employee';
  employeeCode?: string;
  photoUrl?: string;
  department?: string;
  teamId?: string;
  status: 'active' | 'inactive' | 'archived';
  joiningDate?: string;
  createdAt: string;
  updatedAt?: string;
}
```

Do not put plaintext passwords in this model.

## 3. School

```ts
interface School {
  id: string;
  name: string;
  address?: string;
  locality?: string;
  city?: string;
  district?: string;
  state?: string;
  phone?: string;
  contactPersonName?: string;
  contactPersonPhone?: string;
  latitude?: number;
  longitude?: number;
  status: 'active' | 'inactive';
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}
```

## 4. Student

```ts
type StudentStatus =
  | 'registered'
  | 'test_scheduled'
  | 'test_completed'
  | 'under_evaluation'
  | 'selected'
  | 'waitlisted'
  | 'not_selected'
  | 'enrolled'
  | 'inactive';

interface Student {
  id: string;
  petStudentId: string;
  name: string;
  photoUrl?: string;
  dob?: string;
  age?: number;
  gender?: 'Male' | 'Female' | 'Other';
  studentPhone?: string;
  parentName: string;
  parentPhone?: string;
  parentRelation?: string;
  schoolId?: string;
  schoolName: string;
  schoolAddress?: string;
  city?: string;
  district?: string;
  state?: string;
  currentClass?: string;
  previousSchool?: string;
  address?: string;
  status: StudentStatus;
  registeredByUserId: string;
  registeredByUserName: string;
  registrationSource: 'field_visit' | 'website' | 'manual' | 'import';
  registrationDate: string;
  intakeId?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}
```

## 5. Field Visit

```ts
interface FieldVisit {
  id: string;
  schoolId: string;
  schoolName: string;
  employeeId: string;
  employeeName: string;
  purpose: string;
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled';
  startedAt?: string;
  endedAt?: string;
  startLatitude?: number;
  startLongitude?: number;
  endLatitude?: number;
  endLongitude?: number;
  studentsContacted?: number;
  studentsRegistered?: number;
  documentsCollected?: number;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}
```

Location is optional and must be policy-controlled. Do not implement continuous background tracking unless explicitly required.

## 6. Field Media / Survey

```ts
interface FieldMedia {
  id: string;
  visitId: string;
  uploadedByUserId: string;
  uploadedByUserName: string;
  type: 'image' | 'video' | 'document';
  storageUrl: string;
  caption?: string;
  createdAt: string;
}
```

## 7. Task

```ts
interface Task {
  id: string;
  title: string;
  description?: string;
  createdByUserId: string;
  createdByUserName: string;
  assignedToUserId: string;
  assignedToUserName: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'accepted' | 'in_progress' | 'submitted' | 'completed' | 'cancelled';
  dueDate?: string;
  schoolId?: string;
  studentId?: string;
  visitId?: string;
  attachments?: string[];
  createdAt: string;
  updatedAt?: string;
  completedAt?: string;
}
```

## 8. Messages

```ts
interface Conversation {
  id: string;
  participantIds: string[];
  participantNames: string[];
  lastMessageAt?: string;
  createdAt: string;
}

interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  text: string;
  attachments?: string[];
  linkedTaskId?: string;
  linkedStudentId?: string;
  linkedSchoolId?: string;
  createdAt: string;
  readBy?: string[];
}
```

## 9. Employee Attendance

```ts
interface EmployeeAttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  checkInAt?: string;
  checkOutAt?: string;
  status: 'present' | 'absent' | 'leave' | 'half_day' | 'late';
  latitude?: number;
  longitude?: number;
  remarks?: string;
}
```

## 10. Test

```ts
interface PETTest {
  id: string;
  name: string;
  intakeId?: string;
  date?: string;
  subjects: {
    name: string;
    maxMarks: number;
    passingMarks?: number;
  }[];
  selectionRule?: string;
  status: 'draft' | 'scheduled' | 'ongoing' | 'completed';
}
```

## 11. Test Result

```ts
interface PETTestResult {
  id: string;
  testId: string;
  studentId: string;
  totalMarks: number;
  totalMaxMarks: number;
  percentage: number;
  result: 'eligible' | 'not_eligible' | 'pending';
  evaluatorUserId?: string;
  remarks?: string;
  subjectMarks: {
    subject: string;
    maxMarks: number;
    obtainedMarks: number;
  }[];
  createdAt: string;
  updatedAt?: string;
}
```

## 12. Enrollment

```ts
interface Enrollment {
  id: string;
  studentId: string;
  intakeId?: string;
  enrollmentDate: string;
  enrolledByUserId: string;
  status: 'pending' | 'enrolled' | 'cancelled';
  notes?: string;
}
```

## 13. Website Form Submission

```ts
interface WebsiteFormSubmission {
  id: string;
  formType: 'student_registration' | 'enquiry' | 'volunteer' | 'school_partnership' | 'other';
  name?: string;
  phone?: string;
  email?: string;
  payload: Record<string, unknown>;
  status: 'new' | 'assigned' | 'in_progress' | 'converted' | 'closed';
  assignedToUserId?: string;
  createdAt: string;
  updatedAt?: string;
}
```

## 14. Activity Log

Keep a complete audit trail.

Important event types:

- login/logout
- employee created/disabled
- task created/assigned/completed
- message sent
- field visit started/completed
- student created/updated
- student status changed
- test scheduled/completed
- student selected/not selected
- enrollment completed
- media uploaded
- website enquiry received
- attendance marked

## 15. Firestore Collections

Recommended collection names:

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

Retain old collections during migration if existing data must remain accessible. Migrate deliberately; do not silently destroy data.
