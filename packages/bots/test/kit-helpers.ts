// Helpers for testing the real Starter Kit cards: build a state directly,
// act, and let things resolve.

import { expect } from 'vitest';
import {
  FREE_FOR_ALL,
  applyAction,
  createGame,
  getLegalActions,
  type Action,
  type Attack,
  type Block,
  type GameEvent,
  type GameState,
  type InstanceId,
  type ManaType,
  type PlayerId,
  type Step,
  type Target,
  type ZoneName,
} from '@nexus/engine';
import { CARD_DEFS } from '@nexus/cards';

export const card = (id: string): Target => ({ kind: 'card', card: id });
export const player = (id: string): Target => ({ kind: 'player', player: id });

/** P1's main phase on turn 2, empty hands, libraries of Islands. */
export function newGame(players = 2): GameState {
  const ids = Array.from({ length: players }, (_, i) => `P${i + 1}`);
  const { state } = createGame({
    format: FREE_FOR_ALL,
    cardDefs: CARD_DEFS,
    seed: 1,
    players: ids.map((id) => ({ id, deck: Array(20).fill('island') })),
    skipDeckValidation: true,
  });
  for (const pid of ids) {
    const p = state.players[pid]!;
    for (const id of p.hand) state.cards[id]!.zone = 'library';
    p.library.push(...p.hand);
    p.hand = [];
  }
  state.activePlayer = 'P1';
  state.step = 'main1';
  state.turnNumber = 2;
  state.pending = { kind: 'priority', player: 'P1', passes: 0 };
  return state;
}

/** Puts a card straight into a zone. Permanents arrive untapped and ready. */
export function put(
  s: GameState,
  owner: PlayerId,
  defId: string,
  zone: Exclude<ZoneName, 'stack' | 'void'> = 'battlefield',
  extra: Partial<GameState['cards'][string]> = {},
): InstanceId {
  if (!s.cardDefs[defId]) throw new Error(`No card "${defId}"`);
  const id = `t${s.nextId++}`;
  s.cards[id] = {
    id,
    defId,
    owner,
    controller: owner,
    zone,
    tapped: false,
    summoningSick: false,
    damage: 0,
    deathtouched: false,
    ...extra,
  };
  if (zone === 'library') s.players[owner]!.library.unshift(id);
  else s.players[owner]![zone].push(id);
  return id;
}

export function mana(s: GameState, who: PlayerId, pool: Partial<Record<ManaType, number>>): void {
  for (const [t, n] of Object.entries(pool)) s.players[who]!.manaPool[t as ManaType] += n;
}

export interface Played {
  state: GameState;
  events: GameEvent[];
}

export function act(s: GameState, action: Action): GameState {
  return actWithEvents(s, action).state;
}

export function actWithEvents(s: GameState, action: Action): Played {
  const r = applyAction(s, action);
  if (!r.ok) throw new Error(`${action.type} by ${action.player}: ${r.error}`);
  return { state: r.state, events: r.events };
}

export function rejected(s: GameState, action: Action): string {
  const r = applyAction(s, action);
  expect(r.ok, `expected ${action.type} to be rejected`).toBe(false);
  return r.ok ? '' : r.error;
}

/**
 * Passes and answers decisions until the stack is empty and someone simply
 * has priority. Trigger targets: the first legal choice unless `targets`
 * picks one. "You may": `accept`. Surveil: keep unless `surveilToGraveyard`.
 */
export function settle(
  s: GameState,
  opts: { accept?: boolean; targets?: (options: Target[][]) => Target[]; surveilToGraveyard?: boolean } = {},
): Played {
  const events: GameEvent[] = [];
  for (let guard = 0; guard < 200; guard++) {
    const p = s.pending;
    let action: Action | undefined;
    if (p.kind === 'chooseTargets') {
      const legal = getLegalActions(s).filter((a): a is Extract<Action, { type: 'ChooseTargets' }> => a.type === 'ChooseTargets');
      const targets = opts.targets ? opts.targets(legal.map((a) => a.targets)) : legal[0]!.targets;
      action = { type: 'ChooseTargets', player: p.player, targets };
    } else if (p.kind === 'decide') {
      action = { type: 'Decide', player: p.player, accept: opts.accept ?? true };
    } else if (p.kind === 'chooseLegend') {
      action = { type: 'ChooseLegend', player: p.player, keep: p.cards[0]! };
    } else if (p.kind === 'surveil') {
      action = { type: 'Surveil', player: p.player, toGraveyard: opts.surveilToGraveyard ?? false };
    } else if (p.kind === 'priority' && s.stack.length > 0) {
      action = { type: 'PassPriority', player: p.player };
    } else {
      return { state: s, events };
    }
    const r = actWithEvents(s, action);
    s = r.state;
    events.push(...r.events);
  }
  throw new Error('settle did not finish');
}

/** Everyone passes once with an empty stack, moving to the next step. */
export function nextStep(s: GameState): GameState {
  const living = s.turnOrder.filter((id) => !s.players[id]!.eliminated).length;
  for (let i = 0; i < living && s.pending.kind === 'priority'; i++) s = act(s, { type: 'PassPriority', player: s.pending.player });
  return s;
}

/** Passes (settling anything that triggers) until the game reaches `step`. */
export function goTo(s: GameState, step: Step, opts: Parameters<typeof settle>[1] = {}): GameState {
  for (let guard = 0; guard < 100; guard++) {
    s = settle(s, opts).state;
    if (s.step === step && s.pending.kind !== 'chooseTargets') return s;
    // On the way, nobody attacks or blocks.
    if (s.pending.kind === 'declareAttackers') s = act(s, { type: 'DeclareAttackers', player: s.pending.player, attacks: [] });
    else if (s.pending.kind === 'declareBlockers') s = act(s, { type: 'DeclareBlockers', player: s.pending.player, blocks: [] });
    else if (s.pending.kind !== 'priority') return s;
    else s = act(s, { type: 'PassPriority', player: s.pending.player });
  }
  throw new Error(`never reached ${step}`);
}

/** P1 attacks, defenders block as given, and combat damage happens. Triggers settle with `opts`. */
export function fight(
  s: GameState,
  attacks: Attack[],
  blocksBy: Record<PlayerId, Block[]> = {},
  opts: Parameters<typeof settle>[1] = {},
): Played {
  s = goTo(s, 'declareAttackers', opts);
  const events: GameEvent[] = [];
  let r = actWithEvents(s, { type: 'DeclareAttackers', player: 'P1', attacks });
  events.push(...r.events);
  r = settle(r.state, opts);
  events.push(...r.events);
  s = nextStep(r.state);
  while (s.pending.kind === 'declareBlockers') {
    const who = s.pending.player;
    r = actWithEvents(s, { type: 'DeclareBlockers', player: who, blocks: blocksBy[who] ?? [] });
    events.push(...r.events);
    s = r.state;
  }
  r = settle(s, opts);
  events.push(...r.events);
  s = nextStep(r.state); // to combat damage
  r = settle(s, opts);
  events.push(...r.events);
  return { state: r.state, events };
}

/** Casts a spell (or activates an ability) for P1 and resolves everything. */
export function cast(s: GameState, action: Action, opts: Parameters<typeof settle>[1] = {}): Played {
  const first = actWithEvents(s, action);
  const rest = settle(first.state, opts);
  return { state: rest.state, events: [...first.events, ...rest.events] };
}
