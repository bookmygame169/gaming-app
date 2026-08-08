# What still needs checking

Everything below is written and pushed but not yet proven. Kept here so it does
not get lost between working sessions.

Last updated: 2026-08-07

---

## Needs a Windows PC

### Never run at all

- [ ] **Setup code flow end to end** — the biggest untested piece. Dashboard →
      Stations → "Add a gaming PC" → get a code → run the installer → type the
      code → PC links itself. Every part is written; none of it has run.
- [ ] **Installer's post-install step** — the last attempt failed with exit code
      1, fixed since (32-bit PowerShell missing `Get-LocalUser`). Unconfirmed.
- [ ] **Startup task** — does the agent actually come back on reboot, and within
      a minute of being killed?
- [ ] **`AllowDevExit = false` build** — with the escape chord gone, does the
      machine still behave, and is the admin account still reachable?
- [ ] **`MENU.bat`** — never opened.

### Written but never exercised

- [ ] **Launcher games** — the `processName` setting, using a real title such as
      Valorant or a Steam game. Notepad does not exercise this path at all.
- [ ] **Second monitor** — needs a two-screen PC. Untested, and it is the one
      remaining way to reach the desktop if it is wrong.
- [ ] **Automatic re-lock at expiry with a real booking** — only ever watched
      with the 90-second dev chord.
- [ ] **Session survives a restart** — seen working once in a log, never
      deliberately tested.
- [ ] **Warning banner over a fullscreen game** — a game in exclusive fullscreen
      may paint over it. Known risk, unmeasured.

---

## Needs an action, not a Windows PC

- [ ] **Run three migrations** in the Supabase SQL editor:
      - `20260806000000_add_station_unlock_log.sql`
      - `20260806000001_add_station_status.sql`
      - `20260806000002_add_station_enrollments.sql` (setup codes will not work
        without this one)
- [ ] **Upload the installer** to GitHub Releases and set
      `NEXT_PUBLIC_AGENT_DOWNLOAD_URL` on Vercel, then redeploy
- [ ] **Change the HiveMQ password** from `12345678`, in HiveMQ and in each PC's
      settings

---

## Known gaps, not bugs

- **Safe Mode** bypasses the startup task. Needs a BIOS password on machines
  customers can physically reach.
- **Anyone with the admin password** can remove the lock. This defends against
  customers, not administrators.
- **No PS5 support yet.** The Raspberry Pi agent is not started, so half the
  stations are still unprotected.

---

## Confirmed working

Recorded so nothing here gets re-tested unnecessarily.

- Lock screen covers the taskbar; Windows key, Alt+Tab, Alt+F4, Ctrl+Shift+Esc
  all blocked; Task Manager refuses to open and works again afterwards
- Game menu appears on unlock; launching a game keeps it inside the kiosk with
  no desktop visible; closing it returns to the menu
- Countdown runs with the correct duration from a real booking
- Unlock and Lock buttons in the owner dashboard control a real PC
- Agent connects to HiveMQ Cloud over TLS
- Heartbeats reach the website
- The installer builds and installs
- `remove-everything.ps1` returns a machine to normal
