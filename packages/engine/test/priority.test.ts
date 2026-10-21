import { describe, expect, it } from 'vitest';
import { STEPS } from '../src/index.ts';
import { act, addMana, eventsOf, newGame, pass, passAll, priorityHolder, put, rejected, setTurn } from './helpers.ts';

describe.each([2, 3, 4])('priority with %i players', (n) => {
  it('passes around the table in turn order, starting with the active player', () => {
    let s = setTurn(newGame(n), 'P2', 'upkeep');
    const order: string[] = [];
    for (let i = 0; i < n; i++) {
      order.push(priorityHolder(s));
      s = pass(s).state;
    }
    const expected = Array.from({ length: n }, (_, i) => `P${((1 + i) % n) + 1}`);
    expect(order).toEqual(expected);
    // Everyone passed with an empty stack: on to the draw step, back to the active player.
    expect(s.step).toBe('draw');
    expect(priorityHolder(s)).toBe('P2');
  });

  it('restarts the round when someone acts', () => {
    let s = newGame(n);
    put(s, 'P2', 'mend', 'hand');
    addMana(s, 'P2', { W: 1 });
    s = pass(s).state; // P1 passes
    expect(priorityHolder(s)).toBe('P2');
    s = act(s, { type: 'CastSpell', player: 'P2', card: s.players.P2!.hand[0]!, targets: [] }).state;
    // The caster keeps priority and the pass count starts over.
    expect(s.pending).toEqual({ kind: 'priority', player: 'P2', passes: 0 });
  });

  it('rejects actions from players without priority', () => {
    const s = newGame(n);
    expect(rejected(s, { type: 'PassPriority', player: 'P2' })).toMatch(/priority/);
  });

  it('skips eliminated players', () => {
    let s = setTurn(newGame(n), 'P1', 'upkeep');
    if (n === 2) return; // Eliminating one of two players ends the game.
    s = act(s, { type: 'Concede', player: 'P2' }).state;
    const order: string[] = [];
    for (let i = 0; i < n - 1; i++) {
      order.push(priorityHolder(s));
      s = pass(s).state;
    }
    expect(order).not.toContain('P2');
    expect(s.step).toBe('draw');
  });
});

describe('turn structure', () => {
  it('walks every step, then hands the turn to the next player', () => {
    let s = setTurn(newGame(3), 'P1', 'upkeep');
    const seen: string[] = [];
    while (s.activePlayer === 'P1') {
      const r = passAll(s);
      seen.push(...eventsOf(r.events, 'StepChanged').map((e) => e.step));
      s = r.state;
    }
    // No creatures can attack, so blockers and damage are skipped.
    expect(seen).toEqual([
      'draw',
      'main1',
      'beginCombat',
      'declareAttackers',
      'endCombat',
      'main2',
      'end',
      'cleanup',
      'untap',
      'upkeep',
    ]);
    expect(s.activePlayer).toBe('P2');
    expect(s.turnNumber).toBe(3);
    expect(STEPS[0]).toBe('untap');
  });

  it('untaps only the active player’s permanents and clears summoning sickness', () => {
    let s = setTurn(newGame(2), 'P2', 'end');
    const mine = put(s, 'P1', 'bear', 'battlefield', { tapped: true, summoningSick: true });
    const theirs = put(s, 'P2', 'bear', 'battlefield', { tapped: true });
    s = passAll(s).state; // end -> cleanup -> P1's turn
    expect(s.activePlayer).toBe('P1');
    expect(s.cards[mine]).toMatchObject({ tapped: false, summoningSick: false });
    expect(s.cards[theirs]!.tapped).toBe(true);
  });

  it('empties mana pools between steps', () => {
    let s = newGame(2);
    addMana(s, 'P1', { R: 2 });
    s = passAll(s).state;
    expect(s.step).toBe('beginCombat');
    expect(s.players.P1!.manaPool.R).toBe(0);
  });
});
