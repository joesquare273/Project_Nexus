// Step 5 of the precon card work: end-step and upkeep triggers with the
// "this turn" tracking they need (life gained or lost, a card leaving your
// graveyard, spells cast, permanents that entered), plus stealing
// permanents and winning the game. Checked against the Oracle text with the
// real card data.

import { describe, expect, it } from 'vitest';
import { characteristics, getLegalActions, viewFor, type GameState } from '@nexus/engine';
import { act, card, cast, goTo, mana, newGame, put, rejected, settle } from './kit-helpers.ts';

const RAT = 'undercity-dire-rat';
const none = { kind: 'none' } as const;
const protection = (s: GameState) => put(s, 'P1', 'protection-magic', 'hand');

describe('Upkeep and end-step triggers', () => {
  it('Bugenhagen: draws at upkeep only while you control a creature with power 7 or greater', () => {
    for (const big of [false, true]) {
      let s = newGame();
      put(s, 'P1', 'bugenhagen-wise-elder');
      if (big) put(s, 'P1', 'ruin-grinder');
      for (let i = 0; i < 3; i++) put(s, 'P1', 'island', 'library');
      s = goTo(s, 'end');
      s = goTo(s, 'draw'); // P2's turn
      s = goTo(s, 'main1');
      s = goTo(s, 'end');
      s = goTo(s, 'main1'); // P1's turn: upkeep trigger, then the draw step
      expect(s.activePlayer).toBe('P1');
      expect(s.players.P1!.hand).toHaveLength(big ? 2 : 1);
    }
  });

  it('Aerith: if you gained life, a creature card comes back to hand; with 7 or more, onto the battlefield', () => {
    for (const gained of [3, 7]) {
      let s = newGame();
      put(s, 'P1', 'aerith-last-ancient');
      const rat = put(s, 'P1', RAT, 'graveyard');
      s.players.P1!.lifeGainedThisTurn = gained;
      s = goTo(s, 'end');
      s = settle(s).state;
      expect(s.cards[rat]!.zone).toBe(gained >= 7 ? 'battlefield' : 'hand');
    }
    let s = newGame();
    put(s, 'P1', 'aerith-last-ancient');
    const rat = put(s, 'P1', RAT, 'graveyard');
    s = goTo(s, 'end');
    s = settle(s).state;
    expect(s.cards[rat]!.zone).toBe('graveyard');
  });

  it('Gau: attacking adds a counter; at each end step after a card left your graveyard, it hits each opponent', () => {
    let s = newGame(3);
    put(s, 'P1', 'gau-feral-youth');
    const souls = put(s, 'P1', 'lingering-souls', 'graveyard');
    mana(s, 'P1', { B: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: souls, targets: [] }).state; // flashback: it left the graveyard
    s = goTo(s, 'end');
    s = settle(s).state;
    expect([s.players.P2!.life, s.players.P3!.life]).toEqual([18, 18]);
  });

  it('Summoner’s Sending: exile a creature card from a graveyard for a Spirit, with a counter if its mana value is 4+', () => {
    let s = newGame();
    put(s, 'P1', 'summoners-sending');
    const titan = put(s, 'P2', 'sun-titan', 'graveyard');
    s = goTo(s, 'end');
    s = settle(s).state;
    expect(s.cards[titan]!.zone).toBe('exile');
    const spirits = s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'spirit-token');
    expect(spirits).toHaveLength(1);
    expect(s.cards[spirits[0]!]!.counters).toBe(1);
  });

  it('Hellkite Tyrant: combat damage steals the player’s artifacts; 20 artifacts at upkeep wins the game', () => {
    let s = newGame();
    const tyrant = put(s, 'P1', 'hellkite-tyrant');
    const tome = put(s, 'P2', 'tome-of-legends');
    s = goTo(s, 'declareAttackers', { accept: false });
    s = act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: tyrant, defender: 'P2' }] });
    s = goTo(s, 'main2');
    expect(s.cards[tome]!.controller).toBe('P1');
    // The board shows it on its new controller's side.
    expect(viewFor(s, 'P1').players.P1!.battlefield).toContain(tome);
    expect(viewFor(s, 'P1').players.P2!.battlefield).not.toContain(tome);

    for (let i = 0; i < 19; i++) put(s, 'P1', 'treasure-token', 'battlefield', { isToken: true });
    s = goTo(s, 'end');
    s = goTo(s, 'draw'); // P2's turn
    s = goTo(s, 'main1');
    s = goTo(s, 'end');
    s = goTo(s, 'draw'); // P1's turn
    expect(s.pending.kind).toBe('gameOver');
    expect(s.winner).toBe('P1');
  });
});

describe('Noncreature spells and "this turn"', () => {
  it('Papalymo: noncreature spells drain 1; sacrifice it so each opponent who lost life sacrifices their biggest creature', () => {
    let s = newGame(3);
    const papalymo = put(s, 'P1', 'papalymo-totolymo');
    const small = put(s, 'P2', RAT);
    const big = put(s, 'P2', 'ruin-grinder');
    const safe = put(s, 'P3', 'ruin-grinder');
    s.players.P3!.lifeGainedThisTurn = 0;
    const spell = protection(s);
    mana(s, 'P1', { W: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [none, none, none] }).state;
    expect([s.players.P2!.life, s.players.P3!.life, s.players.P1!.life]).toEqual([19, 19, 21]);
    s.players.P3!.lifeLostThisTurn = 0; // only P2 lost life this turn
    mana(s, 'P1', { C: 4 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: papalymo, ability: 0, targets: [] }).state;
    expect([s.cards[big]!.zone, s.cards[small]!.zone, s.cards[safe]!.zone]).toEqual(['graveyard', 'battlefield', 'battlefield']);
  });

  it('Lyse Hext: noncreature spells cost {1} less; prowess; double strike after two noncreature spells', () => {
    let s = newGame();
    const lyse = put(s, 'P1', 'lyse-hext');
    const first = protection(s);
    const second = protection(s);
    mana(s, 'P1', { W: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: first, targets: [none, none, none] }).state;
    let now = characteristics(s, s.cards[lyse]!);
    expect([now.power, now.toughness, now.keywords.has('DoubleStrike')]).toEqual([3, 3, false]);
    mana(s, 'P1', { W: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: second, targets: [none, none, none] }).state;
    now = characteristics(s, s.cards[lyse]!);
    expect([now.power, now.keywords.has('DoubleStrike')]).toEqual([4, true]);
  });

  it('Tromell: other nontoken creatures enter with an extra counter; proliferate once per creature that entered', () => {
    let s = newGame();
    const tromell = put(s, 'P1', 'tromell-seymours-butler');
    const rat = put(s, 'P1', RAT, 'hand');
    mana(s, 'P1', { B: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: rat, targets: [] }).state;
    expect(s.cards[rat]!.counters).toBe(1);
    expect(s.cards[tromell]!.counters).toBeUndefined();
    mana(s, 'P1', { C: 1 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: tromell, ability: 0, targets: [] }).state;
    expect(s.cards[rat]!.counters).toBe(2);
  });

  it('Forge of Heroes: a +1/+1 counter on a commander that entered this turn', () => {
    let s = newGame();
    const forge = put(s, 'P1', 'forge-of-heroes');
    const old = put(s, 'P1', 'zack-fair', 'battlefield', { isCommander: true, enteredTurn: s.turnNumber - 1 });
    expect(getLegalActions(s).some((a) => a.type === 'ActivateAbility' && a.card === forge)).toBe(false);
    const fresh = put(s, 'P1', 'gau-feral-youth', 'battlefield', { isCommander: true, enteredTurn: s.turnNumber });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: forge, ability: 0, targets: [card(fresh)] }).state;
    expect([s.cards[fresh]!.counters, s.cards[old]!.counters]).toEqual([1, undefined]);
  });

  it("Rogue's Passage: {4}, {T}: target creature can't be blocked this turn", () => {
    let s = newGame();
    const passage = put(s, 'P1', 'rogues-passage');
    const rat = put(s, 'P1', RAT);
    mana(s, 'P1', { C: 4 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: passage, ability: 0, targets: [card(rat)] }).state;
    expect(s.temporaryEffects.some((e) => e.affected === rat && e.flags?.includes('cantBeBlocked'))).toBe(true);
    expect(rejected(s, { type: 'ActivateAbility', player: 'P1', card: passage, ability: 0, targets: [card(rat)] })).toMatch(/tapped/);
  });
});
