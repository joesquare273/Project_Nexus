// The Final Fantasy Commander precon keyword and alternative-cast cards (C2,
// step 13): ward, convoke, delve, unearth, blitz, rebound, phasing and
// casting from the graveyard. Each is checked against its Oracle text with
// the real card data.

import { describe, expect, it } from 'vitest';
import { characteristics, getLegalActions, hasKeyword, powerOf, spellOptions, viewFor, type Action, type GameState } from '@nexus/engine';
import { CARD_IDS_BY_NAME } from '@nexus/cards';
import { act, card, cast, fight, goTo, mana, newGame, put, rejected, settle } from './kit-helpers.ts';

const id = (name: string) => {
  const found = CARD_IDS_BY_NAME[name];
  if (!found) throw new Error(`No card named ${name}`);
  return found;
};
const castSpell = (c: string, targets: string[] = [], extra: Partial<Extract<Action, { type: 'CastSpell' }>> = {}, player = 'P1'): Action => ({
  type: 'CastSpell',
  player,
  card: c,
  targets: targets.map(card),
  ...extra,
});
const pool = (s: GameState, pid = 'P1') => Object.values(s.players[pid]!.manaPool).reduce((n, k) => n + k, 0);
/** Answers the pending card choice with these cards. */
const choose = (s: GameState, cards: string[]) => {
  if (s.pending.kind !== 'chooseCards') throw new Error(`expected a card choice, not ${s.pending.kind}`);
  return settle(act(s, { type: 'ChooseCards', player: s.pending.player, cards })).state;
};
/** On to P1's next precombat main phase. */
const nextOwnMain = (s: GameState) => {
  do {
    s = goTo(s, 'end');
    s = goTo(s, 'main1');
  } while (s.activePlayer !== 'P1');
  return s;
};

describe('Ward', () => {
  it('Bronze Guardian: power equals your artifacts; it and your other artifacts have ward {2}', () => {
    let s = newGame();
    const guardian = put(s, 'P1', id('Bronze Guardian'));
    const helm = put(s, 'P1', 'champions-helm');
    expect(powerOf(s, s.cards[guardian]!)).toBe(2);
    expect([characteristics(s, s.cards[guardian]!).ward, characteristics(s, s.cards[helm]!).ward]).toEqual([2, 2]);
    expect(hasKeyword(s, s.cards[guardian]!, 'DoubleStrike')).toBe(true);
    // An opponent's spell targeting it costs {2} more.
    s = act(s, { type: 'PassPriority', player: 'P1' });
    const path = put(s, 'P2', 'path-to-exile', 'hand');
    mana(s, 'P2', { W: 1 });
    expect(rejected(s, castSpell(path, [guardian], {}, 'P2'))).toMatch(/Not enough mana/);
    const options = spellOptions(s, 'P2').filter((o) => o.action.card === path);
    expect(options.find((o) => o.action.targets?.[0]?.kind === 'card' && o.action.targets[0].card === guardian)?.cost).toEqual({ generic: 2, W: 1 });
    mana(s, 'P2', { C: 2 });
    s = settle(act(s, castSpell(path, [guardian], {}, 'P2'))).state;
    expect(s.cards[guardian]!.zone).toBe('exile');
    // With Bronze Guardian gone, the Equipment has no ward left.
    expect(characteristics(s, s.cards[helm]!).ward).toBe(0);
  });

  it("ward doesn't tax its controller, and an opponent's triggered ability can't target it", () => {
    let s = newGame();
    const dragon = put(s, 'P2', id('Hraesvelgr of the First Brood'));
    const path = put(s, 'P2', 'path-to-exile', 'hand');
    s = act(s, { type: 'PassPriority', player: 'P1' });
    expect(spellOptions(s, 'P2').find((o) => o.action.card === path && o.action.targets?.[0]?.kind === 'card' && o.action.targets[0].card === dragon)?.cost).toEqual({ generic: 0, W: 1 });
    // P1's Hraesvelgr trigger can't choose P2's ward creature.
    let t = newGame();
    const theirs = put(t, 'P2', id('Hraesvelgr of the First Brood'));
    const mine = put(t, 'P1', 'coeurl');
    const hraesvelgr = put(t, 'P1', id('Hraesvelgr of the First Brood'), 'hand');
    mana(t, 'P1', { U: 1, C: 4 });
    t = act(t, castSpell(hraesvelgr));
    t = settle(t, {
      targets: (options) => {
        expect(options.some((o) => o[0]?.kind === 'card' && o[0].card === theirs)).toBe(false);
        return options.find((o) => o[0]?.kind === 'card' && o[0].card === mine)!;
      },
    }).state;
    expect(powerOf(t, t.cards[mine]!)).toBe(3);
  });
});

describe('Hraesvelgr of the First Brood', () => {
  it('when it enters and whenever you cast a noncreature spell: target creature gets +1/+0 and can\'t be blocked', () => {
    let s = newGame();
    const coeurl = put(s, 'P1', 'coeurl');
    const hraesvelgr = put(s, 'P1', id('Hraesvelgr of the First Brood'), 'hand');
    mana(s, 'P1', { U: 1, C: 4 });
    const pick = (options: { kind: string; card?: string }[][]) => options.find((o) => o[0]?.kind === 'card' && o[0].card === coeurl)! as never;
    s = cast(s, castSpell(hraesvelgr), { targets: pick }).state;
    expect(powerOf(s, s.cards[coeurl]!)).toBe(3);
    expect(viewFor(s, 'P1').stats[coeurl]!.cantBeBlocked).toBe(true);
    const helm = put(s, 'P1', 'champions-helm', 'hand');
    mana(s, 'P1', { C: 3 });
    s = cast(s, castSpell(helm), { targets: pick }).state;
    expect(powerOf(s, s.cards[coeurl]!)).toBe(4);
    expect(hasKeyword(s, s.cards[hraesvelgr]!, 'Flying')).toBe(true);
  });
});

describe('Convoke', () => {
  it('Clever Concealment: creatures pay for {1} or their color; your permanents phase out until your next turn', () => {
    let s = newGame();
    const a = put(s, 'P1', 'coeurl');
    const b = put(s, 'P1', 'coeurl');
    const helm = put(s, 'P1', 'champions-helm', 'battlefield', { attachedTo: a });
    const concealment = put(s, 'P1', id('Clever Concealment'), 'hand');
    mana(s, 'P1', { C: 2 });
    const targets = [a, b, ...Array(4).fill(null)].map((t) => (t ? card(t) : { kind: 'none' as const }));
    // Two white creatures pay {W}{W}; the pool pays {2}.
    const offered = spellOptions(s, 'P1').filter((o) => o.action.card === concealment && o.action.type === 'CastSpell' && o.action.convoke?.length === 2);
    expect(offered[0]?.cost).toEqual({ generic: 2, W: 0 });
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: concealment, targets, convoke: [a, b] })).state;
    expect(pool(s)).toBe(0);
    expect([a, b, helm].every((c) => s.cards[c]!.phasedOut)).toBe(true);
    expect(s.players.P1!.battlefield).not.toContain(a);
    expect(s.players.P1!.phasedOut).toEqual(expect.arrayContaining([a, b, helm]));
    expect(viewFor(s, 'P1').players.P1!.phasedOut).toHaveLength(3);
    // Effects that look at the battlefield don't see them.
    expect(s.players.P1!.battlefield.some((c) => [a, b, helm].includes(c))).toBe(false);
    // Back at P1's next untap step, untapped, still equipped.
    s = nextOwnMain(s);
    expect(s.players.P1!.battlefield).toEqual(expect.arrayContaining([a, b, helm]));
    expect([s.cards[a]!.tapped, s.cards[a]!.phasedOut, s.cards[helm]!.attachedTo]).toEqual([false, undefined, a]);
  });

  it('Lethal Scheme: destroy target creature; each creature that convoked it connives', () => {
    let s = newGame();
    const rat = put(s, 'P1', 'undercity-dire-rat');
    const victim = put(s, 'P2', 'coeurl');
    put(s, 'P1', 'coeurl', 'library'); // drawn by conniving
    const land = put(s, 'P1', 'swamp', 'hand');
    const scheme = put(s, 'P1', id('Lethal Scheme'), 'hand');
    mana(s, 'P1', { B: 1, C: 2 });
    // The black rat pays one {B}.
    s = settle(act(s, castSpell(scheme, [victim], { convoke: [rat] }))).state;
    expect(s.cards[victim]!.zone).toBe('graveyard');
    expect(s.cards[rat]!.tapped).toBe(true);
    // Draw, then discard: a land gives no counter.
    s = choose(s, [land]);
    expect(s.cards[rat]!.counters ?? 0).toBe(0);
    // Again, discarding a nonland card this time.
    let t = newGame();
    const rat2 = put(t, 'P1', 'undercity-dire-rat');
    const victim2 = put(t, 'P2', 'coeurl');
    const drawn = put(t, 'P1', 'coeurl', 'library');
    const scheme2 = put(t, 'P1', id('Lethal Scheme'), 'hand');
    mana(t, 'P1', { B: 1, C: 2 });
    t = settle(act(t, castSpell(scheme2, [victim2], { convoke: [rat2] }))).state;
    t = choose(t, [drawn]);
    expect(t.cards[rat2]!.counters).toBe(1);
  });

  it("can't convoke with tapped creatures, or with more than the spell needs", () => {
    const s = newGame();
    const tapped = put(s, 'P1', 'undercity-dire-rat', 'battlefield', { tapped: true });
    const scheme = put(s, 'P1', id('Lethal Scheme'), 'hand');
    const victim = put(s, 'P2', 'coeurl');
    mana(s, 'P1', { B: 2, C: 2 });
    expect(rejected(s, castSpell(scheme, [victim], { convoke: [tapped] }))).toMatch(/untapped creatures/);
    const rats = [1, 2, 3, 4, 5].map(() => put(s, 'P1', 'undercity-dire-rat'));
    expect(rejected(s, castSpell(scheme, [victim], { convoke: rats }))).toMatch(/more creatures/);
  });
});

describe('Delve', () => {
  it('Dig Through Time: exile graveyard cards to pay; put two of the top seven into your hand, the rest on the bottom', () => {
    let s = newGame();
    const graveyard = [1, 2, 3, 4, 5, 6].map(() => put(s, 'P1', 'island', 'graveyard'));
    const top = [1, 2, 3, 4, 5, 6, 7].map(() => put(s, 'P1', 'coeurl', 'library')).reverse();
    const dig = put(s, 'P1', id('Dig Through Time'), 'hand');
    mana(s, 'P1', { U: 2 });
    s = settle(act(s, castSpell(dig, [], { delve: graveyard }))).state;
    expect(graveyard.every((g) => s.cards[g]!.zone === 'exile')).toBe(true);
    expect(s.pending).toMatchObject({ kind: 'chooseCards', purpose: 'hand', min: 2, max: 2 });
    // The chooser sees the cards; the opponent doesn't.
    expect(viewFor(s, 'P1').cards[top[0]!]).toBeDefined();
    expect(viewFor(s, 'P2').cards[top[0]!]).toBeUndefined();
    s = choose(s, [top[0]!, top[3]!]);
    expect(s.players.P1!.hand).toEqual(expect.arrayContaining([top[0], top[3]]));
    expect(s.players.P1!.library.slice(-5)).toEqual([top[1], top[2], top[4], top[5], top[6]]);
    expect(s.cards[dig]!.zone).toBe('graveyard');
  });

  it('delve pays only generic mana', () => {
    const s = newGame();
    const graveyard = [1, 2, 3, 4, 5, 6, 7].map(() => put(s, 'P1', 'island', 'graveyard'));
    const dig = put(s, 'P1', id('Dig Through Time'), 'hand');
    mana(s, 'P1', { U: 1 });
    expect(rejected(s, castSpell(dig, [], { delve: graveyard }))).toMatch(/more cards/);
  });
});

describe('Unearth', () => {
  it('Priest of Fell Rites: {T}, pay 3 life, sacrifice it: return a creature card; unearth brings it back with haste until the end step', () => {
    let s = newGame();
    const priest = put(s, 'P1', id('Priest of Fell Rites'));
    const dead = put(s, 'P1', 'coeurl', 'graveyard');
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: priest, ability: 0, targets: [card(dead)] }).state;
    expect([s.cards[dead]!.zone, s.cards[priest]!.zone, s.players.P1!.life]).toEqual(['battlefield', 'graveyard', 17]);
    // Unearth from the graveyard, as a sorcery.
    const unearth = getLegalActions(s).find((a) => a.type === 'ActivateAbility' && a.card === priest);
    expect(unearth).toBeUndefined(); // no mana yet
    mana(s, 'P1', { W: 1, B: 1, C: 3 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: priest, ability: 1, targets: [] }).state;
    expect(s.cards[priest]!.zone).toBe('battlefield');
    expect(hasKeyword(s, s.cards[priest]!, 'Haste')).toBe(true);
    s = goTo(s, 'end');
    expect(s.cards[priest]!.zone).toBe('exile');
  });

  it('an unearthed creature that would die is exiled instead', () => {
    let s = newGame();
    const priest = put(s, 'P1', id('Priest of Fell Rites'), 'graveyard');
    mana(s, 'P1', { W: 1, B: 1, C: 3 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: priest, ability: 1, targets: [] }).state;
    s = act(s, { type: 'PassPriority', player: 'P1' });
    const doom = put(s, 'P2', 'sephiroths-intervention', 'hand');
    mana(s, 'P2', { B: 1, C: 3 });
    s = settle(act(s, castSpell(doom, [priest], {}, 'P2'))).state;
    expect(s.cards[priest]!.zone).toBe('exile');
  });
});

describe('Blitz', () => {
  it('Sabin: cast from the graveyard for its blitz cost: haste, sacrificed at the end step, and its death draws a card', () => {
    let s = newGame();
    const sabin = put(s, 'P1', id('Sabin, Master Monk'), 'graveyard');
    const fodder = put(s, 'P1', 'island', 'hand');
    mana(s, 'P1', { R: 2, C: 2 });
    expect(rejected(s, castSpell(sabin))).toMatch(/blitz/);
    expect(getLegalActions(s)).toContainEqual(castSpell(sabin, [], { alternative: true, costCards: [fodder] }));
    s = settle(act(s, castSpell(sabin, [], { alternative: true, costCards: [fodder] }))).state;
    expect(s.cards[sabin]!.zone).toBe('battlefield');
    expect(s.cards[fodder]!.zone).toBe('graveyard');
    expect(hasKeyword(s, s.cards[sabin]!, 'Haste')).toBe(true);
    const r = fight(s, [{ attacker: sabin, defender: 'P2' }]);
    expect(r.state.players.P2!.life).toBe(12); // 4 double strike
    const hand = r.state.players.P1!.hand.length;
    s = settle(goTo(r.state, 'end')).state;
    expect(s.cards[sabin]!.zone).toBe('graveyard');
    expect(s.players.P1!.hand.length).toBe(hand + 1);
  });

  it('cast normally from hand, Sabin stays and its death draws nothing', () => {
    let s = newGame();
    const sabin = put(s, 'P1', id('Sabin, Master Monk'), 'hand');
    mana(s, 'P1', { R: 1, C: 4 });
    s = cast(s, castSpell(sabin)).state;
    s = goTo(s, 'end');
    expect(s.cards[sabin]!.zone).toBe('battlefield');
    const hand = s.players.P1!.hand.length;
    s = act(s, { type: 'PassPriority', player: 'P1' });
    const kill = put(s, 'P2', 'sephiroths-intervention', 'hand');
    mana(s, 'P2', { B: 1, C: 3 });
    s = settle(act(s, castSpell(kill, [sabin], {}, 'P2'))).state;
    expect([s.cards[sabin]!.zone, s.players.P1!.hand.length]).toEqual(['graveyard', hand]);
  });
});

describe('Rebound', () => {
  it('Transpose: draw, discard, lose 1 life, a Wizard; exiled, then cast free next turn without a second Wizard', () => {
    let s = newGame();
    put(s, 'P1', 'coeurl', 'library');
    const land = put(s, 'P1', 'swamp', 'hand');
    const transpose = put(s, 'P1', id('Transpose'), 'hand');
    mana(s, 'P1', { B: 1, C: 2 });
    s = settle(act(s, castSpell(transpose))).state;
    s = choose(s, [land]);
    const wizards = () => s.players.P1!.battlefield.filter((c) => s.cards[c]!.defId === 'wizard-token').length;
    expect([s.players.P1!.life, wizards(), s.cards[transpose]!.zone]).toEqual([19, 1, 'exile']);
    s = nextOwnMain(s);
    expect(getLegalActions(s)).toContainEqual(castSpell(transpose));
    s = settle(act(s, castSpell(transpose))).state;
    if (s.pending.kind === 'chooseCards') s = choose(s, [s.pending.cards[0]!]);
    expect([wizards(), s.cards[transpose]!.zone]).toEqual([1, 'graveyard']);
  });
});

describe('Casting from the graveyard', () => {
  it('Edgar: once during each of your turns, cast an artifact spell from your graveyard; it enters tapped', () => {
    let s = newGame();
    put(s, 'P1', id('Edgar, Master Machinist'));
    const helm = put(s, 'P1', 'champions-helm', 'graveyard');
    const scythe = put(s, 'P1', 'magitek-scythe', 'graveyard');
    mana(s, 'P1', { C: 7 });
    s = cast(s, castSpell(helm)).state;
    expect([s.cards[helm]!.zone, s.cards[helm]!.tapped]).toEqual(['battlefield', true]);
    expect(rejected(s, castSpell(scythe))).toMatch(/not in your hand/);
    // Not on an opponent's turn.
    s = goTo(s, 'end');
    s = goTo(s, 'main1');
    mana(s, 'P1', { C: 4 });
    expect(getLegalActions({ ...s, pending: { kind: 'priority', player: 'P1', passes: 0 } }).some((a) => a.type === 'CastSpell' && a.card === scythe)).toBe(false);
  });

  it('Edgar attacks: +X/+0, where X is the greatest mana value among your artifacts', () => {
    const s = newGame();
    const edgar = put(s, 'P1', id('Edgar, Master Machinist'));
    put(s, 'P1', 'magitek-scythe');
    put(s, 'P1', 'champions-helm');
    const r = fight(s, [{ attacker: edgar, defender: 'P2' }]);
    expect(r.state.players.P2!.life).toBe(14); // 2 + 4
  });

  it('Emet-Selch: when an opponent loses life, cast an instant or sorcery from your graveyard this turn ({2} less), then it is exiled', () => {
    let s = newGame();
    const emet = put(s, 'P1', id('Emet-Selch of the Third Seat'));
    const path = put(s, 'P1', 'path-to-exile', 'graveyard');
    const victim = put(s, 'P2', 'coeurl');
    const r = fight(s, [{ attacker: emet, defender: 'P2' }]);
    s = r.state;
    expect(s.cards[path]!.castPermission).toMatchObject({ player: 'P1', exileAfter: true });
    // Only once each turn: damage again doesn't trigger it again.
    expect(s.triggeredThisTurn).toContain(`${emet}#0`);
    s = goTo(s, 'main2');
    mana(s, 'P1', { W: 1 });
    s = settle(act(s, castSpell(path, [victim]))).state;
    expect([s.cards[victim]!.zone, s.cards[path]!.zone]).toEqual(['exile', 'exile']);
  });

  it("Emet-Selch's discount applies to flashback and blitz from the graveyard", () => {
    const s = newGame();
    put(s, 'P1', id('Emet-Selch of the Third Seat'));
    const sabin = put(s, 'P1', id('Sabin, Master Monk'), 'graveyard');
    put(s, 'P1', 'island', 'hand');
    const o = spellOptions(s, 'P1').find((x) => x.action.card === sabin);
    expect(o?.cost).toEqual({ generic: 0, R: 2 });
  });

  it('Torrential Gearhulk: cast target instant from your graveyard without paying its mana cost; exiled afterwards', () => {
    let s = newGame();
    const gearhulk = put(s, 'P1', id('Torrential Gearhulk'), 'hand');
    const mad = put(s, 'P1', 'path-to-exile', 'graveyard');
    const victim = put(s, 'P2', 'coeurl');
    mana(s, 'P1', { U: 2, C: 4 });
    s = cast(s, castSpell(gearhulk)).state;
    expect(s.cards[mad]!.castPermission).toMatchObject({ free: true, exileAfter: true });
    const option = spellOptions(s, 'P1').find((o) => o.action.card === mad);
    expect(option?.cost).toEqual({ generic: 0 });
    s = settle(act(s, castSpell(mad, [victim]))).state;
    expect([s.cards[victim]!.zone, s.cards[mad]!.zone, pool(s)]).toEqual(['exile', 'exile', 0]);
  });

  it('the permission lasts only this turn', () => {
    let s = newGame();
    const gearhulk = put(s, 'P1', id('Torrential Gearhulk'), 'hand');
    const mad = put(s, 'P1', 'path-to-exile', 'graveyard');
    mana(s, 'P1', { U: 2, C: 4 });
    s = cast(s, castSpell(gearhulk)).state;
    s = nextOwnMain(s);
    expect(spellOptions(s, 'P1').some((o) => o.action.card === mad)).toBe(false);
  });
});
