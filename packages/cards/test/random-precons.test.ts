// Computer opponents' Commander decks are chosen at random among the fully built precons (user, 2026-11-23).
import { describe, expect, it } from 'vitest';
import { ALL_PRECONS, preconFullyBuilt, randomPrecons } from '../src/index.ts';

function seeded(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
}

describe('randomPrecons', () => {
  it('picks different fully built precons, never an excluded one', () => {
    const built = ALL_PRECONS.filter(preconFullyBuilt).map((d) => d.name);
    expect(built.length).toBeGreaterThanOrEqual(7);
    for (let seed = 1; seed <= 50; seed++) {
      const picks = randomPrecons(3, seeded(seed), [built[0]!]).map((d) => d.name);
      expect(new Set(picks).size).toBe(3);
      for (const name of picks) expect(built).toContain(name);
      expect(picks).not.toContain(built[0]);
    }
  });

  it('varies with the seed, and never uses a precon with cards not built yet', () => {
    const firsts = new Set(Array.from({ length: 40 }, (_, i) => randomPrecons(1, seeded(i + 1))[0]!.name));
    expect(firsts.size).toBeGreaterThan(3);
    const unfinished = ALL_PRECONS.filter((d) => !preconFullyBuilt(d)).map((d) => d.name);
    for (const name of firsts) expect(unfinished).not.toContain(name);
  });

  it('repeats only when there are more opponents than built precons', () => {
    const many = randomPrecons(20, seeded(3));
    expect(many).toHaveLength(20);
  });
});
