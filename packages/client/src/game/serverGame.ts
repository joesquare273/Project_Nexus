// A game against the computer run by the game server, so it can be rewarded
// (docs/economy.md, E2): a table with your seat and bot seats, your saved
// deck, started at once. The board plays it like any online game.

import type { ServerMessage } from '@nexus/server/protocol';
import { accessToken } from '../account/AccountBar.tsx';
import { OnlineConnection, OnlineSession } from './online.ts';

export interface BotGameRequest {
  format: 'commander' | 'constructed';
  /** One of your saved decks (by id): Commander, or a 60-card deck. */
  deckId: string;
  /** 1-3 computer opponents. */
  bots: number;
  /** "Show tips while I play". */
  coaching?: boolean;
  /** For tests: the sign-in token and the server's WebSocket address. */
  token?: string;
  url?: string;
}

/** Hosts the table, brings your deck and starts it; resolves with the game once the server sends it. */
export function hostBotGame(request: BotGameRequest): { game: Promise<OnlineSession>; cancel: () => void } {
  let connection: OnlineConnection | null = null;
  let settled = false;
  const game = new Promise<OnlineSession>((resolve, reject) => {
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      connection?.close();
      reject(new Error(message));
    };
    void (request.token !== undefined ? Promise.resolve(request.token) : accessToken()).then((token) => {
      if (!token) return fail('Your sign-in has expired. Sign in with Discord again.');
      const c = new OnlineConnection(request.url);
      connection = c;
      let deckSent = false;
      let started = false;
      c.onClose = () => fail('Lost the connection to the game server. Is it running (npm run server)?');
      c.listen((m: ServerMessage) => {
        if (m.type === 'table') {
          const mine = m.table.seats.find((s) => s.id === m.table.you);
          if (m.table.phase !== 'lobby') return;
          if (!deckSent) {
            deckSent = true;
            c.send({ type: 'tableDeck', deck: request.deckId });
          } else if (mine?.deck && !started) {
            started = true;
            c.send({ type: 'tableStart' });
          }
        } else if (m.type === 'update') {
          if (settled) return;
          settled = true;
          resolve(new OnlineSession(c, m, 'RW', request.format, request.coaching));
        } else if (m.type === 'error') {
          fail(m.message);
        }
      });
      c.send({ type: 'tableCreate', token, players: 1, bots: request.bots, format: request.format });
    });
  });
  return {
    game,
    cancel: () => {
      if (settled) return;
      settled = true;
      connection?.close();
    },
  };
}
