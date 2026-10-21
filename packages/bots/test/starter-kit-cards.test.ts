// The real Starter Kit card definitions, played through the engine end to
// end. Engine tests use look-alike test cards; these check the JSON itself.

import { describe, expect, it } from 'vitest';
import {
  FREE_FOR_ALL,
  applyAction,
  createGame,
  type Action,
  type GameState,
  type InstanceId,
  type PlayerId,
  type ZoneName,
} from '@nexus/engine';
import { CARD_DEFS } from '@nexus/cards';
import { rulesSummary } from '../src/narrate.ts';

function newGame(): GameState {
  const { state } = createGame({
    format: FREE_FOR_ALL,
    cardDefs: CARD_DEFS,
    seed: 1,
    players: ['P1', 'P2'].map((id) => ({ id, deck: Array(20).fill('island') })),
    skipDeckValidation: true,
  });
  state.activePlayer = 'P1';
  state.step = 'main1';
  state.turnNumber = 2;
  state.pending = { kind: 'priority', player: 'P1', passes: 0 };
  return state;
}

function put(s: GameState, owner: PlayerId, defId: string, zone: Exclude<ZoneName, 'stack' | 'library' | 'void'> = 'battlefield'): InstanceId {
  const id = `t${s.nextId++}`;
  s.cards[id] = { id, defId, owner, controller: owner, zone, tapped: false, summoningSick: false, damage: 0, deathtouched: false };
  s.players[owner]![zone].push(id);
  return id;
}

function act(s: GameState, action: Action): GameState {
  const r = applyAction(s, action);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

/** Everyone passes once. */
function passAll(s: GameState): GameState {
  for (let i = 0; i < 2 && s.pending.kind === 'priority'; i++) s = act(s, { type: 'PassPriority', player: s.pending.player });
  return s;
}

describe('Final Fantasy Starter Kit cards', () => {
  it('Al Bhed Salvagers drains when it or another of your creatures dies', () => {
    let s = newGame();
    const salvagers = put(s, 'P1', 'al-bhed-salvagers');
    const intervention = put(s, 'P1', 'sephiroths-intervention', 'hand');
    s.players.P1!.manaPool.B = 4;
    s = act(s, { type: 'CastSpell', player: 'P1', card: intervention, targets: [{ kind: 'card', card: salvagers }] });
    s = passAll(passAll(s));
    expect(s.players.P2!.life).toBe(19);
    expect(s.players.P1!.life).toBe(20 + 2 + 1);
  });

  it("G'raha Tia draws once a turn when your other creatures die", () => {
    let s = newGame();
    put(s, 'P1', 'graha-tia');
    const victims = [put(s, 'P1', 'al-bhed-salvagers'), put(s, 'P1', 'coeurl')];
    const hand = s.players.P1!.hand.length;
    for (const victim of victims) {
      const kill = put(s, 'P1', 'sephiroths-intervention', 'hand');
      s.players.P1!.manaPool.B = 4;
      s = act(s, { type: 'CastSpell', player: 'P1', card: kill, targets: [{ kind: 'card', card: victim }] });
      s = passAll(s);
      while (s.stack.length > 0) s = passAll(s);
    }
    // One draw from G'raha Tia; the Salvagers drain doesn't draw.
    expect(s.players.P1!.hand.length).toBe(hand + 1);
  });

  it("Shambling Cie'th returns to hand when you cast a noncreature spell and pay {B}", () => {
    let s = newGame();
    const cieth = put(s, 'P1', 'shambling-cieth', 'graveyard');
    const swamp = put(s, 'P1', 'swamp');
    const intervention = put(s, 'P1', 'sephiroths-intervention', 'hand');
    const target = put(s, 'P2', 'coeurl');
    s.players.P1!.manaPool.B = 4;
    s = act(s, { type: 'CastSpell', player: 'P1', card: intervention, targets: [{ kind: 'card', card: target }] });
    s = passAll(s);
    expect(s.pending.kind).toBe('decide');
    s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: swamp, mana: 'B' });
    s = act(s, { type: 'Decide', player: 'P1', accept: true });
    expect(s.cards[cieth]!.zone).toBe('hand');
  });

  it('Ultimecia taps the opposing team and draws on combat damage', () => {
    let s = newGame();
    const ultimecia = put(s, 'P1', 'ultimecia-temporal-threat', 'hand');
    const blocker = put(s, 'P2', 'sahagin');
    s.players.P1!.manaPool.U = 6;
    s = act(s, { type: 'CastSpell', player: 'P1', card: ultimecia });
    s = passAll(passAll(s));
    expect(s.cards[blocker]!.tapped).toBe(true);
  });

  it('summaries describe the abilities', () => {
    expect(rulesSummary(CARD_DEFS['al-bhed-salvagers']!)).toBe(
      '2/3 Whenever this or another creature or artifact you control dies, target opponent loses 1 life and you gain 1 life.',
    );
    expect(rulesSummary(CARD_DEFS['graha-tia']!)).toBe(
      '3/5 Reach. Whenever one or more other creatures or artifacts you control die, draw a card. This triggers only once each turn.',
    );
    expect(rulesSummary(CARD_DEFS['shambling-cieth']!)).toBe(
      '3/3 Enters tapped. Whenever you cast a noncreature spell, you may pay {B}. If you do, return this card to your hand. This works while the card is in your graveyard.',
    );
    expect(rulesSummary(CARD_DEFS['ultimecia-temporal-threat']!)).toBe(
      '4/4 When this enters, tap each creature your opponents control. Whenever this or another creature you control deals combat damage to a player, draw a card.',
    );
  });
});
