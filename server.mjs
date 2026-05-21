import { readFileSync } from 'node:fs';
import { createServer } from 'node:https';
import { createServer as createHttpServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { WebSocketServer } from 'ws';

// Regenerated on every container start. Clients use it to auto-reload after deploys.
const SERVER_ID = randomUUID();
const STARTED_AT = Date.now();

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PORT      = parseInt(process.env.PORT      ?? '8443', 10);
const HTTP_PORT = parseInt(process.env.HTTP_PORT ?? '8080', 10);
const PIN       = (process.env.PIN ?? '').trim();
const MULTI_RECEIVER = /^(1|true|yes|on)$/i.test(process.env.MULTI_RECEIVER ?? '');
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

// Paths exempt from PIN auth: cert bootstrap and health probes need to be reachable
// without credentials so devices can install the CA and Docker can run a healthcheck.
const OPEN_PATHS = new Set(['/ca.crt', '/cert.pem', '/healthz']);

function checkAuth(req, urlPath) {
  if (!PIN) return true;
  if (urlPath && OPEN_PATHS.has(urlPath)) return true;
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Basic ')) return false;
  let decoded;
  try { decoded = Buffer.from(auth.slice(6), 'base64').toString(); }
  catch { return false; }
  const idx = decoded.indexOf(':');
  if (idx < 0) return false;
  const a = Buffer.from(decoded.slice(idx + 1));
  const b = Buffer.from(PIN);
  if (a.length !== b.length) return false;
  try { return timingSafeEqual(a, b); } catch { return false; }
}

// ----- Signaling: one sender, one-or-many receivers (MULTI_RECEIVER) -----
// Each WS gets a server-assigned peerId so the sender can address messages
// to specific receivers. The relay routes by `to`; receivers can omit `to`
// (their messages always go to the lone sender).
const receivers = new Map(); // peerId → ws
let senderWs = null;
let senderId = null;

function sendJson(ws, obj) {
  if (ws && ws.readyState === 1) {
    try { ws.send(JSON.stringify(obj)); } catch {}
  }
}

function handleConnection(ws, req) {
  const url = new URL(req.url, 'https://x');
  const role = url.searchParams.get('role');
  if (role !== 'sender' && role !== 'receiver') { ws.close(1008, 'role required'); return; }
  const peerId = randomUUID();

  sendJson(ws, {
    type: 'hello',
    serverId: SERVER_ID,
    peerId,
    role,
    multiReceiver: MULTI_RECEIVER,
  });

  if (role === 'sender') {
    if (senderWs && senderWs !== ws) try { senderWs.close(1000, 'replaced'); } catch {}
    senderWs = ws;
    senderId = peerId;
    console.log(`[ws] sender connected ${peerId.slice(0, 8)} (${req.socket.remoteAddress})`);
    // Tell the new sender about all currently-connected receivers.
    for (const [rid, rws] of receivers) {
      if (rws.readyState === 1) sendJson(ws, { type: 'peer-joined', peerId: rid });
    }
  } else {
    if (!MULTI_RECEIVER) {
      for (const [, rws] of receivers) {
        try { rws.close(1000, 'replaced'); } catch {}
      }
      receivers.clear();
    }
    receivers.set(peerId, ws);
    console.log(`[ws] receiver connected ${peerId.slice(0, 8)} (${req.socket.remoteAddress})`);
    sendJson(senderWs, { type: 'peer-joined', peerId });
  }

  ws.on('message', (data, isBinary) => {
    if (isBinary) return;
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    if (role === 'sender') {
      // Sender → specific receiver (msg.to required)
      const target = msg.to ? receivers.get(msg.to) : null;
      if (target && target.readyState === 1) {
        const { to, ...rest } = msg;
        sendJson(target, { ...rest, from: senderId });
      }
    } else {
      // Receiver → sender
      sendJson(senderWs, { ...msg, from: peerId });
    }
  });

  ws.on('close', () => {
    if (role === 'sender' && senderWs === ws) {
      senderWs = null; senderId = null;
      console.log(`[ws] sender disconnected ${peerId.slice(0, 8)}`);
    } else if (role === 'receiver') {
      if (receivers.delete(peerId)) {
        console.log(`[ws] receiver disconnected ${peerId.slice(0, 8)}`);
        sendJson(senderWs, { type: 'peer-left', peerId });
      }
    }
  });
  ws.on('error', () => {});
}

function healthz() {
  return JSON.stringify({
    status: 'ok',
    serverId: SERVER_ID,
    uptimeSec: Math.floor((Date.now() - STARTED_AT) / 1000),
    senders: senderWs ? 1 : 0,
    receivers: receivers.size,
    multiReceiver: MULTI_RECEIVER,
    pinEnabled: !!PIN,
  }, null, 2);
}

const server = createServer(
  {
    cert: readFileSync(join(__dirname, 'certs/cert.pem')),
    key:  readFileSync(join(__dirname, 'certs/key.pem')),
  },
  async (req, res) => {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';

    if (!checkAuth(req, urlPath)) {
      res.writeHead(401, {
        'WWW-Authenticate': 'Basic realm="reflektor"',
        'Content-Type': 'text/plain; charset=utf-8',
      });
      res.end('Authentication required');
      return;
    }

    if (urlPath === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(healthz());
      return;
    }

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

const wss = new WebSocketServer({
  server,
  path: '/ws',
  verifyClient: (info, cb) => {
    if (checkAuth(info.req, '/ws')) cb(true);
    else cb(false, 401, 'Unauthorized');
  },
});
wss.on('connection', handleConnection);

function lanAddrs() {
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
    console.log(`\nReflektor up — HTTPS :${PORT}, HTTP :${HTTP_PORT} (redirects to HTTPS)`);
    console.log(`server id ${SERVER_ID}`);
    if (MULTI_RECEIVER) console.log('multi-receiver: ENABLED');
    if (PIN) console.log('PIN gate: ENABLED');
    console.log('');
    for (const ip of lanAddrs()) {
      console.log(`  http://${ip}:${HTTP_PORT}/   →  https://${ip}:${PORT}/`);
    }
    console.log('');
  });
});
