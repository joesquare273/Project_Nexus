// The AI's threat assessment: whom it attacks, and what it holds back.

import { describe, expect, it } from 'vitest';
import { getLegalActions, type Action, type Attack, type GameState } from '@nexus/engine';
import { CARD_IDS_BY_NAME } from '@nexus/cards';
import { basicAi } from '../src/index.ts';
import { newGame, put } from './kit-helpers.ts';

const id = (name: string) => CARD_IDS_BY_NAME[name]!;
const TITAN = id('Sun Titan'); // 6/6 vigilance

/** P1 is about to declare attackers in a game of `players`. */
function attackStep(players: number): GameState {
  const s = newGame(players);
  s.step = 'declareAttackers';
  s.combat = { attacks: [], blocks: [], blockersPending: [] };
  s.pending = { kind: 'declareAttackers', player: 'P1' };
  return s;
}

function attacksOf(s: GameState, ai = basicAi()): Attack[] {
  const a = ai(s, getLegalActions(s)) as Extract<Action, { type: 'DeclareAttackers' }>;
  expect(a.type).toBe('DeclareAttackers');
  return a.attacks;
}
const targets = (attacks: Attack[]) => [...new Set(attacks.map((a) => a.defender))];

describe('AI threat assessment', () => {
  it("doesn't just attack the first player at the table: it goes after the biggest threat", () => {
    const s = attackStep(3);
    put(s, 'P1', 'undercity-dire-rat');
    // P3 has a big board, but it's tapped, so it can't block this turn.
    for (let i = 0; i < 3; i++) put(s, 'P3', TITAN, 'battlefield', { tapped: true });
    expect(targets(attacksOf(s))).toEqual(['P3']);
  });

  it('finishes off a player it can kill this turn', () => {
    const s = attackStep(3);
    put(s, 'P1', TITAN);
    for (let i = 0; i < 2; i++) put(s, 'P2', TITAN, 'battlefield', { tapped: true });
    s.players.P3!.life = 5;
    expect(targets(attacksOf(s))).toEqual(['P3']);
  });

  it('sends attackers where they get through, not into a blocker that kills them', () => {
    const s = attackStep(3);
    put(s, 'P1', 'undercity-dire-rat');
    put(s, 'P2', TITAN); // an untapped 6/6 that would eat the rat
    expect(targets(attacksOf(s))).toEqual(['P3']);
  });

  it('holds back blockers when the biggest threat could kill it next turn', () => {
    const s = attackStep(2);
    const mine = put(s, 'P1', TITAN);
    s.players.P1!.life = 10;
    for (let i = 0; i < 2; i++) put(s, 'P2', TITAN, 'battlefield', { tapped: true });
    s.players.P2!.life = 40;
    expect(attacksOf(s).map((a) => a.attacker)).not.toContain(mine);
  });

  it('holds a grudge against whoever attacked it', () => {
    const ai = basicAi();
    // P2 attacks the AI's player first.
    const before = newGame(3);
    const attacker = put(before, 'P2', TITAN);
    before.step = 'declareBlockers';
    before.combat = { attacks: [{ attacker, defender: 'P1' }], blocks: [], blockersPending: ['P1'] };
    before.pending = { kind: 'declareBlockers', player: 'P1' };
    ai(before, getLegalActions(before));
    // Later, with P2 and P3 otherwise alike, it attacks P2.
    const s = attackStep(3);
    put(s, 'P1', 'undercity-dire-rat');
    expect(targets(attacksOf(s, ai))).toEqual(['P2']);
  });
});
