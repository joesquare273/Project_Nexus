// Booster draft: each player opens a Play Booster (exactly as Wizards prints
// them: Final Fantasy main set and Through the Ages cards, see boosters.ts)
// and chooses a card, then confirms it to lock it in. Once every player has
// locked in, all picks are taken at once and every pack moves one seat
// clockwise (to the next seat). This repeats until the round's packs are
// empty, then everyone opens their next pack. Six packs each. A player sees
// only the pack in front of them and their own picks.
//
// The state is plain JSON (for the server later): nothing here touches the
// game engine's rules, only the cards' definitions (for the AI's picks).

import { colorsOf, nextRandom, seedToState, type CardDefinition, type RngState, type Seed } from '@nexus/engine';
import { CARD_DEFS, CARD_IDS_BY_NAME } from './index.ts';
import { openPack, type BoosterCard, type Pull } from './boosters.ts';
import { cardRating } from './rating.ts';

export const PACKS_PER_PLAYER = 6;

export { DRAFT_SETS, DRAFT_SET_CODES, draftSet, type DraftSetCode } from './draftSets.ts';
import { draftSet, type DraftSetCode } from './draftSets.ts';

/** One Play Booster of `set`, without its token or art card. */
function openDraftPack(set: DraftSetCode, rng: () => number): Pull[] {
  switch (set) {
    case 'fin':
      // Real Play Boosters: FIN and Through the Ages only (no Scene Box extras).
      return openPack('play', rng, undefined, { officialOnly: true }).cards.filter((p) => isMagicCard(p.card));
  }
}

/** One card in the draft, with an id unique within the draft. */
export interface DraftCard extends Pull {
  uid: string;
}

export interface DraftPack {
  id: string;
  cards: DraftCard[];
}

export interface DraftState {
  /** The set being drafted (its Play Boosters). */
  set: DraftSetCode;
  /** Seats in clockwise order: each passes to the next. */
  seats: string[];
  /** 0-5: which of the six packs is being drafted. */
  round: number;
  /**
   * Magic cards per pack (14: a Play Booster without its token or art card).
   * Each player takes exactly this many cards per round, at any table size.
   */
  packSize: number;
  /** Packs not yet opened, per seat. */
  unopened: Record<string, DraftPack[]>;
  /** The pack in front of each seat (null once the round's packs are empty). */
  packs: Record<string, DraftPack | null>;
  /** The card each seat has locked in from its pack, until everyone has. */
  locked: Record<string, string | null>;
  picks: Record<string, DraftCard[]>;
  done: boolean;
}

/** What one player may see: their pack, their picks, and how far everyone is. */
export interface DraftView {
  set: DraftSetCode;
  seat: string;
  round: number;
  /** The pack to pick from now, or null when the draft is over. */
  pack: DraftCard[] | null;
  /** The card you locked in, while the others are still choosing. */
  locked: string | null;
  /** Picks made from this round's packs so far (for "Pack 2, pick 5"). */
  pickInRound: number;
  picks: DraftCard[];
  /** Everyone's progress, and who has locked in this pick, without what they picked. */
  seats: { seat: string; picks: number; locked: boolean }[];
  done: boolean;
}

/** Only Magic cards are drafted: tokens and art cards stay out. */
const isMagicCard = (c: BoosterCard) => !['tfin', 'afin', 'afic'].includes(c.set);

/** A seeded random number generator for the packs (the server passes 128 crypto-random bits). */
function rngFrom(seed: Seed): () => number {
  let state: RngState = seedToState(seed);
  return () => {
    const [value, next] = nextRandom(state);
    state = next;
    return value;
  };
}

export function createDraft(seats: string[], seed: Seed, set: DraftSetCode = 'fin'): DraftState {
  if (seats.length < 2 || seats.length > 4) throw new Error('A draft needs 2 to 4 players.');
  if (!draftSet(set)) throw new Error(`There are no ${set} boosters to draft.`);
  const rng = rngFrom(seed);
  let uid = 0;
  const unopened: Record<string, DraftPack[]> = {};
  for (const seat of seats) {
    unopened[seat] = Array.from({ length: PACKS_PER_PLAYER }, (_, i) => ({
      id: `${seat}-pack${i + 1}`,
      cards: openDraftPack(set, rng).map((p) => ({ ...p, uid: `d${uid++}` })),
    }));
  }
  const sizes = new Set(Object.values(unopened).flat().map((p) => p.cards.length));
  if (sizes.size !== 1) throw new Error('Every pack should hold the same number of cards.');
  const state: DraftState = {
    set,
    seats: [...seats],
    round: 0,
    packSize: [...sizes][0]!,
    unopened,
    packs: Object.fromEntries(seats.map((s) => [s, null])),
    locked: Object.fromEntries(seats.map((s) => [s, null])),
    picks: Object.fromEntries(seats.map((s) => [s, []])),
    done: false,
  };
  openRound(state);
  return state;
}

function openRound(s: DraftState): void {
  for (const seat of s.seats) s.packs[seat] = s.unopened[seat]!.shift()!;
}

/** The seat a pack goes to after `seat` picks from it: clockwise, the next seat. */
export function nextSeat(s: DraftState, seat: string): string {
  return s.seats[(s.seats.indexOf(seat) + 1) % s.seats.length]!;
}

/** Why `seat` can't lock in card `uid` now, or null. */
export function pickProblem(s: DraftState, seat: string, uid: string): string | null {
  if (s.done) return 'The draft is over.';
  const pack = s.packs[seat];
  if (!pack) return 'There is no pack in front of you.';
  if (s.locked[seat]) return 'You have already locked in a card for this pick.';
  if (!pack.cards.some((c) => c.uid === uid)) return 'That card is not in the pack in front of you.';
  return null;
}

/**
 * `seat` confirms card `uid`, locking it in. When every player has locked
 * in, each takes their card and every pack moves one seat clockwise; when the
 * round's packs are empty, everyone opens their next pack. Returns a new state.
 */
export function lockPick(prev: DraftState, seat: string, uid: string): DraftState {
  const problem = pickProblem(prev, seat, uid);
  if (problem) throw new Error(problem);
  const s = structuredClone(prev);
  s.locked[seat] = uid;
  if (s.seats.some((x) => s.packs[x] && !s.locked[x])) return s;
  // Everyone has locked in: take the cards, then rotate the packs together.
  const passed: Record<string, DraftPack | null> = {};
  for (const x of s.seats) {
    const pack = s.packs[x]!;
    const card = pack.cards.find((c) => c.uid === s.locked[x])!;
    pack.cards = pack.cards.filter((c) => c.uid !== card.uid);
    s.picks[x]!.push(card);
    passed[nextSeat(s, x)] = pack.cards.length > 0 ? pack : null;
    s.locked[x] = null;
  }
  s.packs = passed;
  if (s.seats.every((x) => !s.packs[x])) {
    if (s.round + 1 < PACKS_PER_PLAYER) {
      s.round++;
      openRound(s);
    } else s.done = true;
  }
  return s;
}

export function draftView(s: DraftState, seat: string): DraftView {
  return {
    set: s.set ?? 'fin',
    seat,
    round: s.round,
    pack: s.packs[seat] ? structuredClone(s.packs[seat]!.cards) : null,
    locked: s.locked[seat] ?? null,
    pickInRound: s.done ? s.packSize : s.picks[seat]!.length - s.round * s.packSize,
    picks: structuredClone(s.picks[seat]!),
    seats: s.seats.map((x) => ({ seat: x, picks: s.picks[x]!.length, locked: !!s.locked[x] })),
    done: s.done,
  };
}

/**
 * A card's colors for drafting and deckbuilding: its color identity, or, for
 * cards defined without one (the Starter Kit cards), the colors of its cost.
 */
export function cardColors(def: CardDefinition | undefined): string[] {
  if (!def) return [];
  return def.colorIdentity?.length ? [...def.colorIdentity] : colorsOf(def);
}

/** The engine card a drafted printing plays as. */
export function defIdOf(card: BoosterCard): string | undefined {
  return CARD_IDS_BY_NAME[card.name];
}

// ---------------------------------------------------------------------------
// The AI drafter
// ---------------------------------------------------------------------------

/** A drafted card's engine definition. */
const defFor = (c: DraftCard) => CARD_DEFS[defIdOf(c.card) ?? ''];

/**
 * How strongly the AI is in each color, from what it has picked: each pick
 * counts its rating toward its colors.
 */
export function colorWeights(picks: readonly DraftCard[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of picks) {
    const def = defFor(p);
    const colors = cardColors(def);
    const r = cardRating(def, p.card.rarity);
    for (const c of colors) out[c] = (out[c] ?? 0) + r / colors.length;
  }
  return out;
}

/**
 * How much the AI wants this card, given what it has picked: the card's
 * Limited rating (cardRating), and, after the first few picks, how well it
 * fits the two colors the AI is in. Cards that aren't built yet are never
 * wanted (they can't be played).
 */
export function aiScore(card: DraftCard, picks: readonly DraftCard[]): number {
  const def = defFor(card);
  if (!def) return 0;
  const rating = cardRating(def, card.card.rarity);
  const colors = cardColors(def);
  const weights = colorWeights(picks);
  const main = Object.entries(weights).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([c]) => c);
  // A card that can't be played yet is only a tiebreak: one in your colors over one that isn't.
  if (rating === 0) return colors.length > 0 && colors.every((c) => main.includes(c)) ? 0.02 : colors.length === 0 ? 0.01 : 0;
  // The first picks take the best card; after that, commitment grows with each pick.
  if (picks.length < 4) return rating;
  const commitment = Math.min(1, (picks.length - 3) / 7);
  if (colors.length === 0) return rating + 0.4 * commitment;
  const fits = colors.every((c) => main.includes(c));
  const off = colors.filter((c) => !main.includes(c)).length;
  return rating + (fits ? 2 : -3 * off) * commitment;
}

/** The card the AI locks in from the pack in front of it (ties go to the first). */
export function aiPick(s: DraftState, seat: string): string {
  const pack = s.packs[seat]!;
  const picks = s.picks[seat]!;
  let best = pack.cards[0]!;
  for (const c of pack.cards) if (aiScore(c, picks) > aiScore(best, picks)) best = c;
  return best.uid;
}
