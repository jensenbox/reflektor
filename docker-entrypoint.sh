#!/usr/bin/env bash
set -euo pipefail

CERT_DIR="/app/certs"
MDNS_HOSTNAME="${MDNS_HOSTNAME:-reflektor.local}"
MDNS_SHORT="${MDNS_HOSTNAME%.*}"

mkdir -p "$CERT_DIR"

if [ ! -f "$CERT_DIR/cert.pem" ] || [ ! -f "$CERT_DIR/key.pem" ]; then
  if [ -z "${LAN_IP:-}" ]; then
    echo "LAN_IP environment variable must be set (e.g. LAN_IP=192.168.16.10)" >&2
    exit 1
  fi
  echo "[reflektor] Generating self-signed cert for $LAN_IP / $MDNS_HOSTNAME (10y validity)..."
  openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
    -keyout "$CERT_DIR/key.pem" -out "$CERT_DIR/cert.pem" \
    -subj "/CN=$LAN_IP" \
    -addext "subjectAltName=IP:$LAN_IP,IP:127.0.0.1,DNS:localhost,DNS:$MDNS_HOSTNAME,DNS:$MDNS_SHORT" \
    >/dev/null 2>&1
  chmod 600 "$CERT_DIR/key.pem"
else
  echo "[reflektor] Using existing cert in $CERT_DIR"
fi

# Note: mDNS publishing of $MDNS_HOSTNAME is intentionally done host-side via
# a small systemd service (see README) rather than from inside the container.
# Alpine's avahi client and the host's Ubuntu avahi-daemon use incompatible
# protocol versions, so socket-mount approaches die with "Daemon not running".

exec "$@"
