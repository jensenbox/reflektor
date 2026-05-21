# Notes for Claude (and other AI assistants)

This file is read by AI coding assistants entering the repo. Humans should start with [README.md](README.md). The rules and conventions below are load-bearing — please don't quietly violate them.

## What this project is

Reflektor is a minimal LAN WebRTC streamer: a phone's camera (or browser screen) shown on a TV with ~150 ms glass-to-glass latency. Media is peer-to-peer; the server only relays JSON signaling messages over a WebSocket and serves three static HTML pages.

## Architecture

```
[Phone PWA] ── camera/screen ──► WebRTC P2P (LAN host candidates only) ──► [TV browser <video>]
                                      ▲                ▲
                                      └── WebSocket signaling via server.mjs ──┘
                                          (this server never touches media bytes)
```

## File map

| Path | Purpose |
|---|---|
| `server.mjs` | HTTPS + WebSocket signaling relay. Per-`peerId` routing. ~200 lines. |
| `public/index.html` | Chooser page (Sender vs Receiver). |
| `public/sender.html` | Phone PWA. Captures camera/screen, creates one `RTCPeerConnection` per receiver. |
| `public/receiver.html` | TV/desktop. Single `RTCPeerConnection` from the sender. |
| `public/*.webmanifest`, `public/icon-*.svg`, `public/sw.js` | PWA install support. |
| `docker-entrypoint.sh` | Generates a self-signed cert with proper SANs on first run. |
| `setup.sh` | Same cert generation for non-Docker local dev. |
| `scripts/install-host-mdns.sh` | One-time host script: publishes `reflektor.local` via systemd + `avahi-publish-address`. |
| `.github/workflows/` | `docker.yml` (build + push image), `codeql.yml`, `release.yml`. |

## Hard rules

1. **Vanilla JS only.** No bundlers, no TypeScript, no framework. The HTML pages must work served as static files with no build step.
2. **One runtime dependency:** `ws`. Adding another needs strong justification (mention it in the PR).
3. **Media never goes through the server.** `iceServers: []` is intentional. Keep it that way; do not add STUN/TURN.
4. **Static files served with `Cache-Control: no-store`.** The auto-reload-on-deploy flow depends on the browser pulling fresh HTML every load.
5. **No comments explaining what code does.** Comments are for non-obvious *why* — workarounds, invariants, gotchas. Don't write docstrings for one-line helpers.

## Signaling protocol

JSON over WebSocket on `/ws?role=sender|receiver`.

**Server → client:**
- `{type:'hello', serverId, peerId, role, multiReceiver}` — sent once per WS connect. Clients reload if `serverId` differs from the value they last saw (the auto-update-on-deploy mechanism).
- `{type:'peer-joined', peerId}` — to the sender when a receiver connects.
- `{type:'peer-left', peerId}` — to the sender when a receiver disconnects.

**Sender ↔ receiver (relayed by the server, with `from`/`to` filled in):**
- `{type:'offer', to:peerId, sdp}` — sender → receiver
- `{type:'answer', sdp}` — receiver → sender (server adds `from`)
- `{type:'ice', to|from:peerId, candidate}` — both directions, routed by `to`/`from`

A WebRTC `DataChannel` named `probe` carries the latency-measurement ping/pong (peer-to-peer, not via signaling).

## Auto-reload-on-deploy

`server.mjs` generates a `randomUUID()` at startup (`SERVER_ID`). Clients see it in `hello`. If a client's stored `serverId` differs on reconnect, they `location.reload()`. This is how the server tells live pages "I just redeployed — refresh yourself."

Don't break this by changing how `hello` is delivered or by adding caching for static assets.

## Latency probe

Sender draws `performance.now()` as a 32-square black/white barcode across the top 5% of every frame (via offscreen canvas + `captureStream` + `replaceTrack`). Receiver samples pixel luminance at known positions to reconstruct the 32-bit timestamp; uses the `probe` data channel for ping/pong clock sync (median of 10 samples for stability).

## Common pitfalls

- **`ws` text frames arrive as `Buffer`.** Calling `p.send(buf)` re-sends as binary. The server explicitly does `data.toString()` before relay; don't remove that.
- **Cert SAN is pinned to `LAN_IP` and `MDNS_HOSTNAME`.** Change either and the cert needs regenerating (`rm -rf certs/`).
- **mDNS is host-side, not container-side.** Alpine's avahi client is protocol-incompatible with Ubuntu's avahi-daemon when socket-mounted. Use `scripts/install-host-mdns.sh`.
- **`/var/run` is a symlink to `/run`** on most distros; Docker doesn't follow symlinks for bind sources. Always use the canonical `/run/...` path in compose.
- **Receiver `<video>` must have the `muted` attribute.** Without it, Chrome refuses to autoplay after reloads with no fresh user gesture.
- **Receiver decodes the timestamp barcode at 10 Hz.** Higher rates burn CPU on TV browsers without improving the median.

## Conventions

- Single quotes in JS, double quotes in HTML.
- Always use semicolons in JS.
- Imperative commit messages. No mandatory Conventional Commits prefix.
- Keep PRs small and single-purpose.

## When making changes

- If you touch the signaling protocol, **update both `sender.html` and `receiver.html`** and revise this file's "Signaling protocol" section.
- If you change `server.mjs`, validate `/healthz` still returns valid JSON without auth.
- If you change the Dockerfile, ensure the image still works with bind-mounted `./certs` and the existing env vars (`LAN_IP`, `PIN`, `MULTI_RECEIVER`, `MDNS_HOSTNAME`).
- Run `docker build -t reflektor:local . && docker run --rm -e LAN_IP=192.168.x.y reflektor:local` to smoke-test container changes.
