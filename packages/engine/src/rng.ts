// Seeded, deterministic random numbers (sfc32). The generator state is four
// 32-bit words (128 bits) stored in GameState, so replays reproduce exactly.
// 128 bits keep the seed out of brute-force reach: with a 32-bit state, a
// player could try every seed until one deals their opening hand, and then
// know every library. Online games must seed from a cryptographic source
// (16 bytes from crypto.randomBytes, via seedFromBytes), never Math.random.

import type { GameState } from './types.ts';

/** The generator's four 32-bit words. */
export type RngState = [number, number, number, number];

/** A 128-bit seed (four 32-bit words) or, for tests and local games, a plain integer. */
export type Seed = number | readonly [number, number, number, number];

/** Rounds run after seeding, so similar seeds don't start with similar output. */
const WARMUP = 16;

/** Expands an integer into well-mixed 32-bit words (splitmix32). */
function expand(seed: number): RngState {
  let x = seed >>> 0;
  const word = () => {
    x = (x + 0x9e3779b9) >>> 0;
    let z = x;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
  return [word(), word(), word(), word()];
}

/** Turns a seed into a generator state. */
export function seedToState(seed: Seed): RngState {
  let state: RngState = typeof seed === 'number' ? expand(seed) : [seed[0] >>> 0, seed[1] >>> 0, seed[2] >>> 0, seed[3] >>> 0];
  for (let i = 0; i < WARMUP; i++) state = nextRandom(state)[1];
  return state;
}

/** A 128-bit seed from 16 random bytes (for example `crypto.randomBytes(16)`). */
export function seedFromBytes(bytes: Uint8Array): [number, number, number, number] {
  if (bytes.length < 16) throw new Error('A seed needs 16 random bytes.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, 16);
  return [view.getUint32(0), view.getUint32(4), view.getUint32(8), view.getUint32(12)];
}

/** Advances the generator (sfc32). Returns [value in [0, 1), next state]; the input isn't changed. */
export function nextRandom(rngState: Readonly<RngState>): [number, RngState] {
  let [a, b, c, d] = rngState;
  const t = (((a + b) | 0) + d) | 0;
  d = (d + 1) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) | 0;
  return [(t >>> 0) / 4294967296, [a >>> 0, b >>> 0, c >>> 0, d >>> 0]];
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
