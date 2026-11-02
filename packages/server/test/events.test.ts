// Draft events through the server's messages (S3b): one player with bots,
// from creating the event to the standings, with the pool saved to the account.
import { describe, expect, it } from 'vitest';
import { aiDeck } from '@nexus/cards/limited';
import type { DraftCard } from '@nexus/cards/draft';
import { MemoryAccounts } from '../src/accounts.ts';
import { Lobby, type Client } from '../src/rooms.ts';
import type { EventView, ServerMessage } from '../src/protocol.ts';

let clock = 1_000_000;

function setup(opts: { botGameLimit?: number } = {}) {
  const accounts = new MemoryAccounts();
  accounts.tokens.set('tok-joe', { id: 'u-joe', name: 'Joe' });
  accounts.tokens.set('tok-ann', { id: 'u-ann', name: 'Ann' });
  const lobby = new Lobby({
    accounts,
    events: {
      now: () => clock,
      // Everything runs on the next turn of the event loop.
      // Long waits (dropping a finished event after an hour) never come in a test.
      schedule: (fn, ms) => {
        if (ms >= 60_000 * 10) return () => {};
        const t = setTimeout(fn, 0);
        return () => clearTimeout(t);
      },
      botDelayMs: 0,
      ...(opts.botGameLimit ? { botGameLimit: opts.botGameLimit } : {}),
    },
  });
  return { accounts, lobby };
}

/** A browser: its messages, and helpers to read the latest event and game. */
function browser(lobby: Lobby) {
  const inbox: ServerMessage[] = [];
  const client: Client = lobby.connect({ send: (m) => inbox.push(structuredClone(m)) });
  const send = (m: object) => client.handle(JSON.stringify(m));
  const event = (): EventView | undefined => [...inbox].reverse().find((m): m is Extract<ServerMessage, { type: 'event' }> => m.type === 'event')?.event;
  const game = () => [...inbox].reverse().find((m): m is Extract<ServerMessage, { type: 'update' }> => m.type === 'update');
  const errors = () => inbox.filter((m) => m.type === 'error');
  return { inbox, client, send, event, game, errors };
}

const settle = () => new Promise((r) => setTimeout(r, 0));
async function until(check: () => boolean, what: string, tries = 4000) {
  for (let i = 0; i < tries; i++) {
    if (check()) return;
    await settle();
  }
  throw new Error(`Timed out waiting for ${what}`);
}

/** Picks the first card of every pack until the draft ends. */
async function draft(b: ReturnType<typeof browser>) {
  for (let i = 0; i < 200 && b.event()?.phase === 'drafting'; i++) {
    const v = b.event()!.draft!;
    if (v.pack && !v.locked) await b.send({ type: 'eventPick', uid: v.pack[0]!.uid });
    else await settle();
  }
}

/** Concedes the current game. */
async function concede(b: ReturnType<typeof browser>) {
  const g = b.game()!;
  await b.send({ type: 'actions', seq: Date.now() % 1e9 + Math.floor(Math.random() * 1000), version: g.version, actions: [{ type: 'Concede', player: g.seat }] });
}

describe('draft events on the server', () => {
  it('one player and three bots: the entry, the pool saved, deckbuilding, the bracket, the prize', async () => {
    const { accounts, lobby } = setup({ botGameLimit: 60 });
    const joe = browser(lobby);
    await joe.send({ type: 'eventCreate', token: 'tok-joe', players: 1, bots: 3, set: 'fin' });
    const code = joe.event()!.code;
    expect(joe.event()).toMatchObject({ phase: 'lobby', you: 'S1', host: 'S1', entry: 600, prizes: [1000, 800, 600, 400], entryPaid: false });
    const before = (await accounts.ensure({ id: 'u-joe', name: 'Joe' })).shards;
    await joe.send({ type: 'eventStart' });
    expect(joe.event()!.seats.map((s) => [s.name, s.bot])).toEqual([['Joe', false], ['Chocobo Bot', true], ['Moogle Bot', true], ['Cactuar Bot', true]]);
    // The entry is paid once, as the draft starts.
    expect(joe.event()).toMatchObject({ entryPaid: true, balance: before - 600 });
    expect(accounts.accounts.get('u-joe')!.shards).toBe(before - 600);
    await draft(joe);
    expect(joe.event()!.phase).toBe('building');
    await until(() => !!joe.event()?.poolSaved, 'the pool to be saved');
    expect((await accounts.collection('u-joe')).reduce((n, c) => n + c.count, 0)).toBe(84);
    // Building: save a deck, press Ready; the bots are ready already.
    await joe.send({ type: 'eventDeck', deck: aiDeck(joe.event()!.draft!.picks as DraftCard[]) });
    await joe.send({ type: 'eventReady', ready: true });
    expect(joe.event()!.phase).toBe('playing');
    // Game 1 arrives as an ordinary online game update, for Joe's semifinal.
    await until(() => !!joe.game(), 'game 1');
    const semi = joe.event()!.matches.find((m) => m.a === 'S1' || m.b === 'S1')!;
    expect(semi.stage).toBe('semifinal');
    expect(joe.game()).toMatchObject({ match: semi.id, game: 1 });
    await concede(joe);
    // Joe lost game 1, so Joe chooses play or draw; sideboarding takes only a legal deck.
    await until(() => joe.event()!.matches.find((m) => m.id === semi.id)!.games.length === 1, 'game 1 to be recorded');
    expect(joe.event()!.matches.find((m) => m.id === semi.id)!.chooser).toBe('S1');
    await joe.send({ type: 'eventDeck', deck: { cards: [], basics: { W: 5, U: 0, B: 0, R: 0, G: 0 } } });
    expect(joe.errors().at(-1)).toMatchObject({ code: 'event-rule' });
    // Joe concedes every game: he loses the semifinal, then the match for third.
    for (let i = 0; i < 200 && joe.event()!.phase === 'playing'; i++) {
      const v = joe.event()!;
      const mine = v.matches.find((m) => m.round === v.round && (m.a === 'S1' || m.b === 'S1'))!;
      if (!mine.done && mine.chooser === 'S1' && !mine.nextFirst) await joe.send({ type: 'eventPlayDraw', play: false });
      else if (!mine.done && mine.live && joe.game()?.match === mine.id && joe.game()!.update.state.pending.kind !== 'gameOver') await concede(joe);
      await settle();
    }
    await until(() => joe.event()!.phase === 'finished', 'the event to finish', 20_000);
    const v = joe.event()!;
    expect(v.matches.map((m) => m.stage)).toEqual(['semifinal', 'semifinal', 'final', 'third']);
    expect(v.places!.at(-1)).toBe('S1');
    expect(v.standings.map((s) => s.player)).toEqual(v.places);
    // Last place: 400 shards, once.
    await until(() => !!joe.event()?.prizePaid, 'the prize');
    expect(accounts.accounts.get('u-joe')!.shards).toBe(before - 600 + 400);
    // Coming back to the event after a reload shows it again; nothing is paid twice.
    const again = browser(lobby);
    await again.send({ type: 'eventJoin', token: 'tok-joe', code });
    expect(again.event()).toMatchObject({ code, you: 'S1', phase: 'finished' });
    await settle();
    expect(accounts.accounts.get('u-joe')!.shards).toBe(before - 200);
    expect((await accounts.collection('u-joe')).reduce((n, c) => n + c.count, 0)).toBe(84);
  }, 120_000);

  it('the entry: nobody without 600 shards can join, and nobody is charged unless everyone can pay', async () => {
    const { accounts, lobby } = setup();
    const joe = browser(lobby);
    const ann = browser(lobby);
    await joe.send({ type: 'eventCreate', token: 'tok-joe', players: 2, bots: 2, set: 'fin' });
    const code = joe.event()!.code;
    await accounts.ensure({ id: 'u-ann', name: 'Ann' });
    accounts.accounts.get('u-ann')!.shards = 599;
    await ann.send({ type: 'eventJoin', token: 'tok-ann', code });
    expect(ann.errors().at(-1)?.message).toMatch(/costs 600 Aether Shards to enter; you have 599/);
    accounts.accounts.get('u-ann')!.shards = 700;
    await ann.send({ type: 'eventJoin', token: 'tok-ann', code });
    expect(ann.event()!.you).toBe('S2');
    // Ann spends her shards in the lobby: the draft doesn't start, and Joe isn't charged.
    accounts.accounts.get('u-ann')!.shards = 100;
    const joeBefore = accounts.accounts.get('u-joe')!.shards;
    await joe.send({ type: 'eventStart' });
    expect(joe.errors().at(-1)?.message).toMatch(/Ann needs 600/);
    expect(joe.event()!.phase).toBe('lobby');
    expect(accounts.accounts.get('u-joe')!.shards).toBe(joeBefore);
    accounts.accounts.get('u-ann')!.shards = 600;
    await joe.send({ type: 'eventStart' });
    expect(joe.event()!.phase).toBe('drafting');
    expect(accounts.accounts.get('u-ann')!.shards).toBe(0);
    expect(accounts.accounts.get('u-joe')!.shards).toBe(joeBefore - 600);
  });

  it('rules and errors: only the creator starts; unknown events; a full event', async () => {
    const { lobby } = setup();
    const joe = browser(lobby);
    const ann = browser(lobby);
    // The host must pick a set the server can draft.
    await joe.send({ type: 'eventCreate', token: 'tok-joe', players: 2, bots: 2 });
    expect(joe.errors().at(-1)).toMatchObject({ code: 'bad-message' });
    await joe.send({ type: 'eventCreate', token: 'tok-joe', players: 2, bots: 2, set: 'xyz' });
    expect(joe.errors().at(-1)).toMatchObject({ code: 'bad-message' });
    // Four seats, always.
    await joe.send({ type: 'eventCreate', token: 'tok-joe', players: 2, bots: 0, set: 'fin' });
    expect(joe.errors().at(-1)?.message).toMatch(/4 seats/);
    await joe.send({ type: 'eventCreate', token: 'tok-joe', players: 2, bots: 2, set: 'fin' });
    expect(joe.event()!.set).toEqual({ code: 'fin', name: 'Final Fantasy' });
    // The draft waits for every player seat.
    await joe.send({ type: 'eventStart' });
    expect(joe.errors().at(-1)?.message).toMatch(/Waiting for 1 more player/);
    const code = joe.event()!.code;
    await ann.send({ type: 'eventJoin', token: 'tok-ann', code: 'NOPE1' });
    expect(ann.errors().at(-1)).toMatchObject({ code: 'no-event' });
    await ann.send({ type: 'eventJoin', token: 'tok-ann', code });
    expect(ann.event()).toMatchObject({ you: 'S2' });
    await ann.send({ type: 'eventStart' });
    expect(ann.errors().at(-1)).toMatchObject({ code: 'event-rule' });
    await ann.send({ type: 'eventPick', uid: 'd0' });
    expect(ann.errors().at(-1)).toMatchObject({ code: 'event-rule' });
    await joe.send({ type: 'eventStart' });
    expect(joe.event()!.seats.map((s) => s.bot)).toEqual([false, false, true, true]);
    // Each sees only their own pack.
    const joePack = joe.event()!.draft!.pack!.map((c) => c.uid);
    const annPack = ann.event()!.draft!.pack!.map((c) => c.uid);
    expect(joePack.some((u) => annPack.includes(u))).toBe(false);
    const third = browser(lobby);
    lobby.accounts!.verify = async (t) => (t === 'tok-x' ? { id: 'u-x', name: 'X' } : null);
    await third.send({ type: 'eventJoin', token: 'tok-x', code });
    expect(third.errors().at(-1)).toMatchObject({ code: 'event-full' });
  });
});
