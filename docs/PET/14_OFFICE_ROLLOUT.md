# PET office rollout — plusoneco.in

The sequence to run, in order, on the day the Trust goes live. Doc 13 is the
reference for *why* the tunnel works. This file is the checklist for *this*
domain: **plusoneco.in**, the office PC, the Team screen, and the PET Ops
Android app.

Do the steps in order. Step 0 and Step 0B are DNS. They do not install
anything on the office PC, and they must not take the existing Vercel sites
down.

```text
 Employees                         Cloudflare                         Office PC
 ┌─────────────────────────┐      ┌──────────────────┐             ┌─────────────────────┐
 │ https://app.plusoneco.in│ ───▶ │ TLS + DNS + tunnel│ ─outbound─▶│ cloudflared         │
 │ browser, or PET Ops APK │ ◀─── │ (free plan)       │ ◀──────────│ PET server :8080    │
 └─────────────────────────┘      └──────────────────┘             │ pet.db stays here   │
                                                                   └─────────────────────┘
 plusoneco.in  and  api.plusoneco.in   stay on Vercel. Do not point them at the PC.
```

| URL | What it is after this rollout | Touch it in |
|---|---|---|
| `https://plusoneco.in` | Whatever Vercel serves today (the apex). Leave it. | Step 0B — copy the record, do not retarget it |
| `https://api.plusoneco.in` | The existing Vercel project (`school-management-system`). Leave it. | Step 0B — copy the record, do not retarget it |
| `https://app.plusoneco.in` | **PET.** Tunnel → office PC. Employees open this. | Step 3 |
| `https://app.plusoneco.in/app/` | The field-ops app (same server, same login) | Step 4 |
| `https://app.plusoneco.in/admin` | Control-plane console. Not for field staff. | optional Cloudflare Access (doc 13 §11) |

---

## Step 0 — Put plusoneco.in on Cloudflare, but do not flip nameservers yet

Cloudflare Tunnel only works when the domain's **nameservers** are Cloudflare's.
Today the domain is not in that state, or it is only halfway there. Check
before you change anything.

Observed on 2026-09-22 (public DNS, two lookups minutes apart — they did not
agree, so the registrar is the source of truth, not a cached answer):

| Lookup | Nameservers | Addresses |
|---|---|---|
| First | `ns1.vercel-dns.com`, `ns2.vercel-dns.com` | `plusoneco.in` → `216.198.79.1`, `64.29.17.65` (Vercel). `api.plusoneco.in` → `64.29.17.1`, `216.198.79.65` (Vercel). No MX. |
| Second | `nataly.ns.cloudflare.com`, `ridge.ns.cloudflare.com` | apex A empty in that answer; `app.plusoneco.in` and `pet.plusoneco.in` sometimes answered with Vercel anycast |

So: **open the registrar** (wherever plusoneco.in was bought — the nameserver
panel, not Cloudflare and not Vercel) and write down the two nameservers it
shows right now.

### 0.1 Add the site

1. Sign in at https://dash.cloudflare.com → **Add a site** → `plusoneco.in` →
   **Free** plan.
2. Cloudflare will scan existing DNS and show two nameservers of its own
   (often `nataly.ns.cloudflare.com` and `ridge.ns.cloudflare.com` — use the
   pair **on that screen**, not a pair copied from this document).
3. **Stop.** Do not click through to the registrar yet. The next step copies
   the records that keep the current websites up. Changing nameservers first
   is how `plusoneco.in` goes dark for an afternoon.

### 0.2 Write down what is live, from both dashboards

Vercel → each project that mentions plusoneco.in → **Settings → Domains**, and
Vercel → **Domains → plusoneco.in** if the domain was added to the team (that
is Vercel DNS, which is what `ns1.vercel-dns.com` means). Copy every record
into a note. At minimum, confirm these still exist before you continue:

```text
plusoneco.in          A      216.198.79.1
plusoneco.in          A      64.29.17.65
api.plusoneco.in      A      64.29.17.1
api.plusoneco.in      A      216.198.79.65
```

Also copy any TXT (Vercel verification, SPF), CNAME (`www`), or MX you find.
An empty MX today means the domain does not receive mail — do not invent an MX.

If `app.plusoneco.in` already exists and points at Vercel, open it in a
browser. If it is unused, you will delete that record in Step 3 so the tunnel
can own the name. If people use it, stop and pick another hostname
(`ops.plusoneco.in`) and use that as `PUBLIC_BASE_URL` everywhere below.

---

## Step 0B — Copy the Vercel records onto Cloudflare, then move the nameservers

This is the cutover. The order is the whole point: records first, nameservers
second, proof third. The tunnel is not part of this step.

### 0B.1 Recreate every live record in Cloudflare DNS

Cloudflare dashboard → **plusoneco.in → DNS → Records**.

For each record you wrote down in Step 0.2:

| Field | What to enter |
|---|---|
| Type / name / value | Exactly the Vercel value. Do not "update" the IPs to whatever a blog says Vercel uses this year. |
| Proxy status | **DNS only** (grey cloud), not Proxied |

Grey cloud matters. Those hostnames' TLS certificates are issued by Vercel.
An orange cloud makes Cloudflare answer the HTTPS request itself, and Vercel
sites then fail with error 526 / a certificate mismatch until someone debugs
it. Grey cloud means Cloudflare only publishes the DNS; Vercel still serves
the site, exactly as it does today.

Add a TXT only if Vercel shows one. Do not add a tunnel CNAME in this step.

If the nameservers are **already** Cloudflare's, you are not waiting on the
registrar — you are auditing. Open DNS → Records and confirm the four A
records above are present and grey-clouded. Add any that the scan missed.
Then skip 0B.2 and do 0B.3.

### 0B.2 Change nameservers at the registrar

Only after 0B.1 is saved:

1. Registrar → plusoneco.in → Nameservers → **custom**.
2. Replace `ns1.vercel-dns.com` / `ns2.vercel-dns.com` (or whatever is there)
   with the two Cloudflare nameservers from Step 0.1. Remove the old pair.
   Two nameservers, not four.
3. Save. Propagation is usually minutes, occasionally a few hours. Cloudflare's
   site overview turns **Active** when it can see them. Do not keep refreshing
   the Vercel nameserver check — Vercel will complain that it no longer hosts
   DNS. That warning is expected and is not a failure.

Vercel **projects** stay as they are. Moving DNS off Vercel DNS does not
require removing `plusoneco.in` or `api.plusoneco.in` from the Vercel project.
If you remove the domain from the project, Vercel stops serving it. Don't.

### 0B.3 Prove the old sites survived before you touch PET

From a phone on mobile data (Wi-Fi off), or from any network that is not the
office LAN:

```text
https://plusoneco.in          still loads what it loaded yesterday
https://api.plusoneco.in      still loads what it loaded yesterday
```

From the office PC, after Cloudflare says Active:

```powershell
nslookup plusoneco.in
nslookup api.plusoneco.in
curl.exe -I https://plusoneco.in
curl.exe -I https://api.plusoneco.in
```

You want real HTTP responses (200, 301, 302, 401 — anything but a timeout or
`NXDOMAIN`). If either name fails, **stop**. Fix the grey-cloud records in
Cloudflare until they match Step 0.2. Do not create the tunnel "to see if that
helps" — the tunnel is a different hostname and cannot repair the apex.

When both URLs still work, Step 0 and Step 0B are done. The domain is on
Cloudflare. The existing sites are untouched. PET does not exist publicly yet.

---

## Step 1 — Office PC, first run

Windows 10/11, Node.js 20 or 22 LTS, Git. UPS if you have one. Layout:

```text
C:\PET\
  app\        this git repository
  data\       pet.db, control-plane.db, uploads, backups   (not in git)
  logs\       created by the service scripts, inside app\logs
```

```powershell
mkdir C:\PET
cd C:\PET
git clone https://github.com/sakshamfit/PET app
cd C:\PET\app
powershell -ExecutionPolicy Bypass -File scripts\deploy\windows\pet-first-run.ps1 `
  -PublicUrl https://app.plusoneco.in `
  -AdminEmail admin@plusoneco.in `
  -BootstrapAdmin
```

What that script does, and does not do:

* Creates `C:\PET\data` (because the repo's parent is `C:\PET`).
* Writes `.env.production` **only if it is missing**. Re-running the script
  will not rotate secrets and will not wipe a database.
* Generates `LICENSE_TOKEN_SECRET`, `PET_JWT_SECRET`, and
  `PET_BOOTSTRAP_SECRET` into that file. They are not printed. The Trust owns
  the file. It is gitignored.
* `HOST=127.0.0.1`, `TRUST_PROXY=1`, `CORS_ORIGINS` empty. Empty CORS is
  correct: employees and the API share `https://app.plusoneco.in`. Do not put
  `*` there.
* `npm ci` and `npm run build`.
* With `-BootstrapAdmin`, creates the first Main Admin and prints a **one-time
  password** in that window. Write it down. It is not stored.

It does not install the Windows service and it does not open the tunnel. Those
are the next two steps, on purpose — you can read `.env.production` before
anything listens.

Sanity check, still with no tunnel:

```powershell
cd C:\PET\app
npm start
```

In a second window: `npm run verify:live` should say the live build matches
this checkout. Sign in at `http://127.0.0.1:8080/app/` with the bootstrap
password. You will be forced to choose your own. Leave this running, or stop
it with Ctrl+C and install the service (Step 2) which starts it for you.

---

## Step 2 — Start on boot

Elevated PowerShell:

```powershell
cd C:\PET\app
powershell -ExecutionPolicy Bypass -File scripts\deploy\windows\install-server-service.ps1
```

That registers the **PET Server** scheduled task (starts at boot, restarts on
failure) and blocks inbound TCP 8080. The tunnel is an outbound connection, so
the block is what you want. Details and the Linux equivalent are in
[13_OFFICE_PC_CLOUDFLARE_TUNNEL_GOLIVE.md](./13_OFFICE_PC_CLOUDFLARE_TUNNEL_GOLIVE.md) §5.

---

## Step 3 — Publish app.plusoneco.in (the tunnel)

Still in Cloudflare. Do not edit the apex or `api` records.

1. **Zero Trust** → Networks → Tunnels → **Create a tunnel** → Cloudflared →
   name `pet-office` → save → copy the token.
2. If a DNS record for `app` already points at Vercel and nobody uses it,
   delete that record now. `cloudflared` cannot create the hostname while a
   conflicting record exists.
3. Elevated PowerShell on the office PC:

```powershell
cd C:\PET\app
powershell -ExecutionPolicy Bypass -File scripts\deploy\windows\cloudflare-tunnel.ps1 -Token "<TOKEN>"
```

4. Dashboard → the tunnel → **Public Hostnames** → Add:

```text
Subdomain : app
Domain    : plusoneco.in
Type      : HTTP
URL       : localhost:8080
```

Cloudflare creates the proxied CNAME for `app.plusoneco.in`. That hostname is
the one record that *should* be orange-clouded — the tunnel expects it. Leave
the apex and `api` grey.

CLI alternative (same hostname):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\deploy\windows\cloudflare-tunnel.ps1 `
  -Domain app.plusoneco.in -InstallService
```

---

## Step 4 — Prove it from a phone that is not on the office Wi-Fi

```powershell
cd C:\PET\app
npm run verify:live -- --url https://app.plusoneco.in
curl.exe https://app.plusoneco.in/health
```

`verify:live` must print `LIVE BUILD MATCHES THIS CHECKOUT`. `/health` must
show `"status":"ok"` and an `app_build.build_id`.

Then, on a phone with Wi-Fi off: open `https://app.plusoneco.in`, sign in as
Main Admin, confirm the password change stuck. The footer build id should
match `/health`.

If the phone loads and sign-in fails with a network error, you are probably
on the **Vercel** copy of the app (a `*.vercel.app` URL, or the apex) rather
than the tunnel. The tunnel URL is same-origin and does not need
`CORS_ORIGINS`. A Vercel URL does — that is a different deployment, documented
in `DEPLOYMENT.md`, and it is not this rollout.

---

## Step 5 — Team screen: add staff, reset, disable

Sign in as Main Admin → **Team** (sidebar on a laptop, last item on a phone;
the Employees card on the dashboard opens the same screen).

| Action | What happens |
|---|---|
| **Add staff** | Name, email, optional phone / department / joining date. The server generates the password. |
| One-time password dialog | Shown **once**. Not written to the database, not written to the audit log, not kept in the page after you close it. Copy it into WhatsApp / a password hand-off and click **I've saved it**. There is no "show again". |
| **Reset password** | Signs them out everywhere, sets "must change password", shows a new one-time password once. |
| **Disable** | Signs them out immediately. Visits, tasks and history stay. **Enable** turns the account back on; it does not reveal the old password. |

Employees do not see Team. They open `https://app.plusoneco.in`, sign in with
the one-time password, and are forced to set their own before they can do
anything else.

Give each person three things: the URL, their email, the one-time password.
"Install" on Android without an APK: Chrome → ⋮ → **Add to Home screen**. The
icon says PET Ops. That is enough for most of the team.

Tell them two field rules: registration and tasks queue when there is no
network (the sync badge is the queue — do not delete items in it), and a pull
to refresh is how a stuck page picks up a new build. An open app shows
**Update now** by itself when the office PC is serving a newer build.

---

## Step 6 — PET Ops Android app (optional)

Package `in.plusoneco.pet`, display name **PET Ops**. This is not the legacy
`android/` project (`com.sakshamfit.schoolmanagement`, "School Management").
Do not run `npm run android:apk` for field staff — that builds the school app.

The PET Ops APK is a shell that opens `https://app.plusoneco.in/app/`. It does
not contain a private copy of the database, and it does not need a new APK
when you fix a screen. Rebuild it only when the tunnel hostname changes.

On a machine with Android Studio (JDK 17 + SDK) and this repo:

```powershell
cd C:\PET\app
npm run android:pet:init     # no-op if android-pet\ is already in the clone
npm run android:pet:sync     # build:pet, then cap sync into android-pet\
npm run android:pet:apk      # assembleRelease → PET-Ops.apk in the repo root
```

`android:pet:init` / `sync` / `apk` use `capacitor.pet.config.ts`, which sets
`android.path` to `android-pet`. They restore the legacy Capacitor config when
they finish, and they will not modify `android/`.

A different hostname:

```powershell
$env:PET_ANDROID_SERVER_URL = "https://app.plusoneco.in/app/"
npm run android:pet:apk
```

Signing, once, kept with the Trust (losing it means every phone must
uninstall before the next APK will install):

```powershell
keytool -genkey -v -keystore C:\PET\keys\pet-ops-release.keystore -alias pet-ops -keyalg RSA -keysize 2048 -validity 10000
$env:PET_ANDROID_KEYSTORE_FILE     = "C:\PET\keys\pet-ops-release.keystore"
$env:PET_ANDROID_KEYSTORE_PASSWORD = "<keystore password>"
$env:PET_ANDROID_KEY_ALIAS         = "pet-ops"
$env:PET_ANDROID_KEY_PASSWORD      = "<key password>"
npm run android:pet:apk
```

Without those four variables the APK is debug-signed. It installs for a USB
test. Do not send that file to the team.

Share `PET-Ops.apk` (Drive, USB). Android will ask to allow installs from that
source once. The app then loads the same Team / Students / Tasks screens as
the browser. First launch needs network, because the shell opens the live URL.

---

## Step 7 — Backups, the same day

```powershell
cd C:\PET\app
npm run pet:backup
```

Schedule it (elevated), 02:30, and copy `C:\PET\data\backups` off the PC
weekly. A backup on the same disk is not a backup. Doc 13 §8 has the scheduled
task and the monthly restore drill. Do the drill once before you call this
finished, and write down the date and the person.

---

## Step 8 — Updates after go-live

```powershell
cd C:\PET\app
powershell -ExecutionPolicy Bypass -File scripts\deploy\windows\update.ps1 -PublicUrl https://app.plusoneco.in
```

`pull` → `npm ci` → lint → server tests → build → restart → `verify:live`.
It stops at the first failure. Staff with the app open see **Update now**.
No new APK.

---

## If something is wrong

| What you see | Where you are | What to do |
|---|---|---|
| `plusoneco.in` or `api.plusoneco.in` died after the nameserver change | Step 0B was incomplete | Cloudflare DNS: grey-cloud A records exactly as in Step 0.2. Do not orange-cloud them. Do not delete the domain in Vercel. |
| Cloudflare says the nameservers are still Vercel's | Registrar not saved, or propagation | Registrar panel, two Cloudflare nameservers only. Wait. |
| `app.plusoneco.in` is NXDOMAIN | Tunnel hostname not created | Step 3.4. A conflicting old A record must be deleted first. |
| Cloudflare 502, local `/health` works | cloudflared | `Get-Service cloudflared`; restart it. Public hostname service must be `http://localhost:8080`. |
| Phone shows an old school portal | Cached page, or you opened the apex / a `*.vercel.app` URL | Open `https://app.plusoneco.in` specifically. Force-reload. |
| Sign-in spins on a Vercel URL | That deployment is not this tunnel | Use `app.plusoneco.in`, or set `CORS_ORIGINS` to that exact Vercel origin and redeploy with `PET_API_BASE`. Not required for this rollout. |
| Server exits `PRODUCTION CONFIGURATION REJECTED` | `.env.production` | The message lists the variable. `pet-first-run.ps1` will not overwrite a file you already edited. |
| Server exits `REFUSING TO START` (build) | Stale bundle | `npm start`, or `update.ps1`. |
| Team is missing | Signed in as an employee | Team is Main Admin only. |
| "Show the password again" | You closed the dialog | There is no again. **Reset password** issues a new one and shows that once. |
| `npm run android:apk` produced an app named School Management | Wrong script | `npm run android:pet:apk`. Package must be `in.plusoneco.pet`. |

Doc 13 §10 is the longer troubleshooting table (stale builds, firewall, UPS).

---

## Go-live sign-off

- [ ] Registrar nameservers are Cloudflare's. Cloudflare overview says Active.
- [ ] `https://plusoneco.in` and `https://api.plusoneco.in` still load (grey cloud, not the tunnel).
- [ ] `https://app.plusoneco.in/health` returns `"status":"ok"` from mobile data.
- [ ] `npm run verify:live -- --url https://app.plusoneco.in` matches the checkout.
- [ ] Trust holds `.env.production` and, if you built a signed APK, the PET Ops keystore.
- [ ] PET Server and cloudflared both start on boot. Inbound 8080 stays blocked.
- [ ] Main Admin password was changed after bootstrap.
- [ ] Each field employee was added on **Team**. One-time password handed over, then changed by them at first login.
- [ ] Nightly backup scheduled, one copy leaves the PC, one restore has been tried and the date written down.
- [ ] From a phone: register a student, start a visit, assign a task, send a chat, check in.

Related: [13_OFFICE_PC_CLOUDFLARE_TUNNEL_GOLIVE.md](./13_OFFICE_PC_CLOUDFLARE_TUNNEL_GOLIVE.md) (tunnel reference), [12_DEPLOYMENT_HANDOVER.md](./12_DEPLOYMENT_HANDOVER.md) (what the Trust owns), [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) (distribution options).
