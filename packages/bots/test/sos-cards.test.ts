// Secrets of Strixhaven (SOS) and its Commander decks (SOC), built group by group (docs/strixhaven.md).

import { describe, expect, it } from 'vitest';
import { getLegalActions, powerOf, toughnessOf, type GameState } from '@nexus/engine';
import { act, cast, mana, newGame, put, rejected, settle } from './kit-helpers.ts';
import { planTaps } from '../src/mana.ts';

const card = (id: string) => ({ kind: 'card' as const, card: id });
const manaFrom = (s: GameState, id: string) => [...new Set(getLegalActions(s).filter((a) => a.type === 'ActivateManaAbility' && a.card === id).map((a) => (a as { mana: string }).mana))].sort();

describe('SOS1: lands', () => {
  it('the slow lands enter tapped unless you control two or more other lands', () => {
    let s = newGame();
    put(s, 'P1', 'swamp');
    const glade = put(s, 'P1', 'deathcap-glade', 'hand');
    s = act(s, { type: 'PlayLand', player: 'P1', card: glade });
    expect(s.cards[glade]!.tapped).toBe(true);
    let u = newGame();
    put(u, 'P1', 'island');
    put(u, 'P1', 'mountain');
    const coast = put(u, 'P1', 'stormcarved-coast', 'hand');
    u = act(u, { type: 'PlayLand', player: 'P1', card: coast });
    expect(u.cards[coast]!.tapped).toBe(false);
    expect(manaFrom(u, coast)).toEqual(['R', 'U']);
  });

  it('the college lands enter tapped and surveil 1 for four mana and a tap', () => {
    let s = newGame();
    const fields = put(s, 'P1', 'fields-of-strife', 'hand');
    s = act(s, { type: 'PlayLand', player: 'P1', card: fields });
    expect(s.cards[fields]!.tapped).toBe(true);
    s.cards[fields]!.tapped = false;
    expect(manaFrom(s, fields)).toEqual(['R', 'W']);
    mana(s, 'P1', { R: 1, W: 1, C: 2 });
    const top = s.players.P1!.library[0]!;
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: fields, ability: 0, targets: [] }, { surveilToGraveyard: true }).state;
    expect([s.cards[fields]!.tapped, s.cards[top]!.zone]).toEqual([true, 'graveyard']);
  });

  it('the Turbulent lands enter tapped unless an opponent controls eight or more lands', () => {
    let s = newGame();
    const fen = put(s, 'P1', 'turbulent-fen', 'hand');
    s = act(s, { type: 'PlayLand', player: 'P1', card: fen });
    expect(s.cards[fen]!.tapped).toBe(true);
    let u = newGame();
    for (let i = 0; i < 8; i++) put(u, 'P2', 'forest');
    const moor = put(u, 'P1', 'turbulent-moor', 'hand');
    u = act(u, { type: 'PlayLand', player: 'P1', card: moor });
    expect(u.cards[moor]!.tapped).toBe(false);
    expect(manaFrom(u, moor)).toEqual(['B', 'W']);
  });

  it('Great Hall of the Biblioplex: {C}, or 1 life for any color only for instants and sorceries; {5} makes it a 2/4 Wizard', () => {
    let s = newGame();
    const hall = put(s, 'P1', 'great-hall-of-the-biblioplex');
    expect(manaFrom(s, hall)).toEqual(['B', 'C', 'G', 'R', 'U', 'W']);
    s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: hall, mana: 'R' });
    expect([s.players.P1!.life, s.players.P1!.manaPool.R, s.players.P1!.restrictedMana?.instantOrSorcerySpell?.R]).toEqual([19, 0, 1]);
    // The restricted red pays for an instant, not a creature.
    const bolt = put(s, 'P1', 'lightning-bolt', 'hand');
    s = cast(s, { type: 'CastSpell', player: 'P1', card: bolt, targets: [{ kind: 'player', player: 'P2' }] }).state;
    expect(s.players.P2!.life).toBe(17);
    // Paying automatically only ever takes its {C}.
    let t = newGame();
    const hall2 = put(t, 'P1', 'great-hall-of-the-biblioplex');
    expect(planTaps(t, 'P1', '{R}')).toBeNull();
    expect(planTaps(t, 'P1', '{1}')).toEqual([{ card: hall2, mana: 'C' }]);
    // {5}: a 2/4 Wizard with "whenever you cast an instant or sorcery spell, this creature gets +1/+0".
    mana(t, 'P1', { C: 5 });
    t = cast(t, { type: 'ActivateAbility', player: 'P1', card: hall2, ability: 0, targets: [] }).state;
    expect([powerOf(t, t.cards[hall2]!), toughnessOf(t, t.cards[hall2]!)]).toEqual([2, 4]);
    mana(t, 'P1', { R: 1 });
    const bolt2 = put(t, 'P1', 'lightning-bolt', 'hand');
    t = cast(t, { type: 'CastSpell', player: 'P1', card: bolt2, targets: [{ kind: 'player', player: 'P2' }] }).state;
    expect(powerOf(t, t.cards[hall2]!)).toBe(3);
  });

  it('Petrified Hamlet: lands with the chosen name tap for {C} and can only activate mana abilities', () => {
    let s = newGame();
    const anchorage = put(s, 'P2', 'restless-anchorage');
    const peak = put(s, 'P1', 'coastal-peak', 'hand');
    const hamlet = put(s, 'P1', 'petrified-hamlet', 'hand');
    s = act(s, { type: 'PlayLand', player: 'P1', card: hamlet });
    expect(s.pending.kind).toBe('chooseOption');
    const options = (s.pending as { options: string[] }).options;
    expect(options).toEqual(expect.arrayContaining(['Restless Anchorage', 'Plains', 'Petrified Hamlet']));
    // Everyone sees the options, so a land in a hand isn't one.
    expect(options).not.toContain('Coastal Peak');
    s = act(s, { type: 'ChooseOption', player: 'P1', option: 'Restless Anchorage' });
    expect(manaFrom(s, hamlet)).toEqual(['C']);
    // Their mana abilities still work, with {C} added; their other abilities don't.
    s.pending = { kind: 'priority', player: 'P2', passes: 0 } as never;
    expect(manaFrom(s, anchorage)).toEqual(['C', 'U', 'W']);
    mana(s, 'P2', { C: 1, W: 1, U: 1 });
    expect(rejected(s, { type: 'ActivateAbility', player: 'P2', card: anchorage, ability: 0, targets: [] })).toMatch(/can’t be activated/);
    // Coastal Peak (another name) can still cycle; once it's the chosen name, it can't.
    mana(s, 'P1', { C: 2 });
    s.pending = { kind: 'priority', player: 'P1', passes: 0 } as never;
    expect(getLegalActions(s).some((a) => a.type === 'ActivateAbility' && a.card === peak)).toBe(true);
    let u = newGame();
    const peak2 = put(u, 'P1', 'coastal-peak', 'hand');
    put(u, 'P2', 'coastal-peak', 'graveyard');
    u = act(u, { type: 'PlayLand', player: 'P1', card: put(u, 'P1', 'petrified-hamlet', 'hand') });
    u = act(u, { type: 'ChooseOption', player: 'P1', option: 'Coastal Peak' });
    mana(u, 'P1', { C: 2 });
    expect(getLegalActions(u).some((a) => a.type === 'ActivateAbility' && a.card === peak2)).toBe(false);
  });

  it('Skycoach Waypoint: {3}, {T}: target creature becomes prepared', () => {
    let s = newGame();
    const waypoint = put(s, 'P1', 'skycoach-waypoint');
    const recollector = put(s, 'P1', 'bloodline-recollector-ancestral-craving');
    expect(manaFrom(s, waypoint)).toEqual(['C']);
    mana(s, 'P1', { C: 3 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: waypoint, ability: 0, targets: [card(recollector)] }).state;
    expect(s.cards[recollector]!.prepared).toBe(true);
  });
});
