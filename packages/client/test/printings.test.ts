import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {createGame,FREE_FOR_ALL} from '@nexus/engine';
import {CARD_DEFS,SCRYFALL_PRINTINGS} from '@nexus/cards';
import {passiveBot} from '@nexus/bots';
import {CardFace} from '../src/components/Card.tsx';
import {scryfallOf} from '../src/game/cards.ts';
import {GameSession} from '../src/game/session.ts';
describe('printing-aware artwork',()=>{
 it('selects a different Arcane Signet image for each precon without changing its rules ID',()=>{
  const images=new Set<string>();
  for(const number of ['332','333','334','335']){
   const printing={set:'fic',number},info=SCRYFALL_PRINTINGS['fic/'+number]!;
   const html=renderToStaticMarkup(createElement(CardFace,{defId:'arcane-signet',printing}));
   expect(html).toContain(info.image.normal.replaceAll('&','&amp;'));images.add(info.image.normal);
  }expect(images.size).toBe(4);
 });
 it('draws a fallback for an unknown requested printing rather than showing another printing',()=>{
  expect(scryfallOf('arcane-signet',{set:'fic',number:'invalid'})).toBeUndefined();
  expect(renderToStaticMarkup(createElement(CardFace,{defId:'arcane-signet',printing:{set:'fic',number:'invalid'}}))).toContain('drawn-name');
 });
 it('keeps the chosen printing on a public card flight after playing a land',()=>{
  const printing={set:'fin',number:'298'};
  const {state:s}=createGame({format:FREE_FOR_ALL,cardDefs:CARD_DEFS,players:['You','Bot1'].map(id=>({id,deck:Array(30).fill('island'),deckPrintings:Array(30).fill(printing)})),seed:1,skipDeckValidation:true});
  s.activePlayer='You';s.turnNumber=2;s.step='main1';s.pending={kind:'priority',player:'You',passes:0};
  const session=new GameSession({deck:'RW',opponents:1,seed:1,bot:'ai'},{state:s,bots:{Bot1:passiveBot()}}),id=s.players.You!.hand[0]!;
  expect(session.submit([{type:'PlayLand',player:'You',card:id}])).toBeNull();
  expect(session.moves.at(-1)).toMatchObject({card:id,defId:'island',printing});expect(session.view().cards[id]!.printing).toEqual(printing);
 });
});
describe('pack printings and melded art', () => {
 it('a variant printing pulled from a pack shows its own art in games', () => {
  const info = scryfallOf('fang-fearless-lcie', { set: 'fin', number: '381' });
  expect(info?.number).toBe('381');
  expect(info?.image.normal).toContain('cards.scryfall.io');
 });
 it('a melded Fang shows Ragnarok, matching the Fang printing', () => {
  const ragnarok = (printing?: { set: string; number: string }) =>
   renderToStaticMarkup(createElement(CardFace, { defId: 'fang-fearless-lcie', backFace: true, ...(printing ? { printing } : {}) }));
  expect(ragnarok()).toContain(SCRYFALL_PRINTINGS['fin/99b']!.image.normal.replaceAll('&', '&amp;'));
  expect(ragnarok({ set: 'fin', number: '381' })).toContain(scryfallOf('fang-fearless-lcie', { set: 'fin', number: '381b' })!.image.normal.replaceAll('&', '&amp;'));
  expect(ragnarok({ set: 'fin', number: '381' })).not.toContain('/back/');
 });
});
