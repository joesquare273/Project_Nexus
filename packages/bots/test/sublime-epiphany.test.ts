import { describe, expect, it } from 'vitest';
import { getLegalActions, spellOptions, type GameState, type Target } from '@nexus/engine';
import { moveCard } from '../../engine/src/state.ts';
import { basicAi, playableCards } from '../src/index.ts';
import { checkInvariants } from '../src/invariants.ts';
import { act, actWithEvents, card, mana, newGame, player, put, rejected, settle } from './kit-helpers.ts';
const EPIPHANY = 'sublime-epiphany';
const ability = (id: string): Target => ({ kind: 'ability', ability: id });
function priority(s: GameState, who: string) {
  for (let n=0; n<10 && s.pending.kind === 'priority' && s.pending.player !== who; n++) s = act(s, { type: 'PassPriority', player: s.pending.player });
  return s;
}
function setup(players: number) {
  let s = newGame(players);
  const epiphany = put(s, 'P1', EPIPHANY, 'hand');
  const stone = put(s, 'P2', 'mind-stone');
  const spell = put(s, 'P2', 'ultimate-magic-holy', 'hand');
  const bounce = put(s, 'P2', 'arcane-signet');
  const copy = put(s, 'P1', 'soldier-token');
  mana(s, 'P1', { U: 2, C: 4 }); mana(s, 'P2', { C: 3, W: 1 });
  s = priority(s, 'P2');
  s = act(s, { type: 'ActivateAbility', player: 'P2', card: stone, ability: 0 });
  const targetAbility = s.stack.at(-1)!.id;
  s = act(s, { type: 'CastSpell', player: 'P2', card: spell });
  s = priority(s, 'P1');
  return { s, epiphany, stone, spell, bounce, copy, targetAbility };
}
function resolveEpiphany(s: GameState, id: string) {
  const events = [] as ReturnType<typeof actWithEvents>['events'];
  for (let n=0;n<30 && s.cards[id]!.zone === 'stack';n++) {
    if (s.pending.kind !== 'priority') throw Error(s.pending.kind);
    const r = actWithEvents(s, { type: 'PassPriority', player: s.pending.player });
    s=r.state; events.push(...r.events);
  }
  expect(s.cards[id]!.zone).toBe('graveyard');
  return { state:s, events };
}
describe.each([2,3,4])('Sublime Epiphany with %i players', players => {
  it('supports all 31 nonempty mode combinations at the same six-mana cost', () => {
    for (let mask=1;mask<32;mask++) {
      let { s, epiphany, stone, spell, bounce, copy, targetAbility } = setup(players);
      const modes=[0,1,2,3,4].filter(i => mask & (1<<i));
      const allTargets=[card(spell),ability(targetAbility),card(bounce),card(copy),player('P1')];
      const targets=modes.map(i => allTargets[i]!);
      expect(playableCards(s,'P1').find(p => p.card===epiphany)?.choices.some(c => JSON.stringify(c.modes)===JSON.stringify(modes) && JSON.stringify(c.targets)===JSON.stringify(targets))).toBe(true);
      expect(spellOptions(s,'P1').some(o => o.action.type==='CastSpell' && o.action.card===epiphany && JSON.stringify(o.action.modes)===JSON.stringify(modes))).toBe(true);
      s=act(s,{type:'CastSpell',player:'P1',card:epiphany,modes,targets});
      const r=resolveEpiphany(s,epiphany); s=r.state;
      expect(s.cards[spell]!.zone).toBe(modes.includes(0)?'graveyard':'stack');
      expect(s.stack.some(i=>i.id===targetAbility)).toBe(!modes.includes(1));
      expect(s.cards[stone]!.zone).toBe('graveyard');
      expect(s.cards[bounce]!.zone).toBe(modes.includes(2)?'hand':'battlefield');
      expect(s.players.P1!.battlefield.filter(id=>s.cards[id]!.defId==='soldier-token')).toHaveLength(modes.includes(3)?2:1);
      expect(s.players.P1!.hand).toHaveLength(modes.includes(4)?1:0);
      expect(s.players.P1!.manaPool).toMatchObject({U:0,C:0});
      expect(r.events.filter(e=>e.type==='AbilityCountered')).toHaveLength(modes.includes(1)?1:0);
      expect(checkInvariants(s)).toEqual([]);
    }
  });
  it('rejects no modes, repeated modes, out-of-range modes, and missing targets', () => {
    const {s,epiphany}=setup(players);
    for(const modes of [[],[4,4],[5]]) expect(rejected(s,{type:'CastSpell',player:'P1',card:epiphany,modes,targets:[player('P1')]})).toBeTruthy();
    expect(rejected(s,{type:'CastSpell',player:'P1',card:epiphany,modes:[4],targets:[]})).toBeTruthy();
  });
  it('requires two blue mana and cannot target itself as a spell', () => {
    let {s,epiphany}=setup(players);s.players.P1!.manaPool.U=1;s.players.P1!.manaPool.C=5;
    expect(rejected(s,{type:'CastSpell',player:'P1',card:epiphany,modes:[4],targets:[player('P1')]})).toMatch(/mana/);
    mana(s,'P1',{U:1});
    expect(rejected(s,{type:'CastSpell',player:'P1',card:epiphany,modes:[0],targets:[card(epiphany)]})).toBeTruthy();
  });
  it('distinguishes abilities from their source card, spells, static effects and mana abilities', () => {
    const {s,epiphany,stone,spell}=setup(players);
    const land=put(s,'P2','island');
    for(const target of [card(stone),card(spell),card(land),ability(land),ability('missing'),player('P2')]) {
      expect(rejected(s,{type:'CastSpell',player:'P1',card:epiphany,modes:[1],targets:[target]})).toBeTruthy();
    }
  });
  it('bounces nonland permanents, cannot copy an opponent’s creature, and respects hexproof', () => {
    const {s,epiphany}=setup(players);
    const land=put(s,'P2','island');const enemy=put(s,'P2','soldier-token');
    expect(rejected(s,{type:'CastSpell',player:'P1',card:epiphany,modes:[2],targets:[card(land)]})).toBeTruthy();
    expect(rejected(s,{type:'CastSpell',player:'P1',card:epiphany,modes:[3],targets:[card(enemy)]})).toBeTruthy();
    put(s,'P2','swiftfoot-boots','battlefield',{attachedTo:enemy});
    expect(rejected(s,{type:'CastSpell',player:'P1',card:epiphany,modes:[2],targets:[card(enemy)]})).toBeTruthy();
  });
  it('keeps a draw mode when another target disappears before resolution', () => {
    let {s,epiphany,copy}=setup(players);
    s=act(s,{type:'CastSpell',player:'P1',card:epiphany,modes:[3,4],targets:[card(copy),player('P1')]});
    moveCard({s,ev:[]},copy,'exile');
    s=resolveEpiphany(s,epiphany).state;
    expect(s.players.P1!.hand).toHaveLength(1);
    expect(s.players.P1!.battlefield).toHaveLength(0);
  });
  it('does not resolve when all selected targets have become illegal', () => {
    let {s,epiphany,copy}=setup(players);
    s=act(s,{type:'CastSpell',player:'P1',card:epiphany,modes:[3],targets:[card(copy)]});
    moveCard({s,ev:[]},copy,'exile');
    const r=resolveEpiphany(s,epiphany);
    expect(r.events.some(e=>e.type==='StackItemResolved' && e.fizzled)).toBe(true);
    expect(r.state.players.P1!.battlefield).toHaveLength(0);
  });
  it('performs modes in printed order even when the action lists them backwards', () => {
    let {s,epiphany,copy}=setup(players);
    s=act(s,{type:'CastSpell',player:'P1',card:epiphany,modes:[4,3,2],targets:[card(copy),card(copy),player('P1')]});
    const r=resolveEpiphany(s,epiphany);s=r.state;
    expect(s.players.P1!.hand).toHaveLength(2);
    expect(s.players.P1!.battlefield).toHaveLength(0);
    const moved=r.events.findIndex(e=>e.type==='CardMoved'&&e.card===copy);
    const drawn=r.events.findIndex(e=>e.type==='CardDrawn');
    expect(moved).toBeGreaterThanOrEqual(0);expect(drawn).toBeGreaterThan(moved);
  });
  it('copies printed creature values and triggers entry abilities, without copying counters or Equipment', () => {
    let s=newGame(players);const epiphany=put(s,'P1',EPIPHANY,'hand');
    const creature=put(s,'P1','stitchers-supplier','battlefield',{counters:3,tapped:true});
    put(s,'P1','swiftfoot-boots','battlefield',{attachedTo:creature});
    mana(s,'P1',{U:2,C:4});
    s=settle(act(s,{type:'CastSpell',player:'P1',card:epiphany,modes:[3],targets:[card(creature)]})).state;
    const copy=s.players.P1!.battlefield.map(id=>s.cards[id]!).find(c=>c.defId==='stitchers-supplier'&&c.id!==creature)!;
    expect(copy).toMatchObject({isToken:true,tapped:false,summoningSick:true});
    expect(copy.counters??0).toBe(0);expect(copy.attachedTo).toBeUndefined();
    expect(s.players.P1!.graveyard.filter(id=>s.cards[id]!.defId==='island')).toHaveLength(3);
    expect(checkInvariants(s)).toEqual([]);
  });
  it('counters an entry trigger without removing the permanent or reversing its entry', () => {
    let s=newGame(players);const epiphany=put(s,'P1',EPIPHANY,'hand');const jewel=put(s,'P2','coveted-jewel','hand');
    s.activePlayer='P2';mana(s,'P1',{U:2,C:4});mana(s,'P2',{C:6});s=priority(s,'P2');
    s=act(s,{type:'CastSpell',player:'P2',card:jewel});
    while(s.cards[jewel]!.zone==='stack') { if(s.pending.kind!=='priority') throw Error(s.pending.kind);s=act(s,{type:'PassPriority',player:s.pending.player}); }
    s=priority(s,'P1');const target=s.stack.at(-1)!;
    s=act(s,{type:'CastSpell',player:'P1',card:epiphany,modes:[1],targets:[ability(target.id)]});
    s=settle(s).state;
    expect(s.cards[jewel]!.zone).toBe('battlefield');expect(s.players.P2!.hand).toHaveLength(0);
    expect(checkInvariants(s)).toEqual([]);
  });
  it('counters only the selected one of two abilities from the same permanent', () => {
    let s=newGame(players);const epiphany=put(s,'P1',EPIPHANY,'hand');const ballista=put(s,'P2','walking-ballista','battlefield',{counters:1});
    mana(s,'P1',{U:2,C:4});mana(s,'P2',{C:8});s=priority(s,'P2');
    s=act(s,{type:'ActivateAbility',player:'P2',card:ballista,ability:0});const first=s.stack.at(-1)!.id;
    s=act(s,{type:'ActivateAbility',player:'P2',card:ballista,ability:0});const second=s.stack.at(-1)!.id;
    s=priority(s,'P1');s=act(s,{type:'CastSpell',player:'P1',card:epiphany,modes:[1],targets:[ability(second)]});
    s=resolveEpiphany(s,epiphany).state;expect(s.stack.map(i=>i.id)).toEqual([first]);
    s=settle(s).state;expect(s.cards[ballista]!.counters).toBe(2);
  });
  it('lets the AI score ability targets and cast a legal response', () => {
    const {s,epiphany}=setup(players);const legal=getLegalActions(s);const action=basicAi(30)(s,legal);
    expect(legal).toContainEqual(action);expect(action).toMatchObject({type:'CastSpell',card:epiphany});
    expect(checkInvariants(act(s,action))).toEqual([]);
  });
  it('still draws when the targeted ability is countered by an earlier response', () => {
    let {s,epiphany,targetAbility}=setup(players);
    const response=put(s,'P2',EPIPHANY,'hand');mana(s,'P2',{U:2,C:4});
    s=act(s,{type:'CastSpell',player:'P1',card:epiphany,modes:[1,4],targets:[ability(targetAbility),player('P1')]});
    s=priority(s,'P2');s=act(s,{type:'CastSpell',player:'P2',card:response,modes:[1],targets:[ability(targetAbility)]});
    s=settle(s).state;
    expect(s.players.P1!.hand).toHaveLength(1);
    expect(s.players.P2!.hand).toHaveLength(0);
    expect(checkInvariants(s)).toEqual([]);
  });
  it('can target an uncounterable spell and still perform its draw mode', () => {
    let s=newGame(players);const epiphany=put(s,'P1',EPIPHANY,'hand');const rend=put(s,'P2','void-rend','hand');
    const creature=put(s,'P1','soldier-token');mana(s,'P1',{U:2,C:4});mana(s,'P2',{W:1,U:1,B:1});
    s=priority(s,'P2');s=act(s,{type:'CastSpell',player:'P2',card:rend,targets:[card(creature)]});
    s=priority(s,'P1');s=act(s,{type:'CastSpell',player:'P1',card:epiphany,modes:[0,4],targets:[card(rend),player('P1')]});
    s=resolveEpiphany(s,epiphany).state;
    expect(s.cards[rend]!.zone).toBe('stack');expect(s.players.P1!.hand).toHaveLength(1);
    s=settle(s).state;expect(s.cards[creature]!.zone).toBe('graveyard');
  });
});

