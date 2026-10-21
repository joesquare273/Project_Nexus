import { describe, expect, it } from 'vitest';
import { canPay, manaValue, parseManaCost, planPayment } from '../src/index.ts';
import { emptyManaPool } from '../src/state.ts';
import { act, addMana, eventsOf, newGame, pass, passAll, put, rejected, setTurn, zoneOf } from './helpers.ts';

const player = (p: string) => ({ kind: 'player' as const, player: p });
const card = (c: string) => ({ kind: 'card' as const, card: c });

describe('mana costs', () => {
  it('parses standard notation', () => {
    expect(parseManaCost('{2}{R}{W}')).toEqual({ generic: 2, R: 1, W: 1 });
    expect(parseManaCost('{10}')).toEqual({ generic: 10 });
    expect(manaValue(parseManaCost('{3}{U}{U}'))).toBe(5);
    expect(() => parseManaCost('{X}{R}')).toThrow(/Unsupported/);
    expect(() => parseManaCost('2R')).toThrow(/Malformed/);
  });

  it('pays colored symbols first, then generic from colorless before colors', () => {
    const pool = { ...emptyManaPool(), R: 2, W: 1, C: 1 };
    expect(planPayment(pool, parseManaCost('{2}{R}'))).toEqual({ R: 1, C: 1, W: 1 });
    expect(canPay(pool, parseManaCost('{R}{R}{R}'))).toBe(false);
    expect(canPay(pool, parseManaCost('{4}'))).toBe(true);
    expect(canPay(pool, parseManaCost('{5}'))).toBe(false);
  });
});

describe('lands and mana abilities', () => {
  it('allows one land per turn, only at sorcery speed', () => {
    let s = newGame(2);
    const [a, b] = [put(s, 'P1', 'mountain', 'hand'), put(s, 'P1', 'plains', 'hand')];
    s = act(s, { type: 'PlayLand', player: 'P1', card: a }).state;
    expect(zoneOf(s, a)).toBe('battlefield');
    expect(rejected(s, { type: 'PlayLand', player: 'P1', card: b })).toMatch(/already played a land/);

    const upkeep = setTurn(newGame(2), 'P1', 'upkeep');
    const c = put(upkeep, 'P1', 'mountain', 'hand');
    expect(rejected(upkeep, { type: 'PlayLand', player: 'P1', card: c })).toMatch(/main phase/);
  });

  it('taps lands for one mana of a type they produce', () => {
    let s = newGame(2);
    const town = put(s, 'P1', 'town');
    s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: town, mana: 'W' }).state;
    expect(s.players.P1!.manaPool.W).toBe(1);
    expect(rejected(s, { type: 'ActivateManaAbility', player: 'P1', card: town, mana: 'W' })).toMatch(/already tapped/);
    const other = put(s, 'P1', 'town');
    expect(rejected(s, { type: 'ActivateManaAbility', player: 'P1', card: other, mana: 'U' })).toMatch(/can't produce/);
  });

  it('puts lands that enter tapped onto the battlefield tapped', () => {
    let s = newGame(2);
    const town = put(s, 'P1', 'town', 'hand');
    s = act(s, { type: 'PlayLand', player: 'P1', card: town }).state;
    expect(s.cards[town]!.tapped).toBe(true);
  });
});

describe('casting and resolving', () => {
  it('resolves last in, first out, with responses from around the table', () => {
    let s = newGame(3);
    const shock = put(s, 'P1', 'shock', 'hand');
    const mend = put(s, 'P2', 'mend', 'hand');
    addMana(s, 'P1', { R: 1 });
    addMana(s, 'P2', { W: 1 });

    s = act(s, { type: 'CastSpell', player: 'P1', card: shock, targets: [player('P2')] }).state;
    s = pass(s).state; // P1 passes; P2 responds
    s = act(s, { type: 'CastSpell', player: 'P2', card: mend, targets: [] }).state;
    expect(s.stack.map((i) => i.kind === 'spell' && i.card)).toEqual([shock, mend]);

    const first = passAll(s);
    expect(eventsOf(first.events, 'StackItemResolved').map((e) => e.card)).toEqual([mend]);
    expect(first.state.players.P2!.life).toBe(23);
    const second = passAll(first.state);
    expect(eventsOf(second.events, 'StackItemResolved').map((e) => e.card)).toEqual([shock]);
    expect(second.state.players.P2!.life).toBe(21);
    expect(zoneOf(second.state, shock)).toBe('graveyard');
    expect(second.state.step).toBe('main1');
  });

  it('enforces sorcery timing', () => {
    const s = newGame(2);
    const study = put(s, 'P1', 'study', 'hand');
    const theirs = put(s, 'P2', 'study', 'hand');
    addMana(s, 'P1', { U: 2 });
    addMana(s, 'P2', { U: 2 });
    const upkeep = setTurn(structuredClone(s), 'P1', 'upkeep');
    expect(rejected(upkeep, { type: 'CastSpell', player: 'P1', card: study })).toMatch(/main phase/);

    const p2HasPriority = pass(s).state;
    expect(rejected(p2HasPriority, { type: 'CastSpell', player: 'P2', card: theirs })).toMatch(/main phase/);
  });

  it('lets flash creatures be cast at instant speed', () => {
    let s = pass(newGame(2)).state;
    const ambusher = put(s, 'P2', 'ambusher', 'hand');
    addMana(s, 'P2', { U: 1, C: 1 });
    s = act(s, { type: 'CastSpell', player: 'P2', card: ambusher }).state;
    s = passAll(s).state;
    expect(s.cards[ambusher]).toMatchObject({ zone: 'battlefield', controller: 'P2', summoningSick: true });
  });

  it('rejects spells the player cannot pay for, and checks targets', () => {
    const s = newGame(2);
    const shock = put(s, 'P1', 'shock', 'hand');
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: shock, targets: [player('P2')] })).toMatch(/mana/);
    addMana(s, 'P1', { R: 1 });
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: shock, targets: [] })).toMatch(/needs 1 target/);
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: shock, targets: [card(shock)] })).toMatch(/not legal/);
  });

  it('a spell whose only target is gone does nothing', () => {
    let s = newGame(2);
    const bear = put(s, 'P2', 'bear');
    const shock = put(s, 'P1', 'shock', 'hand');
    const murder = put(s, 'P2', 'murder', 'hand');
    addMana(s, 'P1', { R: 1 });
    addMana(s, 'P2', { B: 2 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: shock, targets: [card(bear)] }).state;
    s = pass(s).state;
    s = act(s, { type: 'CastSpell', player: 'P2', card: murder, targets: [card(bear)] }).state;
    s = passAll(s).state; // murder resolves
    expect(zoneOf(s, bear)).toBe('graveyard');
    const r = passAll(s); // shock tries to resolve
    expect(eventsOf(r.events, 'StackItemResolved')[0]).toMatchObject({ card: shock, fizzled: true });
    expect(eventsOf(r.events, 'DamageDealt')).toHaveLength(0);
    expect(zoneOf(r.state, shock)).toBe('graveyard');
  });

  it('applies effects that hit each opponent or each player', () => {
    let s = newGame(4);
    const volley = put(s, 'P1', 'volley', 'hand');
    addMana(s, 'P1', { R: 2 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: volley }).state;
    s = passAll(s).state;
    expect(['P1', 'P2', 'P3', 'P4'].map((p) => s.players[p]!.life)).toEqual([20, 19, 19, 19]);
  });

  it('draws cards for the caster', () => {
    let s = newGame(3);
    const study = put(s, 'P1', 'study', 'hand');
    addMana(s, 'P1', { U: 2 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: study }).state;
    s = passAll(s).state;
    expect(s.players.P1!.hand).toHaveLength(2);
  });
});
