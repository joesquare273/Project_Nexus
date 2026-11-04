// Which printings can be dismantled for fragments and which can be crafted
// (docs/economy.md, "Crafting"). Rarity always comes from the printing's own
// Scryfall data; the amounts live in the server's economy configuration
// (packages/server/src/economy.ts), not here.
//
// - Dismantling: any owned printing of a real game card with a fragment
//   rarity (common, uncommon, rare, mythic). Basic lands, tokens and art
//   cards can't be dismantled.
// - Crafting: the regular printing of each card in the FINAL FANTASY set and
//   the four FINAL FANTASY Commander precons (nonbasic lands included), always
//   made non-foil (user decision 2026-11-04).

import { BOOSTER_CARDS, SECRET_LAIR_CARDS, type BoosterCard } from './boosters.ts';
import { CARD_DEFS, CARD_IDS_BY_NAME, FIN_PRECONS, SCRYFALL_PRINTINGS } from './index.ts';

/** The rarities with their own fragment currency, in the order they're shown. */
export const FRAGMENT_RARITIES = ['common', 'uncommon', 'rare', 'mythic'] as const;
export type FragmentRarity = (typeof FRAGMENT_RARITIES)[number];

/** Fragment balances by rarity (missing means 0). */
export type Fragments = Record<FragmentRarity, number>;
export const NO_FRAGMENTS: Fragments = { common: 0, uncommon: 0, rare: 0, mythic: 0 };

/** Every printing the game knows, by Scryfall id. */
const PRINTINGS = new Map<string, BoosterCard>([...BOOSTER_CARDS, ...SECRET_LAIR_CARDS].map((c) => [c.id, c]));

const isFragmentRarity = (r: string): r is FragmentRarity => (FRAGMENT_RARITIES as readonly string[]).includes(r);

/** A printing of a playable card: it has a game definition and isn't a token or a basic land. */
function isGameCard(c: BoosterCard): boolean {
  const def = CARD_DEFS[CARD_IDS_BY_NAME[c.name] ?? ''];
  return !!def && !def.token && !c.typeLine.startsWith('Basic Land') && !c.typeLine.includes('Token');
}

/** The printing's fragment rarity if it can be dismantled, else null. */
export function dismantleRarity(printingId: string): FragmentRarity | null {
  const c = PRINTINGS.get(printingId);
  return c && isGameCard(c) && isFragmentRarity(c.rarity) ? c.rarity : null;
}

/** The printing for a Scryfall id (any the game knows). */
export const printing = (id: string): BoosterCard | undefined => PRINTINGS.get(id);

/** Every printing id of the card with this name, for "your last copy" (any art counts). */
export function printingsNamed(name: string): string[] {
  return BY_NAME.get(name) ?? [];
}
const BY_NAME = new Map<string, string[]>();
for (const c of PRINTINGS.values()) BY_NAME.set(c.name, [...(BY_NAME.get(c.name) ?? []), c.id]);

/** The craftable printings: each set card's and precon card's regular printing, by name. */
export const CRAFTABLE: BoosterCard[] = (() => {
  const ids = new Set<string>();
  for (const deck of FIN_PRECONS) for (const c of [deck.commander, ...deck.cards]) {
    const id = SCRYFALL_PRINTINGS[`${c.set}/${c.number}`]?.scryfallId;
    if (id) ids.add(id);
  }
  for (const def of Object.values(CARD_DEFS)) {
    if (def.printing?.set !== 'fin') continue;
    const id = SCRYFALL_PRINTINGS[`fin/${def.printing.number}`]?.scryfallId;
    if (id) ids.add(id);
  }
  const out = new Map<string, BoosterCard>();
  for (const id of ids) {
    const c = PRINTINGS.get(id);
    // One printing per card name (a card in the set and in a precon is crafted once).
    if (c && isGameCard(c) && isFragmentRarity(c.rarity) && !out.has(c.name)) out.set(c.name, c);
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
})();

const CRAFTABLE_BY_ID = new Map(CRAFTABLE.map((c) => [c.id, c]));

/** The printing if it can be crafted, else undefined. */
export const craftable = (id: string): (BoosterCard & { rarity: FragmentRarity }) | undefined =>
  CRAFTABLE_BY_ID.get(id) as (BoosterCard & { rarity: FragmentRarity }) | undefined;
