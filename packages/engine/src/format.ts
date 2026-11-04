// Formats are engine configuration, not separate code paths (PRD 4).

import { isBasicLand } from './typerules.ts';
import type { CardDefId, CardDefinition } from './types.ts';

export interface FormatConfig {
  name: string;
  minPlayers: number;
  maxPlayers: number;
  minDeckSize: number;
  maxDeckSize?: number;
  /** Max copies of a card other than basic lands. 1 means singleton. */
  maxCopies: number;
  startingLife: number;
  startingHandSize: number;
  /** Commander rules (rule 903): a command zone, commander tax, commander damage, color identity. */
  commander: boolean;
  commanderDamageThreshold?: number;
}

/** 60-card constructed, two players. What the FIN Starter Kits are built for. */
export const CONSTRUCTED_DUEL: FormatConfig = {
  name: 'constructedDuel',
  minPlayers: 2,
  maxPlayers: 2,
  minDeckSize: 60,
  maxCopies: 4,
  startingLife: 20,
  startingHandSize: 7,
  commander: false,
};

/** The same deck rules opened up to 3-4 players, so pods can be tested before Commander rules exist. */
export const FREE_FOR_ALL: FormatConfig = {
  ...CONSTRUCTED_DUEL,
  name: 'freeForAll',
  maxPlayers: 4,
};

/**
 * Limited (draft and sealed): 40 to 60 cards, any number of copies of what
 * you drafted (plus unlimited basic lands), 20 life, 2-4 players. 99 stands
 * for "no limit" so the format stays plain JSON.
 */
export const LIMITED: FormatConfig = {
  name: 'limited',
  minPlayers: 2,
  maxPlayers: 4,
  minDeckSize: 40,
  maxDeckSize: 60,
  maxCopies: 99,
  startingLife: 20,
  startingHandSize: 7,
  commander: false,
};

/**
 * Commander (rule 903): 100-card singleton decks including the commander,
 * 40 life, and 21 combat damage from one commander knocks a player out.
 */
export const COMMANDER: FormatConfig = {
  name: 'commander',
  minPlayers: 2,
  maxPlayers: 4,
  minDeckSize: 100,
  maxDeckSize: 100,
  maxCopies: 1,
  startingLife: 40,
  startingHandSize: 7,
  commander: true,
  commanderDamageThreshold: 21,
};

/**
 * A legendary creature, a legendary Vehicle, or a legendary Spacecraft with
 * power and toughness can be a commander (rule 903.3, Spacecraft since Edge
 * of Eternities).
 */
export function canBeCommander(def: CardDefinition): boolean {
  if (!def.supertypes?.includes('Legendary')) return false;
  return def.types.includes('creature') || !!def.subtypes?.includes('Vehicle') || (!!def.subtypes?.includes('Spacecraft') && def.power !== undefined);
}

/** Whether two cards can be commanders together: both have Partner, or each partners with the other (rule 702.124). */
export function canPartner(a: CardDefinition, b: CardDefinition): boolean {
  if (a.name === b.name) return false;
  return (!!a.partner && !!b.partner) || (a.partnerWith === b.name && b.partnerWith === a.name);
}

/**
 * Problems with a commander (and its partner) and the color identity of its
 * deck (rules 903.3-903.5); with two commanders, the identity is both of theirs
 * (rule 702.124c).
 */
export function validateCommander(
  deck: readonly CardDefId[],
  commander: CardDefId,
  cardDefs: Readonly<Record<CardDefId, CardDefinition>>,
  partner?: CardDefId,
): string[] {
  const def = cardDefs[commander];
  if (!def) return [`Unknown commander "${commander}".`];
  const errors: string[] = [];
  if (!canBeCommander(def)) errors.push(`"${def.name}" isn't a legendary creature, Vehicle or Spacecraft, so it can't be a commander.`);
  const second = partner !== undefined ? cardDefs[partner] : undefined;
  if (partner !== undefined && !second) return [...errors, `Unknown commander "${partner}".`];
  if (second) {
    if (!canBeCommander(second)) errors.push(`"${second.name}" isn't a legendary creature, Vehicle or Spacecraft, so it can't be a commander.`);
    if (!canPartner(def, second)) errors.push(`${def.name} and ${second.name} can't be commanders together: both need Partner (or to partner with each other).`);
  }
  const identity = new Set([...(def.colorIdentity ?? []), ...(second?.colorIdentity ?? [])]);
  const names = second ? `${def.name} and ${second.name}'s` : `${def.name}'s`;
  for (const id of new Set(deck)) {
    const card = cardDefs[id];
    const outside = (card?.colorIdentity ?? []).filter((c) => !identity.has(c));
    if (card && outside.length > 0) errors.push(`"${card.name}" is outside ${names} color identity.`);
  }
  return errors;
}

/** Returns a list of problems. An empty list means the deck is legal. */
export function validateDeck(
  deck: readonly CardDefId[],
  cardDefs: Readonly<Record<CardDefId, CardDefinition>>,
  format: FormatConfig,
): string[] {
  const errors: string[] = [];
  if (deck.length < format.minDeckSize) {
    errors.push(`Deck has ${deck.length} cards; the minimum is ${format.minDeckSize}.`);
  }
  if (format.maxDeckSize !== undefined && deck.length > format.maxDeckSize) {
    errors.push(`Deck has ${deck.length} cards; the maximum is ${format.maxDeckSize}.`);
  }
  const counts = new Map<CardDefId, number>();
  for (const id of deck) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const [id, count] of counts) {
    const def = cardDefs[id];
    if (!def) {
      errors.push(`Unknown card "${id}".`);
      continue;
    }
    if (!isBasicLand(def) && !def.anyNumberInDeck && count > format.maxCopies) {
      errors.push(`"${def.name}" appears ${count} times; the limit is ${format.maxCopies}.`);
    }
  }
  return errors;
}
