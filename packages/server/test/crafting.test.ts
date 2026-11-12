// Dismantling and crafting (docs/economy.md, "Crafting"): the endpoints with
// the in-memory store, which follows the same rules as the database functions
// (supabase/migrations/20261104180000_crafting.sql).

import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { CRAFTABLE, FRAGMENT_RARITIES, printingsNamed, type FragmentRarity } from '@nexus/cards/crafting';
import { BOOSTER_CARDS } from '@nexus/cards/boosters';
import { MemoryAccounts } from '../src/accounts.ts';
import { ECONOMY } from '../src/economy.ts';
import { startServer, type RunningServer } from '../src/server.ts';

let server: RunningServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

async function serve(accounts: MemoryAccounts) {
  server = await startServer({ port: 0, host: '127.0.0.1', accounts });
  const base = `http://127.0.0.1:${server.port}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (path: string, method = 'GET', body?: unknown): Promise<{ status: number; json(): Promise<any> }> =>
    fetch(base + path, { method, headers: { Authorization: 'Bearer token-alice' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

async function withAccounts() {
  const accounts = new MemoryAccounts();
  accounts.tokens.set('token-alice', { id: 'alice', name: 'Alice' });
  await accounts.ensure({ id: 'alice', name: 'Alice' });
  return { accounts, call: await serve(accounts) };
}

/** A craftable printing of each rarity, and another printing of the same card when there is one. */
const sample = (rarity: FragmentRarity) => CRAFTABLE.find((c) => c.rarity === rarity)!;
const give = (accounts: MemoryAccounts, id: string, count: number, finish: 'nonfoil' | 'foil' = 'nonfoil') =>
  accounts.grantCards('alice', { kind: 'admin_adjustment', ref: randomUUID(), cost: 0, cards: [{ id, finish, count }] });
const copies = async (accounts: MemoryAccounts, id: string) => (await accounts.collection('alice')).filter((c) => c.id === id).reduce((n, c) => n + c.count, 0);

describe('dismantling', () => {
  it.each(FRAGMENT_RARITIES)('a %s gives its fragment and removes exactly one copy', async (rarity) => {
    const { accounts, call } = await withAccounts();
    const card = sample(rarity);
    await give(accounts, card.id, 3);
    const r = await call('/api/dismantle', 'POST', { requestId: randomUUID(), card: card.id, finish: 'nonfoil' });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.applied).toBe(true);
    expect(body.fragments[rarity]).toBe(ECONOMY.crafting.dismantle[rarity]);
    for (const other of FRAGMENT_RARITIES) if (other !== rarity) expect(body.fragments[other]).toBe(0);
    expect(await copies(accounts, card.id)).toBe(2);
  });

  it('a foil gives one more fragment of its rarity', async () => {
    const { accounts, call } = await withAccounts();
    const card = sample('rare');
    await give(accounts, card.id, 1);
    await give(accounts, card.id, 1, 'foil');
    const body = await (await call('/api/dismantle', 'POST', { requestId: randomUUID(), card: card.id, finish: 'foil' })).json();
    expect(body.fragments.rare).toBe(ECONOMY.crafting.dismantle.rare + ECONOMY.crafting.foilBonus);
  });

  it('only cards you own, never your last copy (any art), and not basic lands', async () => {
    const { accounts, call } = await withAccounts();
    const card = sample('common');
    expect((await call('/api/dismantle', 'POST', { requestId: randomUUID(), card: card.id, finish: 'nonfoil' })).status).toBe(409);
    await give(accounts, card.id, 1);
    const last = await call('/api/dismantle', 'POST', { requestId: randomUUID(), card: card.id, finish: 'nonfoil' });
    expect(last.status).toBe(409);
    expect((await last.json()).error).toMatch(/last copy/);
    expect(await copies(accounts, card.id)).toBe(1);
    // Another art of the same card counts: with two printings, one may go.
    const other = printingsNamed(card.name).find((id) => id !== card.id);
    if (other) {
      await give(accounts, other, 1);
      expect((await call('/api/dismantle', 'POST', { requestId: randomUUID(), card: other, finish: 'nonfoil' })).status).toBe(200);
    }
    // Owning a foil doesn't let you dismantle a non-foil you don't have.
    const rare = sample('rare');
    await give(accounts, rare.id, 2, 'foil');
    expect((await call('/api/dismantle', 'POST', { requestId: randomUUID(), card: rare.id, finish: 'nonfoil' })).status).toBe(409);
    const basic = BOOSTER_CARDS.find((c) => c.typeLine.startsWith('Basic Land'))!;
    await give(accounts, basic.id, 5);
    expect((await call('/api/dismantle', 'POST', { requestId: randomUUID(), card: basic.id, finish: 'nonfoil' })).status).toBe(400);
    expect(await accounts.fragments('alice')).toEqual({ common: 0, uncommon: 0, rare: 0, mythic: 0 });
  });

  it("each account has its own fragments: one player's dismantling never touches another's", async () => {
    const { accounts, call } = await withAccounts();
    accounts.tokens.set('token-bob', { id: 'bob', name: 'Bob' });
    await accounts.ensure({ id: 'bob', name: 'Bob' });
    const card = sample('rare');
    await give(accounts, card.id, 3);
    await accounts.grantCards('bob', { kind: 'admin_adjustment', ref: randomUUID(), cost: 0, cards: [{ id: card.id, finish: 'nonfoil', count: 2 }] });
    // The same request id from two players is two different requests.
    const requestId = randomUUID();
    expect((await call('/api/dismantle', 'POST', { requestId, card: card.id, finish: 'nonfoil' })).status).toBe(200);
    const base = `http://127.0.0.1:${server!.port}`;
    const asBob = (path: string, method = 'GET', body?: unknown) => fetch(base + path, { method, headers: { Authorization: 'Bearer token-bob' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    expect((await (await asBob('/api/fragments')).json()).fragments.rare).toBe(0);
    expect((await asBob('/api/dismantle', 'POST', { requestId, card: card.id, finish: 'nonfoil' })).status).toBe(200);
    expect((await accounts.fragments('alice')).rare).toBe(ECONOMY.crafting.dismantle.rare);
    expect((await accounts.fragments('bob')).rare).toBe(ECONOMY.crafting.dismantle.rare);
    expect(await copies(accounts, card.id)).toBe(2);
    expect((await accounts.collection('bob')).filter((c) => c.id === card.id).reduce((n, c) => n + c.count, 0)).toBe(1);
  });

  it('a repeated request pays once', async () => {
    const { accounts, call } = await withAccounts();
    const card = sample('uncommon');
    await give(accounts, card.id, 5);
    const request = { requestId: randomUUID(), card: card.id, finish: 'nonfoil' };
    const [a, b] = await Promise.all([call('/api/dismantle', 'POST', request), call('/api/dismantle', 'POST', request)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect((await call('/api/dismantle', 'POST', request)).status).toBe(200);
    expect((await accounts.fragments('alice')).uncommon).toBe(1);
    expect(await copies(accounts, card.id)).toBe(4);
  });

  it('can be configured to allow the last copy', async () => {
    const { accounts, call } = await withAccounts();
    const card = sample('common');
    await give(accounts, card.id, 1);
    const crafting = ECONOMY.crafting as { protectLastCopy: boolean };
    crafting.protectLastCopy = false;
    try {
      expect((await call('/api/dismantle', 'POST', { requestId: randomUUID(), card: card.id, finish: 'nonfoil' })).status).toBe(200);
      expect(await copies(accounts, card.id)).toBe(0);
    } finally {
      crafting.protectLastCopy = true;
    }
  });
});

describe('bulk dismantling', () => {
  const batch = (items: { card: string; finish: string; count: number }[], requestId: string = randomUUID()) => ({ requestId, items });

  it('dismantles a whole list at once, foils included', async () => {
    const { accounts, call } = await withAccounts();
    const common = sample('common');
    const rare = sample('rare');
    await give(accounts, common.id, 5);
    await give(accounts, rare.id, 2);
    await give(accounts, rare.id, 1, 'foil');
    const r = await call('/api/dismantle/batch', 'POST', batch([
      { card: common.id, finish: 'nonfoil', count: 4 },
      { card: rare.id, finish: 'foil', count: 1 },
      { card: rare.id, finish: 'nonfoil', count: 1 },
    ]));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body).toMatchObject({ applied: true, copies: 6 });
    expect(body.fragments.common).toBe(4 * ECONOMY.crafting.dismantle.common);
    expect(body.fragments.rare).toBe(2 * ECONOMY.crafting.dismantle.rare + ECONOMY.crafting.foilBonus);
    expect(await copies(accounts, common.id)).toBe(1);
    expect(await accounts.collection('alice')).toContainEqual({ id: rare.id, finish: 'nonfoil', count: 1 });
  });

  it('is all or nothing: one card that can’t go stops the list, and the error names it', async () => {
    const { accounts, call } = await withAccounts();
    const common = sample('common');
    const rare = sample('rare');
    await give(accounts, common.id, 3);
    await give(accounts, rare.id, 2);
    // Both rares would leave none (the last-copy rule counts the whole list).
    const last = await call('/api/dismantle/batch', 'POST', batch([{ card: common.id, finish: 'nonfoil', count: 2 }, { card: rare.id, finish: 'nonfoil', count: 2 }]));
    expect(last.status).toBe(409);
    expect((await last.json()).error).toContain(rare.name);
    const many = await call('/api/dismantle/batch', 'POST', batch([{ card: common.id, finish: 'nonfoil', count: 9 }]));
    expect(many.status).toBe(409);
    expect((await many.json()).error).toMatch(/that many copies/);
    expect(await copies(accounts, common.id)).toBe(3);
    expect(await copies(accounts, rare.id)).toBe(2);
    expect(await accounts.fragments('alice')).toEqual({ common: 0, uncommon: 0, rare: 0, mythic: 0 });
  });

  it('refuses unreadable lists, a card listed twice, and basic lands', async () => {
    const { accounts, call } = await withAccounts();
    const common = sample('common');
    await give(accounts, common.id, 5);
    const one = { card: common.id, finish: 'nonfoil', count: 1 };
    expect((await call('/api/dismantle/batch', 'POST', batch([]))).status).toBe(400);
    expect((await call('/api/dismantle/batch', 'POST', batch([{ ...one, count: 0 }]))).status).toBe(400);
    expect((await call('/api/dismantle/batch', 'POST', batch([one, one]))).status).toBe(400);
    const basic = BOOSTER_CARDS.find((c) => c.typeLine.startsWith('Basic Land'))!;
    await give(accounts, basic.id, 5);
    expect((await call('/api/dismantle/batch', 'POST', batch([one, { card: basic.id, finish: 'nonfoil', count: 1 }]))).status).toBe(400);
    expect(await copies(accounts, common.id)).toBe(5);
  });

  it('a repeated list pays once', async () => {
    const { accounts, call } = await withAccounts();
    const card = sample('uncommon');
    await give(accounts, card.id, 5);
    const request = batch([{ card: card.id, finish: 'nonfoil', count: 2 }]);
    const [a, b] = await Promise.all([call('/api/dismantle/batch', 'POST', request), call('/api/dismantle/batch', 'POST', request)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect((await accounts.fragments('alice')).uncommon).toBe(2);
    expect(await copies(accounts, card.id)).toBe(3);
  });
});

describe('crafting', () => {
  it.each(FRAGMENT_RARITIES)('a %s costs its fragments and adds exactly one non-foil copy', async (rarity) => {
    const { accounts, call } = await withAccounts();
    const cost = ECONOMY.crafting.craft[rarity];
    accounts.fragmentBalances.set('alice', { common: 0, uncommon: 0, rare: 0, mythic: 0, [rarity]: cost + 1 });
    const card = sample(rarity);
    const r = await call('/api/craft', 'POST', { requestId: randomUUID(), card: card.id });
    expect(r.status).toBe(200);
    expect((await r.json()).fragments[rarity]).toBe(1);
    expect(await accounts.collection('alice')).toEqual([{ id: card.id, finish: 'nonfoil', count: 1 }]);
  });

  it('needs enough fragments of the card’s own rarity, and nothing changes otherwise', async () => {
    const { accounts, call } = await withAccounts();
    accounts.fragmentBalances.set('alice', { common: 50, uncommon: 50, rare: 3, mythic: 0 });
    const rare = sample('rare');
    const r = await call('/api/craft', 'POST', { requestId: randomUUID(), card: rare.id });
    expect(r.status).toBe(409);
    expect((await r.json()).error).toMatch(/enough fragments/);
    expect(await accounts.fragments('alice')).toEqual({ common: 50, uncommon: 50, rare: 3, mythic: 0 });
    expect(await accounts.collection('alice')).toEqual([]);
  });

  it('only real craftable printings: not unknown cards, basic lands or Store-only printings', async () => {
    const { accounts, call } = await withAccounts();
    accounts.fragmentBalances.set('alice', { common: 99, uncommon: 99, rare: 99, mythic: 99 });
    const basic = BOOSTER_CARDS.find((c) => c.typeLine.startsWith('Basic Land'))!;
    const track = BOOSTER_CARDS.find((c) => c.promoTypes?.includes('chocobotrackfoil') && !c.typeLine.startsWith('Basic'))!;
    for (const card of ['00000000-0000-4000-8000-000000000000', basic.id, track.id]) {
      expect((await call('/api/craft', 'POST', { requestId: randomUUID(), card })).status).toBe(400);
    }
    expect((await call('/api/craft', 'POST', { requestId: 'nope', card: basic.id })).status).toBe(400);
    expect(await accounts.collection('alice')).toEqual([]);
  });

  it('nonbasic lands can be crafted', () => {
    expect(CRAFTABLE.some((c) => c.typeLine.includes('Land') && !c.typeLine.startsWith('Basic'))).toBe(true);
    expect(CRAFTABLE.some((c) => c.typeLine.startsWith('Basic'))).toBe(false);
  });

  it('a repeated request crafts once', async () => {
    const { accounts, call } = await withAccounts();
    accounts.fragmentBalances.set('alice', { common: 12, uncommon: 0, rare: 0, mythic: 0 });
    const card = sample('common');
    const request = { requestId: randomUUID(), card: card.id };
    await Promise.all([call('/api/craft', 'POST', request), call('/api/craft', 'POST', request), call('/api/craft', 'POST', request)]);
    expect((await accounts.fragments('alice')).common).toBe(12 - ECONOMY.crafting.craft.common);
    expect(await copies(accounts, card.id)).toBe(1);
  });
});

describe('persistence', () => {
  it('fragments and collection changes stay after the server restarts', async () => {
    const { accounts, call } = await withAccounts();
    const card = sample('mythic');
    await give(accounts, card.id, 5);
    for (let i = 0; i < 4; i++) await call('/api/dismantle', 'POST', { requestId: randomUUID(), card: card.id, finish: 'nonfoil' });
    // A failed craft (not enough rare fragments) changes nothing.
    await call('/api/craft', 'POST', { requestId: randomUUID(), card: sample('rare').id });
    await server!.close();
    const again = await serve(accounts);
    const body = await (await again('/api/fragments')).json();
    expect(body.fragments).toEqual({ common: 0, uncommon: 0, rare: 0, mythic: 4 });
    expect(body.rules.craft.mythic).toBe(4);
    expect((await again('/api/craft', 'POST', { requestId: randomUUID(), card: card.id })).status).toBe(200);
    expect(await copies(accounts, card.id)).toBe(2);
    expect((await accounts.fragments('alice')).mythic).toBe(0);
  });
});
