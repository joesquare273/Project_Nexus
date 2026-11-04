// Partner (rule 702.124): two commanders lead one Commander deck together.

import { describe, expect, it } from 'vitest';
import { COMMANDER, canPartner, createGame, validateCommander, type GameState } from '@nexus/engine';
import { CARD_DEFS } from '@nexus/cards';
import { act, mana } from './kit-helpers.ts';

function partnerGame(): GameState {
  const { state } = createGame({
    format: COMMANDER,
    cardDefs: CARD_DEFS,
    seed: 1,
    players: [
      { id: 'P1', deck: Array(98).fill('plains'), commander: 'tymna-the-weaver', partner: 'thrasios-triton-hero' },
      { id: 'P2', deck: Array(99).fill('island'), commander: 'gogo-master-of-mimicry' },
    ],
  });
  state.activePlayer = 'P1';
  state.step = 'main1';
  state.pending = { kind: 'priority', player: 'P1', passes: 0 };
  return state;
}

describe('Partner', () => {
  it('both commanders start in the command zone; the deck is 100 cards with both', () => {
    const s = partnerGame();
    const command = s.players.P1!.command.map((id) => s.cards[id]!);
    expect(command.map((c) => c.defId).sort()).toEqual(['thrasios-triton-hero', 'tymna-the-weaver']);
    expect(command.every((c) => c.isCommander)).toBe(true);
    expect(s.players.P1!.library.length + s.players.P1!.hand.length).toBe(98);
  });

  it('each commander has its own tax', () => {
    let s = partnerGame();
    const [tymna, thrasios] = ['tymna-the-weaver', 'thrasios-triton-hero'].map((d) => s.players.P1!.command.find((id) => s.cards[id]!.defId === d)!);
    mana(s, 'P1', { W: 1, B: 1, C: 1 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: tymna! });
    s = act(s, { type: 'PassPriority', player: 'P1' });
    s = act(s, { type: 'PassPriority', player: 'P2' });
    expect(s.cards[tymna!]!.zone).toBe('battlefield');
    expect(s.players.P1!.commanderCasts[tymna!]).toBe(1);
    // Thrasios's first cast has no tax: {G}{U}.
    mana(s, 'P1', { G: 1, U: 1 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: thrasios! });
    expect(s.stack.some((x) => x.kind === 'spell' && x.card === thrasios)).toBe(true);
  });

  it('the color identity is both commanders’; both need Partner (or to partner with each other)', () => {
    const deck = ['plains', 'island', 'forest', 'swamp'];
    expect(validateCommander([...deck, 'tymna-the-weaver', 'thrasios-triton-hero'], 'tymna-the-weaver', CARD_DEFS, 'thrasios-triton-hero')).toEqual([]);
    // Tymna alone is white and black: Islands and Forests are outside it.
    expect(validateCommander([...deck, 'tymna-the-weaver'], 'tymna-the-weaver', CARD_DEFS).length).toBeGreaterThan(0);
    // A red card is outside Tymna and Thrasios.
    expect(validateCommander(['mountain', 'tymna-the-weaver', 'thrasios-triton-hero'], 'tymna-the-weaver', CARD_DEFS, 'thrasios-triton-hero').join(' ')).toMatch(/outside Tymna the Weaver and Thrasios, Triton Hero's color identity/);
    // Muldrotha has no Partner.
    expect(validateCommander(['tymna-the-weaver', 'muldrotha-the-gravetide'], 'tymna-the-weaver', CARD_DEFS, 'muldrotha-the-gravetide').join(' ')).toMatch(/can't be commanders together/);
    // "Partner with": only with each other.
    expect(canPartner(CARD_DEFS['alisaie-leveilleur']!, CARD_DEFS['alphinaud-leveilleur']!)).toBe(true);
    expect(canPartner(CARD_DEFS['alisaie-leveilleur']!, CARD_DEFS['tymna-the-weaver']!)).toBe(false);
    expect(canPartner(CARD_DEFS['kraum-ludevics-opus']!, CARD_DEFS['vial-smasher-the-fierce']!)).toBe(true);
  });

  it('a partner needs a commander, and the deck is checked with both', () => {
    expect(() => createGame({ format: COMMANDER, cardDefs: CARD_DEFS, seed: 1, players: [
      { id: 'P1', deck: Array(98).fill('mountain'), commander: 'tymna-the-weaver', partner: 'thrasios-triton-hero' },
      { id: 'P2', deck: Array(99).fill('island'), commander: 'gogo-master-of-mimicry' },
    ] })).toThrow(/outside/);
  });
});
