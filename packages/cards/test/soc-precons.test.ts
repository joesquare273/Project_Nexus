// The Secrets of Strixhaven Commander decks (import-precons.ts soc): the exact
// decklists with every printing's art, each a legal Commander deck (cards not
// built yet are in them, marked notBuilt until their group is built).
import { describe, expect, it } from 'vitest';
import { COMMANDER, createGame, validateCommander, validateDeck } from '@nexus/engine';
import { CARD_DEFS, CARD_IDS_BY_NAME, FIN_PRECONS, SCRYFALL_PRINTINGS, SOC_PRECONS, preconDeck } from '../src/index.ts';

describe('Secrets of Strixhaven Commander decks', () => {
  it('are the five college decks: 100 cards each, every printing cached', () => {
    expect(SOC_PRECONS.map((d) => [d.name, d.commander.name])).toEqual([
      ['Lorehold Spirit', 'Quintorius, History Chaser'],
      ['Prismari Artistry', 'Rootha, Mastering the Moment'],
      ['Quandrix Unlimited', 'Zimone, Infinite Analyst'],
      ['Silverquill Influence', 'Killian, Decisive Mentor'],
      ['Witherbloom Pestilence', 'Dina, Essence Brewer'],
    ]);
    for (const deck of SOC_PRECONS) {
      const all = [deck.commander, ...deck.cards];
      expect(all.reduce((n, c) => n + c.count, 0), deck.name).toBe(100);
      for (const c of all) {
        const info = SCRYFALL_PRINTINGS[`${c.set}/${c.number}`];
        expect(info, `${deck.name}: ${c.name}`).toBeDefined();
        expect(info!.name.replaceAll('’', "'")).toBe(c.name.replaceAll('’', "'"));
        expect(CARD_DEFS[CARD_IDS_BY_NAME[c.name]!], c.name).toBeDefined();
      }
    }
  });

  it('are legal Commander decks and start games with each card’s own printing', () => {
    for (const deck of SOC_PRECONS) {
      const p = preconDeck(deck.name);
      const full = [...p.deck, p.commander];
      expect([...validateDeck(full, CARD_DEFS, COMMANDER), ...validateCommander(full, p.commander, CARD_DEFS)], deck.name).toEqual([]);
    }
    const p = preconDeck('Witherbloom Pestilence');
    const { state } = createGame({ format: COMMANDER, cardDefs: CARD_DEFS, seed: 5, players: [{ id: 'P1', ...p }, { id: 'P2', ...preconDeck(FIN_PRECONS[0]!.name) }] });
    const command = state.players.P1!.command.map((id) => state.cards[id]!);
    expect(command.map((c) => c.defId)).toEqual([CARD_IDS_BY_NAME['Dina, Essence Brewer']]);
    expect(command[0]!.printing).toEqual({ set: SOC_PRECONS[4]!.commander.set, number: SOC_PRECONS[4]!.commander.number });
  });
});
