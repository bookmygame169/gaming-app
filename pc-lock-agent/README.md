# PC Lock Agent

Windows agent for the BookMyGame **hard-lock session system**. Runs on each
gaming PC and controls whether a customer can use the machine at all, based on
whether the backend has confirmed payment.

Target behaviour (full system, once complete):

- **Before payment** — fullscreen "Locked — Scan to Pay" screen with a QR code.
  Desktop, taskbar, Explorer and settings are all unreachable.
- **After payment** — lock screen is replaced by a fullscreen *game menu*, not
  the Windows desktop. Closing a game returns to the menu, never the desktop.
- **Near the end** — brief warning overlays at the 5-minute and 1-minute marks.
- **On expiry** — back to the locked screen, whatever was running.

All business logic (pricing, bookings, payment state) lives in the backend. This
agent only receives `unlock` / `lock` / `warn` commands with durations over MQTT.

---

## Relationship to `pc-timer-system/`

`pc-timer-system/` is the **existing, currently-in-use** PowerShell system: staff
start/extend/end sessions from an admin panel over the LAN, and PCs lock via the
native Windows lock screen.

It is a *time-tracking and convenience* tool — it has **no payment gate**, so
staff can start a session for an unpaid customer, which is the exact revenue leak
this new agent exists to close. It also relies on the standard Windows lock
screen rather than blocking Alt+Tab / Task Manager / the Windows key.

The two are independent. `pc-timer-system/` keeps running untouched until this
agent is proven on a real machine, then it can be retired.

---

## Build order

Each step is built and verified before the next one starts.

| # | Piece | Status |
|---|---|---|
| 1 | `LockedScreenForm` — fullscreen lock screen | **done, verified on Windows** |
| 2 | `SystemLockService` — keyboard hooks, Task Manager policy | **done, verified on Windows** |
| 3 | `MqttService` — subscribe to unlock/lock/warn | **done, partly verified** |
| 4 | `GameMenuForm` — game tiles, launching, return-on-exit | **done, verified on Windows** |
| 5 | `SessionManager` — countdown, warnings, auto-relock | **done, verified on Windows** |
| 6 | Auto-start on Windows boot | **done, unverified** |

> Everything here was authored on macOS (where Windows Forms cannot build) and
> verified afterwards on a real Windows machine.
>
> **Verified:** fullscreen lock covers the taskbar; every listed shortcut is
> blocked; Task Manager refuses to open while active and works again after exit;
> the agent connects and subscribes to the broker; unlocking shows the game menu;
> launching a game keeps it inside the kiosk with no desktop visible; closing it
> returns to the menu.
>
> **Not yet verified:** MQTT command *parsing* end to end. Lock and unlock have
> so far been driven by the dev chords, which exercise the same shell code but
> not the message-handling path. Sending a real `mosquitto_pub` command is still
> worth doing once.

### What step 2 blocks

| Shortcut | Blocked | How |
|---|---|---|
| Windows key (L/R) | yes | keyboard hook |
| Alt+Tab | yes | keyboard hook |
| Alt+F4 | yes, **except while a game is running** | keyboard hook |
| Alt+Esc | yes | keyboard hook |
| Ctrl+Esc (Start menu) | yes | keyboard hook |
| Ctrl+Shift+Esc (Task Manager) | yes | keyboard hook |
| Context-menu key | yes | keyboard hook |
| **Ctrl+Alt+Del** | **no — impossible** | see below |

Alt+F4 is the one deliberate exception. It is blocked on the lock screen and the
game menu, but allowed while a game is in the foreground — it is the standard way
to quit a game, and with it blocked a customer who launches something without an
in-game exit would be stranded until their time ran out. Closing a game returns
them to the menu, never the desktop. Alt+Tab and the Windows key stay blocked
throughout.

**Ctrl+Alt+Del cannot be intercepted by any application.** Windows reserves it
at the kernel level as the Secure Attention Sequence, precisely so no program can
trap it or fake the screen behind it — that guarantee is what makes it safe to
type a password after pressing it. The plan document lists it as a blocking
requirement; that part is not achievable as written.

What *is* achievable, and what step 2 does instead, is set the per-user
`DisableTaskMgr` policy so the **Task Manager** entry on that screen refuses to
open. The customer can still reach the security screen and Sign Out, so a
non-admin auto-login account (per the plan's hardening notes) remains important.

---

## Configuration

`appsettings.json` sits beside the exe and is read at startup:

```json
{
  "stationId": "PC-01",
  "mqtt": { "host": "127.0.0.1", "port": 1883, "username": null, "password": null }
}
```

Set `stationId` uniquely per machine — it drives both MQTT topics and is how the
backend identifies the station.

### Games

The `games` list drives the menu shown during a session:

```json
"games": [
  {
    "name": "Valorant",
    "exePath": "C:\\Riot Games\\VALORANT\\live\\VALORANT.exe",
    "iconPath": "C:\\CafeAssets\\valorant.png",
    "arguments": null,
    "workingDirectory": null
  }
]
```

Only `name` and `exePath` are required. Without `iconPath` the tile uses the icon
embedded in the executable. `workingDirectory` defaults to the exe's own folder,
which many games need in order to find their data files.

The repo ships with Notepad and Paint as placeholders so the menu can be tested
before any real games are installed — replace them.

**Launcher-based games are a known limitation.** Titles that go through Steam,
Epic or Riot often start a small process that hands off to the launcher and exits
immediately. The agent watches the process it started, so it would see that exit
and bounce straight back to the menu while the game is still loading. Direct
`.exe` launches work correctly. Handling launcher titles needs different
detection and is not solved yet.

`AllowDevExit` is deliberately **not** in this file. It stays a compile-time
constant in `AgentSettings.cs` so the escape hatch cannot be switched back on by
editing a text file on a café PC.

A missing or malformed `appsettings.json` logs a warning and falls back to
defaults rather than refusing to start — a kiosk that fails to launch leaves the
PC sitting on an unprotected desktop, which is worse than one running with the
wrong station id.

---

## Using a cloud broker (HiveMQ Cloud)

A broker on the internet is what lets the live site on Vercel reach café PCs. A
Mosquitto on someone's desktop cannot be reached from Vercel, so local testing
only ever works with the site running locally too.

HiveMQ Cloud has a free plan that is enough for a café.

**1. Create a free cluster** at [hivemq.cloud](https://www.hivemq.com/products/mqtt-cloud-broker/).
Note the hostname (`something.s1.eu.hivemq.cloud`) and create an access
credential — a username and password.

**2. Point the agent at it** in `appsettings.json` on each PC:

```json
"mqtt": {
  "host": "something.s1.eu.hivemq.cloud",
  "port": 8883,
  "useTls": true,
  "username": "station-user",
  "password": "the-password"
}
```

Port **8883** and `useTls: true` go together — hosted brokers refuse plain
connections. Without TLS the broker password and every unlock command would
cross the internet in clear text.

**3. Point the website at it.** In Vercel → Settings → Environment Variables:

```
MQTT_BROKER_URL = mqtts://something.s1.eu.hivemq.cloud:8883
MQTT_USERNAME   = web-user
MQTT_PASSWORD   = the-password
```

Note `mqtts://`, not `mqtt://`. Redeploy afterwards for the variables to apply.

For local development the same variables live in `.env.local`.

**Give the website and the stations separate credentials.** The website only
ever publishes and the stations only ever subscribe, so if HiveMQ's permission
settings allow it, restrict each accordingly — a leaked station password then
cannot be used to unlock anything.

---

## Testing step 3 with a local broker

The agent needs an MQTT broker. For development, run Mosquitto on the same PC —
no backend required, you drive it by hand.

**1. Install Mosquitto** (includes `mosquitto_pub`):

```bash
winget install EclipseFoundation.Mosquitto
```

**2. Allow anonymous local connections.** Create `mosquitto.conf` with:

```
listener 1883 127.0.0.1
allow_anonymous true
```

**3. Run the broker:**

```bash
"C:\Program Files\mosquitto\mosquitto.exe" -c mosquitto.conf -v
```

**4. Start the agent** in another terminal. The bottom-left indicator should turn
green and read "Broker connected".

**5. Press Ctrl+Shift+Alt+L** to suspend the lock, then Alt+Tab to a terminal.
Without this you cannot reach one — see [Dev chords](#dev-chords).

**6. Send commands.** Either double-click the scripts in `tools/`
(`unlock.bat`, `lock.bat`, `clear-retained.bat`) or run the commands below by
hand. Edit the `STATION` and `BROKER` variables at the top of each script if
yours differ.

> **Start the agent before publishing.** A normal MQTT message is delivered only
> to subscribers connected at that instant — it is not queued. Publishing while
> the agent is stopped means the broker accepts the message and discards it, and
> `mosquitto_pub` still exits silently with no error, so it looks like it worked.
> This needs two terminals: one running the agent, one to publish from.
>
> To avoid the two-terminal dance entirely, publish with `-r` (retained) *before*
> starting the agent — the broker holds the message and delivers it the moment
> the agent subscribes. Clear it afterwards with `-r -n` or it fires on every
> start. **Testing only:** the real backend must never publish commands retained,
> or a stale unlock would replay on every station reconnect.

> These are **PowerShell** commands. The single quotes around the JSON matter —
> they keep the inner double quotes literal. In `cmd.exe` you would need
> `-m "{\"action\":\"lock\"}"` instead.

Unlock for one hour:

```bash
& "C:\Program Files\mosquitto\mosquitto_pub.exe" -h 127.0.0.1 -t "cafe/station/PC-01/command" -m '{"action":"unlock","duration_seconds":3600,"session_id":"test-1"}'
```

Lock it again:

```bash
& "C:\Program Files\mosquitto\mosquitto_pub.exe" -h 127.0.0.1 -t "cafe/station/PC-01/command" -m '{"action":"lock"}'
```

Watch the heartbeat and status messages the agent publishes back:

```bash
& "C:\Program Files\mosquitto\mosquitto_sub.exe" -h 127.0.0.1 -t "cafe/station/PC-01/status" -v
```

### What to expect

| Action | Expected |
|---|---|
| Broker running, agent starts | Indicator green, `status` message published |
| `unlock` | Lock screen is replaced by the game menu; countdown starts |
| Click a game tile | Game launches above the menu; the desktop is never shown |
| Close the game | Back to the game menu, never the desktop |
| 5 min / 1 min left | Warning banner appears without stealing focus |
| Countdown reaches zero | Game closed, station re-locks by itself |
| `lock` | Any running game is closed, lock screen returns to the front |
| Restart mid-session | Session resumes with the correct time left |
| `warn` | Log line only — warning UI is step 5 |
| Broker stopped mid-session | Indicator amber, station **stays as-is**, retries every 5s |
| Malformed JSON published | Warning in `agent.log`, command ignored, stays locked |

---

## Deploying to a café PC

**1. Turn off the dev escape hatch.** Set `AllowDevExit = false` in
`AgentSettings.cs`. While it is true, anyone can quit the agent with
Ctrl+Shift+Alt+Q or suspend the lock with Ctrl+Shift+Alt+L. The agent writes a
warning to `agent.log` on every start while it is still enabled.

**2. Build a release copy:**

```bash
dotnet publish PcLockAgent -c Release -o "C:\BookMyGame\PcLockAgent"
```

**3. Set that machine's station id and broker address** in
`C:\BookMyGame\PcLockAgent\appsettings.json`.

**4. Install the startup task** — right-click PowerShell, Run as Administrator:

```bash
.\tools\install-startup.ps1
```

To remove it later: `.\tools\uninstall-startup.ps1`

### How the startup task works

It has two triggers:

- **At log on** — the agent is up before the customer touches anything.
- **Every minute** — a watchdog.

The watchdog matters more than it looks. Starting at logon alone would mean that
killing the agent leaves the PC unlocked and free for the rest of the day. With
a repeating trigger and `MultipleInstances=IgnoreNew`, a killed agent is back
within a minute, and the repeat does nothing while it is already running.

The task runs as the logged-in user at normal privilege. The agent does not need
admin — it writes only to `HKCU` and hooks its own session — and running it
elevated would add a UAC prompt for no benefit.

### Recommended alongside this

From the project plan's hardening notes, and still worth doing:

- A **standard (non-admin) Windows account** for gaming, with auto-login. A
  customer then cannot install software, change settings, or elevate anything —
  which also closes the gap where a keyboard hook cannot intercept keys headed
  for an elevated process.
- **Static IPs / DHCP reservations** so station addresses do not move.

Replacing the Windows shell (`explorer.exe`) with this agent is a stronger lock
still — killing it would leave no desktop at all rather than exposing one. The
project plan lists it as a possible later phase; the code is structured so the
lock screen and game menu do not assume Explorer is running, but this has not
been attempted.

---

## Sessions and time enforcement

`duration_seconds` from the `unlock` command now drives a real countdown:

- Remaining time is shown in the game menu header, turning red for the last
  five minutes.
- A banner appears at **5 minutes** and **1 minute** remaining. It never takes
  focus, so it cannot throw a customer out of a fullscreen game.
- At zero the station re-locks by itself, closing any running game.

**Time is stored as a wall-clock end instant, not a countdown budget.** Sleeping
or suspending the machine therefore cannot be used to bank extra time — on wake
the deadline has simply passed.

**Sessions survive a restart.** The end time is written to `session.json` beside
the exe and resumed on startup. Without that, killing the agent would be a way to
get free time: it would come back locked, ready to be unlocked again with no
record. It also means a genuine crash does not cost a paying customer the rest of
their hour. An expired session found on startup is discarded and the station
stays locked.

**If the backend omits `duration_seconds`,** the station unlocks with no
countdown and stays open until an explicit `lock`. That is an unbounded session —
exactly the hole this system exists to close — so it is logged as an ERROR.
Cutting a customer off early on a guessed limit seemed worse than requiring the
backend to always send the field, but it does mean this must not be missed when
the publisher is built.

**Known limitation:** a game running in true exclusive-fullscreen DirectX may
paint over the warning banner. Borderless-windowed mode, which most modern titles
default to, shows it correctly.

Diagnostics are written to `agent.log` beside the exe (and to the debugger
output window). That file is the first place to look when something misbehaves
on a real café PC.

### Hiding the desktop and taskbar

Blocking keys is only half the job — the desktop and taskbar have to be
unreachable by mouse too:

- **The taskbar is hidden** while the lock is active, and restored on exit or
  when dev passthrough is switched on. Without this the Start button, clock and
  pinned apps stay one click away, and the taskbar sits above the game menu
  whenever the menu is not topmost.
- **The game menu stays on screen behind a running game** rather than hiding
  itself. Hiding it would expose the desktop behind any game that is windowed,
  minimised, or still loading.

### Recovering after a crash

Both the Task Manager policy and the hidden taskbar are undone on normal exit,
but a hard kill (power loss, "End task") can leave them applied.

Restore Task Manager:

```
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\System" /v DisableTaskMgr /f
```

Restore the taskbar — easiest is to restart Explorer:

```
taskkill /f /im explorer.exe && start explorer.exe
```

---

## Running it

Requires the [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0) on
**Windows** (Windows Forms cannot build or run on macOS/Linux).

```bash
cd pc-lock-agent
dotnet run --project PcLockAgent
```

Or open `PcLockAgent.sln` in Visual Studio 2022 and press F5.

### Dev chords

The lock screen is fullscreen, always-on-top, and swallows Alt+F4 and Alt+Tab.
Two chords exist while `AllowDevExit` is true:

| Chord | Effect |
|---|---|
| **Ctrl+Shift+Alt+U** | Act as though an `unlock` command arrived (1 hour) |
| **Ctrl+Shift+Alt+T** | Start a 90-second session, to watch the countdown |
| **Ctrl+Shift+Alt+K** | Act as though a `lock` command arrived |
| **Ctrl+Shift+Alt+L** | Suspend/restore the lock |
| **Ctrl+Shift+Alt+Q** | Quit the agent |

**U and K are the easy way to test.** They drive exactly the same code an MQTT
command would, so the whole flow — lock screen → game menu → launch a game →
close it → back to the menu → locked again — can be exercised with the keyboard
alone, no broker and no terminal. What they do *not* test is message parsing and
the broker connection; use `mosquitto_pub` for that.

**Ctrl+Shift+Alt+L is what makes the agent testable.** With the lock active there
is no way to reach a terminal to publish MQTT commands — Alt+Tab and the Windows
key are gone, and the window sits above everything. Suspending unblocks the keys
*and* drops always-on-top, so you can Alt+Tab to PowerShell, send a command, and
watch the screen react. Press it again to restore the lock.

Both chords are handled inside the keyboard hook itself, so they work even when
the window has lost focus. The Q chord is additionally handled by the form's own
key handler, as a fallback in case the hook failed to install.

Neither chord exists once `AllowDevExit` is false.

### Before deploying to a café PC

Set `AllowDevExit = false` in `AgentSettings.cs`. It is `true` by default so you
cannot lock yourself out mid-development, but any customer who finds the chord in
a shipped build walks straight to the desktop. The orange **DEV BUILD** badge in
the top-left corner is there to make an unsafe build obvious on sight.

Once it is `false` and step 3 (MQTT) is not yet wired up, there is **no way to
exit the app at all** short of a remote session or power cycle. Do not set it on
a machine you cannot physically reach.
