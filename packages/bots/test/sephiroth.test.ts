import { describe, expect, it } from 'vitest';
import { getLegalActions, viewFor, type GameState } from '@nexus/engine';
import { addCounters, attach, moveCard, removeCounters } from '../../engine/src/state.ts';
import { isEquipped, isModified } from '../../engine/src/characteristics.ts';
import { basicAi } from '../src/index.ts';
import { checkInvariants } from '../src/invariants.ts';
import { act, card, goTo, mana, newGame, put, rejected, settle } from './kit-helpers.ts';
const SEPH = 'sephiroth-fallen-hero';
function stats(s: GameState, id: string) { return viewFor(s,'P1').stats[id]!; }
function attack(s: GameState, seph: string, target: string, accept=true) {
  s=goTo(s,'declareAttackers');
  s=act(s,{type:'DeclareAttackers',player:'P1',attacks:[{attacker:seph,defender:'P2'}]});
  s=settle(s,{targets:()=>[card(target)]}).state;
  expect(s.pending).toMatchObject({kind:'chooseCards',player:'P1',purpose:'addCounters',counter:'cell',cards:[target],min:0,max:1});
  s=act(s,{type:'ChooseCards',player:'P1',cards:accept?[target]:[]});
  return settle(s).state;
}
describe.each([2,3,4])('Sephiroth with %i players', players=>{
  it('casts for {3}{R}{W} as a 7/5 Human Avatar Soldier',()=>{
    let s=newGame(players);const seph=put(s,'P1',SEPH,'hand');mana(s,'P1',{C:3,R:1,W:1});
    s=settle(act(s,{type:'CastSpell',player:'P1',card:seph})).state;
    expect(stats(s,seph)).toMatchObject({power:7,toughness:5,subtypes:['Human','Avatar','Soldier']});
    expect(s.cards[seph]!.summoningSick).toBe(true);expect(checkInvariants(s)).toEqual([]);
  });
  it('puts a cell counter on a targeted creature, making it modified and 7/5',()=>{
    let s=newGame(players);const seph=put(s,'P1',SEPH),host=put(s,'P1','soldier-token');
    s=attack(s,seph,host);
    expect(s.cards[host]!.namedCounters).toEqual({cell:1});
    expect(stats(s,host)).toMatchObject({power:7,toughness:5});
    expect(s.cards[host]!.counters??0).toBe(0);expect(checkInvariants(s)).toEqual([]);
  });
  it('can decline the cell counter and still change already modified creatures',()=>{
    let s=newGame(players);const seph=put(s,'P1',SEPH),target=put(s,'P1','soldier-token'),marked=put(s,'P1','soldier-token','battlefield',{namedCounters:{shield:1}});
    s=attack(s,seph,target,false);
    expect(s.cards[target]!.namedCounters).toBeUndefined();
    expect(stats(s,target)).toMatchObject({power:1,toughness:1});
    expect(stats(s,marked)).toMatchObject({power:7,toughness:5});
  });
  it('can place a cell on an opponent’s creature without changing that creature’s base stats',()=>{
    let s=newGame(players);const seph=put(s,'P1',SEPH),enemy=put(s,'P2','soldier-token');
    s=attack(s,seph,enemy);
    expect(s.cards[enemy]!.namedCounters?.cell).toBe(1);
    expect(stats(s,enemy)).toMatchObject({power:1,toughness:1});
  });
  it('keeps Equipment bonuses, counters, and earlier temporary bonuses additive',()=>{
    let s=newGame(players);const seph=put(s,'P1',SEPH),host=put(s,'P1','soldier-token','battlefield',{counters:1});
    put(s,'P1','behemoth-sledge','battlefield',{attachedTo:host});
    s.temporaryEffects.push({source:seph,affected:host,power:2,toughness:0});
    s=attack(s,seph,host);
    expect(stats(s,host)).toMatchObject({power:12,toughness:8});
  });
  it('locks in affected creatures when the ability resolves',()=>{
    let s=newGame(players);const seph=put(s,'P1',SEPH),marked=put(s,'P1','soldier-token','battlefield',{namedCounters:{cell:1}}),later=put(s,'P1','soldier-token');
    s=attack(s,seph,seph,false);
    removeCounters({s,ev:[]},marked,'cell',1);addCounters({s,ev:[]},later,1,'P1','cell');
    expect(isModified(s,s.cards[marked]!)).toBe(false);
    expect(stats(s,marked)).toMatchObject({power:7,toughness:5});
    expect(stats(s,later)).toMatchObject({power:1,toughness:1});
  });
  it('keeps the cell through cleanup while the temporary base stats expire',()=>{
    let s=newGame(players);const seph=put(s,'P1',SEPH),host=put(s,'P1','soldier-token');
    s=attack(s,seph,host);s=goTo(s,'upkeep');
    expect(s.cards[host]!.namedCounters?.cell).toBe(1);
    expect(stats(s,host)).toMatchObject({power:1,toughness:1});
    expect(checkInvariants(s)).toEqual([]);
  });
  it('keeps the buff after Sephiroth leaves, but a creature that leaves and returns is a new object',()=>{
    let s=newGame(players);const seph=put(s,'P1',SEPH),host=put(s,'P1','soldier-token');
    s=attack(s,seph,host);moveCard({s,ev:[]},seph,'graveyard');
    expect(stats(s,host)).toMatchObject({power:7,toughness:5});
    moveCard({s,ev:[]},host,'graveyard');moveCard({s,ev:[]},host,'battlefield');addCounters({s,ev:[]},host,1,'P1','cell');
    expect(stats(s,host)).toMatchObject({power:1,toughness:1});
  });
  it('uses timestamps against Wrecking Ball Arm without resetting when equipped to the same creature',()=>{
    let s=newGame(players);const seph=put(s,'P1',SEPH),host=put(s,'P1','soldier-token'),other=put(s,'P1','soldier-token'),arm=put(s,'P1','wrecking-ball-arm');
    attach({s,ev:[]},arm,host);expect(stats(s,host)).toMatchObject({power:7,toughness:7});
    s=attack(s,seph,host);expect(stats(s,host)).toMatchObject({power:7,toughness:5});
    attach({s,ev:[]},arm,host);expect(stats(s,host)).toMatchObject({power:7,toughness:5});
    attach({s,ev:[]},arm,other);attach({s,ev:[]},arm,host);
    expect(stats(s,host)).toMatchObject({power:7,toughness:7});
    expect(checkInvariants(s)).toEqual([]);
  });
  it('treats any controller’s Equipment, counters, and only your own Auras as modifications',()=>{
    const s=newGame(players),equipmentHost=put(s,'P1','soldier-token'),auraHost=put(s,'P1','soldier-token'),enemyAuraHost=put(s,'P1','soldier-token');
    put(s,'P2','swiftfoot-boots','battlefield',{attachedTo:equipmentHost});
    put(s,'P2','observed-stasis','battlefield',{attachedTo:auraHost,controller:'P1'});
    put(s,'P1','observed-stasis','battlefield',{attachedTo:enemyAuraHost,controller:'P2'});
    expect(isModified(s,s.cards[equipmentHost]!)).toBe(true);
    expect(isModified(s,s.cards[auraHost]!)).toBe(true);expect(isEquipped(s,s.cards[auraHost]!)).toBe(false);
    expect(isModified(s,s.cards[enemyAuraHost]!)).toBe(false);
  });
  it('pays three and sacrifices a modified creature as costs, then returns tapped outside combat',()=>{
    let s=newGame(players);const seph=put(s,'P1',SEPH,'graveyard'),sac=put(s,'P1','soldier-token','battlefield',{namedCounters:{cell:1},tapped:true});
    mana(s,'P1',{C:3});s=act(s,{type:'ActivateAbility',player:'P1',card:seph,ability:0,costCards:[sac]});
    expect(s.cards[sac]!.zone).toBe('graveyard');expect(s.cards[seph]!.zone).toBe('graveyard');
    expect(s.players.P1!.manaPool.C).toBe(0);s=settle(s).state;
    expect(s.cards[seph]).toMatchObject({zone:'battlefield',tapped:true,summoningSick:true});
    expect(s.combat).toBeNull();expect(checkInvariants(s)).toEqual([]);
  });
  it('requires a modified creature you control and enough mana',()=>{
    const s=newGame(players),seph=put(s,'P1',SEPH,'graveyard'),plain=put(s,'P1','soldier-token'),enemy=put(s,'P2','soldier-token','battlefield',{counters:1}),artifact=put(s,'P1','sol-ring','battlefield',{namedCounters:{charge:1}}),ally=put(s,'P1','soldier-token','battlefield',{counters:1});
    mana(s,'P1',{C:3});
    for(const costCards of [[],[plain],[enemy],[artifact],[plain,ally]])expect(rejected(s,{type:'ActivateAbility',player:'P1',card:seph,ability:0,costCards})).toBeTruthy();
    s.players.P1!.manaPool.C=2;expect(rejected(s,{type:'ActivateAbility',player:'P1',card:seph,ability:0,costCards:[ally]})).toMatch(/mana/);
  });
  it.each(['battlefield','hand','exile','command'] as const)('cannot activate Reunion from %s',zone=>{
    const s=newGame(players),seph=put(s,'P1',SEPH,zone),ally=put(s,'P1','soldier-token','battlefield',{counters:1});mana(s,'P1',{C:3});
    expect(rejected(s,{type:'ActivateAbility',player:'P1',card:seph,ability:0,costCards:[ally]})).toBeTruthy();
  });
  it('can return at instant speed during an opponent’s turn',()=>{
    let s=newGame(players);const seph=put(s,'P1',SEPH,'graveyard'),ally=put(s,'P1','soldier-token','battlefield',{counters:1});
    s.activePlayer='P2';s.step='end';mana(s,'P1',{C:3});
    s=settle(act(s,{type:'ActivateAbility',player:'P1',card:seph,ability:0,costCards:[ally]})).state;
    expect(s.cards[seph]!.zone).toBe('battlefield');
  });
  it('does not return after being exiled and put back into the graveyard in response',()=>{
    let s=newGame(players);const seph=put(s,'P1',SEPH,'graveyard'),ally=put(s,'P1','soldier-token','battlefield',{counters:1});mana(s,'P1',{C:3});
    s=act(s,{type:'ActivateAbility',player:'P1',card:seph,ability:0,costCards:[ally]});
    moveCard({s,ev:[]},seph,'exile');moveCard({s,ev:[]},seph,'graveyard');s=settle(s).state;
    expect(s.cards[seph]!.zone).toBe('graveyard');expect(s.cards[ally]!.zone).toBe('graveyard');
  });
  it('lets the AI use Reunion with a low-value modified creature',()=>{
    const s=newGame(players),seph=put(s,'P1',SEPH,'graveyard'),ally=put(s,'P1','soldier-token','battlefield',{namedCounters:{cell:1}});mana(s,'P1',{C:3});
    const action=basicAi(1)(s,getLegalActions(s));
    expect(action).toMatchObject({type:'ActivateAbility',card:seph,costCards:[ally]});
    expect(checkInvariants(settle(act(s,action)).state)).toEqual([]);
  });
  it('does not apply either effect if the attack trigger’s only target becomes illegal',()=>{
    let s=newGame(players);const seph=put(s,'P1',SEPH),target=put(s,'P2','soldier-token'),marked=put(s,'P1','soldier-token','battlefield',{counters:1});
    s=goTo(s,'declareAttackers');s=act(s,{type:'DeclareAttackers',player:'P1',attacks:[{attacker:seph,defender:'P2'}]});
    s=act(s,{type:'ChooseTargets',player:'P1',targets:[card(target)]});
    moveCard({s,ev:[]},target,'graveyard');s=settle(s).state;
    expect(stats(s,marked)).toMatchObject({power:2,toughness:2});
    expect(s.temporaryEffects).toHaveLength(0);
  });
  it('does not refund the sacrifice when Reunion is countered',()=>{
    let s=newGame(players);const seph=put(s,'P1',SEPH,'graveyard'),ally=put(s,'P1','soldier-token','battlefield',{counters:1}),counter=put(s,'P2','sublime-epiphany','hand');
    mana(s,'P1',{C:3});mana(s,'P2',{U:2,C:4});s=act(s,{type:'ActivateAbility',player:'P1',card:seph,ability:0,costCards:[ally]});
    const ability=s.stack.at(-1)!.id;s=act(s,{type:'PassPriority',player:'P1'});
    s=act(s,{type:'CastSpell',player:'P2',card:counter,modes:[1],targets:[{kind:'ability',ability}]});s=settle(s).state;
    expect(s.cards[seph]!.zone).toBe('graveyard');expect(s.cards[ally]!.zone).toBe('graveyard');
    expect(s.players.P1!.manaPool.C).toBe(0);expect(checkInvariants(s)).toEqual([]);
  });
  it('can activate twice while in the graveyard, but returns only once',()=>{
    let s=newGame(players);const seph=put(s,'P1',SEPH,'graveyard'),one=put(s,'P1','soldier-token','battlefield',{counters:1}),two=put(s,'P1','soldier-token','battlefield',{counters:1});
    mana(s,'P1',{C:6});
    for(const ally of [one,two])s=act(s,{type:'ActivateAbility',player:'P1',card:seph,ability:0,costCards:[ally]});
    const result=settle(s);s=result.state;
    expect(result.events.filter(e=>e.type==='CardMoved'&&e.card===seph&&e.to==='battlefield')).toHaveLength(1);
    expect(s.cards[seph]!.zone).toBe('battlefield');expect(checkInvariants(s)).toEqual([]);
  });
});
