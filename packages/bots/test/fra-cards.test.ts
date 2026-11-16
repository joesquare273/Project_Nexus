// Reality Fracture main set (FRA), built group by group (docs/reality-fracture.md).

import { describe, expect, it } from 'vitest';
import { currentDefinition, getLegalActions, powerOf, toughnessOf, type GameState } from '@nexus/engine';
import { act, cast, fight, mana, newGame, put } from './kit-helpers.ts';

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

describe('F2: empower Jace', () => {
  const jace = (s: GameState) => s.players.P1!.battlefield.map((id) => s.cards[id]!).find((c) => c.defId === 'jace-token-fra');
  const loyalty = (s: GameState) => jace(s)?.namedCounters?.loyalty ?? 0;

  it('creatures that empower as they enter or attack, and Campus Crier from the graveyard', () => {
    let s = newGame();
    const oculus = put(s, 'P1', 'mindseeker-oculus', 'hand');
    mana(s, 'P1', { U: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: oculus }).state;
    expect(loyalty(s)).toBe(4);
    const crier = put(s, 'P1', 'campus-crier', 'graveyard');
    mana(s, 'P1', { C: 1 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: crier, ability: 0, targets: [] }).state;
    expect([zone(s, crier), loyalty(s)]).toEqual(['exile', 6]);
    // Repurposed Enforcer: X is the number of creatures you control (Oculus and itself).
    const enforcer = put(s, 'P1', 'repurposed-enforcer');
    s = fight(s, [{ attacker: enforcer, defender: 'P2' }]).state;
    expect(loyalty(s)).toBe(8);
  });

  it('Overwrite the Multiverse exiles all creatures and empowers once for each', () => {
    let s = newGame();
    put(s, 'P1', 'thawbringer');
    put(s, 'P2', 'thawbringer');
    put(s, 'P2', 'archon-of-cruelty');
    const spell = put(s, 'P1', 'overwrite-the-multiverse', 'hand');
    mana(s, 'P1', { B: 2, C: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell }).state;
    expect(loyalty(s)).toBe(3);
    expect(s.players.P2!.battlefield.filter((id) => s.cards[id]!.zone === 'battlefield' && currentDefinition(s, s.cards[id]!).types.includes('creature'))).toHaveLength(0);
  });

  it('Violent Echoes empowers Jace by the excess damage only', () => {
    let s = newGame();
    const small = put(s, 'P2', 'thawbringer');
    const spell = put(s, 'P1', 'violent-echoes', 'hand');
    mana(s, 'P1', { R: 2, C: 2 });
    const toughness = toughnessOf(s, s.cards[small]!);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(small)] }).state;
    expect([zone(s, small), loyalty(s)]).toEqual(['graveyard', 6 - toughness]);
    // No excess: no Jace.
    let u = newGame();
    const big = put(u, 'P2', 'archon-of-cruelty');
    const spell2 = put(u, 'P1', 'violent-echoes', 'hand');
    mana(u, 'P1', { R: 2, C: 2 });
    u = cast(u, { type: 'CastSpell', player: 'P1', card: spell2, targets: [card(big)] }).state;
    expect(jace(u)).toBeUndefined();
  });

  it("Theorist's Proxy: the next spell you cast this turn can't be countered", () => {
    let s = newGame();
    const proxy = put(s, 'P1', 'theorists-proxy');
    mana(s, 'P1', { U: 1 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: proxy, ability: 0, targets: [] }).state;
    expect(zone(s, proxy)).toBe('graveyard');
    const bolt = put(s, 'P1', 'no-admittance', 'hand');
    mana(s, 'P1', { R: 1, C: 1 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: bolt, targets: [{ kind: 'player', player: 'P2' }] });
    expect(s.stack.find((i) => i.kind === 'spell')).toMatchObject({ uncounterable: true });
  });

  it("Inspired Tethermage grows whenever you put loyalty counters on a planeswalker; Vraska's Final Mercy can empower 6", () => {
    let s = newGame();
    const tethermage = put(s, 'P1', 'inspired-tethermage');
    const mercy = put(s, 'P1', 'vraskas-final-mercy', 'hand');
    mana(s, 'P1', { B: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: mercy, targets: [], mode: 1 }).state;
    expect([loyalty(s), s.players.P1!.life, s.cards[tethermage]!.counters]).toEqual([6, 18, 1]);
  });

  it("Tam's Resistance costs {1}{G/U} and Solve for Disappointment takes a nonland permanent card", () => {
    let s = newGame();
    expect(currentDefinition(s, s.cards[put(s, 'P1', 'tams-resistance', 'hand')]!).manaCost).toBe('{1}{G/U}');
    const land = put(s, 'P2', 'plains', 'hand');
    const creature = put(s, 'P2', 'thawbringer', 'hand');
    const solve = put(s, 'P1', 'solve-for-disappointment', 'hand');
    mana(s, 'P1', { B: 1, C: 1 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: solve, targets: [{ kind: 'player', player: 'P2' }] });
    s = act(act(s, { type: 'PassPriority', player: 'P1' }), { type: 'PassPriority', player: 'P2' });
    expect(s.pending.kind).toBe('chooseCards');
    expect((s.pending as { cards: string[] }).cards).toEqual([creature]);
    s = act(s, { type: 'ChooseCards', player: 'P1', cards: [creature] });
    expect([zone(s, creature), zone(s, land), loyalty(s)]).toEqual(['graveyard', 'hand', 1]);
  });
});
