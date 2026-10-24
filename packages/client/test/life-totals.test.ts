import {describe,expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createGame,COMMANDER,viewFor} from '@nexus/engine';
import {CARD_DEFS,FIN_PRECONS,preconDeck} from '@nexus/cards';
import {moveCard} from '../../engine/src/state.ts';
import {CommanderDamageBreakdown,LifeTotals} from '../src/components/LifeTotals.tsx';
function fixture(){return createGame({format:COMMANDER,cardDefs:CARD_DEFS,players:['You','Bot1','Bot2','Bot3'].map((id,i)=>({id,...preconDeck(FIN_PRECONS[i]!.name)})),seed:1}).state;}
describe('central life and commander damage',()=>{
 it('shows all four life totals as buttons with damage-detail labels',()=>{
  const s=fixture(),html=renderToStaticMarkup(createElement(LifeTotals,{view:viewFor(s,'You')}));
  for(const pid of s.turnOrder)expect(html).toContain(pid+', 40 life. Show commander damage');
 });
 it('keeps commander identity public without exposing its hidden zone or library contents',()=>{
  const s=fixture(),cmd=s.players.Bot1!.command[0]!;moveCard({s,ev:[]},cmd,'library');const view=viewFor(s,'You');
  expect(view.cards[cmd]).toBeUndefined();expect(view.players.Bot1!.commanders).toEqual([{id:cmd,defId:s.cards[cmd]!.defId}]);
  expect(Object.keys(view.players.Bot1!.commanders[0]!)).toEqual(['id','defId']);
 });
 it('reports damage per commander and original owner even after control changes',()=>{
  const s=fixture(),a=s.players.Bot1!.command[0]!,b=s.players.Bot2!.command[0]!;s.players.You!.commanderDamage[a]=12;s.players.You!.commanderDamage[b]=7;
  moveCard({s,ev:[]},a,'battlefield');s.cards[a]!.controller='Bot3';const html=renderToStaticMarkup(createElement(CommanderDamageBreakdown,{view:viewFor(s,'You'),target:'You'}));
  expect(html).toContain('Bot1');expect(html).toContain(CARD_DEFS[s.cards[a]!.defId]!.name);expect(html).toContain('12 / 21');expect(html).toContain('7 / 21');expect(html).toContain('0 / 21');expect(html).toContain('even if control changes');
 });
});
