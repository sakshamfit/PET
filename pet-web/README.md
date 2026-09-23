# pet-web — PET Field Operations Frontend

This is the main React app for PET (Purvanchal Education Trust).

## Quick Start

```bash
npm install
npm run dev
# → http://localhost:3000
```

## Structure

```
pet-web/src/
├── main.tsx         # Boot: sets API base, mounts React
├── App.tsx          # Shell: auth + nav + role-based routing
├── runtime.ts       # Where is backend? (localStorage > build-time > /api)
├── build.tsx        # Build stamp + "Update now" banner
├── connect.tsx      # Connect to server screen (for static builds)
├── ui.tsx           # Card, Badge, Modal, etc. (mobile-first)
├── index.css        # Tailwind + PET theme (green)
└── pages/
    ├── Login.tsx
    ├── EmployeeDashboard.tsx
    ├── AdminDashboard.tsx
    ├── Students.tsx
    ├── Tasks.tsx
    ├── Visits.tsx
    ├── Chat.tsx
    ├── Team.tsx
    └── sync.tsx
```

## Key Concepts

### API Base (Where is backend?)

1. **Device choice** (highest priority): user typed in connect screen → stored in `localStorage: pet.apiBase`
2. **Build-time**: `PET_API_BASE` env var baked into bundle (Vercel)
3. **Same-origin**: `/api` (for office PC where Express serves frontend + API together)

See `runtime.ts` for full logic.

### Auth

- Login → gets access + refresh tokens
- Access token in memory only (not localStorage)
- Refresh token in secure store (or memory on web)
- `restoreSession()` on page load tries refresh
- `api()` auto-refreshes on 401

See `../../src/services/petApi.ts`

### Offline Queue

- `enqueue()` in `students_shared.tsx` queues ops when offline
- `useAutoSync()` pushes when online
- `sync.tsx` shows queue UI

### Build Stamp

- Every build has id, version, built_at
- `build-info.json` in dist/ for health checks
- `useBuildWatcher()` polls for newer build, shows "Update now" banner

## Styling

Tailwind v4, mobile-first:

```css
/* index.css */
--color-pet-900: #0f3d2e (dark green, primary)
.p-card: bg-white rounded-2xl border shadow-sm
.p-btn-primary: bg-pet-800 text-white
.p-input: rounded-xl border focus:ring
```

Touch targets min 44px (`min-h-11`), bottom sheets for modals on mobile.

## PWA

- `public/manifest.webmanifest`: name, icons, start_url
- `public/pet-icon.svg`: app icon
- Add to Home Screen works on Android (Chrome → ⋮ → Add to Home Screen)

## Adding New Page

1. Create `pages/MyPage.tsx`
2. Add to `App.tsx`:
   ```ts
   type Route = ... | 'mypage'
   const NAV = [..., { key: 'mypage', label: 'My Page', icon: '⭐' }]
   // in main render:
   {route === 'mypage' && <MyPage />}
   ```
3. Use `petApi` for data fetching

## Deployment

Vercel: `npm run build` → `dist/` → static hosting.

Set `PET_API_BASE=https://app.plusoneco.in` in Vercel env vars to point to backend.

See root `README.md` for full deployment guide.
