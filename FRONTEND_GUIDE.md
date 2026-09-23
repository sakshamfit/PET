# Frontend-Only Build Guide — No Backend, No VS BuildTools

> This repo was stripped from full-stack (server + electron + android) to **frontend-only** to fix `npm ci` failures.

## Why frontend-only?

Old repo had:
- `server/` with `better-sqlite3` (needs Python + VS BuildTools + Windows SDK)
- `electron/` (needs electron-builder)
- `android/` (needs Android Studio)

`npm ci` failed with:
```
gyp ERR! find VS — missing Windows SDK
```

Now frontend-only:
- `npm install` → 84 packages, 17 seconds, no native modules
- `npm run build` → 1.5s, 46 modules
- Works on Node 20, no Python, no VS

---

## What was removed?

```
❌ server/ (Express + SQLite)
❌ electron/ + electron.cjs
❌ android/ + android-pet/
❌ admin/ (legacy admin)
❌ src/ legacy (school management)
❌ capacitor configs
❌ docs/PET/ (old office PC guides)
❌ .env.*.example (backend env)
```

Kept:
```
✅ pet-web/ (main React app)
✅ src/services/ (petApi, petApiBase, petSyncQueue)
✅ src/types/pet.ts (API contracts)
✅ public/ + pet-web/public/ (icons, manifest)
✅ vite.config.ts (simple, no server dep)
✅ vercel.json
```

---

## How to run

```bash
# Node 20 LTS required (v20.19.0 tested)
node -v  # should be v20.x

# Install
npm install

# Dev
npm run dev
# → http://localhost:3000

# Build
npm run build
# → dist/

# Preview prod build
npm run preview
# → http://localhost:4173
```

---

## How to deploy to Vercel (software.plusoneco.in)

1. Push this repo to GitHub (branch `main` or `arena/...`)
2. Vercel → Import Project
3. Framework: Vite
4. Build command: `npm run build`
5. Output directory: `dist`
6. Env var:
   ```
   PET_API_BASE=https://app.plusoneco.in
   ```
   (or your office PC tunnel URL)
7. Deploy
8. Add domain `software.plusoneco.in` in Vercel → Domains
9. Cloudflare DNS: CNAME `software` → `cname.vercel-dns.com` (or Vercel IPs)

**CORS**: Backend must allow frontend origin:
```
# On office PC C:\PET\app\.env.production
CORS_ORIGINS=https://software.plusoneco.in,https://app.plusoneco.in
```

---

## How to connect to backend later

This frontend is useless without backend. Options:

### Option A: Office PC + Cloudflare Tunnel (recommended, free)

Office PC runs Express + SQLite, tunnel exposes it at `https://app.plusoneco.in`.

See old guide if you have backup, or:

```powershell
# On office PC, Node 20
git clone https://github.com/sakshamfit/PET full-backend-repo
cd full-backend-repo
.\scripts\deploy\windows\pet-first-run.ps1 -PublicUrl https://app.plusoneco.in -AdminEmail admin@plusoneco.in -BootstrapAdmin
.\scripts\deploy\windows\install-server-service.ps1
.\scripts\deploy\windows\cloudflare-tunnel.ps1 -Token "<TOKEN>"
```

### Option B: Mock backend for frontend dev

Create `src/services/mockApi.ts` that returns fake data, swap in `petApi.ts` when `PET_API_BASE` not set.

### Option C: Use existing backend

If `https://app.plusoneco.in` already runs, just set `PET_API_BASE` to it.

---

## Comments added

- `pet-web/src/main.tsx`: boot order explained
- `pet-web/src/App.tsx`: auth gate + role nav + offline
- `pet-web/src/runtime.ts`: already had extensive comments (where is backend?)
- `src/services/petApi.ts`: already had security model comments
- `src/services/petApiBase.ts`: already had URL normalization comments
- `vite.config.ts`: new simple config with comments
- `README.md`: full guide
- `pet-web/README.md`: structure + concepts
- `src/README.md`: shared code explained

---

## Build output

```
dist/
├── index.html
├── build-info.json (build id, version, api base)
├── manifest.webmanifest
├── pet-icon.svg
└── assets/
    ├── index-XXXX.js (287kb, 85kb gzip)
    ├── react-XXXX.js (12kb)
    └── index-XXXX.css (28kb, 6kb gzip)
```

`build-info.json` example:
```json
{
  "app": "pet-frontend",
  "version": "1.0.0",
  "build_id": "1234567890-abc123",
  "built_at": "2026-09-23T...",
  "api": "https://app.plusoneco.in",
  "deployment": "frontend-only"
}
```

---

## Next steps

1. **Frontend done**: you can deploy `software.plusoneco.in` now (interface preview if no backend)
2. **Backend**: set up office PC when ready, point `PET_API_BASE` to it
3. **Team**: add staff via backend Team page (admin only)
4. **PWA**: test Add to Home Screen on Android

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `npm ci` fails | Use `npm install` first time (no lock file) |
| `vite` not found | `npm install` didn't run |
| Shows "Connect to server" | Set `PET_API_BASE` or type backend URL in connect screen |
| CORS error | Backend `CORS_ORIGINS` must include frontend URL |
| Build fails with `petApi` | Check `src/services/` exists, `tsconfig.json` paths correct |

---

## Original full repo

If you need full-stack back, checkout `main` branch:

```bash
git checkout main
# has server/, electron/, android/, etc.
```

This branch `arena/01a0c9a7-pet` is now frontend-only.
