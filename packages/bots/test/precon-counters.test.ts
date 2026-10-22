// The Final Fantasy Commander precon +1/+1 counter cards (C2, counters
// group), each checked against its Oracle text with the real card data.

import { describe, expect, it } from 'vitest';
import { hasKeyword, powerOf, type Action, type GameState } from '@nexus/engine';
import { CARD_IDS_BY_NAME } from '@nexus/cards';
import { card, cast, fight, mana, newGame, put } from './kit-helpers.ts';

const id = (name: string) => {
  const found = CARD_IDS_BY_NAME[name];
  if (!found) throw new Error(`No card named ${name}`);
  return found;
};
const counters = (s: GameState, c: string) => s.cards[c]!.counters ?? 0;
const castSpell = (c: string, targets: string[] = [], player = 'P1'): Action => ({
  type: 'CastSpell',
  player,
  card: c,
  targets: targets.map(card),
});

describe('+1/+1 counters', () => {
  it('Hardened Scales: one more +1/+1 counter whenever counters go on your creatures', () => {
    let s = newGame();
    put(s, 'P1', id('Hardened Scales'));
    const coeurl = put(s, 'P1', 'coeurl');
    const theirs = put(s, 'P2', 'coeurl');
    const crawler = put(s, 'P1', id('Duskshell Crawler'), 'hand');
    mana(s, 'P1', { G: 1, C: 1 });
    s = cast(s, castSpell(crawler), { targets: () => [card(coeurl)] }).state;
    expect(counters(s, coeurl)).toBe(2);
    // Only creatures you control.
    const t = newGame();
    put(t, 'P1', id('Hardened Scales'));
    const theirs2 = put(t, 'P2', 'coeurl');
    const crawler2 = put(t, 'P1', id('Duskshell Crawler'), 'hand');
    mana(t, 'P1', { G: 1, C: 1 });
    const r = cast(t, castSpell(crawler2), { targets: () => [card(theirs2)] }).state;
    expect(counters(r, theirs2)).toBe(1);
    expect(theirs).toBeTruthy();
  });

  it('Duskshell Crawler puts a counter on a creature, and your creatures with counters have trample', () => {
    let s = newGame();
    const coeurl = put(s, 'P1', 'coeurl');
    const plain = put(s, 'P1', 'undercity-dire-rat');
    const crawler = put(s, 'P1', id('Duskshell Crawler'), 'hand');
    mana(s, 'P1', { G: 1, C: 1 });
    s = cast(s, castSpell(crawler), { targets: () => [card(coeurl)] }).state;
    expect(counters(s, coeurl)).toBe(1);
    expect(hasKeyword(s, s.cards[coeurl]!, 'Trample')).toBe(true);
    expect(hasKeyword(s, s.cards[plain]!, 'Trample')).toBe(false);
  });

  it('Sphere Grid: combat damage to a player puts a counter on that creature; creatures with counters have reach and trample', () => {
    const s = newGame();
    put(s, 'P1', id('Sphere Grid'));
    const coeurl = put(s, 'P1', 'coeurl');
    const r = fight(s, [{ attacker: coeurl, defender: 'P2' }]);
    expect(counters(r.state, coeurl)).toBe(1);
    expect(['Reach', 'Trample'].every((k) => hasKeyword(r.state, r.state.cards[coeurl]!, k as 'Reach'))).toBe(true);
  });

  it('Bred for the Hunt: draw when a creature of yours with a +1/+1 counter deals combat damage to a player', () => {
    const s = newGame();
    put(s, 'P1', id('Bred for the Hunt'));
    const countered = put(s, 'P1', 'coeurl', 'battlefield', { counters: 1 });
    const plain = put(s, 'P1', 'undercity-dire-rat');
    const hand = s.players.P1!.hand.length;
    const r = fight(s, [
      { attacker: countered, defender: 'P2' },
      { attacker: plain, defender: 'P2' },
    ]);
    expect(r.state.players.P1!.hand.length).toBe(hand + 1);
  });

  it('Chocobo Knights: whenever you attack, your creatures with counters gain double strike', () => {
    const s = newGame();
    put(s, 'P1', id('Chocobo Knights'));
    const countered = put(s, 'P1', 'coeurl', 'battlefield', { counters: 1 });
    const plain = put(s, 'P1', 'undercity-dire-rat');
    const r = fight(s, [
      { attacker: countered, defender: 'P2' },
      { attacker: plain, defender: 'P2' },
    ]);
    expect(hasKeyword(r.state, r.state.cards[countered]!, 'DoubleStrike')).toBe(true);
    expect(hasKeyword(r.state, r.state.cards[plain]!, 'DoubleStrike')).toBe(false);
    // 3/3 double strike + 2/2: 6 + 2 damage.
    expect(r.state.players.P2!.life).toBe(12);
  });

  it('Inspiring Call: draw a card per creature with a +1/+1 counter; they gain indestructible', () => {
    let s = newGame();
    const a = put(s, 'P1', 'coeurl', 'battlefield', { counters: 1 });
    const b = put(s, 'P1', 'barret-wallace', 'battlefield', { counters: 2 });
    const plain = put(s, 'P1', 'undercity-dire-rat');
    const spell = put(s, 'P1', id('Inspiring Call'), 'hand');
    mana(s, 'P1', { G: 1, C: 2 });
    const hand = s.players.P1!.hand.length - 1;
    s = cast(s, castSpell(spell)).state;
    expect(s.players.P1!.hand.length).toBe(hand + 2);
    expect([a, b].every((c) => hasKeyword(s, s.cards[c]!, 'Indestructible'))).toBe(true);
    expect(hasKeyword(s, s.cards[plain]!, 'Indestructible')).toBe(false);
  });

  it('Siegfried mills three, then gets two counters per creature card in your graveyard', () => {
    let s = newGame();
    put(s, 'P1', 'coeurl', 'graveyard');
    put(s, 'P1', 'coeurl', 'library');
    put(s, 'P1', 'undercity-dire-rat', 'library');
    put(s, 'P1', 'sephiroths-intervention', 'library'); // top three: a spell, a rat, a coeurl
    const siegfried = put(s, 'P1', id('Siegfried, Famed Swordsman'), 'hand');
    mana(s, 'P1', { B: 1, C: 3 });
    s = cast(s, castSpell(siegfried)).state;
    expect(s.players.P1!.graveyard.length).toBe(4);
    expect(counters(s, siegfried)).toBe(6); // three creature cards
    expect(powerOf(s, s.cards[siegfried]!)).toBe(8);
  });
});

describe('triggers on spells', () => {
  it('Sunscorch Regent: a counter and 1 life whenever an opponent casts a spell (not you)', () => {
    let s = newGame();
    const regent = put(s, 'P1', id('Sunscorch Regent'));
    const mine = put(s, 'P1', 'sephiroths-intervention', 'hand');
    const theirs = put(s, 'P2', 'sephiroths-intervention', 'hand');
    const target = put(s, 'P2', 'coeurl');
    const target2 = put(s, 'P1', 'undercity-dire-rat');
    mana(s, 'P1', { B: 1, C: 3 });
    s = cast(s, castSpell(mine, [target])).state;
    expect(counters(s, regent)).toBe(0);
    mana(s, 'P2', { B: 1, C: 3 });
    s.pending = { kind: 'priority', player: 'P2', passes: 0 };
    s = cast(s, castSpell(theirs, [target2], 'P2')).state;
    expect(counters(s, regent)).toBe(1);
    // You gained 1 life from the Regent and 2 from your own Intervention.
    expect(s.players.P1!.life).toBe(23);
  });

  it('Ardbert: white spells give your legends a counter and vigilance; black spells, a counter and menace', () => {
    let s = newGame();
    const ardbert = put(s, 'P1', id('Ardbert, Warrior of Darkness'));
    const graha = put(s, 'P1', 'graha-tia');
    const coeurl = put(s, 'P1', 'coeurl'); // not legendary
    const black = put(s, 'P1', 'sephiroths-intervention', 'hand');
    const enemy = put(s, 'P2', 'coeurl');
    mana(s, 'P1', { B: 1, C: 3 });
    s = cast(s, castSpell(black, [enemy])).state;
    expect([counters(s, ardbert), counters(s, graha), counters(s, coeurl)]).toEqual([1, 1, 0]);
    expect(hasKeyword(s, s.cards[graha]!, 'Menace')).toBe(true);
    expect(hasKeyword(s, s.cards[graha]!, 'Vigilance')).toBe(false);
  });
});

describe('proliferate', () => {
  it('Grateful Apparition proliferates when it deals combat damage to a player', () => {
    const s = newGame();
    const apparition = put(s, 'P1', id('Grateful Apparition'));
    const mine = put(s, 'P1', 'coeurl', 'battlefield', { counters: 2 });
    const theirs = put(s, 'P2', 'coeurl', 'battlefield', { counters: 1 });
    const r = fight(s, [{ attacker: apparition, defender: 'P2' }]);
    expect(counters(r.state, mine)).toBe(3);
    expect(counters(r.state, theirs)).toBe(1); // you choose your own permanents
  });

  it('Inexorable Tide proliferates whenever you cast a spell, and Hardened Scales adds one more', () => {
    let s = newGame();
    put(s, 'P1', id('Inexorable Tide'));
    const mine = put(s, 'P1', 'coeurl', 'battlefield', { counters: 1 });
    const spell = put(s, 'P1', 'sephiroths-intervention', 'hand');
    const enemy = put(s, 'P2', 'coeurl');
    mana(s, 'P1', { B: 1, C: 3 });
    s = cast(s, castSpell(spell, [enemy])).state;
    expect(counters(s, mine)).toBe(2);

    let t = newGame();
    put(t, 'P1', id('Inexorable Tide'));
    put(t, 'P1', id('Hardened Scales'));
    const mine2 = put(t, 'P1', 'coeurl', 'battlefield', { counters: 1 });
    const spell2 = put(t, 'P1', 'sephiroths-intervention', 'hand');
    const enemy2 = put(t, 'P2', 'coeurl');
    mana(t, 'P1', { B: 1, C: 3 });
    t = cast(t, castSpell(spell2, [enemy2])).state;
    expect(counters(t, mine2)).toBe(3);
  });
});

describe('enters with counters', () => {
  it('a permanent with "enters with N +1/+1 counters" gets them as it enters (and Hardened Scales applies)', () => {
    let s = newGame();
    s.cardDefs = { ...s.cardDefs, 'test-grower': { ...s.cardDefs.coeurl!, id: 'test-grower', name: 'Test Grower', entersWithCounters: 2 } };
    put(s, 'P1', id('Hardened Scales'));
    const grower = put(s, 'P1', 'test-grower', 'hand');
    mana(s, 'P1', { W: 1, C: 1 });
    s = cast(s, castSpell(grower)).state;
    expect(counters(s, grower)).toBe(3);
  });
});
