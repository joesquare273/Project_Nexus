// Casting exiled cards without paying their mana costs: Strago and Relm,
// Kefka, Dancing Mad, Summon: Esper Valigarmanda and Fight Rigging (hideaway).

import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions, hasKeyword, viewFor } from '@nexus/engine';
import type { GameState } from '@nexus/engine';
import { act, goTo, mana, newGame, put, settle } from './kit-helpers.ts';

const RAT = 'undercity-dire-rat';
const castFree = (s: GameState, card: string, p = 'P1') => act(s, { type: 'CastSpell', player: p, card, targets: [] });
const castable = (s: GameState, card: string) => getLegalActions(s).some((a) => a.type === 'CastSpell' && a.card === card);

describe.each([2, 3, 4])('%i players', (n) => {
  it('Strago and Relm: the opponent exiles until a creature; it is cast free, gains haste, and is sacrificed at the end step', () => {
    let s = newGame(n);
    const strago = put(s, 'P1', 'strago-and-relm');
    const rat = put(s, 'P2', RAT, 'library');
    const land = put(s, 'P2', 'island', 'library');
    mana(s, 'P1', { R: 1, C: 2 });
    s = settle(act(s, { type: 'ActivateAbility', player: 'P1', card: strago, ability: 0, targets: [{ kind: 'player', player: 'P2' }] })).state;
    expect([s.cards[land]!.zone, s.cards[rat]!.zone]).toEqual(['exile', 'exile']);
    expect(castable(s, land)).toBe(false);
    s = settle(castFree(s, rat)).state;
    expect(s.cards[rat]).toMatchObject({ zone: 'battlefield', controller: 'P1', sacrificeAtEndStep: true });
    expect(getLegalActions(s).length).toBeGreaterThan(0);
    s = goTo(s, 'end');
    expect(s.cards[rat]!.zone).toBe('graveyard');
    expect(s.players.P2!.graveyard).toContain(rat);
  });

  it('Strago and Relm: only as a sorcery', () => {
    const s = newGame(n);
    const strago = put(s, 'P1', 'strago-and-relm');
    mana(s, 'P1', { R: 1, C: 2 });
    s.step = 'beginCombat';
    expect(applyAction(s, { type: 'ActivateAbility', player: 'P1', card: strago, ability: 0, targets: [{ kind: 'player', player: 'P2' }] }).ok).toBe(false);
  });

  it('Kefka: indestructible on your turn; at your end step the exiled sorcery is cast free at once and its owner loses life', () => {
    let s = newGame(n);
    const kefka = put(s, 'P1', 'kefka-dancing-mad');
    expect(hasKeyword(s, s.cards[kefka]!, 'Indestructible')).toBe(true);
    const spell = put(s, 'P2', 'harmonize', 'graveyard');
    s = goTo(s, 'end');
    expect(s.cards[spell]!.zone).toBe('exile');
    // A sorcery, cast during the end step.
    expect(castable(s, spell)).toBe(true);
    const life = s.players.P2!.life;
    s = settle(castFree(s, spell)).state;
    expect(s.players.P2!.life).toBe(life - 4);
    expect(s.cards[spell]!.zone).toBe('graveyard');
    s.activePlayer = 'P2';
    expect(hasKeyword(s, s.cards[kefka]!, 'Indestructible')).toBe(false);
  });

  it('Summon: Esper Valigarmanda: I exiles an instant or sorcery from each graveyard; II adds {R}{R} and one may be cast with any mana', () => {
    let s = newGame(n);
    const mine = put(s, 'P1', 'harmonize', 'graveyard');
    const theirs = put(s, 'P2', 'into-the-story', 'graveyard');
    const esper = put(s, 'P1', 'summon-esper-valigarmanda', 'hand');
    mana(s, 'P1', { R: 1, C: 3 });
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: esper, targets: [] })).state;
    expect([s.cards[mine]!.zone, s.cards[theirs]!.zone]).toEqual(['exile', 'exile']);
    expect(viewFor(s, 'P2').cards[mine]).toBeDefined();
    // Chapter II on P1's next turn.
    s = goTo(s, 'end');
    for (let i = 1; i < n; i++) s = goTo(goTo(s, 'main1'), 'end');
    s = goTo(s, 'main1');
    expect(s.players.P1!.manaPool.R).toBe(2);
    expect(s.castGroups?.at(-1)).toMatchObject({ source: esper, anyManaType: true });
    // Harmonize ({2}{G}{G}) with red mana only.
    mana(s, 'P1', { R: 2 });
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: mine, targets: [], castGroup: s.castGroups!.at(-1)!.id })).state;
    expect(s.cards[mine]!.zone).toBe('graveyard');
    // Only one per chapter.
    expect(castable(s, theirs)).toBe(false);
  });

  it('Fight Rigging: hideaway 5, then a free play once you control a creature with power 7 or greater', () => {
    let s = newGame(n);
    const hidden = put(s, 'P1', 'harmonize', 'library');
    const rig = put(s, 'P1', 'fight-rigging', 'hand');
    mana(s, 'P1', { G: 1, C: 2 });
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: rig, targets: [] })).state;
    expect(s.pending).toMatchObject({ kind: 'chooseCards', player: 'P1', purpose: 'hideaway' });
    expect(viewFor(s, 'P2').cards[hidden]).toBeUndefined();
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [hidden] })).state;
    expect(s.cards[hidden]!.zone).toBe('exile');
    expect(s.players.P1!.library.length).toBe(20);
    expect(viewFor(s, 'P1').cards[hidden]).toBeDefined();
    expect(viewFor(s, 'P2').cards[hidden]).toBeUndefined();

    const rat = put(s, 'P1', RAT);
    s = goTo(s, 'beginCombat');
    expect(s.cards[rat]!.counters).toBe(1);
    expect(castable(s, hidden)).toBe(false);

    // Next turn, with a 7-power creature.
    s.cards[rat]!.counters = 6;
    s = goTo(s, 'end');
    for (let i = 1; i < n; i++) s = goTo(goTo(s, 'main1'), 'end');
    s = goTo(s, 'beginCombat');
    expect(castable(s, hidden)).toBe(true);
    s = settle(castFree(s, hidden)).state;
    expect(s.cards[hidden]!.zone).toBe('graveyard');
  });
});
