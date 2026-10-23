import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions, viewFor, type GameState } from '@nexus/engine';
import { CARD_IDS_BY_NAME } from '@nexus/cards';
import { moveCard } from '../../engine/src/state.ts';
import { basicAi } from '../src/ai.ts';
import { checkInvariants } from '../src/invariants.ts';
import { act, goTo, newGame, put, rejected, settle } from './kit-helpers.ts';

const PROGRAM = 'soldier-military-program';
const CLOUD = CARD_IDS_BY_NAME['Cloud, Ex-SOLDIER']!;
function commander(s: GameState, owner = 'P1', zone: 'battlefield' | 'command' = 'battlefield') {
  return put(s, owner, CLOUD, zone, { isCommander: true });
}
function tokens(s: GameState) { return s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'soldier-token'); }
function begin(players: number, withCommander = false) {
  const s = newGame(players);
  put(s, 'P1', PROGRAM);
  if (withCommander) commander(s);
  return goTo(s, 'beginCombat');
}
function modes(s: GameState) { return getLegalActions(s).filter((a) => a.type === 'ChooseModes'); }

describe.each([2, 3, 4])('SOLDIER Military Program with %i players', (players) => {
  it('chooses a mode before going on the stack and creates the exact white Soldier', () => {
    let s = begin(players);
    expect(s.pending.kind).toBe('chooseModes');
    expect(s.stack).toHaveLength(0);
    expect(modes(s).map((a) => a.modes)).toEqual([[0], [1]]);
    const before = structuredClone(s);
    const chosen = applyAction(s, { type: 'ChooseModes', player: 'P1', modes: [0] });
    expect(chosen.ok).toBe(true);
    expect(s).toEqual(before);
    s = act(s, { type: 'ChooseModes', player: 'P1', modes: [0] });
    expect(s.pending).toMatchObject({ kind: 'priority', player: 'P1' });
    expect(s.stack[0]).toMatchObject({ kind: 'ability', modes: [0], targets: [] });
    expect(tokens(s)).toHaveLength(0); // Opponents still have response windows.
    s = settle(s).state;
    expect(tokens(s)).toHaveLength(1);
    expect(s.cardDefs[s.cards[tokens(s)[0]!]!.defId]).toMatchObject({ power: 1, toughness: 1, colors: ['W'], subtypes: ['Soldier'] });
    expect(checkInvariants(s)).toEqual([]);
  });

  it('allows either single mode or both with a commander and resolves in printed order', () => {
    let s = begin(players, true);
    expect(modes(s).map((a) => a.modes)).toEqual([[0], [1], [0, 1]]);
    s = act(s, { type: 'ChooseModes', player: 'P1', modes: [1, 0] });
    s = settle(s).state;
    expect(s.pending).toMatchObject({ kind: 'chooseCards', purpose: 'addCounters', min: 0, max: 2 }); // Cloud is a Soldier too.
    const soldier = tokens(s)[0]!;
    expect(soldier).toBeDefined();
    s = act(s, { type: 'ChooseCards', player: 'P1', cards: [soldier] });
    expect(s.cards[soldier]!.counters).toBe(1);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('accepts no Soldiers and resolves the counter mode even with none', () => {
    let s = begin(players);
    s = act(s, { type: 'ChooseModes', player: 'P1', modes: [1] });
    s = settle(s).state;
    expect(s.pending.kind).toBe('priority');
    expect(tokens(s)).toHaveLength(0);
    s = begin(players, true);
    s = settle(act(s, { type: 'ChooseModes', player: 'P1', modes: [0, 1] })).state;
    s = act(s, { type: 'ChooseCards', player: 'P1', cards: [] });
    expect(s.cards[tokens(s)[0]!]!.counters ?? 0).toBe(0);
  });

  it('selects zero, one or two distinct Soldiers at resolution without targeting them', () => {
    const initial = newGame(players);
    put(initial, 'P1', PROGRAM);
    const mine = [put(initial, 'P1', 'soldier-token'), put(initial, 'P1', 'soldier-token'), put(initial, 'P1', 'soldier-token')];
    put(initial, 'P1', 'lightning-greaves', 'battlefield', { attachedTo: mine[0] });
    const enemy = put(initial, 'P2', 'soldier-token');
    const nonSoldier = put(initial, 'P1', 'undercity-dire-rat');
    let s = goTo(initial, 'beginCombat');
    s = act(s, { type: 'ChooseModes', player: 'P1', modes: [1] });
    expect(s.stack[0]!.targets).toEqual([]);
    s = settle(s).state;
    expect(s.pending).toMatchObject({ kind: 'chooseCards', purpose: 'addCounters', cards: mine, min: 0, max: 2 });
    for (const cards of [[mine[0]!, mine[0]!], mine, [enemy], [nonSoldier]]) {
      expect(rejected(s, { type: 'ChooseCards', player: 'P1', cards })).toMatch(/Choose/);
    }
    for (const cards of [[], mine.slice(0, 1), mine.slice(0, 2)]) {
      const resolved = act(s, { type: 'ChooseCards', player: 'P1', cards });
      for (const id of mine) expect(resolved.cards[id]!.counters ?? 0).toBe(cards.includes(id) ? 1 : 0);
      expect(checkInvariants(resolved)).toEqual([]);
    }
  });

  it('chooses recipients after responses and applies Hardened Scales per Soldier', () => {
    const initial = newGame(players);
    put(initial, 'P1', PROGRAM);
    put(initial, 'P1', 'hardened-scales');
    const removed = put(initial, 'P1', 'soldier-token');
    let s = goTo(initial, 'beginCombat');
    s = act(s, { type: 'ChooseModes', player: 'P1', modes: [1] });
    moveCard({ s, ev: [] }, removed, 'graveyard');
    const arrived = put(s, 'P1', 'soldier-token');
    s = settle(s).state;
    expect(s.pending).toMatchObject({ cards: [arrived] });
    s = act(s, { type: 'ChooseCards', player: 'P1', cards: [arrived] });
    expect(s.cards[arrived]!.counters).toBe(2);
    expect(s.cards[removed]!.counters ?? 0).toBe(0);
  });

  it('does not require the source or commander to remain after choosing both modes', () => {
    const initial = newGame(players);
    const program = put(initial, 'P1', PROGRAM);
    const leader = commander(initial);
    let s = goTo(initial, 'beginCombat');
    s = act(s, { type: 'ChooseModes', player: 'P1', modes: [0, 1] });
    moveCard({ s, ev: [] }, program, 'exile');
    moveCard({ s, ev: [] }, leader, 'command');
    s = settle(s).state;
    expect(tokens(s)).toHaveLength(1);
    s = act(s, { type: 'ChooseCards', player: 'P1', cards: tokens(s) });
    expect(s.cards[tokens(s)[0]!]!.counters).toBe(1);
  });

  it('requires a commander under your control on the battlefield when modes are chosen', () => {
    const initial = newGame(players);
    put(initial, 'P1', PROGRAM);
    commander(initial, 'P1', 'command');
    commander(initial, 'P2');
    let s = goTo(initial, 'beginCombat');
    expect(modes(s)).toHaveLength(2);
    for (const selected of [[], [0, 0], [2], [0, 1]]) expect(rejected(s, { type: 'ChooseModes', player: 'P1', modes: selected })).toMatch(/legal set/);
    expect(rejected(s, { type: 'ChooseModes', player: 'P2', modes: [0] })).toMatch(/not choosing/);
    const stolen = Object.values(s.cards).find((c) => c.isCommander && c.owner === 'P2')!;
    stolen.controller = 'P1';
    expect(modes(s)).toHaveLength(3); // Any commander you control qualifies, including an opponent's.
    moveCard({ s, ev: [] }, stolen.id, 'exile');
    expect(modes(s)).toHaveLength(2);
  });

  it('triggers only on your combat and again on an additional combat', () => {
    let s = newGame(players);
    put(s, 'P2', PROGRAM);
    s = goTo(s, 'beginCombat');
    expect(s.pending.kind).toBe('priority');
    s = begin(players);
    s = settle(act(s, { type: 'ChooseModes', player: 'P1', modes: [0] })).state;
    s = goTo(s, 'endCombat');
    s.extraCombats = 1;
    s = goTo(s, 'beginCombat');
    expect(s.pending.kind).toBe('chooseModes');
  });

  it('exposes chosen modes to every player and lets the AI choose both and recipients', () => {
    let s = begin(players, true);
    const bot = basicAi(1);
    const choice = bot(s, getLegalActions(s));
    expect(choice).toEqual({ type: 'ChooseModes', player: 'P1', modes: [0, 1] });
    s = act(s, choice);
    for (const pid of s.turnOrder) expect(viewFor(s, pid).stack[0]).toMatchObject({ modes: [0, 1] });
    s = settle(s).state;
    s = act(s, bot(s, getLegalActions(s)));
    expect(s.cards[tokens(s)[0]!]!.counters).toBe(1);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('repairs a pending mode choice if its controller concedes', () => {
    const s = begin(players);
    const result = act(s, { type: 'Concede', player: 'P1' });
    expect(result.triggerQueue.some((t) => t.controller === 'P1')).toBe(false);
    expect(checkInvariants(result)).toEqual([]);
    expect(result.pending.kind).not.toBe('chooseModes');
  });

  it('omits modes with unavailable mandatory targets and removes a trigger with no legal mode', () => {
    const initial = newGame(players);
    initial.cardDefs = { ...initial.cardDefs, [PROGRAM]: { ...initial.cardDefs[PROGRAM]!, triggers: [{
      when: 'BeginCombat', effects: [], modes: [
        [{ effect: 'CreateToken', target: 'You', token: 'soldier-token', amount: 1 }],
        [{ effect: 'Destroy', target: 'OpponentCreature' }],
      ],
    }] } };
    put(initial, 'P1', PROGRAM);
    let s = goTo(initial, 'beginCombat');
    expect(modes(s).map((a) => a.modes)).toEqual([[0]]);
    expect(rejected(s, { type: 'ChooseModes', player: 'P1', modes: [1] })).toMatch(/legal set/);
    const target = put(s, 'P2', 'undercity-dire-rat');
    s = act(s, { type: 'ChooseModes', player: 'P1', modes: [1] });
    expect(s.stack[0]!.targets).toEqual([{ kind: 'card', card: target }]);
    s = settle(s).state;
    expect(s.cards[target]!.zone).toBe('graveyard');

    const impossible = newGame(players);
    impossible.cardDefs = { ...impossible.cardDefs, [PROGRAM]: { ...impossible.cardDefs[PROGRAM]!, triggers: [{
      when: 'BeginCombat', effects: [], modes: [
        [{ effect: 'Destroy', target: 'OpponentCreature' }],
        [{ effect: 'Tap', target: 'OpponentCreature' }],
      ],
    }] } };
    put(impossible, 'P1', PROGRAM);
    s = goTo(impossible, 'beginCombat');
    expect(s.pending.kind).toBe('priority');
    expect(s.stack).toEqual([]);
    expect(s.triggerQueue).toEqual([]);
    expect(checkInvariants(s)).toEqual([]);
  });
});
