"""
Entry point for a PS5 station.

    python3 -m agent.main --enroll ABC123     # once, to link this Pi
    python3 -m agent.main                     # normal running
    python3 -m agent.main --dry-run           # no GPIO, for a laptop

The four pieces are kept apart on purpose: relay.py knows only about pressing a
button, session.py only about time, mqtt_client.py only about messages, and
display.py only about pixels. This file is the only place that knows they all
exist.
"""

from __future__ import annotations

import argparse
import logging
import threading
import time
from pathlib import Path

from .config import Config, Station
from .relay import FakeBackend, GpioZeroBackend, HdmiSwitch
from .session import SessionManager
from .station_api import StationApi

VERSION = "1.0.0"
HEARTBEAT_SECONDS = 30
QR_REFRESH_SECONDS = 90  # tokens live 120s; renew well inside that

HERE = Path(__file__).resolve().parent.parent
CONFIG_PATH = HERE / "config.json"
STATION_PATH = HERE / "station.json"
STATE_PATH = HERE / "switch-state.json"

log = logging.getLogger("agent")


def enroll(config: Config, code: str) -> int:
    api = StationApi(config.site_origin)
    try:
        station = Station.from_enrolment(api.enroll(code))
    except Exception as err:
        # Setup codes are single use, so a failure after the code was spent
        # needs a fresh one. Saying so saves retyping a dead code.
        print(f"Could not link this station: {err}")
        print("Generate a new setup code before trying again.")
        return 1

    station.save(STATION_PATH)
    print(f"Linked as {station.station_name} at {station.cafe_name or 'this cafe'}.")
    print(f"Settings written to {STATION_PATH}")
    return 0


def run(config: Config, station: Station, dry_run: bool) -> int:
    backend = FakeBackend() if dry_run else GpioZeroBackend(
        config.relay.pin, active_high=config.relay.active_high
    )
    switch = HdmiSwitch(backend, state_file=STATE_PATH)
    api = StationApi(config.site_origin, station)

    screen = None
    if config.display.enabled and not dry_run:
        from .display import LockedScreen
        screen = LockedScreen(station.station_name, station.cafe_name, config.display.fullscreen)

    def on_state_change(status: str, session_id: str | None) -> None:
        if screen is not None:
            screen.show_locked() if status == "locked" else None
        # Reported straight away rather than waiting for the next tick: the
        # dashboard should show a station as in use the moment it is.
        threading.Thread(
            target=api.heartbeat, args=(status, session_id, VERSION), daemon=True
        ).start()

    session = SessionManager(switch, on_state_change=on_state_change)

    from .mqtt_client import CommandListener
    listener = CommandListener(station, session)
    listener.start()

    def heartbeat_loop() -> None:
        while True:
            api.heartbeat(session.status, session.session_id, VERSION)
            time.sleep(HEARTBEAT_SECONDS)

    def qr_loop() -> None:
        while True:
            try:
                token = api.unlock_token()
                if screen is not None:
                    import qrcode
                    from PIL import ImageTk

                    image = qrcode.make(f"{config.site_origin}/play/{token}").resize((420, 420))
                    screen.set_qr(ImageTk.PhotoImage(image))
            except Exception as err:
                log.warning("Could not refresh the code: %s", err)
                if screen is not None:
                    # Said plainly rather than left as a blank square; staff
                    # need to know it is the network, not the console.
                    screen.set_hint("Cannot reach BookMyGame - check this station's internet")
            time.sleep(QR_REFRESH_SECONDS)

    threading.Thread(target=heartbeat_loop, daemon=True).start()
    threading.Thread(target=qr_loop, daemon=True).start()

    log.info("Station %s is running.", station.station_name)

    if screen is not None:
        screen.run()  # blocks on the Tk main loop
    else:
        while True:
            time.sleep(3600)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--enroll", metavar="CODE", help="Link this Pi to a station, once")
    parser.add_argument("--dry-run", action="store_true", help="No GPIO and no screen")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
    )

    config = Config.load(CONFIG_PATH)

    if args.enroll:
        return enroll(config, args.enroll)

    station = Station.load(STATION_PATH)
    if station is None:
        print("This Pi is not linked to a station yet.")
        print("Generate a setup code in the dashboard, then run:")
        print("    python3 -m agent.main --enroll YOUR-CODE")
        return 1

    return run(config, station, args.dry_run)


if __name__ == "__main__":
    raise SystemExit(main())
