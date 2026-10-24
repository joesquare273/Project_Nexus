import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions, viewFor, type GameState, type GameEvent, type Action } from '@nexus/engine';
import { becomeMonarch, dealDamage, moveCard } from '../../engine/src/state.ts';
import { enterStep } from '../../engine/src/turn.ts';
import { stabilize } from '../../engine/src/sba.ts';
import { playableCards, basicAi } from '../src/index.ts';
import { checkInvariants } from '../src/invariants.ts';
import { act, card, mana, newGame, put, rejected } from './kit-helpers.ts';
const RAT='undercity-dire-rat';
function finish(s:GameState, bottom?:string, opponent?:string):GameState {
  for(let n=0;n<150;n++){
    const p=s.pending;let a:Action|undefined;
    if(p.kind==='chooseOpponent')a={type:'ChooseOpponent',player:p.player,opponent:opponent??p.opponents[0]!};
    else if(p.kind==='chooseCards')a={type:'ChooseCards',player:p.player,cards:[bottom&&p.cards.includes(bottom)?bottom:p.cards[0]!]};
    else if(p.kind==='chooseTargets')a=getLegalActions(s)[0];
    else if(p.kind==='commanderZone')a={type:'CommanderZone',player:p.player,toCommand:true};
    else if(p.kind==='surveil')a={type:'Surveil',player:p.player,toGraveyard:false};
    else if(p.kind==='priority'&&s.stack.length)a={type:'PassPriority',player:p.player};
    else return s;
    s=act(s,a!);
  }
  throw Error('did not finish');
}
function until(s:GameState, kind:GameState['pending']['kind']):GameState {
  for(let n=0;n<30;n++){
    if(s.pending.kind===kind)return s;
    if(s.pending.kind!=='priority')throw Error('unexpected '+s.pending.kind);
    s=act(s,{type:'PassPriority',player:s.pending.player});
  }
  throw Error('not reached '+kind);
}
function crown(s:GameState,player:string):GameState { const ctx={s,ev:[] as GameEvent[]};becomeMonarch(ctx,player);stabilize(ctx);return ctx.s; }
function damage(s:GameState,source:string,victim:string,combat=true):GameState {const ctx={s,ev:[] as GameEvent[]};dealDamage(ctx,source,{kind:'player',player:victim},1,combat);stabilize(ctx);return ctx.s;}
function jailer(s:GameState):{s:GameState;id:string}{const id=put(s,'P1','palace-jailer','hand');mana(s,'P1',{W:2,C:2});return {s:act(s,{type:'CastSpell',player:'P1',card:id,targets:[]}),id};}
function coin(s:GameState):{s:GameState;id:string;a:string;b:string}{
  const id=put(s,'P1','coin-of-fate'),a=put(s,'P1',RAT,'graveyard'),b=put(s,'P1','helitrooper','graveyard');mana(s,'P1',{W:1,C:3});
  return {s,id,a,b};
}
function activate(c:ReturnType<typeof coin>):GameState{return act(c.s,{type:'ActivateAbility',player:'P1',card:c.id,ability:0,costCards:[c.a,c.b],targets:[]});}

describe.each([2,3,4])('%i-player monarch and precons',players=>{
  it('starts without a monarch; Palace Jailer creates the designation and exiles an opposing creature',()=>{
    let s=newGame(players);expect(s.monarch).toBeUndefined();const victim=put(s,'P2',RAT);
    const cast=jailer(s);s=finish(cast.s);
    expect(s.monarch).toBe('P1');expect(viewFor(s,'P2').monarch).toBe('P1');expect(s.cards[victim]!.zone).toBe('exile');
    expect(checkInvariants(s)).toEqual([]);
  });
  it('Palace Jailer still makes you monarch with no exile target',()=>{const c=jailer(newGame(players));expect(finish(c.s).monarch).toBe('P1');});
  it('Jailer leaving before its exile trigger resolves does not stop exile or end the monarchy',()=>{
    let s=newGame(players);const victim=put(s,'P2',RAT);const c=jailer(s);s=c.s;
    while(s.stack.some(i=>i.kind==='spell')){if(s.pending.kind!=='priority')throw Error(s.pending.kind);s=act(s,{type:'PassPriority',player:s.pending.player});}
    moveCard({s,ev:[]},c.id,'graveyard');s=finish(s);expect(s.cards[victim]!.zone).toBe('exile');expect(s.monarch).toBe('P1');
    s=crown(s,'P2');expect(s.cards[victim]!.zone).toBe('battlefield');
  });
  it('an opponent becoming monarch returns the exile, while the original controller retaining monarchy does not',()=>{
    let s=newGame(players);const victim=put(s,'P2',RAT);s=finish(jailer(s).s);
    s=crown(s,'P1');expect(s.cards[victim]!.zone).toBe('exile');
    s=crown(s,'P2');expect(s.cards[victim]!.zone).toBe('battlefield');expect(s.cards[victim]!.controller).toBe('P2');expect(s.cards[victim]!.summoningSick).toBe(true);
  });
  it('an opponent who is already monarch does not immediately release the Jailer exile',()=>{
    let s=crown(newGame(players),'P2');const victim=put(s,'P2',RAT),c=jailer(s);s=c.s;
    while(s.stack.some(i=>i.kind==='spell')){if(s.pending.kind!=='priority')throw Error(s.pending.kind);s=act(s,{type:'PassPriority',player:s.pending.player});}
    const king=s.stack.find(i=>i.kind==='ability'&&i.source===c.id&&i.ability===0)!;
    const counter=put(s,'P1','sublime-epiphany','hand');mana(s,'P1',{U:2,C:4});
    s=act(s,{type:'CastSpell',player:'P1',card:counter,modes:[1],targets:[{kind:'ability',ability:king.id}]});s=finish(s);
    expect(s.monarch).toBe('P2');expect(s.cards[victim]!.zone).toBe('exile');
    s=crown(s,'P2');expect(s.cards[victim]!.zone).toBe('exile');s=crown(s,'P1');s=crown(s,'P2');expect(s.cards[victim]!.zone).toBe('battlefield');
  });
  it('tokens and commanders moved out of exile are never resurrected by the Jailer watcher',()=>{
    for(const commander of [false,true]){
      let s=newGame(players);const victim=put(s,'P2',commander?'cloud-ex-soldier':'hero-token','battlefield',commander?{isCommander:true}:{isToken:true});
      s=finish(jailer(s).s);expect(s.cards[victim]!.zone).toBe(commander?'command':'void');s=crown(s,'P2');expect(s.cards[victim]!.zone).toBe(commander?'command':'void');
    }
  });
  it('the monarch draws at their own end step, using a source-less, counterable stack ability',()=>{
    let s=crown(newGame(players),'P1');const ctx={s,ev:[] as GameEvent[]};enterStep(ctx,'end');stabilize(ctx);s=ctx.s;
    expect(s.stack.at(-1)).toMatchObject({kind:'ability',rule:'monarch',source:'@monarch',controller:'P1'});
    expect(s.cards['@monarch']).toBeUndefined();expect(checkInvariants(s)).toEqual([]);
    s=crown(s,'P2');s=finish(s);expect(s.players.P1!.hand).toHaveLength(1);expect(s.monarch).toBe('P2');
  });
  it('noncombat damage never transfers monarchy; combat transfer waits on the stack',()=>{
    let s=crown(newGame(players),'P1');const attacker=put(s,'P2',RAT);
    s=damage(s,attacker,'P1',false);expect(s.stack).toHaveLength(0);expect(s.monarch).toBe('P1');
    s=damage(s,attacker,'P1');expect(s.monarch).toBe('P1');expect(s.stack.at(-1)).toMatchObject({rule:'monarch',controller:'P1'});
    s=finish(s);expect(s.monarch).toBe('P2');expect(checkInvariants(s)).toEqual([]);
  });
  it('the creature current controller receives the crown; leaving uses its last known controller',()=>{
    for(const leave of [false,true]){
      let s=crown(newGame(players),'P1');const attacker=put(s,'P1',RAT);s.cards[attacker]!.controller='P2';
      s=damage(s,attacker,'P1');if(leave)moveCard({s,ev:[]},attacker,'graveyard');else s.cards[attacker]!.controller='P1';
      s=finish(s);expect(s.monarch).toBe(leave?'P2':'P1');
    }
  });
  it('the combat-transfer ability can be countered without changing the monarch',()=>{
    let s=crown(newGame(players),'P1');const attacker=put(s,'P2',RAT);s=damage(s,attacker,'P1');const ability=s.stack.at(-1)!;
    const spell=put(s,'P1','sublime-epiphany','hand');mana(s,'P1',{U:2,C:4});
    s=act(s,{type:'CastSpell',player:'P1',card:spell,modes:[1],targets:[{kind:'ability',ability:ability.id}]});s=finish(s);
    expect(s.monarch).toBe('P1');
  });
  it('Coin of Fate enters with surveil 1',()=>{
    let s=newGame(players);const id=put(s,'P1','coin-of-fate','hand');mana(s,'P1',{W:1,C:1});s=act(s,{type:'CastSpell',player:'P1',card:id,targets:[]});
    s=until(s,'surveil');const top=s.players.P1!.library[0]!;s=act(s,{type:'Surveil',player:'P1',toGraveyard:true});expect(s.cards[top]!.zone).toBe('graveyard');
  });
  it('Coin costs mana, tapping, two distinct creature cards and sacrifice before resolution',()=>{
    const c=coin(newGame(players));const original=JSON.stringify(c.s);const s=activate(c);
    expect(JSON.stringify(c.s)).toBe(original);expect(s.cards[c.id]!.zone).toBe('graveyard');expect([s.cards[c.a]!.zone,s.cards[c.b]!.zone]).toEqual(['exile','exile']);
    expect(s.players.P1!.manaPool.W+s.players.P1!.manaPool.C).toBe(0);expect(s.monarch).toBeUndefined();expect(s.stack).toHaveLength(1);
    expect(playableCards(c.s,'P1').some(p=>p.card===c.id&&p.kind==='ability')).toBe(true);
  });
  it('Coin rejects duplicates, noncreatures, opponents cards and insufficient mana without mutating its input',()=>{
    const c=coin(newGame(players));const land=put(c.s,'P1','island','graveyard'),other=put(c.s,'P2',RAT,'graveyard');
    for(const costCards of [[c.a,c.a],[c.a,land],[c.a,other],[c.a]]){
      const before=JSON.stringify(c.s);expect(rejected(c.s,{type:'ActivateAbility',player:'P1',card:c.id,ability:0,costCards,targets:[]})).toMatch(/distinct/);expect(JSON.stringify(c.s)).toBe(before);
    }
    c.s.players.P1!.manaPool.W=0;expect(applyAction(c.s,{type:'ActivateAbility',player:'P1',card:c.id,ability:0,costCards:[c.a,c.b],targets:[]}).ok).toBe(false);
  });
  it('Coin lets the selected opponent bottom one card, reanimates the other tapped, then grants monarchy',()=>{
    const c=coin(newGame(players));let s=activate(c);s=until(s,players>2?'chooseOpponent':'chooseCards');
    if(players>2){expect(rejected(s,{type:'ChooseOpponent',player:'P1',opponent:'P1'})).toMatch(/opponent/);s=act(s,{type:'ChooseOpponent',player:'P1',opponent:'P3'});}
    expect(s.pending).toMatchObject({kind:'chooseCards',purpose:'fateBottom',player:players>2?'P3':'P2'});
    expect(s.monarch).toBeUndefined();s=finish(s,c.b);expect(s.cards[c.b]!.zone).toBe('library');expect(s.players.P1!.library.at(-1)).toBe(c.b);
    expect(s.cards[c.a]!.zone).toBe('battlefield');expect(s.cards[c.a]!.tapped).toBe(true);expect(s.monarch).toBe('P1');expect(checkInvariants(s)).toEqual([]);
  });
  it('countering Coin ability does not refund exile or sacrifice costs, and grants no monarchy',()=>{
    const c=coin(newGame(players));let s=activate(c),ability=s.stack.at(-1)!;const counter=put(s,'P1','sublime-epiphany','hand');mana(s,'P1',{U:2,C:4});
    s=act(s,{type:'CastSpell',player:'P1',card:counter,modes:[1],targets:[{kind:'ability',ability:ability.id}]});s=finish(s);
    expect(s.cards[c.id]!.zone).toBe('graveyard');expect(s.cards[c.a]!.zone).toBe('exile');expect(s.cards[c.b]!.zone).toBe('exile');expect(s.monarch).toBeUndefined();
  });
  it('Coin does not reuse a cost-exiled card that left exile and returned as a new object',()=>{
    const c=coin(newGame(players));let s=activate(c);moveCard({s,ev:[]},c.a,'graveyard');moveCard({s,ev:[]},c.a,'exile');s=finish(s);
    expect(s.cards[c.a]!.zone).toBe('exile');expect(s.cards[c.b]!.zone).toBe('library');expect(s.monarch).toBe('P1');
  });
  it('Coin still grants monarchy when neither exiled object remains available',()=>{
    const c=coin(newGame(players));let s=activate(c);moveCard({s,ev:[]},c.a,'hand');moveCard({s,ev:[]},c.b,'hand');s=finish(s);expect(s.monarch).toBe('P1');expect(s.cards[c.a]!.zone).toBe('hand');
  });
  it('AI makes a legal bottom-card choice and keeps the stronger card away from reanimation',()=>{
    const c=coin(newGame(players));c.b=put(c.s,'P1','cloud-ex-soldier','graveyard');let s=activate(c);s=until(s,players>2?'chooseOpponent':'chooseCards');if(players>2)s=act(s,getLegalActions(s)[0]!);
    const a=basicAi(1)(s,getLegalActions(s));expect(a).toMatchObject({type:'ChooseCards',cards:[c.b]});s=act(s,a);expect(s.monarch).toBe('P1');
  });
  if(players>2){
    it('an eliminated monarch passes the crown to the active player, without resolving their old combat trigger',()=>{
      let s=crown(newGame(players),'P2');s.players.P2!.life=1;const attacker=put(s,'P3',RAT);s=damage(s,attacker,'P2');expect(s.players.P2!.eliminated).toBe(true);expect(s.monarch).toBe('P1');
      expect(s.stack.some(i=>i.kind==='ability'&&i.rule==='monarch')).toBe(false);expect(checkInvariants(s)).toEqual([]);
    });
    it('if the monarch leaves on their own turn, the next living player receives the crown',()=>{
      let s=crown(newGame(players),'P1');s=act(s,{type:'Concede',player:'P1'});expect(s.monarch).toBe('P2');expect(checkInvariants(s)).toEqual([]);
    });
    it('if the selected opponent concedes before the Coin choice, a remaining opponent chooses instead',()=>{
      const c=coin(newGame(players));let s=activate(c);s=until(s,'chooseOpponent');s=act(s,{type:'ChooseOpponent',player:'P1',opponent:'P2'});s=act(s,{type:'Concede',player:'P2'});
      s=finish(s,c.a,'P3');expect(s.cards[c.a]!.zone).toBe('library');expect(s.cards[c.b]!.zone).toBe('battlefield');expect(s.monarch).toBe('P1');expect(checkInvariants(s)).toEqual([]);
    });
  }
});
