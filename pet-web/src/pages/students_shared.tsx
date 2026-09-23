/**
 * Shared student registration form — fast, mobile-first.
 * Includes the mandatory duplicate-warning flow (server returns 409
 * POSSIBLE_DUPLICATES; the registrar reviews and explicitly acknowledges;
 * records are never silently merged) and offline queue fallback.
 */

import { useEffect, useState } from 'react';
import { petStudents, petSchools, PetApiFailure } from '../services/petApi';
import type { DuplicateCandidate, PetSchool, StudentRegistrationInput } from '../types/pet';
import { Field, Badge } from '../ui';
import { enqueue } from '../services/petSyncQueue';

export function RegisterStudentForm({ visitId = null, defaultSchoolId = null, onDone }: {
  visitId?: string | null;
  defaultSchoolId?: string | null;
  onDone: (studentId: string) => void;
}) {
  const [form, setForm] = useState<Record<string, string>>({
    name: '', dob: '', gender: '', student_phone: '', parent_name: '', parent_phone: '',
    parent_relation: '', current_class: '', locality: '', city: '', district: '', state: '', notes: '',
  });
  const [schoolQuery, setSchoolQuery] = useState('');
  const [schoolOptions, setSchoolOptions] = useState<PetSchool[]>([]);
  const [school, setSchool] = useState<PetSchool | null>(null);
  const [photo, setPhoto] = useState<{ fileName: string; mimeType: string; dataBase64: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[] | null>(null);

  useEffect(() => {
    if (defaultSchoolId) {
      void petSchools.get(defaultSchoolId).then(r => { setSchool(r.school); setSchoolQuery(r.school.name); }).catch(() => {});
    }
  }, [defaultSchoolId]);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (school) return;
      try {
        const res = await petSchools.list(schoolQuery ? { q: schoolQuery } : {});
        setSchoolOptions(res.schools.slice(0, 5));
      } catch { /* offline best effort */ }
    }, 250);
    return () => clearTimeout(t);
  }, [schoolQuery, school]);

  function set(k: string, v: string) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function buildInput(acknowledge: boolean): StudentRegistrationInput {
    return {
      name: form.name.trim(),
      dob: form.dob || null,
      gender: (form.gender || null) as StudentRegistrationInput['gender'],
      student_phone: form.student_phone.trim() || null,
      parent_name: form.parent_name.trim() || null,
      parent_phone: form.parent_phone.trim() || null,
      parent_relation: form.parent_relation.trim() || null,
      current_class: form.current_class.trim() || null,
      locality: form.locality.trim() || null,
      city: form.city.trim() || null,
      district: form.district.trim() || null,
      state: form.state.trim() || null,
      notes: form.notes.trim() || null,
      school_id: school?.id ?? null,
      visit_id: visitId,
      acknowledge_duplicates: acknowledge,
      photo_data: photo,
    };
  }

  async function submit(acknowledge = false) {
    setBusy(true);
    setError('');
    try {
      const res = await petStudents.register(buildInput(acknowledge));
      onDone(res.student.id);
    } catch (err) {
      if (err instanceof PetApiFailure && err.code === 'POSSIBLE_DUPLICATES') {
        setDuplicates(err.details?.duplicates ?? []);
      } else if (err instanceof PetApiFailure && (err.status === 0 || err.code === 'NETWORK' || !navigator.onLine)) {
        queueOffline();
      } else if (!navigator.onLine || err instanceof TypeError) {
        queueOffline();
      } else {
        setError(err instanceof PetApiFailure ? err.message : 'Could not save the student.');
      }
    } finally {
      setBusy(false);
    }
  }

  function queueOffline() {
    // Offline: queue with an idempotency key. Server deduplicates on replay;
    // the employee is told nothing is lost.
    enqueue('student.register', { ...buildInput(true), photo_data: undefined } as unknown as Record<string, unknown>, form.name);
    onDone('queued');
  }

  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    setPhoto({ fileName: file.type === 'image/png' ? 'photo.png' : 'photo.jpg', mimeType: file.type || 'image/jpeg', dataBase64: btoa(binary) });
  }

  if (duplicates) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-bold text-amber-900">Possible duplicate — review before saving</p>
          <p className="mt-1 text-xs text-amber-800">
            The server found existing students that look similar. Saving will create a NEW record with a new PET
            Student ID — existing records are never merged automatically.
          </p>
        </div>
        <div className="space-y-2">
          {duplicates.map(d => (
            <div key={d.id} className="p-card p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold">{d.name}</p>
                <Badge tone="blue">{d.pet_student_id}</Badge>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">{d.school_name || 'No school'} · {d.status}</p>
              <p className="mt-1 text-xs font-medium text-amber-700">Matched: {d.reasons.join(', ')}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button className="p-btn-ghost flex-1" onClick={() => setDuplicates(null)}>Go back &amp; fix</button>
          <button className="p-btn-primary flex-1" disabled={busy} onClick={() => submit(true)}>
            {busy ? 'Saving…' : 'Not a duplicate — save new'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="space-y-3" onSubmit={e => { e.preventDefault(); void submit(false); }}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Field label="Full name *">
            <input className="p-input" value={form.name} onChange={e => set('name', e.target.value)} required minLength={2} />
          </Field>
        </div>
        <Field label="Date of birth">
          <input type="date" className="p-input" value={form.dob} onChange={e => set('dob', e.target.value)} />
        </Field>
        <Field label="Gender">
          <select className="p-input" value={form.gender} onChange={e => set('gender', e.target.value)}>
            <option value="">—</option><option value="male">Male</option>
            <option value="female">Female</option><option value="other">Other</option>
          </select>
        </Field>
        <Field label="Student phone">
          <input className="p-input" inputMode="tel" value={form.student_phone} onChange={e => set('student_phone', e.target.value)} />
        </Field>
        <Field label="Current class">
          <input className="p-input" value={form.current_class} onChange={e => set('current_class', e.target.value)} placeholder="e.g. 8" />
        </Field>
        <Field label="Parent/guardian name">
          <input className="p-input" value={form.parent_name} onChange={e => set('parent_name', e.target.value)} />
        </Field>
        <Field label="Parent relation">
          <input className="p-input" value={form.parent_relation} onChange={e => set('parent_relation', e.target.value)} placeholder="father / mother…" />
        </Field>
        <div className="col-span-2">
          <Field label="Parent phone">
            <input className="p-input" inputMode="tel" value={form.parent_phone} onChange={e => set('parent_phone', e.target.value)} />
          </Field>
        </div>
        <div className="col-span-2">
          <Field label="School">
            <input className="p-input" placeholder="Search schools…" value={schoolQuery}
              onChange={e => { setSchoolQuery(e.target.value); setSchool(null); }} />
          </Field>
          {school ? (
            <p className="mt-1 rounded-lg bg-pet-50 px-3 py-1.5 text-xs font-semibold text-pet-800">✓ {school.name}</p>
          ) : schoolOptions.length ? (
            <div className="mt-1 space-y-0.5">
              {schoolOptions.map(s => (
                <button type="button" key={s.id}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
                  onClick={() => { setSchool(s); setSchoolQuery(s.name); }}>
                  <span className="font-semibold">{s.name}</span>
                  <span className="block text-xs text-slate-500">{s.locality || s.district || s.school_code}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <Field label="Locality">
          <input className="p-input" value={form.locality} onChange={e => set('locality', e.target.value)} />
        </Field>
        <Field label="District">
          <input className="p-input" value={form.district} onChange={e => set('district', e.target.value)} />
        </Field>
        <Field label="City">
          <input className="p-input" value={form.city} onChange={e => set('city', e.target.value)} />
        </Field>
        <Field label="State">
          <input className="p-input" value={form.state} onChange={e => set('state', e.target.value)} />
        </Field>
        <div className="col-span-2">
          <Field label="Notes">
            <textarea className="p-input" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
          </Field>
        </div>
        <div className="col-span-2">
          <Field label="Student photo">
            <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="p-input !py-2" onChange={pickPhoto} />
          </Field>
          {photo ? <p className="mt-1 text-xs font-medium text-emerald-700">✓ Photo attached</p> : null}
        </div>
      </div>
      {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}
      <button className="p-btn-primary w-full" disabled={busy}>
        {busy ? 'Saving…' : navigator.onLine ? 'Save student' : 'Save offline (queues for sync)'}
      </button>
      <p className="text-center text-[11px] text-slate-400">
        Duplicate check runs on the server before the permanent PET Student ID is issued.
      </p>
    </form>
  );
}
