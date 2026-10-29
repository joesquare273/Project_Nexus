// Limited deckbuilding (draft and sealed): a deck is cards from your pool plus
// any number of basic lands, at least 40 cards. Helpers to check a deck,
// suggest its lands, and build the AI's deck from its picks.

import type { CardDefId } from '@nexus/engine';
import { CARD_DEFS } from './index.ts';
import { aiScore, cardColors, defIdOf, type DraftCard } from './draft.ts';

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

/**
 * The AI's deck from its picks: its two main colors, its 23 best cards it can
 * cast in them (colorless cards and nonbasic lands too), and basic lands.
 */
export function aiDeck(pool: readonly DraftCard[]): LimitedDeck {
  const defOf = (c: DraftCard) => CARD_DEFS[defIdOf(c.card) ?? ''];
  const counts: Record<string, number> = {};
  for (const c of pool) for (const color of cardColors(defOf(c))) counts[color] = (counts[color] ?? 0) + aiScore(c, []);
  const main = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([c]) => c);
  const castable = pool.filter((c) => {
    const def = defOf(c);
    if (!def || def.supertypes?.includes('Basic') || def.uncastable) return false;
    if (def.notBuilt && !def.types.includes('creature') && !def.types.includes('land')) return false;
    return cardColors(def).every((color) => main.includes(color));
  });
  const ranked = [...castable].sort((a, b) => aiScore(b, pool) - aiScore(a, pool));
  const isLand = (c: DraftCard) => !!defOf(c)?.types.includes('land');
  // 23 spells and 17 lands: nonbasic lands in its colors (up to 3) count toward the 17.
  const spells = ranked.filter((c) => !isLand(c)).slice(0, MIN_DECK_SIZE - LAND_TARGET);
  const lands = ranked.filter(isLand).slice(0, 3);
  const deck: LimitedDeck = { cards: [...spells, ...lands].map((c) => c.uid), basics: noBasics() };
  deck.basics = suggestBasics(deck, pool);
  return deck;
}
