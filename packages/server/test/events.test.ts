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
      schedule: (fn) => {
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
  it('one player and a bot: draft, the pool saved to the account, deckbuilding, a best-of-3 match', async () => {
    const { accounts, lobby } = setup();
    const joe = browser(lobby);
    await joe.send({ type: 'eventCreate', token: 'tok-joe', players: 1, bots: 1 });
    const code = joe.event()!.code;
    expect(joe.event()).toMatchObject({ phase: 'lobby', you: 'S1', host: 'S1' });
    await joe.send({ type: 'eventStart' });
    expect(joe.event()!.seats.map((s) => [s.name, s.bot])).toEqual([['Joe', false], ['Chocobo Bot', true]]);
    // Only your own pack is ever sent.
    expect(JSON.stringify(joe.event()).includes('"picks":[')).toBe(true);
    await draft(joe);
    expect(joe.event()!.phase).toBe('building');
    await until(() => !!joe.event()?.poolSaved, 'the pool to be saved');
    const owned = (await accounts.collection('u-joe')).reduce((n, c) => n + c.count, 0);
    expect(owned).toBe(84);
    // Building: save a deck, press Ready; the bot is ready already.
    const picks = joe.event()!.draft!.picks as DraftCard[];
    await joe.send({ type: 'eventDeck', deck: aiDeck(picks) });
    expect(joe.event()!.deck).not.toBeNull();
    await joe.send({ type: 'eventReady', ready: true });
    expect(joe.event()!.phase).toBe('playing');
    // Game 1 arrives as an ordinary online game update, for this match.
    await until(() => !!joe.game(), 'game 1');
    const match = joe.event()!.matches[0]!;
    expect(joe.game()).toMatchObject({ match: match.id, game: 1 });
    expect(joe.game()!.names[joe.game()!.seat]).toBe('Joe');
    await concede(joe);
    // Joe lost game 1, so Joe chooses play or draw.
    await until(() => joe.event()!.matches[0]!.games.length === 1, 'game 1 to be recorded');
    expect(joe.event()!.matches[0]!.chooser).toBe('S1');
    // Sideboarding between games: only a legal deck.
    await joe.send({ type: 'eventDeck', deck: { cards: [], basics: { W: 5, U: 0, B: 0, R: 0, G: 0 } } });
    expect(joe.errors().at(-1)).toMatchObject({ code: 'event-rule' });
    await joe.send({ type: 'eventPlayDraw', play: true });
    await until(() => joe.game()?.game === 2, 'game 2');
    await concede(joe);
    await until(() => joe.event()!.phase === 'finished', 'the event to finish');
    expect(joe.event()!.standings[0]).toMatchObject({ player: 'S2', points: 3 });
    // Coming back to the event after a reload shows it again.
    const again = browser(lobby);
    await again.send({ type: 'eventJoin', token: 'tok-joe', code });
    expect(again.event()).toMatchObject({ code, you: 'S1', phase: 'finished' });
    // The pool was granted once only.
    expect((await accounts.collection('u-joe')).reduce((n, c) => n + c.count, 0)).toBe(84);
  }, 120_000);

  it('a player and three bots: bot-vs-bot matches are played on the server; three Swiss rounds', async () => {
    const { lobby } = setup({ botGameLimit: 60 });
    const joe = browser(lobby);
    await joe.send({ type: 'eventCreate', token: 'tok-joe', players: 1, bots: 3 });
    await joe.send({ type: 'eventStart' });
    await draft(joe);
    await joe.send({ type: 'eventDeck', deck: aiDeck(joe.event()!.draft!.picks as DraftCard[]) });
    await joe.send({ type: 'eventReady', ready: true });
    for (let i = 0; i < 40 && joe.event()!.phase === 'playing'; i++) {
      const v = joe.event()!;
      const mine = v.matches.find((m) => m.round === v.round && (m.a === 'S1' || m.b === 'S1'))!;
      if (mine.done) await settle();
      else if (mine.chooser === 'S1') await joe.send({ type: 'eventPlayDraw', play: false });
      else if (mine.live && joe.game()?.match === mine.id && joe.game()!.update.state.pending.kind !== 'gameOver') await concede(joe);
      await until(() => true, 'a moment');
      await settle();
    }
    await until(() => joe.event()!.phase === 'finished', 'the event to finish', 20_000);
    const v = joe.event()!;
    expect(v.round).toBe(3);
    expect(v.matches.filter((m) => m.done)).toHaveLength(6);
    expect(v.standings.at(-1)).toMatchObject({ player: 'S1', points: 0 });
  }, 120_000);

  it('rules and errors: only the creator starts; unknown events; a full event', async () => {
    const { lobby } = setup();
    const joe = browser(lobby);
    const ann = browser(lobby);
    await joe.send({ type: 'eventCreate', token: 'tok-joe', players: 2, bots: 0 });
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
    // No bots needed: both seats are players.
    expect(joe.event()!.seats.every((s) => !s.bot)).toBe(true);
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
