// The Secrets of Strixhaven Commander decks (SOC), built deck by deck (docs/strixhaven.md).

import { describe, expect, it } from 'vitest';
import { getLegalActions, hasKeyword, powerOf, type GameState } from '@nexus/engine';
import { act, cast, goTo, mana, newGame, put, settle } from './kit-helpers.ts';

const card = (id: string) => ({ kind: 'card' as const, card: id });
const activate = (s: GameState, id: string) => getLegalActions(s).find((a) => a.type === 'ActivateAbility' && a.card === id);

describe('SOC1a: Lorehold Spirit (lands, spells and sacrifice creatures)', () => {
  it('Lotus Field: hexproof, enters tapped, sacrifices two lands, taps for three of one color', () => {
    let s = newGame();
    const a = put(s, 'P1', 'plains');
    const b = put(s, 'P1', 'mountain');
    const field = put(s, 'P1', 'lotus-field', 'hand');
    s = act(s, { type: 'PlayLand', player: 'P1', card: field });
    s = settle(s).state;
    while (s.pending.kind === 'chooseCards') s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [a, b] })).state;
    expect([s.cards[a]!.zone, s.cards[b]!.zone, s.cards[field]!.tapped, hasKeyword(s, s.cards[field]!, 'Hexproof')]).toEqual(['graveyard', 'graveyard', true, true]);
    s.cards[field]!.tapped = false;
    s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: field, mana: 'G' });
    expect(s.players.P1!.manaPool.G).toBe(3);
  });

  it('Lorehold Campus scries; Emeria returns a creature with seven Plains; Mistveil Plains needs two white permanents', () => {
    let s = newGame();
    const campus = put(s, 'P1', 'lorehold-campus');
    mana(s, 'P1', { C: 4 });
    s = cast(s, activate(s, campus)!).state;
    expect(s.cards[campus]!.tapped).toBe(true);
    const mist = put(s, 'P1', 'mistveil-plains');
    const dead = put(s, 'P1', 'rank-rat', 'graveyard');
    mana(s, 'P1', { W: 1 });
    expect(activate(s, mist)).toBeUndefined();
    put(s, 'P1', 'selfless-spirit');
    put(s, 'P1', 'kami-of-ancient-law');
    s = cast(s, activate(s, mist)!, { targets: (o) => o.find((t) => t[0]?.kind === 'card' && t[0].card === dead)! }).state;
    expect(s.players.P1!.library.at(-1)).toBe(dead);
  });

  it('Emeria, the Sky Ruin: at upkeep with seven Plains, a creature card returns', () => {
    let s = newGame();
    put(s, 'P1', 'emeria-the-sky-ruin');
    for (let i = 0; i < 7; i++) put(s, 'P1', 'plains');
    const dead = put(s, 'P1', 'rank-rat', 'graveyard');
    s = settle(goTo(s, 'end')).state;
    s = settle(goTo(s, 'upkeep')).state;
    s = settle(goTo(s, 'end')).state;
    s = settle(goTo(s, 'upkeep'), { accept: true }).state;
    expect([s.activePlayer, s.cards[dead]!.zone]).toEqual(['P1', 'battlefield']);
  });

  it('Wave of Reckoning: each creature deals damage to itself equal to its power', () => {
    let s = newGame();
    const big = put(s, 'P2', 'hungry-graffalon'); // 3/4 survives
    const rat = put(s, 'P2', 'rank-rat'); // 1/1 dies
    const wave = put(s, 'P1', 'wave-of-reckoning', 'hand');
    mana(s, 'P1', { W: 1, C: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: wave }).state;
    expect([s.cards[big]!.zone, s.cards[rat]!.zone]).toEqual(['battlefield', 'graveyard']);
  });

  it('Squee returns to your hand at upkeep', () => {
    let s = newGame();
    const squee = put(s, 'P1', 'squee-goblin-nabob', 'graveyard');
    s = settle(goTo(s, 'end')).state;
    s = settle(goTo(s, 'upkeep')).state;
    s = settle(goTo(s, 'end')).state;
    s = settle(goTo(s, 'upkeep'), { accept: true }).state;
    expect(s.cards[squee]!.zone).toBe('hand');
  });

  it("Drumbellower untaps your creatures in other players' untap steps", () => {
    let s = newGame();
    put(s, 'P1', 'drumbellower');
    const rat = put(s, 'P1', 'rank-rat', 'battlefield', { tapped: true });
    s = settle(goTo(s, 'end')).state;
    s = settle(goTo(s, 'upkeep')).state;
    expect([s.activePlayer, s.cards[rat]!.tapped]).toEqual(['P2', false]);
  });

  it("Monologue Tax: a Treasure when an opponent casts their second spell each turn", () => {
    let s = newGame();
    put(s, 'P1', 'monologue-tax');
    for (let i = 0; i < 2; i++) {
      const bolt = put(s, 'P2', 'lightning-bolt', 'hand');
      s.players.P2!.manaPool.R = 1;
      s.pending = { kind: 'priority', player: 'P2', passes: 0 } as never;
      s = settle(act(s, { type: 'CastSpell', player: 'P2', card: bolt, targets: [{ kind: 'player', player: 'P1' }] })).state;
    }
    expect(s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'treasure-token-sos')).toHaveLength(1);
  });

  it('White Orchid Phantom destroys a nonbasic land; its controller may fetch a basic', () => {
    let s = newGame();
    const fen = put(s, 'P2', 'turbulent-fen');
    put(s, 'P2', 'swamp', 'library');
    const phantom = put(s, 'P1', 'white-orchid-phantom', 'hand');
    mana(s, 'P1', { W: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: phantom }, { accept: true, targets: (o) => o.find((t) => t[0]?.kind === 'card' && t[0].card === fen)! }).state;
    expect(s.cards[fen]!.zone).toBe('graveyard');
    expect(s.players.P2!.battlefield.some((id) => s.cards[id]!.defId === 'swamp' && s.cards[id]!.tapped)).toBe(true);
  });

  it('Seize the Spoils, Faithless Looting, Rip Apart, Lorehold Charm', () => {
    let s = newGame();
    const fodder = put(s, 'P1', 'island', 'hand');
    const seize = put(s, 'P1', 'seize-the-spoils', 'hand');
    mana(s, 'P1', { R: 1, C: 2 });
    const option = getLegalActions(s).find((a) => a.type === 'CastSpell' && a.card === seize && (a as { costCards?: string[] }).costCards?.includes(fodder))!;
    s = cast(s, option).state;
    expect([s.cards[fodder]!.zone, s.players.P1!.battlefield.some((id) => s.cards[id]!.defId === 'treasure-token-sos')]).toEqual(['graveyard', true]);
    const loot = put(s, 'P1', 'faithless-looting', 'hand');
    mana(s, 'P1', { R: 1 });
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: loot })).state;
    while (s.pending.kind === 'chooseCards') s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: (s.pending as { cards: string[] }).cards.slice(0, 2) })).state;
    expect(s.cards[loot]!.zone).toBe('graveyard');
    mana(s, 'P1', { R: 1, C: 2 });
    expect(getLegalActions(s).some((a) => a.type === 'CastSpell' && a.card === loot)).toBe(true);
    const rat = put(s, 'P2', 'rank-rat');
    const rip = put(s, 'P1', 'rip-apart', 'hand');
    mana(s, 'P1', { R: 1, W: 1 });
    s = cast(s, getLegalActions(s).find((a) => a.type === 'CastSpell' && a.card === rip && a.targets?.[0]?.kind === 'card' && a.targets[0].card === rat)!).state;
    expect(s.cards[rat]!.zone).toBe('graveyard');
    const mine = put(s, 'P1', 'rank-rat');
    const charm = put(s, 'P1', 'lorehold-charm', 'hand');
    mana(s, 'P1', { R: 1, W: 1 });
    s = cast(s, getLegalActions(s).find((a) => a.type === 'CastSpell' && a.card === charm && (a as { mode?: number }).mode === 2)!).state;
    expect([powerOf(s, s.cards[mine]!), hasKeyword(s, s.cards[mine]!, 'Trample')]).toEqual([2, true]);
  });

  it('Kami of Ancient Law, Selfless Spirit, Remorseful Cleric sacrifice themselves', () => {
    let s = newGame();
    const tax = put(s, 'P2', 'monologue-tax');
    const kami = put(s, 'P1', 'kami-of-ancient-law');
    s = cast(s, activate(s, kami)!, { targets: (o) => o.find((t) => t[0]?.kind === 'card' && t[0].card === tax)! }).state;
    expect([s.cards[kami]!.zone, s.cards[tax]!.zone]).toEqual(['graveyard', 'graveyard']);
    const spirit = put(s, 'P1', 'selfless-spirit');
    const rat = put(s, 'P1', 'rank-rat');
    s = cast(s, activate(s, spirit)!).state;
    expect(hasKeyword(s, s.cards[rat]!, 'Indestructible')).toBe(true);
    const cleric = put(s, 'P1', 'remorseful-cleric');
    const gone = put(s, 'P2', 'rank-rat', 'graveyard');
    s = cast(s, getLegalActions(s).find((a) => a.type === 'ActivateAbility' && a.card === cleric && a.targets?.[0]?.kind === 'player' && a.targets[0].player === 'P2')!).state;
    expect([s.cards[cleric]!.zone, s.cards[gone]!.zone]).toEqual(['graveyard', 'exile']);
  });
});
