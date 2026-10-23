// The Final Fantasy Commander precon Equipment cards (C2, Equipment group),
// each checked against its Oracle text with the real card data.

import { describe, expect, it } from 'vitest';
import { activatedAbilities, canBlock, hasKeyword, powerOf, toughnessOf, type Action, type GameState } from '@nexus/engine';
import { CARD_IDS_BY_NAME } from '@nexus/cards';
import { act, card, cast, fight, mana, newGame, put, rejected } from './kit-helpers.ts';

const id = (name: string) => {
  const found = CARD_IDS_BY_NAME[name];
  if (!found) throw new Error(`No card named ${name}`);
  return found;
};
const stats = (s: GameState, c: string) => [powerOf(s, s.cards[c]!), toughnessOf(s, s.cards[c]!)];
const equipIndex = (s: GameState, c: string) => activatedAbilities(s.cardDefs[s.cards[c]!.defId]!).findIndex((a) => a.equip);
const equip = (s: GameState, equipment: string, creature: string): Action => ({
  type: 'ActivateAbility',
  player: 'P1',
  card: equipment,
  ability: equipIndex(s, equipment),
  targets: [card(creature)],
});
const castSpell = (c: string, targets: string[] = []): Action => ({
  type: 'CastSpell',
  player: 'P1',
  card: c,
  targets: targets.map(card),
});

describe('Equipment that changes the equipped creature', () => {
  it('Behemoth Sledge: +2/+2, trample and lifelink; equip {3}', () => {
    let s = newGame();
    const coeurl = put(s, 'P1', 'coeurl');
    const sledge = put(s, 'P1', id('Behemoth Sledge'));
    mana(s, 'P1', { C: 2 });
    expect(rejected(s, equip(s, sledge, coeurl))).toMatch(/mana/);
    mana(s, 'P1', { C: 1 });
    s = cast(s, equip(s, sledge, coeurl)).state;
    expect(stats(s, coeurl)).toEqual([4, 4]);
    expect(['Trample', 'Lifelink'].map((k) => hasKeyword(s, s.cards[coeurl]!, k as 'Trample'))).toEqual([true, true]);
  });

  it('Darksteel Plate is indestructible and makes the equipped creature indestructible', () => {
    const s = newGame();
    const coeurl = put(s, 'P1', 'coeurl');
    const plate = put(s, 'P1', id('Darksteel Plate'), 'battlefield', { attachedTo: coeurl });
    expect(hasKeyword(s, s.cards[plate]!, 'Indestructible')).toBe(true);
    expect(hasKeyword(s, s.cards[coeurl]!, 'Indestructible')).toBe(true);
  });

  it('Colossus Hammer: +10/+10 and loses flying', () => {
    const s = newGame();
    const pixie = put(s, 'P1', 'il-mheg-pixie');
    put(s, 'P1', id('Colossus Hammer'), 'battlefield', { attachedTo: pixie });
    expect(stats(s, pixie)).toEqual([12, 11]);
    expect(hasKeyword(s, s.cards[pixie]!, 'Flying')).toBe(false);
  });

  it('Champion’s Helm: +2/+2, and hexproof only while the creature is legendary', () => {
    const s = newGame();
    const coeurl = put(s, 'P1', 'coeurl');
    const graha = put(s, 'P1', 'graha-tia');
    put(s, 'P1', id("Champion's Helm"), 'battlefield', { attachedTo: coeurl });
    put(s, 'P1', id("Champion's Helm"), 'battlefield', { attachedTo: graha });
    expect(stats(s, coeurl)).toEqual([4, 4]);
    expect(hasKeyword(s, s.cards[coeurl]!, 'Hexproof')).toBe(false);
    expect(hasKeyword(s, s.cards[graha]!, 'Hexproof')).toBe(true);
  });

  it('Hero’s Heirloom: +2/+1, and trample and haste while the creature is legendary', () => {
    const s = newGame();
    const coeurl = put(s, 'P1', 'coeurl');
    const graha = put(s, 'P1', 'graha-tia');
    put(s, 'P1', id("Hero's Heirloom"), 'battlefield', { attachedTo: coeurl });
    put(s, 'P1', id("Hero's Heirloom"), 'battlefield', { attachedTo: graha });
    expect(stats(s, coeurl)).toEqual([4, 3]);
    expect(hasKeyword(s, s.cards[coeurl]!, 'Trample')).toBe(false);
    expect(['Trample', 'Haste'].every((k) => hasKeyword(s, s.cards[graha]!, k as 'Trample'))).toBe(true);
  });
});

describe('hexproof, shroud and landwalk', () => {
  /** P2 with a removal spell and mana, holding priority on P1's turn. */
  function p2CanRespond(s: GameState) {
    const spell = put(s, 'P2', 'sephiroths-intervention', 'hand');
    mana(s, 'P2', { B: 1, C: 3 });
    s.pending = { kind: 'priority', player: 'P2', passes: 0 };
    return spell;
  }

  it('Swiftfoot Boots: hexproof and haste; opponents can’t target the creature, you still can', () => {
    const s = newGame();
    const coeurl = put(s, 'P1', 'coeurl', 'battlefield', { summoningSick: true });
    put(s, 'P1', id('Swiftfoot Boots'), 'battlefield', { attachedTo: coeurl });
    expect(hasKeyword(s, s.cards[coeurl]!, 'Haste')).toBe(true);
    const spell = p2CanRespond(s);
    expect(rejected(s, { type: 'CastSpell', player: 'P2', card: spell, targets: [card(coeurl)] })).toMatch(/not legal/);
    const mine = newGame();
    const c2 = put(mine, 'P1', 'coeurl');
    put(mine, 'P1', id('Swiftfoot Boots'), 'battlefield', { attachedTo: c2 });
    const swords = put(mine, 'P1', id('Swords to Plowshares'), 'hand');
    mana(mine, 'P1', { W: 1 });
    expect(act(mine, castSpell(swords, [c2]))).toBeTruthy();
  });

  it('Lightning Greaves: haste and shroud; nobody can target the creature; equip {0}', () => {
    let s = newGame();
    const coeurl = put(s, 'P1', 'coeurl');
    const greaves = put(s, 'P1', id('Lightning Greaves'));
    s = cast(s, equip(s, greaves, coeurl)).state; // equip {0}: no mana needed
    expect(['Haste', 'Shroud'].every((k) => hasKeyword(s, s.cards[coeurl]!, k as 'Haste'))).toBe(true);
    const swords = put(s, 'P1', id('Swords to Plowshares'), 'hand');
    mana(s, 'P1', { W: 1 });
    expect(rejected(s, castSpell(swords, [coeurl]))).toMatch(/not legal/);
  });

  it('Trailblazer’s Boots: can’t be blocked while the defending player controls a nonbasic land', () => {
    const s = newGame();
    const attacker = put(s, 'P1', 'coeurl');
    put(s, 'P1', id("Trailblazer's Boots"), 'battlefield', { attachedTo: attacker });
    const blocker = put(s, 'P2', 'coeurl');
    put(s, 'P2', 'island');
    expect(canBlock(s, s.cards[blocker]!, s.cards[attacker]!)).toBe(true);
    put(s, 'P2', 'treno-dark-city');
    expect(canBlock(s, s.cards[blocker]!, s.cards[attacker]!)).toBe(false);
  });
});

describe('Equipment and creatures with triggers', () => {
  it('Sword of the Animist: +1/+1, and you may fetch a basic land tapped when the creature attacks', () => {
    const s = newGame();
    const coeurl = put(s, 'P1', 'coeurl');
    put(s, 'P1', id('Sword of the Animist'), 'battlefield', { attachedTo: coeurl });
    expect(stats(s, coeurl)).toEqual([3, 3]);
    const r = fight(s, [{ attacker: coeurl, defender: 'P2' }]);
    const lands = r.state.players.P1!.battlefield.filter((c) => r.state.cards[c]!.defId === 'island');
    expect(lands).toHaveLength(1);
    expect(r.state.cards[lands[0]!]!.tapped).toBe(true);
  });

  it('Explorer’s Scope: when the creature attacks, a land on top of your library goes onto the battlefield tapped', () => {
    const s = newGame();
    const coeurl = put(s, 'P1', 'coeurl');
    put(s, 'P1', id("Explorer's Scope"), 'battlefield', { attachedTo: coeurl });
    const top = s.players.P1!.library[0]!;
    const r = fight(s, [{ attacker: coeurl, defender: 'P2' }]);
    expect(r.state.cards[top]).toMatchObject({ zone: 'battlefield', tapped: true });
    // A nonland card stays on top.
    const t = newGame();
    const c2 = put(t, 'P1', 'coeurl');
    put(t, 'P1', id("Explorer's Scope"), 'battlefield', { attachedTo: c2 });
    const spell = put(t, 'P1', 'sephiroths-intervention', 'library');
    const r2 = fight(t, [{ attacker: c2, defender: 'P2' }]);
    expect(r2.state.cards[spell]!.zone).toBe('library');
  });

  it('Helitrooper gives another attacking creature flying when it attacks', () => {
    const s = newGame();
    const trooper = put(s, 'P1', id('Helitrooper'));
    const coeurl = put(s, 'P1', 'coeurl');
    const r = fight(s, [
      { attacker: trooper, defender: 'P2' },
      { attacker: coeurl, defender: 'P2' },
    ], {}, {
      targets: (options) => {
        expect(options).toEqual([[card(coeurl)]]);
        return [card(coeurl)];
      },
    });
    // Flying lasts until end of turn.
    expect(hasKeyword(r.state, r.state.cards[coeurl]!, 'Flying')).toBe(true);
    expect(hasKeyword(r.state, r.state.cards[trooper]!, 'Flying')).toBe(true);
  });

  it('Helitrooper makes equip abilities that target it cost {2} less', () => {
    let s = newGame();
    const trooper = put(s, 'P1', id('Helitrooper'));
    const sledge = put(s, 'P1', id('Behemoth Sledge'));
    mana(s, 'P1', { C: 1 });
    s = cast(s, equip(s, sledge, trooper)).state;
    expect(s.cards[sledge]!.attachedTo).toBe(trooper);
  });

  it('Armory Automaton attaches your Equipment to itself when it enters', () => {
    let s = newGame();
    const sledge = put(s, 'P1', id('Behemoth Sledge'));
    const plate = put(s, 'P1', id('Darksteel Plate'));
    const automaton = put(s, 'P1', id('Armory Automaton'), 'hand');
    mana(s, 'P1', { C: 3 });
    s = cast(s, castSpell(automaton)).state;
    expect([s.cards[sledge]!.attachedTo, s.cards[plate]!.attachedTo]).toEqual([automaton, automaton]);
    expect(stats(s, automaton)).toEqual([4, 4]);
  });

  it('Hero’s Blade: +3/+2, and may attach itself to a legendary creature of yours as it enters', () => {
    let s = newGame();
    const blade = put(s, 'P1', id("Hero's Blade"));
    const coeurl = put(s, 'P1', 'coeurl', 'hand');
    const steiner = put(s, 'P1', 'adelbert-steiner', 'hand');
    mana(s, 'P1', { W: 2, C: 2 });
    s = cast(s, castSpell(coeurl)).state;
    expect(s.cards[blade]!.attachedTo).toBeUndefined(); // not legendary
    s = cast(s, castSpell(steiner)).state;
    expect(s.cards[blade]!.attachedTo).toBe(steiner);
  });

  it('Sage’s Nouliths: Job select, +1/+0 and a Cleric, and attacking untaps a target attacking creature', () => {
    let s = newGame();
    const nouliths = put(s, 'P1', id("Sage's Nouliths"), 'hand');
    mana(s, 'P1', { U: 1, C: 1 });
    s = cast(s, castSpell(nouliths)).state;
    const hero = s.cards[nouliths]!.attachedTo!;
    expect(s.cards[hero]!.defId).toBe('hero-token');
    expect(stats(s, hero)).toEqual([2, 1]);

    const t = newGame();
    const coeurl = put(t, 'P1', 'coeurl');
    const rat = put(t, 'P1', 'undercity-dire-rat');
    put(t, 'P1', id("Sage's Nouliths"), 'battlefield', { attachedTo: coeurl });
    const r = fight(t, [
      { attacker: coeurl, defender: 'P2' },
      { attacker: rat, defender: 'P2' },
    ], {}, { targets: () => [card(rat)] });
    expect(r.state.cards[rat]!.tapped).toBe(false);
    expect(r.state.cards[coeurl]!.tapped).toBe(true);
  });

  it('Skullclamp: +1/-1, and you draw two cards when the equipped creature dies', () => {
    let s = newGame();
    const pixie = put(s, 'P1', 'il-mheg-pixie'); // 2/1: dies at once as a 3/0
    const clamp = put(s, 'P1', id('Skullclamp'));
    mana(s, 'P1', { C: 1 });
    const hand = s.players.P1!.hand.length;
    s = cast(s, equip(s, clamp, pixie)).state;
    expect(s.cards[pixie]!.zone).toBe('graveyard');
    expect(s.players.P1!.hand.length).toBe(hand + 2);
  });
});

describe('Cloud, Ex-SOLDIER', () => {
  it('attaches one of your Equipment to itself when it enters', () => {
    let s = newGame();
    const sledge = put(s, 'P1', id('Behemoth Sledge'));
    const cloud = put(s, 'P1', id('Cloud, Ex-SOLDIER'), 'hand');
    mana(s, 'P1', { R: 1, G: 1, W: 1, C: 2 });
    s = cast(s, castSpell(cloud)).state;
    expect(s.cards[sledge]!.attachedTo).toBe(cloud);
  });

  it('draws a card for each equipped attacking creature, and makes two Treasures with power 7 or greater', () => {
    const s = newGame();
    const cloud = put(s, 'P1', id('Cloud, Ex-SOLDIER'));
    const ally = put(s, 'P1', 'coeurl');
    put(s, 'P1', id('Behemoth Sledge'), 'battlefield', { attachedTo: cloud });
    put(s, 'P1', id('Behemoth Sledge'), 'battlefield', { attachedTo: ally });
    const hand = s.players.P1!.hand.length;
    const r = fight(s, [
      { attacker: cloud, defender: 'P2' },
      { attacker: ally, defender: 'P2' },
    ]);
    expect(r.state.players.P1!.hand.length).toBe(hand + 2);
    const treasures = r.state.players.P1!.battlefield.filter((c) => r.state.cards[c]!.defId === 'treasure-token');
    expect(treasures).toHaveLength(0); // Cloud is 6/6

    const big = newGame();
    const cloud2 = put(big, 'P1', id('Cloud, Ex-SOLDIER'));
    put(big, 'P1', id('Colossus Hammer'), 'battlefield', { attachedTo: cloud2 });
    const r2 = fight(big, [{ attacker: cloud2, defender: 'P2' }]);
    expect(r2.state.players.P1!.battlefield.filter((c) => r2.state.cards[c]!.defId === 'treasure-token')).toHaveLength(2);
  });

  it('with Wrecking Ball Arm (base 7/7) he draws for himself and makes two Treasures when he attacks', () => {
    const s = newGame(3);
    const cloud = put(s, 'P1', id('Cloud, Ex-SOLDIER'));
    put(s, 'P1', id('Wrecking Ball Arm'), 'battlefield', { attachedTo: cloud });
    const hand = s.players.P1!.hand.length;
    const r = fight(s, [{ attacker: cloud, defender: 'P3' }]);
    expect(r.state.players.P1!.hand.length).toBe(hand + 1);
    expect(r.state.players.P1!.battlefield.filter((c) => r.state.cards[c]!.defId === 'treasure-token')).toHaveLength(2);
    expect(r.state.players.P3!.life).toBe(20 - 7);
  });
});
