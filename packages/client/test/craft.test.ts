// The Craft tab's display rules (the server applies the real ones).
import { describe, expect, it } from 'vitest';
import { ECONOMY } from '@nexus/server/economy';
import { NO_FRAGMENTS } from '@nexus/cards/crafting';
import { copiesOfCard, craftStatus, deckWarnings, listReward, listRoom, ownershipMatches, rewardFor, type ListEntry } from '../src/craft/craft.ts';
import type { Collection, SavedDeck } from '../src/packs/collection.ts';

const rules = ECONOMY.crafting;
const NO_BASICS = { W: 0, U: 0, B: 0, R: 0, G: 0 };

describe('Craft tab', () => {
  it('shows the dismantle reward, one more for a foil', () => {
    expect(rewardFor(rules, 'rare', 'nonfoil')).toBe(1);
    expect(rewardFor(rules, 'rare', 'foil')).toBe(2);
    expect(rewardFor(rules, 'mythic', 'surge')).toBe(2);
  });

  it('says why a card can’t be crafted', () => {
    expect(craftStatus(rules, { ...NO_FRAGMENTS, rare: 4 }, 'rare')).toEqual({ ok: true });
    // Mythic fragments don't pay for a rare.
    expect(craftStatus(rules, { ...NO_FRAGMENTS, rare: 1, mythic: 9 }, 'rare')).toEqual({ ok: false, reason: 'Needs 4 Rare Fragments (you have 1).' });
  });

  it('counts copies across arts and finishes, and warns about decks that use the copy', () => {
    const collection: Collection = { cards: { a: { nonfoil: 2, foil: 1 }, b: { nonfoil: 1 } } };
    expect(copiesOfCard(collection, ['a', 'b'])).toBe(4);
    const deck = (name: string, count: number): SavedDeck => ({ id: name, name, format: 'constructed', cards: [{ id: 'a', finish: 'nonfoil', count }], basics: NO_BASICS, commander: null, updatedAt: '' });
    // Two non-foil copies: a deck with two loses one; a deck with one keeps it.
    expect(deckWarnings([deck('Two', 2), deck('One', 1)], collection, 'a', 'nonfoil')).toEqual(['Two']);
    expect(deckWarnings([deck('Two', 2)], collection, 'a', 'foil')).toEqual([]);
  });

  it('filters the craftable cards by whether you own them', () => {
    expect([0, 1, 3].map((n) => ownershipMatches(n, 'owned'))).toEqual([false, true, true]);
    expect([0, 1].map((n) => ownershipMatches(n, 'unowned'))).toEqual([true, false]);
    expect([0, 1].map((n) => ownershipMatches(n, 'all'))).toEqual([true, true]);
  });

  it('the dismantle list: its fragments, and room for copies that keeps your last one', () => {
    const list: ListEntry[] = [
      { card: 'a', finish: 'nonfoil', count: 2, rarity: 'rare' },
      { card: 'a', finish: 'foil', count: 1, rarity: 'rare' },
      { card: 'c', finish: 'nonfoil', count: 3, rarity: 'common' },
    ];
    expect(listReward(rules, list)).toEqual({ ...NO_FRAGMENTS, rare: 2 * rules.dismantle.rare + rules.dismantle.rare + rules.foilBonus, common: 3 });
    const collection: Collection = { cards: { a: { nonfoil: 2, foil: 1 }, b: { nonfoil: 1 }, c: { nonfoil: 3 } } };
    // Card a/b (two arts): four copies, so three may go across both arts.
    expect(listRoom(collection, ['a', 'b'], [], 'a', 'nonfoil', true)).toBe(2);
    expect(listRoom(collection, ['a', 'b'], [{ card: 'a', finish: 'foil', count: 1, rarity: 'rare' }], 'a', 'nonfoil', true)).toBe(2);
    expect(listRoom(collection, ['a', 'b'], [{ card: 'a', finish: 'foil', count: 1, rarity: 'rare' }, { card: 'b', finish: 'nonfoil', count: 1, rarity: 'rare' }], 'a', 'nonfoil', true)).toBe(1);
    // One art only: all but one.
    expect(listRoom(collection, ['c'], [], 'c', 'nonfoil', true)).toBe(2);
    expect(listRoom(collection, ['c'], [], 'c', 'nonfoil', false)).toBe(3);
    // A deck warning counts every copy in the list.
    const deck: SavedDeck = { id: 'd', name: 'D', format: 'constructed', cards: [{ id: 'c', finish: 'nonfoil', count: 2 }], basics: NO_BASICS, commander: null, updatedAt: '' };
    expect(deckWarnings([deck], collection, 'c', 'nonfoil', 1)).toEqual([]);
    expect(deckWarnings([deck], collection, 'c', 'nonfoil', 2)).toEqual(['D']);
  });
});
