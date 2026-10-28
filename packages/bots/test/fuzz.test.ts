import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { FREE_FOR_ALL, applyAction, createGame, seedFromBytes, type GameSetup, type Seed } from '@nexus/engine';
import { CARD_DEFS, starterKitDeck } from '@nexus/cards';
import { basicAi, playGame, randomBot, type Bot } from '../src/index.ts';
import { checkInvariants } from '../src/invariants.ts';

// Kept small for everyday test runs; `npm run fuzz` plays thousands.
const GAMES_PER_SIZE = 12;
// Random bots take a while now that there are more choices (X values, foretell, mana while attacking).
const TIMEOUT_MS = 300_000;

function setup(players: number, seed: number, rngSeed: Seed = seed): GameSetup {
  return {
    format: FREE_FOR_ALL,
    cardDefs: CARD_DEFS,
    seed: rngSeed,
    players: Array.from({ length: players }, (_, i) => ({ id: `P${i + 1}`, deck: starterKitDeck(i % 2 ? 'UB' : 'RW') })),
    mulligans: true,
  };
}

function seats(players: number, make: (seed: number) => Bot, seed: number): Record<string, Bot> {
  return Object.fromEntries(Array.from({ length: players }, (_, i) => [`P${i + 1}`, make(seed * 7 + i)]));
}

describe.each([2, 3, 4])('fuzz: %i-player games', (players) => {
  it.each([
    ['random bots', randomBot],
    ['AI bots', basicAi],
  ] as const)('%s finish without breaking invariants', (_label, make) => {
    for (let seed = 1; seed <= GAMES_PER_SIZE; seed++) {
      const game = playGame(setup(players, seed), seats(players, make, seed), {
        onAction: (state, action) => {
          const problems = checkInvariants(state);
          if (problems.length > 0) {
            throw new Error(`seed ${seed}, after ${JSON.stringify(action)}:\n${problems.join('\n')}`);
          }
        },
      });
      expect(game.finished, `seed ${seed} did not finish`).toBe(true);
    }
  }, TIMEOUT_MS);
});

describe('replays', () => {
  it('re-simulating the action log reproduces the exact game', () => {
    const original = playGame(setup(3, 99), seats(3, basicAi, 99));
    let { state } = createGame(setup(3, 99));
    for (const action of original.actions) {
      const r = applyAction(state, action);
      if (!r.ok) throw new Error(r.error);
      state = r.state;
    }
    expect(state).toEqual(original.state);
  });

  it('a 128-bit seed (as online games use) replays identically, also through JSON', () => {
    const seed = seedFromBytes(randomBytes(16));
    const original = playGame(setup(2, 0, seed), seats(2, randomBot, 5));
    // Replaying the action log from the same seed gives the same game.
    let { state } = createGame(setup(2, 0, seed));
    const half = Math.floor(original.actions.length / 2);
    original.actions.forEach((action, i) => {
      // A saved and reloaded game (as a server might store it) carries on identically.
      if (i === half) state = JSON.parse(JSON.stringify(state));
      const r = applyAction(state, action);
      if (!r.ok) throw new Error(r.error);
      state = r.state;
    });
    expect(state).toEqual(original.state);
    // Another seed deals a different game.
    const deal = (s: Seed) => {
      const g = createGame(setup(2, 0, s)).state;
      return g.players.P1!.library.map((id) => g.cards[id]!.defId);
    };
    expect(deal(seed)).toEqual(deal(seed));
    expect(deal(seedFromBytes(randomBytes(16)))).not.toEqual(deal(seed));
  }, TIMEOUT_MS);
});

describe('basic AI', () => {
  it('beats a random bot most of the time', () => {
    let wins = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const game = playGame(setup(2, seed), { P1: basicAi(), P2: randomBot(seed) });
      if (game.state.winner === 'P1') wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(8);
  });
});
