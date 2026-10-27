// The last precon cards: Yuffie, Materia Hunter (ninjutsu, control while you
// control her), Sin, Unending Cataclysm (counters removed as it enters) and
// Observed Stasis (an Aura with flash that removes all abilities).

import { describe, expect, it } from 'vitest';
import { applyAction, currentDefinition, getLegalActions, hasKeyword } from '@nexus/engine';
import type { GameState } from '@nexus/engine';
import { act, card, cast, goTo, mana, newGame, nextStep, put, settle } from './kit-helpers.ts';

const RAT = 'undercity-dire-rat';

function kill(s: GameState, victim: string): GameState {
  const spell = put(s, 'P1', 'sephiroths-intervention', 'hand');
  mana(s, 'P1', { B: 1, C: 3 });
  return cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(victim)] }).state;
}

/** P1 attacks P2 with `attacker`; P2 doesn't block. Returns at P1's priority in the declare blockers step. */
function unblocked(s: GameState, attacker: string): GameState {
  s = goTo(s, 'declareAttackers');
  s = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker, defender: 'P2' }] })).state;
  s = nextStep(s);
  while (s.pending.kind === 'declareBlockers') s = act(s, { type: 'DeclareBlockers', player: s.pending.player, blocks: [] });
  return settle(s).state;
}

describe.each([2, 3, 4])('%i players', (n) => {
  it("Yuffie: ninjutsu swaps in for an unblocked attacker, steals a noncreature artifact while you control her, and may attach an Equipment", () => {
    let s = newGame(n);
    const rat = put(s, 'P1', RAT);
    const yuffie = put(s, 'P1', 'yuffie-materia-hunter', 'hand');
    const cane = put(s, 'P2', 'blue-mages-cane');
    // Not before blockers are declared.
    mana(s, 'P1', { R: 1, C: 1 });
    expect(getLegalActions(s).some((a) => a.type === 'ActivateAbility' && a.card === yuffie)).toBe(false);
    s = unblocked(s, rat);
    expect(s.step).toBe('declareBlockers');
    mana(s, 'P1', { R: 1, C: 1 });
    expect(getLegalActions(s).some((a) => a.type === 'ActivateAbility' && a.card === yuffie)).toBe(true);
    s = act(s, { type: 'ActivateAbility', player: 'P1', card: yuffie, ability: 0, targets: [], costCards: [rat] });
    expect(s.cards[rat]!.zone).toBe('hand');
    s = settle(s, { targets: (options) => options.find((o) => o[0]?.kind === 'card' && o[0].card === cane)! }).state;
    expect(s.cards[yuffie]).toMatchObject({ zone: 'battlefield', tapped: true });
    expect(s.combat!.attacks).toContainEqual({ attacker: yuffie, defender: 'P2' });
    expect(s.cards[cane]!.controller).toBe('P1');
    expect(s.pending).toMatchObject({ kind: 'chooseCards', purpose: 'attachToSource', cards: [cane] });
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [cane] })).state;
    expect(s.cards[cane]!.attachedTo).toBe(yuffie);
    // Combat damage: 3 to P2.
    s = settle(nextStep(s)).state;
    expect(s.players.P2!.life).toBe(17);

    // Once Yuffie leaves, the Cane goes back to P2.
    s = goTo(s, 'main2');
    s = kill(s, yuffie);
    expect(s.cards[cane]!.controller).toBe('P2');
    expect(s.cards[cane]!.controlWhile).toBeUndefined();
  });

  it('Yuffie: ninjutsu needs an unblocked attacker', () => {
    let s = newGame(n);
    const rat = put(s, 'P1', RAT);
    const blocker = put(s, 'P2', RAT);
    const yuffie = put(s, 'P1', 'yuffie-materia-hunter', 'hand');
    s = goTo(s, 'declareAttackers');
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: rat, defender: 'P2' }] })).state;
    s = nextStep(s);
    while (s.pending.kind === 'declareBlockers') {
      const who = s.pending.player;
      s = act(s, { type: 'DeclareBlockers', player: who, blocks: who === 'P2' ? [{ blocker, attacker: rat }] : [] });
    }
    s = settle(s).state;
    mana(s, 'P1', { R: 1, C: 1 });
    expect(applyAction(s, { type: 'ActivateAbility', player: 'P1', card: yuffie, ability: 0, targets: [], costCards: [rat] }).ok).toBe(false);
  });

  it("Sin: removes counters as it enters for twice as many +1/+1 counters; when it dies, they move and it's shuffled into the library", () => {
    let s = newGame(n);
    const theirs = put(s, 'P2', RAT, 'battlefield', { counters: 2, namedCounters: { stun: 1 } });
    const mine = put(s, 'P1', RAT);
    const sin = put(s, 'P1', 'sin-unending-cataclysm', 'hand');
    mana(s, 'P1', { G: 1, U: 1, C: 5 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: sin, targets: [] });
    s = settle(s).state;
    expect(s.pending).toMatchObject({ kind: 'chooseCards', purpose: 'removeCountersOnEntry', cards: [theirs] });
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [theirs] })).state;
    expect(s.cards[theirs]!.counters ?? 0).toBe(0);
    expect(s.cards[theirs]!.namedCounters?.stun ?? 0).toBe(0);
    expect(s.cards[sin]!.counters).toBe(6);

    s = kill(s, sin);
    expect(s.cards[mine]!.counters).toBe(6);
    expect(s.cards[sin]!.zone).toBe('library');
  });

  it('Sin: with no counters anywhere it simply enters as a 5/5', () => {
    let s = newGame(n);
    const sin = put(s, 'P1', 'sin-unending-cataclysm', 'hand');
    mana(s, 'P1', { G: 1, U: 1, C: 5 });
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: sin, targets: [] })).state;
    expect(s.cards[sin]!.zone).toBe('battlefield');
    expect(s.cards[sin]!.counters ?? 0).toBe(0);
  });

  it('Observed Stasis: flash onto an attacker removes it from combat, draws per tapped creature, and blanks it', () => {
    let s = newGame(n);
    // P2 attacks P1 with a flier; P2 controls another tapped creature.
    s.activePlayer = 'P2';
    s.pending = { kind: 'priority', player: 'P2', passes: 0 };
    const attacker = put(s, 'P2', 'kefka-dancing-mad');
    put(s, 'P2', RAT, 'battlefield', { tapped: true });
    s = goTo(s, 'declareAttackers');
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P2', attacks: [{ attacker, defender: 'P1' }] })).state;
    expect(hasKeyword(s, s.cards[attacker]!, 'Indestructible')).toBe(true);
    // P1 casts it in response, with P2's attack on.
    s = { ...s, pending: { kind: 'priority', player: 'P1', passes: 0 } };
    const stasis = put(s, 'P1', 'observed-stasis', 'hand');
    mana(s, 'P1', { U: 1, C: 3 });
    const hand = s.players.P1!.hand.length;
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: stasis, targets: [card(attacker)] })).state;
    expect(s.cards[stasis]!.attachedTo).toBe(attacker);
    expect(s.combat!.attacks.some((a) => a.attacker === attacker)).toBe(false);
    // Kefka (attacking, so tapped) and the Rat: two cards; Observed Stasis left the hand.
    expect(s.players.P1!.hand.length).toBe(hand - 1 + 2);
    expect(hasKeyword(s, s.cards[attacker]!, 'Indestructible')).toBe(false);
    expect(currentDefinition(s, s.cards[attacker]!).triggers).toBeUndefined();
    // It can't attack or block.
    s.cards[attacker]!.tapped = false;
    s.activePlayer = 'P2';
    expect(getLegalActions({ ...s, pending: { kind: 'declareAttackers', player: 'P2' } }).some((a) => a.type === 'DeclareAttackers' && a.attacks.some((x) => x.attacker === attacker))).toBe(false);
  });

  it("Observed Stasis: only on an opponent's creature", () => {
    const s = newGame(n);
    const mine = put(s, 'P1', RAT);
    const stasis = put(s, 'P1', 'observed-stasis', 'hand');
    mana(s, 'P1', { U: 1, C: 3 });
    expect(applyAction(s, { type: 'CastSpell', player: 'P1', card: stasis, targets: [card(mine)] }).ok).toBe(false);
  });
});
