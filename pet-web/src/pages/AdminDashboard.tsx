/**
 * Main Admin dashboard — organization-wide operational picture:
 * KPIs, student pipeline, live visits, task queue, attendance,
 * recent registrations, website forms, recent activity.
 */

import { useCallback, useEffect, useState } from 'react';
import { petReports } from '../../../src/services/petApi';
import type { AdminDashboard } from '../../../src/types/pet';
import { Badge, Card, EmptyState, Spinner, StatCard, studentStatusTone, taskStatusLabel } from '../ui';

export function AdminDashboardPage({ navigate }: { navigate: (r: string) => void }) {
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setData(await petReports.adminDashboard()); setError(''); }
    catch { setError('Dashboard unavailable.'); }
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  if (!data) return error ? <EmptyState title="Dashboard unavailable" hint={error} /> : <Spinner label="Loading operations…" />;
  const { kpis } = data;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Registered" value={kpis.registered_students} sub="students" />
        <StatCard label="Tests Done" value={kpis.tests_completed} sub="completions" />
        <StatCard label="Selected" value={kpis.selected_students} sub="incl. waitlist" />
        <StatCard label="Enrolled" value={kpis.enrolled_students} sub="students" />
        <StatCard label="Employees" value={kpis.active_employees} sub="active" />
        <StatCard label="Visits Today" value={kpis.todays_field_visits} />
        <StatCard label="Open Tasks" value={kpis.pending_tasks} sub={data.overdue_tasks ? `${data.overdue_tasks} overdue` : undefined} />
        <StatCard label="New Forms" value={kpis.new_website_forms} sub="website" />
      </div>

      <Card>
        <h3 className="mb-3 text-sm font-bold">Student pipeline</h3>
        <div className="flex flex-wrap gap-2">
          {data.pipeline.map(p => (
            <Badge key={p.status} tone={studentStatusTone(p.status)}>
              {p.status.replaceAll('_', ' ')}: {p.count}
            </Badge>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold">Live field visits</h3>
            <button className="text-xs font-semibold text-pet-700" onClick={() => navigate('visits')}>All →</button>
          </div>
          {data.live_visits.length === 0 ? (
            <p className="text-xs text-slate-500">No one is in the field right now.</p>
          ) : (
            data.live_visits.map(v => (
              <p key={v.id} className="border-b border-slate-100 py-1.5 text-xs last:border-0">
                <b>{v.employee_name}</b> · {v.school_name} · since {new Date(v.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            ))
          )}
        </Card>

        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold">Task queue</h3>
            <button className="text-xs font-semibold text-pet-700" onClick={() => navigate('tasks')}>All →</button>
          </div>
          {data.task_queue.length === 0 ? (
            <p className="text-xs text-slate-500">No open tasks.</p>
          ) : (
            data.task_queue.slice(0, 6).map(t => (
              <div key={t.id} className="flex items-center justify-between border-b border-slate-100 py-1.5 text-xs last:border-0">
                <span className="min-w-0 truncate"><b>{t.assigned_to_user_name}</b> · {t.title}</span>
                <Badge tone={t.status === 'pending' ? 'amber' : 'blue'}>{taskStatusLabel(t.status)}</Badge>
              </div>
            ))
          )}
        </Card>

        <Card>
          <h3 className="mb-2 text-sm font-bold">Employee attendance today</h3>
          {data.attendance_today.length === 0 ? (
            <p className="text-xs text-slate-500">No check-ins yet.</p>
          ) : (
            data.attendance_today.map(a => (
              <div key={a.id} className="flex items-center justify-between border-b border-slate-100 py-1.5 text-xs last:border-0">
                <span>{a.employee_name}</span>
                <Badge tone={a.status === 'present' ? 'green' : a.status === 'late' ? 'amber' : a.status === 'leave' ? 'blue' : 'red'}>
                  {a.check_in_at ? `in ${new Date(a.check_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : a.status}
                </Badge>
              </div>
            ))
          )}
        </Card>

        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold">Recent registrations</h3>
            <button className="text-xs font-semibold text-pet-700" onClick={() => navigate('students')}>All →</button>
          </div>
          {data.recent_registrations.length === 0 ? (
            <p className="text-xs text-slate-500">No students registered yet.</p>
          ) : (
            data.recent_registrations.map((s, i) => (
              <div key={i} className="border-b border-slate-100 py-1.5 text-xs last:border-0">
                <b>{s.name}</b> <span className="text-slate-400">{s.pet_student_id}</span>
                <span className="block text-slate-500">{s.school_name || 'No school'} · by {s.registered_by_user_name}</span>
              </div>
            ))
          )}
        </Card>

        <Card>
          <h3 className="mb-2 text-sm font-bold">Website forms</h3>
          {data.website_forms.length === 0 ? (
            <p className="text-xs text-slate-500">No submissions.</p>
          ) : (
            data.website_forms.map((f, i) => (
              <div key={i} className="flex items-center justify-between border-b border-slate-100 py-1.5 text-xs last:border-0">
                <span className="min-w-0 truncate"><b>{f.name}</b> · {String(f.form_type).replaceAll('_', ' ')}</span>
                <Badge tone={f.status === 'new' ? 'amber' : f.status === 'converted' ? 'green' : 'blue'}>{String(f.status)}</Badge>
              </div>
            ))
          )}
        </Card>

        <Card>
          <h3 className="mb-2 text-sm font-bold">Recent activity</h3>
          {data.recent_activity.slice(0, 8).map(a => (
            <p key={a.id} className="border-b border-slate-100 py-1.5 text-[11px] text-slate-600 last:border-0">
              <b>{a.actor_label || a.actor_type || 'system'}</b> · {a.action.replaceAll('PET_', '').replaceAll('_', ' ').toLowerCase()}
              <span className="block text-slate-400">{new Date(a.created_at).toLocaleString()}</span>
            </p>
          ))}
        </Card>
      </div>
    </div>
  );
}
