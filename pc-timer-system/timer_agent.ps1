#Requires -Version 5.0
<#
.SYNOPSIS
    Gaming Cafe - Client Timer Agent  v2.0

.DESCRIPTION
    WHAT THIS DOES:
    Runs silently on each gaming PC at startup. Waits for the admin
    control panel to start a session, then counts down with on-screen
    warnings. Locks the PC when time runs out. Supports live extension
    and crash recovery (if the PC restarts mid-session, the timer resumes
    automatically from saved state).

    INSTALL:    C:\CafeTimer\timer_agent.ps1
    TRIGGERS:   Read from C:\CafeTimer\ (shared as \\PCNAME\CafeTimer)
    RUNS AS:    SYSTEM (via Task Scheduler — gamers cannot kill it)

    TRIGGER FILES written by the admin panel:
      start.txt   ->  "120"  or  "120|CustomerName"  (minutes | optional name)
      extend.txt  ->  "30"   (minutes to add)
      stop.txt    ->  any content  (lock PC immediately)
      unlock.txt  ->  any content  (logoff — triggers auto-login)

    OUTPUT FILES read by the admin panel:
      status.json ->  current PC status (updated every poll cycle)
      session_log.csv -> session history (admin generates daily report from this)
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "SilentlyContinue"

# =======================================================================
## CONFIGURATION — Edit values in this section only
# =======================================================================
$Config = @{
    # Folder where trigger files and state are stored (MUST be shared on network)
    TimerFolder   = "C:\CafeTimer"

    # How often to check for trigger files (seconds)
    PollSeconds   = 5

    # Play a sound on warning popups (set to $false to disable)
    SoundEnabled  = $true

    # Message shown on the Windows lock screen after session ends
    LockMessage   = "Session Ended — Please visit the counter to continue playing."

    # PC name shown in logs and status (auto-detected, or set manually e.g. "PC01")
    PCName        = $env:COMPUTERNAME
}
# =======================================================================

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# ---- Derived paths (do not edit) ----
$LogFile    = Join-Path $Config.TimerFolder "timer.log"
$SessionLog = Join-Path $Config.TimerFolder "session_log.csv"
$StateFile  = Join-Path $Config.TimerFolder "state.json"
$StatusFile = Join-Path $Config.TimerFolder "status.json"
$StartFile  = Join-Path $Config.TimerFolder "start.txt"
$ExtendFile = Join-Path $Config.TimerFolder "extend.txt"
$StopFile   = Join-Path $Config.TimerFolder "stop.txt"
$UnlockFile = Join-Path $Config.TimerFolder "unlock.txt"


# =======================================================================
# LOGGING
# =======================================================================
function Write-Log([string]$Msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$ts  [$($Config.PCName)]  $Msg" | Out-File -FilePath $LogFile -Append -Encoding UTF8
}


# =======================================================================
# SESSION CSV LOG
# =======================================================================
function Write-SessionLog {
    param(
        [string]$CustomerName,
        [datetime]$StartTime,
        [datetime]$EndTime,
        [int]$OriginalMinutes,
        [bool]$Extended,
        [int]$ExtensionMinutes
    )
    $duration = [int][math]::Max(1, ($EndTime - $StartTime).TotalMinutes)

    # Create CSV header if file does not exist yet
    if (-not (Test-Path $SessionLog)) {
        "PC_Name,Customer_Name,Start_Time,End_Time,Duration_Minutes,Extended,Extension_Minutes" |
            Out-File -FilePath $SessionLog -Encoding UTF8
    }

    "$($Config.PCName),$CustomerName,$($StartTime.ToString('yyyy-MM-dd HH:mm:ss')),$($EndTime.ToString('yyyy-MM-dd HH:mm:ss')),$duration,$(if($Extended){'Yes'}else{'No'}),$ExtensionMinutes" |
        Out-File -FilePath $SessionLog -Append -Encoding UTF8
}


# =======================================================================
# STATE MANAGEMENT  (crash recovery)
# =======================================================================
function Save-State([hashtable]$State) {
    # Write session state to disk so it survives a crash/reboot
    $State | ConvertTo-Json -Depth 3 |
        Out-File -FilePath $StateFile -Encoding UTF8 -Force
}

function Load-State {
    if (-not (Test-Path $StateFile)) { return $null }
    try {
        $json = Get-Content $StateFile -Raw | ConvertFrom-Json
        return @{
            Status           = [string]$json.Status
            CustomerName     = [string]$json.CustomerName
            StartTime        = [datetime]$json.StartTime
            EndTime          = [datetime]$json.EndTime
            OriginalMinutes  = [int]$json.OriginalMinutes
            Extended         = [bool]$json.Extended
            ExtensionMinutes = [int]$json.ExtensionMinutes
        }
    } catch {
        Write-Log "Failed to load state: $_"
        return $null
    }
}

function Clear-State {
    if (Test-Path $StateFile) { Remove-Item $StateFile -Force -ErrorAction SilentlyContinue }
}

function Write-Status([string]$StatusStr, [string]$Customer = "", [nullable[datetime]]$EndTime = $null) {
    $remaining = if ($EndTime) {
        [int][math]::Max(0, ($EndTime - (Get-Date)).TotalSeconds)
    } else { $null }

    @{
        status         = $StatusStr
        customer_name  = $Customer
        end_time       = if ($EndTime) { $EndTime.ToString("o") } else { $null }
        remaining_secs = $remaining
        pc_name        = $Config.PCName
        last_update    = (Get-Date).ToString("o")
    } | ConvertTo-Json | Out-File -FilePath $StatusFile -Encoding UTF8 -Force
}


# =======================================================================
# GAMING-STYLE POPUP  (TopMost, dark theme — stays over fullscreen games)
# =======================================================================
function Show-GameWarning {
    param(
        [string]$Title,
        [string]$Message,
        [string]$AccentColor    = "Orange",   # Orange | Red | Green | Purple
        [int]$AutoCloseSeconds  = 0           # 0 = stays until dismissed
    )

    # Run the popup in a separate runspace so the timer loop is NOT blocked
    $rs = [System.Management.Automation.Runspaces.RunspaceFactory]::CreateRunspace()
    $rs.Open()
    $ps = [powershell]::Create()
    $ps.Runspace = $rs
    $ps.AddScript({
        param($Title, $Message, $AccentColor, $AutoSecs, $SoundOn)

        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing

        # Map color name to RGB
        $accent = switch ($AccentColor) {
            "Red"    { [Drawing.Color]::FromArgb(239, 68,  68)  }
            "Green"  { [Drawing.Color]::FromArgb(16,  185, 129) }
            "Purple" { [Drawing.Color]::FromArgb(167, 139, 250) }
            default  { [Drawing.Color]::FromArgb(251, 146, 60)  }  # Orange
        }

        $form                 = New-Object Windows.Forms.Form
        $form.Text            = "Gaming Cafe"
        $form.BackColor       = [Drawing.Color]::FromArgb(13, 13, 26)
        $form.ForeColor       = [Drawing.Color]::White
        $form.TopMost         = $true          # Stays above fullscreen games
        $form.StartPosition   = "CenterScreen"
        $form.Size            = New-Object Drawing.Size(520, 225)
        $form.FormBorderStyle = "FixedSingle"
        $form.MaximizeBox     = $false
        $form.MinimizeBox     = $false
        $form.ShowInTaskbar   = $false

        # Accent bar across the top
        $bar           = New-Object Windows.Forms.Panel
        $bar.Location  = New-Object Drawing.Point(0, 0)
        $bar.Size      = New-Object Drawing.Size(520, 5)
        $bar.BackColor = $accent

        # Title label
        $lblT          = New-Object Windows.Forms.Label
        $lblT.Text     = $Title
        $lblT.Font     = New-Object Drawing.Font("Segoe UI", 14, [Drawing.FontStyle]::Bold)
        $lblT.ForeColor = $accent
        $lblT.Location = New-Object Drawing.Point(20, 18)
        $lblT.AutoSize = $true

        # Message label
        $lblM          = New-Object Windows.Forms.Label
        $lblM.Text     = $Message
        $lblM.Font     = New-Object Drawing.Font("Segoe UI", 10)
        $lblM.ForeColor = [Drawing.Color]::FromArgb(203, 213, 225)
        $lblM.Location = New-Object Drawing.Point(20, 58)
        $lblM.Size     = New-Object Drawing.Size(480, 70)

        # OK button
        $btn              = New-Object Windows.Forms.Button
        $btn.Text         = "  OK  "
        $btn.Font         = New-Object Drawing.Font("Segoe UI", 10, [Drawing.FontStyle]::Bold)
        $btn.Location     = New-Object Drawing.Point(195, 150)
        $btn.Size         = New-Object Drawing.Size(130, 38)
        $btn.BackColor    = [Drawing.Color]::FromArgb(124, 58, 237)
        $btn.ForeColor    = [Drawing.Color]::White
        $btn.FlatStyle    = "Flat"
        $btn.Cursor       = [Windows.Forms.Cursors]::Hand
        $btn.Add_Click({ $form.Close() })

        $form.Controls.AddRange(@($bar, $lblT, $lblM, $btn))
        $form.AcceptButton = $btn

        # Play system sound
        if ($SoundOn) {
            [System.Media.SystemSounds]::Exclamation.Play()
        }

        # Auto-close timer
        if ($AutoSecs -gt 0) {
            $t          = New-Object Windows.Forms.Timer
            $t.Interval = $AutoSecs * 1000
            $t.Add_Tick({ $form.Close(); $t.Stop() })
            $t.Start()
        }

        # Force popup above fullscreen DirectX/OpenGL applications
        $form.Add_Shown({
            $form.Activate()
            $form.BringToFront()
            [Windows.Forms.Application]::DoEvents()
        })

        [Windows.Forms.Application]::Run($form)

    }).AddParameters(@{
        Title      = $Title
        Message    = $Message
        AccentColor = $AccentColor
        AutoSecs   = $AutoCloseSeconds
        SoundOn    = $Config.SoundEnabled
    }) | Out-Null

    $ps.BeginInvoke() | Out-Null
    # The runspace self-closes when the form closes — no leak
}


# =======================================================================
# LOCK SCREEN MESSAGE  (shown on Windows login screen after PC locks)
# =======================================================================
function Set-LockScreenMessage([string]$Msg) {
    $key = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System"
    try {
        Set-ItemProperty -Path $key -Name "legalnoticecaption" -Value "Session Ended"  -Type String -Force
        Set-ItemProperty -Path $key -Name "legalnoticetext"    -Value $Msg             -Type String -Force
    } catch { Write-Log "Could not set lock screen message: $_" }
}

function Clear-LockScreenMessage {
    $key = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System"
    try {
        Set-ItemProperty -Path $key -Name "legalnoticecaption" -Value "" -Type String -Force
        Set-ItemProperty -Path $key -Name "legalnoticetext"    -Value "" -Type String -Force
    } catch {}
}


# =======================================================================
# LOCK PC  (end of session)
# =======================================================================
function Lock-PC {
    param(
        [string]$CustomerName,
        [datetime]$StartTime,
        [datetime]$EndTime,
        [bool]$Extended,
        [int]$ExtMins
    )
    Write-Log "Locking PC — session ended for '$CustomerName'"

    Set-LockScreenMessage $Config.LockMessage

    Show-GameWarning `
        -Title            "SESSION ENDED" `
        -Message          "Your gaming session has ended.`nPlease visit the counter to continue playing.`nThank you, $CustomerName!" `
        -AccentColor      "Red" `
        -AutoCloseSeconds 8

    Start-Sleep -Seconds 4

    # Write session to CSV log before wiping state
    Write-SessionLog `
        -CustomerName    $CustomerName `
        -StartTime       $StartTime `
        -EndTime         $EndTime `
        -OriginalMinutes ([int]($EndTime - $StartTime).TotalMinutes) `
        -Extended        $Extended `
        -ExtensionMinutes $ExtMins

    Clear-State
    Write-Status "locked"

    Start-Sleep -Seconds 2
    rundll32.exe user32.dll,LockWorkStation
}


# =======================================================================
# UNLOCK / LOGOFF  (admin-triggered — fires when auto-login is configured)
# =======================================================================
function Invoke-Unlock {
    Write-Log "Unlock command received — logging off active session"
    # Logoff the active desktop session so Windows auto-login kicks in
    $qResult = query session 2>&1
    foreach ($line in $qResult) {
        if ($line -match "Active") {
            # Extract session ID (3rd token in quser output)
            $tokens = $line -split '\s+' | Where-Object { $_ -ne "" }
            $sessionId = $tokens[2]
            if ($sessionId -match '^\d+$') {
                logoff $sessionId /server:localhost 2>$null
                Write-Log "Logged off session ID $sessionId"
                return
            }
        }
    }
    Write-Log "Could not find active session to logoff"
}


# =======================================================================
# TRIGGER FILE READER  (deduplication via file age)
# =======================================================================
function Read-Trigger([string]$Path) {
    if (-not (Test-Path $Path)) { return $null }

    # Ignore files older than 60 seconds — prevents duplicate execution
    # if the admin writes the same file twice rapidly
    $age = (Get-Date) - (Get-Item $Path -ErrorAction SilentlyContinue).LastWriteTime
    if ($age.TotalSeconds -gt 60) {
        Remove-Item $Path -Force -ErrorAction SilentlyContinue
        Write-Log "Discarded stale trigger: $(Split-Path $Path -Leaf) (age: $([int]$age.TotalSeconds)s)"
        return $null
    }

    $content = (Get-Content $Path -Raw -ErrorAction SilentlyContinue).Trim()
    Remove-Item $Path -Force -ErrorAction SilentlyContinue
    return $content
}


# =======================================================================
# STARTUP
# =======================================================================
if (-not (Test-Path $Config.TimerFolder)) {
    New-Item -ItemType Directory -Path $Config.TimerFolder -Force | Out-Null
}

# Remove stale trigger files from any previous session/crash
foreach ($f in @($StartFile, $ExtendFile, $StopFile, $UnlockFile)) {
    if (Test-Path $f) { Remove-Item $f -Force -ErrorAction SilentlyContinue }
}

Write-Log "=== Timer Agent v2.0 started (PID: $PID, PC: $($Config.PCName)) ==="


# =======================================================================
# CRASH RECOVERY  — resume if session was active when PC restarted
# =======================================================================
$recoveredSession = $null
$savedState = Load-State

if ($savedState -and $savedState.Status -eq "running") {
    $secondsLeft = ($savedState.EndTime - (Get-Date)).TotalSeconds

    if ($secondsLeft -gt 10) {
        # Session is still valid — resume it
        Write-Log "CRASH RECOVERY: Resuming '$($savedState.CustomerName)' — $([int]$secondsLeft)s left"
        Show-GameWarning `
            -Title            "Session Resumed" `
            -Message          "Your session has been restored after a restart.`n$([int]($secondsLeft/60)) minutes remaining, $($savedState.CustomerName)!" `
            -AccentColor      "Green" `
            -AutoCloseSeconds 12
        $recoveredSession = $savedState
    } else {
        # Session expired while PC was off — lock it now
        Write-Log "CRASH RECOVERY: Session had expired ($([int]$secondsLeft)s) — locking"
        Lock-PC `
            -CustomerName $savedState.CustomerName `
            -StartTime    $savedState.StartTime `
            -EndTime      $savedState.EndTime `
            -Extended     $savedState.Extended `
            -ExtMins      $savedState.ExtensionMinutes
    }
} else {
    Clear-State
}


# =======================================================================
# MAIN SESSION LOOP
# =======================================================================
while ($true) {

    # ------------------------------------------------------------------
    # IDLE PHASE — wait for a start.txt trigger
    # ------------------------------------------------------------------
    if (-not $recoveredSession) {
        Write-Status "idle"
        Write-Log "Idle — waiting for start trigger"

        while ($true) {
            # Handle admin commands even while idle
            if (Read-Trigger $UnlockFile) { Invoke-Unlock }
            Read-Trigger $StopFile | Out-Null   # clear stale stops

            $raw = Read-Trigger $StartFile
            if ($raw) { break }

            Start-Sleep -Seconds $Config.PollSeconds
        }

        # Parse: "120" or "120|CustomerName"
        $parts        = $raw -split '\|'
        $totalMinutes = [int]($parts[0].Trim())
        $customerName = if ($parts.Count -gt 1 -and $parts[1].Trim()) { $parts[1].Trim() } else { "Guest" }

        if ($totalMinutes -le 0) {
            Write-Log "Invalid duration in start.txt: '$raw' — skipping"
            continue
        }

        $sessionStart = Get-Date
        $sessionEnd   = $sessionStart.AddMinutes($totalMinutes)

        # Persist state immediately (crash recovery)
        $sessionState = @{
            Status           = "running"
            CustomerName     = $customerName
            StartTime        = $sessionStart.ToString("o")
            EndTime          = $sessionEnd.ToString("o")
            OriginalMinutes  = $totalMinutes
            Extended         = $false
            ExtensionMinutes = 0
        }
        Save-State $sessionState

        Write-Log "Session STARTED: $totalMinutes min for '$customerName' — ends $($sessionEnd.ToString('HH:mm:ss'))"

        Show-GameWarning `
            -Title            "Session Started! ($totalMinutes min)" `
            -Message          "Welcome, $customerName!`nYour session ends at $($sessionEnd.ToString('HH:mm')).`nYou will get warnings at 15 and 2 minutes remaining." `
            -AccentColor      "Green" `
            -AutoCloseSeconds 12

    } else {
        # Restore from crash recovery data
        $customerName = $recoveredSession.CustomerName
        $sessionStart = $recoveredSession.StartTime
        $sessionEnd   = $recoveredSession.EndTime
        $sessionState = @{
            Status           = "running"
            CustomerName     = $customerName
            StartTime        = $sessionStart.ToString("o")
            EndTime          = $sessionEnd.ToString("o")
            OriginalMinutes  = $recoveredSession.OriginalMinutes
            Extended         = $recoveredSession.Extended
            ExtensionMinutes = $recoveredSession.ExtensionMinutes
        }
        $recoveredSession = $null   # clear so next iteration enters idle phase
    }

    # ------------------------------------------------------------------
    # RUNNING PHASE — countdown until stop/time-up
    # ------------------------------------------------------------------
    $warned15 = $false
    $warned2  = $false

    while ($true) {
        $now       = Get-Date
        $remaining = $sessionEnd - $now

        # Update status.json for the admin dashboard
        Write-Status "running" $customerName $sessionEnd

        # ---- Check trigger files ----

        # STOP — lock immediately
        if (Read-Trigger $StopFile) {
            Write-Log "Stop command received for '$customerName'"
            Lock-PC -CustomerName $customerName -StartTime $sessionStart -EndTime $now `
                    -Extended $sessionState.Extended -ExtMins $sessionState.ExtensionMinutes
            break
        }

        # EXTEND — add minutes
        $extRaw = Read-Trigger $ExtendFile
        if ($extRaw -and $extRaw -match '^\d+$') {
            $extra       = [int]$extRaw
            $sessionEnd  = $sessionEnd.AddMinutes($extra)
            $sessionState.Extended          = $true
            $sessionState.ExtensionMinutes += $extra
            $sessionState.EndTime           = $sessionEnd.ToString("o")
            # Re-arm warnings if we added significant time
            if ($extra -ge 10) { $warned15 = $false; $warned2 = $false }
            Save-State $sessionState
            Write-Log "Extended by $extra min — new end: $($sessionEnd.ToString('HH:mm:ss'))"
            Show-GameWarning `
                -Title            "Time Extended! +$extra Minutes" `
                -Message          "Your session now ends at $($sessionEnd.ToString('HH:mm')).`nKeep playing, $customerName!" `
                -AccentColor      "Green" `
                -AutoCloseSeconds 10
            continue
        }

        # UNLOCK in running state — ignore (session is already active)
        if (Read-Trigger $UnlockFile) {
            Write-Log "Unlock trigger during active session — ignored"
        }

        # ---- Time checks ----

        # Time up
        if ($remaining.TotalSeconds -le 0) {
            Lock-PC -CustomerName $customerName -StartTime $sessionStart -EndTime $now `
                    -Extended $sessionState.Extended -ExtMins $sessionState.ExtensionMinutes
            break
        }

        # 15-minute warning
        if (-not $warned15 -and $remaining.TotalMinutes -le 15.5 -and $remaining.TotalMinutes -gt 14.5) {
            $warned15 = $true
            Write-Log "15-min warning for '$customerName'"
            Show-GameWarning `
                -Title            "15 Minutes Remaining" `
                -Message          "Your session ends in 15 minutes.`nVisit the counter to extend your time, $customerName!" `
                -AccentColor      "Orange" `
                -AutoCloseSeconds 20
        }

        # 2-minute warning
        if (-not $warned2 -and $remaining.TotalMinutes -le 2.5 -and $remaining.TotalMinutes -gt 1.5) {
            $warned2 = $true
            Write-Log "2-min WARNING for '$customerName'"
            Show-GameWarning `
                -Title            "ONLY 2 MINUTES LEFT!" `
                -Message          "Your session ends in 2 MINUTES!`nAsk the staff to extend your session RIGHT NOW, $customerName!" `
                -AccentColor      "Red" `
                -AutoCloseSeconds 30
        }

        Start-Sleep -Seconds $Config.PollSeconds
    }

    Write-Log "Session loop ended for '$customerName'"
}
