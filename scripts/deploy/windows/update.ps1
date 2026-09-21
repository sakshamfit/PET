<#
.SYNOPSIS
  Update the office PC to the latest code and restart the PET server.

.DESCRIPTION
  pull → install → build → restart → verify, in that order, with a hard stop
  at every step. The last step is `npm run verify:live`, which compares the
  build the server is serving with this checkout — so an update can never end
  with the PC quietly serving the previous build.

  Run it from an elevated PowerShell (it restarts the service).

.PARAMETER RepoDir
  Repository root. Defaults to three levels above this script.

.PARAMETER Branch
  Branch to deploy. Default: main

.PARAMETER SkipPull
  Rebuild + restart from whatever is already checked out.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\deploy\windows\update.ps1
#>
[CmdletBinding()]
param(
  [string]$RepoDir = '',
  [string]$Branch = 'main',
  [string]$PublicUrl = '',
  [switch]$SkipPull
)

$ErrorActionPreference = 'Stop'

if (-not $RepoDir) { $RepoDir = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path }
$RepoDir = (Resolve-Path $RepoDir).Path

function Step($n, $text) { Write-Host ''; Write-Host "[$n] $text" -ForegroundColor Cyan }

$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($id)
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

Push-Location $RepoDir
try {
  $before = $null
  try { $before = (& git rev-parse --short HEAD).Trim() } catch { }

  if (-not $SkipPull) {
    Step 1 'Fetching the latest code'
    & git fetch origin $Branch
    if ($LASTEXITCODE -ne 0) { throw 'git fetch failed — check the network/credentials.' }
    & git checkout $Branch
    if ($LASTEXITCODE -ne 0) { throw "git checkout $Branch failed." }
    & git pull --ff-only origin $Branch
    if ($LASTEXITCODE -ne 0) { throw 'git pull failed (local changes?). Resolve them, then re-run.' }
  } else {
    Step 1 'Skipping git pull (-SkipPull)'
  }

  $after = (& git rev-parse --short HEAD).Trim()
  Write-Host "  commit: $before → $after"

  Step 2 'Installing dependencies'
  if (Test-Path 'package-lock.json') { & npm ci --no-audit --no-fund } else { & npm install --no-audit --no-fund }
  if ($LASTEXITCODE -ne 0) { throw 'dependency install failed.' }

  Step 3 'Type-checking and testing'
  & npm run lint
  if ($LASTEXITCODE -ne 0) { throw 'type-check failed — not deploying a broken build.' }
  & npm run server:test
  if ($LASTEXITCODE -ne 0) { throw 'server tests failed — not deploying.' }

  Step 4 'Building the current source'
  & npm run build
  if ($LASTEXITCODE -ne 0) { throw 'build failed.' }
  & npm run check:build
  if ($LASTEXITCODE -ne 0) { throw 'check:build failed — the bundle does not match the checkout.' }

  Step 5 'Restarting the PET server'
  if (-not $isAdmin) {
    Write-Host '  ⚠️  not elevated — restart the service manually:' -ForegroundColor Yellow
    Write-Host '      powershell -File scripts\deploy\windows\install-server-service.ps1 -Action Restart' -ForegroundColor Yellow
  } elseif (Get-ScheduledTask -TaskName 'PET Server' -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName 'PET Server' -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Start-ScheduledTask -TaskName 'PET Server'
    Start-Sleep -Seconds 8
  } else {
    Write-Host '  ⚠️  the PET Server task is not installed — start it with: npm start' -ForegroundColor Yellow
  }

  Step 6 'Verifying what is live'
  & npm run verify:live
  $localOk = $LASTEXITCODE -eq 0
  if ($PublicUrl) {
    & npm run verify:live -- --url $PublicUrl
  }

  Write-Host ''
  if ($localOk) {
    Write-Host "✅ Update complete — serving commit $after." -ForegroundColor Green
    Write-Host '   Employees with the app open will see an "Update now" banner.'
  } else {
    Write-Host '❌ The running server still does not match this checkout.' -ForegroundColor Red
    Write-Host '   Check the service log, then run: npm start' -ForegroundColor Red
    exit 1
  }
} finally {
  Pop-Location
}
