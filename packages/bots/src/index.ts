// Bots fill empty seats and drive fuzz tests (PRD 16). They only use the
// engine's public API, the same way a networked client would.

import {
  applyAction,
  createGame,
  getLegalActions,
  nextRandom,
  seedToState,
  type Action,
  type GameEvent,
  type GameSetup,
  type GameState,
} from '@nexus/engine';

export { basicAi } from './ai.ts';
export { manaSources, paidManaSources, planTaps, tapActions, type ManaTap, type TapOptions } from './mana.ts';
export { playableCards, type CardPlay, type PlayChoice } from './human.ts';

export type Bot = (state: GameState, legal: Action[]) => Action;

/** A tiny seeded generator owned by the bot, separate from the game's. */
export function makeRng(seed: number): () => number {
  let state = seedToState(seed);
  return () => {
    const [value, next] = nextRandom(state);
    state = next;
    return value;
  };
}

/**
 * Picks at random among legal actions, passing about half the time it could
 * act. Mana abilities are picked less often than other actions, since there
 * are usually many of them and the mana mostly goes unused. Used for fuzzing.
 */
export function randomBot(seed: number): Bot {
  const rand = makeRng(seed);
  return (_state, legal) => {
    const nonPass = legal.filter((a) => a.type !== 'PassPriority');
    const pass = legal.find((a) => a.type === 'PassPriority');
    if (pass && (nonPass.length === 0 || rand() < 0.5)) return pass;
    const others = nonPass.filter((a) => a.type !== 'ActivateManaAbility');
    const pool = others.length > 0 && rand() < 0.8 ? others : nonPass.length > 0 ? nonPass : legal;
    return pool[Math.floor(rand() * pool.length)]!;
  };
}

/**
 * Never takes the initiative: passes priority, doesn't attack or block, and
 * says no to "you may". Used by the tutorial so the lesson stays predictable.
 */
export function passiveBot(): Bot {
  return (_state, legal) =>
    legal.find((a) => a.type === 'PassPriority') ??
    legal.find((a) => (a.type === 'DeclareAttackers' && a.attacks.length === 0) || (a.type === 'DeclareBlockers' && a.blocks.length === 0)) ??
    legal.find((a) => (a.type === 'Decide' && !a.accept) || (a.type === 'Surveil' && !a.toGraveyard)) ??
    legal[0]!;
}

export interface PlayedGame {
  state: GameState;
  actions: Action[];
  events: GameEvent[];
  finished: boolean;
}

/**
 * Plays a whole game with one bot per seat. Stops after `maxActions`.
 * `onAction` runs after every applied action (fuzz tests check invariants there).
 */
export function playGame(
  setup: GameSetup,
  bots: Record<string, Bot>,
  opts: { maxActions?: number; onAction?: (state: GameState, action: Action) => void } = {},
): PlayedGame {
  const maxActions = opts.maxActions ?? 50_000;
  let { state, events } = createGame(setup);
  const allEvents = [...events];
  const actions: Action[] = [];
  while (state.pending.kind !== 'gameOver' && actions.length < maxActions) {
    const legal = getLegalActions(state);
    const bot = bots[state.pending.player];
    if (!bot) throw new Error(`No bot for seat ${state.pending.player}`);
    const action = bot(state, legal);
    const result = applyAction(state, action);
    if (!result.ok) throw new Error(`Bot chose an illegal action ${JSON.stringify(action)}: ${result.error}`);
    actions.push(action);
    allEvents.push(...result.events);
    state = result.state;
    opts.onAction?.(state, action);
  }
  return { state, actions, events: allEvents, finished: state.pending.kind === 'gameOver' };
}
