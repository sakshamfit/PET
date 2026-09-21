<#
.SYNOPSIS
  PET server — install / remove / restart the office PC's PET server as a
  Windows service that starts on boot and keeps itself running.

.DESCRIPTION
  Registers <repo>\scripts\start-pet.mjs as a Scheduled Task that runs at
  startup as SYSTEM, with automatic restart on failure. `npm start` builds the
  current source before serving, so a reboot can never bring the office PC up
  on an old build.

  Uses the built-in Task Scheduler (no NSSM, no extra downloads).
  Production environment comes from <repo>\.env.production (see
  .env.production.example). Nothing secret is stored by this script.

.PARAMETER Action
  Install (default) | Uninstall | Restart | Status

.PARAMETER RepoDir
  Repository root. Defaults to the parent of this script's folder.

.PARAMETER NodePath
  node.exe to run. Defaults to the node found on PATH.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\deploy\windows\install-server-service.ps1
  powershell -ExecutionPolicy Bypass -File scripts\deploy\windows\install-server-service.ps1 -Action Status
#>
[CmdletBinding()]
param(
  [ValidateSet('Install', 'Uninstall', 'Restart', 'Status')]
  [string]$Action = 'Install',
  [string]$RepoDir = '',
  [string]$NodePath = '',
  [string]$TaskName = 'PET Server'
)

$ErrorActionPreference = 'Stop'

if (-not $RepoDir) {
  $RepoDir = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
}
$RepoDir = (Resolve-Path $RepoDir).Path
$launcher = Join-Path $RepoDir 'scripts\start-pet.mjs'
$logDir = Join-Path $RepoDir 'logs'
$outLog = Join-Path $logDir 'pet-server.out.log'
$errLog = Join-Path $logDir 'pet-server.err.log'

function Assert-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($id)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this from an elevated PowerShell (Run as Administrator).'
  }
}

function Get-NodeExe {
  if ($NodePath) {
    if (-not (Test-Path $NodePath)) { throw "node.exe not found at $NodePath" }
    return (Resolve-Path $NodePath).Path
  }
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if (-not $cmd) {
    throw 'Node.js was not found on PATH. Install Node.js 20/22 LTS from https://nodejs.org and re-run.'
  }
  return $cmd.Source
}

function Show-Status {
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if (-not $task) {
    Write-Host "PET Server task: NOT INSTALLED" -ForegroundColor Yellow
    return
  }
  $info = Get-ScheduledTaskInfo -TaskName $TaskName
  Write-Host "PET Server task : $($task.State)"
  Write-Host "  last run      : $($info.LastRunTime)  (result $($info.LastTaskResult))"
  Write-Host "  next run      : $($info.NextRunTime)"
  Write-Host "  logs          : $outLog"
  Write-Host ''
  Write-Host 'Live check:'
  try {
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8080/health' -TimeoutSec 5
    $build = $health.app_build
    Write-Host "  HTTP $($health.status) · app build $($build.build_id) · stale=$($build.stale)"
    if ($build.stale) { Write-Host '  ⚠️  bundle is stale — run scripts\deploy\windows\update.ps1' -ForegroundColor Yellow }
  } catch {
    Write-Host '  server not answering on 127.0.0.1:8080' -ForegroundColor Yellow
    Write-Host '  check the log above, or run: node scripts\start-pet.mjs' -ForegroundColor Yellow
  }
}

switch ($Action) {
  'Status' { Show-Status; break }

  'Uninstall' {
    Assert-Admin
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
      Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
      Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
      Write-Host "Removed the '$TaskName' task." -ForegroundColor Green
    } else {
      Write-Host "The '$TaskName' task is not installed."
    }
    break
  }

  'Restart' {
    Assert-Admin
    if (-not (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue)) {
      throw "The '$TaskName' task is not installed. Run this script without -Action first."
    }
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Start-ScheduledTask -TaskName $TaskName
    Write-Host 'Restarting the PET server…' -ForegroundColor Green
    for ($i = 0; $i -lt 20; $i++) {
      Start-Sleep -Seconds 2
      try {
        $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8080/health' -TimeoutSec 3
        Write-Host "  up · HTTP $($health.status) · app build $($health.app_build.build_id)" -ForegroundColor Green
        break
      } catch { }
    }
    break
  }

  'Install' {
    Assert-Admin

    if (-not (Test-Path $launcher)) { throw "Launcher not found: $launcher" }
    if (-not (Test-Path (Join-Path $RepoDir '.env.production'))) {
      Write-Host '⚠️  .env.production is missing.' -ForegroundColor Yellow
      Write-Host '    Copy .env.production.example to .env.production and fill it in first,'
      Write-Host '    otherwise the server will refuse to start in production mode.'
      Write-Host ''
    }
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null

    $node = Get-NodeExe
    Write-Host "node       : $node"
    Write-Host "repository : $RepoDir"
    Write-Host "launcher   : $launcher"
    Write-Host ''

    # One-off dependencies + build so the very first service start is quick and
    # provably serving the current source.
    Push-Location $RepoDir
    try {
      if (-not (Test-Path (Join-Path $RepoDir 'node_modules'))) {
        Write-Host 'Installing dependencies (npm ci)…'
        & npm ci --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
      }
      Write-Host 'Building the current source (npm run build)…'
      & npm run build
      if ($LASTEXITCODE -ne 0) { throw 'npm run build failed — fix the error above, then re-run.' }
    } finally {
      Pop-Location
    }

    $action = New-ScheduledTaskAction -Execute $node -Argument "`"$launcher`"" -WorkingDirectory $RepoDir
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $settings = New-ScheduledTaskSettingsSet `
      -AllowStartIfOnBatteries `
      -DontStopIfGoingOnBatteries `
      -StartWhenAvailable `
      -RestartCount 999 `
      -RestartInterval (New-TimeSpan -Minutes 1) `
      -ExecutionTimeLimit (New-TimeSpan -Seconds 0) `
      -MultipleInstances IgnoreNew
    # Log stdout/stderr next to the repo so failures are inspectable after a reboot.
    $settings.OutputLog = $outLog   # not honoured by Task Scheduler for arbitrary exes; the server logs to console
    $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
      Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    }
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
      -Settings $settings -Principal $principal `
      -Description 'Purvanchal Education Trust platform (API + web app). Rebuilds the current source on start.' | Out-Null

    Write-Host "Registered the '$TaskName' task (starts at boot, restarts on failure)." -ForegroundColor Green
    Write-Host 'Starting it now…'

    # Firewall: keep the server private to this machine. cloudflared runs
    # locally, so nothing needs to be exposed to the LAN/Internet.
    $firewallName = 'PET server (localhost only)'
    if (-not (Get-NetFirewallRule -DisplayName $firewallName -ErrorAction SilentlyContinue)) {
      New-NetFirewallRule -DisplayName $firewallName -Direction Inbound -Action Block `
        -Protocol TCP -LocalPort 8080 -Profile Any | Out-Null
      Write-Host 'Added a firewall rule blocking inbound access to port 8080 (tunnel-only access).'
      Write-Host '  Want staff on the office LAN to reach it directly? Remove that rule and set'
      Write-Host '  HOST=0.0.0.0 in .env.production, then add a rule allowing the local subnet only.'
    }

    Start-ScheduledTask -TaskName $TaskName
    Start-Sleep -Seconds 6
    Show-Status
    break
  }
}
