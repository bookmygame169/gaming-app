#Requires -Version 5.1
<#
.SYNOPSIS
    Updates the PC lock agent to the latest published version.

.DESCRIPTION
    Runs as SYSTEM on a schedule so cafe PCs pick up fixes without anyone
    visiting them. Installing by hand on every machine after every change does
    not scale past a few PCs, and the machines that most need a fix are the ones
    nobody has time to walk over to.

    The rule that matters is when it declines to run. Updating means replacing a
    running program, which means stopping it - and stopping the lock on a PC
    somebody is sitting at either interrupts a session they paid for or, worse,
    briefly hands them an unlocked desktop. So it updates only when the agent is
    not running at all, which on a cafe PC means between customers or after a
    reboot. A machine left signed in around the clock updates the next time it
    restarts, and that is the right trade: late is fine, unlocked is not.

.EXAMPLE
    .\update-agent.ps1

.EXAMPLE
    .\update-agent.ps1 -Force
#>
param(
    [string]$InstallPath = "C:\BookMyGame\PcLockAgent",

    # Fixed tag, so the URL never changes as versions come and go.
    [string]$ReleaseBase = "https://github.com/bookmygame169/gaming-app/releases/download/pc-lock-latest",

    # Installs even while the agent is running. For a machine you are standing
    # at - never for the scheduled run.
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$logDir = "C:\ProgramData\BookMyGame"
$logFile = Join-Path $logDir "update.log"

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $line = "{0} [{1}] {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Level, $Message
    Write-Host $line
    try {
        if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
        Add-Content -Path $logFile -Value $line -ErrorAction SilentlyContinue
    } catch {
        # Never let logging be the reason an update fails.
    }
}

<#
.SYNOPSIS
    Downloads a small text file and returns it as text.

.DESCRIPTION
    Written because PowerShell 5.1 does not always give you a string.
    Invoke-WebRequest hands back .Content as a byte array whenever the server
    declines to label the response as text - and GitHub serves every release
    asset as application/octet-stream. Calling .Trim() on that throws

        [System.Byte] does not contain a method named 'Trim'

    which is the line every café PC had been logging on every check, several
    times a day, since the day auto-update was switched on. Nothing was ever
    downloaded and nothing was ever installed; four machines drifted twenty
    versions behind while the log said, accurately, that it could not check.
#>
function Get-TextFromUrl {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [int]$TimeoutSec = 30
    )

    $body = (Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSec).Content

    if ($body -is [byte[]]) {
        $body = [System.Text.Encoding]::UTF8.GetString($body)
    }

    return "$body".Trim()
}

try {
    $exe = Join-Path $InstallPath "PcLockAgent.exe"
    if (-not (Test-Path $exe)) {
        Write-Log "No agent at $InstallPath - nothing to update." "WARN"
        exit 0
    }

    $installed = (Get-Item $exe).VersionInfo.FileVersion
    if (-not $installed) { $installed = "0.0.0" }
    # A file version is always four parts (1.3.0 is stored as 1.3.0.0), while
    # the published version is three. Compared as numbers so 1.10.0 is correctly
    # newer than 1.9.0 - as text it would not be.
    $installedVersion = [version]$installed

    # TLS 1.2 spelled out: Windows PowerShell 5.1 still defaults to older
    # protocols that GitHub refuses, and the failure looks like a network
    # problem rather than a settings one.
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    $versionUrl = "$ReleaseBase/version.txt"
    try {
        $latestText = Get-TextFromUrl -Url $versionUrl -TimeoutSec 30
    } catch {
        Write-Log "Could not check for updates: $($_.Exception.Message)" "WARN"
        exit 0
    }

    if ($latestText -notmatch '^\d+\.\d+\.\d+$') {
        Write-Log "Version file did not look like a version: '$latestText'" "WARN"
        exit 0
    }

    $latestVersion = [version]"$latestText.0"

    if ($latestVersion -le $installedVersion) {
        Write-Log "Up to date (installed $installedVersion, published $latestText)."
        exit 0
    }

    Write-Log "Update available: $installedVersion -> $latestText"

    # Belt and braces against a build whose version was not stamped. Such an exe
    # reports an old version however many times it is installed, so every check
    # would download and reinstall it - forever, on every PC. If this exact
    # version has already been installed once and the exe still reads older,
    # stop and say so rather than loop.
    $attemptFile = Join-Path $logDir "last-update-attempt.txt"
    if (Test-Path $attemptFile) {
        $lastAttempt = (Get-Content $attemptFile -Raw).Trim()
        if ($lastAttempt -eq $latestText) {
            Write-Log ("Already installed $latestText once and the agent still reports " +
                       "$installedVersion. Not trying again - that build's version was " +
                       "probably not stamped. Fix the build, publish a new version.") "ERROR"
            exit 1
        }
    }
    # An update somebody actually asked for.
    #
    # The rule below - never replace a running agent - is right, and on a cafe
    # PC it is also every time. These machines sign in automatically, so the
    # agent is back up within seconds of boot, long before this task gets to
    # look. Restarting the PC did not help, because the race is the same on the
    # way back up, and four machines sat a month behind because of it.
    #
    # So the agent leaves a note before it restarts to be updated, and a note
    # written in the last half hour is permission to stop it. It expires
    # because permission to interrupt somebody should not outlive the moment it
    # was given.
    $requested = $false
    $flags = @()

    try {
        $flags = @(Get-ChildItem "C:\Users\*\AppData\Local\BookMyGame\update-now.flag" -Force -ErrorAction SilentlyContinue)

        foreach ($flag in $flags) {
            $age = (Get-Date) - $flag.LastWriteTime
            if ($age.TotalMinutes -lt 30) {
                Write-Log ("Update was requested from the dashboard {0:0} minutes ago." -f $age.TotalMinutes)
                $requested = $true
            } else {
                Write-Log ("Ignoring an update request {0:0} minutes old." -f $age.TotalMinutes) "WARN"
            }
        }
    } catch {
        Write-Log "Could not check for an update request: $($_.Exception.Message)" "WARN"
    }

    $running = Get-Process -Name "PcLockAgent" -ErrorAction SilentlyContinue
    if ($running -and -not $Force -and -not $requested) {
        Write-Log "Agent is running, so somebody may be at this PC. Leaving it for now." "WARN"
        exit 0
    }

    # Recorded here rather than the moment an update was spotted. Written
    # earlier, it counted the runs that noticed a new version and then stood
    # down because the agent was up - which is most of them - so the guard above
    # would refuse the very next attempt, including the one somebody asked for
    # from the dashboard. It marks an install being attempted, not a version
    # being seen.
    Set-Content -Path $attemptFile -Value $latestText -ErrorAction SilentlyContinue

    $temp = Join-Path $env:TEMP "BookMyGame-PC-Lock-Setup-$latestText.exe"
    Write-Log "Downloading $ReleaseBase/BookMyGame-PC-Lock-Setup.exe"
    Invoke-WebRequest -Uri "$ReleaseBase/BookMyGame-PC-Lock-Setup.exe" `
        -OutFile $temp -UseBasicParsing -TimeoutSec 600

    $sizeMb = [math]::Round((Get-Item $temp).Length / 1MB, 1)
    if ($sizeMb -lt 5) {
        # A few KB here means an error page was saved instead of the installer.
        Write-Log "Downloaded file is only $sizeMb MB - that is not the installer. Stopping." "ERROR"
        Remove-Item $temp -Force -ErrorAction SilentlyContinue
        exit 1
    }
    Write-Log "Downloaded $sizeMb MB."

    # This script runs the file it just downloaded, with administrator rights,
    # unattended, on every cafe PC. Checking it against the hash the build
    # published is what makes that something other than "run whatever arrives".
    # A missing hash file is not treated as a pass.
    $expectedHash = $null
    try {
        $expectedHash = (Get-TextFromUrl -Url "$ReleaseBase/setup.sha256" -TimeoutSec 60).ToLowerInvariant()
    } catch {
        Write-Log "Could not fetch setup.sha256: $_" "ERROR"
    }

    if (-not $expectedHash -or $expectedHash -notmatch '^[0-9a-f]{64}$') {
        Write-Log "No usable SHA-256 published for this release. Refusing to install." "ERROR"
        Remove-Item $temp -Force -ErrorAction SilentlyContinue
        exit 1
    }

    $actualHash = (Get-FileHash $temp -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne $expectedHash) {
        Write-Log "Hash mismatch - refusing to install." "ERROR"
        Write-Log "  expected $expectedHash" "ERROR"
        Write-Log "  actual   $actualHash" "ERROR"
        Remove-Item $temp -Force -ErrorAction SilentlyContinue
        exit 1
    }

    Write-Log "Hash verified."

    if ($running -and ($Force -or $requested)) {
        $why = if ($Force) { "-Force was given" } else { "the owner asked for this update" }
        Write-Log "Stopping the running agent because $why." "WARN"
        $running | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 3
    }

    # VERYSILENT because nobody is watching, SUPPRESSMSGBOXES so a prompt cannot
    # wedge it forever, NORESTART because deciding to reboot a cafe PC is not
    # this script's call.
    Write-Log "Installing..."
    $process = Start-Process -FilePath $temp `
        -ArgumentList "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART" `
        -Wait -PassThru

    if ($process.ExitCode -ne 0) {
        Write-Log "Installer exited with code $($process.ExitCode)." "ERROR"
        exit 1
    }

    $nowInstalled = (Get-Item $exe).VersionInfo.FileVersion
    Write-Log "Updated to $nowInstalled."

    if ([version]$nowInstalled -ge $latestVersion) {
        # Clean slate: the next new version starts without an attempt recorded
        # against it.
        Remove-Item $attemptFile -Force -ErrorAction SilentlyContinue
    }

    Remove-Item $temp -Force -ErrorAction SilentlyContinue

    # Answered, so the note goes. Leaving it would have the next boot stop a
    # perfectly current agent for no reason.
    foreach ($flag in $flags) {
        Remove-Item $flag.FullName -Force -ErrorAction SilentlyContinue
    }

    # The watchdog task starts it again within a minute, so it is deliberately
    # not started here. Two reasons: doing both is how two agents end up
    # fighting over the same screen, and this script runs as SYSTEM - a process
    # it started would land in session 0, where the customer would never see it.
    Write-Log "Done. The startup task will bring the agent back up."
    exit 0
} catch {
    Write-Log "Update failed: $($_.Exception.Message)" "ERROR"
    exit 1
}
