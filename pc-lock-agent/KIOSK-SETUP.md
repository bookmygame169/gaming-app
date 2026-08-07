# Turning a PC into a locked kiosk

This is the full setup for a real café machine, where customers must not be able
to reach Windows at all.

Do it on one PC first and use it for a day before doing the rest.

---

## Read this first: how to get back in

Once this is done the machine is genuinely locked. Before starting, understand
the ways back in — all of them still work afterwards:

| Situation | What to do |
|---|---|
| Need to administer the PC | **Log in as your admin account.** The lock only runs for the customer account, so your account gets a normal Windows |
| Customer account is stuck | Ctrl+Alt+Del → **Sign out** → log in as admin |
| Want to remove the lock entirely | As admin: `.\uninstall-startup.ps1` |
| Taskbar missing afterwards | `taskkill /f /im explorer.exe; start explorer.exe` |
| Task Manager still disabled | `reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\System" /v DisableTaskMgr /f` |

**The key point:** two Windows accounts. Customers use a locked one, you use a
normal one. That separation is what keeps the machine usable for you.

---

## Step 1 — Make a customer account

As Administrator:

```
net user GamingUser /add
net localgroup Users GamingUser /add
```

Leave it a **standard** account, not an administrator. A standard user cannot
install software or get past a UAC prompt, which also closes the one gap in the
keyboard blocking: a hook cannot intercept keys headed for an elevated program,
and a standard user cannot start one.

Give it a blank password (or set one and reuse it in Step 4 for auto-login).

---

## Step 2 — Turn off the developer escape hatch

In `PcLockAgent\AgentSettings.cs`, change:

```csharp
public static readonly bool AllowDevExit = true;
```

to:

```csharp
public static readonly bool AllowDevExit = false;
```

While this is `true`, anyone can quit the agent with Ctrl+Shift+Alt+Q or suspend
the lock with Ctrl+Shift+Alt+L. Both stop existing once it is `false`.

Do this **before** rolling out to several machines, or every one of them ships
with the shortcut enabled and they all need rebuilding.

The agent writes a warning to `agent.log` on every start while this is still on.

---

## Step 3 — Run the setup

As Administrator, from `pc-lock-agent\tools`:

```powershell
.\setup-station.ps1 -StationId pc-01 `
    -BrokerHost "your-cluster.s1.eu.hivemq.cloud" `
    -BrokerUsername "station" `
    -BrokerPassword "..." `
    -HeartbeatUrl "https://www.yoursite.co.in/api/stations/heartbeat" `
    -HeartbeatToken "..." `
    -CafeId "..." `
    -GamingUser "GamingUser"
```

This writes the config, builds a Release copy to `C:\BookMyGame\PcLockAgent`, and
registers a startup task **for the customer account only**.

The task has two triggers: at logon, and every minute. The second is the one that
matters — without it, killing the agent would leave the PC unlocked and free for
the rest of the day.

---

## Step 4 — Auto-login as the customer account

So the machine boots straight into the lock screen with no password prompt.

As Administrator:

```
reg add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" /v AutoAdminLogon /t REG_SZ /d "1" /f
reg add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" /v DefaultUserName /t REG_SZ /d "GamingUser" /f
reg add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" /v DefaultPassword /t REG_SZ /d "" /f
```

Set `DefaultPassword` to whatever you gave the account, or leave it empty for a
blank password.

To reach your admin account afterwards: Ctrl+Alt+Del → Sign out, then pick it at
the login screen.

---

## Step 5 — Check it

Reboot. The machine should come up straight to the **LOCKED** screen with no
desktop visible at any point.

Then try, as a customer would:

- Windows key — nothing
- Alt+Tab — nothing
- Alt+F4 — nothing
- Ctrl+Shift+Esc — nothing
- Ctrl+Alt+Del → Task Manager — refuses to open
- Ctrl+Shift+Alt+Q — **nothing** (this is the one proving Step 2 worked)

Then from your dashboard, unlock a booking on that station and confirm it opens
the game menu.

Finally check the machine appears on the **Stations** tab as a green card.

---

## Step 6 — Repeat for the other machines

Same command, changing only `-StationId` to `pc-02`, `pc-03` and so on.

Station ids must match the number of PCs configured for the café on the website.
Five PCs means the site expects `pc-01` through `pc-05`; a machine set to `pc-07`
will never be targeted by a booking and will simply never unlock.

---

## What is still not covered

- **A customer who reboots into Safe Mode** could bypass the startup task. This
  needs a BIOS password and boot-order lock to close properly — worth doing on
  machines customers can physically reach.
- **Unplugging the network** stops new unlock commands arriving, but a session
  already running continues on its own timer, and the station stays locked once
  it ends. It fails closed.
- **The agent is not tamper-proof against an administrator.** It defends against
  customers, not against someone with the admin password.
