/**
 * Team / staff — Main Admin only.
 *
 * Add a person, reset their access, or disable them. The temporary password
 * comes back from the API exactly once and is held only in this screen's
 * state until the admin dismisses it. It is never written to storage, never
 * put in a list, and never sent back to the server.
 */

import { useCallback, useEffect, useState } from 'react';
import { getPetUser, PetApiFailure, petEmployees } from '../services/petApi';
import type { PetUser } from '../types/pet';
import { Badge, Card, EmptyState, Field, Modal, Spinner } from '../ui';

type StatusFilter = '' | 'ACTIVE' | 'DISABLED';

type RevealedPassword = {
  name: string;
  email: string;
  password: string;
  reason: 'created' | 'reset';
};

export function TeamPage() {
  const isAdmin = getPetUser()?.role === 'main_admin';
  const [employees, setEmployees] = useState<PetUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('');
  const [showAdd, setShowAdd] = useState(false);
  const [revealed, setRevealed] = useState<RevealedPassword | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: '200' };
      if (filter) params.status = filter;
      if (query.trim()) params.q = query.trim();
      const res = await petEmployees.list(params);
      setEmployees(res.employees);
      setTotal(res.total);
      setError('');
    } catch (err) {
      setError(err instanceof PetApiFailure ? err.message : 'Could not load the team.');
    } finally {
      setLoading(false);
    }
  }, [filter, query]);

  useEffect(() => {
    if (!isAdmin) return;
    const t = setTimeout(() => { void load(); }, query ? 250 : 0);
    return () => clearTimeout(t);
  }, [isAdmin, load, query]);

  function dismissPassword() {
    setRevealed(null);
  }

  async function resetAccess(person: PetUser) {
    const ok = window.confirm(
      `Reset access for ${person.name}?\n\nThey will be signed out everywhere. A new one-time password is shown once and cannot be looked up later.`,
    );
    if (!ok) return;
    setPending(person.id);
    setError('');
    try {
      const res = await petEmployees.resetAccess(person.id);
      setRevealed({
        name: res.user.name,
        email: res.user.email,
        password: res.temporaryPassword,
        reason: 'reset',
      });
      await load();
    } catch (err) {
      setError(err instanceof PetApiFailure ? err.message : 'Could not reset access.');
    } finally {
      setPending(null);
    }
  }

  async function setStatus(person: PetUser, status: 'ACTIVE' | 'DISABLED') {
    if (status === 'DISABLED') {
      const ok = window.confirm(
        `Disable ${person.name}?\n\nThey are signed out immediately and cannot sign in. Their visits, tasks and history stay.`,
      );
      if (!ok) return;
    }
    setPending(person.id);
    setError('');
    try {
      await petEmployees.setStatus(person.id, status);
      await load();
    } catch (err) {
      setError(err instanceof PetApiFailure ? err.message : 'Could not update status.');
    } finally {
      setPending(null);
    }
  }

  if (!isAdmin) {
    return (
      <Card>
        <EmptyState title="Main Admin only" hint="Staff accounts are created and disabled from the Main Admin Team screen." />
      </Card>
    );
  }

  const active = employees.filter(e => e.status === 'ACTIVE').length;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Team</h2>
          <p className="text-xs text-slate-500">
            {total} staff{filter ? '' : ` · ${active} active on this page`}. One-time passwords are shown once, then gone.
          </p>
        </div>
        <button className="p-btn-primary shrink-0" onClick={() => setShowAdd(true)}>+ Staff</button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          className="p-input sm:max-w-xs"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search name, email, code…"
          aria-label="Search staff"
        />
        <div className="flex gap-1.5">
          {([
            ['', 'All'],
            ['ACTIVE', 'Active'],
            ['DISABLED', 'Disabled'],
          ] as Array<[StatusFilter, string]>).map(([key, label]) => (
            <button
              key={label}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${filter === key ? 'bg-pet-800 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}

      {loading && employees.length === 0 ? <Spinner label="Loading team…" /> : employees.length === 0 ? (
        <Card><EmptyState title="No staff match" hint="Add the first field employee, or clear the search." /></Card>
      ) : (
        <div className="space-y-2">
          {employees.map(person => (
            <Card key={person.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">{person.name}</p>
                  <p className="truncate text-xs text-slate-500">{person.email}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {person.employee_code || 'No code'}
                    {person.department ? ` · ${person.department}` : ''}
                    {person.phone ? ` · ${person.phone}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge tone={person.status === 'ACTIVE' ? 'green' : 'red'}>
                    {person.status === 'ACTIVE' ? 'Active' : 'Disabled'}
                  </Badge>
                  {person.must_change_password ? <Badge tone="amber">Must set password</Badge> : null}
                </div>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <button
                  className="p-btn-ghost !min-h-8 !px-2.5 text-xs"
                  disabled={pending === person.id}
                  onClick={() => void resetAccess(person)}
                >
                  Reset password
                </button>
                {person.status === 'ACTIVE' ? (
                  <button
                    className="p-btn-ghost !min-h-8 !px-2.5 text-xs text-rose-700"
                    disabled={pending === person.id}
                    onClick={() => void setStatus(person, 'DISABLED')}
                  >
                    Disable
                  </button>
                ) : (
                  <button
                    className="p-btn-ghost !min-h-8 !px-2.5 text-xs"
                    disabled={pending === person.id}
                    onClick={() => void setStatus(person, 'ACTIVE')}
                  >
                    Enable
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {showAdd ? (
        <Modal title="Add staff" onClose={() => setShowAdd(false)}>
          <AddStaffForm
            onCancel={() => setShowAdd(false)}
            onCreated={async (person, password) => {
              setShowAdd(false);
              setRevealed({
                name: person.name,
                email: person.email,
                password,
                reason: 'created',
              });
              await load();
            }}
          />
        </Modal>
      ) : null}

      {revealed ? <OneTimePassword reveal={revealed} onDismiss={dismissPassword} /> : null}
    </div>
  );
}

function AddStaffForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (person: PetUser, password: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [department, setDepartment] = useState('');
  const [joiningDate, setJoiningDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await petEmployees.create({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || undefined,
        department: department.trim() || undefined,
        joining_date: joiningDate || undefined,
      });
      await onCreated(res.user, res.temporaryPassword);
    } catch (err) {
      setError(err instanceof PetApiFailure ? err.message : 'Could not add this person.');
      setBusy(false);
    }
  }

  return (
    <form className="space-y-3" onSubmit={submit}>
      <p className="text-xs text-slate-500">
        A one-time password is generated by the server and shown on the next screen only. It is not stored.
      </p>
      <Field label="Name *">
        <input className="p-input" value={name} onChange={e => setName(e.target.value)} required minLength={2} autoComplete="name" />
      </Field>
      <Field label="Email *">
        <input className="p-input" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="off" inputMode="email" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone">
          <input className="p-input" value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" autoComplete="off" />
        </Field>
        <Field label="Joining date">
          <input className="p-input" type="date" value={joiningDate} onChange={e => setJoiningDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Department">
        <input className="p-input" value={department} onChange={e => setDepartment(e.target.value)} placeholder="Field operations" />
      </Field>
      {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}
      <div className="flex gap-2">
        <button className="p-btn-primary flex-1" disabled={busy}>{busy ? 'Adding…' : 'Add staff'}</button>
        <button type="button" className="p-btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

function OneTimePassword({ reveal, onDismiss }: { reveal: RevealedPassword; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(reveal.password);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Modal title="One-time password" onClose={onDismiss}>
      <p className="text-sm text-slate-700">
        {reveal.reason === 'created' ? 'Account created for' : 'Access reset for'}{' '}
        <b>{reveal.name}</b> ({reveal.email}).
      </p>
      <p className="mt-2 text-xs font-medium text-amber-800">
        Shown once. Closing this hides it forever — it is not saved in the app, the database, or the logs.
        Send it to them now. They must choose their own password at first sign-in.
      </p>
      <input
        className="p-input mt-3 font-mono text-lg tracking-wide"
        readOnly
        value={reveal.password}
        aria-label="One-time password"
        onFocus={e => e.currentTarget.select()}
      />
      <div className="mt-3 flex gap-2">
        <button type="button" className="p-btn-ghost flex-1" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" className="p-btn-primary flex-1" onClick={onDismiss}>
          I&apos;ve saved it
        </button>
      </div>
    </Modal>
  );
}
