"""
Gaming Cafe Control Server
Run this on ONE PC on your LAN (e.g., PC1).
Owner opens  http://<THIS-PC-IP>:5000  on any browser / mobile.
"""

import json
import os
import subprocess
import datetime
from threading import Lock
from functools import wraps

from flask import Flask, render_template, request, jsonify, Response

# ------------------------------------------------------------------ config
BASE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(BASE, "config.json"), encoding="utf-8") as f:
    CONFIG = json.load(f)

PSEXEC      = CONFIG.get("psexec_path", r"C:\Tools\PsExec.exe")
ADMIN_USER  = CONFIG["admin_user"]
ADMIN_PASS  = CONFIG["admin_pass"]
PANEL_PASS  = CONFIG.get("panel_password", "admin1234")   # owner web-panel password

app = Flask(__name__)

# ------------------------------------------------------------------ state
_lock    = Lock()
sessions: dict = {}

for pc in CONFIG["pcs"]:
    sessions[pc["id"]] = {
        "name":     pc["name"],
        "ip":       pc["ip"],
        "status":   "idle",        # idle | running | ended
        "end_time": None,          # datetime
    }

# ------------------------------------------------------------------ auth (simple HTTP Basic)
def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth = request.authorization
        if not auth or auth.password != PANEL_PASS:
            return Response(
                "Authentication required.",
                401,
                {"WWW-Authenticate": 'Basic realm="Gaming Cafe Control"'},
            )
        return f(*args, **kwargs)
    return decorated

# ------------------------------------------------------------------ helpers
def _remaining_secs(pc_id: str):
    with _lock:
        s = sessions.get(pc_id)
        if not s or s["status"] != "running" or not s["end_time"]:
            return None
        delta = s["end_time"] - datetime.datetime.now()
        secs  = int(delta.total_seconds())
        if secs <= 0:
            s["status"]   = "ended"
            s["end_time"] = None
            return 0
        return secs


def _write_trigger(ip: str, filename: str, content: str) -> tuple[bool, str]:
    """Write a trigger file on a remote PC using PsExec."""
    remote_path = rf"C:\GameTimer\{filename}"
    cmd = [
        PSEXEC, rf"\\{ip}",
        "-u", ADMIN_USER,
        "-p", ADMIN_PASS,
        "-accepteula", "-nobanner",
        "cmd", "/c",
        f'echo {content}> "{remote_path}"',
    ]
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=15,
        )
        if result.returncode == 0:
            return True, ""
        err = (result.stderr or result.stdout or "unknown error").strip()
        return False, err
    except subprocess.TimeoutExpired:
        return False, "Timeout reaching PC"
    except FileNotFoundError:
        return False, f"PsExec not found at: {PSEXEC}"
    except Exception as e:
        return False, str(e)


def _pc_snapshot():
    rows = []
    for pc_id, s in sessions.items():
        rem = _remaining_secs(pc_id)
        rows.append({
            "id":            pc_id,
            "name":          s["name"],
            "ip":            s["ip"],
            "status":        s["status"],
            "remaining_secs": rem,
            "end_time":      s["end_time"].strftime("%H:%M") if s["end_time"] else None,
        })
    return rows

# ------------------------------------------------------------------ routes
@app.route("/")
@require_auth
def index():
    return render_template("index.html", pcs=_pc_snapshot())


@app.route("/api/status")
@require_auth
def api_status():
    return jsonify(_pc_snapshot())


@app.route("/api/start", methods=["POST"])
@require_auth
def api_start():
    data    = request.get_json(force=True)
    pc_id   = data.get("pc_id", "")
    minutes = int(data.get("minutes", 0))

    if pc_id not in sessions:
        return jsonify({"success": False, "error": "Unknown PC"})
    if minutes <= 0:
        return jsonify({"success": False, "error": "Duration must be > 0"})

    ok, err = _write_trigger(sessions[pc_id]["ip"], "start.txt", str(minutes))
    if ok:
        with _lock:
            sessions[pc_id]["status"]   = "running"
            sessions[pc_id]["end_time"] = datetime.datetime.now() + datetime.timedelta(minutes=minutes)
        return jsonify({"success": True})
    return jsonify({"success": False, "error": err})


@app.route("/api/extend", methods=["POST"])
@require_auth
def api_extend():
    data    = request.get_json(force=True)
    pc_id   = data.get("pc_id", "")
    minutes = int(data.get("minutes", 0))

    if pc_id not in sessions:
        return jsonify({"success": False, "error": "Unknown PC"})

    ok, err = _write_trigger(sessions[pc_id]["ip"], "extend.txt", str(minutes))
    if ok:
        with _lock:
            s = sessions[pc_id]
            if s["end_time"]:
                s["end_time"] += datetime.timedelta(minutes=minutes)
            else:
                s["end_time"] = datetime.datetime.now() + datetime.timedelta(minutes=minutes)
            s["status"] = "running"
        return jsonify({"success": True})
    return jsonify({"success": False, "error": err})


@app.route("/api/stop", methods=["POST"])
@require_auth
def api_stop():
    data  = request.get_json(force=True)
    pc_id = data.get("pc_id", "")

    if pc_id not in sessions:
        return jsonify({"success": False, "error": "Unknown PC"})

    ok, err = _write_trigger(sessions[pc_id]["ip"], "stop.txt", "1")
    if ok:
        with _lock:
            sessions[pc_id]["status"]   = "idle"
            sessions[pc_id]["end_time"] = None
        return jsonify({"success": True})
    return jsonify({"success": False, "error": err})


# ------------------------------------------------------------------ run
if __name__ == "__main__":
    print("=" * 55)
    print("  Gaming Cafe Control Server")
    print(f"  Open on your phone: http://<THIS-PC-IP>:5000")
    print(f"  Password: {PANEL_PASS}")
    print("=" * 55)
    app.run(host="0.0.0.0", port=5000, debug=False)
