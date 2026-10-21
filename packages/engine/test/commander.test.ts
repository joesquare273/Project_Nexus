import { describe, expect, it } from 'vitest';
import { COMMANDER, createGame, validateCommander, type GameState } from '../src/index.ts';
import { DEFS, act, addMana, eventsOf, passAll, passUntil, playerIds, setTurn } from './helpers.ts';

/** A Commander game where everyone's commander is the green "warlord", P1's turn, main phase. */
function commanderGame(n: number): GameState {
  const { state } = createGame({
    format: COMMANDER,
    cardDefs: DEFS,
    seed: 1,
    players: playerIds(n).map((id) => ({ id, deck: Array(30).fill('island'), commander: 'warlord' })),
    skipDeckValidation: true,
  });
  for (const pid of state.turnOrder) {
    const p = state.players[pid]!;
    for (const id of p.hand) state.cards[id]!.zone = 'library';
    p.library.push(...p.hand);
    p.hand = [];
  }
  return setTurn(state, 'P1', 'main1');
}

const commanderOf = (s: GameState, pid: string) =>
  Object.values(s.cards).find((c) => c.owner === pid && c.isCommander)!.id;

describe.each([2, 3, 4])('Commander rules, %i players', (n) => {
  it('starts at 40 life with each commander in its owner’s command zone', () => {
    const s = commanderGame(n);
    for (const pid of s.turnOrder) {
      expect(s.players[pid]!.life).toBe(40);
      expect(s.players[pid]!.command).toEqual([commanderOf(s, pid)]);
      expect(s.cards[commanderOf(s, pid)]!.zone).toBe('command');
    }
  });

  it('casts the commander from the command zone, with {2} more tax each time; it returns when it dies', () => {
    let s = commanderGame(n);
    const warlord = commanderOf(s, 'P1');
    addMana(s, 'P1', { G: 1, C: 1 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: warlord, targets: [] }).state;
    s = passAll(s).state;
    expect(s.cards[warlord]!.zone).toBe('battlefield');
    expect(s.players.P1!.commanderCasts[warlord]).toBe(1);

    // It dies and goes back to the command zone.
    const murder = 'murder';
    const kill = `k${s.nextId++}`;
    s.cards[kill] = { id: kill, defId: murder, owner: 'P1', controller: 'P1', zone: 'hand', tapped: false, summoningSick: false, damage: 0, deathtouched: false };
    s.players.P1!.hand.push(kill);
    addMana(s, 'P1', { B: 2 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: kill, targets: [{ kind: 'card', card: warlord }] }).state;
    const r = passAll(s);
    s = r.state;
    expect(eventsOf(r.events, 'CreatureDied').map((e) => e.card)).toEqual([warlord]);
    expect(s.cards[warlord]!.zone).toBe('command');

    // Now it costs {3}{G}: two more than before.
    addMana(s, 'P1', { G: 1, C: 2 });
    const tooPoor = act.bind(null, s, { type: 'CastSpell', player: 'P1', card: warlord, targets: [] });
    expect(tooPoor).toThrow(/Not enough mana/);
    addMana(s, 'P1', { C: 1 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: warlord, targets: [] }).state;
    expect(s.players.P1!.commanderCasts[warlord]).toBe(2);
  });

  it('21 combat damage from one commander knocks a player out, whatever their life', () => {
    let s = commanderGame(n);
    const warlord = commanderOf(s, 'P1');
    s.cards[warlord]!.zone = 'battlefield';
    s.players.P1!.command = [];
    s.players.P1!.battlefield.push(warlord);
    const victim = playerIds(n).at(-1)!;
    s.players[victim]!.commanderDamage[warlord] = 19;
    s = passUntil(s, 'declareAttackers');
    s = act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: warlord, defender: victim }] }).state;
    s = passAll(s).state;
    while (s.pending.kind === 'declareBlockers') {
      s = act(s, { type: 'DeclareBlockers', player: s.pending.player, blocks: [] }).state;
    }
    const r = passAll(s);
    expect(r.state.players[victim]!.life).toBe(37);
    expect(r.state.players[victim]!.commanderDamage[warlord]).toBe(22);
    expect(eventsOf(r.events, 'PlayerEliminated')).toEqual([{ type: 'PlayerEliminated', player: victim, reason: 'commanderDamage' }]);
  });
});

describe('Commander deck rules', () => {
  it('needs a legendary creature commander and cards within its color identity', () => {
    const defs = { ...DEFS, red: { ...DEFS.ogre!, id: 'red', colorIdentity: ['R' as const] } };
    expect(validateCommander(['island', 'red'], 'warlord', defs)).toEqual([expect.stringMatching(/outside warlord's color identity/)]);
    expect(validateCommander(['island'], 'ogre', defs)).toEqual([expect.stringMatching(/isn't a legendary creature/)]);
    expect(validateCommander(['island'], 'warlord', defs)).toEqual([]);
  });

  it('requires a commander in the Commander format', () => {
    expect(() =>
      createGame({ format: COMMANDER, cardDefs: DEFS, seed: 1, players: [{ id: 'P1', deck: ['island'] }, { id: 'P2', deck: ['island'] }] }),
    ).toThrow(/needs a commander/);
  });
});
