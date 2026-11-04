// The Edge of Eternities Commander precons (import-precons.ts eoc): exact
// decklists with every printing's art, legal Commander decks (cards not built
// yet are in them, marked notBuilt until their group is built).
import { describe, expect, it } from 'vitest';
import { COMMANDER, createGame, validateCommander, validateDeck } from '@nexus/engine';
import { CARD_DEFS, CARD_IDS_BY_NAME, EOC_PRECONS, SCRYFALL_PRINTINGS, preconDeck } from '../src/index.ts';

describe('Edge of Eternities precons', () => {
  it('are Counter Intelligence and World Shaper, 100 cards each, every printing cached', () => {
    expect(EOC_PRECONS.map((d) => [d.name, d.commander.name])).toEqual([
      ['Counter Intelligence', 'Inspirit, Flagship Vessel'],
      ['World Shaper', 'Hearthhull, the Worldseed'],
    ]);
    for (const deck of EOC_PRECONS) {
      const all = [deck.commander, ...deck.cards];
      expect(all.reduce((n, c) => n + c.count, 0)).toBe(100);
      for (const c of all) {
        const info = SCRYFALL_PRINTINGS[`${c.set}/${c.number}`];
        expect(info, `${deck.name}: ${c.name}`).toBeDefined();
        expect(info!.name.replaceAll('’', "'")).toBe(c.name.replaceAll('’', "'"));
        expect(CARD_DEFS[CARD_IDS_BY_NAME[c.name]!], c.name).toBeDefined();
      }
    }
  });

  it('are legal Commander decks and start games with each card’s own printing', () => {
    for (const deck of EOC_PRECONS) {
      const p = preconDeck(deck.name);
      const full = [...p.deck, p.commander];
      expect([...validateDeck(full, CARD_DEFS, COMMANDER), ...validateCommander(full, p.commander, CARD_DEFS)]).toEqual([]);
    }
    const [a, b] = EOC_PRECONS.map((d) => preconDeck(d.name));
    const { state } = createGame({ format: COMMANDER, cardDefs: CARD_DEFS, seed: 5, players: [{ id: 'P1', ...a! }, { id: 'P2', ...b! }] });
    const command = state.players.P1!.command.map((id) => state.cards[id]!);
    expect(command.map((c) => c.defId)).toEqual([CARD_IDS_BY_NAME['Inspirit, Flagship Vessel']]);
    expect(command[0]!.printing).toEqual({ set: EOC_PRECONS[0]!.commander.set, number: EOC_PRECONS[0]!.commander.number });
  });
});
