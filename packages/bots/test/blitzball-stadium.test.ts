import { describe, expect, it } from 'vitest';
import { getLegalActions, applyAction, type GameState } from '@nexus/engine';
import { hasFlag } from '../../engine/src/characteristics.ts';
import { dealDamage, moveCard } from '../../engine/src/state.ts';
import { stabilize } from '../../engine/src/sba.ts';
import { act, card, cast, fight, goTo, mana, newGame, put, rejected, settle } from './kit-helpers.ts';
const RAT = 'undercity-dire-rat';
function damage(s: GameState, id: string, combat = true): GameState {
  const ctx = { s, ev: [] as import('@nexus/engine').GameEvent[] };
  dealDamage(ctx, id, { kind: 'player', player: 'P2' }, 1, combat);
  stabilize(ctx);
  return ctx.s;
}
function grant(s: GameState, creature: string, owner = 'P1'): GameState {
  const stadium = put(s, owner, 'blitzball-stadium');
  mana(s, owner, { C: 3 });
  s.pending = { kind: 'priority', player: owner, passes: 0 };
  return cast(s, { type: 'ActivateAbility', player: owner, card: stadium, ability: 0, targets: [card(creature)] }).state;
}
describe.each([2, 3, 4])('%i-player Blitzball Stadium', players => {
  it('support X chooses distinct targets on placement, includes opponents, and pays X plus blue', () => {
    let s = newGame(players);
    const a = put(s, 'P1', RAT), b = put(s, 'P2', RAT);
    const stadium = put(s, 'P1', 'blitzball-stadium', 'hand');
    mana(s, 'P1', { U: 1, C: 2 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: stadium, x: 2, targets: [] });
    while(s.pending.kind === 'priority') s = act(s, { type: 'PassPriority', player: s.pending.player });
    expect(s.pending.kind).toBe('chooseTargets');
    expect(rejected(s, { type: 'ChooseTargets', player: 'P1', targets: [card(a), card(a)] })).toMatch(/different/);
    expect(getLegalActions(s).some(a => a.type === 'ChooseTargets' && a.targets.every(t => t.kind === 'none'))).toBe(true);
    s = act(s, { type: 'ChooseTargets', player: 'P1', targets: [card(a), card(b)] });
    moveCard({s,ev:[]}, stadium, 'graveyard');
    s = settle(s).state;
    expect([s.cards[a]!.counters, s.cards[b]!.counters]).toEqual([1, 1]);
    expect(s.players.P1!.manaPool.U + s.players.P1!.manaPool.C).toBe(0);
  });
  it('X zero and entry without casting give no counters', () => {
    let s = newGame(players); const a = put(s, 'P1', RAT);
    const stadium = put(s, 'P1', 'blitzball-stadium', 'hand'); mana(s,'P1',{U:1});
    s = cast(s,{type:'CastSpell',player:'P1',card:stadium,x:0,targets:[]}).state;
    expect(s.cards[a]!.counters ?? 0).toBe(0);
    moveCard({s,ev:[]},stadium,'graveyard');
    moveCard({s,ev:[]},stadium,'battlefield');
    expect(s.cards[stadium]!.xPaid).toBeUndefined();
  });
  it('counts kinds, not quantity, at resolution; noncombat damage does not draw', () => {
    let s = newGame(players); const a = put(s,'P1',RAT,'battlefield',{counters:7,namedCounters:{shield:2}});
    s = grant(s,a); expect(hasFlag(s,s.cards[a]!,'cantBeBlocked')).toBe(true);
    s = settle(damage(s,a,false)).state; expect(s.players.P1!.hand).toHaveLength(0);
    s = damage(s,a); s.cards[a]!.namedCounters = {shield:2,stun:1};
    s = settle(s).state; expect(s.players.P1!.hand).toHaveLength(3);
  });
  it('zero counter kinds draws zero; multiple grants trigger independently', () => {
    let s = newGame(players); const a = put(s,'P1',RAT);
    s = grant(s,a); s = settle(damage(s,a)).state; expect(s.players.P1!.hand).toHaveLength(0);
    s.cards[a]!.counters = 2; s = grant(s,a);
    s = settle(damage(s,a)).state; expect(s.players.P1!.hand).toHaveLength(2);
  });
  it('the recipient creature controller draws, even when the Stadium belongs to an opponent', () => {
    let s = newGame(players); const a = put(s,'P2',RAT,'battlefield',{counters:1});
    s = grant(s,a); s = settle(damage(s,a)).state;
    expect(s.players.P2!.hand).toHaveLength(1); expect(s.players.P1!.hand).toHaveLength(0);
  });
  it('retains last known counter kinds if the creature leaves and returns before resolution', () => {
    let s = newGame(players); const a = put(s,'P1',RAT,'battlefield',{counters:5,namedCounters:{shield:1}});
    s = grant(s,a); s = damage(s,a);
    moveCard({s,ev:[]},a,'graveyard'); moveCard({s,ev:[]},a,'battlefield');
    s = settle(s).state; expect(s.players.P1!.hand).toHaveLength(2);
    expect(hasFlag(s,s.cards[a]!,'cantBeBlocked')).toBe(false);
  });
  it('granted abilities and unblockability expire at cleanup', () => {
    let s = newGame(players); const a = put(s,'P1',RAT,'battlefield',{counters:1});
    s = grant(s,a); s = goTo(goTo(s,'end'),'main1');
    expect(hasFlag(s,s.cards[a]!,'cantBeBlocked')).toBe(false);
    s = settle(damage(s,a)).state; expect(s.players.P1!.hand).toHaveLength(0);
  });

  it('still draws when lethal damage removes the creature before triggers are placed', () => {
    let s = newGame(players); const a = put(s,'P1',RAT,'battlefield',{counters:1,namedCounters:{stun:1}});
    s = grant(s,a);
    const ctx = {s,ev:[] as import('@nexus/engine').GameEvent[]};
    dealDamage(ctx,a,{kind:'player',player:'P2'},1,true);
    s.cards[a]!.damage = 20;
    stabilize(ctx);
    expect(s.cards[a]!.zone).toBe('graveyard');
    s = settle(s).state; expect(s.players.P1!.hand).toHaveLength(2);
  });
  it('the Stadium may leave while the granted ability survives; real unblocked combat draws', () => {
    let s = newGame(players); const a = put(s,'P1',RAT,'battlefield',{counters:1});
    s = grant(s,a);
    const stadium = s.players.P1!.battlefield.find(id=>s.cards[id]!.defId==='blitzball-stadium')!;
    moveCard({s,ev:[]},stadium,'graveyard');
    s = fight(s,[{attacker:a,defender:'P2'}]).state;
    expect(s.players.P1!.hand).toHaveLength(1);
  });
  it('supports large X without requiring nonexistent creatures; one illegal target does not cancel another', () => {
    let s = newGame(players); const a = put(s,'P1',RAT), b = put(s,'P2',RAT);
    const stadium = put(s,'P1','blitzball-stadium','hand'); mana(s,'P1',{U:1,C:20});
    s = act(s,{type:'CastSpell',player:'P1',card:stadium,x:20,targets:[]});
    while(s.pending.kind==='priority') s=act(s,{type:'PassPriority',player:s.pending.player});
    s = act(s,{type:'ChooseTargets',player:'P1',targets:[card(a),card(b)]});
    moveCard({s,ev:[]},a,'graveyard'); s=settle(s).state;
    expect(s.cards[b]!.counters).toBe(1);
  });
  it('the granted draw is a separate counterable ability on the stack', () => {
    let s = newGame(players); const a = put(s,'P1',RAT,'battlefield',{counters:1});
    s = grant(s,a); s = damage(s,a);
    const ability = s.stack.at(-1)!;
    expect(ability.kind).toBe('ability');
    const counter = put(s,'P2','sublime-epiphany','hand'); mana(s,'P2',{C:4,U:2});
    while(s.pending.kind==='priority' && s.pending.player!=='P2') s=act(s,{type:'PassPriority',player:s.pending.player});
    s = cast(s,{type:'CastSpell',player:'P2',card:counter,modes:[1],targets:[{kind:'ability',ability:ability.id}]}).state;
    expect(s.players.P1!.hand).toHaveLength(0);
  });
  it('rejects an illegal target without paying and fizzles if the target leaves', () => {
    let s = newGame(players); const stadium = put(s,'P1','blitzball-stadium'), a = put(s,'P1',RAT);
    mana(s,'P1',{C:3});
    expect(applyAction(s,{type:'ActivateAbility',player:'P1',card:stadium,ability:0,targets:[card(stadium)]}).ok).toBe(false);
    s = act(s,{type:'ActivateAbility',player:'P1',card:stadium,ability:0,targets:[card(a)]});
    moveCard({s,ev:[]},a,'graveyard'); s=settle(s).state;
    expect(s.temporaryEffects.some(e=>e.affected===a)).toBe(false);
    expect(s.cards[stadium]!.tapped).toBe(true);
  });
});
