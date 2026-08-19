#Requires -Version 5.1
<#
.SYNOPSIS
    Copies your game shortcuts onto the customer account's desktop.

.DESCRIPTION
    The lock screen shows what is on the customer account's desktop. That is
    the whole rule now — no scanning of Steam libraries, no reading of Xbox
    packages, no guessing from names. If a game is on that desktop it is on the
    menu, and if it is not, it is not.

    Every earlier version tried to find games by itself and kept losing them,
    because the account it runs as has no rights over the administrator's
    profile or over another user's installs. A shortcut on its own desktop has
    no such problem.

    This is what puts them there. Run it as an administrator, once now and
    again whenever you install a game.

    Games launch correctly from the copied shortcut even though they were
    installed under your account: Steam, Epic and Xbox shortcuts point at the
    launcher rather than at a file.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File copy-games-to-user.ps1 -GamingUser GamingUser

.EXAMPLE
    # See what it would do without changing anything.
    powershell -ExecutionPolicy Bypass -File copy-games-to-user.ps1 -GamingUser GamingUser -WhatIfOnly
#>
param(
    [Parameter(Mandatory = $true)][string]$GamingUser,

    # Where to copy from. Defaults to the desktop of whoever is running this.
    [string]$FromDesktop,

    [switch]$WhatIfOnly,

    # Remove shortcuts on the customer desktop that are no longer on yours.
    [switch]$Mirror,

    # Where the agent lives, so a "Lock this PC" shortcut can point at it.
    [string]$InstallDir = "C:\BookMyGame\PcLockAgent"
)

$ErrorActionPreference = "Stop"

function Say {
    param([string]$Text, [string]$Colour = "Gray")
    Write-Host $Text -ForegroundColor $Colour
}

# --- Where from, where to ----------------------------------------------------

if (-not $FromDesktop) {
    $FromDesktop = [Environment]::GetFolderPath("Desktop")
}

if (-not (Test-Path -LiteralPath $FromDesktop)) {
    Say "Cannot find the desktop to copy from: $FromDesktop" "Red"
    exit 1
}

$targetProfile = Join-Path "C:\Users" $GamingUser
if (-not (Test-Path -LiteralPath $targetProfile)) {
    Say "There is no Windows account folder at $targetProfile." "Red"
    Say "Check the account name. It must have signed in at least once." "Yellow"
    exit 1
}

$targetDesktop = Join-Path $targetProfile "Desktop"
if (-not (Test-Path -LiteralPath $targetDesktop)) {
    New-Item -ItemType Directory -Path $targetDesktop -Force | Out-Null
}

Say ""
Say "From: $FromDesktop"
Say "To:   $targetDesktop"
Say ""

# --- What is not a game ------------------------------------------------------
#
# The one place this judgement is made. It happens here, once, with a printed
# list of what it skipped — rather than at run time inside the agent, where a
# game disappearing looked like a bug and could only be explained by reading a
# log off the machine.

$notGames = @(
    'bookmygame', 'pclockagent',
    'file explorer', 'this pc', 'recycle bin', 'control panel', 'network',
    'nvidia', 'geforce', 'logitech', 'g hub', 'ghub', 'razer', 'corsair', 'icue',
    'armoury crate', 'msi center', 'dragon center', 'realtek', 'amd software',
    'adrenalin', 'intel graphics',
    'onedrive', 'onenote', 'premieropinion', 'deskrest', 'kreo', 'overwolf',
    'microsoft store', 'microsoft edge', 'google chrome', 'firefox',
    'clipchamp', 'copilot', 'click to do', 'get started', 'movies & tv',
    'media player', 'phone link', 'snipping tool', 'notepad', 'calculator',
    'paint', 'word', 'excel', 'powerpoint', 'outlook', 'teams',
    'winrar', '7-zip', 'notepad++', 'vlc',
    'uninstall', 'readme', 'manual', 'website', 'support', 'config',
    'settings', 'setup', 'repair', 'benchmark', 'server', 'editor'
)

# Launchers are apps, not games. The lock screen offers these itself when they
# are installed, so copying them would only duplicate the tile.
$launchers = @('steam', 'epic games launcher', 'xbox', 'discord', 'riot client', 'battle.net')

function Get-ShortcutInfo {
    param([string]$Path)
    try {
        $shell = New-Object -ComObject WScript.Shell
        $link = $shell.CreateShortcut($Path)
        return [PSCustomObject]@{ Target = [string]$link.TargetPath }
    } catch {
        return $null
    }
}

function Get-SteamLibraries {
    $libs = New-Object System.Collections.Generic.List[string]
    $roots = @("${env:ProgramFiles(x86)}\Steam", "$env:ProgramFiles\Steam")
    foreach ($r in $roots) { if (Test-Path $r) { $libs.Add($r) } }

    foreach ($r in $roots) {
        $vdf = Join-Path $r "steamapps\libraryfolders.vdf"
        if (-not (Test-Path $vdf)) { continue }
        try {
            $text = Get-Content -LiteralPath $vdf -Raw
            foreach ($m in [regex]::Matches($text, '"path"\s*"([^"]+)"')) {
                $p = $m.Groups[1].Value.Replace('\\', '\')
                if (Test-Path $p) { $libs.Add($p) }
            }
        } catch {}
    }

    return $libs | Select-Object -Unique
}

function Test-TargetExists {
    <#
        Whether a shortcut still points at something that is here.

        Only returns $false when the target can be shown to be gone. Steam
        leaves its .url files behind when a game is uninstalled, which is how
        PUBG and Rocket League reached a lock screen with neither installed.
        Anything this cannot check is copied, because failing to copy a game
        that IS installed is the worse mistake by a distance.
    #>
    param([string]$Path)

    try {
        if ($Path.ToLowerInvariant().EndsWith('.url')) {
            $url = $null
            foreach ($line in Get-Content -LiteralPath $Path -ErrorAction Stop) {
                if ($line -match '^\s*URL\s*=\s*(.+)$') { $url = $Matches[1].Trim(); break }
            }
            if (-not $url) { return $true }

            if ($url -match '(?i)^steam://(?:rungameid|run)/(\d+)') {
                $appId = $Matches[1]
                foreach ($lib in Get-SteamLibraries) {
                    if (Test-Path -LiteralPath (Join-Path $lib "steamapps\appmanifest_$appId.acf")) { return $true }
                }
                return $false
            }

            return $true
        }

        $info = Get-ShortcutInfo -Path $Path
        if (-not $info -or [string]::IsNullOrWhiteSpace($info.Target)) { return $true }
        if ($info.Target -match '^[a-z]+://') { return $true }

        return (Test-Path -LiteralPath $info.Target)
    } catch {
        return $true
    }
}

function Test-IsGame {
    param([string]$Name)

    $lower = $Name.ToLowerInvariant().Trim()

    if ($launchers -contains $lower) { return $false }

    foreach ($bad in $notGames) {
        if ($lower.Contains($bad)) { return $false }
    }

    return $true
}

# --- Copy --------------------------------------------------------------------

$shortcuts = @()
$shortcuts += Get-ChildItem -LiteralPath $FromDesktop -Filter *.lnk -File -ErrorAction SilentlyContinue
$shortcuts += Get-ChildItem -LiteralPath $FromDesktop -Filter *.url -File -ErrorAction SilentlyContinue

if ($shortcuts.Count -eq 0) {
    Say "No shortcuts found on $FromDesktop." "Yellow"
    exit 0
}

$copied  = New-Object System.Collections.Generic.List[string]
$skipped = New-Object System.Collections.Generic.List[string]
$failed  = New-Object System.Collections.Generic.List[string]
$dead    = New-Object System.Collections.Generic.List[string]

foreach ($shortcut in $shortcuts) {
    $label = [System.IO.Path]::GetFileNameWithoutExtension($shortcut.Name)

    if (-not (Test-IsGame $label)) {
        $skipped.Add($label)
        continue
    }

    if (-not (Test-TargetExists $shortcut.FullName)) {
        $dead.Add($label)
        continue
    }

    $destination = Join-Path $targetDesktop $shortcut.Name

    if ($WhatIfOnly) {
        $copied.Add($label)
        continue
    }

    try {
        Copy-Item -LiteralPath $shortcut.FullName -Destination $destination -Force
        $copied.Add($label)
    } catch {
        $failed.Add("$label - $($_.Exception.Message)")
    }
}

# --- Mirror ------------------------------------------------------------------

$removed = New-Object System.Collections.Generic.List[string]

if ($Mirror -and -not $WhatIfOnly) {
    $wanted = @{}
    foreach ($shortcut in $shortcuts) {
        $label = [System.IO.Path]::GetFileNameWithoutExtension($shortcut.Name)
        if (Test-IsGame $label) { $wanted[$shortcut.Name] = $true }
    }

    Get-ChildItem -LiteralPath $targetDesktop -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Extension -in @('.lnk', '.url') } |
        ForEach-Object {
            if (-not $wanted.ContainsKey($_.Name)) {
                try {
                    Remove-Item -LiteralPath $_.FullName -Force
                    $removed.Add([System.IO.Path]::GetFileNameWithoutExtension($_.Name))
                } catch {}
            }
        }
}

# --- Report ------------------------------------------------------------------

Say ""
if ($WhatIfOnly) { Say "Nothing was changed. This is what would happen:" "Cyan" }

Say "Games put on the customer desktop ($($copied.Count)):" "Green"
foreach ($name in $copied) { Say "   $name" }

if ($dead.Count -gt 0) {
    Say ""
    Say "Not copied, because what they point at is gone ($($dead.Count)):" "DarkYellow"
    foreach ($name in $dead) { Say "   $name" }
    Say "   Steam leaves its shortcut behind when a game is uninstalled." "DarkGray"
    Say "   Worth deleting these from your own desktop too." "DarkGray"
}

if ($skipped.Count -gt 0) {
    Say ""
    Say "Not copied, because these are not games ($($skipped.Count)):" "DarkYellow"
    foreach ($name in $skipped) { Say "   $name" }
    Say "   Chrome, Steam, Epic, the Xbox app and the NVIDIA panel appear on the" "DarkGray"
    Say "   lock screen's APPS row on their own - they do not need copying." "DarkGray"
}

if ($removed.Count -gt 0) {
    Say ""
    Say "Removed, no longer on your desktop ($($removed.Count)):" "DarkYellow"
    foreach ($name in $removed) { Say "   $name" }
}

if ($failed.Count -gt 0) {
    Say ""
    Say "Could not copy ($($failed.Count)):" "Red"
    foreach ($name in $failed) { Say "   $name" }
}


# --- A way back in ------------------------------------------------------------
#
# Quitting the lock with Ctrl+Alt+Shift+Q leaves the customer desktop showing
# and, until now, nothing to press to get the lock back. The watchdog restarts
# it within a minute, which is not the same as being able to do it deliberately
# — and if the task is disabled, nothing happens at all.
#
# The agent ignores this shortcut when building its menu: it matches on what a
# shortcut points at, so this never appears as something to play.

$agentExe = Join-Path $InstallDir "PcLockAgent.exe"

if (Test-Path -LiteralPath $agentExe) {
    try {
        $lockShortcut = Join-Path $targetDesktop "Lock this PC.lnk"
        $shell = New-Object -ComObject WScript.Shell
        $link = $shell.CreateShortcut($lockShortcut)
        $link.TargetPath = $agentExe
        $link.WorkingDirectory = $InstallDir
        $link.Description = "Start the BookMyGame lock screen again"
        $link.Save()

        Say ""
        Say "Put 'Lock this PC' on the customer desktop." "Green"
        Say "   Double-click it after quitting the lock to bring it straight back." "DarkGray"
    } catch {
        Say ""
        Say "Could not create the 'Lock this PC' shortcut: $_" "Yellow"
        Say "   Not fatal — the watchdog still restarts the lock within a minute." "DarkGray"
    }
} else {
    Say ""
    Say "No agent at $agentExe, so no 'Lock this PC' shortcut was made." "Yellow"
    Say "   Pass -InstallDir if the lock is installed somewhere else." "DarkGray"
}

Say ""
Say "The lock screen shows exactly what is on that desktop." "Cyan"
Say "Add a game later: install it, then run this again." "Cyan"
Say ""
