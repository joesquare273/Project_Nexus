// The game server over real WebSocket connections: joining rooms, a whole
// game between two scripted clients, rejected messages, and a check that
// neither player is ever sent the other's hand or library.

import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { Action, GameState, PlayerUpdate } from '@nexus/engine';
import { startServer, type RunningServer } from '../src/server.ts';
import type { Room } from '../src/rooms.ts';
import type { ClientMessage, Seat, ServerMessage } from '../src/protocol.ts';

/** Repeatable "random" bytes, so a failing game can be replayed. */
function seededBytes(seed: number): (n: number) => Uint8Array {
  let x = seed >>> 0;
  return (n) => {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      x = (Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
      out[i] = x >>> 24;
    }
    return out;
  };
}

/** A scripted browser: sends messages and waits for the ones it expects. */
class TestClient {
  readonly ws: WebSocket;
  readonly received: ServerMessage[] = [];
  readonly raw: string[] = [];
  private waiters: { test: (m: ServerMessage) => boolean; done: (m: ServerMessage) => void }[] = [];
  seq = 0;

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.on('message', (data) => {
      const text = data.toString();
      this.raw.push(text);
      const m = JSON.parse(text) as ServerMessage;
      this.received.push(m);
      for (const w of [...this.waiters]) if (w.test(m)) {
        this.waiters.splice(this.waiters.indexOf(w), 1);
        w.done(m);
      }
    });
  }

  static open(port: number): Promise<TestClient> {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const client = new TestClient(ws);
    return new Promise((done, fail) => {
      ws.once('open', () => done(client));
      ws.once('error', fail);
    });
  }

  send(m: ClientMessage | string): void {
    this.ws.send(typeof m === 'string' ? m : JSON.stringify(m));
  }

  /** The next message matching `test` (including one that already arrived since `from`). */
  next<T extends ServerMessage>(test: (m: ServerMessage) => m is T, from = this.received.length): Promise<T> {
    const already = this.received.slice(from).find(test);
    if (already) return Promise.resolve(already as T);
    return new Promise((done, fail) => {
      const timer = setTimeout(() => fail(new Error('Timed out waiting for a message.')), 10_000);
      this.waiters.push({ test, done: (m) => (clearTimeout(timer), done(m as T)) });
    });
  }

  error(from = this.received.length) {
    return this.next((m): m is Extract<ServerMessage, { type: 'error' }> => m.type === 'error', from);
  }

  lastUpdate(): Extract<ServerMessage, { type: 'update' }> | undefined {
    return this.received.filter((m): m is Extract<ServerMessage, { type: 'update' }> => m.type === 'update').at(-1);
  }

  act(action: Action, version = this.lastUpdate()!.version): number {
    this.seq++;
    this.send({ type: 'action', seq: this.seq, version, action: action as never });
    return this.seq;
  }

  close(): Promise<void> {
    return new Promise((done) => {
      if (this.ws.readyState === WebSocket.CLOSED) return done();
      this.ws.once('close', () => done());
      this.ws.close();
    });
  }
}

const isUpdate = (m: ServerMessage): m is Extract<ServerMessage, { type: 'update' }> => m.type === 'update';

let server: RunningServer | null = null;
const clients: TestClient[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
  await server?.close();
  server = null;
});

async function open(observe?: (room: Room, seat: Seat, m: ServerMessage) => void, seed = 1): Promise<RunningServer> {
  server = await startServer({ port: 0, host: '127.0.0.1', randomBytes: seededBytes(seed), ...(observe ? { observe } : {}) });
  return server;
}
async function client(port: number): Promise<TestClient> {
  const c = await TestClient.open(port);
  clients.push(c);
  return c;
}

/** Two players in a room, decks picked, game started. */
async function startedGame(port: number, room = 'TABLE1') {
  const a = await client(port);
  const b = await client(port);
  a.send({ type: 'join', name: 'Alice', room });
  await a.next((m): m is Extract<ServerMessage, { type: 'joined' }> => m.type === 'joined');
  b.send({ type: 'join', name: 'Bob', room });
  await b.next((m): m is Extract<ServerMessage, { type: 'joined' }> => m.type === 'joined');
  a.send({ type: 'pickDeck', deck: 'RW' });
  b.send({ type: 'pickDeck', deck: 'UB' });
  await a.next(isUpdate);
  await b.next(isUpdate);
  return { a, b };
}

describe('joining a room', () => {
  it('two players join, see each other in the lobby, pick decks, and the game starts', async () => {
    const { port } = await open();
    const a = await client(port);
    const b = await client(port);
    a.send({ type: 'join', name: 'Alice', room: 'abc123' });
    expect(await a.next((m): m is Extract<ServerMessage, { type: 'joined' }> => m.type === 'joined')).toMatchObject({ room: 'ABC123', seat: 'P1', name: 'Alice' });
    b.send({ type: 'join', name: 'Bob', room: 'ABC123' });
    expect(await b.next((m): m is Extract<ServerMessage, { type: 'joined' }> => m.type === 'joined')).toMatchObject({ seat: 'P2' });
    const lobby = await a.next((m): m is Extract<ServerMessage, { type: 'lobby' }> => m.type === 'lobby' && m.players.length === 2);
    expect(lobby.players.map((p) => p.name)).toEqual(['Alice', 'Bob']);
    // One deck isn't enough to start.
    a.send({ type: 'pickDeck', deck: 'RW' });
    await b.next((m): m is Extract<ServerMessage, { type: 'lobby' }> => m.type === 'lobby' && m.players[0]!.deck === 'RW');
    expect(a.received.some(isUpdate)).toBe(false);
    b.send({ type: 'pickDeck', deck: 'RW' });
    const ua = await a.next(isUpdate);
    const ub = await b.next(isUpdate);
    expect(ua).toMatchObject({ seat: 'P1', version: 0, names: { P1: 'Alice', P2: 'Bob' } });
    expect(ub).toMatchObject({ seat: 'P2', version: 0 });
    expect(ua.update.view.viewer).toBe('P1');
    expect(ua.update.state.players.P1!.hand.length).toBe(7);
  });

  it('refuses a third player, a taken name, a bad name or code, and a second join', async () => {
    const { port } = await open();
    const a = await client(port);
    a.send({ type: 'join', name: 'You', room: 'ROOM1' });
    expect((await a.error()).code).toBe('bad-message');
    a.send({ type: 'join', name: 'Alice', room: 'no' });
    expect((await a.error()).code).toBe('bad-message');
    a.send({ type: 'join', name: 'Alice', room: 'ROOM1' });
    await a.next((m): m is Extract<ServerMessage, { type: 'joined' }> => m.type === 'joined');
    a.send({ type: 'join', name: 'Alice', room: 'ROOM2' });
    expect((await a.error()).code).toBe('already-joined');
    const b = await client(port);
    b.send({ type: 'join', name: 'alice', room: 'ROOM1' });
    expect((await b.error()).code).toBe('name-taken');
    b.send({ type: 'join', name: 'Bob', room: 'room1' });
    await b.next((m): m is Extract<ServerMessage, { type: 'joined' }> => m.type === 'joined');
    const c = await client(port);
    c.send({ type: 'join', name: 'Cid', room: 'ROOM1' });
    expect((await c.error()).code).toBe('room-full');
    const d = await client(port);
    d.send({ type: 'pickDeck', deck: 'RW' });
    expect((await d.error()).code).toBe('not-joined');
  });

  it('when a player leaves mid-game, the other is told', async () => {
    const { port } = await open();
    const { a, b } = await startedGame(port);
    await b.close();
    expect(await a.next((m): m is Extract<ServerMessage, { type: 'opponentLeft' }> => m.type === 'opponentLeft')).toMatchObject({ seat: 'P2', name: 'Bob' });
  });
});

describe('rejected messages', () => {
  it('bad, stale, duplicate, out-of-turn and illegal messages get an error, and the game carries on', async () => {
    const { port } = await open();
    const lone = await client(port);
    lone.send({ type: 'join', name: 'Early', room: 'EARLY' });
    await lone.next((m): m is Extract<ServerMessage, { type: 'joined' }> => m.type === 'joined');
    lone.send({ type: 'action', seq: 1, version: 0, action: { type: 'PassPriority', player: 'P1' } });
    expect((await lone.error()).code).toBe('not-started');

    const { a, b } = await startedGame(port);
    const players = { P1: a, P2: b };
    const u = a.lastUpdate()!;
    const pending = u.update.state.pending as { player: Seat };
    const mover = players[pending.player];
    const other = mover === a ? b : a;
    const otherSeat = mover === a ? 'P2' : 'P1';

    a.send('{not json');
    expect((await a.error()).code).toBe('bad-json');
    a.send(JSON.stringify({ type: 'action', seq: 'one', version: 0, action: {} }));
    expect((await a.error()).code).toBe('bad-message');
    a.send(JSON.stringify({ type: 'hack', anything: true }));
    expect((await a.error()).code).toBe('bad-message');
    a.send(JSON.stringify({ type: 'join', name: 'Alice', room: 'TABLE1', extra: 1 }));
    expect((await a.error()).code).toBe('bad-message');

    // The player the game isn't waiting on.
    other.act({ type: 'PassPriority', player: otherSeat } as Action);
    expect((await other.error()).code).toBe('not-your-decision');
    // Pretending to be the other player.
    mover.act({ type: 'PassPriority', player: otherSeat } as Action);
    expect((await mover.error()).code).toBe('wrong-player');
    // An action for an old version of the game.
    mover.act(mover.lastUpdate()!.update.legal[0]!, 99);
    expect((await mover.error()).code).toBe('stale');
    // An action naming a hidden card placeholder: illegal.
    const hidden = mover.lastUpdate()!.update.state.players[otherSeat]!.hand[0]!;
    mover.act({ type: 'PlayLand', player: pending.player, card: hidden } as Action);
    const illegal = await mover.error();
    expect(illegal.code).toBe('illegal');

    // A legal action works after all that, and resending it is a duplicate.
    const legal = mover.lastUpdate()!.update.legal[0]!;
    const from = mover.received.length;
    const seq = mover.act(legal);
    const applied = await mover.next(isUpdate, from);
    expect(applied.version).toBe(1);
    expect(applied.ackSeq).toBe(seq);
    mover.send({ type: 'action', seq, version: 1, action: legal as never });
    expect((await mover.error()).code).toBe('duplicate');
    // Errors never name real card ids.
    for (const raw of [...a.raw, ...b.raw]) expect(raw).not.toMatch(/"[ckt]\d+"/);
  });
});

describe('a whole game', () => {
  it('two scripted clients play to the end, and neither is ever sent the other hand or any library', async () => {
    const realIds = new Set<string>();
    /** Definitions each seat may have seen so far: public zones, their own hand, cards they were shown. */
    const seenBy: Record<Seat, Set<string>> = { P1: new Set(), P2: new Set() };
    let checkedMessages = 0;
    let hiddenChecks = 0;
    const problems: string[] = [];
    const observe = (room: Room, seat: Seat, m: ServerMessage) => {
      const s: GameState = room.game!.state;
      for (const id of Object.keys(s.cards)) realIds.add(id);
      const json = JSON.stringify(m);
      checkedMessages++;
      for (const id of Object.keys(s.cards)) if (json.includes(`"${id}"`)) problems.push(`${seat} was sent the real id ${id}`);
      const other: Seat = seat === 'P1' ? 'P2' : 'P1';
      for (const c of Object.values(s.cards)) {
        if (['battlefield', 'graveyard', 'exile', 'stack', 'command'].includes(c.zone) && c.foretoldTurn === undefined && !c.linkedExile) seenBy[seat].add(c.defId);
        if (c.zone === 'hand' && c.owner === seat) seenBy[seat].add(c.defId);
        if (c.isToken) seenBy[seat].add(c.defId);
      }
      const p = s.pending;
      if ((p.kind === 'surveil' || p.kind === 'exileTop') && p.player === seat) seenBy[seat].add(s.cards[p.card]!.defId);
      if (p.kind === 'chooseCards' && p.player === seat) for (const id of p.cards) seenBy[seat].add(s.cards[id]!.defId);
      // The other player's hand, and every library, must stay hidden unless the card has been seen.
      const hidden = [...s.players[other]!.hand, ...s.players.P1!.library, ...s.players.P2!.library].map((id) => s.cards[id]!);
      for (const c of hidden) {
        if (seenBy[seat].has(c.defId)) continue;
        hiddenChecks++;
        if (json.includes(`"${c.defId}"`)) problems.push(`${seat} was sent ${c.defId} from ${c.owner}'s ${c.zone}`);
      }
    };
    const { port } = await open(observe, 7);
    const { a, b } = await startedGame(port, 'FULLGAME');
    const players: Record<Seat, TestClient> = { P1: a, P2: b };

    // Each client acts only on its own updates: a random legal action, passing about half the time.
    let x = 12345;
    const rand = () => ((x = (Math.imul(x, 1103515245) + 12345) >>> 0) / 2 ** 32);
    let actions = 0;
    const finished = new Promise<void>((done, fail) => {
      const onUpdate = (seat: Seat) => (m: ServerMessage) => {
        if (m.type === 'error') return fail(new Error(`${seat}: ${m.code} ${m.message}`));
        if (m.type !== 'update') return;
        if (m.update.state.pending.kind === 'gameOver') return done();
        const legal = m.update.legal;
        if (legal.length === 0) return;
        actions++;
        // A cap so the test always ends: past it, P1 concedes.
        if (actions > 3000) return void players.P1.act({ type: 'Concede', player: 'P1' } as Action, m.version);
        const nonPass = legal.filter((l: Action) => l.type !== 'PassPriority');
        const pass = legal.find((l: Action) => l.type === 'PassPriority');
        const choice = pass && (nonPass.length === 0 || rand() < 0.5) ? pass : nonPass[Math.floor(rand() * nonPass.length)]!;
        players[seat].act(choice, m.version);
      };
      a.ws.on('message', (d) => onUpdate('P1')(JSON.parse(d.toString()) as ServerMessage));
      b.ws.on('message', (d) => onUpdate('P2')(JSON.parse(d.toString()) as ServerMessage));
      // Kick off from the first updates, which already arrived.
      for (const [seat, c] of Object.entries(players) as [Seat, TestClient][]) onUpdate(seat)(c.lastUpdate()!);
    });
    await finished;
    await a.next((m): m is Extract<ServerMessage, { type: 'update' }> => m.type === 'update' && m.update.state.pending.kind === 'gameOver', 0);
    await b.next((m): m is Extract<ServerMessage, { type: 'update' }> => m.type === 'update' && m.update.state.pending.kind === 'gameOver', 0);

    expect(problems).toEqual([]);
    expect(actions).toBeGreaterThan(50);
    expect(checkedMessages).toBeGreaterThan(100);
    expect(hiddenChecks).toBeGreaterThan(1000);
    // And over the wire: no real id in anything either player received.
    for (const raw of [...a.raw, ...b.raw]) for (const id of realIds) expect(raw.includes(`"${id}"`), id).toBe(false);
    const last: PlayerUpdate = a.lastUpdate()!.update;
    expect(last.view.winner === undefined ? false : true).toBe(true);
  }, 300_000);
});

describe('serving the built client', () => {
  it('serves index.html and its files, falls back to index.html, and survives bad URLs', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'nexus-client-'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Nexus</title>');
    writeFileSync(join(dir, 'app.js'), 'console.log(1)');
    server = await startServer({ port: 0, host: '127.0.0.1', staticDir: dir });
    const base = `http://127.0.0.1:${server.port}`;
    expect(await (await fetch(`${base}/`)).text()).toContain('<title>Nexus</title>');
    const js = await fetch(`${base}/app.js`);
    expect(js.headers.get('content-type')).toContain('javascript');
    expect(await (await fetch(`${base}/play/room`)).text()).toContain('<title>Nexus</title>');
    expect((await fetch(`${base}/%E0%A4%A`)).status).toBe(400);
    expect((await fetch(`${base}/..%2f..%2fpackage.json`)).status).toBe(403);
    // Still up, and the WebSocket works alongside.
    const c = await client(server.port);
    c.send('{');
    expect((await c.error()).code).toBe('bad-json');
  });
});
