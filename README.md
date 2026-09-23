# PET Frontend — Purvanchal Education Trust Field Operations

> **Frontend-only build** — No backend, no `better-sqlite3`, no VS Build Tools needed. Just React + Vite + Tailwind.

This is the stripped-down frontend of the PET platform that was previously running as `software.plusoneco.in` on Vercel and as office-PC app at `app.plusoneco.in`.

---

## 🎯 What is this?

**PET = Purvanchal Education Trust Field Operations Platform**

A mobile-first field ops app for ~30 staff:
- **Students**: registration, status lifecycle, duplicate detection
- **Visits**: field visits to schools with photo uploads
- **Tasks**: assign, track, reassign
- **Chat**: direct + group conversations linked to students/schools
- **Team**: Main Admin can add/disable staff, reset passwords
- **Offline queue**: works offline, syncs when online

**Architecture:**
```
Frontend (this repo)  →  Backend (Express + SQLite on office PC)
     ↓                           ↓
  Vercel (static)        Cloudflare Tunnel → https://app.plusoneco.in
```

This repo is **only the frontend**. Backend is separate (see old docs if needed).

---

## 📁 Project Structure

```
pet-frontend/
├── pet-web/                 # Main React app (THIS IS THE APP)
│   ├── index.html           # Entry HTML, PWA manifest, icons
│   ├── public/
│   │   ├── manifest.webmanifest  # PWA manifest (Add to Home Screen)
│   │   └── pet-icon.svg          # App icon
│   └── src/
│       ├── main.tsx         # Boot: applies API base, mounts React
│       ├── App.tsx          # Shell: auth gate + role-based nav
│       ├── runtime.ts       # Where is the backend? (localStorage + build-time)
│       ├── build.tsx        # Build stamp + update banner
│       ├── connect.tsx      # "Connect to server" screen for static builds
│       ├── ui.tsx           # Shared UI primitives (Card, Badge, Modal...)
│       ├── index.css        # Tailwind + custom PET theme
│       └── pages/           # All screens
│           ├── Login.tsx          # Login + must-change-password flow
│           ├── EmployeeDashboard.tsx # Employee home: attendance, tasks, visits
│           ├── AdminDashboard.tsx    # Main Admin: reports, search, org settings
│           ├── Students.tsx          # Student list + detail + registration
│           ├── students_shared.tsx   # Registration form + duplicate check
│           ├── Visits.tsx            # Field visits list + start/end
│           ├── Tasks.tsx             # Task list + status changes
│           ├── Chat.tsx              # Conversations + messages
│           ├── Team.tsx              # Add/disable staff (admin only)
│           └── sync.tsx              # Offline queue UI + auto-sync
│
├── src/                     # Shared code used by pet-web
│   ├── services/
│   │   ├── petApi.ts        # ONLY way frontend talks to backend (fetch + JWT)
│   │   ├── petApiBase.ts    # Validates/normalizes API base URL
│   │   └── petSyncQueue.ts  # Offline queue: stores ops in IndexedDB/localStorage
│   └── types/
│       └── pet.ts           # All TypeScript types for API contracts
│
├── public/                  # Root public assets (icon.svg)
├── vite.config.ts           # Vite config (frontend-only, simple)
├── vercel.json              # Vercel deployment config
├── tsconfig.json            # TypeScript config
├── package.json             # Only React + Vite + Tailwind (no backend deps)
└── README.md                # This file
```

---

## 🚀 Quick Start (Frontend Only)

### Prerequisites
- Node.js 20 LTS (NOT 22 — 22 needs VS Build Tools for old repo, but frontend-only works on 20+)
- No Python, no VS Build Tools, no better-sqlite3 needed!

### Install & Run

```bash
# Clone
git clone https://github.com/sakshamfit/PET.git
cd PET

# Install (fast, no native modules)
npm ci
# or: npm install

# Dev server
npm run dev
# → http://localhost:3000
```

### Build

```bash
npm run build
# → dist/ folder (static files)

npm run preview
# → http://localhost:4173 (preview prod build)
```

---

## 🔌 Connecting to Backend

The frontend needs a backend to be useful (otherwise it shows "connect to server" screen).

### Option 1: Build-time API base (Vercel)

Set env var in Vercel → Project → Settings → Environment Variables:

```
PET_API_BASE=https://app.plusoneco.in
```

Then redeploy. The URL is baked into the bundle.

### Option 2: Runtime "Connect to Server" screen

For static builds without `PET_API_BASE`, the app shows a connect screen (`pet-web/src/connect.tsx`) where staff can type the server address. It probes `/health` to verify.

Stored in `localStorage: pet.apiBase`

### Option 3: Local dev with backend

If you run backend on office PC at `http://localhost:8080`:

```bash
PET_API_DEV_TARGET=http://localhost:8080 npm run dev
```

Vite proxies `/api` to that target.

---

## 🎨 UI & Styling

- **Tailwind CSS v4** via `@tailwindcss/vite`
- Custom theme in `pet-web/src/index.css`:
  ```css
  --color-pet-900: #0f3d2e (dark green)
  --color-pet-800: #14503d
  --color-pet-700: #1a664d
  ```
- Mobile-first: large touch targets (`min-h-11`), bottom sheets for modals
- PWA: `manifest.webmanifest` + `pet-icon.svg` → Add to Home Screen works

**UI primitives** in `pet-web/src/ui.tsx`:
- `Card`, `Badge`, `Spinner`, `EmptyState`, `StatCard`, `Field`, `Modal`
- `studentStatusTone()` → maps status to badge color
- `taskStatusLabel()` → human-readable task status

---

## 🔐 Auth Flow (How Login Works)

1. **Login** (`pet-web/src/pages/Login.tsx`):
   - POST `/api/auth/login` with email + password
   - Gets `access_token` (short-lived, memory-only) + `refresh_token` (secure store)
   - Stores user in memory (`getPetUser()`)

2. **Session restore** (`pet-web/src/App.tsx`):
   - On page load, tries `restoreSession()` → uses refresh token to get new access token
   - If fails, shows login screen

3. **API calls** (`src/services/petApi.ts`):
   - All go through `api()` wrapper that adds `Authorization: Bearer <token>`
   - On 401, auto-refreshes token (single-flight to avoid race)
   - On refresh fail, logs out

4. **Offline queue** (`src/services/petSyncQueue.ts`):
   - When offline, operations (register student, start visit) are queued in localStorage/IndexedDB
   - `useAutoSync()` tries to push queue when online
   - UI shows badge with queue count

---

## 📱 Pages Explained

### `Login.tsx`
- Email + password form
- Handles `must_change_password` flow (first login)
- Shows API base host (which server it's talking to)

### `EmployeeDashboard.tsx`
- Today's attendance, my tasks, recent visits
- Check-in/out with geolocation

### `AdminDashboard.tsx`
- Reports: total students by status, visits, tasks
- Search across students/schools/employees
- Organization settings

### `Students.tsx` + `students_shared.tsx`
- List with filters (status, school, search)
- Detail view with status history
- Registration form with duplicate detection (`petStudents.duplicatesCheck`)
- Offline: `enqueue()` adds to sync queue if offline

### `Visits.tsx`
- List of field visits
- Start visit: needs school_id, optional purpose + GPS
- End visit: add notes, photos (via `petUploads`)
- Detail shows media, linked students/tasks

### `Tasks.tsx`
- My tasks + all tasks (admin)
- Create task: title, assign to user, priority, due date, linked school/student/visit
- Change status, reassign, add note

### `Chat.tsx`
- Conversations list (direct + group)
- Unread count
- Messages with attachments, linked entities
- Create group conversation

### `Team.tsx` (Admin only)
- List employees
- Add staff: name, email, phone, department, joining date → generates temp password (shown once!)
- Disable/enable, reset access (new temp password)

### `sync.tsx`
- Shows offline queue count
- Manual push, requeue failed, discard
- Auto-sync when online (`installAutoSync`)

---

## 🛠️ Development Notes

### Why frontend-only?
Old repo had:
- `server/` (Express + better-sqlite3) → needs VS BuildTools, Python, Node 20
- `electron/` (desktop app) → needs electron-builder
- `android/` (Capacitor) → needs Android Studio

All that caused `npm ci` to fail with `gyp ERR! find VS`. Now frontend-only installs in 30 seconds.

### Adding a new page
1. Create `pet-web/src/pages/MyPage.tsx`
2. Add route in `pet-web/src/App.tsx`:
   ```ts
   type Route = 'dashboard' | 'students' | ... | 'mypage'
   const NAV = [..., { key: 'mypage', label: 'My Page', icon: '⭐' }]
   ```
3. Import and render in `App.tsx` switch

### API client
Never call `fetch` directly. Always use `petApi.ts`:
```ts
import { petStudents, PetApiFailure } from '@shared/services/petApi';

try {
  const { students } = await petStudents.search({ q: 'ram' });
} catch (e) {
  if (e instanceof PetApiFailure) {
    // e.status, e.code, e.message
  }
}
```

### Types
All backend contracts in `src/types/pet.ts`. If backend changes, update there.

---

## 🌐 Deployment (Vercel)

This frontend is designed for Vercel static hosting:

1. **Push to GitHub**
2. **Vercel → Import Project → select repo**
3. **Settings → Environment Variables**:
   ```
   PET_API_BASE=https://app.plusoneco.in
   ```
   (or your office PC tunnel URL)
4. **Deploy**

Vercel will run:
```bash
npm ci
npm run build
# → dist/ uploaded
```

**Custom domain** (e.g. `software.plusoneco.in`):
- Vercel → Domains → Add `software.plusoneco.in`
- Cloudflare DNS → CNAME `software` → `cname.vercel-dns.com` (or Vercel's A records if apex)

**CORS**: Backend must allow your Vercel domain:
- Office PC `C:\PET\app\.env.production`:
  ```
  CORS_ORIGINS=https://software.plusoneco.in,https://app.plusoneco.in
  ```
- Restart service: `install-server-service.ps1 -Action Restart`

---

## 🔧 Backend (When You Need It)

This repo is frontend-only, but the full PET platform needs backend:

- **Office PC setup**: See old `docs/PET/13_OFFICE_PC_CLOUDFLARE_TUNNEL_GOLIVE.md` (if you have backup)
- Quick version:
  ```powershell
  # On office PC, Node 20 LTS
  git clone https://github.com/sakshamfit/PET app (full repo, not frontend-only)
  cd app
  .\scripts\deploy\windows\pet-first-run.ps1 -PublicUrl https://app.plusoneco.in -AdminEmail admin@plusoneco.in -BootstrapAdmin
  .\scripts\deploy\windows\install-server-service.ps1
  .\scripts\deploy\windows\cloudflare-tunnel.ps1 -Token "<TOKEN>"
  ```

For now, you can develop frontend with mock data or connect to existing backend at `https://app.plusoneco.in`.

---

## 📝 Comments in Code

Key files have extensive comments explaining WHY, not just WHAT:

- `pet-web/src/main.tsx` — boot order (API base before React)
- `pet-web/src/runtime.ts` — where does API base come from? (localStorage > build-time > same-origin)
- `src/services/petApi.ts` — security model (JWT in memory, refresh in secure store)
- `src/services/petApiBase.ts` — why normalize URL? (typos caught early)
- `vite.config.ts` — why 2 configs existed before, now 1
- `pet-web/src/App.tsx` — session gate + role nav

---

## 🐛 Troubleshooting

| Issue | Fix |
|-------|-----|
| `npm ci` fails with `better-sqlite3` | You're on old full repo, not frontend-only. This frontend-only has no native deps. `rm -rf node_modules && npm ci` |
| `vite` not found | `npm ci` didn't run. Run it. |
| Page shows "Connect to server" | Set `PET_API_BASE` env var or type server URL in connect screen |
| CORS error | Backend `CORS_ORIGINS` must include your frontend URL |
| PWA not installing | Needs HTTPS + valid `manifest.webmanifest` — Vercel gives HTTPS automatically |

---

## 📄 License

Private — Purvanchal Education Trust.

---

## 🙏 Credits

Built for field staff who work offline in low-connectivity areas. Mobile-first, large touch targets, offline queue, PWA installable.

Frontend-only refactor: removed server/electron/android to make `npm ci` work without VS BuildTools.

