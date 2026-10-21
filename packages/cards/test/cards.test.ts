import { describe, expect, it } from 'vitest';
import { CONSTRUCTED_DUEL, validateDeck } from '@nexus/engine';
import { CARD_DEFS, CARD_IDS_BY_NAME, CARDS, FIN_STARTER_KITS, testbedDeck, validateCardDefinition } from '../src/index.ts';

describe('card data', () => {
  it('loads and validates every card', () => {
    expect(CARDS.length).toBeGreaterThan(20);
    for (const c of CARDS) expect(validateCardDefinition(c)).toEqual([]);
  });

  it('catches common mistakes', () => {
    expect(validateCardDefinition({ id: 'Bad Id', name: 'x', types: ['creature'], manaCost: '{1}' })).toEqual(
      expect.arrayContaining([expect.stringMatching(/kebab/), expect.stringMatching(/power and toughness/)]),
    );
    expect(validateCardDefinition({ id: 'x', name: 'x', types: ['instant'], manaCost: '{R}{P}', effects: [] })).toEqual(
      expect.arrayContaining([expect.stringMatching(/Unsupported mana symbol/), expect.stringMatching(/at least one effect/)]),
    );
    expect(
      validateCardDefinition({
        id: 'x',
        name: 'x',
        types: ['sorcery'],
        manaCost: '{G}',
        effects: [{ effect: 'GainLife', amount: 2, target: 'AnyTarget' }],
      }),
    ).toEqual([expect.stringMatching(/only affect players/)]);
  });

  it('builds legal 60-card testbed decks', () => {
    for (const colors of ['RW', 'UB'] as const) {
      expect(validateDeck(testbedDeck(colors), CARD_DEFS, CONSTRUCTED_DUEL)).toEqual([]);
    }
  });
});

describe('Final Fantasy Starter Kits', () => {
  it('lists both 60-card decks', () => {
    expect(FIN_STARTER_KITS.map((k) => k.total)).toEqual([60, 60]);
    for (const kit of FIN_STARTER_KITS) {
      expect(kit.cards.reduce((n, c) => n + c.count, 0)).toBe(60);
    }
  });

  it('marks a card implemented only when its definition exists, and lists needs otherwise', () => {
    for (const card of FIN_STARTER_KITS.flatMap((k) => k.cards)) {
      expect(card.implemented, card.name).toBe(card.name in CARD_IDS_BY_NAME);
      expect(card.implemented || card.needs.length > 0, card.name).toBe(true);
    }
  });
});
