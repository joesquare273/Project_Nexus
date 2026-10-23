import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions, type GameState, type ZoneName } from '@nexus/engine';
import { attach, emptyAllManaPools, moveCard, phaseOut } from '../../engine/src/state.ts';
import { checkInvariants } from '../src/invariants.ts';
import { act, cast, goTo, mana, newGame, put, rejected, settle } from './kit-helpers.ts';
const CLOUD = 'cloud-ex-soldier', HUMAN = 'helitrooper';
function commander(s: GameState, zone: Exclude<ZoneName,'stack'|'void'> = 'command', defId = CLOUD) {
  return put(s,'P1',defId,zone,{isCommander:true,commanderStays:true});
}
function path(s: GameState, color: 'W'|'G'|'R' = 'W'): {state:GameState; id:string} {
  const id=put(s,'P1','path-of-ancestry');
  return {state:act(s,{type:'ActivateManaAbility',player:'P1',card:id,mana:color}),id};
}
function scryCount(s: GameState) { return s.stack.filter(item=>item.kind==='ability' && item.spec?.effects.some(e=>e.effect==='Scry')).length; }
function human(s: GameState) {
  const id=put(s,'P1',HUMAN,'hand'); mana(s,'P1',{C:1});
  return act(s,{type:'CastSpell',player:'P1',card:id,targets:[]});
}
function untilScry(s:GameState) {
  for(let n=0;n<20 && s.pending.kind==='priority';n++) s=act(s,{type:'PassPriority',player:s.pending.player});
  expect(s.pending.kind).toBe('surveil'); return s;
}
describe.each([2,3,4])('%i-player Path of Ancestry',players=>{
  it('enters tapped and only produces commander identity colors',()=>{
    let s=newGame(players);commander(s);const land=put(s,'P1','path-of-ancestry','hand');
    s=act(s,{type:'PlayLand',player:'P1',card:land});expect(s.cards[land]!.tapped).toBe(true);
    expect(rejected(s,{type:'ActivateManaAbility',player:'P1',card:land,mana:'W'})).toMatch(/tapped/);
    s.cards[land]!.tapped=false;
    const colors=getLegalActions(s).flatMap(a=>a.type==='ActivateManaAbility'&&a.card===land?[a.mana]:[]);
    expect(colors.sort()).toEqual(['G','R','W']);
    expect(rejected(s,{type:'ActivateManaAbility',player:'P1',card:land,mana:'C'})).toMatch(/produce/);
  });
  it('scry goes above the matching spell and offers top or bottom before it resolves',()=>{
    let s=newGame(players);commander(s);s=path(s).state;s=human(s);
    expect(scryCount(s)).toBe(1);expect(s.stack[0]!.kind).toBe('spell');
    s=untilScry(s);const top=s.players.P1!.library[0]!;
    expect(s.cards[(s.stack[0] as {card:string}).card]!.zone).toBe('stack');
    s=act(s,{type:'Surveil',player:'P1',toGraveyard:true});
    expect(s.players.P1!.library.at(-1)).toBe(top);expect(s.cards[top]!.zone).toBe('library');
    s=settle(s).state;expect(checkInvariants(s)).toEqual([]);
  });
  it('mana from Path survives the land leaving or changing control',()=>{
    for(const remove of [false,true]){
      let s=newGame(players);commander(s);const p=path(s);s=p.state;
      if(remove)moveCard({s,ev:[]},p.id,'graveyard');else s.cards[p.id]!.controller='P2';
      s=human(s);expect(scryCount(s)).toBe(1);
      expect(s.stack.at(-1)!.controller).toBe('P1');
      s=settle(s).state;expect(s.players.P1!.creatureScryMana).toHaveLength(0);
    }
  });
  it('noncreatures, nonmatching creatures, and activated costs consume mana without scry',()=>{
    for(const kind of ['artifact','rat','ability']) {
      let s=newGame(players);commander(s);s=path(s).state;
      if(kind==='ability'){
        const stone=put(s,'P1','mind-stone');
        s=act(s,{type:'ActivateAbility',player:'P1',card:stone,ability:0,targets:[]});
      }else{
        const id=put(s,'P1',kind==='artifact'?'sol-ring':'undercity-dire-rat','hand');
        if(kind==='rat')mana(s,'P1',{B:1});
        s=act(s,{type:'CastSpell',player:'P1',card:id,targets:[]});
      }
      expect(scryCount(s)).toBe(0);expect(s.players.P1!.creatureScryMana).toHaveLength(0);
    }
  });
  it('a matching cast without spending the tagged color preserves it; pools clear riders at step boundaries',()=>{
    let s=newGame(players);commander(s);s=path(s,'G').state;
    const paladin=put(s,'P1','puresteel-paladin','hand');mana(s,'P1',{W:2});
    s=cast(s,{type:'CastSpell',player:'P1',card:paladin,targets:[]}).state;
    expect(s.players.P1!.creatureScryMana).toHaveLength(1);
    s=goTo(s,'beginCombat');expect(s.players.P1!.creatureScryMana).toBeUndefined();
    expect(s.players.P1!.manaPool.G).toBe(0);
  });
  it('multiple units create independent scry 1 triggers and cannot be reused',()=>{
    let s=newGame(players);commander(s);s=path(s).state;s=path(s).state;
    const paladin=put(s,'P1','puresteel-paladin','hand');
    s=act(s,{type:'CastSpell',player:'P1',card:paladin,targets:[]});expect(scryCount(s)).toBe(2);
    s=settle(s).state;mana(s,'P1',{W:1});s=human(s);expect(scryCount(s)).toBe(0);
  });
  it('checks current commander types at casting, including Equipment subtype additions',()=>{
    for(const equipped of [false,true]){
      let s=newGame(players);const cmd=commander(s,'battlefield');s=path(s).state;
      if(equipped){const equipment=put(s,'P1','astrologians-planisphere');attach({s,ev:[]},equipment,cmd);}
      const wizard=put(s,'P1','alisaie-leveilleur','hand');mana(s,'P1',{C:2});
      s=act(s,{type:'CastSpell',player:'P1',card:wizard,targets:[]});expect(scryCount(s)).toBe(equipped?1:0);
    }
  });
  it.each(['hand','library'] as const)('hidden commander in %s has no visible creature types',zone=>{
    let s=newGame(players);commander(s,zone);s=path(s).state;s=human(s);expect(scryCount(s)).toBe(0);
  });
  it('a phased-out commander grants no types, but public exile and graveyard do',()=>{
    for(const zone of ['exile','graveyard','battlefield'] as const){
      let s=newGame(players);const cmd=commander(s,zone);
      if(zone==='battlefield')phaseOut({s,ev:[]},cmd);
      s=path(s).state;s=human(s);expect(scryCount(s)).toBe(zone==='battlefield'?0:1);
    }
  });
  it('casting the commander itself shares its types, including when it began in hand',()=>{
    for(const zone of ['command','hand'] as const){
      let s=newGame(players);const cmd=commander(s,zone);s=path(s).state;mana(s,'P1',{C:2,R:1,G:1});
      s=act(s,{type:'CastSpell',player:'P1',card:cmd,targets:[]});expect(scryCount(s)).toBe(1);
    }
  });
  it('no commander or a colorless commander produces no mana',()=>{
    for(const colorless of [false,true]){
      const s=newGame(players);if(colorless)commander(s,'command','the-warring-triad');
      const id=put(s,'P1','path-of-ancestry');
      expect(getLegalActions(s).some(a=>a.type==='ActivateManaAbility'&&a.card===id)).toBe(false);
    }
  });
  it('a second commander can supply the shared creature type and additional colors',()=>{
    let s=newGame(players);commander(s);commander(s,'command','graha-tia-scion-reborn');
    const land=put(s,'P1','path-of-ancestry');
    const colors=getLegalActions(s).flatMap(a=>a.type==='ActivateManaAbility'&&a.card===land?[a.mana]:[]);
    expect(colors.sort()).toEqual(['B','G','R','U','W']);
    s=act(s,{type:'ActivateManaAbility',player:'P1',card:land,mana:'W'});
    const wizard=put(s,'P1','alisaie-leveilleur','hand');mana(s,'P1',{C:2});
    s=act(s,{type:'CastSpell',player:'P1',card:wizard,targets:[]});expect(scryCount(s)).toBe(1);
  });
  it('the scry trigger can be countered independently of the creature spell',()=>{
    let s=newGame(players);commander(s);s=path(s).state;s=human(s);
    const ability=s.stack.at(-1)!;
    while(s.pending.kind==='priority'&&s.pending.player!=='P2')s=act(s,{type:'PassPriority',player:s.pending.player});
    const counter=put(s,'P2','sublime-epiphany','hand');mana(s,'P2',{C:4,U:2});
    s=cast(s,{type:'CastSpell',player:'P2',card:counter,modes:[1],targets:[{kind:'ability',ability:ability.id}]}).state;
    expect(s.players.P1!.battlefield.some(id=>s.cards[id]!.defId===HUMAN)).toBe(true);
  });
  it('payment does not mutate its input state and failed casts retain mana riders',()=>{
    let s=newGame(players);commander(s);s=path(s).state;const id=put(s,'P1',HUMAN,'hand');
    const before=JSON.stringify(s);const failed=applyAction(s,{type:'CastSpell',player:'P1',card:id,targets:[]});
    expect(failed.ok).toBe(false);expect(JSON.stringify(s)).toBe(before);
    mana(s,'P1',{C:1});const input=JSON.stringify(s);s=act(s,{type:'CastSpell',player:'P1',card:id,targets:[]});
    expect(scryCount(s)).toBe(1);expect(s.players.P1!.creatureScryMana).toHaveLength(0);
    expect(JSON.parse(input).players.P1.creatureScryMana).toHaveLength(1);
    emptyAllManaPools(s);expect(s.players.P1!.creatureScryMana).toBeUndefined();
  });
});
