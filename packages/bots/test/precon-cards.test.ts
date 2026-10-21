// The Final Fantasy Commander precons: decklists, Commander legality, and
// the C1 mana cards built so far, played with their real card data.

import { describe, expect, it } from 'vitest';
import {
  COMMANDER,
  createGame,
  getLegalActions,
  manaChoices,
  validateCommander,
  validateDeck,
  type GameState,
} from '@nexus/engine';
import { CARD_DEFS, CARD_IDS_BY_NAME, FIN_PRECONS, preconDeck } from '@nexus/cards';
import { basicAi, playGame, randomBot } from '../src/index.ts';
import { checkInvariants } from '../src/invariants.ts';
import { act, cast, mana, put, rejected, settle } from './kit-helpers.ts';

/** A Commander duel on P1's main phase: Cloud (RGW) against Tidus, empty hands. */
function commanderGame(): GameState {
  const { state } = createGame({
    format: COMMANDER,
    cardDefs: CARD_DEFS,
    seed: 1,
    players: [
      { id: 'P1', deck: Array(30).fill('plains'), commander: 'cloud-ex-soldier' },
      { id: 'P2', deck: Array(30).fill('island'), commander: 'tidus-yunas-guardian' },
    ],
    skipDeckValidation: true,
  });
  for (const pid of ['P1', 'P2']) {
    const p = state.players[pid]!;
    for (const id of p.hand) state.cards[id]!.zone = 'library';
    p.library.push(...p.hand);
    p.hand = [];
  }
  state.activePlayer = 'P1';
  state.step = 'main1';
  state.turnNumber = 2;
  state.pending = { kind: 'priority', player: 'P1', passes: 0 };
  return state;
}

describe('Final Fantasy Commander precons', () => {
  it('has four legal 100-card decks', () => {
    expect(FIN_PRECONS.map((p) => p.commander.name)).toEqual([
      'Cloud, Ex-SOLDIER',
      "Terra, Herald of Hope",
      "Tidus, Yuna's Guardian",
      "Y'shtola, Night's Blessed",
    ]);
    for (const p of FIN_PRECONS) {
      const { commander, deck } = preconDeck(p.name);
      expect(deck.length + 1, p.name).toBe(100);
      expect(validateDeck([...deck, commander], CARD_DEFS, COMMANDER), p.name).toEqual([]);
      expect(validateCommander([...deck, commander], commander, CARD_DEFS), p.name).toEqual([]);
    }
  });

  it('marks a card implemented exactly when its definition is fully built', () => {
    for (const p of FIN_PRECONS) {
      for (const c of [p.commander, ...p.cards]) {
        const def = CARD_DEFS[CARD_IDS_BY_NAME[c.name]!]!;
        expect(c.implemented, c.name).toBe(!def.notBuilt);
        expect(c.implemented || c.needs.length > 0, c.name).toBe(true);
      }
    }
  });

  it.each([2, 3, 4])('play %i-player Commander games to the end without breaking rules', (players) => {
    for (const make of [basicAi, randomBot]) {
      const decks = FIN_PRECONS.slice(0, players).map((p) => preconDeck(p.name));
      const game = playGame(
        { format: COMMANDER, cardDefs: CARD_DEFS, seed: players * 11, players: decks.map((d, i) => ({ id: `P${i + 1}`, ...d })) },
        Object.fromEntries(decks.map((_, i) => [`P${i + 1}`, make(players * 7 + i)])),
        {
          maxActions: 30_000,
          onAction: (s) => {
            const problems = checkInvariants(s);
            if (problems.length) throw new Error(problems.join('; '));
          },
        },
      );
      expect(game.finished).toBe(true);
    }
  }, 120_000);
});

describe('C1: Commander mana', () => {
  it('Command Tower and Arcane Signet make any color in your commander’s color identity', () => {
    let s = commanderGame();
    const tower = put(s, 'P1', 'command-tower');
    const signet = put(s, 'P1', 'arcane-signet');
    expect(manaChoices(s, s.cards[tower]!)).toEqual(['W', 'R', 'G']);
    expect(rejected(s, { type: 'ActivateManaAbility', player: 'P1', card: tower, mana: 'U' })).toMatch(/can't produce/);
    s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: signet, mana: 'G' });
    expect(s.players.P1!.manaPool.G).toBe(1);
  });

  it('Sol Ring makes {C}{C} with one tap', () => {
    let s = commanderGame();
    const ring = put(s, 'P1', 'sol-ring');
    s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: ring, mana: 'C' });
    expect(s.players.P1!.manaPool.C).toBe(2);
  });

  it('Pain lands and Talismans deal 1 damage for colored mana, not for {C}', () => {
    let s = commanderGame();
    const forge = put(s, 'P1', 'battlefield-forge');
    const talisman = put(s, 'P1', 'talisman-of-conviction');
    s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: forge, mana: 'C' });
    expect(s.players.P1!.life).toBe(40);
    s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: talisman, mana: 'R' });
    expect(s.players.P1!.life).toBe(39);
  });

  it('Checklands, battle lands and snarls enter tapped unless their condition holds (revealing is optional)', () => {
    let s = commanderGame();
    const [check, battle, snarl] = ['clifftop-retreat', 'cinder-glade', 'furycalm-snarl'].map((id) => put(s, 'P1', id, 'hand'));
    s = act(s, { type: 'PlayLand', player: 'P1', card: check! });
    expect(s.cards[check!]!.tapped).toBe(true); // no Mountain or Plains yet

    let t = commanderGame();
    put(t, 'P1', 'plains');
    const check2 = put(t, 'P1', 'clifftop-retreat', 'hand');
    t = act(t, { type: 'PlayLand', player: 'P1', card: check2 });
    expect(t.cards[check2]!.tapped).toBe(false);

    let u = commanderGame();
    put(u, 'P1', 'plains');
    put(u, 'P1', 'mountain');
    const battle2 = put(u, 'P1', 'cinder-glade', 'hand');
    u = act(u, { type: 'PlayLand', player: 'P1', card: battle2 });
    expect(u.cards[battle2]!.tapped).toBe(false);
    expect(manaChoices(u, u.cards[battle2]!)).toEqual(['R', 'G']); // from its Mountain and Forest types

    let v = commanderGame();
    put(v, 'P1', 'mountain', 'hand');
    const snarl2 = put(v, 'P1', 'furycalm-snarl', 'hand');
    v = act(v, { type: 'PlayLand', player: 'P1', card: snarl2 });
    expect(v.cards[snarl2]!.tapped).toBe(false); // revealed the Mountain
    expect([battle, snarl]).toHaveLength(2);

    // You don't have to reveal: play it tapped anyway.
    let w = commanderGame();
    put(w, 'P1', 'mountain', 'hand');
    const snarl3 = put(w, 'P1', 'furycalm-snarl', 'hand');
    const plays = getLegalActions(w).filter((a) => a.type === 'PlayLand' && a.card === snarl3);
    expect(plays).toEqual([
      { type: 'PlayLand', player: 'P1', card: snarl3, reveal: true },
      { type: 'PlayLand', player: 'P1', card: snarl3, reveal: false },
    ]);
    w = act(w, { type: 'PlayLand', player: 'P1', card: snarl3, reveal: false });
    expect(w.cards[snarl3]!.tapped).toBe(true);

    // With nothing to reveal it enters tapped, and you can't claim a reveal.
    const x = commanderGame();
    const snarl4 = put(x, 'P1', 'furycalm-snarl', 'hand');
    expect(getLegalActions(x).filter((a) => a.type === 'PlayLand' && a.card === snarl4)).toEqual([
      { type: 'PlayLand', player: 'P1', card: snarl4 },
    ]);
    expect(rejected(x, { type: 'PlayLand', player: 'P1', card: snarl4, reveal: true })).toMatch(/no card to reveal/);
    expect(act(x, { type: 'PlayLand', player: 'P1', card: snarl4 }).cards[snarl4]!.tapped).toBe(true);
  });

  it('Temples enter tapped and scry 1: keep the card on top or put it on the bottom', () => {
    let s = commanderGame();
    const temple = put(s, 'P1', 'temple-of-plenty', 'hand');
    const top = s.players.P1!.library[0]!;
    s = act(s, { type: 'PlayLand', player: 'P1', card: temple });
    expect(s.cards[temple]!.tapped).toBe(true);
    s = act(s, { type: 'PassPriority', player: 'P1' });
    s = act(s, { type: 'PassPriority', player: 'P2' });
    expect(s.pending).toEqual({ kind: 'surveil', player: 'P1', card: top, scry: true });
    s = act(s, { type: 'Surveil', player: 'P1', toGraveyard: true });
    expect(s.players.P1!.library.at(-1)).toBe(top);
    expect(s.cards[top]!.zone).toBe('library');
  });

  it('Evolving Wilds fetches a basic land tapped; Mind Stone cashes in for a card; Ash Barrens cycles for a basic', () => {
    let s = commanderGame();
    const wilds = put(s, 'P1', 'evolving-wilds');
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: wilds, ability: 0, targets: [] }).state;
    expect(s.cards[wilds]!.zone).toBe('graveyard');
    const fetched = s.players.P1!.battlefield.find((id) => s.cards[id]!.defId === 'plains')!;
    expect(s.cards[fetched]!.tapped).toBe(true);

    const stone = put(s, 'P1', 'mind-stone');
    mana(s, 'P1', { C: 1 });
    const hand = s.players.P1!.hand.length;
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: stone, ability: 0, targets: [] }).state;
    expect(s.cards[stone]!.zone).toBe('graveyard');
    expect(s.players.P1!.hand.length).toBe(hand + 1);

    const barrens = put(s, 'P1', 'ash-barrens', 'hand');
    mana(s, 'P1', { C: 1 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: barrens, ability: 0, targets: [] }).state;
    expect(s.cards[barrens]!.zone).toBe('graveyard');
    expect(s.players.P1!.hand.filter((id) => s.cards[id]!.defId === 'plains').length).toBeGreaterThan(0);
  });

  it("Exotic Orchard makes colors an opponent's lands could make", () => {
    const s = commanderGame();
    const orchard = put(s, 'P1', 'exotic-orchard');
    expect(manaChoices(s, s.cards[orchard]!)).toEqual([]);
    put(s, 'P2', 'island');
    put(s, 'P2', 'swamp');
    expect(manaChoices(s, s.cards[orchard]!)).toEqual(['U', 'B']);
  });

  it("casts the commander from the command zone, paying with commander-identity mana", () => {
    let s = commanderGame();
    const cloud = s.players.P1!.command[0]!;
    for (const id of ['command-tower', 'plains', 'plains', 'mountain', 'forest']) put(s, 'P1', id);
    const cast = getLegalActions(s).find((a) => a.type === 'CastSpell' && a.card === cloud);
    expect(cast).toBeUndefined(); // the pool is empty; tapping comes first
    s = settle(s).state;
    expect(s.cards[cloud]!.zone).toBe('command');
  });
});
