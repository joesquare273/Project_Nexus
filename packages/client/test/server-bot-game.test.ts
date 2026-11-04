// A game against the computer on the game server (so it can be rewarded): the
// browser hosts a table with bot seats, brings your saved deck, starts it, and
// gets the game like any online game.

import { afterEach, describe, expect, it } from 'vitest';
import { MemoryAccounts, startServer, type RunningServer } from '@nexus/server';
import { claimStarter, STARTER_CHOICES } from '../../server/src/starter.ts';
import { hostBotGame } from '../src/game/serverGame.ts';
import { YOU } from '../src/game/session.ts';

let server: RunningServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

describe('games against the computer on the server', () => {
  it('hosts a table with your deck and a bot, starts it, and hands back the game', async () => {
    const accounts = new MemoryAccounts();
    const user = { id: 'alice', name: 'Alice' };
    accounts.tokens.set('token-alice', user);
    await accounts.ensure(user);
    const claimed = await claimStarter(accounts, user, STARTER_CHOICES[0]!.name);
    const deck = claimed!.deck!;
    server = await startServer({ port: 0, host: '127.0.0.1', accounts });
    const { game } = hostBotGame({ format: 'commander', deckId: deck.id, bots: 1, token: 'token-alice', url: `ws://127.0.0.1:${server.port}/ws` });
    const session = await game;
    expect(session.state.turnOrder).toContain(YOU);
    expect(session.state.turnOrder).toHaveLength(2);
    expect(session.state.players[YOU]!.life).toBe(40);
    session.close();
  });

  it('a deck that isn’t yours is refused with the server’s reason', async () => {
    const accounts = new MemoryAccounts();
    accounts.tokens.set('token-alice', { id: 'alice', name: 'Alice' });
    await accounts.ensure({ id: 'alice', name: 'Alice' });
    server = await startServer({ port: 0, host: '127.0.0.1', accounts });
    const { game } = hostBotGame({ format: 'commander', deckId: 'not-a-deck', bots: 1, token: 'token-alice', url: `ws://127.0.0.1:${server.port}/ws` });
    await expect(game).rejects.toThrow(/deck/i);
  });
});
