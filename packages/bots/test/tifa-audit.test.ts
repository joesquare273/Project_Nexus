import {describe,expect,it} from 'vitest';
import {getLegalActions,powerOf,type GameState,type GameEvent,type Attack} from '@nexus/engine';
import {dealDamage,moveCard} from '../../engine/src/state.ts';
import {stabilize} from '../../engine/src/sba.ts';
import {basicAi} from '../src/index.ts';
import {act,mana,newGame,put,settle,nextStep} from './kit-helpers.ts';
const TIFA='tifa-martial-artist',RAT='undercity-dire-rat';
function setup(players:number){const s=newGame(players);for(const p of Object.values(s.players))p.life=100;const tifa=put(s,'P1',TIFA);s.step='declareAttackers';s.combatsThisTurn=1;s.pending={kind:'declareAttackers',player:'P1'};return {s,tifa};}
function attack(s:GameState,attacks:Attack[],resolve=true){s=act(s,{type:'DeclareAttackers',player:'P1',attacks});return resolve?settle(s).state:s;}
function damage(s:GameState){for(let i=0;i<40;i++){if(s.step==='combatDamage')return s;const p=s.pending;if(p.kind==='declareBlockers')s=act(s,{type:'DeclareBlockers',player:p.player,blocks:[]});else if(p.kind==='priority')s=act(s,{type:'PassPriority',player:p.player});else throw Error(p.kind);}throw Error('no damage');}
function triggers(s:GameState,tifa:string){return s.stack.filter(i=>i.kind==='ability'&&i.source===tifa&&i.ability===1).length;}
const big=(s:GameState)=>put(s,'P1',RAT,'battlefield',{counters:5});
describe.each([2,3,4])('%i-player Tifa audit',players=>{
 it('melee counts distinct declared opponents, even after the other attacker leaves',()=>{
  let {s,tifa}=setup(players);const a=put(s,'P1',RAT);s=attack(s,[{attacker:tifa,defender:'P2'},{attacker:a,defender:players>2?'P3':'P2'}],false);moveCard({s,ev:[]},a,'graveyard');s=settle(s).state;expect(powerOf(s,s.cards[tifa]!)).toBe(players>2?6:5);
 });
 it('entering attacking neither adds a declared opponent nor triggers melee',()=>{
  let {s,tifa}=setup(players);s=attack(s,[{attacker:tifa,defender:'P2'}],false);const a=put(s,'P1',RAT);s.combat!.attacks.push({attacker:a,defender:players>2?'P3':'P2'});s=settle(s).state;expect(powerOf(s,s.cards[tifa]!)).toBe(5);
 });
 it('old melee cannot boost a Tifa that left and returned',()=>{
  let {s,tifa}=setup(players);s=attack(s,[{attacker:tifa,defender:'P2'}],false);moveCard({s,ev:[]},tifa,'exile');moveCard({s,ev:[]},tifa,'battlefield');s=settle(s).state;expect(powerOf(s,s.cards[tifa]!)).toBe(4);
 });
 it('two qualifying creatures hitting the same player produce one trigger',()=>{
  let {s,tifa}=setup(players);const a=big(s),b=big(s);s=damage(attack(s,[{attacker:a,defender:'P2'},{attacker:b,defender:'P2'}]));expect(triggers(s,tifa)).toBe(1);s=settle(s).state;expect(s.extraCombats).toBe(1);expect(s.cards[a]!.tapped).toBe(false);
 });
 it('each player hit produces its own trigger even when Tifa stays home',()=>{
  let {s,tifa}=setup(players);const attacks=s.turnOrder.filter(p=>p!=='P1').map(defender=>({attacker:big(s),defender}));s=damage(attack(s,attacks));expect(triggers(s,tifa)).toBe(players-1);s=settle(s).state;expect(s.extraCombats).toBe(players-1);
 });
 it('smaller creatures cannot pool their power to reach seven',()=>{
  let {s,tifa}=setup(players);const a=put(s,'P1',RAT,'battlefield',{counters:4}),b=put(s,'P1',RAT,'battlefield',{counters:4});s=damage(attack(s,[{attacker:a,defender:'P2'},{attacker:b,defender:'P2'}]));expect(triggers(s,tifa)).toBe(0);
 });
 it('later combats still untap creatures without creating more combats',()=>{
  let {s,tifa}=setup(players);const a=big(s);s.combatsThisTurn=2;s=damage(attack(s,[{attacker:a,defender:'P2'}]));expect(triggers(s,tifa)).toBe(1);s=settle(s).state;expect(s.cards[a]!.tapped).toBe(false);expect(s.extraCombats??0).toBe(0);
 });
 it('double strike gives priority and untaps between hits, with a trigger for each hit',()=>{
  let {s,tifa}=setup(players);const a=big(s);s.temporaryEffects.push({source:tifa,affected:a,keywords:['DoubleStrike']});s=damage(attack(s,[{attacker:a,defender:'P2'}]));expect(s.combat!.damageStep).toBe('first');expect(triggers(s,tifa)).toBe(1);expect(s.players.P2!.life).toBe(93);
  s=settle(s).state;expect(s.cards[a]!.tapped).toBe(false);expect(s.extraCombats).toBe(1);s=nextStep(s);expect(s.combat!.damageStep).toBe('regular');expect(triggers(s,tifa)).toBe(1);s=settle(s).state;expect(s.extraCombats).toBe(2);expect(s.players.P2!.life).toBe(86);
 });
 it('checks power separately for each double-strike hit',()=>{
  let {s,tifa}=setup(players);const a=big(s);s.temporaryEffects.push({source:tifa,affected:a,keywords:['DoubleStrike']});s=settle(damage(attack(s,[{attacker:a,defender:'P2'}]))).state;s.cards[a]!.counters=4;s=nextStep(s);expect(triggers(s,tifa)).toBe(0);expect(s.extraCombats).toBe(1);
 });
 it('uses power when damage happened, including a creature that dies before trigger processing',()=>{
  let {s,tifa}=setup(players);s.step='combatDamage';s.pending={kind:'priority',player:'P1',passes:0};const a=big(s),ctx={s,ev:[] as GameEvent[]};dealDamage(ctx,a,{kind:'player',player:'P2'},1,true);moveCard(ctx,a,'graveyard');stabilize(ctx);expect(triggers(ctx.s,tifa)).toBe(1);
 });
 it('prevented and noncombat damage never trigger the ability',()=>{
  const {s,tifa}=setup(players),a=big(s),ctx={s,ev:[] as GameEvent[]};s.players.P2!.preventDamageTurn=s.turnNumber;dealDamage(ctx,a,{kind:'player',player:'P2'},7,true);stabilize(ctx);expect(triggers(ctx.s,tifa)).toBe(0);delete s.players.P2!.preventDamageTurn;dealDamage(ctx,a,{kind:'player',player:'P2'},7,false);stabilize(ctx);expect(triggers(ctx.s,tifa)).toBe(0);
 });
 it('a queued trigger resolves after Tifa leaves; countering it instead prevents both effects',()=>{
  for(const countered of [false,true]){
   let {s,tifa}=setup(players);const a=big(s);s=damage(attack(s,[{attacker:a,defender:'P2'}]));
   if(countered){const item=s.stack.find(i=>i.kind==='ability'&&i.source===tifa)!;const counter=put(s,'P1','sublime-epiphany','hand');mana(s,'P1',{U:2,C:4});s=act(s,{type:'CastSpell',player:'P1',card:counter,modes:[1],targets:[{kind:'ability',ability:item.id}]});}
   else moveCard({s,ev:[]},tifa,'graveyard');s=settle(s).state;expect(s.cards[a]!.tapped).toBe(countered);expect(s.extraCombats??0).toBe(countered?0:1);
  }
 });
 it('trampling for one damage still qualifies when the creature has seven power',()=>{
  let {s,tifa}=setup(players);const a=big(s),blocker=put(s,'P2',RAT,'battlefield',{counters:4});s.temporaryEffects.push({source:tifa,affected:a,keywords:['Trample']});s=attack(s,[{attacker:a,defender:'P2'}]);s=nextStep(s);s=act(s,{type:'DeclareBlockers',player:'P2',blocks:[{blocker,attacker:a}]});s=nextStep(s);expect(s.players.P2!.life).toBe(99);expect(triggers(s,tifa)).toBe(1);
 });
 it('extra combats follow consecutively, with no extra main phases or land untaps',()=>{
  let {s}=setup(players);const land=put(s,'P1','island','battlefield',{tapped:true});const attacks=s.turnOrder.filter(p=>p!=='P1').map(defender=>({attacker:big(s),defender}));s=settle(damage(attack(s,attacks))).state;expect(s.cards[land]!.tapped).toBe(true);
  const steps:string[]=[];for(let i=0;i<100&&s.step!=='main2';i++){steps.push(s.step);const p=s.pending;if(p.kind==='declareAttackers')s=act(s,{type:'DeclareAttackers',player:p.player,attacks:[]});else if(p.kind==='priority')s=act(s,{type:'PassPriority',player:p.player});else throw Error(p.kind);}
  expect(s.step).toBe('main2');expect(steps).not.toContain('main1');expect(s.combatsThisTurn).toBe(players);expect(s.cards[land]!.tapped).toBe(true);
 });
 it('another player’s first combat can untap your creatures but cannot grant your extra combat',()=>{
  const {s,tifa}=setup(players),a=big(s);s.activePlayer='P2';s.step='combatDamage';s.pending={kind:'priority',player:'P2',passes:0};s.cards[a]!.tapped=true;const ctx={s,ev:[] as GameEvent[]};dealDamage(ctx,a,{kind:'player',player:'P2'},7,true);stabilize(ctx);const done=settle(ctx.s).state;expect(done.cards[a]!.tapped).toBe(false);expect(done.extraCombats??0).toBe(0);
 });
 it('AI spreads safe melee attacks and retains a lethal attack when available',()=>{
  const {s}=setup(players);put(s,'P1',RAT);put(s,'P1',RAT);const a=basicAi()(s,getLegalActions(s));if(a.type!=='DeclareAttackers')throw Error(a.type);expect(new Set(a.attacks.map(a=>a.defender)).size).toBe(Math.min(players-1,3));s.players.P2!.life=1;const lethal=basicAi()(s,getLegalActions(s));if(lethal.type!=='DeclareAttackers')throw Error(lethal.type);expect(lethal.attacks.every(a=>a.defender==='P2')).toBe(true);
 });
 if(players>2)it('melee still counts an opponent who conceded after attackers were declared',()=>{
  let {s,tifa}=setup(players);const a=put(s,'P1',RAT);s=attack(s,[{attacker:tifa,defender:'P2'},{attacker:a,defender:'P3'}],false);s=act(s,{type:'Concede',player:'P3'});s=settle(s).state;expect(powerOf(s,s.cards[tifa]!)).toBe(6);
 });
});
