// Draft events (docs/sealed.md, S3): Swiss pairings, best-of-3 matches,
// deckbuilding time, bots, standings. The event's rules only; no networking.
import { describe, expect, it } from 'vitest';
import { makeRng } from '@nexus/bots';
import { createGame } from '@nexus/engine';
import { aiDeck } from '@nexus/cards/limited';
import { pairRound, roundsFor, standings, type MatchResult } from '../src/swiss.ts';
import {
  botMatch,
  choosePlayDraw,
  createEvent,
  currentMatch,
  eventStandings,
  gameSetup,
  joinEvent,
  nextGame,
  pick,
  playBotGame,
  pool,
  recordGame,
  setReady,
  startDraft,
  submitDeck,
  tick,
  expirePicks,
  selectCard,
  PICK_SECONDS,
  type DraftEvent,
} from '../src/draftEvent.ts';

const NOW = 1_000_000;
const host = { name: 'Joe', userId: 'u-joe' };

/** Drafts for the players by always taking the first card in front of them. */
function draftAll(ev: DraftEvent): DraftEvent {
  for (let guard = 0; guard < 500 && ev.phase === 'drafting'; guard++) {
    const seat = ev.seats.find((s) => !s.bot && ev.draft!.packs[s.id] && !ev.draft!.locked[s.id]);
    if (!seat) break;
    ev = pick(ev, seat.id, ev.draft!.packs[seat.id]!.cards[0]!.uid, NOW);
  }
  return ev;
}

describe('Swiss pairings and standings', () => {
  it('pairs winners with winners and avoids rematches', () => {
    const r1: MatchResult[] = [
      { a: 'A', b: 'B', aWins: 2, bWins: 0, draws: 0 },
      { a: 'C', b: 'D', aWins: 2, bWins: 1, draws: 0 },
    ];
    expect(pairRound(['A', 'B', 'C', 'D'], r1)).toEqual([
      ['A', 'C'],
      ['B', 'D'],
    ]);
    const r2: MatchResult[] = [...r1, { a: 'A', b: 'C', aWins: 2, bWins: 0, draws: 0 }, { a: 'B', b: 'D', aWins: 0, bWins: 2, draws: 0 }];
    const third = pairRound(['A', 'B', 'C', 'D'], r2);
    expect(third).toEqual([
      ['A', 'D'],
      ['C', 'B'],
    ]);
    expect(standings(['A', 'B', 'C', 'D'], r2)[0]).toMatchObject({ player: 'A', points: 6, wins: 2 });
  });

  it('three players: one bye each round, to someone who has not had one; everyone meets everyone', () => {
    let results: MatchResult[] = [];
    const met = new Set<string>();
    for (let round = 0; round < roundsFor(3); round++) {
      const pairs = pairRound(['A', 'B', 'C'], results);
      const bye = pairs.find((p) => p[1] === null)!;
      expect(results.some((m) => m.b === null && m.a === bye[0])).toBe(false);
      for (const [a, b] of pairs) {
        results = [...results, { a, b, aWins: 2, bWins: 0, draws: 0 }];
        if (b) met.add([a, b].sort().join(''));
      }
    }
    expect([...met].sort()).toEqual(['AB', 'AC', 'BC']);
    expect(standings(['A', 'B', 'C'], results).every((s) => s.byes === 1)).toBe(true);
  });
});

describe('a draft event with bots', () => {
  it('one player and three bots: draft, deckbuilding, three Swiss rounds of best-of-3, standings', () => {
    let ev = createEvent('ABC', 4, host);
    ev = startDraft(ev, 7);
    expect(ev.seats.map((s) => s.bot)).toEqual([false, true, true, true]);
    ev = draftAll(ev);
    expect(ev.phase).toBe('building');
    expect(ev.seats.every((s) => pool(ev, s.id).length === 84)).toBe(true);
    // Bots have their decks and are ready; the player builds one.
    expect(ev.seats.filter((s) => s.bot).every((s) => ev.ready[s.id] && ev.decks[s.id])).toBe(true);
    const rng = makeRng(3);
    ev = submitDeck(ev, 'S1', aiDeck(pool(ev, 'S1')));
    ev = setReady(ev, 'S1', true, NOW + 1000, rng);
    expect(ev.phase).toBe('playing');
    expect(ev.round).toBe(1);
    // Play every round: bot matches are played out; the player wins game 1, loses game 2, then chooses to play first and wins.
    for (let guard = 0; guard < 20 && ev.phase === 'playing'; guard++) {
      for (const m of ev.matches.filter((x) => x.round === ev.round && !x.done)) {
        let game = 0;
        while (!ev.matches.find((x) => x.id === m.id)!.done) {
          const now = ev.matches.find((x) => x.id === m.id)!;
          if (botMatch(ev, now)) {
            expect(gameSetup(ev, m.id, 1).players.map((p) => p.deck.length)).toEqual([40, 40]);
            ev = recordGame(ev, m.id, now.a, rng);
            continue;
          }
          if (!nextGame(ev, m.id)) ev = choosePlayDraw(ev, m.id, now.chooser!, true);
          expect(nextGame(ev, m.id)).not.toBeNull();
          const me = now.a === 'S1' ? now.a : now.b!;
          const them = me === now.a ? now.b! : now.a;
          ev = recordGame(ev, m.id, game++ === 1 ? them : me, rng);
        }
      }
    }
    expect(ev.phase).toBe('finished');
    expect(ev.round).toBe(3);
    const table = eventStandings(ev);
    expect(table[0]).toMatchObject({ player: 'S1', points: 9, wins: 3 });
    expect(table.reduce((n, s) => n + s.points, 0)).toBe(3 * 6);
  });

  it('the loser of a game chooses play or draw; a bot always plays first', () => {
    const rng = makeRng(1);
    let ev = draftAll(startDraft(createEvent('D2', 2, host), 11));
    ev = setReady(submitDeck(ev, 'S1', aiDeck(pool(ev, 'S1'))), 'S1', true, NOW, rng);
    const m = currentMatch(ev, 'S1')!;
    expect(m.b).toBe('S2');
    expect(nextGame(ev, m.id)).not.toBeNull();
    // The player loses game 1: they choose, and nothing starts until they do.
    ev = recordGame(ev, m.id, 'S2', rng);
    expect(currentMatch(ev, 'S1')!.chooser).toBe('S1');
    expect(nextGame(ev, m.id)).toBeNull();
    expect(() => choosePlayDraw(ev, m.id, 'S2', true)).toThrow(/not your choice/);
    ev = choosePlayDraw(ev, m.id, 'S1', false);
    expect(nextGame(ev, m.id)).toEqual({ first: 'S2' });
    expect(gameSetup(ev, m.id, 5).firstPlayer).toBe('S2');
    for (const seed of [1, 2, 3, 4]) expect(createGame({ ...gameSetup(ev, m.id, seed), mulligans: false }).state.activePlayer).toBe('S2');
    // The player wins game 2: the bot chooses, and plays first.
    ev = recordGame(ev, m.id, 'S1', rng);
    expect(nextGame(ev, m.id)).toEqual({ first: 'S2' });
    // Sideboarding between games: a legal deck from the pool only.
    expect(() => submitDeck(ev, 'S1', { cards: [], basics: { W: 10, U: 0, B: 0, R: 0, G: 0 } })).toThrow(/at least 40/);
    ev = recordGame(ev, m.id, 'S1', rng);
    expect(ev.phase).toBe('finished');
    expect(eventStandings(ev)[0]).toMatchObject({ player: 'S1', points: 3 });
  });

  it('when deckbuilding time runs out, a deck in progress is filled with basic lands to 40', () => {
    const rng = makeRng(2);
    let ev = draftAll(startDraft(createEvent('T1', 2, host), 3));
    const mine = pool(ev, 'S1').slice(0, 10).map((c) => c.uid);
    ev = submitDeck(ev, 'S1', { cards: mine, basics: { W: 0, U: 0, B: 0, R: 0, G: 0 } });
    expect(() => setReady(ev, 'S1', true, NOW, rng)).toThrow(/legal deck/);
    expect(tick(ev, NOW + 60_000, rng).phase).toBe('building');
    ev = tick(ev, ev.buildEndsAt!, rng);
    expect(ev.phase).toBe('playing');
    const deck = ev.decks.S1!;
    expect(deck.cards).toEqual(mine);
    expect(deck.cards.length + Object.values(deck.basics).reduce((n, k) => n + k, 0)).toBe(40);
  });

  it('players join until the event is full; bots fill the rest; bot-vs-bot games are played out on the server', () => {
    let ev = createEvent('J1', 4, host);
    expect(joinEvent(ev, host)).toBeNull();
    expect(joinEvent(ev, { name: 'Ann', userId: 'u-ann' })?.id).toBe('S2');
    ev = draftAll(startDraft(ev, 5));
    expect(ev.seats.map((s) => [s.id, s.bot])).toEqual([['S1', false], ['S2', false], ['S3', true], ['S4', true]]);
    const rng = makeRng(4);
    for (const seat of ['S1', 'S2']) ev = submitDeck(ev, seat, aiDeck(pool(ev, seat)));
    ev = setReady(ev, 'S1', true, NOW, rng);
    expect(ev.phase).toBe('building');
    ev = setReady(ev, 'S2', true, NOW, rng);
    expect(ev.phase).toBe('playing');
    expect(ev.round).toBe(1);
  });

  it('a bot-vs-bot game is played to the end on the server', () => {
    const rng = makeRng(6);
    let ev = draftAll(startDraft(createEvent('B1', 4, host), 13));
    ev = setReady(submitDeck(ev, 'S1', aiDeck(pool(ev, 'S1'))), 'S1', true, NOW, rng);
    // One player and three bots: one first-round match is bots only.
    const bots = ev.matches.find((m) => m.round === 1 && botMatch(ev, m))!;
    expect(bots).toBeDefined();
    const winner = playBotGame(ev, bots.id, 9, 9);
    expect([bots.a, bots.b, null]).toContain(winner);
    ev = recordGame(ev, bots.id, winner, rng);
    expect(ev.matches.find((m) => m.id === bots.id)!.games).toHaveLength(1);
  }, 60_000);

  it('each pick has 30 seconds: then the selected card, or the AI’s choice, is taken for you', () => {
    let ev = startDraft(createEvent('C1', 2, host), 21, NOW);
    expect(ev.pickEndsAt).toBe(NOW + PICK_SECONDS * 1000);
    const pack = ev.draft!.packs.S1!.cards;
    ev = selectCard(ev, 'S1', pack[3]!.uid);
    // Not yet: nothing happens before the time is up.
    expect(expirePicks(ev, NOW + 29_000)).toBe(ev);
    ev = expirePicks(ev, NOW + 30_000);
    expect(ev.draft!.picks.S1!.map((c) => c.uid)).toEqual([pack[3]!.uid]);
    // A new pick, a new 30 seconds, nothing selected: the AI picks for you.
    expect(ev.pickEndsAt).toBe(NOW + 60_000);
    expect(ev.selected.S1).toBeNull();
    ev = expirePicks(ev, NOW + 60_000);
    expect(ev.draft!.picks.S1).toHaveLength(2);
    // Confirming in time works as before and restarts the clock.
    const t = NOW + 61_000;
    ev = pick(ev, 'S1', ev.draft!.packs.S1!.cards[0]!.uid, t);
    expect(ev.pickEndsAt).toBe(t + 30_000);
  });
});

