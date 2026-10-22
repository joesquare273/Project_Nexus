// Foretell (rule 702.143): during your turn, pay {2} to exile a card from
// your hand face down; cast it on a later turn for its foretell cost. Checked
// against the Oracle text with the real card data.

import { describe, expect, it } from 'vitest';
import { getLegalActions, playableZone, viewFor, type GameState } from '@nexus/engine';
import { act, goTo, mana, newGame, put, rejected, settle } from './kit-helpers.ts';

/** On to P1's next precombat main phase, however many players there are. */
const nextOwnMain = (s: GameState) => {
  do {
    s = goTo(s, 'end');
    s = goTo(s, 'main1');
  } while (s.activePlayer !== 'P1');
  return s;
};
/** P1 foretells a card on this turn, then it's P1's next main phase. */
function foretold(s: GameState, id: string): GameState {
  mana(s, 'P1', { C: 2 });
  s = act(s, { type: 'Foretell', player: 'P1', card: id });
  return nextOwnMain(s);
}

describe('Foretell', () => {
  it('pays {2} to exile the card face down: hidden from opponents, castable only on a later turn', () => {
    let s = newGame();
    const meteor = put(s, 'P1', 'ultimate-magic-meteor', 'hand');
    expect(rejected(s, { type: 'Foretell', player: 'P1', card: meteor })).toMatch(/costs \{2\}/);
    mana(s, 'P1', { C: 2 });
    expect(getLegalActions(s)).toContainEqual({ type: 'Foretell', player: 'P1', card: meteor });
    s = act(s, { type: 'Foretell', player: 'P1', card: meteor });
    expect([s.cards[meteor]!.zone, s.players.P1!.manaPool.C]).toEqual(['exile', 0]);
    expect(viewFor(s, 'P2').cards[meteor]).toBeUndefined(); // face down
    expect(viewFor(s, 'P1').cards[meteor]).toBeDefined();
    mana(s, 'P1', { R: 1, C: 5 });
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: meteor, targets: [] })).toMatch(/not in your hand/);
  });

  it("can't be done on an opponent's turn", () => {
    let s = newGame();
    const holy = put(s, 'P2', 'ultimate-magic-holy', 'hand');
    mana(s, 'P2', { C: 2 });
    s = act(s, { type: 'PassPriority', player: 'P1' });
    expect(rejected(s, { type: 'Foretell', player: 'P2', card: holy })).toMatch(/your turn/);
  });
});

describe('Ultimate Magic: Holy', () => {
  it('cast from exile: your permanents are indestructible and damage to you is prevented this turn', () => {
    let s = newGame(3);
    const holy = put(s, 'P1', 'ultimate-magic-holy', 'hand');
    const rat = put(s, 'P1', 'undercity-dire-rat');
    s = foretold(s, holy);
    mana(s, 'P1', { W: 1, C: 2 });
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: holy, targets: [] })).state;
    expect(s.temporaryEffects.some((e) => e.affected === rat && e.keywords?.includes('Indestructible'))).toBe(true);
    // Crackling Doom from an opponent: 2 damage to each of its caster's opponents, but not to P1.
    const doom = put(s, 'P2', 'crackling-doom', 'hand');
    s = act(s, { type: 'PassPriority', player: 'P1' });
    mana(s, 'P2', { R: 1, W: 1, B: 1 });
    s = settle(act(s, { type: 'CastSpell', player: 'P2', card: doom, targets: [] })).state;
    expect([s.players.P1!.life, s.players.P3!.life]).toEqual([20, 18]);
  });

  it('cast from hand: no damage prevention', () => {
    let s = newGame();
    const holy = put(s, 'P1', 'ultimate-magic-holy', 'hand');
    mana(s, 'P1', { W: 1, C: 2 });
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: holy, targets: [] })).state;
    expect(s.players.P1!.preventDamageTurn).toBeUndefined();
  });
});

describe('Ultimate Magic: Meteor', () => {
  it('cast from exile: 7 damage to each creature, then you destroy an artifact or land each opponent controls', () => {
    let s = newGame();
    const meteor = put(s, 'P1', 'ultimate-magic-meteor', 'hand');
    const theirs = put(s, 'P2', 'undercity-dire-rat');
    const vessel = put(s, 'P2', 'thought-vessel');
    put(s, 'P2', 'island');
    s = foretold(s, meteor);
    mana(s, 'P1', { R: 1, C: 5 });
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: meteor, targets: [] })).state;
    expect(s.cards[theirs]!.zone).toBe('graveyard');
    expect(s.pending).toMatchObject({ kind: 'chooseCards', player: 'P1', purpose: 'destroy', min: 1, max: 1 });
    s = act(s, { type: 'ChooseCards', player: 'P1', cards: [vessel] });
    expect(s.cards[vessel]!.zone).toBe('graveyard');
  });
});

describe("Lifestream's Blessing", () => {
  it('draws X, the greatest power among your creatures; from exile you also gain twice X', () => {
    for (const fromExile of [false, true]) {
      let s = newGame();
      for (let i = 0; i < 10; i++) put(s, 'P1', 'island', 'library');
      put(s, 'P1', 'ruin-grinder'); // power 7
      const blessing = put(s, 'P1', 'lifestreams-blessing', 'hand');
      if (fromExile) s = foretold(s, blessing);
      const before = s.players.P1!.hand.length;
      mana(s, 'P1', fromExile ? { G: 1, C: 4 } : { G: 2, C: 4 });
      s = settle(act(s, { type: 'CastSpell', player: 'P1', card: blessing, targets: [] })).state;
      expect(s.players.P1!.hand.length - before).toBe(fromExile ? 7 : 6); // from hand, the card itself left the hand
      expect(s.players.P1!.life).toBe(fromExile ? 34 : 20);
    }
  });
});

describe('Casting from exile for a limited time', () => {
  it('"until the end of your next turn" lasts through that turn, then the card is just exiled', () => {
    let s = newGame();
    const harmonize = put(s, 'P1', 'harmonize', 'exile');
    const until = s.turnNumber + 2; // P1's next turn in a 2-player game
    s.cards[harmonize]!.playableFromExile = { player: 'P1', source: harmonize, untilTurn: until };
    const castable = (state: GameState) => playableZone(state, 'P1', state.cards[harmonize]!) === 'exile';
    expect(castable(s)).toBe(true);
    s = nextOwnMain(s);
    expect([s.turnNumber, castable(s)]).toEqual([until, true]);
    s = nextOwnMain(s);
    expect(castable(s)).toBe(false);
  });
});
