# PET Distribution & Deployment Guide

How to get the Purvanchal Education Trust platform running in production and onto
employees' phones/desktops. This follows the ownership model in
`docs/PET/12_DEPLOYMENT_HANDOVER.md` — **the Trust owns the production machine
and its secrets; the developer owns the source code.**

## What you are distributing

The platform is **one server** plus **clients that are just web pages pointed at it**:

| Piece | What it is | Who installs it |
|---|---|---|
| PET server (`server/`) | Node.js + Express + SQLite (`pet.db`), serves the API **and** the web app | Installed on ONE machine (office PC or VPS) |
| Field-ops web app | Already built into the server at **`/app/`** — same origin, zero extra hosting | Nobody — employees open a URL |
| Control-plane admin console | Built into the server at **`/admin/`** | Nobody — Main Admin opens a URL |
| Android app (optional) | Capacitor WebView wrapper of the same `/app/` | Sideloaded APK, one per employee |

So "distribution" = put the server somewhere employees can reach it, then give
everyone one URL + one login. There is nothing to separately host for the UI.

---

## Part 1 — Choose where the server lives

### Option A — Office machine + VPN (spec-preferred, most private, ~₹0/month)

Matches spec 07's private-network model (`device → VPN → PET server`). Data
never leaves the Trust's building.

**Hardware:** dedicated mini-PC or desktop (8 GB+ RAM, SSD), UPS strongly
recommended in Varanasi (power cuts would otherwise take the platform offline).

**Network:** install **Tailscale** (free for 100 devices) on the server and on
every employee phone/desktop. Tailscale gives the server a stable private IP
(`100.x.y.z`) + MagicDNS name (e.g. `pet-server.tail1234.ts.net`) reachable
only by your devices, anywhere, from mobile data — no port-forwarding on the
office router, no static IP needed. Enable HTTPS: `tailscale cert
pet-server.tail1234.ts.net` gives you a real certificate for the private name.

**Trade-off:** if the office machine loses power/internet, field staff can't
sync until it's back (offline queue holds their work locally, nothing is lost).

### Option B — Small VPS + HTTPS (always-on, ~₹500–1500/month)

Better if office power/internet is unreliable or you want staff to reach the
platform without installing a VPN client.

- Any Mumbai/Bangalore-region VPS with 1 vCPU / 2 GB RAM is comfortable for 30
  employees (the whole platform is one ~300 MB Node process + SQLite).
- Point a real domain at it (e.g. `app.purvanchaltrust.org`).
- Use **Caddy** as the reverse proxy — it obtains and renews HTTPS
  certificates automatically with a two-line config.
- Optional extra hardening: put the VPS on Tailscale too and only expose 443
  from the tailnet.

---

## Part 2 — Install the server (Linux; Windows notes below)

```bash
# 1. Node.js 20 LTS and build tools (better-sqlite3 compiles on install)
sudo apt update && sudo apt install -y nodejs npm build-essential

# 2. Copy the source (git clone or rsync) to /opt/PET
cd /opt/PET
npm ci --no-audit --no-fund

# 3. Build the two web apps INTO the server
npm run build:admin && npm run build:pet

# 4. Production environment — create /opt/PET/.env.production (never commit)
NODE_ENV=production
PORT=8080
PUBLIC_BASE_URL=https://app.purvanchaltrust.org     # or https://pet-server.tail1234.ts.net
LICENSE_TOKEN_SECRET=<64+ random chars>
PET_JWT_SECRET=<64+ different random chars>
PET_BOOTSTRAP_SECRET=<random, used once below, then cleared>
DATABASE_PATH=/var/lib/pet/control-plane.db
PET_DATABASE_PATH=/var/lib/pet/pet.db
PET_UPLOAD_DIR=/var/lib/pet/uploads
PET_BACKUP_DIR=/var/lib/pet/backups
CORS_ORIGINS=                  # empty is fine — apps are same-origin
TLS_TRUST_PROXY=1              # behind Caddy/Tailscale TLS

# 5. Create the first Main Admin (one-time; prints a temporary password once)
set -a && . ./.env.production && set +a
node server/scripts/pet-bootstrap.js --name "Main Admin" --email admin@purvanchaltrust.org --secret "$PET_BOOTSTRAP_SECRET"

# 6. Run as a service (auto-restart + start on boot)
sudo useradd -r pet && sudo chown -R pet:pet /var/lib/pet /opt/PET
sudo tee /etc/systemd/system/pet.service <<'EOF'
[Unit]
Description=Purvanchal Education Trust platform
After=network-online.target
[Service]
User=pet
WorkingDirectory=/opt/PET
EnvironmentFile=/opt/PET/.env.production
ExecStart=/usr/bin/node server/src/index.js
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
EOF
sudo systemctl enable --now pet
```

**Caddy (HTTPS) config** (`/etc/caddy/Caddyfile`):

```text
app.purvanchaltrust.org {
    reverse_proxy 127.0.0.1:8080
}
```

Firewall: allow only 443 (and 80 for Caddy's ACME challenge). Nothing else.

**Windows (spec layout `C:\PET\{app,data,uploads,backups,logs}`):** install
Node.js 20 LTS, same commands; register the service with NSSM
(`nssm install PET "C:\Program Files\nodejs\node.exe" "C:\PET\app\server\src\index.js"`
with env vars in the NSSM "Environment" tab) or Task Scheduler at logon. Use
Tailscale for connectivity; Caddy/HTTPS on Windows is optional when the server
is only reachable over the tailnet (Tailscale traffic is already encrypted
end-to-end; the app treats it as a private network).

---

## Part 3 — Distribute to the ~30 employees

### 3a. Instant way (recommended): the web app itself

1. On the office machine, Main Admin logs into `https://<server>/app` **or**
   `/admin` (employee management) and creates each employee
   (`Employees` screens → **no passwords are shown to admins**; the system
   issues a one-time credential).
2. Give each employee: the URL, their email, their one-time password.
3. On their phone they open the URL → log in → the app **forces a password
   change** before they can proceed (this is the onboarding flow).
4. **"Install" it:** in Chrome/Android → ⋮ → **Add to Home screen**. The app
   then launches full-screen with the PET icon, exactly like a native app.
   Desktop/laptop staff do the same in Chrome/Edge (install app icon).

No app-store review, no update distribution — fixes ship automatically on
the next visit.

### 3b. Native Android APK (optional wrapper)

The repo includes a Capacitor Android shell. To wrap the **PET** app
(the existing `android/` project currently points at the legacy school app):

```bash
# 1. One-time: create the signing keystore (keep it SAFELY with the Trust)
keytool -genkey -v -keystore pet-release.keystore -alias pet-app -keyalg RSA -keysize 2048 -validity 10000

# 2. Point the wrapper at the PET app build by setting in capacitor.config.ts:
#    webDir: 'server/public/app' and server: { url: 'https://app.purvanchaltrust.org', cleartext: false }
npm run build:pet
npx cap sync android
cd android && ./gradlew assembleRelease
# output: android/app/build/outputs/apk/release/app-release.apk  → sign with pet-release.keystore
```

Distribute the APK by sharing the file (Drive/WhatsApp/USB) — Android will say
"install from unknown source" the first time; that's normal for an internal
tool. Alternatively **Google Play Internal Testing** (one-time $25 dev account)
gives proper update distribution for ≤100 testers — worth it if you plan
frequent photo/offline features on the native shell. Update cadence: same
shell, new bundle → new APK version.

### 3c. Field-data rules that matter

- **Offline-first is built in:** registration/tasks work with no network and
  queue with idempotency keys — employees should know to open the app and hit
  the sync icon when back in coverage; **never delete queued items**.
- **Photos** should be taken through the app (validated + deduplicated
  server-side). No continuous GPS — check-in/visit-start capture one optional
  fix only.

---

## Part 4 — Backups (do this on day one)

```bash
# Nightly (Linux cron): 02:30
30 2 * * * cd /opt/PET && node server/scripts/pet-backup.js --daily
# Weekly/monthly rolls are built-in via --weekly / --monthly retention.
```

The script uses SQLite online backup (safe while running), verifies integrity
before keeping the copy (broken backups are quarantined), and includes
`uploads/`. Keep an **off-machine copy**: rclone the backup dir to the Trust's
Google Drive, or sync to a pen-drive weekly. **Test a restore monthly** —
a backup you have never restored is not a backup. Document per spec 12:
schedule, location, responsible person, emergency contact, last restore test.

## Part 5 — Go-live checklist (from spec 12)

- [ ] Trust owns the production machine + `.env.production` secrets
- [ ] First Main Admin created via `pet-bootstrap`; temp password changed
- [ ] All ~30 employee accounts created; each employee changed their password on first login
- [ ] Https (Caddy/Tailscale cert) works from mobile data
- [ ] Daily backup cron enabled + off-site copy configured + restore tested
- [ ] Tested end-to-end from a phone: student registration (with duplicate review), field visit start→media→end, task assign→submit, team chat, attendance check-in/out, test + marks, enrollment decision, website form → appears in admin dashboard
- [ ] Backup/restore drill date + owner recorded

## What is NOT distributed

- The legacy Firebase school-management app (`src/`) — kept only until Phase 20
  migration exports its data into `pet.db`; then it is retired, not shipped.
- Any secret (JWT secrets, bootstrap secret, keystore passwords) — these live
  only on the production machine / with the Trust.
