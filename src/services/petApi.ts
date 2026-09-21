/**
 * PET API client — the ONLY way the frontend talks to the operational
 * backend (docs/PET/07: the frontend never touches SQLite directly).
 *
 * Security model (docs/PET/09):
 *  - access JWT lives in memory only (module state — never localStorage)
 *  - refresh token lives in a pluggable store: Android/Desktop inject the
 *    platform secure credential store; web keeps it in memory (a page
 *    reload requires a fresh login — an accepted web trade-off)
 *  - tokens expire + rotate; single-flight refresh prevents thundering herd
 *  - browser-supplied role/user IDs are never sent or trusted server-side
 *
 * Base URL: same-origin relative `/api` by default (works for the hosted
 * web admin and the VPN deployment). Override with `window.PET_API_BASE`
 * for split-origin development.
 */

import type {
  AdminDashboard, AuditLogEntry, ChatMessage, Conversation, DuplicateCandidate,
  EmployeeAttendance, Enrollment, PetApiError, PetNotification, PetSchool, PetSessionPayload,
  PetStudent, PetTask, PetTest, PetUser, StudentRegistrationInput, TaskEvent, TestScore,
  FieldVisit, FieldMedia, WebsiteFormSubmission, SyncOperation, SyncResultEntry, TaskStatus, StudentStatus,
} from '../types/pet';

declare global {
  interface Window {
    PET_API_BASE?: string;
    PET_SECURE_REFRESH_STORE?: {
      read(): Promise<string | null>;
      write(token: string): Promise<void>;
      clear(): Promise<void>;
    };
  }
}

const API_BASE = () => (typeof window !== 'undefined' && window.PET_API_BASE ? window.PET_API_BASE : '/api');

export class PetApiFailure extends Error {
  status: number;
  code: string;
  details?: PetApiError['error']['details'];
  constructor(status: number, code: string, message: string, details?: PetApiError['error']['details']) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// ── Token state (memory-only on web) ────────────────────────────────────────

let accessToken: string | null = null;
let refreshToken: string | null = null;
let currentUser: PetUser | null = null;
let refreshing: Promise<boolean> | null = null;
const authListeners = new Set<() => void>();

export function getAccessToken() { return accessToken; }
export function getPetUser() { return currentUser; }
export function isPetSignedIn() { return !!accessToken; }
export function onPetAuthChange(cb: () => void) {
  authListeners.add(cb);
  return () => { authListeners.delete(cb); };
}
function emitAuth() { for (const cb of authListeners) cb(); }

async function secureStoreRead(): Promise<string | null> {
  try { return (await window.PET_SECURE_REFRESH_STORE?.read()) ?? null; } catch { return null; }
}
async function secureStoreWrite(token: string) {
  try { await window.PET_SECURE_REFRESH_STORE?.write(token); } catch { /* noop */ }
}
async function secureStoreClear() {
  try { await window.PET_SECURE_REFRESH_STORE?.clear(); } catch { /* noop */ }
}

async function setSession(payload: PetSessionPayload | { access_token: string; refresh_token: string }) {
  accessToken = payload.access_token;
  refreshToken = payload.refresh_token;
  if ('user' in payload) currentUser = payload.user;
  await secureStoreWrite(payload.refresh_token);
  emitAuth();
}

export async function petLogout() {
  const token = refreshToken;
  accessToken = null;
  refreshToken = null;
  currentUser = null;
  emitAuth();
  await secureStoreClear();
  if (token) {
    try { await rawRequest('POST', '/auth/logout', { refresh_token: token }); } catch { /* idempotent */ }
  }
}

// ── HTTP core ───────────────────────────────────────────────────────────────

async function rawRequest<T>(method: string, path: string, body?: unknown, token?: string | null): Promise<T> {
  const res = await fetch(`${API_BASE()}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json: unknown = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    const err = json as PetApiError | null;
    throw new PetApiFailure(
      res.status,
      err?.error?.code || `HTTP_${res.status}`,
      err?.error?.message || `Request failed (${res.status}).`,
      err?.error?.details,
    );
  }
  return json as T;
}

/** Single-flight access-token refresh. Returns false when login is needed. */
async function refreshAccess(): Promise<boolean> {
  if (!refreshToken) {
    refreshToken = await secureStoreRead();
    if (!refreshToken) return false;
  }
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const payload = await rawRequest<PetSessionPayload>('POST', '/auth/refresh', { refresh_token: refreshToken });
      await setSession(payload);
      return true;
    } catch {
      accessToken = null;
      refreshToken = null;
      currentUser = null;
      emitAuth();
      await secureStoreClear();
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!accessToken && currentUser !== null) {
    // Cold start with a stored refresh token: renew before the request.
    const renewed = await refreshAccess();
    if (!renewed) throw new PetApiFailure(401, 'UNAUTHORIZED', 'Authentication required.');
  }
  try {
    return await rawRequest<T>(method, path, body, accessToken);
  } catch (err) {
    if (err instanceof PetApiFailure && err.status === 401) {
      const renewed = await refreshAccess();
      if (renewed && accessToken) return rawRequest<T>(method, path, body, accessToken);
    }
    throw err;
  }
}

export async function restoreSession(): Promise<boolean> {
  if (accessToken) return true;
  return refreshAccess();
}

// ── Auth / me ───────────────────────────────────────────────────────────────

export const petAuth = {
  async login(email: string, password: string): Promise<PetSessionPayload> {
    const payload = await rawRequest<PetSessionPayload>('POST', '/auth/login', { email, password });
    await setSession(payload);
    return payload;
  },
  logout: petLogout,
  changePassword: (current_password: string, new_password: string) =>
    api<{ changed: boolean; re_login_required: boolean }>('POST', '/auth/change-password', { current_password, new_password }),
};

export const petMe = {
  profile: () => api<{ user: PetUser }>('GET', '/me'),
  dashboard: () => api<Record<string, unknown>>('GET', '/me/dashboard'),
  today: () => api<{ record: EmployeeAttendance | null }>('GET', '/me/attendance/today'),
  notifications: () => api<{ notifications: PetNotification[]; unread: number }>('GET', '/me/notifications'),
  markRead: (ids?: string[]) => api<{ read: boolean }>('POST', '/me/notifications/read', ids ? { ids } : {}),
  directory: () => api<{ members: Array<{ id: string; name: string; role: string; employee_code: string | null; department: string | null }> }>('GET', '/me/directory'),
};

// ── Employees (Main Admin) ──────────────────────────────────────────────────

export const petEmployees = {
  list: (params: Record<string, string> = {}) =>
    api<{ employees: PetUser[]; total: number }>('GET', `/employees${qs(params)}`),
  create: (input: { name: string; email: string; phone?: string; department?: string; joining_date?: string }) =>
    api<{ user: PetUser; temporaryPassword: string }>('POST', '/employees', input),
  update: (id: string, input: Partial<{ name: string; email: string; phone: string | null; department: string | null }>) =>
    api<{ employee: PetUser }>('PATCH', `/employees/${id}`, input),
  setStatus: (id: string, status: 'ACTIVE' | 'DISABLED') =>
    api<{ employee: PetUser }>('POST', `/employees/${id}/status`, { status }),
  resetAccess: (id: string) =>
    api<{ user: PetUser; temporaryPassword: string }>('POST', `/employees/${id}/reset-access`, {}),
};

// ── Students ────────────────────────────────────────────────────────────────

export const petStudents = {
  search: (params: Record<string, string> = {}) =>
    api<{ students: PetStudent[]; total: number }>('GET', `/students${qs(params)}`),
  get: (id: string) => api<{ student: PetStudent }>('GET', `/students/${id}`),
  profile: (id: string) => api<Record<string, unknown>>('GET', `/students/${id}/profile`),
  register: (input: StudentRegistrationInput) =>
    api<{ student: PetStudent; duplicates: DuplicateCandidate[] }>('POST', '/students', input),
  duplicatesCheck: (input: { name: string; parent_phone?: string; student_phone?: string; school_id?: string }) =>
    api<{ duplicates: DuplicateCandidate[] }>('POST', '/students/duplicates-check', input),
  update: (id: string, input: Partial<StudentRegistrationInput>) =>
    api<{ student: PetStudent }>('PATCH', `/students/${id}`, input),
  changeStatus: (id: string, to_status: StudentStatus, reason?: string) =>
    api<{ student: PetStudent }>('POST', `/students/${id}/status`, { to_status, reason }),
};

// ── Schools ─────────────────────────────────────────────────────────────────

export const petSchools = {
  list: (params: Record<string, string> = {}) =>
    api<{ schools: PetSchool[]; total: number }>('GET', `/schools${qs(params)}`),
  get: (id: string) => api<{ school: PetSchool }>('GET', `/schools/${id}`),
  profile: (id: string) => api<Record<string, unknown>>('GET', `/schools/${id}/profile`),
  create: (input: Partial<Omit<PetSchool, 'id' | 'school_code' | 'status' | 'created_at' | 'updated_at'>> & { name: string }) =>
    api<{ school: PetSchool }>('POST', '/schools', input),
  update: (id: string, input: Record<string, unknown>) =>
    api<{ school: PetSchool }>('PATCH', `/schools/${id}`, input),
  archive: (id: string) => api<{ school: PetSchool }>('POST', `/schools/${id}/archive`, {}),
};

// ── Field visits / media ────────────────────────────────────────────────────

export const petVisits = {
  list: (params: Record<string, string> = {}) =>
    api<{ visits: FieldVisit[]; total: number }>('GET', `/field-visits${qs(params)}`),
  detail: (id: string) =>
    api<{ visit: FieldVisit; media: FieldMedia[]; students: Array<Partial<PetStudent>>; tasks: PetTask[] }>('GET', `/field-visits/${id}`),
  start: (input: { school_id: string; purpose?: string; latitude?: number | null; longitude?: number | null }) =>
    api<{ visit: FieldVisit }>('POST', '/field-visits/start', input),
  update: (id: string, input: Record<string, unknown>) =>
    api<{ visit: FieldVisit }>('PATCH', `/field-visits/${id}`, input),
  end: (id: string, input: Record<string, unknown> = {}) =>
    api<{ visit: FieldVisit }>('POST', `/field-visits/${id}/end`, input),
};

// ── Tasks ───────────────────────────────────────────────────────────────────

export const petTasks = {
  list: (params: Record<string, string> = {}) =>
    api<{ tasks: PetTask[]; total: number }>('GET', `/tasks${qs(params)}`),
  detail: (id: string) => api<{ task: PetTask; events: TaskEvent[] }>('GET', `/tasks/${id}`),
  create: (input: {
    title: string; description?: string; assigned_to_user_id: string; priority?: string;
    due_date?: string; school_id?: string; student_id?: string; visit_id?: string;
  }) => api<{ task: PetTask }>('POST', '/tasks', input),
  changeStatus: (id: string, status: TaskStatus, note?: string) =>
    api<{ task: PetTask }>('POST', `/tasks/${id}/status`, { status, note }),
  reassign: (id: string, assigned_to_user_id: string, note?: string) =>
    api<{ task: PetTask }>('POST', `/tasks/${id}/reassign`, { assigned_to_user_id, note }),
};

// ── Chat ────────────────────────────────────────────────────────────────────

export const petChat = {
  conversations: () => api<{ conversations: Conversation[] }>('GET', '/conversations'),
  unreadCount: () => api<{ unread: number }>('GET', '/conversations/unread-count'),
  openDirect: (user_id: string) => api<{ conversation: Conversation }>('POST', '/conversations/direct', { user_id }),
  createGroup: (title: string, member_ids: string[]) =>
    api<{ conversation: Conversation }>('POST', '/conversations/group', { title, member_ids }),
  messages: (id: string, params: Record<string, string> = {}) =>
    api<{ messages: ChatMessage[] }>('GET', `/conversations/${id}/messages${qs(params)}`),
  send: (id: string, input: {
    text: string; attachment_paths?: string[];
    linked_task_id?: string; linked_student_id?: string; linked_school_id?: string; linked_visit_id?: string;
  }) => api<{ message: ChatMessage }>('POST', `/conversations/${id}/messages`, input),
};

// ── Attendance ──────────────────────────────────────────────────────────────

export const petAttendance = {
  list: (params: Record<string, string> = {}) =>
    api<{ attendance: EmployeeAttendance[]; total: number }>('GET', `/attendance${qs(params)}`),
  checkIn: (geo: { latitude?: number; longitude?: number } = {}) =>
    api<{ record: EmployeeAttendance; alreadyCheckedIn: boolean }>('POST', '/attendance/check-in', geo),
  checkOut: (geo: { latitude?: number; longitude?: number } = {}) =>
    api<{ record: EmployeeAttendance; alreadyCheckedOut: boolean }>('POST', '/attendance/check-out', geo),
  mark: (input: { employee_id: string; date: string; status: string; remarks?: string }) =>
    api<{ record: EmployeeAttendance }>('POST', '/attendance/mark', input),
  summary: (month: string) =>
    api<{ month: string; summary: Array<Record<string, unknown>> }>('GET', `/attendance/summary?month=${month}`),
};

// ── Tests / enrollment ──────────────────────────────────────────────────────

export const petTests = {
  list: (params: Record<string, string> = {}) =>
    api<{ tests: PetTest[]; total: number }>('GET', `/tests${qs(params)}`),
  detail: (id: string) => api<Record<string, unknown>>('GET', `/tests/${id}`),
  create: (input: { name: string; description?: string; passing_percentage?: number; scheduled_date?: string;
    subjects: Array<{ name: string; max_marks: number; passing_marks?: number | null }> }) =>
    api<{ test: PetTest }>('POST', '/tests', input),
  update: (id: string, input: Record<string, unknown>) =>
    api<{ test: PetTest }>('PATCH', `/tests/${id}`, input),
  assign: (id: string, student_ids: string[]) =>
    api<{ assigned: string[]; skipped: string[]; errors: unknown[] }>('POST', `/tests/${id}/assign`, { student_ids }),
  enterMarks: (id: string, studentId: string, marks: Array<{ subject_id: string; obtained_marks: number }>) =>
    api<{ score: TestScore }>('POST', `/tests/${id}/marks/${studentId}`, { marks }),
  score: (id: string, studentId: string) =>
    api<{ score: TestScore }>('GET', `/tests/${id}/scores/${studentId}`),
  finalize: (id: string, studentId: string) =>
    api<{ score: TestScore }>('POST', `/tests/${id}/finalize/${studentId}`, {}),
  markAbsent: (id: string, studentId: string) =>
    api<Record<string, unknown>>('POST', `/tests/${id}/absent/${studentId}`, {}),
  decide: (id: string, studentId: string, decision: 'selected' | 'waitlisted' | 'not_selected', remarks?: string) =>
    api<{ student: PetStudent }>('POST', `/tests/${id}/decision/${studentId}`, { decision, remarks }),
};

export const petEnrollments = {
  list: (params: Record<string, string> = {}) =>
    api<{ enrollments: Enrollment[]; total: number }>('GET', `/enrollments${qs(params)}`),
  forStudent: (studentId: string) => api<{ enrollment: Enrollment }>('GET', `/enrollments/${studentId}`),
  start: (studentId: string, notes?: string) =>
    api<{ enrollment: Enrollment }>('POST', `/enrollments/${studentId}/start`, { notes }),
  advance: (studentId: string, stage: 'follow_up' | 'documents' | 'verification' | 'enrolled', notes?: string) =>
    api<{ enrollment: Enrollment }>('POST', `/enrollments/${studentId}/stage`, { stage, notes }),
  withdraw: (studentId: string, reason?: string) =>
    api<{ enrollment: Enrollment }>('POST', `/enrollments/${studentId}/withdraw`, { reason }),
};

// ── Website forms / upload / sync / reports ─────────────────────────────────

export const petWebsiteForms = {
  list: (params: Record<string, string> = {}) =>
    api<{ submissions: WebsiteFormSubmission[]; total: number }>('GET', `/website-forms${qs(params)}`),
  assign: (id: string, assigned_to_user_id: string) =>
    api<{ submission: WebsiteFormSubmission }>('POST', `/website-forms/${id}/assign`, { assigned_to_user_id }),
  setStatus: (id: string, status: 'in_progress' | 'closed') =>
    api<{ submission: WebsiteFormSubmission }>('POST', `/website-forms/${id}/status`, { status }),
  convert: (id: string, options: { overrides?: Record<string, unknown>; acknowledge_duplicates?: boolean } = {}) =>
    api<{ form: WebsiteFormSubmission; student: PetStudent; duplicates: DuplicateCandidate[] }>(
      'POST', `/website-forms/${id}/convert`, options),
};

export const petUploads = {
  upload: (input: { category: 'students' | 'schools' | 'field-visits' | 'documents';
    fileName: string; mimeType: string; dataBase64: string }) =>
    api<{ relative_path: string; size: number }>('POST', '/uploads', input),
  registerFieldMedia: (input: { visit_id?: string; school_id?: string; type?: 'photo' | 'document' | 'video';
    relative_path: string; original_name?: string; caption?: string }) =>
    api<{ media: FieldMedia }>('POST', '/media/field', input),
  registerStudentDocument: (input: { student_id: string; type?: 'photo' | 'document' | 'other';
    relative_path: string; original_name?: string; caption?: string }) =>
    api<{ document: unknown }>('POST', '/media/student', input),
  /** Fetch an authenticated file as an object URL for <img>/download use. */
  async fileUrl(relativePath: string): Promise<string> {
    const res = await fetch(`${API_BASE()}/files/${encodeURIComponent(relativePath).replaceAll('%2F', '/')}`, {
      headers: { Authorization: `Bearer ${accessToken ?? ''}` },
    });
    if (!res.ok) throw new PetApiFailure(res.status, 'FILE_ERROR', `Could not load file (${res.status}).`);
    return URL.createObjectURL(await res.blob());
  },
};

export const petSync = {
  push: (operations: SyncOperation[]) =>
    api<{ results: SyncResultEntry[]; processed_at: string }>('POST', '/sync', { operations }),
};

export const petReports = {
  adminDashboard: () => api<AdminDashboard>('GET', '/reports/dashboard'),
  search: (q: string) =>
    api<{ query: string; students: Array<Partial<PetStudent>>; schools: Array<Partial<PetSchool>>;
      employees: Array<Record<string, unknown>>; tasks: Array<Partial<PetTask>> }>(
      'GET', `/search?q=${encodeURIComponent(q)}`),
  activity: (params: Record<string, string> = {}) =>
    api<{ activity: AuditLogEntry[]; total: number }>('GET', `/activity${qs(params)}`),
  organization: () => api<{ organization: Record<string, unknown> | null }>('GET', '/settings/organization'),
  updateOrganization: (input: Record<string, unknown>) =>
    api<{ organization: Record<string, unknown> }>('PATCH', '/settings/organization', input),
};

function qs(params: Record<string, string>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return entries.length ? `?${new URLSearchParams(entries).toString()}` : '';
}
