// The Store tab (economy step E4): exclusive printings bought one at a time,
// divided by set. Each set lists what it sells and its prices
// (ECONOMY.storePrices); an item without a price yet shows "Price coming
// soon" and can't be bought. Sets that aren't ready show as Coming soon.

import { BOOSTER_CARDS, type BoosterCard, type Finish } from '@nexus/cards/boosters';
import { ECONOMY } from './economy.ts';

export interface StoreItem {
  /** Scryfall printing id. */
  id: string;
  name: string;
  finish: Finish;
  /** What kind of item it is, for its price ("Chocobo Track foil"). */
  line: string;
  /** Shards, or null until a price is set. */
  price: number | null;
}

export interface StoreSet {
  name: string;
  ready: boolean;
  items: StoreItem[];
}

const chocoboTrack = (c: BoosterCard) => !!c.promoTypes?.includes('chocobotrackfoil');

/** Every set in the Store, in the order the tabs show them. */
export function storeSets(): StoreSet[] {
  return [
    {
      name: 'Final Fantasy',
      ready: true,
      // Every Chocobo Track foil printing of the release (main set and Commander, basic lands included).
      items: BOOSTER_CARDS.filter(chocoboTrack).map((c) => ({
        id: c.id,
        name: c.name,
        finish: 'foil',
        line: 'Chocobo Track foil',
        price: ECONOMY.storePrices.chocoboTrackFoil,
      })),
    },
    { name: 'Edge of Eternities', ready: false, items: [] },
  ];
}

/** The item for a printing id, from a ready set, or undefined. */
export function storeItem(id: string): StoreItem | undefined {
  return storeSets()
    .filter((s) => s.ready)
    .flatMap((s) => s.items)
    .find((i) => i.id === id);
}
