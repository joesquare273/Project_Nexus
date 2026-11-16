// The Reality Fracture Commander precon (import-precons.ts frc): the exact
// decklist with every printing's art, a legal Commander deck (cards not built
// yet are in it, marked notBuilt until their group is built).
import { describe, expect, it } from 'vitest';
import { COMMANDER, createGame, validateCommander, validateDeck } from '@nexus/engine';
import { CARD_DEFS, CARD_IDS_BY_NAME, FIN_PRECONS, FRC_PRECONS, SCRYFALL_PRINTINGS, preconDeck } from '../src/index.ts';

describe('Reality Fracture precon', () => {
  it('is Multiverse Reforged, led by Jace, Multiverse Architect: 100 cards, every printing cached', () => {
    expect(FRC_PRECONS.map((d) => [d.name, d.commander.name])).toEqual([['Multiverse Reforged', 'Jace, Multiverse Architect']]);
    const deck = FRC_PRECONS[0]!;
    const all = [deck.commander, ...deck.cards];
    expect(all.reduce((n, c) => n + c.count, 0)).toBe(100);
    for (const c of all) {
      const info = SCRYFALL_PRINTINGS[`${c.set}/${c.number}`];
      expect(info, c.name).toBeDefined();
      expect(info!.name.replaceAll('’', "'")).toBe(c.name.replaceAll('’', "'"));
      expect(CARD_DEFS[CARD_IDS_BY_NAME[c.name]!], c.name).toBeDefined();
    }
  });

  it('is a legal Commander deck and starts games with each card’s own printing', () => {
    const p = preconDeck('Multiverse Reforged');
    const full = [...p.deck, p.commander];
    expect([...validateDeck(full, CARD_DEFS, COMMANDER), ...validateCommander(full, p.commander, CARD_DEFS)]).toEqual([]);
    const other = preconDeck(FIN_PRECONS[0]!.name);
    const { state } = createGame({ format: COMMANDER, cardDefs: CARD_DEFS, seed: 5, players: [{ id: 'P1', ...p }, { id: 'P2', ...other }] });
    const command = state.players.P1!.command.map((id) => state.cards[id]!);
    expect(command.map((c) => c.defId)).toEqual([CARD_IDS_BY_NAME['Jace, Multiverse Architect']]);
    expect(command[0]!.printing).toEqual({ set: FRC_PRECONS[0]!.commander.set, number: FRC_PRECONS[0]!.commander.number });
  });
});
