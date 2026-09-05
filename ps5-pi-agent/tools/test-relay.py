#!/usr/bin/env python3
"""
Step one of bringing up a station: does the relay actually work the switch?

Run this on the Pi, with the TV on, before bothering with MQTT or anything
else. It presses the button and asks you what you saw. Nothing else in the
agent is worth debugging until this is reliable.

    python3 tools/test-relay.py --pin 17

If the relay clicks but the picture never changes, the relay is working and the
soldering onto the switch's button is not. If nothing clicks at all, it is the
wiring to the Pi or the active_high setting - try --active-high.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from agent.relay import GpioZeroBackend, HdmiSwitch  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pin", type=int, required=True, help="BCM pin the relay's signal wire is on")
    parser.add_argument(
        "--active-high",
        action="store_true",
        help="Use if the relay triggers on HIGH. Most cheap blue boards do not.",
    )
    parser.add_argument("--presses", type=int, default=4)
    args = parser.parse_args()

    try:
        backend = GpioZeroBackend(args.pin, active_high=args.active_high)
    except Exception as err:
        print(f"Could not open GPIO {args.pin}: {err}")
        print("Is this a Pi, and is gpiozero installed? (pip install gpiozero lgpio)")
        return 1

    switch = HdmiSwitch(backend, state_file=None)

    print(f"\nPressing the switch button {args.presses} times, 3 seconds apart.")
    print("Watch the TV. It should change source on every press.\n")

    import time

    for n in range(1, args.presses + 1):
        # Going through the switch object rather than the backend so the toggle
        # bookkeeping is exercised too, not just the wiring.
        if switch.ps5_active:
            switch.show_locked()
            now = "the Pi's locked screen"
        else:
            switch.show_ps5()
            now = "the PS5"
        print(f"  press {n}: the TV should now be showing {now}")
        time.sleep(3)

    print("\nDid the picture change on every press? If yes, the hardware is good.")
    print("If it changed only sometimes, increase PRESS_SECONDS in agent/relay.py.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
