# PET Transformation Status

Last updated: 2026-09-22 (backend phases 0–16 complete + pet-web SPA milestone
+ build-freshness hardening + the Option 2 go-live kit + Vercel now deploys the
PET app itself, at the root)

## Current Phase

Backend: Phases 0–16 COMPLETE and verified (**88/88** server tests). Frontend: PET web app
SPA (`pet-web/`) COMPLETE as an end-to-end milestone — mobile-first React app for Main Admin
+ Employee, served by the office server at `/app/` with the real API, and published by Vercel
+ at `/` (see "Why the Vercel URL never showed the PET app" below). **Deployment: ready to go live** — the
build-freshness hardening and the Option 2 (office PC + Cloudflare Tunnel) kit are complete
and verified; what remains is running the runbook on the Trust's office PC.

Next: execute [`docs/PET/14_OFFICE_ROLLOUT.md`](./docs/PET/14_OFFICE_ROLLOUT.md)
on the office PC — Step 0 / 0B moves plusoneco.in onto Cloudflare without
taking the existing Vercel hostnames down, then `pet-first-run.ps1`, the
tunnel for `app.plusoneco.in`, and the Team screen. Doc 13 remains the tunnel
reference. Phase 18 backup *schedule* activation is in that same rollout.
Phase 19 Android wrapper is `android-pet/` (`in.plusoneco.pet`, PET Ops,
`npm run android:pet:init|sync|apk`). Phase 17 remainder (legacy UI retirement
/ data migration) and Phase 20–22 still follow go-live.

## Why the Vercel URL never showed the PET app (fixed 2026-09-21, finished 2026-09-22)

**The finding.** Every Vercel project on this repository built from the root
`vercel.json`, which ran `npm run build:legacy` → `dist/`. That artefact is the
legacy M.S. Public School portal (`src/`) — it has never contained a single line
of `pet-web/`. So "Vercel still shows the old build" was literal and structural:
no matter how many times the PET app was changed and pushed, the deployment
rebuilt the same legacy portal. Deployment freshness was fine the whole time
(the stamps/headers/no-cache work of PR #10 proves it); **the wrong app was
being deployed.**

**The state before this fix (verified live 2026-09-22).** The first attempt at a
fix put *both* apps on one deployment — the portal at `/`, the PET app at
`/app/` — so the URL people actually open, and the one in this repository's
homepage, still led to the school portal. Both of its halves were correct and
the thing was still wrong.

**The fix — Vercel deploys the PET app, at the root.**

| Path | App | Built by |
| :-- | :-- | :-- |
| `/` | **PET field-operations app** | `npm run build:pet-vercel` → `dist/` (fatal on failure) |
| `/app/…` | 308 redirect → `/` | keeps old bookmarks working |

* `scripts/vercel-build.mjs` builds one app and then **checks the artefact**:
  `dist/build-info.json` must say `"app": "pet"`, the shell must carry
  `<meta name="pet-build">` and must not be the school portal. A mismatch stops
  the deployment, so the previous (working) one stays live.
* `/build-info.json` records what the deployment *is*: app, commit, build id, and
  `api` — the PET server it was built for (`"none (interface preview)"` when
  there is none). One curl answers the question that cost days.
* **Wiring:** `PET_API_BASE` (Vercel → Settings → Environment Variables) bakes in
  the office server's public URL; without it the login screen offers "Connect to
  your PET server" and remembers the address on the device. A value that cannot
  work (localhost, plain http, wrong scheme) fails the build with instructions.
* The old passive "Interface preview only" strip is gone — it stated a dead end
  without offering a way out.
* `npm run verify:deploy -- --url <deployment>` checks the live URL from the
  outside: which app it serves, whether the server answers `/health`, and whether
  its `CORS_ORIGINS` allows that deployment origin (the failure that otherwise
  shows up only as an opaque network error at sign-in).
* The school portal remains the desktop/Android build and is still served by the
  office server (`npm run build:legacy`) — it is only removed from Vercel.

Verify from anywhere, no login:

```bash
curl -s https://<the-app>/build-info.json     # → {"app":"pet", …}
```

## Build freshness & go-live (2026-09-21)

**The problem:** the PET web app is compiled into `server/public/app/`, which is
generated and git-ignored. Any process that served that folder without checking
it could serve a bundle from an older commit — "the software is still showing
the old build" — and nothing in the app could say *which* build you were
looking at. The obvious commands made it worse: `npm run dev` / `npm run build`
/ the packaged desktop shell all pointed at the **legacy** M.S. Public School
React app in `src/`, not at the PET app.

**The fix (all verified live on 2026-09-21):**

- **Every build is stamped.** `scripts/vite-build-stamp.mjs` gives each PET and
  admin build an id = `<git commit>-<sha1 of the sources it was built from>`
  (no timestamp, so an unchanged rebuild stays the same build). The id is
  embedded in the bundle (`__PET_BUILD__`), written as `build-info.json` beside
  it, injected into the HTML shell (`<meta name="pet-build">`) and returned in
  every `/app` response as `X-App-Build`.
- **The server refuses to serve a stale bundle.** In production a missing or
  stale bundle is a hard startup failure (exit 78) listing both build ids and
  the one-line remedy. `PET_ALLOW_STALE_BUILD=1` downgrades it to a loud warning
  for emergency restarts only. `/health → app_build` reports
  `build_id / commit / built_at / age_seconds / stale` (503 `degraded` when no
  app is installed at all).
- **`npm start` is the supported way to start the server** (`scripts/start-pet.mjs`):
  loads `.env.production`, rebuilds if the bundle does not match the checkout,
  prints the build it is about to serve, then serves. Services use it, so a
  reboot or an update cannot come up on an old build.
- **Stale caches are impossible to keep.** App shells and `build-info.json` are
  served `no-store`, the bare `/` redirect sends `Clear-Site-Data: "cache"`, and
  an already-open client polls `/app/build-info.json` and shows an
  **"Update now"** banner when the server has a newer build (never an automatic
  reload — field staff may be mid-form).
- **Two commands answer "is the new build live?":** `npm run check:build` (disk
  vs checkout) and `npm run verify:live` (a *running* server vs checkout,
  locally or through the tunnel; exit 2 unreachable / 1 stale / 0 match).
- **Command surface de-ambiguated:** `dev`/`build`/`preview` (and `start`) now
  mean the PET app; the legacy portal moved to `dev:legacy` (3010),
  `build:legacy`, `preview:legacy`. CLI scripts (`pet:bootstrap`, `pet:backup`,
  `server:bootstrap`, `server:backup`) load `.env.production` themselves, so a
  hand-run command can never touch the wrong database.

**Option 2 go-live kit (office PC + own domain via free Cloudflare Tunnel):**

- [`docs/PET/13_OFFICE_PC_CLOUDFLARE_TUNNEL_GOLIVE.md`](./docs/PET/13_OFFICE_PC_CLOUDFLARE_TUNNEL_GOLIVE.md)
  — the full runbook: domain on Cloudflare → code + `.env.production` → first
  admin → Windows/Linux service → tunnel (dashboard-token or CLI-scripted) →
  verification from mobile data → employee onboarding → backups → update,
  rollback and troubleshooting.
- `.env.production.example` (Office-PC/Tunnel profile, loopback bind,
  `TRUST_PROXY=1`, empty CORS — the strictest same-origin setting).
- `scripts/deploy/windows/{install-server-service,update,cloudflare-tunnel}.ps1`
  and `scripts/deploy/linux/{install-server-service,cloudflare-tunnel}.sh`.
- The production config gate now *accepts* an empty `CORS_ORIGINS` (same-origin
  tunnel deployment) and rejects wildcards; it no longer demands a list that a
  same-origin deployment does not have.

## Architecture (as built)

- **PET web app**: React 19 + TypeScript + Vite at `pet-web/` (`npm run dev:pet` → :3002,
  `npm run build:pet` → `server/public/app/`, served same-origin at `/app/` by Express with
  its own CSP + SPA fallback). Mobile-first: bottom navigation on phones, sidebar on `lg`.
  Auth-gated routes: dashboard / students / tasks / visits / chat, plus **Team**
  for Main Admin only (add staff, reset password, disable — one-time password
  shown once and not stored). Role-filtered (Main Admin = `main_admin`).
- **Legacy frontend**: React school-management app (`src/`), untouched except harmless
  latent-bug fixes uncovered when real `@types/react` was installed (details below).
- **Server** (`server/`): Node + Express + better-sqlite3, extended in-place with the PET
  operational API under `/api/*`; control-plane (licensing SaaS) untouched.
  Route → service → repository layering; no raw SQL in route handlers; multi-table writes in
  transactions.
- **Auth**: `/api/auth/*` — scrypt password hashing, short-lived HS256 access JWT
  + rotating refresh (replay-safe), live session checks, `must_change_password` forced-change
  flow, per-account lockout, rate limiting. Roles: `main_admin`, `employee`.
- **Databases**: control-plane.db (unchanged) + **pet.db** (SQLite, WAL, FKs on, busy_timeout).
  Env `PET_DATABASE_PATH` (tests use `:memory:`).
- **Uploads**: `PET_UPLOAD_DIR` filesystem with validated type/size, magic-byte checks,
  authz on read; metadata + relative paths in pet.db.
- **Idempotency**: `idempotency_key` support on queued mutations + `sync_operations` table;
  `/api/sync` flush endpoint dedupes retries.
- **Backups**: `PET_BACKUP_DIR`, backup script covers pet.db; restore path documented.

## Completed

Backend (each phase verified by `npm run server:test`, now **78/78 PASS**):

- [x] PHASE 0 — audit of repo + all 12 `docs/PET/*` specs (source of truth).
- [x] PHASE 1–2 — PET API foundation + full operational schema from spec 08
      (users, organization, sessions, students + status history, schools, field visits,
      media, tasks + events, conversations + messages, attendance, tests + subjects +
      assignments + results, enrollments, website form submissions, notifications,
      sync_operations, idempotency keys, audit_logs; required indexes).
- [x] PHASE 3 — PET JWT auth (login/refresh/logout/password changes,
      forced password change, live session validation).
- [x] PHASE 4 — employee management (create/list/update, deactivate = disable +
      revoke sessions + preserve history; admins never see password hashes).
- [x] PHASE 5 — student lifecycle (PET-STU IDs, duplicate detection 409
      `POSSIBLE_DUPLICATES` + acknowledge flow, status machine with history).
- [x] PHASE 6 — schools directory.
- [x] PHASE 7 — field visits (start/batch/end, media linking, reports).
- [x] PHASE 8 — uploads (students photos, documents, visit media; authz-checked reads).
- [x] PHASE 9 — tasks (admin→employee + employee→employee, status flow, events).
- [x] PHASE 10 — team chat (conversations, DIRECT dedupe, unread counts, links).
- [x] PHASE 11 — attendance (check-in/check-out, today view, reports).
- [x] PHASE 12 — tests & evaluation (tests, subjects, assignments, results).
- [x] PHASE 13 — enrollment (decisions, waitlist handling, enrollment records).
- [x] PHASE 14 — public website forms (no private data leakage).
- [x] PHASE 15 — global search (`/api/search`).
- [x] PHASE 16 — offline sync (`/api/sync` flush, idempotency, conflict-safe dedupe).

Frontend foundation + pet-web SPA:

- [x] Shared typed API client `src/services/petApi.ts` (memory-only access token,
      refresh restore on boot, auth-change events) + `src/services/petSyncQueue.ts`
      (offline queue with idempotency keys, retry/discard) + `src/types/pet.ts`.
- [x] `pet-web/` SPA: login (+ forced password change), employee dashboard
      (geo best-effort check-in/out, active-visit banner), student register/search/profile
      with duplicate-review UX and offline enqueue, tasks (create + status flow),
      visits (active workspace, end-visit + report, register-in-visit), chat (conversations,
      threads, polling, unread), admin dashboard (KPIs, pipeline, live visits, queue,
      attendance today, registrations, website forms, activity; 30 s refresh).
- [x] SyncBadge (global queue visibility: Synced/Syncing/Pending/Failed/Retry) + auto-sync
      on reconnect; manual flush + retry/discard modal.
- [x] Serving: `vite.pet.config.ts` (base `/app/`), Express `/app/*` static + SPA fallback
      with dedicated CSP; `npm run dev:pet` proxies `/api` → API server during development.
- [x] Installed real `@types/react`/`@types/react-dom` (repo had none; JSX was unchecked)
      and fixed the 13 latent type errors this surfaced in legacy code — including real
      runtime bugs: `promoteStudents` misordered args (promotion never worked),
      `CollectFeeModal` calling non-existent `recordFeePayment`, `AddResultModal` rendering a
      `{grade, remarks}` object as a React child (crash), `addStudent` ignoring the Annual
      Fee input (fee account hardcoded to 24000). All fixed with minimal,
      behavior-preserving patches.

## Live verification (this loop)

- `npx tsc --noEmit`: **0 errors** (whole workspace incl. pet-web).
- `npm run build` (PET app → `server/public/app` + admin → `server/public/admin`): PASS, both stamped.
- `npm run check:build`: PASS (both bundles match the checkout) · `npm run verify:live`: PASS.
- `npm run server:test`: **88/88 PASS** (78 + 10 new build-freshness tests).
- Boot gates proven: production + stale bundle → exit 78 with both build ids;
  `npm start` on a stale bundle → rebuilds, then serves the current build.
- Live server (dev): `/app/` 200, `/app/students` SPA fallback 200, hashed assets 200.
- Live API smoke: admin + employee login → `/api/me` 200, `/api/me/dashboard` 200,
  `/api/reports/dashboard` 200, student create 201, duplicate re-post **409
  `POSSIBLE_DUPLICATES`** with details → `acknowledge_duplicates: true` → 201,
  `/api/search` hits students/schools.

## In Progress

- Phase 19 partially done: `docs/PET/DEPLOYMENT_GUIDE.md` (distribution + production
  install + Android packaging + backups) written 2026-09-21.
- Phase 17 remainder: retire/replace legacy React screens with PET UI once data migration
  lands; Android shell per spec 12; PWA install prompt polish.

## Remaining

- **GO-LIVE** — run the Option 2 runbook on the office PC (prerequisites → `.env.production`
  → `npm start` + verify → Main Admin → service install → Cloudflare Tunnel → verify from
  mobile data → employee onboarding). The scripts are ready: `scripts/deploy/windows/*`,
  `scripts/deploy/linux/*`.
- PHASE 18 — scheduled backups + restore drill runbook (script exists; the runbook now
  includes the Windows scheduled task / cron line and the monthly restore drill).
- PHASE 19 — production deployment handover doc (env matrix, reverse proxy, VPN, backups cron).
- PHASE 20 — Firestore → pet.db migration tooling + validation report (export/dry-run/cutover).
- PHASE 21–22 — final security loop + full end-to-end regression on migrated data.

## Known Issues

- Dev sandbox needs `NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/e2b-ca.crt
  ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm install --no-audit --no-fund --nodedir=/usr/local`
  (network restrictions only; CI/production unaffected).
- Some endpoints only accept the exact documented field set (strict `assertAllowedKeys`)
  — client payloads must match spec contracts; pet-web already does.

## Build

- TypeScript: PASS · Frontend Build: PASS · pet-web Build: PASS · Server Tests: 78/78 PASS

## Security

- JWT + live session: PASS · Authorization server-side per route: PASS · Passwords (scrypt,
  never returned): PASS · Forced password change: PASS · Upload validation (type/size/magic
  bytes/authz): PASS · Rate limiting + lockout: PASS · Audit logging: PASS · No raw SQL in
  routes, parameterized: PASS · HTTPS enforced at production gate: PASS

## Migration

- Export: NOT STARTED · SQLite Import: NOT STARTED · Validation: NOT STARTED · Cutover: NOT STARTED

## Next Action

Go live with Option 2 on the office PC (doc 13), then Phase 18 backup schedule + restore
drill on that machine, then the Phase 20 Firestore export→import pipeline with validation
drills before cutover.
