import { describe, expect, it } from 'vitest';
import { FREE_FOR_ALL, PUBLIC_ZONES, createGame, filterEventsFor, viewFor } from '../src/index.ts';
import { DEFS, newGame, playerIds, put } from './helpers.ts';

describe.each([2, 3, 4])('hidden information with %i players', (n) => {
  const s = newGame(n, { raw: true });

  it('shows your own hand and only counts for everyone else', () => {
    for (const viewer of playerIds(n)) {
      const view = viewFor(s, viewer);
      for (const pid of playerIds(n)) {
        const p = view.players[pid]!;
        expect(p.handCount).toBe(7);
        expect(p.libraryCount).toBe(23);
        if (pid === viewer) expect(p.hand).toEqual(s.players[pid]!.hand);
        else expect(p.hand).toBeUndefined();
      }
    }
  });

  it('only includes cards the viewer may see', () => {
    for (const viewer of playerIds(n)) {
      for (const c of Object.values(viewFor(s, viewer).cards)) {
        const allowed = PUBLIC_ZONES.includes(c.zone) || (c.zone === 'hand' && c.owner === viewer);
        expect(allowed).toBe(true);
      }
    }
  });

  it('never sends the random generator state', () => {
    expect(JSON.stringify(viewFor(s, 'P1'))).not.toContain('rngState');
  });
});

describe('event filtering', () => {
  it('hides which card another player drew, but not that they drew', () => {
    const drawn = { type: 'CardDrawn' as const, player: 'P2', card: 'c1', defId: 'island' };
    expect(filterEventsFor([drawn], 'P1')).toEqual([{ type: 'CardDrawn', player: 'P2' }]);
    expect(filterEventsFor([drawn], 'P2')).toEqual([drawn]);
  });

  it('never leaks another player’s opening hand in a real game log', () => {
    const { events, state } = createGame({
      format: FREE_FOR_ALL,
      cardDefs: DEFS,
      seed: 5,
      players: playerIds(4).map((id) => ({ id, deck: Array(30).fill('bear') })),
      skipDeckValidation: true,
    });
    for (const viewer of playerIds(4)) {
      const othersHands = new Set(playerIds(4).filter((p) => p !== viewer).flatMap((p) => state.players[p]!.hand));
      const text = JSON.stringify(filterEventsFor(events, viewer));
      for (const id of othersHands) expect(text).not.toContain(`"${id}"`);
    }
  });

  it('hides hand-to-library moves of other players’ cards and reveals public moves', () => {
    const hidden = { type: 'CardMoved' as const, card: 'c9', defId: 'bear', owner: 'P2', from: 'hand' as const, to: 'library' as const };
    const cast = { ...hidden, from: 'hand' as const, to: 'stack' as const };
    expect(filterEventsFor([hidden], 'P1')).toEqual([{ type: 'CardMoved', owner: 'P2', from: 'hand', to: 'library' }]);
    expect(filterEventsFor([cast], 'P1')).toEqual([cast]);
  });

  it('shows permanents to everyone once they are on the battlefield', () => {
    const s = newGame(3);
    const bear = put(s, 'P2', 'bear');
    expect(viewFor(s, 'P1').cards[bear]).toBeDefined();
  });
});

describe('cards revealed from hand', () => {
  it('stay face up to everyone while they remain in hand, and hide again once they move', async () => {
    const { AliasBook, playerUpdate } = await import('../src/index.ts');
    const { moveCard } = await import('../src/state.ts');
    const s = newGame(3, { raw: true });
    const [shown, kept] = s.players.P2!.hand;
    s.cards[shown!]!.revealedInHand = true;
    for (const viewer of ['P1', 'P3']) {
      const view = viewFor(s, viewer);
      expect(view.players.P2!.revealedHand).toEqual([shown]);
      expect(view.players.P2!.handCount).toBe(7);
      expect(view.cards[shown!]?.defId).toBe(s.cards[shown!]!.defId);
      expect(view.cards[kept!]).toBeUndefined();
      // Online: the redacted update carries the revealed card (under an alias) and nothing else from that hand.
      let n = 0;
      const u = playerUpdate(s, viewer, new AliasBook(() => `a${n++}`));
      expect(u.view.players.P2!.revealedHand).toHaveLength(1);
      expect(Object.values(u.view.cards).filter((c) => c.zone === 'hand' && c.owner === 'P2').map((c) => c.defId)).toEqual([s.cards[shown!]!.defId]);
    }
    expect(viewFor(s, 'P2').players.P2!.revealedHand).toBeUndefined();
    moveCard({ s, ev: [] }, shown!, 'library');
    expect(s.cards[shown!]!.revealedInHand).toBeUndefined();
    moveCard({ s, ev: [] }, shown!, 'hand');
    expect(viewFor(s, 'P1').players.P2!.revealedHand).toBeUndefined();
    expect(viewFor(s, 'P1').cards[shown!]).toBeUndefined();
  });
});
