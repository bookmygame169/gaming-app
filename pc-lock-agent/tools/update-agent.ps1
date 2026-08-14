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
        $latestText = (Invoke-WebRequest -Uri $versionUrl -UseBasicParsing -TimeoutSec 30).Content.Trim()
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

    $running = Get-Process -Name "PcLockAgent" -ErrorAction SilentlyContinue
    if ($running -and -not $Force) {
        Write-Log "Agent is running, so somebody may be at this PC. Leaving it for now." "WARN"
        exit 0
    }

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

    if ($running -and $Force) {
        Write-Log "Stopping the running agent because -Force was given." "WARN"
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

    Remove-Item $temp -Force -ErrorAction SilentlyContinue

    # The watchdog task starts it again within a minute, so it is deliberately
    # not started here: doing both is how two agents end up fighting over the
    # same screen.
    Write-Log "Done. The startup task will bring the agent back up."
    exit 0
} catch {
    Write-Log "Update failed: $($_.Exception.Message)" "ERROR"
    exit 1
}
