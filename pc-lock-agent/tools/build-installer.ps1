<#
.SYNOPSIS
    Builds BookMyGame-PC-Lock-Setup.exe - the installer for cafe PCs.

.DESCRIPTION
    Run this on the machine that has the source code.

    The installer carries no passwords. A PC gets its settings on first run by
    redeeming a setup code from the owner dashboard, so one build works for every
    cafe, can be hosted publicly, and never needs rebuilding when a password
    changes.

    Requires Inno Setup (free): https://jrsoftware.org/isdl.php

.EXAMPLE
    .\build-installer.ps1

.EXAMPLE
    .\build-installer.ps1 -Version 1.1.0

.NOTES
    Before building for real cafe PCs, set AllowDevExit to false in
    AgentSettings.cs. While it is true anyone can quit the lock with
    Ctrl+Shift+Alt+Q.
#>
param(
    [string]$Version = "1.0.0",
    [string]$InnoSetupPath = ""
)

$ErrorActionPreference = "Stop"

$agentRoot   = Split-Path $PSScriptRoot -Parent
$projectDir  = Join-Path $agentRoot "PcLockAgent"
$publishDir  = Join-Path $agentRoot "publish"
$installerIn = Join-Path $agentRoot "installer"

# --- Find Inno Setup ---------------------------------------------------------

if (-not $InnoSetupPath) {
    # Searched by wildcard rather than a fixed "Inno Setup 6" path so version 7,
    # or whatever comes next, is found too. Newest first.
    foreach ($root in @(${env:ProgramFiles(x86)}, $env:ProgramFiles)) {
        if (-not $root) { continue }

        $found = Get-ChildItem -Path $root -Filter "Inno Setup *" -Directory -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending |
            ForEach-Object { Join-Path $_.FullName "ISCC.exe" } |
            Where-Object { Test-Path $_ } |
            Select-Object -First 1

        if ($found) {
            $InnoSetupPath = $found
            break
        }
    }
}

if (-not $InnoSetupPath -or -not (Test-Path $InnoSetupPath)) {
    Write-Host ""
    Write-Host "Inno Setup is not installed." -ForegroundColor Red
    Write-Host ""
    Write-Host "It is free, and only needed on this machine - not on the cafe PCs." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Install it with one command:" -ForegroundColor Cyan
    Write-Host "  winget install --id JRSoftware.InnoSetup -e"
    Write-Host ""
    Write-Host "Or download from https://jrsoftware.org/isdl.php - version 6 or 7," -ForegroundColor Yellow
    Write-Host "either works. Then run this script again." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host "Building the installer" -ForegroundColor Cyan
Write-Host "  Using: $InnoSetupPath" -ForegroundColor DarkGray
Write-Host ""

# --- Warn about the escape hatch ---------------------------------------------

$settingsFile = Join-Path $projectDir "AgentSettings.cs"
if ((Test-Path $settingsFile) -and (Select-String -Path $settingsFile -Pattern 'AllowDevExit\s*=\s*true' -Quiet)) {
    Write-Host "  WARNING: AllowDevExit is still true." -ForegroundColor Yellow
    Write-Host "  Anyone can quit the lock with Ctrl+Shift+Alt+Q, or suspend it with" -ForegroundColor Yellow
    Write-Host "  Ctrl+Shift+Alt+L. Fine for testing; set it to false in" -ForegroundColor Yellow
    Write-Host "  AgentSettings.cs before this goes on a real cafe PC." -ForegroundColor Yellow
    Write-Host ""
}

# --- 1. Publish the agent ----------------------------------------------------

Write-Host "  Publishing the agent (this takes a minute) ..." -ForegroundColor Cyan

if (Test-Path $publishDir) {
    Remove-Item $publishDir -Recurse -Force
}

$publishArgs = @(
    "publish", $projectDir,
    "-c", "Release",
    "-r", "win-x64",
    "--self-contained", "true",
    "-p:PublishSingleFile=true",
    "-p:IncludeNativeLibrariesForSelfExtract=true",
    "-o", $publishDir
)

if ($env:GITHUB_ACTIONS) {
    dotnet @publishArgs
} else {
    dotnet @publishArgs | Out-Null
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed. Fix the errors above and run again." -ForegroundColor Red
    exit 1
}

Write-Host "  Published." -ForegroundColor Green

# --- 2. Compile the installer ------------------------------------------------

Write-Host "  Compiling ..." -ForegroundColor Cyan

$issFile = Join-Path $installerIn "PcLockAgent.iss"
if ($env:GITHUB_ACTIONS) {
    & $InnoSetupPath "/DAppVersion=$Version" $issFile
} else {
    & $InnoSetupPath "/DAppVersion=$Version" $issFile | Out-Null
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "Inno Setup failed. See the output above." -ForegroundColor Red
    exit 1
}

$output = Join-Path $installerIn "Output\BookMyGame-PC-Lock-Setup.exe"

if (-not (Test-Path $output)) {
    Write-Host "Inno Setup reported success but produced no file at:" -ForegroundColor Red
    Write-Host "  $output"
    exit 1
}

$sizeMb = [math]::Round((Get-Item $output).Length / 1MB, 1)

Write-Host ""
Write-Host "Done." -ForegroundColor Green
Write-Host "  $output"
Write-Host "  $sizeMb MB" -ForegroundColor DarkGray
Write-Host ""
Write-Host "This file contains no passwords, so it is safe to upload publicly." -ForegroundColor Cyan
Write-Host "Attach it to a GitHub Release, then point" -ForegroundColor Cyan
Write-Host "NEXT_PUBLIC_AGENT_DOWNLOAD_URL at it so the dashboard can offer it." -ForegroundColor Cyan
Write-Host ""
Write-Host "On each cafe PC: run it, then type the setup code from the" -ForegroundColor Cyan
Write-Host "dashboard's Stations tab." -ForegroundColor Cyan
Write-Host ""
