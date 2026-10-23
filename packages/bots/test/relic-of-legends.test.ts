import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions, legendaryManaCreatures, type GameState } from '@nexus/engine';
import { phaseOut } from '../../engine/src/state.ts';
import { basicAi, playableCards } from '../src/index.ts';
import { planTaps, tapActions } from '../src/mana.ts';
import { checkInvariants } from '../src/invariants.ts';
import { act, actWithEvents, mana, newGame, put, rejected, settle } from './kit-helpers.ts';
const RELIC = 'relic-of-legends';
const TIFA = 'tifa-martial-artist';
function setup(players: number, tapped = false) {
  const s = newGame(players);
  const relic = put(s, 'P1', RELIC, 'battlefield', { tapped });
  const legend = put(s, 'P1', TIFA, 'battlefield', { summoningSick: true });
  return { s, relic, legend };
}
function payment(s: GameState, cost: string, exclude: string[] = []) {
  const taps = planTaps(s, 'P1', cost, { exclude });
  expect(taps).not.toBeNull();
  for (const action of tapActions('P1', taps!)) s = act(s, action);
  return { s, taps: taps! };
}
describe.each([2, 3, 4])('Relic of Legends with %i players', players => {
  it('casts for three mana and taps itself for any one color', () => {
    let s = newGame(players);
    const relic = put(s, 'P1', RELIC, 'hand');
    mana(s, 'P1', { C: 3 });
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: relic })).state;
    for (const color of ['W','U','B','R','G'] as const) {
      const r = act(s, { type: 'ActivateManaAbility', player: 'P1', card: relic, mana: color });
      expect(r.players.P1!.manaPool[color]).toBe(1);
      expect(r.cards[relic]!.tapped).toBe(true);
      expect(r.stack).toHaveLength(0);
    }
  });
  it('taps a summoning-sick legend without tapping the Relic or using the stack', () => {
    const { s, relic, legend } = setup(players);
    const before = structuredClone(s);
    const r = actWithEvents(s, { type: 'ActivateManaAbility', player: 'P1', card: relic, mana: 'U', tapCreature: legend });
    expect(s).toEqual(before);
    expect(r.state.cards[legend]!.tapped).toBe(true);
    expect(r.state.cards[relic]!.tapped).toBe(false);
    expect(r.state.players.P1!.manaPool.U).toBe(1);
    expect(r.state.stack).toHaveLength(0);
    expect(r.events.filter(e => e.type === 'ManaAdded')).toEqual([{ type: 'ManaAdded', player: 'P1', source: relic, mana: 'U' }]);
    expect(r.events.some(e => e.type === 'AbilityTargeted')).toBe(false);
    expect(checkInvariants(r.state)).toEqual([]);
  });
  it('works when the Relic is already tapped and can use several distinct legends', () => {
    let { s, relic, legend } = setup(players, true);
    const other = put(s, 'P1', 'bugenhagen-wise-elder', 'battlefield', { summoningSick: true });
    for (const creature of [legend, other]) s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: relic, mana: 'R', tapCreature: creature });
    expect(s.players.P1!.manaPool.R).toBe(2);
    expect(rejected(s, { type: 'ActivateManaAbility', player: 'P1', card: relic, mana: 'R', tapCreature: legend })).toBeTruthy();
    expect(checkInvariants(s)).toEqual([]);
  });
  it('offers five colors for each cost and no colorless or paid-output hybrid', () => {
    const { s, relic, legend } = setup(players);
    const actions = getLegalActions(s).filter(a => a.type === 'ActivateManaAbility' && a.card === relic);
    expect(actions).toHaveLength(10);
    expect(actions.filter(a => a.type === 'ActivateManaAbility' && a.tapCreature === legend)).toHaveLength(5);
    expect(rejected(s, { type: 'ActivateManaAbility', player: 'P1', card: relic, mana: 'C', tapCreature: legend })).toBeTruthy();
    expect(rejected(s, { type: 'ActivateManaAbility', player: 'P1', card: relic, mana: 'W', tapCreature: legend, output: 0 })).toBeTruthy();
  });
  it('rejects tapped, nonlegendary, enemy, noncreature, off-battlefield and phased-out costs', () => {
    const { s, relic } = setup(players);
    const invalid = [put(s, 'P1', TIFA, 'battlefield', { tapped: true }), put(s, 'P1', 'soldier-token'), put(s, 'P2', TIFA),
      put(s, 'P1', 'the-warring-triad', 'hand'), put(s, 'P1', 'tome-of-legends')];
    const phased = put(s, 'P1', 'bugenhagen-wise-elder');
    phaseOut({ s, ev: [] }, phased);
    invalid.push(phased);
    for (const creature of invalid) expect(rejected(s, { type: 'ActivateManaAbility', player: 'P1', card: relic, mana: 'G', tapCreature: creature })).toBeTruthy();
    expect(legendaryManaCreatures(s, s.cards[relic]!).every(c => !invalid.includes(c.id))).toBe(true);
  });
  it('uses controller rather than owner for both the Relic and its creature cost', () => {
    const s = newGame(players);
    const relic = put(s, 'P2', RELIC, 'battlefield', { controller: 'P1', tapped: true });
    const legend = put(s, 'P2', TIFA, 'battlefield', { controller: 'P1', summoningSick: true });
    const r = act(s, { type: 'ActivateManaAbility', player: 'P1', card: relic, mana: 'B', tapCreature: legend });
    expect(r.players.P1!.manaPool.B).toBe(1);
    expect(r.players.P2!.manaPool.B).toBe(0);
    expect(planTaps(r, 'P1', '{2}')).toBeNull();
    expect(checkInvariants(r)).toEqual([]);
  });
  it('does not grant this ability to other mana rocks', () => {
    const { s, legend } = setup(players);
    const ring = put(s, 'P1', 'sol-ring');
    expect(rejected(s, { type: 'ActivateManaAbility', player: 'P1', card: ring, mana: 'W', tapCreature: legend })).toBeTruthy();
  });
  it('is unavailable after the source leaves or phases out', () => {
    const { s, relic, legend } = setup(players);
    phaseOut({ s, ev: [] }, relic);
    expect(rejected(s, { type: 'ActivateManaAbility', player: 'P1', card: relic, mana: 'G', tapCreature: legend })).toBeTruthy();
    expect(planTaps(s, 'P1', '{1}')).toBeNull();
    expect(getLegalActions(s).some(a => a.type === 'ActivateManaAbility' && a.card === relic)).toBe(false);
  });
  it('does not trigger Yuna\'s own mana ability when Yuna pays the Relic cost', () => {
    const s = newGame(players);
    const relic = put(s, 'P1', RELIC, 'battlefield', { tapped: true });
    const yuna = put(s, 'P1', 'yuna-grand-summoner');
    const r = act(s, { type: 'ActivateManaAbility', player: 'P1', card: relic, mana: 'W', tapCreature: yuna });
    expect(r.players.P1!.nextCreatureCounters).toBeUndefined();
  });
  it('auto-taps the Relic and a sick legend to pay a two-color cost', () => {
    const { s, relic, legend } = setup(players);
    const r = payment(s, '{W}{U}');
    expect(r.taps).toHaveLength(2);
    expect(r.s.cards[relic]!.tapped).toBe(true);
    expect(r.s.cards[legend]!.tapped).toBe(true);
    expect(r.s.players.P1!.manaPool.W).toBe(1);
    expect(r.s.players.P1!.manaPool.U).toBe(1);
    expect(checkInvariants(r.s)).toEqual([]);
  });
  it('never spends one legend twice through two Relics', () => {
    const { s } = setup(players, true);
    put(s, 'P1', RELIC, 'battlefield', { tapped: true });
    expect(planTaps(s, 'P1', '{2}')).toBeNull();
    expect(payment(s, '{1}').taps).toHaveLength(1);
  });
  it('never taps a mana-producing legend twice through its own ability and the Relic', () => {
    const s = newGame(players);
    put(s, 'P1', RELIC, 'battlefield', { tapped: true });
    put(s, 'P1', 'bugenhagen-wise-elder');
    expect(planTaps(s, 'P1', '{2}')).toBeNull();
    expect(payment(s, '{G}').taps).toHaveLength(1);
  });
  it('reserves creature costs for convoke, improvise and other tap payments', () => {
    const { s, relic, legend } = setup(players, true);
    expect(planTaps(s, 'P1', '{1}', { exclude: [legend] })).toBeNull();
    // Reserving the Relic itself still permits its other ability, which taps only the creature.
    expect(payment(s, '{1}', [relic]).taps).toEqual([{ card: relic, mana: 'W', tapCreature: legend }]);
  });
  it('uses Relic mana to pay a filter land and produces a valid complete payment', () => {
    const { s } = setup(players, true);
    put(s, 'P1', 'skycloud-expanse');
    const r = payment(s, '{W}{U}');
    expect(r.taps.some(t => t.tapCreature)).toBe(true);
    expect(r.s.players.P1!.manaPool.W).toBe(1);
    expect(r.s.players.P1!.manaPool.U).toBe(1);
    expect(checkInvariants(r.s)).toEqual([]);
  });
  it('does not double-use convoke creatures as Relic mana in offered spell payments', () => {
    const { s } = setup(players, true);
    put(s, 'P1', 'bugenhagen-wise-elder', 'battlefield', { summoningSick: true });
    const concealment = put(s, 'P1', 'clever-concealment', 'hand');
    expect(playableCards(s, 'P1').find(p => p.card === concealment)).toBeUndefined();
    put(s, 'P1', 'plains');
    put(s, 'P1', 'plains');
    const play = playableCards(s, 'P1').find(p => p.card === concealment)!;
    expect(play).toBeDefined();
    for (const choice of play.choices) {
      let copy = s;
      for (const action of [...choice.taps, choice.action]) copy = act(copy, action);
      expect(checkInvariants(copy)).toEqual([]);
    }
  });
  it('exposes an affordable spell and a valid bot payment using a tapped Relic', () => {
    let { s, legend } = setup(players, true);
    const ring = put(s, 'P1', 'sol-ring', 'hand');
    const play = playableCards(s, 'P1').find(p => p.card === ring)!;
    expect(play).toBeDefined();
    const choice = play.choices[0]!;
    expect(choice.taps).toContainEqual(expect.objectContaining({ tapCreature: legend }));
    for (const action of [...choice.taps, choice.action]) s = act(s, action);
    expect(settle(s).state.cards[ring]!.zone).toBe('battlefield');
    const original = setup(players, true);
    put(original.s, 'P1', 'sol-ring', 'hand');
    const action = basicAi(42)(original.s, getLegalActions(original.s));
    const result = applyAction(original.s, action);
    expect(result.ok).toBe(true);
    if (result.ok) expect(checkInvariants(result.state)).toEqual([]);
    expect(action).toMatchObject({ type: 'ActivateManaAbility', tapCreature: original.legend });
  });
});
