<#
.SYNOPSIS
  First run of PET on the office PC. Safe to run again.

.DESCRIPTION
  Prepares the Trust's machine after `git clone`, before the Cloudflare Tunnel
  exists. It does not change DNS (that is Step 0 / 0B in
  docs/PET/14_OFFICE_ROLLOUT.md) and it does not open any port.

  What it does:
    1. Checks Node.js 20+.
    2. Creates the data directories next to the repo (C:\PET\data when the
       repo is C:\PET\app).
    3. Creates .env.production from the example if it is missing, fills
       PUBLIC_BASE_URL and the data paths, and generates the three secrets.
       An existing .env.production is never overwritten.
    4. npm ci (unless node_modules is already there) and npm run build.
    5. Optionally creates the first Main Admin (-BootstrapAdmin).
    6. Optionally registers the boot service (-InstallService, needs admin).

  The one-time admin password is printed by pet:bootstrap and is not stored
  by this script.

.PARAMETER PublicUrl
  The URL employees will open. Default: https://app.plusoneco.in
  Must be https and must not be localhost.

.PARAMETER DataDir
  Where pet.db lives. Default: the sibling "data" folder of the repo
  (C:\PET\data when the clone is C:\PET\app).

.PARAMETER AdminEmail
  Required with -BootstrapAdmin.

.PARAMETER BootstrapAdmin
  Create the first Main Admin. Refuses to run if .env.production still has
  placeholder secrets.

.PARAMETER InstallService
  After the build, run install-server-service.ps1 (elevated PowerShell).

.EXAMPLE
  cd C:\PET\app
  powershell -ExecutionPolicy Bypass -File scripts\deploy\windows\pet-first-run.ps1 `
    -PublicUrl https://app.plusoneco.in `
    -AdminEmail admin@plusoneco.in `
    -BootstrapAdmin
#>
[CmdletBinding()]
param(
  [string]$RepoDir = '',
  [string]$PublicUrl = 'https://app.plusoneco.in',
  [string]$DataDir = '',
  [string]$AdminName = 'Main Admin',
  [string]$AdminEmail = '',
  [switch]$BootstrapAdmin,
  [switch]$InstallService,
  [switch]$ForceInstall
)

$ErrorActionPreference = 'Stop'

function Step($n, $text) {
  Write-Host ''
  Write-Host "[$n] $text" -ForegroundColor Cyan
}

function New-PetSecret {
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $bytes = New-Object byte[] 48
    $rng.GetBytes($bytes)
  } finally {
    $rng.Dispose()
  }
  return ([System.BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
}

function Set-EnvLine([string]$text, [string]$key, [string]$value) {
  $pattern = '(?m)^' + [regex]::Escape($key) + '=.*$'
  # Replacement strings treat $ as a backreference. Secrets are hex, but escape anyway.
  $line = ($key + '=' + $value).Replace('$', '$$')
  if ([regex]::IsMatch($text, $pattern)) {
    return [regex]::Replace($text, $pattern, $line, 1)
  }
  return ($text.TrimEnd() + "`r`n" + $key + '=' + $value + "`r`n")
}

function Get-EnvValue([string]$path, [string]$key) {
  if (-not (Test-Path $path)) { return '' }
  foreach ($raw in Get-Content -Path $path) {
    $line = $raw.Trim()
    if (-not $line -or $line.StartsWith('#')) { continue }
    $eq = $line.IndexOf('=')
    if ($eq -lt 1) { continue }
    if ($line.Substring(0, $eq).Trim() -eq $key) {
      return $line.Substring($eq + 1).Trim()
    }
  }
  return ''
}

if (-not $RepoDir) {
  $RepoDir = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
}
$RepoDir = (Resolve-Path $RepoDir).Path
$envFile = Join-Path $RepoDir '.env.production'
$example = Join-Path $RepoDir '.env.production.example'

if (-not $DataDir) {
  $DataDir = Join-Path (Split-Path $RepoDir -Parent) 'data'
}

if ($PublicUrl -notmatch '^https://') {
  throw "PublicUrl must start with https:// (got: $PublicUrl)"
}
if ($PublicUrl -match 'localhost|127\.0\.0\.1') {
  throw 'PublicUrl must not be localhost. Use the tunnel hostname, e.g. https://app.plusoneco.in'
}
$PublicUrl = $PublicUrl.TrimEnd('/')

Step 1 'Checking Node.js'
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  throw 'Node.js was not found on PATH. Install Node.js 20 or 22 LTS from https://nodejs.org and re-run.'
}
$nodeVersion = (& node -p "process.versions.node").Trim()
$major = [int]($nodeVersion.Split('.')[0])
if ($major -lt 20) {
  throw "Node.js $nodeVersion is too old. Install 20 or 22 LTS."
}
Write-Host "  node $nodeVersion  ($($node.Source))"
Write-Host "  repo $RepoDir"
Write-Host "  data $DataDir"

Step 2 'Creating data directories (outside the git checkout)'
$uploadDir = Join-Path $DataDir 'uploads'
$backupDir = Join-Path $DataDir 'backups'
$logDir = Join-Path $RepoDir 'logs'
foreach ($dir in @($DataDir, $uploadDir, $backupDir, $logDir)) {
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  Write-Host "  $dir"
}

Step 3 '.env.production'
if (Test-Path $envFile) {
  Write-Host '  already exists — leaving it untouched.'
  $currentUrl = Get-EnvValue $envFile 'PUBLIC_BASE_URL'
  if ($currentUrl -match 'YOURDOMAIN|REPLACE_WITH|example') {
    Write-Host '  ⚠️  PUBLIC_BASE_URL still looks like a placeholder. Edit .env.production before starting the server.' -ForegroundColor Yellow
  }
} else {
  if (-not (Test-Path $example)) { throw "Missing template: $example" }
  $text = Get-Content -Path $example -Raw
  $text = Set-EnvLine $text 'PUBLIC_BASE_URL' $PublicUrl
  $text = Set-EnvLine $text 'HOST' '127.0.0.1'
  $text = Set-EnvLine $text 'PORT' '8080'
  $text = Set-EnvLine $text 'TRUST_PROXY' '1'
  $text = Set-EnvLine $text 'NODE_ENV' 'production'
  $text = Set-EnvLine $text 'DATABASE_PATH' (Join-Path $DataDir 'control-plane.db')
  $text = Set-EnvLine $text 'PET_DATABASE_PATH' (Join-Path $DataDir 'pet.db')
  $text = Set-EnvLine $text 'PET_UPLOAD_DIR' $uploadDir
  $text = Set-EnvLine $text 'PET_BACKUP_DIR' $backupDir
  $text = Set-EnvLine $text 'LICENSE_TOKEN_SECRET' (New-PetSecret)
  $text = Set-EnvLine $text 'PET_JWT_SECRET' (New-PetSecret)
  $text = Set-EnvLine $text 'PET_BOOTSTRAP_SECRET' (New-PetSecret)
  # Keep CORS empty: the tunnel serves the app and the API on one origin.
  $text = Set-EnvLine $text 'CORS_ORIGINS' ''
  $utf8 = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($envFile, $text, $utf8)
  Write-Host "  wrote $envFile" -ForegroundColor Green
  Write-Host '  secrets were generated into that file. They are not printed here.'
  Write-Host "  PUBLIC_BASE_URL=$PublicUrl"
}

$placeholders = @()
foreach ($key in @('LICENSE_TOKEN_SECRET', 'PET_JWT_SECRET', 'PET_BOOTSTRAP_SECRET', 'PUBLIC_BASE_URL')) {
  $value = Get-EnvValue $envFile $key
  if (-not $value -or $value -match 'REPLACE_WITH|YOURDOMAIN|example\.com') {
    $placeholders += $key
  }
}
if ($placeholders.Count -gt 0) {
  Write-Host ''
  Write-Host '⚠️  .env.production still has placeholders:' -ForegroundColor Yellow
  foreach ($key in $placeholders) { Write-Host "    $key" }
  Write-Host '    Edit the file, then re-run this script. The server will refuse to boot until they are real.'
}

Step 4 'Installing dependencies and building the current source'
Push-Location $RepoDir
try {
  if ($ForceInstall -or -not (Test-Path (Join-Path $RepoDir 'node_modules'))) {
    & npm ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
  } else {
    Write-Host '  node_modules present — skipping npm ci (pass -ForceInstall to redo it).'
  }
  & npm run build
  if ($LASTEXITCODE -ne 0) { throw 'npm run build failed. Fix the error above before installing the service.' }
} finally {
  Pop-Location
}

if ($BootstrapAdmin) {
  Step 5 'Creating the first Main Admin'
  if (-not $AdminEmail -or $AdminEmail -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') {
    throw 'Pass a real -AdminEmail with -BootstrapAdmin (example: -AdminEmail admin@plusoneco.in).'
  }
  if ($placeholders.Count -gt 0) {
    throw 'Refusing to bootstrap while .env.production still has placeholders.'
  }
  $secret = Get-EnvValue $envFile 'PET_BOOTSTRAP_SECRET'
  Push-Location $RepoDir
  try {
    & node server/scripts/pet-bootstrap.js --name $AdminName --email $AdminEmail --secret $secret
    if ($LASTEXITCODE -ne 0) { throw 'pet:bootstrap failed. If a Main Admin already exists, that is fine — sign in and use Team.' }
  } finally {
    Pop-Location
    Remove-Variable secret -ErrorAction SilentlyContinue
  }
} else {
  Step 5 'Main Admin not created (pass -BootstrapAdmin -AdminEmail you@plusoneco.in to do it now)'
}

if ($InstallService) {
  Step 6 'Registering the PET Server service'
  & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'install-server-service.ps1') -RepoDir $RepoDir
  if ($LASTEXITCODE -ne 0) { throw 'Service install failed. Run it from an elevated PowerShell.' }
} else {
  Step 6 'Service not installed. From an elevated PowerShell:'
  Write-Host '    powershell -ExecutionPolicy Bypass -File scripts\deploy\windows\install-server-service.ps1'
}

Write-Host ''
Write-Host '════════ What to do next ════════' -ForegroundColor Green
Write-Host '  1. Nameservers: docs\PET\14_OFFICE_ROLLOUT.md Step 0 and Step 0B'
Write-Host '     (move plusoneco.in to Cloudflare WITHOUT breaking the Vercel sites).'
Write-Host '  2. Tunnel: scripts\deploy\windows\cloudflare-tunnel.ps1 -Token "<TOKEN>"'
Write-Host "     Public hostname: app.plusoneco.in  →  http://localhost:8080"
Write-Host "  3. Prove it: npm run verify:live -- --url $PublicUrl"
Write-Host '  4. Sign in at that URL → Team → Add staff.'
Write-Host '     The one-time password is shown once. Copy it before closing the dialog.'
Write-Host ''
