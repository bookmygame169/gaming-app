#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Sets up one gaming PC end to end: config file, published build, startup task.

.DESCRIPTION
    Run this once on each machine, changing only -StationId. Everything else
    stays the same across the café.

    It writes appsettings.Local.json (which git ignores, so credentials never
    reach the repo), publishes a Release build, and registers the startup task
    so the agent runs at logon and restarts if closed.

.EXAMPLE
    # On the first PC
    .\setup-station.ps1 -StationId pc-01 `
        -BrokerHost "abc123.s1.eu.hivemq.cloud" `
        -BrokerUsername "station" `
        -BrokerPassword "your-password" `
        -HeartbeatUrl "https://www.bookmygame.co.in/api/stations/heartbeat" `
        -HeartbeatToken "your-token" `
        -CafeId "your-cafe-id"

.EXAMPLE
    # On the second PC — identical except the station id
    .\setup-station.ps1 -StationId pc-02 -BrokerHost "..." -BrokerUsername "station" ...

.NOTES
    Keep this command somewhere safe (a note on your phone, a text file on a USB
    stick) so each PC is set up identically. Do not commit it with real values
    filled in — the repo is public.
#>
param(
    [Parameter(Mandatory = $true)][string]$StationId,
    [Parameter(Mandatory = $true)][string]$BrokerHost,
    [Parameter(Mandatory = $true)][string]$BrokerUsername,
    [Parameter(Mandatory = $true)][string]$BrokerPassword,

    [string]$HeartbeatUrl = "",
    [string]$HeartbeatToken = "",
    [string]$CafeId = "",

    [int]$BrokerPort = 8883,
    [string]$InstallPath = "C:\BookMyGame\PcLockAgent",

    # The account customers use. The agent runs only for this one, so your admin
    # account keeps a normal unlocked Windows and the PC stays administrable.
    [string]$GamingUser = "GamingUser",

    [switch]$SkipStartupTask,

    # For PCs where you copied an already-built folder instead of cloning the
    # repo. Only the config and the startup task are set up.
    [switch]$SkipBuild,

    # Builds a smaller folder that needs the .NET 8 Desktop Runtime installed on
    # the machine. The default bundles the runtime, so a café PC needs nothing
    # installed at all — worth the extra size when copying to several machines.
    [switch]$FrameworkDependent
)

$ErrorActionPreference = "Stop"

# Station ids are lower case everywhere: bookings store them that way and MQTT
# topics are case-sensitive, so "PC-01" would silently never receive commands.
$StationId = $StationId.ToLowerInvariant()

$projectDir = Join-Path (Split-Path $PSScriptRoot -Parent) "PcLockAgent"

if (-not $SkipBuild -and -not (Test-Path $projectDir)) {
    Write-Host "Could not find the project at $projectDir" -ForegroundColor Red
    Write-Host ""
    Write-Host "Either run this from the pc-lock-agent\tools folder of the repo," -ForegroundColor Yellow
    Write-Host "or pass -SkipBuild if you copied an already-built folder to this PC." -ForegroundColor Yellow
    exit 1
}

if ($SkipBuild -and -not (Test-Path (Join-Path $InstallPath "PcLockAgent.exe"))) {
    Write-Host "-SkipBuild was given, but there is no PcLockAgent.exe at $InstallPath" -ForegroundColor Red
    Write-Host ""
    Write-Host "Copy the built folder there first, then run this again." -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Setting up station: $StationId" -ForegroundColor Cyan
Write-Host ""

# --- 1. Config ---------------------------------------------------------------

$config = [ordered]@{
    stationId = $StationId
    mqtt      = [ordered]@{
        host     = $BrokerHost
        port     = $BrokerPort
        useTls   = ($BrokerPort -ne 1883)
        username = $BrokerUsername
        password = $BrokerPassword
    }
}

if ($HeartbeatUrl -and $HeartbeatToken -and $CafeId) {
    $config.heartbeat = [ordered]@{
        url    = $HeartbeatUrl
        token  = $HeartbeatToken
        cafeId = $CafeId
    }
} else {
    Write-Host "No heartbeat details given — this PC will not appear on the dashboard's" -ForegroundColor Yellow
    Write-Host "live status list. Locking and unlocking still work." -ForegroundColor Yellow
    Write-Host ""
}

$configJson = $config | ConvertTo-Json -Depth 5

# Written to the source folder too when it exists, so running from the repo with
# `dotnet run` picks up the same settings.
if (Test-Path $projectDir) {
    $configJson | Set-Content -Encoding UTF8 (Join-Path $projectDir "appsettings.Local.json")
}

# --- 2. Build ----------------------------------------------------------------

if ($SkipBuild) {
    Write-Host "  Skipped the build; using the copy already at $InstallPath." -ForegroundColor Yellow
} else {
    if ($FrameworkDependent) {
        Write-Host "  Publishing to $InstallPath (needs .NET 8 Desktop Runtime on this PC) ..." -ForegroundColor Cyan
        dotnet publish $projectDir -c Release -o $InstallPath | Out-Null
    } else {
        # Self-contained and single-file: the whole app plus the .NET runtime
        # collapse into one PcLockAgent.exe, so a café PC needs nothing
        # installed and there is one file to copy rather than a folder of
        # hundreds. The JSON config stays alongside it, since it is meant to be
        # edited per machine.
        Write-Host "  Publishing single-file build to $InstallPath (this takes a minute) ..." -ForegroundColor Cyan
        dotnet publish $projectDir -c Release -r win-x64 `
            --self-contained true `
            -p:PublishSingleFile=true `
            -p:IncludeNativeLibrariesForSelfExtract=true `
            -o $InstallPath | Out-Null
    }

    if ($LASTEXITCODE -ne 0) {
        Write-Host "Build failed. Fix the errors above and run again." -ForegroundColor Red
        exit 1
    }
    Write-Host "  Built." -ForegroundColor Green
}

# The published copy is what actually runs, so its config must be written last —
# a publish overwrites the folder.
New-Item -ItemType Directory -Force -Path $InstallPath | Out-Null
$configJson | Set-Content -Encoding UTF8 (Join-Path $InstallPath "appsettings.Local.json")
Write-Host "  Wrote $InstallPath\appsettings.Local.json" -ForegroundColor Green

# --- 3. Startup task ---------------------------------------------------------

if ($SkipStartupTask) {
    Write-Host "  Skipped the startup task (-SkipStartupTask)." -ForegroundColor Yellow
} else {
    & (Join-Path $PSScriptRoot "install-startup.ps1") `
        -ExePath (Join-Path $InstallPath "PcLockAgent.exe") `
        -GamingUser $GamingUser
}

Write-Host ""
Write-Host "Station $StationId is set up." -ForegroundColor Green
Write-Host ""
Write-Host "Start it now without rebooting:" -ForegroundColor Cyan
Write-Host "  Start-ScheduledTask -TaskName 'BookMyGame PC Lock Agent'"
Write-Host ""
Write-Host "Check it worked:" -ForegroundColor Cyan
Write-Host "  Get-Content '$InstallPath\agent.log' -Tail 10"
Write-Host ""
