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

## Hosting the installer so the dashboard can offer it

The installer contains no credentials — a PC gets its settings by redeeming a
setup code — so it is safe to host publicly and the same file works for every
café.

GitHub Releases is the simplest place: free, handles a file this size, and gives
a permanent link.

1. Build it (see below), producing
   `pc-lock-agent\installer\Output\BookMyGame-PC-Lock-Setup.exe`
2. Go to your repo → **Releases** → **Draft a new release**
3. Create a tag such as `v1.0.0`, give it a title
4. Drag the `.exe` into the attachments box
5. **Publish release**

Then set this on Vercel and redeploy:

```
NEXT_PUBLIC_AGENT_DOWNLOAD_URL = https://github.com/<user>/<repo>/releases/latest/download/BookMyGame-PC-Lock-Setup.exe
```

Note `latest` rather than a version number. That URL always resolves to the
newest release, so publishing a new version updates every café's download button
without touching Vercel again.

> Windows will warn about an unsigned program the first time anyone runs it —
> "Windows protected your PC" → **More info** → **Run anyway**. Silencing that
> needs a paid code-signing certificate and is not worth it yet.

---

## The short version: build an installer

If you would rather hand each PC a single `Setup.exe` than follow the steps
below, build one once on the machine with the source:

```powershell
.\tools\build-installer.ps1 `
    -BrokerHost "your-cluster.s1.eu.hivemq.cloud" `
    -BrokerUsername "station" `
    -BrokerPassword "..." `
    -HeartbeatUrl "https://www.yoursite.co.in/api/stations/heartbeat" `
    -HeartbeatToken "..." `
    -CafeId "..."
```

Needs [Inno Setup 6](https://jrsoftware.org/isdl.php) — free, and only on this
one machine.

That produces `installer\Output\BookMyGame-PC-Lock-Setup.exe`. Copy it to each
café PC and run it. It asks one question — which station this PC is — then
creates the customer account, installs the agent, and sets it to start on boot.

Steps 1, 3 and 6 below are then done for you. You still want **Step 2** (turn off
the escape hatch) **before building**, and **Step 4** (auto-login) afterwards.

> The Setup.exe contains your broker password. Keep it on a USB stick or
> somewhere private — not in the repo, not in shared storage.

The rest of this document is the manual route, and explains what the installer is
doing.

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

## Step 6 — The other machines

**They do not need the code, or .NET, or anything installed.** The build from
Step 3 bundles everything it needs, so the other PCs just need the folder.

On the PC you built on, copy `C:\BookMyGame\PcLockAgent` to a USB stick.

Then on each other machine:

1. Create the customer account (Step 1)
2. Copy the folder from the USB stick to `C:\BookMyGame\PcLockAgent`
3. Copy `pc-lock-agent\tools` across as well, and run, as Administrator:

```powershell
.\setup-station.ps1 -StationId pc-02 `
    -BrokerHost "your-cluster.s1.eu.hivemq.cloud" `
    -BrokerUsername "station" `
    -BrokerPassword "..." `
    -HeartbeatUrl "https://www.yoursite.co.in/api/stations/heartbeat" `
    -HeartbeatToken "..." `
    -CafeId "..." `
    -GamingUser "GamingUser" `
    -SkipBuild
```

`-SkipBuild` tells it to configure the copied folder instead of building. The
only thing that changes between machines is `-StationId`.

4. Set auto-login (Step 4)

Station ids must match the number of PCs configured for the café on the website.
Five PCs means the site expects `pc-01` through `pc-05`; a machine set to `pc-07`
will never be targeted by a booking and will simply never unlock.

> Rebuilding later — after changing a setting or taking a fix — means copying the
> folder out again. Only the machine with the code can produce a new build.

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
