// Read-only audit. --verify-source also compares the current MTGJSON deck downloads.
import assert from 'node:assert/strict';
import { CARD_IDS_BY_NAME, FIN_PRECONS, SCRYFALL_PRINTINGS } from '../src/index.ts';
const files=['LimitBreakFinalFantasyVii_FIC','RevivalTranceFinalFantasyVi_FIC','CounterBlitzFinalFantasyX_FIC','ScionsSpellcraftFinalFantasyXiv_FIC'];
const prints=new Set<string>(), names=new Set<string>(); let copies=0;
for(const [i,deck] of FIN_PRECONS.entries()){
  const entries=[deck.commander,...deck.cards];
  for(const c of entries){
    const key=c.set+'/'+c.number, info=SCRYFALL_PRINTINGS[key];
    assert(CARD_IDS_BY_NAME[c.name], 'Missing rules identity: '+c.name);
    assert(info,'Missing artwork: '+key);
    assert.equal(info.name.replaceAll('’',"'"),c.name.replaceAll('’',"'"),'Wrong card: '+key);
    assert.equal(info.set,c.set); assert.equal(info.number,c.number);
    for(const src of Object.values(info.image)) assert(src.includes(info.scryfallId!), 'Image identity mismatch: '+key);
    copies+=c.count; prints.add(key); names.add(c.name);
  }
  if(process.argv.includes('--verify-source')){
    const url='https://mtgjson.com/api/v5/decks/'+files[i]+'.json';
    const response=await fetch(url,{headers:{'User-Agent':'ProjectNexus/0.1 (precon printing audit)'}});
    assert(response.ok,'Source unavailable: '+response.status);
    type Entry={name:string;setCode?:string;set?:string;number:string;count:number;side?:string};
    const json=await response.json() as {data:{commander:Entry[];mainBoard:Entry[]}};
    const signature=(c:Entry)=>[c.name.replaceAll('’',"'"),(c.setCode??c.set)!.toLowerCase(),c.number,c.count].join('|');
    const source=[...json.data.commander,...json.data.mainBoard].filter(c=>!c.side||c.side==='a');
    assert.deepEqual(source.map(signature).sort(),entries.map(signature).sort(),'Decklist mismatch: '+deck.name);
  }
  console.log(deck.name+': '+entries.reduce((n,c)=>n+c.count,0)+' cards verified');
}
console.log(copies+' physical cards, '+names.size+' names, '+prints.size+' exact printings verified.');
