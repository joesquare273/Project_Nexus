// The card database. Cards are data, not code: adding a card that uses
// existing effects means editing JSON only.

import type { CardDefId, CardDefinition } from '@nexus/engine';
import kitsData from '../data/fin-starter-kits.json' with { type: 'json' };
import fin from '../data/fin.json' with { type: 'json' };
import lands from '../data/lands.json' with { type: 'json' };
import testbed from '../data/testbed.json' with { type: 'json' };
import { validateCardList } from './validate.ts';

export { validateCardDefinition, validateCardList } from './validate.ts';

/** Real cards live in lands.json and fin.json; testbed.json holds placeholders. */
const all = [...lands, ...fin, ...testbed.cards];
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

/** Card ids by exact card name, for turning decklists into decks. */
export const CARD_IDS_BY_NAME: Record<string, CardDefId> = Object.fromEntries(CARDS.map((c) => [c.name, c.id]));

/**
 * A legal 60-card two-color testbed deck: 24 lands and 36 spells, mostly
 * placeholders plus the real Starter Kit cards implemented so far. Used by
 * the simulator, fuzz tests and `npm run play` until the kits are playable.
 */
export function testbedDeck(colors: 'RW' | 'UB'): CardDefId[] {
  const deck: CardDefId[] = [];
  const add = (id: CardDefId, n: number) => {
    for (let i = 0; i < n; i++) deck.push(id);
  };
  if (colors === 'RW') {
    add('mountain', 10);
    add('plains', 10);
    add('rabanastre-royal-city', 4);
    for (const id of ['tb-ember-pup', 'tb-kiln-duelist', 'tb-cinder-brute', 'tb-twin-blade']) add(id, 4);
    for (const id of ['tb-shield-knight', 'tb-bolt', 'tb-volley', 'tb-mend']) add(id, 4);
    add('tb-stone-warden', 3);
    add('graha-tia', 1);
  } else {
    add('island', 10);
    add('swamp', 10);
    add('treno-dark-city', 4);
    for (const id of ['tb-sky-gull', 'tb-reef-sentry', 'tb-ambusher', 'tb-study']) add(id, 4);
    for (const id of ['tb-grave-hulk', 'sephiroths-intervention', 'al-bhed-salvagers', 'shambling-cieth']) add(id, 3);
    for (const id of ['tb-bog-rat', 'tb-tide-wall', 'tb-drain']) add(id, 2);
    add('tb-doom', 1);
    add('ultimecia-temporal-threat', 1);
  }
  return deck;
}
