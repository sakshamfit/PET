/**
 * Server-side view of "which build is actually being served?".
 *
 * Reads `server/public/app/build-info.json` (written by the PET Vite build)
 * and compares it with the source tree on this machine, so the server can be
 * unambiguous about stale bundles instead of silently serving them.
 *
 * See server/src/lib/source-hash.js for the why.
 *
 * Deliberately does NOT import config.js: this module is also used by the CLI
 * scripts (check:build, verify:live, release:check, start-pet) and must never
 * trigger the production configuration gate or exit the process.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ADMIN_SOURCE_ROOTS, PET_SOURCE_ROOTS, REPO_ROOT, computeSourceHash } from './source-hash.js';

const DIST_DIRS = {
  pet: process.env.PET_APP_DIST_PATH || path.join(REPO_ROOT, 'server', 'public', 'app'),
  admin: process.env.ADMIN_DIST_PATH || path.join(REPO_ROOT, 'server', 'public', 'admin'),
};

const isTruthy = v => ['1', 'true', 'yes', 'on'].includes(String(v ?? '').toLowerCase());

let fileCache = new Map(); // file -> { mtimeMs, value }
let sourceCache = { at: 0, value: null, app: null };
const SOURCE_CACHE_MS = 10_000;

function readJson(file) {
  let st;
  try {
    st = fs.statSync(file);
  } catch {
    return null;
  }
  const cached = fileCache.get(file);
  if (cached && cached.mtimeMs === st.mtimeMs) return cached.value;
  let parsed = null;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    parsed = null;
  }
  fileCache.set(file, { mtimeMs: st.mtimeMs, value: parsed });
  return parsed;
}

function currentSourceHash(app) {
  const now = Date.now();
  if (sourceCache.value && sourceCache.app === app && now - sourceCache.at < SOURCE_CACHE_MS) {
    return sourceCache.value;
  }
  const value = computeSourceHash(REPO_ROOT, app === 'admin' ? ADMIN_SOURCE_ROOTS : PET_SOURCE_ROOTS);
  sourceCache = { at: now, value, app };
  return value;
}

/**
 * @param {'pet'|'admin'} [app]
 * @returns {{
 *   app: 'pet'|'admin', distDir: string, present: boolean,
 *   version: string|null, buildId: string|null, commit: string|null,
 *   builtAt: string|null, ageSeconds: number|null, sourceHash: string|null,
 *   currentSourceHash: string|null, hasBuildInfo: boolean, stale: boolean,
 *   staleReason: 'missing'|'source-changed'|null
 * }}
 */
export function getAppBuild(app = 'pet') {
  const distDir = DIST_DIRS[app] ?? DIST_DIRS.pet;
  const info = readJson(path.join(distDir, 'build-info.json'));
  const entryFile = fs.existsSync(path.join(distDir, 'index.html'));

  const live = currentSourceHash(app);
  const builtHash = info?.sourceHash ?? null;

  let stale = false;
  let staleReason = null;
  if (!entryFile) {
    stale = true;
    staleReason = 'missing';
  } else if (!info || !builtHash) {
    // Either no descriptor at all (a bundle from before build stamping) or one
    // that cannot prove what it was built from. Both are "unverifiable" → treat
    // as stale so the operator rebuilds instead of wondering.
    stale = true;
    staleReason = 'source-changed';
  } else if (live && builtHash !== live) {
    stale = true;
    staleReason = 'source-changed';
  }

  const builtAtMs = info?.builtAt ? Date.parse(info.builtAt) : NaN;

  return {
    app,
    distDir,
    present: entryFile,
    entryFile,
    version: info?.version ?? null,
    buildId: info?.buildId ?? null,
    commit: info?.commit ?? null,
    builtAt: info?.builtAt ?? null,
    ageSeconds: Number.isFinite(builtAtMs) ? Math.max(0, Math.floor((Date.now() - builtAtMs) / 1000)) : null,
    sourceHash: builtHash,
    currentSourceHash: live,
    hasBuildInfo: !!info,
    stale,
    staleReason,
  };
}

/** Payload embedded in GET /health — never contains secrets. */
export function healthBuildSummary(app = 'pet') {
  const b = getAppBuild(app);
  return {
    present: b.present,
    version: b.version ?? process.env.APP_VERSION ?? '1.0.0',
    build_id: b.buildId,
    commit: b.commit,
    built_at: b.builtAt,
    age_seconds: b.ageSeconds,
    stale: b.stale,
    stale_reason: b.staleReason,
  };
}

/** Human-readable one-liner for logs / boot banners. */
export function describeBuild(app = 'pet') {
  const b = getAppBuild(app);
  const route = `/${app === 'pet' ? 'app' : 'admin'}`;
  if (!b.present) return `${route} — NO BUILD (${b.distDir})`;
  const age = b.ageSeconds == null ? 'age unknown' : `built ${formatAge(b.ageSeconds)} ago`;
  return `${route} — ${b.buildId ?? 'unstamped build'} (${age}) ${b.stale ? '⚠️  STALE' : '✅ current'}`;
}

export function formatAge(seconds) {
  if (seconds == null) return 'unknown';
  if (seconds < 90) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 90) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/**
 * Startup check. In production a missing/stale bundle is a hard boot failure
 * (that is the whole point: the office PC must never serve yesterday's app).
 * The escape hatch — PET_ALLOW_STALE_BUILD=1 — downgrades it to a loud
 * warning so an emergency restart is still possible; it never hides it.
 *
 * @returns {{ blocking: string[], warnings: string[] }}
 */
export function petBuildStartupProblems({ strict } = {}) {
  const production = process.env.NODE_ENV === 'production';
  const strictMode = strict ?? (production && !isTruthy(process.env.PET_ALLOW_STALE_BUILD));
  const b = getAppBuild('pet');
  const found = [];

  if (!b.present) {
    found.push(
      `No PET web app build in ${b.distDir} — the server would answer "/app/" with HTTP 503.`
    );
  } else if (b.stale && b.staleReason === 'source-changed') {
    if (b.hasBuildInfo) {
      found.push(
        `The bundle in ${b.distDir} is STALE: it was built from different sources than this checkout.\n` +
          `       serving   : ${b.buildId ?? 'unknown-build'}\n` +
          `       sources are: ${b.commit ?? 'nogit'}-${b.currentSourceHash ?? 'unknown'}`
      );
    } else {
      found.push(
        `The bundle in ${b.distDir} predates build stamping, so it cannot be verified as current.`
      );
    }
  }

  if (found.length === 0) return { blocking: [], warnings: [] };

  const remedy =
    '     Fix: npm run build        (or: npm start — builds the current source, then serves)';
  const withRemedy = found.map(f => `${f}\n${remedy}`);

  if (strictMode) return { blocking: withRemedy, warnings: [] };

  const consequence = production
    ? isTruthy(process.env.PET_ALLOW_STALE_BUILD)
      ? '     PET_ALLOW_STALE_BUILD=1 is set — serving the old bundle anyway. Unset it and rebuild as soon as you can.'
      : '     serving anyway (non-production run) — this is a hard startup failure when NODE_ENV=production.'
    : '     (development mode: serving anyway — this is a hard startup failure when NODE_ENV=production)';

  return { blocking: [], warnings: [...withRemedy, consequence] };
}

export { REPO_ROOT };
