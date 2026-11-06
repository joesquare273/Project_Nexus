// The network side: one Node process, one HTTP server, WebSocket rooms at
// /ws. When a built client is available (packages/client/dist), the same
// server serves it, so one web service can host both (Render, later).

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { WebSocketServer } from 'ws';
import { errorDetails, log, recentLog } from './log.ts';
import { Lobby, type LobbyOptions } from './rooms.ts';
import { ONBOARDING_STEPS, type AccountService, type AccountUser, type OnboardingStep } from './accounts.ts';
import { randomInt, randomUUID } from 'node:crypto';
import { BOOSTER_SETS, openSetPack, type BoosterSet, type PackKind } from '@nexus/cards/boosters';
import { DeckInput, deckProblem } from './collection.ts';
import { ECONOMY, packsForPurchase } from './economy.ts';
import { STARTER_CHOICES, STARTER_REF, claimStarter } from './starter.ts';
import { storeItem, storeSets } from './store.ts';
import { craftRoute, craftingRules, dismantleBatchRoute, dismantleRoute } from './crafting.ts';
import { questProgress, rewardTutorial } from './rewards.ts';

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
  /** How often to ping each connection (default 20 seconds); one that misses a ping is closed. */
  heartbeatMs?: number;
}

export interface RunningServer {
  port: number;
  lobby: Lobby;
  /** Cuts every connection at once, as a network drop would (for tests). */
  dropConnections(): void;
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
 * - GET /api/onboarding: which first-time help the player finished ({tour, lesson});
 *   POST /api/onboarding {step}: records one as finished.
 * - GET /api/store: the Store's sets and items with prices;
 *   POST /api/store/buy {key}: buys an item (a card or a bundle), paid and added at once.
 * - POST /api/packs/open {kind, count}: buys 1 or 10 boosters (10 come with a
 *   free bonus pack), opens them on the server and adds their cards to the
 *   collection, all at once.
 * - GET /api/rewards: quest progress, one-time rewards and match rewards (rewards.ts).
 * - GET /api/fragments, POST /api/dismantle (and /batch), POST /api/craft: fragments
 *   (crafting.ts), each change once per request id.
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
    if (path === '/api/onboarding' && method === 'GET') {
      await accounts.ensure(user);
      return json(res, 200, await accounts.onboarding(user.id));
    }
    if (path === '/api/onboarding' && method === 'POST') {
      const step = (await readJson(req) as { step?: unknown } | undefined)?.step;
      if (!ONBOARDING_STEPS.includes(step as OnboardingStep)) return json(res, 400, { error: 'Unknown step.' });
      await accounts.ensure(user);
      const state = await accounts.finishOnboarding(user.id, step as OnboardingStep);
      // Finishing the lesson pays the one-time tutorial reward (rewards.ts).
      const reward = step === 'lesson' ? await rewardTutorial(accounts, user.id) : null;
      return json(res, 200, reward ? { ...state, reward: { ...reward, balance: (await accounts.ensure(user)).shards } } : state);
    }
    if (path === '/api/rewards' && method === 'GET') {
      await accounts.ensure(user);
      const [quests, wins] = await Promise.all([questProgress(accounts, user.id), accounts.matchCount(user.id, new Date(0), true)]);
      const lesson = !!(await accounts.onboarding(user.id)).lesson;
      return json(res, 200, {
        quests,
        milestones: [
          { id: 'tutorial', label: 'Finish the lesson', reward: ECONOMY.tutorialReward, done: lesson },
          { id: 'first-win', label: 'Win your first game', reward: ECONOMY.firstWinReward, done: wins > 0 },
        ],
        matches: ECONOMY.rewards,
      });
    }
    if (path === '/api/store' && method === 'GET') return json(res, 200, { sets: storeSets() });
    if (path === '/api/store/buy' && method === 'POST') {
      const key = (await readJson(req) as { key?: unknown } | undefined)?.key;
      const item = typeof key === 'string' ? storeItem(key) : undefined;
      if (!item) return json(res, 400, { error: 'That isn’t for sale.' });
      if (item.price === null) return json(res, 400, { error: 'That doesn’t have a price yet.' });
      await accounts.ensure(user);
      try {
        const cards = item.cards.map((c) => ({ id: c.id, finish: c.finish, count: c.count ?? 1 }));
        const { balance } = await accounts.grantCards(user.id, { kind: 'store_purchase', ref: randomUUID(), cost: item.price, cards });
        // A precon is also saved as a ready-to-play Commander deck.
        if (item.deck) {
          await accounts.saveDeck(user.id, { name: item.deck.name, format: 'commander', cards, basics: { W: 0, U: 0, B: 0, R: 0, G: 0 }, commander: item.deck.commander });
        }
        return json(res, 200, { balance, item: { ...item, cards: item.deck ? [] : item.cards } });
      } catch (e) {
        if (/insufficient/.test(String(e))) return json(res, 402, { error: `You need ${item.price} Aether Shards for that.` });
        throw e;
      }
    }
    if (path === '/api/packs/open' && method === 'POST') return openPackRoute(res, user, accounts, await readJson(req));
    if (path === '/api/fragments' && method === 'GET') return json(res, 200, { fragments: await accounts.fragments(user.id), rules: craftingRules() });
    if ((path === '/api/dismantle' || path === '/api/dismantle/batch' || path === '/api/craft') && method === 'POST') {
      await accounts.ensure(user);
      const body = await readJson(req);
      const answer =
        path === '/api/dismantle' ? await dismantleRoute(accounts, user.id, body) : path === '/api/dismantle/batch' ? await dismantleBatchRoute(accounts, user.id, body) : await craftRoute(accounts, user.id, body);
      return json(res, answer.status, answer.body);
    }
    const deckId = /^\/api\/decks\/([0-9a-f-]{36})$/.exec(path)?.[1];
    if (deckId && method === 'DELETE') {
      return (await accounts.deleteDeck(user.id, deckId)) ? json(res, 200, { deleted: deckId }) : json(res, 404, { error: 'That deck was not found.' });
    }
    if (['/api/account', '/api/collection', '/api/decks', '/api/onboarding', '/api/packs/open', '/api/starter', '/api/store', '/api/store/buy', '/api/fragments', '/api/dismantle', '/api/dismantle/batch', '/api/craft', '/api/rewards'].includes(path) || deckId) return json(res, 405, { error: 'That method is not allowed here.' });
    return json(res, 404, { error: 'Unknown request.' });
  } catch {
    if (!res.headersSent) json(res, 500, { error: 'The account could not be loaded. Try again.' });
  }
}

const PACK_PRICES: Record<PackKind, number> = { play: ECONOMY.playBoosterPrice, collector: ECONOMY.collectorBoosterPrice };

/** A random number in [0, 1) from the operating system's cryptographic source, never Math.random. */
const cryptoRandom = () => randomInt(2 ** 48 - 1) / 2 ** 48;

async function openPackRoute(res: ServerResponse, user: AccountUser, accounts: AccountService, body: unknown): Promise<void> {
  const { kind, count = 1, set = 'fin' } = (body ?? {}) as { kind?: unknown; count?: unknown; set?: unknown };
  if (kind !== 'play' && kind !== 'collector') return json(res, 400, { error: 'Choose a Play or Collector Booster.' });
  if (!(BOOSTER_SETS as readonly unknown[]).includes(set)) return json(res, 400, { error: 'Choose a set with booster packs.' });
  if (count !== 1 && count !== 10) return json(res, 400, { error: 'Buy 1 or 10 packs at a time.' });
  await accounts.ensure(user);
  const { paid, total } = packsForPurchase(count);
  const price = paid * PACK_PRICES[kind];
  // Final Fantasy: the same packs as the Packs tab has always opened, Scene Box extras included.
  const packs = Array.from({ length: total }, () => openSetPack(set as BoosterSet, kind, cryptoRandom));
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
    // The server log's last entries, for this computer only (connections, errors, stuck bots).
    if (apiPath === '/api/debug/log') {
      const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
      if (!local) return json(res, 403, { error: 'Only from the computer running the server.' });
      return json(res, 200, { entries: recentLog() });
    }
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
  let nextConnection = 1;
  const alive = new WeakMap<object, boolean>();
  wss.on('connection', (ws) => {
    const id = nextConnection++;
    const opened = Date.now();
    alive.set(ws, true);
    log('ws-open', { connection: id, open: wss.clients.size });
    const client = lobby.connect({
      send: (m) => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m));
      },
    }, id);
    ws.on('pong', () => alive.set(ws, true));
    ws.on('message', (data, isBinary) => {
      alive.set(ws, true);
      if (isBinary) return client.handle('');
      client.handle(data.toString());
    });
    ws.on('close', (code, reason) => {
      log('ws-close', { connection: id, code, reason: reason.toString().slice(0, 120), seconds: Math.round((Date.now() - opened) / 1000), ...client.where() });
      client.disconnect();
    });
    ws.on('error', (e) => {
      log('ws-error', { connection: id, ...errorDetails(e) });
      client.disconnect();
    });
  });
  // Heartbeat: a ping every 20 seconds keeps idle connections open through proxies,
  // and a connection that missed the last one (a sleeping laptop, a dropped network) is closed.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (alive.get(ws) === false) {
        log('ws-timeout', {});
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      try {
        ws.ping();
      } catch {
        // It's closing anyway.
      }
    }
  }, opts.heartbeatMs ?? 20_000);
  heartbeat.unref();

  return new Promise((done) => {
    http.listen(opts.port ?? 8787, opts.host, () => {
      done({
        port: (http.address() as AddressInfo).port,
        lobby,
        dropConnections: () => {
          for (const ws of wss.clients) ws.terminate();
        },
        close: () =>
          new Promise<void>((closed) => {
            clearInterval(heartbeat);
            for (const ws of wss.clients) ws.terminate();
            wss.close();
            http.close(() => closed());
          }),
      });
    });
  });
}
