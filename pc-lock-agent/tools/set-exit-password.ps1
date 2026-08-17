#Requires -Version 5.1
<#
.SYNOPSIS
    Sets the password that closes the lock screen with Ctrl+Alt+Shift+Q.

.DESCRIPTION
    With a password set, an administrator standing at a locked station can press
    Ctrl+Alt+Shift+Q, type it, and the agent closes. Useful for fixing a machine
    without signing the customer out.

    Only the hash is stored. The password itself is never written anywhere, so
    somebody reading appsettings.Local.json on the PC learns nothing they can
    type.

    Paid time is not lost by exiting: the session is left saved, so starting the
    agent again resumes whatever was left of it.

    Run as an administrator on the café PC.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File set-exit-password.ps1

.EXAMPLE
    # Remove it again. The chord then does nothing at all.
    powershell -ExecutionPolicy Bypass -File set-exit-password.ps1 -Remove
#>
param(
    [string]$InstallDir = "C:\BookMyGame\PcLockAgent",
    [switch]$Remove
)

$ErrorActionPreference = "Stop"

$settingsPath = Join-Path $InstallDir "appsettings.Local.json"

if (-not (Test-Path -LiteralPath $InstallDir)) {
    Write-Host "Cannot find the agent at $InstallDir." -ForegroundColor Red
    Write-Host "Pass -InstallDir if it is installed somewhere else." -ForegroundColor Yellow
    exit 1
}

# Read what is there, so nothing else in the file is lost.
$settings = [ordered]@{}
if (Test-Path -LiteralPath $settingsPath) {
    try {
        $existing = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
        foreach ($property in $existing.PSObject.Properties) {
            $settings[$property.Name] = $property.Value
        }
    } catch {
        Write-Host "appsettings.Local.json could not be read: $_" -ForegroundColor Red
        Write-Host "Fix or delete that file first - overwriting it would lose this PC's settings." -ForegroundColor Yellow
        exit 1
    }
}

if ($Remove) {
    $settings.Remove("exitPasswordHash") | Out-Null
    $settings | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $settingsPath -Encoding UTF8
    Write-Host ""
    Write-Host "Exit password removed. Ctrl+Alt+Shift+Q now does nothing." -ForegroundColor Green
    Write-Host "Restart the agent for this to take effect." -ForegroundColor Yellow
    Write-Host ""
    exit 0
}

# --- Ask twice, never echoed -------------------------------------------------

$first = Read-Host "New exit password" -AsSecureString
$second = Read-Host "Type it again" -AsSecureString

function ConvertTo-PlainText {
    param([System.Security.SecureString]$Secure)
    $pointer = [System.Runtime.InteropServices.Marshal]::SecureStringToGlobalAllocUnicode($Secure)
    try {
        return [System.Runtime.InteropServices.Marshal]::PtrToStringUni($pointer)
    } finally {
        [System.Runtime.InteropServices.Marshal]::ZeroFreeGlobalAllocUnicode($pointer)
    }
}

$plainFirst = ConvertTo-PlainText $first
$plainSecond = ConvertTo-PlainText $second

if ($plainFirst -ne $plainSecond) {
    Write-Host "Those did not match. Nothing was changed." -ForegroundColor Red
    exit 1
}

if ($plainFirst.Length -lt 6) {
    Write-Host "Use at least 6 characters." -ForegroundColor Red
    exit 1
}

# --- Hash it -----------------------------------------------------------------
#
# PBKDF2-SHA256, matching ExitPassword.cs. The iteration count is stored in the
# string so it can be raised later without invalidating passwords already set.

$iterations = 210000
$salt = New-Object byte[] 16
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($salt)

$derive = New-Object System.Security.Cryptography.Rfc2898DeriveBytes(
    $plainFirst, $salt, $iterations, [System.Security.Cryptography.HashAlgorithmName]::SHA256)
try {
    $hash = $derive.GetBytes(32)
} finally {
    $derive.Dispose()
}

$settings["exitPasswordHash"] = "{0}.{1}.{2}" -f `
    $iterations, [Convert]::ToBase64String($salt), [Convert]::ToBase64String($hash)

$settings | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $settingsPath -Encoding UTF8

# Not left lying in memory longer than needed.
$plainFirst = $null
$plainSecond = $null
[System.GC]::Collect()

Write-Host ""
Write-Host "Exit password set." -ForegroundColor Green
Write-Host "  Written to: $settingsPath"
Write-Host "  Only the hash is stored - the password itself is not saved anywhere."
Write-Host ""
Write-Host "At a locked station, press Ctrl+Alt+Shift+Q and type it to close the agent." -ForegroundColor Cyan
Write-Host "Restart the agent for this to take effect." -ForegroundColor Yellow
Write-Host ""
