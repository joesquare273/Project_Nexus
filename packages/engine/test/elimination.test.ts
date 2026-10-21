import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/index.ts';
import { act, addMana, eventsOf, newGame, passAll, passUntil, put, setTurn, zoneOf } from './helpers.ts';

const shockPlayer = (target: string) => {
  const s = newGame(3);
  s.players[target]!.life = 2;
  const shock = put(s, 'P1', 'shock', 'hand');
  addMana(s, 'P1', { R: 1 });
  return act(s, { type: 'CastSpell', player: 'P1', card: shock, targets: [{ kind: 'player', player: target }] }).state;
};

describe('elimination in a pod', () => {
  it('a player at 0 life leaves and the game continues', () => {
    let s = shockPlayer('P2');
    const p2Bear = put(s, 'P2', 'bear');
    const r = passAll(s);
    s = r.state;
    expect(eventsOf(r.events, 'PlayerEliminated')).toEqual([{ type: 'PlayerEliminated', player: 'P2', reason: 'life' }]);
    expect(s.pending.kind).toBe('priority');
    expect(s.players.P2!.eliminated).toBe(true);
    // Everything they owned left the battlefield.
    expect(zoneOf(s, p2Bear)).toBe('exile');
  });

  it('eliminated players are skipped in turn order', () => {
    let s = passAll(shockPlayer('P2')).state;
    s = passUntil(s, 'upkeep');
    expect(s.activePlayer).toBe('P3');
  });

  it('the last player standing wins', () => {
    let s = newGame(2);
    s.players.P2!.life = 2;
    const shock = put(s, 'P1', 'shock', 'hand');
    addMana(s, 'P1', { R: 1 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: shock, targets: [{ kind: 'player', player: 'P2' }] }).state;
    const r = passAll(s);
    expect(eventsOf(r.events, 'GameEnded')).toEqual([{ type: 'GameEnded', winner: 'P1' }]);
    expect(r.state.pending).toEqual({ kind: 'gameOver' });
    expect(applyAction(r.state, { type: 'PassPriority', player: 'P1' })).toEqual({ ok: false, error: 'The game is over.' });
  });

  it('everyone losing at once is a draw', () => {
    let s = newGame(2);
    s.players.P1!.life = 1;
    s.players.P2!.life = 1;
    const quake = put(s, 'P1', 'quake', 'hand');
    addMana(s, 'P1', { R: 1 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: quake }).state;
    const r = passAll(s);
    expect(r.state.winner).toBeNull();
    expect(eventsOf(r.events, 'PlayerEliminated')).toHaveLength(2);
  });

  it('drawing from an empty library loses the game', () => {
    let s = setTurn(newGame(3), 'P1', 'upkeep');
    const p1 = s.players.P1!;
    for (const id of p1.library) s.cards[id]!.zone = 'exile';
    p1.exile.push(...p1.library);
    p1.library = [];
    const r = passAll(s);
    expect(eventsOf(r.events, 'PlayerEliminated')).toEqual([{ type: 'PlayerEliminated', player: 'P1', reason: 'emptyLibrary' }]);
    s = r.state;
    // P1 left during their own turn, so P2's turn begins and P2 draws normally.
    expect(s.activePlayer).toBe('P2');
    expect(s.step).toBe('upkeep');
    expect(s.winner).toBeUndefined();
  });

  it('players can concede at any time, even without priority', () => {
    const s = newGame(4);
    const r = act(s, { type: 'Concede', player: 'P3' });
    expect(r.state.players.P3!.eliminated).toBe(true);
    expect(r.state.pending).toEqual({ kind: 'priority', player: 'P1', passes: 0 });
  });

  it('if the active player leaves, the next player’s turn starts', () => {
    let s = newGame(3);
    const shock = put(s, 'P1', 'shock', 'hand');
    addMana(s, 'P1', { R: 1 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: shock, targets: [{ kind: 'player', player: 'P3' }] }).state;
    const r = act(s, { type: 'Concede', player: 'P1' });
    expect(r.state.activePlayer).toBe('P2');
    expect(r.state.stack).toEqual([]);
    expect(r.state.players.P3!.life).toBe(20);
    expect(zoneOf(r.state, shock)).toBe('exile');
  });

  it('removes attacks against a player who leaves mid-combat', () => {
    let s = newGame(3);
    const bear = put(s, 'P1', 'bear');
    const ogre = put(s, 'P1', 'ogre');
    s = passUntil(s, 'declareAttackers');
    s = act(s, {
      type: 'DeclareAttackers',
      player: 'P1',
      attacks: [
        { attacker: bear, defender: 'P2' },
        { attacker: ogre, defender: 'P3' },
      ],
    }).state;
    s = act(s, { type: 'Concede', player: 'P2' }).state;
    expect(s.combat!.attacks).toEqual([{ attacker: ogre, defender: 'P3' }]);
    s = passAll(s).state;
    expect(s.pending).toEqual({ kind: 'declareBlockers', player: 'P3' });
  });
});
