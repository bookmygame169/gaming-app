"""
What happens when a command arrives.

Deliberately knows nothing about payment, pricing or bookings - those live in
the site. This decides only: is the PS5 on the screen, and for how much longer.

The timers are scheduled through an injectable object so the whole state
machine can be tested without waiting an hour for a session to end.
"""

from __future__ import annotations

import logging
import threading
from typing import Callable, Protocol

log = logging.getLogger(__name__)

# How long the game is interrupted to show a "5 minutes left" message. The plan
# asks for 5-8 seconds: long enough to read, short enough not to matter in a
# match. Each warning costs two relay presses and two HDMI handshakes, so it is
# not free - see the README.
WARNING_SECONDS = 6.0


class Scheduler(Protocol):
    def call_later(self, delay: float, fn: Callable[[], None]) -> object: ...
    def cancel(self, handle: object) -> None: ...


class ThreadingScheduler:
    """Real timers. One thread per pending callback, of which there are at most two."""

    def call_later(self, delay: float, fn: Callable[[], None]) -> object:
        timer = threading.Timer(delay, fn)
        timer.daemon = True
        timer.start()
        return timer

    def cancel(self, handle: object) -> None:
        handle.cancel()


class SessionManager:
    def __init__(
        self,
        switch,
        scheduler: Scheduler | None = None,
        on_state_change: Callable[[str, str | None], None] | None = None,
        warning_seconds: float = WARNING_SECONDS,
    ) -> None:
        self._switch = switch
        self._scheduler = scheduler or ThreadingScheduler()
        self._on_state_change = on_state_change or (lambda status, session: None)
        self._warning_seconds = warning_seconds

        self._end_handle: object | None = None
        self._warning_handle: object | None = None
        self._session_id: str | None = None
        self._lock = threading.RLock()

    # ----------------------------------------------------------------- state

    @property
    def session_id(self) -> str | None:
        return self._session_id

    @property
    def status(self) -> str:
        """What the heartbeat reports: exactly what the TV is showing."""
        return "unlocked" if self._switch.ps5_active else "locked"

    # -------------------------------------------------------------- commands

    def unlock(self, duration_seconds: int, session_id: str | None, open_ended: bool = False) -> bool:
        """
        Put the PS5 on the TV for a paid stretch of time.

        Returns False if the switch would not move, and does NOT record a
        session in that case: reporting "unlocked" for a screen that never
        changed bills a customer for time they cannot use, and hides the fault
        from the dashboard.
        """
        with self._lock:
            self._cancel_timers()

            if not self._switch.show_ps5():
                log.error("Refusing to start a session: the switch did not move.")
                self._notify()
                return False

            self._session_id = session_id

            if open_ended or duration_seconds <= 0:
                # An unlimited membership. The seconds the server sends are a
                # backstop against somebody walking out, not time being spent,
                # so there is no countdown to run.
                log.info("Unlocked open-ended (session %s)", session_id)
            else:
                self._end_handle = self._scheduler.call_later(
                    duration_seconds, self._time_up
                )
                log.info("Unlocked for %ss (session %s)", duration_seconds, session_id)

            self._notify()
            return True

    def lock(self, reason: str) -> None:
        """Take the PS5 off the TV and end the session."""
        with self._lock:
            self._cancel_timers()
            self._switch.show_locked()
            self._session_id = None
            log.info("Locked: %s", reason)
            self._notify()

    def warn(self, remaining_seconds: int) -> None:
        """
        Show a "time running out" message without ending the session.

        The screen is the only way to tell a customer anything - they are
        looking at a TV, not a phone - so the warning is shown by dropping to
        the locked screen for a few seconds and then going back to the game.

        Ignored when the station is already locked: there is nobody playing to
        warn, and switching would put the PS5 on screen for free.
        """
        with self._lock:
            if not self._switch.ps5_active:
                log.debug("Ignoring a warning for a station that is not in use.")
                return
            if self._warning_handle is not None:
                log.debug("A warning is already showing.")
                return

            log.info("Interrupting to warn: %ss left", remaining_seconds)
            self._switch.show_locked()
            self._warning_handle = self._scheduler.call_later(
                self._warning_seconds, self._end_warning
            )
            self._notify()

    # --------------------------------------------------------------- internal

    def _end_warning(self) -> None:
        with self._lock:
            self._warning_handle = None
            # Only resume if the session is still meant to be running. If the
            # time ran out while the warning was on screen, going back to the
            # PS5 here would hand out free minutes.
            if self._end_handle is None and self._session_id is None:
                log.info("The session ended while the warning was showing; staying locked.")
                return
            self._switch.show_ps5()
            self._notify()

    def _time_up(self) -> None:
        with self._lock:
            self._end_handle = None
            self.lock("the paid time ran out")

    def _cancel_timers(self) -> None:
        for handle in (self._end_handle, self._warning_handle):
            if handle is not None:
                self._scheduler.cancel(handle)
        self._end_handle = None
        self._warning_handle = None

    def _notify(self) -> None:
        try:
            self._on_state_change(self.status, self._session_id)
        except Exception:
            log.warning("A state-change listener raised", exc_info=True)
