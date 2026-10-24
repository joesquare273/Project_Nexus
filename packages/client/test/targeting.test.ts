import { describe, expect, it } from 'vitest';
import { createGame, FREE_FOR_ALL, type Target } from '@nexus/engine';
import { CARD_DEFS } from '@nexus/cards';
import { eventTargetNotices, targetNotice } from '../src/game/targeting.ts';
import { actionDelay } from '../src/game/pacing.ts';
function fixture() {
 return createGame({ format:FREE_FOR_ALL,cardDefs:CARD_DEFS,players:['You','Bot1'].map(id=>({id,deck:Array(30).fill('island')})),seed:1,skipDeckValidation:true }).state;
}
describe('targeting presentation',()=>{
 it('snapshots source, ownership and all real targets after cards leave play',()=>{
  const s=fixture(), source=s.players.Bot1!.hand[0]!, card=s.players.You!.hand[0]!;
  const targets:Target[]=[{kind:'none'},{kind:'player',player:'You'},{kind:'card',card}];
  const n=targetNotice(s,source,'Bot1',targets)!;
  expect(n.controller).toBe('Bot1'); expect(n.source).toBe('Island');
  expect(n.labels).toEqual(['You','You · Island']);
  targets.length=0; delete s.cards[card];
  expect(n.targets).toHaveLength(2); expect(n.labels[1]).toBe('You · Island');
 });
 it('ignores untargeted actions and distinguishes combat participants',()=>{
  const s=fixture(), attacker=s.players.Bot1!.hand[0]!, blocker=s.players.You!.hand[0]!;
  expect(targetNotice(s,attacker,'Bot1',[{kind:'none'}])).toBeNull();
  const notices=eventTargetNotices(s,[{type:'AttackDeclared',attacker,defendingPlayer:'You'},{type:'BlockDeclared',blocker,attacker}]);
  expect(notices[0]!.source).toBe('Island attacks');
  expect(notices[0]!.labels).toEqual(['You']);
  expect(notices[1]!.source).toBe('Island blocks');
  expect(notices[1]!.labels).toEqual(['Bot1 · Island']);
 });
 it('gives targeted resolutions a longer pause at every pace',()=>{
  const events=[{type:'StackItemResolved' as const,item:'x',card:'c',fizzled:false}];
  const action={type:'PassPriority' as const,player:'You'};
  for(const pace of ['normal','slow','fast'] as const) expect(actionDelay(events,action,false,pace,true)).toBeGreaterThan(actionDelay(events,action,false,pace));
  expect(actionDelay(events,action,false,'normal',true)).toBe(3200);
 });
});
