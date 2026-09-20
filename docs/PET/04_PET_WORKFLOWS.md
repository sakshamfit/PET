# PET Operational Workflows

## Daily Employee

Login → Check In → Review Tasks → Review Visits → Travel to School → Start Visit → Register/Update Students → Upload Survey Media → Create/Complete Tasks → Submit Visit Report → End Visit → Check Out.

## Field Visit

Select School → Start Visit → Register Students → Upload Photos/Documents → Add Notes → Create or update Tasks → Submit Visit Report → End Visit.

## Student Registration

Register Student → Capture Photo → Student Details → Parent Details → School → Education/Location → Duplicate Check → Save → Server generates PET Student ID → REGISTERED.

The same school should be reusable while a visit is active.

## Student Journey

REGISTERED → TEST_SCHEDULED → TEST_COMPLETED → UNDER_EVALUATION → SELECTED / WAITLISTED / NOT_SELECTED → ENROLLED.

Every transition creates a history record.

## Duplicate Detection

Check suitable combinations such as student name + parent phone, student name + student phone, student name + school, and exact PET Student ID during imports.

Show a warning. Never silently merge.

## Testing

Admin creates test → Schedule/assign students → Conduct test → Enter marks → Calculate totals → Apply configured criteria → Update student lifecycle.

## Enrollment

SELECTED → Follow-up → Documents → Verification → ENROLLED.

## Tasks

CREATE → PENDING → ACCEPTED → IN_PROGRESS → SUBMITTED → COMPLETED.

Cancellation is explicit and audited.

## Communication

Messages can include student, school, task, field visit, and photo/document context.

## Attendance

Check In → Work / Field Visit → Check Out.

## Website Forms

Public Website → PET API → Validation + Rate Limit → Website Submission → Admin Queue → Assign Employee → Follow-up Task → Convert into Student / Enquiry / School.

## Offline Field Work

Create local operation → sync queue → connectivity returns → send idempotent operation to API → API validates and commits transaction → queue marked synchronized.

Do not create duplicate records during reconnect.
