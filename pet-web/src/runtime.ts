/**
 * Runtime configuration for the static (Vercel) build: *which PET server does
 * this copy of the app talk to?*
 *
 * Build-time `PET_API_BASE` is the zero-touch path — set it in Vercel and the
 * address is baked into the bundle. This module adds the fallback that does not
 * need a redeploy: a server address chosen on the device (the connect screen,
 * `pet-web/src/connect.tsx`), stored locally and applied before React renders.
 *
 * Precedence, highest first:
 *   1. a server chosen on this device   (localStorage `pet.apiBase`)
 *   2. the server baked at build time   (the JSON block in index.html)
 *   3. nothing                          → same-origin `/api` (office-server
 *                                         build only) or an honest preview
 *
 * `petApi.ts` reads `window.PET_API_BASE` on every request, so applying the
 * value at boot is enough — no module reload, no stale closure.
 */

import { useEffect, useState } from 'react';
import { healthUrlFor, normalizeApiBase } from '../../src/services/petApiBase';

const STORAGE_KEY = 'pet.apiBase';
const CONFIG_ELEMENT_ID = 'pet-runtime-config';

function readInjectedApiBase(): string {
  if (typeof document === 'undefined') return '';
  const el = document.getElementById(CONFIG_ELEMENT_ID);
  if (!el) return '';
  try {
    const parsed = JSON.parse(el.textContent || '{}') as { apiBase?: unknown };
    return typeof parsed.apiBase === 'string' ? parsed.apiBase : '';
  } catch {
    return '';
  }
}

/** The server this device chose, if any. Never throws (private-mode Safari). */
export function storedApiBase(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** The server this app is talking to right now ('' = same-origin / not set). */
export function currentApiBase(): string {
  if (typeof window === 'undefined') return '';
  return window.PET_API_BASE ?? '';
}

let listeners = new Set<() => void>();

/** Subscribe to changes so the UI cannot show stale connection state. */
export function subscribeApiBase(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function emit() {
  for (const fn of listeners) fn();
}

/** Point the running app at a server ('' / null = forget it). */
export function setApiBase(base: string | null): void {
  const value = (base ?? '').trim().replace(/\/+$/, '');
  try {
    if (value) window.localStorage.setItem(STORAGE_KEY, value);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable — the in-memory value below still applies */
  }
  if (typeof window !== 'undefined') {
    if (value) window.PET_API_BASE = value;
    else delete window.PET_API_BASE;
  }
  emit();
}

/**
 * Boot step (called from main.tsx before the first render): apply the device's
 * choice, else the build-time one. Returns the base in effect.
 */
export function applyRuntimeApiBase(): string {
  const base = (storedApiBase() || readInjectedApiBase()).trim().replace(/\/+$/, '');
  if (base && typeof window !== 'undefined') window.PET_API_BASE = base;
  return base;
}

/** React binding for `currentApiBase()`. */
export function useApiBase(): string {
  const [base, setBase] = useState(currentApiBase);
  useEffect(() => subscribeApiBase(() => setBase(currentApiBase())), []);
  return base;
}

/** Outcome of probing a server: reachable (base set) or not (error says why). */
export type ProbeResult = { ok: boolean; base?: string; error?: string };

/**
 * Check that a server is reachable *from this browser* before we adopt it.
 *
 * `/health` is unauthenticated by design, and a cross-origin GET without custom
 * headers needs no preflight — so a successful probe proves the two things that
 * actually break this setup: the server is up, and it sends the CORS header
 * that lets this site read the answer.
 */
export async function probeServer(input: string, timeoutMs = 8000): Promise<ProbeResult> {
  const normalized = normalizeApiBase(input, { allowLocal: true });
  if (!normalized.ok) return { ok: false, error: normalized.error };

  const base = normalized.base ?? '';
  const healthUrl = healthUrlFor(base);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(healthUrl, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) {
      return {
        ok: false,
        base,
        error: `${healthUrl} answered HTTP ${res.status}. Check the address, and that the PET server is running.`,
      };
    }
    const text = await res.text();
    try {
      const health = JSON.parse(text) as { status?: string };
      if (health.status && health.status !== 'ok') {
        return { ok: false, base, error: `The server answered, but reports status "${health.status}".` };
      }
    } catch {
      return {
        ok: false,
        base,
        error: `${base} answered, but not like the PET server (expected JSON from /health).`,
      };
    }
    return { ok: true, base };
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return {
      ok: false,
      base,
      error: aborted
        ? `${base} did not answer within ${Math.round(timeoutMs / 1000)}s.`
        : `Cannot reach ${base} from this browser. If the server is up, this site must be added to ` +
          'CORS_ORIGINS on the office PC (docs/PET/13).',
    };
  } finally {
    clearTimeout(timer);
  }
}
