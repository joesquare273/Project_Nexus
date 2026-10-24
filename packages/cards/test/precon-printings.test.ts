import {describe,expect,it} from 'vitest';
import {createGame,COMMANDER,viewFor} from '@nexus/engine';
import {CARD_DEFS,CARD_IDS_BY_NAME,FIN_PRECONS,SCRYFALL_PRINTINGS,preconDeck,preconCommanders,preconDeckWithCommander} from '../src/index.ts';
const histogram=(items:string[])=>items.reduce((out,key)=>{out[key]=(out[key]??0)+1;return out;},{} as Record<string,number>);
describe('exact precon printings',()=>{
 it('caches all 339 printings with the correct name and image identity',()=>{
  const printings=new Set<string>();let copies=0;
  for(const deck of FIN_PRECONS)for(const c of [deck.commander,...deck.cards]){
   const key=c.set+'/'+c.number,info=SCRYFALL_PRINTINGS[key]!;printings.add(key);copies+=c.count;
   expect(info,deck.name+' '+c.name+' '+key).toBeDefined();expect(info.name.replaceAll('’',"'")).toBe(c.name.replaceAll('’',"'"));
   for(const url of Object.values(info.image))expect(url).toContain(info.scryfallId);
  }expect(printings.size).toBe(339);expect(copies).toBe(400);
 });
 for(const deck of FIN_PRECONS){
  it(deck.name+' retains every physical printing through shuffle and drawing',()=>{
   const setup=preconDeck(deck.name),{state:s}=createGame({format:COMMANDER,cardDefs:CARD_DEFS,players:['You','Bot1'].map(id=>({id,...setup})),seed:23});
   const owned=Object.values(s.cards).filter(c=>c.owner==='You');
   const actual=histogram(owned.map(c=>c.defId+'|'+c.printing!.set+'/'+c.printing!.number));
   const expected=histogram([deck.commander,...deck.cards].flatMap(c=>Array(c.count).fill(CARD_IDS_BY_NAME[c.name]+'|'+c.set+'/'+c.number)));
   expect(actual).toEqual(expected);expect(s.cards[s.players.You!.command[0]!]!.printing).toEqual(setup.commanderPrinting);
   const opponent=viewFor(s,'Bot1');for(const id of s.players.You!.hand)expect(opponent.cards[id]).toBeUndefined();
  });
  it(deck.name+' keeps printing assignments when changing the commander',()=>{
   for(const choice of preconCommanders(deck.name)){
    const p=preconDeckWithCommander(deck.name,choice.name);expect(p.deck).toHaveLength(99);expect(p.deckPrintings).toHaveLength(99);
    const got=histogram([p.commander+'|'+p.commanderPrinting.set+'/'+p.commanderPrinting.number,...p.deck.map((id,i)=>id+'|'+p.deckPrintings[i]!.set+'/'+p.deckPrintings[i]!.number)]);
    const wanted=histogram([deck.commander,...deck.cards].flatMap(c=>Array(c.count).fill(CARD_IDS_BY_NAME[c.name]+'|'+c.set+'/'+c.number)));expect(got).toEqual(wanted);
   }
  });
 }
});
