/**
 * Where the PET web app sends its API calls — one rule, used everywhere.
 *
 * The PET platform is a *server* (Express + SQLite on the Trust's office PC,
 * see docs/PET/13). A static host can serve the interface but never the data,
 * so a statically-hosted build has exactly two options:
 *
 *   1. same-origin relative `/api`   — the office-server build, where Express
 *      serves the SPA and the API together. Nothing to configure.
 *   2. an absolute URL to that server — the static (Vercel) build, wired up
 *      with `PET_API_BASE` at build time (Vercel → Settings → Environment
 *      Variables) or by the in-app "connect to server" screen at runtime.
 *
 * Both paths go through `normalizeApiBase`, so a typo is caught once, in one
 * place, and reported in words the operator can act on — instead of producing
 * a bundle that fetches `/auth/login` from the wrong host and fails at sign-in
 * with a meaningless network error.
 *
 * Used by: vite.pet-vercel.config.ts (build-time gate), pet-web/src/runtime.ts
 * (the connect screen), scripts/verify-deployment.mjs (the post-deploy check).
 */

/**
 * Result of validating an API base: the normalized URL, or why it was refused.
 *
 * Flat and optional on purpose — this repository compiles without
 * `strictNullChecks` (tsconfig.json), and in that mode TypeScript does not
 * narrow boolean-literal discriminants, so an `{ ok: true } | { ok: false }`
 * union would not give callers `.error` after `if (!result.ok)`. These fields
 * behave the same under either setting.
 */
export type ApiBaseResult = {
  ok: boolean;
  /** Normalized API base (present when ok). */
  base?: string;
  /** What is wrong with the value, in words an operator can act on (present when !ok). */
  error?: string;
  /** Non-fatal advice, e.g. a path that does not end in /api (present when ok). */
  warning?: string;
};

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

/**
 * True for addresses that only make sense on the machine you are typing on:
 * localhost, RFC1918 private ranges, and mDNS/.local names. A *static* build
 * pointing at one of these cannot work — no browser outside that machine can
 * reach it — so the build refuses it instead of shipping it.
 */
export function isLocalAddress(hostname: string): boolean {
  const h = String(hostname ?? '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return false;
  if (LOCAL_HOSTNAMES.has(h) || h.endsWith('.localhost') || h.endsWith('.local')) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(h)) return true; // link-local
  return false;
}

/**
 * Validate + normalize an API base.
 *
 * Accepts what people actually type (`app.example.org`, `https://host/`,
 * `host/api`) and always returns the exact prefix the API client needs:
 * scheme + host + `/api`.
 *
 * @param raw         the user-supplied or environment-supplied value
 * @param allowLocal  permit localhost/private addresses (local dev, the
 *                    office-PC build). A public/static build passes `false`.
 */
export function normalizeApiBase(raw: string, opts: { allowLocal?: boolean } = {}): ApiBaseResult {
  const input = String(raw ?? '').trim();
  if (!input) return { ok: false, error: 'Enter the address of your PET server.' };

  // Bare hostnames are the common case on a phone keyboard; assume https.
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, error: `"${input}" is not a valid web address.` };
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, error: 'The address must be an https:// URL.' };
  }
  if (url.username || url.password) {
    return { ok: false, error: 'Remove the username and password from the address.' };
  }
  if (url.search || url.hash) {
    return { ok: false, error: 'Remove the ?query and #hash parts from the address.' };
  }

  const local = isLocalAddress(url.hostname);

  if (url.protocol === 'http:' && !local) {
    return { ok: false, error: 'Use https:// — plain http:// is only allowed for localhost.' };
  }
  if (local && opts.allowLocal === false) {
    return {
      ok: false,
      error:
        `${url.hostname} is only reachable from your own network, so a hosted build can never ` +
        'use it. Point this at the public address of the PET server (the Cloudflare Tunnel ' +
        'domain, e.g. https://app.example.org — docs/PET/13).',
    };
  }

  // The PET server mounts its whole API under /api (server/src/app.js).
  const path = url.pathname.replace(/\/+$/, '');
  const base = `${url.origin}${path || '/api'}`;
  const warning =
    path && !/\/api$/i.test(path)
      ? `${base} does not end in /api — the PET server mounts its API at /api, so requests may 404.`
      : undefined;

  return warning ? { ok: true, base, warning } : { ok: true, base };
}

/**
 * The server's health endpoint, derived from an API base.
 *
 * `/health` sits at the *origin root*, not under `/api` (server/src/app.js
 * mounts healthRoutes at '/'), so this cannot be `${apiBase}/health` — that
 * 404s and would report a perfectly healthy server as unreachable.
 */
export function healthUrlFor(apiBase: string): string {
  try {
    return new URL('/health', apiBase).toString();
  } catch {
    return `${apiBase.replace(/\/+$/, '')}/health`;
  }
}

/** Host of an API base, for display (`app.example.org`). Never throws. */
export function apiBaseHost(base: string): string {
  try {
    return new URL(base).host;
  } catch {
    return base;
  }
}
