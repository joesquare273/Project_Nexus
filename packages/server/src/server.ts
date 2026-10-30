// The network side: one Node process, one HTTP server, WebSocket rooms at
// /ws. When a built client is available (packages/client/dist), the same
// server serves it, so one web service can host both (Render, later).

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { WebSocketServer } from 'ws';
import { Lobby, type LobbyOptions } from './rooms.ts';
import type { AccountService, AccountUser } from './accounts.ts';
import { randomInt, randomUUID } from 'node:crypto';
import { openPack, type PackKind } from '@nexus/cards/boosters';
import { DeckInput, deckProblem } from './collection.ts';
import { ECONOMY, packsForPurchase } from './economy.ts';
import { STARTER_CHOICES, STARTER_REF, claimStarter } from './starter.ts';
import { storeItem, storeSets } from './store.ts';

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

/** The signed-in player, from "Authorization: Bearer <Supabase access token>"; answers the request itself if there isn't one. */
async function signedIn(req: IncomingMessage, res: ServerResponse, accounts: AccountService | null): Promise<AccountUser | null> {
  if (!accounts) {
    json(res, 503, { error: 'Accounts are not set up on this server.' });
    return null;
  }
  const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
  if (!token) {
    json(res, 401, { error: 'Sign in first.' });
    return null;
  }
  const user = await accounts.verify(token);
  if (!user) json(res, 401, { error: 'Your sign-in has expired. Sign in again.' });
  return user;
}

/** A small JSON request body, or undefined if it's too big or not JSON. */
function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((done) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_MESSAGE_BYTES) {
        done(undefined);
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        done(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        done(undefined);
      }
    });
    req.on('error', () => done(undefined));
  });
}

/**
 * The account API. Every route needs a Supabase access token, checked with
 * Supabase; the browser never sends a balance or says what it owns.
 * - GET /api/account: name and shards (creating the account, with the welcome grant once).
 * - GET /api/collection: the cards the player owns.
 * - GET /api/decks, POST /api/decks (new, or changed by id), DELETE /api/decks/<id>.
 * - GET /api/starter: whether the free starter precon is still to pick, and the choices;
 *   POST /api/starter {precon}: grants it (once per account) and saves it as a deck.
 * - GET /api/store: the Store's sets and items with prices;
 *   POST /api/store/buy {key}: buys an item (a card or a bundle), paid and added at once.
 * - POST /api/packs/open {kind, count}: buys 1 or 10 boosters (10 come with a
 *   free bonus pack), opens them on the server and adds their cards to the
 *   collection, all at once.
 */
async function apiRoute(req: IncomingMessage, res: ServerResponse, path: string, accounts: AccountService | null): Promise<void> {
  try {
    const user = await signedIn(req, res, accounts);
    if (!user || !accounts) return;
    const method = req.method ?? 'GET';
    if (path === '/api/account' && method === 'GET') return json(res, 200, await accounts.ensure(user));
    if (path === '/api/collection' && method === 'GET') return json(res, 200, { cards: await accounts.collection(user.id) });
    if (path === '/api/decks' && method === 'GET') return json(res, 200, { decks: await accounts.decks(user.id) });
    if (path === '/api/decks' && method === 'POST') {
      const parsed = DeckInput.safeParse(await readJson(req));
      if (!parsed.success) return json(res, 400, { error: 'That deck could not be read.' });
      const problem = deckProblem(parsed.data, await accounts.collection(user.id));
      if (problem) return json(res, 400, { error: problem });
      const saved = await accounts.saveDeck(user.id, parsed.data);
      if (!saved) return json(res, parsed.data.id ? 404 : 400, { error: parsed.data.id ? 'That deck was not found.' : 'You have too many decks. Delete one first.' });
      return json(res, 200, saved);
    }
    if (path === '/api/starter' && method === 'GET') {
      await accounts.ensure(user);
      return json(res, 200, { claimed: await accounts.hasGrant(user.id, 'starter_precon', STARTER_REF), choices: STARTER_CHOICES });
    }
    if (path === '/api/starter' && method === 'POST') {
      const name = (await readJson(req) as { precon?: unknown } | undefined)?.precon;
      const result = typeof name === 'string' ? await claimStarter(accounts, user, name) : null;
      if (!result) return json(res, 400, { error: 'Choose one of the four precons.' });
      if (!result.granted) return json(res, 409, { error: 'You already have your free precon.' });
      return json(res, 200, { deck: result.deck });
    }
    if (path === '/api/store' && method === 'GET') return json(res, 200, { sets: storeSets() });
    if (path === '/api/store/buy' && method === 'POST') {
      const key = (await readJson(req) as { key?: unknown } | undefined)?.key;
      const item = typeof key === 'string' ? storeItem(key) : undefined;
      if (!item) return json(res, 400, { error: 'That isn’t for sale.' });
      if (item.price === null) return json(res, 400, { error: 'That doesn’t have a price yet.' });
      await accounts.ensure(user);
      try {
        const { balance } = await accounts.grantCards(user.id, { kind: 'store_purchase', ref: randomUUID(), cost: item.price, cards: item.cards.map((c) => ({ ...c, count: 1 })) });
        return json(res, 200, { balance, item });
      } catch (e) {
        if (/insufficient/.test(String(e))) return json(res, 402, { error: `You need ${item.price} Aether Shards for that.` });
        throw e;
      }
    }
    if (path === '/api/packs/open' && method === 'POST') return openPackRoute(res, user, accounts, await readJson(req));
    const deckId = /^\/api\/decks\/([0-9a-f-]{36})$/.exec(path)?.[1];
    if (deckId && method === 'DELETE') {
      return (await accounts.deleteDeck(user.id, deckId)) ? json(res, 200, { deleted: deckId }) : json(res, 404, { error: 'That deck was not found.' });
    }
    if (['/api/account', '/api/collection', '/api/decks', '/api/packs/open', '/api/starter', '/api/store', '/api/store/buy'].includes(path) || deckId) return json(res, 405, { error: 'That method is not allowed here.' });
    return json(res, 404, { error: 'Unknown request.' });
  } catch {
    if (!res.headersSent) json(res, 500, { error: 'The account could not be loaded. Try again.' });
  }
}

const PACK_PRICES: Record<PackKind, number> = { play: ECONOMY.playBoosterPrice, collector: ECONOMY.collectorBoosterPrice };

/** A random number in [0, 1) from the operating system's cryptographic source, never Math.random. */
const cryptoRandom = () => randomInt(2 ** 48 - 1) / 2 ** 48;

async function openPackRoute(res: ServerResponse, user: AccountUser, accounts: AccountService, body: unknown): Promise<void> {
  const { kind, count = 1 } = (body ?? {}) as { kind?: unknown; count?: unknown };
  if (kind !== 'play' && kind !== 'collector') return json(res, 400, { error: 'Choose a Play or Collector Booster.' });
  if (count !== 1 && count !== 10) return json(res, 400, { error: 'Buy 1 or 10 packs at a time.' });
  await accounts.ensure(user);
  const { paid, total } = packsForPurchase(count);
  const price = paid * PACK_PRICES[kind];
  // The same packs as the Packs tab has always opened, Scene Box extras included.
  const packs = Array.from({ length: total }, () => openPack(kind, cryptoRandom));
  const cards = packs.flatMap((pack) => pack.cards.map((p) => ({ id: p.card.id, finish: p.finish, count: 1 })));
  try {
    const { balance } = await accounts.grantCards(user.id, { kind: 'pack_open', ref: randomUUID(), cost: price, cards });
    return json(res, 200, { packs, balance });
  } catch (e) {
    if (/insufficient/.test(String(e))) return json(res, 402, { error: `You need ${price} Aether Shards for ${count === 1 ? 'this pack' : 'these packs'}.` });
    throw e;
  }
}

export function startServer(opts: ServerOptions = {}): Promise<RunningServer> {
  const lobby = new Lobby({ ...opts, accounts: opts.accounts ?? null });
  // Only a real build (with index.html) is served.
  const root = opts.staticDir && existsSync(join(opts.staticDir, 'index.html')) ? resolve(opts.staticDir) : null;
  const http: Server = createServer((req, res) => {
    const apiPath = (req.url ?? '').split('?')[0]!;
    if (apiPath.startsWith('/api/')) {
      void apiRoute(req, res, apiPath, opts.accounts ?? null);
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
