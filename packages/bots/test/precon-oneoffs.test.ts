// Precon one-offs: evolve, explore, a static ability that works from the
// graveyard, "creatures your opponents control enter tapped", and friends.
// Checked against the Oracle text with the real card data.

import { describe, expect, it } from 'vitest';
import { characteristics, type GameState } from '@nexus/engine';
import { act, card, cast, goTo, mana, newGame, put, settle } from './kit-helpers.ts';

const RAT = 'undercity-dire-rat';
const castFromHand = (s: GameState, id: string, pool: Parameters<typeof mana>[2]) => {
  mana(s, 'P1', pool);
  return cast(s, { type: 'CastSpell', player: 'P1', card: id, targets: [] }).state;
};

describe('Creatures entering', () => {
  it("Stitcher's Supplier mills three when it enters and when it dies", () => {
    let s = newGame();
    const supplier = put(s, 'P1', 'stitchers-supplier', 'hand');
    s = castFromHand(s, supplier, { B: 1 });
    expect(s.players.P1!.graveyard).toHaveLength(3);
    const kill = put(s, 'P1', 'sephiroths-intervention', 'hand');
    mana(s, 'P1', { B: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: kill, targets: [card(supplier)] }).state;
    expect(s.players.P1!.graveyard).toHaveLength(3 + 3 + 2); // the Supplier and the spell too
  });

  it('Authority of the Consuls: opponents’ creatures enter tapped, and you gain 1 life each time', () => {
    let s = newGame();
    put(s, 'P2', 'authority-of-the-consuls');
    const rat = put(s, 'P1', RAT, 'hand');
    s = castFromHand(s, rat, { B: 1, C: 1 });
    expect(s.cards[rat]!.tapped).toBe(true);
    expect(s.players.P2!.life).toBe(21);
  });

  it('Shelinda: a weaker newcomer gets the counter; otherwise Shelinda does', () => {
    let s = newGame();
    const shelinda = put(s, 'P1', 'shelinda-yevon-acolyte'); // 2/2
    const small = put(s, 'P1', 'stitchers-supplier', 'hand'); // 1/1
    s = castFromHand(s, small, { B: 1 });
    expect([s.cards[small]!.counters, s.cards[shelinda]!.counters]).toEqual([1, undefined]);
    const big = put(s, 'P1', 'ruin-grinder', 'hand'); // 7/4
    mana(s, 'P1', { R: 1, C: 6 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: big, targets: [] }).state;
    expect([s.cards[big]!.counters, s.cards[shelinda]!.counters]).toEqual([undefined, 1]);
  });

  it('Evolve (Gyre Sage): a bigger creature entering adds a counter; it taps for {G} per counter', () => {
    let s = newGame();
    const sage = put(s, 'P1', 'gyre-sage'); // 1/2
    expect(s.cardDefs['gyre-sage']!.produces).toEqual(['G']);
    const big = put(s, 'P1', 'ruin-grinder', 'hand');
    s = castFromHand(s, big, { R: 1, C: 6 });
    expect(s.cards[sage]!.counters).toBe(1);
    const small = put(s, 'P1', 'stitchers-supplier', 'hand'); // 1/1 isn't bigger than a 2/3
    s = castFromHand(s, small, { B: 1 });
    expect(s.cards[sage]!.counters).toBe(1);
    s.cards[sage]!.counters = 3;
    expect(act(s, { type: 'ActivateManaAbility', player: 'P1', card: sage, mana: 'G' }).players.P1!.manaPool.G).toBe(3);
  });

  it('Fathom Mage draws when a +1/+1 counter is put on it (evolve included)', () => {
    let s = newGame();
    put(s, 'P1', 'island', 'library');
    const mage = put(s, 'P1', 'fathom-mage');
    const big = put(s, 'P1', 'ruin-grinder', 'hand');
    s = castFromHand(s, big, { R: 1, C: 6 });
    expect([s.cards[mage]!.counters, s.players.P1!.hand.length]).toEqual([1, 1]);
  });

  it('Path of Discovery: entering creatures explore (a land to hand, otherwise a counter)', () => {
    for (const land of [true, false]) {
      let s = newGame();
      put(s, 'P1', 'path-of-discovery');
      const top = put(s, 'P1', land ? 'forest' : RAT, 'library');
      const rat = put(s, 'P1', RAT, 'hand');
      s = castFromHand(s, rat, { B: 1, C: 1 });
      expect(s.cards[top]!.zone).toBe(land ? 'hand' : 'library');
      expect(s.cards[rat]!.counters).toBe(land ? undefined : 1);
    }
  });

  it('Rise of the Dark Realms: every creature card from every graveyard, under your control', () => {
    let s = newGame(3);
    const mine = put(s, 'P1', RAT, 'graveyard');
    const theirs = put(s, 'P3', 'ruin-grinder', 'graveyard');
    const land = put(s, 'P2', 'forest', 'graveyard');
    const spell = put(s, 'P1', 'rise-of-the-dark-realms', 'hand');
    s = castFromHand(s, spell, { B: 2, C: 7 });
    expect([s.cards[mine]!.zone, s.cards[theirs]!.zone, s.cards[theirs]!.controller, s.cards[land]!.zone]).toEqual([
      'battlefield',
      'battlefield',
      'P1',
      'graveyard',
    ]);
  });
});

describe('Combat', () => {
  it('Auron: grows when attacking and exiles a smaller creature of the defending player until it leaves', () => {
    let s = newGame();
    const auron = put(s, 'P1', 'auron-venerated-guardian'); // 2/5
    const rat = put(s, 'P2', 'stitchers-supplier'); // power 1, less than Auron's 2
    s = goTo(s, 'declareAttackers', { accept: false });
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: auron, defender: 'P2' }] })).state;
    expect([s.cards[auron]!.counters, s.cards[rat]!.zone]).toEqual([1, 'exile']);
  });

  it('Auron still grows when the defending player has nothing small enough to exile', () => {
    let s = newGame();
    const auron = put(s, 'P1', 'auron-venerated-guardian');
    const big = put(s, 'P2', 'ruin-grinder');
    s = goTo(s, 'declareAttackers', { accept: false });
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: auron, defender: 'P2' }] })).state;
    expect([s.cards[auron]!.counters, s.cards[big]!.zone]).toEqual([1, 'battlefield']);
  });

  it('Vincent: grows when your creatures connect; at power 7 its damage hits each other opponent too', () => {
    let s = newGame(3);
    const vincent = put(s, 'P1', 'vincent-vengeful-atoner', 'battlefield', { counters: 4 }); // 7/7
    s = goTo(s, 'declareAttackers', { accept: false });
    s = act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: vincent, defender: 'P2' }] });
    s = goTo(s, 'main2');
    expect([s.players.P2!.life, s.players.P3!.life, s.cards[vincent]!.counters]).toEqual([13, 13, 5]);
  });

  it('Anger: from your graveyard, while you control a Mountain, your creatures have haste', () => {
    const s = newGame();
    const rat = put(s, 'P1', RAT, 'battlefield', { summoningSick: true });
    put(s, 'P1', 'anger', 'graveyard');
    expect(characteristics(s, s.cards[rat]!).keywords.has('Haste')).toBe(false);
    put(s, 'P1', 'mountain');
    expect(characteristics(s, s.cards[rat]!).keywords.has('Haste')).toBe(true);
  });
});
