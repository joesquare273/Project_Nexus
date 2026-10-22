// The precon cards built on "up to N targets" and support (C2, step 2 of the
// handoff), each checked against its Oracle text with the real card data.

import { describe, expect, it } from 'vitest';
import { getLegalActions, type Action, type GameState, type Target } from '@nexus/engine';
import { CARD_IDS_BY_NAME } from '@nexus/cards';
import { act, card, cast, fight, goTo, mana, newGame, put, rejected, settle } from './kit-helpers.ts';

const id = (name: string) => {
  const found = CARD_IDS_BY_NAME[name];
  if (!found) throw new Error(`No card named ${name}`);
  return found;
};
const zone = (s: GameState, c: string) => s.cards[c]!.zone;
const none: Target = { kind: 'none' };
const castSpell = (c: string, extra: Partial<Extract<Action, { type: 'CastSpell' }>> = {}): Action => ({
  type: 'CastSpell',
  player: 'P1',
  card: c,
  targets: [],
  ...extra,
});
/** Picks the trigger's target list matching `want` (cards by id, or none). */
const pickTargets = (want: Target[]) => (options: Target[][]) => {
  const found = options.find((o) => JSON.stringify(o) === JSON.stringify(want));
  if (!found) throw new Error(`No such target choice: ${JSON.stringify(want)} among ${JSON.stringify(options.slice(0, 5))}`);
  return found;
};

describe('up to N targets', () => {
  it('General Leo returns up to one small creature, then gets a counter per creature you control', () => {
    let s = newGame();
    const rat = put(s, 'P1', 'undercity-dire-rat', 'graveyard');
    const leo = put(s, 'P1', id('General Leo Cristophe'), 'hand');
    mana(s, 'P1', { W: 1, C: 4 });
    s = cast(s, castSpell(leo), { targets: pickTargets([card(rat)]) }).state;
    expect(zone(s, rat)).toBe('battlefield');
    expect(s.cards[leo]!.counters).toBe(2);

    // With nothing to return, the counters still come.
    let t = newGame();
    const leo2 = put(t, 'P1', id('General Leo Cristophe'), 'hand');
    mana(t, 'P1', { W: 1, C: 4 });
    t = cast(t, castSpell(leo2)).state;
    expect(t.cards[leo2]!.counters).toBe(1);
  });

  it('Angel of the Ruins exiles up to two different artifacts or enchantments, or none', () => {
    let s = newGame();
    const a = put(s, 'P2', 'sol-ring');
    const b = put(s, 'P2', 'sol-ring');
    const angel = put(s, 'P1', id('Angel of the Ruins'), 'hand');
    mana(s, 'P1', { W: 2, C: 5 });
    s = act(s, castSpell(angel));
    s = act(s, { type: 'PassPriority', player: 'P1' });
    s = act(s, { type: 'PassPriority', player: 'P2' });
    expect(s.pending.kind).toBe('chooseTargets');
    const choices = getLegalActions(s).flatMap((x) => (x.type === 'ChooseTargets' ? [x.targets] : []));
    expect(choices.some((t) => t[0]!.kind === 'card' && JSON.stringify(t[0]) === JSON.stringify(t[1]))).toBe(false);
    expect(rejected(s, { type: 'ChooseTargets', player: 'P1', targets: [card(a), card(a)] })).toMatch(/different/);
    s = settle(act(s, { type: 'ChooseTargets', player: 'P1', targets: [card(a), card(b)] })).state;
    expect([zone(s, a), zone(s, b)]).toEqual(['exile', 'exile']);
  });

  it('Sepulchral Primordial takes up to one creature card from each opponent’s graveyard', () => {
    let s = newGame(3);
    const r2 = put(s, 'P2', 'undercity-dire-rat', 'graveyard');
    const r2b = put(s, 'P2', 'undercity-dire-rat', 'graveyard');
    const r3 = put(s, 'P3', 'undercity-dire-rat', 'graveyard');
    const primordial = put(s, 'P1', id('Sepulchral Primordial'), 'hand');
    mana(s, 'P1', { B: 2, C: 5 });
    s = act(s, castSpell(primordial));
    for (const p of ['P1', 'P2', 'P3']) s = act(s, { type: 'PassPriority', player: p });
    expect(rejected(s, { type: 'ChooseTargets', player: 'P1', targets: [card(r2), card(r2b), none] })).toMatch(/different players/);
    s = settle(act(s, { type: 'ChooseTargets', player: 'P1', targets: [card(r2), card(r3), none] })).state;
    expect([zone(s, r2), zone(s, r3), zone(s, r2b)]).toEqual(['battlefield', 'battlefield', 'graveyard']);
    expect(s.cards[r2]!.controller).toBe('P1');
  });

  it('Key to the City: discard a card so up to one creature can’t be blocked; pay {2} to draw when it untaps', () => {
    let s = newGame();
    const key = put(s, 'P1', id('Key to the City'));
    const rat = put(s, 'P1', 'undercity-dire-rat');
    const junk = put(s, 'P1', 'island', 'hand');
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: key, ability: 0, targets: [card(rat)], costCards: [junk] }).state;
    expect(zone(s, junk)).toBe('graveyard');
    expect(s.cards[key]!.tapped).toBe(true);
    // Next turn it untaps: pay {2} to draw. (P1's untap step comes after P2's turn.)
    s = goTo(s, 'end');
    s = goTo(s, 'upkeep'); // P2's turn
    s = goTo(s, 'end');
    s.players.P1!.manaPool.C = 0;
    s = goTo(s, 'upkeep', { accept: false }); // P1's turn: the trigger asks, P1 can't pay
    expect(s.cards[key]!.tapped).toBe(false);
  });
});

describe('support and counters', () => {
  it('Generous Patron supports two other creatures; counters on an opponent’s creature draw a card', () => {
    let s = newGame();
    const mine = put(s, 'P1', 'undercity-dire-rat');
    const theirs = put(s, 'P2', 'undercity-dire-rat');
    const patron = put(s, 'P1', id('Generous Patron'), 'hand');
    mana(s, 'P1', { G: 1, C: 2 });
    s = cast(s, castSpell(patron), { targets: pickTargets([card(mine), card(theirs)]) }).state;
    expect([s.cards[mine]!.counters, s.cards[theirs]!.counters, s.cards[patron]!.counters]).toEqual([1, 1, undefined]);
    expect(s.players.P1!.hand).toHaveLength(1);
  });

  it('Together Forever: support 2; {1} saves a creature with a counter (back to hand if it dies)', () => {
    let s = newGame();
    const rat = put(s, 'P1', 'undercity-dire-rat');
    const together = put(s, 'P1', id('Together Forever'), 'hand');
    mana(s, 'P1', { W: 2 });
    s = cast(s, castSpell(together), { targets: pickTargets([card(rat), none]) }).state;
    expect(s.cards[rat]!.counters).toBe(1);
    mana(s, 'P1', { C: 1 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: together, ability: 0, targets: [card(rat)] }).state;
    const vindicate = put(s, 'P1', id('Vindicate'), 'hand');
    mana(s, 'P1', { W: 1, B: 1, C: 1 });
    s = cast(s, castSpell(vindicate, { targets: [card(rat)] })).state;
    expect(zone(s, rat)).toBe('hand');
  });

  it('Wakka destroys up to one artifact of the player it hit, then grows the team at end of turn', () => {
    let s = newGame(3);
    const wakka = put(s, 'P1', id('Wakka, Devoted Guardian'));
    const friend = put(s, 'P1', 'undercity-dire-rat');
    const theirs = put(s, 'P2', 'sol-ring');
    const other = put(s, 'P3', 'sol-ring');
    s = fight(s, [{ attacker: wakka, defender: 'P2' }], {}, { targets: (o) => o.find((t) => t[0]!.kind === 'card')! }).state;
    expect([zone(s, theirs), zone(s, other)]).toEqual(['graveyard', 'battlefield']);
    expect(s.cards[wakka]!.counters).toBe(1);
    s = goTo(s, 'end');
    s = settle(s).state;
    expect(s.cards[friend]!.counters).toBe(1);
  });

  it('Rampant Rejuvenator enters with two counters and fetches that many basic lands when it dies', () => {
    let s = newGame();
    const plant = put(s, 'P1', id('Rampant Rejuvenator'), 'hand');
    mana(s, 'P1', { G: 1, C: 3 });
    s = cast(s, castSpell(plant)).state;
    expect(s.cards[plant]!.counters).toBe(2);
    const vindicate = put(s, 'P1', id('Vindicate'), 'hand');
    mana(s, 'P1', { W: 1, B: 1, C: 1 });
    s = cast(s, castSpell(vindicate, { targets: [card(plant)] })).state;
    expect(s.players.P1!.battlefield.map((c) => s.cards[c]!.defId)).toEqual(['island', 'island']);
  });
});

describe('lands and Equipment', () => {
  it('Cultivate puts one basic land onto the battlefield tapped and one into your hand', () => {
    let s = newGame();
    const spell = put(s, 'P1', id('Cultivate'), 'hand');
    mana(s, 'P1', { G: 1, C: 2 });
    s = cast(s, castSpell(spell)).state;
    expect(s.players.P1!.battlefield.map((c) => s.cards[c]!.tapped)).toEqual([true]);
    expect(s.players.P1!.hand).toHaveLength(1);
  });

  it("Archaeomancer's Map fetches two basic Plains, and lets you catch up on lands", () => {
    let s = newGame();
    put(s, 'P1', 'plains', 'library');
    put(s, 'P1', 'plains', 'library');
    const map = put(s, 'P1', id("Archaeomancer's Map"), 'hand');
    mana(s, 'P1', { W: 1, C: 2 });
    s = cast(s, castSpell(map)).state;
    expect(s.players.P1!.hand.map((c) => s.cards[c]!.defId)).toEqual(['plains', 'plains']);
    // P2 plays a land and has more lands than P1: P1 may put a land from hand onto the battlefield.
    put(s, 'P2', 'island');
    s.activePlayer = 'P2';
    s.pending = { kind: 'priority', player: 'P2', passes: 0 };
    s = act(s, { type: 'PlayLand', player: 'P2', card: put(s, 'P2', 'island', 'hand') });
    s = settle(s).state;
    expect(s.pending.kind).toBe('chooseCards');
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [s.players.P1!.hand[0]!] })).state;
    expect(s.players.P1!.battlefield.filter((c) => s.cards[c]!.defId === 'plains')).toHaveLength(1);
  });

  it('Barret makes a Rebel when an Equipment enters, and attaches an Equipment to a Rebel each combat', () => {
    let s = newGame();
    put(s, 'P1', id('Barret, Avalanche Leader'));
    const sledge = put(s, 'P1', id('Behemoth Sledge'), 'hand');
    mana(s, 'P1', { G: 1, W: 1, C: 1 });
    s = cast(s, castSpell(sledge)).state;
    const rebel = s.players.P1!.battlefield.find((c) => s.cards[c]!.defId === 'rebel-token');
    expect(rebel).toBeDefined();
    s = goTo(s, 'beginCombat', { targets: pickTargets([card(sledge), card(rebel!)]) });
    s = settle(s, { targets: pickTargets([card(sledge), card(rebel!)]) }).state;
    expect(s.cards[sledge]!.attachedTo).toBe(rebel);
  });
});
