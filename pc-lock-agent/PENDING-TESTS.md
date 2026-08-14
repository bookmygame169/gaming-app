# What still needs checking

Everything below is written and pushed but not yet proven. Kept here so it does
not get lost between working sessions.

Last updated: 2026-08-14

---

## Needs a Windows PC

### Never run at all

- [ ] **`AllowDevExit = false` build** — now the default. With the escape chord
      gone, does the machine still behave, and is the admin account still
      reachable? The way out is Ctrl+Alt+Del → Sign out; Windows reserves that
      key at kernel level and only the Task Manager entry on that screen is
      disabled. Worth confirming once, deliberately, before a customer does it
      by accident.
- [ ] **`MENU.bat`** — never opened.

### Written but never exercised

- [ ] **Second monitor** — needs a two-screen PC. The covers are now rebuilt
      when displays change, so the case to try is plugging a monitor in *while*
      the PC is locked, not only booting with two.
- [ ] **Automatic re-lock at expiry with a real booking** — only ever watched
      with the 90-second dev chord, which no longer exists in a default build.
- [ ] **Session survives a restart** — seen working once in a log, never
      deliberately tested. Note this could not have worked on the customer
      account before 2026-08-14: `session.json` was written to a folder that
      account cannot write to.
- [ ] **Warning banner over a fullscreen game** — a game in exclusive fullscreen
      may paint over it. Known risk, unmeasured.
- [ ] **Auto-update installing itself** — the version file and download URL were
      checked by fetching them, and the build asserts the version is stamped
      into the exe. Nothing has watched a PC update on its own yet.
- [ ] **Browser tile** — Chrome detection and the incognito session are written
      and have never been clicked.
- [ ] **Installed-game detection** — whether a game the café owns is correctly
      shown, and one it does not is correctly hidden.

---

## Needs an action, not a Windows PC

- [ ] **Set up the other stations.** The café has 4 PCs and 3 PS5s. Only `pc-01`
      has ever reported in, so 6 of 7 machines have no lock on them.
- [ ] **Point `NEXT_PUBLIC_AGENT_DOWNLOAD_URL`** at the published release on
      Vercel, then redeploy.

---

## Known gaps, not bugs

- **No way to pay from the lock screen.** There is no payment code in the agent
  at all. A customer asks at the counter and staff unlock from the dashboard;
  the screen now says so rather than showing a QR code that does not exist.
- **No crash handler.** An unhandled exception exits the agent, leaving the PC
  unlocked until the watchdog restarts it — up to a minute.
- **Safe Mode** bypasses the startup task. Needs a BIOS password on machines
  customers can physically reach.
- **Anyone with the admin password** can remove the lock. This defends against
  customers, not administrators.
- **No PS5 support yet.** The Raspberry Pi agent is not started, so 3 of the 7
  stations cannot be locked at all.

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
- Heartbeats reach the website — `station_status` shows `pc-01` reporting
- The installer builds and installs
- `remove-everything.ps1` returns a machine to normal
- **Setup code flow end to end** — 16 codes issued and `pc-01` enrolled. This was
  previously listed as the biggest untested piece; it has run.
- **The three station migrations** are applied — `station_enrollments`,
  `station_status` and `station_unlock_log` all exist and hold rows.
- **The installer is published** to GitHub Releases under the `pc-lock-latest`
  tag, alongside a `version.txt` the updater reads.
