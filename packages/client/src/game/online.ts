// Online games: the same board, fed by the game server instead of a local
// engine. The server sends this player's redacted state, legal actions and
// events (engine/src/redact.ts); the board reads them exactly as it reads a
// local game. Moves go back as all-or-nothing batches of actions.
//
// The board calls you "You". The server calls players by seat (P1, P2), so
// incoming data renames your seat to "You" and the other seat to their guest
// name, and outgoing actions rename them back, only in player fields.

import { materialize, type Action } from '@nexus/engine';
import { CARD_DEFS } from '@nexus/cards';
import type { ClientMessage, Deck, Seat, ServerMessage } from '@nexus/server/protocol';
import { GameSession, YOU, applyAll, readable, touchedCards, type Advance } from './session.ts';
import { eventTargetNotices } from './targeting.ts';

type Update = Extract<ServerMessage, { type: 'update' }>;

/** The WebSocket to the game server, at /ws on the page's own host (Vite forwards it in development). */
export class OnlineConnection {
  private readonly ws: WebSocket;
  private listener: (m: ServerMessage) => void = () => {};
  /** Called once if the connection drops. */
  onClose: () => void = () => {};
  private readonly queue: string[] = [];

  constructor(url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`) {
    this.ws = new WebSocket(url);
    this.ws.onopen = () => {
      for (const m of this.queue.splice(0)) this.ws.send(m);
    };
    this.ws.onmessage = (e) => {
      try {
        this.listener(JSON.parse(String(e.data)) as ServerMessage);
      } catch {
        // A message we can't read is ignored.
      }
    };
    this.ws.onclose = () => this.onClose();
  }

  /** Who hears the server's messages (the menu, then the game). */
  listen(listener: (m: ServerMessage) => void): void {
    this.listener = listener;
  }

  send(m: ClientMessage): void {
    const text = JSON.stringify(m);
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(text);
    else this.queue.push(text);
  }

  close(): void {
    this.onClose = () => {};
    this.ws.close();
  }
}

/** Fields of an Action that hold player ids. */
const PLAYER_FIELDS = new Set(['player', 'opponent', 'defender']);

export class OnlineSession extends GameSession {
  readonly seat: Seat;
  readonly opponentSeat: Seat;
  readonly opponentName: string;
  /** The game version the server last sent. */
  private version: number;
  private serverLegal: Action[];
  private seq = 0;
  /** A batch is on its way and hasn't been answered yet. */
  private waiting = false;
  private readonly listeners = new Set<(error?: string) => void>();
  private readonly connection: OnlineConnection;

  constructor(connection: OnlineConnection, first: Update, deck: Deck) {
    const seat = first.seat;
    const opponentSeat: Seat = seat === 'P1' ? 'P2' : 'P1';
    const opponentName = first.names[opponentSeat];
    const update = renameIncoming(first.update, seat, opponentSeat, opponentName);
    super({ deck, opponents: 1, seed: 0, bot: 'ai' }, { state: materialize(update.state, CARD_DEFS), bots: {}, opponents: [opponentName] });
    this.seat = seat;
    this.opponentSeat = opponentSeat;
    this.opponentName = opponentName;
    this.version = first.version;
    this.serverLegal = update.legal;
    this.connection = connection;
    this.narrate(update.events);
    connection.listen((m) => this.receive(m));
    connection.onClose = () => this.notify('The connection to the game server was lost.');
  }

  /** The server's legal actions: it's the authority on what you may do. */
  override legal(): Action[] {
    return this.serverLegal;
  }

  /** Checks the move against your copy of the game (for quick feedback), then sends it. The server decides. */
  override canSubmit(actions: Action[]): boolean {
    return !this.waiting && super.canSubmit(actions);
  }

  override submit(actions: Action[]): string | null {
    if (this.waiting) return 'Waiting for the server…';
    const tried = applyAll(this.state, actions);
    if ('error' in tried) return readable(this.state, tried.error);
    this.send(actions);
    return null;
  }

  /** Your automatic passes and "no blocks" are sent to the server; otherwise the game waits on you or the other player. */
  override advance(): Advance {
    const s = this.state;
    if (s.pending.kind === 'gameOver') return 'over';
    if (this.waiting || s.pending.player !== YOU) return 'you';
    if (this.holdPriority && s.pending.kind === 'priority') return 'you';
    const action = this.automaticAction();
    if (action) this.send([action]);
    return 'you';
  }

  override subscribe(listener: (error?: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  override close(): void {
    this.connection.close();
  }

  private send(actions: Action[]): void {
    this.waiting = true;
    this.seq++;
    const out = actions.map((a) => renameOutgoing(a, this.seat, this.opponentSeat, this.opponentName));
    this.connection.send({ type: 'actions', seq: this.seq, version: this.version, actions: out as never });
  }

  private receive(m: ServerMessage): void {
    if (m.type === 'update') {
      const update = renameIncoming(m.update, this.seat, this.opponentSeat, this.opponentName);
      const before = this.state;
      this.state = materialize(update.state, CARD_DEFS);
      this.version = m.version;
      this.serverLegal = update.legal;
      if (m.ackSeq >= this.seq) this.waiting = false;
      const notices = eventTargetNotices(this.state, update.events);
      this.targetHistory.unshift(...notices.reverse());
      this.targetHistory.splice(8);
      // Highlight what the other player just did.
      this.recent = before.pending.kind !== 'gameOver' && before.pending.player !== YOU ? touchedCards(update.events) : new Set();
      this.narrate(update.events);
      this.notify();
    } else if (m.type === 'error') {
      this.waiting = false;
      this.notify(m.message);
    } else if (m.type === 'opponentLeft') {
      this.push(`${m.name} left the game.`);
      this.notify(`${m.name} left the game.`);
    }
  }

  private notify(error?: string): void {
    for (const l of this.listeners) l(error);
  }
}

/** Server data as the board expects it: your seat becomes "You", the other seat their name. */
function renameIncoming<T>(value: T, seat: Seat, opponentSeat: Seat, opponentName: string): T {
  const name = (x: string) => (x === seat ? YOU : x === opponentSeat ? opponentName : x);
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return name(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [name(k), walk(x)]));
    return v;
  };
  return walk(value) as T;
}

/** An action as the server expects it: player fields name seats. */
function renameOutgoing(action: Action, seat: Seat, opponentSeat: Seat, opponentName: string): Action {
  const seatOf = (x: unknown) => (x === YOU ? seat : x === opponentName ? opponentSeat : x);
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, PLAYER_FIELDS.has(k) ? seatOf(x) : walk(x)]));
    return v;
  };
  return walk(action) as Action;
}


