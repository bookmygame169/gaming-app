"""
Physically switching the TV between the PS5 and this Pi's locked screen.

WHAT THE HARDWARE ACTUALLY IS

An HDMI switch (a UGREEN 2-in-1-out) sits between the consoles and the TV:

    PS5 HDMI  ---> input 1 \\
                            >--- switch --- one cable ---> TV
    Pi  HDMI  ---> input 2 /

Whichever input the switch has selected is what the customer sees. The TV has
only that one cable in it, so there is no other way to reach the PS5 - which is
the whole point of doing it this way rather than in software.

The switch is changed by a button on its case. A relay is soldered across that
button's contacts. A relay is just a switch operated by electricity: sending
power to it closes its contacts, which is electrically identical to somebody
pressing the button with a finger. Sending power for a moment and then stopping
is a "press and release".

THE AWKWARD PART

The button only *toggles*. There is no way to say "select input 1" - each press
just moves to the other input. The switch also has no wire back to the Pi, so
it cannot be asked which input it is currently on.

So this module has to remember. Every press flips a boolean, and that boolean
is written to disk so a reboot does not lose track. `calibrate()` exists for the
case where it does drift - somebody presses the physical button, or the Pi is
unplugged mid-session - and a human tells it what the TV is really showing.
"""

from __future__ import annotations

import json
import logging
import threading
import time
from pathlib import Path
from typing import Protocol

log = logging.getLogger(__name__)

# How long the relay holds the button down. A real finger-press is around a
# tenth of a second; 300ms is comfortably longer than the switch needs to
# register it, and still far too short for anyone to notice.
PRESS_SECONDS = 0.3

# The switch ignores a second press that arrives while it is still changing
# over, which would leave this module believing it had toggled when it had not.
# Presses closer together than this are spaced out rather than dropped.
MIN_GAP_SECONDS = 1.0


class SwitchBackend(Protocol):
    """Whatever can physically press the button."""

    def press(self, seconds: float) -> None:
        ...


class GpioZeroBackend:
    """
    The real thing: a relay wired to one of the Pi's GPIO pins.

    `OutputDevice.on()` puts voltage on the pin, which energises the relay coil
    and closes the contacts across the switch's button. `off()` releases it.

    active_high=False is the common case for the cheap blue relay boards: they
    trigger when the pin is pulled LOW, not HIGH. If the relay clicks once when
    the Pi boots and then behaves backwards, this is the setting to flip.
    """

    def __init__(self, pin: int, active_high: bool = False) -> None:
        from gpiozero import OutputDevice  # imported here so a Mac can import this module

        self._device = OutputDevice(pin, active_high=active_high, initial_value=False)
        log.info("Relay ready on GPIO %s (active_high=%s)", pin, active_high)

    def press(self, seconds: float) -> None:
        self._device.on()
        time.sleep(seconds)
        self._device.off()


class FakeBackend:
    """
    Stands in for the relay when there is no Pi.

    Used by the tests, and by `main.py --dry-run` so the rest of the agent can
    be exercised on a laptop. Counts presses so a test can assert that a lock
    that was already locked did not move the switch.
    """

    def __init__(self) -> None:
        self.presses = 0

    def press(self, seconds: float) -> None:
        self.presses += 1


class HdmiSwitch:
    """
    Tracks which input is showing, and presses the button when it needs to change.

    Every public method is safe to call when already in the wanted state: it
    simply does nothing, because a needless press would switch *away* from where
    we want to be.
    """

    def __init__(
        self,
        backend: SwitchBackend,
        state_file: Path | None = None,
        press_seconds: float = PRESS_SECONDS,
        min_gap_seconds: float = MIN_GAP_SECONDS,
    ) -> None:
        self._backend = backend
        self._state_file = state_file
        self._press_seconds = press_seconds
        self._min_gap = min_gap_seconds
        self._last_press = 0.0
        self._lock = threading.Lock()
        self._ps5_active = self._load_state()

    # ------------------------------------------------------------------ state

    @property
    def ps5_active(self) -> bool:
        """True when the TV is showing the PS5 rather than the locked screen."""
        return self._ps5_active

    def _load_state(self) -> bool:
        """
        On boot, believe what was last written.

        A Pi that reboots mid-session comes back not knowing what the TV is
        showing, and it cannot ask. Remembering is the best available answer;
        `calibrate()` is the fix when it turns out to be wrong.
        """
        if self._state_file is None or not self._state_file.exists():
            return False
        try:
            return bool(json.loads(self._state_file.read_text()).get("ps5_active", False))
        except Exception:
            log.warning("Could not read %s; assuming the locked screen.", self._state_file)
            return False

    def _save_state(self) -> None:
        if self._state_file is None:
            return
        try:
            self._state_file.parent.mkdir(parents=True, exist_ok=True)
            self._state_file.write_text(json.dumps({"ps5_active": self._ps5_active}))
        except Exception:
            # Losing the note is survivable; failing the switch is not.
            log.warning("Could not write %s", self._state_file, exc_info=True)

    # ----------------------------------------------------------------- moving

    def _press(self) -> None:
        gap = time.monotonic() - self._last_press
        if gap < self._min_gap:
            time.sleep(self._min_gap - gap)

        self._backend.press(self._press_seconds)
        self._last_press = time.monotonic()
        self._ps5_active = not self._ps5_active
        self._save_state()

    def show_ps5(self) -> bool:
        """
        Put the PS5 on the TV. Returns True if it is now showing.

        Called on unlock, and again after a warning interruption.
        """
        with self._lock:
            if self._ps5_active:
                log.debug("Already on the PS5; not pressing.")
                return True
            self._press()
            log.info("Switched the TV to the PS5.")
            return self._ps5_active

    def show_locked(self) -> bool:
        """
        Put this Pi's locked screen back on the TV. Returns True when locked.

        Called when paid time ends, when the dashboard locks the station, and
        briefly when showing a time warning.
        """
        with self._lock:
            if not self._ps5_active:
                log.debug("Already on the locked screen; not pressing.")
                return True
            self._press()
            log.info("Switched the TV back to the locked screen.")
            return not self._ps5_active

    def calibrate(self, ps5_active: bool) -> None:
        """
        Tell it what the TV is really showing, without touching the switch.

        For when the belief has drifted from reality - someone pressed the
        physical button, or the Pi lost power while a session was running. Staff
        run this from the tools script; nothing automatic calls it, because
        nothing automatic can see the screen.
        """
        with self._lock:
            self._ps5_active = ps5_active
            self._save_state()
            log.info("Calibrated: the TV is showing %s.", "the PS5" if ps5_active else "the locked screen")
