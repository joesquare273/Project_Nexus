// The deck editor's rules (owned arts only, user decision 2026-11-03).
import { describe, expect, it } from 'vitest';
import { BOOSTER_CARDS, type BoosterCard } from '@nexus/cards/boosters';
import { addOne, artLabel, basicAllowed, canAdd, deckTotal, removeOffColor, setBasics, chooseCommander, commanderIdentity, copiesInDeck, curve, groupCollection, inDeck, offColor, removeOne, section, setArtCount } from '../src/packs/deckbuild.ts';
import type { Collection, DeckDraft } from '../src/packs/collection.ts';

const fin = (n: string) => BOOSTER_CARDS.find((c) => c.set === 'fin' && c.number === n)!;
const byId = new Map<string, BoosterCard>(BOOSTER_CARDS.map((c) => [c.id, c]));
const empty = (format: DeckDraft['format'] = 'constructed'): DeckDraft => ({ name: 'Test', format, cards: [], basics: { W: 0, U: 0, B: 0, R: 0, G: 0 }, commander: null });
// Fang in three arts (regular, borderless, extended), a foil regular Fang, Lightning Bolt and Cloud.
const fang = { regular: fin('99'), borderless: fin('381'), extended: fin('446') };
const bolt = BOOSTER_CARDS.find((c) => c.name === 'Lightning Bolt')!;
const collection: Collection = {
  cards: {
    [fang.regular.id]: { nonfoil: 2, foil: 1 },
    [fang.borderless.id]: { nonfoil: 1 },
    [fang.extended.id]: { nonfoil: 1 },
    [bolt.id]: { nonfoil: 4 },
  },
};
const groups = groupCollection(collection, byId);
const fangGroup = groups.find((g) => g.name === "Fang, Fearless l'Cie")!;
const boltGroup = groups.find((g) => g.name === 'Lightning Bolt')!;

describe('deckbuilding', () => {
  it('groups owned copies by card, every art and finish, regular non-foil first', () => {
    expect(fangGroup.total).toBe(5);
    expect(fangGroup.arts.map((o) => `${o.card.number}/${o.finish}`)).toEqual(['99/nonfoil', '99/foil', '381/nonfoil', '446/nonfoil']);
    expect(artLabel(fang.borderless)).toBe('Borderless · FIN #381');
    expect(artLabel(fang.extended)).toBe('Extended art · FIN #446');
    expect(artLabel(fang.regular)).toBe('Regular · FIN #99');
  });

  it('adding keeps copies in the art the deck already uses, and never more than you own', () => {
    let d = setArtCount(empty(), fangGroup.arts[2]!, 1);
    d = addOne(d, fangGroup);
    expect(inDeck(d, fangGroup.arts[2]!)).toBe(1);
    expect(copiesInDeck(d, fangGroup)).toBe(2);
    d = { ...d, format: 'limited' };
    for (let i = 0; i < 10; i++) d = addOne(d, fangGroup);
    expect(copiesInDeck(d, fangGroup)).toBe(5);
    expect(canAdd(d, fangGroup)).toBe(false);
    d = removeOne(d, fangGroup);
    expect(copiesInDeck(d, fangGroup)).toBe(4);
  });

  it('Commander decks take one of each card; the chosen commander art goes first', () => {
    let d = addOne(empty('commander'), boltGroup);
    expect(canAdd(d, boltGroup)).toBe(false);
    expect(addOne(d, boltGroup)).toBe(d);
    d = setArtCount(d, fangGroup.arts[0]!, 1);
    d = chooseCommander(d, fangGroup, fangGroup.arts[2]!);
    expect(d.commander).toBe(fang.borderless.id);
    expect(d.cards[0]).toEqual({ id: fang.borderless.id, finish: 'nonfoil', count: 1 });
    expect(copiesInDeck(d, fangGroup)).toBe(1);
    expect(commanderIdentity(d, byId)).toEqual(['B']);
    expect(offColor(d, groups, ['B'])).toEqual(['Lightning Bolt']);
  });

  it('Commander decks: only the commander\'s colors, basics included, and never more than 100 cards', () => {
    let d = chooseCommander(empty('commander'), fangGroup, fangGroup.arts[0]!);
    const identity = commanderIdentity(d, byId)!;
    expect(canAdd(d, boltGroup, identity)).toBe(false);
    expect(addOne(d, boltGroup, identity)).toBe(d);
    expect(basicAllowed(d, 'B', identity)).toBe(true);
    expect(basicAllowed(d, 'R', identity)).toBe(false);
    d = setBasics(d, 'B', 150);
    expect(d.basics.B).toBe(99);
    expect(deckTotal(d)).toBe(100);
    d = setBasics(d, 'B', 98);
    // Off-color cards added before the commander can be removed in one go.
    let mixed = setArtCount(d, boltGroup.arts[0]!, 1);
    mixed = { ...mixed, basics: { ...mixed.basics, R: 3 } };
    expect(offColor(mixed, groups, identity)).toEqual(['Lightning Bolt', 'Mountain']);
    mixed = removeOffColor(mixed, groups, identity);
    expect(offColor(mixed, groups, identity)).toEqual([]);
    expect(copiesInDeck(mixed, fangGroup)).toBe(1);
    // Other formats are unchanged: four Bolts, any basics.
    let free = empty('constructed');
    for (let i = 0; i < 6; i++) free = addOne(free, boltGroup);
    expect(copiesInDeck(free, boltGroup)).toBe(4);
    // 60-card decks: four of a card at most, even when you own more (Fang: five owned).
    for (let i = 0; i < 6; i++) free = addOne(free, fangGroup);
    expect(copiesInDeck(free, fangGroup)).toBe(4);
    expect(canAdd(free, fangGroup)).toBe(false);
    expect(setBasics(free, 'R', 40).basics.R).toBe(40);
  });

  it('sections: a card with several types goes by creature first', () => {
    expect(section({ types: ['artifact', 'creature'] })).toBe('Creatures');
    expect(section({ types: ['land', 'creature'] })).toBe('Creatures');
    expect(section({ types: ['enchantment', 'creature'] })).toBe('Creatures');
    expect(section({ types: ['artifact'] })).toBe('Artifacts');
    expect(section({ types: ['instant'] })).toBe('Instants');
    expect(section(boltGroup)).toBe('Instants');
  });

  it('the curve counts nonland cards by mana value', () => {
    let d = addOne(addOne(empty(), boltGroup), boltGroup);
    d = addOne(d, fangGroup);
    expect(curve(d, groups)).toEqual([0, 2, 0, 1, 0, 0, 0, 0]);
  });
});
