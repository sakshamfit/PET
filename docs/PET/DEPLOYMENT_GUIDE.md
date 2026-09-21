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

### Option 2 — Office PC + your own domain via Cloudflare Tunnel (recommended, ₹0/month)

**This is the chosen production setup.** One office PC runs the PET server;
`cloudflared` makes an *outbound* connection to Cloudflare and publishes it on
the Trust's domain with real HTTPS. No VPS, no static IP, no port forwarding,
no VPN client on employees' phones, no monthly bill.

```text
https://app.purvanchaltrust.org ──▶ Cloudflare edge ──tunnel──▶ office PC
                                                                 ├ cloudflared
                                                                 └ PET server :8080
```

* Works from mobile data anywhere, exactly like a hosted app.
* Data never leaves the Trust's PC.
* The server is bound to `127.0.0.1`, so nothing is exposed on the LAN/router.
* One-command service install + updates, and the machine refuses to serve a
  bundle that does not match the checked-out source.

**→ Full step-by-step runbook: [13_OFFICE_PC_CLOUDFLARE_TUNNEL_GOLIVE.md](./13_OFFICE_PC_CLOUDFLARE_TUNNEL_GOLIVE.md)**

### Option 3 — VPS + HTTPS (always-on, ~₹500–1500/month)

Better if office power/internet is unreliable (the office PC going down takes
field sync offline; the offline queue on devices holds their work until it is
back) or if 24×7 availability matters more than where the data physically sits.

- Any Mumbai/Bangalore-region VPS with 1 vCPU / 2 GB RAM is comfortable for 30
  employees (the whole platform is one ~300 MB Node process + SQLite).
- Point a real domain at it (e.g. `app.purvanchaltrust.org`).
- Use **Caddy** as the reverse proxy — it obtains and renews HTTPS
  certificates automatically with a two-line config.
- Optional extra hardening: put the VPS on Tailscale too and only expose 443
  from the tailnet.

### Option 4 — Office machine + VPN only (spec 07's private-network model)

Most private: `device → VPN → PET server`, no public exposure at all. Use this
if the Trust later decides no public hostname should exist. Same machine setup
as Option 2, but connectivity comes from Tailscale instead of Cloudflare.

**Hardware:** dedicated mini-PC or desktop (8 GB+ RAM, SSD), UPS strongly
recommended in Varanasi (power cuts would otherwise take the platform offline).

**Network:** install **Tailscale** (free for 100 devices) on the server and on
every employee phone/desktop. Tailscale gives the server a stable private IP
(`100.x.y.z`) + MagicDNS name (e.g. `pet-server.tail1234.ts.net`) reachable
only by your devices, anywhere, from mobile data — no port-forwarding on the
office router, no static IP needed. Enable HTTPS: `tailscale cert
pet-server.tail1234.ts.net` gives you a real certificate for the private name.

**Trade-off:** every employee must install and keep the VPN client signed in —
that is the price of having no public endpoint at all.

---

## Part 2 — Install the server (Linux; Windows notes below)

```bash
# 1. Node.js 20 LTS and build tools (better-sqlite3 compiles on install)
sudo apt update && sudo apt install -y nodejs npm build-essential

# 2. Copy the source (git clone or rsync) to /opt/PET
cd /opt/PET
npm ci --no-audit --no-fund

# 3. Build the two web apps INTO the server (stamped with a build id)
npm run build && npm run check:build

# 4. Production environment — create /opt/PET/.env.production (never commit)
#    Start from the template:  cp .env.production.example .env.production
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
CORS_ORIGINS=                  # empty — apps are same-origin (strictest setting)
TRUST_PROXY=1                  # behind Caddy / Tailscale / Cloudflare TLS

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
# start-pet.mjs loads .env.production, rebuilds only if the bundle is stale,
# then serves — so a reboot can never come up on an old build.
ExecStart=/usr/bin/node scripts/start-pet.mjs
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
Node.js 20 LTS, then use the provided scripts — no NSSM needed:

```powershell
cd C:\PET\app
powershell -ExecutionPolicy Bypass -File scripts\deploy\windows\install-server-service.ps1
# and, for public access on your own domain:
powershell -ExecutionPolicy Bypass -File scripts\deploy\windows\cloudflare-tunnel.ps1 -Token "<TOKEN>"
```

Both register Windows services (Task Scheduler / cloudflared) that start at
boot and restart on failure; see
[13_OFFICE_PC_CLOUDFLARE_TUNNEL_GOLIVE.md](./13_OFFICE_PC_CLOUDFLARE_TUNNEL_GOLIVE.md).

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

## Part 4b — Updating a live installation

```powershell
# Windows office PC (pull → install → lint → tests → build → check → restart → verify)
powershell -ExecutionPolicy Bypass -File scripts\deploy\windows\update.ps1
```

```bash
# Linux
sudo ./scripts/deploy/linux/install-server-service.sh --update
```

Any time you suspect a machine is showing an old build:

```bash
npm run check:build                    # is the bundle on disk current?
npm run verify:live                    # what is this server actually serving?
npm run verify:live -- --url https://app.yourdomain.org
npm start                              # rebuilds the current source, then serves
```

`npm run build` builds the **PET app + admin console**. The legacy school
portal (still needed only for the Phase 20 data migration) is now
`npm run build:legacy`, and its dev server is `npm run dev:legacy`.

---

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
