#!/usr/bin/env bash
# Install a systemd service on the host that publishes reflektor.local via
# the host's avahi-daemon. Run once on the box that runs Reflektor.
#
# Usage:
#   sudo ./install-host-mdns.sh [HOSTNAME] [IP]
#
# Defaults: HOSTNAME=reflektor.local, IP=auto-detect.
set -euo pipefail

if [ "$EUID" -ne 0 ]; then
  echo "Must run as root. Try: sudo $0" >&2
  exit 1
fi

HOSTNAME="${1:-reflektor.local}"
IP="${2:-$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if ($i=="src") { print $(i+1); exit }}')}"

if [ -z "$IP" ]; then
  echo "Couldn't auto-detect LAN IP. Pass it explicitly: sudo $0 $HOSTNAME 192.168.x.y" >&2
  exit 1
fi

if ! command -v avahi-publish-address >/dev/null 2>&1; then
  echo "Installing avahi-utils..."
  apt-get update -qq
  apt-get install -y avahi-utils
fi

systemctl is-active --quiet avahi-daemon || {
  echo "Installing avahi-daemon..."
  apt-get install -y avahi-daemon
  systemctl enable --now avahi-daemon
}

cat > /etc/systemd/system/reflektor-mdns.service <<EOF
[Unit]
Description=Publish $HOSTNAME via mDNS for Reflektor
After=avahi-daemon.service network-online.target
Wants=avahi-daemon.service

[Service]
ExecStart=/usr/bin/avahi-publish-address -R $HOSTNAME $IP
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now reflektor-mdns

echo
echo "Done. Verifying..."
sleep 1
if avahi-resolve -n "$HOSTNAME" 2>/dev/null | grep -q "$IP"; then
  echo "OK — $HOSTNAME resolves to $IP via mDNS."
else
  echo "Service installed but resolution not yet visible. Try again in a few seconds."
fi
