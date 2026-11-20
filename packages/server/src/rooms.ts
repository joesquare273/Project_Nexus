// Rooms and the game authority, without any networking: the WebSocket
// layer (server.ts) hands each connection's raw messages to a Client here.
//
// The server holds the only real GameState. Each player gets their own
// redacted update (engine/src/redact.ts) after every change, and sends back
// actions that refer to cards by their aliases. Every incoming message is
// checked with zod, then for order (seq, version), turn and legality;
// anything wrong gets an `error` message, never a crash.

import { randomBytes as cryptoBytes } from 'node:crypto';
import {
  AliasBook,
  FREE_FOR_ALL,
  applyAction,
  createGame,
  playerUpdate,
  resolveAction,
  seedFromBytes,
  type Action,
  type GameEvent,
  type GameState,
} from '@nexus/engine';
import { CARD_DEFS, starterKitDeck } from '@nexus/cards';
import { ClientMessage, type Deck, type ErrorCode, type LobbyPlayer, type Seat, type ServerMessage, type TableFormat } from './protocol.ts';
import type { AccountService } from './accounts.ts';
import { EventHub, type EventHubOptions } from './events.ts';
import { TableHub } from './tables.ts';
import { errorDetails, log } from './log.ts';
import type { DraftSetCode } from '@nexus/cards/draft';

/** Starter Kit rooms are duels. */
const SEATS: Seat[] = ['P1', 'P2'];

export interface Connection {
  send(message: ServerMessage): void;
}

interface SeatState {
  /** The player's account (Supabase user id). */
  userId: string;
  name: string;
  deck: Deck | null;
  conn: Connection;
  connected: boolean;
  /** The last of this player's actions that was applied. */
  lastSeq: number;
}

export interface Game {
  state: GameState;
  /** Goes up by one with every applied action. */
  version: number;
  books: Record<Seat, AliasBook>;
}

export class Room {
  readonly code: string;
  readonly seats = new Map<Seat, SeatState>();
  game: Game | null = null;
  constructor(code: string) {
    this.code = code;
  }
  names(): Record<Seat, string> {
    return Object.fromEntries(SEATS.map((s) => [s, this.seats.get(s)?.name ?? ''])) as Record<Seat, string>;
  }
  lobby(): LobbyPlayer[] {
    return [...this.seats].map(([seat, p]) => ({ seat, name: p.name, deck: p.deck, connected: p.connected }));
  }
  broadcast(message: ServerMessage): void {
    for (const p of this.seats.values()) if (p.connected) p.conn.send(message);
  }
}

export interface LobbyOptions {
  /** Cryptographic randomness for game seeds and card aliases (tests may pass a seeded one). */
  randomBytes?: (n: number) => Uint8Array;
  /** Called with each update as it's sent, while the real game is still in that state (tests check for leaks). */
  observe?: (room: Room, seat: Seat, message: ServerMessage) => void;
  /** Player accounts: joining a room needs a valid sign-in. Without them nobody can join (no guests). */
  accounts?: AccountService | null;
  /** Draft events and Commander tables: clock, timers and bot pacing (tests speed them up). */
  events?: Partial<Pick<EventHubOptions, 'now' | 'schedule' | 'botDelayMs' | 'botGameLimit'>>;
}

/** Every room on this server. */
export class Lobby {
  readonly rooms = new Map<string, Room>();
  readonly randomBytes: (n: number) => Uint8Array;
  readonly observe: LobbyOptions['observe'];
  readonly accounts: AccountService | null;
  /** Draft events (docs/sealed.md, S3). */
  readonly events: EventHub;
  /** Commander tables. */
  readonly tables: TableHub;
  constructor(opts: LobbyOptions = {}) {
    this.randomBytes = opts.randomBytes ?? ((n) => cryptoBytes(n));
    this.observe = opts.observe;
    this.accounts = opts.accounts ?? null;
    this.events = new EventHub({ accounts: this.accounts, randomBytes: this.randomBytes, alias: () => this.alias(), ...opts.events });
    const { now: _now, ...tableOpts } = opts.events ?? {};
    this.tables = new TableHub({ accounts: this.accounts, randomBytes: this.randomBytes, alias: () => this.alias(), ...tableOpts });
  }
  /** `id` numbers the connection in the server log. */
  connect(conn: Connection, id = 0): Client {
    return new Client(this, conn, id);
  }
  /** A fresh random alias: 12 base-36 characters (62 bits). */
  alias(): string {
    const b = this.randomBytes(8);
    const n = new DataView(b.buffer, b.byteOffset, 8).getBigUint64(0) >> 2n;
    return n.toString(36).padStart(12, '0');
  }
}

/** One browser connection. */
export class Client {
  private readonly lobby: Lobby;
  private readonly conn: Connection;
  private room: Room | null = null;
  private seat: Seat | null = null;
  /** The draft event this connection is seated in, and its seat there. */
  private event: { code: string; seat: string } | null = null;
  /** The Commander table this connection is seated at, and its seat there. */
  private table: { code: string; seat: Seat } | null = null;
  /** Messages are handled one at a time, in order (checking a sign-in takes a moment). */
  private queue: Promise<void> = Promise.resolve();
  private readonly id: number;
  constructor(lobby: Lobby, conn: Connection, id = 0) {
    this.lobby = lobby;
    this.conn = conn;
    this.id = id;
  }

  /** Which table, event or room this connection is in, for the server log. */
  where(): Record<string, string> {
    return {
      ...(this.table ? { table: this.table.code, seat: this.table.seat } : {}),
      ...(this.event ? { event: this.event.code, seat: this.event.seat } : {}),
      ...(this.room ? { room: this.room.code } : {}),
    };
  }

  private error(code: ErrorCode, message: string, seq?: number): void {
    this.conn.send({ type: 'error', code, message, ...(seq !== undefined ? { seq } : {}) });
  }

  /** Handles one raw message from the browser, after any before it. Never rejects. */
  handle(raw: string): Promise<void> {
    this.queue = this.queue.then(() => this.process(raw));
    return this.queue;
  }

  private async process(raw: string): Promise<void> {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return this.error('bad-json', 'That message was not valid JSON.');
    }
    const parsed = ClientMessage.safeParse(json);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return this.error('bad-message', issue ? `${issue.path.join('.') || 'message'}: ${issue.message}` : 'Unknown message.');
    }
    const m = parsed.data;
    try {
      if (m.type === 'eventCreate' || m.type === 'eventJoin') await this.enterEvent(m.token, m.type === 'eventCreate' ? { players: m.players, bots: m.bots, set: m.set } : { code: m.code });
      else if (m.type.startsWith('event')) await this.eventMessage(m);
      else if (m.type === 'tableCreate' || m.type === 'tableJoin') await this.enterTable(m.token, m.type === 'tableCreate' ? { players: m.players, bots: m.bots, format: m.format ?? 'commander' } : { code: m.code });
      else if (m.type.startsWith('table')) await this.tableMessage(m);
      else if (m.type === 'actions' && this.table) {
        const problem = this.lobby.tables.act(this.table.code, this.table.seat, m.seq, m.version, m.actions as unknown as Action[]);
        if (problem) {
          if (problem.error !== 'illegal') log('action-refused', { connection: this.id, ...this.where(), code: problem.error, message: problem.message });
          this.error(problem.error, problem.message, m.seq);
        }
      }
      else if (m.type === 'join') await this.join(m.token, m.room);
      else if (m.type === 'pickDeck') this.pickDeck(m.deck);
      else if (m.type === 'actions' && this.event) {
        const problem = this.lobby.events.act(this.event.code, this.event.seat, m.seq, m.version, m.actions as unknown as Action[]);
        if (problem) {
          if (problem.code !== 'illegal') log('action-refused', { connection: this.id, ...this.where(), code: problem.code, message: problem.message });
          this.error(problem.code, problem.message, m.seq);
        }
      } else if (m.type === 'actions') this.act(m.seq, m.version, m.actions as unknown as Action[]);
    } catch (e) {
      // A bug in the server must not take the room down with it.
      log('message-error', { connection: this.id, message: m.type, ...this.where(), ...errorDetails(e) });
      this.error('illegal', `The server could not handle that: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Signs in for an event or table; null (after an error message) if that fails. */
  private async signedIn(token: string): Promise<{ id: string; name: string } | null> {
    const accounts = this.lobby.accounts;
    if (!accounts) {
      this.error('not-signed-in', 'Accounts are not set up on this server, so nobody can join.');
      return null;
    }
    const user = await accounts.verify(token);
    if (!user) this.error('not-signed-in', 'Your sign-in has expired. Sign in with Discord again.');
    return user;
  }

  /** Makes a Commander table, or joins (or returns to) one by code. */
  private async enterTable(token: string, which: { players: number; bots: number; format: TableFormat } | { code: string }): Promise<void> {
    if (this.room) return this.error('already-joined', `You are in room ${this.room.code}.`);
    if (this.event) return this.error('already-joined', `You are in draft event ${this.event.code}.`);
    const user = await this.signedIn(token);
    if (!user) return;
    if (this.table) this.lobby.tables.detach(this.table.code, this.table.seat, this.conn);
    this.table = null;
    if ('code' in which) {
      const r = this.lobby.tables.join(user, which.code, this.conn);
      if ('error' in r) {
        log('table-join-failed', { connection: this.id, table: which.code, reason: r.error });
        return this.error(r.error, r.message);
      }
      this.table = { code: which.code, seat: r.seat };
      log('table-join', { connection: this.id, table: which.code, seat: r.seat });
    } else {
      const r = this.lobby.tables.create(user, which.players, which.bots, this.conn, which.format);
      if ('error' in r) return this.error(r.error, r.message);
      this.table = r;
      log('table-create', { connection: this.id, table: r.code, format: which.format, bots: which.bots });
    }
  }

  private async tableMessage(m: ClientMessage): Promise<void> {
    if (!this.table) return this.error('no-event', 'Join a table first.');
    const { code, seat } = this.table;
    const hub = this.lobby.tables;
    let problem: string | null = null;
    if (m.type === 'tableSettings') problem = hub.settings(code, seat, m.players, m.bots);
    else if (m.type === 'tableDeck') problem = await hub.deck(code, seat, m.deck);
    else if (m.type === 'tableStart') problem = hub.start(code, seat);
    else if (m.type === 'tableLeave') {
      problem = hub.leave(code, seat);
      if (!problem) this.table = null;
    }
    if (problem) this.error('event-rule', problem);
  }

  /** Makes a draft event, or joins (or returns to) one by code. */
  private async enterEvent(token: string, which: { players: number; bots: number; set: DraftSetCode } | { code: string }): Promise<void> {
    if (this.room) return this.error('already-joined', `You are in room ${this.room.code}.`);
    if (this.table) return this.error('already-joined', `You are at table ${this.table.code}.`);
    const accounts = this.lobby.accounts;
    if (!accounts) return this.error('not-signed-in', 'Accounts are not set up on this server, so nobody can join.');
    const user = await accounts.verify(token);
    if (!user) return this.error('not-signed-in', 'Your sign-in has expired. Sign in with Discord again.');
    if (this.event) this.lobby.events.detach(this.event.code, this.event.seat, this.conn);
    this.event = null;
    if ('players' in which) {
      const r = await this.lobby.events.create(user, which, this.conn);
      if ('error' in r) return this.error(r.error, r.message);
      this.event = r;
      log('event-create', { connection: this.id, event: r.code });
      return;
    }
    const r = await this.lobby.events.join(user, which.code, this.conn);
    if ('error' in r) {
      log('event-join-failed', { connection: this.id, event: which.code, reason: r.error });
      return this.error(r.error, r.message);
    }
    this.event = { code: which.code, seat: r.seat };
    log('event-join', { connection: this.id, event: which.code, seat: r.seat });
  }

  private async eventMessage(m: ClientMessage): Promise<void> {
    if (!this.event) return this.error('no-event', 'Join a draft event first.');
    const { code, seat } = this.event;
    const hub = this.lobby.events;
    let problem: string | null = null;
    if (m.type === 'eventStart') problem = await hub.start(code, seat);
    else if (m.type === 'eventPick') problem = hub.pick(code, seat, m.uid);
    else if (m.type === 'eventSelect') problem = hub.select(code, seat, m.uid);
    else if (m.type === 'eventSettings') problem = hub.settings(code, seat, m.players, m.bots, m.set);
    else if (m.type === 'eventDeck') problem = hub.deck(code, seat, m.deck);
    else if (m.type === 'eventReady') problem = hub.ready(code, seat, m.ready);
    else if (m.type === 'eventPlayDraw') problem = hub.playDraw(code, seat, m.play);
    else if (m.type === 'eventReadyNext') problem = hub.readyNext(code, seat);
    else if (m.type === 'eventLeave') {
      problem = hub.leave(code, seat);
      if (!problem) this.event = null;
    }
    if (problem) this.error('event-rule', problem);
  }

  private async join(token: string, code: string): Promise<void> {
    if (this.event) return this.error('already-joined', `You are in draft event ${this.event.code}.`);
    if (this.table) return this.error('already-joined', `You are at table ${this.table.code}.`);
    if (this.room) return this.error('already-joined', `You are already in room ${this.room.code}.`);
    const accounts = this.lobby.accounts;
    if (!accounts) return this.error('not-signed-in', 'Accounts are not set up on this server, so nobody can join.');
    const user = await accounts.verify(token);
    if (!user) return this.error('not-signed-in', 'Your sign-in has expired. Sign in with Discord again.');
    if (this.room) return this.error('already-joined', `You are already in room ${(this.room as Room).code}.`);
    let room = this.lobby.rooms.get(code);
    if (room?.game) return this.error('already-started', `Room ${code} is already playing.`);
    if (room && room.seats.size >= SEATS.length) return this.error('room-full', `Room ${code} is full.`);
    if (room && [...room.seats.values()].some((p) => p.userId === user.id)) {
      return this.error('same-player', `You are already in room ${code} on another tab.`);
    }
    // The board calls you "You", and two players can't share a name on it.
    let name = user.name.toLowerCase() === 'you' ? `${user.name}.` : user.name;
    if (room && [...room.seats.values()].some((p) => p.name === name)) name = `${name} (2)`;
    if (!room) {
      room = new Room(code);
      this.lobby.rooms.set(code, room);
    }
    const seat = SEATS.find((s) => !room.seats.has(s))!;
    room.seats.set(seat, { userId: user.id, name, deck: null, conn: this.conn, connected: true, lastSeq: 0 });
    this.room = room;
    this.seat = seat;
    this.conn.send({ type: 'joined', room: code, seat, name });
    room.broadcast({ type: 'lobby', room: code, players: room.lobby() });
  }

  private pickDeck(deck: Deck): void {
    const room = this.room;
    if (!room || !this.seat) return this.error('not-joined', 'Join a room first.');
    if (room.game) return this.error('already-started', 'The game has already started.');
    room.seats.get(this.seat)!.deck = deck;
    room.broadcast({ type: 'lobby', room: room.code, players: room.lobby() });
    if (room.seats.size === SEATS.length && [...room.seats.values()].every((p) => p.deck)) this.start(room);
  }

  private start(room: Room): void {
    const created = createGame({
      format: FREE_FOR_ALL,
      cardDefs: CARD_DEFS,
      // 128 bits from crypto.randomBytes: never Math.random (see docs/decisions.md).
      seed: seedFromBytes(this.lobby.randomBytes(16)),
      players: SEATS.map((seat) => ({ id: seat, deck: starterKitDeck(room.seats.get(seat)!.deck!), ordersTriggers: true })),
      mulligans: true,
    });
    const books = Object.fromEntries(SEATS.map((s) => [s, new AliasBook(() => this.lobby.alias())])) as Record<Seat, AliasBook>;
    room.game = { state: created.state, version: 0, books };
    sendUpdates(this.lobby, room, created.events);
  }

  private act(seq: number, version: number, actions: Action[]): void {
    const room = this.room;
    const seat = this.seat;
    if (!room || !seat) return this.error('not-joined', 'Join a room first.', seq);
    const game = room.game;
    if (!game) return this.error('not-started', 'The game has not started yet.', seq);
    const me = room.seats.get(seat)!;
    if (game.state.pending.kind === 'gameOver') return this.error('game-over', 'The game is over.', seq);
    if (seq <= me.lastSeq) return this.error('duplicate', `Action ${seq} was already received.`, seq);
    if (version !== game.version) return this.error('stale', `That action was for version ${version}; the game is at version ${game.version}.`, seq);
    if (actions.some((a) => a.player !== seat)) return this.error('wrong-player', `You play as ${seat}.`, seq);
    const book = game.books[seat];
    // All or nothing: try the whole batch on a copy of the game first.
    let state = game.state;
    const events: GameEvent[] = [];
    for (const action of actions) {
      const pending = state.pending;
      if (action.type !== 'Concede' && (!('player' in pending) || pending.player !== seat)) {
        return this.error('not-your-decision', 'The game is waiting on the other player.', seq);
      }
      const result = applyAction(state, resolveAction(action, book));
      if (!result.ok) return this.error('illegal', aliasedError(state, result.error, book), seq);
      state = result.state;
      events.push(...result.events);
    }
    game.state = state;
    game.version++;
    me.lastSeq = seq;
    sendUpdates(this.lobby, room, events);
  }

  /** The browser went away. In a game, the other player is told and the room closes. */
  disconnect(): void {
    if (this.table) {
      this.lobby.tables.detach(this.table.code, this.table.seat, this.conn);
      this.table = null;
    }
    if (this.event) {
      this.lobby.events.detach(this.event.code, this.event.seat, this.conn);
      this.event = null;
    }
    const room = this.room;
    const seat = this.seat;
    if (!room || !seat) return;
    this.room = null;
    this.seat = null;
    const me = room.seats.get(seat)!;
    if (room.game) {
      me.connected = false;
      if (room.game.state.pending.kind !== 'gameOver') {
        for (const [s, p] of room.seats) if (s !== seat && p.connected) p.conn.send({ type: 'opponentLeft', seat, name: me.name });
      }
      this.lobby.rooms.delete(room.code);
      return;
    }
    room.seats.delete(seat);
    if (room.seats.size === 0) this.lobby.rooms.delete(room.code);
    else room.broadcast({ type: 'lobby', room: room.code, players: room.lobby() });
  }
}

/** Sends each connected player their own update. */
function sendUpdates(lobby: Lobby, room: Room, events: readonly GameEvent[]): void {
  const game = room.game!;
  const names = room.names();
  for (const [seat, p] of room.seats) {
    // Every player's aliases follow every change, even while they're away.
    const update = playerUpdate(game.state, seat, game.books[seat], events);
    const message: ServerMessage = { type: 'update', version: game.version, seat, names, ackSeq: p.lastSeq, update };
    lobby.observe?.(room, seat, message);
    if (p.connected) p.conn.send(message);
  }
}

/** Engine errors quote card ids ("c4" can't attack); show the player's alias, or "a hidden card". */
function aliasedError(s: GameState, error: string, book: AliasBook): string {
  return error.replace(/"([A-Za-z]+\d+)"/g, (whole, id: string) => (Object.hasOwn(s.cards, id) ? (book.has(id) ? `"${book.alias(id)}"` : 'a hidden card') : whole));
}
