"""
Tests for the switching logic.

The hardware cannot be tested from here, but the thinking around it can, and
that is where the costly mistakes are. A press it should not have made switches
a paying customer's game off. A press it failed to make leaves a station
unlocked after the money ran out.
"""

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from agent.relay import FakeBackend, HdmiSwitch  # noqa: E402


def make_switch(state_file=None, ps5_active=None):
    backend = FakeBackend()
    switch = HdmiSwitch(backend, state_file=state_file, press_seconds=0, min_gap_seconds=0)
    if ps5_active is not None:
        switch.calibrate(ps5_active)
    return backend, switch


class StartsLocked(unittest.TestCase):
    def test_a_fresh_pi_believes_the_locked_screen_is_showing(self):
        # The safe assumption. Believing the PS5 is showing when it is not means
        # the first unlock does nothing and the customer sits at a locked screen.
        _, switch = make_switch()
        self.assertFalse(switch.ps5_active)


class Switching(unittest.TestCase):
    def test_unlocking_presses_the_button_once(self):
        backend, switch = make_switch()
        self.assertTrue(switch.show_ps5())
        self.assertEqual(backend.presses, 1)
        self.assertTrue(switch.ps5_active)

    def test_locking_again_presses_once_more(self):
        backend, switch = make_switch()
        switch.show_ps5()
        self.assertTrue(switch.show_locked())
        self.assertEqual(backend.presses, 2)
        self.assertFalse(switch.ps5_active)

    def test_unlocking_twice_does_not_switch_the_game_off(self):
        # The real hazard of a toggle-only switch. Two unlocks arriving - a
        # retried command, or an extend-time on top of a session - must not
        # press twice, because the second press takes the PS5 off the screen
        # mid-game.
        backend, switch = make_switch()
        switch.show_ps5()
        switch.show_ps5()
        self.assertEqual(backend.presses, 1)
        self.assertTrue(switch.ps5_active)

    def test_locking_an_already_locked_station_does_nothing(self):
        # And the mirror image: this one would hand a free session to whoever
        # was standing there.
        backend, switch = make_switch()
        switch.show_locked()
        self.assertEqual(backend.presses, 0)
        self.assertFalse(switch.ps5_active)

    def test_a_warning_interruption_returns_to_the_game(self):
        # The plan's five-minute warning: drop to the locked screen briefly to
        # show the message, then go back. Two presses, ending where it started.
        backend, switch = make_switch()
        switch.show_ps5()
        switch.show_locked()
        switch.show_ps5()
        self.assertEqual(backend.presses, 3)
        self.assertTrue(switch.ps5_active)


class SurvivingAReboot(unittest.TestCase):
    def test_what_the_tv_is_showing_is_remembered_across_a_restart(self):
        # A Pi that reboots mid-session comes back with no way to ask the switch
        # what it is showing. Without this it would assume "locked", and the
        # next unlock would press once and take the game off screen.
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp) / "state.json"

            _, first = make_switch(state_file=state)
            first.show_ps5()

            _, after_reboot = make_switch(state_file=state)
            self.assertTrue(after_reboot.ps5_active)

    def test_a_corrupt_state_file_falls_back_to_locked(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp) / "state.json"
            state.write_text("this is not json")
            _, switch = make_switch(state_file=state)
            self.assertFalse(switch.ps5_active)

    def test_the_state_file_is_written_in_a_readable_shape(self):
        # Staff diagnose a stuck station by reading this file over SSH.
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp) / "state.json"
            _, switch = make_switch(state_file=state)
            switch.show_ps5()
            self.assertEqual(json.loads(state.read_text()), {"ps5_active": True})


class Calibration(unittest.TestCase):
    def test_calibrating_changes_the_belief_without_pressing(self):
        # Someone pressed the physical button. Correcting the record must not
        # itself move the switch, or it would undo the correction.
        backend, switch = make_switch()
        switch.calibrate(True)
        self.assertEqual(backend.presses, 0)
        self.assertTrue(switch.ps5_active)

    def test_after_calibrating_a_lock_now_presses(self):
        backend, switch = make_switch()
        switch.calibrate(True)
        switch.show_locked()
        self.assertEqual(backend.presses, 1)
        self.assertFalse(switch.ps5_active)


if __name__ == "__main__":
    unittest.main()
