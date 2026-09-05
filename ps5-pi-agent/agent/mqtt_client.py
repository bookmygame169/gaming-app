"""
Listening for unlock and lock.

Subscribes to both topic shapes the site publishes: the bare
`cafe/station/<name>/command`, which predates multi-cafe support and is still
sent for older agents, and the cafe-scoped
`cafe/<cafeId>/station/<name>/command`. Subscribing to both means this works
whichever arrives.

Station names are lower case (`ps5-01`) because that is what bookings store and
MQTT topics are case sensitive - `PS5-01` would silently receive nothing.
"""

from __future__ import annotations

import json
import logging
import ssl

import paho.mqtt.client as mqtt

log = logging.getLogger(__name__)


class CommandListener:
    def __init__(self, station, session) -> None:
        self._station = station
        self._session = session
        self._client = mqtt.Client(client_id=f"pi-{station.station_name}", clean_session=True)

        if station.mqtt_username:
            self._client.username_pw_set(station.mqtt_username, station.mqtt_password or "")
        if station.mqtt_use_tls:
            self._client.tls_set(cert_reqs=ssl.CERT_REQUIRED)

        self._client.on_connect = self._on_connect
        self._client.on_message = self._on_message
        self._client.on_disconnect = lambda *_: log.warning("Broker connection lost.")

    @property
    def topics(self) -> list[str]:
        name = self._station.station_name.lower()
        topics = [f"cafe/station/{name}/command"]
        if self._station.cafe_id:
            topics.append(f"cafe/{self._station.cafe_id}/station/{name}/command")
        return topics

    def start(self) -> None:
        self._client.connect_async(self._station.mqtt_host, self._station.mqtt_port, keepalive=30)
        # Reconnects on its own, forever. A station that quietly stopped
        # listening would take payments and never unlock.
        self._client.reconnect_delay_set(min_delay=1, max_delay=30)
        self._client.loop_start()

    def stop(self) -> None:
        self._client.loop_stop()
        self._client.disconnect()

    def _on_connect(self, client, _userdata, _flags, rc):
        if rc != 0:
            log.error("Broker refused the connection (code %s).", rc)
            return
        for topic in self.topics:
            client.subscribe(topic, qos=1)
            log.info("Listening on %s", topic)

    def _on_message(self, _client, _userdata, message):
        try:
            command = json.loads(message.payload.decode("utf-8"))
        except Exception:
            log.warning("Ignoring a command that was not JSON: %r", message.payload[:200])
            return

        action = command.get("action")
        if action == "unlock":
            self._session.unlock(
                duration_seconds=int(command.get("duration_seconds") or 0),
                session_id=command.get("session_id"),
                open_ended=bool(command.get("open_ended")),
            )
        elif action == "lock":
            self._session.lock("the dashboard locked this station")
        elif action == "warn":
            self._session.warn(int(command.get("remaining_seconds") or 0))
        elif action == "restart":
            # Meant for the Windows updater, which cannot replace a running
            # agent and needs a reboot to get its chance. Nothing here needs it.
            log.info("Ignoring restart; it does not apply to the Pi agent.")
        else:
            log.warning("Unknown command: %s", command)
