import { describe, expect, it } from 'vitest';
import { FREE_FOR_ALL, createGame, type GameState } from '@nexus/engine';
import { CARD_DEFS } from '@nexus/cards';
import { planTaps } from '../src/index.ts';

function withLands(lands: string[]): GameState {
  const { state } = createGame({
    format: FREE_FOR_ALL,
    cardDefs: CARD_DEFS,
    seed: 1,
    players: [{ id: 'A', deck: Array(20).fill('island') }, { id: 'B', deck: Array(20).fill('island') }],
    skipDeckValidation: true,
  });
  for (const [i, defId] of lands.entries()) {
    const id = `land${i}`;
    state.cards[id] = { id, defId, owner: 'A', controller: 'A', zone: 'battlefield', tapped: false, summoningSick: false, damage: 0, deathtouched: false };
    state.players.A!.battlefield.push(id);
  }
  return state;
}

describe('planTaps', () => {
  it('saves dual lands for the colors only they can make', () => {
    const s = withLands(['rabanastre-royal-city', 'plains', 'mountain']);
    const taps = planTaps(s, 'A', '{1}{R}{W}')!;
    expect(taps).toHaveLength(3);
    const byCard = Object.fromEntries(taps.map((t) => [t.card, t.mana]));
    expect(byCard.land1).toBe('W');
    expect(byCard.land2).toBe('R');
  });

  it('backtracks when the greedy choice fails', () => {
    // {R}{W} with a Rabanastre (R or W) and a Mountain: Rabanastre must make W.
    const s = withLands(['rabanastre-royal-city', 'mountain']);
    expect(planTaps(s, 'A', '{R}{W}')).toEqual(
      expect.arrayContaining([
        { card: 'land0', mana: 'W' },
        { card: 'land1', mana: 'R' },
      ]),
    );
  });

  it('returns null when the lands cannot pay', () => {
    const s = withLands(['plains', 'plains']);
    expect(planTaps(s, 'A', '{R}')).toBeNull();
    expect(planTaps(s, 'A', '{3}')).toBeNull();
  });

  it('uses mana already in the pool first', () => {
    const s = withLands(['plains']);
    s.players.A!.manaPool.R = 1;
    expect(planTaps(s, 'A', '{1}{R}')).toEqual([{ card: 'land0', mana: 'W' }]);
  });
});
