// The precon commanders Terra, Tidus and Y'shtola, each checked against its
// Oracle text with the real card data.

import { describe, expect, it } from 'vitest';
import { getLegalActions, type Action, type GameState, type Target } from '@nexus/engine';
import { CARD_IDS_BY_NAME } from '@nexus/cards';
import { act, card, cast, goTo, mana, newGame, put, settle } from './kit-helpers.ts';

const id = (name: string) => {
  const found = CARD_IDS_BY_NAME[name];
  if (!found) throw new Error(`No card named ${name}`);
  return found;
};
const zone = (s: GameState, c: string) => s.cards[c]!.zone;
const pickTargets = (want: Target[]) => (options: Target[][]) => {
  const found = options.find((o) => JSON.stringify(o) === JSON.stringify(want));
  if (!found) throw new Error(`No such target choice: ${JSON.stringify(want)}`);
  return found;
};

/** P1 attacks P2 with `attacker`; plays on until combat damage triggers ask "you may pay". */
function attackUntilDecision(s: GameState, attacker: string): GameState {
  s = goTo(s, 'declareAttackers', { accept: false });
  s = act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker, defender: 'P2' }] });
  for (let guard = 0; guard < 50 && s.pending.kind !== 'decide'; guard++) {
    const p = s.pending;
    if (p.kind === 'declareBlockers') s = act(s, { type: 'DeclareBlockers', player: p.player, blocks: [] });
    else if (p.kind === 'chooseTargets') s = act(s, getLegalActions(s).find((a) => a.type === 'ChooseTargets')!);
    else if (p.kind === 'priority') s = act(s, { type: 'PassPriority', player: p.player });
    else throw new Error(`Unexpected ${p.kind}`);
  }
  return s;
}

describe('Terra, Herald of Hope (Revival Trance)', () => {
  it('Trance: at the beginning of combat, mill two and gain flying until end of turn', () => {
    let s = newGame();
    const terra = put(s, 'P1', id('Terra, Herald of Hope'));
    s = goTo(s, 'beginCombat');
    s = settle(s).state;
    expect(s.players.P1!.graveyard).toHaveLength(2);
    expect(s.players.P1!.battlefield.includes(terra)).toBe(true);
    expect(getLegalActions(s).length).toBeGreaterThan(0);
    expect(s.temporaryEffects.some((e) => e.affected === terra && e.keywords?.includes('Flying'))).toBe(true);
  });

  it('on combat damage, pay {2} to return a creature card with power 3 or less, tapped', () => {
    let s = newGame();
    const terra = put(s, 'P1', id('Terra, Herald of Hope'));
    const rat = put(s, 'P1', 'undercity-dire-rat', 'graveyard');
    put(s, 'P1', id('Sun Titan'), 'graveyard'); // power 6: not a choice
    const lands = [put(s, 'P1', 'plains'), put(s, 'P1', 'plains')];
    s = attackUntilDecision(s, terra);
    for (const land of lands) s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: land, mana: 'W' });
    s = settle(act(s, { type: 'Decide', player: 'P1', accept: true })).state;
    expect(zone(s, rat)).toBe('battlefield');
    expect(s.cards[rat]!.tapped).toBe(true);
  });
});

describe("Tidus, Yuna's Guardian (Counter Blitz)", () => {
  it('may move a counter from one of your creatures to another at the beginning of combat', () => {
    let s = newGame();
    put(s, 'P1', id("Tidus, Yuna's Guardian"));
    const from = put(s, 'P1', 'undercity-dire-rat', 'battlefield', { counters: 2 });
    const to = put(s, 'P1', 'undercity-dire-rat');
    s = goTo(s, 'beginCombat', { targets: pickTargets([card(from), card(to)]) });
    s = settle(s, { targets: pickTargets([card(from), card(to)]) }).state;
    expect([s.cards[from]!.counters, s.cards[to]!.counters]).toEqual([1, 1]);
  });

  it('Cheer: when creatures with counters deal combat damage, draw a card and proliferate (once each turn)', () => {
    let s = newGame();
    const tidus = put(s, 'P1', id("Tidus, Yuna's Guardian"));
    const rat = put(s, 'P1', 'undercity-dire-rat', 'battlefield', { counters: 1 });
    s = goTo(s, 'declareAttackers', { accept: false });
    s = act(s, {
      type: 'DeclareAttackers',
      player: 'P1',
      attacks: [
        { attacker: rat, defender: 'P2' },
        { attacker: tidus, defender: 'P2' },
      ],
    });
    s = goTo(s, 'main2');
    expect(s.players.P1!.hand).toHaveLength(1);
    expect(s.cards[rat]!.counters).toBe(2);
  });
});

describe("Y'shtola, Night's Blessed (Scions & Spellcraft)", () => {
  it('noncreature spells with mana value 3 or more drain each opponent for 2', () => {
    let s = newGame(3);
    put(s, 'P1', id("Y'shtola, Night's Blessed"));
    const spell = put(s, 'P1', id('Syphon Mind'), 'hand');
    put(s, 'P2', 'island', 'hand');
    put(s, 'P3', 'island', 'hand');
    mana(s, 'P1', { B: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [] } satisfies Action).state;
    expect([s.players.P2!.life, s.players.P3!.life, s.players.P1!.life]).toEqual([18, 18, 22]); // 2 to each opponent; you gain 2 once
  });

  it('draws at each end step if a player lost 4 or more life this turn', () => {
    let s = newGame();
    put(s, 'P1', id("Y'shtola, Night's Blessed"));
    s.players.P2!.lifeLostThisTurn = 3;
    s = goTo(s, 'end');
    s = settle(s).state;
    expect(s.players.P1!.hand).toHaveLength(0);

    let t = newGame();
    put(t, 'P1', id("Y'shtola, Night's Blessed"));
    t.players.P2!.life = 16;
    t.players.P2!.lifeLostThisTurn = 4;
    t = goTo(t, 'end');
    t = settle(t).state;
    expect(t.players.P1!.hand).toHaveLength(1);
  });
});

describe('Tifa, Martial Artist (Limit Break, alternate commander)', () => {
  it('melee: +1/+1 for each opponent attacked this combat', () => {
    let s = newGame(3);
    const tifa = put(s, 'P1', id('Tifa, Martial Artist'));
    const rat = put(s, 'P1', 'undercity-dire-rat');
    s = goTo(s, 'declareAttackers', { accept: false });
    s = act(s, {
      type: 'DeclareAttackers',
      player: 'P1',
      attacks: [
        { attacker: tifa, defender: 'P2' },
        { attacker: rat, defender: 'P3' },
      ],
    });
    s = settle(s).state;
    expect(s.temporaryEffects.find((e) => e.affected === tifa)).toMatchObject({ power: 2, toughness: 2 });
  });

  it('power 7 or greater connecting untaps your creatures and adds one more combat, only after the first', () => {
    let s = newGame();
    const tifa = put(s, 'P1', id('Tifa, Martial Artist'), 'battlefield', { counters: 2 }); // 6/6, 7/7 with melee
    const rat = put(s, 'P1', 'undercity-dire-rat');
    const attack = (state: GameState) => {
      state = goTo(state, 'declareAttackers', { accept: false });
      state = act(state, {
        type: 'DeclareAttackers',
        player: 'P1',
        attacks: [
          { attacker: tifa, defender: 'P2' },
          { attacker: rat, defender: 'P2' },
        ],
      });
      return goTo(state, 'endCombat');
    };
    s = attack(s);
    expect([s.cards[tifa]!.tapped, s.cards[rat]!.tapped, s.extraCombats]).toEqual([false, false, 1]);
    s = attack(s); // the additional combat phase
    expect(s.combatsThisTurn).toBe(2);
    expect(s.extraCombats).toBe(0); // no third combat
    s = goTo(s, 'main2');
    expect(s.activePlayer).toBe('P1');
  });
});

describe("G'raha Tia, Scion Reborn (Scions & Spellcraft, alternate commander)", () => {
  it('pay X life for a noncreature spell with mana value X: a Hero with X counters, once each turn', () => {
    let s = newGame();
    put(s, 'P1', id("G'raha Tia, Scion Reborn"));
    const first = put(s, 'P1', id('Protection Magic'), 'hand');
    const second = put(s, 'P1', id('Protection Magic'), 'hand');
    const none = { kind: 'none' } as const;
    mana(s, 'P1', { W: 2, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: first, targets: [none, none, none] }).state;
    const heroes = () => s.players.P1!.battlefield.filter((c) => s.cards[c]!.defId === 'hero-token');
    expect([s.players.P1!.life, heroes().length, s.cards[heroes()[0]!]!.counters]).toEqual([18, 1, 2]);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: second, targets: [none, none, none] }).state;
    expect(heroes()).toHaveLength(1);
  });

  it('declining keeps it available later in the turn', () => {
    let s = newGame();
    put(s, 'P1', id("G'raha Tia, Scion Reborn"));
    const first = put(s, 'P1', id('Protection Magic'), 'hand');
    const second = put(s, 'P1', id('Protection Magic'), 'hand');
    const none = { kind: 'none' } as const;
    mana(s, 'P1', { W: 2, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: first, targets: [none, none, none] }, { accept: false }).state;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: second, targets: [none, none, none] }).state;
    expect(s.players.P1!.battlefield.filter((c) => s.cards[c]!.defId === 'hero-token')).toHaveLength(1);
  });
});
