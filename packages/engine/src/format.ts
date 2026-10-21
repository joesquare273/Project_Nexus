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
  /** Commander rules (PRD 11) arrive in Milestone 6. */
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
