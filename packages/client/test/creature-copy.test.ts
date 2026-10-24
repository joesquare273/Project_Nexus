import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {viewFor} from '@nexus/engine';
import {newGame,put,act,settle,nextStep} from '../../bots/test/kit-helpers.ts';
import {cleanupDamage} from '../../engine/src/turn.ts';
import {BattlefieldCard,type ZoneHandlers} from '../src/components/Zones.tsx';
import {Inspector} from '../src/components/Sidebar.tsx';
import {GameSession,YOU} from '../src/game/session.ts';
const h:ZoneHandlers={tokenStackKey:()=>null,markCard:()=>[],markPlayer:()=>[],cardNote:()=>null,onCard:()=>{},onPlayer:()=>{},onHover:()=>{},onZone:()=>{}};
function fixture(){let s=newGame();s.players[YOU]={...s.players.P1!,id:YOU};delete s.players.P1;s.turnOrder=[YOU,'P2'];for(const c of Object.values(s.cards))if(c.owner==='P1')c.owner=c.controller=YOU;s.activePlayer=YOU;s.pending={kind:'priority',player:YOU,passes:0};const source=put(s,YOU,'gogo-mysterious-mime'),target=put(s,YOU,'millikin');s=settle(nextStep(s)).state;expect(s.pending.kind).toBe('copyCreature');return{s,source,target};}
describe('browser battlefield copies',()=>{
 it('waits for the human copy choice and submits it through the session API',()=>{const{s,source}=fixture();const session=new GameSession({deck:'RW',opponents:1,seed:1,bot:'ai'},{state:s,bots:{P2:()=>({type:'PassPriority',player:'P2'})}});expect(session.advance()).toBe('you');expect(session.legal()).toEqual([{type:'CopyCreature',player:YOU,accept:false},{type:'CopyCreature',player:YOU,accept:true}]);expect(session.submit([{type:'CopyCreature',player:YOU,accept:true}])).toBeNull();expect(session.view().stats[source]!.definition?.name).toBe('Gogo, Mysterious Mime');});
 it('shows copied art, effective characteristics, retained name and copy status',()=>{let{s,source}=fixture();s=act(s,{type:'CopyCreature',player:YOU,accept:true});const view=viewFor(s,YOU),board=renderToStaticMarkup(createElement(BattlefieldCard,{view,id:source,h})),inspector=renderToStaticMarkup(createElement(Inspector,{view,id:source}));expect(board).toContain('alt="Millikin"');expect(board).toContain('Copying Millikin');expect(board.replace(/<[^>]+>/g,'')).toContain('2/1');expect(inspector).toContain('Gogo, Mysterious Mime');expect(inspector).toContain('Artifact Creature');expect(inspector).toContain('Construct');expect(inspector).toContain('Must attack this turn if able');expect(inspector).not.toContain('become a copy');});
 it('returns the browser view to the original art and abilities at cleanup',()=>{let{s,source}=fixture();s=act(s,{type:'CopyCreature',player:YOU,accept:true});cleanupDamage({s,ev:[]});const view=viewFor(s,YOU);expect(view.stats[source]!.definition).toBeUndefined();const html=renderToStaticMarkup(createElement(Inspector,{view,id:source}));expect(html).toContain('alt="Gogo, Mysterious Mime"');expect(html).not.toContain('Copying Millikin');});
 it('keeps opponents hands private through a public copy choice',()=>{let{s,source}=fixture();const hidden=put(s,'P2','sol-ring','hand');s=act(s,{type:'CopyCreature',player:YOU,accept:true});const view=viewFor(s,YOU);expect(view.cards[hidden]).toBeUndefined();expect(view.cards[source]!.copy?.artDefId).toBe('millikin');});
});
