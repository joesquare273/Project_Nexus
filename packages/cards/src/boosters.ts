// Booster packs for the Packs tab: every printing of the Final Fantasy sets
// (saved from Scryfall by scripts/booster-data.ts) sorted into print sheets,
// and packs drawn from them slot by slot. Slot odds follow Wizards'
// "Collecting Final Fantasy" article; Scene Box cards, which aren't in real
// boosters, are added at small odds of our own (see docs/packs.md).
//
// Packs are only for collecting: opening them never changes the playable
// card pool. The client loads this module on demand (it holds every printing).

import type { CardFinish } from '@nexus/engine';
import data from '../data/booster-cards.json' with { type: 'json' };
import secretLair from '../data/secret-lair.json' with { type: 'json' };

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

/** A card's other side: a double-faced card's back face, or the card a meld card melds into. */
export interface OtherFace {
  name: string;
  image: BoosterCard['images'][number];
  /** A meld card: `name` is the melded card, made with `partner`. */
  meld?: { partner: string };
}

const isMeldResult = (c: BoosterCard) => c.layout === 'meld' && /b$/.test(c.number);

/**
 * The other side of a pulled card, if it has one. A meld card's melded
 * result is its own printing ("99b"), shared by both halves (Fang and
 * Vanille meld into Ragnarok). A set can print a meld pair several times
 * (regular and variant art): the Nth printing of each half goes with the
 * Nth melded printing, by collector number.
 */
export function otherFace(card: BoosterCard, all: readonly BoosterCard[] = BOOSTER_CARDS): OtherFace | undefined {
  if (card.images[1]) return { name: card.name.split(' // ')[1] ?? card.name, image: card.images[1] };
  if (card.layout !== 'meld' || isMeldResult(card)) return undefined;
  const byNumber = (a: BoosterCard, b: BoosterCard) => parseInt(a.number, 10) - parseInt(b.number, 10);
  const melds = all.filter((c) => c.set === card.set && c.layout === 'meld').sort(byNumber);
  const rank = melds.filter((c) => !isMeldResult(c) && c.name === card.name).findIndex((c) => c.number === card.number);
  // The result made from this card (its number plus "b"), or else the one at the same rank.
  const own = melds.find((c) => c.number === `${card.number}b`);
  const results = melds.filter(isMeldResult);
  const result = own ?? results[rank];
  if (!result?.images[0]) return undefined;
  // The other half: the set's other meld card name (one meld pair per set so far).
  const partner = melds.find((c) => !isMeldResult(c) && c.name !== card.name)?.name;
  return { name: result.name, image: result.images[0], meld: { partner: partner ?? 'its partner' } };
}

/** The Store's Secret Lair printings (scripts/import-secret-lairs.ts), each with its drop if it belongs to one and the Store set it's under. */
export const SECRET_LAIR_CARDS = secretLair.printings as (BoosterCard & { drop?: string; series: BoosterSet })[];
/** The Secret Lair drops: Scryfall collector numbers, the bonus card's (if any), the Store set, and whether they come in galaxy foil. */
export const SECRET_LAIR_DROPS = secretLair.drops as { name: string; numbers: string[]; bonus?: string; set: BoosterSet; galaxyFoil?: true }[];

export type PackKind = 'play' | 'collector';
export type Finish = 'nonfoil' | 'foil' | 'surge';

/**
 * Special foil treatments, by Scryfall promo type: a foil copy of such a
 * printing shows that treatment's look and name. Later sets add theirs here
 * (and to CARD_FINISHES in the engine when they need their own shine).
 */
export const SPECIAL_FOILS: Record<string, { name: string; look: CardFinish }> = {
  chocobotrackfoil: { name: 'Chocobo Track foil', look: 'chocobotrack' },
  // Edge of Eternities: their own printings, shown with the regular foil shine for now.
  galaxyfoil: { name: 'Galaxy foil', look: 'foil' },
  fracturefoil: { name: 'Fracture foil', look: 'foil' },
  singularityfoil: { name: 'Singularity foil', look: 'foil' },
  // Reality Fracture.
  facetfoil: { name: 'Facet foil', look: 'foil' },
  doublerainbow: { name: 'Double rainbow foil', look: 'foil' },
};

/** How a copy looks, for the shine: undefined for non-foil. */
export function finishLook(card: Pick<BoosterCard, 'promoTypes'>, finish: Finish): CardFinish | undefined {
  if (finish === 'nonfoil') return undefined;
  if (finish === 'surge') return 'surge';
  const special = card.promoTypes?.map((p) => SPECIAL_FOILS[p]).find(Boolean);
  return special?.look ?? 'foil';
}

/** "Non-foil", "Foil", "Surge foil", "Chocobo Track foil". */
export function finishName(card: Pick<BoosterCard, 'promoTypes'>, finish: Finish): string {
  if (finish === 'nonfoil') return 'Non-foil';
  if (finish === 'surge') return 'Surge foil';
  return card.promoTypes?.map((p) => SPECIAL_FOILS[p]?.name).find(Boolean) ?? 'Foil';
}

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
  /** Which set's booster (absent: Final Fantasy, as packs opened before Edge of Eternities). */
  set?: BoosterSet;
  cards: Pull[];
}

/** The sets with boosters on the Packs tab. */
export type BoosterSet = 'fin' | 'eoe' | 'fra';
export const BOOSTER_SETS: readonly BoosterSet[] = ['fin', 'eoe', 'fra'];

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
  /** Traveling Chocobo variants. (Chocobo Track foils are Store-only here, by the user's choice.) */
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
      ...fin.filter((c) => /^551[a-d]$/.test(c.number)),
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
export interface Outcome<S = Sheets> {
  label: string;
  weight: number;
  sheet: (s: S) => BoosterCard[];
  finish: Finish;
  hype: Pull['hype'];
  stamped?: true;
  /** Not in real boosters: our own addition for the Packs tab (Scene Box cards, surge foil tokens). Drafts leave these out. */
  unofficial?: true;
}
export interface Slot<S = Sheets> {
  name: string;
  outcomes: Outcome<S>[];
  /** Slots that never repeat each other's cards, if not just the slots with this name (all of a pack's commons). */
  group?: string;
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
      o('Traveling Chocobo variant', 0.29, (s) => s.chocobo, 'foil', 3),
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
export function rollSlot<S>(slot: Slot<S>, sheets: S, rng: Rng, nonfoilOnly = false, officialOnly = false): Pull {
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
  return oddsOf(BOOSTERS[kind], sheets);
}

function oddsOf<S>(slots: readonly Slot<S>[], sheets: S): { slot: string; count: number; outcomes: { label: string; percent: number; cards: number }[] }[] {
  const out: { slot: string; count: number; outcomes: { label: string; percent: number; cards: number }[] }[] = [];
  for (const slot of slots) {
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

// ---------------------------------------------------------------------------
// Edge of Eternities (Wizards' "Collecting Edge of Eternities", 2025)
// ---------------------------------------------------------------------------

type RM = Record<'rare' | 'mythic', BoosterCard[]>;

/** Edge of Eternities' print sheets, by Scryfall collector number. */
export interface EoeSheets {
  /** EOE 1-261, booster cards: 81 commons, 100 uncommons, 60 rares, 20 mythics. */
  commons: BoosterCard[];
  uncommons: BoosterCard[];
  rares: BoosterCard[];
  mythics: BoosterCard[];
  /** Default-frame basics (EOE 267-276) and borderless celestial basics (262-266; galaxy foil 367-371). */
  basics: BoosterCard[];
  celestial: BoosterCard[];
  galaxyCelestial: BoosterCard[];
  /** Borderless viewport lands (277-286; galaxy foil 372-381), triumphant cards (287-302), surreal space cards (303-316). */
  viewport: RM;
  galaxyViewport: RM;
  triumphant: RM;
  surreal: RM;
  /** Extended art from the main set (317-356). */
  extended: RM;
  /** Japan Showcase (357-366) and their fracture foils (383-392). */
  japan: BoosterCard[];
  fractureJapan: BoosterCard[];
  /** The textless singularity foil Sothera, the Supervoid (382). */
  singularity: BoosterCard[];
  /** Stellar Sights (EOS): 1-45, posters 46-90, galaxy foil 91-135, galaxy foil posters 136-180. */
  stellar: RM;
  stellarPoster: RM;
  galaxyStellar: RM;
  galaxyStellarPoster: RM;
  /** Edge of Eternities Commander: borderless mythics (EOC 1-4) and extended-art rares (25-44). */
  commanderBorderless: BoosterCard[];
  commanderExtended: BoosterCard[];
  /** The ten Special Guests (SPG 119-128). */
  specialGuests: BoosterCard[];
  tokens: BoosterCard[];
  artCards: BoosterCard[];
}

export function buildEoeSheets(all: readonly BoosterCard[] = BOOSTER_CARDS): EoeSheets {
  const set = (code: string, from: number, to: number) => all.filter((c) => c.set === code && num(c) >= from && num(c) <= to);
  const rm = (list: BoosterCard[]): RM => ({ rare: list.filter((c) => c.rarity === 'rare'), mythic: list.filter((c) => c.rarity === 'mythic') });
  const main = set('eoe', 1, 261).filter((c) => c.booster);
  const r = (rarity: Rarity) => main.filter((c) => c.rarity === rarity);
  return {
    commons: r('common'),
    uncommons: r('uncommon'),
    rares: r('rare'),
    mythics: r('mythic'),
    basics: set('eoe', 267, 276),
    celestial: set('eoe', 262, 266),
    galaxyCelestial: set('eoe', 367, 371),
    viewport: rm(set('eoe', 277, 286)),
    galaxyViewport: rm(set('eoe', 372, 381)),
    triumphant: rm(set('eoe', 287, 302)),
    surreal: rm(set('eoe', 303, 316)),
    extended: rm(set('eoe', 317, 356)),
    japan: set('eoe', 357, 366),
    fractureJapan: set('eoe', 383, 392),
    singularity: set('eoe', 382, 382),
    stellar: rm(set('eos', 1, 45)),
    stellarPoster: rm(set('eos', 46, 90)),
    galaxyStellar: rm(set('eos', 91, 135)),
    galaxyStellarPoster: rm(set('eos', 136, 180)),
    commanderBorderless: set('eoc', 1, 4),
    commanderExtended: set('eoc', 25, 44),
    specialGuests: set('spg', 119, 128),
    tokens: all.filter((c) => c.set === 'teoe'),
    artCards: all.filter((c) => c.set === 'aeoe'),
  };
}

const e = (label: string, weight: number, sheet: (s: EoeSheets) => BoosterCard[], finish: Finish = 'nonfoil', hype: Pull['hype'] = 0, extra: Partial<Outcome<EoeSheets>> = {}): Outcome<EoeSheets> => ({ label, weight, sheet, finish, hype, ...extra });

const EOE_COMMON: Slot<EoeSheets> = { name: 'Common', outcomes: [e('Common', 1, (s) => s.commons)] };
const EOE_UNCOMMON: Slot<EoeSheets> = { name: 'Uncommon', outcomes: [e('Uncommon', 1, (s) => s.uncommons)] };

/*
 * Wizards gives some outcomes as "less than 1%". Those share what the slot's
 * listed odds leave over (e.g. the wildcard's 0.9%), split as noted beside
 * each; everything else is Wizards' number.
 */

/** Edge of Eternities Play Booster: 14 Magic cards and a double-sided token. */
export const EOE_PLAY_BOOSTER: Slot<EoeSheets>[] = [
  ...Array.from({ length: 6 }, () => EOE_COMMON),
  // "In 1.8% of Play Boosters, 1 of 10 non-foil Special Guests cards will replace a common."
  { name: 'Common or Special Guests', group: 'Common', outcomes: [e('Common', 98.2, (s) => s.commons), e('Special Guests card', 1.8, (s) => s.specialGuests, 'nonfoil', 3)] },
  EOE_UNCOMMON,
  EOE_UNCOMMON,
  EOE_UNCOMMON,
  {
    name: 'Wildcard',
    outcomes: [
      e('Common', 12.5, (s) => s.commons),
      e('Uncommon', 62.5, (s) => s.uncommons),
      e('Rare', 10.6, (s) => s.rares, 'nonfoil', 1),
      e('Mythic', 0.5, (s) => s.mythics, 'nonfoil', 2), // "less than 1%"
      e('Stellar Sights rare', 10, (s) => s.stellar.rare, 'nonfoil', 2),
      e('Stellar Sights mythic', 2.5, (s) => s.stellar.mythic, 'nonfoil', 3),
      e('Borderless viewport land rare', 1, (s) => s.viewport.rare, 'nonfoil', 2),
      e('Borderless viewport land mythic', 0.1, (s) => s.viewport.mythic, 'nonfoil', 3), // "less than 1%"
      e('Borderless triumphant or surreal space rare', 0.2, (s) => [...s.triumphant.rare, ...s.surreal.rare], 'nonfoil', 2), // "less than 1%"
      e('Borderless triumphant or surreal space mythic', 0.1, (s) => [...s.triumphant.mythic, ...s.surreal.mythic], 'nonfoil', 3), // "less than 1%"
    ],
  },
  {
    name: 'Rare',
    outcomes: [
      e('Rare', 80.4, (s) => s.rares, 'nonfoil', 1),
      e('Mythic', 14.2, (s) => s.mythics, 'nonfoil', 2),
      e('Borderless triumphant rare', 2, (s) => s.triumphant.rare, 'nonfoil', 2),
      e('Borderless triumphant mythic', 0.5, (s) => s.triumphant.mythic, 'nonfoil', 3), // "less than 1%"
      e('Borderless surreal space rare', 2, (s) => s.surreal.rare, 'nonfoil', 2),
      e('Borderless surreal space mythic', 0.5, (s) => s.surreal.mythic, 'nonfoil', 3), // "less than 1%"
      e('Borderless viewport land mythic', 0.4, (s) => s.viewport.mythic, 'nonfoil', 3), // "less than 1%"
    ],
  },
  {
    name: 'Foil',
    outcomes: [
      e('Foil common', 58, (s) => s.commons, 'foil'),
      e('Foil uncommon', 32, (s) => s.uncommons, 'foil'),
      e('Foil rare', 6.4, (s) => s.rares, 'foil', 1),
      e('Foil mythic', 1.1, (s) => s.mythics, 'foil', 2),
      e('Foil Stellar Sights rare', 1, (s) => s.stellar.rare, 'foil', 2),
      e('Foil Stellar Sights mythic', 0.5, (s) => s.stellar.mythic, 'foil', 3), // "less than 1%"
      e('Foil borderless rare', 0.7, (s) => [...s.viewport.rare, ...s.triumphant.rare, ...s.surreal.rare], 'foil', 2), // "less than 1%"
      e('Foil borderless mythic', 0.3, (s) => [...s.viewport.mythic, ...s.triumphant.mythic, ...s.surreal.mythic], 'foil', 3), // "less than 1%"
    ],
  },
  {
    name: 'Land',
    outcomes: [
      e('Basic land', 64, (s) => s.basics),
      e('Foil basic land', 16, (s) => s.basics, 'foil'),
      e('Celestial basic land', 16, (s) => s.celestial, 'nonfoil', 1),
      e('Foil celestial basic land', 4, (s) => s.celestial, 'foil', 1),
    ],
  },
  { name: 'Double-sided token', outcomes: [e('Double-sided token', 1, (s) => s.tokens)] },
];

/** Edge of Eternities Collector Booster: 15 Magic cards and an art card or foil token. */
export const EOE_COLLECTOR_BOOSTER: Slot<EoeSheets>[] = [
  ...Array.from({ length: 5 }, (): Slot<EoeSheets> => ({ name: 'Foil common', outcomes: [e('Foil common', 1, (s) => s.commons, 'foil')] })),
  ...Array.from({ length: 4 }, (): Slot<EoeSheets> => ({ name: 'Foil uncommon', outcomes: [e('Foil uncommon', 1, (s) => s.uncommons, 'foil')] })),
  {
    name: 'Foil celestial basic land',
    outcomes: [e('Foil celestial basic land', 66.6, (s) => s.celestial, 'foil', 1), e('Galaxy foil celestial basic land', 33.3, (s) => s.galaxyCelestial, 'foil', 2)],
  },
  { name: 'Foil rare or mythic', outcomes: [e('Foil rare', 86, (s) => s.rares, 'foil', 1), e('Foil mythic', 14, (s) => s.mythics, 'foil', 2)] },
  {
    name: 'Commander card',
    outcomes: [e('Commander borderless mythic', 9, (s) => s.commanderBorderless, 'nonfoil', 3), e('Commander extended-art rare', 91, (s) => s.commanderExtended, 'nonfoil', 2)],
  },
  {
    name: 'Booster Fun card',
    outcomes: [
      e('Extended-art rare', 47, (s) => s.extended.rare, 'nonfoil', 2),
      e('Extended-art mythic', 5, (s) => s.extended.mythic, 'nonfoil', 3),
      e('Borderless viewport land rare', 7, (s) => s.viewport.rare, 'nonfoil', 2),
      e('Borderless viewport land mythic', 4, (s) => s.viewport.mythic, 'nonfoil', 3),
      e('Borderless triumphant rare', 17, (s) => s.triumphant.rare, 'nonfoil', 2),
      e('Borderless triumphant mythic', 3, (s) => s.triumphant.mythic, 'nonfoil', 3),
      e('Borderless surreal space rare', 15, (s) => s.surreal.rare, 'nonfoil', 2),
      e('Borderless surreal space mythic', 2, (s) => s.surreal.mythic, 'nonfoil', 3),
    ],
  },
  {
    name: 'Stellar Sights land',
    outcomes: [
      e('Stellar Sights rare', 36, (s) => s.stellar.rare, 'nonfoil', 2),
      e('Stellar Sights mythic', 9, (s) => s.stellar.mythic, 'nonfoil', 3),
      e('Poster Stellar Sights rare', 18, (s) => s.stellarPoster.rare, 'nonfoil', 2),
      e('Poster Stellar Sights mythic', 4, (s) => s.stellarPoster.mythic, 'nonfoil', 3),
      e('Foil Stellar Sights rare', 12, (s) => s.stellar.rare, 'foil', 2),
      e('Foil Stellar Sights mythic', 3, (s) => s.stellar.mythic, 'foil', 3),
      e('Foil poster Stellar Sights rare', 6, (s) => s.stellarPoster.rare, 'foil', 3),
      e('Foil poster Stellar Sights mythic', 1.5, (s) => s.stellarPoster.mythic, 'foil', 3),
      e('Galaxy foil Stellar Sights rare', 6, (s) => s.galaxyStellar.rare, 'foil', 3),
      e('Galaxy foil Stellar Sights mythic', 1.5, (s) => s.galaxyStellar.mythic, 'foil', 3),
      e('Galaxy foil poster Stellar Sights rare', 3, (s) => s.galaxyStellarPoster.rare, 'foil', 3),
      e('Galaxy foil poster Stellar Sights mythic', 0.8, (s) => s.galaxyStellarPoster.mythic, 'foil', 3), // "less than 1%"; posters total 33.3%
    ],
  },
  {
    name: 'Foil Booster Fun card',
    outcomes: [
      e('Foil extended-art rare', 38, (s) => s.extended.rare, 'foil', 2),
      e('Foil extended-art mythic', 4, (s) => s.extended.mythic, 'foil', 3),
      e('Foil borderless viewport land rare', 6, (s) => s.viewport.rare, 'foil', 2),
      e('Foil borderless viewport land mythic', 3, (s) => s.viewport.mythic, 'foil', 3),
      e('Foil borderless triumphant rare', 13, (s) => s.triumphant.rare, 'foil', 2),
      e('Foil borderless triumphant mythic', 2, (s) => s.triumphant.mythic, 'foil', 3),
      e('Foil borderless surreal space rare', 12, (s) => s.surreal.rare, 'foil', 2),
      e('Foil borderless surreal space mythic', 2, (s) => s.surreal.mythic, 'foil', 3),
      e('Foil Special Guests card', 6, (s) => s.specialGuests, 'foil', 3),
      e('Foil Japan Showcase card', 9, (s) => s.japan, 'foil', 3),
      e('Fracture foil Japan Showcase card', 1, (s) => s.fractureJapan, 'foil', 3),
      e('Galaxy foil borderless viewport land rare', 2, (s) => s.galaxyViewport.rare, 'foil', 3),
      e('Galaxy foil borderless viewport land mythic', 1, (s) => s.galaxyViewport.mythic, 'foil', 3),
      e('Textless singularity foil Sothera, the Supervoid', 0.5, (s) => s.singularity, 'foil', 3), // "less than 1%"
    ],
  },
  {
    name: 'Art card or foil token',
    outcomes: [
      e('Foil double-sided token', 65, (s) => s.tokens, 'foil'),
      e('Art card', 30, (s) => s.artCards),
      e('Gold-stamped art card', 5, (s) => s.artCards, 'nonfoil', 1, { stamped: true }),
    ],
  },
];

let cachedEoeSheets: EoeSheets | undefined;

/** Opens one Edge of Eternities pack. Slots of the same kind never repeat a card, as in print. */
export function openEoePack(kind: PackKind, rng: Rng = Math.random, sheets: EoeSheets = (cachedEoeSheets ??= buildEoeSheets())): Pack {
  const slots = kind === 'play' ? EOE_PLAY_BOOSTER : EOE_COLLECTOR_BOOSTER;
  const cards: Pull[] = [];
  slots.forEach((slot, i) => {
    const groupOf = (x: Slot<EoeSheets>) => x.group ?? x.name;
    const same = cards.filter((_, k) => groupOf(slots[k]!) === groupOf(slot));
    let pull = rollSlot(slot, sheets, rng);
    for (let tries = 0; tries < 20 && same.some((c) => c.card.id === pull.card.id); tries++) pull = rollSlot(slot, sheets, rng);
    cards[i] = pull;
  });
  return { kind, set: 'eoe', cards };
}

/** Opens one pack of a set's booster. */
export function openSetPack(set: BoosterSet, kind: PackKind, rng: Rng = Math.random): Pack {
  return set === 'fra' ? openFraPack(kind, rng) : set === 'eoe' ? openEoePack(kind, rng) : openPack(kind, rng);
}

/** A set's slots as percentages, for the "Pack odds" screen. */
export function setPackOdds(set: BoosterSet, kind: PackKind): ReturnType<typeof packOdds> {
  if (set === 'fra') return oddsOf(kind === 'play' ? FRA_PLAY_BOOSTER : FRA_COLLECTOR_BOOSTER, (cachedFraSheets ??= buildFraSheets()));
  if (set !== 'eoe') return packOdds(kind);
  const sheets = (cachedEoeSheets ??= buildEoeSheets());
  return oddsOf(kind === 'play' ? EOE_PLAY_BOOSTER : EOE_COLLECTOR_BOOSTER, sheets);
}

// ---------------------------------------------------------------------------
// Reality Fracture (Wizards' "Collecting Reality Fracture", 2026)
// ---------------------------------------------------------------------------

/**
 * The 43 echoed pairs (FRA 195-280), by collector number: each Multiverse card
 * and its Echoverse counterpart, as Wizards' "The Legends of Reality Fracture"
 * shows them side by side. The five "Way of the ..." pairs follow their
 * planeswalkers (Liliana, Chandra, Garruk, Ajani, Jace and Tam).
 */
export const FRA_ECHOED_PAIRS: readonly (readonly [number, number])[] = [
  [216, 276], [195, 242], [244, 212], [259, 229], [231, 200], [278, 277], [243, 211], [196, 227], [270, 257], [213, 258],
  [245, 228], [260, 197], [198, 230], [271, 215], [261, 246], [279, 272], [273, 247], [248, 199], [262, 232], [201, 217],
  [274, 233], [263, 249], [234, 202], [250, 264], [218, 235], [265, 219], [275, 203], [251, 220], [221, 252], [204, 236],
  [205, 214], [237, 266], [206, 253], [280, 222], [240, 256], [241, 225], [209, 269], [226, 210],
  // Way of the Necromancer / Healer, Pyromancer / Cryomancer, Wildspeaker / Deathbringer, Mentor / Warlord, Mind Sculptor / Paradox.
  [239, 207], [254, 223], [268, 238], [208, 255], [224, 267],
];

/** Reality Fracture's print sheets, by Scryfall collector number. */
export interface FraSheets {
  /** FRA 1-194: 72 commons (the 10 common dual lands apart), 43 uncommons, 50 rares, 20 mythics; echoed pairs aren't on these sheets. */
  commons: BoosterCard[];
  uncommons: BoosterCard[];
  rares: BoosterCard[];
  mythics: BoosterCard[];
  /** The 10 common dual lands (Annexes and Commons), default-frame basics (281-290), borderless tower basics (382-396). */
  duals: BoosterCard[];
  basics: BoosterCard[];
  towers: BoosterCard[];
  /** Echoed pairs (195-280) and their borderless versions (291-320), as pairs of the same rarity. */
  pairs: Record<'uncommon' | 'rare' | 'mythic', [BoosterCard, BoosterCard][]>;
  borderlessPairs: Record<'uncommon' | 'rare' | 'mythic', [BoosterCard, BoosterCard][]>;
  /** Every echoed pairs card of a rarity, one at a time (the third echoed pairs card; the foil slot). */
  echoed: Record<'uncommon' | 'rare' | 'mythic', BoosterCard[]>;
  borderlessEchoed: Record<'uncommon' | 'rare' | 'mythic', BoosterCard[]>;
  /** Shattered mirror (321-333; facet foil 449-461), sculptor's stronghold (334-358), braintwister series (359-381), portal view lands (397-401). */
  shattered: RM;
  facetShattered: RM;
  stronghold: RM;
  braintwister: RM & { uncommon: BoosterCard[] };
  portal: BoosterCard[];
  /** Extended art from the main set (423-431). */
  extended: RM;
  /** The serialized double rainbow foil headliner, Bloodline Recollector (402). */
  headliner: BoosterCard[];
  /** Japan Showcase (403-412) and their fracture foils (413-422). */
  japan: BoosterCard[];
  fractureJapan: BoosterCard[];
  /** Reality Fracture Commander: borderless mythics (FRC 1-2) and extended-art rares (88-103). */
  commanderBorderless: BoosterCard[];
  commanderExtended: BoosterCard[];
  /** The ten Special Guests (SPG 159-168). */
  specialGuests: BoosterCard[];
  tokens: BoosterCard[];
  artCards: BoosterCard[];
}

type PairRarity = 'uncommon' | 'rare' | 'mythic';

export function buildFraSheets(all: readonly BoosterCard[] = BOOSTER_CARDS): FraSheets {
  const set = (code: string, from: number, to: number) => all.filter((c) => c.set === code && num(c) >= from && num(c) <= to);
  const rm = (list: BoosterCard[]): RM => ({ rare: list.filter((c) => c.rarity === 'rare'), mythic: list.filter((c) => c.rarity === 'mythic') });
  const main = set('fra', 1, 194);
  const isDual = (c: BoosterCard) => c.rarity === 'common' && isLand(c) && / (Annex|Commons)$/.test(c.name);
  const byNumber = new Map(set('fra', 195, 280).map((c) => [num(c), c]));
  const borderless = set('fra', 291, 320);
  const borderlessOf = (c: BoosterCard) => borderless.find((b) => b.name === c.name);
  const pairs: FraSheets['pairs'] = { uncommon: [], rare: [], mythic: [] };
  const borderlessPairs: FraSheets['borderlessPairs'] = { uncommon: [], rare: [], mythic: [] };
  for (const [a, b] of FRA_ECHOED_PAIRS) {
    const x = byNumber.get(a), y = byNumber.get(b);
    if (!x || !y) continue;
    const rarity = x.rarity as PairRarity;
    pairs[rarity].push([x, y]);
    const bx = borderlessOf(x), by = borderlessOf(y);
    if (bx && by) borderlessPairs[rarity].push([bx, by]);
  }
  const flat = (p: [BoosterCard, BoosterCard][]) => p.flat();
  const bt = set('fra', 359, 381);
  return {
    commons: main.filter((c) => c.rarity === 'common' && !isDual(c)),
    uncommons: main.filter((c) => c.rarity === 'uncommon'),
    rares: main.filter((c) => c.rarity === 'rare'),
    mythics: main.filter((c) => c.rarity === 'mythic'),
    duals: main.filter(isDual),
    basics: set('fra', 281, 290),
    towers: set('fra', 382, 396),
    pairs,
    borderlessPairs,
    echoed: { uncommon: flat(pairs.uncommon), rare: flat(pairs.rare), mythic: flat(pairs.mythic) },
    borderlessEchoed: { uncommon: flat(borderlessPairs.uncommon), rare: flat(borderlessPairs.rare), mythic: flat(borderlessPairs.mythic) },
    shattered: rm(set('fra', 321, 333)),
    facetShattered: rm(set('fra', 449, 461)),
    stronghold: rm(set('fra', 334, 358)),
    braintwister: { ...rm(bt), uncommon: bt.filter((c) => c.rarity === 'uncommon') },
    portal: set('fra', 397, 401),
    extended: rm(set('fra', 423, 431)),
    headliner: set('fra', 402, 402),
    japan: set('fra', 403, 412),
    fractureJapan: set('fra', 413, 422),
    commanderBorderless: set('frc', 1, 2),
    commanderExtended: set('frc', 88, 103),
    specialGuests: set('spg', 159, 168),
    tokens: all.filter((c) => c.set === 'tfra'),
    artCards: all.filter((c) => c.set === 'afra'),
  };
}

const f = (label: string, weight: number, sheet: (s: FraSheets) => BoosterCard[], finish: Finish = 'nonfoil', hype: Pull['hype'] = 0, extra: Partial<Outcome<FraSheets>> = {}): Outcome<FraSheets> => ({ label, weight, sheet, finish, hype, ...extra });

/**
 * "Includes 2 cards of the same rarity from the same set of echoed pairs": a
 * slot marked `pairWithNext` is filled with one card of a pair and the next
 * slot with its counterpart (see openFraPack).
 */
const FRA_PAIRED = new WeakSet<Slot<FraSheets>>();
const paired = (slot: Slot<FraSheets>): Slot<FraSheets> => (FRA_PAIRED.add(slot), slot);

/*
 * As for Edge of Eternities, "less than 1%" outcomes share what the slot's
 * listed odds leave over, split as noted beside each.
 */

const FRA_ECHOED_PLAY: Outcome<FraSheets>[] = [
  f('Echoed pairs uncommon', 88.9, (s) => s.echoed.uncommon),
  f('Echoed pairs rare', 6.7, (s) => s.echoed.rare, 'nonfoil', 1),
  f('Echoed pairs mythic', 1.4, (s) => s.echoed.mythic, 'nonfoil', 2),
  f('Borderless echoed pairs uncommon', 1.7, (s) => s.borderlessEchoed.uncommon, 'nonfoil', 1),
  f('Borderless echoed pairs rare', 0.9, (s) => s.borderlessEchoed.rare, 'nonfoil', 2), // "less than 1%"
  f('Borderless echoed pairs mythic', 0.4, (s) => s.borderlessEchoed.mythic, 'nonfoil', 3), // "less than 1%"
];

/** Reality Fracture Play Booster: 14 Magic cards and a punch-out counter card or double-sided token. */
export const FRA_PLAY_BOOSTER: Slot<FraSheets>[] = [
  ...Array.from({ length: 5 }, (): Slot<FraSheets> => ({ name: 'Common', outcomes: [f('Common', 1, (s) => s.commons)] })),
  // "In 1 of 55 Play Boosters, 1 of 10 Special Guests cards will replace a common."
  { name: 'Common or Special Guests', group: 'Common', outcomes: [f('Common', 54, (s) => s.commons), f('Special Guests card', 1, (s) => s.specialGuests, 'nonfoil', 3)] },
  { name: 'Uncommon', outcomes: [f('Uncommon', 96.2, (s) => s.uncommons), f('Braintwister series uncommon', 3.8, (s) => s.braintwister.uncommon, 'nonfoil', 1)] },
  {
    name: 'Common or uncommon',
    group: 'Uncommon',
    outcomes: [f('Common', 23, (s) => s.commons), f('Uncommon', 74, (s) => s.uncommons), f('Braintwister series uncommon', 3, (s) => s.braintwister.uncommon, 'nonfoil', 1)],
  },
  paired({ name: 'Echoed pairs', outcomes: FRA_ECHOED_PLAY }),
  { name: 'Echoed pairs', outcomes: FRA_ECHOED_PLAY },
  { name: 'Echoed pairs', outcomes: FRA_ECHOED_PLAY },
  {
    name: 'Rare',
    outcomes: [
      f('Rare', 74.4, (s) => s.rares, 'nonfoil', 1),
      f('Mythic', 14.8, (s) => s.mythics, 'nonfoil', 2),
      f('Shattered mirror rare', 1, (s) => s.shattered.rare, 'nonfoil', 2),
      f('Shattered mirror mythic', 0.4, (s) => s.shattered.mythic, 'nonfoil', 3), // "less than 1%"
      f("Sculptor's stronghold rare", 3.8, (s) => s.stronghold.rare, 'nonfoil', 2),
      f("Sculptor's stronghold mythic", 1, (s) => s.stronghold.mythic, 'nonfoil', 3),
      f('Braintwister series rare', 3.1, (s) => s.braintwister.rare, 'nonfoil', 2),
      f('Braintwister series mythic', 0.5, (s) => s.braintwister.mythic, 'nonfoil', 3), // "less than 1%"
      f('Portal view land', 1, (s) => s.portal, 'nonfoil', 2),
    ],
  },
  {
    name: 'Foil',
    outcomes: [
      f('Foil common', 49.5, (s) => s.commons, 'foil'),
      f('Foil uncommon', 40.5, (s) => [...s.uncommons, ...s.echoed.uncommon], 'foil'),
      f('Foil rare', 6, (s) => [...s.rares, ...s.echoed.rare], 'foil', 1),
      f('Foil mythic', 1.2, (s) => [...s.mythics, ...s.echoed.mythic], 'foil', 2),
      // The rest are "less than 1%" each; together they're the 2.8% left over.
      f('Foil borderless echoed pairs uncommon', 0.6, (s) => s.borderlessEchoed.uncommon, 'foil', 1),
      f('Foil borderless echoed pairs rare', 0.3, (s) => s.borderlessEchoed.rare, 'foil', 2),
      f('Foil borderless echoed pairs mythic', 0.1, (s) => s.borderlessEchoed.mythic, 'foil', 3),
      f('Foil braintwister series uncommon', 0.6, (s) => s.braintwister.uncommon, 'foil', 1),
      f('Foil braintwister series rare', 0.3, (s) => s.braintwister.rare, 'foil', 2),
      f('Foil braintwister series mythic', 0.1, (s) => s.braintwister.mythic, 'foil', 3),
      f("Foil sculptor's stronghold rare", 0.4, (s) => s.stronghold.rare, 'foil', 2),
      f("Foil sculptor's stronghold mythic", 0.1, (s) => s.stronghold.mythic, 'foil', 3),
      f('Foil portal view land', 0.3, (s) => s.portal, 'foil', 2),
    ],
  },
  {
    name: 'Land',
    outcomes: [
      f('Basic land', 14.6, (s) => s.basics),
      f('Foil basic land', 3.6, (s) => s.basics, 'foil'),
      f('Tower basic land', 21.8, (s) => s.towers, 'nonfoil', 1),
      f('Foil tower basic land', 5.5, (s) => s.towers, 'foil', 1),
      f('Common dual land', 43.6, (s) => s.duals),
      f('Foil common dual land', 10.9, (s) => s.duals, 'foil'),
    ],
  },
  { name: 'Counter card or double-sided token', outcomes: [f('Counter card or double-sided token', 1, (s) => s.tokens)] },
];

const FRA_ECHOED_COLLECTOR: Outcome<FraSheets>[] = [
  f('Foil echoed pairs uncommon', 86.8, (s) => s.echoed.uncommon, 'foil'),
  f('Foil borderless echoed pairs uncommon', 13.2, (s) => s.borderlessEchoed.uncommon, 'foil', 1),
];

/** Reality Fracture Collector Booster: 15 Magic cards and a foil double-sided token or art card. */
export const FRA_COLLECTOR_BOOSTER: Slot<FraSheets>[] = [
  ...Array.from({ length: 4 }, (): Slot<FraSheets> => ({ name: 'Foil common', outcomes: [f('Foil common', 72, (s) => s.commons, 'foil'), f('Foil common dual land', 10, (s) => s.duals, 'foil')] })),
  ...Array.from({ length: 2 }, (): Slot<FraSheets> => ({ name: 'Foil uncommon', outcomes: [f('Foil uncommon', 89.6, (s) => s.uncommons, 'foil'), f('Foil braintwister series uncommon', 10.4, (s) => s.braintwister.uncommon, 'foil', 1)] })),
  paired({ name: 'Foil echoed pairs uncommon', outcomes: FRA_ECHOED_COLLECTOR }),
  { name: 'Foil echoed pairs uncommon', outcomes: FRA_ECHOED_COLLECTOR },
  { name: 'Foil echoed pairs uncommon', outcomes: FRA_ECHOED_COLLECTOR },
  { name: 'Foil tower basic land', outcomes: [f('Foil tower basic land', 1, (s) => s.towers, 'foil', 1)] },
  { name: 'Foil rare or mythic', outcomes: [f('Foil rare', 83.1, (s) => [...s.rares, ...s.echoed.rare], 'foil', 1), f('Foil mythic', 16.9, (s) => [...s.mythics, ...s.echoed.mythic], 'foil', 2)] },
  {
    name: 'Braintwister or Commander card',
    outcomes: [
      f('Braintwister series rare', 44.8, (s) => s.braintwister.rare, 'nonfoil', 2),
      f('Braintwister series mythic', 4.5, (s) => s.braintwister.mythic, 'nonfoil', 3),
      f('Commander borderless mythic', 3, (s) => s.commanderBorderless, 'nonfoil', 3),
      f('Commander extended-art rare', 47.8, (s) => s.commanderExtended, 'nonfoil', 2),
    ],
  },
  ...Array.from({ length: 2 }, (): Slot<FraSheets> => ({
    name: 'Booster Fun card',
    outcomes: [
      f('Borderless echoed pairs rare', 23.1, (s) => s.borderlessEchoed.rare, 'nonfoil', 2),
      f('Borderless echoed pairs mythic', 5, (s) => s.borderlessEchoed.mythic, 'nonfoil', 3),
      f('Shattered mirror rare', 8.3, (s) => s.shattered.rare, 'nonfoil', 2),
      f('Shattered mirror mythic', 6.6, (s) => s.shattered.mythic, 'nonfoil', 3),
      f("Sculptor's stronghold rare", 29.8, (s) => s.stronghold.rare, 'nonfoil', 2),
      f("Sculptor's stronghold mythic", 5.8, (s) => s.stronghold.mythic, 'nonfoil', 3),
      f('Portal view land', 8.3, (s) => s.portal, 'nonfoil', 2),
      f('Extended-art rare', 11.6, (s) => s.extended.rare, 'nonfoil', 2),
      f('Extended-art mythic', 1.7, (s) => s.extended.mythic, 'nonfoil', 3),
    ],
  })),
  {
    name: 'Foil Booster Fun card',
    outcomes: [
      f('Foil borderless echoed pairs rare', 17.1, (s) => s.borderlessEchoed.rare, 'foil', 2),
      f('Foil borderless echoed pairs mythic', 3.7, (s) => s.borderlessEchoed.mythic, 'foil', 3),
      f("Foil sculptor's stronghold rare", 22, (s) => s.stronghold.rare, 'foil', 2),
      f("Foil sculptor's stronghold mythic", 4.3, (s) => s.stronghold.mythic, 'foil', 3),
      f('Foil braintwister series rare', 18.3, (s) => s.braintwister.rare, 'foil', 2),
      f('Foil braintwister series mythic', 1.8, (s) => s.braintwister.mythic, 'foil', 3),
      f('Foil portal view land', 6.1, (s) => s.portal, 'foil', 2),
      f('Foil extended-art rare', 8.5, (s) => s.extended.rare, 'foil', 2),
      f('Foil extended-art mythic', 1.2, (s) => s.extended.mythic, 'foil', 3),
      f('Foil Special Guests card', 6.1, (s) => s.specialGuests, 'foil', 3),
      f('Foil Japan Showcase card', 9, (s) => s.japan, 'foil', 3),
      f('Fracture foil Japan Showcase card', 1, (s) => s.fractureJapan, 'foil', 3),
      f('Facet foil shattered mirror rare', 0.5, (s) => s.facetShattered.rare, 'foil', 3), // "less than 1%"
      f('Facet foil shattered mirror mythic', 0.3, (s) => s.facetShattered.mythic, 'foil', 3), // "less than 1%"
      f('Serialized double rainbow foil Bloodline Recollector', 0.1, (s) => s.headliner, 'foil', 3), // "less than 1%"
    ],
  },
  { name: 'Foil token or art card', outcomes: [f('Foil double-sided token', 65, (s) => s.tokens, 'foil'), f('Art card', 35, (s) => s.artCards)] },
];

let cachedFraSheets: FraSheets | undefined;

/** The echoed pair a card belongs to, from these sheets (main set or borderless). */
function counterpartOf(sheets: FraSheets, card: BoosterCard): BoosterCard | undefined {
  for (const list of [...Object.values(sheets.pairs), ...Object.values(sheets.borderlessPairs)]) {
    for (const [a, b] of list) {
      if (a.id === card.id) return b;
      if (b.id === card.id) return a;
    }
  }
  return undefined;
}

/**
 * Opens one Reality Fracture pack. Slots of the same kind never repeat a card,
 * as in print; the first echoed pairs slot's card comes with its counterpart
 * (same rarity, treatment and finish) in the next slot.
 */
export function openFraPack(kind: PackKind, rng: Rng = Math.random, sheets: FraSheets = (cachedFraSheets ??= buildFraSheets())): Pack {
  const slots = kind === 'play' ? FRA_PLAY_BOOSTER : FRA_COLLECTOR_BOOSTER;
  const cards: Pull[] = [];
  slots.forEach((slot, i) => {
    if (cards[i]) return;
    const groupOf = (x: Slot<FraSheets>) => x.group ?? x.name;
    const same = cards.filter((_, k) => groupOf(slots[k]!) === groupOf(slot));
    let pull = rollSlot(slot, sheets, rng);
    for (let tries = 0; tries < 20 && same.some((c) => c.card.id === pull.card.id); tries++) pull = rollSlot(slot, sheets, rng);
    cards[i] = pull;
    const partner = FRA_PAIRED.has(slot) ? counterpartOf(sheets, pull.card) : undefined;
    if (partner && slots[i + 1]) cards[i + 1] = { ...pull, card: partner };
  });
  return { kind, set: 'fra', cards };
}

