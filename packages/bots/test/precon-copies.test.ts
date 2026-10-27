// Copies: Espers to Magicite (an artifact token copy of a creature card),
// Summon: Good King Mog XII (token copies from a delayed trigger) and Blue
// Mage's Cane (cast a copy of an instant or sorcery for {3}).

import { describe, expect, it } from 'vitest';
import { currentDefinition, getLegalActions } from '@nexus/engine';
import type { GameState } from '@nexus/engine';
import { act, goTo, mana, newGame, put, settle } from './kit-helpers.ts';

const RAT = 'undercity-dire-rat';
const castable = (s: GameState, card: string) => getLegalActions(s).some((a) => a.type === 'CastSpell' && a.card === card);
const tokens = (s: GameState, p = 'P1') => s.players[p]!.battlefield.filter((id) => s.cards[id]!.isToken);

describe.each([2, 3, 4])('%i players', (n) => {
  it("Espers to Magicite: exiles each opponent's graveyard and makes an artifact copy of a chosen creature card", () => {
    let s = newGame(n);
    const mine = put(s, 'P1', 'harmonize', 'graveyard');
    const creature = put(s, 'P2', 'kefka-dancing-mad', 'graveyard');
    const spell = put(s, 'P2', 'harmonize', 'graveyard');
    const espers = put(s, 'P1', 'espers-to-magicite', 'hand');
    mana(s, 'P1', { B: 1, C: 3 });
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: espers, targets: [] })).state;
    expect([s.cards[creature]!.zone, s.cards[spell]!.zone, s.cards[mine]!.zone]).toEqual(['exile', 'exile', 'graveyard']);
    expect(s.pending).toMatchObject({ kind: 'chooseCards', player: 'P1', purpose: 'artifactCopy', cards: [creature] });
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [creature] })).state;
    const [token] = tokens(s);
    const def = currentDefinition(s, s.cards[token!]!);
    expect(def.name).toBe('Kefka, Dancing Mad');
    expect(def.types).toEqual(['artifact']);
    expect(def.subtypes ?? []).toEqual([]);
    expect(def.supertypes).toContain('Legendary');
    // It keeps the abilities: Kefka's end step trigger.
    expect(def.triggers?.[0]?.when).toBe('EndStep');
  });

  it('Espers to Magicite: choosing none makes no token', () => {
    let s = newGame(n);
    put(s, 'P2', RAT, 'graveyard');
    const espers = put(s, 'P1', 'espers-to-magicite', 'hand');
    mana(s, 'P1', { B: 1, C: 3 });
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: espers, targets: [] })).state;
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [] })).state;
    expect(tokens(s)).toEqual([]);
  });

  it('Summon: Good King Mog XII: I makes two Moogles; II copies a token per noncreature spell this turn; IV grows the other Moogles', () => {
    let s = newGame(n);
    const mog = put(s, 'P1', 'summon-good-king-mog-xii', 'hand');
    mana(s, 'P1', { W: 1, C: 4 });
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: mog, targets: [] })).state;
    expect(tokens(s).map((id) => s.cards[id]!.defId)).toEqual(['moogle-token', 'moogle-token']);

    // Chapter II on P1's next turn.
    s = goTo(s, 'end');
    for (let i = 1; i < n; i++) s = goTo(goTo(s, 'main1'), 'end');
    s = goTo(s, 'main1');
    expect(s.delayedTriggers).toHaveLength(1);
    const creature = put(s, 'P1', RAT, 'hand');
    mana(s, 'P1', { B: 3 });
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: creature, targets: [] })).state;
    expect(tokens(s)).toHaveLength(2);
    const spell = put(s, 'P1', 'harmonize', 'hand');
    mana(s, 'P1', { G: 2, C: 2 });
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [] })).state;
    expect(tokens(s)).toHaveLength(3);
    expect(currentDefinition(s, s.cards[tokens(s)[2]!]!).name).toBe('Moogle');

    // The delayed trigger ends with the turn.
    s = goTo(s, 'end');
    s = goTo(goTo(s, 'main1'), 'end');
    expect(s.delayedTriggers ?? []).toHaveLength(0);
  });

  it('Summon: Good King Mog XII: IV puts two +1/+1 counters on each other Moogle you control', () => {
    let s = newGame(n);
    const mog = put(s, 'P1', 'summon-good-king-mog-xii', 'battlefield', { namedCounters: { lore: 3 } });
    const moogle = put(s, 'P1', 'moogle-token', 'battlefield', { isToken: true });
    const theirs = put(s, 'P2', 'moogle-token', 'battlefield', { isToken: true });
    s = goTo(s, 'end');
    for (let i = 1; i < n; i++) s = goTo(goTo(s, 'main1'), 'end');
    s = goTo(s, 'main1');
    expect([s.cards[moogle]!.counters ?? 0, s.cards[theirs]!.counters ?? 0]).toEqual([2, 0]);
    expect(s.cards[mog]!.zone).toBe('graveyard');
  });

  it("Blue Mage's Cane: job select, +0/+2 and Wizard; attacking exiles an instant or sorcery from the defender's graveyard, castable for {3}", () => {
    let s = newGame(n);
    const cane = put(s, 'P1', 'blue-mages-cane', 'hand');
    mana(s, 'P1', { U: 1, C: 2 });
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: cane, targets: [] })).state;
    const hero = s.cards[cane]!.attachedTo!;
    expect(s.cards[hero]!.defId).toBe('hero-token');
    const heroDef = currentDefinition(s, s.cards[hero]!);
    expect(heroDef.subtypes).toContain('Wizard');

    const spell = put(s, 'P2', 'harmonize', 'graveyard');
    const own = put(s, 'P1', 'into-the-story', 'graveyard');
    s.cards[hero]!.summoningSick = false;
    s = goTo(s, 'declareAttackers');
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: hero, defender: 'P2' }] }), {
      targets: (options) => options.find((o) => o[0]?.kind === 'card' && o[0].card === spell)!,
    }).state;
    expect([s.cards[spell]!.zone, s.cards[own]!.zone]).toEqual(['exile', 'graveyard']);
    // Harmonize, a sorcery, for {3} during combat.
    expect(castable(s, spell)).toBe(false);
    mana(s, 'P1', { C: 3 });
    expect(castable(s, spell)).toBe(true);
    const hand = s.players.P1!.hand.length;
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [] })).state;
    expect(s.players.P1!.hand.length).toBe(hand + 3);
    // The copy is gone; the card stays exiled.
    expect(s.cards[spell]!.zone).toBe('exile');
    expect(s.players.P1!.manaPool.C).toBe(0);
  });
});
