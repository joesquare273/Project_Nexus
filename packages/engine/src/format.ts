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

/** Problems with a commander and the color identity of its deck (rules 903.3-903.5). */
export function validateCommander(
  deck: readonly CardDefId[],
  commander: CardDefId,
  cardDefs: Readonly<Record<CardDefId, CardDefinition>>,
): string[] {
  const def = cardDefs[commander];
  if (!def) return [`Unknown commander "${commander}".`];
  const errors: string[] = [];
  if (!def.supertypes?.includes('Legendary') || !def.types.includes('creature')) {
    errors.push(`"${def.name}" isn't a legendary creature, so it can't be a commander.`);
  }
  const identity = new Set(def.colorIdentity ?? []);
  for (const id of new Set(deck)) {
    const card = cardDefs[id];
    const outside = (card?.colorIdentity ?? []).filter((c) => !identity.has(c));
    if (card && outside.length > 0) errors.push(`"${card.name}" is outside ${def.name}'s color identity.`);
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
    if (!isBasicLand(def) && count > format.maxCopies) {
      errors.push(`"${def.name}" appears ${count} times; the limit is ${format.maxCopies}.`);
    }
  }
  return errors;
}
