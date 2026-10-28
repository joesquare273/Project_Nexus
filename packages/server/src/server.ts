// The network side: one Node process, one HTTP server, WebSocket rooms at
// /ws. When a built client is available (packages/client/dist), the same
// server serves it, so one web service can host both (Render, later).

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { WebSocketServer } from 'ws';
import { Lobby, type LobbyOptions } from './rooms.ts';

/** Biggest message a browser may send. Actions are small. */
const MAX_MESSAGE_BYTES = 64 * 1024;

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.md': 'text/plain; charset=utf-8',
};

export interface ServerOptions extends LobbyOptions {
  /** 0 picks a free port. */
  port?: number;
  host?: string;
  /** The built client to serve, if any. */
  staticDir?: string;
}

export interface RunningServer {
  port: number;
  lobby: Lobby;
  close(): Promise<void>;
}

export function startServer(opts: ServerOptions = {}): Promise<RunningServer> {
  const lobby = new Lobby(opts);
  // Only a real build (with index.html) is served.
  const root = opts.staticDir && existsSync(join(opts.staticDir, 'index.html')) ? resolve(opts.staticDir) : null;
  const http: Server = createServer((req, res) => {
    if (!root) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Project Nexus game server. Connect a client to /ws.');
      return;
    }
    // Static files from the built client; anything unknown gets index.html.
    let path: string;
    try {
      path = decodeURIComponent((req.url ?? '/').split('?')[0]!);
    } catch {
      res.writeHead(400).end();
      return;
    }
    let file = normalize(join(root, path));
    if (!file.startsWith(root + sep) && file !== root) {
      res.writeHead(403).end();
      return;
    }
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
    const stream = createReadStream(file);
    // A file that vanished or can't be read is a 404, never a crash.
    stream.on('error', () => {
      if (!res.headersSent) res.writeHead(404);
      res.end();
    });
    stream.once('open', () => {
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
      stream.pipe(res);
    });
  });

  const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: MAX_MESSAGE_BYTES });
  wss.on('connection', (ws) => {
    const client = lobby.connect({
      send: (m) => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m));
      },
    });
    ws.on('message', (data, isBinary) => {
      if (isBinary) return client.handle('');
      client.handle(data.toString());
    });
    ws.on('close', () => client.disconnect());
    ws.on('error', () => client.disconnect());
  });

  return new Promise((done) => {
    http.listen(opts.port ?? 8787, opts.host, () => {
      done({
        port: (http.address() as AddressInfo).port,
        lobby,
        close: () =>
          new Promise<void>((closed) => {
            for (const ws of wss.clients) ws.terminate();
            wss.close();
            http.close(() => closed());
          }),
      });
    });
  });
}
