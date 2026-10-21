import { describe, expect, it } from 'vitest';
import { getLegalActions, type Attack, type Block, type GameState, type PlayerId } from '../src/index.ts';
import { act, addMana, eventsOf, newGame, passAll, passUntil, playerIds, put, rejected, setTurn, zoneOf } from './helpers.ts';

const player = (p: string) => ({ kind: 'player' as const, player: p });
const card = (c: string) => ({ kind: 'card' as const, card: c });

/** Answers every pending trigger-target choice with `target`. */
function chooseEach(s: GameState, target: PlayerId) {
  while (s.pending.kind === 'chooseTargets') {
    s = act(s, { type: 'ChooseTargets', player: s.pending.player, targets: [player(target)] }).state;
  }
  return s;
}

/** P1 attacks, defenders block as given, and combat damage is dealt. */
function fight(s: GameState, attacks: Attack[], blocksBy: Record<string, Block[]> = {}) {
  s = passUntil(s, 'declareAttackers');
  s = act(s, { type: 'DeclareAttackers', player: 'P1', attacks }).state;
  s = passAll(s).state;
  while (s.pending.kind === 'declareBlockers') {
    const who = s.pending.player;
    s = act(s, { type: 'DeclareBlockers', player: who, blocks: blocksBy[who] ?? [] }).state;
  }
  return passAll(s);
}

const handSize = (s: GameState, p: PlayerId) => s.players[p]!.hand.length;

describe.each([2, 3, 4])('triggered abilities, %i players', (n) => {
  const opponents = playerIds(n).slice(1);
  const last = opponents.at(-1)!;

  it('an enters trigger goes on the stack after the permanent resolves, and resolves on its own', () => {
    let s = newGame(n);
    const tyrant = put(s, 'P1', 'tyrant', 'hand');
    const mine = put(s, 'P1', 'bear');
    const theirs = opponents.map((p) => put(s, p, 'bear'));
    addMana(s, 'P1', { U: 6 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: tyrant }).state;

    const resolved = passAll(s);
    s = resolved.state;
    expect(zoneOf(s, tyrant)).toBe('battlefield');
    expect(eventsOf(resolved.events, 'AbilityTriggered')).toEqual([
      expect.objectContaining({ card: tyrant, ability: 0, controller: 'P1', targets: [] }),
    ]);
    expect(s.stack).toEqual([expect.objectContaining({ kind: 'ability', source: tyrant })]);
    expect(s.pending).toEqual({ kind: 'priority', player: 'P1', passes: 0 });

    s = passAll(s).state;
    expect(s.stack).toEqual([]);
    for (const id of theirs) expect(s.cards[id]!.tapped).toBe(true);
    expect(s.cards[mine]!.tapped).toBe(false);
  });

  it('a dies trigger works from the graveyard and asks for a target only when there is a choice', () => {
    let s = newGame(n);
    const drainer = put(s, 'P1', 'drainer');
    const murder = put(s, 'P1', 'murder', 'hand');
    addMana(s, 'P1', { B: 2 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: murder, targets: [card(drainer)] }).state;
    s = passAll(s).state;
    expect(zoneOf(s, drainer)).toBe('graveyard');

    if (n === 2) {
      // Only one opponent: the target is picked automatically.
      expect(s.stack).toEqual([expect.objectContaining({ source: drainer, targets: [player('P2')] })]);
    } else {
      expect(s.pending).toEqual({ kind: 'chooseTargets', player: 'P1', then: 'P1' });
      expect(getLegalActions(s)).toHaveLength(n - 1);
      expect(rejected(s, { type: 'ChooseTargets', player: 'P1', targets: [player('P1')] })).toMatch(/not legal/);
      expect(rejected(s, { type: 'PassPriority', player: 'P1' })).toMatch(/do not have priority/);
      s = chooseEach(s, last);
    }
    s = passAll(s).state;
    const victim = n === 2 ? 'P2' : last;
    expect(s.players[victim]!.life).toBe(19);
    expect(s.players.P1!.life).toBe(21);
  });

  it('creatures that die at the same time see each other die', () => {
    let s = newGame(n);
    const drainer = put(s, 'P1', 'drainer');
    const bear = put(s, 'P1', 'bear');
    const [g1, g2] = [put(s, 'P2', 'giant'), put(s, 'P2', 'giant')];
    const r = fight(
      s,
      [
        { attacker: drainer, defender: 'P2' },
        { attacker: bear, defender: 'P2' },
      ],
      {
        P2: [
          { blocker: g1, attacker: drainer },
          { blocker: g2, attacker: bear },
        ],
      },
    );
    s = chooseEach(r.state, 'P2');
    expect(s.stack.filter((i) => i.kind === 'ability')).toHaveLength(2);
    s = passAll(passAll(s).state).state;
    expect(s.players.P2!.life).toBe(18);
    expect(s.players.P1!.life).toBe(22);
  });

  it('"one or more" triggers once per batch, and "once each turn" only once per turn', () => {
    let s = newGame(n);
    put(s, 'P1', 'mourner');
    const [bear, ogre] = [put(s, 'P1', 'bear'), put(s, 'P1', 'ogre')];
    const [g1, g2] = [put(s, 'P2', 'giant'), put(s, 'P2', 'giant')];
    const wall = put(s, 'P1', 'wall');
    const murders = [put(s, 'P1', 'murder', 'hand'), put(s, 'P1', 'murder', 'hand')];
    const before = handSize(s, 'P1');

    s = fight(
      s,
      [
        { attacker: bear, defender: 'P2' },
        { attacker: ogre, defender: 'P2' },
      ],
      {
        P2: [
          { blocker: g1, attacker: bear },
          { blocker: g2, attacker: ogre },
        ],
      },
    ).state;
    expect(s.stack).toHaveLength(1);
    s = passAll(s).state;
    expect(handSize(s, 'P1')).toBe(before + 1);

    // Another death the same turn doesn't trigger it again.
    addMana(s, 'P1', { B: 2 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: murders[0]!, targets: [card(wall)] }).state;
    s = passAll(s).state;
    expect(zoneOf(s, wall)).toBe('graveyard');
    expect(s.stack).toEqual([]);

    // Next turn it can trigger again.
    s = passUntil(s, 'upkeep');
    expect(s.activePlayer).toBe('P2');
    const bear2 = put(s, 'P1', 'bear');
    s.pending = { kind: 'priority', player: 'P1', passes: 0 };
    addMana(s, 'P1', { B: 2 });
    s = act(s,{ type: 'CastSpell', player: 'P1', card: murders[1]!, targets: [card(bear2)] }).state;
    s = passAll(s).state;
    expect(s.stack).toHaveLength(1);
    const drew = passAll(s);
    expect(eventsOf(drew.events, 'CardDrawn')).toEqual([expect.objectContaining({ player: 'P1' })]);
  });

  it('a graveyard trigger with an optional mana cost: decline, then pay with a land', () => {
    let s = newGame(n);
    const revenant = put(s, 'P1', 'revenant', 'graveyard');
    const swamp = put(s, 'P1', 'swamp');
    const [study1, study2] = [put(s, 'P1', 'study', 'hand'), put(s, 'P1', 'study', 'hand')];
    const creatureSpell = put(s, 'P1', 'bear', 'hand');
    addMana(s, 'P1', { U: 4, G: 2 });

    // Creature spells don't trigger it.
    s = act(s, { type: 'CastSpell', player: 'P1', card: creatureSpell }).state;
    expect(s.stack).toHaveLength(1);
    s = passAll(s).state;

    s = act(s, { type: 'CastSpell', player: 'P1', card: study1 }).state;
    expect(s.stack.map((i) => i.kind)).toEqual(['spell', 'ability']);
    s = passAll(s).state;
    expect(s.pending).toEqual({ kind: 'decide', player: 'P1', item: s.stack.at(-1)!.id });
    expect(getLegalActions(s)).toEqual(
      expect.arrayContaining([
        { type: 'Decide', player: 'P1', accept: false },
        { type: 'ActivateManaAbility', player: 'P1', card: swamp, mana: 'B' },
      ]),
    );
    expect(rejected(s, { type: 'Decide', player: 'P1', accept: true })).toMatch(/Not enough mana/);
    s = act(s, { type: 'Decide', player: 'P1', accept: false }).state;
    expect(zoneOf(s, revenant)).toBe('graveyard');
    expect(s.stack.map((i) => i.kind)).toEqual(['spell']);
    s = passAll(s).state; // study resolves

    s = act(s, { type: 'CastSpell', player: 'P1', card: study2 }).state;
    s = passAll(s).state;
    s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: swamp, mana: 'B' }).state;
    expect(s.pending.kind).toBe('decide');
    const paid = act(s, { type: 'Decide', player: 'P1', accept: true });
    s = paid.state;
    expect(zoneOf(s, revenant)).toBe('hand');
    expect(s.players.P1!.manaPool.B).toBe(0);
    expect(s.pending).toEqual({ kind: 'priority', player: 'P1', passes: 0 });

    // It enters tapped when cast.
    addMana(s, 'P1', { B: 3 });
    s = passAll(s).state; // study resolves
    s = act(s, { type: 'CastSpell', player: 'P1', card: revenant }).state;
    s = passAll(s).state;
    expect(s.cards[revenant]!.tapped).toBe(true);
  });

  it('combat damage triggers once per creature that hits a player', () => {
    let s = newGame(n);
    const tyrant = put(s, 'P1', 'tyrant');
    const bear = put(s, 'P1', 'bear');
    const blocker = put(s, 'P2', 'wall');
    const before = handSize(s, 'P1');
    const attacks: Attack[] = [
      { attacker: tyrant, defender: last },
      { attacker: bear, defender: 'P2' },
    ];
    // Blocked creatures don't trigger it.
    const blocked = fight(s, attacks, { P2: [{ blocker, attacker: bear }] });
    expect(eventsOf(blocked.events, 'AbilityTriggered')).toHaveLength(1);
    s = passAll(blocked.state).state;
    expect(handSize(s, 'P1')).toBe(before + 1);

    let s2 = newGame(n);
    const t2 = put(s2, 'P1', 'tyrant');
    const b2 = put(s2, 'P1', 'bear');
    s2 = fight(s2, [
      { attacker: t2, defender: last },
      { attacker: b2, defender: 'P2' },
    ]).state;
    expect(s2.stack).toHaveLength(2);
    s2 = passAll(passAll(s2).state).state;
    expect(handSize(s2, 'P1')).toBe(before + 2);
  });

  it('attack triggers resolve before blockers are declared', () => {
    let s = newGame(n);
    const scout = put(s, 'P1', 'scout');
    const before = handSize(s, 'P1');
    s = passUntil(s, 'declareAttackers');
    s = act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: scout, defender: last }] }).state;
    expect(s.stack).toEqual([expect.objectContaining({ source: scout })]);
    s = passAll(s).state;
    expect(handSize(s, 'P1')).toBe(before + 1);
    expect(s.step).toBe('declareAttackers');
  });

  it('beginning of combat triggers only on your own turn', () => {
    let s = newGame(n);
    const mine = put(s, 'P1', 'herald');
    for (const p of opponents) put(s, p, 'herald');
    s = passUntil(s, 'beginCombat');
    expect(s.stack).toEqual([expect.objectContaining({ source: mine, controller: 'P1' })]);
    s = passAll(s).state;
    expect(s.players.P1!.life).toBe(21);
    expect(opponents.map((p) => s.players[p]!.life)).toEqual(opponents.map(() => 20));
  });

  it('upkeep triggers with a life cost', () => {
    let s = setTurn(newGame(n), last, 'end');
    put(s, 'P1', 'ascetic');
    s = passAll(s).state;
    expect(s.activePlayer).toBe('P1');
    expect(s.step).toBe('upkeep');
    expect(s.stack).toHaveLength(1);
    const before = handSize(s, 'P1');
    s = passAll(s).state;
    expect(s.pending.kind).toBe('decide');
    s = act(s, { type: 'Decide', player: 'P1', accept: true }).state;
    expect(s.players.P1!.life).toBe(19);
    expect(handSize(s, 'P1')).toBe(before + 1);

    // You can't pay more life than you have.
    let poor = setTurn(newGame(n), last, 'end');
    put(poor, 'P1', 'ascetic');
    poor = passAll(passAll(poor).state).state;
    poor.players.P1!.life = 0;
    expect(rejected(poor, { type: 'Decide', player: 'P1', accept: true })).toMatch(/enough life/);
  });

  it('filters by category: a nonland permanent entering triggers it, a land does not', () => {
    let s = newGame(n);
    put(s, 'P1', 'gardener');
    const bear = put(s, 'P1', 'bear', 'hand');
    const island = put(s, 'P1', 'island', 'hand');
    addMana(s, 'P1', { G: 2 });
    s = act(s, { type: 'PlayLand', player: 'P1', card: island }).state;
    expect(s.stack).toEqual([]);
    s = act(s, { type: 'CastSpell', player: 'P1', card: bear }).state;
    s = passAll(s).state;
    expect(s.stack).toHaveLength(1);
    s = passAll(s).state;
    expect(s.players.P1!.life).toBe(21);
  });

  it('"you may" without a cost', () => {
    for (const accept of [true, false]) {
      let s = newGame(n);
      const healer = put(s, 'P1', 'healer', 'hand');
      addMana(s, 'P1', { W: 2 });
      s = act(s, { type: 'CastSpell', player: 'P1', card: healer }).state;
      s = passAll(passAll(s).state).state;
      const decided = act(s, { type: 'Decide', player: 'P1', accept });
      expect(eventsOf(decided.events, 'Decided')).toEqual([expect.objectContaining({ player: 'P1', accepted: accept })]);
      expect(decided.state.players.P1!.life).toBe(accept ? 22 : 20);
    }
  });

  it('a trigger whose only target becomes illegal does nothing', () => {
    let s = newGame(n);
    const pinger = put(s, 'P1', 'pinger', 'hand');
    const bear = put(s, 'P2', 'bear');
    const murder = put(s, 'P1', 'murder', 'hand');
    addMana(s, 'P1', { R: 2, B: 2 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: pinger }).state;
    s = passAll(s).state;
    // Any target: always a choice.
    expect(s.pending).toEqual({ kind: 'chooseTargets', player: 'P1', then: 'P1' });
    expect(rejected(s, { type: 'ChooseTargets', player: 'P2', targets: [card(bear)] })).toMatch(/not choosing targets/);
    expect(rejected(s, { type: 'ChooseTargets', player: 'P1', targets: [] })).toMatch(/needs 1 target/);
    s = act(s, { type: 'ChooseTargets', player: 'P1', targets: [card(bear)] }).state;
    s = act(s, { type: 'CastSpell', player: 'P1', card: murder, targets: [card(bear)] }).state;
    s = passAll(s).state; // murder resolves
    const r = passAll(s);
    expect(eventsOf(r.events, 'StackItemResolved')).toEqual([expect.objectContaining({ card: pinger, fizzled: true })]);
    expect(eventsOf(r.events, 'DamageDealt')).toEqual([]);
  });

  it("puts the active player's triggers on the stack first, so the others' resolve first", () => {
    let s = newGame(n);
    const bear = put(s, 'P1', 'bear');
    const blocker = put(s, 'P2', 'bear');
    const mine = put(s, 'P1', 'drainer');
    const theirs = put(s, 'P2', 'drainer');
    s = fight(s, [{ attacker: bear, defender: 'P2' }], { P2: [{ blocker, attacker: bear }] }).state;
    if (n > 2) {
      expect(s.pending).toMatchObject({ kind: 'chooseTargets', player: 'P1' });
      s = act(s, { type: 'ChooseTargets', player: 'P1', targets: [player('P2')] }).state;
      expect(s.pending).toMatchObject({ kind: 'chooseTargets', player: 'P2' });
      s = act(s, { type: 'ChooseTargets', player: 'P2', targets: [player('P1')] }).state;
    }
    expect(s.stack.map((i) => i.kind === 'ability' && i.source)).toEqual([mine, theirs]);
    const r = passAll(s);
    expect(eventsOf(r.events, 'StackItemResolved').map((e) => e.card)).toEqual([theirs]);
  });

  it('a player who leaves takes their abilities off the stack and out of any pending decision', () => {
    let s = newGame(n);
    put(s, 'P2', 'healer', 'hand');
    const healer = put(s, 'P1', 'healer', 'hand');
    addMana(s, 'P1', { W: 2 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: healer }).state;
    s = passAll(passAll(s).state).state;
    expect(s.pending.kind).toBe('decide');
    if (n === 2) {
      expect(act(s, { type: 'Concede', player: 'P1' }).state.winner).toBe('P2');
      return;
    }
    // Someone else leaving doesn't interrupt the decision.
    s = act(s, { type: 'Concede', player: last }).state;
    expect(s.pending.kind).toBe('decide');
    s = act(s, { type: 'Decide', player: 'P1', accept: true }).state;
    expect(s.players.P1!.life).toBe(22);
  });
});

describe('triggered abilities and leaving the game', () => {
  it('drops the queued trigger of a player who leaves while choosing its target', () => {
    let s = newGame(3);
    const drainer = put(s, 'P2', 'drainer');
    const murder = put(s, 'P1', 'murder', 'hand');
    addMana(s, 'P1', { B: 2 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: murder, targets: [card(drainer)] }).state;
    s = passAll(s).state;
    expect(s.pending).toEqual({ kind: 'chooseTargets', player: 'P2', then: 'P1' });
    s = act(s, { type: 'Concede', player: 'P2' }).state;
    expect(s.triggerQueue).toEqual([]);
    expect(s.pending).toEqual({ kind: 'priority', player: 'P1', passes: 0 });
  });
});
