import { describe, expect, it } from 'vitest';
import { applyAction, characteristics, countOf, type GameState } from '@nexus/engine';
import { dealDamage, moveCard } from '../../engine/src/state.ts';
import { act, card, cast, goTo, mana, newGame, put, rejected, settle } from './kit-helpers.ts';

function choose(s: GameState, cards: string[]): GameState {
  if (s.pending.kind !== 'chooseCards') throw new Error(`Not choosing cards: ${s.pending.kind}`);
  return settle(act(s, { type: 'ChooseCards', player: s.pending.player, cards })).state;
}

function upkeep(s: GameState): GameState {
  s.activePlayer = s.turnOrder.at(-1)!;
  s.step = 'end';
  s.pending = { kind: 'priority', player: s.activePlayer, passes: 0 };
  return settle(goTo(s, 'upkeep')).state;
}

describe.each([2, 3, 4])('%i-player counter and ability triggers', (players) => {
  it('Forgotten Ancient offers a counter for every player’s spell, and may decline', () => {
    let s = newGame(players);
    const ancient = put(s, 'P1', 'forgotten-ancient');
    for (const [i, pid] of s.turnOrder.entries()) {
      s.activePlayer = pid;
      s.pending = { kind: 'priority', player: pid, passes: 0 };
      const spell = put(s, pid, 'sol-ring', 'hand');
      mana(s, pid, { C: 1 });
      s = cast(s, { type: 'CastSpell', player: pid, card: spell, targets: [] }).state;
      expect(s.cards[ancient]!.counters).toBe(i + 1);
    }
    const pid = s.activePlayer;
    const declined = put(s, pid, 'arcane-signet', 'hand');
    mana(s, pid, { C: 2 });
    s = cast(s, { type: 'CastSpell', player: pid, card: declined, targets: [] }, { accept: false }).state;
    expect(s.cards[ancient]!.counters).toBe(players);
  });

  it('Forgotten Ancient distributes any subset, including onto opponents, and preserves its input state', () => {
    let s = newGame(players);
    const ancient = put(s, 'P1', 'forgotten-ancient', 'battlefield', { counters: 4 });
    const own = put(s, 'P1', 'undercity-dire-rat');
    const enemy = put(s, 'P2', 'undercity-dire-rat');
    s = upkeep(s);
    expect(s.pending).toMatchObject({ kind: 'chooseCards', purpose: 'distributeCounter', counterCount: 4 });
    expect(rejected(s, { type: 'ChooseCards', player: 'P1', cards: [ancient] })).toMatch(/offered/);
    const before = structuredClone(s);
    const input = s;
    s = choose(s, [own]);
    expect(input).toEqual(before);
    expect(before.cards[ancient]!.counters).toBe(4);
    expect(before.resolving!.distribution!.assigned).toEqual({});
    // No counters move until the distribution is finished.
    expect(s.cards[ancient]!.counters).toBe(4);
    s = choose(s, [own]);
    s = choose(s, [enemy]);
    s = choose(s, []);
    expect([s.cards[ancient]!.counters, s.cards[own]!.counters, s.cards[enemy]!.counters]).toEqual([1, 2, 1]);
    expect(s.pending.kind).toBe('priority');
  });

  it('distribution puts each recipient’s allocation on together, so Hardened Scales adds one per recipient', () => {
    let s = newGame(players);
    const ancient = put(s, 'P1', 'forgotten-ancient', 'battlefield', { counters: 3 });
    const recipient = put(s, 'P1', 'undercity-dire-rat');
    put(s, 'P1', 'hardened-scales');
    s = upkeep(s);
    s = choose(s, [recipient]);
    s = choose(s, [recipient]);
    s = choose(s, [recipient]); // assigning the last counter finishes automatically
    expect(s.cards[ancient]!.counters ?? 0).toBe(0);
    expect(s.cards[recipient]!.counters).toBe(4);
  });

  it('Forgotten Ancient can leave every counter where it is', () => {
    let s = newGame(players);
    const ancient = put(s, 'P1', 'forgotten-ancient', 'battlefield', { counters: 3 });
    const other = put(s, 'P2', 'undercity-dire-rat');
    s = choose(upkeep(s), []);
    expect(s.cards[ancient]!.counters).toBe(3);
    expect(s.cards[other]!.counters ?? 0).toBe(0);
  });

  it('Estinien grows for a noncreature spell and gains flying until cleanup', () => {
    let s = newGame(players);
    const estinien = put(s, 'P1', 'estinien-varlineau');
    const ring = put(s, 'P1', 'sol-ring', 'hand');
    mana(s, 'P1', { C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: ring, targets: [] }).state;
    expect(s.cards[estinien]!.counters).toBe(1);
    expect(characteristics(s, s.cards[estinien]!).keywords.has('Flying')).toBe(true);
    s = goTo(s, 'upkeep');
    expect(characteristics(s, s.cards[estinien]!).keywords.has('Flying')).toBe(false);
  });

  it('Estinien counts distinct opponents hit by itself or any Dragon and draws/loses that much in main two', () => {
    let s = newGame(players);
    const estinien = put(s, 'P1', 'estinien-varlineau');
    const dragon = put(s, 'P2', 'hellkite-tyrant');
    const rat = put(s, 'P1', 'undercity-dire-rat');
    const ctx = { s, ev: [] };
    dealDamage(ctx, estinien, { kind: 'player', player: 'P2' }, 1, true);
    dealDamage(ctx, dragon, { kind: 'player', player: 'P2' }, 1, true); // the same opponent counts once
    if (players > 2) dealDamage(ctx, dragon, { kind: 'player', player: 'P3' }, 1, true);
    dealDamage(ctx, rat, { kind: 'player', player: 'P2' }, 1, true); // non-Dragon is not counted
    dealDamage(ctx, dragon, { kind: 'player', player: 'P1' }, 1, true); // you are not an opponent
    const amount = players > 2 ? 2 : 1;
    expect(countOf(s, 'OpponentsDamagedBySourceOrDragonThisTurn', 'P1', estinien)).toBe(amount);
    const life = s.players.P1!.life;
    s = goTo(s, 'main2');
    s = settle(s).state;
    expect(s.players.P1!.hand.length).toBe(amount);
    expect(s.players.P1!.life).toBe(life - amount);
    s = goTo(s, 'upkeep');
    expect(s.combatDamageHistory).toEqual([]);
  });

  it('Estinien’s new object does not remember its previous object’s combat damage', () => {
    const s = newGame(players);
    const estinien = put(s, 'P1', 'estinien-varlineau');
    const ctx = { s, ev: [] };
    dealDamage(ctx, estinien, { kind: 'player', player: 'P2' }, 1, true);
    moveCard(ctx, estinien, 'exile');
    moveCard(ctx, estinien, 'battlefield');
    expect(countOf(s, 'OpponentsDamagedBySourceOrDragonThisTurn', 'P1', estinien)).toBe(0);
  });

  it('Hojo discounts only the first friendly-target activation on your turn; draw triggers once each turn', () => {
    let s = newGame(players);
    put(s, 'P1', 'professor-hojo');
    const creature = put(s, 'P1', 'undercity-dire-rat');
    const plate = put(s, 'P1', 'behemoth-sledge');
    const equip = { type: 'ActivateAbility', player: 'P1', card: plate, ability: 0, targets: [card(creature)] } as const;
    mana(s, 'P1', { C: 1 });
    s = cast(s, { ...equip, targets: [...equip.targets] }).state;
    expect(s.cards[plate]!.attachedTo).toBe(creature);
    expect(s.players.P1!.hand).toHaveLength(1);
    mana(s, 'P1', { C: 2 });
    expect(rejected(s, { ...equip, targets: [...equip.targets] })).toMatch(/mana/);
    mana(s, 'P1', { C: 1 });
    s = cast(s, { ...equip, targets: [...equip.targets] }).state;
    expect(s.players.P1!.hand).toHaveLength(1);
    s.turnNumber++;
    s.triggeredThisTurn = [];
    mana(s, 'P1', { C: 1 });
    s = cast(s, { ...equip, targets: [...equip.targets] }).state;
    expect(s.players.P1!.hand).toHaveLength(2);
  });

  it('Hojo draws when an opponent’s activated ability targets your creature, but gives that opponent no discount', () => {
    let s = newGame(players);
    put(s, 'P1', 'professor-hojo');
    const creature = put(s, 'P1', 'undercity-dire-rat');
    const passage = put(s, 'P2', 'rogues-passage');
    s.activePlayer = 'P2';
    s.pending = { kind: 'priority', player: 'P2', passes: 0 };
    mana(s, 'P2', { C: 2 });
    const activate = { type: 'ActivateAbility', player: 'P2', card: passage, ability: 0, targets: [card(creature)] } as const;
    expect(applyAction(s, { ...activate, targets: [...activate.targets] }).ok).toBe(false);
    mana(s, 'P2', { C: 2 });
    s = cast(s, { ...activate, targets: [...activate.targets] }).state;
    expect(s.players.P1!.hand).toHaveLength(1);
    expect(s.players.P2!.manaPool.C).toBe(0);
  });

  it('Hojo entering after the first activation does not discount the second one', () => {
    let s = newGame(players);
    const creature = put(s, 'P1', 'undercity-dire-rat');
    const equipment = put(s, 'P1', 'behemoth-sledge');
    const equip = { type: 'ActivateAbility', player: 'P1', card: equipment, ability: 0, targets: [card(creature)] } as const;
    mana(s, 'P1', { C: 3 });
    s = cast(s, { ...equip, targets: [...equip.targets] }).state;
    put(s, 'P1', 'professor-hojo');
    mana(s, 'P1', { C: 1 });
    expect(applyAction(s, { ...equip, targets: [...equip.targets] }).ok).toBe(false);
    mana(s, 'P1', { C: 2 });
    s = cast(s, { ...equip, targets: [...equip.targets] }).state;
    expect(s.players.P1!.hand).toHaveLength(1);
  });

  it('Hojo gives you no discount on someone else’s turn, but still draws for targeting', () => {
    let s = newGame(players);
    put(s, 'P1', 'professor-hojo');
    const creature = put(s, 'P1', 'undercity-dire-rat');
    const passage = put(s, 'P1', 'rogues-passage');
    s.activePlayer = 'P2';
    s.pending = { kind: 'priority', player: 'P1', passes: 0 };
    mana(s, 'P1', { C: 2 });
    const activate = { type: 'ActivateAbility', player: 'P1', card: passage, ability: 0, targets: [card(creature)] } as const;
    expect(applyAction(s, { ...activate, targets: [...activate.targets] }).ok).toBe(false);
    mana(s, 'P1', { C: 2 });
    s = cast(s, { ...activate, targets: [...activate.targets] }).state;
    expect(s.players.P1!.hand).toHaveLength(1);
  });
});
