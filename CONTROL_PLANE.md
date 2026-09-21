# School Management System — Production Control Plane

This document is the operational manual for the **commercial production
control plane**: the license/auth API server, the admin control panel, the
desktop licensing integration, releases, and production hardening.

```
 CUSTOMER WEBSITE                (static site; links to installer download)
      │ download EXE
      ▼
 SchoolManagementSetup-<version>.exe
      ▼
 WINDOWS DESKTOP APP                 HTTPS API            ┌──────────────────────────┐
 ┌────────────────────────┐  ─────────────────────────▶  │  PRODUCTION CONTROL      │
 │ React + Electron +     │                              │  SERVER (this repo:      │
 │ local school data      │  auth · devices · licenses · │  server/)                │
 │ (Firestore today →     │  releases · sessions · audit │                          │
 │  local SQLite phase 2) │ ◀─────────────────────────   │  Control-plane SQLite DB │
 │ Encrypted Drive backup │        tokens / decisions    │  (licensing ONLY)        │
 │  → school's own Drive  │                              └───────────┬──────────────┘
 └────────────────────────┘                                          ▼
                                                             ADMIN CONTROL PANEL
                                                           (server/public/admin,
                                                             served at /admin)
 BACKUP PATH:  School PC → (AES-256-GCM, phase 2) → School owner's Google Drive
               The control server is NEVER a backup destination.
```

Responsibilities never mix:

| Component | Owns |
| :-- | :-- |
| Desktop app (SQLite phase 2 / Firestore today) | School operational data |
| School's Google Drive | The school's encrypted backups (customer-owned) |
| Control server | Licensing, devices, sessions, releases, audit — commercial data only |

---

## 1. Components in this repository

| Path | Purpose |
| :-- | :-- |
| `server/` | Production API server (Express + better-sqlite3, ESM, no framework magic) |
| `server/scripts/bootstrap.js` | Create administrator accounts (no public signup) |
| `server/scripts/backup.js` | Control-plane DB backups w/ integrity check + rotation |
| `server/test/` | 36-test suite: auth, rotation/replay, licensing lifecycle, admin, security |
| `admin/` | Admin Control Panel (separate React/Vite SPA) → builds to `server/public/admin` |
| `electron/` | Desktop main process: safeStorage session, device identity, offline grace, update checks |
| `scripts/audit-prod.mjs` | `npm run audit:prod` — secret scan of everything that ships |
| `scripts/release-check.mjs` | `npm run release:check` — packaging pre-flight gate |
| `scripts/write-build-config.mjs` | Injects the production API URL into desktop builds |

---

## 2. API surface

Customer API (desktop; `Authorization: Bearer <access token>` unless noted):

```
POST /auth/login                 email + password (+ optional school_code)
POST /auth/refresh               rotate refresh token (replay → revoke)
POST /auth/logout                revoke session
GET  /school/me                  school profile + user
POST /devices/activate           activate this installation (limit enforced)
GET  /devices                    list own school's devices
POST /devices/:id/deactivate     deactivate a device (own school)
POST /devices/:id/backup-status  report backup METADATA only (phase-2 hook)
GET  /license                    license + usage + offline policy
POST /license/validate           full validation handshake (school→license→device→session)
GET  /releases/latest            update feed (public metadata)
GET  /health                     liveness for monitors (no secrets)
```

Admin API (admin panel; cookie session + `X-CSRF-Token` on mutations):

```
POST /admin/api/auth/login|logout     GET /admin/api/auth/me
GET  /admin/api/dashboard
GET|POST /admin/api/schools           GET|PATCH /admin/api/schools/:id
POST /admin/api/schools/:id/suspend|reactivate|archive
POST /admin/api/schools/:id/licenses
POST /admin/api/schools/:id/credentials/reset
GET  /admin/api/licenses              POST /admin/api/licenses/:id/extend|suspend|reactivate|revoke
GET  /admin/api/devices               POST /admin/api/devices/:id/deactivate|reactivate
GET|POST /admin/api/releases          POST /admin/api/releases/:id/unpublish
GET  /admin/api/audit                 GET  /admin/api/system
```

### Token model
- **Access token**: JWT (HS256), 15-minute TTL, signed with `LICENSE_TOKEN_SECRET`.
- **Refresh token**: opaque 256-bit secret, 30-day TTL, **rotated every
  refresh**. Only its SHA-256 hash is stored. Presenting a previously
  rotated token = replay → the whole session is revoked and audited.
- **Admin session**: opaque token in an `HttpOnly; SameSite=Strict` cookie
  (+ `Secure` in production), 12 h TTL. CSRF via HMAC token header.
- Desktop persistence: refresh token lives **only** in Electron `safeStorage`
  (DPAPI/Keychain). Never in `localStorage`. Access tokens additionally only
  in process memory.

### Password model
- scrypt (N=16384, r=8, p=1, 64-byte key) with per-credential random salt.
- Temporary passwords are generated server-side, **shown once** in the admin
  panel at creation/reset, and only their hash is stored (`must_change_password=1`).

---

## 3. Running locally (development)

```bash
npm install
npm run server:dev            # http://localhost:8080 (dev defaults; warning shown)
node server/scripts/bootstrap.js --email you@example.com --name "Owner"
npm run build:admin           # admin panel → http://localhost:8080/admin
npm run dev:all               # PET API :8080 + PET app :3000 (the app employees use)
npm run server:test           # 88 automated tests
```

Development conveniences (all refused in production): default dev token
secret, localhost CORS origins, plain HTTP, `*.e2b.app` preview-origin CORS.

---

## 4. Production deployment

### 4.1 Reference infrastructure

```
Domain structure (use your real domain; nothing here is hard-coded):
  app.example.com       → customer landing page / docs / download links
  api.example.com       → this control-plane API          (REQUIRED)
  admin.example.com     → optional dedicated admin host   (also served at
                          https://api.example.com/admin — one origin is fine)
  downloads.example.com → EXE + update files (any HTTPS static host/CDN)
```

Single-VM reference (one machine can serve API + admin + downloads):

```
Ubuntu 24.04 LTS
├── Node.js 22 LTS
├── nginx (TLS termination, HTTP/2, proxy → 127.0.0.1:8080)
├── certbot (Let's Encrypt, auto-renew)
├── systemd unit (auto-restart, journald logs)
├── UFW: allow 22/80/443 only
└── cron: nightly control-plane DB backup (see §4.6)
```

### 4.2 Provision

```bash
# on the server
sudo useradd --system --home /opt/sms --shell /usr/sbin/nologin sms
sudo mkdir -p /opt/sms /var/lib/sms-control-plane /var/backups/sms-control-plane
sudo tar -xzf sms-release.tar.gz -C /opt/sms        # repo checkout or artifact
cd /opt/sms && npm ci --omit=dev
sudo chown -R sms:sms /opt/sms /var/lib/sms-control-plane /var/backups/sms-control-plane
```

`/etc/sms/control-plane.env` (mode 0600, owner root):

```ini
NODE_ENV=production
LICENSE_TOKEN_SECRET=<48+ random chars>
ADMIN_BOOTSTRAP_SECRET=<random>
DATABASE_PATH=/var/lib/sms-control-plane/control-plane.db
PUBLIC_BASE_URL=https://api.example.com
TRUST_PROXY=1
CORS_ORIGINS=https://admin.example.com
BACKUP_DIR=/var/backups/sms-control-plane
PORT=8080
HOST=127.0.0.1
```

> With `NODE_ENV=production` the process **refuses to boot** on any insecure
> configuration (missing/weak secret, no TLS strategy, localhost public URL,
> local CORS origins). This is deliberate — never bypass it.

### 4.3 systemd (`/etc/systemd/system/sms-control-plane.service`)

```ini
[Unit]
Description=SMS Production Control Plane
After=network.target

[Service]
Type=simple
User=sms
Group=sms
WorkingDirectory=/opt/sms
EnvironmentFile=/etc/sms/control-plane.env
ExecStart=/usr/bin/node server/src/index.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now sms-control-plane
curl https://api.example.com/health      # {"status":"ok",...}
```

### 4.4 nginx (TLS termination)

```nginx
server {
  listen 443 ssl http2;
  server_name api.example.com;

  ssl_certificate     /etc/letsencrypt/live/api.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;

  client_max_body_size 256k;

  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
  }
}
```

(For a direct-process TLS instead, set `TLS_CERT_FILE`/`TLS_KEY_FILE` and drop
`TRUST_PROXY` — both are enforced before boot.)

### 4.5 Bootstrap the first administrator

```bash
cd /opt/sms
sudo -u sms NODE_ENV=production LICENSE_TOKEN_SECRET=… ADMIN_BOOTSTRAP_SECRET=… \
  node server/scripts/bootstrap.js --email owner@yourdomain.com --name "Owner"
# Prints a one-time temporary password. Only its scrypt hash is stored.
```

### 4.6 Nightly control-plane DB backup

```cron
# /etc/cron.d/sms-backup
15 3 * * * sms cd /opt/sms && /usr/bin/node server/scripts/backup.js >> /var/log/sms-backup.log 2>&1
```

- Uses SQLite's online backup API → consistent snapshots while running.
- Verifies `PRAGMA integrity_check` on each snapshot (failing backups deleted).
- Rotates (`BACKUP_KEEP`, default 14). Off-site copy: rsync/S3/whatever your
  infra already trusts — this DB contains credential hashes + audit history.
- **Scope reminder:** this backs up the LICENSE SERVER database only. Schools
  back up their own operational data to their own Google Drive (phase 2).

### 4.7 Monitoring

- `GET /health` → uptime, DB integrity (monitor externally: UptimeRobot,
  Better Stack, or your Prometheus black-box).
- Logs → journald (`journalctl -u sms-control-plane -f`).
- Admin panel → **System** page: TLS/secret/CORS/backup checklist (booleans
  only, never secret values).

---

## 5. Desktop application integration

| Topic | Implementation |
| :-- | :-- |
| Session storage | Electron `safeStorage` file store (`electron/secureStore.cjs`); degrades to **memory-only** when OS encryption is unavailable — never plaintext-on-disk |
| Device identity | Stable app-generated UUID in `userData/device-identity.json` (no hardware fingerprinting) |
| Offline grace | Server-granted window (default 72 h) from last successful `/license/validate`; full local operation continues; expiry shows reconnect screen; **data is never deleted/locked** |
| License gate | `LicenseGate.tsx` wraps the app in Electron only; browser build is unchanged |
| Update checks | `electron/releaseClient.cjs` → `GET /releases/latest` (HTTPS feed from this server) |
| Support screen | Settings → About & Support: version, School ID, license status, device reference, diagnostics ID. Never tokens/keys/passwords |
| Build-time config | `SMS_API_URL=https://api.example.com node scripts/write-build-config.mjs` bakes the API URL into the EXE. Packaged builds reject non-HTTPS URLs |

### User data safety contract
- `%LOCALAPPDATA%\SchoolManagementSystem` is **never** deleted by updates or
  by the NSIS uninstaller (`installer.nsh` makes this explicit).
- Logout clears only the session credential, never school data.
- License expiry/suspension/revocation changes the *screens shown*, never the
  *data on disk*.

### Update safety procedure (mandatory when the auto-installer lands)
1. Safety backup of the local database (phase-2 SQLite / current JSON export)
2. Verify the safety backup
3. Install update + restart
4. Validate database integrity on first boot
5. Failure at any step → existing customer data remains untouched

---

## 6. Code signing (prepare — do not fake)

The customer installer should be signed with a legitimate certificate:

1. **Purchase** an OV or EV code-signing certificate (SSL.com, Sectigo,
   DigiCert). EV requires a hardware token / cloud HSM (eSigner, etc.).
2. Configure on the Windows build machine (CI secrets, never in git):
   ```
   set CSC_LINK=C:\certs\sakshamfit-codesign.pfx
   set CSC_KEY_PASSWORD=<from your password manager>
   ```
   electron-builder picks these up automatically and timestamps the
   signature (its default timestamp server applies).
3. Verify after build:
   ```
   signtool verify /pa /v release\SchoolManagementSetup-<version>.exe
   ```
   Check: Publisher name, signature validity, timestamp countersignature.
4. **SmartScreen note:** reputation is *earned over time*. A valid OV
   signature removes the "unknown publisher" warning's worst form but no
   certificate guarantees instant SmartScreen trust. EV + consistent
   publisher identity builds it fastest.

Until a certificate is configured, `release:check` and the production report
keep CODE SIGNING marked as pending — do not claim it.

---

## 7. Release workflow

```bash
# 1. Quality gates (all must pass)
npm run clean && npm install
npm run lint
npm run server:test        # or: npm run test:all (lint + tests)
npm run build              # PET app → server/public/app, admin → server/public/admin
npm run check:build        # both bundles must match this checkout
npm run audit:prod

# 2. Configure the customer-facing API URL for this build
SMS_API_URL="https://api.example.com" SMS_SUPPORT_CONTACT="support@example.com" \
  node scripts/write-build-config.mjs

# 3. Confirm packaging readiness
npm run release:check

# 4. Build the installer (Windows machine)
npm run dist:win          # → release/SchoolManagementSetup-<version>.exe

# 5. Inspect the installer (no dev creds / localhost / secrets) then sign it
# 6. Upload to the HTTPS downloads host
# 7. Publish release metadata so desktops can discover it:
#    Admin panel → Releases → Publish Release (version, channel, URL, sha256, mandatory flag)
```

Mandatory-update flow: the desktop update banner surfaces
`mandatory_update: true` from the feed; install still follows the
update-safety procedure in §5.

---

## 8. Security checklist (implemented ⇄ verified by tests)

- ✅ HTTPS enforced in production (boot rejected otherwise)
- ✅ Security headers (helmet + explicit nosniff/frame-deny/referrer)
- ✅ CORS exact-origin allowlist
- ✅ Rate limiting: `/auth/login`, `/auth/refresh`, `/admin/api/auth/login`, `/devices/activate` + API-wide ceiling
- ✅ Per-account lockout after 5 failed attempts (15 min)
- ✅ Strict request validation (types, bounds, unknown-field rejection)
- ✅ Parameterized SQL everywhere (better-sqlite3 prepared statements)
- ✅ Server-side authorization middleware (admin ≠ school token surfaces)
- ✅ Refresh-token rotation + replay detection + revocation
- ✅ Uniform login errors (no user enumeration)
- ✅ Sanitized error responses (no stack traces to clients)
- ✅ Audit logging with automatic secret redaction
- ✅ No secrets in renderer bundles (enforced by `audit:prod`)
- ✅ Production config gate (no localhost fallbacks)

Phase-2 (out of scope this phase, by design): per-user Firebase rule
least-privilege, local encrypted SQLite, Google Drive backups, auto-update
installation with signed artifacts.

---

## 9. Troubleshooting

| Symptom | Likely cause / action |
| :-- | :-- |
| Server exits with `EX_CONFIG (78)` | Read the printed checklist — production hard gate. Fix env, restart. |
| Admin login works but every mutation 403s | Missing `X-CSRF-Token`; use the built admin panel (it handles CSRF). |
| Desktop says "Unable to connect to licensing service" | DNS/TLS/firewall to `api.example.com`; app continues per offline policy. |
| `DEVICE_LIMIT_REACHED` on a familiar PC | App was reinstalled and generated a new device ID → admin: deactivate the stale row, retry. |
| `REFRESH_REPLAY_DETECTED` in audit | Token replay — session auto-revoked. Investigate device cloning/theft. |
