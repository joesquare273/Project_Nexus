// Secret Lair Chaos Vault: Commander Reinforcements (Edge of Eternities), sold in the Store:
// Featuring Deathburger (Counter Intelligence) and Alien Auroras (World Shaper).

import { describe, expect, it } from 'vitest';
import { getLegalActions, hasKeyword, powerOf, toughnessOf, type GameState } from '@nexus/engine';
import { act, card, cast, goTo, mana, newGame, put, rejected, settle } from './kit-helpers.ts';

const zone = (s: GameState, id: string) => s.cards[id]!.zone;

describe('Featuring Deathburger', () => {
  it('Ethersworn Canonist: one nonartifact spell each turn per player, artifact spells still allowed', () => {
    let s = newGame();
    put(s, 'P2', 'ethersworn-canonist');
    const first = put(s, 'P1', 'rhystic-study', 'hand');
    const second = put(s, 'P1', 'brainstorm', 'hand');
    const ring = put(s, 'P1', 'sol-ring', 'hand');
    mana(s, 'P1', { U: 2, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: first }).state;
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: second })).toMatch(/nonartifact/);
    expect(getLegalActions(s).some((a) => a.type === 'CastSpell' && a.card === second)).toBe(false);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: ring }).state;
    expect(zone(s, ring)).toBe('battlefield');
  });

  it('Goblin Engineer puts an artifact from the library into the graveyard and brings back one with mana value 3 or less', () => {
    let s = newGame();
    const engineer = put(s, 'P1', 'goblin-engineer', 'hand');
    const copter = put(s, 'P1', 'smugglers-copter', 'library');
    const fodder = put(s, 'P1', 'sol-ring');
    mana(s, 'P1', { R: 2, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: engineer }).state;
    expect(zone(s, copter)).toBe('graveyard');
    s.cards[engineer]!.summoningSick = false;
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: engineer, ability: 0, costCards: [fodder], targets: [card(copter)] }).state;
    expect(zone(s, fodder)).toBe('graveyard');
    expect(zone(s, copter)).toBe('battlefield');
  });

  it('Dance of the Manse returns up to X artifacts and non-Aura enchantments with mana value X or less; at X 6 they are 4/4 creatures', () => {
    let s = newGame();
    const dance = put(s, 'P1', 'dance-of-the-manse', 'hand');
    const ring = put(s, 'P1', 'sol-ring', 'graveyard');
    const study = put(s, 'P1', 'rhystic-study', 'graveyard');
    mana(s, 'P1', { W: 1, U: 1, C: 2 });
    // X = 2: Rhystic Study (mana value 3) can't be chosen.
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: dance, x: 2, targets: [card(study), { kind: 'none' }] })).toBeTruthy();
    let t = cast(s, { type: 'CastSpell', player: 'P1', card: dance, x: 2, targets: [card(ring), { kind: 'none' }] }).state;
    expect(zone(t, ring)).toBe('battlefield');
    expect(t.cards[ring]!.animated).toBeUndefined();
    // X = 6: both come back as 4/4 creatures.
    s = newGame();
    const dance6 = put(s, 'P1', 'dance-of-the-manse', 'hand');
    const ring6 = put(s, 'P1', 'sol-ring', 'graveyard');
    const study6 = put(s, 'P1', 'rhystic-study', 'graveyard');
    mana(s, 'P1', { W: 1, U: 1, C: 6 });
    t = cast(s, { type: 'CastSpell', player: 'P1', card: dance6, x: 6, targets: [card(ring6), card(study6), ...Array(4).fill({ kind: 'none' })] }).state;
    expect([zone(t, ring6), zone(t, study6)]).toEqual(['battlefield', 'battlefield']);
    expect([powerOf(t, t.cards[ring6]!), toughnessOf(t, t.cards[study6]!)]).toEqual([4, 4]);
  });

  it('Arcbound Ravager enters with a +1/+1 counter, grows by sacrificing artifacts, and moves its counters as it dies (modular)', () => {
    let s = newGame();
    const ravager = put(s, 'P1', 'arcbound-ravager', 'hand');
    const ring = put(s, 'P1', 'sol-ring');
    const other = put(s, 'P1', 'ethersworn-canonist');
    mana(s, 'P1', { C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: ravager }).state;
    expect(powerOf(s, s.cards[ravager]!)).toBe(1);
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: ravager, ability: 0, costCards: [ring] }).state;
    expect(powerOf(s, s.cards[ravager]!)).toBe(2);
    // Sacrificing itself: its two counters go onto the Canonist.
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: ravager, ability: 0, costCards: [ravager] }, { accept: true, targets: (o) => o.find((t) => t[0]?.kind === 'card' && t[0].card === other)! }).state;
    expect(zone(s, ravager)).toBe('graveyard');
    expect(powerOf(s, s.cards[other]!)).toBe(4);
  });

  it('Foundry Inspector: artifact spells cost {1} less', () => {
    const s = newGame();
    put(s, 'P1', 'foundry-inspector');
    const stone = put(s, 'P1', 'mind-stone', 'hand');
    mana(s, 'P1', { C: 1 });
    const t = cast(s, { type: 'CastSpell', player: 'P1', card: stone }).state;
    expect(zone(t, stone)).toBe('battlefield');
  });
});

describe('Alien Auroras', () => {
  it('Reprocess: sacrifice any number of artifacts, creatures and lands, then draw that many', () => {
    let s = newGame();
    const spell = put(s, 'P1', 'reprocess', 'hand');
    const ring = put(s, 'P1', 'sol-ring');
    const land = put(s, 'P1', 'forest');
    const keep = put(s, 'P1', 'rhystic-study');
    mana(s, 'P1', { B: 2, C: 2 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: spell });
    s = settle(s).state;
    expect(s.pending.kind).toBe('chooseCards');
    if (s.pending.kind === 'chooseCards') {
      expect(s.pending.cards).not.toContain(keep);
      s = cast(s, { type: 'ChooseCards', player: 'P1', cards: [ring, land] }).state;
    }
    expect([zone(s, ring), zone(s, land), zone(s, keep)]).toEqual(['graveyard', 'graveyard', 'battlefield']);
    expect(s.players.P1!.hand).toHaveLength(2);
  });

  it("Aggressive Mining: you can't play lands; sacrifice a land to draw two, once each turn", () => {
    let s = newGame();
    const mining = put(s, 'P1', 'aggressive-mining');
    const a = put(s, 'P1', 'forest');
    const b = put(s, 'P1', 'mountain');
    const inHand = put(s, 'P1', 'plains', 'hand');
    expect(rejected(s, { type: 'PlayLand', player: 'P1', card: inHand })).toBeTruthy();
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: mining, ability: 0, costCards: [a] }).state;
    expect(s.players.P1!.hand).toHaveLength(3);
    expect(rejected(s, { type: 'ActivateAbility', player: 'P1', card: mining, ability: 0, costCards: [b] })).toBeTruthy();
  });

  it('Sylvan Safekeeper gives a creature you control shroud; Zuran Orb gains 2 life per land', () => {
    let s = newGame();
    const keeper = put(s, 'P1', 'sylvan-safekeeper');
    const orb = put(s, 'P1', 'zuran-orb');
    const a = put(s, 'P1', 'forest');
    const b = put(s, 'P1', 'mountain');
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: keeper, ability: 0, costCards: [a], targets: [card(keeper)] }).state;
    expect(hasKeyword(s, s.cards[keeper]!, 'Shroud')).toBe(true);
    const life = s.players.P1!.life;
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: orb, ability: 0, costCards: [b] }).state;
    expect(s.players.P1!.life).toBe(life + 2);
    expect(zone(s, b)).toBe('graveyard');
  });

  it('Crucible of Worlds: play lands from your graveyard', () => {
    let s = newGame();
    put(s, 'P1', 'crucible-of-worlds');
    const land = put(s, 'P1', 'forest', 'graveyard');
    s = goTo(s, 'main1');
    s = act(s, { type: 'PlayLand', player: 'P1', card: land });
    expect(zone(s, land)).toBe('battlefield');
  });
});
