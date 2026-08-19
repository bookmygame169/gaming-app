#Requires -Version 5.1
<#
.SYNOPSIS
    Puts this PC into a state where the lock can be tested, and takes it back out.

.DESCRIPTION
    Testing the lock has meant using a café PC during opening hours, which is
    why several fixes were judged from a photograph. This makes any Windows
    machine — a spare PC, or a Windows VM on a Mac — into a test rig.

    What it does:

      1. Stops the watchdog, so the agent does not restart itself every minute
         while you are trying to look at it.
      2. Writes a session file for the number of minutes you ask for, so the
         agent starts unlocked and goes straight to the game menu. No internet,
         no booking, no QR code.
      3. Starts the agent.

    It does NOT need a broker, a booking, or the website. The agent logs that it
    cannot reach them and carries on: locking and unlocking are local.

    Run it as an administrator, on the account you want the lock to appear on.

.EXAMPLE
    # 30 minutes of unlocked session, then it re-locks by itself.
    powershell -ExecutionPolicy Bypass -File test-mode.ps1 -Minutes 30

.EXAMPLE
    # Put everything back: watchdog on, session cleared, agent restarted.
    powershell -ExecutionPolicy Bypass -File test-mode.ps1 -Off
#>
param(
    [int]$Minutes = 30,
    [switch]$Off,
    [string]$InstallDir = "C:\BookMyGame\PcLockAgent",
    [string]$TaskName = "BookMyGame PC Lock Agent"
)

$ErrorActionPreference = "Continue"

function Say { param([string]$T,[string]$C="Gray") Write-Host $T -ForegroundColor $C }

$exe        = Join-Path $InstallDir "PcLockAgent.exe"
$dataFolder = Join-Path $env:LOCALAPPDATA "BookMyGame"
$sessionFile= Join-Path $dataFolder "session.json"
$logFile    = Join-Path $dataFolder "agent.log"
$reportFile = Join-Path $dataFolder "game-report.txt"

if (-not (Test-Path -LiteralPath $exe)) {
    Say "No agent at $exe" "Red"
    Say "Install it first, or pass -InstallDir." "Yellow"
    exit 1
}

Get-Process PcLockAgent -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

if ($Off) {
    Remove-Item -LiteralPath $sessionFile -Force -ErrorAction SilentlyContinue
    Enable-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null
    Say ""
    Say "Test mode off." "Green"
    Say "  Session cleared, watchdog back on. The agent will start locked as usual."
    Say ""
    exit 0
}

# The session file the agent reads on startup. Under a day, because a resumed
# session claiming more than that is treated as tampering and refused.
if ($Minutes -lt 1 -or $Minutes -gt 720) {
    Say "Pick between 1 and 720 minutes." "Red"
    exit 1
}

Disable-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null

if (-not (Test-Path -LiteralPath $dataFolder)) {
    New-Item -ItemType Directory -Path $dataFolder -Force | Out-Null
}

$endsAt = (Get-Date).ToUniversalTime().AddMinutes($Minutes).ToString("yyyy-MM-ddTHH:mm:ssZ")
@{ sessionId = "test-$(Get-Random)"; endsAtUtc = $endsAt } |
    ConvertTo-Json | Set-Content -LiteralPath $sessionFile -Encoding UTF8

Say ""
Say "Test mode on." "Green"
Say "  Watchdog stopped, so the agent stays closed when you close it."
Say "  Session of $Minutes minute(s) written; the agent will start unlocked."
Say ""

Start-Process -FilePath $exe -WorkingDirectory $InstallDir | Out-Null
Start-Sleep -Seconds 3

Say "What to try:" "Cyan"
Say "  - The game menu should be on screen now, not the lock screen."
Say "  - Start a launcher game (Valorant, a Steam title) and sign in slowly."
Say "    The menu must stay behind the launcher and not pull focus back."
Say "  - Close the game. The menu should return."
Say "  - Wait out the $Minutes minute(s). It should re-lock on its own."
Say ""
Say "Where to look afterwards:" "Cyan"
Say "  $logFile"
Say "  $reportFile"
Say ""
Say "To get out:" "Yellow"
Say "  powershell -ExecutionPolicy Bypass -File test-mode.ps1 -Off"
Say ""
