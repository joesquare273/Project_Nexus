// Commander tables (tables.ts): the host chooses seats for players and bots,
// others join by code with their own saved decks, and the game is hosted on
// the server with seats P1-P4.
import { describe, expect, it } from 'vitest';
import { FIN_PRECONS } from '@nexus/cards';
import { MemoryAccounts, discordAvatar } from '../src/accounts.ts';
import { Lobby, type Client } from '../src/rooms.ts';
import { claimStarter } from '../src/starter.ts';
import type { ServerMessage, TableView } from '../src/protocol.ts';

async function setup(opts: { botGameLimit?: number } = {}) {
  const accounts = new MemoryAccounts();
  const users = { joe: { id: 'u-joe', name: 'Joe', avatar: 'https://cdn.discordapp.com/avatars/1/joe.png' }, ann: { id: 'u-ann', name: 'Ann' }, bea: { id: 'u-bea', name: 'Bea' } };
  const decks: Record<string, string> = {};
  for (const [key, u] of Object.entries(users)) {
    accounts.tokens.set(`tok-${key}`, u);
    // Each player owns a precon deck (their free starter).
    const r = await claimStarter(accounts, u, FIN_PRECONS[Object.keys(users).indexOf(key)]!.name);
    decks[key] = r!.deck!.id;
  }
  const lobby = new Lobby({
    accounts,
    events: {
      schedule: (fn) => {
        const t = setTimeout(fn, 0);
        return () => clearTimeout(t);
      },
      botDelayMs: 0,
      ...(opts.botGameLimit ? { botGameLimit: opts.botGameLimit } : {}),
    },
  });
  return { accounts, lobby, decks };
}

function browser(lobby: Lobby) {
  const inbox: ServerMessage[] = [];
  const client: Client = lobby.connect({ send: (m) => inbox.push(structuredClone(m)) });
  const send = (m: object) => client.handle(JSON.stringify(m));
  const table = (): TableView | undefined => [...inbox].reverse().find((m): m is Extract<ServerMessage, { type: 'table' }> => m.type === 'table')?.table;
  const game = () => [...inbox].reverse().find((m): m is Extract<ServerMessage, { type: 'update' }> => m.type === 'update');
  const errors = () => inbox.filter((m): m is Extract<ServerMessage, { type: 'error' }> => m.type === 'error');
  return { inbox, client, send, table, game, errors };
}

const settle = () => new Promise((r) => setTimeout(r, 0));
async function until(check: () => boolean, what: string, tries = 20000) {
  for (let i = 0; i < tries; i++) {
    if (check()) return;
    await settle();
  }
  throw new Error(`Timed out waiting for ${what}`);
}

let seq = 1;
async function concede(b: ReturnType<typeof browser>) {
  const g = b.game()!;
  await b.send({ type: 'actions', seq: seq++, version: g.version, actions: [{ type: 'Concede', player: g.seat }] });
}

describe('Discord profile pictures', () => {
  it('are taken only from Discord’s image server', () => {
    expect(discordAvatar({ avatar_url: 'https://cdn.discordapp.com/avatars/1/a.png' })).toBe('https://cdn.discordapp.com/avatars/1/a.png');
    expect(discordAvatar({ picture: 'https://cdn.discordapp.com/embed/avatars/0.png' })).toBe('https://cdn.discordapp.com/embed/avatars/0.png');
    expect(discordAvatar({ avatar_url: 'https://evil.example/a.png' })).toBeUndefined();
    expect(discordAvatar({ avatar_url: 'http://cdn.discordapp.com/a.png' })).toBeUndefined();
    expect(discordAvatar({ avatar_url: 'javascript:alert(1)' })).toBeUndefined();
    expect(discordAvatar({})).toBeUndefined();
  });
});

describe('Commander tables', () => {
  it('a host and three bots: the host plays their own deck; the bots play the precons', async () => {
    const { lobby, decks } = await setup({ botGameLimit: 400 });
    const joe = browser(lobby);
    await joe.send({ type: 'tableCreate', token: 'tok-joe', players: 1, bots: 3 });
    const code = joe.table()!.code;
    expect(code).toMatch(/^C/);
    expect(joe.table()).toMatchObject({ you: 'P1', host: 'P1', players: 1, bots: 3, phase: 'lobby' });
    await joe.send({ type: 'tableStart' });
    expect(joe.errors().at(-1)?.message).toMatch(/hasn't chosen a deck/);
    await joe.send({ type: 'tableDeck', deck: 'not-a-deck' });
    expect(joe.errors().at(-1)?.message).toMatch(/not one of yours/);
    await joe.send({ type: 'tableDeck', deck: decks.joe });
    expect(joe.table()!.seats[0]!.deck?.name).toBeTruthy();
    await joe.send({ type: 'tableStart' });
    expect(joe.table()!.phase).toBe('playing');
    expect(joe.table()!.seats.map((s) => [s.id, s.bot])).toEqual([
      ['P1', false],
      ['P2', true],
      ['P3', true],
      ['P4', true],
    ]);
    const g = joe.game()!;
    expect(g.seat).toBe('P1');
    // Joe's Discord profile picture goes with his seat; bots have none.
    expect(joe.table()!.seats[0]!.avatar).toBe('https://cdn.discordapp.com/avatars/1/joe.png');
    expect(g.avatars).toEqual({ P1: 'https://cdn.discordapp.com/avatars/1/joe.png' });
    expect(Object.keys(g.names).sort()).toEqual(['P1', 'P2', 'P3', 'P4']);
    expect(g.update.state.players.P1!.life).toBe(40);
    // Joe sees only his own hand.
    for (const p of ['P2', 'P3', 'P4']) {
      const hand = g.update.state.players[p]!.hand;
      expect(hand.length).toBe(7);
      expect(hand.every((id) => id.startsWith('?h'))).toBe(true);
    }
    // Joe concedes: the bots play on without him, and the table finishes.
    await until(() => !!joe.game() && 'player' in joe.game()!.update.state.pending, 'the game');
    await concede(joe);
    await until(() => joe.table()?.phase === 'finished', 'the end of the game');
  }, 120_000);

  it('a mix: two players and a bot; joining by code, decks, rejoining', async () => {
    const { lobby, decks } = await setup();
    const joe = browser(lobby);
    const ann = browser(lobby);
    await joe.send({ type: 'tableCreate', token: 'tok-joe', players: 2, bots: 1 });
    const code = joe.table()!.code;
    await joe.send({ type: 'tableDeck', deck: decks.joe });
    await joe.send({ type: 'tableStart' });
    expect(joe.errors().at(-1)?.message).toMatch(/Waiting for 1 more player/);
    await ann.send({ type: 'tableJoin', token: 'tok-ann', code });
    expect(ann.table()).toMatchObject({ you: 'P2', host: 'P1' });
    // Only the host changes the seats or starts.
    await ann.send({ type: 'tableSettings', players: 3, bots: 1 });
    expect(ann.errors().at(-1)?.message).toMatch(/Only the host/);
    await ann.send({ type: 'tableStart' });
    expect(ann.errors().at(-1)?.message).toMatch(/Only the host/);
    await joe.send({ type: 'tableSettings', players: 1, bots: 1 });
    expect(joe.errors().at(-1)?.message).toMatch(/already seated/);
    // Someone else's deck isn't yours.
    await ann.send({ type: 'tableDeck', deck: decks.joe });
    expect(ann.errors().at(-1)?.message).toMatch(/not one of yours/);
    await joe.send({ type: 'tableStart' });
    expect(joe.errors().at(-1)?.message).toMatch(/Ann hasn't chosen a deck/);
    await ann.send({ type: 'tableDeck', deck: decks.ann });
    // The table is full now.
    const bea = browser(lobby);
    await bea.send({ type: 'tableJoin', token: 'tok-bea', code });
    expect(bea.errors().at(-1)).toMatchObject({ code: 'event-full' });
    await joe.send({ type: 'tableStart' });
    expect(joe.table()!.seats.map((s) => s.bot)).toEqual([false, false, true]);
    expect(joe.game()!.seat).toBe('P1');
    expect(ann.game()!.seat).toBe('P2');
    // A late joiner can't take a seat.
    await bea.send({ type: 'tableJoin', token: 'tok-bea', code });
    expect(bea.errors().at(-1)).toMatchObject({ code: 'already-started' });
    // Ann reloads: she gets her seat and the game back.
    ann.client.disconnect();
    const ann2 = browser(lobby);
    await ann2.send({ type: 'tableJoin', token: 'tok-ann', code });
    expect(ann2.table()!.you).toBe('P2');
    expect(ann2.game()!.seat).toBe('P2');
    // Moves for another seat are refused.
    const v = ann2.game()!.version;
    await ann2.send({ type: 'actions', seq: seq++, version: v, actions: [{ type: 'Concede', player: 'P1' }] });
    expect(ann2.errors().at(-1)).toMatchObject({ code: 'wrong-player' });
    lobby.tables.tables.get(code)!.game!.stop();
  }, 60_000);

  it('seat rules: 2-4 seats with at least one player; the host leaving closes the lobby', async () => {
    const { lobby } = await setup();
    const joe = browser(lobby);
    await joe.send({ type: 'tableCreate', token: 'tok-joe', players: 1, bots: 0 });
    expect(joe.errors().at(-1)?.message).toMatch(/2 to 4 seats/);
    await joe.send({ type: 'tableCreate', token: 'tok-joe', players: 3, bots: 2 });
    expect(joe.errors().at(-1)?.message).toMatch(/2 to 4 seats/);
    await joe.send({ type: 'tableCreate', token: 'tok-joe', players: 4, bots: 0 });
    const code = joe.table()!.code;
    const ann = browser(lobby);
    await ann.send({ type: 'tableJoin', token: 'tok-ann', code });
    await joe.send({ type: 'tableLeave' });
    expect(ann.inbox.at(-1)).toEqual({ type: 'tableClosed', code });
    expect(lobby.tables.tables.has(code)).toBe(false);
  });
});
