# Reflektor

[![build](https://github.com/jensenbox/reflektor/actions/workflows/docker.yml/badge.svg)](https://github.com/jensenbox/reflektor/actions/workflows/docker.yml)
[![codeql](https://github.com/jensenbox/reflektor/actions/workflows/codeql.yml/badge.svg)](https://github.com/jensenbox/reflektor/actions/workflows/codeql.yml)
[![release](https://img.shields.io/github/v/release/jensenbox/reflektor?display_name=tag&sort=semver)](https://github.com/jensenbox/reflektor/releases)
[![license](https://img.shields.io/github/license/jensenbox/reflektor)](LICENSE)
[![image](https://img.shields.io/badge/image-ghcr.io%2Fjensenbox%2Freflektor-blue)](https://github.com/jensenbox/reflektor/pkgs/container/reflektor)

Ultra-low-latency live view of a phone's camera (or any browser's screen) on a TV/screen, over your LAN. WebRTC peer-to-peer; the server only relays signaling and never sees media. ~80–200 ms glass-to-glass on a healthy 5 GHz LAN; 1080p60 at up to 20 Mbps.

No Google Cast SDK, no public hosting, no STUN/TURN — `iceServers: []` so the connection can only resolve over LAN candidates.

## Run with Docker

Pre-built multi-arch image at `ghcr.io/jensenbox/reflektor:latest`.

```bash
curl -O https://raw.githubusercontent.com/jensenbox/reflektor/main/docker-compose.yml
echo "LAN_IP=192.168.16.10" > .env       # your host's LAN IP
docker compose up -d
```

Then on each device:

| Device | URL |
|---|---|
| Phone / sender | `https://reflektor.local:8443/sender.html` |
| TV / receiver  | `https://reflektor.local:8443/receiver.html` |
| Chooser        | `https://reflektor.local:8443/` |
| HTTP → HTTPS   | `http://reflektor.local:8080/` |
| CA cert        | `http://reflektor.local:8080/ca.crt` |
| Health probe   | `https://reflektor.local:8443/healthz` |

(`reflektor.local` resolves via mDNS — see "Configuration" below. You can always fall back to `https://<LAN_IP>:8443/`.)

The container auto-updates clients: every redeploy issues a new server UUID, and live pages reload themselves the moment they reconnect.

## Sender controls

- **Cam / Resolution / Codec** — selectors persist across reloads.
  - H.264 efficient on most Android phones.
  - **AV1** is best when the TV has hardware AV1 decode (many recent Hisense panels).
- **Audio: off/on** — include mic (camera mode) or system audio (screen mode) in the stream. Default off.
- **Start** — opens the chosen camera and begins streaming.
- **Screen** — alternative source: `getDisplayMedia()`. Useful for mirroring a laptop to the TV.
- **Screen off** — blanks the OLED preview to save phone power while continuing to stream. Wake lock holds the screen on.
- **Lock** — locks current screen orientation (PWA / fullscreen only).
- **Probe** — embeds a 32-bit timestamp barcode in every frame; receiver decodes it and displays end-to-end latency live.
- **Install** — PWA install prompt (needs trusted cert — install `/ca.crt` to unlock).

State (streaming, probe-on, screen-off) is restored after auto-reloads within the same tab session.

## Receiver

- Fullscreen `<video>`, muted by default so autoplay always wins after reloads.
- **Stats overlay** — tap to show breakdown (resolution, codec, decode/assembly/jitter-buffer ms).
- **Latency overlay** — appears top-left as a big green number when Probe is active.
- **Audio prompt** — if a stream arrives with audio, a "Tap for sound" button appears (browsers require a gesture to unmute).
- Press `F` for fullscreen.

## Configuration (`.env`)

| Variable | Default | What it does |
|---|---|---|
| `LAN_IP` | (required) | This host's LAN IP. Goes into the cert SAN and the mDNS A-record. |
| `MDNS_HOSTNAME` | `reflektor.local` | Published via the host's avahi-daemon if the socket is bind-mounted. |
| `PIN` | (empty) | If set, HTTP Basic auth required for HTML + WS. `/ca.crt` and `/healthz` stay open. |
| `MULTI_RECEIVER` | `0` | When `1`, allows N receivers viewing the same stream. Sender encodes once per receiver. |
| `PORT` | `8443` | HTTPS port. |
| `HTTP_PORT` | `8080` | HTTP-to-HTTPS redirector port. |

## mDNS (`reflektor.local`)

One-time host setup (the Alpine avahi client inside the container is protocol-incompatible with the host's avahi-daemon, so we publish host-side instead):

```bash
sudo ./scripts/install-host-mdns.sh
```

That installs `avahi-daemon` + `avahi-utils` if missing, drops a `reflektor-mdns.service` unit that runs `avahi-publish-address`, and starts it. After this, `reflektor.local` resolves to your host's IP from every device on the LAN. If you skip this, you reach the box by IP — everything else still works.

## PIN protection

Set `PIN=` in `.env` to any string. Browsers prompt for credentials on the first request (any username, password = your PIN). The `WS` upgrade uses the same Basic auth, which Chrome/Firefox forward automatically once you've authenticated for the origin. `/ca.crt` and `/healthz` are always open so bootstrap and monitoring still work.

## Multi-receiver

Set `MULTI_RECEIVER=1` to let multiple receivers view the same stream at once (e.g., TV + tablet + laptop). The sender opens one WebRTC peer connection per receiver — encoding cost scales linearly, network cost too (no SFU). Fine for 2–3 receivers on a typical LAN.

When off (default), a new receiver replaces any existing one, same as the original behavior.

## Run from source (no Docker)

```bash
./setup.sh        # generates ./certs from your LAN IP (auto-detected)
npm install
npm start
```

## Architecture

```
[Phone, Chrome PWA] ────getUserMedia──► WebRTC P2P (LAN only) ────► [TV browser <video>]
                                  ▲                ▲
                                  └── WebSocket signaling (this server) ──┘
```

- `server.mjs` — HTTPS + WebSocket signaling relay, serves static pages, exposes `/healthz` and `/ca.crt`.
- `public/sender.html` — phone PWA. Captures camera or screen, prefers a chosen codec, caps bitrate at 20 Mbps. Optional audio + screen sharing + latency probe.
- `public/receiver.html` — TV/desktop. `playoutDelayHint=0`, `jitterBufferTarget=0` for minimal buffering. Audio unmute prompt when audio track arrives.
- **Signaling protocol**: peerId-routed messages. `hello` (server → client with serverId + peerId), `peer-joined` / `peer-left` (server → sender), `offer` (sender → receiver, with `to`), `answer` (receiver → sender, with implicit `from`), `ice` (bidirectional, routed by `to` / `from`).

## Troubleshooting

| Symptom | Fix |
|---|---|
| Receiver shows "Waiting for camera…" forever | Try a different codec on the sender — some TV browsers advertise codecs they can't actually decode. |
| Cert warning every visit | Install `/ca.crt` as a user CA on the device. |
| Choppy / freezing | Drop resolution; check phone and TV are on 5 GHz; disable Wi-Fi AP isolation on your router. |
| LAN IP changed | `rm -rf certs/` and restart — entrypoint regenerates with the new IP. |
| `reflektor.local` doesn't resolve | Host doesn't run avahi-daemon, or the LAN blocks mDNS. Fall back to `https://<LAN_IP>:8443/`. |
| Container not picking up new image | `docker compose pull && docker compose up -d`. Live pages reload themselves once it's up. |

## License

MIT
