// Sagas (rule 714): a lore counter as one enters and as each of your
// precombat main phases begins, a chapter ability for each new chapter, and
// the sacrifice after the final chapter. Checked against the Oracle text with
// the real card data.

import { describe, expect, it } from 'vitest';
import type { GameState } from '@nexus/engine';
import { act, cast, goTo, mana, newGame, put } from './kit-helpers.ts';

const RAT = 'undercity-dire-rat';
const lore = (s: GameState, id: string) => s.cards[id]!.namedCounters?.lore ?? 0;
/** From P1's turn to P1's next precombat main phase. */
const nextOwnMain = (s: GameState) => {
  s = goTo(s, 'end');
  s = goTo(s, 'main1'); // P2's turn
  s = goTo(s, 'end');
  return goTo(s, 'main1');
};

describe('Sagas', () => {
  it('the final chapter ability goes on the stack before the Saga is sacrificed (rule 714.4)', () => {
    let s = newGame();
    const ixion = put(s, 'P1', 'summon-ixion', 'battlefield', { namedCounters: { lore: 2 } });
    s = goTo(s, 'end');
    s = goTo(s, 'main1'); // P2's turn
    s = goTo(s, 'end');
    // P1's next precombat main phase begins: the third lore counter, chapter III triggers.
    for (let guard = 0; guard < 20 && !(s.activePlayer === 'P1' && s.step === 'main1'); guard++) {
      const p = s.pending;
      if (p.kind === 'priority') s = act(s, { type: 'PassPriority', player: p.player });
      else if (p.kind === 'declareAttackers') s = act(s, { type: 'DeclareAttackers', player: p.player, attacks: [] });
      else break;
    }
    expect(lore(s, ixion)).toBe(3);
    expect(s.stack.some((i) => i.kind === 'ability' && i.source === ixion) || s.triggerQueue.some((t) => t.source === ixion)).toBe(true);
    expect(s.cards[ixion]!.zone).toBe('battlefield');
    s = goTo(s, 'beginCombat');
    expect(s.cards[ixion]!.zone).toBe('graveyard');
  });

  it('Summon: Ixion: I exiles until it leaves; II and III grow your creatures; then it is sacrificed and the exile ends', () => {
    let s = newGame();
    const theirs = put(s, 'P2', RAT);
    const mine = put(s, 'P1', RAT);
    const ixion = put(s, 'P1', 'summon-ixion', 'hand');
    mana(s, 'P1', { W: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: ixion, targets: [] }).state;
    expect([lore(s, ixion), s.cards[theirs]!.zone]).toEqual([1, 'exile']);

    s = nextOwnMain(s); // chapter II
    expect([lore(s, ixion), s.cards[mine]!.counters, s.players.P1!.life]).toEqual([2, 1, 22]);
    s = nextOwnMain(s); // chapter III, then the Saga is sacrificed
    expect([s.cards[mine]!.counters, s.players.P1!.life]).toEqual([2, 24]);
    expect(s.cards[ixion]!.zone).toBe('graveyard');
    expect(s.cards[theirs]!.zone).toBe('battlefield'); // back, now that Ixion left
  });

  it('Summon: Kujata: I deals 3 damage to each of up to two target creatures', () => {
    let s = newGame();
    const a = put(s, 'P2', RAT);
    const b = put(s, 'P2', RAT);
    const kujata = put(s, 'P1', 'summon-kujata', 'hand');
    mana(s, 'P1', { R: 1, C: 5 });
    s = cast(
      s,
      { type: 'CastSpell', player: 'P1', card: kujata, targets: [] },
      { targets: (options) => options.find((o) => o.length === 2 && o[0]!.kind === 'card' && o[1]!.kind === 'card' && o[0]!.card === a && o[1]!.card === b)! },
    ).state;
    expect([s.cards[a]!.zone, s.cards[b]!.zone]).toEqual(['graveyard', 'graveyard']);
  });

  it("Summon: Kujata: II says up to three target creatures can't block this turn", () => {
    let s = newGame();
    const kujata = put(s, 'P1', 'summon-kujata', 'battlefield', { namedCounters: { lore: 1 } });
    const blocker = put(s, 'P2', RAT);
    s = nextOwnMain(s);
    expect(lore(s, kujata)).toBe(2);
    expect(s.temporaryEffects.some((e) => e.affected === blocker && e.flags?.includes('cantBlock'))).toBe(true);
  });

  it('Summon: Valefor: I bounces each opponent’s creature with the greatest mana value; later chapters tap and stun', () => {
    let s = newGame(3);
    const small = put(s, 'P2', RAT);
    const big = put(s, 'P2', 'ruin-grinder');
    const other = put(s, 'P3', RAT);
    const valefor = put(s, 'P1', 'summon-valefor', 'hand');
    mana(s, 'P1', { U: 1, C: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: valefor, targets: [] }).state;
    expect([s.cards[big]!.zone, s.cards[small]!.zone, s.cards[other]!.zone]).toEqual(['hand', 'battlefield', 'hand']);
  });

  it('proliferate adds lore counters and so moves a Saga to its next chapter', () => {
    let s = newGame();
    const lulu = put(s, 'P1', 'lulu-stern-guardian');
    const ixion = put(s, 'P1', 'summon-ixion', 'battlefield', { namedCounters: { lore: 1 } });
    put(s, 'P1', RAT);
    mana(s, 'P1', { U: 1, C: 3 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: lulu, ability: 0, targets: [] }).state;
    expect([lore(s, ixion), s.players.P1!.life]).toEqual([2, 22]);
  });
});
