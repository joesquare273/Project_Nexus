// Imports the Final Fantasy Commander precon decklists from MTGJSON and
// writes:
//   data/fic.json          card definitions for every card not already defined
//   data/fic-precons.json  the four decklists, with each card's build status
//
//   node packages/cards/scripts/import-precons.ts
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

import { writeFileSync } from 'node:fs';
import { KEYWORDS, type CardDefinition, type Color, type Keyword, type ManaType } from '@nexus/engine';
import fin from '../data/fin.json' with { type: 'json' };
import lands from '../data/lands.json' with { type: 'json' };
import tokens from '../data/tokens.json' with { type: 'json' };

/**
 * Cards defined outside fic.json (Starter Kit cards, lands, tokens). fic.json
 * itself is rewritten from scratch each run, so it must not count as existing.
 */
const CARDS = [...lands, ...fin, ...tokens] as CardDefinition[];
const CARD_IDS_BY_NAME: Record<string, string> = Object.fromEntries(CARDS.map((c) => [c.name, c.id]));

const DECK_FILES = [
  'LimitBreakFinalFantasyVii_FIC',
  'RevivalTranceFinalFantasyVi_FIC',
  'CounterBlitzFinalFantasyX_FIC',
  'ScionsSpellcraftFinalFantasyXiv_FIC',
];

interface MtgjsonCard {
  name: string;
  faceName?: string;
  side?: string;
  count: number;
  setCode: string;
  number: string;
  layout: string;
  manaCost?: string;
  types: string[];
  supertypes: string[];
  subtypes: string[];
  power?: string;
  toughness?: string;
  text?: string;
  keywords?: string[];
  colorIdentity: Color[];
}

interface MtgjsonDeck {
  name: string;
  commander: MtgjsonCard[];
  mainBoard: MtgjsonCard[];
}

const KEYWORD_NAMES = new Map<string, Keyword>(
  KEYWORDS.map((k) => [k.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(), k]),
);

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Rules text lines without reminder text. */
function lines(text: string | undefined): string[] {
  return (text ?? '')
    .split('\n')
    .map((l) => l.replace(/\s*\([^)]*\)/g, '').replace(/[’‘]/g, "'").trim())
    .filter(Boolean);
}

/** A line made only of supported keywords ("Flying, vigilance"), or null. */
function keywordLine(line: string): Keyword[] | null {
  const parts = line.split(/,\s*/).map((p) => p.toLowerCase().replace(/\.$/, ''));
  const out = parts.map((p) => KEYWORD_NAMES.get(p));
  return out.every((k): k is Keyword => k !== undefined) ? out : null;
}

const COLOR = '\\{([WUBRGC])\\}';
const MANA_LINE = /^\{T\}: Add ((?:\{[WUBRGC]\})(?:(?:,| or|, or) \{[WUBRGC]\})*)\.$/;
const PAIN_LINE = /^\{T\}: Add ((?:\{[WUBRGC]\})(?:(?:,| or|, or) \{[WUBRGC]\})*)\. This (?:land|artifact) deals 1 damage to you\.$/;
const DOUBLE_LINE = new RegExp(`^\\{T\\}: Add ${COLOR}${COLOR}\\.$`);
const ANY_COLOR = /^\{T\}: Add one mana of any color\.$/;
const IDENTITY = /^\{T\}: Add one mana of any color in your commander's color identity\.$/;
const OPPONENT_LANDS = /^\{T\}: Add one mana of any color that a land an opponent controls could produce\.$/;
const CHECKLAND = /^This land enters tapped unless you control an? (\w+) or an? (\w+)\.$/;
const BATTLE_LAND = /^This land enters tapped unless you control two or more basic lands\.$/;
const SNARL = /^As this land enters, you may reveal an? (\w+) or (?:an? )?(\w+) card from your hand\. If you don't, this land enters tapped\.$/;
const ETB_SCRY = /^When this (?:land|creature|artifact|enchantment) enters, scry (\d+)\.$/;
const SAC_DRAW = /^((?:\{[^}]+\})*)(?:, )?(\{T\}, )?Sacrifice this (?:artifact|land|creature|enchantment): Draw a card\.$/;
const FETCH_BASIC =
  /^\{T\}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle\.$/;
const CYCLING = /^Cycling (\{[^}]+\}(?:\{[^}]+\})*)$/;
const BASIC_LANDCYCLING = /^Basic landcycling (\{[^}]+\}(?:\{[^}]+\})*)$/;
const TYPECYCLING = /^(Plains|Island|Swamp|Mountain|Forest)cycling (\{[^}]+\}(?:\{[^}]+\})*)$/;

const colorsIn = (text: string) => [...text.matchAll(/\{([WUBRGC])\}/g)].map((m) => m[1] as ManaType);

/** Builds a definition from MTGJSON data; `built` says whether every ability is covered. */
function define(c: MtgjsonCard): { def: CardDefinition; built: boolean; needs: string[] } {
  const types = c.types.map((t) => t.toLowerCase()) as CardDefinition['types'];
  const def: CardDefinition = {
    id: slug(c.name),
    name: c.name,
    types,
    ...(c.supertypes.length ? { supertypes: c.supertypes as CardDefinition['supertypes'] } : {}),
    ...(c.subtypes.length ? { subtypes: c.subtypes } : {}),
    ...(c.manaCost && !types.includes('land') ? { manaCost: c.manaCost } : {}),
    ...(c.power !== undefined ? { power: Number(c.power) || 0, toughness: Number(c.toughness) || 0 } : {}),
    colorIdentity: c.colorIdentity,
    printing: { set: c.setCode.toLowerCase(), number: c.number },
  };
  const unhandled: string[] = [];
  const keywords: Keyword[] = [];
  const produces = new Set<ManaType>();
  const manaAbility: NonNullable<CardDefinition['manaAbility']> = {};
  const triggers: NonNullable<CardDefinition['triggers']> = [];
  const activated: NonNullable<CardDefinition['activated']> = [];
  let m: RegExpExecArray | null;
  for (const line of lines(c.text)) {
    const kws = keywordLine(line);
    if (kws && types.includes('creature')) keywords.push(...kws);
    else if (/^This land enters tapped\.$/.test(line)) def.entersTapped = true;
    else if ((m = PAIN_LINE.exec(line))) {
      for (const color of colorsIn(m[1]!)) produces.add(color);
      manaAbility.painFor = colorsIn(m[1]!);
    } else if ((m = MANA_LINE.exec(line))) for (const color of colorsIn(m[1]!)) produces.add(color);
    else if ((m = DOUBLE_LINE.exec(line)) && m[1] === m[2]) {
      produces.add(m[1] as ManaType);
      manaAbility.amount = 2;
    } else if (ANY_COLOR.test(line)) for (const color of ['W', 'U', 'B', 'R', 'G'] as const) produces.add(color);
    else if (IDENTITY.test(line)) manaAbility.commanderIdentity = true;
    else if (line.startsWith("{T}: Add one mana of any color in your commander's color identity. ")) {
      // The mana works; the extra sentence (Path of Ancestry's scry) isn't built yet.
      manaAbility.commanderIdentity = true;
      unhandled.push(line);
    }
    else if (OPPONENT_LANDS.test(line)) manaAbility.opponentLandColors = true;
    else if ((m = CHECKLAND.exec(line))) def.entersTappedUnless = { controlsSubtypes: [m[1]!, m[2]!] };
    else if (BATTLE_LAND.test(line)) def.entersTappedUnless = { basicLands: 2 };
    else if ((m = SNARL.exec(line))) def.entersTappedUnless = { revealSubtypes: [m[1]!, m[2]!] };
    else if ((m = ETB_SCRY.exec(line))) {
      triggers.push({ when: 'EntersBattlefield', effects: [{ effect: 'Scry', amount: Number(m[1]), target: 'You' }] });
    } else if ((m = SAC_DRAW.exec(line))) {
      activated.push({
        cost: { ...(m[1] ? { mana: m[1] } : {}), ...(m[2] ? { tap: true } : {}), sacrificeThis: true },
        effects: [{ effect: 'DrawCards', amount: 1, target: 'You' }],
      });
    } else if (FETCH_BASIC.test(line)) {
      activated.push({
        cost: { tap: true, sacrificeThis: true },
        effects: [
          {
            effect: 'SearchLibraryToBattlefield',
            target: 'You',
            filter: { types: ['land'], supertypes: ['Basic'] },
            entersTapped: true,
          },
        ],
      });
    } else if ((m = CYCLING.exec(line))) def.cycling = m[1]!;
    else if ((m = BASIC_LANDCYCLING.exec(line))) def.landcycling = { basic: true, cost: m[1]! };
    else if ((m = TYPECYCLING.exec(line))) def.landcycling = { subtype: m[1]!, cost: m[2]! };
    else unhandled.push(line);
  }
  if (keywords.length) def.keywords = keywords;
  if (produces.size) def.produces = [...produces];
  if (Object.keys(manaAbility).length) def.manaAbility = manaAbility;
  if (triggers.length) def.triggers = triggers;
  if (activated.length) def.activated = activated;

  let built = c.layout === 'normal' && unhandled.length === 0;
  // Instants and sorceries need their effects; permanents with nothing recognized have nothing to build from.
  if (types.includes('instant') || types.includes('sorcery')) built = false;
  // Variable power/toughness ("*") needs abilities that count things.
  if (c.power === '*' || c.toughness === '*') built = false;
  if (c.manaCost?.includes('{X}')) built = false;
  if (!built) {
    // Partly recognized cards keep what works (a land's mana), but not their abilities.
    delete def.triggers;
    delete def.activated;
    def.notBuilt = true;
  }

  const supported = new Set(KEYWORD_NAMES.keys());
  const needs = new Set<string>();
  if (!built) {
    if (c.layout !== 'normal') needs.add(c.layout);
    for (const k of c.keywords ?? []) if (!supported.has(k.toLowerCase())) needs.add(k.toLowerCase());
    for (const line of unhandled) {
      if (/^(When|Whenever|At the beginning)/.test(line)) needs.add('triggers');
      else if (/^[^.]*\{[^}]+\}[^.]*: /.test(line) || /^[A-Z][^:.]*: /.test(line)) needs.add('activated-abilities');
      else if (types.includes('instant') || types.includes('sorcery')) needs.add('spell-effects');
      else needs.add('static-abilities');
    }
    if (c.manaCost?.includes('{X}')) needs.add('x-costs');
    if (c.power === '*' || c.toughness === '*') needs.add('count-based-pt');
    if (needs.size === 0) needs.add('spell-effects');
  }
  return { def, built, needs: [...needs].map(slug) };
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
    } else {
      const { def, built, needs } = define(c);
      if (existingIds.has(def.id) || newDefs.has(def.id)) def.id = `${def.id}-fic`;
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

const dataDir = new URL('../data/', import.meta.url);
const defs = [...newDefs.values()];
writeFileSync(new URL('fic.json', dataDir), `[\n${defs.map((d) => `  ${JSON.stringify(d)}`).join(',\n')}\n]\n`);
writeFileSync(
  new URL('fic-precons.json', dataDir),
  `${JSON.stringify(
    {
      $comment:
        'Final Fantasy Commander precon decklists (source: MTGJSON, generated by scripts/import-precons.ts). Each deck is 100 cards: the commander plus `cards`. `needs` lists what a card still needs before it is built.',
      decks,
    },
    null,
    2,
  )}\n`,
);
const built = [...status.values()].filter((s) => s.implemented).length;
console.log(`\n${defs.length} new card definitions; ${built} of ${status.size} distinct cards fully built.`);
