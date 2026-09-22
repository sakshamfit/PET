/**
 * "Which server is this copy of PET talking to?" — and how to change it.
 *
 * Only the static (Vercel) build shows this. The office-server build serves the
 * API from its own origin, so it has nothing to configure and shows nothing.
 *
 * Why it exists at all: the deployed app is static, and its data server is a
 * machine in the Trust's office. If the address was never baked in (or changes
 * — a Cloudflare quick tunnel URL does not survive a restart), the person
 * holding the phone must be able to fix it *there*, in one screen, instead of
 * "sign-in fails with a network error" and nobody knowing why.
 */

import { useState } from 'react';
import { apiBaseHost } from '../../src/services/petApiBase';
import { HOSTED_STATIC } from './build';
import { probeServer, setApiBase, useApiBase } from './runtime';

export function ServerConnection() {
  const apiBase = useApiBase();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);

  // The office-server build is same-origin: nothing to connect, nothing to say.
  if (!HOSTED_STATIC) return null;

  async function connect(ev: React.FormEvent) {
    ev.preventDefault();
    setError('');
    setBusy(true);
    const result = await probeServer(draft);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setApiBase(result.base ?? '');
    // Reload so every module starts from the same configuration the user just
    // proved works — no half-connected state to debug later.
    window.location.reload();
  }

  if (apiBase && !editing) {
    return (
      <div className="mt-4 rounded-2xl bg-white/10 px-3 py-2 text-center text-[11px] text-pet-100">
        <span className="font-semibold text-white">Server:</span> {apiBaseHost(apiBase)}
        <button
          className="ml-2 underline decoration-dotted hover:text-white"
          onClick={() => {
            setDraft(apiBase);
            setEditing(true);
          }}
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={connect} className="p-card mt-4 rounded-3xl p-4">
      <h2 className="text-sm font-bold text-slate-900">Connect to your PET server</h2>
      <p className="mt-1 text-xs text-slate-500">
        This copy of the app is hosted on the web, but your data lives on the Trust&apos;s office
        PC. Enter its public address to sign in — the address is saved on this device only.
      </p>
      <input
        className="p-input mt-3"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        placeholder="https://app.example.org"
        inputMode="url"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        required
      />
      {error ? <p className="mt-2 text-xs font-medium text-rose-600">{error}</p> : null}
      <div className="mt-3 flex gap-2">
        <button className="p-btn-primary flex-1" disabled={busy}>
          {busy ? 'Checking…' : 'Connect'}
        </button>
        {editing ? (
          <button type="button" className="p-btn-ghost" onClick={() => setEditing(false)}>
            Cancel
          </button>
        ) : null}
      </div>
      <p className="mt-2 text-[11px] leading-snug text-slate-400">
        Not sure of the address? It is the tunnel domain from
        {' '}
        <span className="font-mono">docs/PET/13_OFFICE_PC_CLOUDFLARE_TUNNEL_GOLIVE.md</span> — the
        office PC must also list this site in <span className="font-mono">CORS_ORIGINS</span>.
      </p>
    </form>
  );
}


