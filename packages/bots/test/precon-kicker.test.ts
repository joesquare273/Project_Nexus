// The Final Fantasy Commander precon cards with extra costs and random
// choices (C2, step 14): kicker, multikicker, escalate, tiered modes and
// "choose one at random", plus Thancred Waters and Krile Baldesion. Each is
// checked against its Oracle text with the real card data.

import { describe, expect, it } from 'vitest';
import { getLegalActions, hasKeyword, manaChoices, nextRandom, powerOf, spellOptions, type Action, type GameState } from '@nexus/engine';
import { CARD_IDS_BY_NAME } from '@nexus/cards';
import { act, card, cast, goTo, mana, newGame, player, put, rejected, settle } from './kit-helpers.ts';

const id = (name: string) => {
  const found = CARD_IDS_BY_NAME[name];
  if (!found) throw new Error(`No card named ${name}`);
  return found;
};
type Cast = Extract<Action, { type: 'CastSpell' }>;
const castSpell = (c: string, targets: Cast['targets'] = [], extra: Partial<Cast> = {}, who = 'P1'): Action => ({
  type: 'CastSpell',
  player: who,
  card: c,
  targets,
  ...extra,
});
const tokensOf = (s: GameState, defId: string, pid = 'P1') =>
  s.players[pid]!.battlefield.filter((c) => s.cards[c]!.isToken && s.cards[c]!.defId === defId).length;
/** An RNG state whose first "choose one of `n`" comes up `mode`. */
const rngFor = (mode: number, n: number) => {
  for (let r = 0; ; r++) if (Math.floor(nextRandom(r)[0] * n) === mode) return r;
};

describe('Kicker and multikicker', () => {
  it('Rite of Replication: one copy of target creature, or five if kicked', () => {
    let s = newGame();
    const theirs = put(s, 'P2', 'coeurl');
    const rite = put(s, 'P1', id('Rite of Replication'), 'hand');
    mana(s, 'P1', { U: 2, C: 7 });
    const costs = spellOptions(s, 'P1').filter((o) => o.action.card === rite && o.action.targets?.[0]?.kind === 'card' && o.action.targets[0].card === theirs);
    expect(costs.map((o) => o.cost)).toEqual([
      { generic: 2, U: 2 },
      { generic: 7, U: 2 },
    ]);
    const once = cast(s, castSpell(rite, [card(theirs)])).state;
    expect(tokensOf(once, 'coeurl')).toBe(1);
    s = cast(s, castSpell(rite, [card(theirs)], { kicks: 1 })).state;
    expect(tokensOf(s, 'coeurl')).toBe(5);
    expect(rejected(newGame(), castSpell(rite, [], { kicks: 2 }))).toBeTruthy();
  });

  it('Everflowing Chalice: a charge counter per kick, and {T}: add {C} for each', () => {
    let s = newGame();
    const chalice = put(s, 'P1', id('Everflowing Chalice'), 'hand');
    mana(s, 'P1', { C: 4 });
    const kicks = spellOptions(s, 'P1').filter((o) => o.action.card === chalice).map((o) => (o.action as Cast).kicks ?? 0);
    expect(kicks).toEqual([0, 1, 2]);
    expect(rejected(s, castSpell(chalice, [], { kicks: 3 }))).toMatch(/Not enough mana/);
    s = cast(s, castSpell(chalice, [], { kicks: 2 })).state;
    expect(s.cards[chalice]!.namedCounters).toEqual({ charge: 2 });
    s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: chalice, mana: 'C' });
    expect(s.players.P1!.manaPool.C).toBe(2);
    // Unkicked, it makes nothing.
    const t = newGame();
    const empty = put(t, 'P1', id('Everflowing Chalice'), 'hand');
    const r = cast(t, castSpell(empty)).state;
    expect(manaChoices(r, r.cards[empty]!)).toEqual([]);
  });
});

describe('Escalate', () => {
  it('Collective Effort: tap a creature for each extra mode; destroy a big creature and put counters on a player\'s creatures', () => {
    let s = newGame();
    const big = put(s, 'P2', 'barret-wallace');
    const small = put(s, 'P2', 'coeurl');
    const mine = [put(s, 'P1', 'coeurl'), put(s, 'P1', 'undercity-dire-rat')];
    const effort = put(s, 'P1', id('Collective Effort'), 'hand');
    mana(s, 'P1', { W: 2, C: 1 });
    const targets = [card(big), player('P1')];
    expect(rejected(s, castSpell(effort, targets, { modes: [0, 2] }))).toMatch(/escalate/i);
    // The legal list offers it, tapping a creature.
    expect(getLegalActions(s)).toContainEqual(castSpell(effort, targets, { modes: [0, 2], tapCreatures: [mine[0]!] }));
    s = cast(s, castSpell(effort, targets, { modes: [0, 2], tapCreatures: [mine[0]!] })).state;
    expect(s.cards[big]!.zone).toBe('graveyard');
    expect(s.cards[small]!.counters ?? 0).toBe(0);
    expect(mine.map((c) => [s.cards[c]!.counters, s.cards[c]!.tapped])).toEqual([
      [1, true],
      [1, false],
    ]);
  });
});

describe('Tiered', () => {
  it("Cloud's Limit Break: each mode costs more; Omnislash destroys all tapped creatures", () => {
    let s = newGame(3);
    const tapped = [put(s, 'P2', 'coeurl', 'battlefield', { tapped: true }), put(s, 'P3', 'coeurl', 'battlefield', { tapped: true })];
    const untapped = put(s, 'P2', 'undercity-dire-rat');
    const limit = put(s, 'P1', id("Cloud's Limit Break"), 'hand');
    const cost = (mode: number) => spellOptions(s, 'P1').find((o) => o.action.card === limit && (o.action as Cast).mode === mode)?.cost;
    expect([cost(0), cost(1), cost(2)]).toEqual([
      { generic: 1, W: 1 },
      { generic: 2, W: 1 },
      { generic: 4, W: 2 },
    ]);
    // Blade Beam: tapped creatures with different controllers.
    mana(s, 'P1', { W: 1, C: 2 });
    const none = { kind: 'none' as const };
    const r = cast(s, castSpell(limit, [card(tapped[0]!), card(tapped[1]!), none, none], { mode: 1 })).state;
    expect(tapped.map((c) => r.cards[c]!.zone)).toEqual(['graveyard', 'graveyard']);
    mana(s, 'P1', { W: 1, C: 2 });
    s = cast(s, castSpell(limit, [], { mode: 2 })).state;
    expect([...tapped.map((c) => s.cards[c]!.zone), s.cards[untapped]!.zone]).toEqual(['graveyard', 'graveyard', 'battlefield']);
  });
});

describe('Choose one at random', () => {
  const umaroWith = (mode: number) => {
    const s = newGame();
    const umaro = put(s, 'P1', id('Umaro, Raging Yeti'));
    const coeurl = put(s, 'P1', 'coeurl');
    const hand = [put(s, 'P1', 'coeurl', 'hand'), put(s, 'P1', 'coeurl', 'hand')];
    s.rngState = rngFor(mode, 3);
    return { s, umaro, coeurl, hand };
  };

  it('Umaro: other creatures you control get +3/+0 and trample', () => {
    const { s, umaro, coeurl } = umaroWith(0);
    const r = goTo(s, 'beginCombat');
    expect([powerOf(r, r.cards[coeurl]!), hasKeyword(r, r.cards[coeurl]!, 'Trample'), powerOf(r, r.cards[umaro]!)]).toEqual([5, true, 6]);
  });

  it('Umaro: discard your hand, then draw four', () => {
    const { s, hand } = umaroWith(1);
    const r = goTo(s, 'beginCombat');
    expect(hand.map((c) => r.cards[c]!.zone)).toEqual(['graveyard', 'graveyard']);
    expect(r.players.P1!.hand).toHaveLength(4);
  });

  it('Umaro: 5 damage to any target', () => {
    const { s } = umaroWith(2);
    const r = goTo(s, 'beginCombat', { targets: (options) => options.find((o) => o[0]?.kind === 'player' && o[0].player === 'P2')! });
    expect(r.players.P2!.life).toBe(15);
  });

  it('Summon: Magus Sisters: each chapter picks at random; Fight! has it fight an opponent\'s creature', () => {
    let s = newGame();
    const theirs = put(s, 'P2', 'coeurl');
    const saga = put(s, 'P1', id('Summon: Magus Sisters'), 'hand');
    mana(s, 'P1', { G: 1, C: 4 });
    s.rngState = rngFor(2, 3);
    s = cast(s, castSpell(saga)).state;
    expect([s.cards[theirs]!.zone, s.cards[saga]!.damage]).toEqual(['graveyard', 2]);
    // Combine Powers!: three +1/+1 counters.
    let t = newGame();
    const target = put(t, 'P1', 'coeurl');
    const saga2 = put(t, 'P1', id('Summon: Magus Sisters'), 'hand');
    mana(t, 'P1', { G: 1, C: 4 });
    t.rngState = rngFor(0, 3);
    t = cast(t, castSpell(saga2), { targets: (options) => options.find((o) => o[0]?.kind === 'card' && o[0].card === target)! }).state;
    expect(t.cards[target]!.counters).toBe(3);
  });
});

describe('One-offs', () => {
  it('Thancred Waters: another legendary permanent is indestructible for as long as you control Thancred', () => {
    let s = newGame();
    const steiner = put(s, 'P1', 'adelbert-steiner');
    const thancred = put(s, 'P1', id('Thancred Waters'), 'hand');
    mana(s, 'P1', { W: 1, C: 4 });
    s = cast(s, castSpell(thancred)).state;
    expect(hasKeyword(s, s.cards[steiner]!, 'Indestructible')).toBe(true);
    expect(hasKeyword(s, s.cards[thancred]!, 'Indestructible')).toBe(false);
    // A noncreature spell makes Thancred indestructible until end of turn.
    const draw = put(s, 'P1', 'dreams-of-laguna', 'hand');
    mana(s, 'P1', { U: 1, C: 1 });
    s = settle(act(s, castSpell(draw))).state;
    expect(hasKeyword(s, s.cards[thancred]!, 'Indestructible')).toBe(true);
    // On the next turn Steiner still has it; Thancred doesn't.
    s = goTo(s, 'end');
    s = goTo(s, 'main1');
    expect(s.activePlayer).toBe('P2');
    expect(hasKeyword(s, s.cards[steiner]!, 'Indestructible')).toBe(true);
    expect(hasKeyword(s, s.cards[thancred]!, 'Indestructible')).toBe(false);
    // Once Thancred leaves, Steiner loses it.
    const kill = put(s, 'P2', 'sephiroths-intervention', 'hand');
    mana(s, 'P2', { B: 1, C: 3 });
    s = settle(act(s, castSpell(kill, [card(thancred)], {}, 'P2'))).state;
    expect(s.cards[thancred]!.zone).toBe('graveyard');
    expect(hasKeyword(s, s.cards[steiner]!, 'Indestructible')).toBe(false);
  });

  it("Krile Baldesion: a noncreature spell may return a creature card with the same mana value, once each turn", () => {
    let s = newGame();
    put(s, 'P1', id('Krile Baldesion'));
    const two = put(s, 'P1', 'coeurl', 'graveyard');
    const three = put(s, 'P1', 'al-bhed-salvagers', 'graveyard');
    const spells = [put(s, 'P1', 'dreams-of-laguna', 'hand'), put(s, 'P1', 'dreams-of-laguna', 'hand')];
    put(s, 'P1', 'coeurl', 'graveyard');
    mana(s, 'P1', { U: 2, C: 2 });
    let offered: string[] = [];
    s = settle(act(s, castSpell(spells[0]!)), {
      targets: (options) => {
        offered = options.map((o) => (o[0]?.kind === 'card' ? o[0].card : ''));
        return options.find((o) => o[0]?.kind === 'card' && o[0].card === two)!;
      },
    }).state;
    expect(offered).toContain(two);
    expect(offered).not.toContain(three);
    expect(s.cards[two]!.zone).toBe('hand');
    // Not again this turn.
    s = settle(act(s, castSpell(spells[1]!))).state;
    expect(s.players.P1!.graveyard.filter((c) => s.cards[c]!.defId === 'coeurl')).toHaveLength(1);
  });
});
