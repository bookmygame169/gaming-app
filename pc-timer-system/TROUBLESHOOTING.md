# Troubleshooting Guide

---

## 1. Admin Panel shows all PCs as "OFFLINE"

**Symptoms:** Every PC shows grey "OFFLINE" in the dashboard.

**Causes & Fixes:**

1. **Network share not set up** — Run `setup_client_pc.bat` as Admin on each gaming PC.
2. **Wrong PC names** — Open `C:\CafeManager\config\pcs.txt`. Each name must match exactly what you see when you type `hostname` on the gaming PC.
3. **PC not reachable** — From Admin PC, open File Explorer and type `\\PC01\CafeTimer` in the address bar. If it fails, the PC is unreachable.
4. **Firewall blocking shares** — On gaming PC, run as Admin: `netsh advfirewall firewall set rule group="File and Printer Sharing" new enable=Yes`
5. **Credentials not stored** — Re-run `setup_admin_pc.bat` and enter the gaming PC admin password when asked.

---

## 2. Timer not starting on client PC after pressing Start

**Symptoms:** You click Start in the panel, nothing happens on the gaming PC.

**Step-by-step diagnosis:**

1. **Check if `start.txt` was written:**
   Open File Explorer on Admin PC → go to `\\PC01\CafeTimer\` → look for `start.txt`.
   - If it's there: the admin panel wrote it but the timer agent didn't read it.
   - If it's missing: the admin panel couldn't write to the share (go to step 2).

2. **Check if timer agent is running:**
   On the gaming PC, press `Ctrl+Shift+Esc` (Task Manager) → Details tab → look for `powershell.exe`. If not there:
   - Open Task Scheduler (`Win+R` → `taskschd.msc`)
   - Find "CafeTimerAgent" → right-click → Run

3. **Check the log:**
   On the gaming PC, open `C:\CafeTimer\timer.log`. Look for error messages.

4. **Check execution policy:**
   On gaming PC, open PowerShell as Admin and run: `Get-ExecutionPolicy -List`
   The `LocalMachine` policy should be `RemoteSigned`. If not: `Set-ExecutionPolicy RemoteSigned -Scope LocalMachine -Force`

---

## 3. Warning popup not appearing over fullscreen game

**Symptoms:** The 15-min or 2-min warning doesn't show. The game stays fullscreen.

**Fixes:**

1. **DirectX Exclusive Fullscreen** — some games use exclusive fullscreen which blocks all overlays. Tell the customer to set the game to **Borderless Windowed** mode instead.

2. **The popup did appear but closed** — The warning has an auto-close timer. The customer may have missed it.

3. **Sound is working but no popup** — Check `C:\CafeTimer\timer.log` for errors loading `System.Windows.Forms`. Try running timer_agent.ps1 manually to see any errors.

4. **Increase auto-close time** — Edit `timer_agent.ps1`: find `-AutoCloseSeconds 20` (15-min warning) and increase to `60`.

---

## 4. PC not locking when session ends

**Symptoms:** Timer reaches 00:00 but the PC doesn't lock.

**Fixes:**

1. **Timer agent not running as SYSTEM** — The `rundll32.exe user32.dll,LockWorkStation` command only works when run in the context of the logged-in user session. The Task Scheduler task must be set to run with the session: change the task to run as the **gaming user account**, not SYSTEM.

   In Task Scheduler: double-click "CafeTimerAgent" → General tab → change "Run as" to the gaming user account → tick "Run only when user is logged on".

2. **Multiple users logged in** — If Fast User Switching has multiple sessions, only the active session locks.

3. **Check the log** — `C:\CafeTimer\timer.log` should show `Locking PC — session ended`. If missing, timer crashed before reaching lock.

---

## 5. Crash recovery not working after PC restart

**Symptoms:** After a PC reboots mid-session, the timer does not resume.

**Fixes:**

1. **state.json not found** — After reboot, the timer agent checks `C:\CafeTimer\state.json`. Open File Explorer on the gaming PC and confirm the file exists.

2. **Task Scheduler not running timer at startup** — Open Task Scheduler → find "CafeTimerAgent" → check Last Run Time and Last Result. If it says "The task has not yet run", right-click → Run to test it.

3. **Script failing silently** — Run `powershell.exe -ExecutionPolicy Bypass -File C:\CafeTimer\timer_agent.ps1` from a CMD window to see any errors.

4. **Stale state.json** — If the file has wrong data (e.g. session started months ago), the recovery triggers a lock. Delete `state.json` manually.

---

## 6. CSV log not updating / sessions not being logged

**Symptoms:** `session_log.csv` doesn't appear or doesn't have new rows.

**Fixes:**

1. **Log is only written when a session ENDS** — Start a short test session (2 min) and let it expire. Check the log after.

2. **Check file path** — The log is at `C:\CafeTimer\session_log.csv` on each gaming PC. The admin panel aggregates these when you click "Daily Report".

3. **Permission error** — The timer agent runs as SYSTEM. SYSTEM should have full access to `C:\CafeTimer\`. Run `icacls "C:\CafeTimer"` on the gaming PC and confirm SYSTEM has `(F)`.

4. **Report not showing today's data** — The report filters by today's date. Check your PC's system clock — if it's wrong, sessions may be logged on a different date.

---

## 7. PsExec connection refused / access denied

**Symptoms:** `deploy_all.bat` or unlock fails with "Access is denied" or "Connection refused".

**Fixes:**

1. **Wrong password** — Double-check `admin_pass` in `admin_panel.ps1` matches the gaming PC's Administrator password.

2. **Administrator account disabled** — On the gaming PC, open CMD as Admin and run: `net user Administrator /active:yes`

3. **File & Printer Sharing not enabled** — On the gaming PC: `Control Panel → Network and Sharing Center → Advanced sharing settings → Turn on File and Printer Sharing`

4. **Windows Defender Firewall blocking** — Temporarily disable Defender Firewall on both PCs to test. Then re-enable and add exceptions.

5. **Different workgroup** — All PCs should be in the same Workgroup. On gaming PC: `System Properties → Computer Name → Workgroup`. Default is WORKGROUP.

6. **PsExec EULA not accepted** — Run `C:\Tools\PsExec.exe -accepteula` once on the admin PC.

---

## 8. Admin panel PIN dialog appears but login fails

**Fix:** Open `admin_panel.ps1` in Notepad, find `AdminPIN = "1234"` in the CONFIGURATION section, and make sure you're typing that exact PIN. The PIN is case-sensitive.

---

## Quick Diagnostic Checklist

Run through this in order when something isn't working:

```
□ Gaming PC is powered on and logged in
□ Both PCs are on the same WiFi/LAN
□ C:\CafeTimer\ exists on gaming PC
□ C:\CafeTimer\ is shared as \\PCNAME\CafeTimer
□ From admin PC: File Explorer can open \\PC01\CafeTimer\
□ timer_agent.ps1 exists in C:\CafeTimer\
□ "CafeTimerAgent" task exists in Task Scheduler on gaming PC
□ C:\CafeTimer\timer.log shows recent activity
□ C:\CafeManager\config\pcs.txt has correct PC names
□ admin_panel.ps1 CONFIGURATION has correct admin password
```
