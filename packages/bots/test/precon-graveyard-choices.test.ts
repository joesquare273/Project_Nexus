import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions, type GameState } from '@nexus/engine';
import { basicAi } from '../src/index.ts';
import { removeCounters, setCounters } from '../../engine/src/state.ts';
import { act, card, cast, mana, newGame, put, rejected, settle } from './kit-helpers.ts';

function choose(s: GameState, cards: string[]): GameState {
  if (s.pending.kind !== 'chooseCards') throw new Error(`Expected a card choice, got ${s.pending.kind}`);
  return settle(act(s, { type: 'ChooseCards', player: s.pending.player, cards })).state;
}

describe.each([2, 3, 4])('%i-player graveyard and library choices', (players) => {
  it('Rejoin: opponents choose distinct cards in order after the caster; none enter until all choices are made', () => {
    let s = newGame(players);
    // P2 casts, so P3/P4 choose before P1.
    s.activePlayer = 'P2';
    s.pending = { kind: 'priority', player: 'P2', passes: 0 };
    const victims = Array.from({ length: players }, () => put(s, 'P2', 'undercity-dire-rat', 'graveyard'));
    for (let i = 0; i < 3; i++) put(s, 'P2', 'island', 'library');
    const spell = put(s, 'P2', 'rejoin-the-fight', 'hand');
    mana(s, 'P2', { B: 1, C: 5 });
    s = settle(act(s, { type: 'CastSpell', player: 'P2', card: spell, targets: [] })).state;
    const order = [...Array.from({ length: players - 2 }, (_, i) => `P${i + 3}`), 'P1'];
    for (const [i, pid] of order.entries()) {
      expect(s.pending).toMatchObject({ kind: 'chooseCards', player: pid, purpose: 'reanimate' });
      for (const id of victims) expect(s.cards[id]!.zone).toBe('graveyard');
      if (i > 0) expect(rejected(s, { type: 'ChooseCards', player: pid, cards: [victims[0]!] })).toMatch(/offered/);
      s = choose(s, [victims[i]!]);
    }
    expect(victims.slice(0, players - 1).map((id) => s.cards[id]!.zone)).toEqual(Array(players - 1).fill('battlefield'));
    expect(s.cards[victims.at(-1)!]!.zone).toBe('graveyard');
  });

  it('Rejoin skips later choices when the graveyard has no eligible card left', () => {
    let s = newGame(players);
    for (let i = 0; i < 3; i++) put(s, 'P1', 'island', 'library');
    const only = put(s, 'P1', 'undercity-dire-rat', 'graveyard');
    const spell = put(s, 'P1', 'rejoin-the-fight', 'hand');
    mana(s, 'P1', { B: 1, C: 5 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [] }).state;
    s = choose(s, [only]);
    expect(s.pending.kind).toBe('priority');
    expect(s.cards[only]!.zone).toBe('battlefield');
  });

  it('Promise makes each player keep exactly one creature; a vow forbids attacking the caster', () => {
    let s = newGame(players);
    const kept: string[] = [];
    const lost: string[] = [];
    for (let i = 1; i <= players; i++) {
      kept.push(put(s, `P${i}`, 'undercity-dire-rat'));
      lost.push(put(s, `P${i}`, 'undercity-dire-rat'));
    }
    const spell = put(s, 'P1', 'promise-of-loyalty', 'hand');
    mana(s, 'P1', { W: 1, C: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [] }).state;
    for (let i = 0; i < players; i++) {
      expect(rejected(s, { type: 'ChooseCards', player: `P${i + 1}`, cards: [] })).toMatch(/exactly 1/);
      s = choose(s, [kept[i]!]);
    }
    for (const id of kept) expect(s.cards[id]!.namedCounters?.vow).toBe(1);
    for (const id of lost) expect(s.cards[id]!.zone).toBe('graveyard');
    s.activePlayer = 'P2';
    s.step = 'declareAttackers';
    s.pending = { kind: 'declareAttackers', player: 'P2' };
    expect(rejected(s, { type: 'DeclareAttackers', player: 'P2', attacks: [{ attacker: kept[1]!, defender: 'P1' }] })).toMatch(/vow/);
    expect(getLegalActions(s).filter((a) => a.type === 'DeclareAttackers').every((a) => a.attacks.every((attack) => attack.defender !== 'P1'))).toBe(true);
    if (players > 2) expect(applyAction(s, { type: 'DeclareAttackers', player: 'P2', attacks: [{ attacker: kept[1]!, defender: 'P3' }] }).ok).toBe(true);
    const aiAction = basicAi()(s, getLegalActions(s));
    expect(applyAction(s, aiAction).ok).toBe(true);
    // Once the last vow is removed, even adding a new one doesn't revive this effect.
    removeCounters({ s, ev: [] }, kept[1]!, 'vow', 1);
    setCounters(s.cards[kept[1]!]!, 'vow', 1);
    expect(applyAction(s, { type: 'DeclareAttackers', player: 'P2', attacks: [{ attacker: kept[1]!, defender: 'P1' }] }).ok).toBe(true);
  });

  it('Gearhulk lets the targeted opponent choose between three draws and milling damage', () => {
    for (const draw of [false, true]) {
      let s = newGame(players);
      const top = [put(s, 'P1', 'undercity-dire-rat', 'library'), put(s, 'P1', 'ruin-grinder', 'library'), put(s, 'P1', 'island', 'library')];
      const gearhulk = put(s, 'P1', 'combustible-gearhulk', 'hand');
      mana(s, 'P1', { R: 2, C: 4 });
      s = cast(s, { type: 'CastSpell', player: 'P1', card: gearhulk, targets: [] }, { targets: () => [{ kind: 'player', player: 'P2' }] }).state;
      expect(s.pending).toMatchObject({ kind: 'chooseCards', player: 'P2', purpose: 'offerDraw' });
      s = choose(s, draw ? [gearhulk] : []);
      for (const id of top) expect(s.cards[id]!.zone).toBe(draw ? 'hand' : 'graveyard');
      expect(s.players.P2!.life).toBe(draw ? 20 : 12); // rat 2 + Ruin Grinder 6
    }
  });

  it('Detour accepts graveyard cards and nonland permanents; the owner chooses top or bottom', () => {
    for (const zone of ['graveyard', 'battlefield'] as const) for (const bottom of [false, true]) {
      let s = newGame(players);
      const victim = put(s, 'P2', 'undercity-dire-rat', zone);
      const spell = put(s, 'P1', 'endless-detour', 'hand');
      const land = put(s, 'P2', 'island');
      mana(s, 'P1', { G: 1, W: 1, U: 1 });
      expect(rejected(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(land)] })).toMatch(/target/i);
      s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(victim)] }).state;
      expect(s.pending).toMatchObject({ kind: 'chooseCards', player: 'P2', purpose: 'library' });
      s = choose(s, bottom ? [victim] : []);
      expect(s.players.P2!.library[bottom ? s.players.P2!.library.length - 1 : 0]).toBe(victim);
    }
  });

  it('Detour removes an uncounterable spell from the stack without countering it', () => {
    let s = newGame(players);
    // Altered Ego's copy mechanic is still unbuilt. Supply its printed
    // uncounterability here to test Detour independently of that future work.
    s.cardDefs = { ...s.cardDefs, 'altered-ego': { ...s.cardDefs['altered-ego']!, cantBeCountered: true } };
    const victim = put(s, 'P1', 'altered-ego', 'hand');
    const detour = put(s, 'P2', 'endless-detour', 'hand');
    mana(s, 'P1', { G: 1, U: 1, C: 2 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: victim, targets: [] });
    s = act(s, { type: 'PassPriority', player: 'P1' });
    mana(s, 'P2', { G: 1, W: 1, U: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P2', card: detour, targets: [card(victim)] }).state;
    s = choose(s, []);
    expect(s.cards[victim]!.zone).toBe('library');
    expect(s.stack).toHaveLength(0);
  });
});
