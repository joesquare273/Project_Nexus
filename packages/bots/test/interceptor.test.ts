import { describe, expect, it } from 'vitest';
import { getLegalActions, viewFor, type GameState, type ZoneName } from '@nexus/engine';
import { moveCard, phaseOut } from '../../engine/src/state.ts';
import { basicAi } from '../src/index.ts';
import { checkInvariants } from '../src/invariants.ts';
import { act, actWithEvents, goTo, mana, newGame, nextStep, put, rejected, settle } from './kit-helpers.ts';
const HOUND = 'interceptor-shadows-hound';
function begin(players: number, zone: Exclude<ZoneName, 'stack' | 'void'> = 'graveyard', count = 1) {
  let s = newGame(players);
  const hound = put(s, 'P1', HOUND, zone);
  const legends = Array.from({ length: count }, (_, i) => put(s, 'P1', i ? 'elena-turk-recruit' : 'bugenhagen-wise-elder'));
  s = goTo(s, 'declareAttackers');
  s = act(s, { type: 'DeclareAttackers', player: 'P1', attacks: legends.map(attacker => ({ attacker, defender: 'P2' })) });
  return { s, hound, legends };
}
function resolve(s: GameState, defender = 'P2') {
  let r = settle(s);
  if (r.state.pending.kind === 'chooseDefender') {
    const chosen = actWithEvents(r.state, { type: 'ChooseDefender', player: r.state.pending.player, defender });
    const rest = settle(chosen.state);
    r = { state: rest.state, events: [...r.events, ...chosen.events, ...rest.events] };
  }
  return r;
}
describe.each([2,3,4])('Interceptor with %i players', players => {
  it('casts for {2}{B}{B} and grants menace only to its controller’s Assassins', () => {
    let s = newGame(players);
    const hound = put(s, 'P1', HOUND, 'hand');
    const ally = put(s, 'P1', 'elena-turk-recruit'), enemy = put(s, 'P2', 'elena-turk-recruit');
    const other = put(s, 'P1', 'soldier-token');
    mana(s, 'P1', { B: 2, C: 2 });
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: hound })).state;
    const v = viewFor(s, 'P1');
    expect(v.stats[hound]).toMatchObject({ power: 4, toughness: 3, keywords: expect.arrayContaining(['Menace']) });
    expect(v.stats[ally]!.keywords).toContain('Menace');
    expect(v.stats[enemy]!.keywords).not.toContain('Menace');
    expect(v.stats[other]!.keywords).not.toContain('Menace');
    moveCard({ s, ev: [] }, hound, 'graveyard');
    expect(viewFor(s, 'P1').stats[ally]!.keywords).not.toContain('Menace');
  });
  it('triggers once for multiple legendary attackers and returns tapped and attacking for {2}{B}', () => {
    let { s, hound } = begin(players, 'graveyard', 2);
    expect(s.stack).toHaveLength(1);
    mana(s, 'P1', { B: 1, C: 2 });
    const r = resolve(s); s = r.state;
    expect(s.cards[hound]).toMatchObject({ zone: 'battlefield', tapped: true, summoningSick: true });
    expect(s.combat!.attacks.filter(a => a.attacker === hound)).toEqual([{ attacker: hound, defender: 'P2' }]);
    expect(s.players.P1!.manaPool).toMatchObject({ B: 0, C: 0 });
    expect(r.events.some(e => e.type === 'AttackDeclared' && e.attacker === hound)).toBe(false);
    expect(r.events.some(e => e.type === 'CreatureEnteredAttacking' && e.card === hound)).toBe(true);
    expect(s.stack).toHaveLength(0);
    expect(checkInvariants(s)).toEqual([]);
  });
  it('can decline without paying or returning', () => {
    let { s, hound } = begin(players);
    mana(s, 'P1', { B: 1, C: 2 });
    s = settle(s, { accept: false }).state;
    expect(s.cards[hound]!.zone).toBe('graveyard');
    expect(s.players.P1!.manaPool).toMatchObject({ B: 1, C: 2 });
    expect(s.resolving).toBeNull();
  });
  it('requires black mana and allows tapping lands during the payment decision', () => {
    let { s, hound } = begin(players);
    mana(s, 'P1', { C: 2 });
    const swamp = put(s, 'P1', 'swamp');
    while (s.pending.kind === 'priority') s = act(s, { type: 'PassPriority', player: s.pending.player });
    expect(s.pending.kind).toBe('decide');
    expect(getLegalActions(s)).not.toContainEqual({ type: 'Decide', player: 'P1', accept: true });
    expect(rejected(s, { type: 'Decide', player: 'P1', accept: true })).toBeTruthy();
    s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: swamp, mana: 'B' });
    expect(getLegalActions(s)).toContainEqual({ type: 'Decide', player: 'P1', accept: true });
    s = resolve(s).state;
    expect(s.cards[hound]!.zone).toBe('battlefield');
    expect(s.cards[swamp]!.tapped).toBe(true);
  });
  it.each(['battlefield','hand','exile','library'] as const)('does not trigger from %s', zone => {
    const { s } = begin(players, zone);
    expect(s.stack).toHaveLength(0);
    expect(s.triggerQueue).toHaveLength(0);
  });
  it('does not trigger for nonlegendary attackers or another player’s legendary attacker', () => {
    let s = newGame(players);
    put(s, 'P1', HOUND, 'graveyard');
    const regular = put(s, 'P1', 'soldier-token');
    s = goTo(s, 'declareAttackers');
    s = act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: regular, defender: 'P2' }] });
    expect(s.stack).toHaveLength(0);
    s = newGame(players); put(s, 'P2', HOUND, 'graveyard');
    const legend = put(s, 'P1', 'bugenhagen-wise-elder');
    s = goTo(s, 'declareAttackers');
    s = act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: legend, defender: 'P2' }] });
    expect(s.stack).toHaveLength(0);
  });
  it('does not return the card after it leaves and reenters the graveyard in response', () => {
    let { s, hound } = begin(players);
    moveCard({ s, ev: [] }, hound, 'exile');
    moveCard({ s, ev: [] }, hound, 'graveyard');
    mana(s, 'P1', { B: 1, C: 2 });
    s = resolve(s).state;
    expect(s.cards[hound]!.zone).toBe('graveyard');
    expect(s.combat!.attacks.some(a => a.attacker === hound)).toBe(false);
  });
  it('does not return if exiled in response', () => {
    let { s, hound } = begin(players);
    moveCard({ s, ev: [] }, hound, 'exile');
    mana(s, 'P1', { B: 1, C: 2 });
    s = resolve(s).state;
    expect(s.cards[hound]!.zone).toBe('exile');
  });
  it('returns even after the original legendary attacker has left combat', () => {
    let { s, hound, legends } = begin(players);
    moveCard({ s, ev: [] }, legends[0]!, 'graveyard');
    mana(s, 'P1', { B: 1, C: 2 });
    s = resolve(s).state;
    expect(s.combat!.attacks).toContainEqual({ attacker: hound, defender: 'P2' });
    expect(s.cards[legends[0]!]!.zone).toBe('graveyard');
    expect(checkInvariants(s)).toEqual([]);
  });
  it('needs two blockers and deals four combat damage when unblocked', () => {
    let { s, hound } = begin(players);
    const one = put(s, 'P2', 'soldier-token'), two = put(s, 'P2', 'soldier-token');
    mana(s, 'P1', { B: 1, C: 2 });
    s = nextStep(resolve(s).state);
    expect(s.pending).toMatchObject({ kind: 'declareBlockers', player: 'P2' });
    expect(rejected(s, { type: 'DeclareBlockers', player: 'P2', blocks: [{ blocker: one, attacker: hound }] })).toBeTruthy();
    const blocked = act(s, { type: 'DeclareBlockers', player: 'P2', blocks: [{ blocker: one, attacker: hound }, { blocker: two, attacker: hound }] });
    expect(blocked.combat!.blocks).toHaveLength(2);
    const before = s.players.P2!.life;
    s = act(s, { type: 'DeclareBlockers', player: 'P2', blocks: [] });
    s = goTo(s, 'combatDamage');
    expect(s.players.P2!.life).toBe(before - 5);
    expect(checkInvariants(s)).toEqual([]);
  });
  it('loses the Assassin bonus while phased out', () => {
    const s = newGame(players), hound = put(s, 'P1', HOUND), ally = put(s, 'P1', 'elena-turk-recruit');
    phaseOut({ s, ev: [] }, hound);
    expect(viewFor(s, 'P1').stats[ally]!.keywords).not.toContain('Menace');
  });
  it('grants menace to a creature made an Assassin by Reaper’s Scythe', () => {
    const s = newGame(players);
    put(s, 'P1', HOUND);
    const host = put(s, 'P1', 'soldier-token');
    const scythe = put(s, 'P1', 'reapers-scythe', 'battlefield', { attachedTo: host });
    expect(viewFor(s, 'P1').stats[host]!.subtypes).toContain('Assassin');
    expect(viewFor(s, 'P1').stats[host]!.keywords).toContain('Menace');
    moveCard({ s, ev: [] }, scythe, 'graveyard');
    expect(viewFor(s, 'P1').stats[host]!.keywords).not.toContain('Menace');
  });
});
describe.each([3,4])('Interceptor defending-player choice with %i players', players => {
  it('chooses a different opponent during resolution before yielding priority', () => {
    let { s, hound } = begin(players);
    mana(s, 'P1', { B: 1, C: 2 });
    s = settle(s).state;
    expect(s.pending).toMatchObject({ kind: 'chooseDefender', player: 'P1', card: hound });
    expect(s.resolving).not.toBeNull();
    expect(s.cards[hound]!.zone).toBe('graveyard');
    expect(rejected(s, { type: 'PassPriority', player: 'P1' })).toBeTruthy();
    expect(rejected(s, { type: 'ChooseDefender', player: 'P2', defender: 'P3' })).toBeTruthy();
    for (const defender of ['P1','missing']) expect(rejected(s, { type: 'ChooseDefender', player: 'P1', defender })).toBeTruthy();
    expect(getLegalActions(s)).toHaveLength(players - 1);
    s = act(s, { type: 'ChooseDefender', player: 'P1', defender: 'P3' });
    expect(s.pending).toMatchObject({ kind: 'priority', player: 'P1' });
    expect(s.combat!.attacks).toContainEqual({ attacker: hound, defender: 'P3' });
    s = nextStep(s);
    s = act(s, { type: 'DeclareBlockers', player: 'P2', blocks: [] });
    expect(s.pending).toMatchObject({ kind: 'declareBlockers', player: 'P3' });
    expect(checkInvariants(s)).toEqual([]);
  });
  it('enters attacking through Propaganda without paying a declaration tax', () => {
    let { s, hound } = begin(players);
    put(s, 'P3', 'propaganda');
    mana(s, 'P1', { B: 1, C: 2 });
    s = resolve(s, 'P3').state;
    expect(s.combat!.attacks).toContainEqual({ attacker: hound, defender: 'P3' });
    expect(s.players.P1!.manaPool.C).toBe(0);
  });
  it('removes a conceded opponent from choices and lets the bot finish', () => {
    let { s, hound } = begin(players);
    mana(s, 'P1', { B: 1, C: 2 });
    s = settle(s).state;
    s = act(s, { type: 'Concede', player: 'P2' });
    expect(s.pending).toMatchObject({ kind: 'chooseDefender', defenders: s.turnOrder.filter(p => !['P1','P2'].includes(p)) });
    expect(rejected(s, { type: 'ChooseDefender', player: 'P1', defender: 'P2' })).toBeTruthy();
    const action = basicAi(10)(s, getLegalActions(s));
    expect(action.type).toBe('ChooseDefender');
    s = act(s, action);
    expect(s.cards[hound]!.zone).toBe('battlefield');
    expect(checkInvariants(s)).toEqual([]);
  });
});
