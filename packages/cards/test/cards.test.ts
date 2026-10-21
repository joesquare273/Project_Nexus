import { describe, expect, it } from 'vitest';
import { CONSTRUCTED_DUEL, validateDeck } from '@nexus/engine';
import { CARD_DEFS, CARD_IDS_BY_NAME, CARDS, FIN_STARTER_KITS, starterKitDeck, validateCardDefinition } from '../src/index.ts';

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

  it('checks subtypes against the official lists for the card’s types', () => {
    const base = { id: 'x', name: 'x', manaCost: '{1}', power: 1, toughness: 1 };
    expect(validateCardDefinition({ ...base, types: ['creature'], subtypes: ['Moogle', 'Cat'] })).toEqual([]);
    expect(validateCardDefinition({ ...base, types: ['creature'], subtypes: ['Moggle'] })).toEqual([
      expect.stringMatching(/"Moggle" is not a creature subtype/),
    ]);
    expect(validateCardDefinition({ id: 'x', name: 'x', manaCost: '{1}', types: ['artifact'], subtypes: ['Equipment'] })).toEqual([]);
    expect(validateCardDefinition({ ...base, types: ['creature'], subtypes: ['Equipment'] })).toEqual([
      expect.stringMatching(/not a creature subtype/),
    ]);
  });

  it('catches mistakes in triggered abilities', () => {
    const base = { id: 'x', name: 'x', types: ['creature'], manaCost: '{1}', power: 1, toughness: 1 };
    expect(
      validateCardDefinition({
        ...base,
        triggers: [
          { when: 'Explodes', effects: [{ effect: 'DrawCards', amount: 1, target: 'You' }] },
          { when: 'SpellCast', effects: [{ effect: 'ReturnToHand', target: 'TargetCreature' }] },
          { when: 'Dies', turn: 'Yours', cost: { mana: '{Q}' }, effects: [] },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/unknown trigger event "Explodes"/),
        expect.stringMatching(/say which spells/),
        expect.stringMatching(/ReturnToHand only supports "This"/),
        expect.stringMatching(/"turn" is only for/),
        expect.stringMatching(/Unsupported mana symbol/),
        expect.stringMatching(/at least one effect/),
      ]),
    );
    expect(
      validateCardDefinition({ id: 'x', name: 'x', types: ['instant'], manaCost: '{1}', effects: [{ effect: 'ReturnToHand', target: 'This' }] }),
    ).toEqual([expect.stringMatching(/only be used in triggered abilities/)]);
  });

  it('builds legal 60-card Starter Kit decks', () => {
    for (const colors of ['RW', 'UB'] as const) {
      expect(validateDeck(starterKitDeck(colors), CARD_DEFS, CONSTRUCTED_DUEL)).toEqual([]);
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

  it('defines every kit card, marked implemented only when fully built', () => {
    for (const card of FIN_STARTER_KITS.flatMap((k) => k.cards)) {
      const id = CARD_IDS_BY_NAME[card.name];
      expect(id, `${card.name} has no definition`).toBeDefined();
      expect(card.implemented, card.name).toBe(!CARD_DEFS[id!]!.notBuilt);
      expect(card.implemented || card.needs.length > 0, card.name).toBe(true);
    }
  });

  it('builds the exact kit decks', () => {
    for (const [colors, kit] of [
      ['RW', FIN_STARTER_KITS[0]!],
      ['UB', FIN_STARTER_KITS[1]!],
    ] as const) {
      const deck = starterKitDeck(colors);
      expect(deck).toHaveLength(60);
      for (const c of kit.cards) expect(deck.filter((id) => id === CARD_IDS_BY_NAME[c.name]).length, c.name).toBe(c.count);
    }
  });
});
