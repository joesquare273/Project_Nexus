// Swiss pairings and standings for draft events (docs/sealed.md): winners
// play winners, nobody plays the same opponent twice when it can be avoided,
// and with an odd number of players the lowest-ranked player without a bye
// gets one (a match win). Pure functions over match results.

/** One finished (or bye) match: games won by each side. `b` null is a bye. */
export interface MatchResult {
  a: string;
  b: string | null;
  aWins: number;
  bWins: number;
  draws: number;
}

export const POINTS = { win: 3, draw: 1, loss: 0 } as const;

/** Match winner, or null for a drawn match. A bye is a win for `a`. */
export function matchWinner(m: MatchResult): string | null {
  if (m.b === null) return m.a;
  if (m.aWins > m.bWins) return m.a;
  if (m.bWins > m.aWins) return m.b;
  return null;
}

export interface Standing {
  player: string;
  points: number;
  wins: number;
  losses: number;
  draws: number;
  /** Opponents' match-win percentage (each at least 33%), excluding byes. */
  omw: number;
  /** Game-win percentage (at least 33%). */
  gw: number;
  /** Opponents' game-win percentage. */
  ogw: number;
  byes: number;
}

const floor = (x: number) => Math.max(1 / 3, x);

/** Standings, best first: match points, then opponents' match-win %, game-win %, opponents' game-win % (the usual tiebreakers). */
export function standings(players: readonly string[], results: readonly MatchResult[]): Standing[] {
  const base = new Map(players.map((p) => [p, { points: 0, wins: 0, losses: 0, draws: 0, byes: 0, gamesWon: 0, gamesPlayed: 0, opponents: [] as string[] }]));
  for (const m of results) {
    const a = base.get(m.a)!;
    if (m.b === null) {
      a.points += POINTS.win;
      a.wins++;
      a.byes++;
      // A bye counts as a 2-0 win for match points only, not for game or opponent percentages.
      continue;
    }
    const b = base.get(m.b)!;
    a.opponents.push(m.b);
    b.opponents.push(m.a);
    const games = m.aWins + m.bWins + m.draws;
    a.gamesWon += m.aWins + m.draws / 3;
    b.gamesWon += m.bWins + m.draws / 3;
    a.gamesPlayed += games;
    b.gamesPlayed += games;
    const winner = matchWinner(m);
    if (winner === m.a) {
      a.points += POINTS.win;
      a.wins++;
      b.losses++;
    } else if (winner === m.b) {
      b.points += POINTS.win;
      b.wins++;
      a.losses++;
    } else {
      a.points += POINTS.draw;
      b.points += POINTS.draw;
      a.draws++;
      b.draws++;
    }
  }
  const mw = (p: string) => {
    const s = base.get(p)!;
    const played = s.wins + s.losses + s.draws - s.byes;
    return played > 0 ? floor((s.points - s.byes * POINTS.win) / (played * POINTS.win)) : 1 / 3;
  };
  const gw = (p: string) => {
    const s = base.get(p)!;
    return s.gamesPlayed > 0 ? floor(s.gamesWon / s.gamesPlayed) : 1 / 3;
  };
  const avg = (xs: number[]) => (xs.length ? xs.reduce((n, x) => n + x, 0) / xs.length : 1 / 3);
  return players
    .map((p): Standing => {
      const s = base.get(p)!;
      return { player: p, points: s.points, wins: s.wins, losses: s.losses, draws: s.draws, byes: s.byes, omw: avg(s.opponents.map(mw)), gw: gw(p), ogw: avg(s.opponents.map(gw)) };
    })
    .sort((x, y) => y.points - x.points || y.omw - x.omw || y.gw - x.gw || y.ogw - x.ogw || players.indexOf(x.player) - players.indexOf(y.player));
}

/** Pairings for the next round: [a, b] pairs, and a bye as [a, null]. */
export type Pairing = [string, string | null];

/**
 * Swiss pairings. Round 1 (no results yet) pairs in the given order, which
 * the caller shuffles. Later rounds pair by standings, avoiding rematches
 * where possible; with an odd count, the lowest-ranked player who hasn't had
 * a bye gets it.
 */
export function pairRound(players: readonly string[], results: readonly MatchResult[]): Pairing[] {
  const ranked = results.length ? standings(players, results).map((s) => s.player) : [...players];
  const met = new Set(results.filter((m) => m.b).flatMap((m) => [`${m.a}|${m.b}`, `${m.b}|${m.a}`]));
  const hadBye = new Set(results.filter((m) => m.b === null).map((m) => m.a));
  let pool = ranked;
  const out: Pairing[] = [];
  if (pool.length % 2 === 1) {
    const bye = [...pool].reverse().find((p) => !hadBye.has(p)) ?? pool[pool.length - 1]!;
    pool = pool.filter((p) => p !== bye);
    out.push([bye, null]);
  }
  // Pair from the top down, backtracking to avoid rematches; if impossible, allow them.
  const pairs = pairWithout(pool, met) ?? pairWithout(pool, new Set());
  return [...pairs!.map((p): Pairing => p), ...out];
}

function pairWithout(pool: readonly string[], met: ReadonlySet<string>): [string, string][] | null {
  if (pool.length === 0) return [];
  const [first, ...rest] = pool;
  for (const other of rest) {
    if (met.has(`${first}|${other}`)) continue;
    const tail = pairWithout(
      rest.filter((p) => p !== other),
      met,
    );
    if (tail) return [[first!, other], ...tail];
  }
  return null;
}

/** How many Swiss rounds an event of this size plays: 1 for 2 players, 3 for 3 (each plays both others) or 4. */
export function roundsFor(players: number): number {
  return players <= 2 ? 1 : 3;
}
