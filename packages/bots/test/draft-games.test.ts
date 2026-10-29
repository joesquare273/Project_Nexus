// Drafted decks in real games: everyone drafts (AI picks), builds a deck with
// the AI deckbuilder, and the decks play a Limited game with every rule
// invariant checked, at 2, 3 and 4 players.

import { describe, expect, it } from 'vitest';
import { LIMITED, createGame, type GameSetup } from '@nexus/engine';
import { CARD_DEFS } from '@nexus/cards';
import { aiPick, createDraft, lockPick, type DraftState } from '@nexus/cards/draft';
import { aiDeck, deckList } from '@nexus/cards/limited';
import { basicAi, playGame, randomBot } from '../src/index.ts';
import { checkInvariants } from '../src/invariants.ts';

function draftedDecks(players: number, seed: number) {
  let s: DraftState = createDraft(Array.from({ length: players }, (_, i) => `P${i + 1}`), seed);
  while (!s.done) for (const seat of s.seats) if (s.packs[seat] && !s.locked[seat]) s = lockPick(s, seat, aiPick(s, seat));
  return s.seats.map((seat) => deckList(aiDeck(s.picks[seat]!), s.picks[seat]!));
}

describe.each([2, 3, 4])('drafted decks, %i players', (players) => {
  it('pass the Limited deck rules', () => {
    const decks = draftedDecks(players, 30 + players);
    expect(() =>
      createGame({ format: LIMITED, cardDefs: CARD_DEFS, seed: 1, players: decks.map((deck, i) => ({ id: `P${i + 1}`, deck })) }),
    ).not.toThrow();
  });

  it.each([
    ['AI', basicAi],
    ['random bots', randomBot],
  ] as const)('play a Limited game with %s without breaking invariants', (_label, make) => {
    const decks = draftedDecks(players, 40 + players);
    const setup: GameSetup = { format: LIMITED, cardDefs: CARD_DEFS, seed: 7, players: decks.map((deck, i) => ({ id: `P${i + 1}`, deck })), mulligans: true };
    const game = playGame(setup, Object.fromEntries(setup.players.map((p, i) => [p.id, make(i + 3)])), {
      maxActions: 6000,
      onAction: (s) => {
        const problems = checkInvariants(s);
        if (problems.length) throw new Error(problems.join('; '));
      },
    });
    expect(game.state.players.P1!.life).toBeLessThanOrEqual(20 + 50);
    expect(game.actions.length).toBeGreaterThan(20);
  }, 300_000);
});
