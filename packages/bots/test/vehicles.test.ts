import {describe,expect,it} from 'vitest';
import {activatedAbilities,currentDefinition,getLegalActions,viewFor,type GameState,type Action,type GameEvent} from '@nexus/engine';
import {dealDamage,moveCard,destroy,phaseOut} from '../../engine/src/state.ts';
import {cleanupDamage} from '../../engine/src/turn.ts';
import {stabilize} from '../../engine/src/sba.ts';
import {basicAi} from '../src/index.ts';
import {checkInvariants} from '../src/invariants.ts';
import {act,card,mana,newGame,put,rejected} from './kit-helpers.ts';
const FALCON='the-falcon-airship-restored',SETZER='setzer-wandering-gambler',RAT='undercity-dire-rat';
function finish(s:GameState,accept=true,pick?:string){
 const events:GameEvent[]=[];
 for(let i=0;i<150;i++){
  const p=s.pending;let a:Action|undefined;
  if(p.kind==='decide')a={type:'Decide',player:p.player,accept};
  else if(p.kind==='chooseCards')a={type:'ChooseCards',player:p.player,cards:p.cards.slice(0,p.min)};
  else if(p.kind==='chooseTargets')a=getLegalActions(s).find(a=>a.type==='ChooseTargets' && (!pick||a.targets.some(t=>t.kind==='card'&&t.card===pick)))??getLegalActions(s)[0];
  else if(p.kind==='chooseLegend')a={type:'ChooseLegend',player:p.player,keep:p.cards[0]!};
  else if(p.kind==='commanderZone')a={type:'CommanderZone',player:p.player,toCommand:true};
  else if(p.kind==='priority'&&s.stack.length)a={type:'PassPriority',player:p.player};
  else return {state:s,events};
  const result=(awaitAction(s,a!));s=result.state;events.push(...result.events);
 }throw Error('unfinished '+s.pending.kind);
}
import {applyAction} from '@nexus/engine';
function awaitAction(s:GameState,a:Action){const r=applyAction(s,a);if(!r.ok)throw Error(r.error);return r;}
function vehicle(s:GameState){const ship=put(s,'P1',FALCON),a=put(s,'P1','hero-token','battlefield',{isToken:true,summoningSick:true}),b=put(s,'P1','hero-token','battlefield',{isToken:true,summoningSick:true});return {ship,a,b};}
function crew(s:GameState,id:string,costCards:string[]){return act(s,{type:'ActivateAbility',player:'P1',card:id,ability:activatedAbilities(currentDefinition(s,s.cards[id]!)).findIndex(a=>a.cost.crew!==undefined),costCards,targets:[]});}
function hit(s:GameState,source:string,player='P2',combat=true){const ctx={s,ev:[] as GameEvent[]};dealDamage(ctx,source,{kind:'player',player},1,combat);stabilize(ctx);return ctx.s;}
function castSetzer(s:GameState){const id=put(s,'P1',SETZER,'hand');mana(s,'P1',{B:1,R:1,C:1});return {id,s:finish(act(s,{type:'CastSpell',player:'P1',card:id,targets:[]})).state};}
describe.each([2,3,4])('%i-player Vehicles and precons',players=>{
 it('crew taps other creatures as a cost, including summoning-sick tokens, then animates on resolution',()=>{
  let s=newGame(players);const {ship,a,b}=vehicle(s);s=crew(s,ship,[a,b]);
  expect(s.cards[a]).toMatchObject({zone:'battlefield',tapped:true});expect(s.cards[b]!.tapped).toBe(true);expect(s.cards[ship]!.crewed).toBeUndefined();expect(s.cards[ship]!.tapped).toBe(false);
  s=finish(s).state;expect(currentDefinition(s,s.cards[ship]!).types).toEqual(['artifact','creature']);expect(viewFor(s,'P2').stats[ship]).toMatchObject({power:4,toughness:3});expect(checkInvariants(s)).toEqual([]);
 });
 it('rejects insufficient power, duplicates, tapped creatures, opponents and the Vehicle itself',()=>{
  const s=newGame(players),{ship,a,b}=vehicle(s),enemy=put(s,'P2',RAT);s.cards[b]!.tapped=true;s.cards[ship]!.crewed=true;
  for(const ids of [[a],[a,a],[a,b],[enemy],[ship]])rejected(s,{type:'ActivateAbility',player:'P1',card:ship,ability:1,costCards:ids,targets:[]});
 });
 it('counts modified power, including negative contributions and excess crew',()=>{
  let s=newGame(players);const {ship,a,b}=vehicle(s);s.cards[a]!.counters=1;
  s=finish(crew(s,ship,[a])).state;expect(s.cards[b]!.tapped).toBe(false);
  const bad=newGame(players),v=vehicle(bad);bad.temporaryEffects.push({source:v.ship,affected:v.b,power:-3});
  rejected(bad,{type:'ActivateAbility',player:'P1',card:v.ship,ability:1,costCards:[v.a,v.b],targets:[]});
 });
 it('crew works at instant speed but never removes summoning sickness from a new Vehicle',()=>{
  let s=newGame(players);const {ship,a,b}=vehicle(s);s.cards[ship]!.summoningSick=true;s.step='beginCombat';s=finish(crew(s,ship,[a,b])).state;
  expect(s.cards[ship]!.summoningSick).toBe(true);
  s.step='declareAttackers';s.pending={kind:'declareAttackers',player:'P1'};
  rejected(s,{type:'DeclareAttackers',player:'P1',attacks:[{attacker:ship,defender:'P2'}]});
 });
 it('cleanup ends crew animation; changing zones never carries crew to the new object',()=>{
  let s=newGame(players);const v=vehicle(s);s=finish(crew(s,v.ship,[v.a,v.b])).state;cleanupDamage({s,ev:[]});expect(currentDefinition(s,s.cards[v.ship]!).types).toEqual(['artifact']);
  s.cards[v.ship]!.crewed=true;moveCard({s,ev:[]},v.ship,'graveyard');expect(s.cards[v.ship]!.crewed).toBeUndefined();
 });
 it('a departed and returned Vehicle is not animated by the old crew ability',()=>{
  let s=newGame(players);const v=vehicle(s);s=crew(s,v.ship,[v.a,v.b]);moveCard({s,ev:[]},v.ship,'exile');moveCard({s,ev:[]},v.ship,'battlefield');s=finish(s).state;expect(s.cards[v.ship]!.crewed).toBeUndefined();
 });
 it('destroying a crewed Vehicle triggers creature-death abilities using its old types',()=>{
  let s=newGame(players);const v=vehicle(s);put(s,'P1','morbid-opportunist');s=finish(crew(s,v.ship,[v.a,v.b])).state;const ctx={s,ev:[] as GameEvent[]};destroy(ctx,v.ship);stabilize(ctx);s=finish(ctx.s).state;expect(s.players.P1!.hand).toHaveLength(1);
 });
 it('Setzer creates the exact legendary noncreature Blackjack Vehicle token',()=>{
  const {s}=castSetzer(newGame(players));const token=Object.values(s.cards).find(c=>c.defId==='the-blackjack-token')!;expect(token).toMatchObject({zone:'battlefield',isToken:true});expect(currentDefinition(s,token).types).toEqual(['artifact']);expect(currentDefinition(s,token)).toMatchObject({power:3,toughness:3,crew:2,keywords:['Flying'],supertypes:['Legendary']});
 });
 it('a freshly arrived Setzer can crew Blackjack, which still cannot attack that turn',()=>{
  let {s,id}=castSetzer(newGame(players));const ship=Object.values(s.cards).find(c=>c.defId==='the-blackjack-token')!.id;s=finish(crew(s,ship,[id])).state;expect(s.cards[id]!.tapped).toBe(true);expect(s.cards[ship]!.crewed).toBe(true);expect(s.cards[ship]!.summoningSick).toBe(true);
 });
 it('Vehicle combat damage flips a reproducible coin and only a win creates two tapped Treasures',()=>{
  for(const rngState of [0,1,2,3]){
   let {s}=castSetzer(newGame(players));const ship=put(s,'P1',FALCON,'battlefield',{crewed:true});s.rngState=rngState;
   // Decline Falcon sacrifice so this checks the separate Setzer flip trigger.
   const start=hit(s,ship),a=finish(structuredClone(start),false),b=finish(structuredClone(start),false);
   expect(a.events).toEqual(b.events);const flip=a.events.find(e=>e.type==='CoinFlipped')!;expect(flip).toMatchObject({type:'CoinFlipped',player:'P1'});
   const treasures=Object.values(a.state.cards).filter(c=>c.defId==='treasure-token'&&c.zone==='battlefield');
   expect(treasures).toHaveLength(flip.type==='CoinFlipped'&&flip.won?2:0);expect(treasures.every(c=>c.tapped)).toBe(true);
  }
 });
 it('opponent Vehicles and noncombat damage do not cause Setzer coin flips',()=>{
  let {s}=castSetzer(newGame(players));const enemy=put(s,'P2','the-blackjack-token','battlefield',{crewed:true}),mine=put(s,'P1','the-blackjack-token','battlefield',{crewed:true});
  expect(finish(hit(s,enemy,'P1')).events.some(e=>e.type==='CoinFlipped')).toBe(false);expect(finish(hit(s,mine,'P2',false)).events.some(e=>e.type==='CoinFlipped')).toBe(false);
 });
 it('Falcon can decline its sacrifice and leave its graveyard unchanged',()=>{
  let s=newGame(players);const ship=put(s,'P1',FALCON,'battlefield',{crewed:true}),rat=put(s,'P1',RAT,'graveyard');s=finish(hit(s,ship),false).state;expect(s.cards[ship]!.zone).toBe('battlefield');expect(s.cards[rat]!.zone).toBe('graveyard');
 });
 it('Falcon sacrifices first, then puts a separate targeted reanimation trigger on the stack',()=>{
  let s=newGame(players);const ship=put(s,'P1',FALCON,'battlefield',{crewed:true}),rat=put(s,'P1',RAT,'graveyard');s=hit(s,ship);
  while(s.pending.kind==='priority')s=act(s,{type:'PassPriority',player:s.pending.player});expect(s.pending.kind).toBe('decide');
  s=act(s,{type:'Decide',player:'P1',accept:true});expect(s.pending.kind).toBe('chooseCards');s=act(s,{type:'ChooseCards',player:'P1',cards:[ship]});
  expect(s.cards[ship]!.zone).toBe('graveyard');expect(s.stack.at(-1)).toMatchObject({kind:'ability',targets:[card(rat)],spec:{when:'Reflexive'}});expect(s.cards[rat]!.zone).toBe('graveyard');
  s=finish(s).state;expect(s.cards[rat]).toMatchObject({zone:'battlefield',summoningSick:true});expect(checkInvariants(s)).toEqual([]);
 });
 it('Falcon leaving before the optional sacrifice prevents reanimation, even if the card returns',()=>{
  let s=newGame(players);const ship=put(s,'P1',FALCON,'battlefield',{crewed:true}),rat=put(s,'P1',RAT,'graveyard');s=hit(s,ship);moveCard({s,ev:[]},ship,'exile');moveCard({s,ev:[]},ship,'battlefield');s=finish(s).state;expect(s.cards[ship]!.zone).toBe('battlefield');expect(s.cards[rat]!.zone).toBe('graveyard');
 });
 it('Falcon can activate from the graveyard at instant speed, returning tapped and uncrewed',()=>{
  let s=newGame(players);const ship=put(s,'P1',FALCON,'graveyard');mana(s,'P1',{B:1,C:4});s.step='end';s=act(s,{type:'ActivateAbility',player:'P1',card:ship,ability:0,targets:[]});s=finish(s).state;expect(s.cards[ship]).toMatchObject({zone:'battlefield',tapped:true,summoningSick:true});expect(s.cards[ship]!.crewed).toBeUndefined();
 });
 it('a graveyard activation cannot return a later object after that card leaves and reenters the graveyard',()=>{
  let s=newGame(players);const ship=put(s,'P1',FALCON,'graveyard');mana(s,'P1',{B:1,C:4});s=act(s,{type:'ActivateAbility',player:'P1',card:ship,ability:0,targets:[]});moveCard({s,ev:[]},ship,'exile');moveCard({s,ev:[]},ship,'graveyard');s=finish(s).state;expect(s.cards[ship]!.zone).toBe('graveyard');
 });
 it('countering crew does not refund the tapped creatures',()=>{
  let s=newGame(players);const v=vehicle(s);s=crew(s,v.ship,[v.a,v.b]);const item=s.stack.at(-1)!;
  const counter=put(s,'P1','sublime-epiphany','hand');mana(s,'P1',{U:2,C:4});
  s=finish(act(s,{type:'CastSpell',player:'P1',card:counter,modes:[1],targets:[{kind:'ability',ability:item.id}]})).state;
  expect(s.cards[v.ship]!.crewed).toBeUndefined();expect(s.cards[v.a]!.tapped).toBe(true);expect(s.cards[v.b]!.zone).toBe('battlefield');
 });
 it('countering Falcon’s reflexive trigger leaves the sacrifice paid',()=>{
  let s=newGame(players);const ship=put(s,'P1',FALCON,'battlefield',{crewed:true}),rat=put(s,'P1',RAT,'graveyard');s=hit(s,ship);
  while(s.pending.kind==='priority')s=act(s,{type:'PassPriority',player:s.pending.player});
  s=act(s,{type:'Decide',player:'P1',accept:true});s=act(s,{type:'ChooseCards',player:'P1',cards:[ship]});const item=s.stack.at(-1)!;
  const counter=put(s,'P1','sublime-epiphany','hand');mana(s,'P1',{U:2,C:4});s=finish(act(s,{type:'CastSpell',player:'P1',card:counter,modes:[1],targets:[{kind:'ability',ability:item.id}]})).state;
  expect(s.cards[ship]!.zone).toBe('graveyard');expect(s.cards[rat]!.zone).toBe('graveyard');
 });
 it('the bot crews an old Vehicle instead of repeatedly activating an already crewed one',()=>{
  let s=newGame(players);const v=vehicle(s);const a=basicAi(1)(s,getLegalActions(s));expect(a).toMatchObject({type:'ActivateAbility',card:v.ship,ability:1});s=finish(act(s,a)).state;expect(basicAi(1)(s,getLegalActions(s)).type).toBe('PassPriority');
 });
});
