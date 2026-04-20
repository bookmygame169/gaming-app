#Requires -Version 5.0
<#
.SYNOPSIS
    Gaming Cafe Admin Control Panel  v2.0

.DESCRIPTION
    WHAT THIS DOES:
    A single-file PowerShell WinForms dashboard for cafe staff.
    Shows all gaming PCs in a live table with colour-coded status.
    Staff can Start, Extend, End, or Unlock sessions with one click.
    Auto-refreshes every 30 seconds. PIN-protected. No installs needed.

    RUNS ON:   Admin PC only
    REQUIRES:  C:\CafeTimer\ shared as \\PCNAME\CafeTimer on each gaming PC
    READS:     \\PCNAME\CafeTimer\status.json  (written by timer_agent.ps1)
    WRITES:    \\PCNAME\CafeTimer\start.txt / extend.txt / stop.txt / unlock.txt
    LOGS:      C:\CafeManager\logs\sessions.csv  (aggregated from all PCs)
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "SilentlyContinue"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing


# =======================================================================
## CONFIGURATION — Edit values in this section only
# =======================================================================
$Config = @{
    # Path to the PC name list (one PC name per line, e.g. PC01, GAMING-01)
    PCListFile      = "C:\CafeManager\config\pcs.txt"

    # Shared folder name on each gaming PC (set up by setup_client_pc.bat)
    ShareName       = "CafeTimer"

    # PIN to open this control panel (change to your own PIN)
    AdminPIN        = "1234"

    # Where to save the aggregated session log on THIS admin PC
    LogPath         = "C:\CafeManager\logs\sessions.csv"

    # PsExec path (used only for the Unlock fallback via PsExec)
    PsExecPath      = "C:\Tools\PsExec.exe"

    # Windows admin credentials for gaming PCs (used for PsExec unlock)
    AdminUser       = "Administrator"
    AdminPass       = "CHANGE_THIS_PASSWORD"

    # Auto-refresh interval (seconds)
    RefreshSeconds  = 30

    # Quick-extend button values (minutes)
    ExtendOptions   = @(15, 30, 60, 90, 120)

    # Session duration dropdown options
    DurationOptions = @(
        @{ Label = "30 Minutes"; Value = 30  }
        @{ Label = "1 Hour";     Value = 60  }
        @{ Label = "1.5 Hours";  Value = 90  }
        @{ Label = "2 Hours";    Value = 120 }
        @{ Label = "3 Hours";    Value = 180 }
        @{ Label = "4 Hours";    Value = 240 }
        @{ Label = "5 Hours";    Value = 300 }
        @{ Label = "Custom...";  Value = -1  }
    )
}
# =======================================================================


# ---- Colour palette ----
$C = @{
    BgDark      = [Drawing.Color]::FromArgb(13,  13,  26)
    BgCard      = [Drawing.Color]::FromArgb(22,  22,  40)
    BgPanel     = [Drawing.Color]::FromArgb(17,  17,  34)
    Text        = [Drawing.Color]::FromArgb(226, 232, 240)
    TextMuted   = [Drawing.Color]::FromArgb(100, 116, 139)
    PurpleLight = [Drawing.Color]::FromArgb(167, 139, 250)
    Purple      = [Drawing.Color]::FromArgb(124, 58,  237)
    GreenBg     = [Drawing.Color]::FromArgb(6,   78,  59)
    GreenFg     = [Drawing.Color]::FromArgb(16,  185, 129)
    AmberBg     = [Drawing.Color]::FromArgb(120, 80,  0)
    AmberFg     = [Drawing.Color]::FromArgb(245, 158, 11)
    RedBg       = [Drawing.Color]::FromArgb(127, 29,  29)
    RedFg       = [Drawing.Color]::FromArgb(239, 68,  68)
    GrayBg      = [Drawing.Color]::FromArgb(31,  41,  55)
    GrayFg      = [Drawing.Color]::FromArgb(107, 114, 128)
    Border      = [Drawing.Color]::FromArgb(42,  42,  74)
    White       = [Drawing.Color]::White
}


# =======================================================================
# HELPERS
# =======================================================================

function Get-PCList {
    if (Test-Path $Config.PCListFile) {
        return (Get-Content $Config.PCListFile) |
               Where-Object { $_ -match '\S' } |
               ForEach-Object { $_.Trim().ToUpper() }
    }
    # Fallback if file is missing
    return @("PC01","PC02","PC03","PC04")
}

function Get-PCStatus([string]$PCName) {
    $file = "\\$PCName\$($Config.ShareName)\status.json"
    try {
        if (Test-Path $file) {
            $json = Get-Content $file -Raw | ConvertFrom-Json
            # Mark as stale if last update was more than 2 minutes ago
            if ($json.last_update) {
                $age = (Get-Date) - [datetime]$json.last_update
                if ($age.TotalMinutes -gt 2) { $json.status = "stale" }
            }
            return $json
        }
    } catch {}
    return [PSCustomObject]@{
        status         = "offline"
        customer_name  = ""
        end_time       = $null
        remaining_secs = $null
        last_update    = $null
    }
}

function Write-Trigger([string]$PCName, [string]$Filename, [string]$Content) {
    $path = "\\$PCName\$($Config.ShareName)\$Filename"
    try {
        $Content | Out-File -FilePath $path -Encoding ASCII -Force -NoNewline
        return $true
    } catch {
        return $false
    }
}

function Format-Remaining([object]$Secs) {
    if ($null -eq $Secs -or [int]$Secs -le 0) { return "--:--" }
    $m = [math]::Floor([int]$Secs / 60)
    $s = [int]$Secs % 60
    return "{0:D2}:{1:D2}" -f $m, $s
}

function Get-RowColor([string]$Status, [object]$RemSecs) {
    switch ($Status) {
        "running" {
            $r = if ($RemSecs) { [int]$RemSecs } else { 9999 }
            if ($r -le 120) { return @{ Bg = $C.RedBg;   Fg = $C.RedFg   } }
            if ($r -le 900) { return @{ Bg = $C.AmberBg; Fg = $C.AmberFg } }
            return            @{ Bg = $C.GreenBg; Fg = $C.GreenFg }
        }
        "locked"  { return @{ Bg = $C.RedBg;  Fg = $C.RedFg   } }
        "stale"   { return @{ Bg = $C.AmberBg; Fg = $C.AmberFg } }
        "idle"    { return @{ Bg = $C.GrayBg; Fg = $C.GrayFg  } }
        default   { return @{ Bg = $C.BgCard; Fg = $C.TextMuted } }  # offline/unknown
    }
}

function Make-Btn([string]$Text, [Drawing.Color]$Bg, [int]$X, [int]$Y, [int]$W = 155, [int]$H = 36) {
    $b            = New-Object Windows.Forms.Button
    $b.Text       = $Text
    $b.Location   = New-Object Drawing.Point($X, $Y)
    $b.Size       = New-Object Drawing.Size($W, $H)
    $b.BackColor  = $Bg
    $b.ForeColor  = $C.White
    $b.FlatStyle  = "Flat"
    $b.Font       = New-Object Drawing.Font("Segoe UI", 9, [Drawing.FontStyle]::Bold)
    $b.Cursor     = [Windows.Forms.Cursors]::Hand
    $b.FlatAppearance.BorderColor = [Drawing.Color]::FromArgb(60,60,80)
    return $b
}


# =======================================================================
# PIN DIALOG
# =======================================================================
function Show-PINDialog {
    $dlg                 = New-Object Windows.Forms.Form
    $dlg.Text            = "Gaming Cafe — Admin Login"
    $dlg.BackColor       = $C.BgDark
    $dlg.ForeColor       = $C.Text
    $dlg.Size            = New-Object Drawing.Size(360, 250)
    $dlg.StartPosition   = "CenterScreen"
    $dlg.FormBorderStyle = "FixedDialog"
    $dlg.MaximizeBox     = $false
    $dlg.MinimizeBox     = $false

    $lbl           = New-Object Windows.Forms.Label
    $lbl.Text      = "Enter Admin PIN"
    $lbl.Font      = New-Object Drawing.Font("Segoe UI", 13, [Drawing.FontStyle]::Bold)
    $lbl.ForeColor = $C.PurpleLight
    $lbl.Location  = New-Object Drawing.Point(20, 30)
    $lbl.AutoSize  = $true

    $txt                       = New-Object Windows.Forms.TextBox
    $txt.UseSystemPasswordChar = $true
    $txt.Font                  = New-Object Drawing.Font("Segoe UI", 14)
    $txt.Location              = New-Object Drawing.Point(20, 75)
    $txt.Size                  = New-Object Drawing.Size(310, 35)
    $txt.BackColor             = $C.BgCard
    $txt.ForeColor             = $C.Text
    $txt.BorderStyle           = "FixedSingle"

    $err           = New-Object Windows.Forms.Label
    $err.ForeColor = $C.RedFg
    $err.Location  = New-Object Drawing.Point(20, 118)
    $err.AutoSize  = $true

    $btn           = New-Object Windows.Forms.Button
    $btn.Text      = "  Login  "
    $btn.Font      = New-Object Drawing.Font("Segoe UI", 10, [Drawing.FontStyle]::Bold)
    $btn.Location  = New-Object Drawing.Point(100, 148)
    $btn.Size      = New-Object Drawing.Size(160, 42)
    $btn.BackColor = $C.Purple
    $btn.ForeColor = $C.White
    $btn.FlatStyle = "Flat"

    $script:pinOk = $false
    $check = {
        if ($txt.Text -eq $Config.AdminPIN) {
            $script:pinOk = $true
            $dlg.DialogResult = [Windows.Forms.DialogResult]::OK
            $dlg.Close()
        } else {
            $err.Text = "Incorrect PIN. Please try again."
            $txt.Clear()
            $txt.Focus()
        }
    }
    $btn.Add_Click($check)
    $txt.Add_KeyDown({ if ($_.KeyCode -eq "Return") { & $check } })

    $dlg.Controls.AddRange(@($lbl, $txt, $err, $btn))
    $dlg.AcceptButton = $btn
    $dlg.ShowDialog() | Out-Null
    return $script:pinOk
}


# =======================================================================
# START SESSION DIALOG
# =======================================================================
function Show-StartDialog([string]$PCName) {
    $dlg                 = New-Object Windows.Forms.Form
    $dlg.Text            = "Start Session — $PCName"
    $dlg.BackColor       = $C.BgDark
    $dlg.ForeColor       = $C.Text
    $dlg.Size            = New-Object Drawing.Size(380, 285)
    $dlg.StartPosition   = "CenterScreen"
    $dlg.FormBorderStyle = "FixedDialog"
    $dlg.MaximizeBox     = $false

    $lblCust           = New-Object Windows.Forms.Label
    $lblCust.Text      = "Customer Name (optional):"
    $lblCust.Font      = New-Object Drawing.Font("Segoe UI", 9)
    $lblCust.Location  = New-Object Drawing.Point(20, 20)
    $lblCust.AutoSize  = $true

    $txtCust             = New-Object Windows.Forms.TextBox
    $txtCust.Text        = "Guest"
    $txtCust.Font        = New-Object Drawing.Font("Segoe UI", 10)
    $txtCust.Location    = New-Object Drawing.Point(20, 42)
    $txtCust.Size        = New-Object Drawing.Size(330, 28)
    $txtCust.BackColor   = $C.BgCard
    $txtCust.ForeColor   = $C.Text
    $txtCust.BorderStyle = "FixedSingle"

    $lblDur          = New-Object Windows.Forms.Label
    $lblDur.Text     = "Session Duration:"
    $lblDur.Font     = New-Object Drawing.Font("Segoe UI", 9)
    $lblDur.Location = New-Object Drawing.Point(20, 85)
    $lblDur.AutoSize = $true

    $combo               = New-Object Windows.Forms.ComboBox
    $combo.DropDownStyle = "DropDownList"
    $combo.Font          = New-Object Drawing.Font("Segoe UI", 10)
    $combo.Location      = New-Object Drawing.Point(20, 107)
    $combo.Size          = New-Object Drawing.Size(330, 28)
    $combo.BackColor     = $C.BgCard
    $combo.ForeColor     = $C.Text
    foreach ($opt in $Config.DurationOptions) { $combo.Items.Add($opt.Label) | Out-Null }
    $combo.SelectedIndex = 1   # default: 1 Hour

    $lblCustom          = New-Object Windows.Forms.Label
    $lblCustom.Text     = "Custom minutes:"
    $lblCustom.Font     = New-Object Drawing.Font("Segoe UI", 9)
    $lblCustom.Location = New-Object Drawing.Point(20, 148)
    $lblCustom.AutoSize = $true
    $lblCustom.Visible  = $false

    $txtCustom             = New-Object Windows.Forms.TextBox
    $txtCustom.Font        = New-Object Drawing.Font("Segoe UI", 10)
    $txtCustom.Location    = New-Object Drawing.Point(20, 168)
    $txtCustom.Size        = New-Object Drawing.Size(120, 28)
    $txtCustom.BackColor   = $C.BgCard
    $txtCustom.ForeColor   = $C.Text
    $txtCustom.BorderStyle = "FixedSingle"
    $txtCustom.Visible     = $false

    $combo.Add_SelectedIndexChanged({
        $isCustom           = ($Config.DurationOptions[$combo.SelectedIndex].Value -eq -1)
        $lblCustom.Visible  = $isCustom
        $txtCustom.Visible  = $isCustom
        if ($isCustom) { $dlg.Height = 315 } else { $dlg.Height = 285 }
    })

    $btnOk           = New-Object Windows.Forms.Button
    $btnOk.Text      = "  ▶  Start Session  "
    $btnOk.Font      = New-Object Drawing.Font("Segoe UI", 10, [Drawing.FontStyle]::Bold)
    $btnOk.Location  = New-Object Drawing.Point(65, 230)
    $btnOk.Size      = New-Object Drawing.Size(250, 38)
    $btnOk.BackColor = $C.GreenFg
    $btnOk.ForeColor = $C.White
    $btnOk.FlatStyle = "Flat"

    $script:startResult = $null
    $btnOk.Add_Click({
        $selOpt = $Config.DurationOptions[$combo.SelectedIndex]
        $mins   = if ($selOpt.Value -eq -1) {
            if ($txtCustom.Text -match '^\d+$') { [int]$txtCustom.Text } else { 0 }
        } else { $selOpt.Value }

        if ($mins -le 0) {
            [Windows.Forms.MessageBox]::Show("Please enter a valid duration.", "Invalid Duration", "OK", "Warning") | Out-Null
            return
        }
        $script:startResult = @{ Minutes = $mins; CustomerName = $txtCust.Text.Trim() }
        $dlg.DialogResult   = [Windows.Forms.DialogResult]::OK
        $dlg.Close()
    })

    $dlg.Controls.AddRange(@($lblCust, $txtCust, $lblDur, $combo, $lblCustom, $txtCustom, $btnOk))
    $dlg.AcceptButton = $btnOk
    $dlg.ShowDialog() | Out-Null
    return $script:startResult
}


# =======================================================================
# EXTEND SESSION DIALOG
# =======================================================================
function Show-ExtendDialog([string]$PCName) {
    $dlg                 = New-Object Windows.Forms.Form
    $dlg.Text            = "Extend Session — $PCName"
    $dlg.BackColor       = $C.BgDark
    $dlg.ForeColor       = $C.Text
    $dlg.Size            = New-Object Drawing.Size(370, 165)
    $dlg.StartPosition   = "CenterScreen"
    $dlg.FormBorderStyle = "FixedDialog"
    $dlg.MaximizeBox     = $false

    $lbl          = New-Object Windows.Forms.Label
    $lbl.Text     = "Add how many minutes to $PCName?"
    $lbl.Font     = New-Object Drawing.Font("Segoe UI", 10)
    $lbl.Location = New-Object Drawing.Point(20, 18)
    $lbl.AutoSize = $true

    $flow             = New-Object Windows.Forms.FlowLayoutPanel
    $flow.Location    = New-Object Drawing.Point(20, 50)
    $flow.Size        = New-Object Drawing.Size(325, 60)
    $flow.BackColor   = $C.BgDark
    $flow.WrapContents = $true

    $script:extendResult = $null
    foreach ($mins in $Config.ExtendOptions) {
        $b           = New-Object Windows.Forms.Button
        $b.Text      = "+${mins}m"
        $b.Size      = New-Object Drawing.Size(60, 38)
        $b.BackColor = $C.Purple
        $b.ForeColor = $C.White
        $b.FlatStyle = "Flat"
        $b.Font      = New-Object Drawing.Font("Segoe UI", 9, [Drawing.FontStyle]::Bold)
        $b.Tag       = $mins
        $b.Add_Click({
            $script:extendResult = [int]$this.Tag
            $dlg.DialogResult    = [Windows.Forms.DialogResult]::OK
            $dlg.Close()
        })
        $flow.Controls.Add($b)
    }

    $dlg.Controls.AddRange(@($lbl, $flow))
    $dlg.ShowDialog() | Out-Null
    return $script:extendResult
}


# =======================================================================
# DAILY REPORT
# =======================================================================
function Show-DailyReport {
    $pcs     = Get-PCList
    $allRows = [System.Collections.Generic.List[object]]::new()

    foreach ($pc in $pcs) {
        $logFile = "\\$pc\$($Config.ShareName)\session_log.csv"
        if (Test-Path $logFile) {
            try { Import-Csv $logFile | ForEach-Object { $allRows.Add($_) } } catch {}
        }
    }

    if ($allRows.Count -eq 0) {
        [Windows.Forms.MessageBox]::Show(
            "No session logs found yet on any PC.`nLogs appear after a session ends.",
            "Report", "OK", "Information") | Out-Null
        return
    }

    # Save aggregated log to admin PC
    $dir = Split-Path $Config.LogPath -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory $dir -Force | Out-Null }
    $allRows | Export-Csv -Path $Config.LogPath -NoTypeInformation -Force

    # Today's summary
    $today     = (Get-Date).Date
    $todayRows = $allRows | Where-Object {
        try { [datetime]$_.Start_Time -ge $today } catch { $false }
    }
    $totalMins  = ($todayRows | Measure-Object -Property Duration_Minutes -Sum).Sum
    $totalHours = if ($totalMins) { [math]::Round($totalMins / 60, 1) } else { 0 }

    $msg  = "TODAY'S SUMMARY — $(Get-Date -Format 'dd MMM yyyy')`n"
    $msg += "─────────────────────────────`n"
    $msg += "Total Sessions : $($todayRows.Count)`n"
    $msg += "Total PC-Hours : $totalHours hrs`n`n"
    $msg += "Per PC:`n"

    $todayRows |
        Group-Object PC_Name |
        Sort-Object Name |
        ForEach-Object {
            $hrs = [math]::Round(($_.Group | Measure-Object -Property Duration_Minutes -Sum).Sum / 60, 1)
            $msg += "  $($_.Name) : $($_.Count) session(s), $hrs hrs`n"
        }

    $msg += "`nFull log saved to:`n$($Config.LogPath)"

    [Windows.Forms.MessageBox]::Show($msg, "Daily Report", "OK", "Information") | Out-Null
}


# =======================================================================
# MAIN FORM
# =======================================================================

# ---- PIN check ----
if (-not (Show-PINDialog)) {
    [Windows.Forms.MessageBox]::Show("Incorrect PIN.", "Access Denied", "OK", "Error") | Out-Null
    exit 1
}

$pcList = Get-PCList

# ---- Form ----
$form                = New-Object Windows.Forms.Form
$form.Text           = "Gaming Cafe Control Panel"
$form.BackColor      = $C.BgDark
$form.ForeColor      = $C.Text
$form.Size           = New-Object Drawing.Size(1060, 720)
$form.MinimumSize    = New-Object Drawing.Size(860, 520)
$form.StartPosition  = "CenterScreen"
$form.Font           = New-Object Drawing.Font("Segoe UI", 9)
$form.Icon           = [Drawing.SystemIcons]::Application

# ---- Header ----
$header           = New-Object Windows.Forms.Panel
$header.Dock      = "Top"
$header.Height    = 64
$header.BackColor = $C.BgCard

$accBar           = New-Object Windows.Forms.Panel
$accBar.Dock      = "Top"
$accBar.Height    = 4
$accBar.BackColor = $C.Purple
$header.Controls.Add($accBar)

$lblTitle          = New-Object Windows.Forms.Label
$lblTitle.Text     = "  Gaming Cafe Control Panel"
$lblTitle.Font     = New-Object Drawing.Font("Segoe UI", 14, [Drawing.FontStyle]::Bold)
$lblTitle.ForeColor = $C.PurpleLight
$lblTitle.Location = New-Object Drawing.Point(8, 10)
$lblTitle.AutoSize = $true

$lblStats          = New-Object Windows.Forms.Label
$lblStats.Font     = New-Object Drawing.Font("Segoe UI", 9)
$lblStats.ForeColor = $C.TextMuted
$lblStats.Location = New-Object Drawing.Point(12, 40)
$lblStats.AutoSize = $true

$header.Controls.AddRange(@($lblTitle, $lblStats))
$form.Controls.Add($header)

# ---- Toolbar ----
$toolbar           = New-Object Windows.Forms.Panel
$toolbar.Dock      = "Top"
$toolbar.Height    = 50
$toolbar.BackColor = $C.BgPanel

$btnRefreshAll  = Make-Btn "↻  Refresh Now"   $C.Purple   10 9 130 32
$btnReportBtn   = Make-Btn "📊  Daily Report" $C.GrayBg  150 9 140 32

$lblRefreshInfo          = New-Object Windows.Forms.Label
$lblRefreshInfo.ForeColor = $C.TextMuted
$lblRefreshInfo.Location = New-Object Drawing.Point(305, 15)
$lblRefreshInfo.AutoSize = $true

$toolbar.Controls.AddRange(@($btnRefreshAll, $btnReportBtn, $lblRefreshInfo))
$form.Controls.Add($toolbar)

# ---- DataGridView ----
$dgv = New-Object Windows.Forms.DataGridView
$dgv.Dock                    = "Fill"
$dgv.BackgroundColor         = $C.BgDark
$dgv.GridColor               = $C.Border
$dgv.DefaultCellStyle.BackColor   = $C.BgCard
$dgv.DefaultCellStyle.ForeColor   = $C.Text
$dgv.DefaultCellStyle.SelectionBackColor = [Drawing.Color]::FromArgb(60, 60, 100)
$dgv.DefaultCellStyle.SelectionForeColor = $C.Text
$dgv.DefaultCellStyle.Font        = New-Object Drawing.Font("Segoe UI", 9)
$dgv.ColumnHeadersDefaultCellStyle.BackColor = $C.BgPanel
$dgv.ColumnHeadersDefaultCellStyle.ForeColor = $C.PurpleLight
$dgv.ColumnHeadersDefaultCellStyle.Font      = New-Object Drawing.Font("Segoe UI", 9, [Drawing.FontStyle]::Bold)
$dgv.ColumnHeadersBorderStyle    = "Single"
$dgv.ColumnHeadersHeight         = 36
$dgv.RowTemplate.Height          = 42
$dgv.SelectionMode               = "FullRowSelect"
$dgv.MultiSelect                 = $false
$dgv.ReadOnly                    = $true
$dgv.AllowUserToAddRows          = $false
$dgv.AllowUserToDeleteRows       = $false
$dgv.AllowUserToResizeRows       = $false
$dgv.RowHeadersVisible           = $false
$dgv.EnableHeadersVisualStyles   = $false
$dgv.BorderStyle                 = "None"
$dgv.CellBorderStyle             = "SingleHorizontal"
$dgv.ScrollBars                  = "Vertical"

# Define columns
$colDefs = @(
    @{ Name = "Col_Num";      Header = "#";           W = 40  }
    @{ Name = "Col_Name";     Header = "PC Name";     W = 110 }
    @{ Name = "Col_Status";   Header = "Status";      W = 100 }
    @{ Name = "Col_Customer"; Header = "Customer";    W = 0; Fill = $true }
    @{ Name = "Col_TimeLeft"; Header = "Time Left";   W = 90  }
    @{ Name = "Col_EndAt";    Header = "Ends At";     W = 80  }
    @{ Name = "Col_LastSeen"; Header = "Last Update"; W = 100 }
)
foreach ($def in $colDefs) {
    $col              = New-Object Windows.Forms.DataGridViewTextBoxColumn
    $col.Name         = $def.Name
    $col.HeaderText   = $def.Header
    if ($def.Fill) {
        $col.AutoSizeMode = "Fill"
    } else {
        $col.Width        = $def.W
        $col.AutoSizeMode = "None"
    }
    $col.DefaultCellStyle.Alignment = "MiddleLeft"
    $dgv.Columns.Add($col) | Out-Null
}
$form.Controls.Add($dgv)

# ---- Action bar (bottom) ----
$actBar           = New-Object Windows.Forms.Panel
$actBar.Dock      = "Bottom"
$actBar.Height    = 62
$actBar.BackColor = $C.BgCard

$btnStart  = Make-Btn "▶  Start Session"  $C.GreenFg   10 13
$btnExtend = Make-Btn "+  Extend Session" $C.Purple    175 13
$btnEnd    = Make-Btn "⏹  End Session"   $C.RedFg     340 13
$btnUnlock = Make-Btn "🔓  Unlock PC"    $C.GrayBg    505 13
$actBar.Controls.AddRange(@($btnStart, $btnExtend, $btnEnd, $btnUnlock))
$form.Controls.Add($actBar)


# =======================================================================
# REFRESH LOGIC
# =======================================================================
$script:PCStatuses = @{}

function Invoke-Refresh {
    $pcs    = Get-PCList
    $active = 0; $idle = 0; $offline = 0

    # Read status from every PC
    foreach ($pc in $pcs) {
        $script:PCStatuses[$pc] = Get-PCStatus $pc
    }

    # Rebuild grid
    $dgv.SuspendLayout()
    $dgv.Rows.Clear()
    $i = 1
    foreach ($pc in $pcs) {
        $s   = $script:PCStatuses[$pc]
        $rem = if ($s.remaining_secs) { [int]$s.remaining_secs } else { $null }

        $endAt = ""
        if ($s.end_time) {
            try { $endAt = ([datetime]$s.end_time).ToString("HH:mm") } catch {}
        }

        $lastSeen = ""
        if ($s.last_update) {
            try { $lastSeen = ([datetime]$s.last_update).ToString("HH:mm:ss") } catch {}
        }

        $statusText = $s.status.ToUpper()
        $timeLeft   = Format-Remaining $rem
        $customer   = if ($s.customer_name) { $s.customer_name } else { "" }

        $idx = $dgv.Rows.Add($i, $pc, $statusText, $customer, $timeLeft, $endAt, $lastSeen)
        $row = $dgv.Rows[$idx]
        $clr = Get-RowColor $s.status $rem
        $row.DefaultCellStyle.BackColor = $clr.Bg
        $row.DefaultCellStyle.ForeColor = $clr.Fg

        switch ($s.status) {
            "running" { $active++ }
            "idle"    { $idle++   }
            "offline" { $offline++ }
        }
        $i++
    }
    $dgv.ResumeLayout()

    $lblRefreshInfo.Text = "Last refresh: $(Get-Date -Format 'HH:mm:ss')  |  Auto-refresh in $($Config.RefreshSeconds)s"
    $lblStats.Text       = "  Active: $active   Idle: $idle   Offline: $offline   Total PCs: $($pcs.Count)"
}

function Get-SelectedPCName {
    if ($dgv.SelectedRows.Count -eq 0) {
        [Windows.Forms.MessageBox]::Show(
            "Please click on a PC row to select it first.",
            "No PC Selected", "OK", "Warning") | Out-Null
        return $null
    }
    return $dgv.SelectedRows[0].Cells["Col_Name"].Value
}


# =======================================================================
# BUTTON HANDLERS
# =======================================================================
$btnRefreshAll.Add_Click({ Invoke-Refresh })
$btnReportBtn.Add_Click({ Show-DailyReport })

$btnStart.Add_Click({
    $pc = Get-SelectedPCName
    if (-not $pc) { return }

    $data = Show-StartDialog $pc
    if (-not $data) { return }

    $trigger = "$($data.Minutes)|$($data.CustomerName)"
    $ok = Write-Trigger $pc "start.txt" $trigger

    if ($ok) {
        [Windows.Forms.MessageBox]::Show(
            "Session started on $pc`nCustomer : $($data.CustomerName)`nDuration : $($data.Minutes) minutes`nEnds at  : $((Get-Date).AddMinutes($data.Minutes).ToString('HH:mm'))",
            "Session Started", "OK", "Information") | Out-Null
        Start-Sleep -Milliseconds 600
        Invoke-Refresh
    } else {
        [Windows.Forms.MessageBox]::Show(
            "Could not write trigger to $pc.`n`nCheck:`n• Is $pc powered on?`n• Is C:\CafeTimer shared as \\$pc\CafeTimer?`n• Are the network credentials correct?",
            "Connection Error", "OK", "Error") | Out-Null
    }
})

$btnExtend.Add_Click({
    $pc = Get-SelectedPCName
    if (-not $pc) { return }

    $mins = Show-ExtendDialog $pc
    if (-not $mins) { return }

    $ok = Write-Trigger $pc "extend.txt" "$mins"
    if ($ok) {
        [Windows.Forms.MessageBox]::Show(
            "Extended $pc by $mins minutes.", "Extended", "OK", "Information") | Out-Null
        Start-Sleep -Milliseconds 600
        Invoke-Refresh
    } else {
        [Windows.Forms.MessageBox]::Show("Could not reach $pc.", "Error", "OK", "Error") | Out-Null
    }
})

$btnEnd.Add_Click({
    $pc = Get-SelectedPCName
    if (-not $pc) { return }

    $confirm = [Windows.Forms.MessageBox]::Show(
        "End session and LOCK $pc immediately?`nThe customer will be shown a 'Session Ended' message.",
        "Confirm End Session",
        [Windows.Forms.MessageBoxButtons]::YesNo,
        [Windows.Forms.MessageBoxIcon]::Warning)
    if ($confirm -ne "Yes") { return }

    $ok = Write-Trigger $pc "stop.txt" "1"
    if (-not $ok) {
        [Windows.Forms.MessageBox]::Show("Could not reach $pc.", "Error", "OK", "Error") | Out-Null
    }
    Start-Sleep -Milliseconds 600
    Invoke-Refresh
})

$btnUnlock.Add_Click({
    $pc = Get-SelectedPCName
    if (-not $pc) { return }

    # Try shared-folder trigger first (handled by timer_agent on the PC)
    $ok = Write-Trigger $pc "unlock.txt" "1"

    if (-not $ok) {
        # Fallback: PsExec logoff
        if (Test-Path $Config.PsExecPath) {
            $args = @(
                "\\$pc",
                "-u", $Config.AdminUser,
                "-p", $Config.AdminPass,
                "-accepteula", "-nobanner",
                "-s", "-d",
                "cmd", "/c",
                'for /f "tokens=3" %i in (\'query session ^| findstr Active\') do logoff %i'
            )
            Start-Process -FilePath $Config.PsExecPath -ArgumentList $args -WindowStyle Hidden -Wait
            [Windows.Forms.MessageBox]::Show(
                "Unlock command sent to $pc via PsExec.", "Unlock", "OK", "Information") | Out-Null
        } else {
            [Windows.Forms.MessageBox]::Show(
                "Could not reach $pc.`n`nManual steps:`n1. Go to $pc physically`n2. Press any key on the lock screen`n3. Enter the PC password",
                "Unlock — Manual Required", "OK", "Warning") | Out-Null
        }
    } else {
        [Windows.Forms.MessageBox]::Show(
            "Unlock signal sent to $pc.", "Unlock", "OK", "Information") | Out-Null
    }
    Start-Sleep -Milliseconds 800
    Invoke-Refresh
})


# =======================================================================
# AUTO-REFRESH TIMER
# =======================================================================
$autoTimer          = New-Object Windows.Forms.Timer
$autoTimer.Interval = $Config.RefreshSeconds * 1000
$autoTimer.Add_Tick({ Invoke-Refresh })
$autoTimer.Start()


# =======================================================================
# SHOW FORM
# =======================================================================
$form.Add_Shown({
    $form.Activate()
    Invoke-Refresh
})
$form.Add_FormClosing({
    $autoTimer.Stop()
    $autoTimer.Dispose()
})

[Windows.Forms.Application]::EnableVisualStyles()
[Windows.Forms.Application]::Run($form)
