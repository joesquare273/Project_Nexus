// Collections and saved decks (economy step E1b): the /api/collection and
// /api/decks endpoints with the in-memory store, which follows the same rules
// as the database functions.

import { afterEach, describe, expect, it } from 'vitest';
import { MemoryAccounts } from '../src/accounts.ts';
import { deckProblem, type DeckInput } from '../src/collection.ts';
import { ECONOMY } from '../src/economy.ts';
import { startServer, type RunningServer } from '../src/server.ts';

const CLOUD = '00000000-0000-4000-8000-000000000001';
const TIFA = '00000000-0000-4000-8000-000000000002';
const NO_BASICS = { W: 0, U: 0, B: 0, R: 0, G: 0 };

let server: RunningServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

async function withAccounts() {
  const accounts = new MemoryAccounts();
  accounts.tokens.set('token-alice', { id: 'alice-id', name: 'Alice' });
  accounts.tokens.set('token-bob', { id: 'bob-id', name: 'Bob' });
  await accounts.ensure({ id: 'alice-id', name: 'Alice' });
  await accounts.ensure({ id: 'bob-id', name: 'Bob' });
  server = await startServer({ port: 0, host: '127.0.0.1', accounts });
  const base = `http://127.0.0.1:${server.port}`;
  // Response bodies are read loosely; the tests check their shape.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const call = (token: string, path: string, method = 'GET', body?: unknown): Promise<{ status: number; json(): Promise<any> }> =>
    fetch(base + path, { method, headers: { Authorization: `Bearer ${token}` }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { accounts, call };
}

const deck = (over: Partial<DeckInput> = {}): DeckInput => ({ name: 'Midgar', format: 'limited', cards: [{ id: CLOUD, finish: 'nonfoil', count: 2 }], basics: { ...NO_BASICS, R: 17 }, ...over });

describe('collections', () => {
  it('grants cards once per reference, paying shards in the same step', async () => {
    const { accounts, call } = await withAccounts();
    const grant = { kind: 'pack_open' as const, ref: 'pack-1', cost: ECONOMY.playBoosterPrice, cards: [{ id: CLOUD, finish: 'nonfoil' as const, count: 2 }, { id: CLOUD, finish: 'foil' as const, count: 1 }] };
    expect(await accounts.grantCards('alice-id', grant)).toEqual({ balance: ECONOMY.welcomeGrant - ECONOMY.playBoosterPrice, applied: true });
    expect(await accounts.grantCards('alice-id', grant)).toEqual({ balance: ECONOMY.welcomeGrant - ECONOMY.playBoosterPrice, applied: false });
    await accounts.grantCards('alice-id', { ...grant, ref: 'pack-2', cost: 0 });
    const r = await call('token-alice', '/api/collection');
    expect((await r.json()).cards).toEqual([
      { id: CLOUD, finish: 'nonfoil', count: 4 },
      { id: CLOUD, finish: 'foil', count: 2 },
    ]);
    // Each player has their own collection.
    expect((await (await call('token-bob', '/api/collection')).json()).cards).toEqual([]);
  });

  it('adds no cards when the player cannot pay', async () => {
    const { accounts } = await withAccounts();
    await expect(accounts.grantCards('alice-id', { kind: 'pack_open', ref: 'big', cost: 1_000_000, cards: [{ id: CLOUD, finish: 'nonfoil', count: 1 }] })).rejects.toThrow(/insufficient/);
    expect(await accounts.collection('alice-id')).toEqual([]);
  });
});

describe('decks', () => {
  it('saves, lists, changes and deletes a player’s own decks', async () => {
    const { accounts, call } = await withAccounts();
    await accounts.grantCards('alice-id', { kind: 'draft', ref: 'd1', cost: 0, cards: [{ id: CLOUD, finish: 'nonfoil', count: 2 }] });
    const saved = await (await call('token-alice', '/api/decks', 'POST', deck())).json();
    expect(saved).toMatchObject({ name: 'Midgar', format: 'limited', basics: { R: 17 }, commander: null });
    const changed = await call('token-alice', '/api/decks', 'POST', deck({ id: saved.id, name: 'Midgar 2' }));
    expect((await changed.json()).name).toBe('Midgar 2');
    expect((await (await call('token-alice', '/api/decks')).json()).decks.map((d: { name: string }) => d.name)).toEqual(['Midgar 2']);
    // Another player can't see, change or delete it.
    expect((await (await call('token-bob', '/api/decks')).json()).decks).toEqual([]);
    expect((await call('token-bob', '/api/decks', 'POST', deck({ id: saved.id, cards: [] }))).status).toBe(404);
    expect((await call('token-bob', `/api/decks/${saved.id}`, 'DELETE')).status).toBe(404);
    expect((await call('token-alice', `/api/decks/${saved.id}`, 'DELETE')).status).toBe(200);
    expect((await (await call('token-alice', '/api/decks')).json()).decks).toEqual([]);
  });

  it('refuses cards the player does not own, and unreadable decks', async () => {
    const { accounts, call } = await withAccounts();
    await accounts.grantCards('alice-id', { kind: 'draft', ref: 'd1', cost: 0, cards: [{ id: CLOUD, finish: 'nonfoil', count: 1 }] });
    // Two copies of a card they have one of; the foil they don't have.
    expect((await call('token-alice', '/api/decks', 'POST', deck())).status).toBe(400);
    expect((await call('token-alice', '/api/decks', 'POST', deck({ cards: [{ id: CLOUD, finish: 'foil', count: 1 }] }))).status).toBe(400);
    // Basic lands are free, so a deck of only basics is fine.
    expect((await call('token-alice', '/api/decks', 'POST', deck({ cards: [], basics: { ...NO_BASICS, W: 40 } }))).status).toBe(200);
    for (const bad of [{ ...deck(), shards: 5 }, { ...deck(), name: '' }, { ...deck(), format: 'vintage' }, { ...deck(), basics: { ...NO_BASICS, R: 1000 } }, 'not json']) {
      expect((await call('token-alice', '/api/decks', 'POST', bad)).status).toBe(400);
    }
    expect((await (await call('token-alice', '/api/decks')).json()).decks).toHaveLength(1);
  });

  it('needs a sign-in', async () => {
    const { call } = await withAccounts();
    expect((await call('nobody', '/api/collection')).status).toBe(401);
    expect((await call('nobody', '/api/decks', 'POST', deck())).status).toBe(401);
  });

  it('a commander must be one of the deck’s cards, and only in Commander', () => {
    const owned = [{ id: CLOUD, finish: 'nonfoil' as const, count: 1 }, { id: TIFA, finish: 'nonfoil' as const, count: 1 }];
    const cards = owned.map((c) => ({ ...c }));
    expect(deckProblem(deck({ format: 'commander', cards, commander: TIFA }), owned)).toBeNull();
    expect(deckProblem(deck({ format: 'commander', cards: cards.slice(0, 1), commander: TIFA }), owned)).toMatch(/commander/);
    expect(deckProblem(deck({ cards, commander: TIFA }), owned)).toMatch(/Commander/);
  });
});
