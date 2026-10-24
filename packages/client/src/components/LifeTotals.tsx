import {useEffect,useRef,useState} from 'react';
import type {GameView} from '@nexus/engine';
import {defOf} from '../game/cards.ts';
import {Life} from './Zones.tsx';

export function CommanderDamageBreakdown({view,target}:{view:GameView;target:string}) {
 const damage=view.players[target]!.commanderDamage;
 const hasCommanders=view.turnOrder.some(pid=>view.players[pid]!.commanders.length);
 return <>
   <p>21 combat damage from any one commander eliminates a player. Damage follows that commander even if control changes.</p>
   {!hasCommanders && <p>Commander damage does not apply in this game.</p>}
   {view.turnOrder.map(owner=>{
     const commanders=view.players[owner]!.commanders;
     if(!commanders.length) return null;
     return <section className="damage-owner" key={owner}>
       <h4>{owner === 'You' ? 'Your commander' : owner + '’s commander'}{commanders.length>1?'s':''}</h4>
       {commanders.map(c=>{
         const n=damage[c.id]??0;
         return <div className={n>=15?'commander-damage-row danger':'commander-damage-row'} key={c.id}>
           <span>{defOf(c.defId).name}</span><strong>{n} / 21</strong>
           <meter min={0} max={21} value={Math.min(n,21)} aria-label={defOf(c.defId).name+' commander damage'} />
         </div>;
       })}
     </section>;
   })}
 </>;
}

export function LifeTotals({view}:{view:GameView}) {
 const [selected,setSelected]=useState<string|null>(null);
 const opener=useRef<HTMLButtonElement|null>(null);
 const close=()=>{setSelected(null);opener.current?.focus();};
 useEffect(()=>{
   if(!selected)return;
   const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){setSelected(null);opener.current?.focus();}};
   window.addEventListener('keydown',escape);return ()=>window.removeEventListener('keydown',escape);
 },[selected]);
 return <div className="life-hub" aria-label="Life totals">
   {view.turnOrder.map(pid=><button key={pid} className={'life-button '+(view.activePlayer===pid?'active ':'')+(view.players[pid]!.eliminated?'eliminated':'')}
      aria-label={pid+', '+view.players[pid]!.life+' life. Show commander damage'}
      onClick={e=>{opener.current=e.currentTarget;setSelected(pid);}}>
     <span>{pid}</span><Life life={view.players[pid]!.life}/>
   </button>)}
   {selected && <div className="commander-damage-overlay" onClick={close}>
     <div className="commander-damage-panel" role="dialog" aria-label={selected+' commander damage taken'} onClick={e=>e.stopPropagation()}>
       <div className="commander-damage-title"><h3>{selected}: commander damage taken</h3><button autoFocus onClick={close}>Close</button></div>
       <CommanderDamageBreakdown view={view} target={selected}/>
     </div>
   </div>}
 </div>;
}
