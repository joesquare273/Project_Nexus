// Rules that come from a card's types (rule 205). Card data says what a card
// is; the functions here say what that means, so a rule tied to a type is
// written once instead of on every card. docs/card-types.md lists every type
// and which of its rules are built.

import { currentDefinition } from './cardface.ts';
import { manaValue, parseManaCost } from './cost.ts';
import { matchesObject } from './filters.ts';
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

/**
 * An object's mana value. {X} is 0 everywhere except on the stack, where it's
 * the chosen value, once for each X symbol (rule 202.3e): {X}{X} with X = 2 is 4.
 */
export function objectManaValue(s: GameState, c: CardInstance): number {
  const def = currentDefinition(s, c);
  const base = manaValueOf(def);
  if (c.zone !== 'stack') return base;
  const item = s.stack.find((i) => i.kind === 'spell' && i.card === c.id);
  const x = item?.kind === 'spell' ? (item.x ?? 0) : 0;
  return base + x * (parseManaCost(def.manaCost).x ?? 0);
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

/** How much one activation of a permanent's mana ability adds: one, a fixed amount, or one per counter. */
export function manaAbilityAmount(c: CardInstance, def: CardDefinition): number {
  const ability = def.manaAbility;
  if (ability?.amountPerCounter) {
    const kind = ability.amountPerCounter === true ? undefined : ability.amountPerCounter;
    return kind ? (c.namedCounters?.[kind] ?? 0) : (c.counters ?? 0);
  }
  if (ability?.amountWithCounters && (c.counters ?? 0) > 0) return ability.amountWithCounters;
  return ability?.amount ?? 1;
}

/**
 * The mana a permanent's mana ability can make right now: its printed mana
 * (and basic land types), plus "any color in your commander's color
 * identity" and "any color a land an opponent controls could produce".
 */
export function manaChoices(s: GameState, c: CardInstance): ManaType[] {
  const def = s.cardDefs[c.defId]!;
  const ability = def.manaAbility;
  const yours = () => s.players[c.controller]!.battlefield.map((id) => s.cards[id]!).filter((x) => x.controller === c.controller);
  // "Add {G} for each +1/+1 counter": nothing to add without counters.
  if (ability?.amountPerCounter && manaAbilityAmount(c, def) === 0) return [];
  // "Activate only if you control five or more lands."
  if (ability?.ifLandsAtLeast && yours().filter((x) => s.cardDefs[x.defId]!.types.includes('land')).length < ability.ifLandsAtLeast) return [];
  const made = new Set<ManaType>(manaProduced(def));
  if (ability?.anyColorIfControls && yours().some((x) => matchesObject(s, ability.anyColorIfControls, x, { controller: c.controller }))) {
    for (const m of ['W', 'U', 'B', 'R', 'G'] as const) made.add(m);
  }
  if (def.manaAbility?.commanderIdentity) {
    for (const card of Object.values(s.cards)) {
      if (card.isCommander && card.owner === c.controller) {
        for (const color of s.cardDefs[card.defId]!.colorIdentity ?? []) made.add(color);
      }
    }
  }
  if (def.manaAbility?.yourLandColors) {
    for (const id of s.players[c.controller]!.battlefield) {
      const land = s.cardDefs[s.cards[id]!.defId]!;
      if (land.types.includes('land')) for (const m of manaProduced(land)) made.add(m);
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
  // Authority of the Consuls: "Creatures your opponents control enter tapped."
  if (s.cardDefs[c.defId]!.types.includes('creature')) {
    for (const pid of s.turnOrder) {
      if (pid === c.controller) continue;
      for (const id of s.players[pid]!.battlefield) {
        const o = s.cards[id]!;
        if (o.controller === pid && o.id !== c.id && s.cardDefs[o.defId]!.statics?.some((st) => st.opponentCreaturesEnterTapped)) return true;
      }
    }
  }
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

/** Relic of Legends' cost has no tap symbol, so summoning sickness does not apply. */
export function legendaryManaCreatures(s: GameState, source: CardInstance): CardInstance[] {
  if (source.zone !== 'battlefield' || source.phasedOut || !s.cardDefs[source.defId]!.manaAbility?.tapLegendaryCreature) return [];
  return Object.values(s.cards).filter((c) => c.zone === 'battlefield' && !c.phasedOut && c.controller === source.controller && !c.tapped &&
    s.cardDefs[c.defId]!.types.includes('creature') && isLegendary(s.cardDefs[c.defId]!));
}

/** Active permanents whose abilities apply to their controller. */
function librarySources(s: GameState, player: string): CardInstance[] {
  return Object.values(s.cards).filter((c) => c.zone === 'battlefield' && !c.phasedOut && c.controller === player);
}
export function visibleLibraryTop(s: GameState, player: string): string | undefined {
  return librarySources(s, player).some((c) => s.cardDefs[c.defId]!.lookAtLibraryTop) ? s.players[player]?.library[0] : undefined;
}
export function canCastLibraryTop(s: GameState, player: string, c: CardInstance, definition = s.cardDefs[c.defId]!): boolean {
  if (c.zone !== 'library' || s.players[player]?.library[0] !== c.id || !definition.types.includes('creature')) return false;
  return librarySources(s, player).some((source) => {
    const host = source.attachedTo ? s.cards[source.attachedTo] : undefined;
    return s.cardDefs[source.defId]!.castCreaturesFromLibraryTopWhileAttached && !!host && host.zone === 'battlefield' && !host.phasedOut && s.cardDefs[host.defId]!.types.includes('creature');
  });
}
/** Each entry is an ability of the equipped creature, distinct from its printed mana abilities. */
export function grantedManaAbilities(s: GameState, c: CardInstance): { source: string; mana: ManaType[] }[] {
  if (c.zone !== 'battlefield' || c.phasedOut || !s.cardDefs[c.defId]!.types.includes('creature')) return [];
  return Object.values(s.cards).filter((equipment) => equipment.zone === 'battlefield' && !equipment.phasedOut && equipment.attachedTo === c.id)
    .flatMap((equipment) => (s.cardDefs[equipment.defId]!.statics ?? []).filter((spec) => spec.affects === 'EquippedCreature' && spec.grantsMana)
      .map((spec) => ({ source: equipment.id, mana: spec.grantsMana! })));
}
