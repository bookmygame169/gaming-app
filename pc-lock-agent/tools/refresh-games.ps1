#Requires -Version 5.1
<#
.SYNOPSIS
    Lists the games installed on this PC, for the lock screen menu to read.

.DESCRIPTION
    Runs as SYSTEM, because that is the only account that can see them all.

    Games get installed by whoever sets the machine up, and most installers
    default to "just for me" - so the shortcuts land on the administrator's own
    desktop and in the administrator's own Start Menu. Windows protects one
    user's profile from another, so the agent, which deliberately runs as the
    unprivileged customer account, is refused access to both. It could see the
    Public desktop and the All Users Start Menu and nothing else, which on a
    real cafe PC is a fraction of what is installed.

    SYSTEM can read every profile. So it does the looking, writes what it found
    somewhere any account may read, and the agent picks that up.

.EXAMPLE
    .\refresh-games.ps1
#>
param(
    [string]$OutputPath = "C:\ProgramData\BookMyGame\installed-games.json"
)

$ErrorActionPreference = "Continue"

# Shortcut names that are never a game. Alongside each title an installer
# leaves its manual, its website, its config tool and its uninstaller, and a
# menu built without this reads like a folder listing.
$notAGame = @(
    'uninstall', 'readme', 'read me', 'manual', 'help', 'support', 'website',
    'web site', 'homepage', 'documentation', 'release notes', 'changelog',
    'config', 'settings', 'setup', 'repair', 'troubleshoot', 'benchmark',
    'server', 'dedicated', 'editor', 'sdk', 'redistributable', 'runtime',
    'visual c++', 'directx', 'driver', 'control panel', 'license', 'eula',
    'report a bug', 'feedback', 'forum', 'wiki', 'discord', 'activate'
)

$notTheExe = @(
    'unins', 'uninstall', 'crashhandler', 'crashreport', 'vc_redist', 'vcredist',
    'dxsetup', 'dotnetfx', 'setup', 'installer', 'updater'
)

function Get-ShortcutTarget {
    param([string]$Path)

    try {
        $shell = New-Object -ComObject WScript.Shell
        $link = $shell.CreateShortcut($Path)
        return $link.TargetPath
    } catch {
        return $null
    }
}

$folders = New-Object System.Collections.Generic.List[string]

# Everyone's desktop and Start Menu, not just this account's. C:\Users\* is
# where the whole point of running as SYSTEM lies.
Get-ChildItem "C:\Users" -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    $folders.Add((Join-Path $_.FullName "Desktop"))
    $folders.Add((Join-Path $_.FullName "AppData\Roaming\Microsoft\Windows\Start Menu\Programs"))
}

$folders.Add("$env:ProgramData\Microsoft\Windows\Start Menu\Programs")

$games = @{}
$windowsDir = $env:SystemRoot

foreach ($folder in $folders) {
    if (-not (Test-Path $folder)) { continue }

    $shortcuts = Get-ChildItem $folder -Filter *.lnk -Recurse -ErrorAction SilentlyContinue
    foreach ($shortcut in $shortcuts) {
        $label = [System.IO.Path]::GetFileNameWithoutExtension($shortcut.Name)
        $lower = $label.ToLower()

        if ($notAGame | Where-Object { $lower.Contains($_) }) { continue }

        $target = Get-ShortcutTarget -Path $shortcut.FullName
        if ([string]::IsNullOrWhiteSpace($target)) { continue }
        if (-not $target.ToLower().EndsWith(".exe")) { continue }
        if (-not (Test-Path $target)) { continue }
        if ($target.StartsWith($windowsDir, [System.StringComparison]::OrdinalIgnoreCase)) { continue }

        $exeName = [System.IO.Path]::GetFileNameWithoutExtension($target).ToLower()
        if ($notTheExe | Where-Object { $exeName.Contains($_) }) { continue }

        # Keyed by target so the same game reached from two accounts, or from
        # both a desktop and a Start Menu, appears once.
        if (-not $games.ContainsKey($target)) {
            $games[$target] = [PSCustomObject]@{
                name    = $label
                exePath = $target
            }
        }
    }
}

$list = @($games.Values | Sort-Object name)

Write-Host "Found $($list.Count) game(s) across all user profiles."
foreach ($game in $list) { Write-Host "  $($game.name)" }

$directory = Split-Path $OutputPath -Parent
if (-not (Test-Path $directory)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
}

# ProgramData, so the customer account can read it. Written to a temporary file
# and moved into place, so the agent never reads a half-written list.
$temp = "$OutputPath.tmp"
$list | ConvertTo-Json -Depth 3 | Set-Content -Path $temp -Encoding UTF8
Move-Item -Path $temp -Destination $OutputPath -Force

Write-Host "Written to $OutputPath"
