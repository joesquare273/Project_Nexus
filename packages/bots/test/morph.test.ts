// Face-down permanents (rule 708): morph, disguise, manifest, cloak, manifest
// dread, effects that turn permanents face up or down, copying a face-down
// permanent, "when turned face up" triggers, and what other players see.
// Test-only card definitions stand in where the card pool has no such card.

import { describe, expect, it } from 'vitest';
import { AliasBook, currentDefinition, getLegalActions, hasKeyword, playerUpdate, powerOf, toughnessOf, type CardDefinition, type GameState } from '@nexus/engine';
import { act, actWithEvents, cast, mana, newGame, put } from './kit-helpers.ts';

const TEST_CARDS: CardDefinition[] = [
  {
    id: 'test-morph-drawer', name: 'Test Morph Drawer', types: ['creature'], manaCost: '{3}{U}', power: 3, toughness: 3, colors: ['U'], morph: '{1}{U}',
    triggers: [{ when: 'TurnedFaceUp', effects: [{ effect: 'DrawCards', amount: 2, target: 'You' }] }],
  },
  { id: 'test-disguised', name: 'Test Disguised', types: ['creature'], manaCost: '{4}{G}', power: 5, toughness: 5, colors: ['G'], disguise: '{2}{G}' },
  { id: 'test-bear', name: 'Test Bear', types: ['creature'], manaCost: '{1}{G}', power: 2, toughness: 2, colors: ['G'], keywords: ['Trample'] },
  { id: 'test-bolt', name: 'Test Bolt', types: ['instant'], manaCost: '{R}', colors: ['R'], effects: [{ effect: 'DealDamage', amount: 3, target: 'AnyTarget' }] },
  { id: 'test-manifest', name: 'Test Manifest', types: ['sorcery'], manaCost: '{1}', colors: [], effects: [{ effect: 'Manifest', amount: 1, target: 'You' }] },
  { id: 'test-cloak', name: 'Test Cloak', types: ['sorcery'], manaCost: '{1}', colors: [], effects: [{ effect: 'Manifest', amount: 1, cloak: true, target: 'You' }] },
  { id: 'test-dread', name: 'Test Dread', types: ['sorcery'], manaCost: '{1}', colors: [], effects: [{ effect: 'ManifestDread', target: 'You' }] },
  { id: 'test-face-down', name: 'Test Face Down', types: ['instant'], manaCost: '{1}', colors: [], effects: [{ effect: 'TurnFaceDown', target: 'TargetPermanent', filter: { types: ['creature'] } }] },
  { id: 'test-face-up', name: 'Test Face Up', types: ['instant'], manaCost: '{1}', colors: [], effects: [{ effect: 'TurnFaceUp', target: 'TargetPermanent', filter: { types: ['creature'], faceDown: true } }] },
  { id: 'test-copier', name: 'Test Copier', types: ['instant'], manaCost: '{1}', colors: [], effects: [{ effect: 'CreateTokenCopy', target: 'TargetPermanent', filter: { types: ['creature'] } }] },
];

function game(): GameState {
  const s = newGame();
  s.cardDefs = { ...s.cardDefs, ...Object.fromEntries(TEST_CARDS.map((d) => [d.id, d])) };
  return s;
}

const card = (id: string) => ({ kind: 'card' as const, card: id });
const resolve = (s: GameState) => act(act(s, { type: 'PassPriority', player: 'P1' }), { type: 'PassPriority', player: 'P2' });
let aliases = 0;
const seenBy = (s: GameState, viewer: string, events: Parameters<typeof playerUpdate>[3] = []) => playerUpdate(s, viewer, new AliasBook(() => `x${aliases++}`), events);
const faceUp = (s: GameState, id: string) => getLegalActions(s).find((a) => a.type === 'ActivateAbility' && a.card === id && currentDefinition(s, s.cards[id]!).activated?.[a.ability]?.turnFaceUp);

describe('face-down permanents', () => {
  it('turning a morph face up triggers "when this is turned face up"; it keeps its damage and isn\'t entering again', () => {
    let s = game();
    const drawer = put(s, 'P1', 'test-morph-drawer', 'hand');
    mana(s, 'P1', { C: 3 });
    s = resolve(act(s, getLegalActions(s).find((a) => a.type === 'CastSpell' && a.card === drawer && a.faceDown)!));
    expect(currentDefinition(s, s.cards[drawer]!).triggers ?? []).toEqual([]);
    s.cards[drawer]!.damage = 1;
    const hand = s.players.P1!.hand.length;
    mana(s, 'P1', { U: 1, C: 1 });
    const turned = cast(s, faceUp(s, drawer)!);
    s = turned.state;
    expect(s.cards[drawer]!.faceDown).toBeUndefined();
    expect(s.players.P1!.hand.length).toBe(hand + 2);
    expect(s.cards[drawer]!.damage).toBe(1);
    expect(turned.events.some((e) => e.type === 'CardMoved' && e.card === drawer)).toBe(false);
    expect(powerOf(s, s.cards[drawer]!)).toBe(3);
  });

  it('turning face up is a special action: abilities that can\'t be activated don\'t stop it', () => {
    let s = game();
    const drawer = put(s, 'P1', 'test-morph-drawer', 'battlefield', { faceDown: true });
    // Nothing on the stack, and no AbilityActivated event.
    mana(s, 'P1', { U: 1, C: 1 });
    const r = actWithEvents(s, faceUp(s, drawer)!);
    expect(r.events.some((e) => e.type === 'AbilityActivated')).toBe(false);
    expect(r.state.stack.map((i) => i.kind)).toEqual(['ability']); // only the "turned face up" trigger
    s = r.state;
    expect(s.cards[drawer]!.faceDown).toBeUndefined();
  });

  it('disguise: cast face down for {3} as a 2/2 with ward {2}, turned face up for its disguise cost', () => {
    let s = game();
    const d = put(s, 'P1', 'test-disguised', 'hand');
    mana(s, 'P1', { C: 3 });
    const option = getLegalActions(s).find((a) => a.type === 'CastSpell' && a.card === d && a.faceDown)!;
    expect(option).toBeDefined();
    s = resolve(act(s, option));
    const c = s.cards[d]!;
    expect([c.faceDown, c.faceDownWard, powerOf(s, c), toughnessOf(s, c), currentDefinition(s, c).ward]).toEqual([true, true, 2, 2, 2]);
    // The opponent sees a face-down creature with ward, nothing more.
    const theirs = Object.values(seenBy(s, 'P2').state.cards).find((x) => x.zone === 'battlefield')!;
    expect(theirs.defId).toBe('?facedown-ward');
    mana(s, 'P1', { G: 1, C: 2 });
    s = cast(s, faceUp(s, d)!).state;
    expect([s.cards[d]!.faceDownWard, powerOf(s, s.cards[d]!), currentDefinition(s, s.cards[d]!).ward]).toEqual([undefined, 5, undefined]);
  });

  it('manifest: the top card enters face down; a creature card turns face up for its mana cost, a noncreature card can\'t', () => {
    let s = game();
    const bear = put(s, 'P1', 'test-bear', 'library');
    const spell = put(s, 'P1', 'test-manifest', 'hand');
    mana(s, 'P1', { C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [] }).state;
    const c = s.cards[bear]!;
    expect([c.zone, c.faceDown, c.manifested, powerOf(s, c), hasKeyword(s, c, 'Trample')]).toEqual(['battlefield', true, true, 2, false]);
    expect(JSON.stringify(seenBy(s, 'P2').state)).not.toContain('test-bear');
    mana(s, 'P1', { G: 1, C: 1 });
    s = cast(s, faceUp(s, bear)!).state;
    expect([s.cards[bear]!.faceDown, hasKeyword(s, s.cards[bear]!, 'Trample')]).toEqual([undefined, true]);

    // A manifested instant: no way to turn it face up for a cost; an effect only reveals it.
    let u = game();
    const bolt = put(u, 'P1', 'test-bolt', 'library');
    const spell2 = put(u, 'P1', 'test-manifest', 'hand');
    const flip = put(u, 'P1', 'test-face-up', 'hand');
    mana(u, 'P1', { C: 2 });
    u = cast(u, { type: 'CastSpell', player: 'P1', card: spell2, targets: [] }).state;
    expect(u.cards[bolt]!.faceDown).toBe(true);
    expect(faceUp(u, bolt)).toBeUndefined();
    const r = cast(u, { type: 'CastSpell', player: 'P1', card: flip, targets: [card(bolt)] });
    expect(r.state.cards[bolt]!.faceDown).toBe(true);
    expect(r.events.some((e) => e.type === 'CardRevealed' && e.card === bolt)).toBe(true);
  });

  it('cloak: manifested with ward {2}', () => {
    let s = game();
    const bear = put(s, 'P1', 'test-bear', 'library');
    const spell = put(s, 'P1', 'test-cloak', 'hand');
    mana(s, 'P1', { C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [] }).state;
    expect([s.cards[bear]!.faceDown, currentDefinition(s, s.cards[bear]!).ward]).toEqual([true, 2]);
  });

  it('manifest dread: look at two, manifest one, the other goes to the graveyard', () => {
    let s = game();
    const bear = put(s, 'P1', 'test-bear', 'library');
    const bolt = put(s, 'P1', 'test-bolt', 'library');
    const spell = put(s, 'P1', 'test-dread', 'hand');
    mana(s, 'P1', { C: 1 });
    s = resolve(act(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [] }));
    expect(s.pending.kind).toBe('chooseCards');
    s = act(s, { type: 'ChooseCards', player: 'P1', cards: [bear] });
    expect([s.cards[bear]!.zone, s.cards[bear]!.faceDown, s.cards[bolt]!.zone]).toEqual(['battlefield', true, 'graveyard']);
  });

  it('an effect turns a creature face down (a nameless 2/2 that can\'t be turned up unless it has morph) and another turns it face up', () => {
    let s = game();
    const bear = put(s, 'P1', 'test-bear');
    const down = put(s, 'P1', 'test-face-down', 'hand');
    const up = put(s, 'P1', 'test-face-up', 'hand');
    mana(s, 'P1', { C: 2 });
    s.cards[bear]!.counters = 1;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: down, targets: [card(bear)] }).state;
    const c = s.cards[bear]!;
    expect([c.faceDown, currentDefinition(s, c).name, powerOf(s, c), hasKeyword(s, c, 'Trample')]).toEqual([true, 'Face-down creature', 3, false]);
    expect(faceUp(s, bear)).toBeUndefined();
    const r = cast(s, { type: 'CastSpell', player: 'P1', card: up, targets: [card(bear)] });
    s = r.state;
    expect([s.cards[bear]!.faceDown, hasKeyword(s, s.cards[bear]!, 'Trample')]).toEqual([undefined, true]);
    expect(r.events.some((e) => e.type === 'TurnedFaceUp' && e.card === bear)).toBe(true);
  });

  it('a copy of a face-down creature is a face-up nameless 2/2 that shows nothing of the card', () => {
    let s = game();
    const d = put(s, 'P2', 'test-disguised', 'battlefield', { faceDown: true, faceDownWard: true });
    const copier = put(s, 'P1', 'test-copier', 'hand');
    // Its ward {2} is paid as it's targeted.
    mana(s, 'P1', { C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: copier, targets: [card(d)] }).state;
    const token = s.players.P1!.battlefield.map((id) => s.cards[id]!).find((c) => c.isToken)!;
    expect(token.faceDown).toBeUndefined();
    const def = currentDefinition(s, token);
    expect([def.name, def.ward, powerOf(s, token), toughnessOf(s, token)]).toEqual(['Face-down creature', 2, 2, 2]);
    expect(token.defId).toBe('?facedown-ward');
    expect(JSON.stringify(token)).not.toContain('test-disguised');
    // It can't be turned face up.
    expect(faceUp(s, token.id)).toBeUndefined();
  });

  it('face-down cards are revealed to everyone when the game ends', () => {
    const s = game();
    const d = put(s, 'P1', 'test-disguised', 'battlefield', { faceDown: true, faceDownWard: true });
    expect(Object.values(seenBy(s, 'P2').state.cards).some((c) => c.defId === 'test-disguised')).toBe(false);
    s.pending = { kind: 'gameOver' };
    expect(Object.values(seenBy(s, 'P2').state.cards).some((c) => c.defId === 'test-disguised')).toBe(true);
    void d;
  });

  it('a face-down permanent that leaves the battlefield is revealed and loses its face-down status', () => {
    let s = game();
    const bear = put(s, 'P1', 'test-bear', 'battlefield', { faceDown: true, manifested: true });
    const bolt = put(s, 'P1', 'test-bolt', 'hand');
    mana(s, 'P1', { R: 1 });
    const r = cast(s, { type: 'CastSpell', player: 'P1', card: bolt, targets: [card(bear)] });
    s = r.state;
    const c = s.cards[bear]!;
    expect([c.zone, c.faceDown, c.manifested]).toEqual(['graveyard', undefined, undefined]);
    const moved = r.events.find((e) => e.type === 'CardMoved' && e.card === bear);
    expect(moved && 'faceDown' in moved ? moved.faceDown : undefined).toBeUndefined();
    expect(Object.values(seenBy(s, 'P2', r.events).state.cards).some((x) => x.defId === 'test-bear')).toBe(true);
  });
});
