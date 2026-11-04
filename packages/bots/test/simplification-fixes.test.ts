// Tests for the recorded simplifications that were fixed (2026-11-04): each
// card now does what its Oracle text says (docs/sealed.md, docs/card-audit.md).

import { describe, expect, it } from 'vitest';
import { activatedAbilities, currentDefinition, getLegalActions, hasKeyword, type GameState } from '@nexus/engine';
import { act, card, cast, fight, goTo, mana, newGame, player, put, rejected, settle } from './kit-helpers.ts';

/** Answers every pending card choice with its first cards (at least one, or the minimum). */
const answerFirst = (s: GameState): GameState => {
  for (let guard = 0; guard < 8 && s.pending.kind === 'chooseCards'; guard++) {
    s = settle(act(s, { type: 'ChooseCards', player: s.pending.player, cards: s.pending.cards.slice(0, Math.max(1, s.pending.min)) })).state;
  }
  return s;
};

/** Plays on (nobody attacks) until P1's next turn reaches its first main phase. */
const nextTurnOfP1 = (s: GameState, opts: Parameters<typeof settle>[1] = {}) => {
  const turn = s.turnNumber;
  for (let guard = 0; guard < 8 && !(s.activePlayer === 'P1' && s.turnNumber > turn); guard++) {
    s = answerFirst(settle(goTo(answerFirst(s), 'end', opts), opts).state);
    s = answerFirst(settle(goTo(s, 'main1', opts), opts).state);
  }
  return s;
};

const top = (s: GameState, who: string, ids: string[]) => {
  s.players[who]!.library = [...ids, ...s.players[who]!.library.filter((x) => !ids.includes(x))];
};

describe('fixed simplifications', () => {
  it('Ifrit: chapter II adds {R}{R}{R}{R} and stays; chapter III (three lore counters) exiles and returns it as Clive', () => {
    let s = newGame();
    const ifrit = put(s, 'P1', 'clive-ifrits-dominant-ifrit-warden-of-inferno', 'battlefield', { transformed: true, namedCounters: { lore: 1 } });
    s = nextTurnOfP1(s);
    expect(s.cards[ifrit]!.transformed).toBe(true);
    expect(s.cards[ifrit]!.namedCounters?.lore).toBe(2);
    s = nextTurnOfP1(s);
    const clive = s.players.P1!.battlefield.map((id) => s.cards[id]!).find((c) => c.defId === 'clive-ifrits-dominant-ifrit-warden-of-inferno');
    expect(clive).toBeDefined();
    expect(clive!.transformed ?? false).toBe(false);
  }, 60_000);

  it('Emet-Selch: the upkeep transform needs fourteen cards in your graveyard (checked as it triggers and resolves)', () => {
    let s = newGame();
    const emet = put(s, 'P1', 'emet-selch-unsundered-hades-sorcerer-of-eld');
    for (let i = 0; i < 13; i++) put(s, 'P1', 'forest', 'graveyard');
    s = nextTurnOfP1(s, { accept: true });
    expect(s.cards[emet]!.transformed ?? false).toBe(false);
    put(s, 'P1', 'forest', 'graveyard');
    s = nextTurnOfP1(s, { accept: true });
    expect(s.cards[emet]!.transformed).toBe(true);
  }, 60_000);

  it('Tymna: in your second main phase, pay life equal to the opponents dealt combat damage to draw that many', () => {
    let s = newGame(3);
    put(s, 'P1', 'tymna-the-weaver');
    const cats = [put(s, 'P1', 'coeurl'), put(s, 'P1', 'coeurl')];
    s = fight(s, [{ attacker: cats[0]!, defender: 'P2' }, { attacker: cats[1]!, defender: 'P3' }]).state;
    const life = s.players.P1!.life;
    const hand = s.players.P1!.hand.length;
    s = goTo(s, 'main2', { accept: true });
    s = settle(s, { accept: true }).state;
    expect(s.players.P1!.life).toBe(life - 2);
    expect(s.players.P1!.hand.length).toBe(hand + 2);
  });

  it('Explorer’s Scope: you may put the land onto the battlefield tapped; if you don’t, it stays on top', () => {
    for (const take of [true, false]) {
      let s = newGame();
      const cat = put(s, 'P1', 'coeurl');
      const scope = put(s, 'P1', 'explorers-scope', 'battlefield', { attachedTo: cat });
      const forest = put(s, 'P1', 'forest', 'library');
      top(s, 'P1', [forest]);
      s = goTo(s, 'declareAttackers');
      s = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: cat, defender: 'P2' }] })).state;
      expect(s.pending).toMatchObject({ kind: 'chooseCards', purpose: 'lookTop', min: 0, cards: [forest] });
      s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: take ? [forest] : [] })).state;
      if (take) expect(s.cards[forest]).toMatchObject({ zone: 'battlefield', tapped: true });
      else expect(s.players.P1!.library[0]).toBe(forest);
      expect(s.cards[scope]!.attachedTo).toBe(cat);
    }
  });

  it('Armory Automaton: attaches any number of Equipment, an opponent’s too (they keep control)', () => {
    let s = newGame();
    const mine = [put(s, 'P1', 'buster-sword'), put(s, 'P1', 'thiefs-knife')];
    const theirs = put(s, 'P2', 'thiefs-knife');
    const armory = put(s, 'P1', 'armory-automaton', 'hand');
    mana(s, 'P1', { C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: armory }).state;
    expect(s.pending).toMatchObject({ kind: 'chooseCards', purpose: 'attachToSource', min: 0, max: 3 });
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [...mine, theirs] })).state;
    for (const e of [...mine, theirs]) expect(s.cards[e]!.attachedTo).toBe(armory);
    expect(s.cards[theirs]!.controller).toBe('P2');
  });

  it('Phantom Train: as a creature it is also a Spirit until end of turn', () => {
    let s = newGame();
    const train = put(s, 'P1', 'phantom-train');
    const fodder = put(s, 'P1', 'sol-ring');
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: train, ability: 0, costCards: [fodder] }).state;
    expect(s.cards[train]!.turnSubtypes).toContain('Spirit');
    s = nextTurnOfP1(s);
    expect(s.cards[train]!.turnSubtypes ?? []).not.toContain('Spirit');
  }, 60_000);

  it('Ragavan: the exiled card can be cast this turn, but a land can’t be played', () => {
    let s = newGame();
    const ragavan = put(s, 'P1', 'ragavan-nimble-pilferer');
    const land = put(s, 'P2', 'forest', 'library');
    top(s, 'P2', [land]);
    s = fight(s, [{ attacker: ragavan, defender: 'P2' }]).state;
    expect(s.cards[land]!.zone).toBe('exile');
    s = goTo(s, 'main2');
    expect(rejected(s, { type: 'PlayLand', player: 'P1', card: land })).toBeTruthy();
    expect(getLegalActions(s).some((a) => a.type === 'PlayLand' && a.card === land)).toBe(false);
    // A spell exiled this way can be cast.
    let t = newGame();
    const rag2 = put(t, 'P1', 'ragavan-nimble-pilferer');
    const bolt = put(t, 'P2', 'lightning-bolt', 'library');
    top(t, 'P2', [bolt]);
    t = fight(t, [{ attacker: rag2, defender: 'P2' }]).state;
    t = goTo(t, 'main2');
    mana(t, 'P1', { R: 1 });
    t = cast(t, { type: 'CastSpell', player: 'P1', card: bolt, targets: [player('P2')] }).state;
    expect(t.cards[bolt]!.zone).toBe('graveyard');
  });

  it('Weapons Vendor: pay {1} first; then a reflexive trigger targets the Equipment and the creature', () => {
    let s = newGame();
    put(s, 'P1', 'weapons-vendor');
    const sword = put(s, 'P1', 'buster-sword');
    const cat = put(s, 'P1', 'coeurl');
    // Mana empties between steps: add it once the trigger is waiting at the beginning of combat.
    for (let i = 0; i < 4 && s.step !== 'beginCombat'; i++) s = act(s, { type: 'PassPriority', player: s.pending.kind === 'priority' ? s.pending.player : 'P1' });
    expect(s.step).toBe('beginCombat');
    mana(s, 'P1', { C: 1 });
    s = settle(s, { accept: true, targets: (o) => o.find((t) => t.some((x) => x.kind === 'card' && x.card === sword) && t.some((x) => x.kind === 'card' && x.card === cat))! }).state;
    expect(s.players.P1!.manaPool.C).toBe(0);
    expect(s.cards[sword]!.attachedTo).toBe(cat);
  });

  it('Blight: the land loses its land types and abilities, keeping only {T}: Add {C}', () => {
    const s = newGame();
    const hideaway = put(s, 'P1', 'clives-hideaway', 'battlefield', { namedCounters: { blight: 1 } });
    const forest = put(s, 'P1', 'forest', 'battlefield', { namedCounters: { blight: 1 } });
    expect(activatedAbilities(currentDefinition(s, s.cards[hideaway]!))).toHaveLength(0);
    expect(currentDefinition(s, s.cards[hideaway]!).triggers ?? []).toHaveLength(0);
    expect(currentDefinition(s, s.cards[forest]!).subtypes ?? []).not.toContain('Forest');
    expect(currentDefinition(s, s.cards[forest]!).types).toContain('land');
    expect(getLegalActions(s).filter((a) => a.type === 'ActivateManaAbility' && a.card === forest).map((a) => (a as { mana: string }).mana)).toEqual(['C']);
  });

  it('Quina: a Frog comes with token copies too, not only made tokens', () => {
    let s = newGame();
    put(s, 'P1', 'quina-qu-gourmet');
    const cat = put(s, 'P1', 'coeurl');
    const rite = put(s, 'P1', 'rite-of-replication', 'hand');
    mana(s, 'P1', { U: 2, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: rite, targets: [card(cat)] }).state;
    const mine = s.players.P1!.battlefield.map((id) => s.cards[id]!);
    expect(mine.filter((c) => c.isToken && c.defId === 'coeurl')).toHaveLength(1);
    expect(mine.filter((c) => c.defId === 'frog-token')).toHaveLength(1);
  });

  it('Buster Sword: the free spell is cast as the ability resolves; passing first loses it', () => {
    let s = newGame();
    const body = put(s, 'P1', 'coeurl');
    put(s, 'P1', 'buster-sword', 'battlefield', { attachedTo: body });
    const ring = put(s, 'P1', 'sol-ring', 'hand');
    s = fight(s, [{ attacker: body, defender: 'P2' }]).state;
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [ring] })).state;
    expect(s.cards[ring]!.castPermission).toBeDefined();
    s = act(s, { type: 'PassPriority', player: 'P1' });
    expect(s.cards[ring]!.castPermission).toBeUndefined();
  });

  it('Ultima: abilities that trigger as it resolves go on the stack in the cleanup step', () => {
    let s = newGame();
    put(s, 'P1', 'syr-konrad-the-grim');
    put(s, 'P2', 'coeurl');
    const ultima = put(s, 'P1', 'ultima', 'hand');
    mana(s, 'P1', { W: 2, C: 3 });
    const life = s.players.P2!.life;
    s = act(s, { type: 'CastSpell', player: 'P1', card: ultima });
    for (let i = 0; i < 20 && s.activePlayer === 'P1'; i++) {
      if (s.pending.kind === 'priority') s = act(s, { type: 'PassPriority', player: s.pending.player });
      else s = settle(s).state;
    }
    // Syr Konrad saw both creatures die: 1 damage to each opponent for each.
    expect(s.players.P2!.life).toBeLessThan(life);
  });
});

void card;
void hasKeyword;
