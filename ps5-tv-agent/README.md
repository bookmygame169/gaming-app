# PS5 TV agent

An Android TV app that locks a PS5 station the same way `pc-lock-agent` locks a
gaming PC.

The TV shows a locked screen with a QR code. A customer scans it with their own
phone, pays on `/play/<token>`, and the site publishes an unlock over MQTT. This
app then switches the TV to the HDMI socket the PS5 is plugged into. When the
paid time runs out it puts itself back in front, which takes the PS5 off screen.

Nothing on the server changed to support this. It speaks the same three station
routes and the same MQTT commands the Windows agent has used in production since
August, so a PS5 is just another station to the dashboard, the heartbeat and the
QR payment flow.

## Status: written, never run

**This has not been compiled or installed on a TV.** It was written on a machine
with no Android toolchain. Treat everything below the line as a plan that has
not been tested, and expect the first build to need fixes.

Two things in particular are unproven, and both are device-specific:

**Switching to HDMI.** `TvInput.showPs5` opens the PS5's socket as a passthrough
input, which is the same thing the TV's own Source menu does. Manufacturers vary
in whether a non-system app is allowed to do this, and some Google TV builds
refuse. `EnrollActivity` lists what this particular TV reports and says plainly
if the list is empty — if it is, this app cannot work on that set and the
Pi + relay route from the original plan is the answer.

**Getting back.** When time runs out the app has been backgrounded for an hour,
and Android 10+ blocks a background app from starting an activity. It needs
"appear over other apps" granted by hand once per TV. Setup checks for this and
warns, because without it a session would never end.

## Known hole, inherited from the original plan

A customer can press **Source** on the TV remote and reach the PS5 without
paying. This is exactly why the plan document rejected the software-only
approach and chose a Pi with a relay and an HDMI switch instead: with that, the
TV has no path to the PS5 at all.

This app does not close that hole. It is worth building anyway because the three
PS5 stations currently have **no lock whatsoever**, and "a customer has to
deliberately reach for the remote" is meaningfully better than "the console is
simply free to use". Keep the TV remotes behind the counter.

## Building it

There is no JDK or Android SDK on the machine this was written on. To build:

1. Open `ps5-tv-agent/` in Android Studio (Ladybug or newer).
2. Let it download the Gradle wrapper and the SDK for API 34.
3. Build > Build APK, or run straight onto a TV over ADB.

To install on a TV on the same network:

```bash
adb connect <tv-ip>:5555
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

The TV needs Developer options and USB/network debugging switched on first.

## Setting up a station

1. Owner dashboard > Stations > **Add a gaming PC**, and generate a setup code.
2. Open BookMyGame Station on the TV. Type the code.
3. Choose which HDMI socket the PS5 is in from the list the TV reports.
4. Grant **appear over other apps** when it asks.

The code is single use and carries no credentials, so the same APK serves every
café — the same arrangement the Windows installer uses.

## How it fits together

| Piece | What it does |
| --- | --- |
| `MainActivity` | The locked screen: café, station, QR, status |
| `AgentService` | Foreground service: MQTT, heartbeat, session clock |
| `TvInput` | Opens the PS5's HDMI input, or brings the lock screen back |
| `StationApi` | `/enroll`, `/unlock-token`, `/heartbeat` |
| `EnrollActivity` | First run: setup code and HDMI socket |
| `AgentConfig` | Stores it all in private prefs |

## Details worth knowing before changing anything

- **The QR expires after 120 seconds.** `/api/stations/unlock-token` issues
  short-lived tokens, so the screen remints one every 90 seconds. A code left up
  all evening would send a paying customer to a page that refuses them.
- **Station names are lower case** (`ps5-01`). MQTT topics are case sensitive and
  bookings store them lower case, so `PS5-01` silently receives nothing.
- **Two topic shapes are published**, the bare `cafe/station/<name>/command` and
  the café-scoped `cafe/<id>/station/<name>/command`. This subscribes to both.
- **Use the `www.` host.** The apex redirects, and HTTP clients drop the
  `Authorization` header across a host-changing redirect — which makes a correct
  token look like a wrong one. This cost time on the Windows agent already.
- **A failed switch is reported as still locked.** If the TV refuses, the app
  does not claim the station is unlocked: a customer must never be billed for
  time on a screen that never switched.
- **The dashboard treats 90 seconds of silence as offline**, and the QR flow
  refuses to take money for an offline station. A broken heartbeat stops sales,
  it is not cosmetic.
