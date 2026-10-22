// Rules that come from a card's types (rule 205). Card data says what a card
// is; the functions here say what that means, so a rule tied to a type is
// written once instead of on every card. docs/card-types.md lists every type
// and which of its rules are built.

import { manaValue, parseManaCost } from './cost.ts';
import {
  COLORS,
  MANA_TYPES,
  type CardCategory,
  type CardDefinition,
  type CardInstance,
  type CardType,
  type Color,
  type GameState,
  type ManaType,
} from './types.ts';

/** A card's colors: the colored mana symbols in its cost, or its color indicator (rule 202.2). */
export function colorsOf(def: CardDefinition): Color[] {
  if (def.colors) return [...def.colors];
  const cost = parseManaCost(def.manaCost);
  return COLORS.filter((c) => (cost[c] ?? 0) > 0);
}

/** A card's mana value: the total mana in its cost, with X as 0 (rule 202.3). */
export function manaValueOf(def: CardDefinition): number {
  return manaValue(parseManaCost(def.manaCost));
}

/** Card types whose cards are permanents: they resolve onto the battlefield and stay (rule 110.4). */
export const PERMANENT_TYPES: readonly CardType[] = ['land', 'creature', 'artifact', 'enchantment'];

/** Permanents: lands, creatures, artifacts, enchantments. They stay on the battlefield. */
export function isPermanentCard(def: CardDefinition): boolean {
  return def.types.some((t) => PERMANENT_TYPES.includes(t));
}

/** Instants and sorceries: they do what they say, then go to their owner's graveyard (rule 608.2n). */
export function isNonpermanentCard(def: CardDefinition): boolean {
  return !isPermanentCard(def);
}

/** Every card except a land is cast as a spell (rule 112.1); lands are played (rule 305.1). */
export function isSpellCard(def: CardDefinition): boolean {
  return !def.types.includes('land');
}

/** The broad categories a card belongs to, for filters like "nonland permanent" or "noncreature spell". */
export function categoriesOf(def: CardDefinition): CardCategory[] {
  const out: CardCategory[] = [];
  out.push(isPermanentCard(def) ? 'permanent' : 'nonpermanent');
  if (isSpellCard(def)) out.push('spell');
  return out;
}

/** Each basic land type has an intrinsic "{T}: Add [mana]" ability (rule 305.6). */
export const BASIC_LAND_TYPE_MANA: Readonly<Record<string, ManaType>> = {
  Plains: 'W',
  Island: 'U',
  Swamp: 'B',
  Mountain: 'R',
  Forest: 'G',
};

/**
 * The mana a permanent's mana abilities can make: its basic land types'
 * mana plus anything printed (`produces`), in WUBRG order.
 */
export function manaProduced(def: CardDefinition): ManaType[] {
  const made = new Set<ManaType>(def.produces ?? []);
  for (const sub of def.subtypes ?? []) {
    const mana = BASIC_LAND_TYPE_MANA[sub];
    if (mana && def.types.includes('land')) made.add(mana);
  }
  return MANA_TYPES.filter((m) => made.has(m));
}

export function isLegendary(def: CardDefinition): boolean {
  return def.supertypes?.includes('Legendary') ?? false;
}

/** Basic lands are exempt from the four-copy limit (rule 100.2a). */
export function isBasicLand(def: CardDefinition): boolean {
  return (def.supertypes?.includes('Basic') ?? false) && def.types.includes('land');
}

/**
 * The mana a permanent's mana ability can make right now: its printed mana
 * (and basic land types), plus "any color in your commander's color
 * identity" and "any color a land an opponent controls could produce".
 */
export function manaChoices(s: GameState, c: CardInstance): ManaType[] {
  const def = s.cardDefs[c.defId]!;
  const made = new Set<ManaType>(manaProduced(def));
  if (def.manaAbility?.commanderIdentity) {
    for (const card of Object.values(s.cards)) {
      if (card.isCommander && card.owner === c.controller) {
        for (const color of s.cardDefs[card.defId]!.colorIdentity ?? []) made.add(color);
      }
    }
  }
  if (def.manaAbility?.opponentLandColors) {
    for (const pid of s.turnOrder) {
      if (pid === c.controller) continue;
      for (const id of s.players[pid]!.battlefield) {
        const land = s.cardDefs[s.cards[id]!.defId]!;
        if (land.types.includes('land')) for (const m of manaProduced(land)) if (m !== 'C') made.add(m);
      }
    }
  }
  return MANA_TYPES.filter((m) => made.has(m));
}

/** For lands like snarls: whether you have a card you could reveal to have it enter untapped. */
export function canReveal(s: GameState, c: CardInstance, controller: string = c.controller): boolean {
  const subtypes = s.cardDefs[c.defId]!.entersTappedUnless?.revealSubtypes;
  if (!subtypes) return false;
  const hand = s.players[controller]!.hand.map((id) => s.cards[id]!).filter((x) => x.id !== c.id);
  return subtypes.some((t) => hand.some((x) => s.cardDefs[x.defId]!.subtypes?.includes(t)));
}

/**
 * Whether a permanent enters tapped: always, or unless its condition holds
 * (checklands, battle lands, snarls). For snarls, `reveal` is the player's
 * choice; by default they reveal when they can.
 */
export function entersTapped(s: GameState, c: CardInstance, reveal?: boolean): boolean {
  const def = s.cardDefs[c.defId]!;
  if (def.entersTapped) return true;
  const unless = def.entersTappedUnless;
  if (!unless) return false;
  const defOf = (x: CardInstance) => s.cardDefs[x.defId]!;
  const mine = s.players[c.controller]!.battlefield.map((id) => s.cards[id]!).filter((x) => x.id !== c.id);
  if (unless.controlsSubtypes?.some((t) => mine.some((x) => defOf(x).subtypes?.includes(t)))) return false;
  if (unless.basicLands !== undefined && mine.filter((x) => isBasicLand(defOf(x))).length >= unless.basicLands) {
    return false;
  }
  if (unless.revealSubtypes && reveal !== false && canReveal(s, c)) return false;
  return true;
}
