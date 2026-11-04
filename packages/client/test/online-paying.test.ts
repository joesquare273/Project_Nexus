// Paying for a spell by hand in an online game (Commander or 60-card tables,
// draft games): the taps happen on the board at once and go to the server
// together with the spell, as one batch. Before, each tap waited for the
// server, the spell was never cast, and further taps said "Waiting for the
// server…".

import { describe, expect, it } from 'vitest';
import { AliasBook, FREE_FOR_ALL, createGame, playerUpdate, type Action, type GameState } from '@nexus/engine';
import { CARD_DEFS, starterKitDeck } from '@nexus/cards';
import type { ClientMessage, ServerMessage } from '@nexus/server/protocol';
import { OnlineSession, type GameLink } from '../src/game/online.ts';
import { YOU } from '../src/game/session.ts';

function table() {
  const { state } = createGame({
    format: FREE_FOR_ALL,
    cardDefs: CARD_DEFS,
    seed: 3,
    players: [
      { id: 'P1', deck: starterKitDeck('RW') },
      { id: 'P2', deck: starterKitDeck('UB') },
    ],
  });
  const s = state as GameState;
  s.activePlayer = 'P1';
  s.step = 'main1';
  s.pending = { kind: 'priority', player: 'P1', passes: 0 };
  // Two Mountains and a two-mana red spell for P1.
  const add = (defId: string, zone: 'battlefield' | 'hand') => {
    const id = `x${s.nextId++}`;
    s.cards[id] = { id, defId, owner: 'P1', controller: 'P1', zone, tapped: false, summoningSick: false, damage: 0, deathtouched: false };
    s.players.P1![zone].push(id);
    return id;
  };
  const lands = [add('mountain', 'battlefield'), add('mountain', 'battlefield')];
  const spellDef = Object.values(CARD_DEFS).find((d) => d.types.includes('creature') && d.manaCost === '{1}{R}' && !d.notBuilt && !d.token)!;
  const spell = add(spellDef.id, 'hand');
  const book = new AliasBook(() => `a${Math.random().toString(36).slice(2, 10)}`);
  const update = playerUpdate(s, 'P1', book, []);
  const sent: ClientMessage[] = [];
  let listener: (m: ServerMessage) => void = () => {};
  const link: GameLink = { send: (m) => sent.push(m), listen: (l) => (listener = l), close: () => {}, onClose: () => {} };
  const session = new OnlineSession(link, { type: 'update', version: 0, seat: 'P1', names: { P1: 'Me', P2: 'Opponent' }, ackSeq: 0, update }, 'RW', 'constructed');
  // The client sees aliases: find the cards by what they are.
  const mine = (defId: string, zone: 'battlefield' | 'hand') => session.state.players[YOU]![zone].filter((id) => session.state.cards[id]!.defId === defId);
  return { session, sent, listener: () => listener, lands: mine('mountain', 'battlefield'), spell: mine(spellDef.id, 'hand')[0]!, count: { lands: lands.length, spell } };
}

describe('paying by hand online', () => {
  it('taps on the board at once and sends the taps with the spell in one batch', () => {
    const { session, sent, lands, spell } = table();
    expect(lands).toHaveLength(2);
    const cast: Action = { type: 'CastSpell', player: YOU, card: spell, targets: [] };
    expect(session.canSubmit([cast])).toBe(false);
    session.holdPriority = true;
    for (const land of lands) {
      expect(session.submit([{ type: 'ActivateManaAbility', player: YOU, card: land, mana: 'R' }])).toBeNull();
    }
    // Nothing went to the server yet, and no "Waiting for the server…".
    expect(sent).toHaveLength(0);
    expect(session.state.players[YOU]!.manaPool.R).toBe(2);
    expect(session.canSubmit([cast])).toBe(true);
    session.holdPriority = false;
    expect(session.submit([cast])).toBeNull();
    expect(sent).toHaveLength(1);
    const batch = sent[0] as Extract<ClientMessage, { type: 'actions' }>;
    expect(batch.actions.map((a) => a.type)).toEqual(['ActivateManaAbility', 'ActivateManaAbility', 'CastSpell']);
    expect(batch.actions.every((a) => a.player === 'P1')).toBe(true);
  });

  it('stopping halfway sends the taps on their own', () => {
    const { session, sent, lands } = table();
    session.holdPriority = true;
    session.submit([{ type: 'ActivateManaAbility', player: YOU, card: lands[0]!, mana: 'R' }]);
    expect(sent).toHaveLength(0);
    session.holdPriority = false;
    session.advance();
    expect(sent).toHaveLength(1);
    expect((sent[0] as Extract<ClientMessage, { type: 'actions' }>).actions.map((a) => a.type)).toEqual(['ActivateManaAbility']);
  });
});
