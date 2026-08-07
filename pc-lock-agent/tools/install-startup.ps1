#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Makes the PC lock agent start automatically and stay running.

.DESCRIPTION
    Registers a Windows scheduled task with two triggers:

      1. At log on  - the agent is up before the customer can touch anything.
      2. Every minute - a watchdog.

    The watchdog is the important one. Starting at logon alone would mean that
    killing the agent leaves the PC unlocked and free to use for the rest of the
    day. With a one-minute repeating trigger and MultipleInstances=IgnoreNew, a
    killed agent is back within a minute, and the repeat does nothing while it is
    already running.

    Run this once per gaming PC, as Administrator.

.EXAMPLE
    .\install-startup.ps1

.EXAMPLE
    .\install-startup.ps1 -ExePath "D:\BookMyGame\PcLockAgent.exe"
#>
param(
    [string]$ExePath = "C:\BookMyGame\PcLockAgent\PcLockAgent.exe",
    [string]$TaskName = "BookMyGame PC Lock Agent",

    # The Windows account customers use. The task runs ONLY for this account, so
    # signing in as an administrator gives a normal, unlocked Windows — which is
    # how the machine stays administrable once the dev exit chord is disabled.
    # Without this the agent would start for every account including yours.
    [Parameter(Mandatory = $true)][string]$GamingUser
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $ExePath)) {
    Write-Host ""
    Write-Host "Could not find the agent at:" -ForegroundColor Red
    Write-Host "  $ExePath"
    Write-Host ""
    Write-Host "Publish it there first, from the pc-lock-agent folder:" -ForegroundColor Yellow
    Write-Host '  dotnet publish PcLockAgent -c Release -o "C:\BookMyGame\PcLockAgent"'
    Write-Host ""
    Write-Host "Or pass the path you used:"
    Write-Host '  .\install-startup.ps1 -ExePath "D:\somewhere\PcLockAgent.exe"'
    Write-Host ""
    exit 1
}

Write-Host "Installing startup task for: $ExePath" -ForegroundColor Cyan

$action = New-ScheduledTaskAction -Execute $ExePath -WorkingDirectory (Split-Path $ExePath -Parent)

if (-not (Get-LocalUser -Name $GamingUser -ErrorAction SilentlyContinue)) {
    Write-Host ""
    Write-Host "There is no Windows account called '$GamingUser' on this PC." -ForegroundColor Red
    Write-Host ""
    Write-Host "Create a standard (non-admin) account for customers first:" -ForegroundColor Yellow
    Write-Host "  net user $GamingUser /add"
    Write-Host "  net localgroup Users $GamingUser /add"
    Write-Host ""
    Write-Host "Keeping customers off an admin account matters: a standard user" -ForegroundColor Yellow
    Write-Host "cannot install anything or elevate past the lock." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

$logonTrigger = New-ScheduledTaskTrigger -AtLogOn -User $GamingUser

# A "run once, then repeat forever" trigger is the standard way to express a
# watchdog in Task Scheduler; there is no native "keep this running" option.
$watchdogTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date) `
    -RepetitionInterval (New-TimeSpan -Minutes 1)

$settings = New-ScheduledTaskSettingsSet `
    -MultipleInstances IgnoreNew `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

# Bound to the gaming account only, at normal privilege. The agent does not need
# admin — it writes only to HKCU and hooks its own session — and running it
# elevated would add a UAC prompt for no benefit.
$principal = New-ScheduledTaskPrincipal -UserId $GamingUser -LogonType Interactive -RunLevel Limited

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $logonTrigger, $watchdogTrigger `
    -Settings $settings `
    -Principal $principal `
    -Description "Locks this gaming PC until BookMyGame confirms a paid session. Restarts itself if closed." `
    -Force | Out-Null

Write-Host ""
Write-Host "Done. The agent starts when '$GamingUser' logs on, and restarts within" -ForegroundColor Green
Write-Host "a minute if it is closed. Other accounts are unaffected." -ForegroundColor Green
Write-Host ""
Write-Host "Start it now without rebooting:" -ForegroundColor Cyan
Write-Host "  Start-ScheduledTask -TaskName '$TaskName'"
Write-Host ""
Write-Host "Remove it again:" -ForegroundColor Cyan
Write-Host "  .\uninstall-startup.ps1"
Write-Host ""
Write-Host "REMINDER: check AllowDevExit is false in AgentSettings.cs before" -ForegroundColor Yellow
Write-Host "using this on a real cafe PC, or customers can quit the agent with" -ForegroundColor Yellow
Write-Host "Ctrl+Shift+Alt+Q. The agent writes a warning to agent.log on startup" -ForegroundColor Yellow
Write-Host "if it is still enabled." -ForegroundColor Yellow
Write-Host ""
