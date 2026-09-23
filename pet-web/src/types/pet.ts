/**
 * PET domain types — mirror of the /api backend contract
 * (server/src/pet/services/*). Keep these in sync when the API changes.
 * The legacy school-management types remain in src/types.ts during the
 * migration window; PET code must use these, never the legacy ones.
 */

// ── Identity ────────────────────────────────────────────────────────────────

export type PetRole = 'main_admin' | 'employee';
export type PetUserStatus = 'ACTIVE' | 'DISABLED';

export interface PetUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: PetRole;
  employee_code: string | null;
  status: PetUserStatus;
  department: string | null;
  team_id: string | null;
  photo_path: string | null;
  joining_date: string | null;
  must_change_password: boolean;
  created_at: string;
  updated_at: string;
}

export interface PetSessionPayload {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  user: PetUser;
}

// ── Students ────────────────────────────────────────────────────────────────

export type StudentStatus =
  | 'registered'
  | 'test_scheduled'
  | 'test_completed'
  | 'under_evaluation'
  | 'selected'
  | 'waitlisted'
  | 'not_selected'
  | 'enrolled'
  | 'inactive';

export interface PetStudent {
  id: string;
  pet_student_id: string;
  name: string;
  photo_path: string | null;
  dob: string | null;
  age: number | null;
  gender: 'male' | 'female' | 'other' | null;
  student_phone: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  parent_relation: string | null;
  school_id: string | null;
  school_name: string | null;
  school_address: string | null;
  locality: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  current_class: string | null;
  previous_school: string | null;
  address: string | null;
  status: StudentStatus;
  registration_source: string;
  registered_by_user_id: string;
  registered_by_user_name: string;
  registration_date: string;
  intake_id: string | null;
  registered_visit_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DuplicateCandidate {
  id: string;
  pet_student_id: string;
  name: string;
  school_name: string | null;
  status: StudentStatus;
  parent_phone: string | null;
  reasons: string[];
}

export interface StudentStatusHistoryEntry {
  id: string;
  student_id: string;
  from_status: StudentStatus | null;
  to_status: StudentStatus;
  changed_by_user_id: string;
  changed_by_user_name: string;
  reason: string | null;
  created_at: string;
}

export interface StudentRegistrationInput {
  name: string;
  dob?: string | null;
  age?: number | null;
  gender?: 'male' | 'female' | 'other' | null;
  student_phone?: string | null;
  parent_name?: string | null;
  parent_phone?: string | null;
  parent_relation?: string | null;
  school_id?: string | null;
  school_name?: string | null;
  school_address?: string | null;
  locality?: string | null;
  city?: string | null;
  district?: string | null;
  state?: string | null;
  current_class?: string | null;
  previous_school?: string | null;
  address?: string | null;
  notes?: string | null;
  visit_id?: string | null;
  acknowledge_duplicates?: boolean;
  photo_data?: { fileName: string; mimeType: string; dataBase64: string } | null;
}

// ── Schools ─────────────────────────────────────────────────────────────────

export interface PetSchool {
  id: string;
  school_code: string;
  name: string;
  address: string | null;
  locality: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  phone: string | null;
  contact_person_name: string | null;
  contact_person_phone: string | null;
  latitude: number | null;
  longitude: number | null;
  status: 'active' | 'archived';
  notes: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

// ── Field operations ────────────────────────────────────────────────────────

export interface FieldVisit {
  id: string;
  school_id: string;
  school_name: string;
  employee_id: string;
  employee_name: string;
  purpose: string | null;
  status: 'active' | 'completed' | 'cancelled';
  started_at: string;
  ended_at: string | null;
  start_latitude: number | null;
  start_longitude: number | null;
  end_latitude: number | null;
  end_longitude: number | null;
  students_contacted: number;
  students_registered: number;
  documents_collected: number;
  notes: string | null;
  report: string | null;
  created_at: string;
  updated_at: string;
}

export interface FieldMedia {
  id: string;
  visit_id: string | null;
  school_id: string | null;
  uploaded_by_user_id: string;
  uploaded_by_user_name: string;
  type: 'photo' | 'document' | 'video';
  relative_path: string | null;
  original_name: string | null;
  caption: string | null;
  status: 'pending_upload' | 'ready';
  created_at: string;
}

// ── Tasks ───────────────────────────────────────────────────────────────────

export type TaskStatus = 'pending' | 'accepted' | 'in_progress' | 'submitted' | 'completed' | 'cancelled';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface PetTask {
  id: string;
  title: string;
  description: string | null;
  created_by_user_id: string;
  created_by_user_name: string;
  assigned_to_user_id: string;
  assigned_to_user_name: string;
  priority: TaskPriority;
  status: TaskStatus;
  due_date: string | null;
  school_id: string | null;
  student_id: string | null;
  visit_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface TaskEvent {
  id: string;
  task_id: string;
  actor_user_id: string;
  actor_user_name: string;
  event_type: string;
  from_status: TaskStatus | null;
  to_status: TaskStatus | null;
  note: string | null;
  created_at: string;
}

// ── Chat ────────────────────────────────────────────────────────────────────

export interface ConversationMember {
  user_id: string;
  name: string;
  role: PetRole;
}

export interface Conversation {
  id: string;
  type: 'direct' | 'group';
  title: string | null;
  created_by_user_id: string;
  last_message_at: string | null;
  created_at: string;
  members?: ConversationMember[];
  unread_count?: number;
  last_message?: string | null;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string;
  text: string;
  attachment_paths: string | null;
  linked_task_id: string | null;
  linked_student_id: string | null;
  linked_school_id: string | null;
  linked_visit_id: string | null;
  created_at: string;
}

// ── Attendance ──────────────────────────────────────────────────────────────

export type AttendanceStatus = 'present' | 'absent' | 'leave' | 'half_day' | 'late';

export interface EmployeeAttendance {
  id: string;
  employee_id: string;
  employee_name: string;
  date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  status: AttendanceStatus;
  latitude: number | null;
  longitude: number | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

// ── Tests / results / enrollment ────────────────────────────────────────────

export interface PetTest {
  id: string;
  name: string;
  description: string | null;
  passing_percentage: number;
  scheduled_date: string | null;
  status: 'draft' | 'scheduled' | 'completed' | 'finalized';
  created_by_user_id: string;
  created_by_user_name: string;
  created_at: string;
  updated_at: string;
  subjects: TestSubject[];
}

export interface TestSubject {
  id: string;
  test_id: string;
  name: string;
  max_marks: number;
  passing_marks: number | null;
  sort_order: number;
}

export interface TestScore {
  test_id: string;
  student_id: string;
  subjects: Array<{
    subject_id: string;
    name: string;
    max_marks: number;
    passing_marks: number | null;
    obtained_marks: number | null;
  }>;
  total_obtained: number;
  total_max: number;
  percentage: number;
  complete: boolean;
  suggested_result: 'eligible' | 'not_eligible';
  passing_percentage: number;
}

export interface Enrollment {
  id: string;
  student_id: string;
  stage: 'follow_up' | 'documents' | 'verification' | 'enrolled';
  status: 'active' | 'completed' | 'withdrawn';
  notes: string | null;
  started_by_user_id: string;
  started_by_user_name: string;
  verified_by_user_id: string | null;
  enrolled_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── Website forms / notifications / reports ─────────────────────────────────

export interface WebsiteFormSubmission {
  id: string;
  form_type: 'student_registration' | 'enquiry' | 'volunteer' | 'school_partnership' | 'contact';
  name: string;
  phone: string;
  email: string | null;
  payload: Record<string, unknown> | null;
  status: 'new' | 'assigned' | 'in_progress' | 'converted' | 'closed';
  assigned_to_user_id: string | null;
  assigned_to_user_name: string | null;
  converted_student_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PetNotification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  is_read: 0 | 1;
  link_type: string | null;
  link_id: string | null;
  created_at: string;
}

export interface AdminDashboard {
  kpis: {
    registered_students: number;
    tests_completed: number;
    selected_students: number;
    enrolled_students: number;
    active_employees: number;
    todays_field_visits: number;
    pending_tasks: number;
    new_website_forms: number;
  };
  pipeline: Array<{ status: StudentStatus; count: number }>;
  live_visits: FieldVisit[];
  task_queue: PetTask[];
  overdue_tasks: number;
  attendance_today: EmployeeAttendance[];
  recent_registrations: Array<Partial<PetStudent>>;
  website_forms: Array<Partial<WebsiteFormSubmission>>;
  recent_activity: AuditLogEntry[];
  generated_at: string;
}

export interface AuditLogEntry {
  id: number;
  actor_type: string | null;
  actor_id: string | null;
  actor_label: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  created_at: string;
}

// ── Errors & sync ───────────────────────────────────────────────────────────

export interface PetApiError {
  error: {
    code: string;
    message: string;
    details?: { duplicates?: DuplicateCandidate[] } & Record<string, unknown>;
  };
}

export type SyncOperationType =
  | 'student.register'
  | 'attendance.check_in'
  | 'attendance.check_out'
  | 'visit.start'
  | 'visit.end'
  | 'task.create'
  | 'task.status'
  | 'media.register';

export interface SyncOperation {
  idempotency_key: string;
  type: SyncOperationType;
  payload: Record<string, unknown>;
}

export interface SyncResultEntry {
  idempotency_key: string;
  status: 'ok' | 'error';
  deduplicated?: boolean;
  code?: string;
  message?: string;
  result?: unknown;
}
