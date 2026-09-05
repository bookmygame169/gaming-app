"""
The three station routes the site already exposes.

No new server work: these are the same endpoints the Windows agent has used in
production since August, called with the same payloads.
"""

from __future__ import annotations

import logging

import requests

log = logging.getLogger(__name__)


class StationApi:
    def __init__(self, origin: str, station=None) -> None:
        self._origin = origin.rstrip("/")
        self._station = station

    def _post(self, path: str, body: dict, token: str | None = None) -> dict:
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"

        response = requests.post(
            self._origin + path,
            json=body,
            headers=headers,
            timeout=20,
            # A redirect from the apex to www would silently drop the
            # Authorization header, so a redirect here is a misconfiguration
            # worth seeing rather than following.
            allow_redirects=False,
        )
        parsed = {}
        try:
            parsed = response.json()
        except Exception:
            pass

        if not response.ok:
            raise RuntimeError(parsed.get("error") or f"Request failed ({response.status_code})")
        return parsed

    def enroll(self, code: str) -> dict:
        return self._post("/api/stations/enroll", {"code": code})

    def unlock_token(self) -> str:
        body = {"cafeId": self._station.cafe_id, "stationName": self._station.station_name}
        return self._post("/api/stations/unlock-token", body, self._station.heartbeat_token)["token"]

    def heartbeat(self, status: str, session_id: str | None, version: str) -> None:
        body = {
            "cafeId": self._station.cafe_id,
            "stationName": self._station.station_name,
            "status": status,
            "version": version,
        }
        if session_id:
            body["sessionId"] = session_id
        try:
            self._post("/api/stations/heartbeat", body, self._station.heartbeat_token)
        except Exception as err:
            # Never raised: a missed heartbeat must not take the lock down with
            # it, and the next one is thirty seconds away. It is not cosmetic
            # though - the dashboard calls a station offline after ninety
            # seconds, and the QR flow refuses to sell time on an offline one.
            log.warning("Heartbeat failed: %s", err)
