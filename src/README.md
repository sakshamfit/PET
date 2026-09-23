# Shared Code — src/

This folder contains code shared by the frontend (`pet-web/`).

## Why does frontend need src/ ?

`pet-web/` is the React app, but it imports from `../../src/` because:
- `petApi.ts` is the ONLY way to talk to backend (security + token handling)
- `petApiBase.ts` validates API URL (catches typos early)
- `petSyncQueue.ts` handles offline queue
- `pet.ts` types are the contract with backend

If we put everything in `pet-web/src/`, we'd duplicate code. So `src/` is shared.

---

## Files

### `services/petApi.ts`
**The most important file in frontend.**

- `API_BASE()` → where to send requests (`window.PET_API_BASE` or `/api`)
- `PetApiFailure` → error class with status, code, message
- Token handling: access token in memory, refresh token in secure store (or memory on web)
- `api()` → wrapper that auto-refreshes token on 401
- `petAuth.login()` → login, stores tokens
- `petEmployees`, `petStudents`, `petSchools`, `petVisits`, `petTasks`, `petChat`, etc. → all API endpoints

**Never call fetch directly — always use this.**

### `services/petApiBase.ts`
Validates and normalizes API base URL.

- `normalizeApiBase(input)` → takes what user types (`app.example.org`, `https://host/`) and returns `https://host/api` or error
- `isLocalAddress()` → detects localhost/private IPs (blocks them in static builds)
- `healthUrlFor()` → builds `/health` URL for probing

Used by:
- `vite.config.ts` (build-time check)
- `pet-web/src/runtime.ts` (connect screen)
- `pet-web/src/build.tsx` (shows server host)

### `services/petSyncQueue.ts`
Offline queue — works when internet is down.

- `enqueue(op)` → add operation to queue (stored in localStorage/IndexedDB)
- `pushQueue()` → try to send queued ops to server
- `queueSummary()` → how many ops pending
- `installAutoSync()` → background sync when online

Used by:
- `students_shared.tsx` (register student offline)
- `sync.tsx` (UI + auto-sync)

### `types/pet.ts`
All TypeScript types for API.

- `PetUser`, `PetStudent`, `PetSchool`, `FieldVisit`, `PetTask`, `ChatMessage`, etc.
- Keep in sync with backend `server/src/pet/services/*`
- If backend changes type, update here

---

## Security Model (from petApi.ts comments)

- Access JWT: memory-only (module state, never localStorage) → XSS can't steal from storage
- Refresh token: pluggable store (Android/Desktop inject secure storage, web keeps in memory → reload requires login, accepted trade-off)
- Tokens expire + rotate, single-flight refresh prevents thundering herd
- Browser-supplied role/user IDs never trusted server-side

---

## How to add new API endpoint

1. Add type in `src/types/pet.ts` if needed
2. Add method in `src/services/petApi.ts`:
   ```ts
   export const petMyFeature = {
     list: () => api<{ items: MyItem[] }>('GET', '/my-feature'),
     create: (input: { name: string }) => api<{ item: MyItem }>('POST', '/my-feature', input),
   };
   ```
3. Use in `pet-web/src/pages/`:
   ```ts
   import { petMyFeature } from '@shared/services/petApi';
   const { items } = await petMyFeature.list();
   ```

---

## Why not put this in pet-web/src/ ?

Historical: legacy school app (`src/` old) and PET app (`pet-web/`) shared same services. Now frontend-only keeps only needed files.

Future: could move `src/services/` and `src/types/` into `pet-web/src/shared/` for simplicity. But keeping `@shared` alias makes migration easy.
