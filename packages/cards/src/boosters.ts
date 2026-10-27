// Booster packs for the Packs tab: every printing of the Final Fantasy sets
// (saved from Scryfall by scripts/booster-data.ts) sorted into print sheets,
// and packs drawn from them slot by slot. Slot odds follow Wizards'
// "Collecting Final Fantasy" article; Scene Box cards, which aren't in real
// boosters, are added at small odds of our own (see docs/packs.md).
//
// Packs are only for collecting: opening them never changes the playable
// card pool. The client loads this module on demand (it holds every printing).

import data from '../data/booster-cards.json' with { type: 'json' };

export type Rarity = 'common' | 'uncommon' | 'rare' | 'mythic' | 'special' | 'bonus';

export interface BoosterCard {
  /** Scryfall id of this exact printing. */
  id: string;
  name: string;
  set: string;
  number: string;
  rarity: Rarity;
  typeLine: string;
  colors: string[];
  border: string;
  frameEffects?: string[];
  promoTypes?: string[];
  /** 'nonfoil', 'foil' and/or 'etched'. */
  finishes: string[];
  fullArt?: true;
  /** Scryfall says it can appear in boosters. */
  booster?: true;
  layout: string;
  artist?: string;
  /** One image per face (two for double-faced tokens and cards). */
  images: { small: string; normal: string; large: string; artCrop: string }[];
}

export const BOOSTER_CARDS = data as BoosterCard[];

export type PackKind = 'play' | 'collector';
export type Finish = 'nonfoil' | 'foil' | 'surge';

/** One card pulled from a pack. */
export interface Pull {
  card: BoosterCard;
  finish: Finish;
  /** Art cards: gold-stamped. */
  stamped?: true;
  /** What the slot is, for the odds screen and the reveal ("Rare", "Foil", "Through the Ages"...). */
  slot: string;
  /** How special the pull is, for the reveal: 0 plain, 1 rare, 2 mythic or showcase, 3 chase. */
  hype: 0 | 1 | 2 | 3;
}

export interface Pack {
  kind: PackKind;
  cards: Pull[];
}

/** A random number in [0, 1). Tests pass a seeded one. */
export type Rng = () => number;

const num = (c: BoosterCard) => parseInt(c.number, 10);
const isLand = (c: BoosterCard) => /\bLand\b/.test(c.typeLine);
const promo = (c: BoosterCard, p: string) => !!c.promoTypes?.includes(p);

/** The print sheets each slot draws from. */
export interface Sheets {
  commons: BoosterCard[];
  commonLands: BoosterCard[];
  basics: BoosterCard[];
  uncommons: BoosterCard[];
  cid: BoosterCard[];
  rares: BoosterCard[];
  mythics: BoosterCard[];
  /** Borderless Booster Fun (woodblock, character, artist): FIN 310–406. */
  borderless: Record<'common' | 'uncommon' | 'rare' | 'mythic', BoosterCard[]>;
  /** Extended-art legends: FIN 421–518. */
  extended: Record<'uncommon' | 'rare' | 'mythic', BoosterCard[]>;
  /** Surge foil borderless characters: FIN 519–550. */
  surge: Record<'uncommon' | 'rare' | 'mythic', BoosterCard[]>;
  throughTheAges: Record<'uncommon' | 'rare' | 'mythic', BoosterCard[]>;
  /** The Commander set's Booster Fun cards found in Collector Boosters (extended art and borderless). */
  commanderFun: Record<'rare' | 'mythic', BoosterCard[]>;
  /** The Commander set's surge foil borderless mythics. */
  commanderSurge: BoosterCard[];
  /** Secret Rendezvous alternate arts. */
  rendezvous: BoosterCard[];
  /** Traveling Chocobo variants and Chocobo track foils. */
  chocobo: BoosterCard[];
  goldenChocobo: BoosterCard[];
  /** Scene Box cards (not in real boosters; our addition). */
  scene: BoosterCard[];
  sceneArt: BoosterCard[];
  tokens: BoosterCard[];
  surgeTokens: BoosterCard[];
  artCards: BoosterCard[];
}

export function buildSheets(cards: readonly BoosterCard[] = BOOSTER_CARDS): Sheets {
  const fin = cards.filter((c) => c.set === 'fin');
  const main = fin.filter((c) => c.booster && num(c) <= 309);
  const byRarity = <R extends string>(list: BoosterCard[], rarities: readonly R[]) =>
    Object.fromEntries(rarities.map((r) => [r, list.filter((c) => c.rarity === r)])) as Record<R, BoosterCard[]>;
  const fic = cards.filter((c) => c.set === 'fic');
  return {
    commons: main.filter((c) => c.rarity === 'common' && !isLand(c)),
    commonLands: main.filter((c) => c.rarity === 'common' && isLand(c) && !c.fullArt),
    basics: main.filter((c) => c.fullArt && isLand(c)),
    uncommons: main.filter((c) => c.rarity === 'uncommon'),
    cid: fin.filter((c) => num(c) >= 407 && num(c) <= 420),
    rares: main.filter((c) => c.rarity === 'rare'),
    mythics: main.filter((c) => c.rarity === 'mythic'),
    borderless: byRarity(fin.filter((c) => num(c) >= 310 && num(c) <= 406 && c.border === 'borderless'), ['common', 'uncommon', 'rare', 'mythic'] as const),
    extended: byRarity(fin.filter((c) => c.frameEffects?.includes('extendedart') && num(c) >= 421 && num(c) <= 518), ['uncommon', 'rare', 'mythic'] as const),
    surge: byRarity(fin.filter((c) => num(c) >= 519 && num(c) <= 550 && promo(c, 'surgefoil')), ['uncommon', 'rare', 'mythic'] as const),
    throughTheAges: byRarity(cards.filter((c) => c.set === 'fca'), ['uncommon', 'rare', 'mythic'] as const),
    commanderFun: byRarity(fic.filter((c) => num(c) >= 101 && num(c) <= 208 && promo(c, 'boosterfun') && !promo(c, 'surgefoil')), ['rare', 'mythic'] as const),
    commanderSurge: fic.filter((c) => num(c) >= 209 && num(c) <= 216),
    rendezvous: fic.filter((c) => num(c) >= 217 && num(c) <= 219),
    chocobo: [
      ...fin.filter((c) => /^551[a-d]$/.test(c.number) || (promo(c, 'chocobotrackfoil') && num(c) >= 564)),
      ...fic.filter((c) => promo(c, 'chocobotrackfoil') && num(c) >= 466 && num(c) <= 477),
    ],
    goldenChocobo: fin.filter((c) => promo(c, 'serialized')),
    scene: fic.filter((c) => num(c) >= 442 && num(c) <= 465),
    sceneArt: cards.filter((c) => c.set === 'afic'),
    tokens: cards.filter((c) => c.set === 'tfin' && num(c) <= 24),
    surgeTokens: cards.filter((c) => c.set === 'tfin' && promo(c, 'surgefoil')),
    artCards: cards.filter((c) => c.set === 'afin'),
  };
}

/** One outcome of a slot: its chance (any scale), the sheet, the finish and how special it is. */
export interface Outcome {
  label: string;
  weight: number;
  sheet: (s: Sheets) => BoosterCard[];
  finish: Finish;
  hype: Pull['hype'];
  stamped?: true;
}
export interface Slot {
  name: string;
  outcomes: Outcome[];
}

const o = (label: string, weight: number, sheet: Outcome['sheet'], finish: Finish = 'nonfoil', hype: Pull['hype'] = 0, extra: Partial<Outcome> = {}): Outcome => ({ label, weight, sheet, finish, hype, ...extra });

const COMMON: Slot = { name: 'Common', outcomes: [o('Common', 1, (s) => s.commons)] };
const UNCOMMON: Slot = {
  name: 'Uncommon',
  outcomes: [
    o('Uncommon', 98.8, (s) => s.uncommons),
    o('Cid, Timeless Artificer variant', 0.9, (s) => s.cid, 'nonfoil', 1),
    o('Borderless uncommon', 0.3, (s) => s.borderless.uncommon, 'nonfoil', 1),
  ],
};

/** Play Booster: 14 Magic cards and a token or art card (Wizards' odds; Scene Box cards are ours). */
export const PLAY_BOOSTER: Slot[] = [
  ...Array.from({ length: 6 }, () => COMMON),
  {
    name: 'Common or Through the Ages',
    outcomes: [
      o('Common', 200, (s) => s.commons),
      o('Through the Ages uncommon', 63.25, (s) => s.throughTheAges.uncommon, 'nonfoil', 1),
      o('Through the Ages rare', 29.75, (s) => s.throughTheAges.rare, 'nonfoil', 2),
      o('Through the Ages mythic', 7, (s) => s.throughTheAges.mythic, 'nonfoil', 2),
    ],
  },
  UNCOMMON,
  UNCOMMON,
  UNCOMMON,
  {
    name: 'Wildcard',
    outcomes: [
      o('Common', 16.7, (s) => s.commons),
      o('Uncommon', 58.3, (s) => s.uncommons),
      o('Borderless common', 2.6, (s) => s.borderless.common, 'nonfoil', 1),
      o('Borderless uncommon', 5.7, (s) => s.borderless.uncommon, 'nonfoil', 1),
      o('Rare', 14.6, (s) => s.rares, 'nonfoil', 1),
      o('Mythic', 2.1, (s) => s.mythics, 'nonfoil', 2),
    ],
  },
  {
    name: 'Rare',
    outcomes: [
      o('Rare', 79, (s) => s.rares, 'nonfoil', 1),
      o('Mythic', 10, (s) => s.mythics, 'nonfoil', 2),
      o('Borderless rare', 8.5, (s) => s.borderless.rare, 'nonfoil', 2),
      o('Borderless mythic', 1.5, (s) => s.borderless.mythic, 'nonfoil', 3),
      o('Scene Box card', 1, (s) => s.scene, 'nonfoil', 3),
    ],
  },
  {
    name: 'Foil',
    outcomes: [
      o('Foil common', 55.75, (s) => s.commons, 'foil'),
      o('Foil uncommon', 35.9, (s) => s.uncommons, 'foil'),
      o('Foil rare', 5.5, (s) => s.rares, 'foil', 1),
      o('Foil mythic', 0.75, (s) => s.mythics, 'foil', 2),
      o('Foil borderless common', 0.1, (s) => s.borderless.common, 'foil', 1),
      o('Foil borderless uncommon', 0.5, (s) => s.borderless.uncommon, 'foil', 1),
      o('Foil borderless rare', 1, (s) => s.borderless.rare, 'foil', 2),
      o('Foil borderless mythic', 0.25, (s) => s.borderless.mythic, 'foil', 3),
      o('Foil Cid variant', 0.25, (s) => s.cid, 'foil', 2),
    ],
  },
  {
    name: 'Land',
    outcomes: [
      o('Common dual land', 44, (s) => s.commonLands),
      o('Foil common dual land', 11, (s) => s.commonLands, 'foil'),
      o('Basic land', 36, (s) => s.basics),
      o('Foil basic land', 9, (s) => s.basics, 'foil'),
    ],
  },
  {
    name: 'Token or art card',
    outcomes: [
      o('Double-sided token', 65, (s) => s.tokens),
      o('Art card', 25, (s) => s.artCards),
      o('Scene Box art card', 5, (s) => s.sceneArt, 'nonfoil', 1),
      o('Gold-stamped art card', 5, (s) => s.artCards, 'nonfoil', 1, { stamped: true }),
    ],
  },
];

export const BOOSTERS: Record<PackKind, Slot[]> = { play: PLAY_BOOSTER, collector: [] };

function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))]!;
}

/** Draws one outcome by weight, skipping outcomes whose sheet is empty. */
export function rollSlot(slot: Slot, sheets: Sheets, rng: Rng): Pull {
  const live = slot.outcomes.filter((x) => x.sheet(sheets).length > 0);
  const total = live.reduce((n, x) => n + x.weight, 0);
  let roll = rng() * total;
  const outcome = live.find((x) => (roll -= x.weight) < 0) ?? live.at(-1)!;
  return {
    card: pick(rng, outcome.sheet(sheets)),
    finish: outcome.finish,
    slot: outcome.label,
    hype: outcome.hype,
    ...(outcome.stamped ? { stamped: true as const } : {}),
  };
}

let cachedSheets: Sheets | undefined;

/** Opens one pack. In a pack, no card repeats within the commons or within the uncommons (as in print). */
export function openPack(kind: PackKind, rng: Rng = Math.random, sheets: Sheets = (cachedSheets ??= buildSheets())): Pack {
  const cards: Pull[] = [];
  for (const slot of BOOSTERS[kind]) {
    let pull = rollSlot(slot, sheets, rng);
    for (let tries = 0; tries < 20 && (slot === COMMON || slot === UNCOMMON) && cards.some((c) => c.card.id === pull.card.id); tries++) pull = rollSlot(slot, sheets, rng);
    cards.push(pull);
  }
  return { kind, cards };
}

/** Each slot's outcomes as percentages, for the "Pack odds" screen. */
export function packOdds(kind: PackKind, sheets: Sheets = (cachedSheets ??= buildSheets())): { slot: string; count: number; outcomes: { label: string; percent: number; cards: number }[] }[] {
  const out: { slot: string; count: number; outcomes: { label: string; percent: number; cards: number }[] }[] = [];
  for (const slot of BOOSTERS[kind]) {
    const last = out.at(-1);
    if (last && last.slot === slot.name) {
      last.count++;
      continue;
    }
    const live = slot.outcomes.filter((x) => x.sheet(sheets).length > 0);
    const total = live.reduce((n, x) => n + x.weight, 0);
    out.push({ slot: slot.name, count: 1, outcomes: live.map((x) => ({ label: x.label, percent: (100 * x.weight) / total, cards: x.sheet(sheets).length })) });
  }
  return out;
}
