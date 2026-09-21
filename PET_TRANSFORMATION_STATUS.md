# PET Transformation Status

Last updated: 2026-09-20 (backend phases 0–16 complete + pet-web SPA milestone)

## Current Phase

Backend: Phases 0–16 COMPLETE and verified (78/78 server tests). Frontend: PET web app SPA
(`pet-web/`) COMPLETE as an end-to-end milestone — mobile-first React app for Main Admin +
Employee served at `/app/` with the real API. Next: Phase 17 remainder (legacy UI retirement
/ data migration), Phase 18 backup/restore ops verification, Phase 19 Android wrapper per
spec 12, Phase 20–22 final security + testing loops against real data.

## Architecture (as built)

- **PET web app**: React 19 + TypeScript + Vite at `pet-web/` (`npm run dev:pet` → :3002,
  `npm run build:pet` → `server/public/app/`, served same-origin at `/app/` by Express with
  its own CSP + SPA fallback). Mobile-first: bottom navigation on phones, sidebar on `lg`.
  Auth-gated routes: dashboard / students / tasks / visits / chat, role-filtered
  (Main Admin = `main_admin`).
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
- `npm run build` (legacy+admin): PASS · `npm run build:pet`: PASS (220 KB js / 26 KB css gzip≈68 KB).
- `npm run server:test`: **78/78 PASS**.
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

- PHASE 18 — scheduled backups + restore drill runbook (script exists; add schedule + drill).
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

Phase 18 — backup scheduling + restore drill; then Phase 20 Firestore export→import pipeline
with validation drills before cutover.
