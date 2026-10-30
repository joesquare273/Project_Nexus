// The Store tab (economy step E4): exclusive printings, divided by set. An
// item is one card or a bundle of cards, with a price (ECONOMY.storePrices);
// an item without a price shows "Price coming soon" and can't be bought.
// Sets that aren't ready show as Coming soon.

import { BOOSTER_CARDS, SECRET_LAIR_CARDS, SECRET_LAIR_DROPS, type BoosterCard, type Finish } from '@nexus/cards/boosters';
import { ECONOMY } from './economy.ts';
import { STARTER_CHOICES, preconCards } from './starter.ts';

export interface StoreItem {
  /** Stable id for buying: a card's Scryfall id, or a bundle's name. */
  key: string;
  name: string;
  /** What kind of item it is ("Chocobo Track foil", "Bundle of 5 basic lands"). */
  line: string;
  /** Shards, or null until a price is set. */
  price: number | null;
  /** The cards it adds (one copy each unless `count` says more). */
  cards: { id: string; finish: Finish; count?: number }[];
  /** The printing shown for it, when it's too many cards to show them all (a precon's commander). */
  cover?: string;
  /** A precon: also saved to the buyer's decks as a Commander deck with this commander. */
  deck?: { name: string; commander: string };
}

export interface StoreSet {
  name: string;
  ready: boolean;
  items: StoreItem[];
}

const chocoboTrack = (c: BoosterCard) => !!c.promoTypes?.includes('chocobotrackfoil');
const isBasic = (c: BoosterCard) => c.typeLine.startsWith('Basic Land');
const isLegendaryCreature = (c: BoosterCard) => /\bLegendary\b/.test(c.typeLine) && /\bCreature\b/.test(c.typeLine);

/** A Secret Lair card's finish when bought: non-foil if it's printed that way, else foil (the bonus cards). */
const secretLairFinish = (c: BoosterCard): Finish => (c.finishes.includes('nonfoil') ? 'nonfoil' : 'foil');

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
        // The Secret Lair drops: five cards non-foil and the bonus card (foil only).
        ...SECRET_LAIR_DROPS.map((drop) => ({
          key: `sld-drop-${drop.numbers[0]}`,
          name: drop.name,
          line: 'Secret Lair drop: 5 cards and a foil bonus card',
          price: prices.secretLairDrop,
          cards: [...drop.numbers, drop.bonus].map((n) => {
            const c = SECRET_LAIR_CARDS.find((p) => p.number === n)!;
            return { id: c.id, finish: secretLairFinish(c) };
          }),
        })),
        // Every Secret Lair card on its own.
        ...SECRET_LAIR_CARDS.map((c) => ({
          key: c.id,
          name: c.name,
          line: c.drop ? `Secret Lair (${c.drop.replace('Secret Lair x FINAL FANTASY: ', '')})` : 'Secret Lair',
          price: prices.secretLairSingle,
          cards: [{ id: c.id, finish: secretLairFinish(c) }],
        })),
        // The four FINAL FANTASY Commander precons, each saved as a deck when bought.
        ...STARTER_CHOICES.map((choice) => {
          const precon = preconCards(choice.name)!;
          const name = choice.name.replace(/\s*\(.*\)$/, '');
          return {
            key: `precon-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
            name: choice.name,
            line: `Commander precon (${choice.commander}): 100 cards, saved as a deck`,
            price: prices.precon,
            cards: precon.cards,
            cover: precon.commander,
            deck: { name, commander: precon.commander },
          };
        }),
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
