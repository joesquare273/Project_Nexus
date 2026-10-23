import { describe, expect, it } from 'vitest';
import { getLegalActions, type GameState } from '@nexus/engine';
import { moveCard } from '../../engine/src/state.ts';
import { planTaps, tapActions } from '../src/mana.ts';
import { checkInvariants } from '../src/invariants.ts';
import { act, goTo, mana, newGame, nextStep, put, rejected, settle } from './kit-helpers.ts';
const JEWEL = 'coveted-jewel';
function combat(players: number, count = 1) {
  let s = newGame(players);
  const jewel = put(s, 'P2', JEWEL, 'battlefield', { tapped: true });
  const attackers = Array.from({ length: count }, () => put(s, 'P1', 'soldier-token'));
  s = goTo(s, 'declareAttackers');
  s = act(s, { type: 'DeclareAttackers', player: 'P1', attacks: attackers.map(attacker => ({ attacker, defender: 'P2' })) });
  s = nextStep(settle(s).state);
  return { s, jewel, attackers };
}
function unblocked(s: GameState) {
  while (s.pending.kind === 'declareBlockers') s = act(s, { type: 'DeclareBlockers', player: s.pending.player, blocks: [] });
  return s;
}
describe.each([2, 3, 4])('Coveted Jewel with %i players', players => {
  it('casts for six, then draws three through a separate entry trigger', () => {
    let s = newGame(players);
    const jewel = put(s, 'P1', JEWEL, 'hand');
    mana(s, 'P1', { C: 6 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: jewel });
    expect(s.players.P1!.hand).toHaveLength(0);
    s = settle(s).state;
    expect(s.players.P1!.hand).toHaveLength(3);
    expect(s.cards[jewel]!.zone).toBe('battlefield');
    expect(checkInvariants(s)).toEqual([]);
  });
  it('makes three of any one color immediately, including the turn it enters', () => {
    for (const color of ['W','U','B','R','G'] as const) {
      let s = newGame(players);
      const jewel = put(s, 'P1', JEWEL, 'battlefield', { summoningSick: true });
      s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: jewel, mana: color });
      expect(s.players.P1!.manaPool[color]).toBe(3);
      expect(Object.values(s.players.P1!.manaPool).reduce((a,b) => a+b,0)).toBe(3);
      expect(s.cards[jewel]!.tapped).toBe(true);
      expect(s.stack).toHaveLength(0);
      expect(rejected(s, { type: 'ActivateManaAbility', player: 'P1', card: jewel, mana: color })).toBeTruthy();
    }
  });
  it('cannot produce colorless and auto-pays a three-mana artifact with one tap', () => {
    let s = newGame(players);
    const jewel = put(s, 'P1', JEWEL);
    expect(rejected(s, { type: 'ActivateManaAbility', player: 'P1', card: jewel, mana: 'C' })).toBeTruthy();
    const equipment = put(s, 'P1', 'behemoth-sledge', 'hand');
    mana(s, 'P1', { G: 1, W: 1 });
    const taps = planTaps(s, 'P1', '{1}{G}{W}')!;
    expect(taps).toHaveLength(1);
    for (const action of tapActions('P1', taps)) s = act(s, action);
    s = act(s, { type: 'CastSpell', player: 'P1', card: equipment });
    expect(s.cards[jewel]!.tapped).toBe(true);
    expect(settle(s).state.cards[equipment]!.zone).toBe('battlefield');
  });
  it('triggers once for multiple unblocked creatures before damage, draws and transfers untapped', () => {
    const initial = combat(players, 3);
    const before = initial.s.players.P2!.life;
    let s = unblocked(initial.s);
    expect(s.stack).toHaveLength(1);
    expect(s.players.P1!.hand).toHaveLength(0);
    expect(s.players.P2!.life).toBe(before);
    s = settle(s).state;
    expect(s.players.P1!.hand).toHaveLength(3);
    expect(s.players.P2!.hand).toHaveLength(0);
    expect(s.cards[initial.jewel]).toMatchObject({ owner: 'P2', controller: 'P1', tapped: false });
    expect(getLegalActions(s).some(a => a.type === 'ActivateManaAbility' && a.card === initial.jewel)).toBe(true);
    expect(planTaps(s, 'P1', '{3}')).toEqual([{ card: initial.jewel, mana: 'W' }]);
    expect(planTaps(s, 'P2', '{3}')).toBeNull();
    s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: initial.jewel, mana: 'U' });
    expect(s.players.P1!.manaPool.U).toBe(3);
    expect(checkInvariants(s)).toEqual([]);
  });
  it('does not trigger if every attacker is blocked', () => {
    const { s: initial, attackers } = combat(players);
    const blocker = put(initial, 'P2', 'soldier-token');
    const s = act(initial, { type: 'DeclareBlockers', player: 'P2', blocks: [{ blocker, attacker: attackers[0]! }] });
    expect(s.stack).toHaveLength(0);
  });
  it('triggers when some attackers are blocked and some are unblocked', () => {
    const { s: initial, attackers } = combat(players, 2);
    const blocker = put(initial, 'P2', 'soldier-token');
    const s = act(initial, { type: 'DeclareBlockers', player: 'P2', blocks: [{ blocker, attacker: attackers[0]! }] });
    expect(s.stack).toHaveLength(1);
    expect(settle(s).state.players.P1!.hand).toHaveLength(3);
  });
  it('does not trigger for an attacker removed before blockers', () => {
    const { s, attackers } = combat(players);
    moveCard({ s, ev: [] }, attackers[0]!, 'graveyard');
    expect(unblocked(s).stack).toHaveLength(0);
  });
  it('keeps the attacking player captured if the creature leaves before resolution', () => {
    const initial = combat(players);
    let s = unblocked(initial.s);
    moveCard({ s, ev: [] }, initial.attackers[0]!, 'graveyard');
    s = settle(s).state;
    expect(s.players.P1!.hand).toHaveLength(3);
    expect(s.cards[initial.jewel]!.controller).toBe('P1');
  });
  it('still draws if the Jewel leaves, without transferring it from the graveyard', () => {
    const initial = combat(players);
    let s = unblocked(initial.s);
    moveCard({ s, ev: [] }, initial.jewel, 'graveyard');
    s = settle(s).state;
    expect(s.players.P1!.hand).toHaveLength(3);
    expect(s.cards[initial.jewel]).toMatchObject({ zone: 'graveyard', controller: 'P2' });
    expect(checkInvariants(s)).toEqual([]);
  });
  it('does not steal or untap a new Jewel object after it leaves and returns', () => {
    const initial = combat(players);
    let s = unblocked(initial.s);
    moveCard({ s, ev: [] }, initial.jewel, 'exile');
    moveCard({ s, ev: [] }, initial.jewel, 'battlefield');
    s.cards[initial.jewel]!.tapped = true;
    s = settle(s).state;
    expect(s.players.P1!.hand).toHaveLength(3);
    expect(s.cards[initial.jewel]).toMatchObject({ controller: 'P2', tapped: true });
    expect(checkInvariants(s)).toEqual([]);
  });
  it('captures the controller rather than owner of an unblocked creature', () => {
    const initial = combat(players);
    let s = initial.s;
    const attacker = initial.attackers[0]!;
    // A creature borrowed before combat is still controlled by the attacker.
    s.players.P1!.battlefield = s.players.P1!.battlefield.filter(id => id !== attacker);
    s.players.P2!.battlefield.push(attacker);
    s.cards[attacker]!.owner = 'P2';
    s = unblocked(s);
    moveCard({ s, ev: [] }, attacker, 'graveyard');
    s = settle(s).state;
    expect(s.players.P1!.hand).toHaveLength(3);
    expect(s.players.P2!.hand).toHaveLength(0);
    expect(s.cards[initial.jewel]!.controller).toBe('P1');
    expect(checkInvariants(s)).toEqual([]);
  });
  it('allows the defender to tap for mana in response, then untaps for the recipient', () => {
    const initial = combat(players);
    let s = unblocked(initial.s);
    s.cards[initial.jewel]!.tapped = false;
    s = act(s, { type: 'PassPriority', player: 'P1' });
    s = act(s, { type: 'ActivateManaAbility', player: 'P2', card: initial.jewel, mana: 'B' });
    s = settle(s).state;
    expect(s.players.P2!.manaPool.B).toBe(3);
    expect(s.cards[initial.jewel]).toMatchObject({ controller: 'P1', tapped: false });
    s = act(s, { type: 'PassPriority', player: 'P1' });
    expect(getLegalActions(s).filter(a => a.type === 'ActivateManaAbility' && a.card === initial.jewel)).toHaveLength(0);
  });
  it('does not trigger for an attack on another player in a pod', () => {
    if (players === 2) return;
    let { s, attackers } = combat(players);
    s.combat!.attacks[0]!.defender = 'P3';
    s.combat!.blockersPending = ['P3'];
    s.pending = { kind: 'declareBlockers', player: 'P3' };
    s = unblocked(s);
    expect(s.stack).toHaveLength(0);
    expect(attackers).toHaveLength(1);
  });
});
