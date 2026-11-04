// Edge of Eternities precon cards, built group by group (docs/commander.md).
// Group 1: station and the Spacecraft (Inspirit, Flagship Vessel; Uthros
// Research Craft; Hearthhull, the Worldseed; Exploration Broodship).

import { describe, expect, it } from 'vitest';
import { activatedAbilities, currentDefinition, getLegalActions, hasKeyword, powerOf, type CardInstance, type GameState } from '@nexus/engine';

const hasType = (s: GameState, c: CardInstance, t: string) => (currentDefinition(s, c).types as string[]).includes(t);
import { act, card, cast, goTo, mana, newGame, put, rejected, settle } from './kit-helpers.ts';

const charge = (s: GameState, id: string) => s.cards[id]!.namedCounters?.charge ?? 0;
/** The Station ability's index on a card (it comes after the printed activated abilities). */
const stationIndex = (s: GameState, id: string) => activatedAbilities(currentDefinition(s, s.cards[id]!)).findIndex((a) => a.cost.station);

describe('Station', () => {
  it('tap another creature (even one that just arrived) as a sorcery: charge counters equal to its power', () => {
    let s = newGame();
    const ship = put(s, 'P1', 'inspirit-flagship-vessel');
    const cat = put(s, 'P1', 'coeurl', 'battlefield', { summoningSick: true });
    expect(hasType(s, s.cards[ship]!, 'creature')).toBe(false);
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: ship, ability: stationIndex(s, ship), costCards: [cat] }).state;
    expect(charge(s, ship)).toBe(powerOf(s, s.cards[cat]!));
    expect(s.cards[cat]!.tapped).toBe(true);
    // Not itself, not a tapped creature, and only as a sorcery.
    expect(rejected(s, { type: 'ActivateAbility', player: 'P1', card: ship, ability: stationIndex(s, ship), costCards: [cat] })).toBeTruthy();
    const other = put(s, 'P1', 'coeurl');
    s.step = 'beginCombat';
    expect(rejected(s, { type: 'ActivateAbility', player: 'P1', card: ship, ability: stationIndex(s, ship), costCards: [other] })).toMatch(/main phase/);
  });

  it('is offered as a legal play for each creature that could be tapped', () => {
    const s = newGame();
    const ship = put(s, 'P1', 'uthros-research-craft');
    const cats = [put(s, 'P1', 'coeurl'), put(s, 'P1', 'coeurl')];
    const ways = getLegalActions(s).filter((a) => a.type === 'ActivateAbility' && a.card === ship).map((a) => a.type === 'ActivateAbility' && a.costCards?.[0]);
    expect(ways.sort()).toEqual([...cats].sort());
  });
});

describe('Inspirit, Flagship Vessel', () => {
  it('at 8+ it is a 5/5 flying artifact creature, and your other artifacts have hexproof and indestructible', () => {
    const s = newGame();
    const ship = put(s, 'P1', 'inspirit-flagship-vessel', 'battlefield', { namedCounters: { charge: 7 } });
    const ring = put(s, 'P1', 'sol-ring');
    expect(hasType(s, s.cards[ship]!, 'creature')).toBe(false);
    expect(hasKeyword(s, s.cards[ring]!, 'Indestructible')).toBe(false);
    s.cards[ship]!.namedCounters = { charge: 8 };
    expect(hasType(s, s.cards[ship]!, 'creature')).toBe(true);
    expect(powerOf(s, s.cards[ship]!)).toBe(5);
    expect(hasKeyword(s, s.cards[ship]!, 'Flying')).toBe(true);
    expect(hasKeyword(s, s.cards[ring]!, 'Hexproof')).toBe(true);
    expect(hasKeyword(s, s.cards[ring]!, 'Indestructible')).toBe(true);
    expect(hasKeyword(s, s.cards[ship]!, 'Indestructible')).toBe(false);
  });

  it('at 1+, each combat on your turn: a +1/+1 counter or two charge counters on another artifact', () => {
    let s = newGame();
    put(s, 'P1', 'inspirit-flagship-vessel', 'battlefield', { namedCounters: { charge: 1 } });
    const other = put(s, 'P1', 'uthros-research-craft');
    s = goTo(s, 'beginCombat');
    expect(s.pending.kind).toBe('chooseModes');
    s = act(s, { type: 'ChooseModes', player: 'P1', modes: [1] });
    s = settle(s, { targets: (o) => o.find((t) => t[0]?.kind === 'card' && t[0].card === other)! }).state;
    for (let i = 0; i < 4 && s.pending.kind === 'priority' && s.stack.length; i++) s = act(s, { type: 'PassPriority', player: s.pending.player });
    expect(charge(s, other)).toBe(2);
  });

  it('without a charge counter, nothing happens at combat', () => {
    let s = newGame();
    put(s, 'P1', 'inspirit-flagship-vessel');
    put(s, 'P1', 'sol-ring');
    s = goTo(s, 'beginCombat');
    expect(s.stack).toHaveLength(0);
    expect(s.pending.kind).toBe('priority');
  });
});

describe('Uthros Research Craft', () => {
  it('at 3+, an artifact spell draws a card and adds a charge counter; at 12+ a flier with +1/+0 per artifact', () => {
    let s = newGame();
    const ship = put(s, 'P1', 'uthros-research-craft', 'battlefield', { namedCounters: { charge: 3 } });
    const ring = put(s, 'P1', 'sol-ring', 'hand');
    const hand = s.players.P1!.hand.length;
    mana(s, 'P1', { C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: ring }).state;
    expect(s.players.P1!.hand.length).toBe(hand); // Sol Ring left, a card came
    expect(charge(s, ship)).toBe(4);
    s.cards[ship]!.namedCounters = { charge: 12 };
    expect(hasType(s, s.cards[ship]!, 'creature')).toBe(true);
    expect(hasKeyword(s, s.cards[ship]!, 'Flying')).toBe(true);
    // Two artifacts: itself and Sol Ring.
    expect(powerOf(s, s.cards[ship]!)).toBe(2);
  });

  it('below 3 charge counters, artifact spells do nothing', () => {
    let s = newGame();
    const ship = put(s, 'P1', 'uthros-research-craft', 'battlefield', { namedCounters: { charge: 2 } });
    const ring = put(s, 'P1', 'sol-ring', 'hand');
    mana(s, 'P1', { C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: ring }).state;
    expect(charge(s, ship)).toBe(2);
  });
});

describe('Hearthhull, the Worldseed', () => {
  it('at 2+: {1}, {T}, sacrifice a land: draw two, and play an additional land this turn', () => {
    let s = newGame();
    const ship = put(s, 'P1', 'hearthhull-the-worldseed', 'battlefield', { namedCounters: { charge: 1 } });
    const land = put(s, 'P1', 'forest');
    mana(s, 'P1', { C: 1 });
    expect(rejected(s, { type: 'ActivateAbility', player: 'P1', card: ship, ability: 0, costCards: [land] })).toMatch(/2 or more charge/);
    s.cards[ship]!.namedCounters = { charge: 2 };
    const hand = s.players.P1!.hand.length;
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: ship, ability: 0, costCards: [land] }).state;
    expect(s.cards[land]!.zone).toBe('graveyard');
    expect(s.players.P1!.hand.length).toBe(hand + 2);
    const lands = [put(s, 'P1', 'forest', 'hand'), put(s, 'P1', 'forest', 'hand')];
    s = act(s, { type: 'PlayLand', player: 'P1', card: lands[0]! });
    s = act(s, { type: 'PlayLand', player: 'P1', card: lands[1]! });
    expect(lands.map((id) => s.cards[id]!.zone)).toEqual(['battlefield', 'battlefield']);
  });

  it('at 8+: a flying, vigilant, hasty creature, and each land you sacrifice drains each opponent for 2', () => {
    let s = newGame(3);
    const ship = put(s, 'P1', 'hearthhull-the-worldseed', 'battlefield', { namedCounters: { charge: 8 }, summoningSick: true });
    const land = put(s, 'P1', 'forest');
    expect(hasType(s, s.cards[ship]!, 'creature')).toBe(true);
    for (const k of ['Flying', 'Vigilance', 'Haste'] as const) expect(hasKeyword(s, s.cards[ship]!, k)).toBe(true);
    const life = [s.players.P2!.life, s.players.P3!.life];
    mana(s, 'P1', { C: 1 });
    // Haste: its {T} ability works the turn it arrives.
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: ship, ability: 0, costCards: [land] }).state;
    expect([s.players.P2!.life, s.players.P3!.life]).toEqual([life[0]! - 2, life[1]! - 2]);
  });
});

describe('Exploration Broodship', () => {
  it('at 3+: an additional land each of your turns', () => {
    let s = newGame();
    put(s, 'P1', 'exploration-broodship', 'battlefield', { namedCounters: { charge: 3 } });
    const lands = [put(s, 'P1', 'forest', 'hand'), put(s, 'P1', 'forest', 'hand'), put(s, 'P1', 'forest', 'hand')];
    s = act(s, { type: 'PlayLand', player: 'P1', card: lands[0]! });
    s = act(s, { type: 'PlayLand', player: 'P1', card: lands[1]! });
    expect(rejected(s, { type: 'PlayLand', player: 'P1', card: lands[2]! })).toMatch(/already played/);
  });

  it('at 8+: once each turn, a permanent spell from your graveyard by sacrificing a land too', () => {
    let s = newGame();
    const ship = put(s, 'P1', 'exploration-broodship', 'battlefield', { namedCounters: { charge: 8 } });
    const cats = [put(s, 'P1', 'coeurl', 'graveyard'), put(s, 'P1', 'coeurl', 'graveyard')];
    const land = put(s, 'P1', 'forest');
    const bolt = put(s, 'P1', 'lightning-bolt', 'graveyard');
    mana(s, 'P1', { W: 1, C: 1 });
    // A land is part of the cost: without one it's refused.
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: cats[0]!, graveyardSource: ship })).toMatch(/Sacrifice a land/);
    expect(getLegalActions(s).some((a) => a.type === 'CastSpell' && a.card === bolt)).toBe(false);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: cats[0]!, graveyardSource: ship, sacrificeLand: land }).state;
    expect(s.cards[cats[0]!]!.zone).toBe('battlefield');
    expect(s.cards[land]!.zone).toBe('graveyard');
    // Once each turn.
    put(s, 'P1', 'forest');
    mana(s, 'P1', { W: 1, C: 1 });
    expect(getLegalActions(s).some((a) => a.type === 'CastSpell' && a.card === cats[1])).toBe(false);
  });
});

void card;
