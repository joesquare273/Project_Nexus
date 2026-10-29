// The collection browser (docs/packs.md): owned / unowned / all, and sorting
// by collector number, mana value, name, or color in WUBRG order.

import { describe, expect, it } from 'vitest';
import { BOOSTER_CARDS } from '@nexus/cards/boosters';
import { browse, colorRank, finishText, manaValueOf, PRECON_CARDS } from '../src/packs/browse.ts';
import type { Collection } from '../src/packs/collection.ts';

const main = BOOSTER_CARDS.filter((c) => c.set === 'fin' && c.booster);
const [first, second] = main;
const collection: Collection = { cards: { [first!.id]: { nonfoil: 2, foil: 1 }, [second!.id]: { surge: 1 } } };

describe('collection browser', () => {
  it('shows owned, unowned or all cards', () => {
    expect(browse(main, collection, 'all', 'number')).toHaveLength(main.length);
    expect(browse(main, collection, 'owned', 'number').map((c) => c.id)).toEqual([first!.id, second!.id]);
    expect(browse(main, collection, 'unowned', 'number')).toHaveLength(main.length - 2);
  });

  it('sorts by mana value, name, and color in WUBRG order with lands last', () => {
    const byValue = browse(main, collection, 'all', 'manaValue').map(manaValueOf);
    expect(byValue).toEqual([...byValue].sort((a, b) => a - b));
    const names = browse(main, collection, 'all', 'name').map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    const ranks = browse(main, collection, 'all', 'color').map(colorRank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    const mono = (color: string) => main.find((c) => c.colors.length === 1 && c.colors[0] === color && !/Land/.test(c.typeLine))!;
    expect(['W', 'U', 'B', 'R', 'G'].map((k) => colorRank(mono(k)))).toEqual([0, 1, 2, 3, 4]);
    const land = main.find((c) => /Basic Land/.test(c.typeLine))!;
    expect(colorRank(land)).toBe(8);
  });

  it('describes the finishes owned', () => {
    expect(finishText(collection, first!.id)).toBe('2 nonfoil, 1 foil');
    expect(finishText(collection, second!.id)).toBe('1 surge foil');
  });

  it('lists the precons’ printings, with colors and mana values from their definitions', () => {
    expect(PRECON_CARDS.length).toBeGreaterThan(200);
    const cloud = PRECON_CARDS.find((c) => c.name === 'Cloud, Ex-SOLDIER')!;
    expect(manaValueOf(cloud)).toBeGreaterThan(0);
    expect(colorRank(cloud)).toBe(5);
  });
});
