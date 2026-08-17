#Requires -Version 5.1
<#
.SYNOPSIS
    Builds a machine-wide game list every account can read.

.DESCRIPTION
    Runs as SYSTEM. The lock agent runs as the café customer account and cannot
    see the administrator's desktop or Start Menu — that is why that account
    only showed ~10 games while the admin saw nearly everything.

    This script:
      1. Reads every user's Desktop + Start Menu
      2. Copies usable shortcuts into ProgramData (readable by the lock user)
      3. Finds Xbox / Game Pass installs (.GamingRoot + XboxGames)
      4. Finds Steam and Epic titles
      5. Writes C:\ProgramData\BookMyGame\installed-games.json

    Windows tools (Disk Cleanup, Event Viewer, …) are never written.
#>
param(
    [string]$OutputPath = "C:\ProgramData\BookMyGame\installed-games.json"
)

$ErrorActionPreference = "Continue"

$rootDir = Split-Path $OutputPath -Parent
$shortcutDir = Join-Path $rootDir "shortcuts"
if (-not (Test-Path $rootDir)) { New-Item -ItemType Directory -Path $rootDir -Force | Out-Null }
if (-not (Test-Path $shortcutDir)) { New-Item -ItemType Directory -Path $shortcutDir -Force | Out-Null }

# Clear old copies so uninstalled games disappear from the next scan.
Get-ChildItem $shortcutDir -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue

$notAGame = @(
    'uninstall', 'readme', 'manual', 'help', 'support', 'website',
    'config', 'settings', 'setup', 'repair', 'benchmark', 'server',
    'dedicated', 'editor', 'sdk', 'redistributable', 'runtime',
    'control panel', 'computer management', 'dfrgui', 'defrag',
    'disk cleanup', 'event viewer', 'iscsi', 'live captions',
    'magnif', 'memory diagnostic', 'narrator', 'odbc', 'on-screen',
    'onebrowser', 'administrative tools', 'windows tools',
    'epic online services', 'epic games launcher'
)

$exactNotAGame = @('steam', 'xbox', 'epic games', 'discord', 'spotify', 'chrome', 'edge')

$windowsTools = @(
    'mmc', 'dfrgui', 'cleanmgr', 'eventvwr', 'iscsicpl', 'odbcad32',
    'osk', 'narrator', 'magnify', 'control', 'compmgmtlauncher',
    'perfmon', 'resmon', 'taskschd', 'regedit', 'cmd', 'powershell',
    'taskmgr', 'mstsc', 'charmap', 'notepad', 'calc', 'mspaint'
)

$junkFolders = @(
    'administrative tools', 'windows tools', 'system tools',
    'accessibility', 'ease of access', 'accessories', 'system32', 'syswow64',
    'windows powershell', 'maintenance'
)

function Get-ShortcutInfo {
    param([string]$Path)

    # A .url is a text file, and CreateShortcut hands back a different object
    # for one - it has no Arguments property, so asking threw and this returned
    # null for the whole shortcut. It happened to still work, because a null
    # target falls through to "keep the shortcut itself", but nothing about the
    # game was ever actually read. Steam writes every one of its desktop
    # shortcuts this way.
    if ($Path.ToLowerInvariant().EndsWith('.url')) {
        $url = $null
        try {
            foreach ($line in Get-Content -LiteralPath $Path -ErrorAction Stop) {
                if ($line -match '^\s*URL\s*=\s*(.+)$') { $url = $Matches[1].Trim(); break }
            }
        } catch {
            return $null
        }
        return [PSCustomObject]@{ Target = $null; Arguments = $null; Url = $url }
    }

    try {
        $shell = New-Object -ComObject WScript.Shell
        $link = $shell.CreateShortcut($Path)
        return [PSCustomObject]@{
            Target    = [string]$link.TargetPath
            Arguments = [string]$link.Arguments
            Url       = $null
        }
    } catch {
        return $null
    }
}

function Test-IsJunkName {
    param([string]$Name)
    $lower = $Name.ToLowerInvariant()
    if ($exactNotAGame -contains $lower) { return $true }
    foreach ($bad in $notAGame) {
        if ($lower.Contains($bad)) { return $true }
    }
    return $false
}

function Add-Game {
    param(
        [hashtable]$Store,
        [string]$Name,
        [string]$ExePath,
        [string]$Arguments = $null
    )
    if ([string]::IsNullOrWhiteSpace($Name) -or [string]::IsNullOrWhiteSpace($ExePath)) { return }
    if (Test-IsJunkName $Name) { return }
    if (-not (Test-Path -LiteralPath $ExePath)) { return }

    $key = ("{0}|{1}|{2}" -f $Name, $ExePath, $Arguments).ToLowerInvariant()
    if (-not $Store.ContainsKey($key)) {
        $Store[$key] = [PSCustomObject]@{
            name      = $Name
            exePath   = $ExePath
            arguments = $Arguments
        }
    }
}

function Copy-SharedShortcut {
    param([string]$Source, [string]$Label)
    $safe = ($Label -replace '[^\w\- ]', '').Trim()
    if ([string]::IsNullOrWhiteSpace($safe)) { $safe = "game" }
    if ($safe.Length -gt 60) { $safe = $safe.Substring(0, 60) }
    $ext = [System.IO.Path]::GetExtension($Source)
    if ([string]::IsNullOrWhiteSpace($ext)) { $ext = ".lnk" }
    $dest = Join-Path $shortcutDir ($safe + $ext)
    $i = 2
    while (Test-Path -LiteralPath $dest) {
        $dest = Join-Path $shortcutDir ("{0}-{1}{2}" -f $safe, $i, $ext)
        $i++
    }
    Copy-Item -LiteralPath $Source -Destination $dest -Force
    return $dest
}

function Get-BestExe {
    param([string]$Folder)
    if (-not (Test-Path $Folder)) { return $null }
    $skip = @('unins', 'uninstall', 'crashhandler', 'crashreport', 'vc_redist', 'vcredist',
              'dxsetup', 'dotnetfx', 'setup', 'installer', 'updater', 'ueprereq', 'touchup')
    $candidates = @()
    try {
        $candidates += Get-ChildItem $Folder -Filter *.exe -File -ErrorAction SilentlyContinue
        Get-ChildItem $Folder -Directory -ErrorAction SilentlyContinue | ForEach-Object {
            $candidates += Get-ChildItem $_.FullName -Filter *.exe -File -ErrorAction SilentlyContinue
            Get-ChildItem $_.FullName -Directory -ErrorAction SilentlyContinue | ForEach-Object {
                $candidates += Get-ChildItem $_.FullName -Filter *.exe -File -ErrorAction SilentlyContinue
            }
        }
    } catch {}

    $best = $candidates |
        Where-Object {
            $n = $_.BaseName.ToLowerInvariant()
            -not ($skip | Where-Object { $n.Contains($_) })
        } |
        Sort-Object Length -Descending |
        Select-Object -First 1

    if ($best) { return $best.FullName }
    return $null
}

$games = @{}
$windowsDir = $env:SystemRoot

# --- 1) Every profile's Desktop + Start Menu ---------------------------------
$scanFolders = New-Object System.Collections.Generic.List[string]
Get-ChildItem "C:\Users" -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.Name -in @('Default', 'Default User', 'All Users', 'Public')) { return }
    $scanFolders.Add((Join-Path $_.FullName "Desktop"))
    $scanFolders.Add((Join-Path $_.FullName "AppData\Roaming\Microsoft\Windows\Start Menu\Programs"))
}
$scanFolders.Add("$env:PUBLIC\Desktop")
$scanFolders.Add("$env:ProgramData\Microsoft\Windows\Start Menu\Programs")

foreach ($folder in $scanFolders) {
    if (-not (Test-Path $folder)) { continue }

    $shortcuts = @()
    $shortcuts += Get-ChildItem $folder -Filter *.lnk -Recurse -ErrorAction SilentlyContinue
    $shortcuts += Get-ChildItem $folder -Filter *.url -Recurse -ErrorAction SilentlyContinue

    foreach ($shortcut in $shortcuts) {
        $label = [System.IO.Path]::GetFileNameWithoutExtension($shortcut.Name)
        $full = $shortcut.FullName.ToLowerInvariant()

        if (Test-IsJunkName $label) { continue }
        if ($junkFolders | Where-Object { $full.Contains($_) }) { continue }

        $info = Get-ShortcutInfo -Path $shortcut.FullName
        $target = $null
        $arguments = $null
        if ($info) {
            $target = $info.Target
            $arguments = $info.Arguments
        }

        $isStoreGame = $false
        if (-not [string]::IsNullOrWhiteSpace($target)) {
            $exeName = [System.IO.Path]::GetFileNameWithoutExtension($target).ToLowerInvariant()
            if ($windowsTools -contains $exeName) { continue }

            # Xbox / Microsoft Store games often launch via explorer.exe +
            # shell:AppsFolder\.... Rejecting every Windows\ path used to drop
            # Forza, Resident Evil Village, etc. from the lock-user menu.
            if ($exeName -eq 'explorer' -and $arguments -and $arguments.ToLowerInvariant().Contains('appsfolder')) {
                $isStoreGame = $true
            }
            elseif ($target.StartsWith($windowsDir, [System.StringComparison]::OrdinalIgnoreCase)) {
                continue
            }
        }

        if ($isStoreGame) {
            $shared = Copy-SharedShortcut -Source $shortcut.FullName -Label $label
            Add-Game -Store $games -Name $label -ExePath $shared -Arguments $null
            continue
        }

        if (-not [string]::IsNullOrWhiteSpace($target) -and $target.ToLowerInvariant().EndsWith('.exe') -and (Test-Path -LiteralPath $target)) {
            # Prefer a machine-wide exe (not under another user's profile).
            if ($target -match '(?i)\\Users\\(?!Public\\)') {
                $shared = Copy-SharedShortcut -Source $shortcut.FullName -Label $label
                Add-Game -Store $games -Name $label -ExePath $shared -Arguments $null
            } else {
                Add-Game -Store $games -Name $label -ExePath $target -Arguments $arguments
            }
            continue
        }

        # URL shortcuts / unresolved targets — keep the shortcut itself in ProgramData.
        $shared = Copy-SharedShortcut -Source $shortcut.FullName -Label $label
        Add-Game -Store $games -Name $label -ExePath $shared -Arguments $null
    }
}

# --- 2) Xbox / Game Pass installs --------------------------------------------
function Get-XboxRoots {
    $roots = New-Object System.Collections.Generic.List[string]
    Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue | ForEach-Object {
        $driveRoot = $_.Root
        if (-not $driveRoot) { return }

        $default = Join-Path $driveRoot "XboxGames"
        if (Test-Path $default) { $roots.Add($default) }

        $gamingRoot = Join-Path $driveRoot ".GamingRoot"
        if (Test-Path $gamingRoot) {
            try {
                $text = Get-Content -LiteralPath $gamingRoot -Raw -ErrorAction SilentlyContinue
                if ($text) {
                    foreach ($m in [regex]::Matches($text, '[A-Za-z]:\\[^<>:"\|\?\*\r\n]+')) {
                        $p = $m.Value.Trim()
                        if (Test-Path $p) { $roots.Add($p) }
                    }
                }
            } catch {}
        }
    }
    return $roots | Select-Object -Unique
}

foreach ($xboxRoot in Get-XboxRoots) {
    Get-ChildItem $xboxRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object {
        $gameName = $_.Name
        if (Test-IsJunkName $gameName) { return }
        if ($gameName -in @('GameSave', '.GamingRoot')) { return }

        $content = Join-Path $_.FullName "Content"
        $searchIn = if (Test-Path $content) { $content } else { $_.FullName }
        $exe = Get-BestExe -Folder $searchIn
        if ($exe) {
            Add-Game -Store $games -Name $gameName -ExePath $exe
        }
    }
}

# --- 3) Steam libraries ------------------------------------------------------
$steamRoots = New-Object System.Collections.Generic.List[string]
foreach ($guess in @(
    "${env:ProgramFiles(x86)}\Steam",
    "$env:ProgramFiles\Steam"
)) {
    if (Test-Path $guess) { $steamRoots.Add($guess) }
}
Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue | ForEach-Object {
    foreach ($name in @('Steam', 'SteamLibrary', 'Games\Steam')) {
        $p = Join-Path $_.Root $name
        if ((Test-Path (Join-Path $p 'steamapps'))) { $steamRoots.Add($p) }
    }
}

foreach ($steamRoot in ($steamRoots | Select-Object -Unique)) {
    $steamExe = Join-Path $steamRoot "steam.exe"
    $vdf = Join-Path $steamRoot "steamapps\libraryfolders.vdf"
    $libs = New-Object System.Collections.Generic.List[string]
    $libs.Add($steamRoot)
    if (Test-Path $vdf) {
        try {
            $vdfText = Get-Content $vdf -Raw
            foreach ($m in [regex]::Matches($vdfText, '"path"\s*"([^"]+)"')) {
                $p = $m.Groups[1].Value -replace '\\\\', '\'
                if (Test-Path $p) { $libs.Add($p) }
            }
        } catch {}
    }

    foreach ($lib in ($libs | Select-Object -Unique)) {
        $apps = Join-Path $lib "steamapps"
        if (-not (Test-Path $apps)) { continue }
        Get-ChildItem $apps -Filter "appmanifest_*.acf" -ErrorAction SilentlyContinue | ForEach-Object {
            try {
                $text = Get-Content $_.FullName -Raw
                if ($text -notmatch '"appid"\s*"(\d+)"') { return }
                $appId = $Matches[1]
                $name = if ($text -match '"name"\s*"([^"]+)"') { $Matches[1] } else { return }
                $installDir = if ($text -match '"installdir"\s*"([^"]+)"') { $Matches[1] } else { $null }
                if ($name -match 'redistributable|steamworks|runtime|dedicated server|soundtrack|proton') { return }
                $folder = if ($installDir) { Join-Path $apps "common\$installDir" } else { $null }
                if ($folder -and -not (Test-Path $folder)) { return }
                if (Test-Path $steamExe) {
                    Add-Game -Store $games -Name $name -ExePath $steamExe -Arguments "-applaunch $appId"
                }
            } catch {}
        }
    }
}

# --- 4) Epic Games -----------------------------------------------------------
$epicManifests = "$env:ProgramData\Epic\EpicGamesLauncher\Data\Manifests"
if (Test-Path $epicManifests) {
    Get-ChildItem $epicManifests -Filter *.item -ErrorAction SilentlyContinue | ForEach-Object {
        try {
            $json = Get-Content $_.FullName -Raw | ConvertFrom-Json
            $name = $json.DisplayName
            $loc = $json.InstallLocation
            $exeRel = $json.LaunchExecutable
            if (-not $name -or -not $loc -or -not $exeRel) { return }
            $exe = Join-Path $loc ($exeRel -replace '/', '\')
            Add-Game -Store $games -Name $name -ExePath $exe
        } catch {}
    }
}

$list = @($games.Values | Sort-Object name)
Write-Host "Found $($list.Count) game(s) for the lock screen."
foreach ($game in $list) { Write-Host "  $($game.name)" }

$temp = "$OutputPath.tmp"
$list | ConvertTo-Json -Depth 3 | Set-Content -Path $temp -Encoding UTF8
Move-Item -Path $temp -Destination $OutputPath -Force
Write-Host "Written to $OutputPath"
Write-Host "Shared shortcuts in $shortcutDir"
