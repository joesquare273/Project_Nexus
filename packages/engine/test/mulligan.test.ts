import { describe, expect, it } from 'vitest';
import {
  FREE_FOR_ALL,
  createGame,
  filterEventsFor,
  getLegalActions,
  type GameEvent,
  type GameState,
} from '../src/index.ts';
import { DEFS, act, eventsOf, playerIds, rejected } from './helpers.ts';

/** A game with mulligans on. Libraries mix two lands so a new hand really is new. */
function mulliganGame(n: number, seed = 3): { state: GameState; events: GameEvent[] } {
  return createGame({
    format: FREE_FOR_ALL,
    cardDefs: DEFS,
    seed,
    players: playerIds(n).map((id) => ({ id, deck: [...Array(20).fill('island'), ...Array(20).fill('mountain')] })),
    skipDeckValidation: true,
    mulligans: true,
  });
}

const totalCards = (s: GameState, pid: string) => s.players[pid]!.hand.length + s.players[pid]!.library.length;

/** Players in the order they decide: the starting player first, then around the table. */
function decisionOrder(s: GameState): string[] {
  const i = s.turnOrder.indexOf(s.activePlayer);
  return [...s.turnOrder.slice(i), ...s.turnOrder.slice(0, i)];
}

describe.each([2, 3, 4])('mulligans with %i players', (n) => {
  it('waits for opening hands before turn 1', () => {
    const { state, events } = mulliganGame(n);
    expect(state.pending).toEqual({ kind: 'mulligan', player: state.activePlayer, taken: 0, queue: decisionOrder(state).slice(1) });
    expect(state.step).toBe('untap');
    expect(eventsOf(events, 'TurnChanged')).toHaveLength(0);
    for (const pid of state.turnOrder) expect(state.players[pid]!.hand).toHaveLength(7);
  });

  it('asks each player in turn order, then starts the first turn', () => {
    let s = mulliganGame(n).state;
    const asked: string[] = [];
    let started: GameEvent[] = [];
    while (s.pending.kind === 'mulligan') {
      asked.push(s.pending.player);
      const r = act(s, { type: 'Mulligan', player: s.pending.player, keep: true });
      s = r.state;
      started = r.events;
    }
    expect(asked).toEqual(decisionOrder(s));
    expect(eventsOf(started, 'TurnChanged')).toEqual([{ type: 'TurnChanged', activePlayer: asked[0], turnNumber: 1 }]);
    expect(s.pending).toMatchObject({ kind: 'priority', player: asked[0] });
    expect(s.step).toBe('upkeep');
  });

  it('a mulligan shuffles the hand away and draws a new seven', () => {
    const s = mulliganGame(n).state;
    const me = s.activePlayer;
    const before = totalCards(s, me);
    const r = act(s, { type: 'Mulligan', player: me, keep: false });
    expect(r.state.players[me]!.hand).toHaveLength(7);
    expect(totalCards(r.state, me)).toBe(before);
    expect(r.state.pending).toMatchObject({ kind: 'mulligan', player: me, taken: 1 });
    expect(eventsOf(r.events, 'Mulliganed')).toEqual([{ type: 'Mulliganed', player: me, taken: 1 }]);
  });

  it(n === 2 ? 'every mulligan costs a card in a duel' : 'the first mulligan is free in multiplayer', () => {
    let s = mulliganGame(n).state;
    const me = s.activePlayer;
    s = act(s, { type: 'Mulligan', player: me, keep: false }).state;
    const r = act(s, { type: 'Mulligan', player: me, keep: true });
    const bottom = n === 2 ? 1 : 0;
    expect(eventsOf(r.events, 'HandKept')).toEqual([{ type: 'HandKept', player: me, taken: 1, bottom }]);
    if (n === 2) expect(r.state.pending).toMatchObject({ kind: 'bottomCards', player: me, count: 1 });
    else expect(r.state.pending).toMatchObject({ kind: 'mulligan', player: decisionOrder(s)[1], taken: 0 });
  });
});

describe('putting cards on the bottom', () => {
  /** P-active took two mulligans in a duel and kept: two cards to bottom. */
  function bottoming() {
    let s = mulliganGame(2).state;
    const me = s.activePlayer;
    s = act(s, { type: 'Mulligan', player: me, keep: false }).state;
    s = act(s, { type: 'Mulligan', player: me, keep: false }).state;
    s = act(s, { type: 'Mulligan', player: me, keep: true }).state;
    expect(s.pending).toMatchObject({ kind: 'bottomCards', player: me, count: 2 });
    return { s, me };
  }

  it('puts the chosen cards on the bottom, in order, and moves on', () => {
    const { s, me } = bottoming();
    const [a, b] = s.players[me]!.hand;
    const r = act(s, { type: 'BottomCards', player: me, cards: [a!, b!] });
    const p = r.state.players[me]!;
    expect(p.hand).toHaveLength(5);
    expect(p.library.slice(-2)).toEqual([a, b]);
    expect(r.state.pending).toMatchObject({ kind: 'mulligan', taken: 0 });
    expect(r.state.pending.kind === 'mulligan' && r.state.pending.player).not.toBe(me);
  });

  it('rejects the wrong number of cards, repeats, and cards not in hand', () => {
    const { s, me } = bottoming();
    const [a, b] = s.players[me]!.hand;
    expect(rejected(s, { type: 'BottomCards', player: me, cards: [a!] })).toMatch(/exactly 2/);
    expect(rejected(s, { type: 'BottomCards', player: me, cards: [a!, a!] })).toMatch(/different cards/);
    const notMine = s.players[me]!.library[0]!;
    expect(rejected(s, { type: 'BottomCards', player: me, cards: [a!, notMine] })).toMatch(/different cards/);
    expect(rejected(s, { type: 'BottomCards', player: me, cards: [a!, b!, s.players[me]!.hand[2]!] })).toMatch(/exactly 2/);
  });

  it('offers legal bottom choices that the engine accepts', () => {
    const { s } = bottoming();
    const legal = getLegalActions(s);
    expect(legal.length).toBeGreaterThan(0);
    for (const a of legal) expect(act(s, a).state).toBeTruthy();
  });
});

describe('mulligan limits and edge cases', () => {
  it('stops offering mulligans once the whole hand would go to the bottom', () => {
    let s = mulliganGame(2).state;
    const me = s.activePlayer;
    for (let i = 0; i < 7; i++) s = act(s, { type: 'Mulligan', player: me, keep: false }).state;
    expect(getLegalActions(s)).toEqual([{ type: 'Mulligan', player: me, keep: true }]);
    expect(rejected(s, { type: 'Mulligan', player: me, keep: false })).toMatch(/keep this hand/);
    s = act(s, { type: 'Mulligan', player: me, keep: true }).state;
    s = act(s, { type: 'BottomCards', player: me, cards: [...s.players[me]!.hand] }).state;
    expect(s.players[me]!.hand).toHaveLength(0);
  });

  it('only the deciding player can answer', () => {
    const s = mulliganGame(3).state;
    const other = decisionOrder(s)[1]!;
    expect(rejected(s, { type: 'Mulligan', player: other, keep: true })).toMatch(/not deciding/);
    expect(rejected(s, { type: 'PassPriority', player: s.activePlayer })).toMatch(/priority/);
  });

  it('skips a player who concedes while deciding', () => {
    const s = mulliganGame(3).state;
    const [first, second, third] = decisionOrder(s);
    const r = act(s, { type: 'Concede', player: first! });
    // The starting player left before turn 1, so the next seat goes first.
    expect(r.state.activePlayer).toBe(second);
    expect(r.state.pending).toMatchObject({ kind: 'mulligan', player: second, queue: [third] });
  });

  it('ends the game if a duel opponent concedes during mulligans', () => {
    const s = mulliganGame(2).state;
    const r = act(s, { type: 'Concede', player: decisionOrder(s)[1]! });
    expect(r.state.pending).toEqual({ kind: 'gameOver' });
    expect(r.state.winner).toBe(decisionOrder(s)[0]);
  });

  it('keeps the new hand and the bottomed cards hidden from other players', () => {
    let s = mulliganGame(2).state;
    const me = s.activePlayer;
    const other = decisionOrder(s)[1]!;
    const events: GameEvent[] = [];
    let r = act(s, { type: 'Mulligan', player: me, keep: false });
    events.push(...r.events);
    r = act(r.state, { type: 'Mulligan', player: me, keep: true });
    events.push(...r.events);
    const bottomed = r.state.players[me]!.hand[0]!;
    r = act(r.state, { type: 'BottomCards', player: me, cards: [bottomed] });
    events.push(...r.events);
    s = r.state;
    const seen = JSON.stringify(filterEventsFor(events, other));
    for (const id of [...s.players[me]!.hand, bottomed]) expect(seen).not.toContain(`"${id}"`);
    expect(eventsOf(filterEventsFor(events, other), 'CardsBottomed')).toEqual([{ type: 'CardsBottomed', player: me, count: 1 }]);
  });

  it('is deterministic: the same seed and choices give the same game', () => {
    const play = () => {
      let s = mulliganGame(3, 11).state;
      while (s.pending.kind === 'mulligan' || s.pending.kind === 'bottomCards') {
        const p = s.pending;
        s =
          p.kind === 'mulligan'
            ? act(s, { type: 'Mulligan', player: p.player, keep: p.taken >= 2 }).state
            : act(s, { type: 'BottomCards', player: p.player, cards: s.players[p.player]!.hand.slice(0, p.count) }).state;
      }
      return s;
    };
    expect(play()).toEqual(play());
  });
});
