// Limited deckbuilding (draft and sealed): a deck is cards from your pool plus
// any number of basic lands, at least 40 cards. Helpers to check a deck,
// suggest its lands, and build the AI's deck from its picks.

import type { CardDefId } from '@nexus/engine';
import { CARD_DEFS } from './index.ts';
import { manaValue, parseManaCost } from '@nexus/engine';
import { cardColors, defIdOf, type DraftCard } from './draft.ts';
import { cardRating } from './rating.ts';

export const MIN_DECK_SIZE = 40;
/** Draft and sealed decks are 40 to 60 cards. */
export const MAX_DECK_SIZE = 60;
/** Typical land count for a 40-card deck. */
export const LAND_TARGET = 17;
export const DECKBUILDING_MINUTES = 20;
export const DECKBUILDING_WARNING_MINUTES = 5;

export type Color = 'W' | 'U' | 'B' | 'R' | 'G';
export const COLORS: Color[] = ['W', 'U', 'B', 'R', 'G'];
/** Unlimited basic lands, by the color they make. */
export const BASIC_LANDS: Record<Color, CardDefId> = { W: 'plains', U: 'island', B: 'swamp', R: 'mountain', G: 'forest' };

/** A deck: cards chosen from the pool (by draft uid) and basic lands by color. */
export interface LimitedDeck {
  cards: string[];
  basics: Record<Color, number>;
}

export const noBasics = (): Record<Color, number> => ({ W: 0, U: 0, B: 0, R: 0, G: 0 });

/** The engine card ids of a deck, for starting a game. */
export function deckList(deck: LimitedDeck, pool: readonly DraftCard[]): CardDefId[] {
  const byUid = new Map(pool.map((c) => [c.uid, c]));
  const cards = deck.cards.map((uid) => defIdOf(byUid.get(uid)!.card)!);
  const lands = COLORS.flatMap((c) => Array<CardDefId>(deck.basics[c]).fill(BASIC_LANDS[c]));
  return [...cards, ...lands];
}

export const deckSize = (deck: LimitedDeck) => deck.cards.length + COLORS.reduce((n, c) => n + deck.basics[c], 0);

/** Why this deck can't be played, or null. */
export function deckProblem(deck: LimitedDeck, pool: readonly DraftCard[]): string | null {
  const uids = new Set(pool.map((c) => c.uid));
  if (deck.cards.some((uid) => !uids.has(uid))) return 'The deck has a card that is not in your pool.';
  if (new Set(deck.cards).size !== deck.cards.length) return 'A card from your pool is in the deck twice.';
  if (COLORS.some((c) => !Number.isInteger(deck.basics[c]) || deck.basics[c] < 0)) return 'Basic land counts must be whole numbers.';
  const size = deckSize(deck);
  if (size < MIN_DECK_SIZE) return `The deck needs at least ${MIN_DECK_SIZE} cards (it has ${size}).`;
  if (size > MAX_DECK_SIZE) return `The deck can have at most ${MAX_DECK_SIZE} cards (it has ${size}).`;
  return null;
}

/** Colored mana symbols in the deck's spells, per color. */
export function colorPips(deck: LimitedDeck, pool: readonly DraftCard[]): Record<Color, number> {
  const byUid = new Map(pool.map((c) => [c.uid, c]));
  const pips = noBasics();
  for (const uid of deck.cards) {
    const def = CARD_DEFS[defIdOf(byUid.get(uid)!.card) ?? ''];
    for (const m of def?.manaCost?.matchAll(/\{([WUBRG])\}/g) ?? []) pips[m[1] as Color]++;
  }
  return pips;
}

/**
 * Basic lands for the deck, split by its colored mana symbols: enough to
 * reach 17 lands counting the nonbasic lands already in it, and at least 40
 * cards in all.
 */
export function suggestBasics(deck: LimitedDeck, pool: readonly DraftCard[]): Record<Color, number> {
  const byUid = new Map(pool.map((c) => [c.uid, c]));
  const nonbasicLands = deck.cards.filter((uid) => CARD_DEFS[defIdOf(byUid.get(uid)!.card) ?? '']?.types.includes('land')).length;
  const want = Math.max(LAND_TARGET - nonbasicLands, MIN_DECK_SIZE - deck.cards.length, 0);
  const pips = colorPips(deck, pool);
  const total = COLORS.reduce((n, c) => n + pips[c], 0);
  const out = noBasics();
  if (want === 0) return out;
  if (total === 0) {
    out.W = want;
    return out;
  }
  // Largest remainder, so the counts add up exactly.
  const shares = COLORS.map((c) => ({ c, exact: (want * pips[c]) / total }));
  for (const s of shares) out[s.c] = Math.floor(s.exact);
  let left = want - COLORS.reduce((n, c) => n + out[c], 0);
  for (const s of [...shares].sort((a, b) => b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact)))) {
    if (left-- <= 0) break;
    out[s.c]++;
  }
  return out;
}

const PAIRS: Color[][] = COLORS.flatMap((a, i) => COLORS.slice(i + 1).map((b) => [a, b]));
const SPELLS = MIN_DECK_SIZE - LAND_TARGET;

/**
 * The AI's deck from its picks. It tries every two-color pair (and each
 * single color) and keeps the one whose best 23 playable cards rate highest;
 * then it builds a curve: mostly creatures, few expensive cards, nonbasic
 * lands in its colors counted toward the lands, and basic lands by the
 * deck's colored mana symbols. Cards that aren't built yet never go in.
 */
export function aiDeck(pool: readonly DraftCard[]): LimitedDeck {
  const defOf = (c: DraftCard) => CARD_DEFS[defIdOf(c.card) ?? ''];
  const rated = pool
    .map((c) => ({ c, def: defOf(c), r: cardRating(defOf(c), c.card.rarity) }))
    .filter((x) => x.def && x.r > 0 && !x.def.supertypes?.includes('Basic'));
  const fits = (colors: readonly string[]) => (x: (typeof rated)[number]) => cardColors(x.def).every((k) => colors.includes(k));
  const isLand = (x: (typeof rated)[number]) => !!x.def!.types.includes('land');
  const choices: Color[][] = [...PAIRS, ...COLORS.map((c) => [c])];
  const value = (colors: Color[]) =>
    rated
      .filter((x) => !isLand(x) && fits(colors)(x))
      .map((x) => x.r)
      .sort((a, b) => b - a)
      .slice(0, SPELLS)
      .reduce((n, r) => n + r, 0);
  const colors = choices.reduce((best, c) => (value(c) > value(best) ? c : best), choices[0]!);
  const playable = rated.filter(fits(colors));
  const spells = buildCurve(playable.filter((x) => !isLand(x)), (x) => manaValue(parseManaCost(x.def!.manaCost)), (x) => x.r, (x) => x.def!.types.includes('creature'));
  // Nonbasic lands in its colors (up to 3) take the place of basics.
  const lands = playable.filter(isLand).sort((a, b) => b.r - a.r).slice(0, 3);
  const deck: LimitedDeck = { cards: [...spells, ...lands].map((x) => x.c.uid), basics: noBasics() };
  deck.basics = suggestBasics(deck, pool);
  return deck;
}

/**
 * Up to 23 spells for a good curve: the best cards first, but no more than 5
 * costing 5 or more, and creatures preferred until there are 14 of them.
 */
function buildCurve<T>(cards: T[], mv: (x: T) => number, rating: (x: T) => number, creature: (x: T) => boolean): T[] {
  const ranked = [...cards].sort((a, b) => rating(b) - rating(a));
  const out: T[] = [];
  let expensive = 0;
  let creatures = 0;
  const take = (x: T) => {
    out.push(x);
    if (mv(x) >= 5) expensive++;
    if (creature(x)) creatures++;
  };
  // First pass: the best creatures and spells while keeping the curve and creature count in shape.
  for (const x of ranked) {
    if (out.length >= SPELLS) break;
    if (mv(x) >= 5 && expensive >= 5) continue;
    if (!creature(x) && out.length - creatures >= SPELLS - 14 && creatures < 14 && ranked.some((y) => creature(y) && !out.includes(y))) continue;
    take(x);
  }
  // Fill any gap with whatever is left, best first.
  for (const x of ranked) {
    if (out.length >= SPELLS) break;
    if (!out.includes(x)) take(x);
  }
  return out;
}
