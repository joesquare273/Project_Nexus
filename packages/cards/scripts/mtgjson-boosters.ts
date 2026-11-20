// Saves a set's booster layouts from MTGJSON: each kind of pack (Play,
// Collector) as its weighted variants (how many cards from each sheet) and
// its print sheets (each card by Scryfall id, with its weight, and whether
// the sheet is foil). The Packs tab opens these packs from the saved file, so
// the game itself never downloads anything.
//
//   node packages/cards/scripts/mtgjson-boosters.ts sos   # Secrets of Strixhaven -> data/sos-boosters.json
//
// MTGJSON's set files are static downloads (no API rate limit). The cards on
// the sheets must be in data/booster-cards.json (npm run scryfall:boosters).

import { writeFileSync } from 'node:fs';

/** Each set: its booster file and the MTGJSON sets its sheets draw from. */
const SETS = {
  sos: { code: 'SOS', sources: ['SOS', 'SOA', 'SOC', 'SPG'], file: 'sos-boosters.json' },
} as const;

interface MtgjsonCard {
  uuid: string;
  identifiers: { scryfallId?: string };
}
interface MtgjsonBooster {
  boosters: { weight: number; contents: Record<string, number> }[];
  sheets: Record<string, { foil: boolean; cards: Record<string, number>; allowDuplicates?: boolean }>;
}

const which = (process.argv[2] ?? 'sos') as keyof typeof SETS;
const set = SETS[which];
if (!set) throw new Error(`Unknown set "${which}"; use ${Object.keys(SETS).join(' or ')}.`);

async function fetchSet(code: string): Promise<{ cards: MtgjsonCard[]; booster?: Record<string, MtgjsonBooster> }> {
  const res = await fetch(`https://mtgjson.com/api/v5/${code}.json`, { headers: { 'User-Agent': 'ProjectNexus/0.1 (personal project; booster import)' } });
  if (!res.ok) throw new Error(`${code}: ${res.status} ${res.statusText}`);
  return ((await res.json()) as { data: { cards: MtgjsonCard[]; booster?: Record<string, MtgjsonBooster> } }).data;
}

const main = await fetchSet(set.code);
const scryfall = new Map<string, string>();
for (const code of set.sources) {
  const data = code === set.code ? main : await fetchSet(code);
  for (const c of data.cards) if (c.identifiers.scryfallId) scryfall.set(c.uuid, c.identifiers.scryfallId);
}

const out: Record<string, unknown> = {};
for (const kind of ['play', 'collector'] as const) {
  const booster = main.booster?.[kind];
  if (!booster) throw new Error(`${set.code} has no ${kind} booster in MTGJSON.`);
  const sheets: Record<string, { foil: boolean; cards: [string, number][] }> = {};
  for (const [name, sheet] of Object.entries(booster.sheets)) {
    sheets[name] = {
      foil: sheet.foil,
      cards: Object.entries(sheet.cards).map(([uuid, weight]) => {
        const id = scryfall.get(uuid);
        if (!id) throw new Error(`${set.code} ${kind} sheet ${name}: no Scryfall id for ${uuid}.`);
        return [id, weight];
      }),
    };
  }
  out[kind] = { variants: booster.boosters.map((b) => ({ weight: b.weight, contents: b.contents })), sheets };
}
const OUT = new URL(`../data/${set.file}`, import.meta.url);
writeFileSync(OUT, JSON.stringify(out) + '\n');
console.log(`Saved ${set.code} Play and Collector Booster layouts to data/${set.file}.`);
