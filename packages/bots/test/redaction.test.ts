// Hidden information over the network: in fuzzed games with every Starter
// Kit and precon deck, 2 to 4 players, everything each player would be sent
// after every action is checked for anything they mustn't know.

import { describe, expect, it } from 'vitest';
import {
  AliasBook,
  COMMANDER,
  FREE_FOR_ALL,
  PUBLIC_ZONES,
  applyAction,
  createGame,
  getLegalActions,
  playerUpdate,
  resolveAction,
  viewFor,
  type GameEvent,
  type GameSetup,
  type GameState,
  type InstanceId,
  type PlayerId,
} from '@nexus/engine';
import { CARD_DEFS, FIN_PRECONS, preconDeck, starterKitDeck } from '@nexus/cards';
import { basicAi, makeRng, randomBot, type Bot } from '../src/index.ts';
import { newGame, put } from './kit-helpers.ts';

const RAT = 'undercity-dire-rat';

const TIMEOUT_MS = 600_000;

/** Seeded aliases, so failures repeat. */
function book(seed: number): AliasBook {
  const rand = makeRng(seed);
  return new AliasBook(() => 'a' + Math.floor(rand() * 36 ** 10).toString(36).padStart(10, '0'));
}

function starterSetup(players: number, seed: number): GameSetup {
  return {
    format: FREE_FOR_ALL,
    cardDefs: CARD_DEFS,
    seed,
    players: Array.from({ length: players }, (_, i) => ({ id: `P${i + 1}`, deck: starterKitDeck((i + seed) % 2 ? 'UB' : 'RW') })),
    mulligans: true,
  };
}

function commanderSetup(players: number, seed: number): GameSetup {
  // Rotate through the four precons so every deck plays at every table size.
  const decks = Array.from({ length: players }, (_, i) => preconDeck(FIN_PRECONS[(i + seed) % FIN_PRECONS.length]!.name));
  return { format: COMMANDER, cardDefs: CARD_DEFS, seed, players: decks.map((d, i) => ({ id: `P${i + 1}`, ...d })), mulligans: true };
}

/**
 * What `viewer` may see, written out here independently of the engine's own
 * visibleCards, so a mistake there can't hide itself from this test:
 * public zones (except face-down exile), your own hand, the cards you're
 * looking at for a decision, and your library's top card while an effect
 * lets you look at it (Summoning Materia).
 */
function allowedToSee(s: GameState, viewer: PlayerId): Set<InstanceId> {
  const out = new Set<InstanceId>();
  const p = s.pending;
  const looking: InstanceId[] =
    (p.kind === 'surveil' || p.kind === 'exileTop') && p.player === viewer ? [p.card] : (p.kind === 'chooseCards' || p.kind === 'chooseLegend') && p.player === viewer ? p.cards : [];
  const materia = s.turnOrder.some((pid) =>
    s.players[pid]!.battlefield.some((id) => s.cards[id]!.controller === viewer && s.cardDefs[s.cards[id]!.defId]!.lookAtLibraryTop),
  );
  for (const c of Object.values(s.cards)) {
    if (c.zone === 'exile' && c.foretoldTurn !== undefined && c.owner !== viewer) continue;
    if (c.zone === 'exile' && c.linkedExile && !c.linkedExile.lookers.includes(viewer)) continue;
    if (['battlefield', 'graveyard', 'exile', 'stack', 'command'].includes(c.zone)) out.add(c.id);
    else if (c.zone === 'hand' && c.owner === viewer) out.add(c.id);
    else if (looking.includes(c.id)) out.add(c.id);
    else if (c.zone === 'library' && materia && s.players[viewer]!.library[0] === c.id) out.add(c.id);
  }
  return out;
}

/** Cards `viewer` legitimately saw during these events: public moves, casts, reveals, new tokens, their own draws. */
function seenInEvents(events: readonly GameEvent[], viewer: PlayerId): Set<InstanceId> {
  const seen = new Set<InstanceId>();
  for (const e of events) {
    if (e.type === 'CardMoved' && e.card && (PUBLIC_ZONES.includes(e.from) || PUBLIC_ZONES.includes(e.to))) seen.add(e.card);
    if (e.type === 'CardMoved' && e.card && e.visibleTo?.includes(viewer)) seen.add(e.card);
    if ((e.type === 'SpellCast' || e.type === 'CardRevealed' || e.type === 'TokenCreated' || e.type === 'CreatureDied' || e.type === 'PermanentDestroyed' || e.type === 'SpellCountered') && e.card) seen.add(e.card);
    if (e.type === 'CardDrawn' && e.player === viewer && e.card) seen.add(e.card);
    if (e.type === 'FaceDownExiled' && e.player === viewer && e.card) seen.add(e.card);
    if (e.type === 'Foretold' && e.player === viewer) seen.add(e.card);
  }
  return seen;
}

/** Every string in a JSON value. */
function strings(value: unknown, out = new Set<string>()): Set<string> {
  if (typeof value === 'string') out.add(value);
  else if (Array.isArray(value)) for (const v of value) strings(v, out);
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) (out.add(k), strings(v, out));
  return out;
}

interface Checked {
  messages: number;
  hiddenChecks: number;
}

/** Plays one game, checking every player's message after every action. */
function playChecked(setup: GameSetup, bots: Record<PlayerId, Bot>, maxActions: number, seed: number): Checked {
  let { state, events } = createGame(setup);
  const books = Object.fromEntries(state.turnOrder.map((pid, i) => [pid, book(seed * 31 + i)]));
  let visibleBefore = Object.fromEntries(state.turnOrder.map((pid) => [pid, new Set<InstanceId>()]));
  const checked: Checked = { messages: 0, hiddenChecks: 0 };
  const allIds = Object.keys(state.cards);

  const check = (prev: GameState | null, s: GameState, evs: readonly GameEvent[]) => {
    for (const viewer of s.turnOrder) {
      const update = playerUpdate(s, viewer, books[viewer]!, evs);
      const json = JSON.stringify(update);
      const sent = strings(update);
      checked.messages++;

      // 1. No real card id, anywhere.
      for (const id of Object.keys(s.cards)) if (sent.has(id)) throw new Error(`${viewer} was sent the real id ${id} (${s.cards[id]!.defId})`);
      void allIds;

      // 2. No hidden card's definition, unless the card was legitimately seen.
      const visibleNow = allowedToSee(s, viewer);
      const seen = new Set([...visibleNow, ...visibleBefore[viewer]!, ...seenInEvents(evs, viewer)]);
      const legit = new Set<string>();
      for (const id of seen) for (const str of strings(s.cards[id])) legit.add(str);
      for (const c of Object.values(s.cards)) if (c.isCommander || c.isToken) legit.add(c.defId);
      for (const c of Object.values(s.cards)) {
        if (seen.has(c.id) || legit.has(c.defId)) continue;
        checked.hiddenChecks++;
        if (sent.has(c.defId)) {
          throw new Error(`${viewer} was sent ${c.defId}, hidden in ${c.owner}'s ${c.zone} (turn ${s.turnNumber}, ${s.step}): ${json.slice(Math.max(0, json.indexOf(c.defId) - 200), json.indexOf(c.defId) + 100)}`);
        }
      }

      // 3. Legal actions never point at hidden cards, and translate back exactly.
      if (update.legal.length > 0) {
        expect(JSON.stringify(update.legal)).not.toMatch(/"\?/);
        const real = getLegalActions(s);
        expect(update.legal.length).toBe(real.length);
        update.legal.slice(0, 40).forEach((a, i) => expect(resolveAction(a, books[viewer]!)).toEqual(real[i]));
      }

      // 4. The view built from the redacted state shows the same permanents as the real one.
      const realView = viewFor(s, viewer);
      for (const [id, stats] of Object.entries(realView.stats)) {
        const alias = books[viewer]!.alias(id);
        expect(update.view.stats[alias]?.power, `${s.cards[id]!.defId} power`).toBe(stats.power);
        expect(update.view.stats[alias]?.toughness).toBe(stats.toughness);
        expect([...(update.view.stats[alias]?.keywords ?? [])].sort()).toEqual([...stats.keywords].sort());
      }
      expect(update.view.players[viewer]!.hand?.length ?? 0).toBe(s.players[viewer]!.hand.length);
      for (const pid of s.turnOrder) {
        expect(update.state.players[pid]!.library.length).toBe(s.players[pid]!.library.length);
        expect(update.state.players[pid]!.hand.length).toBe(s.players[pid]!.hand.length);
      }
      visibleBefore[viewer] = visibleNow;
    }
    void prev;
  };

  check(null, state, events);
  for (let n = 0; n < maxActions && state.pending.kind !== 'gameOver'; n++) {
    const legal = getLegalActions(state);
    const action = bots[(state.pending as { player: PlayerId }).player]!(state, legal);
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(r.error);
    const prev = state;
    state = r.state;
    events = r.events;
    check(prev, state, events);
  }
  return checked;
}

const seats = (players: number, make: (seed: number) => Bot, seed: number) =>
  Object.fromEntries(Array.from({ length: players }, (_, i) => [`P${i + 1}`, make(seed * 7 + i)]));

describe.each([2, 3, 4])('hidden information, %i players', (players) => {
  it('Starter Kits: nothing hidden is ever sent', () => {
    let messages = 0, hiddenChecks = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const make = seed % 2 ? randomBot : basicAi;
      const r = playChecked(starterSetup(players, seed), seats(players, make, seed), 700, seed);
      messages += r.messages;
      hiddenChecks += r.hiddenChecks;
    }
    expect(messages).toBeGreaterThan(1000);
    expect(hiddenChecks).toBeGreaterThan(10_000);
  }, TIMEOUT_MS);

  it('Commander precons: nothing hidden is ever sent', () => {
    let messages = 0;
    // Enough seeds that each precon sits at each table size.
    for (let seed = 1; seed <= 4; seed++) {
      const make = seed % 2 ? randomBot : basicAi;
      messages += playChecked(commanderSetup(players, seed), seats(players, make, seed), 400, seed).messages;
    }
    expect(messages).toBeGreaterThan(1000);
  }, TIMEOUT_MS);
});

describe('aliases', () => {
  it('a card that goes back to a hand gets a new alias for the other players when it comes back', () => {
    let { state } = createGame(starterSetup(2, 3));
    const books = { P1: book(1), P2: book(2) };
    // Put one of P1's hand cards onto the battlefield, then back to hand, then onto the battlefield again.
    const id = state.players.P1!.hand[0]!;
    const moveTo = (zone: 'battlefield' | 'hand') => {
      const s = structuredClone(state);
      const from = s.cards[id]!.zone;
      s.players.P1![from as 'hand' | 'battlefield'].splice(s.players.P1![from as 'hand' | 'battlefield'].indexOf(id), 1);
      s.players.P1![zone].push(id);
      s.cards[id]!.zone = zone;
      state = s;
      return playerUpdate(s, 'P2', books.P2, [{ type: 'CardMoved', card: id, defId: s.cards[id]!.defId, owner: 'P1', from, to: zone } as GameEvent]);
    };
    playerUpdate(state, 'P2', books.P2);
    const first = moveTo('battlefield');
    const firstAlias = first.state.players.P1!.battlefield.at(-1)!;
    const back = moveTo('hand');
    // The event that hides it still uses the alias P2 knew.
    expect(back.events[0]).toMatchObject({ type: 'CardMoved', card: firstAlias, to: 'hand' });
    expect(back.state.cards[firstAlias]).toBeUndefined();
    const again = moveTo('battlefield');
    expect(again.state.players.P1!.battlefield.at(-1)).not.toBe(firstAlias);
    // P1, who saw it in hand all along, keeps one alias.
    const p1 = playerUpdate(state, 'P1', books.P1);
    expect(p1.state.players.P1!.battlefield.at(-1)).toBe(books.P1.alias(id));
  });

  it('hidden placeholders are renumbered in every message and carry no definition', () => {
    const { state } = createGame(starterSetup(2, 4));
    const b = book(9);
    const a = playerUpdate(state, 'P1', b);
    const c = playerUpdate(state, 'P1', b);
    const opp = a.state.players.P2!.hand;
    expect(opp.every((x) => x.startsWith('?h'))).toBe(true);
    expect(opp).toEqual(c.state.players.P2!.hand); // positional, so they carry no identity
    for (const x of opp) expect(a.state.cards[x]!.defId).toBe('?hidden');
    // Libraries are placeholders for everyone, even their owner.
    expect(a.state.players.P1!.library.every((x) => x.startsWith('?h'))).toBe(true);
    expect('rngState' in a.state).toBe(false);
    expect('cardDefs' in a.state).toBe(false);
  });
});

describe('private looks and face-down cards', () => {
  const views = (s: GameState) => ({ p1: playerUpdate(s, 'P1', book(1)), p2: playerUpdate(s, 'P2', book(2)) });
  const sentTo = (u: ReturnType<typeof playerUpdate>) => strings(u);

  it('a foretold card is seen by its owner only', () => {
    const s = newGame(2);
    const card = put(s, 'P1', 'sephiroths-intervention', 'exile', { foretoldTurn: 1 });
    const { p1, p2 } = views(s);
    expect(sentTo(p1).has('sephiroths-intervention')).toBe(true);
    expect(sentTo(p2).has('sephiroths-intervention')).toBe(false);
    expect(p2.state.players.P1!.exile[0]).toMatch(/^\?h/);
    expect(sentTo(p2).has(card)).toBe(false);
  });

  it('face-down linked exile is seen by its lookers only', () => {
    const s = newGame(3);
    put(s, 'P2', 'sephiroths-intervention', 'exile', { linkedExile: { source: 'x', sourceObject: 0, lookers: ['P1'] } });
    expect(sentTo(playerUpdate(s, 'P1', book(1))).has('sephiroths-intervention')).toBe(true);
    expect(sentTo(playerUpdate(s, 'P2', book(2))).has('sephiroths-intervention')).toBe(false);
    expect(sentTo(playerUpdate(s, 'P3', book(3))).has('sephiroths-intervention')).toBe(false);
  });

  it("Summoning Materia: its controller sees their library's top card; nobody else does", () => {
    const s = newGame(2);
    const host = put(s, 'P1', RAT);
    put(s, 'P1', 'summoning-materia', 'battlefield', { attachedTo: host });
    const top = put(s, 'P1', 'sephiroths-intervention', 'library');
    const { p1, p2 } = views(s);
    expect(p1.state.players.P1!.library[0]).not.toMatch(/^\?/);
    expect(p1.view.players.P1!.libraryTop).toBe(p1.state.players.P1!.library[0]);
    expect(sentTo(p1).has('sephiroths-intervention')).toBe(true);
    expect(p1.state.players.P1!.library.slice(1).every((x) => x.startsWith('?h'))).toBe(true);
    expect(sentTo(p2).has('sephiroths-intervention')).toBe(false);
    expect(sentTo(p2).has(top)).toBe(false);
  });

  it("another player's surveil or scry look is hidden", () => {
    const s = newGame(2);
    const card = put(s, 'P1', 'sephiroths-intervention', 'library');
    s.pending = { kind: 'surveil', player: 'P1', card };
    const { p1, p2 } = views(s);
    expect(p1.state.pending).toMatchObject({ kind: 'surveil', card: p1.state.players.P1!.library[0] });
    expect(sentTo(p1).has('sephiroths-intervention')).toBe(true);
    expect(p2.state.pending).toMatchObject({ kind: 'surveil', card: '?' });
    expect(sentTo(p2).has('sephiroths-intervention')).toBe(false);
  });

  it('a choice among library cards (hideaway) is seen by the chooser only, and queued choices by nobody yet', () => {
    const s = newGame(2);
    const a = put(s, 'P1', 'sephiroths-intervention', 'library');
    const b = put(s, 'P1', 'fight-rigging', 'library');
    s.pending = { kind: 'chooseCards', player: 'P1', purpose: 'hideaway', cards: [a, b], min: 1, max: 1 };
    let { p1, p2 } = views(s);
    expect(sentTo(p1).has('sephiroths-intervention') && sentTo(p1).has('fight-rigging')).toBe(true);
    expect(p2.state.pending).toMatchObject({ kind: 'chooseCards', cards: ['?', '?'] });
    expect(sentTo(p2).has('fight-rigging')).toBe(false);
    // The same cards queued for a later choice inside a resolving ability: nobody sees them yet.
    s.pending = { kind: 'priority', player: 'P1', passes: 0 };
    s.resolving = { item: { id: 's1', kind: 'ability', source: a, from: 'activated', ability: 0, sourceZone: 'library', controller: 'P1', targets: [] } as never, next: 0, chosenUsed: 0, createdTokens: [], surveilQueue: [b], choiceQueue: [{ player: 'P1', purpose: 'hideaway', cards: [a, b], min: 1, max: 1 }] };
    ({ p1, p2 } = views(s));
    for (const u of [p1, p2]) {
      expect(u.state.resolving!.choiceQueue![0]!.cards).toEqual(['?', '?']);
      expect(u.state.resolving!.surveilQueue).toEqual(['?']);
      expect(sentTo(u).has('fight-rigging')).toBe(false);
    }
  });
});
