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

### A. Vercel — one deployment, both apps

`vercel.json` runs **`npm run build:vercel`** (`scripts/vercel-build.mjs`), which
puts both applications on the same deployment:

| Path | What it is | Built from | Failure behaviour |
| :-- | :-- | :-- | :-- |
| `/` | **M.S. Public School portal** — the school app people use daily | `src/` → `dist/` | **fatal**: a broken build must never replace the live site |
| `/app/` | **PET field-operations app — interface preview** | `pet-web/` → `dist/app/` | best effort: if it fails, the portal still ships and the log says why |

The PET platform itself is a *server* (Express + SQLite on the Trust's machine —
see [doc 13](./docs/PET/13_OFFICE_PC_CLOUDFLARE_TUNNEL_GOLIVE.md)); a static host
can serve its interface but never its data. That is why the preview says
**"Interface preview only"** on screen and cannot sign anyone in. Point it at a
real server by setting `PET_API_BASE` (Vercel → project → Settings → Environment
Variables, e.g. `https://app.purvanchaltrust.org`) and redeploying.

```bash
npm run build:vercel   # exactly what Vercel runs — / and /app/ in dist/
npm run preview:legacy # serve that dist/ locally and look at both
```

**Which build is this URL serving?** (no login needed)

```bash
curl -s https://<your-app>/build-info.json       # → legacy portal build
curl -s https://<your-app>/app/build-info.json   # → PET preview build
```

### "Vercel still shows the old build" — checklist

1. **Are you looking at a frozen URL?** Only a project's **production domain**
   moves forward:
   * `https://<project>-<hash>-<team>.vercel.app` = one *specific* deployment —
     frozen forever, no matter how often you push.
   * `https://<project>-git-<branch>-<team>.vercel.app` = that *branch's* latest
     deployment — frozen as soon as the branch stops moving (every
     pull-request comment links one of these).
   * The **Visit** button in Vercel → Deployments opens the deployment you clicked.

   Open the production domain instead: Vercel → your project → **Domains**.

2. **Which app do you expect at the root?** This repository holds two apps and
   Vercel serves both, but at *different paths* — the school portal at `/` and
   the PET app at `/app/` (see the table above). The PET app has never been at
   `/`, and could not be: it needs the server in doc 13. If the plan is to move
   the PET app to the root and the portal elsewhere, say so — it is a one-line
   change in `vite.pet-vercel.config.ts` plus a redirect for the portal, and it
   must be a deliberate decision, because teachers' bookmarks and the installed
   PWA point at `/`.

3. **Check the build id, don't guess.** The stamp is printed under the login card
   on `/` (and in the PET app's header); the same value is in
   `<meta name="legacy-build">` / `<meta name="pet-build">` and in the JSON above.
   `buildId` = `<commit>-<source-hash>`; compare the commit with the Vercel
   deployment and `git rev-parse --short=8 HEAD`.

4. **Two Vercel projects build this repository** — `pet` and
   `school-management-system` — and both run the same build. Make sure you are
   looking at the domain of the project you are watching.

5. **A failed build never replaces a live site.** Vercel keeps the previous
   deployment, which is deliberate — but it means the site can sit on an older
   commit while the *build* is the thing that is broken. Vercel → Deployments
   shows the failed one; `/build-info.json` keeps reporting the old commit until
   a deployment succeeds.

6. **Signed-out visitors may see Vercel's login, not your app.** `*.vercel.app`
   team URLs can sit behind Vercel Authentication (Settings → Deployment
   Protection). The production/custom domain stays public; the generated
   `*.vercel.app` URLs do not.

7. **Caches.** Shells and `build-info.json` are `no-store`, hashed assets are
   immutable, so a new deployment cannot be masked by the CDN. A tab that loaded
   *before* these headers existed may hold an old shell once —
   <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd>. Any tab open now shows an
   **"Update now"** banner by itself when a newer build goes live.

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
