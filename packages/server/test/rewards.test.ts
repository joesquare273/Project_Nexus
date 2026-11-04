// Match rewards, quests and one-time rewards (docs/economy.md, E2-E3), with
// the in-memory store (the same rules as the database: each ledger ref pays once).

import { afterEach, describe, expect, it } from 'vitest';
import type { GameState } from '@nexus/engine';
import { MemoryAccounts } from '../src/accounts.ts';
import { ECONOMY, FIRST_DAY_SHARDS } from '../src/economy.ts';
import { eligible, periodStart, questProgress, rewardMatch } from '../src/rewards.ts';
import { startServer, type RunningServer } from '../src/server.ts';
import { TableHub } from '../src/tables.ts';

let server: RunningServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

async function alice() {
  const accounts = new MemoryAccounts();
  accounts.tokens.set('token-alice', { id: 'alice', name: 'Alice' });
  await accounts.ensure({ id: 'alice', name: 'Alice' });
  return accounts;
}
const total = (lines: { amount: number }[]) => lines.reduce((n, l) => n + l.amount, 0);
const R = ECONOMY.rewards;
const quest = (id: string) => ECONOMY.quests.find((q) => q.id === id)!;

describe('match rewards', () => {
  it('a win against the computer: the match reward, the win bonus, the first win and the daily win quest', async () => {
    const accounts = await alice();
    const paid = await rewardMatch(accounts, 'alice', { ref: 'g1', kind: 'bot', won: true });
    expect(paid.lines.map((l) => l.amount)).toEqual([R.botMatch.completion, R.botMatch.winBonus, ECONOMY.firstWinReward, quest('daily-win').reward]);
    expect(paid.balance).toBe(FIRST_DAY_SHARDS + total(paid.lines));
    // The same game again pays nothing.
    expect(await rewardMatch(accounts, 'alice', { ref: 'g1', kind: 'bot', won: true })).toEqual({ lines: [], balance: null });
    // A second win: the match and win bonus, but the first win and daily quest only once.
    const again = await rewardMatch(accounts, 'alice', { ref: 'g2', kind: 'bot', won: true });
    expect(again.lines.map((l) => l.amount)).toEqual([R.botMatch.completion, R.botMatch.winBonus]);
  });

  it('a game with friends pays more; a loss pays the match reward only; draft games only count for quests', async () => {
    const accounts = await alice();
    const loss = await rewardMatch(accounts, 'alice', { ref: 'f1', kind: 'friend', won: false });
    expect(loss.lines.map((l) => l.amount)).toEqual([R.friendMatch.completion]);
    const draft = await rewardMatch(accounts, 'alice', { ref: 'd1', kind: 'draft', won: false });
    expect(draft.lines).toEqual([]);
    // The third game completes "Play 3 games", whatever kind it is.
    const third = await rewardMatch(accounts, 'alice', { ref: 'd2', kind: 'draft', won: false });
    expect(third.lines).toEqual([{ label: 'Daily quest: Play 3 games', amount: quest('daily-play').reward }]);
  });

  it('only games that reached the minimum round, and never for a player who conceded', () => {
    expect(eligible(R.minRounds * 2, 2, false)).toBe(true);
    expect(eligible(2, 2, false)).toBe(false);
    expect(eligible(4, 4, false)).toBe(false);
    expect(eligible(5, 4, false)).toBe(true);
    expect(eligible(99, 2, true)).toBe(false);
  });
});

describe('quests', () => {
  it('daily quests start again each UTC day; weekly ones on Monday', async () => {
    expect(periodStart('daily', new Date('2026-11-04T23:59:00Z')).toISOString()).toBe('2026-11-04T00:00:00.000Z');
    expect(periodStart('weekly', new Date('2026-11-04T12:00:00Z')).toISOString()).toBe('2026-11-02T00:00:00.000Z');
    expect(periodStart('weekly', new Date('2026-11-08T12:00:00Z')).toISOString()).toBe('2026-11-02T00:00:00.000Z');
    const accounts = await alice();
    const day1 = new Date('2026-11-04T10:00:00Z');
    accounts.now = () => day1;
    for (let i = 0; i < 3; i++) await rewardMatch(accounts, 'alice', { ref: `a${i}`, kind: 'bot', won: false }, day1);
    expect((await questProgress(accounts, 'alice', day1)).find((q) => q.id === 'daily-play')).toMatchObject({ progress: 3, complete: true });
    const day2 = new Date('2026-11-05T10:00:00Z');
    accounts.now = () => day2;
    expect((await questProgress(accounts, 'alice', day2)).find((q) => q.id === 'daily-play')).toMatchObject({ progress: 0, complete: false });
    expect((await questProgress(accounts, 'alice', day2)).find((q) => q.id === 'weekly-play')).toMatchObject({ progress: 3 });
    // The next day's quest pays again.
    let paidQuest = 0;
    for (let i = 0; i < 3; i++) paidQuest += (await rewardMatch(accounts, 'alice', { ref: `b${i}`, kind: 'bot', won: false }, day2)).lines.filter((l) => l.label.startsWith('Daily')).length;
    expect(paidQuest).toBe(1);
  });
});

describe('the server', () => {
  it('pays the tutorial reward once, and shows quests and one-time rewards', async () => {
    const accounts = await alice();
    server = await startServer({ port: 0, host: '127.0.0.1', accounts });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = (path: string, method = 'GET', body?: unknown): Promise<any> =>
      fetch(`http://127.0.0.1:${server!.port}${path}`, { method, headers: { Authorization: 'Bearer token-alice' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }).then((r) => r.json());
    const first = await call('/api/onboarding', 'POST', { step: 'lesson' });
    expect(first).toMatchObject({ lesson: true, reward: { amount: ECONOMY.tutorialReward, balance: FIRST_DAY_SHARDS + ECONOMY.tutorialReward } });
    const second = await call('/api/onboarding', 'POST', { step: 'lesson' });
    expect(second.reward).toBeUndefined();
    const rewards = await call('/api/rewards');
    expect(rewards.quests.map((q: { id: string }) => q.id)).toEqual(ECONOMY.quests.map((q) => q.id));
    expect(rewards.milestones).toEqual([
      { id: 'tutorial', label: 'Finish the lesson', reward: ECONOMY.tutorialReward, done: true },
      { id: 'first-win', label: 'Win your first game', reward: ECONOMY.firstWinReward, done: false },
    ]);
  });

  it('a finished table pays each signed-in player and tells them what they earned', async () => {
    const accounts = await alice();
    accounts.tokens.set('token-bob', { id: 'bob', name: 'Bob' });
    await accounts.ensure({ id: 'bob', name: 'Bob' });
    const hub = new TableHub({ randomBytes: (n) => Buffer.alloc(n, 7), alias: () => 'x', accounts });
    const sent: Record<string, unknown[]> = { P1: [], P2: [], P3: [] };
    const conn = (seat: string) => ({ send: (m: unknown) => sent[seat]!.push(m) });
    const table = {
      seats: [
        { id: 'P1', name: 'Alice', bot: false, userId: 'alice', deck: null },
        { id: 'P2', name: 'Bob', bot: false, userId: 'bob', deck: null },
        { id: 'P3', name: 'Chocobo Bot', bot: true, deck: null },
      ],
      conns: new Map([['P1', conn('P1')], ['P2', conn('P2')]]),
      gameId: 'game-1',
      winner: 'P1',
    };
    const state = { turnNumber: 9, players: { P1: { conceded: false }, P2: { conceded: false }, P3: { conceded: false } } } as unknown as GameState;
    await (hub as unknown as { payRewards(t: unknown, s: GameState): Promise<void> }).payRewards(table, state);
    const [a] = sent.P1 as { type: string; lines: { amount: number }[] }[];
    const [b] = sent.P2 as { type: string; lines: { amount: number }[] }[];
    expect(a!.type).toBe('rewards');
    expect(a!.lines.slice(0, 2).map((l) => l.amount)).toEqual([R.friendMatch.completion, R.friendMatch.winBonus]);
    expect(b!.lines.map((l) => l.amount)).toEqual([R.friendMatch.completion]);
    // Conceding pays nothing.
    const sentBefore = sent.P2!.length;
    await (hub as unknown as { payRewards(t: unknown, s: GameState): Promise<void> }).payRewards({ ...table, gameId: 'game-2' }, { ...state, players: { ...state.players, P2: { conceded: true } } } as unknown as GameState);
    expect(sent.P2!.length).toBe(sentBefore);
  });
});
