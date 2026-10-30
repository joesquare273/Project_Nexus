// Saved decks start games (docs/packs.md): a saved deck becomes card
// definitions with their printings and finishes, its commander apart.

import { describe, expect, it } from 'vitest';
import { COMMANDER, createGame } from '@nexus/engine';
import { CARD_DEFS, FIN_PRECONS, SCRYFALL_PRINTINGS } from '../src/index.ts';
import { BOOSTER_CARDS } from '../src/boosters.ts';
import { gameDeck } from '../src/decks.ts';

/** A precon as the Store and the free starter save it: printing ids, the commander's printing. */
function savedPrecon(name: string) {
  const precon = FIN_PRECONS.find((p) => p.name === name)!;
  const id = (c: { set: string; number: string }) => SCRYFALL_PRINTINGS[`${c.set}/${c.number}`]!.scryfallId!;
  const counts = new Map<string, number>();
  for (const c of [precon.commander, ...precon.cards]) counts.set(id(c), (counts.get(id(c)) ?? 0) + c.count);
  return { cards: [...counts].map(([i, count]) => ({ id: i, finish: 'nonfoil' as const, count })), basics: { W: 0, U: 0, B: 0, R: 0, G: 0 }, commander: id(precon.commander) };
}

describe('saved decks start games', () => {
  it('a saved precon is a legal 100-card Commander deck with its commander in the command zone', () => {
    const name = FIN_PRECONS[0]!.name;
    const deck = gameDeck(savedPrecon(name));
    if ('problem' in deck) throw new Error(deck.problem);
    expect(deck.deck).toHaveLength(99);
    expect(deck.commander).toBeDefined();
    const { state } = createGame({
      format: COMMANDER,
      cardDefs: CARD_DEFS,
      seed: 1,
      players: [
        { id: 'P1', ...deck },
        { id: 'P2', ...(gameDeck(savedPrecon(FIN_PRECONS[1]!.name)) as Exclude<ReturnType<typeof gameDeck>, { problem: string }>) },
      ],
    });
    const command = Object.values(state.cards).filter((c) => c.owner === 'P1' && c.zone === 'command');
    expect(command.map((c) => c.defId)).toEqual([deck.commander]);
    expect(Object.values(state.cards).filter((c) => c.owner === 'P1' && c.printing).length).toBe(100);
  });

  it('a foil and a chosen basic land art come through, the rest use the default art', () => {
    const track = BOOSTER_CARDS.find((c) => c.name === 'Forest' && c.promoTypes?.includes('chocobotrackfoil'))!;
    const tifa = BOOSTER_CARDS.find((c) => c.name === 'Tifa Lockhart' && c.promoTypes?.includes('chocobotrackfoil'))!;
    const deck = gameDeck({ cards: [{ id: tifa.id, finish: 'foil', count: 1 }], basics: { W: 2, U: 0, B: 0, R: 0, G: 3, printings: { G: { id: track.id, finish: 'foil' } } } });
    if ('problem' in deck) throw new Error(deck.problem);
    expect(deck.deckFinishes.filter((f) => f === 'chocobotrack')).toHaveLength(4);
    expect(deck.deckPrintings.filter((p) => p === undefined)).toHaveLength(2);
    expect(gameDeck({ cards: [{ id: '00000000-0000-4000-8000-000000000000', finish: 'nonfoil', count: 1 }], basics: { W: 0, U: 0, B: 0, R: 0, G: 0 } })).toHaveProperty('problem');
  });
});
