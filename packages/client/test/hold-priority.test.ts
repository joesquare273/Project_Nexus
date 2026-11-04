// Holding priority (rule 117.3c) only means something when you could still
// act at instant speed and pay for it (rule 117.1a): an instant, a flash
// spell, or an activated ability that isn't sorcery-speed. Otherwise the
// board passes for you even with "Hold priority" on.

import { describe, expect, it } from 'vitest';
import type { GameState } from '@nexus/engine';
import { GameSession, YOU } from '../src/game/session.ts';
import { newGame, put } from '../../bots/test/kit-helpers.ts';

/** You in your first main phase with a creature spell on the stack, the bot passing. */
function withSpellOnStack(setup: (s: GameState) => void) {
  const state = newGame(2);
  const names: Record<string, string> = { P1: YOU, P2: 'Bot1' };
  state.players = Object.fromEntries(Object.entries(state.players).map(([id, p]) => [names[id]!, { ...p, id: names[id]! }]));
  state.turnOrder = state.turnOrder.map((id) => names[id]!);
  for (const c of Object.values(state.cards)) {
    c.owner = names[c.owner]!;
    c.controller = names[c.controller]!;
  }
  state.activePlayer = YOU;
  state.step = 'main1';
  state.pending = { kind: 'priority', player: YOU, passes: 0 };
  state.players[YOU]!.hand = [];
  const cat = put(state, YOU, 'coeurl', 'hand');
  state.players[YOU]!.manaPool.W = 1;
  state.players[YOU]!.manaPool.C = 1;
  setup(state);
  const session = new GameSession({ deck: 'RW', opponents: 1, seed: 1, bot: 'ai' }, { state, bots: { Bot1: () => ({ type: 'PassPriority' as const, player: 'Bot1' }) } });
  expect(session.submit([{ type: 'CastSpell', player: YOU, card: cat, targets: [] }])).toBeNull();
  expect(session.state.stack).toHaveLength(1);
  session.keepPriority = true;
  return session;
}

describe('hold priority', () => {
  it('with nothing you could do at instant speed, it passes for you', () => {
    const session = withSpellOnStack((s) => {
      put(s, YOU, 'forest');
    });
    expect(session.canHoldPriority()).toBe(false);
    expect(session.advance()).not.toBe('you');
    expect(session.state.pending).toMatchObject({ kind: 'priority', player: 'Bot1' });
  });

  it('an instant you can pay for: it waits for you', () => {
    const session = withSpellOnStack((s) => {
      put(s, YOU, 'lightning-bolt', 'hand');
      put(s, YOU, 'mountain');
    });
    expect(session.canHoldPriority()).toBe(true);
    expect(session.advance()).toBe('you');
  });

  it('an instant you can’t pay for, or a sorcery, doesn’t count', () => {
    const noMana = withSpellOnStack((s) => {
      put(s, YOU, 'lightning-bolt', 'hand');
    });
    expect(noMana.canHoldPriority()).toBe(false);
    const sorcery = withSpellOnStack((s) => {
      put(s, YOU, 'cultivate', 'hand');
      put(s, YOU, 'forest');
      put(s, YOU, 'forest');
      put(s, YOU, 'forest');
    });
    expect(sorcery.instantSpeedPlays().map((p) => s(sorcery, p.card))).not.toContain('cultivate');
    expect(sorcery.canHoldPriority()).toBe(false);
  });

  it('an activated ability that isn’t sorcery-speed counts; a sorcery-speed one (station) doesn’t', () => {
    const ballista = withSpellOnStack((s) => {
      put(s, YOU, 'walking-ballista', 'battlefield', { counters: 2 });
    });
    expect(ballista.canHoldPriority()).toBe(true);
    const ship = withSpellOnStack((s) => {
      put(s, YOU, 'uthros-research-craft');
      put(s, YOU, 'coeurl');
    });
    expect(ship.canHoldPriority()).toBe(false);
  });
});

/** The card's definition id, for readable checks. */
function s(session: GameSession, id: string) {
  return session.state.cards[id]!.defId;
}
