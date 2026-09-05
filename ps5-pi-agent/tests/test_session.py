"""
Tests for what happens when a command arrives.

Every case here is one where getting it wrong either gives a customer free time
or takes away time they paid for. Timers are driven by hand so an hour-long
session can be tested in a millisecond.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from agent.relay import FakeBackend, HdmiSwitch  # noqa: E402
from agent.session import SessionManager  # noqa: E402


class ManualScheduler:
    """
    A clock the test moves by hand.

    Delays are respected: advancing six seconds fires a six-second warning but
    leaves an hour-long session timer alone. An earlier version of this ignored
    delays and fired everything, which made a warning test look like a bug in
    the agent when it was a bug in here.
    """

    def __init__(self):
        self.pending = {}
        self._next = 0
        self._now = 0.0

    def call_later(self, delay, fn):
        self._next += 1
        self.pending[self._next] = (self._now + delay, fn)
        return self._next

    def cancel(self, handle):
        self.pending.pop(handle, None)

    def advance(self, seconds):
        self._now += seconds
        while True:
            due = [(h, t, f) for h, (t, f) in self.pending.items() if t <= self._now]
            if not due:
                return
            handle, _, fn = sorted(due, key=lambda row: row[1])[0]
            self.pending.pop(handle, None)
            fn()  # may schedule more work, so the loop re-checks


def build():
    backend = FakeBackend()
    switch = HdmiSwitch(backend, state_file=None, press_seconds=0, min_gap_seconds=0)
    scheduler = ManualScheduler()
    states = []
    manager = SessionManager(
        switch,
        scheduler=scheduler,
        on_state_change=lambda status, session: states.append((status, session)),
        warning_seconds=6,
    )
    return backend, switch, scheduler, manager, states


class StartingASession(unittest.TestCase):
    def test_unlocking_puts_the_ps5_on_the_tv(self):
        backend, switch, _, manager, _ = build()
        self.assertTrue(manager.unlock(3600, "sess-1"))
        self.assertTrue(switch.ps5_active)
        self.assertEqual(backend.presses, 1)
        self.assertEqual(manager.session_id, "sess-1")
        self.assertEqual(manager.status, "unlocked")

    def test_a_second_unlock_extends_rather_than_switching_the_game_off(self):
        # Extending time on a running session is a second unlock. It must not
        # toggle the switch, which would blank the customer's game.
        backend, switch, _, manager, _ = build()
        manager.unlock(3600, "sess-1")
        manager.unlock(7200, "sess-1")
        self.assertEqual(backend.presses, 1)
        self.assertTrue(switch.ps5_active)

    def test_a_refused_switch_is_not_reported_as_a_session(self):
        # If the relay or switch fails, the customer is looking at a locked
        # screen. Recording a session would bill them for it and tell the
        # dashboard everything is fine.
        _, switch, _, manager, _ = build()

        class Stuck:
            ps5_active = False
            def show_ps5(self): return False
            def show_locked(self): return True

        manager._switch = Stuck()
        self.assertFalse(manager.unlock(3600, "sess-1"))
        self.assertIsNone(manager.session_id)
        self.assertEqual(manager.status, "locked")


class EndingASession(unittest.TestCase):
    def test_the_station_locks_when_the_paid_time_runs_out(self):
        backend, switch, scheduler, manager, _ = build()
        manager.unlock(3600, "sess-1")
        scheduler.advance(3600)
        self.assertFalse(switch.ps5_active)
        self.assertIsNone(manager.session_id)
        self.assertEqual(backend.presses, 2)

    def test_an_open_ended_membership_never_times_out_on_its_own(self):
        # An unlimited pass. The server still sends a duration as a backstop,
        # but a countdown here would cut off a member mid-game.
        _, switch, scheduler, manager, _ = build()
        manager.unlock(3600, "sess-1", open_ended=True)
        self.assertEqual(scheduler.pending, {})
        scheduler.advance(3600)
        self.assertTrue(switch.ps5_active)

    def test_locking_early_cancels_the_countdown(self):
        # Otherwise the old timer fires later and locks a station that has
        # since been legitimately unlocked for somebody else.
        backend, switch, scheduler, manager, _ = build()
        manager.unlock(3600, "sess-1")
        manager.lock("the dashboard locked this station")
        self.assertEqual(scheduler.pending, {})

        manager.unlock(1800, "sess-2")
        self.assertTrue(switch.ps5_active)
        presses_before = backend.presses
        scheduler.cancel(1)
        self.assertEqual(backend.presses, presses_before)


class Warnings(unittest.TestCase):
    def test_a_warning_interrupts_and_then_returns_to_the_game(self):
        backend, switch, scheduler, manager, _ = build()
        manager.unlock(3600, "sess-1")

        manager.warn(300)
        self.assertFalse(switch.ps5_active)  # message on screen

        scheduler.advance(6)                 # only the warning is due
        self.assertTrue(switch.ps5_active)   # back to the game
        self.assertEqual(backend.presses, 3)

    def test_a_warning_for_an_idle_station_is_ignored(self):
        # A stray warning must never put the PS5 on screen for free.
        backend, switch, _, manager, _ = build()
        manager.warn(300)
        self.assertFalse(switch.ps5_active)
        self.assertEqual(backend.presses, 0)

    def test_a_second_warning_while_one_is_showing_is_ignored(self):
        backend, _, _, manager, _ = build()
        manager.unlock(3600, "sess-1")
        manager.warn(300)
        presses = backend.presses
        manager.warn(60)
        self.assertEqual(backend.presses, presses)

    def test_time_running_out_during_a_warning_leaves_it_locked(self):
        # The nasty one. The warning is on screen, the session expires, and the
        # warning then finishes and tries to resume. Resuming would hand out
        # free time on an expired session.
        _, switch, scheduler, manager, _ = build()
        manager.unlock(3600, "sess-1")
        manager.warn(60)

        manager._time_up()          # the session ends while the warning shows
        scheduler.advance(6)        # ...and only then does the warning finish

        self.assertFalse(switch.ps5_active)
        self.assertIsNone(manager.session_id)


class Reporting(unittest.TestCase):
    def test_every_change_is_announced_for_the_heartbeat(self):
        _, _, scheduler, manager, states = build()
        manager.unlock(3600, "sess-1")
        scheduler.advance(3600)
        self.assertEqual(states[0], ("unlocked", "sess-1"))
        self.assertEqual(states[-1], ("locked", None))


if __name__ == "__main__":
    unittest.main()
