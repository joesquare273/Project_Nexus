// Opening decisions use this hand, public commanders and known land-search targets.
// Future draw positions and opposing hidden cards never enter the evaluation.
import {cardsToBottom,matchesObject,manaValue,parseManaCost,reduceGeneric,manaChoices,currentDefinition,type Action,type GameState,type InstanceId,type ManaCost} from '@nexus/engine';
import {planTaps} from './mana.ts';

function cost(s:GameState,id:string):ManaCost {
  const c=parseManaCost(s.cardDefs[s.cards[id]!.defId]!.manaCost);
  return {...c,generic:c.generic+(c.x??0)}; // X=1 gives an X spell a meaningful first use.
}
function combinations<T>(items:T[],count:number):T[][] {
  const out:T[][]=[];
  const visit=(at:number,chosen:T[])=>{
    if(chosen.length===count){out.push(chosen);return;}
    for(let i=at;i<=items.length-(count-chosen.length);i++)visit(i+1,[...chosen,items[i]!]);
  };
  visit(0,[]);return out;
}
function board(s:GameState,me:string,hand:string[],lands:string[],ramp?:string):GameState {
  const permanents=[...lands,...(ramp?[ramp]:[])],cards={...s.cards};
  for(const id of permanents)cards[id]={...cards[id]!,zone:'battlefield',controller:me,tapped:false,summoningSick:false};
  const pool={W:0,U:0,B:0,R:0,G:0,C:0};
  return {...s,cards,temporaryEffects:[],players:{...s.players,[me]:{...s.players[me]!,hand:hand.filter(id=>!permanents.includes(id)),battlefield:permanents,manaPool:pool,equipmentMana:{...pool},creatureScryMana:[]}}};
}
interface Assessment {score:number;workable:boolean;lands:number;plays:number}
function assess(s:GameState,me:string,hand:InstanceId[]):Assessment {
  const def=(id:string)=>currentDefinition(s,s.cards[id]!);
  const lands=hand.filter(id=>def(id).types.includes('land'));
  const spells=hand.filter(id=>!lands.includes(id) && !def(id).token && (!def(id).notBuilt||def(id).types.includes('creature')));
  const commanders=s.format.commander?Object.values(s.cards).filter(c=>c.owner===me&&c.isCommander).map(c=>c.id):[];
  const candidates=[...spells,...commanders];
  let best:Assessment={score:-1000,workable:false,lands:lands.length,plays:0};
  // Evaluate color access with at most four actual land drops, after untapping.
  // Conditional mana sources still use the real mana planner.
  for(const sources of combinations(lands,Math.min(4,lands.length))){
    const v=board(s,me,hand,sources);
    const affordable=(id:string,discount=0)=>planTaps(v,me,reduceGeneric(cost(s,id),discount))!==null;
    const early=candidates.filter(id=>manaValue(cost(s,id))<=3&&affordable(id));
    const soon=candidates.filter(id=>manaValue(cost(s,id))<=4&&affordable(id,lands.length===3?1:0));
    let rampPlan=false;
    if(lands.length===2){
      for(const id of spells.filter(id=>manaValue(cost(s,id))<=2&&affordable(id))){
        const d=def(id),ramped=board(s,me,hand,sources,id);
        const manaSource=!d.manaAbility?.onlyForEquipment && manaChoices(ramped,ramped.cards[id]!).length>0;
        const searches=[...(d.effects??[]),...(d.activated??[]).filter(a=>planTaps(v,me,a.cost.mana)!==null).flatMap(a=>a.effects)].filter(e=>e.effect==='SearchLibraryToBattlefield');
        // Deduplicate and sort the known remaining land cards: never use draw order.
        const targets=[...new Set(s.players[me]!.library.map(k=>s.cards[k]!.defId))].sort().flatMap(defId=>{
          const target=s.players[me]!.library.find(k=>s.cards[k]!.defId===defId)!;
          return def(target).types.includes('land') && searches.some(e=>matchesObject(s,e.filter,s.cards[target]!,{controller:me,source:id})) ? [target] : [];
        });
        rampPlan=candidates.some(other=>other!==id && manaValue(cost(s,other))<=4 && ((manaSource && planTaps(ramped,me,cost(s,other))!==null) || targets.some(target=>planTaps(board(s,me,hand,[...sources,target]),me,cost(s,other))!==null)));

        if(rampPlan)break;
      }
    }
    const workable=(lands.length>=3&&lands.length<=4&&soon.length>0) || (lands.length===2&&(early.length>=2||rampPlan));
    const desired=hand.length>=4?3:2;
    const score=(workable?100:0)-Math.abs(lands.length-desired)*9+early.length*4+soon.length*2-spells.reduce((n,id)=>n+manaValue(cost(s,id))*0.01,0);
    if(score>best.score)best={score,workable,lands:lands.length,plays:soon.length};
  }
  return best;
}
function bestKeep(s:GameState,me:string,bottom:number) {
  const hand=s.players[me]!.hand,size=Math.max(0,hand.length-bottom);
  let best={cards:[] as string[],assessment:{score:-Infinity,workable:false,lands:0,plays:0}};
  for(const cards of combinations(hand,size)){
    const assessment=assess(s,me,cards);
    if(assessment.score>best.assessment.score)best={cards,assessment};
  }
  return best;
}
/** London bottoming preserves the same mana plan used to decide whether to keep. */
export function openingAction(s:GameState,legal:Action[]):Action|null {
  const p=s.pending;
  if(p.kind!=='mulligan'&&p.kind!=='bottomCards')return null;
  const bottom=p.kind==='bottomCards'?p.count:Math.min(s.players[p.player]!.hand.length,cardsToBottom(s,p.taken));
  const best=bestKeep(s,p.player,bottom);
  if(p.kind==='bottomCards')return {type:'BottomCards',player:p.player,cards:s.players[p.player]!.hand.filter(id=>!best.cards.includes(id))};
  const size=best.cards.length,a=best.assessment;
  const shortHand=(size<=4&&a.lands>=2&&a.plays>0)||(size<=3&&a.lands>=1);
  const canRedraw=legal.some(a=>a.type==='Mulligan'&&!a.keep);
  return {type:'Mulligan',player:p.player,keep:a.workable||shortHand||!canRedraw};
}
