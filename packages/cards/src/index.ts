// The card database. Cards are data, not code: adding a card that uses
// existing effects means editing JSON only.

import type { CardDefId, CardDefinition } from '@nexus/engine';
import kitsData from '../data/fin-starter-kits.json' with { type: 'json' };
import fin from '../data/fin.json' with { type: 'json' };
import lands from '../data/lands.json' with { type: 'json' };
import scryfall from '../data/scryfall.json' with { type: 'json' };
import { validateCardList } from './validate.ts';

export { validateCardDefinition, validateCardList } from './validate.ts';

/** Basic lands and Towns are in lands.json; every other Starter Kit card is in fin.json. */
const all = [...lands, ...fin];
const errors = validateCardList(all);
if (errors.length > 0) throw new Error(`Invalid card data:\n${errors.join('\n')}`);

export const CARDS = all as CardDefinition[];
export const CARD_DEFS: Record<CardDefId, CardDefinition> = Object.fromEntries(CARDS.map((c) => [c.id, c]));

export interface KitCard {
  name: string;
  count: number;
  set: string;
  number: string;
  implemented: boolean;
  /** Engine features this card needs before it can be implemented. */
  needs: string[];
}

export interface StarterKit {
  name: string;
  total: number;
  cards: KitCard[];
}

export const FIN_STARTER_KITS = kitsData.kits as StarterKit[];

/** Scryfall details for a real card: image links (loaded from Scryfall at runtime) and Oracle text. */
export interface ScryfallInfo {
  name: string;
  typeLine: string;
  oracleText: string;
  set: string;
  number: string;
  artist?: string;
  image: { small: string; normal: string; large: string; artCrop: string };
  scryfallUri: string;
}

/** By card id. Refresh with `npm run scryfall`. Placeholder cards have no entry. */
export const SCRYFALL: Record<CardDefId, ScryfallInfo> = scryfall;

/** Card ids by exact card name, for turning decklists into decks. */
export const CARD_IDS_BY_NAME: Record<string, CardDefId> = Object.fromEntries(CARDS.map((c) => [c.name, c.id]));

/**
 * One of the two Final Fantasy Starter Kit decks, exactly as printed: 60
 * cards, including cards that aren't built yet (see `notBuilt`). Used by the
 * browser game, the terminal game, the simulator and the fuzz tests.
 */
export function starterKitDeck(colors: 'RW' | 'UB'): CardDefId[] {
  const kit = FIN_STARTER_KITS.find((k) => k.name.endsWith(colors === 'RW' ? 'Red-White' : 'Blue-Black'))!;
  return kit.cards.flatMap((c) => {
    const id = CARD_IDS_BY_NAME[c.name];
    if (!id) throw new Error(`No card definition for "${c.name}".`);
    return Array<CardDefId>(c.count).fill(id);
  });
}
