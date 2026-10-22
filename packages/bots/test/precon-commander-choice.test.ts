// Choosing which card leads a precon. A commander is a legendary creature or a
// legendary Vehicle (rule 903.3) whose colors cover every card in the deck
// (rule 903.5c), so each precon offers its printed commander and the other
// legend in all of its colors.

import { describe, expect, it } from 'vitest';
import { COMMANDER, canBeCommander, createGame, type CardDefinition } from '@nexus/engine';
import { CARD_DEFS, CARD_IDS_BY_NAME, FIN_PRECONS, preconCommanders, preconDeck, preconDeckWithCommander } from '@nexus/cards';

describe('Choosing a precon commander', () => {
  it('each precon offers its printed commander, then its other legend in all of its colors', () => {
    expect(FIN_PRECONS.map((p) => preconCommanders(p.name).map((c) => c.name))).toEqual([
      ['Cloud, Ex-SOLDIER', 'Tifa, Martial Artist'],
      ['Terra, Herald of Hope', 'Celes, Rune Knight'],
      ["Tidus, Yuna's Guardian", 'Yuna, Grand Summoner'],
      ["Y'shtola, Night's Blessed", "G'raha Tia, Scion Reborn"],
    ]);
    for (const p of FIN_PRECONS) expect(preconCommanders(p.name)[0]!.printed).toBe(true);
  });

  it('either choice makes a legal game; the printed commander moves into the 99', () => {
    for (const p of FIN_PRECONS) {
      const printed = preconDeck(p.name).commander;
      for (const choice of preconCommanders(p.name)) {
        const deck = preconDeckWithCommander(p.name, choice.name);
        expect(deck.commander).toBe(choice.defId);
        expect(deck.deck).toHaveLength(99);
        if (!choice.printed) expect(deck.deck).toContain(printed);
        const game = createGame({
          format: COMMANDER,
          cardDefs: CARD_DEFS,
          seed: 1,
          players: [
            { id: 'P1', ...deck },
            { id: 'P2', ...preconDeck(FIN_PRECONS[(FIN_PRECONS.indexOf(p) + 1) % 4]!.name) },
          ],
        });
        expect(game.state.players.P1!.command.map((id) => game.state.cards[id]!.defId)).toEqual([choice.defId]);
      }
    }
  });

  it('a legend outside the deck’s colors can’t lead it', () => {
    const p = FIN_PRECONS[0]!;
    expect(() => preconDeckWithCommander(p.name, 'Zack Fair')).toThrow(/all of the deck's colors/);
    // Nor can such a deck be set up by hand.
    const base = preconDeck(p.name);
    const zack = CARD_IDS_BY_NAME['Zack Fair']!;
    const deck = [...base.deck.filter((id) => id !== zack), base.commander];
    expect(() =>
      createGame({
        format: COMMANDER,
        cardDefs: CARD_DEFS,
        seed: 1,
        players: [{ id: 'P1', commander: zack, deck }, { id: 'P2', ...preconDeck(FIN_PRECONS[1]!.name) }],
      }),
    ).toThrow(/outside Zack Fair's color identity/);
  });

  it('legendary creatures and legendary Vehicles can be commanders; other legendary permanents can’t', () => {
    const vehicle: CardDefinition = { id: 'v', name: 'V', types: ['artifact'], supertypes: ['Legendary'], subtypes: ['Vehicle'] };
    expect(canBeCommander(vehicle)).toBe(true);
    expect(canBeCommander({ ...vehicle, subtypes: ['Equipment'] })).toBe(false);
    expect(canBeCommander({ ...vehicle, supertypes: [] })).toBe(false);
    expect(canBeCommander(CARD_DEFS[CARD_IDS_BY_NAME['Cloud, Ex-SOLDIER']!]!)).toBe(true);
  });
});
