// The precon card-draw and graveyard cards, plus a few anthems and cost
// reducers. Checked against the Oracle text with the real card data.

import { describe, expect, it } from 'vitest';
import { characteristics, getLegalActions, type GameState } from '@nexus/engine';
import { act, card, cast, mana, newGame, put, rejected } from './kit-helpers.ts';

const RAT = 'undercity-dire-rat';
const hand = (s: GameState, pid = 'P1') => s.players[pid]!.hand.length;
const library = (s: GameState, pid: string, n: number) => {
  for (let i = 0; i < n; i++) put(s, pid, 'island', 'library');
};
/** Whether P1 can cast this card from hand right now (its cost after reductions is covered by the pool). */
const castable = (s: GameState, id: string) => getLegalActions(s).some((a) => a.type === 'CastSpell' && a.card === id);

describe('Draw spells', () => {
  it("Harmonize draws three; Night's Whisper draws two and costs 2 life", () => {
    let s = newGame();
    library(s, 'P1', 5);
    const harmonize = put(s, 'P1', 'harmonize', 'hand');
    const whisper = put(s, 'P1', 'nights-whisper', 'hand');
    mana(s, 'P1', { G: 2, B: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: harmonize, targets: [] }).state;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: whisper, targets: [] }).state;
    expect([hand(s), s.players.P1!.life]).toEqual([5, 18]);
  });

  it('Secret Rendezvous: you and target opponent each draw three', () => {
    let s = newGame();
    library(s, 'P1', 3);
    library(s, 'P2', 3);
    const spell = put(s, 'P1', 'secret-rendezvous', 'hand');
    mana(s, 'P1', { W: 2, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [{ kind: 'player', player: 'P2' }] }).state;
    expect([hand(s), hand(s, 'P2')]).toEqual([3, 3]);
  });

  it('Cut a Deal: each opponent draws, then you draw one for each of them', () => {
    let s = newGame(4);
    for (const pid of ['P1', 'P2', 'P3', 'P4']) library(s, pid, 3);
    const spell = put(s, 'P1', 'cut-a-deal', 'hand');
    mana(s, 'P1', { W: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [] }).state;
    expect([hand(s), hand(s, 'P2'), hand(s, 'P3'), hand(s, 'P4')]).toEqual([3, 1, 1, 1]);
  });

  it('Into the Story costs {3} less while an opponent has seven or more cards in their graveyard', () => {
    const s = newGame();
    const story = put(s, 'P1', 'into-the-story', 'hand');
    mana(s, 'P1', { U: 2, C: 2 });
    expect(castable(s, story)).toBe(false);
    for (let i = 0; i < 7; i++) put(s, 'P2', 'island', 'graveyard');
    expect(castable(s, story)).toBe(true);
  });
});

describe('Creatures that draw', () => {
  it('Baleful Strix draws a card when it enters', () => {
    let s = newGame();
    library(s, 'P1', 1);
    const strix = put(s, 'P1', 'baleful-strix', 'hand');
    mana(s, 'P1', { U: 1, B: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: strix, targets: [] }).state;
    expect(hand(s)).toBe(1);
  });

  it('Morbid Opportunist: one card when other creatures die, once each turn', () => {
    let s = newGame();
    library(s, 'P1', 3);
    put(s, 'P1', 'morbid-opportunist');
    put(s, 'P2', RAT);
    put(s, 'P2', RAT);
    const wipe = put(s, 'P1', 'vanquish-the-horde', 'hand');
    mana(s, 'P1', { W: 2, C: 6 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: wipe, targets: [] }).state;
    expect(hand(s)).toBe(1);
  });

  it('Archmage Emeritus draws for each instant or sorcery you cast', () => {
    let s = newGame();
    library(s, 'P1', 4);
    put(s, 'P1', 'archmage-emeritus');
    const harmonize = put(s, 'P1', 'harmonize', 'hand');
    mana(s, 'P1', { G: 2, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: harmonize, targets: [] }).state;
    expect(hand(s)).toBe(4);
  });

  it('Alphinaud and Alisaie: each finds the other; the second spell each turn costs {2} less and draws a card', () => {
    let s = newGame();
    library(s, 'P1', 3);
    const alisaie = put(s, 'P1', 'alisaie-leveilleur', 'library');
    const alphinaud = put(s, 'P1', 'alphinaud-leveilleur', 'hand');
    mana(s, 'P1', { U: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: alphinaud, targets: [] }).state;
    expect(s.cards[alisaie]!.zone).toBe('hand');
    // Alisaie is the second spell this turn: {2}{W} minus {2}. Alphinaud draws for it.
    mana(s, 'P1', { W: 1 });
    expect(castable(s, alisaie)).toBe(false); // her reduction only works once she's on the battlefield
    put(s, 'P1', 'alisaie-leveilleur');
    expect(castable(s, alisaie)).toBe(true);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: alisaie, targets: [] }).state;
    expect(hand(s)).toBe(1);
  });
});

describe('Graveyard to hand or battlefield', () => {
  it('Stitch Together: to your hand, or onto the battlefield with seven or more cards in your graveyard', () => {
    for (const threshold of [false, true]) {
      let s = newGame();
      const rat = put(s, 'P1', RAT, 'graveyard');
      if (threshold) for (let i = 0; i < 6; i++) put(s, 'P1', 'island', 'graveyard');
      const spell = put(s, 'P1', 'stitch-together', 'hand');
      mana(s, 'P1', { B: 2 });
      s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(rat)] }).state;
      expect(s.cards[rat]!.zone).toBe(threshold ? 'battlefield' : 'hand');
    }
  });

  it("Reanimate: any graveyard's creature card, under your control; lose life equal to its mana value", () => {
    let s = newGame();
    const titan = put(s, 'P2', 'sun-titan', 'graveyard');
    const spell = put(s, 'P1', 'reanimate', 'hand');
    mana(s, 'P1', { B: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(titan)] }).state;
    expect([s.cards[titan]!.zone, s.cards[titan]!.controller, s.players.P1!.life]).toEqual(['battlefield', 'P1', 14]);
  });

  it('Cyan: cheaper for each creature card in your graveyard; grows when creature cards leave it', () => {
    let s = newGame();
    const cyan = put(s, 'P1', 'cyan-vengeful-samurai', 'hand');
    mana(s, 'P1', { W: 1, C: 3 });
    expect(castable(s, cyan)).toBe(false);
    const rats = [0, 1, 2].map(() => put(s, 'P1', RAT, 'graveyard'));
    expect(castable(s, cyan)).toBe(true);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: cyan, targets: [] }).state;
    const spell = put(s, 'P1', 'stitch-together', 'hand');
    mana(s, 'P1', { B: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(rats[0]!)] }).state;
    expect(s.cards[cyan]!.counters).toBe(1);
  });

  it('Elena: returns a non-Assassin historic card; grows with each historic spell', () => {
    let s = newGame();
    const boots = put(s, 'P1', 'swiftfoot-boots', 'graveyard');
    put(s, 'P1', RAT, 'graveyard');
    const elena = put(s, 'P1', 'elena-turk-recruit', 'hand');
    mana(s, 'P1', { W: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: elena, targets: [] }).state;
    expect(s.cards[boots]!.zone).toBe('hand');
    mana(s, 'P1', { C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: boots, targets: [] }).state;
    expect(s.cards[elena]!.counters).toBe(1);
  });

  it('Cid: Equipment costs {1} less, flies on your turn, and returns Equipment from your graveyard', () => {
    let s = newGame();
    const cid = put(s, 'P1', 'cid-freeflier-pilot');
    expect(characteristics(s, s.cards[cid]!).keywords.has('Flying')).toBe(true);
    const plate = put(s, 'P1', 'darksteel-plate', 'graveyard');
    mana(s, 'P1', { C: 2 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: cid, ability: 0, targets: [card(plate)] }).state;
    expect(s.cards[plate]!.zone).toBe('hand');
    mana(s, 'P1', { C: 2 }); // Darksteel Plate is {3}
    s = cast(s, { type: 'CastSpell', player: 'P1', card: plate, targets: [] }).state;
    expect(s.cards[plate]!.zone).toBe('battlefield');
  });

  it('Red XIII: other modified creatures have vigilance and trample; returns an Equipment card', () => {
    let s = newGame();
    const boots = put(s, 'P1', 'swiftfoot-boots', 'graveyard');
    const plain = put(s, 'P1', RAT);
    const grown = put(s, 'P1', RAT, 'battlefield', { counters: 1 });
    const red = put(s, 'P1', 'red-xiii-proud-warrior', 'hand');
    mana(s, 'P1', { R: 1, G: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: red, targets: [] }).state;
    expect(s.cards[boots]!.zone).toBe('hand');
    expect(characteristics(s, s.cards[grown]!).keywords.has('Trample')).toBe(true);
    expect(characteristics(s, s.cards[plain]!).keywords.has('Trample')).toBe(false);
  });
});

describe('Anthems and metalcraft', () => {
  it('Bastion Protector: your commander creatures get +2/+2 and indestructible', () => {
    const s = newGame();
    put(s, 'P1', 'bastion-protector');
    const commander = put(s, 'P1', 'zack-fair', 'battlefield', { isCommander: true });
    const now = characteristics(s, s.cards[commander]!);
    expect([now.power, now.toughness, now.keywords.has('Indestructible')]).toEqual([2, 3, true]);
  });

  it('Dispatch: tap target creature; exile it too with three or more artifacts', () => {
    for (const metalcraft of [false, true]) {
      let s = newGame();
      const rat = put(s, 'P2', RAT);
      if (metalcraft) for (let i = 0; i < 3; i++) put(s, 'P1', 'thought-vessel');
      const spell = put(s, 'P1', 'dispatch', 'hand');
      mana(s, 'P1', { W: 1 });
      s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(rat)] }).state;
      expect(s.cards[rat]!.zone).toBe(metalcraft ? 'exile' : 'battlefield');
      if (!metalcraft) expect(s.cards[rat]!.tapped).toBe(true);
    }
  });

  it('Puresteel Paladin: draw when an Equipment enters; equip {0} with three or more artifacts', () => {
    let s = newGame();
    library(s, 'P1', 1);
    put(s, 'P1', 'puresteel-paladin');
    const rat = put(s, 'P1', RAT);
    const plate = put(s, 'P1', 'darksteel-plate', 'hand');
    mana(s, 'P1', { C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: plate, targets: [] }).state;
    expect(hand(s)).toBe(1);
    expect(rejected(s, { type: 'ActivateAbility', player: 'P1', card: plate, ability: 0, targets: [card(rat)] })).toMatch(/mana/);
    put(s, 'P1', 'thought-vessel');
    put(s, 'P1', 'thought-vessel');
    s = act(s, { type: 'ActivateAbility', player: 'P1', card: plate, ability: 0, targets: [card(rat)] });
    s = cast(s, { type: 'PassPriority', player: 'P1' }).state;
    expect(s.cards[plate]!.attachedTo).toBe(rat);
  });
});
