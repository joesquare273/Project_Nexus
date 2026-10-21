// Creating a new game from a seed, decks, and a format.

import { parseManaCost } from './cost.ts';
import { validateDeck, type FormatConfig } from './format.ts';
import { randomInt, seedToState, shuffleInPlace } from './rng.ts';
import { stabilize } from './sba.ts';
import { drawCards, emptyManaPool, type Ctx } from './state.ts';
import { enterStep } from './turn.ts';
import type { CardDefId, CardDefinition, GameEvent, GameState, PlayerId } from './types.ts';

export interface PlayerSetup {
  id: PlayerId;
  deck: CardDefId[];
}

export interface GameSetup {
  format: FormatConfig;
  cardDefs: Record<CardDefId, CardDefinition>;
  /** Seating order. The starting player is chosen at random from the seed. */
  players: PlayerSetup[];
  seed: number;
  /** For tests that use tiny decks. */
  skipDeckValidation?: boolean;
}

/**
 * Builds the starting state. A match is fully described by this setup plus
 * the ordered list of actions, so it can be re-simulated exactly.
 */
export function createGame(setup: GameSetup): { state: GameState; events: GameEvent[] } {
  const { format, cardDefs, players } = setup;
  if (players.length < format.minPlayers || players.length > format.maxPlayers) {
    throw new Error(`${format.name} needs ${format.minPlayers}-${format.maxPlayers} players, got ${players.length}.`);
  }
  if (new Set(players.map((p) => p.id)).size !== players.length) throw new Error('Player ids must be unique.');
  for (const p of players) {
    for (const id of p.deck) {
      const def = cardDefs[id];
      if (!def) throw new Error(`Unknown card "${id}".`);
      parseManaCost(def.manaCost); // Throws on unsupported symbols.
    }
    if (!setup.skipDeckValidation) {
      const errors = validateDeck(p.deck, cardDefs, format);
      if (errors.length > 0) throw new Error(`Deck for ${p.id} is not legal: ${errors.join(' ')}`);
    }
  }

  const turnOrder = players.map((p) => p.id);
  const s: GameState = {
    format,
    cardDefs,
    cards: {},
    players: {},
    turnOrder,
    activePlayer: turnOrder[0]!,
    turnNumber: 1,
    step: 'untap',
    stack: [],
    combat: null,
    pending: { kind: 'priority', player: turnOrder[0]!, passes: 0 },
    rngState: seedToState(setup.seed),
    nextId: 1,
  };
  const ctx: Ctx = { s, ev: [{ type: 'GameStarted', turnOrder: [...turnOrder] }] };

  for (const p of players) {
    s.players[p.id] = {
      id: p.id,
      life: format.startingLife,
      library: [],
      hand: [],
      battlefield: [],
      graveyard: [],
      exile: [],
      manaPool: emptyManaPool(),
      landsPlayedThisTurn: 0,
      eliminated: false,
      drewFromEmptyLibrary: false,
      conceded: false,
    };
    // Shuffle before assigning instance ids so ids reveal nothing about library order.
    const order = [...p.deck];
    shuffleInPlace(s, order);
    for (const defId of order) {
      const id = `c${s.nextId++}`;
      s.cards[id] = {
        id,
        defId,
        owner: p.id,
        controller: p.id,
        zone: 'library',
        tapped: false,
        summoningSick: false,
        damage: 0,
        deathtouched: false,
      };
      s.players[p.id]!.library.push(id);
    }
    ctx.ev.push({ type: 'LibraryShuffled', player: p.id });
  }

  // Mulligans come later; everyone keeps their opening seven for now.
  s.activePlayer = turnOrder[randomInt(s, turnOrder.length)]!;
  for (const id of turnOrder) drawCards(ctx, id, format.startingHandSize);

  ctx.ev.push({ type: 'TurnChanged', activePlayer: s.activePlayer, turnNumber: 1 });
  enterStep(ctx, 'untap');
  stabilize(ctx);
  return { state: s, events: ctx.ev };
}
