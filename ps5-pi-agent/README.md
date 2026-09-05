# PS5 station agent (Raspberry Pi)

Locks a PS5 station by controlling what the TV is allowed to show. This is the
hardware approach from the original plan — the one that cannot be bypassed with
the TV remote.

## How it works

```
   PS5  HDMI ──▶ input 1 ┐
                          ├── HDMI switch ──▶ one cable ──▶ TV
   Pi   HDMI ──▶ input 2 ┘         ▲
                                   │ button
                              relay across it
                                   │
                              Pi GPIO pin
```

The TV has exactly one cable in it, from the switch. So the only way to see the
PS5 is for the switch to be on input 1, and the only thing that changes the
switch is this Pi. Pressing Source on the TV remote reaches nothing — that is
the whole point, and the reason this beats the software-only approach.

A relay is a switch operated by electricity. Its contacts are soldered across
the HDMI switch's button, so energising it for 300ms is electrically identical
to somebody pressing that button with a finger.

## The awkward bit, and how it is handled

The button only **toggles**. It cannot be told "go to input 1", and the switch
has no wire back to the Pi, so it cannot be asked what it is showing.

So the agent remembers, in `switch-state.json`, and writes it after every press
so a reboot does not lose track. When the record drifts — someone pressed the
physical button, or the Pi lost power mid-session — fix it without moving the
switch:

```bash
python3 -c "
from agent.relay import HdmiSwitch, GpioZeroBackend
from pathlib import Path
HdmiSwitch(GpioZeroBackend(17), Path('switch-state.json')).calibrate(ps5_active=True)
"
```

This is the one genuinely fragile part of the design, and it comes from the
hardware, not the code.

## Bringing up a station

**1. Prove the relay works before anything else.**

```bash
python3 tools/test-relay.py --pin 17
```

It presses four times, three seconds apart. The TV should change source every
time. If the relay clicks but the picture does not change, the soldering onto
the switch button is the problem. If nothing clicks, it is the wiring or the
trigger polarity — try `--active-high`.

**2. Link the Pi to a station.** Generate a setup code in the dashboard
(Stations → Add a gaming PC), then:

```bash
python3 -m agent.main --enroll YOUR-CODE
```

**3. Run it, and make it start on boot.**

```bash
python3 -m agent.main          # try it in the foreground first
./tools/install-service.sh     # then install it as a service
```

## Where things live

| File | Knows about |
| --- | --- |
| `agent/relay.py` | Pressing a button, and what is on screen |
| `agent/session.py` | Time: countdowns, expiry, warnings |
| `agent/mqtt_client.py` | Messages from the site |
| `agent/display.py` | Pixels: the locked screen and its QR |
| `agent/station_api.py` | The site's three station routes |
| `agent/main.py` | The only file that knows the others exist |

`config.json` holds the hardware and the site — no secrets, same on every
station. `station.json` is written by enrolment and holds the broker password
and heartbeat token; it is git-ignored and `chmod 600`. That split is what lets
one SD card image serve every café.

## What is tested, and what is not

**Tested, and runs on any machine** — `python3 -m unittest discover -s tests`,
22 tests. The relay module takes a swappable backend, so the switching logic is
exercised with a fake in place of the GPIO pin. These cover the mistakes that
cost money: unlocking twice must not toggle the game off; locking an already
locked station must not hand out a free session; a warning must return to the
game; a session expiring *during* a warning must stay locked; a refused switch
must not be reported as an unlocked station.

**Not tested** — anything touching real hardware, MQTT, or the display. No Pi,
no relay and no HDMI switch were available. Expect the first bring-up to need
adjustment, particularly `PRESS_SECONDS` in `relay.py` if the switch misses
presses.

## Two differences from the plan document

The plan predates the system that actually got built, so two things were
changed to match production rather than the document:

- **Heartbeats go over HTTP**, to `POST /api/stations/heartbeat`, not to an
  MQTT `status` topic. That is what the dashboard reads and what the Windows
  agents have used since August.
- **The QR token is fetched** from `POST /api/stations/unlock-token` rather than
  arriving over MQTT, and the station enrols with a setup code instead of having
  credentials written into its config file. This is why no secret lives in this
  repo.

## Details worth knowing before changing anything

- **Unlock tokens live 120 seconds**, so the screen renews one every 90. A code
  left up all evening sends a paying customer to a page that refuses them.
- **Station names are lower case** (`ps5-01`). MQTT topics are case sensitive
  and bookings store them lower case, so `PS5-01` receives nothing at all.
- **Both topic shapes are subscribed to** — the bare `cafe/station/<name>/command`
  and the café-scoped `cafe/<id>/station/<name>/command` — because the site
  publishes both.
- **Use the `www.` host.** The apex redirects, and HTTP clients drop the
  `Authorization` header across a host-changing redirect, which makes a correct
  token look like a wrong one. This already cost time on the Windows agent.
- **A warning costs two relay presses** and two HDMI handshakes. Some TVs take a
  few seconds to resync, so a warning is not free — if that proves ugly on the
  café's sets, the honest fix is to drop the interruption and let the countdown
  run out silently.
- **A failed switch is never reported as unlocked.** If the relay does not move,
  the customer is looking at a locked screen, and claiming otherwise would bill
  them for time they cannot use.
