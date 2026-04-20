# PsExec Setup Guide

## What is PsExec?
PsExec is a free tool from Microsoft Sysinternals. It lets the admin PC run commands on gaming PCs over the network — like sending a "lock now" command to PC03 without physically touching it.

---

## Step 1 — Download PsExec

1. Open a browser and go to:
   **https://learn.microsoft.com/en-us/sysinternals/downloads/psexec**

2. Click **Download PsTools**
3. You get a `.zip` file called `PSTools.zip`
4. Open it and find **PsExec.exe** (ignore the other .exe files)
5. Copy `PsExec.exe` to: `C:\Tools\PsExec.exe`

   If `C:\Tools` doesn't exist, create it:
   - Open File Explorer → C: drive → right-click → New Folder → name it `Tools`

---

## Step 2 — Accept the EULA (one time only)

PsExec shows a licence agreement the first time it runs. Accept it silently:

Open **Command Prompt as Administrator** and run:
```
C:\Tools\PsExec.exe -accepteula
```
You'll see a popup — click **Agree**. This only needs to happen once.

---

## Step 3 — Test that PsExec works

Test connection to a gaming PC (replace `PC01` with your actual PC name):

```cmd
C:\Tools\PsExec.exe \\PC01 -u Administrator -p YOUR_PASSWORD cmd /c "echo Connection OK"
```

Expected output:
```
Connection OK
```

If you see `Connection OK` — PsExec is working.

---

## Step 4 — Ready-to-Use Commands

All commands below run from **Command Prompt on the Admin PC**.
Replace `PC01` with your PC name and `YOUR_PASSWORD` with the admin password.

### Start a 2-hour session on PC03 (for customer "Rahul")
```cmd
echo 120|Rahul > "\\PC03\CafeTimer\start.txt"
```

### Start a 1-hour session (Guest)
```cmd
echo 60 > "\\PC03\CafeTimer\start.txt"
```

### Extend PC03 by 30 minutes
```cmd
echo 30 > "\\PC03\CafeTimer\extend.txt"
```

### End session on PC03 immediately (lock it)
```cmd
echo 1 > "\\PC03\CafeTimer\stop.txt"
```

### Unlock PC03 (trigger logoff → auto-login)
```cmd
echo 1 > "\\PC03\CafeTimer\unlock.txt"
```

### Check what's in the status file on PC03
```cmd
type \\PC03\CafeTimer\status.json
```

### Check status of ALL PCs at once (PowerShell)
```powershell
"PC01","PC02","PC03","PC04" | ForEach-Object {
    $s = Get-Content "\\$_\CafeTimer\status.json" -Raw | ConvertFrom-Json
    Write-Host "$_ : $($s.status) | $($s.customer_name) | $($s.remaining_secs)s"
}
```

### Remotely run a command on a PC via PsExec
```cmd
C:\Tools\PsExec.exe \\PC03 -u Administrator -p YOUR_PASSWORD cmd /c "echo hello"
```

---

## Common PsExec Errors

| Error | Cause | Fix |
|---|---|---|
| `Access is denied` | Wrong password or not admin | Check `admin_pass` in config |
| `Could not connect` | PC is off or wrong name | Check PC name + that it's on |
| `Logon failure` | User account doesn't exist | Create Administrator account on gaming PC |
| `The system cannot find the path` | PsExec not at C:\Tools\ | Check path |

---

## Security Note

`admin_pass` is stored in plain text in `config.json` and `admin_panel.ps1`.
- Keep these files on the admin PC only
- Do not share them with customers
- Change the admin password if staff changes
