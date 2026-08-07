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

    [switch]$SkipStartupTask
)

$ErrorActionPreference = "Stop"

# Station ids are lower case everywhere: bookings store them that way and MQTT
# topics are case-sensitive, so "PC-01" would silently never receive commands.
$StationId = $StationId.ToLowerInvariant()

$projectDir = Join-Path (Split-Path $PSScriptRoot -Parent) "PcLockAgent"
if (-not (Test-Path $projectDir)) {
    Write-Host "Could not find the project at $projectDir" -ForegroundColor Red
    Write-Host "Run this script from the pc-lock-agent\tools folder of the repo."
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

$configPath = Join-Path $projectDir "appsettings.Local.json"
$config | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 $configPath
Write-Host "  Wrote $configPath" -ForegroundColor Green

# --- 2. Build ----------------------------------------------------------------

Write-Host "  Publishing release build to $InstallPath ..." -ForegroundColor Cyan
dotnet publish $projectDir -c Release -o $InstallPath | Out-Null

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed. Fix the errors above and run again." -ForegroundColor Red
    exit 1
}
Write-Host "  Built." -ForegroundColor Green

# The published copy is what actually runs, so the config has to be beside it.
Copy-Item $configPath (Join-Path $InstallPath "appsettings.Local.json") -Force

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
