// Scenario helpers: "given this state, when this action, expect these events".
// Tests build states by direct setup (putting cards into zones, setting the
// step) rather than playing up to them, so each test shows only what matters.

import { expect } from 'vitest';
import {
  FREE_FOR_ALL,
  applyAction,
  createGame,
  type Action,
  type CardDefinition,
  type GameEvent,
  type GameState,
  type InstanceId,
  type Keyword,
  type ManaType,
  type PlayerId,
  type Step,
  type ZoneName,
} from '../src/index.ts';

const land = (id: string, produces: ManaType[], extra: Partial<CardDefinition> = {}): CardDefinition => ({
  id,
  name: id,
  types: ['land'],
  supertypes: ['Basic'],
  produces,
  ...extra,
});

const creature = (id: string, manaCost: string, power: number, toughness: number, keywords: Keyword[] = []) =>
  ({ id, name: id, manaCost, types: ['creature'], power, toughness, keywords }) satisfies CardDefinition;

export const DEFS: Record<string, CardDefinition> = Object.fromEntries(
  (
    [
      land('island', ['U']),
      land('mountain', ['R']),
      land('plains', ['W']),
      land('swamp', ['B']),
      land('town', ['R', 'W'], { supertypes: [], subtypes: ['Town'], entersTapped: true }),
      creature('bear', '{1}{G}', 2, 2),
      creature('ogre', '{2}{R}', 3, 3),
      creature('wall', '{1}{W}', 0, 4),
      creature('giant', '{4}{G}', 6, 6),
      creature('flyer', '{1}{U}', 1, 1, ['Flying']),
      creature('archer', '{1}{G}', 1, 3, ['Reach']),
      creature('brute', '{1}{R}', 2, 2, ['Menace']),
      creature('duelist', '{1}{R}', 2, 1, ['FirstStrike']),
      creature('twinblade', '{2}{R}', 2, 2, ['DoubleStrike']),
      creature('trampler', '{3}{G}', 4, 4, ['Trample']),
      creature('viper', '{B}', 1, 1, ['Deathtouch']),
      creature('cleric', '{1}{W}', 2, 2, ['Lifelink']),
      creature('sentinel', '{1}{W}', 2, 2, ['Vigilance']),
      creature('raider', '{1}{R}', 2, 1, ['Haste']),
      creature('golem', '{3}', 1, 1, ['Indestructible']),
      creature('ambusher', '{1}{U}', 2, 2, ['Flash']),
      { id: 'shock', name: 'shock', manaCost: '{R}', types: ['instant'], effects: [{ effect: 'DealDamage', amount: 2, target: 'AnyTarget' }] },
      { id: 'volley', name: 'volley', manaCost: '{1}{R}', types: ['sorcery'], effects: [{ effect: 'DealDamage', amount: 1, target: 'EachOpponent' }] },
      { id: 'quake', name: 'quake', manaCost: '{R}', types: ['sorcery'], effects: [{ effect: 'DealDamage', amount: 1, target: 'EachPlayer' }] },
      { id: 'mend', name: 'mend', manaCost: '{W}', types: ['instant'], effects: [{ effect: 'GainLife', amount: 3, target: 'You' }] },
      { id: 'study', name: 'study', manaCost: '{1}{U}', types: ['sorcery'], effects: [{ effect: 'DrawCards', amount: 2, target: 'You' }] },
      { id: 'murder', name: 'murder', manaCost: '{1}{B}', types: ['instant'], effects: [{ effect: 'Destroy', target: 'TargetCreature' }] },
      // Triggered abilities. Each mirrors a real card's shape without its name.
      {
        ...creature('drainer', '{2}{B}', 2, 3),
        triggers: [
          {
            when: 'Dies',
            what: { controller: 'You', types: ['creature', 'artifact'] },
            effects: [
              { effect: 'LoseLife', amount: 1, target: 'TargetOpponent' },
              { effect: 'GainLife', amount: 1, target: 'You' },
            ],
          },
        ],
      },
      {
        ...creature('mourner', '{4}{W}', 3, 5),
        triggers: [
          {
            when: 'Dies',
            what: { other: true, controller: 'You', types: ['creature', 'artifact'] },
            oneOrMore: true,
            oncePerTurn: true,
            effects: [{ effect: 'DrawCards', amount: 1, target: 'You' }],
          },
        ],
      },
      {
        ...creature('revenant', '{2}{B}', 3, 3),
        entersTapped: true,
        triggers: [
          {
            when: 'SpellCast',
            what: { controller: 'You', nonTypes: ['creature'] },
            zone: 'graveyard',
            cost: { mana: '{B}' },
            effects: [{ effect: 'ReturnToHand', target: 'This' }],
          },
        ],
      },
      {
        ...creature('tyrant', '{4}{U}{U}', 4, 4),
        triggers: [
          { when: 'EntersBattlefield', effects: [{ effect: 'Tap', target: 'EachOpponentCreature' }] },
          {
            when: 'CombatDamageToPlayer',
            what: { controller: 'You', types: ['creature'] },
            effects: [{ effect: 'DrawCards', amount: 1, target: 'You' }],
          },
        ],
      },
      {
        ...creature('pinger', '{1}{R}', 1, 1),
        triggers: [{ when: 'EntersBattlefield', effects: [{ effect: 'DealDamage', amount: 1, target: 'AnyTarget' }] }],
      },
      {
        ...creature('scout', '{1}{U}', 1, 1),
        triggers: [{ when: 'Attacks', effects: [{ effect: 'DrawCards', amount: 1, target: 'You' }] }],
      },
      {
        ...creature('herald', '{1}{W}', 1, 1),
        triggers: [{ when: 'BeginCombat', effects: [{ effect: 'GainLife', amount: 1, target: 'You' }] }],
      },
      {
        ...creature('ascetic', '{4}{B}', 5, 5),
        triggers: [{ when: 'Upkeep', cost: { life: 1 }, effects: [{ effect: 'DrawCards', amount: 1, target: 'You' }] }],
      },
      {
        // "Whenever another nonland permanent you control enters, you gain 1 life."
        ...creature('gardener', '{1}{G}', 1, 1),
        triggers: [
          {
            when: 'EntersBattlefield',
            what: { other: true, controller: 'You', categories: ['permanent'], nonTypes: ['land'] },
            effects: [{ effect: 'GainLife', amount: 1, target: 'You' }],
          },
        ],
      },
      {
        ...creature('healer', '{1}{W}', 1, 1),
        triggers: [{ when: 'EntersBattlefield', optional: true, effects: [{ effect: 'GainLife', amount: 2, target: 'You' }] }],
      },
    ] satisfies CardDefinition[]
  ).map((d) => [d.id, d]),
);

export const playerIds = (n: number): PlayerId[] => Array.from({ length: n }, (_, i) => `P${i + 1}`);

/**
 * A game with `n` players whose libraries are all islands. By default it is
 * P1's turn 2, main phase 1, P1 has priority, and every hand is empty.
 */
export function newGame(n: number, opts: { seed?: number; librarySize?: number; raw?: boolean } = {}): GameState {
  const { state } = createGame({
    format: FREE_FOR_ALL,
    cardDefs: DEFS,
    seed: opts.seed ?? 1,
    players: playerIds(n).map((id) => ({ id, deck: Array(opts.librarySize ?? 30).fill('island') })),
    skipDeckValidation: true,
  });
  if (opts.raw) return state;
  for (const pid of state.turnOrder) {
    const p = state.players[pid]!;
    // Put the opening hand back on the bottom so tests start from empty hands.
    for (const id of p.hand) state.cards[id]!.zone = 'library';
    p.library.push(...p.hand);
    p.hand = [];
  }
  return setTurn(state, 'P1', 'main1');
}

/** Jumps straight to a step of `active`'s turn with priority to them. */
export function setTurn(s: GameState, active: PlayerId, step: Step): GameState {
  s.activePlayer = active;
  s.step = step;
  s.turnNumber = Math.max(s.turnNumber, 2);
  s.pending = { kind: 'priority', player: active, passes: 0 };
  return s;
}

/** Creates a new card directly in a zone. Permanents arrive untapped and not summoning sick. */
export function put(
  s: GameState,
  owner: PlayerId,
  defId: string,
  zone: ZoneName = 'battlefield',
  opts: { tapped?: boolean; summoningSick?: boolean } = {},
): InstanceId {
  if (!s.cardDefs[defId]) throw new Error(`No test card "${defId}"`);
  const id = `t${s.nextId++}`;
  s.cards[id] = {
    id,
    defId,
    owner,
    controller: owner,
    zone,
    tapped: opts.tapped ?? false,
    summoningSick: opts.summoningSick ?? false,
    damage: 0,
    deathtouched: false,
  };
  if (zone === 'library') s.players[owner]!.library.unshift(id);
  else if (zone !== 'stack' && zone !== 'void') s.players[owner]![zone].push(id);
  return id;
}

export function addMana(s: GameState, playerId: PlayerId, mana: Partial<Record<ManaType, number>>): void {
  for (const [t, n] of Object.entries(mana)) s.players[playerId]!.manaPool[t as ManaType] += n;
}

export interface ActResult {
  state: GameState;
  events: GameEvent[];
}

/** Applies an action that must be legal. */
export function act(s: GameState, action: Action): ActResult {
  const r = applyAction(s, action);
  if (!r.ok) throw new Error(`Expected ${action.type} by ${action.player} to be legal: ${r.error}`);
  return { state: r.state, events: r.events };
}

/** Applies an action that must be rejected, and returns the error. */
export function rejected(s: GameState, action: Action): string {
  const r = applyAction(s, action);
  expect(r.ok, `Expected ${action.type} by ${action.player} to be rejected`).toBe(false);
  return r.ok ? '' : r.error;
}

export function priorityHolder(s: GameState): PlayerId {
  if (s.pending.kind !== 'priority') throw new Error(`Expected priority, but pending is ${s.pending.kind}`);
  return s.pending.player;
}

/** Whoever holds priority passes. */
export function pass(s: GameState): ActResult {
  return act(s, { type: 'PassPriority', player: priorityHolder(s) });
}

/** Every living player passes once, starting with the current priority holder. Collects events. */
export function passAll(s: GameState): ActResult {
  const events: GameEvent[] = [];
  const living = s.turnOrder.filter((id) => !s.players[id]!.eliminated).length;
  const passes = s.pending.kind === 'priority' ? living - s.pending.passes : 0;
  for (let i = 0; i < passes; i++) {
    const r = pass(s);
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

/** Passes until the game reaches `step` (or a non-priority decision). */
export function passUntil(s: GameState, step: Step): GameState {
  for (let guard = 0; guard < 500; guard++) {
    if (s.step === step || s.pending.kind !== 'priority') return s;
    s = pass(s).state;
  }
  throw new Error(`Never reached ${step}`);
}

export function zoneOf(s: GameState, id: InstanceId): ZoneName {
  return s.cards[id]!.zone;
}

export function eventsOf<T extends GameEvent['type']>(events: GameEvent[], type: T) {
  return events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
}
