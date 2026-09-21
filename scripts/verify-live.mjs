#!/usr/bin/env node
/**
 * verify:live — "what is actually live right now?"
 *
 * Asks a running server (the office PC locally, or the public Cloudflare
 * Tunnel URL) which build it is serving and compares it with this checkout.
 * This is the definitive answer to "is it still showing the old build?".
 *
 *   npm run verify:live                              → http://127.0.0.1:8080
 *   npm run verify:live -- --url https://app.example.org
 *   npm run verify:live -- --wait 60                 → retry for up to 60s (post-restart)
 */

import { getAppBuild } from '../server/src/lib/build-info.js';

const args = process.argv.slice(2);
const valueOf = (n, d) => {
  const i = args.indexOf(n);
  return i > -1 && args[i + 1] ? args[i + 1] : d;
};

const base = (valueOf('--url', process.env.PET_VERIFY_URL || 'http://127.0.0.1:8080')).replace(/\/+$/, '');
const waitSeconds = Number(valueOf('--wait', '0')) || 0;

const local = getAppBuild('pet');
const ok = s => `\x1b[32m${s}\x1b[0m`;
const bad = s => `\x1b[31m${s}\x1b[0m`;
const warn = s => `\x1b[33m${s}\x1b[0m`;

async function getJson(url) {
  const res = await fetch(url, { cache: 'no-store', headers: { accept: 'application/json' } });
  const text = await res.text();
  return { res, text };
}

async function attempt() {
  const out = { reachable: false, health: null, healthRaw: null, buildInfo: null, html: null, htmlMeta: null };

  try {
    const { res, text } = await getJson(`${base}/health`);
    out.reachable = true;
    out.healthStatus = res.status;
    out.healthRaw = text.slice(0, 400);
    try {
      out.health = JSON.parse(text);
    } catch {
      /* not json */
    }
  } catch (err) {
    out.error = err instanceof Error ? err.message : String(err);
    return out;
  }

  try {
    const { res, text } = await getJson(`${base}/app/build-info.json`);
    out.buildInfoStatus = res.status;
    if (res.ok) out.buildInfo = JSON.parse(text);
  } catch {
    /* older build without build-info.json */
  }

  try {
    const res = await fetch(`${base}/app/`, { cache: 'no-store', redirect: 'follow' });
    out.htmlStatus = res.status;
    out.html = await res.text();
    out.htmlMeta = /<meta[^>]+name="pet-build"[^>]*content="([^"]*)"/i.exec(out.html)?.[1] ?? null;
  } catch {
    /* ignore */
  }

  return out;
}

const deadline = Date.now() + waitSeconds * 1000;
let live = await attempt();
while (waitSeconds > 0 && Date.now() < deadline) {
  if (live.reachable && live.health?.status === 'ok') break;
  await new Promise(r => setTimeout(r, 3000));
  process.stdout.write('.');
  live = await attempt();
}

console.log('');
console.log('════════ verify:live ════════');
console.log(`target      : ${base}`);
console.log(`on disk     : ${local.present ? local.buildId : '(no build)'}${local.stale ? ` ${warn('(stale vs sources)')}` : ''}`);
console.log('');

if (!live.reachable) {
  console.log(bad(`❌ NOT REACHABLE — ${live.error ?? 'no response'}`));
  console.log('');
  console.log('   Is the PET server running?      npm start');
  console.log('   Local check:                    curl http://127.0.0.1:8080/health');
  console.log('   Tunnel check (Cloudflare):      cloudflared tunnel info pet-office');
  process.exit(2);
}

const servedBuild = live.buildInfo?.buildId ?? null;
const healthBuild = live.health?.app_build?.build_id ?? null;

console.log(`/health     : HTTP ${live.healthStatus}  status=${live.health?.status ?? '?'}  db=${live.health?.db ?? '?'}  uptime=${live.health?.uptime_seconds ?? '?'}s`);
console.log(`  app_build : present=${live.health?.app_build?.present} build=${healthBuild ?? '(none)'} stale=${live.health?.app_build?.stale}`);
if (live.health?.app_build && live.health.app_build.present === false) {
  console.log(`  ${warn('⚠️  the server reports NO app build — run "npm start" on that machine')}`);
}
if (live.health?.app_build?.stale) {
  console.log(`  ${warn('⚠️  the server says its app bundle is stale — rebuild with "npm run build" there')}`);
}
console.log(`/app/       : HTTP ${live.htmlStatus ?? '?'}  shell meta=${live.htmlMeta ?? '(none)'}${live.htmlStatus === 503 ? `  ${bad('(no build installed)')}` : ''}`);
console.log(`build-info  : ${live.buildInfo ? JSON.stringify({ buildId: servedBuild, version: live.buildInfo.version, builtAt: live.buildInfo.builtAt }) : `HTTP ${live.buildInfoStatus ?? '?'} — older build without build-info.json`}`);
console.log('');

const problems = [];
if (!live.health) problems.push('/health did not return JSON — is something else listening on that port?');
if (live.health && live.health.status !== 'ok') problems.push(`server status is "${live.health.status}"`);
if (!live.buildInfo) {
  problems.push('the served app has no build-info.json — it predates build stamping, so it IS an old build. Run: npm start');
} else if (local.present && servedBuild && servedBuild !== local.buildId) {
  problems.push(`the server is serving build ${servedBuild} but this checkout builds ${local.buildId} — restart the server (npm start)`);
}
if (live.htmlMeta && servedBuild && live.htmlMeta !== servedBuild) {
  problems.push(`the HTML shell (${live.htmlMeta}) and build-info.json (${servedBuild}) disagree — the bundle is half-updated; rebuild with: npm run build`);
}
if (local.stale) {
  problems.push(`the build on THIS machine is stale vs the sources here (${local.currentSourceHash}) → run: npm run build`);
}

if (problems.length > 0) {
  console.log(bad('❌ NOT CURRENT'));
  for (const p of problems) console.log(`   • ${p}`);
  console.log('');
  console.log('   One command fixes all of the above:');
  console.log('     npm start        (rebuilds if needed, then serves)');
  console.log('');
  process.exit(1);
}

console.log(ok('✅ LIVE BUILD MATCHES THIS CHECKOUT'));
console.log('   Employees opening the app now get the current build;');
console.log('   any client still on an older build shows an in-app "Update now" banner.');
console.log('');
process.exit(0);
