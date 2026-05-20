#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
mkdir -p certs

LAN_IP="${LAN_IP:-$(ip route get 1.1.1.1 2>/dev/null \
  | awk '{for(i=1;i<=NF;i++) if ($i=="src") { print $(i+1); exit }}')}"

if [ -z "${LAN_IP:-}" ]; then
  echo "Could not auto-detect LAN IP."
  echo "Re-run with: LAN_IP=192.168.x.y ./setup.sh"
  exit 1
fi

echo "Generating self-signed cert for $LAN_IP (10y validity)..."
openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
  -keyout certs/key.pem -out certs/cert.pem \
  -subj "/CN=$LAN_IP" \
  -addext "subjectAltName=IP:$LAN_IP,IP:127.0.0.1,DNS:localhost" \
  >/dev/null 2>&1
chmod 600 certs/key.pem

cat <<EOF

Cert ready. Next:
  npm install
  npm start

Then visit on each device (accept the cert warning once):
  Phone:  https://$LAN_IP:8443/sender.html
  TV:     https://$LAN_IP:8443/receiver.html
EOF
