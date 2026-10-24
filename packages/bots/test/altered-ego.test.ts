import {describe,expect,it} from 'vitest';
import {applyAction,currentDefinition,getLegalActions,powerOf,toughnessOf,type GameState} from '@nexus/engine';
import {moveCard} from '../../engine/src/state.ts';
import {basicAi} from '../src/index.ts';
import {act,mana,newGame,put,settle} from './kit-helpers.ts';
const EGO='altered-ego',RAT='undercity-dire-rat',DRAGON='hraesvelgr-of-the-first-brood',SOLEMN='solemn-simulacrum';
function cast(s:GameState,x:number){const ego=put(s,'P1',EGO,'hand');s.step='main1';s.pending={kind:'priority',player:'P1',passes:0};mana(s,'P1',{C:2+x,G:1,U:1});s=act(s,{type:'CastSpell',player:'P1',card:ego,targets:[],x});return {s:settle(s).state,ego};}
const choose=(s:GameState,cards:string[])=>act(s,{type:'ChooseCards',player:'P1',cards});
describe.each([2,3,4])('%i-player Altered Ego',n=>{
 it('enters as a copy of any creature, including an opponent’s, with X additional counters',()=>{let s=newGame(n);const b=put(s,'P2',DRAGON);let {s:t,ego}=cast(s,2);expect(t.pending).toMatchObject({kind:'chooseCards',purpose:'copyOnEntry',min:0,max:1,cards:[b]});t=choose(t,[b]);expect(t.cards[ego]!).toMatchObject({zone:'battlefield',controller:'P1',counters:2});expect(currentDefinition(t,t.cards[ego]!).name).toBe('Hraesvelgr of the First Brood');expect(powerOf(t,t.cards[ego]!)).toBe(powerOf(t,t.cards[b]!)+2);});
 it('may enter as itself, a 0/0 that survives only with counters',()=>{let s=newGame(n);put(s,'P1',RAT);let {s:t,ego}=cast(s,1);t=choose(t,[]);expect(currentDefinition(t,t.cards[ego]!).name).toBe('Altered Ego');expect(toughnessOf(t,t.cards[ego]!)).toBe(1);expect(t.cards[ego]!.zone).toBe('battlefield');});
});
it('enters as itself with no choice when no creature is on the battlefield, and dies at X=0',()=>{let s=newGame();let {s:t,ego}=cast(s,0);expect(t.pending.kind).toBe('priority');expect(t.cards[ego]!.zone).toBe('graveyard');});
it('copied enters-the-battlefield abilities trigger',()=>{let s=newGame();const b=put(s,'P2',SOLEMN);let {s:t,ego}=cast(s,0);t=choose(t,[b]);expect(t.stack.at(-1)).toMatchObject({kind:'ability',source:ego});});
it('copies the copiable values only: not counters, damage or tapped status',()=>{let s=newGame();const b=put(s,'P2',RAT,'battlefield',{counters:3,damage:1,tapped:true});let {s:t,ego}=cast(s,1);t=choose(t,[b]);expect(t.cards[ego]!).toMatchObject({counters:1,damage:0,tapped:false});expect(powerOf(t,t.cards[ego]!)).toBe(powerOf(t,t.cards[b]!)-3+1);});
it('cannot be countered',()=>{let s=newGame();const ego=put(s,'P1',EGO,'hand');s.step='main1';s.pending={kind:'priority',player:'P1',passes:0};mana(s,'P1',{C:2,G:1,U:1});s=act(s,{type:'CastSpell',player:'P1',card:ego,targets:[],x:0});const item=s.stack.at(-1)!;expect(item.kind).toBe('spell');expect(currentDefinition(s,s.cards[ego]!).cantBeCountered).toBe(true);});
it('only its controller answers, and a creature that left is refused',()=>{let s=newGame();const b=put(s,'P2',RAT);let {s:t}=cast(s,1);expect(applyAction(t,{type:'ChooseCards',player:'P2',cards:[b]}).ok).toBe(false);moveCard({s:t,ev:[]},b,'exile');expect(applyAction(t,{type:'ChooseCards',player:'P1',cards:[b]}).ok).toBe(false);expect(applyAction(t,{type:'ChooseCards',player:'P1',cards:[]}).ok).toBe(true);});
it('the AI copies the most valuable creature',()=>{let s=newGame();put(s,'P1',RAT);const b=put(s,'P2',DRAGON);let {s:t,ego}=cast(s,1);t=act(t,basicAi()(t,getLegalActions(t)));expect(currentDefinition(t,t.cards[ego]!).name).toBe('Hraesvelgr of the First Brood');});
it('a copied legend is subject to the legend rule',()=>{let s=newGame();const b=put(s,'P1',DRAGON);let {s:t}=cast(s,0);t=choose(t,[b]);expect(t.pending.kind).toBe('chooseLegend');});
