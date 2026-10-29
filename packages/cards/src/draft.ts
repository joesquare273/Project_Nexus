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

export const PACKS_PER_PLAYER = 6;

/** One card in the draft, with an id unique within the draft. */
export interface DraftCard extends Pull {
  uid: string;
}

export interface DraftPack {
  id: string;
  cards: DraftCard[];
}

export interface DraftState {
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

export function createDraft(seats: string[], seed: Seed): DraftState {
  if (seats.length < 2 || seats.length > 4) throw new Error('A draft needs 2 to 4 players.');
  const rng = rngFrom(seed);
  let uid = 0;
  const unopened: Record<string, DraftPack[]> = {};
  for (const seat of seats) {
    unopened[seat] = Array.from({ length: PACKS_PER_PLAYER }, (_, i) => ({
      id: `${seat}-pack${i + 1}`,
      // Real Play Boosters: FIN and Through the Ages only (no Scene Box extras).
      cards: openPack('play', rng, undefined, { officialOnly: true })
        .cards.filter((p) => isMagicCard(p.card))
        .map((p) => ({ ...p, uid: `d${uid++}` })),
    }));
  }
  const sizes = new Set(Object.values(unopened).flat().map((p) => p.cards.length));
  if (sizes.size !== 1) throw new Error('Every pack should hold the same number of cards.');
  const state: DraftState = {
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

const RARITY_VALUE: Record<string, number> = { common: 1.5, uncommon: 2.5, rare: 4, mythic: 5, special: 3, bonus: 3 };

/** How much the AI wants this card, given what it has picked. */
export function aiScore(card: DraftCard, picks: readonly DraftCard[]): number {
  const id = defIdOf(card.card);
  const def = id ? CARD_DEFS[id] : undefined;
  if (!def) return 0;
  const isLand = def.types.includes('land');
  const basic = !!def.supertypes?.includes('Basic');
  if (basic) return 0;
  let score = RARITY_VALUE[card.card.rarity] ?? 1;
  // Cards that aren't built yet can't be used in games, so they're worth little to a drafter.
  if (!def.notBuilt) score += 3;
  else score -= 3;
  if (isLand) score -= 1;
  // After a few picks, stick to the two colors picked most.
  if (picks.length >= 5) {
    const counts: Record<string, number> = {};
    for (const p of picks) {
      const d = CARD_DEFS[defIdOf(p.card) ?? ''];
      for (const c of cardColors(d)) counts[c] = (counts[c] ?? 0) + 1;
    }
    const main = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([c]) => c);
    const colors = cardColors(def);
    if (colors.length > 0) score += colors.every((c) => main.includes(c)) ? 2 : -1.5;
  }
  return score;
}

/** The card the AI locks in from the pack in front of it (ties go to the first). */
export function aiPick(s: DraftState, seat: string): string {
  const pack = s.packs[seat]!;
  const picks = s.picks[seat]!;
  let best = pack.cards[0]!;
  for (const c of pack.cards) if (aiScore(c, picks) > aiScore(best, picks)) best = c;
  return best.uid;
}
