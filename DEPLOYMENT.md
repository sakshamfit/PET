# 🏫 M.S. PUBLIC SCHOOL — Deployment & Client Handover Guide

Comprehensive guide for deploying the school portal as a web app and packaging
the desktop application.

> 🔐 **Commercial licensing, the admin control panel, releases and the
> production API server are documented separately — see
> [CONTROL_PLANE.md](./CONTROL_PLANE.md).**

---

## 🔐 Authentication Model (hardened — September 2026)

Credentials are **no longer shipped in this repository or in this document**.

| Role | Mechanism | Where it's managed |
| :-- | :-- | :-- |
| **Principal / Super Admin** | Firebase Authentication — email + password (verified by Google; never stored in the app, Firestore, or any file) | Firebase Console → Authentication → Users |
| **Faculty / Class Teachers** | 6-digit teacher code (app establishes an anonymous Firebase session first) | Principal adds teachers in-app; codes shown in the app |

### One-time Firebase setup (REQUIRED after upgrading to the hardened build)

The app will not authenticate until these steps are done:

1. Open the [Firebase Console](https://console.firebase.google.com) → project `mspublicschool-ddfaf`.
2. **Authentication → Sign-in method**:
   - Enable **Email/Password**.
   - Enable **Anonymous** (used behind teacher-code sign-in).
3. **Authentication → Users → Add user**: create the principal account with the
   school's principal email and a strong password (deliver it through a secure
   channel — never commit it anywhere).
4. **Firestore Database → Rules**: publish the hardened rules from
   [`firestore.rules`](./firestore.rules) (`request.auth != null` required).

> ⚠️ **Action required now:** the previous principal password is retired.
> It existed in source history — treat it as compromised and do not reuse it.

**Current rule limitation (tracked):** any *authenticated* session can still
read/write all Firestore documents. Per-user least-privilege rules arrive with
the phase-2 local-SQLite architecture. See `PRODUCTION_REPORT.md`.

---

## 🚀 Option 1: Live Web & Cloud Deployment (the PET platform)

The production system is **one Node server** that serves the API *and* the web
app on the same origin — employees open one URL, nothing is hosted separately.

```bash
npm install
npm start            # builds the current source, then serves on :8080
#   employees → https://<your-domain>/app/      (or http://localhost:8080/app/)
#   admins    → https://<your-domain>/admin
```

**Full go-live runbook (office PC + your domain via Cloudflare Tunnel, free):**
[docs/PET/13_OFFICE_PC_CLOUDFLARE_TUNNEL_GOLIVE.md](./docs/PET/13_OFFICE_PC_CLOUDFLARE_TUNNEL_GOLIVE.md)

**plusoneco.in, in order (nameservers, first-run script, Team screen, PET Ops APK):**
[docs/PET/14_OFFICE_ROLLOUT.md](./docs/PET/14_OFFICE_ROLLOUT.md)

### A. Vercel — the PET app at the root of the domain

`vercel.json` runs **`npm run build:vercel`** (`scripts/vercel-build.mjs`), which
builds **one** application — the PET field-operations app (`pet-web/`) — into
`dist/`, served at `/`.

| Path | What it is | Built from | Failure behaviour |
| :-- | :-- | :-- | :-- |
| `/` | **PET field-operations app** | `pet-web/` → `dist/` | **fatal**: a broken build leaves the previous deployment live |
| `/app/…` | 308 redirect to `/` | — | keeps old bookmarks working |

> **The M.S. Public School portal is no longer published on Vercel.** It still
> builds and ships everywhere else it is used — the desktop app, the Android
> package, and the office server (`npm run build:legacy`).

**Why it is built this way.** Previously this file built the *legacy portal*
into `dist/` and the PET app into `dist/app/`, "best effort". Every deployment
therefore succeeded, reported a fresh commit, and contained an application that
had never included a line of `pet-web/` — which is precisely what "Vercel still
shows the old build" was: not staleness, but the wrong app, deployed reliably.
`npm run build:vercel` now refuses to finish unless `dist/build-info.json` says
`"app": "pet"` and the HTML shell carries the PET markers.

#### Wiring the app to the PET server

The PET platform is a **server** (Express + SQLite on the Trust's office PC — see
[doc 13](./docs/PET/13_OFFICE_PC_CLOUDFLARE_TUNNEL_GOLIVE.md)). A static host can
serve its interface, never its data, so the deployment needs to be told where the
server is. Two ways, in order of preference:

1. **Build-time (zero touch for staff)** — Vercel → project → Settings →
   Environment Variables:

   | Name | Value | Example |
   | :-- | :-- | :-- |
   | `PET_API_BASE` | public URL of the PET server | `https://app.purvanchaltrust.org` |

   Redeploy. A bare hostname, a trailing slash and a missing `/api` are all
   normalised; a value that cannot work (a `localhost` address, plain `http://`
   for a remote host, a non-http scheme) **fails the build** with instructions
   instead of shipping a bundle that cannot sign anyone in.

2. **In the app** — with no `PET_API_BASE`, the login screen shows *"Connect to
   your PET server"*. Staff (or you, on the phone) type the address once; it is
   checked against `/health` and remembered on that device. A hosted build always
   keeps a *Server: …* line with a **Change** button, so a device that once
   connected to a since-moved tunnel URL is never stuck with it.

**The server must allow this site.** On the office PC, in `.env.production`:

```bash
CORS_ORIGINS=https://<your-deployment-domain>        # exact origins, no wildcards
```

Without it the app loads and sign-in fails with an opaque network error and no
server-side log. `npm run verify:deploy` checks this for you.

```bash
npm run build:vercel                                        # exactly what Vercel runs
npm run preview:pet-static                                  # serve dist/ locally at /
npm run verify:deploy -- --url https://<your-deployment>     # is the PET app live & wired?
```

**Which app is this URL serving?** (no login needed)

```bash
curl -s https://<your-app>/build-info.json
# → {"app":"pet","deployment":"vercel-static","api":"https://app.example.org/api","commit":"…"}
```

### "Vercel still shows the old build" — checklist

Start with the one command that answers it end-to-end:

```bash
npm run verify:deploy -- --url https://<your-deployment>
```

1. **What does the deployment say it is?** `curl -s <url>/build-info.json`.
   * `"app": "pet"` — the right app is deployed.
   * `"app": "legacy"` — the deployment is current and contains the **wrong
     application** (the school portal). That is the historical bug, not a cache:
     check Vercel → project → Settings → **Build & Development Settings** is on
     auto-detect (so the repo's `vercel.json` governs), and that the project is
     connected to this repository's root.
   * **404 / HTML instead of JSON** — what is deployed is not this build at all,
     or the deployment is behind Vercel Authentication (see 6).

2. **Are you looking at a frozen URL?** Only a project's **production domain**
   moves forward:
   * `https://<project>-<hash>-<team>.vercel.app` = one *specific* deployment —
     frozen forever, no matter how often you push.
   * `https://<project>-git-<branch>-<team>.vercel.app` = that *branch's* latest
     deployment — frozen as soon as the branch stops moving (every
     pull-request comment links one of these).
   * The **Visit** button in Vercel → Deployments opens the deployment you clicked.

   Open the production domain instead: Vercel → your project → **Domains**.

3. **One project should serve this app.** Earlier, several Vercel projects
   (`pet`, `school-management-system`) built this repository, each producing its
   own deployment of the same thing — two URLs that could disagree. Keep exactly
   one project per domain; rename or delete the others rather than leaving two
   "current" deployments of the same app.

4. **Check the build id, don't guess.** The stamp is under the login card (and in
   the app header); the same value is in `<meta name="pet-build">` and in
   `/build-info.json`. `buildId` = `<commit>-<source-hash>`; compare the commit
   with the Vercel deployment and `git rev-parse --short HEAD`. The stamp also
   names the server the app talks to.

5. **A failed build never replaces a live site.** Vercel keeps the previous
   deployment, which is deliberate — but it means the site can sit on an older
   commit while the *build* is the thing that is broken. Vercel → Deployments
   shows the failed one; `/build-info.json` keeps reporting the old commit until
   a deployment succeeds.

6. **Signed-out visitors may see Vercel's login, not your app.** `*.vercel.app`
   team URLs can sit behind Vercel Authentication (Settings → Deployment
   Protection). The production/custom domain stays public; the generated
   `*.vercel.app` URLs do not. Staff on a URL that asks them to log in to Vercel
   are hitting this, not a broken build.

7. **Caches — the shell is `no-store` at both layers.** `Cache-Control` (browser)
   *and* `CDN-Cache-Control` / `Vercel-CDN-Cache-Control` (Vercel's edge) are
   `no-store` for `/`, `/index.html` and `/build-info.json`; hashed `/assets/*`
   are immutable. Nothing in a response used to tell *any* layer not to store it,
   so a bare path like `/` could be answered from a copy cached earlier — which
   is indistinguishable from "Vercel shows the old build". If a check looks
   stale, prove it in one command:

   ```bash
   curl -s "https://<your-app>/build-info.json?v=$(date +%s)"   # cache-busted
   ```

   A tab/browser that stored the old shell before the headers landed keeps it
   until a hard refresh once: <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd>
   (or clear site data). Every tab open from now on shows an **"Update now"**
   banner by itself when a newer build goes live.

### B. Firebase Hosting
```bash
npm install -g firebase-tools
firebase login
firebase deploy --only hosting
```

### C. Custom domain
Add the sub-domain in the hosting dashboard with a standard CNAME record.
(or use Cloudflare Tunnel — see the runbook above; no hosting fees at all)

---

## 🖥️ Option 2: Desktop App (Electron)

### Development
```bash
npm run build:legacy      # the legacy portal is what the desktop shell loads
npx electron .
```

### Windows installer (on a Windows machine)
```bash
# 1. Inject the production licensing API URL into the build
SMS_API_URL="https://api.YOURDOMAIN" node scripts/write-build-config.mjs

# 2. Full release pipeline
npm run test:all          # typecheck + control-plane test suite
npm run audit:prod        # secret-scan of everything that ships
npm run release:check     # packaging gate
npm run dist:win          # builds web + admin + SchoolManagementSetup-<version>.exe
```

Output: `release/SchoolManagementSetup-<version>.exe` (NSIS; updates never
delete `%LOCALAPPDATA%\SchoolManagementSystem`).

> 📦 Windows builds produce correctly signed installers only when a
> code-signing certificate is configured on the build machine — see
> [CONTROL_PLANE.md](./CONTROL_PLANE.md) § Code signing.

---

## 🧭 Which build am I looking at?

The web app is compiled into `server/public/app/` (generated, git-ignored), so
the app can be stale if that folder is not rebuilt. It is now impossible to miss:

```bash
npm run check:build    # disk vs checkout, per app
npm run verify:live    # what a RUNNING server is actually serving
npm start              # rebuilds if needed, then serves — the supported command
```

Every build carries an id (`X-App-Build` header, `<meta name="pet-build">`,
`/health → app_build.build_id`, and the app's own footer). Production refuses
to boot on a stale/missing bundle instead of serving it silently, and any
already-open client shows an **"Update now"** banner when the server has a
newer build.

---

## 💾 Database Backup, Restore & Cloud Sync

- **Real-Time Cloud Sync**: every student, attendance entry, fee payment, and
  mark syncs to Cloud Firestore in real time (authenticated sessions only).
- **Offline (current model)**: Firestore's client cache keeps recently-active
  data available; the full offline-first local SQLite architecture with
  customer-owned encrypted Google Drive backups is the roadmap phase
  documented in `PRODUCTION_REPORT.md` and `CONTROL_PLANE.md`.
- **Manual backup (Export JSON)**:
  1. Open **School Settings** → *Desktop App & Client Handover Hub*.
  2. Click **Download JSON Backup** for a timestamped snapshot.
- **Restore / Import**: upload the `.json` backup via **Restore Database**.

---

## 💬 WhatsApp Integration for Parents

- **Fee receipts** — pre-formatted receipt message to the parent.
- **Absence alerts** — one-tap notification to absent students' parents.
- **Report cards** — term marksheets shared directly.

---

## 📞 Support

For institutional assistance contact the system administrator. Inside the
desktop app, **Settings → About & Support** shows the installation's
support-safe diagnostics (never any credentials or tokens).
