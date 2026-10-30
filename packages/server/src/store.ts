// The Store tab (economy step E4): exclusive printings, divided by set. An
// item is one card or a bundle of cards, with a price (ECONOMY.storePrices);
// an item without a price shows "Price coming soon" and can't be bought.
// Sets that aren't ready show as Coming soon.

import { BOOSTER_CARDS, type BoosterCard, type Finish } from '@nexus/cards/boosters';
import { ECONOMY } from './economy.ts';

export interface StoreItem {
  /** Stable id for buying: a card's Scryfall id, or a bundle's name. */
  key: string;
  name: string;
  /** What kind of item it is ("Chocobo Track foil", "Bundle of 5 basic lands"). */
  line: string;
  /** Shards, or null until a price is set. */
  price: number | null;
  /** The cards it adds, one copy each. */
  cards: { id: string; finish: Finish }[];
}

export interface StoreSet {
  name: string;
  ready: boolean;
  items: StoreItem[];
}

const chocoboTrack = (c: BoosterCard) => !!c.promoTypes?.includes('chocobotrackfoil');
const isBasic = (c: BoosterCard) => c.typeLine.startsWith('Basic Land');
const isLegendaryCreature = (c: BoosterCard) => /\bLegendary\b/.test(c.typeLine) && /\bCreature\b/.test(c.typeLine);

/** Every set in the Store, in the order the tabs show them. */
export function storeSets(): StoreSet[] {
  const prices = ECONOMY.storePrices;
  const track = BOOSTER_CARDS.filter(chocoboTrack);
  const lands = track.filter(isBasic);
  return [
    {
      name: 'Final Fantasy',
      ready: true,
      items: [
        // Each Chocobo Track foil on its own (Store-only: not in Collector Boosters here).
        ...track
          .filter((c) => !isBasic(c))
          .map((c) => ({
            key: c.id,
            name: c.name,
            line: 'Chocobo Track foil',
            price: isLegendaryCreature(c) ? prices.chocoboTrackLegendary : prices.chocoboTrackOther,
            cards: [{ id: c.id, finish: 'foil' as const }],
          })),
        // The five Chocobo Track basic lands, sold together.
        {
          key: 'fin-chocobo-track-lands',
          name: 'Chocobo Track basic lands',
          line: `Bundle of ${lands.length} basic lands, Chocobo Track foil`,
          price: prices.chocoboTrackLandBundle,
          cards: lands.map((c) => ({ id: c.id, finish: 'foil' as const })),
        },
      ],
    },
    { name: 'Edge of Eternities', ready: false, items: [] },
  ];
}

/** The item with this key, from a ready set, or undefined. */
export function storeItem(key: string): StoreItem | undefined {
  return storeSets()
    .filter((s) => s.ready)
    .flatMap((s) => s.items)
    .find((i) => i.key === key);
}
