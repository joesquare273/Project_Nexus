import {describe,expect,it} from 'vitest';
import {applyAction,cardsToBottom,getLegalActions,type GameState} from '@nexus/engine';
import {basicAi,randomBot} from '../src/index.ts';
import {newGame,put} from './kit-helpers.ts';
const B='swamp',U='island',G='forest',RAT='undercity-dire-rat',BIG=['archfiend-of-depravity','flayer-of-the-hatebound','rise-of-the-dark-realms','sepulchral-primordial'];
function fixture(players:number,names:string[],taken=0){const s=newGame(players);for(const name of names)put(s,'P1',name,'hand');s.pending={kind:'mulligan',player:'P1',taken,queue:[]};return s;}
function keep(s:GameState,bot=basicAi()){const a=bot(s,getLegalActions(s));expect(a.type).toBe('Mulligan');return a.type==='Mulligan'&&a.keep;}
for(const players of [2,3,4])describe(players+'-player opening policy',()=>{
 for(const [label,bot] of [['basic',basicAi],['random',randomBot]] as const){
  it(label+' keeps three lands with castable early spells',()=>expect(keep(fixture(players,[B,B,B,RAT,'reanimate',...BIG.slice(0,2)]),bot(1))).toBe(true));
  it(label+' keeps four lands with a useful early curve',()=>expect(keep(fixture(players,[B,B,B,B,RAT,'reanimate',BIG[0]!]),bot(1))).toBe(true));
  it(label+' redraws zero/one-land, flooded and color-locked hands',()=>{
   for(const hand of [[...BIG,...BIG.slice(0,3)],[B,...BIG,...BIG.slice(0,2)],[B,B,B,B,B,B,RAT],[U,U,U,RAT,'reanimate',...BIG.slice(0,2)]])expect(keep(fixture(players,hand),bot(1))).toBe(false);
  });
  it(label+' does not blindly keep a bad hand after two mulligans',()=>expect(keep(fixture(players,[U,...BIG,...BIG.slice(0,2)],2),bot(1))).toBe(false));
 }
 it('keeps two lands with multiple affordable early plays',()=>expect(keep(fixture(players,[B,B,RAT,'reanimate',...BIG.slice(0,3)]))).toBe(true));
 it('redraws a weak two-land hand with only one cheap play',()=>expect(keep(fixture(players,[B,B,RAT,...BIG]))).toBe(false));
 it('keeps two lands plus affordable Sol Ring and a four-mana follow-up',()=>expect(keep(fixture(players,[B,B,'sol-ring','solemn-simulacrum',...BIG.slice(0,3)]))).toBe(true));
 it('does not mistake an Equipment-only mana source for unrestricted ramp',()=>{
  const s=fixture(players,[B,B,'mind-stone','solemn-simulacrum',...BIG.slice(0,3)]);s.cardDefs={...s.cardDefs,'mind-stone':{...s.cardDefs['mind-stone']!,manaAbility:{onlyForEquipment:true}}};expect(keep(s)).toBe(false);
 });
 it('recognizes a castable rock that fixes the follow-up spell’s missing color',()=>expect(keep(fixture(players,[G,G,'talisman-of-dominance',RAT,...BIG.slice(0,3)]))).toBe(true));
 it('recognizes affordable land ramp only when a matching search target supports the hand',()=>{
  const s=fixture(players,[G,G,'rampant-growth',RAT,...BIG.slice(0,3)]);expect(keep(s)).toBe(false);put(s,'P1',B,'library');expect(keep(s)).toBe(true);
 });
 it('recognizes a cheap land-search artifact and its affordable activation',()=>{
  const s=fixture(players,[G,G,'wayfarers-bauble',RAT,...BIG.slice(0,3)]);put(s,'P1',B,'library');expect(keep(s)).toBe(true);
 });
 it('does not count uncastable ramp as mana support',()=>expect(keep(fixture(players,[B,B,'rampant-growth','solemn-simulacrum',...BIG.slice(0,3)]))).toBe(false));
 it('does not count conditional lands that cannot yet produce mana',()=>expect(keep(fixture(players,['temple-of-the-false-god','temple-of-the-false-god','temple-of-the-false-god','mind-stone',...BIG.slice(0,3)]))).toBe(false));
 it('does not treat unbuilt noncreature cards as early plays',()=>{const s=fixture(players,[B,B,B,'eye-of-nidhogg',...BIG.slice(0,3)]);s.cardDefs={...s.cardDefs,'eye-of-nidhogg':{...s.cardDefs['eye-of-nidhogg']!,notBuilt:true}};expect(keep(s)).toBe(false);});
 it('includes an accessible commander in the opening plan',()=>{
  const s=fixture(players,['plains',U,G,...BIG]);s.format={...s.format,commander:true};put(s,'P1','tidus-yunas-guardian','command',{isCommander:true});expect(keep(s)).toBe(true);
 });
 it('bottoms surplus lands while preserving three lands and cheap spells',()=>{
  const s=fixture(players,[B,B,B,B,RAT,'reanimate',BIG[0]!]);s.pending={kind:'bottomCards',player:'P1',count:1,queue:[]};const a=basicAi()(s,getLegalActions(s));expect(a.type).toBe('BottomCards');
  if(a.type!=='BottomCards')return;expect(s.cards[a.cards[0]!]!.defId).toBe(B);const r=applyAction(s,a);expect(r.ok).toBe(true);
 });
 it('bottoms the expensive spell instead of breaking a three-land hand',()=>{
  const s=fixture(players,[B,B,B,RAT,'reanimate','rise-of-the-dark-realms','sepulchral-primordial']);s.pending={kind:'bottomCards',player:'P1',count:1,queue:[]};const a=basicAi()(s,getLegalActions(s));expect(a.type).toBe('BottomCards');if(a.type==='BottomCards')expect(s.cards[a.cards[0]!]!.defId).toBe('rise-of-the-dark-realms');
 });
 it('keeps a two-land ramp plan intact when bottoming',()=>{
  const s=fixture(players,[B,B,'sol-ring','solemn-simulacrum',...BIG.slice(0,3)]);s.pending={kind:'bottomCards',player:'P1',count:1,queue:[]};const a=basicAi()(s,getLegalActions(s));expect(a.type).toBe('BottomCards');if(a.type==='BottomCards')expect(a.cards.map(id=>s.cards[id]!.defId).every(id=>BIG.includes(id))).toBe(true);
 });
 it('evaluates the final retained hand after paid mulligans, not the drawn seven',()=>{
  const taken=players>2?4:3;const s=fixture(players,[B,B,B,RAT,...BIG.slice(0,3)],taken);expect(cardsToBottom(s,taken)).toBe(3);expect(keep(s)).toBe(true);
  s.pending={kind:'bottomCards',player:'P1',count:3,queue:[]};const a=basicAi()(s,getLegalActions(s));if(a.type!=='BottomCards')throw Error(a.type);const retained=s.players.P1!.hand.filter(id=>!a.cards.includes(id));expect(retained.filter(id=>s.cards[id]!.defId===B)).toHaveLength(3);expect(retained.some(id=>s.cards[id]!.defId===RAT)).toBe(true);
 });
 it('uses the free multiplayer mulligan and eventually obeys the legal keep limit',()=>{
  const s=fixture(players,[B,...BIG,...BIG.slice(0,2)]);expect(keep(s)).toBe(false);
  const legal=[{type:'Mulligan' as const,player:'P1',keep:true}];expect(basicAi()(s,legal)).toEqual(legal[0]);
 });
 it('does not mutate state or depend on library order or opposing hidden hands',()=>{
  const s=fixture(players,[G,G,'rampant-growth',RAT,...BIG.slice(0,3)]);put(s,'P1',B,'library');const original=structuredClone(s),a=basicAi()(s,getLegalActions(s));expect(s).toEqual(original);
  s.players.P1!.library.reverse();for(let i=0;i<7;i++)put(s,'P2',i%2?U:'sol-ring','hand');expect(basicAi()(s,getLegalActions(s))).toEqual(a);
 });
});
