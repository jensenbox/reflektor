import { readFileSync } from 'node:fs';
import { createServer } from 'node:https';
import { createServer as createHttpServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { WebSocketServer } from 'ws';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PORT      = parseInt(process.env.PORT      ?? '8443', 10);
const HTTP_PORT = parseInt(process.env.HTTP_PORT ?? '8080', 10);
const PUBLIC_DIR = join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = createServer(
  {
    cert: readFileSync(join(__dirname, 'certs/cert.pem')),
    key:  readFileSync(join(__dirname, 'certs/key.pem')),
  },
  async (req, res) => {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';
    // Convenience: download the self-signed CA cert (Android: install as user cert).
    if (urlPath === '/ca.crt' || urlPath === '/cert.pem') {
      try {
        const body = await readFile(join(__dirname, 'certs/cert.pem'));
        res.writeHead(200, {
          'Content-Type': 'application/x-x509-ca-cert',
          'Content-Disposition': 'attachment; filename="reflektor-ca.crt"',
        });
        res.end(body);
        return;
      } catch { res.writeHead(404).end(); return; }
    }
    const filePath = normalize(join(PUBLIC_DIR, urlPath));
    if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(filePath);
      res.writeHead(200, {
        'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  }
);

const wss = new WebSocketServer({ server, path: '/ws' });
const peers = { sender: null, receiver: null };

wss.on('connection', (ws, req) => {
  const role = new URL(req.url, 'https://x').searchParams.get('role');
  if (role !== 'sender' && role !== 'receiver') { ws.close(1008, 'role required'); return; }
  if (peers[role]) try { peers[role].close(1000, 'replaced'); } catch {}
  peers[role] = ws;
  console.log(`[ws] ${role} connected (${req.socket.remoteAddress})`);

  // Whenever both peers are present (initial connect OR receiver reconnect),
  // nudge the sender to (re)negotiate. The sender's existing pc, if any, is
  // discarded and a fresh offer is sent.
  const s = peers.sender, r = peers.receiver;
  if (s && r && s.readyState === 1 && r.readyState === 1) {
    try { s.send(JSON.stringify({ type: 'negotiate' })); } catch {}
  }

  ws.on('message', (data, isBinary) => {
    if (isBinary) return;
    const other = role === 'sender' ? 'receiver' : 'sender';
    const p = peers[other];
    if (p && p.readyState === 1) p.send(data.toString());
  });
  ws.on('close', () => {
    if (peers[role] === ws) peers[role] = null;
    console.log(`[ws] ${role} disconnected`);
  });
  ws.on('error', () => {});
});

function lanAddrs() {
  // In Docker the container's interfaces aren't reachable from the LAN —
  // honor LAN_IP if explicitly set so the startup banner shows useful URLs.
  if (process.env.LAN_IP) return [process.env.LAN_IP];
  const out = [];
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const i of ifaces ?? []) {
      if (i.family === 'IPv4' && !i.internal) out.push(i.address);
    }
  }
  return out;
}

const httpRedirector = createHttpServer((req, res) => {
  const host = (req.headers.host ?? '').split(':')[0] || 'localhost';
  res.writeHead(301, { Location: `https://${host}:${PORT}${req.url}` });
  res.end();
});

server.listen(PORT, '0.0.0.0', () => {
  httpRedirector.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`\nReflektor up — HTTPS :${PORT}, HTTP :${HTTP_PORT} (redirects to HTTPS)\n`);
    for (const ip of lanAddrs()) {
      console.log(`  http://${ip}:${HTTP_PORT}/   →  https://${ip}:${PORT}/`);
    }
    console.log('');
  });
});
