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
    # signing in as an administrator gives a normal, unlocked Windows - which is
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

# Checked with `net user` rather than Get-LocalUser: that cmdlet lives in the
# LocalAccounts module, which is missing from 32-bit PowerShell on 64-bit
# Windows. The installer is a 32-bit process, so it would launch exactly that
# PowerShell and the script would die here for reasons having nothing to do with
# the account.
$accountExists = $false
try {
    # Relaxed just for this call: `net user` writes to stderr when the account
    # does not exist, and with ErrorActionPreference Stop that terminates the
    # script instead of answering the question being asked.
    $ErrorActionPreference = "SilentlyContinue"
    $null = & net user $GamingUser 2>&1
    $accountExists = ($LASTEXITCODE -eq 0)
} finally {
    $ErrorActionPreference = "Stop"
}

if (-not $accountExists) {
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
# RepetitionDuration is given explicitly. Left out, some Windows and PowerShell
# combinations register the task with no repetition at all - it runs once at
# registration and never again, so the watchdog silently is not one. MaxValue is
# how "forever" is spelled here.
$watchdogTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date) `
    -RepetitionInterval (New-TimeSpan -Minutes 1) `
    -RepetitionDuration ([TimeSpan]::MaxValue)

$settings = New-ScheduledTaskSettingsSet `
    -MultipleInstances IgnoreNew `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

# Bound to the gaming account only, at normal privilege. The agent does not need
# admin - it writes only to HKCU and hooks its own session - and running it
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

# --- Keep itself up to date --------------------------------------------------
#
# As SYSTEM, not as the customer: the install folder is deliberately read-only
# for them, and an update has to replace the very files that protects. SYSTEM
# also means it runs with nobody signed in, which is exactly when updating is
# safe - update-agent.ps1 declines while the agent is running rather than pull
# the lock out from under someone sitting at the PC.
$updateScript = Join-Path (Split-Path $ExePath -Parent) "update-agent.ps1"
if (Test-Path $updateScript) {
    $updateTaskName = "BookMyGame PC Lock Update"

    $updateAction = New-ScheduledTaskAction `
        -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" `
        -Argument "-ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File `"$updateScript`""

    # At boot and every four hours. Boot is when a cafe PC is most likely to be
    # sitting idle with nobody logged in, which is the only time an update can
    # actually go ahead.
    $updateTriggers = @(
        (New-ScheduledTaskTrigger -AtStartup),
        (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(10) `
            -RepetitionInterval (New-TimeSpan -Hours 4) `
            -RepetitionDuration ([TimeSpan]::MaxValue))
    )

    $updateSettings = New-ScheduledTaskSettingsSet `
        -MultipleInstances IgnoreNew `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -ExecutionTimeLimit (New-TimeSpan -Hours 1)

    $updatePrincipal = New-ScheduledTaskPrincipal `
        -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

    Register-ScheduledTask `
        -TaskName $updateTaskName `
        -Action $updateAction `
        -Trigger $updateTriggers `
        -Settings $updateSettings `
        -Principal $updatePrincipal `
        -Description "Installs new versions of the BookMyGame PC lock when the PC is idle." `
        -Force | Out-Null

    Write-Host "Auto-update is on - checks at startup and every 4 hours." -ForegroundColor Green
} else {
    Write-Host "update-agent.ps1 not found, so auto-update was not set up." -ForegroundColor Yellow
}

# --- Second way in, in case the task does not fire ---------------------------
#
# A shortcut in that account's Startup folder is the oldest and least clever way
# to start something at logon, and it does not depend on Task Scheduler being
# willing to run a task for another user. The task is still the important one -
# it is what restarts a killed agent - but if it is the part that is broken, this
# is what puts the lock on screen anyway.
#
# The folder only exists once the account has logged in at least once, since
# that is when Windows creates the profile.
$startupDir = "C:\Users\$GamingUser\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup"
if (Test-Path $startupDir) {
    try {
        $shell = New-Object -ComObject WScript.Shell
        $shortcut = $shell.CreateShortcut((Join-Path $startupDir "BookMyGame PC Lock.lnk"))
        $shortcut.TargetPath = $ExePath
        $shortcut.WorkingDirectory = Split-Path $ExePath -Parent
        $shortcut.Description = "Locks this gaming PC until BookMyGame confirms a paid session."
        $shortcut.Save()
        Write-Host "Also added a Startup shortcut for '$GamingUser'." -ForegroundColor Green
    } catch {
        Write-Host "Could not add the Startup shortcut: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "Not fatal - the scheduled task is the main mechanism." -ForegroundColor Yellow
    }
} else {
    Write-Host ""
    Write-Host "'$GamingUser' has never signed in, so there is no Startup folder yet." -ForegroundColor Yellow
    Write-Host "Sign in as them once, then run this script again to add the backup" -ForegroundColor Yellow
    Write-Host "shortcut. The scheduled task is already set up either way." -ForegroundColor Yellow
}

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
