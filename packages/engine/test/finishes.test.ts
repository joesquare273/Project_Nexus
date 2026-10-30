// Card finishes (docs/packs.md): a deck's finishes reach its cards in a game,
// they're public (every player sees a foil once it's visible), and they have
// no effect on the rules.

import { describe, expect, it } from 'vitest';
import { AliasBook, FREE_FOR_ALL, createGame, playerUpdate } from '../src/index.ts';
import { DEFS } from './helpers.ts';

describe('card finishes', () => {
  const { state } = createGame({
    format: FREE_FOR_ALL,
    cardDefs: DEFS,
    seed: 7,
    players: [
      { id: 'P1', deck: Array(60).fill('island'), deckFinishes: Array(60).fill(undefined).map((_, i) => (i === 0 ? 'chocobotrack' : i < 5 ? 'foil' : undefined)) },
      { id: 'P2', deck: Array(60).fill('island') },
    ],
  });

  it('each card keeps the finish its deck gave it', () => {
    const mine = Object.values(state.cards).filter((c) => c.owner === 'P1');
    expect(mine.filter((c) => c.finish === 'chocobotrack')).toHaveLength(1);
    expect(mine.filter((c) => c.finish === 'foil')).toHaveLength(4);
    expect(mine.filter((c) => !c.finish)).toHaveLength(55);
    expect(Object.values(state.cards).filter((c) => c.owner === 'P2' && c.finish)).toHaveLength(0);
  });

  it('a visible card shows its finish to every player', () => {
    // Put a foil on the battlefield, where both players can see it.
    const s = structuredClone(state);
    const foil = Object.values(s.cards).find((c) => c.owner === 'P1' && c.finish === 'chocobotrack')!;
    for (const zone of ['library', 'hand'] as const) s.players.P1![zone] = s.players.P1![zone].filter((id) => id !== foil.id);
    foil.zone = 'battlefield';
    s.players.P1!.battlefield.push(foil.id);
    let n = 0;
    for (const viewer of ['P1', 'P2']) {
      const seen = Object.values(playerUpdate(s, viewer, new AliasBook(() => `a${n++}`)).state.cards).filter((c) => c.zone === 'battlefield');
      expect(seen.map((c) => c.finish)).toEqual(['chocobotrack']);
    }
  });
});
