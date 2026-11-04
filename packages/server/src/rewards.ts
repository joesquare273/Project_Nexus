// Match rewards, quests and one-time rewards (docs/economy.md, E2-E3). The
// server pays only for games it ran (tables, draft events): it records each
// finished game once per player, then pays from the shard ledger, where every
// payment has its own ref so it happens once.

import type { AccountService, MatchResult } from './accounts.ts';
import { ECONOMY } from './economy.ts';

export interface RewardLine {
  label: string;
  amount: number;
}

/** What a player was paid for a game, for the summary after it. */
export interface MatchRewards {
  lines: RewardLine[];
  balance: number | null;
}

/** The start of the period a quest counts in: the UTC day, or the UTC week from Monday. */
export function periodStart(period: 'daily' | 'weekly', now = new Date()): Date {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (period === 'daily') return day;
  const sinceMonday = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - sinceMonday * 86_400_000);
}

/** The ledger ref of a quest in the current period ("quest-daily-win-2026-11-04"). */
export const questRef = (id: string, period: 'daily' | 'weekly', now = new Date()) => `quest-${id}-${periodStart(period, now).toISOString().slice(0, 10)}`;

/** Each quest's progress in its current period. */
export async function questProgress(accounts: AccountService, userId: string, now = new Date()) {
  return Promise.all(
    ECONOMY.quests.map(async (q) => {
      const done = await accounts.matchCount(userId, periodStart(q.period, now), q.won);
      return { id: q.id, period: q.period, label: q.label, target: q.target, reward: q.reward, progress: Math.min(done, q.target), complete: done >= q.target };
    }),
  );
}

/** Whether a game counts: it reached the minimum round and the player didn't concede. */
export function eligible(turnNumber: number, seats: number, conceded: boolean): boolean {
  return !conceded && turnNumber > seats * (ECONOMY.rewards.minRounds - 1);
}

/**
 * Pays a player for a finished game the server ran: the match reward (not
 * for draft games, which pay prizes), the win bonus, the first win, and any
 * quest it completes. A game already recorded pays nothing again.
 */
export async function rewardMatch(accounts: AccountService, userId: string, match: MatchResult, now = new Date()): Promise<MatchRewards> {
  const lines: RewardLine[] = [];
  let balance: number | null = null;
  if (!(await accounts.recordMatch(userId, match))) return { lines, balance };
  const pay = async (amount: number, kind: 'match_reward' | 'quest_reward' | 'milestone_reward', ref: string, label: string) => {
    if (amount <= 0) return;
    const r = await accounts.applyShards(userId, amount, kind, ref);
    balance = r.balance;
    if (r.applied) lines.push({ label, amount });
  };
  if (match.kind !== 'draft') {
    const table = match.kind === 'friend' ? ECONOMY.rewards.friendMatch : ECONOMY.rewards.botMatch;
    await pay(table.completion, 'match_reward', `match-${match.ref}`, match.kind === 'friend' ? 'Game with friends' : 'Game against the computer');
    if (match.won) await pay(table.winBonus, 'match_reward', `match-${match.ref}-win`, 'Win bonus');
  }
  if (match.won) await pay(ECONOMY.firstWinReward, 'milestone_reward', 'first-win', 'Your first win');
  for (const q of await questProgress(accounts, userId, now)) {
    if (q.complete) await pay(q.reward, 'quest_reward', questRef(q.id, q.period, now), `${q.period === 'daily' ? 'Daily' : 'Weekly'} quest: ${q.label}`);
  }
  return { lines, balance };
}

/** The one-time reward for finishing the "Learn to play" lesson (the browser reports it; once per account). */
export async function rewardTutorial(accounts: AccountService, userId: string): Promise<RewardLine | null> {
  const r = await accounts.applyShards(userId, ECONOMY.tutorialReward, 'milestone_reward', 'tutorial');
  return r.applied ? { label: 'Finished the lesson', amount: ECONOMY.tutorialReward } : null;
}
