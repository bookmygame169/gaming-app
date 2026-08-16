#Requires -Version 5.1
<#
.SYNOPSIS
    Checks whether the PC lock is set up correctly on the customer account.

.DESCRIPTION
    Run this on your own administrator account. It reports on the CUSTOMER
    account without you having to sign in as them.

    That is the whole point. The customer account is the one that matters and
    the one you cannot easily inspect: sign in there and the lock covers the
    screen, so there is nowhere to run a script or read a file from.

    Every check prints what it looked at, so a failure tells you where to go
    next instead of just saying no.

.EXAMPLE
    .\check-setup.ps1

.EXAMPLE
    .\check-setup.ps1 -GamingUser GamingUser
#>
param(
    [string]$GamingUser = "GamingUser",
    [string]$InstallPath = "C:\BookMyGame\PcLockAgent",
    [string]$TaskName = "BookMyGame PC Lock Agent"
)

$ErrorActionPreference = "Continue"

$script:Problems = @()
$script:Warnings = @()

function Write-Head {
    param([string]$Text)
    Write-Host ""
    Write-Host "  $Text" -ForegroundColor Cyan
    Write-Host "  $('-' * $Text.Length)" -ForegroundColor DarkGray
}

function Write-Good {
    param([string]$Text, [string]$Detail = "")
    Write-Host "  [ OK ] $Text" -ForegroundColor Green
    if ($Detail) { Write-Host "         $Detail" -ForegroundColor DarkGray }
}

function Write-Bad {
    param([string]$Text, [string]$Fix = "")
    Write-Host "  [FAIL] $Text" -ForegroundColor Red
    if ($Fix) { Write-Host "         $Fix" -ForegroundColor Yellow }
    $script:Problems += $Text
}

function Write-Warn {
    param([string]$Text, [string]$Detail = "")
    Write-Host "  [ ?? ] $Text" -ForegroundColor Yellow
    if ($Detail) { Write-Host "         $Detail" -ForegroundColor DarkGray }
    $script:Warnings += $Text
}

$isAdmin = ([Security.Principal.WindowsPrincipal] `
    [Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

Write-Host ""
Write-Host "  BookMyGame PC Lock - setup check" -ForegroundColor White
Write-Host "  Customer account: $GamingUser" -ForegroundColor DarkGray
Write-Host "  Install folder:   $InstallPath" -ForegroundColor DarkGray

if (-not $isAdmin) {
    Write-Host ""
    Write-Host "  Not running as administrator - some checks will be skipped." -ForegroundColor Yellow
    Write-Host "  Right-click PowerShell and Run as administrator for the full report." -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
Write-Head "1. Is the agent installed"

$exe = Join-Path $InstallPath "PcLockAgent.exe"
if (Test-Path $exe) {
    $item = Get-Item $exe
    Write-Good "PcLockAgent.exe is there" "$([math]::Round($item.Length / 1MB, 1)) MB, built $($item.LastWriteTime)"
} else {
    Write-Bad "No PcLockAgent.exe at $InstallPath" "Run the installer, or pass -InstallPath if you installed it elsewhere."
}

# ---------------------------------------------------------------------------
Write-Head "2. Has this PC been linked to your cafe"

# Enrollment writes appsettings.Local.json next to the exe. It is shared by
# every account on purpose, so redeeming the setup code once as administrator
# is meant to leave the customer account already linked.
$localSettings = Join-Path $InstallPath "appsettings.Local.json"
if (Test-Path $localSettings) {
    Write-Good "Setup code has been redeemed" $localSettings
    try {
        $cfg = Get-Content $localSettings -Raw | ConvertFrom-Json
        if ($cfg.stationId) { Write-Host "         Station: $($cfg.stationId)" -ForegroundColor DarkGray }
    } catch {
        Write-Warn "appsettings.Local.json is not readable as JSON" $_.Exception.Message
    }
} else {
    Write-Bad "This PC has not been linked yet" "Run PcLockAgent.exe once and enter the setup code from the dashboard."
}

# ---------------------------------------------------------------------------
Write-Head "3. Does the customer account exist"

$null = & net user $GamingUser 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Good "Windows account '$GamingUser' exists"

    # A customer on an administrator account can close the agent, change its
    # settings, or install whatever they like - the lock is decoration at that
    # point. Worth flagging loudly rather than reporting a clean pass.
    $admins = & net localgroup Administrators 2>&1
    if ($admins -match "(^|\s)$([regex]::Escape($GamingUser))\s*$") {
        Write-Bad "'$GamingUser' is an ADMINISTRATOR" "Customers must be a standard user: net localgroup Administrators $GamingUser /delete"
    } else {
        Write-Good "'$GamingUser' is a standard user, not an administrator"
    }
} else {
    Write-Bad "There is no Windows account called '$GamingUser'" "net user $GamingUser /add   then   net localgroup Users $GamingUser /add"
}

# ---------------------------------------------------------------------------
Write-Head "4. Will it start on its own"

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($null -eq $task) {
    Write-Bad "The startup task '$TaskName' is not registered" "Run install-startup.ps1 as administrator."
} else {
    Write-Good "Startup task is registered"

    $principal = $task.Principal.UserId
    if ($principal -and $principal -match [regex]::Escape($GamingUser)) {
        Write-Good "It runs as '$principal'"
    } else {
        Write-Bad "It runs as '$principal', not '$GamingUser'" "Re-run install-startup.ps1 -GamingUser $GamingUser"
    }

    $triggerTypes = $task.Triggers | ForEach-Object { $_.CimClass.CimClassName }
    if ($triggerTypes -contains "MSFT_TaskLogonTrigger") {
        Write-Good "Starts when that account logs on"
    } else {
        Write-Bad "No logon trigger" "The agent will not start when the customer signs in. Re-run install-startup.ps1."
    }

    $hasWatchdog = $false
    foreach ($t in $task.Triggers) {
        if ($t.Repetition -and $t.Repetition.Interval) { $hasWatchdog = $true }
    }

    # The schtasks.exe fallback cannot put two triggers on one task, so on a
    # machine that took that route the watchdog is a task of its own.
    if (-not $hasWatchdog -and
        (Get-ScheduledTask -TaskName "BookMyGame PC Lock Watchdog" -ErrorAction SilentlyContinue)) {
        $hasWatchdog = $true
        Write-Host "         (as a separate 'BookMyGame PC Lock Watchdog' task)" -ForegroundColor DarkGray
    }
    if ($hasWatchdog) {
        Write-Good "Watchdog is on - restarts within a minute if closed"
    } else {
        Write-Warn "No repeating watchdog trigger" "Closing the agent would leave the PC unlocked until the next logon."
    }

    $info = Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($info) {
        if ($info.LastRunTime -and $info.LastRunTime.Year -gt 1999) {
            $result = if ($info.LastTaskResult -eq 0) { "success" } else { "code $($info.LastTaskResult)" }
            Write-Good "Last started $($info.LastRunTime) ($result)"
        } else {
            Write-Warn "It has never run yet" "Sign in as '$GamingUser' once, or run: Start-ScheduledTask -TaskName '$TaskName'"
        }
    }
}

$startupLnk = "C:\Users\$GamingUser\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\BookMyGame PC Lock.lnk"
if (Test-Path $startupLnk) {
    Write-Good "Backup Startup shortcut is in place"
} else {
    Write-Warn "No backup Startup shortcut for '$GamingUser'" "Re-run install-startup.ps1 after that account has signed in once."
}

$updateTask = Get-ScheduledTask -TaskName "BookMyGame PC Lock Update" -ErrorAction SilentlyContinue
if ($updateTask) {
    Write-Good "Auto-update is set up" "Runs as SYSTEM at startup and every 4 hours."
    $uInfo = Get-ScheduledTaskInfo -TaskName "BookMyGame PC Lock Update" -ErrorAction SilentlyContinue
    if ($uInfo -and $uInfo.LastRunTime -and $uInfo.LastRunTime.Year -gt 1999) {
        Write-Host "         Last checked $($uInfo.LastRunTime)" -ForegroundColor DarkGray
    }
    $updateLog = "C:\ProgramData\BookMyGame\update.log"
    if (Test-Path $updateLog) {
        Get-Content $updateLog -Tail 3 | ForEach-Object { Write-Host "         $_" -ForegroundColor DarkGray }
    }
} else {
    Write-Warn "Auto-update is not set up" "Re-run install-startup.ps1 to add it."
}

$refreshTask = Get-ScheduledTask -TaskName "BookMyGame Game List" -ErrorAction SilentlyContinue
$gamesFile = "C:\ProgramData\BookMyGame\installed-games.json"

if (-not $refreshTask) {
    Write-Warn "The game list scan is not set up" "Re-run install-startup.ps1. Without it the menu shows only games shared between accounts."
} elseif (Test-Path $gamesFile) {
    try {
        $found = @(Get-Content $gamesFile -Raw | ConvertFrom-Json)
        $age = [int]((Get-Date) - (Get-Item $gamesFile).LastWriteTime).TotalMinutes
        Write-Good "Game list scan found $($found.Count) game(s)" "Updated $age minute(s) ago"
    } catch {
        Write-Warn "installed-games.json is not readable as JSON" $_.Exception.Message
    }
} else {
    Write-Warn "The scan has not written a game list yet" "Run: Start-ScheduledTask -TaskName 'BookMyGame Game List'"
}

# ---------------------------------------------------------------------------
Write-Head "5. Is it running right now"

$running = Get-Process -Name "PcLockAgent" -ErrorAction SilentlyContinue

# More than one is the thing to shout about. Two agents share a broker client
# id, MQTT requires that to be unique, so they knock each other offline every
# few seconds and the lock screen flickers between connected and offline.
if ($running -and @($running).Count -gt 1) {
    Write-Bad "$(@($running).Count) copies of the agent are running" "They will fight over the broker. Newer builds refuse to start a second copy - update, then reboot."
}

if ($running) {
    foreach ($p in $running) {
        $owner = "unknown"
        if ($isAdmin) {
            try {
                $procInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $($p.Id)" -ErrorAction Stop
                $ownerInfo = Invoke-CimMethod -InputObject $procInfo -MethodName GetOwner -ErrorAction Stop
                if ($ownerInfo.User) { $owner = $ownerInfo.User }
            } catch {
                # Not fatal - the process being up is the useful part.
            }
        }
        Write-Good "Running (process $($p.Id), account: $owner)"
    }
} else {
    Write-Warn "Not running on this machine at the moment" "Normal if nobody is signed in as '$GamingUser'."
}

# ---------------------------------------------------------------------------
Write-Head "6. Can the customer account write its own files"

# The install folder must stay read-only for customers, or they could swap the
# exe or edit the settings that hold the broker password. Everything the agent
# writes goes to that account's own AppData instead.
$customerData = "C:\Users\$GamingUser\AppData\Local\BookMyGame"
if (Test-Path $customerData) {
    Write-Good "Customer data folder exists" $customerData
    foreach ($name in @("agent.log", "session.json", "games-cache.json")) {
        $f = Join-Path $customerData $name
        if (Test-Path $f) {
            $fi = Get-Item $f
            Write-Host "         $name - $($fi.Length) bytes, last written $($fi.LastWriteTime)" -ForegroundColor DarkGray
        }
    }
} else {
    Write-Warn "No data folder for '$GamingUser' yet" "It is created the first time the agent runs on that account."
}

if (Test-Path $InstallPath) {
    $writable = $false
    try {
        $acl = Get-Acl $InstallPath
        foreach ($rule in $acl.Access) {
            if ($rule.IdentityReference.Value -match [regex]::Escape($GamingUser) -and
                $rule.AccessControlType -eq "Allow" -and
                ($rule.FileSystemRights -match "Write|Modify|FullControl")) {
                $writable = $true
            }
        }
    } catch {
        Write-Warn "Could not read permissions on $InstallPath" $_.Exception.Message
    }

    if ($writable) {
        Write-Bad "'$GamingUser' can write to the install folder" "A customer could replace the agent or read/edit its settings. Remove that permission."
    } else {
        Write-Good "Install folder is read-only for '$GamingUser'"
    }
}

# ---------------------------------------------------------------------------
Write-Head "7. What the customer account's log says"

$customerLog = Join-Path $customerData "agent.log"
if (Test-Path $customerLog) {
    Write-Host ""
    Get-Content $customerLog -Tail 20 | ForEach-Object {
        $colour = "Gray"
        if ($_ -match "\[ERROR\]") { $colour = "Red" }
        elseif ($_ -match "\[WARN\]") { $colour = "Yellow" }
        Write-Host "    $_" -ForegroundColor $colour
    }

    $text = Get-Content $customerLog -Raw
    if ($text -match "AllowDevExit") {
        Write-Bad "The developer exit chord is still enabled" "Set AllowDevExit to false in AgentSettings.cs and rebuild before customers use this PC."
    }
} else {
    Write-Warn "No log for '$GamingUser' yet" "The agent has not run on that account. Sign in as them once."
}

# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "  ============================================" -ForegroundColor White

if ($script:Problems.Count -eq 0 -and $script:Warnings.Count -eq 0) {
    Write-Host "  Everything checks out." -ForegroundColor Green
    Write-Host "  Sign in as '$GamingUser' and the lock screen should appear." -ForegroundColor Green
} elseif ($script:Problems.Count -eq 0) {
    Write-Host "  No problems, $($script:Warnings.Count) thing(s) worth a look:" -ForegroundColor Yellow
    foreach ($w in $script:Warnings) { Write-Host "    - $w" -ForegroundColor Yellow }
} else {
    Write-Host "  $($script:Problems.Count) problem(s) to fix:" -ForegroundColor Red
    foreach ($p in $script:Problems) { Write-Host "    - $p" -ForegroundColor Red }
    if ($script:Warnings.Count -gt 0) {
        Write-Host "  And $($script:Warnings.Count) worth a look:" -ForegroundColor Yellow
        foreach ($w in $script:Warnings) { Write-Host "    - $w" -ForegroundColor Yellow }
    }
}

Write-Host "  ============================================" -ForegroundColor White
Write-Host ""
Write-Host "  To try it without rebooting:" -ForegroundColor Cyan
Write-Host "    Start-ScheduledTask -TaskName '$TaskName'"
Write-Host ""
Write-Host "  Then switch user (Win+L) and sign in as '$GamingUser'." -ForegroundColor Cyan
Write-Host ""
