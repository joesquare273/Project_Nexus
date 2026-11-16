// Reality Fracture's Commander precon (Multiverse Reforged), built group by
// group (docs/commander.md, R1-R5).

import { describe, expect, it } from 'vitest';
import { currentDefinition, getLegalActions, hasKeyword, powerOf, toughnessOf, type GameState } from '@nexus/engine';
import { act, card, cast, fight, goTo, mana, newGame, put, rejected } from './kit-helpers.ts';

const zone = (s: GameState, id: string) => s.cards[id]!.zone;
const pool = (s: GameState) => s.players.P1!.manaPool;
const manaFrom = (s: GameState, id: string) => [...new Set(getLegalActions(s).filter((a) => a.type === 'ActivateManaAbility' && a.card === id).map((a) => (a as { mana: string }).mana))].sort();

describe('R1: lands and mana', () => {
  it('the Signets turn {1} into two colors; Mystic Gate filters {W/U} into two', () => {
    let s = newGame();
    const signets = ['azorius-signet', 'dimir-signet', 'izzet-signet', 'rakdos-signet'].map((id) => put(s, 'P1', id));
    const gate = put(s, 'P1', 'mystic-gate');
    // Nothing to pay with: no mana from them (Mystic Gate still makes {C}).
    for (const id of signets) expect(manaFrom(s, id)).toEqual([]);
    expect(manaFrom(s, gate)).toEqual(['C']);
    mana(s, 'P1', { C: 4 });
    for (const id of signets) s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: id, mana: currentDefinition(s, s.cards[id]!).manaAbility!.paid!.outputs[0]!.includes('W') ? 'W' : 'U', output: 0, payWith: 0 });
    expect([pool(s).W, pool(s).U, pool(s).B, pool(s).R, pool(s).C]).toEqual([1, 3, 2, 2, 0]);
    // Mystic Gate: pay {W} (or {U}) for {W}{W}, {W}{U} or {U}{U}.
    s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: gate, mana: 'U', output: 2, payWith: 0 });
    expect([pool(s).W, pool(s).U]).toEqual([0, 5]);
  });

  it('Reflecting Pool makes any type a land you control could make, and nothing alone', () => {
    const s = newGame();
    const reflecting = put(s, 'P1', 'reflecting-pool');
    expect(manaFrom(s, reflecting)).toEqual([]);
    put(s, 'P1', 'plains');
    put(s, 'P1', 'mystic-gate');
    expect(manaFrom(s, reflecting)).toEqual(['C', 'W']);
  });

  it('the Turbulent lands enter tapped unless your opponents control eight or more lands', () => {
    let s = newGame();
    const shore = put(s, 'P1', 'turbulent-shore', 'hand');
    let t = act(s, { type: 'PlayLand', player: 'P1', card: shore });
    expect(t.cards[shore]!.tapped).toBe(true);
    expect(manaFrom({ ...t, cards: { ...t.cards, [shore]: { ...t.cards[shore]!, tapped: false } } }, shore)).toEqual(['U', 'W']);
    for (let i = 0; i < 8; i++) put(s, 'P2', 'island');
    t = act(s, { type: 'PlayLand', player: 'P1', card: shore });
    expect(t.cards[shore]!.tapped).toBe(false);
  });

  it('the Landscapes fetch one of their three basic types, tapped, and cycle', () => {
    let s = newGame();
    const land = put(s, 'P1', 'contaminated-landscape');
    const forest = put(s, 'P1', 'forest', 'library');
    const swamp = put(s, 'P1', 'swamp', 'library');
    expect(manaFrom(s, land)).toEqual(['C']);
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: land, ability: 0 }).state;
    expect([zone(s, land), zone(s, swamp), zone(s, forest)]).toEqual(['graveyard', 'battlefield', 'library']);
    expect(s.cards[swamp]!.tapped).toBe(true);
    // Cycling {U}{R}{W} from the hand.
    let u = newGame();
    const perilous = put(u, 'P1', 'perilous-landscape', 'hand');
    mana(u, 'P1', { U: 1, R: 1, W: 1 });
    const cycle = getLegalActions(u).find((a) => a.type === 'ActivateAbility' && a.card === perilous)!;
    u = cast(u, cycle).state;
    expect(zone(u, perilous)).toBe('graveyard');
    expect(u.players.P1!.hand).toHaveLength(1);
  });

  it('Kher Keep makes a 0/1 red Kobold named Kobolds of Kher Keep', () => {
    let s = newGame();
    const keep = put(s, 'P1', 'kher-keep');
    expect(manaFrom(s, keep)).toEqual(['C']);
    mana(s, 'P1', { R: 1, C: 1 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: keep, ability: 0 }).state;
    const kobold = s.players.P1!.battlefield.map((id) => s.cards[id]!).find((c) => c.defId === 'kobolds-of-kher-keep-token')!;
    expect(currentDefinition(s, kobold)).toMatchObject({ name: 'Kobolds of Kher Keep', colors: ['R'], power: 0, toughness: 1 });
    expect(s.cards[keep]!.tapped).toBe(true);
  });

  it('Restless Anchorage becomes a 2/3 flying Bird until end of turn and makes a Map when it attacks; the Map explores', () => {
    let s = newGame();
    const anchorage = put(s, 'P1', 'restless-anchorage', 'hand');
    let t = act(s, { type: 'PlayLand', player: 'P1', card: anchorage });
    expect(t.cards[anchorage]!.tapped).toBe(true);
    s.players.P1!.hand = [];
    s.players.P1!.battlefield.push(anchorage);
    s.cards[anchorage]!.zone = 'battlefield';
    mana(s, 'P1', { W: 1, U: 1, C: 1 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: anchorage, ability: 0 }).state;
    const c = s.cards[anchorage]!;
    expect(currentDefinition(s, c).types).toEqual(expect.arrayContaining(['land', 'creature']));
    expect([powerOf(s, c), toughnessOf(s, c), hasKeyword(s, c, 'Flying')]).toEqual([2, 3, true]);
    expect(currentDefinition(s, c).colors).toEqual(['W', 'U']);
    t = fight(s, [{ attacker: anchorage, defender: 'P2' }]).state;
    expect(t.players.P2!.life).toBe(s.players.P2!.life - 2);
    const map = t.players.P1!.battlefield.find((id) => t.cards[id]!.defId === 'map-token')!;
    expect(map).toBeDefined();
    // At cleanup it's only a land again.
    t = goTo(t, 'end');
    t = goTo(t, 'upkeep');
    expect(currentDefinition(t, t.cards[anchorage]!).types).toEqual(['land']);
    // The Map: {1}, {T}, sacrifice: target creature you control explores (a land on top goes to the hand).
    let m = newGame();
    const token = put(m, 'P1', 'map-token');
    const bear = put(m, 'P1', 'thawbringer');
    const top = put(m, 'P1', 'plains', 'library');
    mana(m, 'P1', { C: 1 });
    m = cast(m, { type: 'ActivateAbility', player: 'P1', card: token, ability: 0, targets: [card(bear)] }).state;
    expect(zone(m, top)).toBe('hand');
    expect(m.players.P1!.battlefield).not.toContain(token);
  });

  it('Restless Spire becomes a 2/1 Elemental with first strike during your turn only, and scries 1 when it attacks', () => {
    let s = newGame();
    const spire = put(s, 'P1', 'restless-spire');
    mana(s, 'P1', { U: 1, R: 1 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: spire, ability: 0 }).state;
    const c = s.cards[spire]!;
    expect([powerOf(s, c), toughnessOf(s, c), hasKeyword(s, c, 'FirstStrike')]).toEqual([2, 1, true]);
    // On an opponent's turn it has no first strike.
    const theirs = { ...s, activePlayer: 'P2' };
    expect(hasKeyword(theirs, theirs.cards[spire]!, 'FirstStrike')).toBe(false);
    // Not a creature, no first strike, before it's animated.
    const plain = newGame();
    const idle = put(plain, 'P1', 'restless-spire');
    expect(hasKeyword(plain, plain.cards[idle]!, 'FirstStrike')).toBe(false);
    expect(rejected(plain, { type: 'ActivateAbility', player: 'P1', card: idle, ability: 0 })).toBeTruthy();
    const after = fight(s, [{ attacker: spire, defender: 'P2' }], {}, { surveilToGraveyard: false }).state;
    expect(after.players.P2!.life).toBe(s.players.P2!.life - 2);
  });
});
