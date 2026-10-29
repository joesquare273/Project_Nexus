// Browsing the collection: which cards to show (owned, unowned or all) and in
// what order (collector number, mana value, name, or color in WUBRG order).
// Pure functions, so the binder and its tests share them.

import type { BoosterCard } from '@nexus/cards/boosters';
import { CARD_DEFS, CARD_IDS_BY_NAME, FIN_PRECONS, SCRYFALL_PRINTINGS } from '@nexus/cards';
import { manaValue, parseManaCost } from '@nexus/engine';
import { owned, type Collection } from './collection.ts';

export type Show = 'all' | 'owned' | 'unowned';
export type SortBy = 'number' | 'manaValue' | 'name' | 'color';

export const SORTS: { by: SortBy; label: string }[] = [
  { by: 'number', label: 'Collector number' },
  { by: 'manaValue', label: 'Mana value' },
  { by: 'name', label: 'Name (A-Z)' },
  { by: 'color', label: 'Color (WUBRG)' },
];

/** Sets in the collection; ones that aren't finished show greyed out as Coming soon. */
export const SETS: { name: string; ready: boolean }[] = [
  { name: 'Final Fantasy', ready: true },
  { name: 'Edge of Eternities', ready: false },
];

/** Every printing the game knows (precons, Starter Kits), shown like booster cards. */
export const PRINTING_CARDS: BoosterCard[] = Object.values(SCRYFALL_PRINTINGS)
  .filter((p) => p.scryfallId)
  .map((p) => ({ id: p.scryfallId!, name: p.name, set: p.set, number: p.number, rarity: 'common', typeLine: p.typeLine, colors: [], border: 'black', finishes: ['nonfoil'], layout: 'normal', images: [p.image] }));

/** The four Final Fantasy Commander precons' printings, once each. */
export const PRECON_CARDS: BoosterCard[] = (() => {
  const byPrinting = new Map(PRINTING_CARDS.map((c) => [`${c.set}/${c.number}`, c]));
  const out = new Map<string, BoosterCard>();
  for (const deck of FIN_PRECONS) {
    for (const k of [deck.commander, ...deck.cards]) {
      const c = byPrinting.get(`${k.set}/${k.number}`);
      if (c) out.set(c.id, c);
    }
  }
  return [...out.values()];
})();

/** A card that isn't built in the engine yet: shown, but it can't be used in games. Tokens and art cards are never "unbuilt". */
export function isUnbuilt(c: BoosterCard): boolean {
  return !!CARD_DEFS[CARD_IDS_BY_NAME[c.name] ?? '']?.notBuilt;
}

/** A card's mana value, from its engine definition (tokens, art cards and lands are 0). */
export function manaValueOf(c: BoosterCard): number {
  const def = CARD_DEFS[CARD_IDS_BY_NAME[c.name] ?? ''];
  return def ? manaValue(parseManaCost(def.manaCost)) : 0;
}

const WUBRG = ['W', 'U', 'B', 'R', 'G'];

/** Color order: white, blue, black, red, green, then multicolor, colorless, and lands last. */
export function colorRank(c: BoosterCard): number {
  if (/\bLand\b/.test(c.typeLine) && !/Creature/.test(c.typeLine)) return 8;
  const colors = c.colors.length ? c.colors : colorsFromDefinition(c);
  if (colors.length === 0) return 6;
  if (colors.length > 1) return 5;
  return WUBRG.indexOf(colors[0]!);
}

/** Precon printings have no colors in their data; their engine definition does. */
function colorsFromDefinition(c: BoosterCard): string[] {
  const def = CARD_DEFS[CARD_IDS_BY_NAME[c.name] ?? ''];
  if (!def) return [];
  if (def.colors) return def.colors;
  const cost = parseManaCost(def.manaCost);
  return WUBRG.filter((k) => (cost[k as keyof typeof cost] ?? 0) > 0);
}

const byNumber = (a: BoosterCard, b: BoosterCard) => a.set.localeCompare(b.set) || parseInt(a.number, 10) - parseInt(b.number, 10) || a.number.localeCompare(b.number);
const byName = (a: BoosterCard, b: BoosterCard) => a.name.localeCompare(b.name);

/** The cards to show: filtered by ownership, then sorted (ties by name, then collector number). */
export function browse(cards: readonly BoosterCard[], collection: Collection, show: Show, sort: SortBy): BoosterCard[] {
  const shown = cards.filter((c) => show === 'all' || (owned(collection, c.id) > 0) === (show === 'owned'));
  const compare =
    sort === 'number'
      ? byNumber
      : sort === 'name'
        ? (a: BoosterCard, b: BoosterCard) => byName(a, b) || byNumber(a, b)
        : sort === 'manaValue'
          ? (a: BoosterCard, b: BoosterCard) => manaValueOf(a) - manaValueOf(b) || byName(a, b) || byNumber(a, b)
          : (a: BoosterCard, b: BoosterCard) => colorRank(a) - colorRank(b) || manaValueOf(a) - manaValueOf(b) || byName(a, b) || byNumber(a, b);
  return [...shown].sort(compare);
}

/** "2 nonfoil, 1 foil" for a card's finishes. */
export function finishText(collection: Collection, id: string): string {
  const n = collection.cards[id] ?? {};
  return (['nonfoil', 'foil', 'surge'] as const)
    .filter((f) => (n[f] ?? 0) > 0)
    .map((f) => `${n[f]} ${f === 'surge' ? 'surge foil' : f}`)
    .join(', ');
}
