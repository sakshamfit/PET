/**
 * Employee dashboard — start work within seconds:
 * Check In · Register Student · Start School Visit · My Tasks · Team Chat.
 */

import { useEffect, useState } from 'react';
import {
  petAttendance, petMe, petVisits, petSchools, PetApiFailure,
} from '../services/petApi';
import type { EmployeeAttendance, FieldVisit, PetSchool, PetTask } from '../types/pet';
import { Badge, Card, EmptyState, Modal, Spinner, taskStatusLabel, Field } from '../ui';
import { RegisterStudentForm } from './students_shared';
import { SyncBadge } from './sync';

interface DashData {
  my_tasks: PetTask[];
  active_visit: FieldVisit | null;
  attendance_today: EmployeeAttendance | null;
  unread_messages: number;
  unread_notifications: number;
  my_students: Array<Record<string, string>>;
  recent_visits: Array<Record<string, string>>;
}

export function EmployeeDashboard({ navigate }: { navigate: (r: string) => void }) {
  const [data, setData] = useState<DashData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'in' | 'out' | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const [showVisit, setShowVisit] = useState(false);

  async function load() {
    try {
      setData((await petMe.dashboard()) as unknown as DashData);
      setError('');
    } catch (err) {
      setError(err instanceof PetApiFailure ? err.message : 'Could not load dashboard.');
    }
  }
  useEffect(() => { void load(); }, []);

  async function punch(kind: 'in' | 'out') {
    setBusy(kind);
    const geo: { latitude?: number; longitude?: number } = {};
    await new Promise<void>(resolve => {
      if (!navigator.geolocation) return resolve();
      navigator.geolocation.getCurrentPosition(
        pos => { geo.latitude = pos.coords.latitude; geo.longitude = pos.coords.longitude; resolve(); },
        () => resolve(),
        { timeout: 4000 },
      );
    });
    try {
      if (kind === 'in') await petAttendance.checkIn(geo);
      else await petAttendance.checkOut(geo);
      await load();
    } catch (err) {
      setError(err instanceof PetApiFailure ? err.message : 'Attendance action failed.');
    } finally {
      setBusy(null);
    }
  }

  if (!data) return error ? <EmptyState title="Dashboard unavailable" hint={error} /> : <Spinner />;

  const attendance = data.attendance_today;
  const checkedIn = !!attendance?.check_in_at && !attendance.check_out_at;

  return (
    <div className="space-y-4">
      {/* Check-in hero */}
      <Card className="!bg-pet-800 !border-pet-800 text-white">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-pet-100/70">Today</p>
            <p className="mt-1 text-lg font-bold">
              {checkedIn
                ? `Checked in · ${attendance.status}`
                : attendance?.check_out_at
                  ? 'Day completed'
                  : 'Not checked in'}
            </p>
            {attendance?.check_in_at ? (
              <p className="mt-0.5 text-xs text-pet-100/70">
                In {new Date(attendance.check_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {attendance.check_out_at
                  ? ` · Out ${new Date(attendance.check_out_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : ''}
              </p>
            ) : null}
          </div>
          {!attendance?.check_out_at ? (
            <button
              className={`p-btn ${checkedIn ? 'bg-white text-pet-800' : 'bg-emerald-400 text-pet-900'} font-bold`}
              onClick={() => punch(checkedIn ? 'out' : 'in')}
              disabled={busy !== null}
            >
              {busy ? 'Working…' : checkedIn ? 'Check Out' : 'Check In'}
            </button>
          ) : (
            <Badge tone="green">Done</Badge>
          )}
        </div>
      </Card>

      {/* Active visit banner */}
      {data.active_visit ? (
        <button
          className="p-card w-full border-emerald-300 bg-emerald-50 p-4 text-left"
          onClick={() => navigate('visits')}
        >
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Visit in progress</p>
          <p className="mt-1 font-bold text-slate-900">{data.active_visit.school_name}</p>
          <p className="text-xs text-slate-500">
            Started {new Date(data.active_visit.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {' · '}tap to continue →
          </p>
        </button>
      ) : null}

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <QuickAction icon="🎒" label="Register Student" onClick={() => setShowRegister(true)} />
        <QuickAction icon="🏫" label="Start School Visit" onClick={() => setShowVisit(true)} disabled={!!data.active_visit} />
        <QuickAction icon="✅" label="My Tasks" badge={data.my_tasks.length} onClick={() => navigate('tasks')} />
        <QuickAction icon="💬" label="Team Chat" badge={data.unread_messages} onClick={() => navigate('chat')} />
      </div>

      {/* My open tasks */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Open tasks</h3>
          <button className="text-xs font-semibold text-pet-700" onClick={() => navigate('tasks')}>View all →</button>
        </div>
        {data.my_tasks.length === 0 ? (
          <Card><EmptyState title="No open tasks" hint="New assignments will appear here." /></Card>
        ) : (
          <div className="space-y-2">
            {data.my_tasks.slice(0, 4).map(t => (
              <Card key={t.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{t.title}</p>
                  <p className="text-xs text-slate-500">
                    {t.priority !== 'normal' ? `${t.priority} · ` : ''}
                    {t.due_date ? `due ${t.due_date}` : 'no due date'}
                  </p>
                </div>
                <Badge tone={t.status === 'in_progress' ? 'blue' : t.status === 'pending' ? 'amber' : 'slate'}>
                  {taskStatusLabel(t.status)}
                </Badge>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* My recent students */}
      <section>
        <h3 className="mb-2 text-sm font-bold text-slate-900">Recently registered by me</h3>
        {data.my_students.length === 0 ? (
          <Card><EmptyState title="No students yet" hint="Register your first student in the field." /></Card>
        ) : (
          <div className="space-y-2">
            {data.my_students.slice(0, 5).map((s: Record<string, string>) => (
              <Card key={s.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{s.name}</p>
                  <p className="text-xs text-slate-500">{s.pet_student_id} · {s.school_name || 'no school'}</p>
                </div>
                <Badge tone="blue">{s.status}</Badge>
              </Card>
            ))}
          </div>
        )}
      </section>

      <SyncBadge />

      {showRegister ? (
        <Modal title="Register Student" onClose={() => setShowRegister(false)}>
          <RegisterStudentForm
            visitId={data.active_visit?.id ?? null}
            defaultSchoolId={data.active_visit?.school_id ?? null}
            onDone={async () => { setShowRegister(false); await load(); navigate('students'); }}
          />
        </Modal>
      ) : null}

      {showVisit ? (
        <Modal title="Start School Visit" onClose={() => setShowVisit(false)}>
          <StartVisitForm onDone={async () => { setShowVisit(false); await load(); }} />
        </Modal>
      ) : null}
    </div>
  );
}

function QuickAction({ icon, label, badge = 0, onClick, disabled = false }: {
  icon: string; label: string; badge?: number; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      className="p-card relative flex min-h-24 flex-col items-center justify-center gap-1.5 p-4 text-center transition active:scale-[0.98] disabled:opacity-50"
      onClick={onClick}
      disabled={disabled}
    >
      {badge > 0 ? (
        <span className="absolute right-2 top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
      <span className="text-2xl">{icon}</span>
      <span className="text-xs font-bold text-slate-800">{label}</span>
    </button>
  );
}

function StartVisitForm({ onDone }: { onDone: () => void }) {
  const [query, setQuery] = useState('');
  const [schools, setSchools] = useState<PetSchool[]>([]);
  const [selected, setSelected] = useState<PetSchool | null>(null);
  const [purpose, setPurpose] = useState('Student identification');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const res = await petSchools.list(query ? { q: query } : {});
        setSchools(res.schools.slice(0, 6));
      } catch { /* offline best effort */ }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  async function start() {
    if (!selected) return;
    setBusy(true);
    setError('');
    const geo: { latitude?: number; longitude?: number } = {};
    await new Promise<void>(resolve => {
      if (!navigator.geolocation) return resolve();
      navigator.geolocation.getCurrentPosition(
        pos => { geo.latitude = pos.coords.latitude; geo.longitude = pos.coords.longitude; resolve(); },
        () => resolve(), { timeout: 4000 },
      );
    });
    try {
      await petVisits.start({ school_id: selected.id, purpose, ...geo });
      onDone();
    } catch (err) {
      setError(err instanceof PetApiFailure ? err.message : 'Could not start the visit.');
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <Field label="School">
        <input className="p-input" placeholder="Search schools…" value={query} onChange={e => { setQuery(e.target.value); setSelected(null); }} />
      </Field>
      {selected ? (
        <p className="rounded-xl bg-pet-50 px-3 py-2 text-sm font-semibold text-pet-800">Selected: {selected.name}</p>
      ) : (
        <div className="max-h-44 space-y-1 overflow-y-auto">
          {schools.map(s => (
            <button key={s.id} className="w-full rounded-xl px-3 py-2.5 text-left text-sm hover:bg-slate-50"
              onClick={() => { setSelected(s); setQuery(s.name); }}>
              <span className="font-semibold">{s.name}</span>
              <span className="block text-xs text-slate-500">{s.locality || s.district || s.school_code}</span>
            </button>
          ))}
        </div>
      )}
      <Field label="Purpose">
        <input className="p-input" value={purpose} onChange={e => setPurpose(e.target.value)} />
      </Field>
      {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}
      <button className="p-btn-primary w-full" disabled={!selected || busy} onClick={start}>
        {busy ? 'Starting…' : 'Start visit'}
      </button>
    </div>
  );
}

