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
