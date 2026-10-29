// The network side: one Node process, one HTTP server, WebSocket rooms at
// /ws. When a built client is available (packages/client/dist), the same
// server serves it, so one web service can host both (Render, later).

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { WebSocketServer } from 'ws';
import { Lobby, type LobbyOptions } from './rooms.ts';
import type { AccountService } from './accounts.ts';

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
  /** Player accounts (Supabase); without them, /api/account answers that accounts aren't set up. */
  accounts?: AccountService | null;
}

export interface RunningServer {
  port: number;
  lobby: Lobby;
  close(): Promise<void>;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

/**
 * GET /api/account with "Authorization: Bearer <Supabase access token>": the
 * player's name and shard balance, creating the account (with the welcome
 * grant, once) the first time. The token is checked with Supabase; the
 * browser never sends a balance.
 */
async function accountRoute(req: IncomingMessage, res: ServerResponse, accounts: AccountService | null): Promise<void> {
  if (req.method !== 'GET') return json(res, 405, { error: 'Use GET.' });
  if (!accounts) return json(res, 503, { error: 'Accounts are not set up on this server.' });
  const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
  if (!token) return json(res, 401, { error: 'Sign in first.' });
  try {
    const user = await accounts.verify(token);
    if (!user) return json(res, 401, { error: 'Your sign-in has expired. Sign in again.' });
    return json(res, 200, await accounts.ensure(user));
  } catch {
    return json(res, 500, { error: 'The account could not be loaded. Try again.' });
  }
}

export function startServer(opts: ServerOptions = {}): Promise<RunningServer> {
  const lobby = new Lobby({ ...opts, accounts: opts.accounts ?? null });
  // Only a real build (with index.html) is served.
  const root = opts.staticDir && existsSync(join(opts.staticDir, 'index.html')) ? resolve(opts.staticDir) : null;
  const http: Server = createServer((req, res) => {
    if ((req.url ?? '').split('?')[0] === '/api/account') {
      void accountRoute(req, res, opts.accounts ?? null);
      return;
    }
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
