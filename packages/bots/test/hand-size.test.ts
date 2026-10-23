import { describe, expect, it } from 'vitest';
import { getLegalActions, maximumHandSize, viewFor, type GameState } from '@nexus/engine';
import { moveCard, phaseOut } from '../../engine/src/state.ts';
import { basicAi } from '../src/ai.ts';
import { checkInvariants } from '../src/invariants.ts';
import { act, actWithEvents, newGame, nextStep, put, rejected, settle } from './kit-helpers.ts';
function hand(s: GameState, player = 'P1', count = 11) { return Array.from({ length: count }, () => put(s, player, 'island', 'hand')); }
function end(s: GameState) { s.step = 'end'; s.pending = { kind: 'priority', player: s.activePlayer, passes: 0 }; return nextStep(s); }
function discard(s: GameState, cards: string[]) { return act(s, { type: 'ChooseCards', player: s.activePlayer, cards }); }
describe.each([2,3,4])('Maximum hand size with %i players', players => {
  it('allows more than seven during the turn, then lets the active player choose four of eleven at cleanup', () => {
    const initial = newGame(players), cards = hand(initial);
    expect(initial.players.P1!.hand).toHaveLength(11);
    let s = end(initial);
    expect(s.step).toBe('cleanup');
    expect(s.pending).toMatchObject({ kind: 'chooseCards', purpose: 'handSize', player: 'P1', min: 4, max: 4, cards });
    expect(s.turnNumber).toBe(2);
    expect(s.resolving).toBeNull();
    expect(s.stack).toHaveLength(0);
    const before = structuredClone(s);
    const selected = cards.slice(6, 10);
    const result = actWithEvents(s, { type: 'ChooseCards', player: 'P1', cards: selected });
    expect(s).toEqual(before);
    s = result.state;
    expect(s.players.P1!.hand).toHaveLength(7);
    expect(s.players.P1!.graveyard).toEqual(selected);
    expect(result.events.filter(e => e.type === 'Discarded')).toHaveLength(4);
    expect(s.activePlayer).toBe('P2');
    expect(s.step).toBe('upkeep');
    expect(s.cleanupCheck).toBeUndefined();
    expect(checkInvariants(s)).toEqual([]);
  });
  it('enforces the exact number, uniqueness, ownership and cleanup timing', () => {
    const initial = newGame(players), cards = hand(initial);
    const other = hand(initial, 'P2', 1)[0]!;
    expect(rejected(initial, { type: 'ChooseCards', player: 'P1', cards: cards.slice(0,4) })).toBeTruthy();
    const s = end(initial);
    for (const choices of [[], cards.slice(0,3), cards.slice(0,5), [cards[0]!,cards[0]!,cards[1]!,cards[2]!], [other,...cards.slice(0,3)]]) {
      expect(rejected(s, { type: 'ChooseCards', player: 'P1', cards: choices })).toBeTruthy();
    }
    expect(rejected(s, { type: 'ChooseCards', player: 'P2', cards: cards.slice(0,4) })).toBeTruthy();
    expect(rejected(s, { type: 'PassPriority', player: 'P1' })).toBeTruthy();
    const instant = put(s, 'P1', 'an-offer-you-cant-refuse', 'hand');
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: instant })).toBeTruthy();
  });
  it('does not ask anyone to discard when the active player has seven or fewer', () => {
    for (const count of [0, 6, 7]) {
      const s = newGame(players); hand(s, 'P1', count); hand(s, 'P2', 11);
      const r = end(s);
      expect(r.activePlayer).toBe('P2');
      expect(r.players.P1!.hand).toHaveLength(count);
      expect(r.players.P2!.hand).toHaveLength(11);
      expect(r.step).toBe('upkeep');
    }
  });
  it('checks the actual active player, not always the first seat', () => {
    const s = newGame(players); s.activePlayer = 'P2'; const cards = hand(s, 'P2');
    const pending = end(s);
    expect(pending.pending).toMatchObject({ kind: 'chooseCards', player: 'P2', min: 4 });
    const r = discard(pending, cards.slice(0,4));
    expect(r.players.P2!.hand).toHaveLength(7);
    expect(r.activePlayer).toBe(players === 2 ? 'P1' : 'P3');
  });
  it('respects Thought Vessel even while tapped, and displays an unlimited hand', () => {
    const s = newGame(players); hand(s); put(s, 'P1', 'thought-vessel', 'battlefield', { tapped: true });
    expect(maximumHandSize(s, 'P1')).toBeNull();
    expect(viewFor(s, 'P1').players.P1!.maximumHandSize).toBeNull();
    const r = end(s);
    expect(r.activePlayer).toBe('P2');
    expect(r.players.P1!.hand).toHaveLength(11);
  });
  it('does not apply an opponent\'s, phased-out, or nonbattlefield Vessel', () => {
    for (const zone of ['hand','graveyard','exile'] as const) {
      const s = newGame(players); hand(s); put(s, 'P1', 'thought-vessel', zone); put(s, 'P2', 'thought-vessel');
      expect(maximumHandSize(s, 'P1')).toBe(7);
      expect(end(s).pending).toMatchObject({ purpose: 'handSize' });
    }
    const s = newGame(players); hand(s); const vessel = put(s, 'P1', 'thought-vessel');
    phaseOut({ s, ev: [] }, vessel);
    expect(maximumHandSize(s, 'P1')).toBe(7);
    expect(end(s).pending).toMatchObject({ purpose: 'handSize' });
  });
  it('uses control rather than ownership and restores seven when the Vessel leaves', () => {
    const s = newGame(players); hand(s);
    const vessel = put(s, 'P2', 'thought-vessel', 'battlefield', { controller: 'P1' });
    expect(maximumHandSize(s, 'P1')).toBeNull();
    expect(maximumHandSize(s, 'P2')).toBe(7);
    moveCard({ s, ev: [] }, vessel, 'graveyard');
    expect(maximumHandSize(s, 'P1')).toBe(7);
    expect(end(s).pending).toMatchObject({ purpose: 'handSize', min: 4 });
  });
  it('clears damage and end-of-turn bonuses together after the discard choice', () => {
    const s = newGame(players), cards = hand(s);
    const soldier = put(s, 'P1', 'soldier-token', 'battlefield', { damage: 1 });
    s.temporaryEffects.push({ source: soldier, affected: soldier, toughness: 1 });
    const pending = end(s);
    expect(pending.cards[soldier]!.damage).toBe(1);
    expect(pending.temporaryEffects).toHaveLength(1);
    const r = discard(pending, cards.slice(0,4));
    expect(r.cards[soldier]).toMatchObject({ zone: 'battlefield', damage: 0 });
    expect(r.temporaryEffects).toHaveLength(0);
    expect(checkInvariants(r)).toEqual([]);
  });
  it('gives priority for cleanup deaths, resolves their draw, then requires another cleanup discard', () => {
    const s = newGame(players), cards = hand(s);
    put(s, 'P1', 'morbid-opportunist');
    const ballista = put(s, 'P1', 'walking-ballista');
    s.temporaryEffects.push({ source: ballista, affected: ballista, toughness: 1 });
    let r = discard(end(s), cards.slice(0,4));
    expect(r.step).toBe('cleanup');
    expect(r.activePlayer).toBe('P1');
    expect(r.cards[ballista]!.zone).toBe('graveyard');
    expect(r.stack).toHaveLength(1);
    expect(r.pending).toMatchObject({ kind: 'priority', player: 'P1' });
    r = settle(r).state;
    expect(r.players.P1!.hand).toHaveLength(8);
    r = nextStep(r);
    expect(r.pending).toMatchObject({ kind: 'chooseCards', purpose: 'handSize', min: 1, max: 1 });
    r = discard(r, [r.players.P1!.hand[0]!]);
    expect(r.players.P1!.hand).toHaveLength(7);
    expect(r.activePlayer).toBe('P2');
    expect(checkInvariants(r)).toEqual([]);
  });
  it('gives cleanup priority for a state-based action even without a triggered ability', () => {
    const s = newGame(players);
    const ballista = put(s, 'P1', 'walking-ballista');
    s.temporaryEffects.push({ source: ballista, affected: ballista, toughness: 1 });
    const r = end(s);
    expect(r.step).toBe('cleanup');
    expect(r.stack).toHaveLength(0);
    expect(r.pending).toMatchObject({ kind: 'priority', player: 'P1' });
    expect(nextStep(r).activePlayer).toBe('P2');
  });
  it('does not reveal the cleanup hand identities to other players', () => {
    const s = newGame(players), cards = hand(s), r = end(s);
    expect(viewFor(r, 'P1').pending).toMatchObject({ cards });
    const other = viewFor(r, 'P2');
    expect(other.pending).toMatchObject({ kind: 'chooseCards', purpose: 'handSize', cards: [], min: 4 });
    expect(cards.every(id => !other.cards[id])).toBe(true);
    expect(other.players.P1!.maximumHandSize).toBe(7);
  });
  it('offers legal bot discards and preserves the choice if an unrelated opponent concedes', () => {
    const s = newGame(players); hand(s); let r = end(s);
    const action = basicAi(1)(r, getLegalActions(r));
    expect(action).toMatchObject({ type: 'ChooseCards' });
    expect(act(r, action).players.P1!.hand).toHaveLength(7);
    if (players > 2) {
      r = act(r, { type: 'Concede', player: 'P3' });
      expect(r.pending).toMatchObject({ kind: 'chooseCards', purpose: 'handSize', min: 4 });
      expect(checkInvariants(r)).toEqual([]);
    }
  });
});
