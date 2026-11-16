// Reality Fracture main set (FRA), built group by group (docs/reality-fracture.md).

import { describe, expect, it } from 'vitest';
import { currentDefinition, getLegalActions, powerOf, toughnessOf, type GameState } from '@nexus/engine';
import { act, cast, mana, newGame, put } from './kit-helpers.ts';

const zone = (s: GameState, id: string) => s.cards[id]!.zone;
const card = (id: string) => ({ kind: 'card' as const, card: id });
const manaFrom = (s: GameState, id: string) => [...new Set(getLegalActions(s).filter((a) => a.type === 'ActivateManaAbility' && a.card === id).map((a) => (a as { mana: string }).mana))].sort();

describe('F1: lands', () => {
  it('the Commons and Annexes enter tapped unless you control a planeswalker', () => {
    let s = newGame();
    const annex = put(s, 'P1', 'fatehold-annex', 'hand');
    s = act(s, { type: 'PlayLand', player: 'P1', card: annex });
    expect(s.cards[annex]!.tapped).toBe(true);
    s.cards[annex]!.tapped = false;
    expect(manaFrom(s, annex)).toEqual(['U', 'W']);
    let u = newGame();
    put(u, 'P1', 'elspeth-suns-champion', 'battlefield', { namedCounters: { loyalty: 4 } });
    const commons = put(u, 'P1', 'dedicated-commons', 'hand');
    u = act(u, { type: 'PlayLand', player: 'P1', card: commons });
    expect(u.cards[commons]!.tapped).toBe(false);
  });

  it('the portal view lands enter tapped unless you control two or more other lands', () => {
    let s = newGame();
    put(s, 'P1', 'plains');
    const beach = put(s, 'P1', 'deserted-beach', 'hand');
    s = act(s, { type: 'PlayLand', player: 'P1', card: beach });
    expect(s.cards[beach]!.tapped).toBe(true);
    let u = newGame();
    put(u, 'P1', 'plains');
    put(u, 'P1', 'island');
    const ridge = put(u, 'P1', 'haunted-ridge', 'hand');
    u = act(u, { type: 'PlayLand', player: 'P1', card: ridge });
    expect(u.cards[ridge]!.tapped).toBe(false);
  });

  it("Theorist's Sanctum: behold a Jace (one you control, or one revealed from your hand) or it enters tapped; {2}{U}, {T}: empower Jace 2", () => {
    let s = newGame();
    const sanctum = put(s, 'P1', 'theorists-sanctum', 'hand');
    s = act(s, { type: 'PlayLand', player: 'P1', card: sanctum });
    expect(s.cards[sanctum]!.tapped).toBe(true);
    // A Jace card in hand to reveal.
    let u = newGame();
    put(u, 'P1', 'jace-multiverse-architect', 'hand');
    const sanctum2 = put(u, 'P1', 'theorists-sanctum', 'hand');
    u = act(u, { type: 'PlayLand', player: 'P1', card: sanctum2, reveal: true });
    expect(u.cards[sanctum2]!.tapped).toBe(false);
    expect(manaFrom(u, sanctum2)).toEqual(['U']);
    mana(u, 'P1', { U: 1, C: 2 });
    u = cast(u, { type: 'ActivateAbility', player: 'P1', card: sanctum2, ability: 0, targets: [] }).state;
    const jace = u.players.P1!.battlefield.map((id) => u.cards[id]!).find((c) => c.defId === 'jace-token-fra')!;
    expect(jace.namedCounters?.loyalty).toBe(2);
  });

  it('Room of Refuge taps for the chosen color and sacrifices for two +1/+1 counters', () => {
    let s = newGame();
    const room = put(s, 'P1', 'room-of-refuge', 'battlefield', { chosenColor: 'G' });
    expect(manaFrom(s, room)).toEqual(['G']);
    const bear = put(s, 'P1', 'thawbringer');
    mana(s, 'P1', { C: 5 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: room, ability: 0, targets: [card(bear)] }).state;
    expect([zone(s, room), s.cards[bear]!.counters]).toEqual(['graveyard', 2]);
  });

  it('Roiling Canopy pumps a creature when a Forest enters while you control five other Forests', () => {
    let s = newGame();
    put(s, 'P1', 'roiling-canopy');
    for (let i = 0; i < 4; i++) put(s, 'P1', 'forest');
    const bear = put(s, 'P1', 'thawbringer');
    const fifth = put(s, 'P1', 'forest', 'hand');
    s = cast(s, { type: 'PlayLand', player: 'P1', card: fifth }).state;
    expect(powerOf(s, s.cards[bear]!)).toBe(currentDefinition(s, s.cards[bear]!).power); // only four other Forests then
    s.players.P1!.landsPlayedThisTurn = 0;
    const sixth = put(s, 'P1', 'forest', 'hand');
    s = cast(s, { type: 'PlayLand', player: 'P1', card: sixth }).state;
    expect(powerOf(s, s.cards[bear]!)).toBe((currentDefinition(s, s.cards[bear]!).power ?? 0) + 3);
  });

  it('Hall of Echoes becomes a copy of your creature until end of turn, and the legend rule is off for you this turn', () => {
    let s = newGame();
    const hall = put(s, 'P1', 'hall-of-echoes');
    const legend = put(s, 'P1', 'tamiyo-upriser-crowned');
    mana(s, 'P1', { C: 5 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: hall, ability: 0, targets: [card(legend)] }).state;
    expect(currentDefinition(s, s.cards[hall]!).name).toBe('Tamiyo, Upriser Crowned');
    // Two Tamiyos, both kept.
    expect([zone(s, hall), zone(s, legend)]).toEqual(['battlefield', 'battlefield']);
    expect(toughnessOf(s, s.cards[hall]!)).toBe(toughnessOf(s, s.cards[legend]!));
    s.turnNumber++;
    expect(currentDefinition(s, s.cards[hall]!).name).toBe('Hall of Echoes');
  });
});
