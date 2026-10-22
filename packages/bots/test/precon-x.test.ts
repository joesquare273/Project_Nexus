// {X} costs and the cards that use them, plus "whenever you attack with N or
// more creatures" and revealing until a creature card. Checked against the
// Oracle text with the real card data.

import { describe, expect, it } from 'vitest';
import { objectManaValue, type GameState } from '@nexus/engine';
import { playableCards } from '../src/index.ts';
import { act, card, cast, goTo, mana, newGame, player, put, settle } from './kit-helpers.ts';

const RAT = 'undercity-dire-rat';
const castX = (s: GameState, id: string, x: number) => cast(s, { type: 'CastSpell', player: 'P1', card: id, targets: [], x });

describe('{X} costs', () => {
  it('X is offered from 1 up to what your mana can pay, and the board labels each choice', () => {
    const s = newGame();
    const spell = put(s, 'P1', 'exsanguinate', 'hand');
    for (let i = 0; i < 5; i++) put(s, 'P1', 'swamp');
    const labels = playableCards(s, 'P1').filter((p) => p.card === spell).map((p) => p.label);
    expect(labels).toEqual(['Cast with X = 1', 'Cast with X = 2', 'Cast with X = 3']);
  });

  it('Exsanguinate: each opponent loses X; you gain the total lost', () => {
    let s = newGame(3);
    const spell = put(s, 'P1', 'exsanguinate', 'hand');
    mana(s, 'P1', { B: 2, C: 3 });
    s = castX(s, spell, 3).state;
    expect([s.players.P2!.life, s.players.P3!.life, s.players.P1!.life]).toEqual([17, 17, 26]);
  });

  it('Pull from Tomorrow: draw X, then discard a card', () => {
    let s = newGame();
    for (let i = 0; i < 4; i++) put(s, 'P1', 'island', 'library');
    const spell = put(s, 'P1', 'pull-from-tomorrow', 'hand');
    mana(s, 'P1', { U: 2, C: 4 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [], x: 4 });
    s = settle(s).state;
    expect(s.pending).toMatchObject({ kind: 'chooseCards', purpose: 'discard', min: 1, max: 1 });
    s = act(s, { type: 'ChooseCards', player: 'P1', cards: [s.players.P1!.hand[0]!] });
    expect(s.players.P1!.hand).toHaveLength(3);
  });

  it('Walking Ballista: enters with X counters; {4} adds one; removing one deals 1 damage', () => {
    let s = newGame();
    const ballista = put(s, 'P1', 'walking-ballista', 'hand');
    mana(s, 'P1', { C: 4 });
    s = castX(s, ballista, 2).state;
    expect(s.cards[ballista]!.counters).toBe(2);
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: ballista, ability: 1, targets: [player('P2')] }).state;
    expect([s.cards[ballista]!.counters, s.players.P2!.life]).toEqual([1, 19]);
    mana(s, 'P1', { C: 4 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: ballista, ability: 0, targets: [] }).state;
    expect(s.cards[ballista]!.counters).toBe(2);
  });

  it('Champions from Beyond: X Heroes; attacking with four or more scries 2 and draws', () => {
    let s = newGame();
    for (let i = 0; i < 3; i++) put(s, 'P1', 'island', 'library');
    const champions = put(s, 'P1', 'champions-from-beyond', 'hand');
    mana(s, 'P1', { W: 2, C: 4 });
    s = castX(s, champions, 4).state;
    const heroes = s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'hero-token');
    expect(heroes).toHaveLength(4);
    for (const id of heroes) s.cards[id]!.summoningSick = false;
    s = goTo(s, 'declareAttackers', { accept: false });
    const r = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: heroes.map((attacker) => ({ attacker, defender: 'P2' })) }));
    expect(r.events.filter((e) => e.type === 'Surveiled')).toHaveLength(2);
    expect(r.state.players.P1!.hand).toHaveLength(1);
  });
});

describe("Yuna's Whistle", () => {
  it('reveals until a creature card: it goes to hand, the rest to the bottom, and its mana value in counters', () => {
    let s = newGame();
    const rat = put(s, 'P1', RAT);
    const titan = put(s, 'P1', 'sun-titan', 'library');
    const top = put(s, 'P1', 'forest', 'library');
    const spell = put(s, 'P1', 'yunas-whistle', 'hand');
    mana(s, 'P1', { G: 2, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(rat)] }).state;
    expect(s.cards[titan]!.zone).toBe('hand');
    expect(s.players.P1!.library.at(-1)).toBe(top);
    expect(s.cards[rat]!.counters).toBe(6);
  });
});

describe('Mana value of a spell with {X}', () => {
  it("counts X on the stack, once per X symbol: Exsanguinate with X = 1 is mana value 3 (Y'shtola sees it)", () => {
    let s = newGame();
    put(s, 'P1', 'yshtola-nights-blessed');
    const spell = put(s, 'P1', 'exsanguinate', 'hand');
    mana(s, 'P1', { B: 2, C: 1 });
    s = castX(s, spell, 1).state;
    // Exsanguinate drains 1; Y'shtola's trigger drains 2 more and gains 2.
    expect([s.players.P2!.life, s.players.P1!.life]).toEqual([17, 23]);
  });

  it('{X}{X} with X = 2 is mana value 4 on the stack and 0 anywhere else', () => {
    const s = newGame();
    const ballista = put(s, 'P1', 'walking-ballista', 'hand');
    mana(s, 'P1', { C: 4 });
    const t = act(s, { type: 'CastSpell', player: 'P1', card: ballista, targets: [], x: 2 });
    expect(objectManaValue(t, t.cards[ballista]!)).toBe(4);
    expect(objectManaValue(s, s.cards[ballista]!)).toBe(0);
  });
});
