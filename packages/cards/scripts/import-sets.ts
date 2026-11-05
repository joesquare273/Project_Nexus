// Imports a set's cards from MTGJSON and writes their definitions: every
// card that isn't already defined elsewhere (the Starter Kits, the precons,
// lands, tokens, the other imported sets).
//
//   node packages/cards/scripts/import-sets.ts        # Final Fantasy (FIN, FCA) -> data/fin-set.json
//   node packages/cards/scripts/import-sets.ts eoe    # Edge of Eternities (EOE) -> data/eoe-set.json
//
// MTGJSON's set files are static downloads (no API rate limit). Run
// `npm run scryfall` afterwards for images and Oracle text.
//
// Cards are built automatically only when the engine covers all of their
// text (see recognize.ts); the rest are marked `notBuilt`. Cards built by
// hand in a set's file are kept as they are when this runs again.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import type { CardDefinition } from '@nexus/engine';
import { define, type MtgjsonCard } from './recognize.ts';
import eoc from '../data/eoc.json' with { type: 'json' };
import fic from '../data/fic.json' with { type: 'json' };
import fin from '../data/fin.json' with { type: 'json' };
import lands from '../data/lands.json' with { type: 'json' };
import tokens from '../data/tokens.json' with { type: 'json' };

/** Each import: its sets, which collector numbers are the set's own cards (not showcase variants), and the output file. */
const IMPORTS = {
  fin: { sets: [{ code: 'FIN', maxNumber: 309 }, { code: 'FCA', maxNumber: 64 }], file: 'fin-set.json' },
  // 1-276: the main set with its basic lands; 277+ are borderless, extended-art and Japan Showcase variants.
  eoe: { sets: [{ code: 'EOE', maxNumber: 276 }], file: 'eoe-set.json' },
} as const;
const which = (process.argv[2] ?? 'fin') as keyof typeof IMPORTS;
if (!IMPORTS[which]) throw new Error(`Unknown import "${which}"; use ${Object.keys(IMPORTS).join(' or ')}.`);
const SETS = IMPORTS[which].sets;
const OUT = new URL(`../data/${IMPORTS[which].file}`, import.meta.url);

/** Sets imported before this one (earlier in IMPORTS): a card they already define (a reprint) isn't defined again. */
const order = Object.keys(IMPORTS) as (keyof typeof IMPORTS)[];
const otherSets = order
  .slice(0, order.indexOf(which))
  .map((k) => IMPORTS[k])
  .map((i) => new URL(`../data/${i.file}`, import.meta.url))
  .filter((u) => existsSync(u))
  .flatMap((u) => JSON.parse(readFileSync(u, 'utf8')) as CardDefinition[]);

/** Cards defined elsewhere keep their definitions; this set's file only adds what's missing. */
const OTHER = [...lands, ...fin, ...fic, ...eoc, ...tokens, ...otherSets] as CardDefinition[];
const definedNames = new Set(OTHER.map((c) => c.name));
const usedIds = new Set(OTHER.map((c) => c.id));

/** Cards already built by hand in this set's file survive a re-import. */
const previous = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, 'utf8')) as CardDefinition[]) : [];
const handBuilt = new Map(previous.filter((d) => !d.notBuilt).map((d) => [d.name, d]));

async function fetchSet(code: string): Promise<MtgjsonCard[]> {
  const res = await fetch(`https://mtgjson.com/api/v5/${code}.json`, {
    headers: { 'User-Agent': 'ProjectNexus/0.1 (personal project; set import)' },
  });
  if (!res.ok) throw new Error(`${res.status} for ${code}`);
  return ((await res.json()) as { data: { cards: MtgjsonCard[] } }).data.cards;
}

const defs: CardDefinition[] = [];
const seen = new Set<string>();
let built = 0;
for (const { code, maxNumber } of SETS) {
  const cards = (await fetchSet(code))
    // The set's own numbers (variants share names), front faces only.
    .filter((c) => /^\d+$/.test(c.number) && Number(c.number) <= maxNumber && (!c.side || c.side === 'a'))
    .sort((a, b) => Number(a.number) - Number(b.number));
  let added = 0;
  for (const card of cards) {
    // A meld card is named by its own face, not "Face // Melded result" (as on Scryfall and the card).
    const c = card.layout === 'meld' && card.faceName ? { ...card, name: card.faceName } : card;
    if (seen.has(c.name) || definedNames.has(c.name)) continue;
    seen.add(c.name);
    const kept = handBuilt.get(c.name);
    const def = kept ?? define({ ...c, count: 1 }).def;
    if (!kept && usedIds.has(def.id)) def.id = `${def.id}-${code.toLowerCase()}`;
    usedIds.add(def.id);
    defs.push(def);
    if (!def.notBuilt) built++;
    added++;
  }
  console.log(`${code}: ${added} new definitions`);
}

writeFileSync(OUT, `[\n${defs.map((d) => `  ${JSON.stringify(d)}`).join(',\n')}\n]\n`);
console.log(`\n${defs.length} definitions in ${IMPORTS[which].file}; ${built} fully built, ${defs.length - built} not built yet.`);
