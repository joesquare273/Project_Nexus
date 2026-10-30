// Collections and saved decks (economy step E1b): the /api/collection and
// /api/decks endpoints with the in-memory store, which follows the same rules
// as the database functions.

import { afterEach, describe, expect, it } from 'vitest';
import { MemoryAccounts } from '../src/accounts.ts';
import { deckProblem, type DeckInput } from '../src/collection.ts';
import { ECONOMY, FIRST_DAY_SHARDS } from '../src/economy.ts';
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
    expect(await accounts.grantCards('alice-id', grant)).toEqual({ balance: FIRST_DAY_SHARDS - ECONOMY.playBoosterPrice, applied: true });
    expect(await accounts.grantCards('alice-id', grant)).toEqual({ balance: FIRST_DAY_SHARDS - ECONOMY.playBoosterPrice, applied: false });
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

describe('buying packs', () => {
  it('opens a pack on the server, charges its price and adds every card', async () => {
    const { accounts, call } = await withAccounts();
    const r = await call('token-alice', '/api/packs/open', 'POST', { kind: 'play' });
    expect(r.status).toBe(200);
    const { packs, balance } = await r.json();
    expect(packs).toHaveLength(1);
    const pack = packs[0];
    expect(balance).toBe(FIRST_DAY_SHARDS - ECONOMY.playBoosterPrice);
    expect(accounts.accounts.get('alice-id')!.shards).toBe(balance);
    const owned = await accounts.collection('alice-id');
    expect(owned.reduce((n, c) => n + c.count, 0)).toBe(pack.cards.length);
    for (const p of pack.cards) expect(owned.some((c) => c.id === p.card.id && c.finish === p.finish)).toBe(true);
    // Each purchase is its own: a second pack is charged and added too.
    await call('token-alice', '/api/packs/open', 'POST', { kind: 'collector' });
    expect(accounts.accounts.get('alice-id')!.shards).toBe(FIRST_DAY_SHARDS - ECONOMY.playBoosterPrice - ECONOMY.collectorBoosterPrice);
  });

  it('refuses when the player cannot afford it, and ignores prices from the browser', async () => {
    const { accounts, call } = await withAccounts();
    // Exactly two Collector Boosters' worth.
    accounts.apply('alice-id', 2 * ECONOMY.collectorBoosterPrice - FIRST_DAY_SHARDS, 'admin_adjustment', 'set-balance');
    expect((await call('token-alice', '/api/packs/open', 'POST', { kind: 'collector', price: 0 })).status).toBe(200);
    expect((await call('token-alice', '/api/packs/open', 'POST', { kind: 'collector' })).status).toBe(200);
    expect(accounts.accounts.get('alice-id')!.shards).toBe(0);
    const before = (await accounts.collection('alice-id')).reduce((n, c) => n + c.count, 0);
    expect((await call('token-alice', '/api/packs/open', 'POST', { kind: 'play' })).status).toBe(402);
    expect((await accounts.collection('alice-id')).reduce((n, c) => n + c.count, 0)).toBe(before);
    expect((await call('token-alice', '/api/packs/open', 'POST', { kind: 'starter' })).status).toBe(400);
    expect((await call('nobody', '/api/packs/open', 'POST', { kind: 'play' })).status).toBe(401);
  });
});

describe('the free starter precon', () => {
  it('grants the chosen precon once, as cards and a Commander deck', async () => {
    const { accounts, call } = await withAccounts();
    const before = await (await call('token-alice', '/api/starter')).json();
    expect(before.claimed).toBe(false);
    expect(before.choices).toHaveLength(4);
    const name = before.choices[1].name;
    const r = await call('token-alice', '/api/starter', 'POST', { precon: name });
    expect(r.status).toBe(200);
    const { deck } = await r.json();
    expect(deck).toMatchObject({ format: 'commander' });
    expect(deck.cards.reduce((n: number, c: { count: number }) => n + c.count, 0)).toBe(100);
    expect(deck.cards.some((c: { id: string }) => c.id === deck.commander)).toBe(true);
    expect((await accounts.collection('alice-id')).reduce((n, c) => n + c.count, 0)).toBe(100);
    // Free, and only once: asking again, even for another precon, adds nothing.
    expect(accounts.accounts.get('alice-id')!.shards).toBe(FIRST_DAY_SHARDS);
    const again = await Promise.all(before.choices.map((c: { name: string }) => call('token-alice', '/api/starter', 'POST', { precon: c.name })));
    expect(again.map((x) => x.status)).toEqual([409, 409, 409, 409]);
    expect((await accounts.collection('alice-id')).reduce((n, c) => n + c.count, 0)).toBe(100);
    expect((await (await call('token-alice', '/api/decks')).json()).decks).toHaveLength(1);
    expect((await (await call('token-alice', '/api/starter')).json()).claimed).toBe(true);
    // Another player still has theirs to pick.
    expect((await (await call('token-bob', '/api/starter')).json()).claimed).toBe(false);
  });

  it('refuses anything but one of the four precons', async () => {
    const { call } = await withAccounts();
    for (const precon of ['Cloud', '', 5, undefined]) expect((await call('token-alice', '/api/starter', 'POST', { precon })).status).toBe(400);
    expect((await (await call('token-alice', '/api/starter')).json()).claimed).toBe(false);
  });
});

describe('buying ten packs', () => {
  it('charges for ten, opens eleven (one free) and adds every card at once', async () => {
    const { accounts, call } = await withAccounts();
    const r = await call('token-alice', '/api/packs/open', 'POST', { kind: 'play', count: 10 });
    expect(r.status).toBe(200);
    const { packs, balance } = await r.json();
    expect(packs).toHaveLength(11);
    expect(balance).toBe(FIRST_DAY_SHARDS - 10 * ECONOMY.playBoosterPrice);
    const total = packs.reduce((n: number, p: { cards: unknown[] }) => n + p.cards.length, 0);
    expect((await accounts.collection('alice-id')).reduce((n, c) => n + c.count, 0)).toBe(total);
  });

  it('refuses ten Collector Boosters it can’t afford, and other counts', async () => {
    const { accounts, call } = await withAccounts();
    expect((await call('token-alice', '/api/packs/open', 'POST', { kind: 'collector', count: 10 })).status).toBe(402);
    expect(accounts.accounts.get('alice-id')!.shards).toBe(FIRST_DAY_SHARDS);
    expect(await accounts.collection('alice-id')).toEqual([]);
    for (const count of [0, 2, 11, -10, '10']) expect((await call('token-alice', '/api/packs/open', 'POST', { kind: 'play', count })).status).toBe(400);
  });
});

describe('the Store', () => {
  type Prices = { chocoboTrackLegendary: number | null; chocoboTrackOther: number | null; chocoboTrackLandBundle: number | null };
  const prices = ECONOMY.storePrices as Prices;
  const saved = { ...prices };
  afterEach(() => Object.assign(prices, saved));
  type Item = { key: string; name: string; line: string; price: number | null; cards: { id: string; finish: string }[] };

  it('lists each set’s items: 20 Chocobo Track foils on their own and the 5 lands as one bundle', async () => {
    const { call } = await withAccounts();
    const { sets } = await (await call('token-alice', '/api/store')).json();
    expect(sets.map((s: { name: string; ready: boolean }) => [s.name, s.ready])).toEqual([
      ['Final Fantasy', true],
      ['Edge of Eternities', false],
    ]);
    const items: Item[] = sets[0].items;
    const singles = items.filter((i) => i.line === 'Chocobo Track foil');
    expect(singles).toHaveLength(20);
    expect(singles.every((i) => i.line === 'Chocobo Track foil' && i.cards[0]!.finish === 'foil')).toBe(true);
    expect(singles.find((i) => i.name === 'Cloud, Midgar Mercenary')!.price).toBe(prices.chocoboTrackLegendary);
    expect(singles.find((i) => i.name === 'Traveling Chocobo')!.price).toBe(prices.chocoboTrackOther);
    const bundle = items.find((i) => i.key === 'fin-chocobo-track-lands')!;
    expect(bundle.cards).toHaveLength(5);
    expect(bundle.price).toBe(prices.chocoboTrackLandBundle);
    expect(sets[1].items).toEqual([]);
  });

  it('buying charges once and adds the card; the bundle adds all five lands', async () => {
    const { accounts, call } = await withAccounts();
    // Enough for the bundle but not a legendary afterwards.
    accounts.apply('alice-id', 1000 - FIRST_DAY_SHARDS, 'admin_adjustment', 'set-balance');
    const { sets } = await (await call('token-alice', '/api/store')).json();
    const items: Item[] = sets[0].items;
    const bundle = items.find((i) => i.key === 'fin-chocobo-track-lands')!;
    const r = await call('token-alice', '/api/store/buy', 'POST', { key: bundle.key, price: 1 });
    expect(r.status).toBe(200);
    expect((await r.json()).balance).toBe(1000 - bundle.price!);
    expect((await accounts.collection('alice-id')).map((c) => c.id).sort()).toEqual(bundle.cards.map((c) => c.id).sort());
    // Not enough left for a legendary: refused, nothing added.
    const legend = items.find((i) => i.price === prices.chocoboTrackLegendary)!;
    expect((await call('token-alice', '/api/store/buy', 'POST', { key: legend.key })).status).toBe(402);
    expect(await accounts.collection('alice-id')).toHaveLength(5);
    expect((await call('token-alice', '/api/store/buy', 'POST', { key: 'not-for-sale' })).status).toBe(400);
  });

  it('nothing can be bought without a price', async () => {
    prices.chocoboTrackOther = null;
    const { accounts, call } = await withAccounts();
    const { sets } = await (await call('token-alice', '/api/store')).json();
    const item = (sets[0].items as Item[]).find((i) => i.name === 'Traveling Chocobo')!;
    expect(item.price).toBeNull();
    expect((await call('token-alice', '/api/store/buy', 'POST', { key: item.key })).status).toBe(400);
    expect(accounts.accounts.get('alice-id')!.shards).toBe(FIRST_DAY_SHARDS);
  });
});

describe('basic land printings in decks', () => {
  it('a deck may use any number of a basic land printing you own one copy of, and only of that land type', async () => {
    const { BOOSTER_CARDS } = await import('@nexus/cards/boosters');
    const track = (name: string) => BOOSTER_CARDS.find((c) => c.name === name && c.promoTypes?.includes('chocobotrackfoil'))!.id;
    const plains = track('Plains');
    const island = track('Island');
    const { accounts, call } = await withAccounts();
    await accounts.grantCards('alice-id', { kind: 'store_purchase', ref: 'lands', cost: 0, cards: [{ id: plains, finish: 'foil', count: 1 }] });
    const base = { name: 'Lands', format: 'limited', cards: [], basics: { W: 40, U: 0, B: 0, R: 0, G: 0 } };
    expect((await call('token-alice', '/api/decks', 'POST', { ...base, basics: { ...base.basics, printings: { W: { id: plains, finish: 'foil' } } } })).status).toBe(200);
    // Not owned (the Island), not owned in that finish, or the wrong land type: refused.
    expect((await call('token-alice', '/api/decks', 'POST', { ...base, basics: { ...base.basics, printings: { U: { id: island, finish: 'foil' } } } })).status).toBe(400);
    expect((await call('token-alice', '/api/decks', 'POST', { ...base, basics: { ...base.basics, printings: { W: { id: plains, finish: 'nonfoil' } } } })).status).toBe(400);
    await accounts.grantCards('alice-id', { kind: 'store_purchase', ref: 'island', cost: 0, cards: [{ id: island, finish: 'foil', count: 1 }] });
    const wrong = await call('token-alice', '/api/decks', 'POST', { ...base, basics: { ...base.basics, printings: { W: { id: island, finish: 'foil' } } } });
    expect(wrong.status).toBe(400);
    expect((await wrong.json()).error).toMatch(/not a basic Plains/);
  });
});

describe('Secret Lairs in the Store', () => {
  type Item = { key: string; name: string; line: string; price: number | null; cards: { id: string; finish: string }[] };
  it('sells the three FINAL FANTASY drops (5 cards and a foil bonus) and every Secret Lair card on its own', async () => {
    const { call } = await withAccounts();
    const items: Item[] = (await (await call('token-alice', '/api/store')).json()).sets[0].items;
    const drops = items.filter((i) => i.key.startsWith('sld-drop-'));
    expect(drops.map((d) => d.name)).toEqual([
      'Secret Lair x FINAL FANTASY: Game Over',
      'Secret Lair x FINAL FANTASY: Weapons',
      'Secret Lair x FINAL FANTASY: Grimoire',
    ]);
    for (const d of drops) {
      expect(d.cards).toHaveLength(6);
      expect(d.cards.slice(0, 5).every((c) => c.finish === 'nonfoil')).toBe(true);
      expect(d.cards[5]!.finish).toBe('foil');
      expect(d.price).toBe(ECONOMY.storePrices.secretLairDrop);
    }
    const singles = items.filter((i) => i.line.startsWith('Secret Lair') && !i.key.startsWith('sld-drop-'));
    expect(singles).toHaveLength(24);
    expect(singles.every((i) => i.price === ECONOMY.storePrices.secretLairSingle)).toBe(true);
  });

  it('buying a drop adds all six cards at once', async () => {
    const { accounts, call } = await withAccounts();
    accounts.apply('alice-id', 5000, 'admin_adjustment', 'test-shards');
    const items: Item[] = (await (await call('token-alice', '/api/store')).json()).sets[0].items;
    const drop = items.find((i) => i.key.startsWith('sld-drop-'))!;
    expect((await call('token-alice', '/api/store/buy', 'POST', { key: drop.key })).status).toBe(200);
    expect((await accounts.collection('alice-id')).length).toBe(6);
  });
});

describe('precons in the Store', () => {
  it('sells the four precons; buying one adds its 100 cards and saves it as a Commander deck', async () => {
    const { accounts, call } = await withAccounts();
    accounts.apply('alice-id', 5000, 'admin_adjustment', 'test-shards');
    type Item = { key: string; price: number | null; deck?: { name: string; commander: string } };
    const items: Item[] = (await (await call('token-alice', '/api/store')).json()).sets[0].items;
    const precons = items.filter((i) => i.deck);
    expect(precons).toHaveLength(4);
    expect(precons.every((p) => p.price === ECONOMY.storePrices.precon)).toBe(true);
    const r = await call('token-alice', '/api/store/buy', 'POST', { key: precons[0]!.key });
    expect(r.status).toBe(200);
    expect((await accounts.collection('alice-id')).reduce((n, c) => n + c.count, 0)).toBe(100);
    const decks = (await (await call('token-alice', '/api/decks')).json()).decks;
    expect(decks).toHaveLength(1);
    expect(decks[0]).toMatchObject({ format: 'commander', commander: precons[0]!.deck!.commander });
  });
});
