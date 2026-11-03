// Rule 603.3b: a player puts their simultaneous triggered abilities on the
// stack in the order they choose. Players are asked (ordersTriggers); bots
// keep the order the triggers were found in.
import { describe, expect, it } from 'vitest';
import { getLegalActions, type GameState } from '@nexus/engine';
import { act, newGame, put, rejected } from './kit-helpers.ts';

/** P1 controls two different "whenever a land you control enters" abilities, then plays a land. */
function twoTriggers(ordersTriggers: boolean): { s: GameState; track: string; bird: string } {
  const s = newGame();
  if (ordersTriggers) s.players.P1!.ordersTriggers = true;
  const track = put(s, 'P1', 'chocobo-racetrack');
  const bird = put(s, 'P1', 'chocobo-bird-token');
  const land = put(s, 'P1', 'forest', 'hand');
  return { s: act(s, { type: 'PlayLand', player: 'P1', card: land }), track, bird };
}

const sourceOf = (s: GameState, i: number) => {
  const item = s.stack[i]!;
  return item.kind === 'ability' ? item.source : item.card;
};

describe('ordering simultaneous triggers (rule 603.3b)', () => {
  it('a player is asked, and the one chosen to resolve first goes on top of the stack', () => {
    for (const first of ['track', 'bird'] as const) {
      const { s, track, bird } = twoTriggers(true);
      expect(s.pending).toMatchObject({ kind: 'orderTriggers', player: 'P1', count: 2 });
      // Every order is offered.
      expect(getLegalActions(s).filter((a) => a.type === 'OrderTriggers')).toHaveLength(2);
      const index = (id: string) => s.triggerQueue.findIndex((t) => t.source === id);
      const want = first === 'track' ? [index(track), index(bird)] : [index(bird), index(track)];
      const after = act(s, { type: 'OrderTriggers', player: 'P1', order: want });
      expect(after.stack).toHaveLength(2);
      expect(sourceOf(after, 1)).toBe(first === 'track' ? track : bird);
      expect(sourceOf(after, 0)).toBe(first === 'track' ? bird : track);
    }
  });

  it('a wrong order, or someone else, is refused', () => {
    const { s } = twoTriggers(true);
    expect(rejected(s, { type: 'OrderTriggers', player: 'P1', order: [0, 0] })).toMatch(/each of the 2/);
    expect(rejected(s, { type: 'OrderTriggers', player: 'P2', order: [0, 1] })).toBeTruthy();
  });

  it('bots (and anyone not asked) keep the order found, without a question', () => {
    const { s, track, bird } = twoTriggers(false);
    expect(s.pending.kind).toBe('priority');
    expect(s.stack.map((_, i) => sourceOf(s, i)).sort()).toEqual([track, bird].sort());
    // The asked player's "Keep this order" (the first legal action) gives the same stack.
    const asked = twoTriggers(true);
    const kept = act(asked.s, getLegalActions(asked.s)[0]!);
    expect(kept.stack.map((_, i) => sourceOf(kept, i))).toEqual(s.stack.map((_, i) => sourceOf(s, i)));
  });

  it('identical triggers are not worth a question', () => {
    let s = newGame();
    s.players.P1!.ordersTriggers = true;
    put(s, 'P1', 'chocobo-bird-token');
    put(s, 'P1', 'chocobo-bird-token');
    const land = put(s, 'P1', 'forest', 'hand');
    s = act(s, { type: 'PlayLand', player: 'P1', card: land });
    expect(s.pending.kind).toBe('priority');
    expect(s.stack).toHaveLength(2);
  });
});
