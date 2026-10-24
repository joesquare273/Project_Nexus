import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {viewFor} from '@nexus/engine';
import {newGame,put,act,settle} from '../../bots/test/kit-helpers.ts';
import {attach} from '../../engine/src/state.ts';
import {BattlefieldCard,type ZoneHandlers} from '../src/components/Zones.tsx';
import {Inspector} from '../src/components/Sidebar.tsx';
import {GameSession} from '../src/game/session.ts';
const h:ZoneHandlers={tokenStackKey:()=>null,markCard:()=>[],markPlayer:()=>[],cardNote:()=>null,onCard:()=>{},onPlayer:()=>{},onHover:()=>{},onZone:()=>{}};
describe('changing creature presentation',()=>{
 it('hides Triad P/T while it is not a creature and shows it at eight cards',()=>{const s=newGame(),id=put(s,'P1','the-warring-triad');let view=viewFor(s,'P1');expect(renderToStaticMarkup(createElement(BattlefieldCard,{view,id,h}))).not.toContain('badge pt');expect(renderToStaticMarkup(createElement(Inspector,{view,id}))).toContain('Legendary Artifact');expect(renderToStaticMarkup(createElement(Inspector,{view,id}))).not.toContain('inspector-pt');for(let i=0;i<8;i++)put(s,'P1','island','graveyard');view=viewFor(s,'P1');expect(renderToStaticMarkup(createElement(BattlefieldCard,{view,id,h}))).toContain('badge pt');expect(renderToStaticMarkup(createElement(Inspector,{view,id}))).toContain('God');});
 it('inspector shows Dragon and goader from the engine view',()=>{const s=newGame(3),id=put(s,'P2','undercity-dire-rat'),e=put(s,'P1','eye-of-nidhogg');attach({s,ev:[]},e,id);const html=renderToStaticMarkup(createElement(Inspector,{view:viewFor(s,'P2'),id}));expect(html).toContain('Dragon');expect(html).toContain('Goaded by P1');expect(html).toContain('4/2');});
 it('the session waits for its human mana recipient to choose the color',()=>{let s=newGame();s.players.You={...s.players.P1!,id:'You'};delete s.players.P1;s.turnOrder=['You','P2'];for(const c of Object.values(s.cards))if(c.owner==='P1')c.owner=c.controller='You';s.activePlayer='You';s.pending={kind:'priority',player:'You',passes:0};const id=put(s,'P2','the-warring-triad');s.pending={kind:'priority',player:'P2',passes:0};s=act(s,{type:'ActivateAbility',player:'P2',card:id,ability:0,targets:[{kind:'player',player:'You'}]});s=settle(s).state;const session=new GameSession({deck:'RW',opponents:1,seed:1,bot:'ai'},{state:s,bots:{P2:()=>({type:'PassPriority',player:'P2'})}});expect(session.advance()).toBe('you');expect(session.legal()).toHaveLength(5);expect(session.submit([{type:'ChooseMana',player:'You',mana:'R'}])).toBeNull();expect(session.state.players.You!.manaPool.R).toBe(1);});
});
