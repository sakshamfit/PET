# PET Go-Live — Option 2: Office PC + your own domain via Cloudflare Tunnel

**Cost: ₹0/month.** No VPS, no static IP, no port forwarding on the office
router, no VPN client on employees' phones. Your own domain, real HTTPS
certificate, and the data never leaves the Trust's PC.

This is the runbook for the deployment the Trust chose:

```text
 Employee phone / laptop                 Cloudflare edge            Office PC (this machine)
 ┌───────────────────────┐              ┌──────────────┐          ┌────────────────────────┐
 │ https://app.your.org  │ ── HTTPS ──▶ │  TLS + DNS   │ ─tunnel─▶│ cloudflared (service)  │
 │ (browser / Add to     │              │  (free plan) │          │   ↓ 127.0.0.1:8080     │
 │  Home screen)         │ ◀──────────  │              │ ◀────────│ PET server (service)   │
 └───────────────────────┘              └──────────────┘          │  pet.db + uploads      │
                                                                  └────────────────────────┘
```

Two things happen on that PC:

| Service | What it does | Restarts on reboot |
|---|---|---|
| **PET server** (`scripts/start-pet.mjs`) | rebuilds the current source, then serves the API **and** the web app at `/app/` | yes — `install-server-service.ps1` |
| **cloudflared** | keeps an outbound connection to Cloudflare and forwards public traffic to `127.0.0.1:8080` | yes — `cloudflare-tunnel.ps1` |

Because cloudflared only makes **outbound** connections, the office network
needs nothing opened inbound. Closing the office router to the internet is
still the recommended state.

---

## 0. Read this first — the "still showing the old build" fix

The PET web app is *compiled* into `server/public/app/`, which is a generated
(git-ignored) folder. Anything that served that folder without checking it could
serve a bundle from an older commit — that is exactly what was happening. Three
things now make it impossible to miss:

1. **`npm start`** is the only supported way to start the server. It compares
   the bundle with the checkout, rebuilds when they differ, prints the build id
   it is about to serve, and only then starts.
2. **Production refuses to boot on a stale or missing bundle** (exit code 78)
   with the exact fix in the message. Emergency escape hatch:
   `PET_ALLOW_STALE_BUILD=1` — warning only, never silent.
3. **Every response is stamped** — `X-App-Build` header, `<meta name="pet-build">`
   in the shell, `/health → app_build.build_id`, and a version line in the app's
   own footer. If the server has a newer build than the page you are looking at,
   the app shows an **"Update now"** banner instead of pretending.

The one-command answer to "is the new build live?":

```powershell
npm run verify:live                                   # local office PC
npm run verify:live -- --url https://app.yourdomain.org   # through the tunnel
```

```text
════════ verify:live ════════
target      : https://app.yourdomain.org
on disk     : 1029f0e1-c0b86f4fb87ab72d
/health     : HTTP 200  status=ok  db=ok  uptime=8421s
  app_build : present=true build=1029f0e1-c0b86f4fb87ab72d stale=false
/app/       : HTTP 200  shell meta=1029f0e1-c0b86f4fb87ab72d
✅ LIVE BUILD MATCHES THIS CHECKOUT
```

> Also worth knowing: `npm run dev` now starts **this** app (the PET app on
> port 3000). The old M.S. Public School app is still in the repo for the
> data-migration phase, but it is no longer behind any of the obvious commands —
> it is `npm run dev:legacy` (port 3010) / `npm run build:legacy` only.

---

## 1. Prerequisites (once)

| Item | Notes |
|---|---|
| Office PC | Windows 10/11 (or Linux). 8 GB RAM, SSD, **UPS strongly recommended** — power cuts in Varanasi otherwise take the platform offline |
| Node.js 20 or 22 LTS | https://nodejs.org — ticking "Tools for Native Modules" is not required; the SQLite dependency ships prebuilt binaries |
| Git | https://git-scm.com |
| Your domain | Already **added to Cloudflare** with its nameservers pointed at Cloudflare (free plan). Cloudflare dashboard → *Add a site* → change nameservers at your registrar. This is the only step that can take a few hours (DNS propagation)
| Cloudflare account | Free. Tunnel, DNS and edge TLS are all included |

Recommended layout on the office PC (matches spec 12):

```text
C:\PET\
  app\        ← this git repository
  data\       ← pet.db, control-plane.db, uploads\   (the Trust's data)
  backups\    ← nightly SQLite backups (+ copy them off the machine weekly)
  logs\       ← service stdout/stderr
```

Data lives **outside** the repository, so pulling new code or reinstalling the
app never touches a single record.

---

## 2. Get the code and create the environment file

```powershell
mkdir C:\PET
cd C:\PET
git clone https://github.com/sakshamfit/PET app
cd C:\PET\app
npm ci --no-audit --no-fund
```

Create the production environment file — this is the file the Trust owns:

```powershell
Copy-Item .env.production.example .env.production
notepad .env.production
```

Fill in, at minimum:

```ini
NODE_ENV=production
HOST=127.0.0.1                                  # only the tunnel reaches it
PORT=8080
PUBLIC_BASE_URL=https://app.YOURDOMAIN.org      # final hostname
TRUST_PROXY=1                                   # TLS is terminated by Cloudflare
LICENSE_TOKEN_SECRET=<48+ random chars>
PET_JWT_SECRET=<48+ different random chars>
PET_BOOTSTRAP_SECRET=<random value>
DATABASE_PATH=C:\PET\data\control-plane.db
PET_DATABASE_PATH=C:\PET\data\pet.db
PET_UPLOAD_DIR=C:\PET\data\uploads
PET_BACKUP_DIR=C:\PET\data\backups
```

Generate each secret separately with:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

`CORS_ORIGINS` stays **empty** — the web app and the API share one origin, which
is the strictest possible setting. Never put `*` there; production refuses to
boot if you do.

> Production config is validated at startup. If something is missing the server
> prints exactly which variable is wrong and exits **without** touching your
> data — it never falls back to an insecure default.

---

## 3. First run and verification (before any tunnel exists)

```powershell
npm start
```

Expected output — read it, it tells you exactly what is being served:

```text
════════ PET server start ════════
  repo      : C:\PET\app
  env file  : .env.production
  mode      : production
  app build : 1029f0e1-c0b86f4fb87ab72d
  built at  : 2026-09-21T12:18:15.135Z (12s ago)
  commit    : 1029f0e1
  state     : current

🏫 School Management System — Production Control Plane
   listening http://127.0.0.1:8080
   builds being served:
     /app — 1029f0e1-c0b86f4fb87ab72d (built 12s ago) ✅ current   ← employees' app
```

In a second PowerShell window:

```powershell
cd C:\PET\app
npm run verify:live            # ✅ LIVE BUILD MATCHES THIS CHECKOUT
npm run check:build            # what is on disk vs the checkout
```

Note what `npm start` does on a machine where the bundle is missing or stale:
it runs `npm run build` first and only then starts. That is why the service
below can never come up on an old build.

---

## 4. Create the first Main Admin (once)

```powershell
# with .env.production loaded by the same loader npm start uses:
node -e "process.env.NODE_ENV='production';import('./scripts/start-pet.mjs')"   # not needed — see below
```

Simplest reliable form (loads the env file, then creates the account):

```powershell
npm run pet:bootstrap -- --name "Main Admin" --email admin@yourdomain.org --secret <PET_BOOTSTRAP_SECRET>
```

The console prints a **one-time temporary password** — write it down, it is
never shown again. Sign in at `http://127.0.0.1:8080/app/` and you will be
forced to set your own password immediately.

Then create the ~30 employee accounts in the app: **Team → Add staff**
([14_OFFICE_ROLLOUT.md](./14_OFFICE_ROLLOUT.md) Step 5). The one-time password
is shown once on that screen and is not stored — copy it to the employee
before closing the dialog. They must change it on first login.

---

## 5. Make the server start on boot (Windows service)

Elevated PowerShell:

```powershell
cd C:\PET\app
powershell -ExecutionPolicy Bypass -File scripts\deploy\windows\install-server-service.ps1
```

What it does:

* installs dependencies and builds the current source once, so the first start
  is instant and provably current;
* registers the **"PET Server"** scheduled task (runs as SYSTEM at boot,
  restarts automatically on failure, no login required);
* adds a firewall rule **blocking** inbound port 8080 — the tunnel is the only
  way in;
* starts it and prints `/health` with the live build id.

Useful afterwards:

```powershell
powershell -File scripts\deploy\windows\install-server-service.ps1 -Action Status
powershell -File scripts\deploy\windows\install-server-service.ps1 -Action Restart
```

Linux equivalent (systemd, unprivileged user, same behaviour):

```bash
sudo ./scripts/deploy/linux/install-server-service.sh
```

---

## 6. Publish it on your domain (Cloudflare Tunnel)

### Mode A — dashboard-managed (recommended: one command, no config files)

1. Cloudflare dashboard → **Zero Trust** → *Networks → Tunnels* → **Create a
   tunnel** → choose **Cloudflared** → name it `pet-office` → **Save**.
2. Copy the **token** shown in the install step.
3. On the office PC, elevated PowerShell:

```powershell
cd C:\PET\app
powershell -ExecutionPolicy Bypass -File scripts\deploy\windows\cloudflare-tunnel.ps1 -Token "<TOKEN>"
```

That installs cloudflared as a Windows service (correctly, running as SYSTEM)
and starts it. Then, still in the dashboard: **Tunnels → pet-office → Public
Hostnames → Add a public hostname**

```text
Subdomain : app
Domain    : yourdomain.org
Type      : HTTP
URL       : localhost:8080
```

Cloudflare creates the proxied CNAME for you. Nothing else to configure.

### Mode B — CLI-managed (script does everything)

```powershell
cd C:\PET\app
powershell -ExecutionPolicy Bypass -File scripts\deploy\windows\cloudflare-tunnel.ps1 `
    -Domain app.yourdomain.org -InstallService
```

It downloads cloudflared, opens a browser for Cloudflare sign-in, creates the
tunnel, writes `config.yml` (`app.yourdomain.org → http://127.0.0.1:8080`),
creates the DNS route, copies the credentials into the SYSTEM profile (required
for a service that runs as SYSTEM) and registers the service.

Linux/macOS equivalent:

```bash
sudo ./scripts/deploy/linux/cloudflare-tunnel.sh --token "<TOKEN>"            # mode A
sudo ./scripts/deploy/linux/cloudflare-tunnel.sh --domain app.yourdomain.org  # mode B
```

### Verify the public path

```powershell
curl https://app.yourdomain.org/health                 # status ok, app_build.build_id
npm run verify:live -- --url https://app.yourdomain.org
powershell -File scripts\deploy\windows\cloudflare-tunnel.ps1 -CheckOnly -Domain app.yourdomain.org
```

Then the real test: **open `https://app.yourdomain.org` on a phone using mobile
data** (Wi-Fi off) and sign in. That is the go-live moment.

---

## 7. Onboard the ~30 employees (no app store, no installers)

1. Send each employee: the URL, their email, and their one-time password.
2. They open it, sign in, and are **forced** to set their own password.
3. **"Install" it on Android:** Chrome → ⋮ → **Add to Home screen**. The PET
   app then opens full-screen with its own icon and no browser chrome (a PWA
   manifest ships with the app).
4. Tell them two things about field work:
   * registration/tasks work with **no network** — everything queues locally
     with idempotency keys; tap the sync badge when they are back in coverage;
   * **never delete queued items** — the queue is their unsynced work.
5. Fixes need no redistribution: employees get the new build on their next
   visit, and anyone with the app already open sees **"Update now"**.

Optional native APK wrapper (**PET Ops**, `in.plusoneco.pet`, not the legacy
school APK): `npm run android:pet:init`, `android:pet:sync`, `android:pet:apk`.
See [14_OFFICE_ROLLOUT.md](./14_OFFICE_ROLLOUT.md) Step 6.

---

## 8. Backups (do this on day one)

```powershell
cd C:\PET\app
npm run pet:backup                    # nightly: node server/scripts/pet-backup.js --daily
npm run pet:backup:weekly
npm run pet:backup:monthly
```

The script uses SQLite's online backup API (safe while the server runs),
verifies integrity before keeping a copy (a corrupt backup is quarantined, not
kept), and includes `uploads/`.

Schedule the nightly run on Windows:

```powershell
$a = New-ScheduledTaskAction -Execute "node" `
     -Argument "server\scripts\pet-backup.js --daily" -WorkingDirectory "C:\PET\app"
$t = New-ScheduledTaskTrigger -Daily -At 02:30
Register-ScheduledTask -TaskName "PET Backup" -Action $a -Trigger $t -RunLevel Highest -Force
```

Linux cron: `30 2 * * * cd /opt/PET && node server/scripts/pet-backup.js --daily`

**Then get a copy off the machine** (rclone to the Trust's Google Drive, or a
weekly pen-drive). A backup on the same PC as `pet.db` protects against a bug,
not against theft, fire or a dead SSD. **Test a restore monthly** — a backup
that has never been restored is not a backup.

Record and hand over: schedule, location, restore procedure, responsible
person, emergency contact, last successful restore test (spec 12).

---

## 9. Everyday operations

### Update to the latest code

```powershell
cd C:\PET\app
powershell -ExecutionPolicy Bypass -File scripts\deploy\windows\update.ps1 -PublicUrl https://app.yourdomain.org
```

`pull → npm ci → lint → tests → build → check:build → restart → verify:live`.
It stops at the first failure, so a broken commit can never reach employees.

### "It still shows the old build" — 60-second checklist

| Step | Command | What you should see |
|---|---|---|
| 1 | `npm run check:build` | `✅ current` for `/app` and `/admin` (else: `npm run build`) |
| 2 | `npm run verify:live` | `✅ LIVE BUILD MATCHES THIS CHECKOUT` |
| 3 | `curl http://127.0.0.1:8080/health` | `app_build.build_id` matches, `stale: false` |
| 4 | `npm run verify:live -- --url https://app.yourdomain.org` | the tunnel serves the same build id |
| 5 | Inside the app | the footer shows the same build id — if it shows an older one, tap **Update now** (or force-reload: Ctrl+Shift+R / Chrome ⋮ → Refresh) |

If step 1 says stale, the fix is always the same single command:

```powershell
npm start        # rebuilds the current source, then serves
```

### Rollback

```powershell
git log --oneline -10                 # find the last good commit
git checkout <commit>
npm start                             # rebuilds and serves that commit
```

The database is untouched by any of this — schema changes only ever come from
the app's own migrations.

---

## 10. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Phone shows an old app / school-name screen | the phone cached the previous site, or the server is serving a stale bundle | `npm run verify:live` on the PC. Then on the phone: force-reload. The bare-domain `/` response now sends `Clear-Site-Data: cache`, so opening `https://yourdomain.org` (no path) clears the cached shell by itself |
| Server exits immediately with `PRODUCTION CONFIGURATION REJECTED` | a variable in `.env.production` is missing/short/localhost | the message lists each problem; fix them and re-run |
| Server exits with `REFUSING TO START — … build does not match this checkout` | the bundle was built from different sources | `npm run build` (or `npm start`). Emergency only: `PET_ALLOW_STALE_BUILD=1` |
| `/app/` returns HTTP 503 | no web app build on that machine | `npm run build` |
| `502` from Cloudflare, `/health` works locally | cloudflared is not connected | `Get-Service cloudflared` → `Restart-Service cloudflared`; check the public hostname points at `localhost:8080` |
| Tunnel works, phone cannot sign in | wrong URL/time on the phone, or lockout after repeated attempts | `/health` says the server is fine; wait out the lockout window or reset the employee's password as Main Admin |
| `npm start` rebuilds every single time | the checkout really did change (a pull, or an edited file) — it is expected; or `check:build` says stale because a shared file under `src/` changed | harmless: the fingerprint is deliberately conservative. Verify with `npm run check:build` |
| Employees can reach it, but the office LAN cannot | by design: `HOST=127.0.0.1` | set `HOST=0.0.0.0`, remove the port-8080 block rule, add an allow rule for the local subnet only |
| Power cut takes the platform down | no UPS, or the PC is asleep | UPS + *Power options* → never sleep; the services restart themselves at boot |

---

## 11. Optional hardening (all free)

* **Cloudflare Access for the control panel** — Zero Trust → *Access →
  Applications*: protect `yourdomain.org/admin*` with email one-time-PIN for
  the Trust's addresses. Employees' app stays open to the internet but still
  requires their credentials; the admin console stops being reachable by
  strangers. (Access covers 50 users free.)
* **Rate limiting at the edge** — Cloudflare → *Security → WAF → Rate limiting
  rules* on `/api/auth/*`: 20 requests/minute per IP.
* **Bot fight mode / Always Use HTTPS** — both are one toggle each.
* **Keep the origin private** — leave `HOST=127.0.0.1` and the block rule on
  port 8080 in place. Then even a leaked office IP is useless.
* **Short-lived sessions** are already built in (15-minute access JWT, rotating
  refresh, per-account lockout, forced password change on first login).

---

## 12. Go-live sign-off (spec 12 checklist, filled in)

- [ ] Domain on Cloudflare; `https://app.yourdomain.org/health` returns `"status":"ok"`
- [ ] Trust owns the office PC + `.env.production` (secrets known only to the Trust)
- [ ] `PET Server` and `cloudflared` services both set to start automatically
- [ ] First Main Admin created via `pet:bootstrap`; temporary password changed
- [ ] ~30 employee accounts created; each changed their password on first login
- [ ] HTTPS verified from mobile data (Wi-Fi off), not just from the office
- [ ] `npm run verify:live -- --url https://app.yourdomain.org` → ✅
- [ ] Nightly backup scheduled + off-machine copy configured
- [ ] **Restore tested** and the date/owner recorded
- [ ] End-to-end from a phone: registration (with duplicate review), visit
      start → photo → end + report, task assign → submit, team chat,
      attendance check-in/out, test + marks, enrollment decision, website form
      → appears in the admin dashboard
- [ ] Backup/restore drill date + owner recorded
- [ ] Employees told: URL, how to "Add to Home screen", never delete queued items
