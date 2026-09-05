"""
What the Pi puts on its own HDMI output.

This is what the customer sees whenever the switch is on input 2: the station
name and a QR code to scan. It is also where a time warning appears, during the
few seconds the session manager flips the switch across to show it.

Tkinter rather than a browser kiosk: it is in the standard library, starts in
well under a second, and has no way for a customer to reach a URL bar.
"""

from __future__ import annotations

import logging
import queue
import tkinter as tk

log = logging.getLogger(__name__)

BACKGROUND = "#0b0b0c"
CREAM = "#f2f0ea"
LIME = "#d8ff3c"
MUTED = "#8a8a8f"


class LockedScreen:
    """
    Runs Tkinter on the main thread and takes updates from any other.

    Tk is not thread safe, so MQTT callbacks and the QR refresher post messages
    onto a queue that the UI drains on its own timer.
    """

    def __init__(self, station_name: str, cafe_name: str | None, fullscreen: bool = True) -> None:
        self._queue: "queue.Queue[tuple[str, object]]" = queue.Queue()
        self._root = tk.Tk()
        self._root.configure(bg=BACKGROUND)
        self._root.title("BookMyGame")
        if fullscreen:
            self._root.attributes("-fullscreen", True)
            self._root.config(cursor="none")

        tk.Label(
            self._root, text=(cafe_name or "BookMyGame").upper(),
            fg=MUTED, bg=BACKGROUND, font=("DejaVu Sans Mono", 20),
        ).pack(pady=(60, 0))

        tk.Label(
            self._root, text=station_name.upper(),
            fg=CREAM, bg=BACKGROUND, font=("DejaVu Sans", 56, "bold"),
        ).pack()

        self._status = tk.Label(
            self._root, text="LOCKED",
            fg=LIME, bg=BACKGROUND, font=("DejaVu Sans Mono", 22),
        )
        self._status.pack(pady=(4, 24))

        self._qr = tk.Label(self._root, bg=BACKGROUND)
        self._qr.pack()

        self._hint = tk.Label(
            self._root, text="Scan with your phone camera to pay and play",
            fg=MUTED, bg=BACKGROUND, font=("DejaVu Sans Mono", 16),
        )
        self._hint.pack(pady=(24, 0))

        self._photo = None  # Tk drops an image that nothing still references
        self._root.after(200, self._drain)

    # ------------------------------------------------------- from any thread

    def set_qr(self, image) -> None:
        self._queue.put(("qr", image))

    def set_status(self, text: str) -> None:
        self._queue.put(("status", text))

    def set_hint(self, text: str) -> None:
        self._queue.put(("hint", text))

    def show_warning(self, remaining_seconds: int) -> None:
        minutes = max(1, round(remaining_seconds / 60))
        self._queue.put(("status", f"{minutes} MINUTE{'S' if minutes != 1 else ''} LEFT"))
        self._queue.put(("hint", "Scan the code to add more time"))

    def show_locked(self) -> None:
        self._queue.put(("status", "LOCKED"))
        self._queue.put(("hint", "Scan with your phone camera to pay and play"))

    # ------------------------------------------------------------- main loop

    def _drain(self) -> None:
        try:
            while True:
                kind, value = self._queue.get_nowait()
                if kind == "status":
                    self._status.config(text=str(value))
                elif kind == "hint":
                    self._hint.config(text=str(value))
                elif kind == "qr":
                    self._photo = value
                    self._qr.config(image=value)
        except queue.Empty:
            pass
        self._root.after(200, self._drain)

    def run(self) -> None:
        self._root.mainloop()
