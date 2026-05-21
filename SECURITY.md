# Security policy

## Supported versions

Only the latest image (`ghcr.io/jensenbox/reflektor:latest`) is supported. There is no LTS branch.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security problems. Use GitHub's private vulnerability reporting:

1. Go to <https://github.com/jensenbox/reflektor/security/advisories/new>
2. Describe the issue and reproduction steps.

You'll get an acknowledgement within 7 days.

## Scope and threat model

Reflektor is designed for a single LAN. WebRTC media is locked to host candidates (`iceServers: []`) so the stream cannot escape the local network.

Useful notes for anyone evaluating its security posture:

- **PIN gate**: HTTP Basic auth over HTTPS. The hardcoded `PIN` env var is the only secret. Use a long random PIN; LAN brute-force is possible.
- **Self-signed cert**: generated locally on first container start. If `certs/` is exposed, an attacker on the LAN could MITM by impersonating the server.
- **Signaling server**: no rate limits. A malicious LAN device could flood it. Out of scope for a personal LAN tool.
- **No authentication on `/ca.crt` and `/healthz`** — these are deliberately open so devices can bootstrap trust and Docker can health-check.
- **WebRTC data channel (`probe`)** is unauthenticated peer-to-peer. Anything an authorized peer can do, so can the data channel partner.

## In scope

- Auth bypass on `/sender.html`, `/receiver.html`, or the WebSocket when `PIN` is set.
- Path traversal in the static file server.
- Cert generation issues that produce predictable keys.
- Cross-receiver leakage in MULTI_RECEIVER mode.

## Out of scope

- DoS via signaling-message flooding (LAN-local concern).
- Vulnerabilities only exploitable from a privileged position on the LAN.
- Anything requiring physical access to the host.
