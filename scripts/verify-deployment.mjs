#!/usr/bin/env node
/**
 * verify:deploy — "what is actually live on my Vercel URL?"
 *
 * Written for one specific, expensive confusion: a deployment that reported
 * success, was genuinely current (fresh commit, fresh timestamp), and served the
 * wrong application. `build-info.json` said `"app": "legacy"` and everything
 * else looked healthy, so the only reliable test is to ask the deployment what
 * it is — and to check the two things that make it work: the PET shell is being
 * served, and the server it talks to accepts requests from that origin.
 *
 *   npm run verify:deploy -- --url https://pet-accounts.vercel.app
 *   npm run verify:deploy -- --url https://x.vercel.app --api https://app.example.org
 *   npm run verify:deploy -- --url https://x.vercel.app --expect-commit $(git rev-parse --short HEAD)
 *
 * Exit codes: 0 = the PET app is live and wired, 1 = a real problem, 2 = the
 * URL could not be checked at all (wrong address, protected deployment).
 */

import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const valueOf = (name, fallback) => {
  const i = args.indexOf(name);
  return i > -1 && args[i + 1] ? args[i + 1] : fallback;
};

const url = (valueOf('--url', process.env.PET_DEPLOY_URL) || '').replace(/\/+$/, '');
const apiFlag = (valueOf('--api', '') || '').replace(/\/+$/, '');

const red = s => `\x1b[31m${s}\x1b[0m`;
const green = s => `\x1b[32m${s}\x1b[0m`;
const yellow = s => `\x1b[33m${s}\x1b[0m`;

if (!url) {
  console.error('\nusage: npm run verify:deploy -- --url https://<your-deployment>\n');
  console.error('   --url            the deployment to inspect (or set PET_DEPLOY_URL)');
  console.error('   --api            PET server base URL to check CORS against (optional;');
  console.error('                    taken from the deployment\'s build-info.json when omitted)');
  console.error('   --expect-commit  fail unless the deployment was built from this commit\n');
  process.exit(2);
}

/**
 * `/health` is served at the origin root (server/src/app.js mounts healthRoutes
 * at '/'), so it is NOT `${api}/health` — that 404s and would report a healthy
 * server as unreachable. Mirrors healthUrlFor() in src/services/petApiBase.ts.
 */
const healthUrlFor = base => {
  try {
    return new URL('/health', base).toString();
  } catch {
    return `${String(base).replace(/\/+$/, '')}/health`;
  }
};

const problems = [];
const notes = [];
const ok = [];
let fatal = false;

async function get(pathname, init) {
  // Cache-busted: we are asking "what does this deployment serve right now?".
  const sep = pathname.includes('?') ? '&' : '?';
  return fetch(`${url}${pathname}${sep}t=${Date.now()}`, { cache: 'no-store', ...init });
}

console.log('\n════════ verify:deploy ════════');
console.log(`deployment : ${url}`);

// ── 1. What does the deployment say it is? ──────────────────────────────────

let buildInfo = null;
try {
  const res = await get('/build-info.json');
  const text = await res.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* not JSON — diagnosed below */
  }

  if (!res.ok || !parsed) {
    fatal = true;
    const protectedDeployment = /vercel\.com\/(login|sso)|Authentication Required|_vercel_sso/i.test(text);
    console.log(`build-info : ${red(`HTTP ${res.status} — no build-info.json`)}`);
    console.log('');
    if (protectedDeployment) {
      console.log(red('❌ This deployment is behind Vercel Authentication.'));
      console.log('   Anyone opening the URL — including your staff — gets a Vercel login, not the app.');
      console.log('   Vercel → project → Settings → Deployment Protection → Vercel Authentication → Disabled.');
      console.log('   (Protection ON is the default for new projects; it is the most common reason a');
      console.log('    perfectly good deployment looks "wrong" to everyone outside the dashboard.)');
    } else {
      console.log(red('❌ No build-info.json at the root of this deployment.'));
      console.log('   The PET build writes it (npm run build:vercel). If it 404s, what is deployed is');
      console.log('   not the PET build — check that the project builds from the repo root vercel.json.');
    }
    console.log('');
    process.exit(2);
  }

  buildInfo = parsed;
} catch (err) {
  console.log(`deployment : ${red('unreachable')} — ${err instanceof Error ? err.message : String(err)}`);
  console.log('\n   Check the address, and that the deployment finished building.\n');
  process.exit(2);
}

const appIsPet = buildInfo.app === 'pet';
console.log(`app        : ${appIsPet ? green('pet') : red(String(buildInfo.app))}`);
console.log(`build      : ${buildInfo.buildId ?? '(none)'}   commit ${buildInfo.commit ?? 'unknown'}`);
console.log(`built at   : ${buildInfo.builtAt ?? 'unknown'}`);
console.log(`api        : ${buildInfo.api ?? '(not recorded)'}`);

if (!appIsPet) {
  problems.push(
    `the deployment is serving app="${buildInfo.app}", not "pet" — the deployment may be current, ` +
      'but the application on it is the wrong one. This is the bug: fix the build command / project, ' +
      'not the cache.'
  );
}

// ── 2. Is the PET shell really what the root serves? ────────────────────────

try {
  const res = await get('/');
  const html = await res.text();
  const petShell = /<meta[^>]+name="pet-build"/i.test(html);
  const runtimeConfig = /id="pet-runtime-config"/.test(html);
  const legacyPortal = /M\.S\.\s*PUBLIC\s*SCHOOL/i.test(html);
  const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? '(no title)';

  console.log(`GET /      : HTTP ${res.status}  title="${title.trim()}"`);

  if (legacyPortal) {
    problems.push(
      'the root serves the legacy M.S. Public School portal (/build-info.json and the HTML ' +
        'disagree about what this deployment is).'
    );
  }
  if (!petShell) problems.push('the root does not carry the PET shell marker (<meta name="pet-build">).');
  if (!runtimeConfig) problems.push('the root has no PET runtime config block — is this an old build?');
  if (petShell && !legacyPortal) ok.push('the root serves the PET app');
} catch (err) {
  problems.push(`could not fetch / — ${err instanceof Error ? err.message : String(err)}`);
}

// ── 3. Commit drift (a stale deployment is a different bug — report it) ─────

let localCommit = null;
try {
  localCommit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
} catch {
  /* not a git checkout — skip */
}
const expectCommit = valueOf('--expect-commit', null);

if (expectCommit && buildInfo.commit && !String(buildInfo.commit).startsWith(expectCommit)) {
  problems.push(`the deployment was built from ${buildInfo.commit}, not ${expectCommit}.`);
} else if (localCommit && buildInfo.commit && !String(buildInfo.commit).startsWith(localCommit)) {
  notes.push(
    `this checkout is at ${localCommit} (short) but the deployment was built from ${buildInfo.commit} — ` +
      'if you just pushed, the deployment may still be building.'
  );
}

// ── 4. Can the app actually reach the PET server from a browser? ────────────

const declaredApi = typeof buildInfo.api === 'string' && !buildInfo.api.startsWith('none') ? buildInfo.api : '';
const api = apiFlag || declaredApi;

if (!appIsPet) {
  // No point checking a server the wrong app would talk to.
  notes.push('server/CORS checks skipped — fix what is deployed first.');
} else if (!api) {
  notes.push(
    'this deployment records no API server (PET_API_BASE), so it is an interface preview: ' +
      'it loads, but nobody can sign in. Set PET_API_BASE in Vercel and redeploy, or use the ' +
      'app\'s "Connect to your PET server" screen.'
  );
} else {
  if (apiFlag && declaredApi && apiFlag !== declaredApi) {
    notes.push(`checking --api ${apiFlag}; the deployment was built for ${declaredApi}.`);
  }
  const healthUrl = healthUrlFor(api);
  try {
    const res = await fetch(healthUrl, { cache: 'no-store' });
    const text = await res.text();
    const health = (() => {
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    })();
    const healthy = res.ok && health && (health.status === undefined || health.status === 'ok');
    console.log(
      `server     : ${healthy ? green('reachable') : red('unhealthy')} (${healthUrl} → HTTP ${res.status})`
    );
    if (!healthy) problems.push(`${healthUrl} did not report a healthy PET server.`);
    else ok.push('the PET server answers /health');

    // CORS: the browser will not let the app read that answer unless the server
    // allows THIS origin. Without it, sign-in fails with an opaque network
    // error and no server-side log — the worst kind of failure to debug.
    const origin = new URL(url).origin;
    const preflight = await fetch(healthUrl, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization',
      },
    });
    const allowOrigin = preflight.headers.get('access-control-allow-origin');
    if (allowOrigin === origin) {
      console.log(`cors       : ${green('allowed')} (${origin})`);
      ok.push('the PET server allows this deployment origin');
    } else if (allowOrigin === '*') {
      notes.push(
        `${api} answers with Access-Control-Allow-Origin: * — production config refuses wildcards; ` +
          'pin CORS_ORIGINS to exact origins.'
      );
    } else {
      problems.push(
        `${api} does not allow ${origin} (Access-Control-Allow-Origin: ${allowOrigin ?? 'absent'}). ` +
          `Add it to CORS_ORIGINS in the office PC's .env and restart the PET server: ` +
          `CORS_ORIGINS=${origin}`
      );
    }
  } catch (err) {
    problems.push(`could not reach the PET server at ${api} — ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── Verdict ────────────────────────────────────────────────────────────────

console.log('');
if (notes.length > 0) {
  for (const n of notes) console.log(`ℹ️  ${n}`);
  console.log('');
}
if (problems.length > 0) {
  console.log(red('❌ NOT RIGHT YET'));
  for (const p of problems) console.log(`   • ${p}`);
  console.log('');
  process.exit(1);
}

const wiredDeployment = !!declaredApi;
console.log(
  green('✅ This deployment serves the PET app') +
    (wiredDeployment
      ? `, wired to ${declaredApi}.`
      : api
        ? ' (it records no server of its own — the one checked was given with --api).'
        : ' as an interface preview.')
);
for (const o of ok) console.log(`   ✓ ${o}`);
console.log('');
process.exit(fatal ? 2 : 0);
