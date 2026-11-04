// Creating a new game from a seed, decks, and a format.

import { parseManaCost } from './cost.ts';
import { validateCommander, validateDeck, type FormatConfig } from './format.ts';
import { randomInt, seedToState, shuffleInPlace, type Seed } from './rng.ts';
import { stabilize } from './sba.ts';
import { drawCards, emptyManaPool, type Ctx } from './state.ts';
import { beginFirstTurn, startMulligans } from './mulligan.ts';
import type { CardDefId, CardDefinition, CardFinish, GameEvent, GameState, PlayerId } from './types.ts';

export interface PlayerSetup {
  id: PlayerId;
  /** The library. In Commander, everything except the commander. */
  deck: CardDefId[];
  /** Parallel to deck, preserving different basic-land and shared-card printings. */
  deckPrintings?: CardDefinition['printing'][];
  commanderPrinting?: CardDefinition['printing'];
  /** Parallel to deck: each card's finish (undefined for non-foil). Only finishes the player owns. */
  deckFinishes?: (CardFinish | undefined)[];
  commanderFinish?: CardFinish;
  /** Commander format: the commander, which starts in the command zone. */
  commander?: CardDefId;
  /** A second commander with Partner (rule 702.124), also in the command zone. */
  partner?: CardDefId;
  partnerPrinting?: CardDefinition['printing'];
  partnerFinish?: CardFinish;
  /** Asked to order simultaneous triggers (rule 603.3b). Off for bots, which keep the order they were found in. */
  ordersTriggers?: boolean;
}

export interface GameSetup {
  format: FormatConfig;
  cardDefs: Record<CardDefId, CardDefinition>;
  /** Seating order. The starting player is chosen at random from the seed, unless `firstPlayer` says. */
  players: PlayerSetup[];
  /** Who takes the first turn (rule 103.1: in a match, the previous game's loser chooses). Random when absent. */
  firstPlayer?: string;
  /** A 128-bit seed (online games: from crypto.randomBytes via seedFromBytes) or an integer (tests, local games). */
  seed: Seed;
  /** For tests that use tiny decks. */
  skipDeckValidation?: boolean;
  /**
   * Let players mulligan before the first turn (rule 103.5). Real games turn
   * this on; it's off by default so tests start straight at turn 1.
   */
  mulligans?: boolean;
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
    if (p.deckPrintings && p.deckPrintings.length !== p.deck.length) throw new Error('Deck printings must match the deck length.');
    for (const id of p.deck) {
      const def = cardDefs[id];
      if (!def) throw new Error(`Unknown card "${id}".`);
      if (def.token) throw new Error(`"${def.name}" is a token and can't be in a deck.`);
      parseManaCost(def.manaCost); // Throws on unsupported symbols.
    }
    if (format.commander && !p.commander) throw new Error(`${p.id} needs a commander.`);
    if (p.partner && !(format.commander && p.commander)) throw new Error(`${p.id}: only a Commander deck with a commander can have a partner.`);
    if (!setup.skipDeckValidation) {
      const full = p.commander ? [...p.deck, p.commander, ...(p.partner ? [p.partner] : [])] : p.deck;
      const errors = [
        ...validateDeck(full, cardDefs, format),
        ...(format.commander && p.commander ? validateCommander(full, p.commander, cardDefs, p.partner) : []),
      ];
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
    resolving: null,
    triggerQueue: [],
    triggeredThisTurn: [],
    temporaryEffects: [],
    creaturesDiedThisTurn: 0,
    combat: null,
    pending: { kind: 'priority', player: turnOrder[0]!, passes: 0 },
    rngState: seedToState(setup.seed),
    nextId: 1,
  };
  const ctx: Ctx = { s, ev: [{ type: 'GameStarted', turnOrder: [...turnOrder] }] };

  for (const p of players) {
    s.players[p.id] = {
      ...(p.ordersTriggers ? { ordersTriggers: true } : {}),
      id: p.id,
      life: format.startingLife,
      library: [],
      hand: [],
      battlefield: [],
      graveyard: [],
      exile: [],
      command: [],
      commanderCasts: {},
      commanderDamage: {},
      manaPool: emptyManaPool(),
      equipmentMana: emptyManaPool(),
      noncreatureSpellMana: emptyManaPool(),
      landsPlayedThisTurn: 0,
      eliminated: false,
      drewFromEmptyLibrary: false,
      conceded: false,
    };
    // Shuffle before assigning instance ids so ids reveal nothing about library order.
    const order = p.deck.map((defId,i)=>({defId,printing:p.deckPrintings?.[i],finish:p.deckFinishes?.[i]}));
    shuffleInPlace(s, order);
    for (const {defId,printing,finish} of order) {
      const id = `c${s.nextId++}`;
      s.cards[id] = {
        id,
        defId,
        ...(printing ? { printing: { ...printing } } : {}),
        ...(finish ? { finish } : {}),
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
    const commanders = format.commander && p.commander
      ? [{ defId: p.commander, printing: p.commanderPrinting, finish: p.commanderFinish }, ...(p.partner ? [{ defId: p.partner, printing: p.partnerPrinting, finish: p.partnerFinish }] : [])]
      : [];
    for (const commander of commanders) {
      const id = `c${s.nextId++}`;
      s.cards[id] = {
        id,
        defId: commander.defId,
        ...(commander.printing ? { printing: { ...commander.printing } } : {}),
        ...(commander.finish ? { finish: commander.finish } : {}),
        owner: p.id,
        controller: p.id,
        zone: 'command',
        tapped: false,
        summoningSick: false,
        damage: 0,
        deathtouched: false,
        isCommander: true,
      };
      s.players[p.id]!.command.push(id);
    }
  }

  const random = turnOrder[randomInt(s, turnOrder.length)]!;
  s.activePlayer = setup.firstPlayer && turnOrder.includes(setup.firstPlayer) ? setup.firstPlayer : random;
  for (const id of turnOrder) drawCards(ctx, id, format.startingHandSize);

  if (setup.mulligans) startMulligans(ctx);
  else beginFirstTurn(ctx);
  stabilize(ctx);
  return { state: s, events: ctx.ev };
}
