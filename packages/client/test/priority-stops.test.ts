import { describe, expect, it } from 'vitest';
import { CARD_IDS_BY_NAME } from '@nexus/cards';
import { GameSession, YOU } from '../src/game/session.ts';
import { mana, newGame, put } from '../../bots/test/kit-helpers.ts';

function emptySession(players: number) {
  const state = newGame(players);
  const names = Object.fromEntries(state.turnOrder.map((id, i) => [id, i === 0 ? YOU : `Bot${i}`]));
  state.players = Object.fromEntries(Object.entries(state.players).map(([id, p]) => [names[id]!, { ...p, id: names[id]! }]));
  state.turnOrder = state.turnOrder.map((id) => names[id]!);
  for (const c of Object.values(state.cards)) {
    c.owner = names[c.owner]!;
    c.controller = names[c.controller]!;
  }
  state.activePlayer = YOU;
  state.step = 'upkeep';
  state.pending = { kind: 'priority', player: YOU, passes: 0 };
  return new GameSession({ deck: 'RW', opponents: players - 1, seed: 1, bot: 'ai' }, {
    state,
    bots: Object.fromEntries(state.turnOrder.slice(1).map((id) => [id, () => ({ type: 'PassPriority' as const, player: id })])),
  });
}

describe.each([2, 3, 4])('priority controls with %i players', (players) => {
  it('keeps default automatic passing without a playable card', () => {
    const session = emptySession(players);
    expect(session.plays()).toEqual([]);
    expect(session.advance()).toBe('auto');
    expect(session.state.pending).toMatchObject({ kind: 'priority', player: 'Bot1' });
    expect(session.state.step).toBe('upkeep');
  });

  it.each([YOU, 'Bot1'])('full control pauses on %s\'s turn even without plays', (active) => {
    const session = emptySession(players);
    session.state.activePlayer = active;
    session.stopEverywhere = true;
    const before = session.state;
    expect(session.advance()).toBe('you');
    expect(session.state).toBe(before);
    expect(session.submit([{ type: 'PassPriority', player: YOU }])).toBeNull();
    expect(session.state.pending).toMatchObject({ kind: 'priority', player: 'Bot1' });
  });

  it('honors a selected step until it is explicitly removed', () => {
    const session = emptySession(players);
    session.phaseStops.add('upkeep');
    expect(session.advance()).toBe('you');
    expect(session.advance()).toBe('you');
    session.phaseStops.delete('upkeep');
    expect(session.advance()).toBe('auto');
    expect(session.state.pending).toMatchObject({ kind: 'priority', player: 'Bot1' });
  });

  it('draws before stopping and never skips another player\'s priority', () => {
    const session = emptySession(players);
    session.phaseStops.add('draw');
    session.stopEverywhere = true;
    expect(session.submit([{ type: 'PassPriority', player: YOU }])).toBeNull();
    for (let i = 1; i < players; i++) {
      expect(session.state.pending).toMatchObject({ kind: 'priority', player: `Bot${i}` });
      // The final pass draws a visible card before returning priority.
      expect(session.advance()).toBe(i === players - 1 ? 'bot' : 'auto');
    }
    expect(session.state.step).toBe('draw');
    expect(session.state.players[YOU]!.hand).toHaveLength(1);
    expect(session.advance()).toBe('you');
    session.stopEverywhere = false;
    expect(session.advance()).toBe('you');
  });

  it('allows responding to your own spell with full control', () => {
    const session = emptySession(players);
    session.state.step = 'main1';
    const card = put(session.state, YOU, CARD_IDS_BY_NAME.Harmonize!, 'hand');
    mana(session.state, YOU, { G: 2, C: 2 });
    const choice = session.plays().find((p) => p.card === card)!.choices[0]!;
    expect(session.submit([...choice.taps, choice.action])).toBeNull();
    expect(session.state.stack).toHaveLength(1);
    expect(session.plays()).toEqual([]);
    session.stopEverywhere = true;
    expect(session.advance()).toBe('you');
    expect(session.state.stack).toHaveLength(1);
  });
});
