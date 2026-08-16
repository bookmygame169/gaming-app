#Requires -Version 5.1
<#
.SYNOPSIS
    Explains why a game is missing from the lock screen menu.

.DESCRIPTION
    The agent already writes down what it found and, for everything it threw
    away, which rule threw it away. Guessing at that from a photograph of the
    menu has been wrong more than once; this reads the answer out of the log.

    Run it on the café PC as an administrator, from the account that has the
    games. It reads every account's log, not just this one.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File why-not-showing.ps1

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File why-not-showing.ps1 -Name "Rocket League"
#>
param(
    [string]$Name
)

$ErrorActionPreference = "Continue"

function Write-Heading {
    param([string]$Text)
    Write-Host ""
    Write-Host $Text -ForegroundColor Cyan
    Write-Host ("-" * $Text.Length) -ForegroundColor DarkGray
}

# The agent logs under each user's own AppData, so the lock account's log is
# not the one belonging to whoever is reading this.
$logs = @()
Get-ChildItem "C:\Users" -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    $candidate = Join-Path $_.FullName "AppData\Local\BookMyGame\agent.log"
    if (Test-Path -LiteralPath $candidate) {
        $logs += [PSCustomObject]@{ User = $_.Name; Path = $candidate }
    }
}

if ($logs.Count -eq 0) {
    Write-Host "No agent log found." -ForegroundColor Red
    Write-Host "The agent has not run yet on this PC, or it was installed for a user that has since been removed."
    exit 1
}

foreach ($log in $logs) {
    Write-Heading "Account: $($log.User)"
    Write-Host "Log: $($log.Path)" -ForegroundColor DarkGray

    $lines = Get-Content -LiteralPath $log.Path -ErrorAction SilentlyContinue
    if (-not $lines) {
        Write-Host "  (log is empty)" -ForegroundColor Yellow
        continue
    }

    # Only the most recent scan matters. Anything earlier describes a menu that
    # has already been replaced.
    $starts = @()
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match "Looking for installed games") { $starts += $i }
    }

    if ($starts.Count -eq 0) {
        Write-Host "  This account has never scanned for games." -ForegroundColor Yellow
        Write-Host "  That is normal for an account the agent does not lock."
        continue
    }

    $lastRun = $lines[$starts[-1]..($lines.Count - 1)]

    Write-Host ""
    Write-Host "  Where it looked, and how many it found there:" -ForegroundColor White
    $lastRun | Where-Object { $_ -match "^\s*\S+\s+\S+\s+  (.+): (\d+)$" -or $_ -match "  (machine-wide list|Steam|Steam folders|Epic|Xbox|Riot|Roblox|desktops|Start Menus)" } |
        ForEach-Object { Write-Host "    $($_ -replace '^.*?  ', '')" }

    $found = $lastRun | Where-Object { $_ -match "Games: " } | Select-Object -Last 1
    $apps = $lastRun | Where-Object { $_ -match "Apps: " } | Select-Object -Last 1

    if ($found) {
        Write-Host ""
        Write-Host "  On the menu as games:" -ForegroundColor White
        Write-Host "    $(($found -split 'Games: ')[-1])"
    }
    if ($apps) {
        Write-Host ""
        Write-Host "  On the menu as apps:" -ForegroundColor White
        Write-Host "    $(($apps -split 'Apps: ')[-1])"
    }

    $skipped = $lastRun | Where-Object { $_ -match "Skipped '" }

    if ($Name) {
        Write-Host ""
        Write-Host "  Anything mentioning '$Name':" -ForegroundColor White
        $hits = $lastRun | Where-Object { $_ -like "*$Name*" }
        if ($hits) {
            $hits | ForEach-Object { Write-Host "    $_" -ForegroundColor Yellow }
        } else {
            Write-Host "    Nothing. The scan never saw it at all — so it is not a" -ForegroundColor Yellow
            Write-Host "    filtering problem, it is that none of the places the agent" -ForegroundColor Yellow
            Write-Host "    looks contains it. Send this whole output over." -ForegroundColor Yellow
        }
    } elseif ($skipped) {
        Write-Host ""
        Write-Host "  Thrown away, and why:" -ForegroundColor White
        $skipped | Select-Object -Last 40 | ForEach-Object {
            Write-Host "    $($_ -replace '^.*?Skipped ', '')" -ForegroundColor DarkYellow
        }
        if ($skipped.Count -gt 40) {
            Write-Host "    … and $($skipped.Count - 40) more." -ForegroundColor DarkGray
        }
    }
}

# The shared list is how the locked account sees games installed by the admin.
Write-Heading "Machine-wide list (what the locked account can reach)"
$shared = "C:\ProgramData\BookMyGame\installed-games.json"
if (Test-Path -LiteralPath $shared) {
    $age = (Get-Date) - (Get-Item $shared).LastWriteTime
    Write-Host "  Written $([int]$age.TotalHours) hour(s) ago."
    try {
        $entries = Get-Content -LiteralPath $shared -Raw | ConvertFrom-Json
        Write-Host "  Contains $($entries.Count) entries:"
        $entries | ForEach-Object { Write-Host "    $($_.name)" }
    } catch {
        Write-Host "  Could not read it: $_" -ForegroundColor Red
    }
} else {
    Write-Host "  MISSING." -ForegroundColor Red
    Write-Host "  This is the file that lets the locked gaming account see games"
    Write-Host "  installed under the admin account. Without it that account only"
    Write-Host "  sees games installed for everyone."
    Write-Host ""
    Write-Host "  Fix: run install-startup.ps1 as administrator." -ForegroundColor Yellow
}

Write-Host ""
