import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions, type GameState } from '../src/index.ts';
import { addMana, newGame, put } from './helpers.ts';

/** Every legal action from many states, checking the input is left untouched. */
function checkPurity(start: GameState, steps: number): void {
  let s = start;
  for (let i = 0; i < steps && s.pending.kind !== 'gameOver'; i++) {
    const legal = getLegalActions(s);
    for (const action of legal) {
      const before = JSON.stringify(s);
      applyAction(s, action);
      expect(JSON.stringify(s), `${action.type} mutated its input`).toBe(before);
    }
    // Walk forward, preferring actions that change the most state.
    const next = legal.find((a) => a.type !== 'PassPriority') ?? legal[0]!;
    const r = applyAction(s, next);
    if (!r.ok) throw new Error(r.error);
    s = r.state;
  }
}

describe('applyAction', () => {
  it('does not mutate its input', () => {
    const s = newGame(3);
    for (const id of ['ogre', 'flyer', 'twinblade', 'viper', 'cleric']) put(s, 'P1', id);
    for (const id of ['bear', 'archer', 'golem']) put(s, 'P2', id);
    for (const id of ['shock', 'murder', 'mend', 'study']) put(s, 'P1', id, 'hand');
    put(s, 'P2', 'shock', 'hand');
    addMana(s, 'P1', { R: 3, B: 2, W: 1, U: 2 });
    addMana(s, 'P2', { R: 1 });
    checkPurity(s, 200);
  });
});
