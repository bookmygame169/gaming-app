<#
.SYNOPSIS
    Builds BookMyGame-PC-Lock-Setup.exe — the installer you run on each café PC.

.DESCRIPTION
    Run this once on the machine that has the source code. It publishes the agent
    as a single self-contained exe, bakes in the broker and heartbeat settings,
    and compiles everything into one Setup.exe.

    Settings are baked in because they are identical on every machine. The
    installer then only asks for the one thing that differs: which station the PC
    is.

    Requires Inno Setup 6 (free): https://jrsoftware.org/isdl.php

.EXAMPLE
    .\build-installer.ps1 `
        -BrokerHost "abc123.s1.eu.hivemq.cloud" `
        -BrokerUsername "station" `
        -BrokerPassword "..." `
        -HeartbeatUrl "https://www.bookmygame.co.in/api/stations/heartbeat" `
        -HeartbeatToken "..." `
        -CafeId "..."

.NOTES
    The Setup.exe produced contains your broker password. Treat it like a
    password: keep it on a USB stick or somewhere private, and do not put it in
    the repo or anywhere public.
#>
param(
    [Parameter(Mandatory = $true)][string]$BrokerHost,
    [Parameter(Mandatory = $true)][string]$BrokerUsername,
    [Parameter(Mandatory = $true)][string]$BrokerPassword,

    [string]$HeartbeatUrl = "",
    [string]$HeartbeatToken = "",
    [string]$CafeId = "",

    [int]$BrokerPort = 8883,
    [string]$Version = "1.0.0",
    [string]$InnoSetupPath = ""
)

$ErrorActionPreference = "Stop"

$agentRoot   = Split-Path $PSScriptRoot -Parent
$projectDir  = Join-Path $agentRoot "PcLockAgent"
$publishDir  = Join-Path $agentRoot "publish"
$installerIn = Join-Path $agentRoot "installer"
$generated   = Join-Path $installerIn "generated"

# --- Find Inno Setup ---------------------------------------------------------

if (-not $InnoSetupPath) {
    $candidates = @(
        "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
        "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
    )
    $InnoSetupPath = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}

if (-not $InnoSetupPath -or -not (Test-Path $InnoSetupPath)) {
    Write-Host ""
    Write-Host "Inno Setup is not installed." -ForegroundColor Red
    Write-Host ""
    Write-Host "It is free, and only needed on this machine — not on the cafe PCs." -ForegroundColor Yellow
    Write-Host "Download it from: https://jrsoftware.org/isdl.php" -ForegroundColor Yellow
    Write-Host "Install it, then run this script again."
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host "Building the installer" -ForegroundColor Cyan
Write-Host ""

# --- 1. Publish the agent ----------------------------------------------------

Write-Host "  Publishing the agent (this takes a minute) ..." -ForegroundColor Cyan

if (Test-Path $publishDir) {
    Remove-Item $publishDir -Recurse -Force
}

dotnet publish $projectDir -c Release -r win-x64 `
    --self-contained true `
    -p:PublishSingleFile=true `
    -p:IncludeNativeLibrariesForSelfExtract=true `
    -o $publishDir | Out-Null

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed. Fix the errors above and run again." -ForegroundColor Red
    exit 1
}

Write-Host "  Published." -ForegroundColor Green

# --- 2. Bake in the settings -------------------------------------------------

# __STATION_ID__ is filled in by the installer, since it is the one value that
# differs per machine.
$settings = [ordered]@{
    stationId = "__STATION_ID__"
    mqtt      = [ordered]@{
        host     = $BrokerHost
        port     = $BrokerPort
        useTls   = ($BrokerPort -ne 1883)
        username = $BrokerUsername
        password = $BrokerPassword
    }
}

if ($HeartbeatUrl -and $HeartbeatToken -and $CafeId) {
    $settings.heartbeat = [ordered]@{
        url    = $HeartbeatUrl
        token  = $HeartbeatToken
        cafeId = $CafeId
    }
} else {
    Write-Host "  No heartbeat details given — installed PCs will not appear on the" -ForegroundColor Yellow
    Write-Host "  dashboard's live status list. Locking and unlocking still work." -ForegroundColor Yellow
}

New-Item -ItemType Directory -Force -Path $generated | Out-Null
$settings | ConvertTo-Json -Depth 5 |
    Set-Content -Encoding UTF8 (Join-Path $generated "appsettings.Local.template")

Write-Host "  Settings baked in." -ForegroundColor Green

# --- 3. Compile the installer ------------------------------------------------

Write-Host "  Compiling ..." -ForegroundColor Cyan

& $InnoSetupPath "/DAppVersion=$Version" (Join-Path $installerIn "PcLockAgent.iss") | Out-Null

if ($LASTEXITCODE -ne 0) {
    Write-Host "Inno Setup failed. See the output above." -ForegroundColor Red
    exit 1
}

$output = Join-Path $installerIn "Output\BookMyGame-PC-Lock-Setup.exe"

Write-Host ""
Write-Host "Done." -ForegroundColor Green
Write-Host "  $output"
Write-Host ""
Write-Host "Copy that one file to each cafe PC and run it. It asks only which" -ForegroundColor Cyan
Write-Host "station the machine is." -ForegroundColor Cyan
Write-Host ""
Write-Host "It contains your broker password — keep it off anything public." -ForegroundColor Yellow
Write-Host ""
