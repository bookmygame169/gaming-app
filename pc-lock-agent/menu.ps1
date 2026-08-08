<#
.SYNOPSIS
    One menu for everything you do on a Windows machine with the PC lock.

.DESCRIPTION
    Exists so nothing has to be copied between computers. Every task is a number
    to type rather than a long command to retype from a chat window on another
    machine.

    Right-click this file and choose "Run with PowerShell", or run it from any
    terminal. It asks for administrator rights itself when a task needs them.

.NOTES
    Safe to run from anywhere - it works out where it lives.
#>

$ErrorActionPreference = "Stop"

$agentRoot  = $PSScriptRoot
$toolsDir   = Join-Path $agentRoot "tools"
$installDir = "C:\BookMyGame\PcLockAgent"

function Test-IsAdmin {
    $identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

<#
    Relaunches this menu elevated, landing back on the same choice.

    Admin is asked for per task rather than up front, because most tasks do not
    need it and a UAC prompt just to read a log is friction for nothing.
#>
function Invoke-Elevated {
    param([Parameter(Mandatory = $true)][string]$ScriptPath, [string]$Arguments = "")

    $command = "& '$ScriptPath' $Arguments"
    Start-Process -Verb RunAs -FilePath "powershell.exe" `
        -ArgumentList "-ExecutionPolicy Bypass -NoProfile -NoExit -Command `"$command`""
}

function Show-Header {
    Clear-Host
    Write-Host ""
    Write-Host "  BookMyGame PC Lock" -ForegroundColor Cyan
    Write-Host "  ------------------" -ForegroundColor DarkGray
    Write-Host ""

    if (Test-Path (Join-Path $installDir "PcLockAgent.exe")) {
        Write-Host "  Installed on this PC: yes" -ForegroundColor Green
    } else {
        Write-Host "  Installed on this PC: no" -ForegroundColor DarkGray
    }

    $task = Get-ScheduledTask -TaskName "BookMyGame PC Lock Agent" -ErrorAction SilentlyContinue
    if ($task) {
        Write-Host "  Starts automatically: yes" -ForegroundColor Green
    } else {
        Write-Host "  Starts automatically: no" -ForegroundColor DarkGray
    }

    if (Get-Process -Name "PcLockAgent" -ErrorAction SilentlyContinue) {
        Write-Host "  Running right now:    yes" -ForegroundColor Green
    } else {
        Write-Host "  Running right now:    no" -ForegroundColor DarkGray
    }

    Write-Host ""
}

function Show-Menu {
    Show-Header
    Write-Host "  1  Run the lock app now (for testing)"
    Write-Host "  2  Build the installer"
    Write-Host "  3  Remove the lock from this PC          (admin)"
    Write-Host "  4  Show the app's log"
    Write-Host "  5  Show the install log"
    Write-Host "  6  Get the latest code"
    Write-Host ""
    Write-Host "  Q  Quit"
    Write-Host ""
}

function Wait-ForKey {
    Write-Host ""
    Write-Host "  Press any key to go back..." -ForegroundColor DarkGray
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

function Invoke-RunAgent {
    Write-Host ""
    Write-Host "  Starting the lock app." -ForegroundColor Cyan
    Write-Host "  To get out:  Ctrl+Shift+Alt+Q" -ForegroundColor Yellow
    Write-Host "  To unlock the keyboard without quitting:  Ctrl+Shift+Alt+L" -ForegroundColor Yellow
    Write-Host ""
    Start-Sleep -Seconds 2

    $project = Join-Path $agentRoot "PcLockAgent"
    if (Test-Path $project) {
        dotnet run --project $project
    } elseif (Test-Path (Join-Path $installDir "PcLockAgent.exe")) {
        & (Join-Path $installDir "PcLockAgent.exe")
    } else {
        Write-Host "  Nothing to run - no source folder and nothing installed." -ForegroundColor Red
    }

    Wait-ForKey
}

function Invoke-BuildInstaller {
    Write-Host ""
    & (Join-Path $toolsDir "build-installer.ps1")
    Wait-ForKey
}

function Invoke-RemoveLock {
    if (-not (Test-IsAdmin)) {
        Write-Host ""
        Write-Host "  This needs administrator rights. Approve the prompt that appears." -ForegroundColor Yellow
        Invoke-Elevated -ScriptPath (Join-Path $toolsDir "remove-everything.ps1")
        Write-Host "  Opened an administrator window - watch that one." -ForegroundColor Cyan
        Wait-ForKey
        return
    }

    & (Join-Path $toolsDir "remove-everything.ps1")
    Wait-ForKey
}

<#
    The log lives beside whichever copy ran: the installed one, or the build
    output when running from source. Newest wins, since that is the run being
    asked about.
#>
function Show-Log {
    param([string]$FileName, [string]$Description)

    $candidates = @(
        (Join-Path $installDir $FileName),
        (Join-Path $agentRoot "PcLockAgent\bin\Debug\net8.0-windows\$FileName")
    ) | Where-Object { Test-Path $_ }

    if (-not $candidates) {
        Write-Host ""
        Write-Host "  No $Description found yet." -ForegroundColor Yellow
        Write-Host "  Looked in:" -ForegroundColor DarkGray
        Write-Host "    $installDir" -ForegroundColor DarkGray
        Write-Host "    $agentRoot\PcLockAgent\bin\Debug\net8.0-windows" -ForegroundColor DarkGray
        Wait-ForKey
        return
    }

    $newest = $candidates | Sort-Object { (Get-Item $_).LastWriteTime } -Descending | Select-Object -First 1

    Write-Host ""
    Write-Host "  $newest" -ForegroundColor DarkGray
    Write-Host ""
    Get-Content $newest -Tail 40
    Wait-ForKey
}

function Invoke-Update {
    Write-Host ""
    $repoRoot = Split-Path $agentRoot -Parent
    Push-Location $repoRoot
    try {
        git pull origin main
    } finally {
        Pop-Location
    }
    Wait-ForKey
}

while ($true) {
    Show-Menu
    $choice = Read-Host "  Choose"

    switch ($choice.Trim().ToUpper()) {
        "1" { Invoke-RunAgent }
        "2" { Invoke-BuildInstaller }
        "3" { Invoke-RemoveLock }
        "4" { Show-Log -FileName "agent.log" -Description "app log" }
        "5" { Show-Log -FileName "install-log.txt" -Description "install log" }
        "6" { Invoke-Update }
        "Q" { Write-Host ""; return }
        default {
            Write-Host "  Not an option." -ForegroundColor Yellow
            Start-Sleep -Seconds 1
        }
    }
}
