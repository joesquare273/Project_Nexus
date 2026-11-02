// Commander tables on the server: a host makes a table for 2-4 seats and
// chooses how many are for players and how many for bots (all players, all
// bots but the host, or a mix). Others join with the table's code. Each
// player brings one of their own saved Commander decks (checked against
// their collection here, user rule 2026-10-30); bots play the Final Fantasy
// precons. When every player seat is taken and has a deck, the host starts
// the game: seats P1-P4, hosted by HostedGame (hostedGame.ts).
//
// Tables live in memory. A seat stays yours while you're away (reload and
// join the same code to come back). A lobby is dropped when its host leaves;
// a finished game an hour after it ends.

import { COMMANDER, seedFromBytes, validateCommander, validateDeck, type GameSetup } from '@nexus/engine';
import { basicAi, type Bot } from '@nexus/bots';
import { CARD_DEFS, FIN_PRECONS, preconDeck } from '@nexus/cards';
import { gameDeck, type GameDeck } from '@nexus/cards/decks';
import type { AccountService, AccountUser } from './accounts.ts';
import { deckProblem } from './collection.ts';
import { HostedGame } from './hostedGame.ts';
import type { ErrorCode, Seat, ServerMessage, TableView } from './protocol.ts';
import type { Action } from '@nexus/engine';

export interface TableConnection {
  send(message: ServerMessage): void;
}

export interface TableHubOptions {
  accounts: AccountService | null;
  randomBytes: (n: number) => Uint8Array;
  alias: () => string;
  schedule?: (fn: () => void, ms: number) => () => void;
  botDelayMs?: number;
  botGameLimit?: number;
}

interface TableSeat {
  id: Seat;
  name: string;
  bot: boolean;
  userId?: string;
  /** The player's chosen deck: its name, its commander's printing, and the game deck. */
  deck: { id: string; name: string; commander: string | null; game: GameDeck } | null;
}

interface Table {
  code: string;
  /** Seats for players (the host included) and for bots. */
  players: number;
  bots: number;
  host: Seat;
  seats: TableSeat[];
  conns: Map<Seat, TableConnection>;
  phase: 'lobby' | 'playing' | 'finished';
  game: HostedGame | null;
  winner: Seat | null;
}

export const SEAT_IDS: Seat[] = ['P1', 'P2', 'P3', 'P4'];
const BOT_NAMES = ['Chocobo Bot', 'Moogle Bot', 'Cactuar Bot'];

type Problem = { error: ErrorCode; message: string };

/** Why `players` player seats and `bots` bot seats isn't a valid table, or null. */
export function tableSizeProblem(players: number, bots: number): string | null {
  if (!Number.isInteger(players) || !Number.isInteger(bots) || players < 1 || bots < 0) return 'A table has at least one player seat.';
  if (players + bots < 2 || players + bots > 4) return 'A table has 2 to 4 seats.';
  return null;
}

export class TableHub {
  readonly tables = new Map<string, Table>();
  private readonly opts: Required<Omit<TableHubOptions, 'accounts'>> & { accounts: AccountService | null };

  constructor(opts: TableHubOptions) {
    this.opts = {
      schedule: (fn, ms) => {
        const t = setTimeout(fn, ms);
        return () => clearTimeout(t);
      },
      botDelayMs: 450,
      botGameLimit: 20_000,
      ...opts,
    };
  }

  private newCode(): string {
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (;;) {
      const code = 'C' + [...this.opts.randomBytes(6)].map((x) => letters[x % letters.length]).join('');
      if (!this.tables.has(code)) return code;
    }
  }

  /** Makes a table and seats its host. */
  create(user: AccountUser, players: number, bots: number, conn: TableConnection): { code: string; seat: Seat } | Problem {
    const problem = tableSizeProblem(players, bots);
    if (problem) return { error: 'event-rule', message: problem };
    const code = this.newCode();
    const t: Table = { code, players, bots, host: 'P1', seats: [{ id: 'P1', name: boardName(user.name), bot: false, userId: user.id, deck: null }], conns: new Map([['P1', conn]]), phase: 'lobby', game: null, winner: null };
    this.tables.set(code, t);
    this.broadcast(t);
    return { code, seat: 'P1' };
  }

  /** Joins a table by code, or comes back to your seat at it. */
  join(user: AccountUser, code: string, conn: TableConnection): { seat: Seat } | Problem {
    const t = this.tables.get(code);
    if (!t) return { error: 'no-event', message: `There is no table ${code}.` };
    const mine = t.seats.find((s) => s.userId === user.id);
    if (mine) {
      t.conns.set(mine.id, conn);
      this.broadcast(t);
      t.game?.resend(mine.id);
      return { seat: mine.id };
    }
    if (t.phase !== 'lobby') return { error: 'already-started', message: `Table ${code} has already started.` };
    if (this.humans(t).length >= t.players) return { error: 'event-full', message: `Table ${code} is full.` };
    let name = boardName(user.name);
    while (t.seats.some((s) => s.name === name)) name = `${name} (2)`;
    const seat: TableSeat = { id: SEAT_IDS.find((id) => !t.seats.some((s) => s.id === id))!, name, bot: false, userId: user.id, deck: null };
    t.seats.push(seat);
    t.conns.set(seat.id, conn);
    this.broadcast(t);
    return { seat: seat.id };
  }

  private humans(t: Table): TableSeat[] {
    return t.seats.filter((s) => !s.bot);
  }

  /** The host changes how many seats are for players and for bots (before the game). */
  settings(code: string, seat: Seat, players: number, bots: number): string | null {
    const t = this.tables.get(code);
    if (!t) return 'There is no such table.';
    if (seat !== t.host) return 'Only the host can change the table.';
    if (t.phase !== 'lobby') return 'The game has already started.';
    const problem = tableSizeProblem(players, bots);
    if (problem) return problem;
    if (players < this.humans(t).length) return `${this.humans(t).length} players are already seated.`;
    t.players = players;
    t.bots = bots;
    this.broadcast(t);
    return null;
  }

  /** A player chooses one of their saved Commander decks for this table. */
  async deck(code: string, seat: Seat, deckId: string): Promise<string | null> {
    const t = this.tables.get(code);
    if (!t) return 'There is no such table.';
    if (t.phase !== 'lobby') return 'The game has already started.';
    const me = t.seats.find((s) => s.id === seat);
    const accounts = this.opts.accounts;
    if (!me?.userId || !accounts) return 'Sign in first.';
    const [decks, owned] = await Promise.all([accounts.decks(me.userId), accounts.collection(me.userId)]);
    const saved = decks.find((d) => d.id === deckId);
    if (!saved) return 'That deck is not one of yours.';
    const problem = commanderDeckProblem(saved, owned);
    if (typeof problem === 'string') return problem;
    if (this.tables.get(code) !== t || t.phase !== 'lobby') return 'The game has already started.';
    me.deck = { id: saved.id, name: saved.name, commander: saved.commander, game: problem };
    this.broadcast(t);
    return null;
  }

  /** The host starts the game once every player seat is taken and has a deck. */
  start(code: string, seat: Seat): string | null {
    const t = this.tables.get(code);
    if (!t) return 'There is no such table.';
    if (seat !== t.host) return 'Only the host can start the game.';
    if (t.phase !== 'lobby') return 'The game has already started.';
    const humans = this.humans(t);
    if (humans.length < t.players) return `Waiting for ${t.players - humans.length} more player${t.players - humans.length === 1 ? '' : 's'} to join.`;
    const without = humans.find((s) => !s.deck);
    if (without) return `${without.name} hasn't chosen a deck yet.`;
    // Bots take the free seats and play the precons, a different one each.
    for (let i = 0; i < t.bots; i++) t.seats.push({ id: SEAT_IDS.find((id) => !t.seats.some((s) => s.id === id))!, name: BOT_NAMES[i]!, bot: true, deck: null });
    t.seats.sort((a, b) => SEAT_IDS.indexOf(a.id) - SEAT_IDS.indexOf(b.id));
    const bots: Partial<Record<Seat, Bot>> = {};
    const botSeed = this.opts.randomBytes(1)[0]!;
    const setup: GameSetup = {
      format: COMMANDER,
      cardDefs: CARD_DEFS,
      // 128 bits from crypto.randomBytes: never Math.random (see docs/decisions.md).
      seed: seedFromBytes(this.opts.randomBytes(16)),
      mulligans: true,
      players: t.seats.map((s, i) => {
        if (s.bot) {
          bots[s.id] = basicAi(botSeed + i);
          return { id: s.id, ...preconDeck(FIN_PRECONS[BOT_NAMES.indexOf(s.name) % FIN_PRECONS.length]!.name) };
        }
        return { id: s.id, ...s.deck!.game };
      }),
    };
    t.phase = 'playing';
    this.broadcast(t);
    try {
      t.game = new HostedGame({
        setup,
        names: Object.fromEntries(t.seats.map((s) => [s.id, s.name])),
        bots,
        alias: this.opts.alias,
        schedule: this.opts.schedule,
        botDelayMs: this.opts.botDelayMs,
        botGameLimit: this.opts.botGameLimit,
        send: (s, m) => t.conns.get(s)?.send(m),
        onOver: (state) => {
          const alive = state.turnOrder.filter((p) => !state.players[p]!.eliminated);
          t.winner = alive.length === 1 ? (alive[0] as Seat) : null;
          t.phase = 'finished';
          this.broadcast(t);
          this.opts.schedule(() => this.tables.get(code) === t && this.end(t), 60 * 60_000);
        },
      });
    } catch (e) {
      t.phase = 'lobby';
      t.seats = t.seats.filter((s) => !s.bot);
      this.broadcast(t);
      return e instanceof Error ? e.message : String(e);
    }
    return null;
  }

  act(code: string, seat: Seat, seq: number, version: number, actions: Action[]): Problem | null {
    const t = this.tables.get(code);
    if (!t) return { error: 'no-event', message: 'There is no such table.' };
    if (!t.game) return { error: 'not-started', message: 'The game has not started yet.' };
    const p = t.game.act(seat, seq, version, actions);
    return p ? { error: p.code, message: p.message } : null;
  }

  /** A player's connection went away. In the lobby their seat opens up again; in a game it stays theirs. */
  detach(code: string, seat: Seat, conn: TableConnection): void {
    const t = this.tables.get(code);
    if (!t || t.conns.get(seat) !== conn) return;
    t.conns.delete(seat);
    if (t.phase === 'lobby') {
      if (seat === t.host) return this.end(t);
      t.seats = t.seats.filter((s) => s.id !== seat);
    }
    if (t.conns.size === 0 && t.phase === 'finished') return this.end(t);
    this.broadcast(t);
  }

  /** Leave a table's lobby (the host closes it). In a game, concede instead. */
  leave(code: string, seat: Seat): string | null {
    const t = this.tables.get(code);
    if (!t) return 'There is no such table.';
    if (t.phase === 'playing') return 'The game is on: concede to leave it.';
    t.conns.delete(seat);
    if (t.phase === 'lobby') {
      if (seat === t.host) {
        this.end(t);
        return null;
      }
      t.seats = t.seats.filter((s) => s.id !== seat);
    }
    this.broadcast(t);
    return null;
  }

  private end(t: Table): void {
    t.game?.stop();
    for (const c of t.conns.values()) c.send({ type: 'tableClosed', code: t.code });
    this.tables.delete(t.code);
  }

  private broadcast(t: Table): void {
    for (const [seat, conn] of t.conns) conn.send({ type: 'table', table: this.view(t, seat) });
  }

  view(t: Table, seat: Seat): TableView {
    return {
      code: t.code,
      format: 'commander',
      players: t.players,
      bots: t.bots,
      host: t.host,
      you: seat,
      phase: t.phase,
      seats: t.seats.map((s) => ({ id: s.id, name: s.name, bot: s.bot, connected: s.bot || t.conns.has(s.id), deck: s.deck ? { name: s.deck.name, commander: s.deck.commander } : null })),
      winner: t.winner,
    };
  }
}

/** The board calls you "You", so nobody may be called that. */
function boardName(name: string): string {
  return name.toLowerCase() === 'you' ? `${name}.` : name;
}

/** A saved deck as a legal Commander game deck, or why it can't be played. */
export function commanderDeckProblem(
  saved: Parameters<typeof gameDeck>[0] & { format: string; name: string },
  owned: Parameters<typeof deckProblem>[1],
): GameDeck | string {
  if (saved.format !== 'commander' || !saved.commander) return 'Choose a Commander deck (with a commander).';
  const owns = deckProblem({ ...saved, format: 'commander' } as never, owned);
  if (owns) return owns;
  const game = gameDeck(saved);
  if ('problem' in game) return game.problem;
  if (!game.commander) return 'The deck has no commander.';
  const full = [...game.deck, game.commander];
  const errors = [...validateDeck(full, CARD_DEFS, COMMANDER), ...validateCommander(full, game.commander, CARD_DEFS)];
  if (errors.length) return `${saved.name} isn't a legal Commander deck: ${errors[0]}`;
  return game;
}
