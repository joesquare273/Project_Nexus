import {describe,expect,it} from 'vitest';
import {applyAction,getLegalActions,viewFor,filterEventsFor,type GameState} from '@nexus/engine';
import {moveCard} from '../../engine/src/state.ts';
import {spellCost} from '../../engine/src/stack.ts';
import {basicAi} from '../src/index.ts';
import {act,actWithEvents,mana,newGame,put,settle} from './kit-helpers.ts';
const URI='urianger-augurelt';
function setup(n=2){const s=newGame(n),u=put(s,'P1',URI);return {s,u};}
function activate(s:GameState,u:string,ability:number,p='P1'){return act(s,{type:'ActivateAbility',player:p,card:u,ability,targets:[]});}
function draw(s:GameState,u:string,exile=true){s.cards[u]!.tapped=false;s=settle(activate(s,u,0)).state;expect(s.pending.kind).toBe('exileTop');return act(s,{type:'ExileTop',player:'P1',exile});}
function grant(s:GameState,u:string,p='P1'){s.cards[u]!.tapped=false;return settle(activate(s,u,1,p)).state;}
function cast(s:GameState,id:string,p='P1'){return act(s,{type:'CastSpell',player:p,card:id,targets:[]});}
describe.each([2,3,4])('%i-player Urianger',n=>{
 it('privately looks, optionally keeps, and exiles without exposing identity',()=>{
  let {s,u}=setup(n);const top=put(s,'P1','astrologians-planisphere','library');s=settle(activate(s,u,0)).state;
  expect(viewFor(s,'P1').cards[top]?.defId).toBe('astrologians-planisphere');expect(viewFor(s,'P2').cards[top]).toBeUndefined();expect(viewFor(s,'P2').pending).toMatchObject({kind:'exileTop',card:''});
  expect(getLegalActions(s)).toHaveLength(2);const before=structuredClone(s);const r=actWithEvents(s,{type:'ExileTop',player:'P1',exile:true});expect(s).toEqual(before);s=r.state;
  expect(s.cards[top]!.zone).toBe('exile');expect(s.cards[top]!.linkedExile).toMatchObject({source:u,sourceObject:0});expect(viewFor(s,'P1').cards[top]).toBeDefined();expect(viewFor(s,'P2').cards[top]).toBeUndefined();
  expect(filterEventsFor(r.events,'P2')).toContainEqual({type:'FaceDownExiled',player:'P1'});expect(r.events.some(e=>e.type==='CardMoved')).toBe(false);
 });
 it('keeping the card does not move it or create permission',()=>{let {s,u}=setup(n);const top=s.players.P1!.library[0]!;s=draw(s,u,false);expect(s.players.P1!.library[0]).toBe(top);expect(s.cards[top]!.linkedExile).toBeUndefined();expect(s.pending.kind).toBe('priority');});
 it('cannot cast before Play Arcanum and receives only generic reduction',()=>{
  let {s,u}=setup(n);const c=put(s,'P1','hellkite-tyrant','library');s=draw(s,u);mana(s,'P1',{R:2,C:2});expect(applyAction(s,{type:'CastSpell',player:'P1',card:c,targets:[]}).ok).toBe(false);s=grant(s,u);
  expect(spellCost(s,s.cardDefs['hellkite-tyrant']!,'exile',[],s.cards[c])).toMatchObject({generic:2,R:2});s=cast(s,c);expect(s.players.P1!.manaPool.R).toBe(0);expect(s.players.P1!.manaPool.C).toBe(0);expect(s.stack.at(-1)).toMatchObject({kind:'ability',source:u});
  const life=s.players.P1!.life;s=settle(s).state;expect(s.players.P1!.life).toBe(life+2);expect(s.cards[c]!.zone).toBe('battlefield');expect(s.cards[c]!.linkedExile).toBeUndefined();
 });
 it('plays exiled lands with normal land limits and gains life',()=>{
  let {s,u}=setup(n);const c=s.players.P1!.library[0]!;s=draw(s,u);s=grant(s,u);s=act(s,{type:'PlayLand',player:'P1',card:c});expect(s.stack.at(-1)).toMatchObject({kind:'ability',source:u});s=settle(s).state;expect(s.players.P1!.life).toBe(22);expect(s.players.P1!.landsPlayedThisTurn).toBe(1);
  const second=put(s,'P1','island','exile',{castPermission:{player:'P1',turn:s.turnNumber}});expect(applyAction(s,{type:'PlayLand',player:'P1',card:second}).ok).toBe(false);
 });
 it('normal hand casts and lands, and exile-to-battlefield effects, do not trigger',()=>{
  let {s,u}=setup(n);const c=put(s,'P1','island','hand');s=act(s,{type:'PlayLand',player:'P1',card:c});expect(s.stack).toHaveLength(0);const other=put(s,'P1','island','exile');moveCard({s,ev:[]},other,'battlefield');expect(s.stack).toHaveLength(0);
 });
 it('permission expires but the card stays visible to its exiler',()=>{let {s,u}=setup(n);const c=s.players.P1!.library[0]!;s=grant(draw(s,u),u);s.turnNumber++;expect(getLegalActions(s).some(a=>a.type==='PlayLand'&&a.card===c)).toBe(false);expect(viewFor(s,'P1').cards[c]).toBeDefined();expect(s.cards[c]!.zone).toBe('exile');});
 it('leaving and returning breaks the link; existing permission survives leaving',()=>{
  let {s,u}=setup(n);const c=s.players.P1!.library[0]!;s=draw(s,u);moveCard({s,ev:[]},u,'hand');moveCard({s,ev:[]},u,'battlefield');s.cards[u]!.summoningSick=false;s=grant(s,u);expect(s.cards[c]!.castPermission).toBeUndefined();
  const next=s.players.P1!.library[0]!;s=grant(draw(s,u),u);moveCard({s,ev:[]},u,'graveyard');s=act(s,{type:'PlayLand',player:'P1',card:next});expect(s.cards[next]!.zone).toBe('battlefield');expect(s.cards[c]!.zone).toBe('exile');
 });
 it('Play Arcanum on the stack still grants its original links after Urianger leaves',()=>{let {s,u}=setup(n);const c=s.players.P1!.library[0]!;s=draw(s,u);s.cards[u]!.tapped=false;s=activate(s,u,1);moveCard({s,ev:[]},u,'graveyard');s=settle(s).state;expect(s.cards[c]!.castPermission?.player).toBe('P1');});
 it('later exiles need another activation',()=>{let {s,u}=setup(n);s=grant(s,u);const c=s.players.P1!.library[0]!;s=draw(s,u);expect(s.cards[c]!.castPermission).toBeUndefined();});
 it('summoning sickness and tapped status prevent both abilities',()=>{const {s,u}=setup(n);for(const flag of ['summoningSick','tapped'] as const){s.cards[u]![flag]=true;for(const ability of [0,1])expect(applyAction(s,{type:'ActivateAbility',player:'P1',card:u,ability,targets:[]}).ok).toBe(false);s.cards[u]![flag]=false;}});
 it('empty library resolves without a choice',()=>{let {s,u}=setup(n);for(const c of s.players.P1!.library)s.cards[c]!.zone='void';s.players.P1!.library=[];s=settle(activate(s,u,0)).state;expect(s.pending.kind).toBe('priority');expect(s.resolving).toBeNull();});
});
it('new controller can play old links, with their mana and life trigger',()=>{
 let {s,u}=setup(3);const c=put(s,'P1','hellkite-tyrant','library');s=draw(s,u);s.cards[u]!.controller='P2';s.activePlayer='P2';s.pending={kind:'priority',player:'P2',passes:0};expect(viewFor(s,'P2').cards[c]).toBeUndefined();s=grant(s,u,'P2');expect(viewFor(s,'P2').cards[c]).toBeDefined();expect(viewFor(s,'P3').cards[c]).toBeUndefined();mana(s,'P2',{R:2,C:2});s=cast(s,c,'P2');s=settle(s).state;expect(s.cards[c]!.controller).toBe('P2');expect(s.cards[c]!.owner).toBe('P1');expect(s.players.P2!.life).toBe(22);expect(s.players.P1!.life).toBe(20);
});
it('face-down moves to hidden zones retain private event identities',()=>{let {s,u}=setup(3);const c=s.players.P1!.library[0]!;s=draw(s,u);const ctx={s,ev:[] as import('@nexus/engine').GameEvent[]};moveCard(ctx,c,'hand');expect(filterEventsFor(ctx.ev,'P2')[0]).toEqual({type:'CardMoved',owner:'P1',from:'exile',to:'hand'});expect(filterEventsFor(ctx.ev,'P1')[0]).toMatchObject({card:c,defId:'island'});expect(s.cards[c]!.linkedExile).toBeUndefined();});
it('AI chooses to store a card and later activate play permission',()=>{let {s,u}=setup();s=settle(activate(s,u,0)).state;const ai=basicAi();expect(ai(s,getLegalActions(s))).toMatchObject({type:'ExileTop',exile:true});s=act(s,{type:'ExileTop',player:'P1',exile:true});s.cards[u]!.tapped=false;expect(ai(s,getLegalActions(s))).toMatchObject({type:'ActivateAbility',card:u,ability:1});});
it('discount adds X and additional costs before removing generic mana',()=>{const {s}=setup();const c=put(s,'P1','island','exile',{castPermission:{player:'P1',turn:s.turnNumber,genericReduction:2}});const d={id:'test',name:'test',types:['sorcery'] as const,manaCost:'{X}{U}',kicker:'{3}'};expect(spellCost(s,{...d,types:['sorcery']},'exile',[],s.cards[c],false,4,{kicks:1})).toMatchObject({generic:5,U:1});});

it('one Urianger cannot grant access to another Urianger object links',()=>{let {s,u}=setup();const c=s.players.P1!.library[0]!;s=draw(s,u);moveCard({s,ev:[]},u,'graveyard');const other=put(s,'P1',URI);s=grant(s,other);expect(s.cards[c]!.castPermission).toBeUndefined();});
it('Draw Arcanum on the stack retains its old source identity after a blink',()=>{let {s,u}=setup();const c=s.players.P1!.library[0]!;s=activate(s,u,0);moveCard({s,ev:[]},u,'hand');moveCard({s,ev:[]},u,'battlefield');s.cards[u]!.summoningSick=false;s=settle(s).state;s=act(s,{type:'ExileTop',player:'P1',exile:true});expect(s.cards[c]!.linkedExile?.sourceObject).toBe(0);s=grant(s,u);expect(s.cards[c]!.castPermission).toBeUndefined();});
it('rejects another player answering a private look',()=>{let {s,u}=setup();s=settle(activate(s,u,0)).state;expect(applyAction(s,{type:'ExileTop',player:'P2',exile:true}).ok).toBe(false);});
it('play permission does not bypass sorcery timing',()=>{let {s,u}=setup();const c=put(s,'P1','hellkite-tyrant','library');s=grant(draw(s,u),u);mana(s,'P1',{R:2,C:2});s.step='end';expect(applyAction(s,{type:'CastSpell',player:'P1',card:c,targets:[]}).ok).toBe(false);});
it('colored mana cannot be replaced by the generic reduction',()=>{let {s,u}=setup();const c=put(s,'P1','hellkite-tyrant','library');s=grant(draw(s,u),u);mana(s,'P1',{R:1,C:3});expect(applyAction(s,{type:'CastSpell',player:'P1',card:c,targets:[]}).ok).toBe(false);});
it('casting from other exile permissions also triggers the life gain',()=>{let {s,u}=setup();const c=put(s,'P1','hellkite-tyrant','exile',{castPermission:{player:'P1',turn:s.turnNumber,free:true}});s=cast(s,c);expect(s.stack.at(-1)).toMatchObject({source:u});s=settle(s).state;expect(s.players.P1!.life).toBe(22);});
it('casting the same spell from hand does not trigger life gain',()=>{let {s}=setup();const c=put(s,'P1','hellkite-tyrant','hand');mana(s,'P1',{R:2,C:4});s=cast(s,c);expect(s.stack).toHaveLength(1);s=settle(s).state;expect(s.players.P1!.life).toBe(20);});
it('AI saves the tap ability when linked lands cannot be played this turn',()=>{let {s,u}=setup();s=draw(s,u);s.cards[u]!.tapped=false;s.players.P1!.landsPlayedThisTurn=1;const a=basicAi()(s,getLegalActions(s));expect(a).toMatchObject({type:'ActivateAbility',ability:0});});
it('AI avoids storing the last library card',()=>{let {s,u}=setup();s.players.P1!.library=s.players.P1!.library.slice(0,1);s=settle(activate(s,u,0)).state;expect(basicAi()(s,getLegalActions(s))).toMatchObject({type:'ExileTop',exile:false});});
