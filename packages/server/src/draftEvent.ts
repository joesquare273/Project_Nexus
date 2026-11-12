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
import { aiPick, createDraft, defIdOf, draftSet, type DraftSetCode, draftView, lockPick, pickProblem, type DraftCard, type DraftState, type DraftView } from '@nexus/cards/draft';
import { aiDeck, BASIC_LANDS, COLORS, DECKBUILDING_MINUTES, deckProblem, deckSize, MIN_DECK_SIZE, suggestBasics, type LimitedDeck } from '@nexus/cards/limited';
import { basicAi, playGame } from '@nexus/bots';
import { matchWinner, standings, type MatchResult, type Standing } from './swiss.ts';

export interface EventSeat {
  /** S1-S4: the seat's id, also its engine player id in games. */
  id: string;
  name: string;
  bot: boolean;
  /** The player's Discord profile picture. */
  avatar?: string;
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
  /**
   * Sideboarding between games: until this time (ms since the epoch), or
   * until both players are ready, the next game waits (null: no wait).
   */
  sideboardEndsAt?: number | null;
  /** The players ready for the next game (bots always are). */
  readyNext?: string[];
  done: boolean;
  /** Round 1: the semifinals; round 2: the final (winners) and the match for third place (losers). */
  stage: 'semifinal' | 'final' | 'third';
  /** Who won the match (a match always has a winner; see recordGame). */
  winner: string | null;
}

export interface DraftEvent {
  code: string;
  /** Seats the event is for (2-4): `players` for players (the host included), the rest for bots. */
  size: number;
  players: number;
  /** The set being drafted, chosen by the host (prizes may depend on it). */
  set: DraftSetCode;
  seats: EventSeat[];
  phase: EventPhase;
  draft: DraftState | null;
  decks: Record<string, LimitedDeck | null>;
  /** Pressed Ready in deckbuilding (bots always are). */
  ready: Record<string, boolean>;
  /** When deckbuilding ends (ms since the epoch). */
  buildEndsAt: number | null;
  /** When the current pick's 30 seconds are up, while players still have to pick. */
  pickEndsAt: number | null;
  /** Which pick the clock is for (all picks made so far), so it restarts with each new pick. */
  pickClock: number;
  /** A card each player has selected but not confirmed: taken for them if time runs out. */
  selected: Record<string, string | null>;
  rounds: number;
  /** The round being played, 1-based (0 before play). */
  round: number;
  matches: EventMatch[];
}

export const MAX_SEATS = 4;
/** Seconds to choose each card in the draft (user decision 2026-11-03). */
export const PICK_SECONDS = 30;
const SEAT_IDS = ['S1', 'S2', 'S3', 'S4'];
const BOT_NAMES = ['Chocobo Bot', 'Moogle Bot', 'Cactuar Bot'];

/** Why `players` player seats and `bots` bot seats isn't a valid event, or null. */
export function seatsProblem(players: number, bots: number): string | null {
  if (!Number.isInteger(players) || !Number.isInteger(bots) || players < 1 || bots < 0) return 'An event has at least one player seat.';
  if (players + bots !== MAX_SEATS) return 'A draft event has 4 seats: players and bots.';
  return null;
}

/**
 * A new event with its first seat (the player who made it): `players` seats
 * for players (the host included) and `bots` for bots.
 */
export function createEvent(code: string, seats: { players: number; bots: number; set?: DraftSetCode }, host: { name: string; userId: string; avatar?: string }): DraftEvent {
  const problem = seatsProblem(seats.players, seats.bots);
  if (problem) throw new Error(problem);
  const set = seats.set ?? 'fin';
  if (!draftSet(set)) throw new Error(`There are no ${set} boosters to draft.`);
  const size = seats.players + seats.bots;
  return {
    code,
    size,
    players: seats.players,
    set,
    seats: [{ id: SEAT_IDS[0]!, name: host.name, bot: false, userId: host.userId, ...(host.avatar ? { avatar: host.avatar } : {}) }],
    phase: 'lobby',
    draft: null,
    decks: {},
    ready: {},
    buildEndsAt: null,
    pickEndsAt: null,
    pickClock: 0,
    selected: {},
    rounds: 2,
    round: 0,
    matches: [],
  };
}

/** Seats another player; null if the event is full or under way. */
export function joinEvent(ev: DraftEvent, player: { name: string; userId: string; avatar?: string }): EventSeat | null {
  if (ev.phase !== 'lobby' || ev.seats.length >= ev.players) return null;
  if (ev.seats.some((s) => s.userId === player.userId)) return null;
  const taken = new Set(ev.seats.map((s) => s.name));
  const name = taken.has(player.name) ? `${player.name} (2)` : player.name;
  const seat: EventSeat = { id: SEAT_IDS.find((id) => !ev.seats.some((s) => s.id === id))!, name, bot: false, userId: player.userId, ...(player.avatar ? { avatar: player.avatar } : {}) };
  ev.seats.push(seat);
  return seat;
}

/** A player leaves the lobby (before the draft). */
export function leaveEvent(ev: DraftEvent, userId: string): void {
  if (ev.phase === 'lobby') ev.seats = ev.seats.filter((s) => s.userId !== userId);
}

/** The host changes the seats before the draft (never below the players already seated). */
export function changeSeats(prev: DraftEvent, players: number, bots: number, set: DraftSetCode = prev.set): DraftEvent {
  if (!draftSet(set)) throw new Error(`There are no ${set} boosters to draft.`);
  if (prev.phase !== 'lobby') throw new Error('The draft has already started.');
  const problem = seatsProblem(players, bots);
  if (problem) throw new Error(problem);
  if (players < prev.seats.length) throw new Error(`${prev.seats.length} players are already seated.`);
  return { ...structuredClone(prev), players, set, size: players + bots, rounds: 2 };
}

/** Starts the draft once every player seat is taken; the bot seats get bots. Returns the new state. */
export function startDraft(prev: DraftEvent, seed: Seed, now = 0): DraftEvent {
  if (prev.phase !== 'lobby') throw new Error('The draft has already started.');
  const missing = prev.players - prev.seats.length;
  if (missing > 0) throw new Error(`Waiting for ${missing} more player${missing === 1 ? '' : 's'} to join.`);
  const ev = structuredClone(prev);
  let bots = 0;
  while (ev.seats.length < ev.size) {
    const id = SEAT_IDS.find((x) => !ev.seats.some((s) => s.id === x))!;
    ev.seats.push({ id, name: BOT_NAMES[bots++ % BOT_NAMES.length]!, bot: true });
  }
  ev.seats.sort((a, b) => SEAT_IDS.indexOf(a.id) - SEAT_IDS.indexOf(b.id));
  ev.draft = botsPick(ev, createDraft(ev.seats.map((s) => s.id), seed, ev.set));
  ev.phase = 'drafting';
  for (const s of ev.seats) {
    ev.decks[s.id] = null;
    ev.ready[s.id] = false;
  }
  armPickClock(ev, now);
  return ev;
}

const picksMade = (s: DraftState) => Object.values(s.picks).reduce((n, p) => n + p.length, 0);

/** Each new pick gets 30 seconds, while a player still has to choose. */
function armPickClock(ev: DraftEvent, now: number): void {
  const d = ev.draft;
  if (ev.phase !== 'drafting' || !d) {
    ev.pickEndsAt = null;
    return;
  }
  const waiting = ev.seats.some((s) => !s.bot && d.packs[s.id] && !d.locked[s.id]);
  if (!waiting) {
    ev.pickEndsAt = null;
    return;
  }
  const clock = picksMade(d);
  if (ev.pickEndsAt === null || clock !== ev.pickClock) {
    ev.pickClock = clock;
    ev.pickEndsAt = now + PICK_SECONDS * 1000;
    for (const s of ev.seats) ev.selected[s.id] = null;
  }
}

/** A player selects a card (not yet confirmed); it's taken for them if the clock runs out. */
export function selectCard(prev: DraftEvent, seat: string, uid: string): DraftEvent {
  const problem = eventPickProblem(prev, seat, uid);
  if (problem) throw new Error(problem);
  const ev = structuredClone(prev);
  ev.selected[seat] = uid;
  return ev;
}

/**
 * The pick's 30 seconds are up: everyone who hasn't confirmed gets the card
 * they selected, or else the AI's choice for them. Then the packs move on.
 */
export function expirePicks(prev: DraftEvent, now: number): DraftEvent {
  if (prev.phase !== 'drafting' || !prev.draft || prev.pickEndsAt === null || now < prev.pickEndsAt) return prev;
  const ev = structuredClone(prev);
  let d = ev.draft!;
  for (const s of ev.seats) {
    if (s.bot || !d.packs[s.id] || d.locked[s.id]) continue;
    const chosen = ev.selected[s.id];
    const uid = chosen && d.packs[s.id]!.cards.some((c) => c.uid === chosen) ? chosen : aiPick(d, s.id);
    d = lockPick(d, s.id, uid);
  }
  ev.draft = botsPick(ev, d);
  if (ev.draft.done) startBuilding(ev, now);
  armPickClock(ev, now);
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
  armPickClock(ev, now);
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

/**
 * The tournament (user decision 2026-11-03): four seats. Round 1 pairs them
 * at random into two semifinals; in round 2 the winners play the final (1st
 * and 2nd place) and the losers play for 3rd and 4th. Every match is best of 3.
 */
function startRound(ev: DraftEvent, rng: () => number): void {
  ev.round++;
  const pairs: [string, string, EventMatch['stage']][] = [];
  if (ev.round === 1) {
    const ids = ev.seats.map((s) => s.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    }
    pairs.push([ids[0]!, ids[1]!, 'semifinal'], [ids[2]!, ids[3]!, 'semifinal']);
  } else {
    const [m1, m2] = ev.matches.filter((m) => m.round === 1);
    const loser = (m: EventMatch) => (m.winner === m.a ? m.b! : m.a);
    pairs.push([m1!.winner!, m2!.winner!, 'final'], [loser(m1!), loser(m2!), 'third']);
  }
  for (const [a, b, stage] of pairs) {
    ev.matches.push({ id: `r${ev.round}-${a}`, round: ev.round, a, b, games: [], chooser: null, nextFirst: rng() < 0.5 ? a : b, done: false, stage, winner: null });
  }
}

/** Places once the event is over: the final's winner and loser, then the match for third. */
export function placements(ev: DraftEvent): string[] | null {
  if (ev.phase !== 'finished') return null;
  const final = ev.matches.find((m) => m.stage === 'final');
  const third = ev.matches.find((m) => m.stage === 'third');
  if (!final?.winner || !third?.winner) return null;
  const other = (m: EventMatch) => (m.winner === m.a ? m.b! : m.a);
  return [final.winner, other(final), third.winner, other(third)];
}

/** Most games a match may take: best of 3, with up to two more if drawn games leave it tied. */
export const MAX_GAMES = 5;

/** This round's match for a seat, if any. */
export function currentMatch(ev: DraftEvent, seat: string): EventMatch | undefined {
  return ev.matches.find((m) => m.round === ev.round && (m.a === seat || m.b === seat));
}

/** How long players may sideboard between games before the next one starts anyway. */
export const SIDEBOARD_MS = 3 * 60_000;

/** Whether a seat may change its deck now: between games of an unfinished match, until it says it's ready (rule: sideboarding). Games in progress are refused by the server (events.ts). */
export function canSideboard(ev: DraftEvent, seat: string): boolean {
  const m = currentMatch(ev, seat);
  return !!m && !m.done && m.b !== null && !(m.sideboardEndsAt && m.readyNext?.includes(seat));
}

/** Whether this player is done sideboarding for the next game. */
function sideboardReady(m: EventMatch, seat: string): boolean {
  return !m.sideboardEndsAt || !!m.readyNext?.includes(seat);
}

/** Still sideboarding: the next game waits for both players (or the clock). */
export function sideboarding(m: EventMatch): boolean {
  return !!m.sideboardEndsAt && !(sideboardReady(m, m.a) && (m.b === null || sideboardReady(m, m.b)));
}

/** The match's next game, ready to start: who plays first; null while waiting for a play/draw choice or for sideboarding, or when it's over. */
export function nextGame(ev: DraftEvent, matchId: string): { first: string } | null {
  const m = ev.matches.find((x) => x.id === matchId);
  if (!m || m.done || !m.nextFirst || sideboarding(m)) return null;
  return { first: m.nextFirst };
}

/** A player is done sideboarding; once both are, the sideboarding window closes. */
export function readyForNextGame(prev: DraftEvent, seat: string): DraftEvent {
  const m = currentMatch(prev, seat);
  if (!m || m.done || !m.sideboardEndsAt) throw new Error('There is no game to get ready for.');
  if (m.readyNext?.includes(seat)) return prev;
  const ev = structuredClone(prev);
  const n = ev.matches.find((x) => x.id === m.id)!;
  n.readyNext = [...(n.readyNext ?? []), seat];
  if (!sideboarding(n)) closeSideboarding(n);
  return ev;
}

/** The sideboarding clock ran out: the next games start with the decks as they are. */
export function expireSideboarding(prev: DraftEvent, now: number): DraftEvent {
  if (!prev.matches.some((m) => m.sideboardEndsAt && m.sideboardEndsAt <= now)) return prev;
  const ev = structuredClone(prev);
  for (const m of ev.matches) if (m.sideboardEndsAt && m.sideboardEndsAt <= now) closeSideboarding(m);
  return ev;
}

function closeSideboarding(m: EventMatch): void {
  m.sideboardEndsAt = null;
  delete m.readyNext;
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
 * Records a finished game. A match ends when a player has won two games, or
 * after three games with one player ahead. Drawn games can leave it tied:
 * then more games are played (five at most); still tied after that, the
 * match goes to a coin flip, since every match needs a winner. The next
 * game's loser chooses play or draw (a bot plays). When both matches of the
 * round are over, the next round is paired, or the event ends.
 */
/** `now`: with it, the players get SIDEBOARD_MS to sideboard before the next game (bots are ready at once). */
export function recordGame(prev: DraftEvent, matchId: string, winner: string | null, rng: () => number, now?: number): DraftEvent {
  const ev = structuredClone(prev);
  const m = ev.matches.find((x) => x.id === matchId);
  if (!m || m.done || !m.b || !m.nextFirst) throw new Error('That game is not being played.');
  if (winner !== null && winner !== m.a && winner !== m.b) throw new Error('The winner must be one of the match players.');
  m.games.push({ winner, first: m.nextFirst });
  m.nextFirst = null;
  const wa = wins(m, m.a);
  const wb = wins(m, m.b);
  if (wa >= 2 || wb >= 2 || (m.games.length >= 3 && wa !== wb) || m.games.length >= MAX_GAMES) {
    m.done = true;
    m.winner = wa > wb ? m.a : wb > wa ? m.b : rng() < 0.5 ? m.a : m.b;
  } else {
    // The loser chooses; after a draw, whoever chose last chooses again (or the player who went second).
    const last = m.games[m.games.length - 1]!;
    m.chooser = winner === null ? (m.chooser ?? (last.first === m.a ? m.b : m.a)) : winner === m.a ? m.b : m.a;
    if (isBot(ev, m.chooser)) m.nextFirst = m.chooser;
    const bots = [m.a, m.b].filter((x): x is string => x !== null && isBot(ev, x));
    if (now !== undefined && bots.length < 2) {
      m.sideboardEndsAt = now + SIDEBOARD_MS;
      m.readyNext = bots;
    }
  }
  if (ev.matches.filter((x) => x.round === ev.round).every((x) => x.done)) {
    if (ev.round < ev.rounds) startRound(ev, rng);
    else ev.phase = 'finished';
  }
  return ev;
}

/** The event's standings (best first). */
export function eventStandings(ev: DraftEvent): Standing[] {
  const table = standings(
    ev.seats.map((s) => s.id),
    results(ev),
  );
  // Once the event is over, the bracket decides the order.
  const places = placements(ev);
  return places ? places.map((p) => table.find((s) => s.player === p)!) : table;
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
