// A draft event, run by the server (docs/sealed.md, step S3): 2-4 seats,
// each a player or a bot. The booster draft (cards/src/draft.ts), 20 minutes
// of deckbuilding, then Swiss rounds of best-of-3 matches and standings.
//
// This module is the event's rules only, as plain JSON state and pure-ish
// functions (time and randomness are passed in), so the network layer and the
// tests drive it the same way. Games themselves are played elsewhere: the
// event says which game comes next and records who won it. Bots draft, build
// and choose play/draw here; bot-vs-bot games are played out with
// `playBotGame`.

import { LIMITED, type GameSetup, type GameState, type PlayerId, type Seed } from '@nexus/engine';
import { CARD_DEFS } from '@nexus/cards';
import { finishLook } from '@nexus/cards/boosters';
import { aiPick, createDraft, defIdOf, draftView, lockPick, pickProblem, type DraftCard, type DraftState, type DraftView } from '@nexus/cards/draft';
import { aiDeck, BASIC_LANDS, COLORS, DECKBUILDING_MINUTES, deckProblem, deckSize, MIN_DECK_SIZE, suggestBasics, type LimitedDeck } from '@nexus/cards/limited';
import { basicAi, playGame } from '@nexus/bots';
import { matchWinner, pairRound, roundsFor, standings, type MatchResult, type Standing } from './swiss.ts';

export interface EventSeat {
  /** S1-S4: the seat's id, also its engine player id in games. */
  id: string;
  name: string;
  bot: boolean;
  /** The player's account (players only). */
  userId?: string;
}

export type EventPhase = 'lobby' | 'drafting' | 'building' | 'playing' | 'finished';

export interface EventGame {
  /** The game's winner, or null for a drawn game. */
  winner: string | null;
  /** Who took the first turn. */
  first: string;
}

export interface EventMatch {
  id: string;
  round: number;
  a: string;
  /** null: a bye (a match win for `a`). */
  b: string | null;
  games: EventGame[];
  /**
   * Who decides whether to play or draw the next game: nobody for game 1
   * (random), then the loser of the last game (rule 103.1).
   */
  chooser: string | null;
  /** The next game's first player, once known. */
  nextFirst: string | null;
  done: boolean;
}

export interface DraftEvent {
  code: string;
  /** Seats the event is for (2-4). */
  size: number;
  seats: EventSeat[];
  phase: EventPhase;
  draft: DraftState | null;
  decks: Record<string, LimitedDeck | null>;
  /** Pressed Ready in deckbuilding (bots always are). */
  ready: Record<string, boolean>;
  /** When deckbuilding ends (ms since the epoch). */
  buildEndsAt: number | null;
  rounds: number;
  /** The round being played, 1-based (0 before play). */
  round: number;
  matches: EventMatch[];
}

export const MAX_SEATS = 4;
const SEAT_IDS = ['S1', 'S2', 'S3', 'S4'];
const BOT_NAMES = ['Chocobo Bot', 'Moogle Bot', 'Cactuar Bot'];

/** A new event with its first seat (the player who made it). */
export function createEvent(code: string, size: number, host: { name: string; userId: string }): DraftEvent {
  if (!Number.isInteger(size) || size < 2 || size > MAX_SEATS) throw new Error('A draft event is for 2 to 4 players.');
  return {
    code,
    size,
    seats: [{ id: SEAT_IDS[0]!, name: host.name, bot: false, userId: host.userId }],
    phase: 'lobby',
    draft: null,
    decks: {},
    ready: {},
    buildEndsAt: null,
    rounds: roundsFor(size),
    round: 0,
    matches: [],
  };
}

/** Seats another player; null if the event is full or under way. */
export function joinEvent(ev: DraftEvent, player: { name: string; userId: string }): EventSeat | null {
  if (ev.phase !== 'lobby' || ev.seats.length >= ev.size) return null;
  if (ev.seats.some((s) => s.userId === player.userId)) return null;
  const taken = new Set(ev.seats.map((s) => s.name));
  const name = taken.has(player.name) ? `${player.name} (2)` : player.name;
  const seat: EventSeat = { id: SEAT_IDS.find((id) => !ev.seats.some((s) => s.id === id))!, name, bot: false, userId: player.userId };
  ev.seats.push(seat);
  return seat;
}

/** A player leaves the lobby (before the draft). */
export function leaveEvent(ev: DraftEvent, userId: string): void {
  if (ev.phase === 'lobby') ev.seats = ev.seats.filter((s) => s.userId !== userId);
}

/** Starts the draft, filling empty seats with bots. Returns the new state. */
export function startDraft(prev: DraftEvent, seed: Seed): DraftEvent {
  if (prev.phase !== 'lobby') throw new Error('The draft has already started.');
  const ev = structuredClone(prev);
  let bots = 0;
  while (ev.seats.length < ev.size) {
    const id = SEAT_IDS.find((x) => !ev.seats.some((s) => s.id === x))!;
    ev.seats.push({ id, name: BOT_NAMES[bots++ % BOT_NAMES.length]!, bot: true });
  }
  ev.seats.sort((a, b) => SEAT_IDS.indexOf(a.id) - SEAT_IDS.indexOf(b.id));
  ev.draft = botsPick(ev, createDraft(ev.seats.map((s) => s.id), seed));
  ev.phase = 'drafting';
  for (const s of ev.seats) {
    ev.decks[s.id] = null;
    ev.ready[s.id] = false;
  }
  return ev;
}

const isBot = (ev: DraftEvent, seat: string) => !!ev.seats.find((s) => s.id === seat)?.bot;

/** Bots lock in their picks for every pack in front of them. */
function botsPick(ev: DraftEvent, s: DraftState): DraftState {
  for (let guard = 0; guard < 2000 && !s.done; guard++) {
    const seat = s.seats.find((x) => isBot(ev, x) && s.packs[x] && !s.locked[x]);
    if (!seat) break;
    s = lockPick(s, seat, aiPick(s, seat));
  }
  return s;
}

/** Why `seat` can't pick card `uid` now, or null. */
export function eventPickProblem(ev: DraftEvent, seat: string, uid: string): string | null {
  if (ev.phase !== 'drafting' || !ev.draft) return 'The draft is not running.';
  return pickProblem(ev.draft, seat, uid);
}

/** A player locks in a card; bots answer at once. When the draft ends, deckbuilding starts. */
export function pick(prev: DraftEvent, seat: string, uid: string, now: number): DraftEvent {
  const problem = eventPickProblem(prev, seat, uid);
  if (problem) throw new Error(problem);
  const ev = structuredClone(prev);
  ev.draft = botsPick(ev, lockPick(ev.draft!, seat, uid));
  if (ev.draft.done) startBuilding(ev, now);
  return ev;
}

function startBuilding(ev: DraftEvent, now: number): void {
  ev.phase = 'building';
  ev.buildEndsAt = now + DECKBUILDING_MINUTES * 60_000;
  for (const s of ev.seats) {
    if (!s.bot) continue;
    ev.decks[s.id] = aiDeck(pool(ev, s.id));
    ev.ready[s.id] = true;
  }
}

/** A seat's drafted cards. */
export function pool(ev: DraftEvent, seat: string): DraftCard[] {
  return ev.draft?.picks[seat] ?? [];
}

/** What one seat may see of the draft. */
export function eventDraftView(ev: DraftEvent, seat: string): DraftView | null {
  return ev.draft ? draftView(ev.draft, seat) : null;
}

/** Saves a seat's deck (deckbuilding, or sideboarding between games). */
export function submitDeck(prev: DraftEvent, seat: string, deck: LimitedDeck): DraftEvent {
  if (prev.phase !== 'building' && prev.phase !== 'playing') throw new Error('Decks are built after the draft.');
  if (prev.phase === 'building' && prev.ready[seat]) throw new Error('You pressed Ready; your deck is locked.');
  if (prev.phase === 'playing' && !canSideboard(prev, seat)) throw new Error('You can change your deck only between games of a match.');
  // While building, a deck in progress may be any size (it's checked on Ready); between games it must be legal.
  const problem = prev.phase === 'building' ? poolProblem(deck, pool(prev, seat)) : deckProblem(deck, pool(prev, seat));
  if (problem) throw new Error(problem);
  const ev = structuredClone(prev);
  ev.decks[seat] = structuredClone(deck);
  return ev;
}

/** Cards from the pool, once each, and sensible basic land counts; any size. */
function poolProblem(deck: LimitedDeck, picks: readonly DraftCard[]): string | null {
  const uids = new Set(picks.map((c) => c.uid));
  if (deck.cards.some((uid) => !uids.has(uid))) return 'The deck has a card that is not in your pool.';
  if (new Set(deck.cards).size !== deck.cards.length) return 'A card from your pool is in the deck twice.';
  if (COLORS.some((c) => !Number.isInteger(deck.basics[c]) || deck.basics[c] < 0 || deck.basics[c] > 60)) return 'Basic land counts must be whole numbers from 0 to 60.';
  return null;
}

/** Ready (or not) in deckbuilding: once everyone is, play starts. */
export function setReady(prev: DraftEvent, seat: string, ready: boolean, now: number, seed: () => number): DraftEvent {
  if (prev.phase !== 'building') throw new Error('Deckbuilding is over.');
  if (ready && deckProblem(prev.decks[seat] ?? { cards: [], basics: { W: 0, U: 0, B: 0, R: 0, G: 0 } }, pool(prev, seat))) {
    throw new Error('Save a legal deck (40 to 60 cards) before pressing Ready.');
  }
  const ev = structuredClone(prev);
  ev.ready[seat] = ready;
  return tick(ev, now, seed);
}

/**
 * Time passing: when deckbuilding's 20 minutes are up, every unfinished deck
 * is locked as it is, with basic lands added to reach 40 (or the AI's deck
 * from the pool if nothing was saved), and play begins. Also starts play once
 * everyone is Ready.
 */
export function tick(prev: DraftEvent, now: number, rng: () => number): DraftEvent {
  if (prev.phase !== 'building') return prev;
  const timeUp = prev.buildEndsAt !== null && now >= prev.buildEndsAt;
  if (!timeUp && !prev.seats.every((s) => prev.ready[s.id])) return prev;
  const ev = structuredClone(prev);
  for (const s of ev.seats) {
    if (ev.ready[s.id] && ev.decks[s.id]) continue;
    ev.decks[s.id] = lockedDeck(ev.decks[s.id] ?? null, pool(ev, s.id));
    ev.ready[s.id] = true;
  }
  ev.phase = 'playing';
  startRound(ev, rng);
  return ev;
}

/** A deck when time runs out: the saved one, filled with basics to 40 and trimmed to 60; or the AI's build. */
export function lockedDeck(deck: LimitedDeck | null, picks: readonly DraftCard[]): LimitedDeck {
  if (!deck || deck.cards.length === 0) return aiDeck(picks);
  const out = structuredClone(deck);
  if (deckSize(out) < MIN_DECK_SIZE) {
    const add = suggestBasics({ cards: out.cards, basics: { W: 0, U: 0, B: 0, R: 0, G: 0 } }, picks);
    for (const c of COLORS) out.basics[c] = Math.max(out.basics[c], add[c]);
    while (deckSize(out) < MIN_DECK_SIZE) out.basics.W++;
  }
  while (deckSize(out) > 60) {
    const c = COLORS.find((k) => out.basics[k] > 0);
    if (c) out.basics[c]--;
    else out.cards.pop();
  }
  return out;
}

const results = (ev: DraftEvent): MatchResult[] =>
  ev.matches.filter((m) => m.done).map((m) => ({ a: m.a, b: m.b, aWins: wins(m, m.a), bWins: m.b ? wins(m, m.b) : 0, draws: m.games.filter((g) => g.winner === null).length }));

const wins = (m: EventMatch, seat: string) => m.games.filter((g) => g.winner === seat).length;

function startRound(ev: DraftEvent, rng: () => number): void {
  ev.round++;
  const ids = ev.seats.map((s) => s.id);
  // Round 1 is random (docs/sealed.md); later rounds pair by standings.
  if (ev.round === 1) for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  }
  for (const [a, b] of pairRound(ids, results(ev))) {
    const m: EventMatch = { id: `r${ev.round}-${a}`, round: ev.round, a, b, games: [], chooser: null, nextFirst: null, done: b === null };
    if (b) m.nextFirst = rng() < 0.5 ? a : b;
    ev.matches.push(m);
  }
}

/** This round's match for a seat, if any. */
export function currentMatch(ev: DraftEvent, seat: string): EventMatch | undefined {
  return ev.matches.find((m) => m.round === ev.round && (m.a === seat || m.b === seat));
}

/** Whether a seat may change its deck now: between games of an unfinished match (rule: sideboarding). */
export function canSideboard(ev: DraftEvent, seat: string): boolean {
  const m = currentMatch(ev, seat);
  return !!m && !m.done && m.b !== null;
}

/** The match's next game, ready to start: who plays first; null while waiting for a play/draw choice, or when it's over. */
export function nextGame(ev: DraftEvent, matchId: string): { first: string } | null {
  const m = ev.matches.find((x) => x.id === matchId);
  if (!m || m.done || !m.nextFirst) return null;
  return { first: m.nextFirst };
}

/** The loser of the last game chooses to play (go first) or draw. */
export function choosePlayDraw(prev: DraftEvent, matchId: string, seat: string, play: boolean): DraftEvent {
  const m = prev.matches.find((x) => x.id === matchId);
  if (!m || m.done) throw new Error('That match is over.');
  if (m.chooser !== seat) throw new Error("It's not your choice.");
  if (m.nextFirst) throw new Error('You already chose.');
  const ev = structuredClone(prev);
  const n = ev.matches.find((x) => x.id === matchId)!;
  n.nextFirst = play ? seat : seat === n.a ? n.b : n.a;
  return ev;
}

/**
 * Records a finished game. A match ends when a player has won two games (or
 * after three); the next game's loser chooses play or draw (a bot plays). When
 * every match of the round is over, the next round is paired, or the event ends.
 */
export function recordGame(prev: DraftEvent, matchId: string, winner: string | null, rng: () => number): DraftEvent {
  const ev = structuredClone(prev);
  const m = ev.matches.find((x) => x.id === matchId);
  if (!m || m.done || !m.b || !m.nextFirst) throw new Error('That game is not being played.');
  if (winner !== null && winner !== m.a && winner !== m.b) throw new Error('The winner must be one of the match players.');
  m.games.push({ winner, first: m.nextFirst });
  m.nextFirst = null;
  if (wins(m, m.a) >= 2 || wins(m, m.b) >= 2 || m.games.length >= 3) m.done = true;
  else {
    // The loser chooses; after a draw, whoever chose last chooses again (or the player who went second).
    const last = m.games[m.games.length - 1]!;
    m.chooser = winner === null ? (m.chooser ?? (last.first === m.a ? m.b : m.a)) : winner === m.a ? m.b : m.a;
    if (isBot(ev, m.chooser)) m.nextFirst = m.chooser;
  }
  if (ev.matches.filter((x) => x.round === ev.round).every((x) => x.done)) {
    if (ev.round < ev.rounds) startRound(ev, rng);
    else ev.phase = 'finished';
  }
  return ev;
}

/** The event's standings (best first). */
export function eventStandings(ev: DraftEvent): Standing[] {
  return standings(
    ev.seats.map((s) => s.id),
    results(ev),
  );
}

export { matchWinner };

/** The engine game for a match's next game: Limited rules, each seat's deck with its drafted printings. */
export function gameSetup(ev: DraftEvent, matchId: string, seed: Seed): GameSetup {
  const m = ev.matches.find((x) => x.id === matchId)!;
  const first = nextGame(ev, matchId)?.first;
  if (!m.b || !first) throw new Error('That match has no game to play now.');
  return {
    format: LIMITED,
    cardDefs: CARD_DEFS,
    seed,
    mulligans: true,
    firstPlayer: first,
    players: [m.a, m.b].map((seat) => ({ id: seat, ...gameDeck(ev.decks[seat]!, pool(ev, seat)) })),
  };
}

/** A Limited deck as engine card ids, with each drafted card's printing and finish (its art in the game). */
export function gameDeck(deck: LimitedDeck, picks: readonly DraftCard[]): { deck: string[]; deckPrintings: GameSetup['players'][number]['deckPrintings']; deckFinishes: GameSetup['players'][number]['deckFinishes'] } {
  const byUid = new Map(picks.map((c) => [c.uid, c]));
  const cards = deck.cards.map((uid) => byUid.get(uid)!);
  const lands = COLORS.flatMap((c) => Array<string>(deck.basics[c]).fill(BASIC_LANDS[c]));
  return {
    deck: [...cards.map((c) => defIdOf(c.card)!), ...lands],
    deckPrintings: [...cards.map((c) => ({ set: c.card.set, number: c.card.number })), ...lands.map(() => undefined)],
    deckFinishes: [...cards.map((c) => finishLook(c.card, c.finish)), ...lands.map(() => undefined)],
  };
}

/** The winner of a finished engine game: the one player still in it (null: a draw, or not over). */
export function gameWinner(state: GameState): PlayerId | null {
  if (state.pending.kind !== 'gameOver') return null;
  const alive = state.turnOrder.filter((p) => !state.players[p]!.eliminated);
  return alive.length === 1 ? alive[0]! : null;
}

/** Plays a bot-vs-bot game to the end on the server; a game that runs too long is a draw. */
export function playBotGame(ev: DraftEvent, matchId: string, seed: Seed, botSeed: number): string | null {
  const setup = gameSetup(ev, matchId, seed);
  const m = ev.matches.find((x) => x.id === matchId)!;
  const game = playGame(setup, { [m.a]: basicAi(botSeed), [m.b!]: basicAi(botSeed + 1) }, { maxActions: 6000 });
  return gameWinner(game.state);
}

/** True when a match is between two bots (the server plays it out at once). */
export function botMatch(ev: DraftEvent, m: EventMatch): boolean {
  return !!m.b && isBot(ev, m.a) && isBot(ev, m.b);
}
