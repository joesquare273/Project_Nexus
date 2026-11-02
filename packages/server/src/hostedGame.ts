// One game hosted on the server for 2-4 seats (P1-P4), each a player or a
// bot: used by Commander tables (tables.ts). The server holds the only real
// GameState; every player gets their own redacted update after each change
// (engine/src/redact.ts) and sends back all-or-nothing batches of actions.
//
// Bots act one action at a time with a short pause while any player is at
// the table, so their turns unfold on the board; once only bots are left in
// the game they play it out in chunks.

import { AliasBook, applyAction, createGame, getLegalActions, playerUpdate, resolveAction, type Action, type GameEvent, type GameSetup, type GameState } from '@nexus/engine';
import type { Bot } from '@nexus/bots';
import type { ErrorCode, Seat, ServerMessage } from './protocol.ts';

export interface HostedGameOptions {
  setup: GameSetup;
  names: Partial<Record<Seat, string>>;
  /** Players' Discord profile pictures, by seat. */
  avatars?: Partial<Record<Seat, string>>;
  bots: Partial<Record<Seat, Bot>>;
  alias: () => string;
  schedule: (fn: () => void, ms: number) => () => void;
  botDelayMs: number;
  /** Most actions bots may take with no player left before the game is called a draw. */
  botGameLimit: number;
  /** Sends a message to the player in `seat` (if they're connected). */
  send: (seat: Seat, message: ServerMessage) => void;
  /** Called once when the game ends. */
  onOver: (state: GameState) => void;
}

const CHUNK = 250;

export class HostedGame {
  readonly seats: Seat[];
  state: GameState;
  version = 0;
  private readonly books: Partial<Record<Seat, AliasBook>> = {};
  private readonly lastSeq: Partial<Record<Seat, number>> = {};
  private cancel: (() => void) | undefined;
  private over = false;
  private botOnlyActions = 0;

  private readonly opts: HostedGameOptions;

  constructor(opts: HostedGameOptions) {
    this.opts = opts;
    const created = createGame(opts.setup);
    this.state = created.state;
    this.seats = opts.setup.players.map((p) => p.id as Seat);
    for (const s of this.seats) {
      this.books[s] = new AliasBook(opts.alias);
      this.lastSeq[s] = 0;
    }
    this.sendAll(created.events);
    this.next();
  }

  /** Seats still in the game that a player (not a bot) holds. */
  private playersIn(): Seat[] {
    return this.seats.filter((s) => !this.opts.bots[s] && !this.state.players[s]?.eliminated);
  }

  /** Sends the game to one player again (after they reconnect). */
  resend(seat: Seat): void {
    this.sendTo(seat, []);
  }

  stop(): void {
    this.cancel?.();
    this.cancel = undefined;
  }

  /** A player's batch of actions, all or nothing. */
  act(seat: Seat, seq: number, version: number, actions: Action[]): { code: ErrorCode; message: string } | null {
    if (this.state.pending.kind === 'gameOver') return { code: 'game-over', message: 'The game is over.' };
    if (seq <= (this.lastSeq[seat] ?? 0)) return { code: 'duplicate', message: `Action ${seq} was already received.` };
    if (version !== this.version) return { code: 'stale', message: `That action was for version ${version}; the game is at version ${this.version}.` };
    if (actions.some((a) => a.player !== seat)) return { code: 'wrong-player', message: `You play as ${seat}.` };
    let state = this.state;
    const events: GameEvent[] = [];
    for (const action of actions) {
      const pending = state.pending;
      if (action.type !== 'Concede' && (!('player' in pending) || pending.player !== seat)) return { code: 'not-your-decision', message: 'The game is waiting on another player.' };
      const r = applyAction(state, resolveAction(action, this.books[seat]!));
      if (!r.ok) return { code: 'illegal', message: r.error };
      state = r.state;
      events.push(...r.events);
    }
    this.state = state;
    this.version++;
    this.lastSeq[seat] = seq;
    this.sendAll(events);
    this.next();
    return null;
  }

  /** What happens next: the game ends, a bot acts, or it waits on a player. */
  private next(): void {
    this.cancel?.();
    this.cancel = undefined;
    const s = this.state;
    if (s.pending.kind === 'gameOver') return this.finish();
    const who = 'player' in s.pending ? (s.pending.player as Seat) : null;
    const bot = who ? this.opts.bots[who] : undefined;
    if (!bot) return;
    // Only bots left: play on quickly in chunks (nobody is watching a turn unfold).
    const quick = this.playersIn().length === 0;
    this.cancel = this.opts.schedule(() => (quick ? this.botChunk() : this.botStep(bot)), quick ? 0 : this.opts.botDelayMs);
  }

  private botStep(bot: Bot): void {
    const r = applyAction(this.state, bot(this.state, getLegalActions(this.state)));
    if (!r.ok) return;
    this.state = r.state;
    this.version++;
    this.sendAll(r.events);
    this.next();
  }

  private botChunk(): void {
    const events: GameEvent[] = [];
    let n = 0;
    while (this.state.pending.kind !== 'gameOver' && n < CHUNK && this.botOnlyActions < this.opts.botGameLimit) {
      const s = this.state;
      const bot = 'player' in s.pending ? this.opts.bots[s.pending.player as Seat] : undefined;
      if (!bot) break;
      const r = applyAction(s, bot(s, getLegalActions(s)));
      if (!r.ok) break;
      this.state = r.state;
      events.push(...r.events);
      n++;
      this.botOnlyActions++;
    }
    this.version++;
    this.sendAll(events);
    if (this.botOnlyActions >= this.opts.botGameLimit || n === 0) return this.finish();
    this.next();
  }

  private finish(): void {
    this.stop();
    if (this.over) return;
    this.over = true;
    this.opts.onOver(this.state);
  }

  private sendAll(events: readonly GameEvent[]): void {
    for (const s of this.seats) this.sendTo(s, events);
  }

  private sendTo(seat: Seat, events: readonly GameEvent[]): void {
    if (this.opts.bots[seat]) return;
    // Every player's aliases follow every change, even while they're away.
    const update = playerUpdate(this.state, seat, this.books[seat]!, events);
    this.opts.send(seat, { type: 'update', version: this.version, seat, names: this.opts.names, ...(this.opts.avatars ? { avatars: this.opts.avatars } : {}), ackSeq: this.lastSeq[seat] ?? 0, update });
  }
}
