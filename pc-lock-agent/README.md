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
| 3 | `MqttService` — subscribe to unlock/lock/warn | not started |
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
