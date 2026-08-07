#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Removes every trace of the PC lock from this machine.

.DESCRIPTION
    Use this to hand a PC back to normal - a test machine, someone's own
    computer, or a station being taken out of service.

    It undoes the lot: the startup task, the hidden taskbar, the Task Manager
    policy, the installed files, and optionally the customer Windows account.

    Safe to run more than once, and safe to run even if some parts were never
    installed.

.EXAMPLE
    .\remove-everything.ps1

.EXAMPLE
    # Also delete the customer Windows account
    .\remove-everything.ps1 -RemoveGamingUser GamingUser
#>
param(
    [string]$TaskName = "BookMyGame PC Lock Agent",
    [string]$InstallPath = "C:\BookMyGame",
    [string]$RemoveGamingUser = ""
)

Write-Host ""
Write-Host "Removing the PC lock" -ForegroundColor Cyan
Write-Host ""

# --- 1. Stop the agent -------------------------------------------------------

$running = Get-Process -Name "PcLockAgent" -ErrorAction SilentlyContinue
if ($running) {
    $running | Stop-Process -Force -ErrorAction SilentlyContinue
    Write-Host "  Stopped the running agent." -ForegroundColor Green
} else {
    Write-Host "  The agent was not running." -ForegroundColor DarkGray
}

# --- 2. Remove the startup task ----------------------------------------------
# Done before anything else that matters: while this exists the agent comes back
# within a minute, which would undo the rest of this script.

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "  Removed the startup task." -ForegroundColor Green
} else {
    Write-Host "  No startup task was installed." -ForegroundColor DarkGray
}

# --- 3. Re-enable Task Manager -----------------------------------------------
# The agent restores this on a clean exit, but a hard kill leaves it set.

$policyKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Policies\System"
if (Test-Path $policyKey) {
    Remove-ItemProperty -Path $policyKey -Name "DisableTaskMgr" -ErrorAction SilentlyContinue
    Write-Host "  Task Manager re-enabled." -ForegroundColor Green
}

# --- 4. Bring the taskbar back -----------------------------------------------
# Restarting Explorer is the reliable way: the taskbar is hidden by a window
# message, and a fresh Explorer simply starts visible.

Write-Host "  Restarting Explorer to restore the taskbar ..." -ForegroundColor Cyan
Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
if (-not (Get-Process -Name explorer -ErrorAction SilentlyContinue)) {
    Start-Process explorer.exe
}
Write-Host "  Taskbar restored." -ForegroundColor Green

# --- 5. Delete the files -----------------------------------------------------

if (Test-Path $InstallPath) {
    try {
        Remove-Item $InstallPath -Recurse -Force -ErrorAction Stop
        Write-Host "  Deleted $InstallPath." -ForegroundColor Green
    } catch {
        Write-Host "  Could not delete $InstallPath - $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "  Uninstall from Settings > Apps, or delete the folder by hand." -ForegroundColor Yellow
    }
} else {
    Write-Host "  Nothing installed at $InstallPath." -ForegroundColor DarkGray
}

# --- 6. Optionally remove the customer account -------------------------------
# Off by default: deleting an account takes its profile and files with it.

if ($RemoveGamingUser) {
    & net user $RemoveGamingUser /delete 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  Removed the Windows account '$RemoveGamingUser'." -ForegroundColor Green
    } else {
        Write-Host "  Could not remove '$RemoveGamingUser' (it may not exist)." -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Done. This PC is back to normal." -ForegroundColor Green
Write-Host ""
Write-Host "If it was set to log in automatically as a customer account, undo that too:" -ForegroundColor Cyan
Write-Host '  reg add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" /v AutoAdminLogon /t REG_SZ /d "0" /f'
Write-Host ""
