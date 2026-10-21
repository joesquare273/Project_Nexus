// Seeded, deterministic random numbers (mulberry32). The generator state is a
// single 32-bit integer stored in GameState, so replays reproduce exactly.

import type { GameState } from './types.ts';

/** Turns any integer seed into a valid generator state. */
export function seedToState(seed: number): number {
  return seed >>> 0;
}

/** Advances the generator. Returns [value in [0, 1), next state]. */
export function nextRandom(rngState: number): [number, number] {
  const next = (rngState + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, next];
}

/** Random integer in [0, maxExclusive), advancing the state's generator. */
export function randomInt(state: GameState, maxExclusive: number): number {
  const [value, next] = nextRandom(state.rngState);
  state.rngState = next;
  return Math.floor(value * maxExclusive);
}

/** Fisher-Yates shuffle in place using the state's generator. */
export function shuffleInPlace<T>(state: GameState, items: T[]): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(state, i + 1);
    const tmp = items[i]!;
    items[i] = items[j]!;
    items[j] = tmp;
  }
}
