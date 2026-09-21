/**
 * Source fingerprinting — shared by the build tooling, the CLI scripts and
 * the running server.
 *
 * WHY THIS EXISTS
 * ---------------
 * The PET web app is compiled into `server/public/app/` which is *generated*
 * (git-ignored). That makes it trivially easy to run a server that is serving
 * a bundle which no longer matches the source on disk — the "the software is
 * still showing the old build" failure. Nothing in the app could tell you
 * which build you were looking at, so it went unnoticed.
 *
 * Every PET build now records a fingerprint of the exact sources it was
 * produced from. The server and the browser compare that fingerprint with the
 * current source tree / live server and can state definitively:
 *
 *    "what you are looking at is build X; the source tree has moved on"
 *
 * This module is deliberately dependency-free (no `config.js`, no env
 * validation, no side effects) so it can be imported by vite.pet.config.ts,
 * plain node CLI scripts and the Express server alike.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Repository root, derived from this file's location (server/src/lib). */
export const REPO_ROOT = path.resolve(HERE, '..', '..', '..');

/**
 * Everything the PET web bundle is built from:
 *   - pet-web/  the app itself
 *   - src/      shared API client, sync queue and PET types that pet-web imports
 *   - the build/config files that change the output
 *
 * `src/` is included in full even though the legacy school app lives there:
 * the PET app legitimately imports from `src/services` and `src/types`, and the
 * set of shared modules can grow. Over-inclusion only ever causes an extra
 * (cheap, safe) rebuild; under-inclusion would silently ship a stale bundle.
 */
export const PET_SOURCE_ROOTS = [
  'pet-web',
  'src',
  'vite.pet.config.ts',
  'vite.admin.config.ts',
  'package.json',
  'tsconfig.json',
];

/** Admin console build inputs (separate bundle, same server). */
export const ADMIN_SOURCE_ROOTS = ['admin', 'vite.admin.config.ts'];

/**
 * Legacy school-portal build inputs (the static Vercel build → dist/).
 * This is the bundle the Vercel deployment serves, so it is stamped with a
 * build id exactly like the PET/admin bundles — "Vercel still shows the old
 * build" becomes answerable by comparing build ids instead of guesswork.
 */
export const LEGACY_SOURCE_ROOTS = [
  'src',
  'index.html',
  'public',
  'vite.config.ts',
  'package.json',
  'tsconfig.json',
];

/** Resolve the source roots for a given app name. */
export function sourceRootsForApp(app) {
  if (app === 'admin') return ADMIN_SOURCE_ROOTS;
  if (app === 'legacy') return LEGACY_SOURCE_ROOTS;
  return PET_SOURCE_ROOTS;
}

function walk(absDir, out, rootAbs) {
  let entries;
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.git')) continue;
    const abs = path.join(absDir, entry.name);
    if (entry.isDirectory()) {
      walk(abs, out, rootAbs);
    } else if (entry.isFile()) {
      let st;
      try {
        st = fs.statSync(abs);
      } catch {
        continue;
      }
      out.push({
        p: path.relative(rootAbs, abs).split(path.sep).join('/'),
        s: st.size,
        t: Math.floor(st.mtimeMs),
      });
    }
  }
  return out;
}

/**
 * Deterministic fingerprint of a set of source trees.
 * Content is not read (size + mtime per file) — that keeps this cheap enough
 * to run on every request path that wants it, while still changing on every
 * meaningful edit, checkout or pull.
 *
 * @param {string} [root] repository root
 * @param {string[]} [roots] relative source roots
 * @returns {{ hash: string, files: number, latestMtime: number|null }}
 */
export function fingerprintSources(root = REPO_ROOT, roots = PET_SOURCE_ROOTS) {
  const entries = [];
  for (const rel of roots) {
    const abs = path.join(root, rel);
    let st = null;
    try {
      st = fs.statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(abs, entries, root);
    else entries.push({ p: rel, s: st.size, t: Math.floor(st.mtimeMs) });
  }
  entries.sort((a, b) => (a.p < b.p ? -1 : a.p > b.p ? 1 : 0));
  const hash = crypto.createHash('sha1').update(JSON.stringify(entries)).digest('hex').slice(0, 16);
  const latestMtime = entries.reduce((max, e) => (e.t > max ? e.t : max), 0) || null;
  return { hash, files: entries.length, latestMtime };
}

/** Convenience wrapper returning just the fingerprint hash (or null). */
export function computeSourceHash(root = REPO_ROOT, roots = PET_SOURCE_ROOTS) {
  const { hash, files } = fingerprintSources(root, roots);
  return files === 0 ? null : hash;
}

/** Short git commit of the checkout, or null when git/the repo is unavailable. */
export function getCommit(root = REPO_ROOT) {
  try {
    const sha = execFileSync('git', ['rev-parse', '--short=8', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    }).trim();
    return /^[0-9a-f]{4,40}$/i.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

/**
 * Build a fresh build descriptor. Used by vite.pet.config.ts and by the CLI.
 *
 * `buildId` intentionally does NOT contain the build timestamp: two builds of
 * the same commit are the same build, which is what lets a browser decide
 * "the server is running a build I do not have" without reload-looping.
 */
export function createBuildInfo({ root = REPO_ROOT, app = 'pet', version = '1.0.0', now = new Date() } = {}) {
  const roots = sourceRootsForApp(app);
  const { hash, files } = fingerprintSources(root, roots);
  const commit = getCommit(root);
  const sourceHash = files === 0 ? null : hash;
  return {
    schema: 1,
    app,
    version,
    buildId: `${commit || 'nogit'}-${sourceHash || 'nosrc'}`,
    commit,
    sourceHash,
    sourceFiles: files,
    builtAt: now.toISOString(),
    nodeVersion: process.version,
  };
}
