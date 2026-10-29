// Saved decks (E1b): the note that says what a deck still needs to be legal.

import { describe, expect, it } from 'vitest';
import { deckNote } from '../src/packs/DecksView.tsx';
import type { DeckDraft } from '../src/packs/collection.ts';

const names = new Map([
  ['a', 'Cloud'],
  ['a2', 'Cloud'],
  ['b', 'Tifa'],
]);
const basics = (n: number) => ({ W: n, U: 0, B: 0, R: 0, G: 0 });
const deck = (over: Partial<DeckDraft>): DeckDraft => ({ name: 'D', format: 'limited', cards: [], basics: basics(0), commander: null, ...over });

describe('deck notes', () => {
  it('counts toward each format’s size', () => {
    expect(deckNote(deck({ basics: basics(39) }), names)).toBe('39 / 40 cards.');
    expect(deckNote(deck({ basics: basics(40) }), names)).toBeNull();
    expect(deckNote(deck({ basics: basics(60) }), names)).toBeNull();
    expect(deckNote(deck({ basics: basics(61) }), names)).toMatch(/at most 60/);
    expect(deckNote(deck({ format: 'constructed', basics: basics(59) }), names)).toBe('59 / 60 cards.');
  });

  it('limits copies by card name across printings', () => {
    const cards = [
      { id: 'a', finish: 'nonfoil' as const, count: 3 },
      { id: 'a2', finish: 'foil' as const, count: 2 },
    ];
    expect(deckNote(deck({ format: 'constructed', cards, basics: basics(55) }), names)).toMatch(/four copies/);
    // Limited decks have no copy limit.
    expect(deckNote(deck({ cards, basics: basics(35) }), names)).toBeNull();
  });

  it('Commander needs a commander, exactly 100 cards and one of each', () => {
    const cards = [{ id: 'b', finish: 'nonfoil' as const, count: 1 }];
    expect(deckNote(deck({ format: 'commander', cards, basics: basics(99) }), names)).toBe('Choose a commander.');
    expect(deckNote(deck({ format: 'commander', cards, basics: basics(99), commander: 'b' }), names)).toBeNull();
    expect(deckNote(deck({ format: 'commander', cards, basics: basics(98), commander: 'b' }), names)).toBe('99 / 100 cards.');
    expect(deckNote(deck({ format: 'commander', cards: [{ ...cards[0]!, count: 2 }], basics: basics(98), commander: 'b' }), names)).toMatch(/one copy/);
  });
});
