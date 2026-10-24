import { describe, expect, it } from 'vitest';
import { getLegalActions, viewFor, type GameState } from '@nexus/engine';
import { attach, moveCard } from '../../engine/src/state.ts';
import { stabilize } from '../../engine/src/sba.ts';
import { basicAi, playableCards } from '../src/index.ts';
import { checkInvariants } from '../src/invariants.ts';
import { act, card, mana, newGame, put, rejected, settle } from './kit-helpers.ts';
const NONE={kind:'none'} as const, RAT='undercity-dire-rat';
function setup(players:number) {
 const s=newGame(players), spell=put(s,'P1','unfinished-business','hand'), creature=put(s,'P1',RAT,'graveyard');
 const helm=put(s,'P1','champions-helm','graveyard'), plate=put(s,'P1','darksteel-plate','graveyard');
 mana(s,'P1',{W:2,C:3});return {s,spell,creature,helm,plate};
}
function cast(c:ReturnType<typeof setup>, attachments: string[]=[c.helm,c.plate]) {
 return act(c.s,{type:'CastSpell',player:'P1',card:c.spell,targets:[card(c.creature),...attachments.map(card),...Array(2-attachments.length).fill(NONE)]});
}
describe.each([2,3,4])('%i-player Unfinished Business',players=>{
 it('returns the creature and two distinct Equipment already attached, without equip costs',()=>{
  const c=setup(players), result=settle(cast(c)), s=result.state;
  expect(s.cards[c.creature]).toMatchObject({zone:'battlefield',controller:'P1',summoningSick:true});
  for(const id of [c.helm,c.plate]) expect(s.cards[id]).toMatchObject({zone:'battlefield',attachedTo:c.creature});
  expect(result.events.filter(e=>e.type==='Attached')).toHaveLength(2);
  expect(viewFor(s,'P1').stats[c.creature]!.keywords).toContain('Indestructible');
  expect(s.cards[c.spell]!.zone).toBe('graveyard');expect(checkInvariants(s)).toEqual([]);
 });
 it.each([0,1])('permits %i optional attachment targets',count=>{
  const c=setup(players),s=settle(cast(c,[c.helm,c.plate].slice(0,count))).state;
  expect(s.cards[c.creature]!.zone).toBe('battlefield');
  expect(s.cards[c.helm]!.zone).toBe(count?'battlefield':'graveyard');
 });
 it('requires a creature and rejects opponent graveyards, nonattachments, duplicate optional targets and too many targets',()=>{
  const c=setup(players), opponent=put(c.s,'P2',RAT,'graveyard'), island=put(c.s,'P1','island','graveyard');
  for(const targets of [[NONE,card(c.helm),NONE],[card(opponent),NONE,NONE],[card(c.creature),card(island),NONE],[card(c.creature),card(c.helm),card(c.helm)],[card(c.creature),card(c.helm),card(c.plate),NONE]])
   rejected(c.s,{type:'CastSpell',player:'P1',card:c.spell,targets});
 });
 it('returns remaining legal attachments when another is removed before resolution',()=>{
  const c=setup(players);let s=cast(c);moveCard({s,ev:[]},c.plate,'exile');s=settle(s).state;
  expect(s.cards[c.plate]!.zone).toBe('exile');expect(s.cards[c.helm]!.attachedTo).toBe(c.creature);
 });
 it('returns Equipment unattached when the creature target becomes illegal',()=>{
  const c=setup(players);let s=cast(c);moveCard({s,ev:[]},c.creature,'exile');s=settle(s).state;
  for(const id of [c.helm,c.plate]){expect(s.cards[id]!.zone).toBe('battlefield');expect(s.cards[id]!.attachedTo).toBeUndefined();}
 });
 it('does not resolve when the only chosen target became illegal, even with omitted optional targets',()=>{
  const c=setup(players);let s=cast(c,[]);moveCard({s,ev:[]},c.creature,'exile');const result=settle(s);
  expect(result.events).toContainEqual(expect.objectContaining({type:'StackItemResolved',card:c.spell,fizzled:true}));
 });
 it('does not mistake a card that left and reentered the graveyard for its old targeted object',()=>{
  const c=setup(players);let s=cast(c);const ctx={s,ev:[]};moveCard(ctx,c.creature,'exile');moveCard(ctx,c.creature,'graveyard');moveCard(ctx,c.plate,'exile');moveCard(ctx,c.plate,'graveyard');s=settle(s).state;
  expect(s.cards[c.creature]!.zone).toBe('graveyard');expect(s.cards[c.plate]!.zone).toBe('graveyard');expect(s.cards[c.helm]!.zone).toBe('battlefield');expect(s.cards[c.helm]!.attachedTo).toBeUndefined();
 });
 it('returns a legally enchanting Aura but leaves an opponent-only Aura in the graveyard',()=>{
  const c=setup(players), eye=put(c.s,'P1','eye-of-nidhogg','graveyard'), stasis=put(c.s,'P1','observed-stasis','graveyard');
  const s=settle(cast(c,[eye,stasis])).state;
  expect(s.cards[eye]).toMatchObject({zone:'battlefield',attachedTo:c.creature});expect(s.cards[stasis]!.zone).toBe('graveyard');
 });
 it('leaves Auras in the graveyard if the creature cannot return',()=>{
  const c=setup(players),eye=put(c.s,'P1','eye-of-nidhogg','graveyard');let s=cast(c,[eye,c.helm]);moveCard({s,ev:[]},c.creature,'exile');s=settle(s).state;
  expect(s.cards[eye]!.zone).toBe('graveyard');expect(s.cards[c.helm]!.zone).toBe('battlefield');
 });
 it('attaches to a creature with shroud: attachment does not target that battlefield object',()=>{
  const c=setup(players);const s=settle(cast(c,[put(c.s,'P1','lightning-greaves','graveyard'),c.helm])).state;
  expect(s.cards[c.helm]!.attachedTo).toBe(c.creature);expect(viewFor(s,'P1').stats[c.creature]!.keywords).toContain('Shroud');
 });
 it('finishes all returns before state-based actions, allowing Equipment to save a zero-toughness creature',()=>{
  const c=setup(players);c.s.cardDefs={...c.s.cardDefs,[RAT]:{...c.s.cardDefs[RAT]!,toughness:0}};
  const s=settle(cast(c,[c.helm])).state;expect(s.cards[c.creature]!.zone).toBe('battlefield');expect(s.cards[c.helm]!.attachedTo).toBe(c.creature);
 });
 it('returns creature Equipment unattached because creatures cannot equip other creatures',()=>{
  const c=setup(players);c.s.cardDefs={...c.s.cardDefs,'champions-helm':{...c.s.cardDefs['champions-helm']!,types:['artifact','creature'],power:1,toughness:1}};
  const s=settle(cast(c,[c.helm])).state;expect(s.cards[c.helm]!.zone).toBe('battlefield');expect(s.cards[c.helm]!.attachedTo).toBeUndefined();
 });
 it('queues ordinary entry triggers after all attachments are in place',()=>{
  const c=setup(players);c.s.cardDefs={...c.s.cardDefs,[RAT]:{...c.s.cardDefs[RAT]!,triggers:[{when:'EntersBattlefield',effects:[{effect:'DrawCards',target:'You',amount:1}]}]}};
  const s=settle(cast(c)).state;expect(s.players.P1!.hand).toHaveLength(1);expect(s.cards[c.helm]!.attachedTo).toBe(c.creature);
 });
 it('the bot can discover and cast the exact spell with attachment targets',()=>{
  const c=setup(players);expect(playableCards(c.s,'P1').some(p=>p.card===c.spell)).toBe(true);
  const a=basicAi(1)(c.s,getLegalActions(c.s));expect(a.type).toBe('CastSpell');
  const s=settle(act(c.s,a)).state;expect(s.cards[c.creature]!.zone).toBe('battlefield');
 });
 it('puts an Aura in the graveyard when its host leaves; Equipment stays on the battlefield',()=>{
  const c=setup(players),eye=put(c.s,'P1','eye-of-nidhogg','graveyard');let s=settle(cast(c,[eye,c.helm])).state;
  const ctx={s,ev:[]};moveCard(ctx,c.creature,'exile');stabilize(ctx);s=ctx.s;
  expect(s.cards[eye]!.zone).toBe('graveyard');expect(s.cards[c.helm]!.zone).toBe('battlefield');expect(s.cards[c.helm]!.attachedTo).toBeUndefined();
 });
 it('reevaluates an Aura enchant restriction after the host changes controller',()=>{
  const s=newGame(players), host=put(s,'P2',RAT), aura=put(s,'P1','observed-stasis');attach({s,ev:[]},aura,host);
  s.cards[host]!.controller='P1';const ctx={s,ev:[]};stabilize(ctx);expect(ctx.s.cards[aura]!.zone).toBe('graveyard');
 });
});
