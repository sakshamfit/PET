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

### Deploying the *legacy* school portal (until Phase 20 migration)

```bash
npm run build:legacy   # outputs dist/ (CSP meta injected automatically)
```

### A. Vercel
1. Push this project to GitHub and import it at [vercel.com](https://vercel.com).
2. Framework preset: **Vite** • Build: `npm run build:legacy` • Output: `dist`.

### "Vercel still shows the old build" — checklist

1. **Production only follows `main`.** Vercel builds the production URL from the
   production branch (`main`); any other branch gets a separate Preview URL.
   Merge your work to `main` (a pull request is enough) and Vercel redeploys
   automatically.
2. **Check which build you are actually looking at.** Every build is stamped:
   open **Settings → About & Support** (or hover the stamp at the bottom of the
   sidebar), or fetch `https://<your-app>.vercel.app/build-info.json` — it shows
   `buildId`, `commit` and `builtAt`. Compare the commit with Vercel dashboard →
   Deployments → the latest deployment. If they match, you *are* on the new build.
3. **Hard-refresh once after a deploy.** `index.html` and `build-info.json` are
   served with no-cache headers (`vercel.json`) and hashed assets are immutable,
   but a tab that loaded *before* the fix may still hold the old shell —
   <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> (or clear site data) fixes it.
   Any tab left open now shows an **"Update now"** banner by itself when a newer
   build goes live.
4. **Still stuck?** Vercel dashboard → Deployments → `⋯` on the latest deployment
   → **Redeploy** with *"Clear build cache"* checked — this rules out a poisoned
   build cache.

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
