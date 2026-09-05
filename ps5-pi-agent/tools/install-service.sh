#!/usr/bin/env bash
# Makes the agent start with the Pi and come back if it ever stops.
#
# A station whose agent is not running cannot be locked, and shows as offline
# on the dashboard - which stops the QR flow selling time on it.
set -euo pipefail

AGENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
USER_NAME="${SUDO_USER:-$USER}"

sudo tee /etc/systemd/system/bookmygame-station.service >/dev/null <<UNIT
[Unit]
Description=BookMyGame PS5 station agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${USER_NAME}
WorkingDirectory=${AGENT_DIR}
Environment=DISPLAY=:0
ExecStart=/usr/bin/python3 -m agent.main
Restart=always
RestartSec=5

[Install]
WantedBy=graphical.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable bookmygame-station.service
sudo systemctl restart bookmygame-station.service
echo "Installed. Follow it with:  journalctl -u bookmygame-station -f"
