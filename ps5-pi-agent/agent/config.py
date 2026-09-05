"""
What this station knows about itself.

Split deliberately in two:

  config.json   - the hardware and the site. Edited by hand, same on every
                  station apart from the relay pin. No secrets.
  station.json  - written by enrolment: which station this is, the broker
                  password, the heartbeat token. Never in git, never in an
                  image.

That split is what lets one SD card image serve every cafe: the image carries
config.json, and a setup code typed in once produces station.json.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path

log = logging.getLogger(__name__)

DEFAULT_ORIGIN = "https://www.bookmygame.co.in"


@dataclass
class RelayConfig:
    pin: int = 17
    active_high: bool = False


@dataclass
class DisplayConfig:
    enabled: bool = True
    fullscreen: bool = True


@dataclass
class Config:
    relay: RelayConfig
    display: DisplayConfig
    # Always the www host. The apex redirects, and requests drops the
    # Authorization header across a host-changing redirect, which makes a
    # correct token look like a wrong one.
    site_origin: str = DEFAULT_ORIGIN

    @staticmethod
    def load(path: Path) -> "Config":
        raw = json.loads(path.read_text()) if path.exists() else {}
        relay = raw.get("relay", {})
        display = raw.get("display", {})
        return Config(
            relay=RelayConfig(
                pin=int(relay.get("pin", 17)),
                active_high=bool(relay.get("active_high", False)),
            ),
            display=DisplayConfig(
                enabled=bool(display.get("enabled", True)),
                fullscreen=bool(display.get("fullscreen", True)),
            ),
            site_origin=str(raw.get("site_origin", DEFAULT_ORIGIN)).rstrip("/"),
        )


@dataclass
class Station:
    """The half that enrolment fills in."""

    station_name: str
    cafe_id: str
    cafe_name: str | None
    heartbeat_token: str
    mqtt_host: str
    mqtt_port: int
    mqtt_use_tls: bool
    mqtt_username: str | None
    mqtt_password: str | None

    @staticmethod
    def load(path: Path) -> "Station | None":
        if not path.exists():
            return None
        try:
            raw = json.loads(path.read_text())
            return Station(**raw)
        except Exception:
            log.error("station.json is unreadable; re-run enrolment.", exc_info=True)
            return None

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(self.__dict__, indent=2))
        # Contains the broker password and the heartbeat token.
        path.chmod(0o600)

    @staticmethod
    def from_enrolment(body: dict) -> "Station":
        heartbeat = body.get("heartbeat")
        if not heartbeat:
            raise ValueError(
                "The server sent no heartbeat token, so this station could not report in."
            )
        mqtt = body.get("mqtt") or {}
        return Station(
            station_name=body["stationId"],
            cafe_id=heartbeat["cafeId"],
            cafe_name=body.get("cafeName"),
            heartbeat_token=heartbeat["token"],
            mqtt_host=mqtt.get("host", ""),
            mqtt_port=int(mqtt.get("port", 8883)),
            mqtt_use_tls=bool(mqtt.get("useTls", True)),
            mqtt_username=mqtt.get("username"),
            mqtt_password=mqtt.get("password"),
        )
