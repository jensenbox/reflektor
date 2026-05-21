# Changelog

All notable changes are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project uses [SemVer](https://semver.org/).

## [Unreleased]

## [0.1.1] — 2026-05-20

### Fixed
- Removed maintainer's LAN IP as the default `LAN_IP` in `docker-compose.yml`. Compose now requires it explicitly via `.env` and errors out with a clear message if missing — previously a stranger cloning the repo would silently get a cert pinned to a foreign IP.
- README quickstart auto-detects the host's LAN IP via `hostname -I` instead of hardcoding an example.
- Example IPs in `.env.example` and the entrypoint error message changed from a real LAN address to the generic `192.168.1.10`.

## [0.1.0] — 2026-05-20

Initial public release.

### Features

- WebRTC peer-to-peer streaming, LAN-only (`iceServers: []`, no STUN/TURN).
- PWA sender (`public/sender.html`) with:
  - Camera or screen-share (`getDisplayMedia`) source.
  - Codec selection (H.264 / VP8 / VP9 / AV1) and resolution / framerate selection.
  - Optional audio (mic for camera, system for screen) — default off.
  - Screen-off OLED-saver mode (preview hidden, wake lock held).
  - Orientation lock and PWA install prompt.
  - Latency probe: per-frame timestamp barcode + data-channel clock sync → live "latency XX ms" overlay on receiver.
  - Auto-resume of streaming and probe/blank state across reloads.
- Receiver (`public/receiver.html`) with audio "tap for sound" prompt, full stats overlay, and minimal jitter buffer (`playoutDelayHint: 0`).
- Auto-reload of live pages whenever the server is redeployed (server UUID broadcast over the WebSocket hello).
- Optional **multi-receiver** mode (`MULTI_RECEIVER=1`) — one sender, many receivers.
- Optional **PIN gate** (`PIN=...`) — HTTP Basic auth on HTML and WebSocket; `/ca.crt` and `/healthz` stay open.
- mDNS `reflektor.local` via host-side systemd service (`scripts/install-host-mdns.sh`).
- Docker image `ghcr.io/jensenbox/reflektor:latest`, multi-arch (`linux/amd64`, `linux/arm64`), with `HEALTHCHECK` and `/healthz` JSON endpoint.
- GitHub Actions workflow auto-publishes images on every `main` push.

[Unreleased]: https://github.com/jensenbox/reflektor/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/jensenbox/reflektor/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/jensenbox/reflektor/releases/tag/v0.1.0
