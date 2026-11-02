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
  changeSeats,
  placements,
  MAX_GAMES,
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
  it('one player and three bots: draft, deckbuilding, semifinals, then the final and the match for third', () => {
    let ev = createEvent('ABC', { players: 1, bots: 3 }, host);
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
    expect(ev.round).toBe(2);
    expect(ev.matches.map((m) => m.stage)).toEqual(['semifinal', 'semifinal', 'final', 'third']);
    // Winners met in the final, losers played for third.
    const [s1, s2, final, third] = ev.matches;
    expect([final!.a, final!.b].sort()).toEqual([s1!.winner, s2!.winner].sort());
    expect([third!.a, third!.b].sort()).toEqual([s1, s2].map((m) => (m!.winner === m!.a ? m!.b : m!.a)).sort());
    const places = placements(ev)!;
    expect(places[0]).toBe('S1');
    expect(new Set(places).size).toBe(4);
    expect(eventStandings(ev).map((s) => s.player)).toEqual(places);
  });

  it('the loser of a game chooses play or draw; a bot always plays first', () => {
    const rng = makeRng(1);
    let ev = draftAll(startDraft(createEvent('D2', { players: 1, bots: 3 }, host), 11));
    ev = setReady(submitDeck(ev, 'S1', aiDeck(pool(ev, 'S1'))), 'S1', true, NOW, rng);
    const m = currentMatch(ev, 'S1')!;
    const bot = m.a === 'S1' ? m.b! : m.a;
    expect(m.stage).toBe('semifinal');
    expect(nextGame(ev, m.id)).not.toBeNull();
    // The player loses game 1: they choose, and nothing starts until they do.
    ev = recordGame(ev, m.id, bot, rng);
    expect(currentMatch(ev, 'S1')!.chooser).toBe('S1');
    expect(nextGame(ev, m.id)).toBeNull();
    expect(() => choosePlayDraw(ev, m.id, bot, true)).toThrow(/not your choice/);
    ev = choosePlayDraw(ev, m.id, 'S1', false);
    expect(nextGame(ev, m.id)).toEqual({ first: bot });
    expect(gameSetup(ev, m.id, 5).firstPlayer).toBe(bot);
    for (const seed of [1, 2, 3, 4]) expect(createGame({ ...gameSetup(ev, m.id, seed), mulligans: false }).state.activePlayer).toBe(bot);
    // The player wins game 2: the bot chooses, and plays first.
    ev = recordGame(ev, m.id, 'S1', rng);
    expect(nextGame(ev, m.id)).toEqual({ first: bot });
    // Sideboarding between games: a legal deck from the pool only.
    expect(() => submitDeck(ev, 'S1', { cards: [], basics: { W: 10, U: 0, B: 0, R: 0, G: 0 } })).toThrow(/at least 40/);
    ev = recordGame(ev, m.id, 'S1', rng);
    // The match is over; the other semifinal is still to finish.
    expect(currentMatch(ev, 'S1')).toMatchObject({ done: true, winner: 'S1' });
    expect(ev.round).toBe(1);
  });

  it('every match has a winner: drawn games mean more games, then a coin flip after five', () => {
    const rng = makeRng(8);
    let ev = draftAll(startDraft(createEvent('W1', { players: 1, bots: 3 }, host), 4));
    ev = setReady(submitDeck(ev, 'S1', aiDeck(pool(ev, 'S1'))), 'S1', true, NOW, rng);
    const m = currentMatch(ev, 'S1')!;
    const bot = m.a === 'S1' ? m.b! : m.a;
    const play = () => {
      const now = ev.matches.find((x) => x.id === m.id)!;
      if (!nextGame(ev, m.id)) ev = choosePlayDraw(ev, m.id, now.chooser!, true);
    };
    // 1-1 with a draw after three games: a fourth game is played.
    for (const w of ['S1', bot, null]) {
      play();
      ev = recordGame(ev, m.id, w, rng);
    }
    expect(currentMatch(ev, 'S1')!.done).toBe(false);
    play();
    ev = recordGame(ev, m.id, null, rng);
    play();
    ev = recordGame(ev, m.id, null, rng);
    const done = currentMatch(ev, 'S1')!;
    expect(done.games).toHaveLength(MAX_GAMES);
    expect(done.done).toBe(true);
    expect(['S1', bot]).toContain(done.winner);
  });

  it('when deckbuilding time runs out, a deck in progress is filled with basic lands to 40', () => {
    const rng = makeRng(2);
    let ev = draftAll(startDraft(createEvent('T1', { players: 1, bots: 3 }, host), 3));
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
    let ev = createEvent('J1', { players: 2, bots: 2 }, host);
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

  it('the host sets the seats: four in all, players and bots; the draft waits for every player', () => {
    let ev = createEvent('M1', { players: 3, bots: 1 }, host);
    expect(() => startDraft(ev, 1)).toThrow(/Waiting for 2 more players/);
    expect(() => createEvent('M2', { players: 0, bots: 4 }, host)).toThrow();
    expect(() => createEvent('M3', { players: 1, bots: 1 }, host)).toThrow(/4 seats/);
    expect(() => createEvent('M4', { players: 3, bots: 2 }, host)).toThrow(/4 seats/);
    expect(joinEvent(ev, { name: 'Ann', userId: 'u-ann' })?.id).toBe('S2');
    expect(() => changeSeats(ev, 1, 3)).toThrow(/already seated/);
    ev = changeSeats(ev, 2, 2);
    expect(joinEvent(ev, { name: 'Bea', userId: 'u-bea' })).toBeNull();
    expect([ev.size, ev.players, ev.rounds]).toEqual([4, 2, 2]);
    ev = startDraft(ev, 2);
    expect(ev.seats.map((s) => s.bot)).toEqual([false, false, true, true]);
  });

  it('a bot-vs-bot game is played to the end on the server', () => {
    const rng = makeRng(6);
    let ev = draftAll(startDraft(createEvent('B1', { players: 1, bots: 3 }, host), 13));
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
    let ev = startDraft(createEvent('C1', { players: 1, bots: 3 }, host), 21, NOW);
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

