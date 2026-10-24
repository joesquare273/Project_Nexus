import {describe,expect,it} from 'vitest';
import {act,newGame,passAll,put} from './helpers.ts';
function damage(players:number,kind='duelist'){
 let s=newGame(players);const first=put(s,'P1',kind),ordinary=put(s,'P1','bear');
 s.step='declareBlockers';s.pending={kind:'priority',player:'P1',passes:0};s.combat={attacks:[{attacker:first,defender:'P2'},{attacker:ordinary,defender:'P2'}],blocks:[],blockersPending:[]};s=passAll(s).state;return {s,first,ordinary};
}
describe.each([2,3,4])('%i-player first-strike priority',players=>{
 it('grants priority after first-strike damage and before normal attackers deal damage',()=>{
  const {s}=damage(players);expect(s.combat!.damageStep).toBe('first');expect(s.pending).toMatchObject({kind:'priority',player:'P1'});expect(s.players.P2!.life).toBe(18);const next=passAll(s).state;expect(next.combat!.damageStep).toBe('regular');expect(next.players.P2!.life).toBe(16);
 });
 it('gaining first strike after the first damage step does not prevent normal damage',()=>{
  const {s,ordinary}=damage(players);s.cardDefs={...s.cardDefs,bear:{...s.cardDefs.bear!,keywords:['FirstStrike']}};expect(passAll(s).state.players.P2!.life).toBe(16);expect(s.cards[ordinary]!.zone).toBe('battlefield');
 });
 it('losing first strike after dealing first-strike damage does not allow a second hit',()=>{
  const {s}=damage(players);s.cardDefs={...s.cardDefs,duelist:{...s.cardDefs.duelist!,keywords:[]}};expect(passAll(s).state.players.P2!.life).toBe(16);
 });
 it('losing double strike before regular damage prevents the second hit',()=>{
  const {s}=damage(players,'twinblade');s.cardDefs={...s.cardDefs,twinblade:{...s.cardDefs.twinblade!,keywords:[]}};expect(passAll(s).state.players.P2!.life).toBe(16);
 });
 it('an instant can remove a double striker between its hits',()=>{
  let {s,first}=damage(players,'twinblade');const spell=put(s,'P1','murder','hand');s.players.P1!.manaPool.B=1;s.players.P1!.manaPool.C=1;s=act(s,{type:'CastSpell',player:'P1',card:spell,targets:[{kind:'card',card:first}]}).state;s=passAll(s).state;expect(s.cards[first]!.zone).toBe('graveyard');s=passAll(s).state;expect(s.combat!.damageStep).toBe('regular');expect(s.players.P2!.life).toBe(16);
 });
});
