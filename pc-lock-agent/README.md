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
| 3 | `MqttService` — subscribe to unlock/lock/warn | **done, unverified** |
| 4 | `GameMenuForm` — game tiles, launching, return-on-exit | not started |
| 5 | `SessionManager` — countdown, warnings, auto-relock | not started |
| 6 | Auto-start on Windows boot | not started |

> Steps 1-2 were authored on macOS (where Windows Forms cannot build) and then
> verified on a real Windows machine: fullscreen lock covers the taskbar, every
> listed shortcut is blocked, Task Manager refuses to open while active and works
> again after exit.

### What step 2 blocks

| Shortcut | Blocked | How |
|---|---|---|
| Windows key (L/R) | yes | keyboard hook |
| Alt+Tab | yes | keyboard hook |
| Alt+F4 | yes | keyboard hook |
| Alt+Esc | yes | keyboard hook |
| Ctrl+Esc (Start menu) | yes | keyboard hook |
| Ctrl+Shift+Esc (Task Manager) | yes | keyboard hook |
| Context-menu key | yes | keyboard hook |
| **Ctrl+Alt+Del** | **no — impossible** | see below |

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

`AllowDevExit` is deliberately **not** in this file. It stays a compile-time
constant in `AgentSettings.cs` so the escape hatch cannot be switched back on by
editing a text file on a café PC.

A missing or malformed `appsettings.json` logs a warning and falls back to
defaults rather than refusing to start — a kiosk that fails to launch leaves the
PC sitting on an unprotected desktop, which is worse than one running with the
wrong station id.

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

**5. Send commands** from a third terminal. Unlock for one hour:

```bash
"C:\Program Files\mosquitto\mosquitto_pub.exe" -h 127.0.0.1 -t "cafe/station/PC-01/command" -m "{\"action\":\"unlock\",\"duration_seconds\":3600,\"session_id\":\"test-1\"}"
```

Lock it again:

```bash
"C:\Program Files\mosquitto\mosquitto_pub.exe" -h 127.0.0.1 -t "cafe/station/PC-01/command" -m "{\"action\":\"lock\"}"
```

Watch the heartbeat and status messages the agent publishes back:

```bash
"C:\Program Files\mosquitto\mosquitto_sub.exe" -h 127.0.0.1 -t "cafe/station/PC-01/status" -v
```

### What to expect

| Action | Expected |
|---|---|
| Broker running, agent starts | Indicator green, `status` message published |
| `unlock` | Lock screen disappears; keys stay blocked |
| `lock` | Lock screen returns to the front |
| `warn` | Log line only — warning UI is step 5 |
| Broker stopped mid-session | Indicator amber, station **stays as-is**, retries every 5s |
| Malformed JSON published | Warning in `agent.log`, command ignored, stays locked |

**Two known gaps at this step**, both by design:

- **Unlock reveals the Windows desktop.** Step 4 replaces that with a fullscreen
  game menu so the desktop is never visible. Key blocking stays active meanwhile,
  so Alt+Tab / Windows key / Task Manager are still unreachable.
- **`duration_seconds` is logged but not enforced.** There is no countdown yet —
  a session stays open until an explicit `lock` arrives. Auto-relock is step 5.

Diagnostics are written to `agent.log` beside the exe (and to the debugger
output window). That file is the first place to look when something misbehaves
on a real café PC.

### If Task Manager stays disabled after a crash

`DisableTaskMgr` is restored on normal exit, but a hard kill (power loss, "End
task") can leave it set. To clear it manually:

```
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\System" /v DisableTaskMgr /f
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

### Getting back out

The lock screen is fullscreen, always-on-top, and now swallows Alt+F4 and
Alt+Tab. **Ctrl+Shift+Alt+Q is the only way out.**

That chord is handled in two places — the global keyboard hook and the form's
own key handler — so it still works if the hook fails to install or if the
window loses focus.

### Before deploying to a café PC

Set `AllowDevExit = false` in `AgentSettings.cs`. It is `true` by default so you
cannot lock yourself out mid-development, but any customer who finds the chord in
a shipped build walks straight to the desktop. The orange **DEV BUILD** badge in
the top-left corner is there to make an unsafe build obvious on sight.

Once it is `false` and step 3 (MQTT) is not yet wired up, there is **no way to
exit the app at all** short of a remote session or power cycle. Do not set it on
a machine you cannot physically reach.
