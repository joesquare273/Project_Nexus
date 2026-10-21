// Rules that come from a card's types (rule 205). Card data says what a card
// is; the functions here say what that means, so a rule tied to a type is
// written once instead of on every card. docs/card-types.md lists every type
// and which of its rules are built.

import { MANA_TYPES, type CardCategory, type CardDefinition, type CardType, type ManaType } from './types.ts';

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
