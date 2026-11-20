// The Dominion Bracelet (rule 722): you make every decision for the player you control during
// their turn, and a bot that controls you plays your turn.

import { describe, expect, it } from 'vitest';
import type { Action, GameState } from '@nexus/engine';
import { GameSession, YOU } from '../src/game/session.ts';
import { newGame, put } from '../../bots/test/kit-helpers.ts';

function game(active: string, controlledBy: string, setup: (s: GameState) => void = () => {}) {
  const state = newGame(2);
  const names: Record<string, string> = { P1: YOU, P2: 'Bot1' };
  state.players = Object.fromEntries(Object.entries(state.players).map(([id, p]) => [names[id]!, { ...p, id: names[id]! }]));
  state.turnOrder = state.turnOrder.map((id) => names[id]!);
  for (const c of Object.values(state.cards)) {
    c.owner = names[c.owner]!;
    c.controller = names[c.controller]!;
  }
  state.activePlayer = active;
  state.step = 'main1';
  state.pending = { kind: 'priority', player: active, passes: 0 };
  state.turnControl = [{ player: active, by: controlledBy, turn: state.turnNumber }];
  setup(state);
  const botMoves: Action[] = [];
  const bot = (s: GameState) => {
    const a: Action = { type: 'PassPriority', player: (s.pending as { player: string }).player };
    botMoves.push(a);
    return a;
  };
  return { session: new GameSession({ deck: 'RW', opponents: 1, seed: 1, bot: 'ai' }, { state, bots: { Bot1: bot } }), botMoves };
}

describe('controlling another player’s turn', () => {
  it('you decide for the bot you control: the board waits on you, offers their cards, and takes actions as them', () => {
    let land = '';
    const { session, botMoves } = game('Bot1', YOU, (s) => {
      s.players.Bot1!.hand = [];
      land = put(s, 'Bot1', 'forest', 'hand');
    });
    expect([session.decidesNow(), session.actor(), session.advance()]).toEqual([true, 'Bot1', 'you']);
    expect(botMoves).toHaveLength(0);
    expect(session.plays().some((p) => p.card === land)).toBe(true);
    expect(session.view().players.Bot1!.hand).toContain(land);
    expect(session.submit([{ type: 'PlayLand', player: 'Bot1', card: land }])).toBeNull();
    expect(session.state.cards[land]!.zone).toBe('battlefield');
    expect(session.state.cards[land]!.controller).toBe('Bot1');
  });

  it('a bot that controls you makes your decisions', () => {
    const { session, botMoves } = game(YOU, 'Bot1');
    expect(session.decidesNow()).toBe(false);
    session.advance();
    expect(botMoves[0]).toEqual({ type: 'PassPriority', player: YOU });
  });
});
