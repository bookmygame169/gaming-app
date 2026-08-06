#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Removes the PC lock agent's startup task.

.DESCRIPTION
    Stops the agent restarting itself, so the PC goes back to normal Windows
    behaviour. Use this when taking a machine out of service or moving it.

    Note this does not close a running agent — do that first, or the watchdog
    may start one more time before the task is removed.
#>
param(
    [string]$TaskName = "BookMyGame PC Lock Agent"
)

$ErrorActionPreference = "Stop"

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) {
    Write-Host "No task named '$TaskName' is installed. Nothing to do." -ForegroundColor Yellow
    exit 0
}

Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false

Write-Host "Removed '$TaskName'." -ForegroundColor Green
Write-Host ""
Write-Host "If a lock screen is still on screen, close it with Ctrl+Shift+Alt+Q" -ForegroundColor Cyan
Write-Host "(dev builds only) or end PcLockAgent.exe from Task Manager." -ForegroundColor Cyan
Write-Host ""
Write-Host "If the taskbar is missing afterwards, restart Explorer:" -ForegroundColor Cyan
Write-Host "  taskkill /f /im explorer.exe; start explorer.exe"
Write-Host ""
