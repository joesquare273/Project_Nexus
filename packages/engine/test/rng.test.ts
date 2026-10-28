import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { nextRandom, seedFromBytes, seedToState } from '../src/rng.ts';

describe('random numbers (sfc32, 128-bit state)', () => {
  it('keeps four 32-bit words of state', () => {
    const state = seedToState(seedFromBytes(randomBytes(16)));
    expect(state).toHaveLength(4);
    for (const w of state) expect(Number.isInteger(w) && w >= 0 && w < 2 ** 32).toBe(true);
  });

  it('is pure: the same state always gives the same value and next state, and the input is unchanged', () => {
    const state = seedToState(12345);
    const copy = [...state];
    const a = nextRandom(state);
    const b = nextRandom(state);
    expect(a).toEqual(b);
    expect(state).toEqual(copy);
    expect(a[1]).not.toEqual(state);
  });

  it('reproduces a sequence from the same seed, and differs for different seeds', () => {
    const run = (seed: Parameters<typeof seedToState>[0]) => {
      let s = seedToState(seed);
      return Array.from({ length: 50 }, () => {
        const [v, next] = nextRandom(s);
        s = next;
        return v;
      });
    };
    expect(run(7)).toEqual(run(7));
    expect(run(7)).not.toEqual(run(8));
    expect(run([1, 2, 3, 4])).toEqual(run([1, 2, 3, 4]));
    expect(run([1, 2, 3, 4])).not.toEqual(run([1, 2, 3, 5]));
  });

  it('uses all 128 bits of a byte seed', () => {
    const bytes = new Uint8Array(16);
    const base = seedToState(seedFromBytes(bytes));
    for (let i = 0; i < 16; i++) {
      const changed = new Uint8Array(16);
      changed[i] = 1;
      expect(seedToState(seedFromBytes(changed)), `byte ${i}`).not.toEqual(base);
    }
    expect(() => seedFromBytes(new Uint8Array(8))).toThrow();
  });

  it('gives values in [0, 1) that spread evenly', () => {
    let s = seedToState(2026);
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 100_000; i++) {
      const [v, next] = nextRandom(s);
      s = next;
      expect(v >= 0 && v < 1).toBe(true);
      buckets[Math.floor(v * 10)]++;
    }
    for (const n of buckets) expect(Math.abs(n - 10_000)).toBeLessThan(500);
  });
});
