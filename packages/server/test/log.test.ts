// The server log (log.ts): entries older than 30 days are deleted; and bots
// that throw or pick an illegal move never stall a game (hostedGame.ts).

import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createGame, getLegalActions, CONSTRUCTED_DUEL } from '@nexus/engine';
import { basicAi, type Bot } from '@nexus/bots';
import { CARD_DEFS, starterKitDeck } from '@nexus/cards';
import { LOG_RETENTION_DAYS, pruneLog, recentLog } from '../src/log.ts';
import { botMove } from '../src/hostedGame.ts';

const DAY = 24 * 60 * 60 * 1000;

describe('server log', () => {
  it(`deletes entries older than ${LOG_RETENTION_DAYS} days, from the log and its older copy`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'nexus-log-'));
    const file = join(dir, 'server.log');
    const now = Date.parse('2026-11-06T12:00:00Z');
    const line = (daysAgo: number, event: string) => JSON.stringify({ at: new Date(now - daysAgo * DAY).toISOString(), event });
    writeFileSync(file, [line(40, 'old'), line(31, 'old'), line(29, 'kept'), line(1, 'kept')].join('\n') + '\n');
    writeFileSync(`${file}.1`, [line(60, 'old'), line(45, 'old')].join('\n') + '\n');
    expect(pruneLog(file, now)).toBe(4);
    expect(readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l).event)).toEqual(['kept', 'kept']);
    // Nothing recent left in the older copy: it's removed.
    expect(existsSync(`${file}.1`)).toBe(false);
    expect(pruneLog(file, now)).toBe(0);
  });
});

describe('bot moves on the server', () => {
  const game = () =>
    createGame({ format: CONSTRUCTED_DUEL, cardDefs: CARD_DEFS, seed: 7, players: [{ id: 'P1', deck: starterKitDeck('RW') }, { id: 'P2', deck: starterKitDeck('UB') }] }).state;

  it('a bot that throws, or picks an illegal move, still moves (a legal fallback), and it is logged', () => {
    const s = game();
    const throws: Bot = () => {
      throw new Error('bot bug');
    };
    const r = botMove(s, throws, 'test game');
    expect(r).not.toBeNull();
    expect(recentLog().some((e) => e.event === 'bot-error' && e.error === 'bot bug' && e.where === 'test game')).toBe(true);
    const illegal: Bot = (state) => ({ type: 'PassPriority', player: state.turnOrder.find((p) => !('player' in state.pending) || p !== state.pending.player)! });
    expect(botMove(s, illegal, 'test game')).not.toBeNull();
    expect(recentLog().some((e) => e.event === 'bot-illegal')).toBe(true);
    // A good bot's move is played as it is.
    const good = botMove(s, basicAi(), 'test game');
    expect(good).not.toBeNull();
    expect(getLegalActions(s).length).toBeGreaterThan(0);
  });
});
