// Accounts (economy step E1): the /api/account endpoint with the in-memory
// store, which follows the same rules as the database functions.

import { afterEach, describe, expect, it } from 'vitest';
import { MemoryAccounts, displayName } from '../src/accounts.ts';
import { ECONOMY, packsForPurchase } from '../src/economy.ts';
import { startServer, type RunningServer } from '../src/server.ts';

let server: RunningServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

async function withAccounts() {
  const accounts = new MemoryAccounts();
  accounts.tokens.set('token-alice', { id: 'alice-id', name: 'Alice' });
  accounts.tokens.set('token-bob', { id: 'bob-id', name: 'Bob' });
  server = await startServer({ port: 0, host: '127.0.0.1', accounts });
  const base = `http://127.0.0.1:${server.port}`;
  const get = (token?: string, path = '/api/account') => fetch(base + path, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
  return { accounts, base, get };
}

describe('accounts', () => {
  it('the first sign-in creates the account with the welcome grant, once', async () => {
    const { accounts, get } = await withAccounts();
    const first = await get('token-alice');
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ name: 'Alice', shards: ECONOMY.welcomeGrant });
    // Signing in again, or many retries at once, never pays it twice.
    const again = await Promise.all(Array.from({ length: 5 }, () => get('token-alice')));
    for (const r of again) expect(await r.json()).toEqual({ name: 'Alice', shards: ECONOMY.welcomeGrant });
    expect([...accounts.ledger.keys()].filter((k) => k.startsWith('alice-id|welcome_grant'))).toHaveLength(1);
    // Each player has their own account.
    expect(await (await get('token-bob')).json()).toEqual({ name: 'Bob', shards: ECONOMY.welcomeGrant });
  });

  it('refuses a missing or invalid sign-in, and anything but GET', async () => {
    const { base, get } = await withAccounts();
    expect((await get()).status).toBe(401);
    expect((await get('not-a-token')).status).toBe(401);
    expect((await fetch(`${base}/api/account`, { method: 'POST', headers: { Authorization: 'Bearer token-alice' }, body: '{"shards":999999}' })).status).toBe(405);
  });

  it('ignores anything the browser says about its balance', async () => {
    const { get } = await withAccounts();
    const r = await get('token-alice', '/api/account?shards=999999&welcome=50000');
    expect(await r.json()).toEqual({ name: 'Alice', shards: ECONOMY.welcomeGrant });
  });

  it('says so when accounts are not set up, and guest play still works', async () => {
    server = await startServer({ port: 0, host: '127.0.0.1' });
    const r = await fetch(`http://127.0.0.1:${server.port}/api/account`, { headers: { Authorization: 'Bearer x' } });
    expect(r.status).toBe(503);
  });

  it('balance changes happen once per reference and never go below zero', async () => {
    const accounts = new MemoryAccounts();
    await accounts.ensure({ id: 'u', name: 'U' });
    expect(accounts.apply('u', -600, 'event_entry', 'event-1')).toEqual({ balance: ECONOMY.welcomeGrant - 600, applied: true });
    // A retry of the same entry changes nothing.
    expect(accounts.apply('u', -600, 'event_entry', 'event-1')).toEqual({ balance: ECONOMY.welcomeGrant - 600, applied: false });
    expect(() => accounts.apply('u', -10_000, 'pack_purchase', 'buy-1')).toThrow(/insufficient/);
    expect(accounts.accounts.get('u')!.shards).toBe(ECONOMY.welcomeGrant - 600);
  });

  it('takes the player name from Discord, with a fallback', () => {
    expect(displayName({ custom_claims: { global_name: 'Cloud' }, full_name: 'cloud_strife' }, 'Player')).toBe('Cloud');
    expect(displayName({ full_name: '  Tifa  ' }, 'Player')).toBe('Tifa');
    expect(displayName(undefined, 'Player')).toBe('Player');
    expect(displayName({ name: 'x'.repeat(50) }, 'Player')).toHaveLength(32);
  });
});

describe('economy configuration', () => {
  it('one bonus booster for every ten bought, of the same purchase', () => {
    expect(packsForPurchase(1)).toEqual({ paid: 1, bonus: 0, total: 1 });
    expect(packsForPurchase(9)).toEqual({ paid: 9, bonus: 0, total: 9 });
    expect(packsForPurchase(10)).toEqual({ paid: 10, bonus: 1, total: 11 });
    expect(packsForPurchase(19)).toEqual({ paid: 19, bonus: 1, total: 20 });
    expect(packsForPurchase(20)).toEqual({ paid: 20, bonus: 2, total: 22 });
    expect(ECONOMY.eventEntry).toBe(6 * ECONOMY.playBoosterPrice);
  });
});
