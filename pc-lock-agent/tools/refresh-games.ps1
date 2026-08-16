#Requires -Version 5.1
<#
.SYNOPSIS
    Lists the games installed on this PC, for the lock screen menu to read.

.DESCRIPTION
    Desktops only — never the Start Menu. The Start Menu is where Windows puts
    Computer Management, Disk Cleanup and ODBC, and treating those shortcuts as
    games is how they appeared on CHOOSE A GAME.

    Steam / Epic / Xbox are discovered by the agent itself. This file is only
    the extra titles someone pinned on a desktop the customer account cannot
    see (the administrator's profile).
#>
param(
    [string]$OutputPath = "C:\ProgramData\BookMyGame\installed-games.json"
)

$ErrorActionPreference = "Continue"

$notAGame = @(
    'uninstall', 'readme', 'manual', 'help', 'support', 'website',
    'config', 'settings', 'setup', 'repair', 'benchmark', 'server',
    'dedicated', 'editor', 'sdk', 'redistributable', 'runtime',
    'control panel', 'computer management', 'dfrgui', 'defrag',
    'disk cleanup', 'event viewer', 'iscsi', 'live captions',
    'magnif', 'memory diagnostic', 'narrator', 'odbc', 'on-screen',
    'onebrowser', 'administrative tools', 'windows tools'
)

$windowsTools = @(
    'mmc', 'dfrgui', 'cleanmgr', 'eventvwr', 'iscsicpl', 'odbcad32',
    'osk', 'narrator', 'magnify', 'control', 'compmgmtlauncher',
    'perfmon', 'resmon', 'taskschd', 'regedit', 'cmd', 'powershell'
)

$junkFolders = @(
    'administrative tools', 'windows tools', 'system tools',
    'accessibility', 'ease of access', 'accessories', 'system32', 'syswow64'
)

function Get-ShortcutInfo {
    param([string]$Path)

    try {
        $shell = New-Object -ComObject WScript.Shell
        $link = $shell.CreateShortcut($Path)
        return [PSCustomObject]@{
            Target    = $link.TargetPath
            Arguments = $link.Arguments
        }
    } catch {
        return $null
    }
}

$folders = New-Object System.Collections.Generic.List[string]
Get-ChildItem "C:\Users" -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    $folders.Add((Join-Path $_.FullName "Desktop"))
}
$folders.Add("$env:PUBLIC\Desktop")

$games = @{}
$windowsDir = $env:SystemRoot

foreach ($folder in $folders) {
    if (-not (Test-Path $folder)) { continue }

    $shortcuts = @()
    $shortcuts += Get-ChildItem $folder -Filter *.lnk -ErrorAction SilentlyContinue
    $shortcuts += Get-ChildItem $folder -Filter *.url -ErrorAction SilentlyContinue

    foreach ($shortcut in $shortcuts) {
        $label = [System.IO.Path]::GetFileNameWithoutExtension($shortcut.Name)
        $lower = $label.ToLower()
        $full = $shortcut.FullName.ToLower()

        if ($notAGame | Where-Object { $lower.Contains($_) }) { continue }
        if ($junkFolders | Where-Object { $full.Contains($_) }) { continue }

        $info = Get-ShortcutInfo -Path $shortcut.FullName
        $target = $null
        $arguments = $null
        if ($info) {
            $target = $info.Target
            $arguments = $info.Arguments
        }

        if (-not [string]::IsNullOrWhiteSpace($target)) {
            $exeName = [System.IO.Path]::GetFileNameWithoutExtension($target).ToLower()
            if ($windowsTools -contains $exeName) { continue }
            if ($target.StartsWith($windowsDir, [System.StringComparison]::OrdinalIgnoreCase)) { continue }
        }

        $exePath = $shortcut.FullName
        if (-not [string]::IsNullOrWhiteSpace($target) -and $target.ToLower().EndsWith(".exe") -and (Test-Path $target)) {
            $exePath = $target
        }

        $key = ("{0}|{1}|{2}" -f $label, $exePath, $arguments).ToLower()
        if (-not $games.ContainsKey($key)) {
            $games[$key] = [PSCustomObject]@{
                name      = $label
                exePath   = $exePath
                arguments = $arguments
            }
        }
    }
}

$list = @($games.Values | Sort-Object name)

Write-Host "Found $($list.Count) desktop game(s)."
foreach ($game in $list) { Write-Host "  $($game.name)" }

$directory = Split-Path $OutputPath -Parent
if (-not (Test-Path $directory)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
}

$temp = "$OutputPath.tmp"
$list | ConvertTo-Json -Depth 3 | Set-Content -Path $temp -Encoding UTF8
Move-Item -Path $temp -Destination $OutputPath -Force

Write-Host "Written to $OutputPath"
