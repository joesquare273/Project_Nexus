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
  /** The Commander set's Booster Fun cards found in Collector Boosters: extended art (101–193) and borderless (194–208). */
  commanderExtended: Record<'rare' | 'mythic', BoosterCard[]>;
  commanderBorderless: Record<'rare' | 'mythic', BoosterCard[]>;
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

export function buildSheets(all: readonly BoosterCard[] = BOOSTER_CARDS): Sheets {
  // A meld card's melded result ("99b") is listed as its own printing but is never in a pack.
  const cards = all.filter((c) => !(c.layout === 'meld' && /b$/.test(c.number)));
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
    commanderExtended: byRarity(fic.filter((c) => num(c) >= 101 && num(c) <= 193 && promo(c, 'boosterfun')), ['rare', 'mythic'] as const),
    commanderBorderless: byRarity(fic.filter((c) => num(c) >= 194 && num(c) <= 208 && promo(c, 'boosterfun')), ['rare', 'mythic'] as const),
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
  /** Not in real boosters: our own addition for the Packs tab (Scene Box cards, surge foil tokens). Drafts leave these out. */
  unofficial?: true;
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
      o('Scene Box card', 1, (s) => s.scene, 'nonfoil', 3, { unofficial: true }),
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
      o('Scene Box art card', 5, (s) => s.sceneArt, 'nonfoil', 1, { unofficial: true }),
      o('Gold-stamped art card', 5, (s) => s.artCards, 'nonfoil', 1, { stamped: true }),
    ],
  },
];

const FOIL_COMMON: Slot = { name: 'Foil common', outcomes: [o('Foil common', 80, (s) => s.commons, 'foil'), o('Foil common dual land', 10, (s) => s.commonLands, 'foil')] };
// "Each of the 15 Cid variants appears 1/15 as often as any other uncommon": together, as often as one uncommon.
const FOIL_UNCOMMON: Slot = { name: 'Foil uncommon', outcomes: [o('Foil uncommon', 109, (s) => s.uncommons, 'foil'), o('Foil Cid variant', 1, (s) => s.cid, 'foil', 1)] };
/** At most one of the three Booster Fun rare slots is foil (see openPack). */
const BOOSTER_FUN_RARE: Slot = {
  name: 'Booster Fun rare or mythic',
  outcomes: [
    o('Borderless rare', 23.1, (s) => s.borderless.rare, 'nonfoil', 2),
    o('Borderless mythic', 3.8, (s) => s.borderless.mythic, 'nonfoil', 3),
    o('Extended-art rare', 18.2, (s) => s.extended.rare, 'nonfoil', 2),
    o('Extended-art mythic', 2.9, (s) => s.extended.mythic, 'nonfoil', 3),
    o('Commander borderless rare', 2.9, (s) => s.commanderBorderless.rare, 'nonfoil', 2),
    o('Commander borderless mythic', 3.3, (s) => s.commanderBorderless.mythic, 'nonfoil', 3),
    o('Commander extended-art rare', 35.2, (s) => s.commanderExtended.rare, 'nonfoil', 2),
    o('Commander extended-art mythic', 1.6, (s) => s.commanderExtended.mythic, 'nonfoil', 3),
    o('Foil borderless rare', 1.4, (s) => s.borderless.rare, 'foil', 2),
    o('Foil Commander extended-art rare', 5.8, (s) => s.commanderExtended.rare, 'foil', 2),
    o('Foil Commander extended-art mythic', 0.8, (s) => s.commanderExtended.mythic, 'foil', 3),
    o('Surge foil Commander mythic', 1, (s) => s.commanderSurge, 'surge', 3),
  ],
};

/** Collector Booster: 15 Magic cards and a foil token (Wizards' odds; Scene Box cards and surge tokens are ours). */
export const COLLECTOR_BOOSTER: Slot[] = [
  FOIL_COMMON,
  FOIL_COMMON,
  FOIL_COMMON,
  FOIL_UNCOMMON,
  FOIL_UNCOMMON,
  FOIL_UNCOMMON,
  {
    name: 'Booster Fun common or uncommon',
    outcomes: [
      o('Extended-art legendary uncommon', 66.7, (s) => s.extended.uncommon, 'nonfoil', 1),
      o('Borderless common', 5, (s) => s.borderless.common, 'nonfoil', 1),
      o('Borderless uncommon', 26.7, (s) => s.borderless.uncommon, 'nonfoil', 1),
      o('Secret Rendezvous alternate art', 1.6, (s) => s.rendezvous, 'nonfoil', 1),
    ],
  },
  {
    name: 'Foil Booster Fun common or uncommon',
    outcomes: [
      o('Foil borderless common', 13.75, (s) => s.borderless.common, 'foil', 1),
      o('Foil borderless uncommon', 72.75, (s) => s.borderless.uncommon, 'foil', 1),
      o('Foil Secret Rendezvous alternate art', 4.5, (s) => s.rendezvous, 'foil', 1),
      o('Surge foil borderless uncommon', 9, (s) => s.surge.uncommon, 'surge', 2),
    ],
  },
  { name: 'Foil basic land', outcomes: [o('Foil basic land', 1, (s) => s.basics, 'foil')] },
  {
    name: 'Foil rare or mythic',
    outcomes: [o('Foil rare', 87.75, (s) => s.rares, 'foil', 1), o('Foil mythic', 12.25, (s) => s.mythics, 'foil', 2)],
  },
  BOOSTER_FUN_RARE,
  BOOSTER_FUN_RARE,
  BOOSTER_FUN_RARE,
  {
    name: 'Through the Ages',
    outcomes: [
      o('Through the Ages uncommon', 34.15, (s) => s.throughTheAges.uncommon, 'nonfoil', 1),
      o('Foil Through the Ages uncommon', 34.15, (s) => s.throughTheAges.uncommon, 'foil', 1),
      o('Through the Ages rare', 12.85, (s) => s.throughTheAges.rare, 'nonfoil', 2),
      o('Foil Through the Ages rare', 12.85, (s) => s.throughTheAges.rare, 'foil', 2),
      o('Through the Ages mythic', 3, (s) => s.throughTheAges.mythic, 'nonfoil', 3),
      o('Foil Through the Ages mythic', 3, (s) => s.throughTheAges.mythic, 'foil', 3),
    ],
  },
  {
    name: 'Premium rare or mythic',
    outcomes: [
      o('Foil borderless rare', 70, (s) => s.borderless.rare, 'foil', 2),
      o('Foil borderless mythic', 11.6, (s) => s.borderless.mythic, 'foil', 3),
      o('Surge foil borderless rare', 15.1, (s) => s.surge.rare, 'surge', 3),
      o('Surge foil borderless mythic', 3, (s) => s.surge.mythic, 'surge', 3),
      o('Traveling Chocobo or Chocobo track foil', 0.29, (s) => s.chocobo, 'foil', 3),
      o('Serialized golden Traveling Chocobo', 0.01, (s) => s.goldenChocobo, 'foil', 3),
      o('Foil Scene Box card', 4, (s) => s.scene, 'foil', 3, { unofficial: true }),
    ],
  },
  {
    name: 'Foil token',
    outcomes: [o('Foil double-sided token', 90, (s) => s.tokens, 'foil'), o('Surge foil token', 10, (s) => s.surgeTokens, 'surge', 1, { unofficial: true })],
  },
];

export const BOOSTERS: Record<PackKind, Slot[]> = { play: PLAY_BOOSTER, collector: COLLECTOR_BOOSTER };

function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))]!;
}

/** Draws one outcome by weight, skipping outcomes whose sheet is empty (and, with `nonfoilOnly`, foil ones). */
export function rollSlot(slot: Slot, sheets: Sheets, rng: Rng, nonfoilOnly = false, officialOnly = false): Pull {
  const live = slot.outcomes.filter((x) => x.sheet(sheets).length > 0 && (!nonfoilOnly || x.finish === 'nonfoil') && (!officialOnly || !x.unofficial));
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

/**
 * Opens one pack. Slots of the same kind (the commons, the uncommons, the
 * three Booster Fun rares) never repeat a card, as in print, and at most one
 * of the Booster Fun rares is foil.
 */
export function openPack(
  kind: PackKind,
  rng: Rng = Math.random,
  sheets: Sheets = (cachedSheets ??= buildSheets()),
  /** Only what real boosters contain (FIN and Through the Ages): drafts use this. */
  { officialOnly = false }: { officialOnly?: boolean } = {},
): Pack {
  const slots = BOOSTERS[kind];
  const cards: Pull[] = [];
  slots.forEach((slot, i) => {
    const same = cards.filter((_, k) => slots[k] === slot);
    const nonfoilOnly = slot === BOOSTER_FUN_RARE && same.some((p) => p.finish !== 'nonfoil');
    let pull = rollSlot(slot, sheets, rng, nonfoilOnly, officialOnly);
    for (let tries = 0; tries < 20 && same.some((c) => c.card.id === pull.card.id); tries++) pull = rollSlot(slot, sheets, rng, nonfoilOnly, officialOnly);
    cards[i] = pull;
  });
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
