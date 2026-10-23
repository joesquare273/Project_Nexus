import { describe, expect, it } from 'vitest';
import { createGame, FREE_FOR_ALL, type GameState } from '@nexus/engine';
import { CARD_DEFS } from '@nexus/cards';
import { passiveBot } from '@nexus/bots';
import { GameSession } from '../src/game/session.ts';

function fixture(players = 2) {
  const ids = ['You', 'Bot1', 'Bot2', 'Bot3'].slice(0, players);
  const { state: s } = createGame({ format: FREE_FOR_ALL, cardDefs: CARD_DEFS, players: ids.map(id => ({ id, deck: Array(30).fill('island') })), seed: 1, skipDeckValidation: true });
  for (const id of ids) {
    const p = s.players[id]!;
    for (const c of p.hand) s.cards[c]!.zone = 'library';
    p.library.push(...p.hand); p.hand = [];
  }
  s.activePlayer = 'Bot1'; s.step = 'main1'; s.turnNumber = 2;
  s.pending = { kind: 'priority', player: 'Bot1', passes: 0 };
  const session = new GameSession({ deck: 'RW', opponents: players - 1, seed: 1, bot: 'ai' }, {
    state: s, bots: Object.fromEntries(ids.slice(1).map(id => [id, (state, legal) => legal.find(a => a.type === 'CastSpell') ?? passiveBot()(state, legal)])),
  });
  return session;
}
function put(s: GameState, owner: string, defId: string, zone: 'hand' | 'battlefield') {
  const id = `test${s.nextId++}`;
  s.cards[id] = { id, defId, owner, controller: owner, zone, tapped: false, summoningSick: false, damage: 0, deathtouched: false };
  s.players[owner]![zone].push(id);
  return id;
}

describe.each([2, 3, 4])('visible AI pacing with %i players', players => {
  it('shows a cast spell, skips empty passes, then pauses its automatic resolution before continuing', () => {
    const session = fixture(players), s = session.state;
    const stone = put(s, 'Bot1', 'mind-stone', 'hand');
    s.players.Bot1!.manaPool.C = 2;
    expect(session.advance()).toBe('bot');
    expect(session.presentationDelayMs).toBeGreaterThanOrEqual(1500);
    expect(session.state.cards[stone]!.zone).toBe('stack');
    for (let i = 0; i < players - 1; i++) expect(session.advance()).toBe('auto');
    expect(session.state.cards[stone]!.zone).toBe('stack');
    expect(session.advance()).toBe('bot');
    expect(session.presentationDelayMs).toBeGreaterThanOrEqual(1500);
    expect(session.state.cards[stone]!.zone).toBe('battlefield');
    expect(session.state.activePlayer).toBe('Bot1');
    expect(session.recent.has(stone)).toBe(true);
  });

  it('shows damage from a human automatic pass before advancing beyond combat damage', () => {
    const session = fixture(players), s = session.state;
    const attacker = put(s, 'Bot1', 'soldier-token', 'battlefield');
    s.step = 'declareBlockers'; s.pending = { kind: 'priority', player: 'You', passes: players - 1 };
    s.combat = { attacks: [{ attacker, defender: 'You' }], blocks: [], blockersPending: [] };
    const before = s.players.You!.life;
    expect(session.advance()).toBe('bot');
    expect(session.state.step).toBe('combatDamage');
    expect(session.state.players.You!.life).toBe(before - 1);
    expect(session.presentationDelayMs).toBeGreaterThanOrEqual(1500);
    expect(session.recent.has(attacker)).toBe(true);
  });

  it('respects full control while pacing, without passing a player’s priority', () => {
    const session = fixture(players);
    session.state.pending = { kind: 'priority', player: 'You', passes: 0 };
    session.stopEverywhere = true;
    const before = structuredClone(session.state);
    expect(session.advance()).toBe('you');
    expect(session.state).toEqual(before);
  });
});

it('offers a faster pace and extra reading time without changing the engine outcome', () => {
  const results = ['fast', 'normal', 'slow'].map(pace => {
    const session = fixture();
    session.aiPace = pace as typeof session.aiPace;
    put(session.state, 'Bot1', 'mind-stone', 'hand');
    session.state.players.Bot1!.manaPool.C = 2;
    session.advance();
    return { state: session.state, delay: session.presentationDelayMs };
  });
  expect(results[0]!.delay).toBeLessThan(results[1]!.delay);
  expect(results[1]!.delay).toBeLessThan(results[2]!.delay);
  expect(results[0]!.state).toEqual(results[2]!.state);
});
