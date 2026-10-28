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
import { ClientMessage, type Deck, type ErrorCode, type LobbyPlayer, type Seat, type ServerMessage } from './protocol.ts';

const SEATS: Seat[] = ['P1', 'P2'];

export interface Connection {
  send(message: ServerMessage): void;
}

interface SeatState {
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
}

/** Every room on this server. */
export class Lobby {
  readonly rooms = new Map<string, Room>();
  readonly randomBytes: (n: number) => Uint8Array;
  readonly observe: LobbyOptions['observe'];
  constructor(opts: LobbyOptions = {}) {
    this.randomBytes = opts.randomBytes ?? ((n) => cryptoBytes(n));
    this.observe = opts.observe;
  }
  connect(conn: Connection): Client {
    return new Client(this, conn);
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
  constructor(lobby: Lobby, conn: Connection) {
    this.lobby = lobby;
    this.conn = conn;
  }

  private error(code: ErrorCode, message: string, seq?: number): void {
    this.conn.send({ type: 'error', code, message, ...(seq !== undefined ? { seq } : {}) });
  }

  /** Handles one raw message from the browser. Never throws. */
  handle(raw: string): void {
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
      if (m.type === 'join') this.join(m.name, m.room);
      else if (m.type === 'pickDeck') this.pickDeck(m.deck);
      else this.act(m.seq, m.version, m.action as unknown as Action);
    } catch (e) {
      // A bug in the server must not take the room down with it.
      this.error('illegal', `The server could not handle that: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private join(name: string, code: string): void {
    if (this.room) return this.error('already-joined', `You are already in room ${this.room.code}.`);
    let room = this.lobby.rooms.get(code);
    if (room?.game) return this.error('already-started', `Room ${code} is already playing.`);
    if (room && room.seats.size >= SEATS.length) return this.error('room-full', `Room ${code} is full.`);
    if (room && [...room.seats.values()].some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      return this.error('name-taken', `Someone in room ${code} is already called ${name}.`);
    }
    if (!room) {
      room = new Room(code);
      this.lobby.rooms.set(code, room);
    }
    const seat = SEATS.find((s) => !room.seats.has(s))!;
    room.seats.set(seat, { name, deck: null, conn: this.conn, connected: true, lastSeq: 0 });
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
      players: SEATS.map((seat) => ({ id: seat, deck: starterKitDeck(room.seats.get(seat)!.deck!) })),
      mulligans: true,
    });
    const books = Object.fromEntries(SEATS.map((s) => [s, new AliasBook(() => this.lobby.alias())])) as Record<Seat, AliasBook>;
    room.game = { state: created.state, version: 0, books };
    sendUpdates(this.lobby, room, created.events);
  }

  private act(seq: number, version: number, action: Action): void {
    const room = this.room;
    const seat = this.seat;
    if (!room || !seat) return this.error('not-joined', 'Join a room first.', seq);
    const game = room.game;
    if (!game) return this.error('not-started', 'The game has not started yet.', seq);
    const me = room.seats.get(seat)!;
    if (game.state.pending.kind === 'gameOver') return this.error('game-over', 'The game is over.', seq);
    if (seq <= me.lastSeq) return this.error('duplicate', `Action ${seq} was already received.`, seq);
    if (version !== game.version) return this.error('stale', `That action was for version ${version}; the game is at version ${game.version}.`, seq);
    if (action.player !== seat) return this.error('wrong-player', `You play as ${seat}.`, seq);
    const pending = game.state.pending;
    if (action.type !== 'Concede' && (!('player' in pending) || pending.player !== seat)) {
      return this.error('not-your-decision', 'The game is waiting on the other player.', seq);
    }
    const book = game.books[seat];
    const result = applyAction(game.state, resolveAction(action, book));
    if (!result.ok) return this.error('illegal', aliasedError(game.state, result.error, book), seq);
    game.state = result.state;
    game.version++;
    me.lastSeq = seq;
    sendUpdates(this.lobby, room, result.events);
  }

  /** The browser went away. In a game, the other player is told and the room closes. */
  disconnect(): void {
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
