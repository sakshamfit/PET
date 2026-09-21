<#
.SYNOPSIS
  Publish the office PC's PET server on your own domain through a free
  Cloudflare Tunnel — no port forwarding, no static IP, no VPS.

.DESCRIPTION
  Two ways to run it, both supported here:

  A) Dashboard-managed (RECOMMENDED, one command):
     Create the tunnel in the Cloudflare Zero Trust dashboard, copy its token,
     then run this script with -Token. cloudflared installs itself as a
     Windows service the correct way (no config files, no registry edits), and
     the public hostname is managed in the dashboard.

  B) CLI-managed (this script does everything):
     Run with -Domain app.yourdomain.org. The script downloads cloudflared,
     authenticates you in a browser, creates the tunnel, writes config.yml,
     routes DNS and (with -InstallService) registers the Windows service.
     Locally-managed tunnels run as SYSTEM, which is why the credentials and
     config are copied into the SYSTEM profile directory.

  Free plan is enough: Cloudflare Tunnel, the DNS record and TLS at the edge
  cost nothing. Traffic is encrypted edge → your PC.

.PARAMETER Token
  Tunnel token from the dashboard (mode A). Takes precedence over -Domain.

.PARAMETER Domain
  Public hostname to publish, e.g. app.purvanchaltrust.org (mode B).
  The domain's nameservers must already be on Cloudflare (add the site first).

.PARAMETER TunnelName
  Name for the tunnel when creating it (mode B). Default: pet-office

.PARAMETER LocalPort
  Port the PET server listens on. Default: 8080

.PARAMETER CloudflaredDir
  Where cloudflared.exe lives / will be installed. Default: C:\cloudflared

.PARAMETER InstallService
  Mode B only: register cloudflared as a Windows service that starts at boot.

.EXAMPLE
  # Mode A (recommended)
  powershell -ExecutionPolicy Bypass -File scripts\deploy\windows\cloudflare-tunnel.ps1 -Token "eyJhIjoi..."

.EXAMPLE
  # Mode B, fully scripted, service installed
  powershell -ExecutionPolicy Bypass -File scripts\deploy\windows\cloudflare-tunnel.ps1 `
    -Domain app.purvanchaltrust.org -InstallService
#>
[CmdletBinding()]
param(
  [string]$Token = '',
  [string]$Domain = '',
  [string]$TunnelName = 'pet-office',
  [int]$LocalPort = 8080,
  [string]$CloudflaredDir = 'C:\cloudflared',
  [switch]$InstallService,
  [switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'

function Assert-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($id)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this from an elevated PowerShell (Run as Administrator).'
  }
}

function Get-Cloudflared {
  New-Item -ItemType Directory -Force -Path $CloudflaredDir | Out-Null
  $exe = Join-Path $CloudflaredDir 'cloudflared.exe'
  if (-not (Test-Path $exe)) {
    $url = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
    Write-Host "Downloading cloudflared from $url"
    Invoke-WebRequest -Uri $url -OutFile $exe -UseBasicParsing
  }
  $version = (& $exe --version) 2>&1
  Write-Host "cloudflared : $version"
  return $exe
}

function Test-Origin {
  try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:$LocalPort/health" -TimeoutSec 5
    Write-Host "origin PET server : HTTP $($health.status), app build $($health.app_build.build_id)" -ForegroundColor Green
    if ($health.app_build.stale) {
      Write-Host '  ⚠️  the app bundle is stale — run scripts\deploy\windows\update.ps1 first' -ForegroundColor Yellow
    }
  } catch {
    Write-Host "⚠️  nothing is answering on http://127.0.0.1:$LocalPort/health" -ForegroundColor Yellow
    Write-Host '    Start the server first:  powershell -File scripts\deploy\windows\install-server-service.ps1'
  }
}

if ($CheckOnly) {
  $exe = Join-Path $CloudflaredDir 'cloudflared.exe'
  if (Test-Path $exe) {
    & $exe tunnel list
    Write-Host ''
    Write-Host 'Cloudflared service:'
    Get-Service cloudflared -ErrorAction SilentlyContinue | Format-List Name, Status, StartType
  } else {
    Write-Host "cloudflared not found at $exe"
  }
  Test-Origin
  if ($Domain) {
    Write-Host ''
    Write-Host "Public check: https://$Domain/health"
    try {
      $public = Invoke-RestMethod -Uri "https://$Domain/health" -TimeoutSec 10
      Write-Host "  HTTP $($public.status) · app build $($public.app_build.build_id)" -ForegroundColor Green
    } catch {
      Write-Host "  not reachable yet: $($_.Exception.Message)" -ForegroundColor Yellow
    }
  }
  exit 0
}

Assert-Admin
$cloudflared = Get-Cloudflared
Write-Host ''
Test-Origin
Write-Host ''

# ── Mode A: token from the Cloudflare dashboard ────────────────────────────
if ($Token) {
  Write-Host 'Installing cloudflared as a Windows service (dashboard-managed tunnel)…'
  & $cloudflared service uninstall 2>$null | Out-Null
  & $cloudflared service install $Token
  if ($LASTEXITCODE -ne 0) { throw 'cloudflared service install failed.' }
  Start-Service cloudflared
  Get-Service cloudflared | Format-List Name, Status, StartType
  Write-Host ''
  Write-Host '✅ Tunnel connector installed and running.' -ForegroundColor Green
  Write-Host '   Finish in the dashboard if you have not already:'
  Write-Host '     Zero Trust → Networks → Tunnels → your tunnel → Public Hostnames → Add'
  Write-Host "       Subdomain/domain : $($Domain ? $Domain : 'app.yourdomain.org')"
  Write-Host "       Service          : http://localhost:$LocalPort"
  Write-Host ''
  Write-Host '   Then verify:  npm run verify:live -- --url https://<your-domain>'
  exit 0
}

if (-not $Domain) {
  throw 'Pass either -Token (recommended) or -Domain app.yourdomain.org. See -? for details.'
}

# ── Mode B: CLI-managed tunnel ─────────────────────────────────────────────
Assert-Admin
$profileDir = Join-Path $env:USERPROFILE '.cloudflared'
$systemProfileDir = Join-Path $env:SystemRoot 'System32\config\systemprofile\.cloudflared'
New-Item -ItemType Directory -Force -Path $profileDir | Out-Null

Write-Host 'Step 1/5 — browser sign-in to Cloudflare (pick the zone that owns the domain)'
if (-not (Test-Path (Join-Path $profileDir 'cert.pem'))) {
  & $cloudflared tunnel login
  if ($LASTEXITCODE -ne 0) { throw 'cloudflared tunnel login failed.' }
} else {
  Write-Host '  cert.pem already present — skipping.'
}

Write-Host "Step 2/5 — create the tunnel '$TunnelName' (if it does not exist yet)"
$existing = (& $cloudflared tunnel list --output json 2>$null | ConvertFrom-Json) | Where-Object { $_.name -eq $TunnelName }
if ($existing) {
  $tunnelId = $existing.id
  Write-Host "  reusing tunnel $tunnelId"
} else {
  $created = & $cloudflared tunnel create $TunnelName
  Write-Host $created
  $tunnelId = ((& $cloudflared tunnel list --output json | ConvertFrom-Json) | Where-Object { $_.name -eq $TunnelName }).id
}
if (-not $tunnelId) { throw 'Could not determine the tunnel id.' }

$credsFile = Join-Path $profileDir "$tunnelId.json"
if (-not (Test-Path $credsFile)) { throw "Credentials file missing: $credsFile" }

Write-Host 'Step 3/5 — write config.yml'
$configPath = Join-Path $profileDir 'config.yml'
$configYml = @"
tunnel: $tunnelId
credentials-file: $credsFile

ingress:
  - hostname: $Domain
    service: http://127.0.0.1:$LocalPort
    originRequest:
      connectTimeout: 30s
      noTLSVerify: true
  - service: http_status:404

loglevel: info
"@
Set-Content -Path $configPath -Value $configYml -Encoding UTF8
& $cloudflared tunnel ingress validate
if ($LASTEXITCODE -ne 0) { throw 'config.yml failed validation.' }

Write-Host "Step 4/5 — route DNS: $Domain → $tunnelId.cfargotunnel.com"
& $cloudflared tunnel route dns $TunnelName $Domain
if ($LASTEXITCODE -ne 0) {
  Write-Host '⚠️  DNS route failed (a record for that hostname may already exist).' -ForegroundColor Yellow
  Write-Host '    Delete the conflicting record in the Cloudflare dashboard and re-run.'
}

if (-not $InstallService) {
  Write-Host 'Step 5/5 — skipped (run with -InstallService to register the Windows service).'
  Write-Host ''
  Write-Host "Test it now with:  & '$cloudflared' tunnel run $TunnelName"
  Write-Host "  then open https://$Domain/app/"
  exit 0
}

Write-Host 'Step 5/5 — install the Windows service'
# The service runs as SYSTEM, whose LOCALAPPDATA/PROFILE is the system profile,
# so cloudflared must find cert.pem, config.yml and the credentials there.
New-Item -ItemType Directory -Force -Path $systemProfileDir | Out-Null
Copy-Item (Join-Path $profileDir 'config.yml') $systemProfileDir -Force
Copy-Item (Join-Path $profileDir 'cert.pem') $systemProfileDir -Force
Copy-Item $credsFile $systemProfileDir -Force
# The config references the user-profile credentials path — copy that too and
# keep the file readable by SYSTEM.
Copy-Item $credsFile (Join-Path $systemProfileDir "$tunnelId.json") -Force

& $cloudflared service uninstall 2>$null | Out-Null
& $cloudflared service install
if ($LASTEXITCODE -ne 0) { throw 'cloudflared service install failed.' }

# Point the service at the SYSTEM-profile config explicitly (Cloudflare's
# documented requirement when running a locally-managed tunnel as a service).
$regPath = 'HKLM:\SYSTEM\CurrentControlSet\Services\cloudflared'
$image = '"' + $cloudflared + '" --config "' + (Join-Path $systemProfileDir 'config.yml') + '" tunnel run'
Set-ItemProperty -Path $regPath -Name ImagePath -Value $image
Write-Host "  ImagePath → $image"

Start-Service cloudflared
Start-Sleep -Seconds 5
Get-Service cloudflared | Format-List Name, Status, StartType

Write-Host ''
Write-Host "✅ https://$Domain now reaches this PC's PET server." -ForegroundColor Green
Write-Host "   Verify end-to-end:  npm run verify:live -- --url https://$Domain"
Write-Host ''
Write-Host '   Optional hardening (free): Cloudflare Zero Trust → Access → Applications'
Write-Host '   protect  <domain>/admin*  with email one-time-PIN, so the control panel'
Write-Host '   is not reachable by the whole internet.'
