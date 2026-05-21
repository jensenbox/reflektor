# Contributing

Thanks for considering a contribution. Reflektor stays small and dependency-light on purpose — the server is ~250 lines and the client is vanilla JS with no build tooling. Most improvements are a single-file change.

## Local dev

```bash
git clone https://github.com/jensenbox/reflektor.git
cd reflektor
./setup.sh                # generates a self-signed cert pinned to your LAN IP
npm install               # one dep: ws
npm start
```

Open the URLs the server prints from two devices on your LAN.

## Test against the container

```bash
docker build -t reflektor:local .
docker run --rm -p 8443:8443 -p 8080:8080 \
  -e LAN_IP=$(hostname -I | awk '{print $1}') \
  reflektor:local
```

## Code style

- **Vanilla JS only.** No bundlers, no TypeScript, no framework. Pages must work served as static files.
- **One runtime dependency** (`ws`). New runtime deps need strong justification.
- **No build step.** What's in `public/` is what's served.
- **Comments only for non-obvious *why*** (workarounds, invariants, gotchas). Don't restate what code does.

See [CLAUDE.md](CLAUDE.md) for an architectural overview and protocol details.

## Pull requests

- Open against `main`.
- Keep PRs focused — one logical change per PR.
- The `build-and-publish` and `codeql` workflows must pass.
- For signaling-protocol changes, update both sides (`sender.html` + `receiver.html`) *and* document the protocol in CLAUDE.md.

## Security

For vulnerabilities, please use [GitHub's private vulnerability reporting](https://github.com/jensenbox/reflektor/security/advisories/new) instead of public issues — details in [SECURITY.md](SECURITY.md).
