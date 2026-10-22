// The precon mana cards: land searches, mana rocks and utility lands.
// Checked against the Oracle text with the real card data.

import { describe, expect, it } from 'vitest';
import { characteristics, getLegalActions, type GameState } from '@nexus/engine';
import { planTaps, tapActions } from '../src/index.ts';
import { act, card, cast, mana, newGame, put, rejected, settle } from './kit-helpers.ts';

const RAT = 'undercity-dire-rat';
const lands = (s: GameState, pid: string) => s.players[pid]!.battlefield.filter((id) => s.cardDefs[s.cards[id]!.defId]!.types.includes('land'));

describe('Land searches', () => {
  it('Rampant Growth: a basic land onto the battlefield tapped', () => {
    let s = newGame();
    const forest = put(s, 'P1', 'forest', 'library');
    const spell = put(s, 'P1', 'rampant-growth', 'hand');
    mana(s, 'P1', { G: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [] }).state;
    expect([s.cards[forest]!.zone, s.cards[forest]!.tapped]).toEqual(['battlefield', true]);
  });

  it('Farseek finds a Plains, Island, Swamp or Mountain (tapped), not a Forest', () => {
    let s = newGame();
    s.players.P1!.library = [];
    const forest = put(s, 'P1', 'forest', 'library');
    const plains = put(s, 'P1', 'plains', 'library');
    const spell = put(s, 'P1', 'farseek', 'hand');
    mana(s, 'P1', { G: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [] }).state;
    expect([s.cards[plains]!.zone, s.cards[plains]!.tapped, s.cards[forest]!.zone]).toEqual(['battlefield', true, 'library']);
  });

  it("Nature's Lore and Three Visits: a Forest onto the battlefield untapped", () => {
    for (const id of ['natures-lore', 'three-visits']) {
      let s = newGame();
      const forest = put(s, 'P1', 'forest', 'library');
      const spell = put(s, 'P1', id, 'hand');
      mana(s, 'P1', { G: 1, C: 1 });
      s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [] }).state;
      expect([s.cards[forest]!.zone, s.cards[forest]!.tapped]).toEqual(['battlefield', false]);
    }
  });

  it("Wayfarer's Bauble: {2}, {T}, sacrifice it for a basic land, tapped", () => {
    let s = newGame();
    const bauble = put(s, 'P1', 'wayfarers-bauble');
    const forest = put(s, 'P1', 'forest', 'library');
    mana(s, 'P1', { C: 2 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: bauble, ability: 0, targets: [] }).state;
    expect([s.cards[bauble]!.zone, s.cards[forest]!.zone, s.cards[forest]!.tapped]).toEqual(['graveyard', 'battlefield', true]);
  });

  it('Solemn Simulacrum: a basic land when it enters, a card when it dies', () => {
    let s = newGame();
    put(s, 'P1', 'island', 'library');
    const solemn = put(s, 'P1', 'solemn-simulacrum', 'hand');
    mana(s, 'P1', { C: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: solemn, targets: [] }).state;
    expect(lands(s, 'P1')).toHaveLength(1);
    const kill = put(s, 'P1', 'sephiroths-intervention', 'hand');
    mana(s, 'P1', { B: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: kill, targets: [card(solemn)] }).state;
    expect(s.players.P1!.hand).toHaveLength(1);
  });

  it('Demolition Field: destroy a nonbasic land an opponent controls; both players may find a basic land', () => {
    let s = newGame();
    const field = put(s, 'P1', 'demolition-field');
    const theirs = put(s, 'P2', 'command-tower');
    put(s, 'P2', 'island');
    mana(s, 'P1', { C: 2 });
    const targets = getLegalActions(s).filter((a) => a.type === 'ActivateAbility' && a.card === field);
    expect(targets.map((a) => (a.type === 'ActivateAbility' ? a.targets : []))).toEqual([[card(theirs)]]); // not the basic Island
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: field, ability: 0, targets: [card(theirs)] }).state;
    // Each player found a basic land: P2 replaces the Tower, P1 replaces the Field.
    expect([s.cards[theirs]!.zone, lands(s, 'P2').length, lands(s, 'P1').length]).toEqual(['graveyard', 2, 1]);
  });
});

describe('Mana rocks and utility lands', () => {
  it('Temple of the False God: {C}{C}, only with five or more lands', () => {
    const s = newGame();
    const temple = put(s, 'P1', 'temple-of-the-false-god');
    for (let i = 0; i < 3; i++) put(s, 'P1', 'island');
    expect(rejected(s, { type: 'ActivateManaAbility', player: 'P1', card: temple, mana: 'C' })).toMatch(/no mana ability/);
    put(s, 'P1', 'island');
    expect(act(s, { type: 'ActivateManaAbility', player: 'P1', card: temple, mana: 'C' }).players.P1!.manaPool.C).toBe(2);
  });

  it('Spire of Industry: {C}, or any color for 1 life while you control an artifact', () => {
    const s = newGame();
    const spire = put(s, 'P1', 'spire-of-industry');
    expect(rejected(s, { type: 'ActivateManaAbility', player: 'P1', card: spire, mana: 'R' })).toMatch(/can't produce/);
    put(s, 'P1', 'thought-vessel');
    const t = act(s, { type: 'ActivateManaAbility', player: 'P1', card: spire, mana: 'R' });
    expect([t.players.P1!.manaPool.R, t.players.P1!.life]).toEqual([1, 19]);
    // Auto-pay takes {C} from it for generic costs, so no life is paid.
    expect(planTaps(s, 'P1', '{1}')).toEqual([{ card: expect.any(String), mana: 'C' }]);
  });

  it('Millikin: {T}, mill a card: add {C}', () => {
    const s = newGame();
    const millikin = put(s, 'P1', 'millikin');
    const top = put(s, 'P1', 'forest', 'library');
    const t = act(s, { type: 'ActivateManaAbility', player: 'P1', card: millikin, mana: 'C' });
    expect([t.players.P1!.manaPool.C, t.cards[top]!.zone]).toEqual([1, 'graveyard']);
  });

  it('Thought Vessel taps for {C}', () => {
    const s = newGame();
    const vessel = put(s, 'P1', 'thought-vessel');
    expect(act(s, { type: 'ActivateManaAbility', player: 'P1', card: vessel, mana: 'C' }).players.P1!.manaPool.C).toBe(1);
  });

  it("Bonders' Enclave: {3}, {T}: draw, only with a creature with power 4 or greater", () => {
    let s = newGame();
    const enclave = put(s, 'P1', 'bonders-enclave');
    put(s, 'P1', 'island', 'library');
    mana(s, 'P1', { C: 3 });
    expect(rejected(s, { type: 'ActivateAbility', player: 'P1', card: enclave, ability: 0, targets: [] })).toMatch(/condition/);
    put(s, 'P1', 'ruin-grinder');
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: enclave, ability: 0, targets: [] }).state;
    expect(s.players.P1!.hand).toHaveLength(1);
  });

  it("Slayers' Stronghold: target creature gets +2/+0, vigilance and haste", () => {
    let s = newGame();
    const stronghold = put(s, 'P1', 'slayers-stronghold');
    const rat = put(s, 'P1', RAT, 'battlefield', { summoningSick: true });
    mana(s, 'P1', { R: 1, W: 1 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: stronghold, ability: 0, targets: [card(rat)] }).state;
    const now = characteristics(s, s.cards[rat]!);
    expect([now.power - s.cardDefs[RAT]!.power!, now.keywords.has('Vigilance'), now.keywords.has('Haste')]).toEqual([2, true, true]);
    expect(lands(settle(s).state, 'P1')).toContain(stronghold);
  });
});

describe('Lands with paid mana abilities', () => {
  const pool = (s: GameState) => s.players.P1!.manaPool;

  it('Mossfire Valley: {1}, {T}: add {R}{G}, only with {1} to pay', () => {
    let s = newGame();
    const valley = put(s, 'P1', 'mossfire-valley');
    const mountain = put(s, 'P1', 'mountain');
    const offered = () => getLegalActions(s).filter((a) => a.type === 'ActivateManaAbility' && a.card === valley);
    expect(offered()).toEqual([]); // nothing in the pool to pay {1} with
    expect(rejected(s, { type: 'ActivateManaAbility', player: 'P1', card: valley, mana: 'R', output: 0, payWith: 0 })).toMatch(/mana pool/);
    s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: mountain, mana: 'R' });
    expect(offered()).toHaveLength(1);
    s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: valley, mana: 'R', output: 0, payWith: 0 });
    expect([pool(s).R, pool(s).G, s.cards[valley]!.tapped]).toEqual([1, 1, true]);
  });

  it('Fire-Lit Thicket: {T} for {C}, or {R/G}, {T} for {R}{R}, {R}{G} or {G}{G}', () => {
    let s = newGame();
    const thicket = put(s, 'P1', 'fire-lit-thicket');
    const forest = put(s, 'P1', 'forest');
    s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: forest, mana: 'G' });
    // Paying with {G} (the second half of the hybrid symbol) for all three outputs.
    const offered = getLegalActions(s).filter((a) => a.type === 'ActivateManaAbility' && a.card === thicket && a.output !== undefined);
    expect(offered.map((a) => (a.type === 'ActivateManaAbility' ? [a.payWith, a.output] : []))).toEqual([[1, 0], [1, 1], [1, 2]]);
    s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: thicket, mana: 'R', output: 0, payWith: 1 });
    expect([pool(s).R, pool(s).G]).toEqual([2, 0]);
  });

  it('Auto-pay routes mana through them: a Mountain pays for Mossfire Valley to cast a green spell', () => {
    let s = newGame();
    put(s, 'P1', 'mountain');
    put(s, 'P1', 'mossfire-valley');
    const forest = put(s, 'P1', 'forest', 'library');
    const growth = put(s, 'P1', 'rampant-growth', 'hand');
    const taps = planTaps(s, 'P1', '{1}{G}');
    expect(taps).not.toBeNull();
    for (const a of tapActions('P1', taps!)) s = act(s, a);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: growth, targets: [] }).state;
    expect(s.cards[forest]!.zone).toBe('battlefield');
  });

  it('Auto-pay picks the right half of a hybrid cost: a Forest pays {G} so Fire-Lit Thicket makes {R}{R}', () => {
    const s = newGame();
    put(s, 'P1', 'forest');
    const thicket = put(s, 'P1', 'fire-lit-thicket');
    const taps = planTaps(s, 'P1', '{R}{R}')!;
    expect(taps.at(-1)).toMatchObject({ card: thicket, output: 0, payWith: 1 });
    let t = s;
    for (const a of tapActions('P1', taps)) t = act(t, a);
    expect(pool(t).R).toBe(2);
    expect(planTaps(s, 'P1', '{R}{R}{R}')).toBeNull();
  });
});
