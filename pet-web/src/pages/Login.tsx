/**
 * PET login — credentials → JWT session. Forced password change flow for
 * accounts provisioned with a temporary password (must_change_password).
 */

import { useState } from 'react';
import { apiBaseHost } from '../../../src/services/petApiBase';
import { petAuth, PetApiFailure } from '../../../src/services/petApi';
import { Field } from '../ui';
import { BuildStamp, HOSTED_STATIC } from '../build';
import { ServerConnection } from '../connect';
import { useApiBase } from '../runtime';

/**
 * Where does this copy of the app get its data? Stated on the login screen,
 * because that is where the question is asked: a static deployment with no
 * server configured cannot sign anyone in, and saying so beats a network error.
 */
function ConnectionPill() {
  const apiBase = useApiBase();
  // Office-server build: the API is on this very origin. Nothing to explain.
  if (!HOSTED_STATIC) return null;
  return (
    <p className="mt-3 inline-block rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-pet-100">
      {apiBase ? `Server: ${apiBaseHost(apiBase)}` : 'Not connected to a PET server yet'}
    </p>
  );
}

export function LoginPage({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [mustChange, setMustChange] = useState<{ currentPassword: string } | null>(null);
  const [nextPw, setNextPw] = useState({ a: '', b: '' });

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setError('');
    setBusy(true);
    try {
      const payload = await petAuth.login(email.trim().toLowerCase(), password);
      if (payload.user.must_change_password) {
        setMustChange({ currentPassword: password });
      } else {
        onLoggedIn();
      }
    } catch (err) {
      setError(err instanceof PetApiFailure ? err.message : 'Sign-in failed. Check connectivity.');
    } finally {
      setBusy(false);
    }
  }

  async function submitNewPassword(ev: React.FormEvent) {
    ev.preventDefault();
    setError('');
    if (nextPw.a !== nextPw.b) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await petAuth.changePassword(mustChange!.currentPassword, nextPw.a);
      // Password change revokes all sessions — sign in fresh.
      await petAuth.login(email.trim().toLowerCase(), nextPw.a);
      onLoggedIn();
    } catch (err) {
      setError(err instanceof PetApiFailure ? err.message : 'Could not set the new password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-pet-900 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-2xl font-black text-white">
            P
          </div>
          <h1 className="text-xl font-bold text-white">Purvanchal Education Trust</h1>
          <p className="mt-1 text-sm text-pet-100/70">Organization &amp; Field Operations</p>
          <ConnectionPill />
        </div>

        {mustChange ? (
          <form onSubmit={submitNewPassword} className="p-card rounded-3xl p-6">
            <h2 className="text-base font-bold">Set your password</h2>
            <p className="mt-1 text-sm text-slate-500">
              Your account was provisioned with a temporary password. Choose a new one now.
            </p>
            <div className="mt-4 space-y-3">
              <Field label="New password">
                <input type="password" className="p-input" value={nextPw.a}
                  onChange={e => setNextPw(p => ({ ...p, a: e.target.value }))} required minLength={8} autoComplete="new-password" />
              </Field>
              <Field label="Confirm new password">
                <input type="password" className="p-input" value={nextPw.b}
                  onChange={e => setNextPw(p => ({ ...p, b: e.target.value }))} required minLength={8} autoComplete="new-password" />
              </Field>
              <p className="text-xs text-slate-500">At least 8 characters, one letter and one number.</p>
              {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}
              <button className="p-btn-primary w-full" disabled={busy}>
                {busy ? 'Saving…' : 'Save password & sign in'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={submit} className="p-card rounded-3xl p-6">
            <div className="space-y-3">
              <Field label="Email">
                <input type="email" className="p-input" value={email} onChange={e => setEmail(e.target.value)}
                  required autoComplete="username" inputMode="email" placeholder="you@pet.org" />
              </Field>
              <Field label="Password">
                <input type="password" className="p-input" value={password} onChange={e => setPassword(e.target.value)}
                  required autoComplete="current-password" placeholder="••••••••" />
              </Field>
              {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}
              <button className="p-btn-primary w-full" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </div>
          </form>
        )}
        <ServerConnection />
        <p className="mt-6 text-center text-xs text-pet-100/50">Private system — authorized PET staff only</p>
        <div className="mt-2 text-center">
          <BuildStamp className="!text-pet-100/40" />
        </div>
      </div>
    </div>
  );
}
