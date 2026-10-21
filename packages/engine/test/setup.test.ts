import { describe, expect, it } from 'vitest';
import { CONSTRUCTED_DUEL, createGame, validateDeck } from '../src/index.ts';
import { DEFS, newGame, passUntil, playerIds } from './helpers.ts';

describe.each([2, 3, 4])('new game with %i players', (n) => {
  const state = newGame(n, { raw: true });

  it('deals opening hands and sets life', () => {
    for (const pid of playerIds(n)) {
      const p = state.players[pid]!;
      expect(p.life).toBe(20);
      expect(p.hand).toHaveLength(7);
      expect(p.library).toHaveLength(23);
    }
  });

  it('starts in the active player’s upkeep with priority', () => {
    expect(state.turnOrder).toEqual(playerIds(n));
    expect(state.step).toBe('upkeep');
    expect(state.pending).toEqual({ kind: 'priority', player: state.activePlayer, passes: 0 });
  });

  it(n === 2 ? 'skips the first draw in a two-player game' : 'does not skip the first draw in multiplayer', () => {
    const atDraw = passUntil(state, 'draw');
    expect(atDraw.players[atDraw.activePlayer]!.hand).toHaveLength(n === 2 ? 7 : 8);
  });
});

describe('determinism', () => {
  it('produces identical games from the same seed', () => {
    expect(newGame(3, { seed: 42, raw: true })).toEqual(newGame(3, { seed: 42, raw: true }));
  });

  it('shuffles differently with a different seed', () => {
    const mixed = (seed: number) =>
      createGame({
        format: CONSTRUCTED_DUEL,
        cardDefs: DEFS,
        seed,
        players: playerIds(2).map((id) => ({ id, deck: [...Array(30).fill('island'), ...Array(30).fill('mountain')] })),
      }).state;
    const order = (seed: number) => mixed(seed).players.P1!.library.map((id) => mixed(seed).cards[id]!.defId);
    expect(order(1)).not.toEqual(order(2));
  });
});

describe('deck validation', () => {
  it('requires 60 cards and at most 4 copies, except basic lands', () => {
    expect(validateDeck(Array(60).fill('island'), DEFS, CONSTRUCTED_DUEL)).toEqual([]);
    expect(validateDeck(Array(59).fill('island'), DEFS, CONSTRUCTED_DUEL)).toHaveLength(1);
    const fiveBears = [...Array(55).fill('island'), ...Array(5).fill('bear')];
    expect(validateDeck(fiveBears, DEFS, CONSTRUCTED_DUEL)[0]).toMatch(/limit is 4/);
    const fiveTowns = [...Array(55).fill('island'), ...Array(5).fill('town')];
    expect(validateDeck(fiveTowns, DEFS, CONSTRUCTED_DUEL)).toHaveLength(1);
  });

  it('rejects unknown cards and illegal player counts', () => {
    expect(validateDeck([...Array(59).fill('island'), 'nope'], DEFS, CONSTRUCTED_DUEL)[0]).toMatch(/Unknown card/);
    expect(() =>
      createGame({
        format: CONSTRUCTED_DUEL,
        cardDefs: DEFS,
        seed: 1,
        players: playerIds(3).map((id) => ({ id, deck: Array(60).fill('island') })),
      }),
    ).toThrow(/needs 2-2 players/);
  });
});
