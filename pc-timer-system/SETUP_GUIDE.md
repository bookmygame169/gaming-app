# Gaming Cafe PC Timer System — Complete Setup Guide  v2.0

## What This System Does

| Feature | Detail |
|---|---|
| Session management | Start sessions (30 min to 5 hrs or custom) per PC |
| Customer name tracking | Optional name per session |
| Live dashboard | Colour-coded: Green/Amber/Red/Grey per PC |
| Warnings | Gaming-style dark popup at 15 min and 2 min remaining |
| Auto-lock | PC locks automatically when time runs out |
| Extend sessions | +15/30/60/90/120 min without interrupting gameplay |
| Early end | Lock any PC immediately from the panel |
| Crash recovery | Timer resumes from saved state after PC restart |
| Session logs | CSV log per PC, daily report aggregated on admin PC |
| Control panel | PowerShell WinForms GUI — no installs needed |
| Mobile option | Optional Flask web panel for phone/tablet control |
| Offline | Works fully offline after initial setup |

---

## System Requirements (all free)

| Component | Requirement |
|---|---|
| Admin PC OS | Windows 10/11 Pro |
| Gaming PC OS | Windows 10/11 Pro |
| Network | All PCs on the same LAN/WiFi |
| Software | PsExec from Microsoft Sysinternals (free) |
| Python | Only if you want the optional mobile web panel |

---

## Folder Structure

```
ADMIN PC:
C:\CafeManager\
├── admin_panel.ps1          <- Double-click to open control panel
├── config\
│   └── pcs.txt              <- List of gaming PC names (one per line)
├── logs\
│   └── sessions.csv         <- Aggregated session log
└── tools\

EACH GAMING PC:
C:\CafeTimer\                <- Shared as \\PCNAME\CafeTimer on network
├── timer_agent.ps1          <- Timer agent (auto-starts at boot)
├── state.json               <- Crash recovery state (auto-written)
├── status.json              <- Current status (admin panel reads this)
├── session_log.csv          <- Session history for this PC
└── timer.log                <- Debug log
```

---

## Architecture

```
    Owner's Phone / PC
         |
         | WiFi  (optional web panel)
         ▼
    Admin PC  ─────────────────────────────────────
    admin_panel.ps1              C:\CafeManager\
         |
         | LAN (reads/writes \\PCNAME\CafeTimer\)
         |
    ┌────┴──────────────────────────────────┐
    │                                       │
    PC01   PC02   PC03   ...   PC20
    timer_agent.ps1 on each
    C:\CafeTimer\ shared on network
```

**How triggers work:**
1. Staff clicks "Start" on admin panel
2. Admin panel writes `\\PC03\CafeTimer\start.txt` containing `"120|Rahul"`
3. timer_agent.ps1 on PC03 reads the file, deletes it, starts countdown
4. At 15 min and 2 min: shows gaming-style popup on PC03
5. At 00:00: PC03 locks automatically
6. Session is logged to `C:\CafeTimer\session_log.csv` on PC03

---

## STEP 1 — Get PC Names and IPs

**On each gaming PC:**
1. Run `setup\find_pc_ips.bat`
2. Note the **Computer Name** (e.g. `GAMING-01`) and **IPv4 Address**

**Or open CMD and type:** `hostname`

Write them all down:
```
PC Name       IP Address
GAMING-01     192.168.1.101
GAMING-02     192.168.1.102
...
```

> **Tip:** Assign static IPs in your router (DHCP reservation by MAC address) so IPs never change.

---

## STEP 2 — Download PsExec

1. Visit: https://learn.microsoft.com/en-us/sysinternals/downloads/psexec
2. Download **PSTools.zip**
3. Extract and copy **PsExec.exe** to `C:\Tools\PsExec.exe` on the **Admin PC**
4. Run once to accept EULA: open CMD as Admin → `C:\Tools\PsExec.exe -accepteula`

See [PSEXEC_GUIDE.md](PSEXEC_GUIDE.md) for full details.

---

## STEP 3 — Set Up Each Gaming PC

Do this **on each of the 4 (or more) gaming PCs**:

**Option A — Manual (USB drive):**
1. Copy the entire `pc-timer-system` folder to a USB drive
2. Plug USB into gaming PC
3. Open USB → `setup\` folder
4. Right-click `setup_client_pc.bat` → **Run as administrator**
5. Wait for all 8 steps to complete
6. Reboot the gaming PC

**Option B — Remote (from Admin PC, after Step 4):**
1. Complete Step 4 first
2. Then run `setup\deploy_all.bat` from the Admin PC
3. This deploys to all PCs listed in `config\pcs.txt` automatically

---

## STEP 4 — Set Up the Admin PC

1. Copy the `pc-timer-system` folder to the Admin PC
2. Right-click `setup\setup_admin_pc.bat` → **Run as administrator**
3. When prompted, enter the Windows admin password of the gaming PCs
4. Setup creates `C:\CafeManager\`, copies files, and creates a Desktop shortcut

---

## STEP 5 — Configure

### 5a. PC Name List
Edit `C:\CafeManager\config\pcs.txt` — put the **exact** Windows computer names of your gaming PCs, one per line:
```
GAMING-01
GAMING-02
GAMING-03
GAMING-04
```
(Use the names you found in Step 1.)

### 5b. Admin Panel Settings
Open `C:\CafeManager\admin_panel.ps1` in **Notepad**.
Find the `## CONFIGURATION` block and update:

```powershell
$Config = @{
    PCListFile   = "C:\CafeManager\config\pcs.txt"   # keep as-is
    AdminPIN     = "1234"        # change to your own PIN
    AdminUser    = "Administrator"
    AdminPass    = "YOUR_WINDOWS_ADMIN_PASSWORD"      # CHANGE THIS
    ...
}
```

### 5c. Timer Agent Settings (optional)
To change sound or poll interval, open `C:\CafeTimer\timer_agent.ps1` on any gaming PC and edit the `## CONFIGURATION` block:

```powershell
$Config = @{
    PollSeconds  = 5      # how often to check for triggers
    SoundEnabled = $true  # change to $false to disable sounds
    LockMessage  = "Session Ended — Please visit the counter."
}
```

---

## STEP 6 — First Run Test

1. Double-click **"Cafe Control Panel"** on the Admin Desktop
2. Enter PIN: `1234` (or your custom PIN)
3. The dashboard appears. PC statuses show **OFFLINE** until gaming PCs boot
4. Reboot all gaming PCs — after login they show **IDLE** (green)
5. Click on **PC01** row to select it
6. Click **▶ Start Session** → select 2 minutes → click Start
7. On PC01 you should see: "Session Started! (2 min)"
8. At 00:00: PC01 locks with "Session Ended" message
9. In `C:\CafeManager` → click **📊 Daily Report** to see the logged session

---

## Daily Operation

### Morning routine:
1. Power on all gaming PCs
2. Double-click **"Cafe Control Panel"** on Admin Desktop
3. Enter PIN → dashboard shows all PCs as IDLE

### Starting a session:
1. Customer pays at counter
2. Click on the PC row they're sitting at
3. Click **▶ Start Session**
4. Enter customer name (optional) + duration
5. Click **Start** → PC gets session started notification

### Extending a session:
1. Customer pays for more time
2. Click on their PC row
3. Click **+ Extend Session**
4. Click +30m, +1h, etc.
5. Customer sees "Time Extended!" popup — gameplay not interrupted

### Ending early:
1. Click PC row
2. Click **⏹ End Session** → confirm
3. PC locks immediately

### Unlocking a locked PC:
1. Click PC row
2. Click **🔓 Unlock PC**
3. The system logs off the session → Windows auto-login kicks in (if configured)
4. OR: staff physically types the PC password at the gaming PC

### End of day:
1. Click **📊 Daily Report**
2. Shows today's sessions per PC and total hours
3. Full log saved to `C:\CafeManager\logs\sessions.csv`

---

## Setting Up Auto-Login on Gaming PCs (recommended for Unlock to work)

With auto-login, when a PC is locked and you click "Unlock", the PC logs off and automatically logs back in to the gaming account.

**On each gaming PC, open CMD as Admin:**
```cmd
reg add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" /v AutoAdminLogon /t REG_SZ /d "1" /f
reg add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" /v DefaultUserName /t REG_SZ /d "GamingUser" /f
reg add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" /v DefaultPassword /t REG_SZ /d "" /f
```
Replace `GamingUser` with the name of the gaming account (no admin rights).

> **Important:** Use a **non-admin gaming account** with auto-login. The admin account should still require a password.

---

## Security Hardening

### 1. Dedicated gaming account
Create a standard (non-admin) user account on gaming PCs:
```cmd
net user GamingUser /add
net localgroup Users GamingUser /add
```
Auto-login as this account. Customers cannot install software or access system settings.

### 2. Process protection
The timer agent runs as **SYSTEM** via Task Scheduler. Regular users cannot kill SYSTEM processes in Task Manager. This prevents customers from terminating the timer.

### 3. Folder protection
`setup_client_pc.bat` sets permissions so:
- **SYSTEM / Admins**: Full control
- **Users (gamers)**: Read + Execute only — cannot delete or modify timer files

### 4. Admin panel PIN
Change the default PIN (`1234`) in the `## CONFIGURATION` block of `admin_panel.ps1`.

### 5. Admin password
Use a strong Windows admin password on all gaming PCs. All PCs should use the same password for simplicity. Change it every few months.

### 6. Static IPs
Configure DHCP reservations on your router so PC IP addresses never change. This prevents the admin panel from losing track of PCs.

---

## File Reference

| File | Location | Purpose |
|---|---|---|
| `timer_agent.ps1` | Gaming PC: `C:\CafeTimer\` | Timer agent — auto-starts at boot |
| `admin_panel.ps1` | Admin PC: `C:\CafeManager\` | Control panel — open to manage PCs |
| `config/pcs.txt` | Admin PC: `C:\CafeManager\config\` | List of gaming PC names |
| `state.json` | Gaming PC: `C:\CafeTimer\` | Crash recovery state (auto-written) |
| `status.json` | Gaming PC: `C:\CafeTimer\` | Live status (read by admin panel) |
| `session_log.csv` | Gaming PC: `C:\CafeTimer\` | Per-PC session log |
| `sessions.csv` | Admin PC: `C:\CafeManager\logs\` | Aggregated daily report |
| `timer.log` | Gaming PC: `C:\CafeTimer\` | Debug/event log |

---

## Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for detailed fixes.

## PsExec Commands

See [PSEXEC_GUIDE.md](PSEXEC_GUIDE.md) for ready-to-use commands.
