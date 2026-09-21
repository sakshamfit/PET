/**
 * Reports, dashboards, global search and activity feeds.
 */

import { getPetDb } from '../db.js';
import { newId, paging, likeEscape } from './common.js';

/** Main Admin dashboard: KPIs + operational panels. */
export function adminDashboard() {
  const db = getPetDb();
  const today = new Date().toISOString().slice(0, 10);
  const one = (sql, params = {}) => db.prepare(sql).get(params);
  const all = (sql, params = {}) => db.prepare(sql).all(params);

  const kpis = {
    registered_students: one(`SELECT COUNT(*) AS c FROM students WHERE status != 'inactive'`).c,
    tests_completed: one(`SELECT COUNT(DISTINCT student_id || ':' || test_id) AS c FROM test_assignments WHERE status = 'completed'`).c,
    selected_students: one(`SELECT COUNT(*) AS c FROM students WHERE status IN ('selected','waitlisted')`).c,
    enrolled_students: one(`SELECT COUNT(*) AS c FROM students WHERE status = 'enrolled'`).c,
    active_employees: one(`SELECT COUNT(*) AS c FROM users WHERE role = 'employee' AND status = 'ACTIVE'`).c,
    todays_field_visits: one(`SELECT COUNT(*) AS c FROM field_visits WHERE started_at >= @today`, { today }).c,
    pending_tasks: one(`SELECT COUNT(*) AS c FROM tasks WHERE status IN ('pending','accepted','in_progress')`).c,
    new_website_forms: one(`SELECT COUNT(*) AS c FROM website_form_submissions WHERE status = 'new'`).c,
  };

  const pipeline = all(`SELECT status, COUNT(*) AS count FROM students GROUP BY status`);
  const liveVisits = all(
    `SELECT v.*, s.district, s.city FROM field_visits v LEFT JOIN schools s ON s.id = v.school_id
     WHERE v.status = 'active' ORDER BY v.started_at DESC`
  );
  const taskQueue = all(
    `SELECT * FROM tasks WHERE status IN ('pending','accepted','in_progress')
     ORDER BY due_date IS NULL, due_date ASC, created_at DESC LIMIT 20`
  );
  const overdueTasks = all(
    `SELECT COUNT(*) AS c FROM tasks WHERE status IN ('pending','accepted','in_progress')
       AND due_date IS NOT NULL AND due_date < @today`,
    { today }
  );
  const attendanceToday = all(
    `SELECT a.*, u.role FROM employee_attendance a JOIN users u ON u.id = a.employee_id
     WHERE a.date = @today ORDER BY a.employee_name`,
    { today }
  );
  const recentRegistrations = all(
    `SELECT id, pet_student_id, name, school_name, district, status, registered_by_user_name, created_at
     FROM students ORDER BY created_at DESC LIMIT 10`
  );
  const websiteForms = all(
    `SELECT id, form_type, name, phone, status, assigned_to_user_name, created_at
     FROM website_form_submissions ORDER BY created_at DESC LIMIT 10`
  );
  const recentActivity = all(
    `SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 15`
  );

  return {
    kpis,
    pipeline,
    live_visits: liveVisits,
    task_queue: taskQueue,
    overdue_tasks: overdueTasks[0].c,
    attendance_today: attendanceToday,
    recent_registrations: recentRegistrations,
    website_forms: websiteForms,
    recent_activity: recentActivity,
    generated_at: new Date().toISOString(),
  };
}

/** Employee dashboard: fast daily actions overview. */
export function employeeDashboard(actor) {
  const db = getPetDb();
  const today = new Date().toISOString().slice(0, 10);
  const myTasks = db
    .prepare(
      `SELECT * FROM tasks WHERE assigned_to_user_id = ? AND status IN ('pending','accepted','in_progress')
       ORDER BY due_date IS NULL, due_date ASC LIMIT 20`
    )
    .all(actor.id);
  const activeVisit = db
    .prepare(`SELECT * FROM field_visits WHERE employee_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1`)
    .get(actor.id) || null;
  const attendance = db
    .prepare('SELECT * FROM employee_attendance WHERE employee_id = ? AND date = ?')
    .get(actor.id, today) || null;
  const unreadMessages = db
    .prepare(
      `SELECT COUNT(*) AS c FROM messages msg
       JOIN conversation_members m ON m.conversation_id = msg.conversation_id AND m.user_id = @me
       WHERE msg.sender_id != @me AND (m.last_read_at IS NULL OR msg.created_at > m.last_read_at)`
    )
    .get({ me: actor.id }).c;
  const unreadNotifications = db
    .prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0')
    .get(actor.id).c;
  const myStudents = db
    .prepare('SELECT id, pet_student_id, name, status, school_name, created_at FROM students WHERE registered_by_user_id = ? ORDER BY created_at DESC LIMIT 10')
    .all(actor.id);
  const assignedForms = db
    .prepare(`SELECT id, form_type, name, phone, status, created_at FROM website_form_submissions WHERE assigned_to_user_id = ? AND status IN ('assigned','in_progress') ORDER BY created_at DESC`)
    .all(actor.id);
  const recentVisits = db
    .prepare('SELECT id, school_name, status, started_at, ended_at FROM field_visits WHERE employee_id = ? ORDER BY started_at DESC LIMIT 5')
    .all(actor.id);

  return {
    my_tasks: myTasks,
    active_visit: activeVisit,
    attendance_today: attendance,
    unread_messages: unreadMessages,
    unread_notifications: unreadNotifications,
    my_students: myStudents,
    assigned_forms: assignedForms,
    recent_visits: recentVisits,
    generated_at: new Date().toISOString(),
  };
}

/** Global search across students, schools, employees (admin) and tasks. */
export function globalSearch(actor, q) {
  const db = getPetDb();
  const fragment = `%${likeEscape(q)}%`;
  const students = db
    .prepare(
      `SELECT id, pet_student_id, name, status, school_name, district, city, parent_phone
       FROM students
       WHERE name LIKE @q ESCAPE '\\' OR pet_student_id LIKE @q ESCAPE '\\'
          OR student_phone LIKE @q ESCAPE '\\' OR parent_name LIKE @q ESCAPE '\\'
          OR parent_phone LIKE @q ESCAPE '\\' OR school_name LIKE @q ESCAPE '\\'
          OR district LIKE @q ESCAPE '\\' OR city LIKE @q ESCAPE '\\'
       ORDER BY name LIMIT 15`
    )
    .all({ q: fragment });
  const schools = db
    .prepare(
      `SELECT id, school_code, name, district, city, status FROM schools
       WHERE name LIKE @q ESCAPE '\\' OR school_code LIKE @q ESCAPE '\\'
          OR district LIKE @q ESCAPE '\\' OR locality LIKE @q ESCAPE '\\'
       ORDER BY name LIMIT 10`
    )
    .all({ q: fragment });

  let employees = [];
  if (actor.role === 'main_admin') {
    employees = db
      .prepare(
        `SELECT id, name, email, employee_code, status, role FROM users
         WHERE name LIKE @q ESCAPE '\\' OR email LIKE @q ESCAPE '\\' OR employee_code LIKE @q ESCAPE '\\'
         ORDER BY name LIMIT 10`
      )
      .all({ q: fragment });
  }

  let tasks = [];
  if (actor.role === 'main_admin') {
    tasks = db
      .prepare(
        `SELECT id, title, status, priority, due_date, assigned_to_user_name FROM tasks
         WHERE title LIKE @q ESCAPE '\\' OR description LIKE @q ESCAPE '\\' ORDER BY created_at DESC LIMIT 10`
      )
      .all({ q: fragment });
  } else {
    tasks = db
      .prepare(
        `SELECT id, title, status, priority, due_date, assigned_to_user_name FROM tasks
         WHERE (assigned_to_user_id = @me OR created_by_user_id = @me)
           AND (title LIKE @q ESCAPE '\\' OR description LIKE @q ESCAPE '\\')
         ORDER BY created_at DESC LIMIT 10`
      )
      .all({ q: fragment, me: actor.id });
  }

  return { query: q, students, schools, employees, tasks };
}

/** Team directory for chat (id + name + role of active users). */
export function teamDirectory(actor) {
  return getPetDb()
    .prepare(
      `SELECT id, name, role, employee_code, department FROM users
       WHERE status = 'ACTIVE' AND id != ? ORDER BY role, name COLLATE NOCASE`
    )
    .all(actor.id);
}

/** Activity feed (Main Admin): paginated + filterable audit log. */
export function activityFeed(query = {}) {
  const db = getPetDb();
  const { limit, offset } = paging(query, { defaultLimit: 50, maxLimit: 200 });
  const where = ['1=1'];
  const params = {};
  if (query.action) {
    where.push('action = @action');
    params.action = query.action;
  }
  if (query.actor_id) {
    where.push('actor_id = @actor_id');
    params.actor_id = query.actor_id;
  }
  if (query.target_type) {
    where.push('target_type = @target_type');
    params.target_type = query.target_type;
  }
  if (query.q) {
    where.push(`(action LIKE @q ESCAPE '\\' OR actor_label LIKE @q ESCAPE '\\' OR target_id LIKE @q ESCAPE '\\')`);
    params.q = `%${likeEscape(query.q)}%`;
  }
  const base = `FROM audit_logs WHERE ${where.join(' AND ')}`;
  const rows = db.prepare(`SELECT * ${base} ORDER BY created_at DESC, id DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit, offset });
  const { c } = db.prepare(`SELECT COUNT(*) AS c ${base}`).get(params);
  return {
    activity: rows.map(r => ({ ...r, metadata: r.metadata ? JSON.parse(r.metadata) : null })),
    total: c, limit, offset,
  };
}

/** Organization record (singleton) get/update. */
export function getOrganization() {
  const db = getPetDb();
  return db.prepare('SELECT * FROM organization ORDER BY created_at ASC LIMIT 1').get() || null;
}

export function upsertOrganization(actor, input) {
  const db = getPetDb();
  const existing = getOrganization();
  const ts = new Date().toISOString();
  if (existing) {
    db.prepare(
      `UPDATE organization SET name = @name, tagline = @tagline, address = @address, phone = @phone,
         email = @email, logo_path = @logo, settings_json = @settings, updated_at = @ts WHERE id = @id`
    ).run({
      id: existing.id,
      name: input.name ?? existing.name,
      tagline: input.tagline === undefined ? existing.tagline : input.tagline,
      address: input.address === undefined ? existing.address : input.address,
      phone: input.phone === undefined ? existing.phone : input.phone,
      email: input.email === undefined ? existing.email : input.email,
      logo: input.logo_path === undefined ? existing.logo_path : input.logo_path,
      settings: input.settings ? JSON.stringify(input.settings) : existing.settings_json,
      ts,
    });
  } else {
    db.prepare(
      `INSERT INTO organization (id, name, tagline, address, phone, email, logo_path, settings_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      newId('org'), input.name || 'Purvanchal Education Trust',
      input.tagline || null, input.address || null, input.phone || null, input.email || null,
      input.logo_path || null, input.settings ? JSON.stringify(input.settings) : null, ts, ts
    );
  }
  return getOrganization();
}

/** Notifications for the authenticated user. */
export function myNotifications(actor, query = {}) {
  const db = getPetDb();
  const { limit, offset } = paging(query, { defaultLimit: 50, maxLimit: 100 });
  const rows = db
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .all(actor.id, limit, offset);
  const { c } = db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0').get(actor.id);
  return { notifications: rows, unread: c };
}

export function markNotificationsRead(actor, ids = null) {
  const db = getPetDb();
  const ts = new Date().toISOString();
  if (Array.isArray(ids) && ids.length) {
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`UPDATE notifications SET is_read = 1 WHERE user_id = ? AND id IN (${placeholders})`)
      .run(actor.id, ...ids.slice(0, 100));
  } else {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(actor.id);
  }
  return true;
}
