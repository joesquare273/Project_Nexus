// The admin page's requests (server.ts, adminRoute) with the in-memory store,
// which follows the same rules as admin_adjust_shards
// (supabase/migrations/20261116120000_admin.sql).

import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryAccounts } from '../src/accounts.ts';
import { startServer, type RunningServer } from '../src/server.ts';

let server: RunningServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

async function setup() {
  const accounts = new MemoryAccounts();
  accounts.tokens.set('token-solis', { id: 'solis', name: 'Solis' });
  accounts.tokens.set('token-ann', { id: 'ann', name: 'Ann' });
  await accounts.ensure({ id: 'solis', name: 'Solis' });
  await accounts.ensure({ id: 'ann', name: 'Ann' });
  accounts.admins.add('solis');
  server = await startServer({ port: 0, host: '127.0.0.1', accounts });
  const base = `http://127.0.0.1:${server.port}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const as = (token: string) => async (path: string, body?: unknown): Promise<{ status: number; body: any }> => {
    const res = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token}` }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: res.status, body: await res.json() };
  };
  return { accounts, solis: as('token-solis'), ann: as('token-ann') };
}

/** Every ledger row for a player, summed: the balance must always equal it. */
const ledgerSum = (accounts: MemoryAccounts, user: string) => [...accounts.ledger].filter(([k]) => k.startsWith(`${user}|`)).reduce((n, [, v]) => n + v.amount, 0);

describe('administration', () => {
  it('only an admin sees the accounts page; /api/account says who is one', async () => {
    const { solis, ann } = await setup();
    expect((await solis('/api/account')).body.admin).toBe(true);
    expect((await ann('/api/account')).body.admin).toBe(false);
    expect((await ann('/api/admin/accounts')).status).toBe(403);
    expect((await ann('/api/admin/shards', { userId: 'ann', mode: 'set', amount: 999999, requestId: randomUUID() })).status).toBe(403);
    const list = await solis('/api/admin/accounts');
    expect(list.status).toBe(200);
    expect(list.body.accounts.map((a: { name: string }) => a.name).sort()).toEqual(['Ann', 'Solis']);
    expect(list.body.accounts.find((a: { id: string }) => a.id === 'ann')).toMatchObject({ fragments: { common: 0, uncommon: 0, rare: 0, mythic: 0 }, admin: false });
  });

  it("sets or changes a player's shards, through the ledger, once per request, never below zero", async () => {
    const { accounts, solis } = await setup();
    const start = accounts.accounts.get('ann')!.shards;
    // Set an exact balance.
    const requestId = randomUUID();
    const set = await solis('/api/admin/shards', { userId: 'ann', mode: 'set', amount: 12345, requestId, note: 'tournament prize' });
    expect(set.body).toEqual({ balance: 12345, applied: true });
    // The same request again changes nothing.
    expect((await solis('/api/admin/shards', { userId: 'ann', mode: 'set', amount: 12345, requestId })).body).toEqual({ balance: 12345, applied: false });
    // Add and take away.
    expect((await solis('/api/admin/shards', { userId: 'ann', mode: 'add', amount: 655, requestId: randomUUID() })).body.balance).toBe(13000);
    expect((await solis('/api/admin/shards', { userId: 'ann', mode: 'add', amount: -3000, requestId: randomUUID() })).body.balance).toBe(10000);
    // Below zero is refused, and so are bad amounts.
    expect((await solis('/api/admin/shards', { userId: 'ann', mode: 'add', amount: -10001, requestId: randomUUID() })).status).toBe(400);
    expect((await solis('/api/admin/shards', { userId: 'ann', mode: 'set', amount: -5, requestId: randomUUID() })).status).toBe(400);
    expect((await solis('/api/admin/shards', { userId: 'ann', mode: 'set', amount: 1.5, requestId: randomUUID() })).status).toBe(400);
    expect((await solis('/api/admin/shards', { userId: 'nobody', mode: 'set', amount: 5, requestId: randomUUID() })).status).toBe(404);
    expect(accounts.accounts.get('ann')!.shards).toBe(10000);
    // Balances still equal the ledger; the changes are listed with the note, newest first.
    expect(ledgerSum(accounts, 'ann')).toBe(10000);
    const { actions } = (await solis('/api/admin/accounts')).body;
    expect(actions.map((a: { amount: number }) => a.amount)).toEqual([-3000, 655, 12345 - start]);
    expect(actions.at(-1)).toMatchObject({ admin: 'solis', user: 'ann', kind: 'set_shards', balanceAfter: 12345, note: 'tournament prize' });
  });

  it('players send requests and see their own; the admin sees them all with the account, sets their status and deletes them', async () => {
    const { solis, ann } = await setup();
    // Checks on what a player sends.
    expect((await ann('/api/requests', { subject: '', cards: [], description: 'x' })).status).toBe(400);
    expect((await ann('/api/requests', { subject: 'Hi', cards: [], description: '' })).status).toBe(400);
    expect((await ann('/api/requests', { subject: 'x'.repeat(121), cards: [], description: 'y' })).status).toBe(400);
    expect((await ann('/api/requests', { subject: 'Hi', cards: 'Sol Ring', description: 'y' })).status).toBe(400);
    const sent = await ann('/api/requests', { subject: '  Sunfall does nothing  ', cards: ['Sunfall', 'Sunfall', ' Despark '], description: 'I cast it and nothing was exiled.' });
    expect(sent.status).toBe(200);
    expect(sent.body.request).toMatchObject({ subject: 'Sunfall does nothing', cards: ['Sunfall', 'Despark'], status: 'not_started', userId: 'ann' });
    // Their own list; another player's list doesn't show it.
    expect((await ann('/api/requests')).body.requests.map((r: { subject: string }) => r.subject)).toEqual(['Sunfall does nothing']);
    expect((await solis('/api/requests')).body.requests).toEqual([]);
    // Only the admin sees every request, with the account that sent it.
    expect((await ann('/api/admin/requests')).status).toBe(403);
    const all = (await solis('/api/admin/requests')).body.requests;
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ from: 'Ann', subject: 'Sunfall does nothing' });
    const id = all[0].id as number;
    // Status: not started, incomplete, complete.
    expect((await ann('/api/admin/requests/status', { id, status: 'complete' })).status).toBe(403);
    expect((await solis('/api/admin/requests/status', { id, status: 'done' })).status).toBe(400);
    expect((await solis('/api/admin/requests/status', { id, status: 'incomplete' })).body).toEqual({ id, status: 'incomplete' });
    expect((await ann('/api/requests')).body.requests[0].status).toBe('incomplete');
    // Delete it once fixed.
    const base = `http://127.0.0.1:${server!.port}`;
    const del = (token: string, rid: number) => fetch(`${base}/api/admin/requests/${rid}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    expect((await del('token-ann', id)).status).toBe(403);
    expect((await del('token-solis', id)).status).toBe(200);
    expect((await del('token-solis', id)).status).toBe(404);
    expect((await solis('/api/admin/requests')).body.requests).toEqual([]);
  });

  it('a player can send 10 requests a day', async () => {
    const { ann } = await setup();
    for (let i = 0; i < 10; i++) expect((await ann('/api/requests', { subject: `Request ${i}`, cards: [], description: 'Something is wrong.' })).status).toBe(200);
    expect((await ann('/api/requests', { subject: 'One more', cards: [], description: 'Something else.' })).status).toBe(429);
  });
});

