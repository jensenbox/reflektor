# Reflektor

Ultra-low-latency live view of a phone's camera on a TV/screen — over your LAN, with no media leaving your network. WebRTC peer-to-peer; the server only relays signaling. ~80–200 ms glass-to-glass on a healthy 5 GHz LAN; 1080p60 at up to 20 Mbps.

No Google Cast SDK, no public hosting, no STUN/TURN — `iceServers: []` so the connection can only resolve over LAN candidates.

## Run with Docker (recommended)

Pre-built image at `ghcr.io/jensenbox/reflektor:latest` (multi-arch: `linux/amd64`, `linux/arm64`).

```bash
# 1. Grab the compose file
curl -O https://raw.githubusercontent.com/jensenbox/reflektor/main/docker-compose.yml

# 2. Tell it your LAN IP (used for the self-signed cert's SAN)
echo "LAN_IP=192.168.16.10" > .env

# 3. Up
docker compose up -d
```

Then on each device:

| Device | URL |
|---|---|
| Phone / sender | `https://<LAN_IP>:8443/sender.html` |
| TV / receiver  | `https://<LAN_IP>:8443/receiver.html` |
| Chooser        | `https://<LAN_IP>:8443/` |
| HTTP → HTTPS   | `http://<LAN_IP>:8080/` (redirects) |
| CA cert        | `http://<LAN_IP>:8080/ca.crt` (install on phone to skip warnings & enable PWA install) |

The container generates the cert on first run into `./certs/` (bind-mounted from host). Delete that dir to regenerate.

## Sender controls

- **Codec**: H.264 (most efficient, missing on some TVs) / VP8 / VP9 / **AV1** (best where TV has HW AV1 decode)
- **Resolution**: 720p–4K, 30 or 60 fps
- **Screen off**: blanks the OLED preview to save power while continuing to stream
- **Lock**: locks current screen orientation (PWA / fullscreen only)
- **Install**: PWA install prompt (needs trusted cert — install `/ca.crt` if needed)

Choices persist across reloads.

## Run from source (no Docker)

```bash
./setup.sh         # generates ./certs from your LAN IP (auto-detected)
npm install        # one dep: ws
npm start
```

Defaults: HTTPS on 8443, HTTP→HTTPS redirector on 8080. Override with `PORT` / `HTTP_PORT`.

## Architecture

```
[Phone, Chrome PWA] ────getUserMedia──► WebRTC P2P (LAN only) ────► [TV browser <video>]
                                  ▲                ▲
                                  └── WebSocket signaling (this server) ──┘
```

- `server.mjs` — HTTPS + WebSocket signaling relay, serves the static pages.
- `public/sender.html` — phone PWA. Captures camera, prefers a chosen codec, caps bitrate at 20 Mbps.
- `public/receiver.html` — TV/desktop. `playoutDelayHint=0`, `jitterBufferTarget=0` for minimal buffering.
- Signaling protocol: tiny JSON `{type:"offer"|"answer"|"ice"|"negotiate", ...}` relayed between the one sender and the one receiver. Server sends `negotiate` to the sender whenever both peers are present, so reconnects re-fire offers automatically.

## Troubleshooting

| Symptom | Fix |
|---|---|
| WS connects but receiver shows "Waiting for camera…" forever | Browser doesn't decode the chosen codec. Try VP8 / AV1 from the codec dropdown on the sender. |
| Cert warning every visit | Install `/ca.crt` as a user CA cert on the device. Also unlocks PWA install. |
| Choppy video | Drop resolution; check phone and TV are on 5 GHz; disable Wi-Fi AP isolation on your router. |
| LAN IP changed | Delete `./certs/` and restart — entrypoint regenerates with the new IP. |

## License

MIT
