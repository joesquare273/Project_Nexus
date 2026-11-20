// The Dominion Bracelet online (rule 722): the seat that controls another player's turn sends that
// player's actions, and sees their hand; the controlled seat can't act.

import { describe, expect, it } from 'vitest';
import { COMMANDER, visibleCards, type GameState } from '@nexus/engine';
import { CARD_DEFS, preconDeck, FIN_PRECONS } from '@nexus/cards';
import { HostedGame } from '../src/hostedGame.ts';
import type { Seat, ServerMessage } from '../src/protocol.ts';

describe('controlling another seat’s turn online', () => {
  it('P1 acts for P2 during the controlled turn, P2 is refused, and P1 is sent P2’s hand', () => {
    const sent: Record<string, ServerMessage[]> = {};
    let n = 0;
    const game = new HostedGame({
      setup: { format: COMMANDER, cardDefs: CARD_DEFS, seed: 3, players: (['P1', 'P2'] as Seat[]).map((id, i) => ({ id, ...preconDeck(FIN_PRECONS[i]!.name) })) },
      names: { P1: 'Ann', P2: 'Bea' },
      bots: {},
      alias: () => `a${n++}`,
      schedule: () => () => {},
      botDelayMs: 0,
      botGameLimit: 100,
      send: (seat, m) => (sent[seat] ??= []).push(m),
      onOver: () => {},
    });
    // Skip to P2's main phase, with P1 controlling P2's turn.
    const s: GameState = game.state;
    s.activePlayer = 'P2';
    s.step = 'main1';
    s.pending = { kind: 'priority', player: 'P2', passes: 0 };
    s.turnControl = [{ player: 'P2', by: 'P1', turn: s.turnNumber }];
    expect(game.act('P2', 1, game.version, [{ type: 'PassPriority', player: 'P2' }])).toMatchObject({ code: 'not-your-decision' });
    expect(game.act('P1', 1, game.version, [{ type: 'Concede', player: 'P2' }])).toMatchObject({ code: 'wrong-player' });
    expect(game.act('P1', 2, game.version, [{ type: 'PassPriority', player: 'P2' }])).toBeNull();
    // What P1 is sent includes P2's hand (the same rule as the local board, tested in eoe-set-cards.test.ts).
    expect(game.state.players.P2!.hand.every((id) => visibleCards(game.state, 'P1').has(id))).toBe(true);
    expect(game.state.players.P1!.hand.some((id) => visibleCards(game.state, 'P2').has(id))).toBe(false);
  });
});
