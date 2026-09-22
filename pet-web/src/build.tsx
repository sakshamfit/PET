/**
 * Build identity, staleness detection and the "new version is live" banner.
 *
 * The office PC keeps serving whatever is in `server/public/app`, and phones /
 * browsers keep whatever they last downloaded. Both used to be invisible —
 * that is how you end up staring at an old build with no way to tell. So:
 *
 *   1. every build embeds its own id (vite.pet.config.ts → __PET_BUILD__);
 *   2. the build writes `build-info.json` next to the bundle;
 *   3. this module shows that id in the UI and polls the server for it, so a
 *      client that is behind says so, out loud, with a Reload button.
 *
 * The stamp also names the server when one is configured remotely, so "which
 * build, which server?" is answerable by looking at the screen — including on
 * the deployment's own /build-info.json, which now records which app and which
 * API it was built for (see scripts/vite-build-stamp.mjs).
 */

import { useCallback, useEffect, useState } from 'react';
import { apiBaseHost } from '../../src/services/petApiBase';
import { useApiBase } from './runtime';

export type PetBuildInfo = {
  schema?: number;
  app?: string;
  version: string;
  buildId: string;
  commit: string | null;
  sourceHash: string | null;
  sourceFiles?: number;
  builtAt: string;
};

declare const __PET_BUILD__: PetBuildInfo | undefined;
declare const __PET_STATIC_PREVIEW__: boolean | undefined;
/** Where this deployment keeps its build descriptor, injected per build. */
declare const __PET_BUILD_INFO_URL__: string | undefined;
/** True when a static host serves this bundle (see __PET_HOSTED_STATIC__). */
declare const __PET_HOSTED_STATIC__: boolean | undefined;

const FALLBACK: PetBuildInfo = {
  version: '0.0.0',
  buildId: 'dev',
  commit: null,
  sourceHash: null,
  builtAt: new Date(0).toISOString(),
};

/**
 * True when this bundle was built for a static host with no PET server of its
 * own — `vite.pet-vercel.config.ts` without `PET_API_BASE`. The real
 * deployment (`npm run build:pet` + the Express server) is never a static
 * preview, and neither is a static build that was pointed at a real server:
 * in that case there is a server, it is just not on this host.
 */
export const STATIC_PREVIEW = typeof __PET_STATIC_PREVIEW__ !== 'undefined' && !!__PET_STATIC_PREVIEW__;

/**
 * True when this bundle is served by a static host (Vercel) rather than by the
 * PET server itself. There, "which server does this app talk to?" is a real
 * question with a changeable answer — and the connect screen must stay
 * reachable even when an answer was baked in at build time, or a device that
 * once connected to a since-moved tunnel URL would be stuck with it.
 */
export const HOSTED_STATIC = typeof __PET_HOSTED_STATIC__ !== 'undefined' && !!__PET_HOSTED_STATIC__;

/** The build this bundle was compiled from (injected by Vite `define`). */
export const BUILD: PetBuildInfo =
  typeof __PET_BUILD__ === 'object' && __PET_BUILD__ ? { ...FALLBACK, ...__PET_BUILD__ } : FALLBACK;

/**
 * URL of the server's build descriptor.
 *
 * Derived from this bundle's own URL so it stays correct whatever host or
 * path the app is served from (localhost, LAN, or the Cloudflare Tunnel
 * domain): the bundle lives at <base>/assets/index-<hash>.js, so the
 * descriptor lives at <base>/build-info.json.
 */
function buildInfoUrl(): string {
  const ASSET_MARKER = '/assets/';
  try {
    const self = new URL(import.meta.url);
    const at = self.pathname.indexOf(ASSET_MARKER);
    if (at > -1) {
      return `${self.origin}${self.pathname.slice(0, at + 1)}build-info.json`;
    }
  } catch {
    /* not running from a URL (unit tests / SSR) */
  }
  // Fallback for when the bundle's own URL is unavailable (unit tests, SSR).
  return typeof __PET_BUILD_INFO_URL__ === 'string' ? __PET_BUILD_INFO_URL__ : '/build-info.json';
}

const POLL_MS = 60_000;

export type BuildWatch = {
  /** build id currently served by the server (null until known / unreachable) */
  serverBuildId: string | null;
  /** true when the server serves a different build than this page is running */
  updateAvailable: boolean;
  /** this page's build */
  clientBuildId: string;
  /** force a refresh — clears any cached shell by reloading from the network */
  applyUpdate: () => void;
};

/**
 * Polls the server for its current build id. Safe offline (silently ignores
 * failures) and safe in dev (the dev server has no build-info.json).
 */
export function useBuildWatcher(enabled = true): BuildWatch {
  const [serverBuildId, setServerBuildId] = useState<string | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const url = buildInfoUrl();

    async function check() {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      try {
        const res = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const type = res.headers.get('content-type') || '';
        if (!type.includes('json')) return; // dev server SPA fallback — not a build
        const info = (await res.json()) as PetBuildInfo;
        if (cancelled || !info?.buildId) return;
        setServerBuildId(info.buildId);
        setUpdateAvailable(info.buildId !== BUILD.buildId && BUILD.buildId !== 'dev');
      } catch {
        /* offline or dev — never nag the user about it */
      }
    }

    void check();
    const timer = window.setInterval(check, POLL_MS);
    const onWake = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('online', check);
    window.addEventListener('focus', onWake);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('online', check);
      window.removeEventListener('focus', onWake);
    };
  }, [enabled]);

  const applyUpdate = useCallback(() => {
    window.location.reload();
  }, []);

  return { serverBuildId, updateAvailable, clientBuildId: BUILD.buildId, applyUpdate };
}

/** Small, unobtrusive build stamp — the answer to "which build am I looking at?" */
export function BuildStamp({ className = '' }: { className?: string }) {
  const apiBase = useApiBase();
  const built = BUILD.builtAt && BUILD.builtAt !== FALLBACK.builtAt ? new Date(BUILD.builtAt) : null;
  return (
    <p
      className={`text-[10px] leading-tight text-slate-400 ${className}`}
      title={`Build ${BUILD.buildId}\nBuilt ${built ? built.toLocaleString() : 'unknown'}${BUILD.commit ? `\nCommit ${BUILD.commit}` : ''}${apiBase ? `\nServer ${apiBase}` : '\nServer same-origin'}`}
    >
      v{BUILD.version} · build {BUILD.buildId}
      {apiBase ? ` · ${apiBaseHost(apiBase)}` : ''}
    </p>
  );
}

/**
 * Persistent banner shown when the server has a newer build than this page.
 * Nothing auto-reloads underneath the user — field staff may be mid-form, and
 * the offline queue is theirs to drain.
 */
export function UpdateBanner({ watch }: { watch: BuildWatch }) {
  if (!watch.updateAvailable) return null;
  return (
    <div className="sticky top-0 z-40 flex items-center justify-between gap-3 bg-amber-500 px-4 py-2 text-xs font-semibold text-white shadow">
      <span>A newer version of this app is live on the server.</span>
      <button
        className="rounded-lg bg-white/20 px-3 py-1 font-bold text-white ring-1 ring-white/40"
        onClick={watch.applyUpdate}
      >
        Update now
      </button>
    </div>
  );
}
