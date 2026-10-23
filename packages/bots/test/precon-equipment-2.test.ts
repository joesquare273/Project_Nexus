// More precon Equipment (base power and toughness, granted abilities, abilities
// that work only while attached) and one-offs. Checked against the Oracle text
// with the real card data.

import { describe, expect, it } from 'vitest';
import { canBlock, characteristics, getLegalActions, playableZone, type GameState } from '@nexus/engine';
import { act, card, cast, goTo, mana, newGame, put, rejected, settle } from './kit-helpers.ts';

const RAT = 'undercity-dire-rat';
const stats = (s: GameState, id: string) => characteristics(s, s.cards[id]!);
const nextOwn = (s: GameState, step: 'main1' | 'end') => {
  do {
    s = goTo(s, 'end');
    s = goTo(s, 'main1');
  } while (s.activePlayer !== 'P1');
  return step === 'end' ? goTo(s, 'end') : s;
};

describe('Equipment', () => {
  it('Wrecking Ball Arm: base 7/7, unblockable by power 2 or less; equip a legendary creature for {3}, anything for {7}', () => {
    let s = newGame();
    const arm = put(s, 'P1', 'wrecking-ball-arm');
    const rat = put(s, 'P1', RAT, 'battlefield', { counters: 1 });
    const zack = put(s, 'P1', 'zack-fair');
    mana(s, 'P1', { C: 3 });
    expect(rejected(s, { type: 'ActivateAbility', player: 'P1', card: arm, ability: 1, targets: [card(rat)] })).toMatch(/not legal/);
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: arm, ability: 1, targets: [card(zack)] }).state;
    expect([stats(s, zack).power, stats(s, zack).toughness]).toEqual([7, 7]);
    s.cards[arm]!.attachedTo = rat;
    expect([stats(s, rat).power, stats(s, rat).toughness]).toEqual([8, 8]); // 7/7 plus its +1/+1 counter
    const small = put(s, 'P2', 'stitchers-supplier');
    const big = put(s, 'P2', 'ruin-grinder');
    expect([canBlock(s, s.cards[small]!, s.cards[rat]!), canBlock(s, s.cards[big]!, s.cards[rat]!)]).toEqual([false, true]);
  });

  it('Conformer Shuriken: attacking taps a defending creature, and counters make up any power difference', () => {
    let s = newGame();
    const rat = put(s, 'P1', RAT);
    put(s, 'P1', 'conformer-shuriken', 'battlefield', { attachedTo: rat });
    const big = put(s, 'P2', 'ruin-grinder');
    s = goTo(s, 'declareAttackers', { accept: false });
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: rat, defender: 'P2' }] })).state;
    expect(s.cards[big]!.tapped).toBe(true);
    expect(stats(s, rat).power).toBe(stats(s, big).power);
  });

  it("Conqueror's Flail: +1/+1 per color among your permanents; opponents can't cast spells during your turn", () => {
    let s = newGame();
    const rat = put(s, 'P1', RAT); // black
    put(s, 'P1', 'zack-fair'); // white
    put(s, 'P1', 'conquerors-flail', 'battlefield', { attachedTo: rat });
    const base = s.cardDefs[RAT]!;
    expect(stats(s, rat).power).toBe(base.power! + 2);
    const offer = put(s, 'P2', 'an-offer-you-cant-refuse', 'hand');
    const harmonize = put(s, 'P1', 'harmonize', 'hand');
    mana(s, 'P1', { G: 2, C: 2 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: harmonize, targets: [] });
    s = act(s, { type: 'PassPriority', player: 'P1' });
    mana(s, 'P2', { U: 1 });
    expect(getLegalActions(s).some((a) => a.type === 'CastSpell' && a.card === offer)).toBe(false);
    expect(rejected(s, { type: 'CastSpell', player: 'P2', card: offer, targets: [card(harmonize)] })).toMatch(/can't cast spells/);
  });

  it("Dancer's Chakrams: +2/+2, lifelink and Performer, and other commanders you control get +2/+2 and lifelink while it's attached", () => {
    const s = newGame();
    const rat = put(s, 'P1', RAT);
    const commander = put(s, 'P1', 'zack-fair', 'battlefield', { isCommander: true });
    const chakrams = put(s, 'P1', 'dancers-chakrams');
    expect(stats(s, commander).power).toBe(0);
    s.cards[chakrams]!.attachedTo = rat;
    expect([stats(s, rat).keywords.has('Lifelink'), stats(s, rat).subtypes.includes('Performer')]).toEqual([true, true]);
    expect([stats(s, commander).power, stats(s, commander).keywords.has('Lifelink')]).toEqual([2, true]);
    // Attached to the commander itself, it doesn't count twice.
    s.cards[chakrams]!.attachedTo = commander;
    expect(stats(s, commander).power).toBe(2);
  });

  it("Astrologian's Planisphere: a +1/+1 counter for each noncreature spell you cast and your third card drawn each turn", () => {
    let s = newGame();
    for (let i = 0; i < 4; i++) put(s, 'P1', 'island', 'library');
    const rat = put(s, 'P1', RAT);
    put(s, 'P1', 'astrologians-planisphere', 'battlefield', { attachedTo: rat });
    expect(stats(s, rat).subtypes).toContain('Wizard');
    const harmonize = put(s, 'P1', 'harmonize', 'hand');
    mana(s, 'P1', { G: 2, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: harmonize, targets: [] }).state; // a noncreature spell, and draws 1-3
    expect(s.cards[rat]!.counters).toBe(2);
  });
});

describe('One-offs', () => {
  it('Phoenix Down: exile it to return a creature card with mana value 4 or less, tapped; or to exile a Spirit', () => {
    let s = newGame();
    const down = put(s, 'P1', 'phoenix-down');
    const rat = put(s, 'P1', RAT, 'graveyard');
    put(s, 'P1', 'sun-titan', 'graveyard'); // mana value 6: not a choice
    mana(s, 'P1', { W: 1, C: 1 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: down, ability: 0, targets: [card(rat)] }).state;
    expect([s.cards[rat]!.zone, s.cards[rat]!.tapped, s.cards[down]!.zone]).toEqual(['battlefield', true, 'exile']);

    let t = newGame();
    const down2 = put(t, 'P1', 'phoenix-down');
    const spirit = put(t, 'P2', 'spirit-token', 'battlefield', { isToken: true });
    mana(t, 'P1', { W: 1, C: 1 });
    t = cast(t, { type: 'ActivateAbility', player: 'P1', card: down2, ability: 1, targets: [card(spirit)] }).state;
    expect(t.cards[spirit]!.zone).not.toBe('battlefield');
  });

  it("Yuna's Decision: sacrifice a creature to draw, then put a creature and a land from your hand onto the battlefield", () => {
    let s = newGame();
    put(s, 'P1', 'island', 'library');
    const rat = put(s, 'P1', RAT);
    const creature = put(s, 'P1', 'ruin-grinder', 'hand');
    const land = put(s, 'P1', 'forest', 'hand');
    const decision = put(s, 'P1', 'yunas-decision', 'hand');
    mana(s, 'P1', { G: 1, C: 3 });
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: decision, targets: [], mode: 0 })).state;
    expect(s.pending).toMatchObject({ kind: 'chooseCards', purpose: 'sacrifice' });
    s = act(s, { type: 'ChooseCards', player: 'P1', cards: [rat] });
    s = act(s, { type: 'ChooseCards', player: 'P1', cards: [creature] });
    s = act(s, { type: 'ChooseCards', player: 'P1', cards: [land] });
    s = settle(s).state;
    expect([s.cards[rat]!.zone, s.cards[creature]!.zone, s.cards[land]!.zone]).toEqual(['graveyard', 'battlefield', 'battlefield']);
  });

  it("Yuna's Decision: or return one or two permanent cards from your graveyard to your hand", () => {
    let s = newGame();
    const a = put(s, 'P1', RAT, 'graveyard');
    const b = put(s, 'P1', 'forest', 'graveyard');
    const decision = put(s, 'P1', 'yunas-decision', 'hand');
    mana(s, 'P1', { G: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: decision, targets: [card(a), card(b)], mode: 1 }).state;
    expect([s.cards[a]!.zone, s.cards[b]!.zone]).toEqual(['hand', 'hand']);
  });

  it('Cait Sith: at combat, exile the top card to play this turn; a creature gets +X/+0 for its mana value', () => {
    let s = newGame();
    put(s, 'P1', 'cait-sith-fortune-teller');
    const rat = put(s, 'P1', RAT);
    const top = put(s, 'P1', 'sun-titan', 'library'); // mana value 6
    const pickRat = (options: { kind: string; card?: string }[][]) => options.find((o) => o[0]?.card === rat)! as never;
    s = goTo(s, 'beginCombat', { targets: pickRat });
    s = settle(s, { targets: pickRat }).state;
    expect([s.cards[top]!.zone, playableZone(s, 'P1', s.cards[top]!)]).toEqual(['exile', 'exile']);
    expect(stats(s, rat).power).toBe(s.cardDefs[RAT]!.power! + 6);
  });

  it('Furious Rise: with a power 4 creature, exile the top card at your end step; playable until the next one', () => {
    let s = newGame();
    put(s, 'P1', 'furious-rise');
    put(s, 'P1', 'ruin-grinder');
    for (let i = 0; i < 4; i++) put(s, 'P1', 'island', 'library');
    const first = s.players.P1!.library[0]!;
    s = goTo(s, 'end');
    s = settle(s).state;
    expect([s.cards[first]!.zone, playableZone(s, 'P1', s.cards[first]!)]).toEqual(['exile', 'exile']);
    s = nextOwn(s, 'end');
    s = settle(s).state;
    expect(playableZone(s, 'P1', s.cards[first]!)).toBeNull();
  });

  it('Avalanche of Sector 7: power equal to the artifacts your opponents control; it pings them when they use one', () => {
    let s = newGame();
    const avalanche = put(s, 'P1', 'avalanche-of-sector-7');
    const treasure = put(s, 'P2', 'treasure-token', 'battlefield', { isToken: true });
    put(s, 'P2', 'thought-vessel');
    expect(stats(s, avalanche).power).toBe(2);
    s = act(s, { type: 'PassPriority', player: 'P1' });
    s = act(s, { type: 'ActivateManaAbility', player: 'P2', card: treasure, mana: 'R' });
    s = settle(act(s, { type: 'PassPriority', player: 'P2' })).state;
    expect(s.players.P2!.life).toBe(19);
  });
});
