// Plays whole games through GameSession the way the board does: plays from
// `plays()`, combat and choices from the engine's legal actions, and
// `advance()` for bots and automatic passes. Checks the session never gets
// stuck or offers something the engine rejects.

import { describe, expect, it } from 'vitest';
import { makeRng } from '@nexus/bots';
import type { Action } from '@nexus/engine';
import { GameSession, YOU, type DeckChoice } from '../src/game/session.ts';

/** A clicking human: random but always using what the board would offer. */
function humanMove(session: GameSession, rand: () => number): Action[] {
  const s = session.state;
  const pending = s.pending;
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)]!;
  if (pending.kind === 'priority') {
    const plays = session.plays();
    if (plays.length === 0 || rand() < 0.3) return [{ type: 'PassPriority', player: YOU }];
    const choice = pick(pick(plays).choices);
    return [...choice.taps, choice.action];
  }
  const legal = session.legal();
  if (pending.kind === 'decide') {
    const yes = legal.find((a) => a.type === 'Decide' && a.accept);
    if (yes) return [yes];
    const taps = legal.filter((a) => a.type === 'ActivateManaAbility');
    return taps.length > 0 && rand() < 0.7 ? [taps[0]!] : [{ type: 'Decide', player: YOU, accept: false }];
  }
  return [pick(legal)];
}

describe.each([1, 2, 3])('a browser session with %i opponent(s)', (opponents) => {
  it.each(['RW', 'UB'] as DeckChoice[])('plays %s games to the end', (deck) => {
    for (let seed = 1; seed <= 4; seed++) {
      const session = new GameSession({ deck, opponents, seed, bot: 'ai' });
      const rand = makeRng(seed * 13 + opponents);
      let decisions = 0;
      for (let guard = 0; guard < 50_000; guard++) {
        const step = session.advance();
        if (step === 'over') break;
        if (step !== 'you') continue;
        const error = session.submit(humanMove(session, rand));
        expect(error, `seed ${seed}`).toBeNull();
        decisions++;
      }
      expect(session.state.pending.kind, `seed ${seed} did not finish`).toBe('gameOver');
      expect(decisions).toBeGreaterThan(0);
      expect(session.log.length).toBeGreaterThan(10);
    }
  }, 60_000);
});

describe('GameSession', () => {
  it('only shows you what you are allowed to see', () => {
    const session = new GameSession({ deck: 'UB', opponents: 2, seed: 5, bot: 'ai' });
    const view = session.view();
    expect(view.players[YOU]!.hand).toHaveLength(7);
    expect(view.players.Bot1!.hand).toBeUndefined();
    for (const id of session.state.players.Bot1!.hand) expect(view.cards[id]).toBeUndefined();
  });

  it('turns engine errors into readable messages', () => {
    const session = new GameSession({ deck: 'UB', opponents: 1, seed: 5, bot: 'ai' });
    const card = session.state.players[YOU]!.hand[0]!;
    const error = session.submit([{ type: 'PlayLand', player: 'Bot1', card }]);
    expect(error).toMatch(/priority|not in your hand/);
  });
});
