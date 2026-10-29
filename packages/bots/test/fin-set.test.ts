// The Final Fantasy main set and Through the Ages, imported for sealed play
// (cards/scripts/import-sets.ts). Every card in their boosters has a
// definition, and games with random sealed-style decks (cards from the set
// plus basic lands) keep every rule invariant, built or not.

import { describe, expect, it } from 'vitest';
import { FREE_FOR_ALL, canEverCast, getLegalActions, type CardDefId, type GameSetup } from '@nexus/engine';
import { CARD_DEFS, CARD_IDS_BY_NAME } from '@nexus/cards';
import { BOOSTER_CARDS } from '@nexus/cards/boosters';
import { basicAi, makeRng, playGame, randomBot } from '../src/index.ts';
import { checkInvariants } from '../src/invariants.ts';
import { mana, newGame, put } from './kit-helpers.ts';

/** The set's own cards (not showcase variants): FIN 1-309 and FCA 1-64. */
const setCards = BOOSTER_CARDS.filter((c) => (c.set === 'fin' && Number(c.number) <= 309) || (c.set === 'fca' && Number(c.number) <= 64));
const names = [...new Set(setCards.map((c) => c.name))];
const BASICS = ['plains', 'island', 'swamp', 'mountain', 'forest'];

describe('the Final Fantasy set for sealed', () => {
  it('defines every main-set and Through the Ages card', () => {
    const missing = names.filter((n) => !CARD_IDS_BY_NAME[n]);
    expect(missing).toEqual([]);
    expect(names.length).toBeGreaterThan(360);
  });

  it('a card whose cost uses mana the engine can\'t pay yet is never castable', () => {
    const krrik = CARD_DEFS[CARD_IDS_BY_NAME["K'rrik, Son of Yawgmoth"]!]!;
    expect(krrik.uncastable).toBe(true);
    expect(canEverCast(krrik)).toBe(false);
    const s = newGame(2);
    const id = put(s, 'P1', krrik.id, 'hand');
    mana(s, 'P1', { B: 10, C: 10 });
    expect(getLegalActions(s).some((a) => a.type === 'CastSpell' && a.card === id)).toBe(false);
  });
});

/** A sealed-style deck: 23 random cards from the set and 17 basic lands of their two main colors. */
function randomDeck(seed: number): CardDefId[] {
  const rand = makeRng(seed);
  const pool = names.map((n) => CARD_IDS_BY_NAME[n]!).filter((id) => !BASICS.includes(id));
  const picks = Array.from({ length: 23 }, () => pool[Math.floor(rand() * pool.length)]!);
  const counts: Record<string, number> = {};
  for (const id of picks) for (const c of CARD_DEFS[id]!.colorIdentity ?? []) counts[c] = (counts[c] ?? 0) + 1;
  const colors = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([c]) => c);
  const basic: Record<string, CardDefId> = { W: 'plains', U: 'island', B: 'swamp', R: 'mountain', G: 'forest' };
  const lands = Array.from({ length: 17 }, (_, i) => basic[colors[i % Math.max(1, colors.length)] ?? 'W'] ?? 'plains');
  return [...picks, ...lands];
}

describe.each([2, 3, 4])('random sealed decks, %i players', (players) => {
  it.each([
    ['random bots', randomBot],
    ['AI', basicAi],
  ] as const)('%s finish games without breaking invariants', (_label, make) => {
    for (let seed = 1; seed <= 3; seed++) {
      const setup: GameSetup = {
        format: FREE_FOR_ALL,
        cardDefs: CARD_DEFS,
        seed: seed * 101 + players,
        players: Array.from({ length: players }, (_, i) => ({ id: `P${i + 1}`, deck: randomDeck(seed * 10 + i) })),
        skipDeckValidation: true,
        mulligans: true,
      };
      const game = playGame(setup, Object.fromEntries(setup.players.map((p, i) => [p.id, make(seed * 7 + i)])), {
        maxActions: 4000,
        onAction: (s) => {
          const problems = checkInvariants(s);
          if (problems.length) throw new Error(problems.join('; '));
        },
      });
      expect(game.actions.length).toBeGreaterThan(0);
    }
  }, 300_000);
});
