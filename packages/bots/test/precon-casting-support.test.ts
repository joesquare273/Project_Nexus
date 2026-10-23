import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions, playableZone, spellOptions, type GameState } from '@nexus/engine';
import { CARD_IDS_BY_NAME } from '@nexus/cards';
import { moveCard } from '../../engine/src/state.ts';
import { playableCards } from '../src/human.ts';
import { checkInvariants } from '../src/invariants.ts';
import { act, card, cast, goTo, mana, newGame, put, rejected, settle } from './kit-helpers.ts';

const RAT = 'undercity-dire-rat';
function toGraveyard(s: GameState, id: string): void { moveCard({ s, ev: [] }, id, 'graveyard'); }

function untilDecision(s: GameState): GameState {
  for (let i = 0; i < 40 && s.pending.kind !== 'decide'; i++) {
    if (s.pending.kind !== 'priority') throw new Error(`Unexpected ${s.pending.kind}`);
    s = act(s, { type: 'PassPriority', player: s.pending.player });
  }
  expect(s.pending.kind).toBe('decide');
  return s;
}

describe.each([2, 3, 4])('%i-player casting support', (players) => {
  it('Banon casts a creature discarded or milled this turn, but not one that died or an old graveyard card', () => {
    let s = newGame(players);
    const banon = put(s, 'P1', 'banon-the-returners-leader');
    const discarded = put(s, 'P1', RAT, 'hand');
    const milled = put(s, 'P1', RAT, 'library');
    const died = put(s, 'P1', RAT);
    const old = put(s, 'P1', RAT, 'graveyard');
    const noncreature = put(s, 'P1', 'sol-ring', 'hand');
    for (const id of [discarded, milled, died, noncreature]) toGraveyard(s, id);
    expect([discarded, milled].map((id) => playableZone(s, 'P1', s.cards[id]!))).toEqual(['graveyard', 'graveyard']);
    expect([died, old, noncreature].map((id) => playableZone(s, 'P1', s.cards[id]!))).toEqual([null, null, null]);
    mana(s, 'P1', { B: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: discarded, graveyardSource: banon, targets: [] }).state;
    expect(s.cards[discarded]!.zone).toBe('battlefield');
    expect(s.cards[discarded]!.tapped).toBe(false);
    expect(playableZone(s, 'P1', s.cards[milled]!)).toBeNull();
    toGraveyard(s, discarded);
    expect(s.cards[discarded]!.zone).toBe('graveyard'); // Pray does not exile it when it dies.
    expect(checkInvariants(s)).toEqual([]);
  });

  it('Banon’s permission obeys turn, ownership, arrival turn, and normal creature timing', () => {
    const s = newGame(players);
    put(s, 'P1', 'banon-the-returners-leader');
    const mine = put(s, 'P1', RAT, 'hand');
    const theirs = put(s, 'P2', RAT, 'hand');
    toGraveyard(s, mine); toGraveyard(s, theirs);
    expect(playableZone(s, 'P1', s.cards[theirs]!)).toBeNull();
    s.step = 'upkeep';
    mana(s, 'P1', { B: 1, C: 1 });
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: mine, targets: [] })).toMatch(/main phase/);
    s.activePlayer = 'P2';
    expect(playableZone(s, 'P1', s.cards[mine]!)).toBeNull();
    s.activePlayer = 'P1'; s.turnNumber++;
    expect(playableZone(s, 'P1', s.cards[mine]!)).toBeNull();
  });

  it('Banon and Edgar grant independent casts and let the player choose the permission', () => {
    let s = newGame(players);
    const banon = put(s, 'P1', 'banon-the-returners-leader');
    const edgar = put(s, 'P1', CARD_IDS_BY_NAME['Edgar, Master Machinist']!);
    const artifact = put(s, 'P1', 'baleful-strix', 'hand');
    const creature = put(s, 'P1', RAT, 'hand');
    toGraveyard(s, artifact); toGraveyard(s, creature);
    const options = spellOptions(s, 'P1').filter((o) => o.action.card === artifact);
    expect(options.map((o) => o.action.type === 'CastSpell' && o.action.graveyardSource).sort()).toEqual([banon, edgar].sort());
    expect(playableCards(s, 'P1').filter((p) => p.card === artifact)).toHaveLength(0); // no mana yet
    mana(s, 'P1', { U: 1, B: 2, C: 1 });
    expect(playableCards(s, 'P1').filter((p) => p.card === artifact)).toHaveLength(2);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: artifact, targets: [], graveyardSource: edgar }).state;
    expect(s.cards[artifact]!.tapped).toBe(true);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: creature, targets: [], graveyardSource: banon }).state;
    expect(s.cards[creature]!.tapped).toBe(false);
  });

  it('Banon’s attack ability pays one mana and discards the chosen card before drawing', () => {
    let s = newGame(players);
    put(s, 'P1', 'banon-the-returners-leader');
    const attacker = put(s, 'P1', RAT);
    const discard = put(s, 'P1', RAT, 'hand');
    s = goTo(s, 'declareAttackers');
    s = untilDecision(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker, defender: 'P2' }] }));
    expect(rejected(s, { type: 'Decide', player: 'P1', accept: true })).toMatch(/mana/);
    mana(s, 'P1', { C: 1 });
    s = act(s, { type: 'Decide', player: 'P1', accept: true });
    expect(s.pending).toMatchObject({ kind: 'chooseCards', purpose: 'discard', min: 1, max: 1 });
    expect(s.players.P1!.hand).toEqual([discard]);
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [discard] })).state;
    expect(s.cards[discard]!.zone).toBe('graveyard');
    expect(s.players.P1!.hand).toHaveLength(1);
    expect(s.players.P1!.hand).not.toContain(discard);
    expect(s.players.P1!.manaPool.C).toBe(0);
    expect(playableZone(s, 'P1', s.cards[discard]!)).toBe('graveyard');
  });

  it('Banon cannot accept the attack cost with an empty hand, and may decline without spending mana', () => {
    let s = newGame(players);
    put(s, 'P1', 'banon-the-returners-leader');
    const attacker = put(s, 'P1', RAT);
    s = goTo(s, 'declareAttackers');
    s = untilDecision(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker, defender: 'P2' }] }));
    mana(s, 'P1', { C: 1 });
    expect(getLegalActions(s).some((a) => a.type === 'Decide' && a.accept)).toBe(false);
    expect(rejected(s, { type: 'Decide', player: 'P1', accept: true })).toMatch(/discard/);
    s = settle(act(s, { type: 'Decide', player: 'P1', accept: false })).state;
    expect(s.players.P1!.hand).toHaveLength(0);
    expect(s.players.P1!.manaPool.C).toBe(1);
  });

  it('Statuary lets you tap artifacts for generic costs, including itself and summoning-sick artifact creatures', () => {
    let s = newGame(players);
    const statue = put(s, 'P1', 'inspiring-statuary');
    const sick = put(s, 'P1', 'baleful-strix', 'battlefield', { summoningSick: true });
    const treasure = put(s, 'P1', 'treasure-token', 'battlefield', { isToken: true });
    const spell = put(s, 'P1', 'harmonize', 'hand');
    mana(s, 'P1', { G: 2 });
    const result = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [], improvise: [statue, sick] });
    s = result.state;
    expect(s.cards[statue]!.tapped).toBe(true);
    expect(s.cards[sick]!.tapped).toBe(true);
    expect(s.cards[treasure]!.zone).toBe('battlefield');
    expect(s.players.P1!.hand).toHaveLength(3);
    expect(result.events.find((e) => e.type === 'SpellCast')).toMatchObject({ manaSpent: 2 });
  });

  it('improvise may tap a Treasure without sacrificing it, but cannot pay colored mana or artifact spells', () => {
    let s = newGame(players);
    const statue = put(s, 'P1', 'inspiring-statuary');
    const treasure = put(s, 'P1', 'treasure-token', 'battlefield', { isToken: true });
    const whisper = put(s, 'P1', 'nights-whisper', 'hand');
    const ring = put(s, 'P1', 'sol-ring', 'hand');
    mana(s, 'P1', { B: 1 });
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: ring, targets: [], improvise: [statue] })).toMatch(/improvise/);
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: whisper, targets: [], improvise: [statue, treasure] })).toMatch(/generic/);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: whisper, targets: [], improvise: [treasure] }).state;
    expect(s.cards[treasure]!.zone).toBe('battlefield');
    expect(s.cards[treasure]!.tapped).toBe(true);
    expect(s.players.P1!.life).toBe(18);
  });

  it('improvise rejects duplicate, tapped, nonartifact, and opponents’ artifacts', () => {
    const s = newGame(players);
    const statue = put(s, 'P1', 'inspiring-statuary');
    const theirs = put(s, 'P2', 'sol-ring');
    const land = put(s, 'P1', 'forest');
    const tapped = put(s, 'P1', 'sol-ring', 'battlefield', { tapped: true });
    const spell = put(s, 'P1', 'harmonize', 'hand');
    mana(s, 'P1', { G: 2 });
    for (const artifacts of [[statue, statue], [theirs], [land], [tapped]]) {
      expect(applyAction(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [], improvise: artifacts }).ok).toBe(false);
    }
  });

  it('the board reserves an artifact used for improvise instead of also tapping it for mana', () => {
    const s = newGame(players);
    put(s, 'P1', 'inspiring-statuary');
    const signet = put(s, 'P1', 'arcane-signet');
    const land = put(s, 'P1', 'swamp');
    const spell = put(s, 'P1', 'nights-whisper', 'hand');
    const offered = playableCards(s, 'P1').filter((p) => p.card === spell && p.detail?.includes('improvise'));
    expect(offered.length).toBeGreaterThan(0);
    for (const play of offered) for (const choice of play.choices) {
      if (choice.action.type !== 'CastSpell') continue;
      const action = choice.action;
      expect(choice.taps.every((tap) => tap.type !== 'ActivateManaAbility' || !action.improvise?.includes(tap.card))).toBe(true);
      let next = s;
      for (const action of [...choice.taps, choice.action]) next = act(next, action);
      expect(checkInvariants(next)).toEqual([]);
    }
    expect(s.cards[signet]!.tapped).toBe(false);
    expect(s.cards[land]!.tapped).toBe(false);
  });

  it('X choices include generic mana supplied by improvise', () => {
    const s = newGame(players);
    put(s, 'P1', 'inspiring-statuary');
    put(s, 'P1', 'darksteel-plate');
    put(s, 'P1', 'baleful-strix', 'battlefield', { summoningSick: true });
    const spell = put(s, 'P1', 'exsanguinate', 'hand');
    mana(s, 'P1', { B: 2 });
    expect(spellOptions(s, 'P1').some((o) => o.action.type === 'CastSpell' && o.action.card === spell && o.action.x === 3 && o.action.improvise?.length === 3)).toBe(true);
  });
});
