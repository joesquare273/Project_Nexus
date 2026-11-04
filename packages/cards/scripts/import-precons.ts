// Imports Commander precon decklists from MTGJSON and writes, for a set:
//   data/<set>.json          card definitions for every card not already defined
//                            (cards already built there are kept as they are)
//   data/<set>-precons.json  the decklists, with each card's build status
//
//   node packages/cards/scripts/import-precons.ts        # FINAL FANTASY (fic)
//   node packages/cards/scripts/import-precons.ts eoc    # Edge of Eternities (eoc)
//
// MTGJSON's deck files are static downloads (no API rate limit). Card data
// comes from them too; run `npm run scryfall` afterwards for images.
//
// Cards are built automatically only when the engine already covers all of
// their rules text: keyword-only creatures and the common Commander mana
// cards (pain lands, checklands, battle lands, snarls, temples, Sol Ring,
// Arcane Signet, Command Tower, Mind Stone, Evolving Wilds, cycling...).
// Everything else is marked `notBuilt` with what it still needs; lands and
// mana sources still make the mana that was recognized.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { CardDefinition } from '@nexus/engine';
import { define, type MtgjsonCard } from './recognize.ts';
import fic from '../data/fic.json' with { type: 'json' };
import fin from '../data/fin.json' with { type: 'json' };
import finSet from '../data/fin-set.json' with { type: 'json' };
import lands from '../data/lands.json' with { type: 'json' };
import storeCards from '../data/store-cards.json' with { type: 'json' };
import tokens from '../data/tokens.json' with { type: 'json' };

const SETS = {
  fic: {
    label: 'Final Fantasy Commander',
    files: ['LimitBreakFinalFantasyVii_FIC', 'RevivalTranceFinalFantasyVi_FIC', 'CounterBlitzFinalFantasyX_FIC', 'ScionsSpellcraftFinalFantasyXiv_FIC'],
    // fic.json itself is rewritten each run, so it must not count as existing.
    existing: [...lands, ...fin, ...tokens],
  },
  eoc: {
    label: 'Edge of Eternities Commander',
    files: ['CounterIntelligence_EOC', 'WorldShaper_EOC'],
    // Cards any other file defines are shared (Sol Ring, Command Tower...).
    existing: [...lands, ...fin, ...fic, ...finSet, ...storeCards, ...tokens],
  },
} as const;
const SET = (process.argv[2] ?? 'fic') as keyof typeof SETS;
if (!SETS[SET]) throw new Error(`Unknown precon set "${SET}" (${Object.keys(SETS).join(', ')}).`);
const dataDir = new URL('../data/', import.meta.url);
const OWN_FILE = new URL(`${SET}.json`, dataDir);

/** Cards defined outside this set's own file (Starter Kit cards, lands, tokens, other sets). */
const CARDS = SETS[SET].existing as CardDefinition[];
const CARD_IDS_BY_NAME: Record<string, string> = Object.fromEntries(CARDS.map((c) => [c.name, c.id]));

/**
 * Precon cards already built in this set's file (by hand, group by group)
 * are kept as they are; only unbuilt cards are regenerated.
 */
const OWN: CardDefinition[] = SET === 'fic' ? (fic as CardDefinition[]) : existsSync(OWN_FILE) ? JSON.parse(readFileSync(OWN_FILE, 'utf8')) : [];
const BUILT_FIC = new Map(OWN.filter((d) => !d.notBuilt).map((d) => [d.name, d]));

const DECK_FILES = SETS[SET].files;


interface MtgjsonDeck {
  name: string;
  commander: MtgjsonCard[];
  mainBoard: MtgjsonCard[];
}

async function fetchDeck(file: string): Promise<MtgjsonDeck> {
  const res = await fetch(`https://mtgjson.com/api/v5/decks/${file}.json`, {
    headers: { 'User-Agent': 'ProjectNexus/0.1 (personal project; precon import)' },
  });
  if (!res.ok) throw new Error(`${res.status} for ${file}`);
  return ((await res.json()) as { data: MtgjsonDeck }).data;
}

const existingIds = new Set(CARDS.map((c) => c.id));
const newDefs = new Map<string, CardDefinition>();
const status = new Map<string, { implemented: boolean; needs: string[] }>();

function cardEntry(c: MtgjsonCard) {
  if (!status.has(c.name)) {
    const known = CARD_IDS_BY_NAME[c.name];
    if (known) {
      const def = CARDS.find((d) => d.id === known)!;
      status.set(c.name, { implemented: !def.notBuilt, needs: def.notBuilt ? ['abilities'] : [] });
    } else if (BUILT_FIC.has(c.name)) {
      const def = BUILT_FIC.get(c.name)!;
      newDefs.set(def.id, def);
      status.set(c.name, { implemented: true, needs: [] });
    } else {
      const { def, built, needs } = define(c);
      if (existingIds.has(def.id) || newDefs.has(def.id)) def.id = `${def.id}-${SET}`;
      newDefs.set(def.id, def);
      status.set(c.name, { implemented: built, needs });
    }
  }
  const s = status.get(c.name)!;
  return { name: c.name, count: c.count, set: c.setCode.toLowerCase(), number: c.number, ...s };
}

/** Adventure cards appear once per face; keep the main face only. */
function mainFaces(cards: MtgjsonCard[]): MtgjsonCard[] {
  return cards.filter((c) => !c.side || c.side === 'a');
}

const decks = [];
for (const file of DECK_FILES) {
  const deck = await fetchDeck(file);
  const commander = deck.commander[0]!;
  decks.push({
    name: deck.name,
    commander: cardEntry(commander),
    colorIdentity: commander.colorIdentity,
    cards: mainFaces(deck.mainBoard).map(cardEntry),
  });
  console.log(`${deck.name}: ${commander.name}`);
}

const defs = [...newDefs.values()];
writeFileSync(OWN_FILE, `[\n${defs.map((d) => `  ${JSON.stringify(d)}`).join(',\n')}\n]\n`);
writeFileSync(
  new URL(`${SET}-precons.json`, dataDir),
  `${JSON.stringify(
    {
      $comment: `${SETS[SET].label} precon decklists (source: MTGJSON, generated by scripts/import-precons.ts${SET === 'fic' ? '' : ' ' + SET}). Each deck is 100 cards: the commander plus \`cards\`. \`needs\` lists what a card still needs before it is built.`,
      decks,
    },
    null,
    2,
  )}\n`,
);
const built = [...status.values()].filter((s) => s.implemented).length;
console.log(`\n${defs.length} new card definitions; ${built} of ${status.size} distinct cards fully built.`);
