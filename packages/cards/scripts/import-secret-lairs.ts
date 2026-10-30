// Imports the Final Fantasy Secret Lair printings from Scryfall (one
// collection request) into data/secret-lair.json: each printing's details
// and images, its drop, and the Store groups. Cards no data file defines yet
// are added to data/store-cards.json, marked notBuilt, so they show (and can
// be collected) until they're built.
//
//   node packages/cards/scripts/import-secret-lairs.ts
//
// The game never calls Scryfall; this script is run by hand.

import { readFileSync, writeFileSync } from 'node:fs';
import type { CardDefinition } from '@nexus/engine';
import { CARDS } from '../src/index.ts';

/** The drops (June 2025) by Scryfall collector number, and their bonus cards; other FINAL FANTASY Secret Lair cards are sold as singles. */
export const DROPS: { name: string; numbers: string[]; bonus: string }[] = [
  { name: 'Secret Lair x FINAL FANTASY: Game Over', numbers: ['1858', '1859', '1860', '1861', '1862'], bonus: '7001' },
  { name: 'Secret Lair x FINAL FANTASY: Weapons', numbers: ['1863', '1864', '1865', '1866', '1867'], bonus: '7002' },
  { name: 'Secret Lair x FINAL FANTASY: Grimoire', numbers: ['1868', '1869', '1870', '1871', '1872'], bonus: '7003' },
];
const SINGLES = ['909', '7004', '7005', '7006', '7007', '7008'];

const HEADERS = { 'User-Agent': 'ProjectNexus/0.1 (personal project; card data script)', Accept: 'application/json', 'Content-Type': 'application/json' };

interface ScryfallCard {
  id: string;
  name: string;
  set: string;
  collector_number: string;
  rarity: string;
  type_line: string;
  mana_cost?: string;
  power?: string;
  toughness?: string;
  colors?: string[];
  color_identity: string[];
  keywords: string[];
  finishes: string[];
  promo_types?: string[];
  layout: string;
  artist?: string;
  border_color: string;
  image_uris?: { small: string; normal: string; large: string; art_crop: string };
  card_faces?: { image_uris?: { small: string; normal: string; large: string; art_crop: string } }[];
}

const numbers = [...DROPS.flatMap((d) => [...d.numbers, d.bonus]), ...SINGLES];
const res = await fetch('https://api.scryfall.com/cards/collection', {
  method: 'POST',
  headers: HEADERS,
  body: JSON.stringify({ identifiers: numbers.map((n) => ({ set: 'sld', collector_number: n })) }),
});
if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
const { data, not_found } = (await res.json()) as { data: ScryfallCard[]; not_found: unknown[] };
if (not_found.length) throw new Error(`Not found: ${JSON.stringify(not_found)}`);

const images = (c: ScryfallCard) => {
  const faces = c.image_uris ? [c.image_uris] : (c.card_faces ?? []).flatMap((f) => (f.image_uris ? [f.image_uris] : []));
  return faces.map((i) => ({ small: i.small, normal: i.normal, large: i.large, artCrop: i.art_crop }));
};
const dropOf = (n: string) => DROPS.find((d) => d.numbers.includes(n) || d.bonus === n)?.name;
const printings = data.map((c) => ({
  id: c.id,
  name: c.name,
  set: c.set,
  number: c.collector_number,
  rarity: c.rarity,
  typeLine: c.type_line,
  colors: c.colors ?? [],
  border: c.border_color,
  ...(c.promo_types?.length ? { promoTypes: c.promo_types } : {}),
  finishes: c.finishes,
  layout: c.layout,
  ...(c.artist ? { artist: c.artist } : {}),
  images: images(c),
  ...(dropOf(c.collector_number) ? { drop: dropOf(c.collector_number) } : {}),
}));
const OUT = new URL('../data/secret-lair.json', import.meta.url);
writeFileSync(OUT, JSON.stringify({ drops: DROPS, singles: SINGLES, printings }, null, 1) + '\n');

// Cards with no definition anywhere: a notBuilt definition so the card shows and can be collected.
const STORE = new URL('../data/store-cards.json', import.meta.url);
const store = JSON.parse(readFileSync(STORE, 'utf8')) as CardDefinition[];
const defined = new Set([...CARDS.map((c) => c.name), ...store.map((c) => c.name)]);
const idOf = (name: string) => name.toLowerCase().replace(/['’,.:!]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const KNOWN_TYPES = ['artifact', 'creature', 'enchantment', 'instant', 'land', 'planeswalker', 'sorcery', 'battle'];
for (const c of data) {
  if (defined.has(c.name)) continue;
  defined.add(c.name);
  const [front, sub = ''] = c.type_line.split(' — ');
  const words = front!.split(' ');
  const def: Record<string, unknown> = {
    id: idOf(c.name),
    name: c.name,
    types: words.map((w) => w.toLowerCase()).filter((w) => KNOWN_TYPES.includes(w)),
    ...(words.includes('Legendary') ? { supertypes: ['Legendary'] } : {}),
    ...(sub ? { subtypes: sub.split(' ') } : {}),
    ...(c.mana_cost ? { manaCost: c.mana_cost } : {}),
    ...(c.power !== undefined ? { power: Number(c.power) || 0, toughness: Number(c.toughness) || 0 } : {}),
    colorIdentity: c.color_identity,
    printing: { set: c.set, number: c.collector_number },
    notBuilt: true,
  };
  store.push(def as unknown as CardDefinition);
}
writeFileSync(STORE, '[\n' + store.map((c) => '  ' + JSON.stringify(c)).join(',\n') + '\n]\n');
console.log(`Saved ${printings.length} Secret Lair printings; ${store.length} cards in store-cards.json.`);
