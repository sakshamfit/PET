/**
 * Field Visits — active visit workspace (register students, notes/report,
 * end visit) + history. Mobile-first.
 */

import { useCallback, useEffect, useState } from 'react';
import { petVisits, PetApiFailure } from '../../../src/services/petApi';
import type { FieldVisit, FieldMedia, PetStudent, PetTask } from '../../../src/types/pet';
import { Badge, Card, EmptyState, Field, Modal, Spinner } from '../ui';
import { RegisterStudentForm } from './students_shared';

interface VisitDetail {
  visit: FieldVisit;
  media: FieldMedia[];
  students: Array<Partial<PetStudent>>;
  tasks: PetTask[];
}

export function VisitsPage() {
  const [visits, setVisits] = useState<FieldVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setVisits((await petVisits.list({})).visits); } catch { /* stale */ }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const active = visits.find(v => v.status === 'active');

  return (
    <div className="space-y-3">
      {active ? (
        <button
          className="p-card w-full border-emerald-300 bg-emerald-50 p-4 text-left"
          onClick={() => setOpenId(active.id)}
        >
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Active visit — tap to open workspace</p>
          <p className="mt-1 font-bold text-slate-900">{active.school_name}</p>
          <p className="text-xs text-slate-500">
            {active.purpose || 'Field visit'} · started {new Date(active.started_at).toLocaleTimeString()}
          </p>
        </button>
      ) : null}

      <h3 className="text-sm font-bold text-slate-900">Visit history</h3>
      {loading ? <Spinner /> : visits.length === 0 ? (
        <Card><EmptyState title="No visits yet" hint="Start a school visit from the dashboard." /></Card>
      ) : (
        <div className="space-y-2">
          {visits.map(v => (
            <button key={v.id} className="p-card w-full p-3.5 text-left" onClick={() => setOpenId(v.id)}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{v.school_name}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(v.started_at).toLocaleDateString()} · {v.employee_name}
                    {v.students_registered ? ` · ${v.students_registered} registered` : ''}
                  </p>
                </div>
                <Badge tone={v.status === 'active' ? 'green' : v.status === 'completed' ? 'blue' : 'red'}>
                  {v.status}
                </Badge>
              </div>
            </button>
          ))}
        </div>
      )}

      {openId ? <VisitDetailModal id={openId} onClose={() => { setOpenId(null); void load(); }} /> : null}
    </div>
  );
}

function VisitDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const [data, setData] = useState<VisitDetail | null>(null);
  const [error, setError] = useState('');
  const [report, setReport] = useState('');
  const [contacted, setContacted] = useState('0');
  const [docs, setDocs] = useState('0');
  const [busy, setBusy] = useState(false);
  const [showRegister, setShowRegister] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = (await petVisits.detail(id)) as unknown as VisitDetail;
      setData(d);
      setReport(d.visit.report ?? '');
      setContacted(String(d.visit.students_contacted ?? 0));
      setDocs(String(d.visit.documents_collected ?? 0));
    } catch (err) {
      setError(err instanceof PetApiFailure ? err.message : 'Could not load the visit.');
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  async function endVisit() {
    setBusy(true);
    try {
      await petVisits.end(id, {
        report: report || undefined,
        students_contacted: Number(contacted) || 0,
        documents_collected: Number(docs) || 0,
      });
      onClose();
    } catch (err) {
      setError(err instanceof PetApiFailure ? err.message : 'Could not end the visit.');
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <Modal title="Field Visit" onClose={onClose}>
        {error ? <EmptyState title="Unavailable" hint={error} /> : <Spinner />}
      </Modal>
    );
  }
  const { visit, students, tasks, media } = data;
  const isActive = visit.status === 'active';

  if (showRegister) {
    return (
      <Modal title="Register Student" onClose={() => setShowRegister(false)}>
        <RegisterStudentForm
          visitId={visit.id}
          defaultSchoolId={visit.school_id}
          onDone={async () => { setShowRegister(false); await load(); }}
        />
      </Modal>
    );
  }

  return (
    <Modal title={visit.school_name} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{visit.purpose || 'Field visit'}</span>
          <Badge tone={isActive ? 'green' : visit.status === 'completed' ? 'blue' : 'red'}>{visit.status}</Badge>
        </div>
        <p className="text-xs text-slate-500">
          {visit.employee_name} · {new Date(visit.started_at).toLocaleString()}
          {visit.ended_at ? ` → ${new Date(visit.ended_at).toLocaleTimeString()}` : ''}
        </p>

        <section>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="p-label !mb-0">Students registered ({students.length})</p>
            {isActive ? (
              <button className="p-btn-primary !min-h-8 !px-2.5 text-xs" onClick={() => setShowRegister(true)}>
                + Register student
              </button>
            ) : null}
          </div>
          {students.length === 0 ? (
            <p className="text-xs text-slate-400">None yet.</p>
          ) : (
            students.map(s => (
              <p key={s.id} className="text-xs font-medium text-slate-700">
                {s.name} <span className="text-slate-400">· {s.pet_student_id}</span>
              </p>
            ))
          )}
        </section>

        <div className="flex gap-3 text-xs text-slate-500">
          <span>📷 {media.length} media</span>
          <span>✅ {tasks.length} tasks</span>
        </div>

        {isActive ? (
          <section className="space-y-3 rounded-2xl border border-slate-200 p-3">
            <p className="p-label !mb-0">Visit report & end</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Students contacted">
                <input className="p-input" inputMode="numeric" value={contacted} onChange={e => setContacted(e.target.value)} />
              </Field>
              <Field label="Documents collected">
                <input className="p-input" inputMode="numeric" value={docs} onChange={e => setDocs(e.target.value)} />
              </Field>
            </div>
            <Field label="Report">
              <textarea className="p-input" rows={3} value={report} onChange={e => setReport(e.target.value)}
                placeholder="Summary of the visit — outcomes, next steps…" />
            </Field>
            {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}
            <button className="p-btn-primary w-full" disabled={busy} onClick={endVisit}>
              {busy ? 'Ending…' : 'Submit report & end visit'}
            </button>
          </section>
        ) : visit.report ? (
          <section>
            <p className="p-label">Report</p>
            <p className="whitespace-pre-line text-xs text-slate-700">{visit.report}</p>
          </section>
        ) : null}
      </div>
    </Modal>
  );
}
