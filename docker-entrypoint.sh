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

# mDNS: publish $MDNS_HOSTNAME → $LAN_IP via the host's avahi-daemon
# (requires /var/run/avahi-daemon/socket bind-mounted from host). If avahi
# isn't available, skip silently — IP-based access still works.
if [ -S /var/run/avahi-daemon/socket ] && command -v avahi-publish-address >/dev/null; then
  echo "[reflektor] publishing $MDNS_HOSTNAME → ${LAN_IP:-?} via mDNS"
  avahi-publish-address -R "$MDNS_HOSTNAME" "$LAN_IP" >/dev/null 2>&1 &
else
  echo "[reflektor] mDNS publish skipped (no avahi socket); reach via IP only"
fi

exec "$@"
