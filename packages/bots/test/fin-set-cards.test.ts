// Final Fantasy set cards built in S4 (docs/sealed.md), played through the
// engine with their real card data. Each test checks what the card's Oracle
// text says it does.

import { describe, expect, it } from 'vitest';
import { activatedAbilities, countersOf, getLegalActions, hasKeyword, manaValue, parseManaCost, powerOf, toughnessOf, type GameState } from '@nexus/engine';
import { act, card, cast, fight, goTo, mana, newGame, put, rejected, settle } from './kit-helpers.ts';

const stats = (s: GameState, id: string) => [powerOf(s, s.cards[id]!), toughnessOf(s, s.cards[id]!)];
const heroes = (s: GameState, who: string) => s.players[who]!.battlefield.filter((id) => s.cards[id]!.defId === 'hero-token');
/** A creature wearing one of P1's Equipment. */
function equipped(s: GameState, equipment: string, creature = 'coeurl') {
  const body = put(s, 'P1', creature);
  const gear = put(s, 'P1', equipment, 'battlefield', { attachedTo: body });
  return { body, gear };
}

describe('S4 group 1: Job select Equipment', () => {
  it('Job select: casting one makes a 1/1 Hero token wearing it (Monk’s Fist: +1/+0, Monk)', () => {
    let s = newGame();
    const fist = put(s, 'P1', 'monks-fist', 'hand');
    mana(s, 'P1', { C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: fist }).state;
    const [hero] = heroes(s, 'P1');
    expect(s.cards[fist]!.attachedTo).toBe(hero);
    expect(stats(s, hero!)).toEqual([2, 1]);
  });

  it('Bard’s Bow gives +2/+2 and reach', () => {
    const s = newGame();
    const { body } = equipped(s, 'bards-bow');
    const bare = put(s, 'P2', 'coeurl');
    expect(stats(s, body)).toEqual([stats(s, bare)[0]! + 2, stats(s, bare)[1]! + 2]);
    expect(hasKeyword(s, s.cards[body]!, 'Reach')).toBe(true);
  });

  it('Thief’s Knife draws a card when the equipped creature deals combat damage to a player', () => {
    let s = newGame();
    const { body } = equipped(s, 'thiefs-knife');
    const hand = s.players.P1!.hand.length;
    s = fight(s, [{ attacker: body, defender: 'P2' }]).state;
    expect(s.players.P1!.hand.length).toBe(hand + 1);
  });

  it('Black Mage’s Rod deals 1 damage to each opponent when you cast a noncreature spell', () => {
    let s = newGame(3);
    equipped(s, 'black-mages-rod');
    const target = put(s, 'P2', 'coeurl');
    const kill = put(s, 'P1', 'sephiroths-intervention', 'hand');
    mana(s, 'P1', { B: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: kill, targets: [card(target)] }).state;
    expect([s.players.P2!.life, s.players.P3!.life]).toEqual([19, 19]);
  });

  it('Red Mage’s Rapier gives +2/+0 until end of turn when you cast a noncreature spell', () => {
    let s = newGame();
    const { body } = equipped(s, 'red-mages-rapier');
    const before = stats(s, body);
    const target = put(s, 'P2', 'coeurl');
    const kill = put(s, 'P1', 'sephiroths-intervention', 'hand');
    mana(s, 'P1', { B: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: kill, targets: [card(target)] }).state;
    expect(stats(s, body)).toEqual([before[0]! + 2, before[1]]);
  });

  it('Ninja’s Blades: draw, discard, and that player loses life equal to the discarded card’s mana value', () => {
    let s = newGame(3);
    const { body } = equipped(s, 'ninjas-blades');
    const top = put(s, 'P1', 'sephiroths-intervention', 'library');
    const value = manaValue(parseManaCost(s.cardDefs['sephiroths-intervention']!.manaCost));
    const power = powerOf(s, s.cards[body]!);
    s = fight(s, [{ attacker: body, defender: 'P3' }]).state;
    expect(s.pending.kind).toBe('chooseCards');
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [top] })).state;
    expect(s.cards[top]!.zone).toBe('graveyard');
    expect(s.players.P3!.life).toBe(20 - power - value);
    expect(s.players.P2!.life).toBe(20);
  });
});

describe('Summoner’s Grimoire', () => {
  /** P1 attacks P3 with the equipped creature; the attack trigger offers the hand. */
  function attackWithGrimoire(inHand: string) {
    let s = newGame(3);
    const { body } = equipped(s, 'summoners-grimoire');
    const card = put(s, 'P1', inHand, 'hand');
    s = goTo(s, 'declareAttackers');
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: body, defender: 'P3' }] })).state;
    expect(s.pending.kind).toBe('chooseCards');
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [card] })).state;
    return { s, card };
  }

  it('an enchantment creature card enters tapped and attacking the same player', () => {
    const { s, card } = attackWithGrimoire('summon-bahamut');
    expect(s.cards[card]!.zone).toBe('battlefield');
    expect(s.cards[card]!.tapped).toBe(true);
    expect(s.combat!.attacks).toContainEqual({ attacker: card, defender: 'P3' });
  });

  it('any other creature card just enters, untapped and not attacking', () => {
    const { s, card } = attackWithGrimoire('coeurl');
    expect(s.cards[card]!.zone).toBe('battlefield');
    expect(s.cards[card]!.tapped).toBe(false);
    expect(s.combat!.attacks.some((a) => a.attacker === card)).toBe(false);
  });
});

describe('Dark Knight’s Greatsword', () => {
  it('+3/+0; equip by paying 3 life, only once each turn', () => {
    let s = newGame();
    const { body, gear } = equipped(s, 'dark-knights-greatsword');
    const other = put(s, 'P1', 'coeurl');
    expect(stats(s, body)[0]).toBe(stats(s, other)[0]! + 3);
    const equip = activatedAbilities(s.cardDefs['dark-knights-greatsword']!).findIndex((a) => a.equip);
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: gear, ability: equip, targets: [card(other)] }).state;
    expect(s.cards[gear]!.attachedTo).toBe(other);
    expect(s.players.P1!.life).toBe(17);
    // A second time this turn is refused, and it isn't offered.
    expect(rejected(s, { type: 'ActivateAbility', player: 'P1', card: gear, ability: equip, targets: [card(body)] })).toMatch(/once each turn/);
    expect(getLegalActions(s).some((a) => a.type === 'ActivateAbility' && a.card === gear)).toBe(false);
  });
});

describe('Machinist’s Arsenal', () => {
  it('gives +2/+2 for each artifact you control (itself included)', () => {
    const s = newGame();
    const { body } = equipped(s, 'machinists-arsenal');
    const bare = put(s, 'P2', 'coeurl');
    const base = stats(s, bare);
    expect(stats(s, body)).toEqual([base[0]! + 2, base[1]! + 2]);
    put(s, 'P1', 'monks-fist');
    put(s, 'P2', 'monks-fist');
    expect(stats(s, body)).toEqual([base[0]! + 4, base[1]! + 4]);
  });
});

describe('S4 group 2: noncreature spells', () => {
  /** P1 casts Night's Whisper (2 mana) or Harmonize (4 mana). */
  const castCheap = (s: GameState) => {
    const spell = put(s, 'P1', 'nights-whisper', 'hand');
    mana(s, 'P1', { B: 2 });
    return cast(s, { type: 'CastSpell', player: 'P1', card: spell }).state;
  };
  const castBig = (s: GameState) => {
    const spell = put(s, 'P1', 'harmonize', 'hand');
    mana(s, 'P1', { G: 4 });
    return cast(s, { type: 'CastSpell', player: 'P1', card: spell }).state;
  };
  const counters = (s: GameState, id: string) => countersOf(s.cards[id]!, '+1/+1');

  it('Ultros taps and stuns an opponent’s creature for a 4-mana spell; eight +1/+1 counters for an 8-mana one', () => {
    let s = newGame();
    const ultros = put(s, 'P1', 'ultros-obnoxious-octopus');
    const target = put(s, 'P2', 'coeurl');
    s = castCheap(s);
    expect(s.cards[target]!.tapped).toBe(false);
    s = castBig(s);
    expect(s.cards[target]!.tapped).toBe(true);
    expect(countersOf(s.cards[target]!, 'stun')).toBe(1);
    expect(counters(s, ultros)).toBe(0);
    const pull = put(s, 'P1', 'pull-from-tomorrow', 'hand');
    mana(s, 'P1', { U: 8 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: pull, x: 6 }).state;
    expect(counters(s, ultros)).toBe(8);
  });

  it('Cornered by Black Mages: the opponent sacrifices a creature, and you get a Wizard that pings', () => {
    let s = newGame();
    const victim = put(s, 'P2', 'coeurl');
    const spell = put(s, 'P1', 'cornered-by-black-mages', 'hand');
    mana(s, 'P1', { B: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [{ kind: 'player', player: 'P2' }] }).state;
    if (s.pending.kind === 'chooseCards') s = settle(act(s, { type: 'ChooseCards', player: 'P2', cards: [victim] })).state;
    expect(s.cards[victim]!.zone).toBe('graveyard');
    expect(s.players.P1!.battlefield.some((id) => s.cards[id]!.defId === 'wizard-token')).toBe(true);
    s = castCheap(s);
    expect(s.players.P2!.life).toBe(19);
  });

  it('Blazing Bomb grows for 4-mana spells and blows up for damage equal to its power', () => {
    let s = newGame();
    const bomb = put(s, 'P1', 'blazing-bomb');
    const target = put(s, 'P2', 'coeurl');
    s = castCheap(s);
    expect(counters(s, bomb)).toBe(0);
    s = castBig(s);
    expect(counters(s, bomb)).toBe(1);
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: bomb, ability: 0, targets: [card(target)] }).state;
    expect(s.cards[bomb]!.zone).toBe('graveyard');
    // It had power 2 (1 plus its counter) as it was sacrificed: 2 damage, or the creature died of it.
    const hit = s.cards[target]!;
    expect(hit.zone === 'graveyard' || hit.damage === 2).toBe(true);
  });

  it('Mysidian Elder makes a Wizard token as it enters', () => {
    let s = newGame();
    const elder = put(s, 'P1', 'mysidian-elder', 'hand');
    mana(s, 'P1', { R: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: elder }).state;
    expect(s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'wizard-token')).toHaveLength(1);
  });

  it('Prompto Argentum makes a Treasure only for spells with four or more mana spent', () => {
    let s = newGame();
    put(s, 'P1', 'prompto-argentum');
    const treasures = () => s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'treasure-token').length;
    s = castCheap(s);
    expect(treasures()).toBe(0);
    s = castBig(s);
    expect(treasures()).toBe(1);
  });

  it('Queen Brahne has prowess and makes a Wizard when she attacks', () => {
    let s = newGame();
    const queen = put(s, 'P1', 'queen-brahne');
    s = castCheap(s);
    expect(stats(s, queen)).toEqual([3, 2]);
    s = fight(s, [{ attacker: queen, defender: 'P2' }]).state;
    expect(s.players.P1!.battlefield.some((id) => s.cards[id]!.defId === 'wizard-token')).toBe(true);
  });

  it('Black Waltz No. 3 deals 2 damage to each opponent for every noncreature spell', () => {
    let s = newGame(3);
    put(s, 'P1', 'black-waltz-no-3');
    s = castCheap(s);
    expect([s.players.P2!.life, s.players.P3!.life]).toEqual([18, 18]);
  });
});
