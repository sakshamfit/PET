/**
 * .env file loading for standalone CLI entrypoints.
 *
 * On a production machine the configuration lives in `.env.production` next to
 * package.json (see .env.production.example). Service managers load it for the
 * long-running server, but one-off admin commands (`pet:bootstrap`,
 * `pet:backup`, the control-plane `bootstrap`/`backup`) are run by hand — and
 * if they did not load the same file they would silently operate on the wrong
 * database (the dev default under server/data/ instead of the Trust's
 * C:\PET\data\pet.db). That failure mode is invisible and unacceptable in a
 * deployment with real records, so every CLI entrypoint loads this first.
 *
 * Rules:
 *   • existing environment variables always win (never clobber a service
 *     manager's values);
 *   • `.env.production` is tried before `.env`;
 *   • values may be quoted; `export KEY=value` is tolerated;
 *   • importing this module loads the files immediately (like `dotenv/config`),
 *     so an entrypoint only has to import it *before* importing config.js.
 */

import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './source-hash.js';

export function parseEnvText(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '');
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

/** Load one file if it exists. Returns the number of variables applied. */
export function loadEnvFile(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return 0;
  }
  let applied = 0;
  for (const [key, value] of Object.entries(parseEnvText(text))) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
      applied++;
    }
  }
  return applied;
}

/**
 * Load the first available environment file.
 * @returns {{ source: string|null, loaded: number }}
 */
export function loadEnvFiles({ root = REPO_ROOT, files = ['.env.production', '.env'] } = {}) {
  // A service manager may point somewhere else entirely.
  const explicit = process.env.PET_ENV_FILE;
  const candidates = explicit ? [explicit] : files.map(f => path.join(root, f));

  for (const file of candidates) {
    const abs = path.isAbsolute(file) ? file : path.join(root, file);
    const loaded = loadEnvFile(abs);
    if (loaded > 0) return { source: abs, loaded };
  }
  return { source: null, loaded: 0 };
}

/**
 * Result of the load performed when this module was imported.
 * Import this module FIRST in a CLI entrypoint and config.js will see the
 * production environment:
 *
 *   import { envLoadInfo } from '../src/lib/env-file.js';   // ← must be first
 *   import config from '../src/config.js';
 */
export const envLoadInfo = loadEnvFiles();
