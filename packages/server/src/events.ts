// Draft events on the server (docs/sealed.md, S3b): the event rules in
// draftEvent.ts, with connections, bots and games around them.
//
// - Each event lives in memory. Players create or join one by code with their
//   sign-in, and can come back to it after a reload (same account).
// - Everyone gets their own view after every change (their pack, picks and
//   deck only).
// - Bot seats draft and build at once, and play their games here, one action
//   at a time with a short pause so their turns unfold on the player's board.
//   Bot-vs-bot games are played in small chunks so the server stays responsive.
// - Each game is an ordinary engine game with seats P1 and P2 (the browser
//   plays it like any online game), redacted per player.
// - When the draft ends, each player's 84 cards are added to their
//   collection (once per event).

import { AliasBook, applyAction, createGame, getLegalActions, playerUpdate, resolveAction, seedFromBytes, type Action, type GameEvent, type GameState } from '@nexus/engine';
import { basicAi, type Bot } from '@nexus/bots';
import type { LimitedDeck } from '@nexus/cards/limited';
import { draftSet, type DraftSetCode } from '@nexus/cards/draft';
import type { AccountService } from './accounts.ts';
import {
  botMatch,
  changeSeats,
  choosePlayDraw,
  seatsProblem,
  createEvent,
  currentMatch,
  eventDraftView,
  eventStandings,
  expirePicks,
  selectCard,
  gameSetup,
  gameWinner,
  joinEvent,
  leaveEvent,
  pick,
  pool,
  recordGame,
  setReady,
  startDraft,
  submitDeck,
  tick,
  type DraftEvent,
  type EventMatch,
} from './draftEvent.ts';
import type { ErrorCode, EventView, ServerMessage } from './protocol.ts';

/** Event games are duels: seats P1 and P2. */
type Seat = 'P1' | 'P2';

export interface EventConnection {
  send(message: ServerMessage): void;
}

export interface EventHubOptions {
  accounts: AccountService | null;
  randomBytes: (n: number) => Uint8Array;
  alias: () => string;
  /** The clock (tests move it). */
  now?: () => number;
  /** Runs `fn` after `ms`; returns a function that cancels it (tests run things at once). */
  schedule?: (fn: () => void, ms: number) => () => void;
  /** Pause before each bot action in a game with a player, so it can be followed (ms). */
  botDelayMs?: number;
  /** Most actions in a bot-vs-bot game before it's called a draw. */
  botGameLimit?: number;
}

/** A game being played for an event match: always seats P1 (`a`) and P2 (`b`). */
interface HostedGame {
  match: string;
  /** Which event seat plays P1 and P2. */
  seats: Record<Seat, string>;
  state: GameState;
  version: number;
  books: Record<Seat, AliasBook>;
  lastSeq: Record<Seat, number>;
  bots: Partial<Record<Seat, Bot>>;
  number: number;
  cancel?: () => void;
}

interface Hosted {
  id: string;
  ev: DraftEvent;
  host: string;
  conns: Map<string, EventConnection>;
  games: Map<string, HostedGame>;
  poolSaved: Set<string>;
  buildTimer?: () => void;
  pickTimer?: () => void;
  /** The pick the pick timer is running for. */
  pickTimerFor?: number;
}

const SEATS: Seat[] = ['P1', 'P2'];
const BOT_GAME_CHUNK = 250;
const BOT_GAME_LIMIT = 6000;

export class EventHub {
  readonly events = new Map<string, Hosted>();
  private readonly opts: Required<Omit<EventHubOptions, 'accounts'>> & { accounts: AccountService | null };

  constructor(opts: EventHubOptions) {
    this.opts = {
      now: () => Date.now(),
      schedule: (fn, ms) => {
        const t = setTimeout(fn, ms);
        return () => clearTimeout(t);
      },
      botDelayMs: 450,
      botGameLimit: BOT_GAME_LIMIT,
      ...opts,
    };
  }

  /** A random number in [0, 1) from crypto bytes (pairings, play/draw). */
  private random = (): number => {
    const b = this.opts.randomBytes(6);
    return (b[0]! * 2 ** 40 + b[1]! * 2 ** 32 + b[2]! * 2 ** 24 + b[3]! * 2 ** 16 + b[4]! * 2 ** 8 + b[5]!) / 2 ** 48;
  };

  private newCode(): string {
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (;;) {
      const b = this.opts.randomBytes(6);
      const code = 'D' + [...b].map((x) => letters[x % letters.length]).join('');
      if (!this.events.has(code)) return code;
    }
  }

  /** Makes an event and seats its creator. */
  create(user: { id: string; name: string }, seats: { players: number; bots: number; set: DraftSetCode }, conn: EventConnection): { code: string; seat: string } | { error: ErrorCode; message: string } {
    const problem = seatsProblem(seats.players, seats.bots);
    if (problem) return { error: 'event-rule', message: problem };
    const code = this.newCode();
    const ev = createEvent(code, seats, { name: user.name, userId: user.id });
    const seat = ev.seats[0]!.id;
    const hosted: Hosted = { id: [...this.opts.randomBytes(8)].map((x) => x.toString(16).padStart(2, '0')).join(''), ev, host: seat, conns: new Map([[seat, conn]]), games: new Map(), poolSaved: new Set() };
    this.events.set(code, hosted);
    this.broadcast(hosted);
    return { code, seat };
  }

  /** Joins an event, or reconnects to your seat in it. */
  join(user: { id: string; name: string }, code: string, conn: EventConnection): { seat: string } | { error: ErrorCode; message: string } {
    const h = this.events.get(code);
    if (!h) return { error: 'no-event', message: `There is no draft event ${code}.` };
    const mine = h.ev.seats.find((s) => s.userId === user.id);
    if (mine) {
      h.conns.set(mine.id, conn);
      this.broadcast(h);
      // Back in a game: send it again.
      for (const g of h.games.values()) if (Object.values(g.seats).includes(mine.id)) this.sendGame(h, g, []);
      return { seat: mine.id };
    }
    const seat = joinEvent(h.ev, { name: user.name, userId: user.id });
    if (!seat) return { error: 'event-full', message: h.ev.phase === 'lobby' ? `Event ${code} is full.` : `Event ${code} has already started.` };
    h.conns.set(seat.id, conn);
    this.broadcast(h);
    return { seat: seat.id };
  }

  /** A player's connection went away; their seat stays theirs. */
  detach(code: string, seat: string, conn: EventConnection): void {
    const h = this.events.get(code);
    if (!h || h.conns.get(seat) !== conn) return;
    h.conns.delete(seat);
    if (h.ev.phase === 'lobby') {
      const userId = h.ev.seats.find((s) => s.id === seat)?.userId;
      if (userId && seat !== h.host) leaveEvent(h.ev, userId);
    }
    if (h.conns.size === 0 && h.ev.phase === 'lobby') this.end(h);
    else this.broadcast(h);
  }

  leave(code: string, seat: string): string | null {
    const h = this.events.get(code);
    if (!h) return 'There is no such event.';
    if (h.ev.phase !== 'lobby') return 'The event has started; you keep your seat.';
    const userId = h.ev.seats.find((s) => s.id === seat)?.userId;
    h.conns.delete(seat);
    if (seat === h.host) {
      this.end(h);
      return null;
    }
    if (userId) leaveEvent(h.ev, userId);
    this.broadcast(h);
    return null;
  }

  private end(h: Hosted): void {
    h.buildTimer?.();
    h.pickTimer?.();
    for (const g of h.games.values()) g.cancel?.();
    this.events.delete(h.ev.code);
  }

  /** Runs a change to the event's rules; a broken rule is reported to the player, not thrown. */
  private change(code: string, work: (h: Hosted) => DraftEvent): string | null {
    const h = this.events.get(code);
    if (!h) return 'There is no such event.';
    try {
      h.ev = work(h);
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
    this.afterChange(h);
    return null;
  }

  settings(code: string, seat: string, players: number, bots: number, set?: DraftSetCode): string | null {
    return this.change(code, (h) => {
      if (seat !== h.host) throw new Error('Only the player who made the event can change it.');
      return changeSeats(h.ev, players, bots, set);
    });
  }

  start(code: string, seat: string): string | null {
    return this.change(code, (h) => {
      if (seat !== h.host) throw new Error('Only the player who made the event can start it.');
      return startDraft(h.ev, seedFromBytes(this.opts.randomBytes(16)), this.opts.now());
    });
  }

  select(code: string, seat: string, uid: string): string | null {
    return this.change(code, (h) => selectCard(h.ev, seat, uid));
  }

  pick(code: string, seat: string, uid: string): string | null {
    return this.change(code, (h) => pick(h.ev, seat, uid, this.opts.now()));
  }

  deck(code: string, seat: string, deck: LimitedDeck): string | null {
    return this.change(code, (h) => {
      if (h.ev.phase === 'playing' && [...h.games.values()].some((g) => Object.values(g.seats).includes(seat))) throw new Error('Wait until this game is over to change your deck.');
      return submitDeck(h.ev, seat, deck);
    });
  }

  ready(code: string, seat: string, ready: boolean): string | null {
    return this.change(code, (h) => setReady(h.ev, seat, ready, this.opts.now(), this.random));
  }

  playDraw(code: string, seat: string, play: boolean): string | null {
    return this.change(code, (h) => {
      const m = currentMatch(h.ev, seat);
      if (!m) throw new Error('You have no match now.');
      return choosePlayDraw(h.ev, m.id, seat, play);
    });
  }

  /** What follows any change: save pools, keep the deckbuilding clock, start games, tell everyone. */
  private afterChange(h: Hosted): void {
    const ev = h.ev;
    if (ev.phase !== 'lobby' && ev.phase !== 'drafting') void this.savePools(h);
    // The pick clock: one timer for the current pick; a new pick replaces it.
    if (ev.phase === 'drafting' && ev.pickEndsAt !== null && h.pickTimerFor !== ev.pickClock) {
      h.pickTimer?.();
      h.pickTimerFor = ev.pickClock;
      h.pickTimer = this.opts.schedule(() => {
        h.pickTimer = undefined;
        this.change(ev.code, (x) => expirePicks(x.ev, this.opts.now()));
      }, Math.max(0, ev.pickEndsAt - this.opts.now()));
    }
    if ((ev.phase !== 'drafting' || ev.pickEndsAt === null) && h.pickTimer) {
      h.pickTimer();
      h.pickTimer = undefined;
      h.pickTimerFor = undefined;
    }
    if (ev.phase === 'building' && !h.buildTimer && ev.buildEndsAt) {
      h.buildTimer = this.opts.schedule(() => {
        h.buildTimer = undefined;
        this.change(ev.code, (x) => tick(x.ev, this.opts.now(), this.random));
      }, Math.max(0, ev.buildEndsAt - this.opts.now()));
    }
    if (ev.phase !== 'building' && h.buildTimer) {
      h.buildTimer();
      h.buildTimer = undefined;
    }
    if (ev.phase === 'playing') for (const m of ev.matches) if (m.round === ev.round && !m.done && m.nextFirst && !h.games.has(m.id)) this.startGame(h, m);
    if (ev.phase === 'finished') this.opts.schedule(() => this.events.get(ev.code) === h && this.end(h), 60 * 60_000);
    this.broadcast(h);
  }

  /** Adds each player's drafted cards to their collection, once per event. */
  private async savePools(h: Hosted): Promise<void> {
    const accounts = this.opts.accounts;
    if (!accounts) return;
    for (const s of h.ev.seats) {
      if (s.bot || !s.userId || h.poolSaved.has(s.id)) continue;
      h.poolSaved.add(s.id);
      const counts = new Map<string, { id: string; finish: 'nonfoil' | 'foil' | 'surge'; count: number }>();
      for (const c of pool(h.ev, s.id)) {
        const key = `${c.card.id}|${c.finish}`;
        const e = counts.get(key) ?? { id: c.card.id, finish: c.finish, count: 0 };
        e.count++;
        counts.set(key, e);
      }
      try {
        // The account exists before cards are added (a brand-new player may not have loaded it yet).
        await accounts.ensure({ id: s.userId, name: s.name });
        await accounts.grantCards(s.userId, { kind: 'draft', ref: `draft-${h.id}-${s.id}`, cost: 0, cards: [...counts.values()] });
      } catch {
        // Try again after the next change.
        h.poolSaved.delete(s.id);
      }
    }
    this.broadcast(h);
  }

  private startGame(h: Hosted, m: EventMatch): void {
    const setup = gameSetup(h.ev, m.id, seedFromBytes(this.opts.randomBytes(16)));
    const seats = { P1: m.a, P2: m.b! } as Record<Seat, string>;
    const toGame = (x: string) => (x === seats.P1 ? 'P1' : 'P2');
    setup.players = setup.players.map((p) => ({ ...p, id: toGame(p.id) }));
    if (setup.firstPlayer) setup.firstPlayer = toGame(setup.firstPlayer);
    const created = createGame(setup);
    const isBot = (seat: string) => !!h.ev.seats.find((s) => s.id === seat)?.bot;
    const botSeed = this.opts.randomBytes(1)[0]!;
    const game: HostedGame = {
      match: m.id,
      seats,
      state: created.state,
      version: 0,
      books: { P1: new AliasBook(this.opts.alias), P2: new AliasBook(this.opts.alias) },
      lastSeq: { P1: 0, P2: 0 },
      bots: Object.fromEntries(SEATS.filter((p) => isBot(seats[p])).map((p) => [p, basicAi(botSeed + (p === 'P1' ? 0 : 1))])),
      number: m.games.length + 1,
    };
    h.games.set(m.id, game);
    if (botMatch(h.ev, m)) this.runBotGame(h, game);
    else {
      this.sendGame(h, game, created.events);
      this.botTurn(h, game);
    }
  }

  /** Two bots: play the whole game in chunks between other work. */
  private runBotGame(h: Hosted, g: HostedGame, played = 0): void {
    let n = 0;
    while (g.state.pending.kind !== 'gameOver' && n < BOT_GAME_CHUNK && played + n < this.opts.botGameLimit) {
      const s = g.state;
      if (!('player' in s.pending)) break;
      const bot = g.bots[s.pending.player as Seat]!;
      const r = applyAction(s, bot(s, getLegalActions(s)));
      if (!r.ok) break;
      g.state = r.state;
      n++;
    }
    if (g.state.pending.kind === 'gameOver' || played + n >= this.opts.botGameLimit || n === 0) return this.finishGame(h, g);
    g.cancel = this.opts.schedule(() => this.runBotGame(h, g, played + n), 0);
  }

  /** In a game with a player: the bot acts after a short pause, one action at a time. */
  private botTurn(h: Hosted, g: HostedGame): void {
    g.cancel?.();
    const s = g.state;
    if (s.pending.kind === 'gameOver') return this.finishGame(h, g);
    const who = 'player' in s.pending ? (s.pending.player as Seat) : null;
    const bot = who ? g.bots[who] : undefined;
    if (!bot) return;
    g.cancel = this.opts.schedule(() => {
      const r = applyAction(g.state, bot(g.state, getLegalActions(g.state)));
      if (!r.ok) return;
      g.state = r.state;
      g.version++;
      this.sendGame(h, g, r.events);
      this.botTurn(h, g);
    }, this.opts.botDelayMs);
  }

  /** A player's moves in their event game, all or nothing, like an online room. */
  act(code: string, seat: string, seq: number, version: number, actions: Action[]): { code: ErrorCode; message: string } | null {
    const h = this.events.get(code);
    if (!h) return { code: 'no-event', message: 'There is no such event.' };
    const g = [...h.games.values()].find((x) => Object.values(x.seats).includes(seat));
    if (!g) return { code: 'not-started', message: 'You have no game in progress.' };
    const me: Seat = g.seats.P1 === seat ? 'P1' : 'P2';
    if (g.state.pending.kind === 'gameOver') return { code: 'game-over', message: 'The game is over.' };
    if (seq <= g.lastSeq[me]) return { code: 'duplicate', message: `Action ${seq} was already received.` };
    if (version !== g.version) return { code: 'stale', message: `That action was for version ${version}; the game is at version ${g.version}.` };
    if (actions.some((a) => a.player !== me)) return { code: 'wrong-player', message: `You play as ${me}.` };
    let state = g.state;
    const events: GameEvent[] = [];
    for (const action of actions) {
      const pending = state.pending;
      if (action.type !== 'Concede' && (!('player' in pending) || pending.player !== me)) return { code: 'not-your-decision', message: 'The game is waiting on the other player.' };
      const r = applyAction(state, resolveAction(action, g.books[me]));
      if (!r.ok) return { code: 'illegal', message: r.error };
      state = r.state;
      events.push(...r.events);
    }
    g.state = state;
    g.version++;
    g.lastSeq[me] = seq;
    this.sendGame(h, g, events);
    if (state.pending.kind === 'gameOver') this.finishGame(h, g);
    else this.botTurn(h, g);
    return null;
  }

  /** A game ended: record it in the match and move the event on. */
  private finishGame(h: Hosted, g: HostedGame): void {
    g.cancel?.();
    if (h.games.get(g.match) !== g) return;
    h.games.delete(g.match);
    const winner = gameWinner(g.state);
    this.change(h.ev.code, (x) => recordGame(x.ev, g.match, winner ? g.seats[winner as Seat] : null, this.random));
  }

  /** Each player in the game gets their own update. */
  private sendGame(h: Hosted, g: HostedGame, events: readonly GameEvent[]): void {
    const names = { P1: this.nameOf(h, g.seats.P1), P2: this.nameOf(h, g.seats.P2) };
    for (const p of SEATS) {
      const update = playerUpdate(g.state, p, g.books[p], events);
      const conn = h.conns.get(g.seats[p]);
      if (!g.bots[p] && conn) conn.send({ type: 'update', version: g.version, seat: p, names, ackSeq: g.lastSeq[p], update, match: g.match, game: g.number });
    }
  }

  private nameOf(h: Hosted, seat: string): string {
    return h.ev.seats.find((s) => s.id === seat)?.name ?? seat;
  }

  /** Everyone's own view of the event. */
  private broadcast(h: Hosted): void {
    for (const [seat, conn] of h.conns) conn.send({ type: 'event', event: this.view(h, seat) });
  }

  view(h: Hosted, seat: string): EventView {
    const ev = h.ev;
    const draft = ev.draft;
    return {
      code: ev.code,
      size: ev.size,
      players: ev.players,
      bots: ev.size - ev.players,
      set: { code: ev.set, name: draftSet(ev.set)?.name ?? ev.set },
      phase: ev.phase,
      you: seat,
      host: h.host,
      seats: ev.seats.map((s) => ({ id: s.id, name: s.name, bot: s.bot, connected: s.bot || h.conns.has(s.id), ready: !!ev.ready[s.id], picks: draft?.picks[s.id]?.length ?? 0 })),
      draft: eventDraftView(ev, seat),
      deck: ev.decks[seat] ?? null,
      buildEndsAt: ev.buildEndsAt,
      pickEndsAt: ev.pickEndsAt,
      selected: ev.selected[seat] ?? null,
      serverNow: this.opts.now(),
      rounds: ev.rounds,
      round: ev.round,
      matches: ev.matches.map((m) => ({ id: m.id, round: m.round, a: m.a, b: m.b, games: m.games, chooser: m.done ? null : m.nextFirst ? null : m.chooser, nextFirst: m.nextFirst, done: m.done, live: h.games.has(m.id) })),
      standings: eventStandings(ev).map((s) => ({ player: s.player, points: s.points, wins: s.wins, losses: s.losses, draws: s.draws })),
      poolSaved: h.poolSaved.has(seat),
    };
  }
}
