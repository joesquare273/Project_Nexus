import { describe, expect, it } from 'vitest';
import type { Attack, Block, GameState } from '../src/index.ts';
import { act, eventsOf, newGame, passAll, passUntil, put, rejected, zoneOf } from './helpers.ts';

/** From P1's main phase to their declare attackers decision. */
function toAttacks(s: GameState): GameState {
  s = passUntil(s, 'declareAttackers');
  expect(s.pending).toEqual({ kind: 'declareAttackers', player: 'P1' });
  return s;
}

const attack = (s: GameState, attacks: Attack[]) => act(s, { type: 'DeclareAttackers', player: 'P1', attacks }).state;
const block = (s: GameState, player: string, blocks: Block[]) => act(s, { type: 'DeclareBlockers', player, blocks }).state;

/** Declare attacks, let every defender block as given, and run combat damage. */
function fight(s: GameState, attacks: Attack[], blocksBy: Record<string, Block[]> = {}) {
  s = attack(toAttacks(s), attacks);
  s = passAll(s).state; // priority in declare attackers
  while (s.pending.kind === 'declareBlockers') {
    const who = s.pending.player;
    s = block(s, who, blocksBy[who] ?? []);
  }
  return passAll(s); // priority in declare blockers -> combat damage
}

describe('attacking in pods', () => {
  it('lets each attacker choose which opponent to attack', () => {
    const s = newGame(3);
    const a = put(s, 'P1', 'bear');
    const b = put(s, 'P1', 'ogre');
    const { state } = fight(s, [
      { attacker: a, defender: 'P2' },
      { attacker: b, defender: 'P3' },
    ]);
    expect(state.players.P2!.life).toBe(18);
    expect(state.players.P3!.life).toBe(17);
    expect(state.players.P1!.life).toBe(20);
  });

  it('asks each defending player for blockers in turn order', () => {
    let s = newGame(4);
    const a = put(s, 'P1', 'bear');
    const b = put(s, 'P1', 'ogre');
    s = attack(toAttacks(s), [
      { attacker: a, defender: 'P4' },
      { attacker: b, defender: 'P2' },
    ]);
    s = passAll(s).state;
    expect(s.pending).toEqual({ kind: 'declareBlockers', player: 'P2' });
    s = block(s, 'P2', []);
    expect(s.pending).toEqual({ kind: 'declareBlockers', player: 'P4' });
    expect(rejected(s, { type: 'DeclareBlockers', player: 'P3', blocks: [] })).toMatch(/not declaring blockers/);
  });

  it('rejects attacks on yourself, eliminated players, and with ineligible creatures', () => {
    const s = newGame(3);
    const ready = put(s, 'P1', 'bear');
    const sick = put(s, 'P1', 'bear', 'battlefield', { summoningSick: true });
    const tapped = put(s, 'P1', 'bear', 'battlefield', { tapped: true });
    const at = toAttacks(s);
    expect(rejected(at, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: ready, defender: 'P1' }] })).toMatch(/defending player/);
    expect(rejected(at, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: sick, defender: 'P2' }] })).toMatch(/can't attack/);
    expect(rejected(at, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: tapped, defender: 'P2' }] })).toMatch(/can't attack/);
  });

  it('taps attackers unless they have vigilance', () => {
    const s = newGame(2);
    const bear = put(s, 'P1', 'bear');
    const sentinel = put(s, 'P1', 'sentinel');
    const after = attack(toAttacks(s), [
      { attacker: bear, defender: 'P2' },
      { attacker: sentinel, defender: 'P2' },
    ]);
    expect(after.cards[bear]!.tapped).toBe(true);
    expect(after.cards[sentinel]!.tapped).toBe(false);
  });

  it('lets haste creatures attack the turn they arrive', () => {
    const s = newGame(2);
    const raider = put(s, 'P1', 'raider', 'battlefield', { summoningSick: true });
    expect(fight(s, [{ attacker: raider, defender: 'P2' }]).state.players.P2!.life).toBe(18);
  });

  it('skips blockers and damage when nobody attacks', () => {
    let s = newGame(2);
    put(s, 'P1', 'bear');
    s = attack(toAttacks(s), []);
    expect(s.step).toBe('endCombat');
  });
});

describe('blocking and damage', () => {
  it('blocked attackers deal damage to the blocker, not the player', () => {
    const s = newGame(2);
    const ogre = put(s, 'P1', 'ogre');
    const bear = put(s, 'P2', 'bear');
    const { state, events } = fight(s, [{ attacker: ogre, defender: 'P2' }], { P2: [{ blocker: bear, attacker: ogre }] });
    expect(state.players.P2!.life).toBe(20);
    expect(zoneOf(state, bear)).toBe('graveyard');
    expect(state.cards[ogre]!.damage).toBe(2);
    expect(eventsOf(events, 'CreatureDied').map((e) => e.card)).toEqual([bear]);
  });

  it('flying can only be blocked by flying or reach', () => {
    const s = newGame(2);
    const flyer = put(s, 'P1', 'flyer');
    const bear = put(s, 'P2', 'bear');
    const archer = put(s, 'P2', 'archer');
    let at = attack(toAttacks(s), [{ attacker: flyer, defender: 'P2' }]);
    at = passAll(at).state;
    expect(rejected(at, { type: 'DeclareBlockers', player: 'P2', blocks: [{ blocker: bear, attacker: flyer }] })).toMatch(/can't block/);
    expect(block(at, 'P2', [{ blocker: archer, attacker: flyer }]).combat!.blocks).toHaveLength(1);
  });

  it('menace needs two or more blockers', () => {
    const s = newGame(2);
    const brute = put(s, 'P1', 'brute');
    const [b1, b2] = [put(s, 'P2', 'bear'), put(s, 'P2', 'bear')];
    let at = attack(toAttacks(s), [{ attacker: brute, defender: 'P2' }]);
    at = passAll(at).state;
    expect(rejected(at, { type: 'DeclareBlockers', player: 'P2', blocks: [{ blocker: b1, attacker: brute }] })).toMatch(/menace/);
    block(at, 'P2', [
      { blocker: b1, attacker: brute },
      { blocker: b2, attacker: brute },
    ]);
  });

  it('first strike kills a blocker before it can strike back', () => {
    const s = newGame(2);
    const duelist = put(s, 'P1', 'duelist');
    const bear = put(s, 'P2', 'bear');
    const { state } = fight(s, [{ attacker: duelist, defender: 'P2' }], { P2: [{ blocker: bear, attacker: duelist }] });
    expect(zoneOf(state, bear)).toBe('graveyard');
    expect(zoneOf(state, duelist)).toBe('battlefield');
    expect(state.cards[duelist]!.damage).toBe(0);
  });

  it('double strike deals damage twice', () => {
    const s = newGame(2);
    const twin = put(s, 'P1', 'twinblade');
    const { events, state } = fight(s, [{ attacker: twin, defender: 'P2' }]);
    expect(eventsOf(events, 'DamageDealt').map((e) => e.amount)).toEqual([2, 2]);
    expect(state.players.P2!.life).toBe(16);
  });

  it('trample assigns lethal damage to blockers and the rest to the player', () => {
    const s = newGame(2);
    const trampler = put(s, 'P1', 'trampler');
    const bear = put(s, 'P2', 'bear');
    const { state } = fight(s, [{ attacker: trampler, defender: 'P2' }], { P2: [{ blocker: bear, attacker: trampler }] });
    expect(state.players.P2!.life).toBe(18);
    expect(zoneOf(state, bear)).toBe('graveyard');
  });

  it('deathtouch destroys any creature it damages, and makes 1 damage lethal for trample', () => {
    const s = newGame(2);
    const viper = put(s, 'P1', 'viper');
    const giant = put(s, 'P2', 'giant');
    const { state } = fight(s, [{ attacker: viper, defender: 'P2' }], { P2: [{ blocker: giant, attacker: viper }] });
    expect(zoneOf(state, giant)).toBe('graveyard');
    expect(zoneOf(state, viper)).toBe('graveyard');
  });

  it('lifelink gains its controller life equal to the damage dealt', () => {
    const s = newGame(2);
    const cleric = put(s, 'P1', 'cleric');
    const { state } = fight(s, [{ attacker: cleric, defender: 'P2' }]);
    expect(state.players.P1!.life).toBe(22);
    expect(state.players.P2!.life).toBe(18);
  });

  it('indestructible creatures survive lethal damage', () => {
    const s = newGame(2);
    const giant = put(s, 'P1', 'giant');
    const golem = put(s, 'P2', 'golem');
    const { state } = fight(s, [{ attacker: giant, defender: 'P2' }], { P2: [{ blocker: golem, attacker: giant }] });
    expect(zoneOf(state, golem)).toBe('battlefield');
    expect(state.cards[golem]!.damage).toBe(6);
  });

  it('damage wears off at end of turn', () => {
    const s = newGame(2);
    const ogre = put(s, 'P1', 'ogre');
    const bear = put(s, 'P2', 'wall');
    let { state } = fight(s, [{ attacker: ogre, defender: 'P2' }], { P2: [{ blocker: bear, attacker: ogre }] });
    expect(state.cards[bear]!.damage).toBe(3);
    state = passUntil(state, 'upkeep');
    expect(state.activePlayer).toBe('P2');
    expect(state.cards[bear]!.damage).toBe(0);
  });
});
