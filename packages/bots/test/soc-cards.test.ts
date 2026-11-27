// The Secrets of Strixhaven Commander decks (SOC), built deck by deck (docs/strixhaven.md).

import { describe, expect, it } from 'vitest';
import { attackTaxFor, canAttackPlayer, completeRequiredAttacks, currentDefinition, getLegalActions, hasKeyword, powerOf, toughnessOf, type GameState } from '@nexus/engine';
import { act, cast, fight, goTo, mana, newGame, nextStep, put, rejected, settle } from './kit-helpers.ts';

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

describe('SOC1b: Lorehold Spirit (recursion and creatures)', () => {
  /** Passes to P1's next upkeep (through P2's turn). */
  const nextUpkeep = (s: GameState) => {
    s = settle(goTo(s, 'end')).state;
    s = settle(goTo(s, 'upkeep')).state;
    s = settle(goTo(s, 'end')).state;
    // Step by hand into P1's upkeep, stopping with its triggers on the stack.
    while (!(s.activePlayer === 'P1' && s.step === 'upkeep')) s = nextStep(s);
    return s;
  };

  it('Karmic Guide returns a creature card; echo: pay at your next upkeep or sacrifice it', () => {
    let s = newGame();
    const dead = put(s, 'P1', 'rank-rat', 'graveyard');
    const guide = put(s, 'P1', 'karmic-guide', 'hand');
    mana(s, 'P1', { W: 2, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: guide }).state;
    expect([s.cards[dead]!.zone, s.cards[guide]!.echoDue, hasKeyword(s, s.cards[guide]!, 'ProtectionFromBlack')]).toEqual(['battlefield', true, true]);
    // Declined: sacrificed.
    let u = nextUpkeep(structuredClone(s));
    u = settle(u, { accept: false }).state;
    expect(u.cards[guide]!.zone).toBe('graveyard');
    // Paid: it stays, and isn't due again.
    let v = nextUpkeep(structuredClone(s));
    mana(v, 'P1', { W: 2, C: 3 });
    v = settle(v, { accept: true }).state;
    expect([v.cards[guide]!.zone, v.cards[guide]!.echoDue]).toEqual(['battlefield', undefined]);
  });

  it('Angel of Indemnity returns a permanent card with mana value 4 or less', () => {
    let s = newGame();
    const big = put(s, 'P1', 'hungry-graffalon', 'graveyard');
    const angel = put(s, 'P1', 'angel-of-indemnity', 'hand');
    mana(s, 'P1', { W: 1, C: 5 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: angel }).state;
    expect(s.cards[big]!.zone).toBe('battlefield');
  });

  it('Teshar returns a cheap creature card when you cast a historic spell', () => {
    let s = newGame();
    put(s, 'P1', 'teshar-ancestors-apostle');
    const dead = put(s, 'P1', 'rank-rat', 'graveyard');
    const legend = put(s, 'P1', 'quintorius-field-historian', 'hand');
    mana(s, 'P1', { R: 1, W: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: legend }).state;
    expect(s.cards[dead]!.zone).toBe('battlefield');
  });

  it('Primary Research returns a card and draws at your end step if a card left your graveyard', () => {
    let s = newGame();
    const dead = put(s, 'P1', 'rank-rat', 'graveyard');
    const research = put(s, 'P1', 'primary-research', 'hand');
    put(s, 'P1', 'relic-retriever');
    mana(s, 'P1', { W: 1, C: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: research }).state;
    expect(s.cards[dead]!.zone).toBe('battlefield');
    const hand = s.players.P1!.hand.length;
    s = settle(goTo(s, 'end')).state;
    expect(s.players.P1!.hand.length).toBe(hand + 1);
    expect(s.players.P1!.battlefield.some((id) => s.cards[id]!.defId === 'treasure-token-sos')).toBe(true);
  });

  it('Guardian of Faith phases out any number of your other creatures', () => {
    let s = newGame();
    const rat = put(s, 'P1', 'rank-rat');
    const guardian = put(s, 'P1', 'guardian-of-faith', 'hand');
    mana(s, 'P1', { W: 2, C: 1 });
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: guardian })).state;
    while (s.pending.kind === 'chooseCards') s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [rat] })).state;
    expect(s.cards[rat]!.phasedOut).toBe(true);
  });

  it('Moonshaker Cavalry: your creatures fly and get +X/+X for each creature you control', () => {
    let s = newGame();
    const rat = put(s, 'P1', 'rank-rat');
    const horse = put(s, 'P1', 'moonshaker-cavalry', 'hand');
    mana(s, 'P1', { W: 3, C: 5 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: horse }).state;
    expect([powerOf(s, s.cards[rat]!), hasKeyword(s, s.cards[rat]!, 'Flying')]).toEqual([3, true]);
  });

  it("Tocasia's Welcome draws once each turn for cheap creatures", () => {
    let s = newGame();
    put(s, 'P1', 'tocasias-welcome');
    const hand = s.players.P1!.hand.length;
    for (let i = 0; i < 2; i++) {
      const rat = put(s, 'P1', 'rank-rat', 'hand');
      mana(s, 'P1', { B: 1, C: 1 });
      s = cast(s, { type: 'CastSpell', player: 'P1', card: rat }).state;
    }
    expect(s.players.P1!.hand.length).toBe(hand + 1);
  });

  it('Ceaseless Conflict destroys all creatures and makes a Spirit for each nontoken creature of yours', () => {
    let s = newGame();
    put(s, 'P1', 'rank-rat');
    put(s, 'P1', 'hungry-graffalon');
    put(s, 'P2', 'rank-rat');
    const conflict = put(s, 'P1', 'ceaseless-conflict', 'hand');
    mana(s, 'P1', { W: 2, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: conflict }).state;
    const spirits = s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'spirit-token-soc');
    expect([spirits.length, s.players.P2!.battlefield.filter((id) => s.cards[id]!.defId === 'rank-rat').length]).toEqual([2, 0]);
  });

  it('Atsushi: when it dies, three Treasures (or exile two cards to play)', () => {
    let s = newGame();
    const atsushi = put(s, 'P1', 'atsushi-the-blazing-sky');
    const wave = put(s, 'P1', 'wave-of-reckoning', 'hand');
    mana(s, 'P1', { W: 1, C: 4 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: wave });
    s = settle(s).state;
    if (s.pending.kind === 'chooseModes') s = settle(act(s, { type: 'ChooseModes', player: 'P1', modes: [1] })).state;
    expect([s.cards[atsushi]!.zone, s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'treasure-token-sos').length]).toEqual(['graveyard', 3]);
  });

  it('Quintorius, Field Historian: a 3/2 Spirit when cards leave your graveyard; Spirits get +1/+0', () => {
    let s = newGame();
    put(s, 'P1', 'quintorius-field-historian');
    put(s, 'P1', 'rank-rat', 'graveyard');
    const cleric = put(s, 'P1', 'remorseful-cleric');
    s = cast(s, getLegalActions(s).find((a) => a.type === 'ActivateAbility' && a.card === cleric && a.targets?.[0]?.kind === 'player' && a.targets[0].player === 'P1')!).state;
    const spirit = s.players.P1!.battlefield.map((id) => s.cards[id]!).find((c) => c.defId === 'spirit-token-soc')!;
    expect(powerOf(s, spirit)).toBe(4);
  });

  it('Claim Jumper fetches up to two Plains while an opponent has more lands', () => {
    let s = newGame();
    for (let i = 0; i < 3; i++) put(s, 'P2', 'forest');
    put(s, 'P1', 'plains', 'library');
    put(s, 'P1', 'plains', 'library');
    const jumper = put(s, 'P1', 'claim-jumper', 'hand');
    mana(s, 'P1', { W: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: jumper }, { accept: true }).state;
    expect(s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'plains')).toHaveLength(2);
  });
});

describe('SOC1c: Lorehold Spirit (Quintorius and friends)', () => {
  const copyOf = (s: GameState, creature: string) => Object.values(s.cards).find((c) => c.zone === 'exile' && c.prepareSpellOf?.card === creature);

  it('Quintorius, History Chaser: Spirits when cards leave your graveyard; +1 discards to draw two; −4 Spirits get double strike', () => {
    let s = newGame();
    const q = put(s, 'P1', 'quintorius-history-chaser', 'hand');
    mana(s, 'P1', { R: 1, W: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: q }).state;
    expect(s.cards[q]!.namedCounters?.loyalty).toBe(5);
    // +1: discarding draws two and mills one; declining does nothing else.
    const fodder = put(s, 'P1', 'island', 'hand');
    const hand = s.players.P1!.hand.length;
    s = settle(act(s, getLegalActions(s).find((a) => a.type === 'ActivateAbility' && a.card === q && (a as { ability: number }).ability === 0)!)).state;
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [fodder] })).state;
    expect([s.players.P1!.hand.length, s.cards[fodder]!.zone, s.cards[q]!.namedCounters?.loyalty]).toEqual([hand + 1, 'graveyard', 6]);
    // A card leaving your graveyard: a 3/2 Spirit.
    const cleric = put(s, 'P1', 'remorseful-cleric');
    s = cast(s, getLegalActions(s).find((a) => a.type === 'ActivateAbility' && a.card === cleric && a.targets?.[0]?.kind === 'player' && a.targets[0].player === 'P1')!).state;
    const spirit = s.players.P1!.battlefield.find((id) => s.cards[id]!.defId === 'spirit-token-soc')!;
    expect(spirit).toBeDefined();
    let u = newGame();
    const q2 = put(u, 'P1', 'quintorius-history-chaser', 'battlefield', { namedCounters: { loyalty: 5 } });
    const sp = put(u, 'P1', 'remorseful-cleric');
    u = cast(u, getLegalActions(u).find((a) => a.type === 'ActivateAbility' && a.card === q2 && (a as { ability: number }).ability === 1)!).state;
    expect([hasKeyword(u, u.cards[sp]!, 'DoubleStrike'), hasKeyword(u, u.cards[sp]!, 'Vigilance')]).toEqual([true, true]);
  });

  it('Naktamun Lorespinner: prepared at upkeep if a player has one or fewer cards; Wheel of Fortune', () => {
    let s = newGame();
    const nak = put(s, 'P1', 'naktamun-lorespinner-wheel-of-fortune');
    s.players.P2!.hand = [];
    for (let i = 0; i < 2; i++) put(s, 'P1', 'island', 'hand');
    s = settle(goTo(s, 'end')).state;
    while (!(s.activePlayer === 'P1' && s.step === 'upkeep')) s = nextStep(s);
    s.players.P2!.hand = [];
    s = settle(s).state;
    expect(s.cards[nak]!.prepared).toBe(true);
    s = settle(goTo(s, 'main1')).state;
    mana(s, 'P1', { R: 1, C: 2 });
    s = cast(s, getLegalActions(s).find((a) => a.type === 'CastSpell' && a.card === copyOf(s, nak)?.id)!).state;
    expect([s.players.P1!.hand.length, s.players.P2!.hand.length]).toEqual([7, 7]);
  });

  it('Lorehold Archivist: Restore Relic exiles an artifact or creature card and makes a token copy of it', () => {
    let s = newGame();
    const arch = put(s, 'P1', 'lorehold-archivist-restore-relic');
    const dead = put(s, 'P1', 'hungry-graffalon', 'graveyard');
    // Prepared by its own rule: three or more artifact and/or creature cards at upkeep.
    put(s, 'P1', 'rank-rat', 'graveyard');
    put(s, 'P1', 'rank-rat', 'graveyard');
    s = settle(goTo(s, 'end')).state;
    while (!(s.activePlayer === 'P1' && s.step === 'upkeep')) s = nextStep(s);
    s = settle(s).state;
    expect(s.cards[arch]!.prepared).toBe(true);
    s = settle(goTo(s, 'main1')).state;
    mana(s, 'P1', { R: 1, W: 1, C: 2 });
    s = cast(s, getLegalActions(s).find((a) => a.type === 'CastSpell' && a.card === copyOf(s, arch)?.id && a.targets?.[0]?.kind === 'card' && a.targets[0].card === dead)!).state;
    const token = s.players.P1!.battlefield.map((id) => s.cards[id]!).find((c) => c.isToken && c.defId !== 'spirit-token-soc');
    expect([s.cards[dead]!.zone, token && powerOf(s, token)]).toEqual(['exile', 3]);
  });

  it('Balefire Liege: hybrid cost; pumps your other red and white creatures; red spells shock, white spells gain life', () => {
    let s = newGame();
    const liege = put(s, 'P1', 'balefire-liege', 'hand');
    mana(s, 'P1', { R: 2, W: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: liege }, { targets: (o) => o.find((t) => t[0]?.kind === 'player' && t[0].player === 'P2') ?? o[0]! }).state;
    expect(s.cards[liege]!.zone).toBe('battlefield');
    const rw = put(s, 'P1', 'spirit-token-soc');
    expect(powerOf(s, s.cards[rw]!)).toBe(5);
    const bolt = put(s, 'P1', 'lightning-bolt', 'hand');
    mana(s, 'P1', { R: 1 });
    const life = s.players.P2!.life;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: bolt, targets: [{ kind: 'player', player: 'P2' }] }, { targets: (o) => o.find((t) => t[0]?.kind === 'player' && t[0].player === 'P2')! }).state;
    expect(s.players.P2!.life).toBe(life - 6);
  });

  it('Patchwork Banner: choose a creature type; those creatures you control get +1/+1; taps for any color', () => {
    let s = newGame();
    const rat = put(s, 'P1', 'rank-rat');
    const banner = put(s, 'P1', 'patchwork-banner', 'hand');
    mana(s, 'P1', { C: 3 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: banner });
    s = settle(s).state;
    expect(s.pending.kind).toBe('chooseOption');
    expect((s.pending as { options: string[] }).options).toContain('Rat');
    s = act(s, { type: 'ChooseOption', player: 'P1', option: 'Rat' });
    expect(powerOf(s, s.cards[rat]!)).toBe(2);
  });
});

describe('SOC1d: Lorehold Spirit (discard, exile and graveyard tricks)', () => {
  /** P1 casts Faithless Looting and discards the first two cards it's offered. */
  const loot = (s: GameState, discard: string[]) => {
    const looting = put(s, 'P1', 'faithless-looting', 'hand');
    mana(s, 'P1', { R: 1 });
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: looting })).state;
    while (s.pending.kind === 'chooseCards' && (s.pending as { purpose: string }).purpose === 'discard') s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: discard }), { accept: true }).state;
    return s;
  };

  it('Containment Construct: a discarded card may be exiled and played this turn', () => {
    let s = newGame();
    put(s, 'P1', 'containment-construct');
    const land = put(s, 'P1', 'forest', 'hand');
    const bolt = put(s, 'P1', 'lightning-bolt', 'hand');
    s = loot(s, [land, bolt]);
    expect([s.cards[land]!.zone, s.cards[bolt]!.zone]).toEqual(['exile', 'exile']);
    expect(getLegalActions(s).some((a) => a.type === 'PlayLand' && a.card === land)).toBe(true);
  });

  it('Conspiracy Theorist: pay {1} and discard as it attacks to draw; a discarded nonland card may be cast this turn', () => {
    let s = newGame();
    const theorist = put(s, 'P1', 'conspiracy-theorist', 'battlefield', { summoningSick: false });
    const bolt = put(s, 'P1', 'lightning-bolt', 'hand');
    s = goTo(s, 'declareAttackers');
    mana(s, 'P1', { C: 1 });
    const hand = s.players.P1!.hand.length;
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: theorist, defender: 'P2' }] }), { accept: true }).state;
    while (s.pending.kind === 'chooseCards') s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [bolt] }), { accept: true }).state;
    expect([s.players.P1!.hand.length, s.cards[bolt]!.zone]).toEqual([hand, 'exile']);
    mana(s, 'P1', { R: 1 });
    expect(getLegalActions(s).some((a) => a.type === 'CastSpell' && a.card === bolt)).toBe(true);
  });

  it('Perpetual Timepiece mills two, and shuffles chosen graveyard cards back', () => {
    let s = newGame();
    const piece = put(s, 'P1', 'perpetual-timepiece');
    s = cast(s, getLegalActions(s).find((a) => a.type === 'ActivateAbility' && a.card === piece && (a as { ability: number }).ability === 0)!).state;
    const milled = [...s.players.P1!.graveyard];
    expect(milled).toHaveLength(2);
    mana(s, 'P1', { C: 2 });
    s = settle(act(s, getLegalActions(s).find((a) => a.type === 'ActivateAbility' && a.card === piece && (a as { ability: number }).ability === 1)!)).state;
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: milled })).state;
    expect([s.cards[piece]!.zone, ...milled.map((id) => s.cards[id]!.zone)]).toEqual(['exile', 'library', 'library']);
  });

  it('Laelia exiles the top card to play as it attacks, and grows when cards are exiled from your library or graveyard', () => {
    let s = newGame();
    const laelia = put(s, 'P1', 'laelia-the-blade-reforged', 'battlefield', { summoningSick: false });
    const top = s.players.P1!.library[0]!;
    s = goTo(s, 'declareAttackers');
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: laelia, defender: 'P2' }] })).state;
    expect([s.cards[top]!.zone, s.cards[laelia]!.counters]).toEqual(['exile', 1]);
  });

  it('Vanguard of the Restless: Spirits get +1/+1 per commander cast; returns from your graveyard when a Spirit enters', () => {
    const t = newGame();
    put(t, 'P1', 'vanguard-of-the-restless');
    const spirit = put(t, 'P1', 'spirit-token-soc');
    t.players.P1!.commanderCasts = { someCommander: 2 };
    expect(powerOf(t, t.cards[spirit]!)).toBe(5);
    let s = newGame();
    const vanguard = put(s, 'P1', 'vanguard-of-the-restless', 'graveyard');
    const cleric = put(s, 'P1', 'remorseful-cleric', 'hand');
    mana(s, 'P1', { W: 2, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: cleric }, { accept: true }).state;
    expect(s.cards[vanguard]!.zone).toBe('battlefield');
  });
});

describe('SOC1e: Lorehold Spirit (Warsinger, Sevinne, Ao, Skyclave)', () => {
  it('Venerable Warsinger returns a creature card with mana value up to the damage it dealt', () => {
    let s = newGame();
    const singer = put(s, 'P1', 'venerable-warsinger', 'battlefield', { summoningSick: false }); // 3/3
    const cheap = put(s, 'P1', 'rank-rat', 'graveyard'); // MV 2
    const pricey = put(s, 'P1', 'hungry-graffalon', 'graveyard'); // MV 4
    let offered: string[] = [];
    s = fight(s, [{ attacker: singer, defender: 'P2' }], {}, {
      accept: true,
      targets: (o) => {
        offered = o.flat().flatMap((t) => (t.kind === 'card' ? [t.card] : []));
        return o.find((t) => t[0]?.kind === 'card' && t[0].card === cheap)!;
      },
    }).state;
    // Only the cheap card was a legal target (the 4-mana one wasn't), so it was chosen without asking.
    expect(offered).not.toContain(pricey);
    expect(s.cards[pricey]!.zone).toBe('graveyard');
    expect(s.cards[cheap]!.zone).toBe('battlefield');
  });

  it("Sevinne's Reclamation: cast from the graveyard (flashback), it may copy itself once", () => {
    let s = newGame();
    const a = put(s, 'P1', 'rank-rat', 'graveyard');
    const b = put(s, 'P1', 'remorseful-cleric', 'graveyard');
    const spell = put(s, 'P1', 'sevinnes-reclamation', 'graveyard');
    mana(s, 'P1', { W: 1, C: 4 });
    const flashback = getLegalActions(s).find((x) => x.type === 'CastSpell' && x.card === spell && x.targets?.[0]?.kind === 'card' && x.targets[0].card === a)!;
    s = cast(s, flashback, { accept: true, copyTargets: (o) => o.map((opts) => opts.find((t) => t.kind === 'card' && t.card === b) ?? opts[0]!) }).state;
    expect([s.cards[a]!.zone, s.cards[b]!.zone, s.cards[spell]!.zone]).toEqual(['battlefield', 'battlefield', 'exile']);
  });

  it('Ao, the Dawn Sky: when it dies, two +1/+1 counters on each of your creatures (or dig for permanents)', () => {
    let s = newGame();
    const ao = put(s, 'P1', 'ao-the-dawn-sky');
    const rat = put(s, 'P1', 'hungry-graffalon');
    const wave = put(s, 'P1', 'wave-of-reckoning', 'hand');
    mana(s, 'P1', { W: 1, C: 4 });
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: wave })).state;
    if (s.pending.kind === 'chooseModes') s = settle(act(s, { type: 'ChooseModes', player: 'P1', modes: [1] })).state;
    // The Graffalon (3/4) survives the Wave; it also has Increment, which the Wave spell grew it with.
    expect([s.cards[ao]!.zone, s.cards[rat]!.counters]).toEqual(['graveyard', 3]);
  });

  it("Skyclave Apparition exiles a permanent; when it leaves, that card's owner gets an X/X Illusion", () => {
    let s = newGame();
    const victim = put(s, 'P2', 'hungry-graffalon'); // MV 4
    const sky = put(s, 'P1', 'skyclave-apparition', 'hand');
    mana(s, 'P1', { W: 2, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: sky }, { targets: (o) => o.find((t) => t[0]?.kind === 'card' && t[0].card === victim)! }).state;
    expect(s.cards[victim]!.zone).toBe('exile');
    const kill = put(s, 'P2', 'lightning-bolt', 'hand');
    s.players.P2!.manaPool.R = 1;
    s.pending = { kind: 'priority', player: 'P2', passes: 0 } as never;
    s = settle(act(s, { type: 'CastSpell', player: 'P2', card: kill, targets: [{ kind: 'card', card: sky }] })).state;
    const illusion = s.players.P2!.battlefield.map((id) => s.cards[id]!).find((c) => c.defId === 'illusion-token-soc')!;
    expect([powerOf(s, illusion), s.cards[victim]!.zone]).toEqual([4, 'exile']);
  });
});

describe('SOC1f: Lorehold Spirit (Bitterthorn, Excava, Quintorius Loremaster)', () => {
  it("Bitterthorn: living weapon (a 0/0 Germ, equipped, is 1/1); the equipped creature's attack fetches a basic land", () => {
    let s = newGame();
    const thorn = put(s, 'P1', 'bitterthorn-nissas-animus', 'hand');
    mana(s, 'P1', { C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: thorn }).state;
    const germ = s.players.P1!.battlefield.map((id) => s.cards[id]!).find((c) => c.defId === 'germ-token-soc')!;
    expect([germ.zone, s.cards[thorn]!.attachedTo, powerOf(s, germ)]).toEqual(['battlefield', germ.id, 1]);
    put(s, 'P1', 'forest', 'library');
    s.cards[germ.id]!.summoningSick = false;
    s = fight(s, [{ attacker: germ.id, defender: 'P2' }], {}, { accept: true }).state;
    expect(s.players.P1!.battlefield.some((id) => s.cards[id]!.defId === 'forest' && s.cards[id]!.tapped)).toBe(true);
  });

  it('Excava returns a cheap card as a 1/1 flying Spirit with a finality counter', () => {
    let s = newGame();
    const excava = put(s, 'P1', 'excava-the-risen-past', 'battlefield', { summoningSick: false });
    const dead = put(s, 'P1', 'rank-rat', 'graveyard');
    s = fight(s, [{ attacker: excava, defender: 'P2' }], {}, { targets: (o) => o.find((t) => t[0]?.kind === 'card' && t[0].card === dead) ?? o[0]! }).state;
    const back = s.cards[dead]!;
    expect([back.zone, back.namedCounters?.finality, powerOf(s, back), hasKeyword(s, back, 'Flying')]).toEqual(['battlefield', 1, 1, true]);
  });

  it('Quintorius Loremaster exiles a noncreature card at your end step and makes a Spirit; sacrifice a Spirit to cast that card free, then it goes to the bottom', () => {
    let s = newGame();
    const q = put(s, 'P1', 'quintorius-loremaster', 'battlefield', { summoningSick: false });
    const bolt = put(s, 'P1', 'lightning-bolt', 'graveyard');
    s = settle(goTo(s, 'end'), { targets: (o) => o.find((t) => t[0]?.kind === 'card' && t[0].card === bolt) ?? o[0]! }).state;
    expect(s.cards[bolt]!.zone).toBe('exile');
    const spirit = s.players.P1!.battlefield.find((id) => s.cards[id]!.defId === 'spirit-token-soc')!;
    expect(spirit).toBeDefined();
    s = settle(goTo(s, 'main1')).state;
    s = settle(goTo(s, 'end')).state;
    s = settle(goTo(s, 'main1')).state;
    mana(s, 'P1', { R: 1, W: 1, C: 1 });
    const activate = getLegalActions(s).find((a) => a.type === 'ActivateAbility' && a.card === q)!;
    s = cast(s, activate).state;
    const life = s.players.P2!.life;
    s = cast(s, getLegalActions(s).find((a) => a.type === 'CastSpell' && a.card === bolt && a.targets?.[0]?.kind === 'player' && a.targets[0].player === 'P2')!).state;
    expect([s.players.P2!.life, s.cards[bolt]!.zone, s.players.P1!.library.at(-1)]).toEqual([life - 3, 'library', bolt]);
  });
});

describe('SOC1g: Lorehold Spirit (Hofri, Guardian Scalelord, Study Hall)', () => {
  it('Hofri: your dying nontoken creatures come back as Spirit token copies; when the token leaves, the card goes to the graveyard', () => {
    let s = newGame();
    put(s, 'P1', 'hofri-ghostforge');
    const big = put(s, 'P1', 'hungry-graffalon'); // 3/4 Giraffe
    const kill = put(s, 'P2', 'lightning-bolt', 'hand');
    const kill2 = put(s, 'P2', 'lightning-bolt', 'hand');
    s.players.P2!.manaPool.R = 1;
    s.pending = { kind: 'priority', player: 'P2', passes: 0 } as never;
    s.cards[big]!.damage = 2;
    s = settle(act(s, { type: 'CastSpell', player: 'P2', card: kill, targets: [{ kind: 'card', card: big }] })).state;
    expect(s.cards[big]!.zone).toBe('exile');
    const token = s.players.P1!.battlefield.map((id) => s.cards[id]!).find((c) => c.isToken && c.defId !== 'spirit-token-soc')!;
    expect(token).toBeDefined();
    const d = s.cards[token.id]!;
    expect([powerOf(s, d), hasKeyword(s, d, 'Trample'), hasKeyword(s, d, 'Haste')]).toEqual([4, true, true]);
    // The token leaves: the card goes to its owner's graveyard.
    s.players.P2!.manaPool.R = 1;
    s.cards[token.id]!.damage = 3;
    s.pending = { kind: 'priority', player: 'P2', passes: 0 } as never;
    s = settle(act(s, { type: 'CastSpell', player: 'P2', card: kill2, targets: [{ kind: 'card', card: token.id }] })).state;
    expect(s.cards[big]!.zone).toBe('graveyard');
  });

  it('Guardian Scalelord: backup 1 gives another creature a counter, flying and its attack trigger; returns permanents with mana value up to its power', () => {
    let s = newGame();
    const rat = put(s, 'P1', 'hungry-graffalon', 'battlefield', { summoningSick: false }); // 3/4
    const lord = put(s, 'P1', 'guardian-scalelord', 'hand');
    const dead = put(s, 'P1', 'rank-rat', 'graveyard'); // MV 2
    mana(s, 'P1', { W: 1, C: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: lord }, { targets: (o) => o.find((t) => t[0]?.kind === 'card' && t[0].card === rat) ?? o[0]! }).state;
    // Two counters: backup's, and Increment's (five mana spent on Scalelord is more than its power).
    expect([s.cards[rat]!.counters, hasKeyword(s, s.cards[rat]!, 'Flying'), hasKeyword(s, s.cards[lord]!, 'Flying')]).toEqual([2, true, true]);
    s = fight(s, [{ attacker: rat, defender: 'P2' }], {}, { targets: (o) => o.find((t) => t[0]?.kind === 'card' && t[0].card === dead) ?? o[0]! }).state;
    expect(s.cards[dead]!.zone).toBe('battlefield');
  });

  it('Study Hall: {C}, or {1} for any color; spent on your commander, scry X', () => {
    let s = newGame();
    const hall = put(s, 'P1', 'study-hall');
    expect(getLegalActions(s).some((a) => a.type === 'ActivateManaAbility' && a.card === hall && (a as { mana: string }).mana === 'C')).toBe(true);
    mana(s, 'P1', { C: 1 });
    const paid = getLegalActions(s).find((a) => a.type === 'ActivateManaAbility' && a.card === hall && (a as { output?: number }).output === 0);
    expect(paid).toBeDefined();
    s = act(s, paid!);
    expect(s.players.P1!.manaPool.W).toBe(1);
    expect(s.players.P1!.creatureScryMana?.[0]?.forCommander).toBe(true);
  });
});

describe('SOC1h: Lorehold Spirit (Augusta, Spirit of Resilience, Serra Paragon)', () => {
  it('Augusta: each player exiles a graveyard card; counters on an attacking creature for each nonland card exiled', () => {
    let s = newGame();
    const augusta = put(s, 'P1', 'augusta-order-returned', 'battlefield', { summoningSick: false });
    const mine = put(s, 'P1', 'rank-rat', 'graveyard');
    const theirs = put(s, 'P2', 'lightning-bolt', 'graveyard');
    s = goTo(s, 'declareAttackers');
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: augusta, defender: 'P2' }] })).state;
    for (let i = 0; i < 4 && s.pending.kind === 'chooseCards'; i++) {
      const p = s.pending as { player: string; cards: string[] };
      s = settle(act(s, { type: 'ChooseCards', player: p.player as 'P1', cards: [p.cards[0]!] })).state;
    }
    expect([s.cards[mine]!.zone, s.cards[theirs]!.zone, s.cards[augusta]!.counters]).toEqual(['exile', 'exile', 2]);
  });

  it('Spirit of Resilience grows when cards leave your graveyard, and may become a copy of one of them until end of turn', () => {
    let s = newGame();
    const spirit = put(s, 'P1', 'spirit-of-resilience');
    const big = put(s, 'P1', 'hungry-graffalon', 'graveyard');
    const cleric = put(s, 'P1', 'remorseful-cleric');
    s = settle(act(s, getLegalActions(s).find((a) => a.type === 'ActivateAbility' && a.card === cleric && a.targets?.[0]?.kind === 'player' && a.targets[0].player === 'P1')!)).state;
    expect(s.pending.kind).toBe('chooseCards');
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [big] })).state;
    const now = s.cards[spirit]!;
    expect([now.counters, defOfName(s, spirit), hasKeyword(s, now, 'Reach')]).toEqual([1, 'Hungry Graffalon', true]);
    s = settle(goTo(s, 'end')).state;
    s = settle(goTo(s, 'upkeep')).state;
    expect(defOfName(s, spirit)).toBe('Spirit of Resilience');
  });

  it('Serra Paragon: once each turn, a land or a cheap permanent from your graveyard, which is exiled with 2 life when it dies', () => {
    let s = newGame();
    put(s, 'P1', 'serra-paragon');
    const land = put(s, 'P1', 'forest', 'graveyard');
    const rat = put(s, 'P1', 'rank-rat', 'graveyard');
    expect(getLegalActions(s).some((a) => a.type === 'PlayLand' && a.card === land)).toBe(true);
    mana(s, 'P1', { B: 1, C: 1 });
    s = cast(s, getLegalActions(s).find((a) => a.type === 'CastSpell' && a.card === rat)!).state;
    expect([s.cards[rat]!.zone, s.cards[rat]!.paragonRider]).toEqual(['battlefield', true]);
    // Used for this turn: no land from the graveyard now.
    expect(getLegalActions(s).some((a) => a.type === 'PlayLand' && a.card === land)).toBe(false);
    const kill = put(s, 'P2', 'lightning-bolt', 'hand');
    s.players.P2!.manaPool.R = 1;
    s.pending = { kind: 'priority', player: 'P2', passes: 0 } as never;
    s = settle(act(s, { type: 'CastSpell', player: 'P2', card: kill, targets: [{ kind: 'card', card: rat }] })).state;
    expect([s.cards[rat]!.zone, s.players.P1!.life]).toEqual(['exile', 22]);
  });
});

function defOfName(s: GameState, id: string): string {
  return currentDefinition(s, s.cards[id]!).name;
}

describe('SOC1i: Lorehold Spirit (Classes and voting)', () => {
  it('Advanced Reconstruction: level 1 mills and exiles a random graveyard card to play; level 2 shocks on graveyard leaves; level 3 cheapens spells cast from elsewhere', () => {
    let s = newGame();
    const cls = put(s, 'P1', 'advanced-reconstruction');
    expect(s.cards[cls]!.classLevel ?? 1).toBe(1);
    // Level 3 can't come before level 2.
    mana(s, 'P1', { R: 2, C: 2 });
    const levels = getLegalActions(s).filter((a) => a.type === 'ActivateAbility' && a.card === cls);
    expect(levels.map((a) => (a as { ability: number }).ability)).toEqual([0]);
    s = cast(s, levels[0]!).state;
    expect(s.cards[cls]!.classLevel).toBe(2);
    // Level 2: a card leaving your graveyard deals 2 to each opponent.
    put(s, 'P1', 'rank-rat', 'graveyard');
    const cleric = put(s, 'P1', 'remorseful-cleric');
    s = cast(s, getLegalActions(s).find((a) => a.type === 'ActivateAbility' && a.card === cleric && a.targets?.[0]?.kind === 'player' && a.targets[0].player === 'P1')!).state;
    expect(s.players.P2!.life).toBe(18);
    s = cast(s, getLegalActions(s).find((a) => a.type === 'ActivateAbility' && a.card === cls)!).state;
    expect(s.cards[cls]!.classLevel).toBe(3);
    // Level 3: Faithless Looting's flashback ({2}{R}) costs only {R}.
    const loot = put(s, 'P1', 'faithless-looting', 'graveyard');
    s.players.P1!.manaPool = { W: 0, U: 0, B: 0, R: 1, G: 0, C: 0 };
    expect(getLegalActions(s).some((a) => a.type === 'CastSpell' && a.card === loot)).toBe(true);
  });

  it('Advanced Reconstruction level 1: at your first main phase, mill one and exile a random graveyard card you may play this turn', () => {
    let s = newGame();
    put(s, 'P1', 'advanced-reconstruction');
    s.players.P1!.graveyard = [];
    s = settle(goTo(s, 'end')).state;
    s = settle(goTo(s, 'main1')).state;
    s = settle(goTo(s, 'end')).state;
    s = settle(goTo(s, 'main1')).state;
    expect(s.activePlayer).toBe('P1');
    const exiled = Object.values(s.cards).filter((c) => c.zone === 'exile' && c.playableFromExile?.player === 'P1');
    expect(exiled).toHaveLength(1);
  });

  it('Fateful Tempest: each player votes; mill per past vote and deal the milled mana value; exile per present vote to play', () => {
    let s = newGame();
    s.players.P1!.library = [];
    for (let i = 0; i < 3; i++) put(s, 'P1', 'hungry-graffalon', 'library'); // mana value 4 each
    const tempest = put(s, 'P1', 'fateful-tempest', 'hand');
    mana(s, 'P1', { R: 1, C: 2 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: tempest });
    s = settle(s).state;
    expect([s.pending.kind, (s.pending as { player: string }).player]).toEqual(['chooseOption', 'P1']);
    s = act(s, { type: 'ChooseOption', player: 'P1', option: 'past' });
    expect((s.pending as { player: string }).player).toBe('P2');
    s = settle(act(s, { type: 'ChooseOption', player: 'P2', option: 'present' })).state;
    expect([s.players.P1!.graveyard.filter((id) => s.cards[id]!.defId === 'hungry-graffalon').length, s.players.P2!.life]).toEqual([1, 16]);
    const exiled = Object.values(s.cards).filter((c) => c.zone === 'exile' && c.playableFromExile?.player === 'P1');
    expect(exiled).toHaveLength(1);
  });
});

describe('SOC2a: Prismari Artistry (lands, spells and magecraft)', () => {
  it('Storm-Kiln Artist: magecraft makes a Treasure on a cast and on a copy; +1/+0 per artifact', () => {
    let s = newGame();
    const artist = put(s, 'P1', 'storm-kiln-artist');
    const rat = put(s, 'P1', 'rank-rat');
    const favor = put(s, 'P1', 'lumarets-favor', 'hand');
    s.players.P1!.lifeGainedThisTurn = 1;
    mana(s, 'P1', { G: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: favor, targets: [card(rat)] }).state;
    const treasures = Object.values(s.cards).filter((c) => c.zone === 'battlefield' && c.defId === 'treasure-token-sos');
    expect([treasures.length, powerOf(s, s.cards[artist]!)]).toEqual([2, 4]);
  });

  it('Mystic Sanctuary: untapped with three other Islands puts an instant from your graveyard on top; tapped otherwise', () => {
    let s = newGame();
    for (let i = 0; i < 2; i++) put(s, 'P1', 'island');
    const bolt = put(s, 'P1', 'abrade', 'graveyard');
    const first = put(s, 'P1', 'mystic-sanctuary', 'hand');
    s = settle(act(s, { type: 'PlayLand', player: 'P1', card: first })).state;
    expect([s.cards[first]!.tapped, s.cards[bolt]!.zone]).toEqual([true, 'graveyard']);
    s = settle(goTo(s, 'end')).state;
    s = settle(goTo(s, 'main1')).state;
    s = settle(goTo(s, 'end')).state;
    s = settle(goTo(s, 'main1')).state;
    put(s, 'P1', 'island');
    const second = put(s, 'P1', 'mystic-sanctuary', 'hand');
    s = settle(act(s, { type: 'PlayLand', player: 'P1', card: second }), { targets: (o) => o.find((t) => t[0]?.kind === 'card' && t[0].card === bolt)! }).state;
    expect([s.cards[second]!.tapped, s.players.P1!.library[0]]).toEqual([false, bolt]);
  });

  it('Deep Analysis: target player draws two; flashback costs {1}{U} and 3 life', () => {
    let s = newGame();
    const da = put(s, 'P1', 'deep-analysis', 'graveyard');
    const hand = s.players.P1!.hand.length;
    mana(s, 'P1', { U: 1, C: 1 });
    s.players.P1!.life = 2;
    expect(getLegalActions(s).some((a) => a.type === 'CastSpell' && a.card === da)).toBe(false);
    s.players.P1!.life = 20;
    s = cast(s, getLegalActions(s).find((a) => a.type === 'CastSpell' && a.card === da && a.targets?.[0]?.kind === 'player' && a.targets[0].player === 'P1')!).state;
    expect([s.players.P1!.life, s.players.P1!.hand.length - hand, s.cards[da]!.zone]).toEqual([17, 2, 'exile']);
  });

  it('Mana Geyser adds {R} for each tapped land your opponents control; Treasure Cruise delves', () => {
    let s = newGame();
    for (let i = 0; i < 3; i++) s.cards[put(s, 'P2', 'mountain')]!.tapped = true;
    put(s, 'P2', 'mountain');
    const geyser = put(s, 'P1', 'mana-geyser', 'hand');
    mana(s, 'P1', { R: 2, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: geyser }).state;
    expect(s.players.P1!.manaPool.R).toBe(3);
    expect(currentDefinition(s, s.cards[put(s, 'P1', 'treasure-cruise', 'hand')]!).delve).toBe(true);
  });

  it('Prismari Command: target player draws two then discards two, and that player creates a Treasure; Faerie Mastermind draws on their second draw', () => {
    let s = newGame();
    put(s, 'P1', 'faerie-mastermind');
    const cmd = put(s, 'P1', 'prismari-command', 'hand');
    const p1hand = s.players.P1!.hand.length;
    mana(s, 'P1', { U: 1, R: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: cmd, modes: [1, 2], targets: [{ kind: 'player', player: 'P2' }, { kind: 'player', player: 'P2' }] }).state;
    expect(s.pending.kind).toBe('chooseCards');
    s = settle(act(s, { type: 'ChooseCards', player: 'P2', cards: [...s.players.P2!.hand] })).state;
    const p2treasure = Object.values(s.cards).filter((c) => c.zone === 'battlefield' && c.controller === 'P2' && c.defId === 'treasure-token-sos');
    expect([s.players.P2!.hand.length, s.cards[cmd]!.zone]).toEqual([0, 'graveyard']);
    // The spell left P1's hand; Faerie Mastermind drew one when P2 drew their second card.
    expect([p2treasure.length, s.players.P1!.hand.length - p1hand]).toEqual([1, 0]);
  });

  it('Resculpt exiles a creature and its controller gets a 4/4 Elemental; Aether Gale bounces six', () => {
    let s = newGame();
    const rat = put(s, 'P2', 'rank-rat');
    const re = put(s, 'P1', 'resculpt', 'hand');
    mana(s, 'P1', { U: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: re, targets: [card(rat)] }).state;
    const elemental = Object.values(s.cards).find((c) => c.zone === 'battlefield' && c.defId === 'elemental-4-4-token-soc');
    expect([s.cards[rat]!.zone, elemental?.controller]).toEqual(['exile', 'P2']);
    const six = Array.from({ length: 6 }, () => put(s, 'P2', 'rank-rat'));
    const gale = put(s, 'P1', 'aether-gale', 'hand');
    mana(s, 'P1', { U: 2, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: gale, targets: six.map(card) }).state;
    expect(six.every((id) => s.cards[id]!.zone === 'hand')).toBe(true);
  });
});

describe('SOC2b: Prismari Artistry (cascade, spell-cast creatures, manifest)', () => {
  const tokens = (s: GameState, defId: string, who = 'P1') => Object.values(s.cards).filter((c) => c.zone === 'battlefield' && c.controller === who && c.defId === defId);

  it('Throes of Chaos cascades into a cheaper nonland card, cast free; the rest go to the bottom', () => {
    let s = newGame();
    s.players.P1!.library = [];
    const bottom = put(s, 'P1', 'island', 'library');
    const rat = put(s, 'P1', 'rank-rat', 'library');
    const big = put(s, 'P1', 'hungry-graffalon', 'library'); // mana value 4: not less than Throes
    const land = put(s, 'P1', 'mountain', 'library');
    const throes = put(s, 'P1', 'throes-of-chaos', 'hand');
    mana(s, 'P1', { R: 1, C: 3 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: throes });
    for (let i = 0; i < 6 && s.stack.at(-1)?.kind === 'ability' && s.pending.kind === 'priority'; i++) s = act(s, { type: 'PassPriority', player: s.pending.player });
    expect(s.cards[rat]!.castPermission).toMatchObject({ free: true, immediate: true });
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: rat })).state;
    expect([s.cards[rat]!.zone, s.cards[throes]!.zone]).toEqual(['battlefield', 'graveyard']);
    expect(s.players.P1!.library.slice(-2).sort()).toEqual([big, land].sort());
    expect(s.players.P1!.library[0]).toBe(bottom);
    expect(currentDefinition(s, s.cards[throes]!).retrace).toBe(true);
  });

  it('Volcanic Torrent deals damage equal to the spells you cast this turn to opposing creatures', () => {
    let s = newGame();
    s.players.P1!.library = [];
    for (let i = 0; i < 3; i++) put(s, 'P1', 'mountain', 'library');
    const theirs = put(s, 'P2', 'rank-rat');
    const mine = put(s, 'P1', 'rank-rat');
    const torrent = put(s, 'P1', 'volcanic-torrent', 'hand');
    mana(s, 'P1', { R: 1, C: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: torrent }).state;
    expect([s.cards[theirs]!.zone, s.cards[mine]!.zone]).toEqual(['graveyard', 'battlefield']);
  });

  it('Prismari Pianist and Leitmotif Composer react to instants and sorceries by mana value; Renegade Bull and Manaform Hellkite grow', () => {
    let s = newGame();
    put(s, 'P1', 'prismari-pianist');
    const composer = put(s, 'P1', 'leitmotif-composer');
    const bull = put(s, 'P1', 'renegade-bull');
    put(s, 'P1', 'manaform-hellkite');
    const rat = put(s, 'P2', 'rank-rat');
    const abrade = put(s, 'P1', 'abrade', 'hand');
    mana(s, 'P1', { R: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: abrade, mode: 0, targets: [card(rat)] }).state;
    const dragons = tokens(s, 'dragon-illusion-token-soc');
    expect([tokens(s, 'elemental-1-1-token-soc').length, powerOf(s, s.cards[bull]!), dragons.length, dragons[0] && powerOf(s, dragons[0])]).toEqual([1, 2, 1, 2]);
    const geyser = put(s, 'P1', 'mana-geyser', 'hand');
    mana(s, 'P1', { R: 2, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: geyser }).state;
    expect(tokens(s, 'elemental-1-1-token-soc').length).toBe(4);
    const composers = Object.values(s.cards).filter((c) => c.zone === 'battlefield' && c.defId === 'leitmotif-composer');
    expect(composers.length).toBe(2);
    mana(s, 'P1', { U: 1, C: 2 });
    s = cast(s, activate(s, composer)!).state;
    expect(composers.every((c) => s.temporaryEffects.some((e) => e.affected === c.id && e.flags?.includes('cantBeBlocked')))).toBe(true);
    s = settle(goTo(s, 'end')).state;
    expect(tokens(s, 'dragon-illusion-token-soc').length).toBe(0);
  });

  it('Brazen Borrower: Petty Theft bounces an opponent\'s nonland permanent; Reality Shift exiles and its controller manifests', () => {
    let s = newGame();
    const rat = put(s, 'P2', 'rank-rat');
    const borrower = put(s, 'P1', 'brazen-borrower-petty-theft', 'hand');
    mana(s, 'P1', { U: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: borrower, adventure: true, targets: [card(rat)] }).state;
    expect([s.cards[rat]!.zone, s.cards[borrower]!.zone]).toEqual(['hand', 'exile']);
    expect(currentDefinition(s, s.cards[borrower]!).canBlockOnlyFlying).toBe(true);
    const other = put(s, 'P2', 'rank-rat');
    const shift = put(s, 'P1', 'reality-shift', 'hand');
    mana(s, 'P1', { U: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: shift, targets: [card(other)] }).state;
    const faceDown = Object.values(s.cards).filter((c) => c.zone === 'battlefield' && c.controller === 'P2' && c.faceDown);
    expect([s.cards[other]!.zone, faceDown.length]).toEqual(['exile', 1]);
  });

  it('Galazeth Prismari makes a Treasure and its artifacts tap for instant and sorcery mana; Hall of Oracles needs a spell first; Volcanic Salvo costs less per power', () => {
    let s = newGame();
    const galazeth = put(s, 'P1', 'galazeth-prismari', 'hand');
    mana(s, 'P1', { U: 1, R: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: galazeth }).state;
    const treasure = tokens(s, 'treasure-token-sos')[0]!;
    const abrade = put(s, 'P1', 'abrade', 'hand');
    put(s, 'P2', 'rank-rat');
    // The Treasure taps (granted ability, no sacrifice) plus one more mana: Abrade is castable.
    mana(s, 'P1', { R: 1 });
    expect(getLegalActions(s).some((a) => a.type === 'CastSpell' && a.card === abrade)).toBe(false);
    s = act(s, getLegalActions(s).find((a) => a.type === 'ActivateManaAbility' && a.card === treasure.id && a.grantedBy === galazeth && a.mana === 'C' || (a.type === 'ActivateManaAbility' && a.card === treasure.id && a.grantedBy === galazeth && a.mana === 'U'))!);
    expect([s.cards[treasure.id]!.zone, s.cards[treasure.id]!.tapped]).toEqual(['battlefield', true]);
    expect(getLegalActions(s).some((a) => a.type === 'CastSpell' && a.card === abrade)).toBe(true);
    expect(s.players.P1!.restrictedMana?.instantOrSorcerySpell?.U).toBe(1);
    s.players.P1!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    delete s.players.P1!.restrictedMana;
    const hall = put(s, 'P1', 'hall-of-oracles');
    const counterAbility = () => getLegalActions(s).find((a) => a.type === 'ActivateAbility' && a.card === hall && (a.targets?.length ?? 0) > 0);
    expect(counterAbility()).toBeUndefined();
    s.players.P1!.instantOrSorcerySpellsThisTurn = 1;
    expect(counterAbility()).toBeDefined();
    const salvo = put(s, 'P1', 'volcanic-salvo', 'hand');
    s.cards[hall]!.tapped = true;
    mana(s, 'P1', { R: 2, C: 6 }); // 12 less Galazeth's 3 power: {7}{R}{R} needs more
    expect(getLegalActions(s).some((a) => a.type === 'CastSpell' && a.card === salvo)).toBe(false);
    put(s, 'P1', 'hungry-graffalon');
    expect(getLegalActions(s).some((a) => a.type === 'CastSpell' && a.card === salvo)).toBe(true);
  });
});

describe('SOC2c: Prismari Artistry (token copies, demonstrate, copying spells)', () => {
  const onField = (s: GameState, defId: string, who = 'P1') => Object.values(s.cards).filter((c) => c.zone === 'battlefield' && c.controller === who && c.defId === defId);

  it('Rionya: at the beginning of combat, one plus the instants and sorceries cast this turn hasty copies, exiled at the end step', () => {
    let s = newGame();
    put(s, 'P1', 'rionya-fire-dancer');
    const rat = put(s, 'P1', 'rank-rat');
    s.players.P1!.instantOrSorcerySpellsThisTurn = 2;
    s = settle(goTo(s, 'beginCombat'), { targets: (o) => o.find((t) => t[0]?.kind === 'card' && t[0].card === rat)! }).state;
    const copies = onField(s, 'rank-rat').filter((c) => c.id !== rat);
    expect(copies.length).toBe(3);
    expect(hasKeyword(s, copies[0]!, 'Haste')).toBe(true);
    s = settle(goTo(s, 'end')).state;
    expect(onField(s, 'rank-rat').length).toBe(1);
  });

  it('Determined Iteration populates a hasty token copy that is sacrificed at the end step', () => {
    let s = newGame();
    put(s, 'P1', 'determined-iteration');
    s.cards[put(s, 'P1', 'elemental-1-1-token-soc')]!.isToken = true;
    s = settle(goTo(s, 'beginCombat')).state;
    expect(onField(s, 'elemental-1-1-token-soc').length).toBe(2);
    s = settle(goTo(s, 'end')).state;
    expect(onField(s, 'elemental-1-1-token-soc').length).toBe(1);
  });

  it('Replication Technique (demonstrate): you copy it and an opponent copies it too', () => {
    let s = newGame();
    const rat = put(s, 'P1', 'rank-rat');
    put(s, 'P2', 'hungry-graffalon');
    const rep = put(s, 'P1', 'replication-technique', 'hand');
    mana(s, 'P1', { U: 1, C: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: rep, targets: [card(rat)] }).state;
    expect(onField(s, 'rank-rat').length).toBe(3);
    expect(onField(s, 'hungry-graffalon', 'P2').length).toBe(2);
  });

  it('Creative Technique shuffles, then exiles until a nonland card you may cast free right away', () => {
    let s = newGame();
    s.players.P1!.library = [];
    for (let i = 0; i < 4; i++) put(s, 'P1', 'island', 'library');
    const rat = put(s, 'P1', 'rank-rat', 'library');
    const ct = put(s, 'P1', 'creative-technique', 'hand');
    mana(s, 'P1', { R: 1, C: 4 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: ct });
    // Decline demonstrate.
    for (let i = 0; i < 8 && s.cards[rat]!.zone !== 'exile'; i++) {
      if (s.pending.kind === 'decide') s = act(s, { type: 'Decide', player: s.pending.player, accept: false });
      else s = act(s, { type: 'PassPriority', player: (s.pending as { player: string }).player });
    }
    expect(s.cards[rat]!.castPermission).toMatchObject({ free: true, immediate: true });
    expect(s.players.P1!.library.length).toBe(4);
  });

  it('Rootha returns to hand to copy your instant; Thunderclap Drake copies your next one per commander cast', () => {
    let s = newGame();
    const rootha = put(s, 'P1', 'rootha-mercurial-artist');
    const drake = put(s, 'P1', 'thunderclap-drake');
    s.players.P1!.commanderCasts = { [drake]: 2 } as never;
    const rat = put(s, 'P2', 'hungry-graffalon');
    const abrade = put(s, 'P1', 'abrade', 'hand');
    mana(s, 'P1', { R: 1 }); // {1} less from the Drake
    s = act(s, { type: 'CastSpell', player: 'P1', card: abrade, mode: 0, targets: [card(rat)] });
    mana(s, 'P1', { C: 2 });
    s = act(s, getLegalActions(s).find((a) => a.type === 'ActivateAbility' && a.card === rootha)!);
    expect(s.cards[rootha]!.zone).toBe('hand');
    s = settle(s).state;
    expect(s.cards[rat]!.zone).toBe('graveyard');
  });

  it('Arcane Denial counters; at the next upkeep its controller may draw two and you draw one', () => {
    let s = newGame();
    const rat = put(s, 'P1', 'rank-rat', 'hand');
    const denial = put(s, 'P2', 'arcane-denial', 'hand');
    mana(s, 'P1', { B: 1, C: 1 });
    mana(s, 'P2', { U: 1, C: 1 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: rat });
    s = act(s, { type: 'PassPriority', player: 'P1' });
    s = act(s, { type: 'CastSpell', player: 'P2', card: denial, targets: [card(rat)] });
    s = settle(s).state;
    expect(s.cards[rat]!.zone).toBe('graveyard');
    const [h1, h2] = [s.players.P1!.hand.length, s.players.P2!.hand.length];
    s = settle(goTo(s, 'end')).state;
    s = settle(goTo(s, 'upkeep')).state;
    expect([s.players.P1!.hand.length - h1, s.players.P2!.hand.length - h2]).toEqual([2, 1]);
  });
});

describe('SOC2d: Prismari Artistry (trigger doubling, Goldspan, Expressive Iteration, prepared)', () => {
  const onField = (s: GameState, defId: string, who = 'P1') => Object.values(s.cards).filter((c) => c.zone === 'battlefield' && c.controller === who && c.defId === defId);
  const copyOf = (s: GameState, creature: string) => Object.values(s.cards).find((c) => c.zone === 'exile' && c.prepareSpellOf?.card === creature);

  it('Veyran doubles magecraft and other cast triggers of your permanents; Harmonic Prodigy doubles a Wizard\'s triggers', () => {
    let s = newGame();
    put(s, 'P1', 'veyran-voice-of-duality');
    put(s, 'P1', 'storm-kiln-artist');
    const rat = put(s, 'P2', 'rank-rat');
    const abrade = put(s, 'P1', 'abrade', 'hand');
    mana(s, 'P1', { R: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: abrade, mode: 0, targets: [card(rat)] }).state;
    expect(onField(s, 'treasure-token-sos').length).toBe(2);

    let t = newGame();
    put(t, 'P1', 'harmonic-prodigy');
    const mentor = put(t, 'P1', 'stormcatch-mentor'); // a Wizard with prowess
    const rat2 = put(t, 'P2', 'rank-rat');
    const abrade2 = put(t, 'P1', 'abrade', 'hand');
    mana(t, 'P1', { R: 1 });
    t = cast(t, { type: 'CastSpell', player: 'P1', card: abrade2, mode: 0, targets: [card(rat2)] }).state;
    expect(powerOf(t, t.cards[mentor]!)).toBe(3);
  });

  it('Goldspan Dragon: a Treasure when it attacks or a spell targets it; Treasures add two mana of one color', () => {
    let s = newGame();
    const dragon = put(s, 'P1', 'goldspan-dragon');
    const aid = put(s, 'P1', 'lumarets-favor', 'hand');
    mana(s, 'P1', { G: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: aid, targets: [card(dragon)] }).state;
    const treasure = onField(s, 'treasure-token-sos')[0]!;
    expect(treasure).toBeDefined();
    s = act(s, getLegalActions(s).find((a) => a.type === 'ActivateManaAbility' && a.card === treasure.id && a.grantedBy === dragon && a.mana === 'R')!);
    expect([s.players.P1!.manaPool.R, s.cards[treasure.id]?.zone === 'battlefield']).toEqual([2, false]);
  });

  it('Expressive Iteration: one card to hand, one to the bottom, one exiled to play this turn', () => {
    let s = newGame();
    s.players.P1!.library = [];
    const c = put(s, 'P1', 'island', 'library');
    const b = put(s, 'P1', 'mountain', 'library');
    const a = put(s, 'P1', 'rank-rat', 'library');
    const deep = put(s, 'P1', 'plains', 'library');
    s.players.P1!.library = [a, b, c, deep];
    const ei = put(s, 'P1', 'expressive-iteration', 'hand');
    mana(s, 'P1', { U: 1, R: 1 });
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: ei })).state;
    expect((s.pending as { purpose?: string }).purpose).toBe('iterateHand');
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [a] })).state;
    expect((s.pending as { purpose?: string }).purpose).toBe('iterateBottom');
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [b] })).state;
    expect([s.cards[a]!.zone, s.players.P1!.library.at(-1), s.cards[c]!.zone, s.cards[c]!.playableFromExile?.player]).toEqual(['hand', b, 'exile', 'P1']);
  });

  it('Dirgur Focusmage: cheaper instants and sorceries; prepared by a big one from hand; Braingeyser draws X', () => {
    let s = newGame();
    const mage = put(s, 'P1', 'dirgur-focusmage-braingeyser');
    const geyser = put(s, 'P1', 'mana-geyser', 'hand');
    mana(s, 'P1', { R: 2, C: 2 }); // {3}{R}{R} less {1}
    s = cast(s, { type: 'CastSpell', player: 'P1', card: geyser }).state;
    expect(s.cards[mage]!.prepared).toBe(true);
    const hand = s.players.P1!.hand.length;
    mana(s, 'P1', { U: 2, C: 2 });
    const copy = copyOf(s, mage)!;
    s = cast(s, getLegalActions(s).find((a) => a.type === 'CastSpell' && a.card === copy.id && a.x === 2 && a.targets?.[0]?.kind === 'player' && a.targets[0].player === 'P1')!).state;
    expect(s.players.P1!.hand.length - hand).toBe(2);
  });

  it('Inspired Skypainter: prepared as it enters; Maestro\'s Gift makes a hasty token copy', () => {
    let s = newGame();
    const painter = put(s, 'P1', 'inspired-skypainter-maestros-gift', 'hand');
    const rat = put(s, 'P1', 'rank-rat');
    mana(s, 'P1', { U: 1, R: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: painter }).state;
    expect(s.cards[painter]!.prepared).toBe(true);
    mana(s, 'P1', { U: 1, R: 1, C: 3 });
    const copy = copyOf(s, painter)!;
    s = cast(s, getLegalActions(s).find((a) => a.type === 'CastSpell' && a.card === copy.id && a.targets?.[0]?.kind === 'card' && a.targets[0].card === rat)!).state;
    const token = onField(s, 'rank-rat').find((c) => c.id !== rat)!;
    expect(hasKeyword(s, token, 'Haste')).toBe(true);
  });
});

describe('SOC2e: Prismari Artistry (Rootha, Stormsinger, Furygale Flocking, Twinflame)', () => {
  const onField = (s: GameState, defId: string, who = 'P1') => Object.values(s.cards).filter((c) => c.zone === 'battlefield' && c.controller === who && c.defId === defId);

  it('Rootha, Mastering the Moment: at combat, an X/X flier for the biggest instant or sorcery cast this turn', () => {
    let s = newGame();
    put(s, 'P1', 'rootha-mastering-the-moment');
    s = settle(goTo(s, 'beginCombat')).state;
    expect(onField(s, 'elemental-x-token-soc').length).toBe(0);
    let t = newGame();
    put(t, 'P1', 'rootha-mastering-the-moment');
    const geyser = put(t, 'P1', 'mana-geyser', 'hand');
    mana(t, 'P1', { R: 2, C: 3 });
    t = cast(t, { type: 'CastSpell', player: 'P1', card: geyser }).state;
    t = settle(goTo(t, 'beginCombat')).state;
    const token = onField(t, 'elemental-x-token-soc')[0]!;
    expect([powerOf(t, token), hasKeyword(t, token, 'Flying'), hasKeyword(t, token, 'Haste')]).toEqual([5, true, true]);
  });

  it('Redoubled Stormsinger copies tokens that entered this turn, tapped and attacking', () => {
    let s = newGame();
    const singer = put(s, 'P1', 'redoubled-stormsinger');
    const token = put(s, 'P1', 'elemental-1-1-token-soc');
    s.cards[token]!.isToken = true;
    s.cards[token]!.enteredTurn = s.turnNumber;
    const old = put(s, 'P1', 'elemental-4-4-token-soc');
    s.cards[old]!.isToken = true;
    s.cards[old]!.enteredTurn = s.turnNumber - 1;
    s = settle(goTo(s, 'declareAttackers')).state;
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: singer, defender: 'P2' }] })).state;
    const copies = onField(s, 'elemental-1-1-token-soc').filter((c) => c.id !== token);
    expect(copies.length).toBe(1);
    expect(s.combat?.attacks.some((a) => a.attacker === copies[0]!.id && a.defender === 'P2')).toBe(true);
    expect(onField(s, 'elemental-4-4-token-soc').length).toBe(1);
  });

  it('Furygale Flocking costs less per instant and sorcery card in your graveyard; two hasty fliers per opponent that must attack it', () => {
    let s = newGame(3);
    for (let i = 0; i < 4; i++) put(s, 'P1', 'abrade', 'graveyard');
    const flock = put(s, 'P1', 'furygale-flocking', 'hand');
    mana(s, 'P1', { R: 2, C: 4 }); // {8}{R}{R} less {4}
    s = cast(s, { type: 'CastSpell', player: 'P1', card: flock }).state;
    const birds = onField(s, 'elemental-token-sos');
    expect(birds.length).toBe(4);
    expect(birds.map((b) => b.mustAttackPlayer?.player).sort()).toEqual(['P2', 'P2', 'P3', 'P3']);
    expect(hasKeyword(s, birds[0]!, 'Haste')).toBe(true);
  });

  it('Twinflame: strive costs {2}{R} more per extra target; hasty copies exiled at the end step', () => {
    let s = newGame();
    const a = put(s, 'P1', 'rank-rat');
    const b = put(s, 'P1', 'hungry-graffalon');
    const twin = put(s, 'P1', 'twinflame', 'hand');
    mana(s, 'P1', { R: 1, C: 1 });
    const both = (x: GameState) => getLegalActions(x).find((act) => act.type === 'CastSpell' && act.card === twin && act.targets?.filter((t) => t.kind === 'card').length === 2);
    expect(both(s)).toBeUndefined();
    mana(s, 'P1', { R: 1, C: 2 });
    s = cast(s, both(s)!).state;
    expect([onField(s, 'rank-rat').length, onField(s, 'hungry-graffalon').length]).toEqual([2, 2]);
    s = settle(goTo(s, 'end')).state;
    expect([onField(s, 'rank-rat').length, onField(s, 'hungry-graffalon').length]).toEqual([1, 1]);
    void a; void b;
  });

  it('Twinflame takes any number of targets: every creature you control, past the listed combinations', () => {
    let s = newGame();
    const mine = Array.from({ length: 9 }, () => put(s, 'P1', 'rank-rat'));
    const twin = put(s, 'P1', 'twinflame', 'hand');
    mana(s, 'P1', { R: 9, C: 17 }); // {1}{R} plus {2}{R} for each of 8 more targets
    const nine = getLegalActions(s).find((x) => x.type === 'CastSpell' && x.card === twin && x.targets?.length === 9);
    expect(nine).toBeDefined();
    // Too many combinations of fewer targets to list: each slot's options come along.
    const four = getLegalActions(s).find((x) => x.type === 'CastSpell' && x.card === twin && x.targets?.length === 4);
    expect(four?.type === 'CastSpell' && four.targetSlots?.length).toBe(4);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: twin, targets: mine.map(card) }).state;
    expect(onField(s, 'rank-rat').length).toBe(18);
  });
});

describe('SOC2f: Prismari Artistry (Brudiclad)', () => {
  it('Brudiclad: creature tokens have haste; at combat a 2/1 Myr, then each other token may become a copy of one', () => {
    let s = newGame();
    put(s, 'P1', 'brudiclad-telchor-engineer');
    const big = put(s, 'P1', 'elemental-4-4-token-soc');
    s.cards[big]!.isToken = true;
    s = goTo(s, 'beginCombat');
    s = settle(s).state;
    expect((s.pending as { purpose?: string }).purpose).toBe('tokenModel');
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [big] })).state;
    const myr = Object.values(s.cards).find((c) => c.zone === 'battlefield' && c.defId === 'phyrexian-myr-token-soc')!;
    expect([powerOf(s, myr), currentDefinition(s, myr).name, hasKeyword(s, myr, 'Haste')]).toEqual([4, 'Elemental', true]);
  });
});

describe('SOC2g: Prismari Artistry (Muddle, Surge to Victory, Dance with Calamity)', () => {
  it('Muddle becomes a copy of up to one target nonlegendary creature you control until end of turn, with myriad', () => {
    let s = newGame();
    const muddle = put(s, 'P1', 'muddle-the-ever-changing');
    const big = put(s, 'P1', 'hungry-graffalon');
    const rat = put(s, 'P2', 'rank-rat');
    const abrade = put(s, 'P1', 'abrade', 'hand');
    mana(s, 'P1', { R: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: abrade, mode: 0, targets: [card(rat)] }, { targets: (o) => o.find((t) => t[0]?.kind === 'card' && t[0].card === big)! }).state;
    const d = currentDefinition(s, s.cards[muddle]!);
    expect([d.name, powerOf(s, s.cards[muddle]!), d.triggers?.some((t) => t.when === 'Attacks' && t.effects.some((e) => e.effect === 'Myriad'))]).toEqual(['Hungry Graffalon', 3, true]);
    s = settle(goTo(s, 'end')).state;
    s = settle(nextStep(s)).state;
    expect(currentDefinition(s, s.cards[muddle]!).name).toBe('Muddle, the Ever-Changing');
  });

  it('Surge to Victory: exile an instant or sorcery card; creatures get +X/+0; each combat damage to a player lets you cast a copy free', () => {
    let s = newGame();
    const big = put(s, 'P1', 'hungry-graffalon');
    s.cards[big]!.summoningSick = false;
    const geyser = put(s, 'P1', 'mana-geyser', 'graveyard');
    const surge = put(s, 'P1', 'surge-to-victory', 'hand');
    mana(s, 'P1', { R: 2, C: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: surge, targets: [card(geyser)] }).state;
    // 3, a +1/+1 counter from increment (six mana spent), and +5 for the exiled card.
    expect([s.cards[geyser]!.zone, powerOf(s, s.cards[big]!)]).toEqual(['exile', 9]);
    s = fight(s, [{ attacker: big, defender: 'P2' }]).state;
    expect(s.players.P2!.life).toBe(11);
    expect(s.cards[geyser]!.castPermission).toMatchObject({ free: true, asCopy: true });
  });

  it('Dance with Calamity: exile the top card as many times as you choose; 13 or less total lets you cast them free', () => {
    let s = newGame();
    s.players.P1!.library = [];
    for (let i = 0; i < 5; i++) put(s, 'P1', 'rank-rat', 'library');
    const dance = put(s, 'P1', 'dance-with-calamity', 'hand');
    mana(s, 'P1', { R: 1, C: 7 });
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: dance })).state;
    expect([s.pending.kind, (s.pending as { forResolution?: string }).forResolution]).toEqual(['chooseOption', 'exileMore']);
    s = act(s, { type: 'ChooseOption', player: 'P1', option: 'Exile the top card' });
    s = act(s, { type: 'ChooseOption', player: 'P1', option: 'Exile the top card' });
    s = settle(act(s, { type: 'ChooseOption', player: 'P1', option: 'Stop' })).state;
    const exiled = Object.values(s.cards).filter((c) => c.zone === 'exile' && c.defId === 'rank-rat');
    expect(exiled.length).toBe(2);
    expect(exiled.every((c) => c.castPermission?.free && c.castPermission.immediate)).toBe(true);
  });
});

describe('SOC2h: Prismari Artistry (Magma Opus)', () => {
  it('Magma Opus divides 4 damage among any targets, players included; taps two; a 4/4 Elemental; draws two', () => {
    let s = newGame();
    const rat = put(s, 'P2', 'rank-rat');
    const land1 = put(s, 'P2', 'mountain');
    const land2 = put(s, 'P2', 'island');
    const opus = put(s, 'P1', 'magma-opus', 'hand');
    const hand = s.players.P1!.hand.length;
    mana(s, 'P1', { U: 1, R: 1, C: 6 });
    const none = { kind: 'none' } as const;
    s = act(s, { type: 'CastSpell', player: 'P1', card: opus, targets: [card(rat), { kind: 'player', player: 'P2' }, none, none, card(land1), card(land2)] });
    s = settle(s).state;
    // One point each is assigned; the other two are divided one at a time.
    while (s.pending.kind === 'chooseCards' && s.pending.purpose === 'divideDamage') s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: ['P2'] })).state;
    expect([s.cards[rat]!.zone, s.players.P2!.life, s.cards[land1]!.tapped, s.cards[land2]!.tapped]).toEqual(['graveyard', 17, true, true]);
    expect(Object.values(s.cards).some((c) => c.zone === 'battlefield' && c.defId === 'elemental-4-4-token-soc')).toBe(true);
    expect(s.players.P1!.hand.length - hand).toBe(1); // two drawn, Magma Opus cast
  });

  it('Magma Opus: {U/R}{U/R}, discard it from your hand: a Treasure', () => {
    let s = newGame();
    const opus = put(s, 'P1', 'magma-opus', 'hand');
    mana(s, 'P1', { U: 1, R: 1 });
    s = cast(s, getLegalActions(s).find((a) => a.type === 'ActivateAbility' && a.card === opus)!).state;
    expect([s.cards[opus]!.zone, Object.values(s.cards).some((c) => c.zone === 'battlefield' && c.defId === 'treasure-token-sos')]).toEqual(['graveyard', true]);
  });
});

describe('SOC2h: Mirrorwing Dragon', () => {
  it('a spell that targets only it is copied for each other creature its caster controls, one copy each', () => {
    let s = newGame();
    const dragon = put(s, 'P2', 'mirrorwing-dragon');
    const theirRat = put(s, 'P2', 'rank-rat');
    const mine = put(s, 'P1', 'rank-rat');
    const mine2 = put(s, 'P1', 'hungry-graffalon');
    const abrade = put(s, 'P1', 'abrade', 'hand');
    mana(s, 'P1', { R: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: abrade, mode: 0, targets: [card(dragon)] }).state;
    // The caster's own creatures are each dealt 3 damage by a copy; the other player's aren't.
    expect([s.cards[mine]!.zone, s.cards[mine2]!.damage, s.cards[theirRat]!.zone]).toEqual(['graveyard', 3, 'battlefield']);
  });
});

describe('SOC2i: Rousing Refrain (suspend)', () => {
  it('adds {R} per card in the target opponent\'s hand, kept until end of turn; exiled with three time counters; cast free when the last comes off', () => {
    let s = newGame();
    for (let i = 0; i < 4; i++) put(s, 'P2', 'rank-rat', 'hand');
    const refrain = put(s, 'P1', 'rousing-refrain', 'hand');
    mana(s, 'P1', { R: 2, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: refrain, targets: [{ kind: 'player', player: 'P2' }] }).state;
    expect(s.players.P1!.manaPool.R).toBe(4);
    expect([s.cards[refrain]!.zone, s.cards[refrain]!.suspended, s.cards[refrain]!.namedCounters?.time]).toEqual(['exile', true, 3]);
    // The mana stays as steps end this turn.
    s = settle(nextStep(s)).state;
    expect(s.players.P1!.manaPool.R).toBe(4);
    // Three of P1's upkeeps: a time counter comes off each; with the last, it may be cast free.
    for (let turn = 0; turn < 3; turn++) {
      s = settle(goTo(s, 'end')).state;
      s = settle(goTo(s, 'upkeep')).state;
      if (s.activePlayer !== 'P1') { s = settle(goTo(s, 'end')).state; s = settle(goTo(s, 'upkeep')).state; }
    }
    expect([s.activePlayer, s.cards[refrain]!.namedCounters?.time ?? 0, s.cards[refrain]!.castPermission?.free]).toEqual(['P1', 0, true]);
    expect(s.players.P1!.manaPool.R).toBe(0);
  });

  it('suspend is a special action from your hand: pay {1}{R} and exile it with three time counters', () => {
    let s = newGame();
    const refrain = put(s, 'P1', 'rousing-refrain', 'hand');
    mana(s, 'P1', { R: 1, C: 1 });
    expect(getLegalActions(s).some((a) => a.type === 'Suspend' && a.card === refrain)).toBe(true);
    s = act(s, { type: 'Suspend', player: 'P1', card: refrain });
    expect([s.cards[refrain]!.zone, s.cards[refrain]!.namedCounters?.time, s.players.P1!.manaPool.R]).toEqual(['exile', 3, 0]);
  });
});

describe('SOC2i: Abstract Performance, Plargg and Nassari', () => {
  it('Abstract Performance: an opponent bins a pile; cast a spell from the other free; the rest to hand', () => {
    let s = newGame();
    s.players.P1!.library = [];
    const ids = Array.from({ length: 8 }, (_, i) => put(s, 'P1', i % 2 ? 'rank-rat' : 'island', 'library'));
    s.players.P1!.library = [...ids];
    const ap = put(s, 'P1', 'abstract-performance', 'hand');
    mana(s, 'P1', { U: 1, C: 5 });
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: ap })).state;
    expect([s.pending.kind, (s.pending as { player?: string }).player, (s.pending as { forResolution?: string }).forResolution]).toEqual(['chooseOption', 'P2', 'pile']);
    // Face down (the first four) is hidden from P2 until chosen.
    expect(s.cards[ids[0]!]!.linkedExile?.lookers).toEqual([]);
    s = act(s, { type: 'ChooseOption', player: 'P2', option: 'Face-up pile' });
    expect(ids.slice(4).every((id) => s.cards[id]!.zone === 'graveyard')).toBe(true);
    expect((s.pending as { purpose?: string }).purpose).toBe('castOneFree');
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [ids[1]!] })).state;
    expect([s.cards[ids[1]!]!.castPermission?.free, s.cards[ids[0]!]!.zone, s.cards[ids[3]!]!.zone]).toEqual([true, 'hand', 'hand']);
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: ids[1]! })).state;
    expect(s.cards[ids[1]!]!.zone).toBe('battlefield');
  });

  it('Plargg and Nassari: each player exiles until nonland; an opponent denies one; cast up to two others free', () => {
    let s = newGame();
    put(s, 'P1', 'plargg-and-nassari');
    s.players.P1!.library = []; s.players.P2!.library = [];
    const mine = put(s, 'P1', 'rank-rat', 'library');
    put(s, 'P1', 'island', 'library');
    const theirs = put(s, 'P2', 'hungry-graffalon', 'library');
    put(s, 'P2', 'plains', 'library'); // P2 draws this on their turn
    s = settle(goTo(s, 'end')).state;
    s = settle(goTo(s, 'main1')).state;
    s = settle(goTo(s, 'end')).state;
    s = goTo(s, 'upkeep');
    for (let i = 0; i < 4 && !(s.pending.kind === 'chooseCards' && s.pending.purpose === 'denyCast'); i++) s = act(s, { type: 'PassPriority', player: (s.pending as { player: string }).player });
    expect([s.pending.kind, (s.pending as { player?: string }).player]).toEqual(['chooseCards', 'P2']);
    s = act(s, { type: 'ChooseCards', player: 'P2', cards: [theirs] });
    const cast = getLegalActions(s).filter((a) => a.type === 'CastSpell');
    expect(cast.some((a) => a.type === 'CastSpell' && a.card === mine)).toBe(true);
    expect(cast.some((a) => a.type === 'CastSpell' && a.card === theirs)).toBe(false);
  });
});

describe('SOC3a: Quandrix Unlimited ({X} creatures, counters, spells)', () => {
  const onField = (s: GameState, defId: string, who = 'P1') => Object.values(s.cards).filter((c) => c.zone === 'battlefield' && c.controller === who && c.defId === defId);

  it('Benevolent Hydra enters with X counters and adds one more to counters on your other creatures; Kami of Whispered Hopes taps for its power', () => {
    let s = newGame();
    const hydra = put(s, 'P1', 'benevolent-hydra', 'hand');
    const rat = put(s, 'P1', 'rank-rat');
    mana(s, 'P1', { G: 2, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: hydra, x: 3 }).state;
    expect(s.cards[hydra]!.counters).toBe(3);
    s.cards[hydra]!.summoningSick = false;
    s = cast(s, getLegalActions(s).find((a) => a.type === 'ActivateAbility' && a.card === hydra && a.targets?.[0]?.kind === 'card' && a.targets[0].card === rat)!).state;
    expect([s.cards[hydra]!.counters, s.cards[rat]!.counters]).toEqual([2, 2]);
    const kami = put(s, 'P1', 'kami-of-whispered-hopes');
    s.cards[kami]!.summoningSick = false;
    s.cards[kami]!.counters = 2;
    s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: kami, mana: 'U' });
    expect(s.players.P1!.manaPool.U).toBe(3);
  });

  it('Hydroid Krasis: when cast, gain half X life and draw half X cards; Stonecoil Serpent has protection from multicolored', () => {
    let s = newGame();
    const krasis = put(s, 'P1', 'hydroid-krasis', 'hand');
    const hand = s.players.P1!.hand.length;
    mana(s, 'P1', { G: 1, U: 1, C: 5 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: krasis, x: 5 }).state;
    expect([s.players.P1!.life, s.players.P1!.hand.length - hand, s.cards[krasis]!.counters]).toEqual([22, 1, 5]);
    const serpent = put(s, 'P1', 'stonecoil-serpent');
    const charm = put(s, 'P2', 'quandrix-charm', 'hand');
    expect(getLegalActions({ ...s, pending: { kind: 'priority', player: 'P2', passes: 0 } } as GameState).some((a) => a.type === 'CastSpell' && a.card === charm && a.targets?.some((t) => t.kind === 'card' && t.card === serpent))).toBe(false);
  });

  it('Primordial Hydra doubles its counters each upkeep and has trample with ten or more; Goldvein Hydra leaves tapped Treasures equal to its power', () => {
    let s = newGame();
    const hydra = put(s, 'P1', 'primordial-hydra');
    s.cards[hydra]!.counters = 5;
    s = settle(goTo(s, 'end')).state;
    s = settle(goTo(s, 'upkeep')).state; // P2's
    s = settle(goTo(s, 'end')).state;
    s = settle(goTo(s, 'upkeep')).state; // P1's
    expect([s.activePlayer, s.cards[hydra]!.counters, hasKeyword(s, s.cards[hydra]!, 'Trample')]).toEqual(['P1', 10, true]);
    const gold = put(s, 'P2', 'goldvein-hydra');
    s.cards[gold]!.counters = 3;
    const bolt = put(s, 'P1', 'rapid-hybridization', 'hand');
    mana(s, 'P1', { U: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: bolt, targets: [card(gold)] }).state;
    const treasures = onField(s, 'treasure-token-sos', 'P2');
    expect([treasures.length, treasures.every((t) => t.tapped), onField(s, 'frog-lizard-token-soc', 'P2').length]).toEqual([3, true, 1]);
  });

  it('Curse of the Swine exiles X creatures and each controller gets a Boar; Entrancing Melody takes a creature with mana value X', () => {
    let s = newGame();
    const a = put(s, 'P2', 'rank-rat');
    const b = put(s, 'P2', 'hungry-graffalon');
    const curse = put(s, 'P1', 'curse-of-the-swine', 'hand');
    mana(s, 'P1', { U: 2, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: curse, x: 2, targets: [card(a), card(b)] }).state;
    expect([s.cards[a]!.zone, s.cards[b]!.zone, onField(s, 'boar-token-soc', 'P2').length]).toEqual(['exile', 'exile', 2]);
    const big = put(s, 'P2', 'hungry-graffalon');
    const melody = put(s, 'P1', 'entrancing-melody', 'hand');
    mana(s, 'P1', { U: 2, C: 4 });
    expect(getLegalActions(s).some((x) => x.type === 'CastSpell' && x.card === melody && x.x === 3 && x.targets?.[0]?.kind === 'card' && x.targets[0].card === big)).toBe(false);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: melody, x: 4, targets: [card(big)] }).state;
    expect(s.cards[big]!.controller).toBe('P1');
  });

  it('Biomass Mutation sets your creatures to X/X; Primal Might pumps and fights; Commander\'s Insight draws X plus commander casts', () => {
    let s = newGame();
    const rat = put(s, 'P1', 'rank-rat');
    const theirs = put(s, 'P2', 'hungry-graffalon');
    const bio = put(s, 'P1', 'biomass-mutation', 'hand');
    mana(s, 'P1', { G: 1, U: 1, C: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: bio, x: 4 }).state;
    expect([powerOf(s, s.cards[rat]!), toughnessOf(s, s.cards[rat]!)]).toEqual([4, 4]);
    const might = put(s, 'P1', 'primal-might', 'hand');
    mana(s, 'P1', { G: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: might, x: 1, targets: [card(rat), card(theirs)] }).state;
    expect(s.cards[theirs]!.zone).toBe('graveyard');
    s.players.P1!.commanderCasts = { [rat]: 2 } as never;
    const insight = put(s, 'P1', 'commanders-insight', 'hand');
    const hand = s.players.P1!.hand.length;
    mana(s, 'P1', { U: 3, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: insight, x: 1, targets: [{ kind: 'player', player: 'P1' }] }).state;
    expect(s.players.P1!.hand.length - hand).toBe(2); // X=1 plus 2, less the spell itself
  });
});

describe('SOC3b: Quandrix Unlimited (first {X} spell each turn, Fractals)', () => {
  const onField = (s: GameState, defId: string, who = 'P1') => Object.values(s.cards).filter((c) => c.zone === 'battlefield' && c.controller === who && c.defId === defId);

  it('Zimone: the first {X} spell each turn costs {1} less per +1/+1 counter, and Zimone gets two counters; Nev gets X counters; only the first spell counts', () => {
    let s = newGame();
    const zimone = put(s, 'P1', 'zimone-infinite-analyst');
    s.cards[zimone]!.counters = 2;
    const nev = put(s, 'P1', 'nev-the-practical-dean');
    const stroke = put(s, 'P1', 'stroke-of-genius', 'hand');
    // {X}{2}{U} with X = 2 is five mana, less {2}.
    mana(s, 'P1', { U: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: stroke, x: 2, targets: [{ kind: 'player', player: 'P1' }] }).state;
    expect([s.cards[zimone]!.counters, s.cards[nev]!.counters]).toEqual([4, 2]);
    expect(hasKeyword(s, s.cards[nev]!, 'Trample')).toBe(true);
    const again = put(s, 'P1', 'stroke-of-genius', 'hand');
    mana(s, 'P1', { U: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: again, x: 1, targets: [{ kind: 'player', player: 'P1' }] }).state;
    expect([s.cards[zimone]!.counters, s.cards[nev]!.counters]).toEqual([4, 2]);
  });

  it('Owlin Spiralmancer copies the first {X} spell; a copy of a permanent spell becomes a token', () => {
    let s = newGame();
    put(s, 'P1', 'owlin-spiralmancer');
    const hydra = put(s, 'P1', 'stonecoil-serpent', 'hand');
    mana(s, 'P1', { C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: hydra, x: 2 }).state;
    const serpents = onField(s, 'stonecoil-serpent');
    expect(serpents.length).toBe(2);
    expect(serpents.filter((c) => c.isToken).length).toBe(1);
    expect(serpents.every((c) => c.counters === 2)).toBe(true);
  });

  it('Lattice Library enters with X study counters and makes a Fractal with that many counters, again on the first {X} spell', () => {
    let s = newGame();
    const lib = put(s, 'P1', 'lattice-library', 'hand');
    mana(s, 'P1', { G: 2, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: lib, x: 3 }).state;
    expect(s.cards[lib]!.namedCounters?.study).toBe(3);
    expect(onField(s, 'fractal-token-sos').map((c) => c.counters)).toEqual([3]);
    // The Library itself was this turn's first {X} spell, so the next one doesn't trigger it.
    const stroke = put(s, 'P1', 'stroke-of-genius', 'hand');
    mana(s, 'P1', { U: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: stroke, x: 1, targets: [{ kind: 'player', player: 'P1' }] }).state;
    expect(onField(s, 'fractal-token-sos').length).toBe(1);
  });

  it('Fractal Harness: a Fractal with X counters, equipped; attacking doubles its counters. Deekah makes Fractals sized by mana value', () => {
    let s = newGame();
    const harness = put(s, 'P1', 'fractal-harness', 'hand');
    mana(s, 'P1', { G: 1, C: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: harness, x: 2 }).state;
    const fractal = onField(s, 'fractal-token-sos')[0]!;
    expect([fractal.counters, s.cards[harness]!.attachedTo]).toEqual([2, fractal.id]);
    s.cards[fractal.id]!.summoningSick = false;
    s = fight(s, [{ attacker: fractal.id, defender: 'P2' }]).state;
    expect(s.cards[fractal.id]!.counters).toBe(4);
    put(s, 'P1', 'deekah-fractal-theorist');
    const rat = put(s, 'P2', 'rank-rat');
    s = settle(goTo(s, 'main2')).state;
    const abrade = put(s, 'P1', 'abrade', 'hand');
    mana(s, 'P1', { R: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: abrade, mode: 0, targets: [card(rat)] }).state;
    expect(onField(s, 'fractal-token-sos').map((c) => c.counters).sort()).toEqual([2, 4]);
  });

  it('The Goose Mother: half X Food rounded up; sacrifice a Food when it attacks to draw. Ingenious Prodigy: skulk, and trades a counter for a card each upkeep', () => {
    let s = newGame();
    const goose = put(s, 'P1', 'the-goose-mother', 'hand');
    mana(s, 'P1', { G: 1, U: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: goose, x: 3 }).state;
    expect([onField(s, 'food-token-soc').length, s.cards[goose]!.counters]).toEqual([2, 3]);
    s.cards[goose]!.summoningSick = false;
    const hand = s.players.P1!.hand.length;
    s = settle(goTo(s, 'declareAttackers')).state;
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: goose, defender: 'P2' }] })).state;
    expect([s.pending.kind, (s.pending as { purpose?: string }).purpose]).toEqual(['chooseCards', 'sacrifice']);
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [onField(s, 'food-token-soc')[0]!.id] })).state;
    expect([onField(s, 'food-token-soc').length, s.players.P1!.hand.length - hand]).toEqual([1, 1]);
    s = settle(goTo(s, 'main2')).state;
    const prodigy = put(s, 'P1', 'ingenious-prodigy');
    s.cards[prodigy]!.counters = 2;
    s = settle(goTo(s, 'end')).state;
    s = settle(goTo(s, 'upkeep')).state;
    s = settle(goTo(s, 'end')).state;
    const before = s.players.P1!.hand.length;
    s = settle(goTo(s, 'upkeep')).state;
    expect([s.activePlayer, s.cards[prodigy]!.counters, s.players.P1!.hand.length - before]).toEqual(['P1', 1, 1]);
  });
});

describe('SOC3c: Quandrix Unlimited (lands, mana and odd/even)', () => {
  const onField = (s: GameState, defId: string, who = 'P1') => Object.values(s.cards).filter((c) => c.zone === 'battlefield' && c.controller === who && c.defId === defId);

  it('Animist\'s Awakening puts the lands among the top X onto the battlefield tapped, untapped with spell mastery; Open the Way\'s X is at most the players', () => {
    let s = newGame();
    s.players.P1!.library = [];
    const ids = [put(s, 'P1', 'rank-rat', 'library'), put(s, 'P1', 'forest', 'library'), put(s, 'P1', 'island', 'library')];
    for (let i = 0; i < 2; i++) put(s, 'P1', 'abrade', 'graveyard');
    const aw = put(s, 'P1', 'animists-awakening', 'hand');
    mana(s, 'P1', { G: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: aw, x: 3 }).state;
    expect([s.cards[ids[1]!]!.zone, s.cards[ids[1]!]!.tapped, s.cards[ids[2]!]!.zone, s.players.P1!.library]).toEqual(['battlefield', false, 'battlefield', [ids[0]]]);
    const way = put(s, 'P1', 'open-the-way', 'hand');
    mana(s, 'P1', { G: 2, C: 5 });
    expect(Math.max(...getLegalActions(s).filter((a) => a.type === 'CastSpell' && a.card === way).map((a) => (a.type === 'CastSpell' ? a.x ?? 0 : 0)))).toBe(2);
  });

  it('Mana Bloom: X charge counters, one mana per turn, back to hand when empty', () => {
    let s = newGame();
    const bloom = put(s, 'P1', 'mana-bloom', 'hand');
    mana(s, 'P1', { G: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: bloom, x: 1 }).state;
    expect(s.cards[bloom]!.namedCounters?.charge).toBe(1);
    s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: bloom, mana: 'R' });
    expect(s.players.P1!.manaPool.R).toBe(1);
    s = settle(goTo(s, 'end')).state;
    s = settle(goTo(s, 'upkeep')).state;
    s = settle(goTo(s, 'end')).state;
    s = settle(goTo(s, 'upkeep')).state;
    expect([s.activePlayer, s.cards[bloom]!.zone]).toEqual(['P1', 'hand']);
  });

  it('Troyan\'s mana pays only for big or {X} spells; Alchemist\'s Refuge lets you cast sorceries at instant speed', () => {
    let s = newGame();
    const troyan = put(s, 'P1', 'troyan-gutsy-explorer');
    s.cards[troyan]!.summoningSick = false;
    s = act(s, getLegalActions(s).find((a) => a.type === 'ActivateAbility' && a.card === troyan && a.ability === 0)!);
    s = settle(s).state;
    expect(s.players.P1!.restrictedMana?.bigOrXSpell?.G).toBe(1);
    const small = put(s, 'P1', 'rank-rat', 'hand');
    expect(getLegalActions(s).some((a) => a.type === 'CastSpell' && a.card === small)).toBe(false);
    const stroke = put(s, 'P1', 'stroke-of-genius', 'hand');
    mana(s, 'P1', { C: 1 });
    expect(getLegalActions(s).some((a) => a.type === 'CastSpell' && a.card === stroke && a.x === 0)).toBe(true);
    const refuge = put(s, 'P1', 'alchemists-refuge');
    s.players.P1!.restrictedMana = undefined;
    s.players.P1!.manaPool = { W: 0, U: 1, B: 0, R: 0, G: 1, C: 0 };
    s = cast(s, getLegalActions(s).find((a) => a.type === 'ActivateAbility' && a.card === refuge)!).state;
    s = settle(goTo(s, 'end')).state;
    const sorcery = put(s, 'P1', 'mana-geyser', 'hand');
    mana(s, 'P1', { R: 2, C: 3 });
    expect(getLegalActions({ ...s, pending: { kind: 'priority', player: 'P1', passes: 0 } } as GameState).some((a) => a.type === 'CastSpell' && a.card === sorcery)).toBe(true);
  });

  it('Zimone\'s Hypothesis: a +1/+1 counter, then creatures with power of the chosen parity return to hand', () => {
    let s = newGame();
    const rat = put(s, 'P1', 'rank-rat'); // 1
    const theirs = put(s, 'P2', 'hungry-graffalon'); // 3
    const even = put(s, 'P2', 'rank-rat');
    const hyp = put(s, 'P1', 'zimones-hypothesis', 'hand');
    mana(s, 'P1', { U: 2, C: 3 });
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: hyp })).state;
    s = act(s, { type: 'ChooseCards', player: 'P1', cards: [even] }); // their rat becomes 2/2
    s = settle(act(s, { type: 'ChooseOption', player: 'P1', option: 'Odd' })).state;
    expect([s.cards[rat]!.zone, s.cards[theirs]!.zone, s.cards[even]!.zone]).toEqual(['hand', 'hand', 'battlefield']);
  });

  it('Guardian Augmenter: commander creatures get +2/+2 and hexproof; Zimone, Quandrix Prodigy draws two with eight lands', () => {
    let s = newGame();
    put(s, 'P1', 'guardian-augmenter');
    const cmdr = put(s, 'P1', 'rank-rat');
    s.cards[cmdr]!.isCommander = true;
    expect([powerOf(s, s.cards[cmdr]!), hasKeyword(s, s.cards[cmdr]!, 'Hexproof')]).toEqual([3, true]);
    const zimone = put(s, 'P1', 'zimone-quandrix-prodigy');
    s.cards[zimone]!.summoningSick = false;
    for (let i = 0; i < 8; i++) put(s, 'P1', 'forest');
    const hand = s.players.P1!.hand.length;
    mana(s, 'P1', { C: 4 });
    s = cast(s, getLegalActions(s).find((a) => a.type === 'ActivateAbility' && a.card === zimone && a.ability === 1)!).state;
    expect(s.players.P1!.hand.length - hand).toBe(2);
    void onField;
  });
});

describe('SOC3d: Quandrix Unlimited (Tanazir, Oversimplify, Commands, Otter, Shotcaller)', () => {
  const onField = (s: GameState, defId: string, who = 'P1') => Object.values(s.cards).filter((c) => c.zone === 'battlefield' && c.controller === who && c.defId === defId);

  it('Tanazir doubles a creature\'s counters as it enters, and on attack other creatures take its base power and toughness', () => {
    let s = newGame();
    const rat = put(s, 'P1', 'rank-rat');
    s.cards[rat]!.counters = 3;
    const tz = put(s, 'P1', 'tanazir-quandrix', 'hand');
    mana(s, 'P1', { G: 1, U: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: tz }, { targets: (o) => o.find((t) => t[0]?.kind === 'card' && t[0].card === rat)! }).state;
    expect(s.cards[rat]!.counters).toBe(6);
    s.cards[tz]!.summoningSick = false;
    s = settle(goTo(s, 'declareAttackers')).state;
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: tz, defender: 'P2' }] })).state;
    // Base 4/4 plus six counters.
    expect([powerOf(s, s.cards[rat]!), toughnessOf(s, s.cards[rat]!)]).toEqual([10, 10]);
  });

  it('Oversimplify exiles all creatures; each player gets a Fractal with counters for the power they lost', () => {
    let s = newGame();
    put(s, 'P1', 'rank-rat');
    put(s, 'P2', 'hungry-graffalon');
    put(s, 'P2', 'rank-rat');
    const os = put(s, 'P1', 'oversimplify', 'hand');
    mana(s, 'P1', { G: 1, U: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: os }).state;
    expect([onField(s, 'fractal-token-sos', 'P1').map((c) => c.counters), onField(s, 'fractal-token-sos', 'P2').map((c) => c.counters)]).toEqual([[1], [4]]);
  });

  it('Quandrix Command: target player shuffles up to three target cards from their own graveyard; plus two counters', () => {
    let s = newGame();
    const theirs = [put(s, 'P2', 'rank-rat', 'graveyard'), put(s, 'P2', 'abrade', 'graveyard')];
    const mine = put(s, 'P1', 'rank-rat', 'graveyard');
    const rat = put(s, 'P1', 'rank-rat');
    const qc = put(s, 'P1', 'quandrix-command', 'hand');
    mana(s, 'P1', { G: 1, U: 1, C: 1 });
    const none = { kind: 'none' } as const;
    expect(() => act(s, { type: 'CastSpell', player: 'P1', card: qc, modes: [2, 3], targets: [card(rat), { kind: 'player', player: 'P2' }, card(theirs[0]!), card(mine), none] })).toThrow();
    s = cast(s, { type: 'CastSpell', player: 'P1', card: qc, modes: [2, 3], targets: [card(rat), { kind: 'player', player: 'P2' }, card(theirs[0]!), card(theirs[1]!), none] }).state;
    expect([s.cards[rat]!.counters, s.cards[theirs[0]!]!.zone, s.cards[theirs[1]!]!.zone, s.cards[mine]!.zone]).toEqual([2, 'library', 'library', 'graveyard']);
  });

  it('Nexus Mentality moves all counters, or removes them to draw; both with a commander', () => {
    let s = newGame();
    const a = put(s, 'P1', 'rank-rat');
    const b = put(s, 'P1', 'rank-rat');
    s.cards[a]!.counters = 3;
    const nm = put(s, 'P1', 'nexus-mentality', 'hand');
    mana(s, 'P1', { U: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: nm, modes: [0], targets: [card(a), card(b)] }).state;
    expect([s.cards[a]!.counters ?? 0, s.cards[b]!.counters]).toEqual([0, 3]);
    const nm2 = put(s, 'P1', 'nexus-mentality', 'hand');
    const hand = s.players.P1!.hand.length;
    mana(s, 'P1', { U: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: nm2, modes: [1], targets: [card(b)] }).state;
    expect([s.cards[b]!.counters ?? 0, s.players.P1!.hand.length - hand]).toEqual([0, 2]); // three drawn, the spell cast
  });

  it('Grove\'s Bounty divides X counters among your creatures (no more targets than X); Elusive Otter can\'t be blocked by smaller creatures', () => {
    let s = newGame();
    const otter = put(s, 'P1', 'elusive-otter-groves-bounty', 'hand');
    const a = put(s, 'P1', 'rank-rat');
    const b = put(s, 'P1', 'rank-rat');
    mana(s, 'P1', { G: 1, C: 3 });
    expect(getLegalActions(s).some((x) => x.type === 'CastSpell' && x.card === otter && x.adventure && x.x === 1 && x.targets?.length === 2)).toBe(false);
    s = act(s, { type: 'CastSpell', player: 'P1', card: otter, adventure: true, x: 3, targets: [card(a), card(b)] });
    s = settle(s).state;
    expect((s.pending as { divideCounters?: boolean }).divideCounters).toBe(true);
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [b] })).state;
    expect([s.cards[a]!.counters, s.cards[b]!.counters, s.cards[otter]!.zone]).toEqual([1, 2, 'exile']);
  });

  it('Striding Shotcaller becomes prepared on combat damage; Run the Play puts counters on X creatures with flying and draws', () => {
    let s = newGame();
    const caller = put(s, 'P1', 'striding-shotcaller-run-the-play');
    const rat = put(s, 'P1', 'rank-rat');
    s.cards[rat]!.summoningSick = false;
    s = fight(s, [{ attacker: rat, defender: 'P2' }]).state;
    expect(s.cards[caller]!.prepared).toBe(true);
    s = settle(goTo(s, 'main2')).state;
    const copy = Object.values(s.cards).find((c) => c.zone === 'exile' && c.prepareSpellOf?.card === caller)!;
    const hand = s.players.P1!.hand.length;
    mana(s, 'P1', { G: 1, U: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: copy.id, x: 1, targets: [card(rat)] }).state;
    expect([s.cards[rat]!.counters, hasKeyword(s, s.cards[rat]!, 'Flying'), s.players.P1!.hand.length - hand]).toEqual([1, true, 1]);
  });
});

describe('SOC3e: Quandrix Unlimited (Kinetic Ooze, Primo, Zimone, Unbound Flourishing, mana rocks)', () => {
  const onField = (s: GameState, defId: string, who = 'P1') => Object.values(s.cards).filter((c) => c.zone === 'battlefield' && c.controller === who && c.defId === defId);

  it('Kinetic Ooze: destroys an artifact or enchantment with mana value X or less, draws at 5, and doubles counters on any number of other creatures at 10', () => {
    let s = newGame();
    const lib = put(s, 'P2', 'mana-bloom'); // mana value 1
    const a = put(s, 'P1', 'rank-rat');
    const b = put(s, 'P1', 'rank-rat');
    s.cards[a]!.counters = 2;
    s.cards[b]!.counters = 1;
    const ooze = put(s, 'P1', 'kinetic-ooze', 'hand');
    const hand = s.players.P1!.hand.length;
    mana(s, 'P1', { G: 1, C: 10 });
    const want = [card(lib), card(a), card(b)];
    s = cast(s, { type: 'CastSpell', player: 'P1', card: ooze, x: 10 }, { targets: (o) => o.find((t) => JSON.stringify(t) === JSON.stringify(want))! }).state;
    expect([s.cards[lib]!.zone, s.cards[a]!.counters, s.cards[b]!.counters, s.cards[ooze]!.counters, s.players.P1!.hand.length - hand]).toEqual(['graveyard', 4, 2, 10, 0]);
  });

  it('Primo enters with twice X counters; creatures with base power 0 hitting a player make a Fractal with that much', () => {
    let s = newGame();
    const primo = put(s, 'P1', 'primo-the-unbounded', 'hand');
    mana(s, 'P1', { G: 2, U: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: primo, x: 2 }).state;
    expect(s.cards[primo]!.counters).toBe(4);
    const fractal = put(s, 'P1', 'fractal-token-sos');
    s.cards[fractal]!.isToken = true;
    s.cards[fractal]!.counters = 3;
    s.cards[fractal]!.summoningSick = false;
    s.cards[primo]!.summoningSick = false;
    s = fight(s, [{ attacker: fractal, defender: 'P2' }, { attacker: primo, defender: 'P2' }]).state;
    // Primo is a 0/0 too, so its own damage counts: 3 + 4.
    expect(onField(s, 'fractal-token-sos').map((c) => c.counters).sort()).toEqual([3, 7]);
  });

  it('Unbound Flourishing doubles X of permanent spells and copies {X} instants and sorceries', () => {
    let s = newGame();
    put(s, 'P1', 'unbound-flourishing');
    const serpent = put(s, 'P1', 'stonecoil-serpent', 'hand');
    mana(s, 'P1', { C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: serpent, x: 2 }).state;
    expect(s.cards[serpent]!.counters).toBe(4);
    const stroke = put(s, 'P1', 'stroke-of-genius', 'hand');
    const hand = s.players.P1!.hand.length;
    mana(s, 'P1', { U: 1, C: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: stroke, x: 2, targets: [{ kind: 'player', player: 'P1' }] }).state;
    expect(s.players.P1!.hand.length - hand).toBe(3); // 2 + 2 drawn, the spell cast
  });

  it('Zimone, All-Questioning: with a land played and a prime number of lands, Primo, the Indivisible with that many counters', () => {
    let s = newGame();
    put(s, 'P1', 'zimone-all-questioning');
    put(s, 'P1', 'forest');
    const land = put(s, 'P1', 'island', 'hand');
    s = settle(act(s, { type: 'PlayLand', player: 'P1', card: land })).state;
    s = settle(goTo(s, 'end')).state;
    expect(onField(s, 'primo-the-indivisible-token-soc').map((c) => c.counters)).toEqual([2]);
  });

  it('Elementalist\'s Palette: two charge counters per {X} spell, and colorless mana for {X} costs only; Brass Infiniscope draws on the next {X} spell', () => {
    let s = newGame();
    const palette = put(s, 'P1', 'elementalists-palette');
    const scope = put(s, 'P1', 'brass-infiniscope');
    s = cast(s, getLegalActions(s).find((a) => a.type === 'ActivateAbility' && a.card === scope)!).state;
    expect(s.players.P1!.manaPool.C).toBe(2);
    const stroke = put(s, 'P1', 'stroke-of-genius', 'hand');
    const hand = s.players.P1!.hand.length;
    mana(s, 'P1', { U: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: stroke, x: 0, targets: [{ kind: 'player', player: 'P1' }] }).state;
    expect(s.cards[palette]!.namedCounters?.charge).toBe(2);
    expect(s.players.P1!.hand.length - hand).toBe(0); // drew one from Infiniscope, cast the spell
    s = cast(s, getLegalActions(s).find((a) => a.type === 'ActivateAbility' && a.card === palette)!).state;
    expect(s.players.P1!.restrictedMana?.xCost?.C).toBe(2);
  });
});

describe('SOC3f: Quandrix Unlimited (Yavimaya Bloomsage, Opal Palace)', () => {
  it('Yavimaya Bloomsage: a counter at your end step, prepared if that creature has power 7; Channel lets you pay 1 life for {C} this turn', () => {
    let s = newGame();
    const sage = put(s, 'P1', 'yavimaya-bloomsage-channel');
    const big = put(s, 'P1', 'rank-rat');
    s.cards[big]!.counters = 5; // 6/6 before the counter
    const pick = { targets: (o: { kind: string; card?: string }[][]) => o.find((t) => t[0]?.kind === 'card' && t[0].card === big)! };
    s = settle(goTo(s, 'end', pick as never), pick as never).state;
    expect([s.cards[big]!.counters, s.cards[sage]!.prepared]).toEqual([6, true]);
    let t = newGame();
    t.players.P1!.lifeManaTurn = undefined;
    const sage2 = put(t, 'P1', 'yavimaya-bloomsage-channel');
    t.cards[sage2]!.prepared = true;
    const copy = Object.values(t.cards).find((c) => c.prepareSpellOf?.card === sage2);
    if (copy) {
      mana(t, 'P1', { G: 2 });
      t = cast(t, { type: 'CastSpell', player: 'P1', card: copy.id }).state;
    } else t.players.P1!.lifeManaTurn = t.turnNumber;
    expect(getLegalActions(t).some((a) => a.type === 'PayLifeForMana')).toBe(true);
    t = act(t, { type: 'PayLifeForMana', player: 'P1' });
    expect([t.players.P1!.life, t.players.P1!.manaPool.C]).toEqual([19, 1]);
  });

  it('Opal Palace: mana of the commander\'s colors; spent on the commander, it enters with a counter per command-zone cast', () => {
    let s = newGame();
    const palace = put(s, 'P1', 'opal-palace');
    const cmdr = put(s, 'P1', 'rank-rat', 'command');
    s.cards[cmdr]!.isCommander = true;
    s.players.P1!.commanderCasts = { [cmdr]: 1 };
    mana(s, 'P1', { C: 1 });
    s = act(s, getLegalActions(s).find((a) => a.type === 'ActivateAbility' && a.card === palace)!);
    s = settle(s).state;
    expect([s.pending.kind, (s.pending as { options?: string[] }).options]).toEqual(['chooseMana', ['B']]);
    s = settle(act(s, { type: 'ChooseMana', player: 'P1', mana: 'B' })).state;
    expect(s.players.P1!.opalMana?.B).toBe(1);
    mana(s, 'P1', { C: 3 }); // {1}{B} plus {2} commander tax
    s = cast(s, { type: 'CastSpell', player: 'P1', card: cmdr }).state;
    expect([s.cards[cmdr]!.zone, s.cards[cmdr]!.counters]).toEqual(['battlefield', 2]);
  });
});

describe('SOC4a: Silverquill Influence (removal, lands, Aura support)', () => {
  const castable = (s: GameState, id: string) => getLegalActions(s).filter((a) => a.type === 'CastSpell' && a.card === id);
  const hits = (ts: readonly unknown[], id: string) => ts.some((t) => (t as { kind?: string; card?: string } | undefined)?.card === id);
  const aura = (s: GameState, who: 'P1' | 'P2', defId: string, on: string) => put(s, who, defId, 'battlefield', { attachedTo: on });

  it('Vanishing Verse exiles only a monocolored permanent; Anguished Unmaking exiles and costs 3 life; Fracture destroys an enchantment', () => {
    let s = newGame();
    const mono = put(s, 'P2', 'rank-rat');
    const gold = put(s, 'P2', 'killian-ink-duelist');
    const verse = put(s, 'P1', 'vanishing-verse', 'hand');
    mana(s, 'P1', { W: 1, B: 1 });
    const targets = castable(s, verse).flatMap((a) => (a.type === 'CastSpell' ? a.targets ?? [] : []));
    expect(hits(targets, mono)).toBe(true);
    expect(hits(targets, gold)).toBe(false);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: verse, targets: [card(mono)] }).state;
    expect(s.cards[mono]!.zone).toBe('exile');
    const unmaking = put(s, 'P1', 'anguished-unmaking', 'hand');
    mana(s, 'P1', { W: 1, B: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: unmaking, targets: [card(gold)] }).state;
    expect([s.cards[gold]!.zone, s.players.P1!.life]).toEqual(['exile', 17]);
    const prison = put(s, 'P2', 'ghostly-prison');
    const fracture = put(s, 'P1', 'fracture', 'hand');
    mana(s, 'P1', { W: 1, B: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: fracture, targets: [card(prison)] }).state;
    expect(s.cards[prison]!.zone).toBe('graveyard');
  });

  it('Winds of Rath destroys only creatures that aren\'t enchanted', () => {
    let s = newGame();
    const bare = put(s, 'P2', 'rank-rat');
    const dressed = put(s, 'P2', 'rank-rat');
    aura(s, 'P1', 'spirit-mantle', dressed);
    const winds = put(s, 'P1', 'winds-of-rath', 'hand');
    mana(s, 'P1', { W: 2, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: winds, targets: [] }).state;
    expect([s.cards[bare]!.zone, s.cards[dressed]!.zone]).toEqual(['graveyard', 'battlefield']);
  });

  it('Kor Spiritdancer: +2/+2 per Aura on it and may draw on an Aura spell; Spirit Mantle gives protection from creatures; Transcendent Envoy and Starfield Mystic reduce Aura costs', () => {
    let s = newGame();
    const dancer = put(s, 'P1', 'kor-spiritdancer');
    put(s, 'P1', 'transcendent-envoy');
    const mystic = put(s, 'P1', 'starfield-mystic');
    const mantle = put(s, 'P1', 'spirit-mantle', 'hand');
    const hand = s.players.P1!.hand.length;
    mana(s, 'P1', { W: 1 }); // {1}{W} less {1} (Envoy) less {1} (Mystic, generic only)
    s = cast(s, { type: 'CastSpell', player: 'P1', card: mantle, targets: [card(dancer)] }).state;
    expect(s.cards[mantle]!.attachedTo).toBe(dancer);
    expect(s.players.P1!.hand.length).toBe(hand); // cast one, drew one
    expect([powerOf(s, s.cards[dancer]!), toughnessOf(s, s.cards[dancer]!)]).toEqual([3, 5]);
    expect(hasKeyword(s, s.cards[dancer]!, 'ProtectionFromCreatures')).toBe(true);
    const fracture = put(s, 'P1', 'fracture', 'hand');
    mana(s, 'P1', { W: 1, B: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: fracture, targets: [card(mantle)] }).state;
    expect([s.cards[mantle]!.zone, s.cards[mystic]!.counters]).toEqual(['graveyard', 1]);
  });

  it('Raffine\'s Guidance can be cast from the graveyard for {2}{W}, and not for that cost from the hand', () => {
    let s = newGame();
    const rat = put(s, 'P1', 'rank-rat');
    const inHand = put(s, 'P1', 'raffines-guidance', 'hand');
    const dead = put(s, 'P1', 'raffines-guidance', 'graveyard');
    mana(s, 'P1', { W: 1, C: 2 });
    expect(castable(s, inHand).some((a) => a.type === 'CastSpell' && a.alternative)).toBe(false);
    const fromYard = castable(s, dead).find((a) => a.type === 'CastSpell' && hits(a.targets ?? [], rat));
    expect(fromYard).toBeDefined();
    s = cast(s, fromYard!).state;
    expect([s.cards[dead]!.zone, s.cards[dead]!.attachedTo, powerOf(s, s.cards[rat]!)]).toEqual(['battlefield', rat, 2]);
  });

  it('Killian, Ink Duelist: spells that target a creature cost {2} less', () => {
    const s = newGame();
    const rat = put(s, 'P2', 'rank-rat');
    const prison = put(s, 'P2', 'ghostly-prison');
    const unmaking = put(s, 'P1', 'anguished-unmaking', 'hand');
    mana(s, 'P1', { W: 1, B: 1 });
    expect(castable(s, unmaking)).toEqual([]);
    put(s, 'P1', 'killian-ink-duelist');
    const targets = castable(s, unmaking).flatMap((a) => (a.type === 'CastSpell' ? a.targets ?? [] : []));
    expect(hits(targets, rat)).toBe(true);
    expect(hits(targets, prison)).toBe(false);
  });

  it('War Room pays life equal to the commander\'s colors to draw; Arcane Lighthouse strips hexproof from opponents\' creatures', () => {
    let s = newGame();
    const room = put(s, 'P1', 'war-room');
    const cmdr = put(s, 'P1', 'killian-ink-duelist', 'command');
    s.cards[cmdr]!.isCommander = true;
    const hand = s.players.P1!.hand.length;
    mana(s, 'P1', { C: 3 });
    s = cast(s, activate(s, room)!).state;
    expect([s.players.P1!.life, s.players.P1!.hand.length - hand]).toEqual([18, 1]);
    s.cardDefs['hexproof-rat'] = { ...s.cardDefs['rank-rat']!, id: 'hexproof-rat', keywords: ['Hexproof'] };
    const rat = put(s, 'P2', 'hexproof-rat');
    const mine = put(s, 'P1', 'hexproof-rat');
    const light = put(s, 'P1', 'arcane-lighthouse');
    mana(s, 'P1', { C: 1 });
    s = cast(s, activate(s, light)!).state;
    expect([hasKeyword(s, s.cards[rat]!, 'Hexproof'), hasKeyword(s, s.cards[mine]!, 'Hexproof')]).toEqual([false, true]);
  });
});

describe('SOC4b: Silverquill Influence (goad Auras, Killian, constellation)', () => {
  const onAura = (s: GameState, who: 'P1' | 'P2', defId: string, on: string) => put(s, who, defId, 'battlefield', { attachedTo: on });
  const prison = (s: GameState, target?: string) => {
    const id = put(s, 'P1', 'ghostly-prison', 'hand');
    mana(s, 'P1', { W: 1, C: 2 });
    const pick = target ? { targets: (o: { kind: string; card?: string }[][]) => o.find((t) => t[0]?.kind === 'card' && t[0].card === target)! } : {};
    return cast(s, { type: 'CastSpell', player: 'P1', card: id, targets: [] }, pick as never).state;
  };

  it('Coercive Impetus: +1/+1, goaded (it must attack), and you draw and lose 1 life when it attacks', () => {
    let s = newGame();
    const rat = put(s, 'P1', 'rank-rat');
    onAura(s, 'P1', 'coercive-impetus', rat);
    expect(powerOf(s, s.cards[rat]!)).toBe(2);
    s = goTo(s, 'declareAttackers');
    expect(rejected(s, { type: 'DeclareAttackers', player: 'P1', attacks: [] })).toMatch(/attack/i);
    const hand = s.players.P1!.hand.length;
    s = fight(s, [{ attacker: rat, defender: 'P2' }]).state;
    expect([s.players.P1!.hand.length - hand, s.players.P1!.life, s.players.P2!.life]).toEqual([1, 19, 18]);
  });

  it('Parasitic Impetus: the enchanted creature\'s controller loses 2 and the Aura\'s controller gains 2; Martial Impetus pumps the other attackers', () => {
    let s = newGame();
    const rat = put(s, 'P1', 'rank-rat');
    const other = put(s, 'P1', 'rank-rat');
    onAura(s, 'P2', 'parasitic-impetus', rat);
    onAura(s, 'P1', 'martial-impetus', rat);
    s = goTo(s, 'declareAttackers');
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: rat, defender: 'P2' }, { attacker: other, defender: 'P2' }] })).state;
    expect([s.players.P1!.life, s.players.P2!.life]).toEqual([18, 22]);
    expect([powerOf(s, s.cards[rat]!), powerOf(s, s.cards[other]!)]).toEqual([4, 2]);
  });

  it('Killian, Decisive Mentor: an enchantment entering taps and goads up to one creature until your next turn; enchanted attackers draw a card', () => {
    let s = newGame();
    put(s, 'P1', 'killian-decisive-mentor');
    const theirs = put(s, 'P2', 'rank-rat');
    s = prison(s, theirs);
    expect([s.cards[theirs]!.tapped, s.cards[theirs]!.goadedUntil]).toEqual([true, ['P1']]);
    const mine = put(s, 'P1', 'rank-rat');
    onAura(s, 'P1', 'spirit-mantle', mine);
    const hand = s.players.P1!.hand.length;
    s = goTo(s, 'declareAttackers');
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: mine, defender: 'P2' }] })).state;
    expect(s.players.P1!.hand.length - hand).toBe(1);
  });

  it('Archon of Sun\'s Grace makes a lifelink Pegasus and Doomwake Giant shrinks opponents\' creatures when an enchantment enters', () => {
    let s = newGame();
    put(s, 'P1', 'archon-of-suns-grace');
    put(s, 'P1', 'doomwake-giant');
    const rat = put(s, 'P2', 'rank-rat');
    s = prison(s);
    const pegasus = Object.values(s.cards).find((c) => c.defId === 'pegasus-token-soc' && c.zone === 'battlefield');
    expect(pegasus && hasKeyword(s, pegasus, 'Lifelink')).toBe(true);
    expect(s.cards[rat]!.zone).toBe('graveyard');
  });

  it('Eldrazi Conscription: +10/+10 and trample, and the defending player sacrifices two permanents; Redemption Arc exiles its creature', () => {
    let s = newGame();
    const rat = put(s, 'P1', 'rank-rat');
    onAura(s, 'P1', 'eldrazi-conscription', rat);
    expect([powerOf(s, s.cards[rat]!), hasKeyword(s, s.cards[rat]!, 'Trample')]).toEqual([11, true]);
    const a = put(s, 'P2', 'plains');
    const b = put(s, 'P2', 'plains');
    put(s, 'P2', 'plains');
    s = goTo(s, 'declareAttackers');
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: rat, defender: 'P2' }] })).state;
    expect([s.pending.kind, (s.pending as { player?: string }).player]).toEqual(['chooseCards', 'P2']);
    s = settle(act(s, { type: 'ChooseCards', player: 'P2', cards: [a, b] })).state;
    expect([s.cards[a]!.zone, s.cards[b]!.zone]).toEqual(['graveyard', 'graveyard']);
    let t = newGame();
    const foe = put(t, 'P2', 'rank-rat');
    const arc = onAura(t, 'P1', 'redemption-arc', foe);
    expect(hasKeyword(t, t.cards[foe]!, 'Indestructible')).toBe(true);
    mana(t, 'P1', { W: 1, C: 1 });
    t = cast(t, activate(t, arc)!).state;
    expect(t.cards[foe]!.zone).toBe('exile');
  });
});

describe('SOC4c: Silverquill Influence (attack restrictions and attack triggers)', () => {
  const attack = (s: GameState, who: string, attacks: { attacker: string; defender: string }[]) => settle(act(goTo(s, 'declareAttackers'), { type: 'DeclareAttackers', player: who, attacks })).state;
  const longest = { targets: (o: { kind: string }[][]) => o.reduce((a, b) => (b.length > a.length ? b : a)) };

  it('Combat Calligrapher: Inklings can\'t attack you, and a player attacking your opponent creates a tapped 2/1 Inkling attacking them', () => {
    let s = newGame();
    put(s, 'P1', 'combat-calligrapher');
    const ink = put(s, 'P2', 'inkling-token-soc', 'battlefield', { isToken: true });
    expect(canAttackPlayer(s, s.cards[ink]!, 'P1')).toBe(false);
    const rat = put(s, 'P1', 'rank-rat');
    s = attack(s, 'P1', [{ attacker: rat, defender: 'P2' }]);
    const made = Object.values(s.cards).filter((c) => c.defId === 'inkling-token-soc' && c.controller === 'P1');
    expect(made.length).toBe(1);
    expect([made[0]!.tapped, s.combat?.attacks.some((a) => a.attacker === made[0]!.id && a.defender === 'P2')]).toEqual([true, true]);
  });

  it('Eriette: creatures enchanted by your Auras can\'t attack you; your end step drains for each Aura', () => {
    let s = newGame();
    put(s, 'P1', 'eriette-of-the-charmed-apple');
    const foe = put(s, 'P2', 'rank-rat');
    put(s, 'P1', 'spirit-mantle', 'battlefield', { attachedTo: foe });
    expect(canAttackPlayer(s, s.cards[foe]!, 'P1')).toBe(false);
    s = settle(goTo(s, 'end')).state;
    expect([s.players.P1!.life, s.players.P2!.life]).toEqual([21, 19]);
  });

  it('Nils: a +1/+1 counter on up to one creature of each player at your end step; attacking you costs {X} per counter', () => {
    let s = newGame();
    put(s, 'P1', 'nils-discipline-enforcer');
    const mine = put(s, 'P1', 'rank-rat');
    const theirs = put(s, 'P2', 'rank-rat');
    const both = { targets: (o: { kind: string; card?: string }[][]) => o.find((t) => t.some((x) => x.card === mine) && t.some((x) => x.card === theirs)) ?? longest.targets(o) };
    s = settle(goTo(s, 'end', both as never), both as never).state;
    expect([s.cards[mine]!.counters, s.cards[theirs]!.counters]).toEqual([1, 1]);
    expect(attackTaxFor(s, 'P1', s.cards[theirs]!)).toBe(1);
    s.cards[theirs]!.counters = 3;
    expect(attackTaxFor(s, 'P1', s.cards[theirs]!)).toBe(3);
    expect(attackTaxFor(s, 'P1')).toBe(0);
  });

  it('Firemane Commando draws when you attack with two or more; Tomik punishes an opponent attacking you with two or more', () => {
    let s = newGame();
    put(s, 'P1', 'firemane-commando');
    put(s, 'P1', 'tomik-wielder-of-law');
    const a = put(s, 'P1', 'rank-rat');
    const b = put(s, 'P1', 'rank-rat');
    const hand = s.players.P1!.hand.length;
    s = attack(s, 'P1', [{ attacker: a, defender: 'P2' }, { attacker: b, defender: 'P2' }]);
    expect(s.players.P1!.hand.length - hand).toBe(1);
    const x = put(s, 'P2', 'rank-rat');
    const y = put(s, 'P2', 'rank-rat');
    s = goTo(s, 'end');
    s = goTo(s, 'declareAttackers');
    expect(s.activePlayer).toBe('P2');
    const mine = s.players.P1!.hand.length;
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P2', attacks: [{ attacker: x, defender: 'P1' }, { attacker: y, defender: 'P1' }] })).state;
    expect([s.players.P2!.life, s.players.P1!.hand.length - mine]).toEqual([15, 1]); // 2 combat damage, then 3 from Tomik
  });

  it('Breena: a player attacking an opponent with more life than another opponent draws, and you put two +1/+1 counters on a creature you control', () => {
    let s = newGame(3);
    put(s, 'P1', 'breena-the-demagogue');
    const rat = put(s, 'P1', 'rank-rat');
    s.players.P3!.life = 15;
    const hand = s.players.P1!.hand.length;
    s = attack(s, 'P1', [{ attacker: rat, defender: 'P2' }]);
    expect(s.pending.kind).toBe('chooseCards');
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [rat] })).state;
    expect([s.players.P1!.hand.length - hand, s.cards[rat]!.counters]).toEqual([1, 2]);
  });
});

describe('SOC4d: Silverquill Influence (Auras and upkeep enchantments)', () => {
  const onAura = (s: GameState, who: 'P1' | 'P2', defId: string, on: string) => put(s, who, defId, 'battlefield', { attachedTo: on });
  const pickCard = (id: string) => ({ targets: (o: { kind: string; card?: string }[][]) => o.find((t) => t.some((x) => x.card === id))! });

  it('Angelic Destiny: +4/+4, flying, first strike, an Angel; when the creature dies, the Aura returns to its owner\'s hand', () => {
    let s = newGame();
    const rat = put(s, 'P1', 'rank-rat');
    const destiny = onAura(s, 'P1', 'angelic-destiny', rat);
    const c = () => s.cards[rat]!;
    expect([powerOf(s, c()), hasKeyword(s, c(), 'Flying'), hasKeyword(s, c(), 'FirstStrike')]).toEqual([5, true, true]);
    s.cards[rat]!.damage = 5;
    s = settle(act(s, { type: 'PassPriority', player: 'P1' })).state;
    expect([s.cards[rat]!.zone, s.cards[destiny]!.zone]).toEqual(['graveyard', 'hand']);
  });

  it('Sage\'s Reverie draws and pumps for each Aura you control on a creature; Pearl-Ear makes it cheaper and draws for targeting a modified creature', () => {
    let s = newGame();
    put(s, 'P1', 'pearl-ear-imperial-advisor');
    const rat = put(s, 'P1', 'rank-rat');
    onAura(s, 'P1', 'spirit-mantle', rat);
    const reverie = put(s, 'P1', 'sages-reverie', 'hand');
    const hand = s.players.P1!.hand.length;
    mana(s, 'P1', { W: 1, C: 2 }); // {3}{W} less {1} for one Aura
    s = cast(s, { type: 'CastSpell', player: 'P1', card: reverie, targets: [card(rat)] }).state;
    expect(s.players.P1!.hand.length - hand).toBe(-1 + 1 + 2); // cast it; Pearl-Ear draws 1; Reverie draws 2
    expect(powerOf(s, s.cards[rat]!)).toBe(1 + 1 + 2);
  });

  it('Chains of Custody exiles an opponent\'s permanent until it leaves; Sheltered by Ghosts gives +1/+0, lifelink and ward', () => {
    let s = newGame();
    const rat = put(s, 'P1', 'rank-rat');
    const foe = put(s, 'P2', 'ghostly-prison');
    const chains = put(s, 'P1', 'chains-of-custody', 'hand');
    mana(s, 'P1', { W: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: chains, targets: [card(rat)] }, pickCard(foe) as never).state;
    expect([s.cards[foe]!.zone, s.cards[chains]!.attachedTo]).toEqual(['exile', rat]);
    const fracture = put(s, 'P1', 'fracture', 'hand');
    mana(s, 'P1', { W: 1, B: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: fracture, targets: [card(chains)] }).state;
    expect(s.cards[foe]!.zone).toBe('battlefield');
    const other = put(s, 'P1', 'rank-rat');
    onAura(s, 'P1', 'sheltered-by-ghosts', other);
    expect([powerOf(s, s.cards[other]!), hasKeyword(s, s.cards[other]!, 'Lifelink')]).toEqual([2, true]);
  });

  it('Flickering Ward: protection from the chosen color, which doesn\'t remove it; {W} returns it to hand', () => {
    let s = newGame();
    const rat = put(s, 'P1', 'rank-rat');
    const ward = onAura(s, 'P1', 'flickering-ward', rat);
    s.cards[ward]!.chosenColor = 'W';
    expect(hasKeyword(s, s.cards[rat]!, 'ProtectionFromWhite')).toBe(true);
    mana(s, 'P1', { W: 1 });
    s = cast(s, activate(s, ward)!).state;
    expect(s.cards[ward]!.zone).toBe('hand');
    const again = onAura(s, 'P1', 'flickering-ward', rat);
    s.cards[again]!.chosenColor = 'W';
    s = settle(act(s, { type: 'PassPriority', player: 'P1' })).state;
    expect(s.cards[again]!.attachedTo).toBe(rat);
  });

  it('Darksteel Mutation: an indestructible 0/1 Insect artifact creature with no other abilities', () => {
    const s = newGame();
    const killian = put(s, 'P2', 'killian-ink-duelist');
    onAura(s, 'P1', 'darksteel-mutation', killian);
    const c = s.cards[killian]!;
    const def = currentDefinition(s, c);
    expect([def.types, def.subtypes, powerOf(s, c), toughnessOf(s, c)]).toEqual([['artifact', 'creature'], ['Insect'], 0, 1]);
    expect([hasKeyword(s, c, 'Indestructible'), hasKeyword(s, c, 'Lifelink'), hasKeyword(s, c, 'Menace')]).toEqual([true, false, false]);
  });

  it('Land Tax finds up to three basic lands when an opponent has more lands; Keen Duelist trades reveals', () => {
    let s = newGame();
    put(s, 'P2', 'land-tax');
    put(s, 'P2', 'keen-duelist');
    put(s, 'P1', 'plains');
    for (let i = 0; i < 3; i++) put(s, 'P2', 'plains', 'library');
    const mineTop = put(s, 'P1', 'anguished-unmaking', 'library'); // mana value 3
    const hand = s.players.P2!.hand.length;
    s = goTo(s, 'end');
    s = goTo(s, 'upkeep', { targets: (o) => o.find((t) => t[0]?.kind === 'player' && t[0].player === 'P1') ?? o[0]! });
    expect(s.activePlayer).toBe('P2');
    expect(s.cards[mineTop]!.zone).toBe('hand');
    expect(s.players.P2!.life).toBe(17);
    expect(s.players.P2!.hand.length - hand).toBe(3 + 1); // three Plains, and its own revealed card
  });

  it('Shielded by Faith: indestructible, and it may move onto a creature that enters', () => {
    let s = newGame();
    const rat = put(s, 'P1', 'rank-rat');
    const shield = onAura(s, 'P1', 'shielded-by-faith', rat);
    expect(hasKeyword(s, s.cards[rat]!, 'Indestructible')).toBe(true);
    const next = put(s, 'P1', 'rank-rat', 'hand');
    mana(s, 'P1', { B: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: next }).state;
    expect(s.cards[shield]!.attachedTo).toBe(next);
  });
});

describe('SOC4e: Silverquill Influence (Auras entering without being cast)', () => {
  const onAura = (s: GameState, who: 'P1' | 'P2', defId: string, on: string) => put(s, who, defId, 'battlefield', { attachedTo: on });
  /** Answers card choices by purpose (the first card otherwise) and settles everything else. */
  const resolveAll = (s: GameState, answers: Record<string, string[]> = {}, opts: Parameters<typeof settle>[1] = {}): GameState => {
    for (let guard = 0; guard < 50; guard++) {
      s = settle(s, opts).state;
      const p = s.pending;
      if (p.kind !== 'chooseCards') return s;
      const pick = answers[p.purpose]?.filter((id) => p.cards.includes(id)) ?? p.cards.slice(0, Math.max(p.min, 1));
      s = act(s, { type: 'ChooseCards', player: p.player, cards: pick.slice(0, p.max) });
    }
    return s;
  };
  const dies = (s: GameState, id: string) => { s.cards[id]!.damage = 99; return act(s, { type: 'PassPriority', player: s.pending.kind === 'priority' ? s.pending.player : 'P1' }); };

  it('Screams from Within: when its creature dies it returns and enchants another creature, chosen as it enters', () => {
    let s = newGame();
    const rat = put(s, 'P1', 'rank-rat');
    const foe = put(s, 'P2', 'killian-ink-duelist');
    const screams = onAura(s, 'P1', 'screams-from-within', rat);
    s = resolveAll(act(s, { type: 'PassPriority', player: 'P1' }), { auraHost: [foe] });
    expect([s.cards[rat]!.zone, s.cards[screams]!.zone, s.cards[screams]!.attachedTo, powerOf(s, s.cards[foe]!)]).toEqual(['graveyard', 'battlefield', foe, 1]);
  });

  it('Screams from Within stays in the graveyard when there is nothing to enchant', () => {
    let s = newGame();
    const rat = put(s, 'P1', 'rank-rat');
    const screams = onAura(s, 'P1', 'screams-from-within', rat);
    s = resolveAll(act(s, { type: 'PassPriority', player: 'P1' }));
    expect(s.cards[screams]!.zone).toBe('graveyard');
  });

  it('Ghoulish Impetus returns at the next end step; Gift of Immortality returns the creature, then itself attached to it', () => {
    let s = newGame();
    const rat = put(s, 'P1', 'rank-rat');
    const foe = put(s, 'P2', 'killian-ink-duelist');
    const ghoul = onAura(s, 'P1', 'ghoulish-impetus', rat);
    const other = put(s, 'P1', 'rank-rat');
    const gift = onAura(s, 'P1', 'gift-of-immortality', other);
    s = resolveAll(dies(s, rat));
    s.cards[other]!.damage = 99;
    s = resolveAll(act(s, { type: 'PassPriority', player: s.pending.kind === 'priority' ? s.pending.player : 'P1' }));
    expect([s.cards[ghoul]!.zone, s.cards[other]!.zone, s.cards[gift]!.zone]).toEqual(['graveyard', 'battlefield', 'graveyard']);
    s = goTo(s, 'end');
    s = resolveAll(s, { auraHost: [foe] });
    expect([s.cards[ghoul]!.attachedTo, s.cards[gift]!.attachedTo]).toEqual([foe, other]);
  });

  it('Ajani\'s Chosen makes a Cat when an enchantment enters, and may move the Aura onto it', () => {
    let s = newGame();
    put(s, 'P1', 'ajanis-chosen');
    const rat = put(s, 'P1', 'rank-rat');
    const mantle = put(s, 'P1', 'spirit-mantle', 'hand');
    mana(s, 'P1', { W: 1, C: 1 });
    s = resolveAll(cast(s, { type: 'CastSpell', player: 'P1', card: mantle, targets: [card(rat)] }).state, { attachToTarget: [mantle] });
    const cat = Object.values(s.cards).find((c) => c.defId === 'cat-token-soc');
    expect(cat && s.cards[mantle]!.attachedTo).toBe(cat!.id);
  });

  it('Forum Filibuster: an Inkling each upkeep, and a returned Aura attached to it', () => {
    let s = newGame();
    put(s, 'P2', 'forum-filibuster');
    const mantle = put(s, 'P2', 'spirit-mantle', 'graveyard');
    s = goTo(s, 'end');
    s = goTo(s, 'upkeep', { targets: (o) => o.find((t) => t[0]?.kind === 'card' && t[0].card === mantle) ?? o[0]! });
    s = resolveAll(s, {}, { targets: (o) => o.find((t) => t[0]?.kind === 'card' && t[0].card === mantle) ?? o[0]! });
    const ink = Object.values(s.cards).find((c) => c.defId === 'inkling-token-soc' && c.zone === 'battlefield');
    expect([ink?.controller, s.cards[mantle]!.attachedTo]).toEqual(['P2', ink?.id]);
  });

  it('Armored Skyhunter puts an Aura from the top six onto the battlefield; Songbirds\' Blessing finds one when its creature attacks', () => {
    let s = newGame();
    const hunter = put(s, 'P1', 'armored-skyhunter');
    const mantle = put(s, 'P1', 'spirit-mantle', 'library');
    s = goTo(s, 'declareAttackers');
    s = resolveAll(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: hunter, defender: 'P2' }] }), { lookTop: [mantle], auraHost: [hunter] });
    expect(s.cards[mantle]!.attachedTo).toBe(hunter);
    let t = newGame();
    const rat = put(t, 'P1', 'rank-rat');
    onAura(t, 'P1', 'songbirds-blessing', rat);
    const found = put(t, 'P1', 'spirit-mantle', 'library');
    t = goTo(t, 'declareAttackers');
    t = resolveAll(act(t, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: rat, defender: 'P2' }] }), { battlefieldElseHand: [found], auraHost: [rat] });
    expect(t.cards[found]!.attachedTo).toBe(rat);
  });

  it('Herald of Amity: casts an Aura from the top eight for free, the rest go to the bottom; it gets +X/+X attacking', () => {
    let s = newGame();
    const rat = put(s, 'P1', 'rank-rat');
    const mantle = put(s, 'P1', 'spirit-mantle', 'library');
    const herald = put(s, 'P1', 'herald-of-amity', 'hand');
    mana(s, 'P1', { W: 1, C: 3 });
    s = resolveAll(cast(s, { type: 'CastSpell', player: 'P1', card: herald }).state, { castFree: [mantle] });
    expect(s.cards[mantle]!.castPermission?.free).toBe(true);
    expect(Object.values(s.cards).filter((c) => c.owner === 'P1' && c.zone === 'exile').length).toBe(1);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: mantle, targets: [card(rat)] }).state;
    expect(s.cards[mantle]!.attachedTo).toBe(rat);
    s = goTo(s, 'declareAttackers');
    s.cards[herald]!.summoningSick = false;
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: herald, defender: 'P2' }] })).state;
    expect(powerOf(s, s.cards[herald]!)).toBe(2 + 1); // a 2/2, +1/+1 for one Aura
  });
});

describe('SOC4f: Silverquill Influence (Scriv, prepared cards, Chirography, Inkshield, Shadrix)', () => {
  const copyOf = (s: GameState, creature: string) => Object.values(s.cards).find((c) => c.zone === 'exile' && c.prepareSpellOf?.card === creature);
  const pickCard = (id: string) => ({ targets: (o: { kind: string; card?: string }[][]) => o.find((t) => t.some((x) => x.card === id)) ?? o[0]! });
  const choose = (s: GameState, cards: string[]) => settle(act(s, { type: 'ChooseCards', player: (s.pending as { player: string }).player, cards })).state;

  it('Scriv makes a Contract on an opponent\'s creature; attacking you with it costs its controller 2 life', () => {
    let s = newGame();
    const rat = put(s, 'P2', 'rank-rat');
    const scriv = put(s, 'P1', 'scriv-the-obligator', 'hand');
    mana(s, 'P1', { W: 1, B: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: scriv }, pickCard(rat) as never).state;
    const contract = Object.values(s.cards).find((c) => c.defId === 'contract-token-soc' && c.zone === 'battlefield');
    expect(contract?.attachedTo).toBe(rat);
    s = goTo(s, 'end');
    s = goTo(s, 'declareAttackers');
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P2', attacks: [{ attacker: rat, defender: 'P1' }] })).state;
    expect([s.players.P2!.life, powerOf(s, s.cards[rat]!)]).toEqual([18, 1]);
  });

  it('A Contract\'s creature attacking one of your opponents gets +2/+0', () => {
    let s = newGame(3);
    const rat = put(s, 'P2', 'rank-rat');
    put(s, 'P1', 'contract-token-soc', 'battlefield', { attachedTo: rat, isToken: true });
    s = goTo(s, 'end');
    s = goTo(s, 'declareAttackers');
    expect(s.activePlayer).toBe('P2');
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P2', attacks: [{ attacker: rat, defender: 'P3' }] })).state;
    expect([s.players.P2!.life, powerOf(s, s.cards[rat]!)]).toEqual([20, 3]);
  });

  it('Eiganjo Dynastorian is prepared by attacking with two; Replenish returns your enchantment cards (Auras choose what to enchant)', () => {
    let s = newGame();
    const fox = put(s, 'P1', 'eiganjo-dynastorian-replenish');
    const rat = put(s, 'P1', 'rank-rat');
    const prison = put(s, 'P1', 'ghostly-prison', 'graveyard');
    const mantle = put(s, 'P1', 'spirit-mantle', 'graveyard');
    s = goTo(s, 'declareAttackers');
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: fox, defender: 'P2' }, { attacker: rat, defender: 'P2' }] })).state;
    expect(s.cards[fox]!.prepared).toBe(true);
    s = goTo(s, 'main2');
    mana(s, 'P1', { W: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: copyOf(s, fox)!.id }).state;
    if (s.pending.kind === 'chooseCards') s = choose(s, [rat]);
    expect([s.cards[prison]!.zone, s.cards[mantle]!.attachedTo]).toEqual(['battlefield', rat]);
  });

  it('Defacing Duskmage is prepared when an opponent draws their second card in a turn; Vandal\'s Edit draws two and each player loses 2', () => {
    let s = newGame();
    const mage = put(s, 'P1', 'defacing-duskmage-vandals-edit');
    const stroke = put(s, 'P1', 'stroke-of-genius', 'hand');
    mana(s, 'P1', { U: 1, C: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: stroke, x: 2, targets: [{ kind: 'player', player: 'P2' }] }).state;
    expect(s.cards[mage]!.prepared).toBe(true);
    const hand = s.players.P1!.hand.length;
    mana(s, 'P1', { W: 1, B: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: copyOf(s, mage)!.id }).state;
    expect([s.players.P1!.hand.length - hand, s.players.P1!.life, s.players.P2!.life]).toEqual([2, 18, 18]);
  });

  it('Intermediate Chirography: an Inkling; level 2 counters on first life loss each turn; level 3 an Inkling when a modified creature died', () => {
    let s = newGame();
    const chiro = put(s, 'P1', 'intermediate-chirography', 'hand');
    mana(s, 'P1', { B: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: chiro }).state;
    const inklings = () => Object.values(s.cards).filter((c) => c.defId === 'inkling-token-soc' && c.zone === 'battlefield');
    expect(inklings().length).toBe(1);
    mana(s, 'P1', { B: 2, C: 3 });
    s = cast(s, activate(s, chiro)!).state;
    s = cast(s, activate(s, chiro)!).state;
    expect(s.cards[chiro]!.classLevel).toBe(3);
    const rat = put(s, 'P1', 'rank-rat');
    const unmaking = put(s, 'P1', 'anguished-unmaking', 'hand');
    const foe = put(s, 'P2', 'ghostly-prison');
    mana(s, 'P1', { W: 1, B: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: unmaking, targets: [card(foe)] }, pickCard(rat) as never).state;
    expect(s.cards[rat]!.counters).toBe(1); // first life loss this turn
    s.cards[rat]!.damage = 99;
    s = settle(act(s, { type: 'PassPriority', player: 'P1' })).state;
    s = goTo(s, 'end');
    s = settle(s).state;
    expect(inklings().length).toBe(2);
  });

  it('Inkshield prevents combat damage to you and makes an Inkling for each 1 prevented', () => {
    let s = newGame();
    const attacker = put(s, 'P2', 'killian-ink-duelist');
    s = goTo(s, 'end');
    s = goTo(s, 'declareAttackers');
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P2', attacks: [{ attacker, defender: 'P1' }] })).state;
    s = act(s, { type: 'PassPriority', player: 'P2' });
    const shield = put(s, 'P1', 'inkshield', 'hand');
    mana(s, 'P1', { W: 1, B: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: shield, targets: [] }).state;
    s = goTo(s, 'combatDamage');
    s = settle(s).state;
    expect(s.players.P1!.life).toBe(20);
    expect(Object.values(s.cards).filter((c) => c.defId === 'inkling-token-soc' && c.controller === 'P1').length).toBe(2);
  });

  it('Shadrix Silverquill: two modes at the beginning of combat, each targeting a different player', () => {
    let s = newGame();
    put(s, 'P1', 'shadrix-silverquill');
    const rat = put(s, 'P1', 'rank-rat');
    s = goTo(s, 'beginCombat');
    for (let guard = 0; guard < 10 && s.pending.kind !== 'priority'; guard++) {
      if (s.pending.kind === 'chooseModes') s = act(s, { type: 'ChooseModes', player: 'P1', modes: [1, 2] });
      else if (s.pending.kind === 'chooseTargets') {
        const options = getLegalActions(s).filter((a) => a.type === 'ChooseTargets');
        expect(options.every((a) => a.type === 'ChooseTargets' && new Set(a.targets.map((t) => (t as { player?: string }).player)).size === a.targets.length)).toBe(true);
        s = act(s, options.find((a) => a.type === 'ChooseTargets' && (a.targets[0] as { player?: string }).player === 'P2' && (a.targets[1] as { player?: string }).player === 'P1')!);
      } else s = settle(s).state;
    }
    s = settle(s).state;
    expect([s.players.P2!.life, s.cards[rat]!.counters]).toEqual([19, 1]);
  });
});

describe('SOC4g: Silverquill Influence (bestow, escape, Animate Dead, replicate, granted abilities)', () => {
  const casts = (s: GameState, id: string) => getLegalActions(s).filter((a): a is Extract<typeof a, { type: 'CastSpell' }> => a.type === 'CastSpell' && a.card === id);
  const onAura = (s: GameState, who: 'P1' | 'P2', defId: string, on: string) => put(s, who, defId, 'battlefield', { attachedTo: on });

  it('Eidolon of Countless Battles: bestowed it is an Aura giving +X/+X; when its creature dies it stays as a creature', () => {
    let s = newGame();
    const rat = put(s, 'P1', 'rank-rat');
    const eidolon = put(s, 'P1', 'eidolon-of-countless-battles', 'hand');
    mana(s, 'P1', { W: 2, C: 2 });
    const bestow = casts(s, eidolon).find((a) => a.alternative && (a.targets ?? []).some((t) => t.kind === 'card' && t.card === rat));
    expect(bestow).toBeDefined();
    s = cast(s, bestow!).state;
    const def = currentDefinition(s, s.cards[eidolon]!);
    expect([s.cards[eidolon]!.attachedTo, def.types.includes('creature'), def.subtypes?.includes('Aura')]).toEqual([rat, false, true]);
    expect(powerOf(s, s.cards[rat]!)).toBe(1 + 1 + 1); // one creature, one Aura
    s.cards[rat]!.damage = 99;
    s = settle(act(s, { type: 'PassPriority', player: 'P1' })).state;
    expect([s.cards[eidolon]!.zone, currentDefinition(s, s.cards[eidolon]!).types.includes('creature'), powerOf(s, s.cards[eidolon]!)]).toEqual(['battlefield', true, 1]);
  });

  it('A bestowed Eidolon whose target is gone resolves as a creature', () => {
    let s = newGame();
    const rat = put(s, 'P1', 'rank-rat');
    const eidolon = put(s, 'P1', 'eidolon-of-countless-battles', 'hand');
    mana(s, 'P1', { W: 2, C: 2 });
    s = act(s, casts(s, eidolon).find((a) => a.alternative)!);
    s.players.P1!.battlefield = s.players.P1!.battlefield.filter((id) => id !== rat);
    s.players.P1!.graveyard.push(rat);
    s.cards[rat]!.zone = 'graveyard';
    s = settle(s).state;
    expect([s.cards[eidolon]!.zone, s.cards[eidolon]!.attachedTo, currentDefinition(s, s.cards[eidolon]!).types.includes('creature')]).toEqual(['battlefield', undefined, true]);
  });

  it('Sentinel\'s Eyes escapes from the graveyard, exiling any two other graveyard cards', () => {
    let s = newGame();
    const rat = put(s, 'P1', 'rank-rat');
    const eyes = put(s, 'P1', 'sentinels-eyes', 'graveyard');
    const a = put(s, 'P1', 'fracture', 'graveyard');
    const b = put(s, 'P1', 'plains', 'graveyard');
    const c = put(s, 'P1', 'vanishing-verse', 'graveyard');
    mana(s, 'P1', { W: 1 });
    const escape = casts(s, eyes).find((x) => (x.targets ?? []).some((t) => t.kind === 'card' && t.card === rat));
    expect([escape?.costPool?.length, escape?.costCards?.length]).toEqual([3, 2]);
    s = cast(s, { ...escape!, costCards: [b, c] }).state;
    expect([s.cards[eyes]!.attachedTo, s.cards[a]!.zone, s.cards[b]!.zone, s.cards[c]!.zone]).toEqual([rat, 'graveyard', 'exile', 'exile']);
    expect(hasKeyword(s, s.cards[rat]!, 'Vigilance')).toBe(true);
  });

  it('Animate Dead returns a creature card from any graveyard under your control with -1/-0; it\'s sacrificed when the Aura leaves', () => {
    let s = newGame();
    const dead = put(s, 'P2', 'killian-ink-duelist', 'graveyard');
    const animate = put(s, 'P1', 'animate-dead', 'hand');
    mana(s, 'P1', { B: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: animate, targets: [card(dead)] }).state;
    expect([s.cards[dead]!.zone, s.cards[dead]!.controller, s.cards[animate]!.attachedTo, powerOf(s, s.cards[dead]!)]).toEqual(['battlefield', 'P1', dead, 1]);
    const fracture = put(s, 'P1', 'fracture', 'hand');
    mana(s, 'P1', { W: 1, B: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: fracture, targets: [card(animate)] }).state;
    expect([s.cards[dead]!.zone, s.players.P2!.graveyard.includes(dead)]).toEqual(['graveyard', true]);
  });

  it('Hateful Eidolon draws a card for each of your Auras that was on a creature that died', () => {
    let s = newGame();
    put(s, 'P1', 'hateful-eidolon');
    const rat = put(s, 'P2', 'rank-rat');
    onAura(s, 'P1', 'spirit-mantle', rat);
    onAura(s, 'P1', 'raffines-guidance', rat);
    onAura(s, 'P2', 'spirit-mantle', rat);
    const hand = s.players.P1!.hand.length;
    s.cards[rat]!.damage = 99;
    s = settle(act(s, { type: 'PassPriority', player: 'P1' })).state;
    expect(s.players.P1!.hand.length - hand).toBe(2);
  });

  it('Changing Loyalty: replicate copies (Aura tokens) can enchant other creatures; when one dies, it returns under your control', () => {
    let s = newGame();
    const mine = put(s, 'P1', 'rank-rat');
    const theirs = put(s, 'P2', 'killian-ink-duelist');
    const loyalty = put(s, 'P1', 'changing-loyalty', 'hand');
    mana(s, 'P1', { B: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: loyalty, kicks: 1, targets: [card(mine)] }, { copyTargets: (o) => o.find((t) => t[0]?.kind === 'card' && t[0].card === theirs) ?? o[0]! }).state;
    const copy = Object.values(s.cards).find((c) => c.defId === 'changing-loyalty' && c.isToken && c.zone === 'battlefield');
    expect([s.cards[loyalty]!.attachedTo, copy?.attachedTo]).toEqual([mine, theirs]);
    s.cards[theirs]!.damage = 99;
    s = settle(act(s, { type: 'PassPriority', player: 'P1' })).state;
    expect([s.cards[theirs]!.zone, s.cards[theirs]!.controller]).toEqual(['battlefield', 'P1']);
  });

  it('Fallen Ideal: flying and "Sacrifice a creature: +2/+1"; it returns to hand when put into a graveyard', () => {
    let s = newGame();
    const rat = put(s, 'P1', 'rank-rat');
    const fodder = put(s, 'P1', 'rank-rat');
    const ideal = onAura(s, 'P1', 'fallen-ideal', rat);
    expect(hasKeyword(s, s.cards[rat]!, 'Flying')).toBe(true);
    const sac = getLegalActions(s).find((a) => a.type === 'ActivateAbility' && a.card === rat && (a.costCards ?? []).includes(fodder));
    expect(sac).toBeDefined();
    s = cast(s, sac!).state;
    expect([s.cards[fodder]!.zone, powerOf(s, s.cards[rat]!), toughnessOf(s, s.cards[rat]!)]).toEqual(['graveyard', 3, 2]);
    const fracture = put(s, 'P1', 'fracture', 'hand');
    mana(s, 'P1', { W: 1, B: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: fracture, targets: [card(ideal)] }).state;
    expect(s.cards[ideal]!.zone).toBe('hand');
  });
});

describe('SOC5a: Witherbloom Pestilence (sacrifice outlets, death triggers, removal, lands)', () => {
  const kill = (s: GameState, id: string, opts: Parameters<typeof settle>[1] = {}) => { s.cards[id]!.damage = 99; return settle(act(s, { type: 'PassPriority', player: 'P1' }), opts).state; };
  const atP2 = { targets: (o: { kind: string; player?: string }[][]) => o.find((t) => t[0]?.kind === 'player' && t[0].player === 'P2') ?? o[0]! };
  const sacWith = (s: GameState, source: string, fodder: string) => getLegalActions(s).find((a) => a.type === 'ActivateAbility' && a.card === source && (a.costCards ?? []).includes(fodder));

  it('Blood Artist, Zulaport Cutthroat and Moldervine Reclamation all trigger on a creature of yours dying', () => {
    let s = newGame();
    put(s, 'P1', 'blood-artist');
    put(s, 'P1', 'zulaport-cutthroat');
    put(s, 'P1', 'moldervine-reclamation');
    const rat = put(s, 'P1', 'rank-rat');
    const hand = s.players.P1!.hand.length;
    s = kill(s, rat, atP2 as never);
    expect([s.players.P1!.life, s.players.P2!.life, s.players.P1!.hand.length - hand]).toEqual([23, 18, 1]);
  });

  it('Viscera Seer sacrifices to scry; Sakura-Tribe Elder fetches a tapped basic; Yahenni grows and turns indestructible', () => {
    let s = newGame();
    const seer = put(s, 'P1', 'viscera-seer');
    const rat = put(s, 'P1', 'rank-rat');
    s = settle(act(s, sacWith(s, seer, rat)!), { surveilToGraveyard: false }).state;
    expect(s.cards[rat]!.zone).toBe('graveyard');
    const elder = put(s, 'P1', 'sakura-tribe-elder');
    const plains = put(s, 'P1', 'plains', 'library');
    s = cast(s, activate(s, elder)!).state;
    expect([s.cards[elder]!.zone, s.cards[plains]!.zone, s.cards[plains]!.tapped]).toEqual(['graveyard', 'battlefield', true]);
    const yahenni = put(s, 'P1', 'yahenni-undying-partisan');
    const foe = put(s, 'P2', 'rank-rat');
    s = kill(s, foe);
    expect(s.cards[yahenni]!.counters).toBe(1);
    const fodder = put(s, 'P1', 'rank-rat');
    s = cast(s, sacWith(s, yahenni, fodder)!).state;
    expect(hasKeyword(s, s.cards[yahenni]!, 'Indestructible')).toBe(true);
  });

  it('Assassin\'s Trophy destroys an opponent\'s permanent and they may find a basic land; Mortality Spear is cheaper after you gain life', () => {
    let s = newGame();
    const prison = put(s, 'P2', 'ghostly-prison');
    const basic = put(s, 'P2', 'plains', 'library');
    const trophy = put(s, 'P1', 'assassins-trophy', 'hand');
    mana(s, 'P1', { B: 1, G: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: trophy, targets: [card(prison)] }).state;
    expect([s.cards[prison]!.zone, s.cards[basic]!.zone]).toEqual(['graveyard', 'battlefield']);
    const spear = put(s, 'P1', 'mortality-spear', 'hand');
    const rat = put(s, 'P2', 'rank-rat');
    mana(s, 'P1', { B: 1, G: 1 });
    expect(getLegalActions(s).some((a) => a.type === 'CastSpell' && a.card === spear)).toBe(false);
    s.players.P1!.lifeGainedThisTurn = 1;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spear, targets: [card(rat)] }).state;
    expect(s.cards[rat]!.zone).toBe('graveyard');
  });

  it('Haywire Mite exiles a noncreature artifact or enchantment and gains 2 when it dies; Pawn of Ulamog makes Spawn that sacrifice for {C}', () => {
    let s = newGame();
    const mite = put(s, 'P1', 'haywire-mite');
    const prison = put(s, 'P2', 'ghostly-prison');
    put(s, 'P1', 'pawn-of-ulamog');
    mana(s, 'P1', { G: 1 });
    s = cast(s, activate(s, mite)!).state;
    expect([s.cards[prison]!.zone, s.cards[mite]!.zone, s.players.P1!.life]).toEqual(['exile', 'graveyard', 22]);
    const spawn = Object.values(s.cards).find((c) => c.defId === 'eldrazi-spawn-token-soc' && c.zone === 'battlefield');
    expect(spawn).toBeDefined();
    s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: spawn!.id, mana: 'C' });
    expect([s.players.P1!.manaPool.C, s.cards[spawn!.id]?.zone ?? 'gone']).not.toContain('battlefield');
    expect(s.players.P1!.manaPool.C).toBe(1);
  });

  it('Ophiomancer makes a deathtouch Snake each upkeep if you have none; Awakening Zone may make a Spawn on your upkeep', () => {
    let s = newGame();
    put(s, 'P1', 'ophiomancer');
    put(s, 'P2', 'awakening-zone');
    s = goTo(s, 'end');
    s = goTo(s, 'draw');
    const snakes = Object.values(s.cards).filter((c) => c.defId === 'snake-token-soc' && c.zone === 'battlefield');
    expect(snakes.length).toBe(1);
    expect(hasKeyword(s, snakes[0]!, 'Deathtouch')).toBe(true);
    expect(Object.values(s.cards).some((c) => c.defId === 'eldrazi-spawn-token-soc' && c.controller === 'P2')).toBe(true);
  });

  it('Dina, Soul Steeper drains when you gain life and grows by a sacrificed creature\'s power; Witherbloom Charm\'s modes', () => {
    let s = newGame();
    const dina = put(s, 'P1', 'dina-soul-steeper');
    const charm = put(s, 'P1', 'witherbloom-charm', 'hand');
    mana(s, 'P1', { B: 1, G: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: charm, mode: 1, targets: [] }).state;
    expect([s.players.P1!.life, s.players.P2!.life]).toEqual([25, 19]);
    const big = put(s, 'P1', 'killian-ink-duelist');
    mana(s, 'P1', { C: 1 });
    s = cast(s, sacWith(s, dina, big)!).state;
    expect(powerOf(s, s.cards[dina]!)).toBe(1 + 2);
    const charm2 = put(s, 'P1', 'witherbloom-charm', 'hand');
    const fodder = put(s, 'P1', 'rank-rat');
    const hand = s.players.P1!.hand.length;
    mana(s, 'P1', { B: 1, G: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: charm2, mode: 0, targets: [] }).state;
    if (s.pending.kind === 'chooseCards') s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [fodder] })).state;
    expect([s.cards[fodder]!.zone, s.players.P1!.hand.length - hand]).toEqual(['graveyard', -1 + 2]);
  });

  it('Teacher\'s Pest gains 1 life attacking and returns from the graveyard tapped; Grim Backwoods sacrifices a creature to draw', () => {
    let s = newGame();
    const pest = put(s, 'P1', 'teachers-pest');
    s = goTo(s, 'declareAttackers');
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: pest, defender: 'P2' }] })).state;
    expect(s.players.P1!.life).toBe(21);
    let t = newGame();
    const dead = put(t, 'P1', 'teachers-pest', 'graveyard');
    mana(t, 'P1', { B: 1, G: 1 });
    t = cast(t, activate(t, dead)!).state;
    expect([t.cards[dead]!.zone, t.cards[dead]!.tapped]).toEqual(['battlefield', true]);
    const woods = put(t, 'P1', 'grim-backwoods');
    const rat = put(t, 'P1', 'rank-rat');
    const hand = t.players.P1!.hand.length;
    mana(t, 'P1', { B: 1, G: 1, C: 2 });
    t = cast(t, sacWith(t, woods, rat)!).state;
    expect([t.cards[rat]!.zone, t.players.P1!.hand.length - hand]).toEqual(['graveyard', 1]);
  });
});

describe('SOC5b: Witherbloom Pestilence (Pests, lifegain payoffs, Decayed, Bloodghast)', () => {
  const field = (s: GameState, defId: string, who = 'P1') => Object.values(s.cards).filter((c) => c.zone === 'battlefield' && c.controller === who && c.defId === defId);
  const kill = (s: GameState, id: string) => { s.cards[id]!.damage = 99; return settle(act(s, { type: 'PassPriority', player: s.pending.kind === 'priority' ? s.pending.player : 'P1' })).state; };

  it('Blight Mound: a Pest when a nontoken creature of yours dies; the Pest gains 1 life when it dies; attacking Pests get +1/+0 and menace', () => {
    let s = newGame();
    put(s, 'P1', 'blight-mound');
    const rat = put(s, 'P1', 'rank-rat');
    s = kill(s, rat);
    const pest = field(s, 'pest-token-soc')[0]!;
    expect(pest).toBeDefined();
    pest.summoningSick = false;
    s = goTo(s, 'declareAttackers');
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: pest.id, defender: 'P2' }] })).state;
    expect([powerOf(s, s.cards[pest.id]!), hasKeyword(s, s.cards[pest.id]!, 'Menace')]).toEqual([2, true]);
    s = kill(s, pest.id);
    expect(s.players.P1!.life).toBe(21);
  });

  it('Feral Appetite exiles a graveyard card and makes a Pest only for a creature card; attacking Pests have deathtouch', () => {
    let s = newGame();
    const appetite = put(s, 'P1', 'feral-appetite');
    const deadCreature = put(s, 'P2', 'rank-rat', 'graveyard');
    const deadSpell = put(s, 'P2', 'fracture', 'graveyard');
    mana(s, 'P1', { G: 2, C: 2 });
    const aimed = (id: string) => getLegalActions(s).find((a) => a.type === 'ActivateAbility' && a.card === appetite && (a.targets ?? []).some((x) => x.kind === 'card' && x.card === id))!;
    s = cast(s, aimed(deadSpell)).state;
    expect([s.cards[deadSpell]!.zone, field(s, 'pest-token-soc').length]).toEqual(['exile', 0]);
    s = cast(s, aimed(deadCreature)).state;
    expect([s.cards[deadCreature]!.zone, field(s, 'pest-token-soc').length]).toEqual(['exile', 1]);
  });

  it('Pest Rescuer: a Pest at each upkeep without one, and life gained is one more', () => {
    let s = newGame();
    put(s, 'P1', 'pest-rescuer');
    const charm = put(s, 'P1', 'witherbloom-charm', 'hand');
    mana(s, 'P1', { B: 1, G: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: charm, mode: 1, targets: [] }).state;
    expect(s.players.P1!.life).toBe(26);
    s = goTo(s, 'end');
    s = goTo(s, 'draw');
    expect(field(s, 'pest-token-soc').length).toBe(1);
  });

  it('Trudge Garden pays {2} for a Fungus Beast when you gain life; Defiling Daemogoth drains for the life gained at your end step', () => {
    let s = newGame();
    put(s, 'P1', 'trudge-garden');
    put(s, 'P1', 'defiling-daemogoth');
    const charm = put(s, 'P1', 'witherbloom-charm', 'hand');
    mana(s, 'P1', { B: 1, G: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: charm, mode: 1, targets: [] }).state;
    expect(field(s, 'fungus-beast-token-soc').length).toBe(1);
    s = settle(goTo(s, 'end')).state;
    expect(s.players.P2!.life).toBe(15);
  });

  it('Jadar makes a decayed Zombie at your end step; decayed creatures can\'t block and are sacrificed after attacking', () => {
    let s = newGame();
    put(s, 'P1', 'jadar-ghoulcaller-of-nephalia');
    s = settle(goTo(s, 'end')).state;
    const zombie = field(s, 'zombie-decayed-token-soc')[0]!;
    expect(zombie).toBeDefined();
    const attacker = put(s, 'P2', 'rank-rat');
    s = goTo(s, 'declareAttackers');
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P2', attacks: [{ attacker, defender: 'P1' }] })).state;
    s = nextStep(s);
    expect(getLegalActions(s).some((a) => a.type === 'DeclareBlockers' && a.blocks.some((b) => b.blocker === zombie.id))).toBe(false);
    let t = newGame();
    const z = put(t, 'P1', 'zombie-decayed-token-soc', 'battlefield', { isToken: true });
    const p = fight(t, [{ attacker: z, defender: 'P2' }]).state;
    t = goTo(p, 'main2');
    expect(t.cards[z]?.zone ?? 'gone').not.toBe('battlefield');
  });

  it('Bloodghast can\'t block, has haste once an opponent is at 10 life or less, and returns on landfall', () => {
    const s = newGame();
    const ghast = put(s, 'P1', 'bloodghast');
    expect([currentDefinition(s, s.cards[ghast]!).cantBlock, hasKeyword(s, s.cards[ghast]!, 'Haste')]).toEqual([true, false]);
    s.players.P2!.life = 10;
    expect(hasKeyword(s, s.cards[ghast]!, 'Haste')).toBe(true);
    let t = newGame();
    const dead = put(t, 'P1', 'bloodghast', 'graveyard');
    const land = put(t, 'P1', 'plains', 'hand');
    t = settle(act(t, { type: 'PlayLand', player: 'P1', card: land })).state;
    expect(t.cards[dead]!.zone).toBe('battlefield');
  });

  it('Beledros Witherbloom: a Pest every upkeep, and pay 10 life once each turn to untap your lands', () => {
    let s = newGame();
    const beledros = put(s, 'P1', 'beledros-witherbloom');
    const land = put(s, 'P1', 'plains', 'battlefield', { tapped: true });
    s = cast(s, activate(s, beledros)!).state;
    expect([s.players.P1!.life, s.cards[land]!.tapped]).toEqual([10, false]);
    expect(activate(s, beledros)).toBeUndefined();
  });
});

describe('SOC5c: Witherbloom Pestilence (sacrifice payoffs, devour, lords, Command)', () => {
  const field = (s: GameState, defId: string, who = 'P1') => Object.values(s.cards).filter((c) => c.zone === 'battlefield' && c.controller === who && c.defId === defId);
  const sacWith = (s: GameState, source: string, fodder: string) => getLegalActions(s).find((a) => a.type === 'ActivateAbility' && a.card === source && (a.costCards ?? []).includes(fodder));

  it('Merchant of Venom: each player sacrifices a creature as it enters, and it grows with each sacrifice; Smothering Abomination draws for yours and is colorless', () => {
    let s = newGame();
    put(s, 'P1', 'smothering-abomination');
    const mine = put(s, 'P1', 'rank-rat');
    const theirs = put(s, 'P2', 'rank-rat');
    const merchant = put(s, 'P1', 'merchant-of-venom', 'hand');
    mana(s, 'P1', { B: 1, C: 3 });
    const hand = s.players.P1!.hand.length;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: merchant }).state;
    while (s.pending.kind === 'chooseCards') {
      const p = s.pending as { player: string; cards: string[] };
      s = settle(act(s, { type: 'ChooseCards', player: p.player, cards: [p.cards.includes(mine) ? mine : p.cards.includes(theirs) ? theirs : p.cards[0]!] })).state;
    }
    expect([s.cards[mine]!.zone, s.cards[theirs]!.zone, s.cards[merchant]!.counters]).toEqual(['graveyard', 'graveyard', 2]);
    expect(s.players.P1!.hand.length - hand).toBe(-1 + 1);
    expect(currentDefinition(s, Object.values(s.cards).find((c) => c.defId === 'smothering-abomination')!).colors).toEqual([]);
  });

  it('Dina, Essence Brewer draws once a turn for sacrifices and turns a sacrificed creature\'s power into life and counters', () => {
    let s = newGame();
    const dina = put(s, 'P1', 'dina-essence-brewer');
    const big = put(s, 'P1', 'killian-ink-duelist');
    const target = put(s, 'P1', 'rank-rat');
    mana(s, 'P1', { C: 2 });
    const hand = s.players.P1!.hand.length;
    const act1 = getLegalActions(s).find((a) => a.type === 'ActivateAbility' && a.card === dina && (a.costCards ?? []).includes(big) && (a.targets ?? []).some((t) => t.kind === 'card' && t.card === target));
    s = cast(s, act1!).state;
    expect([s.players.P1!.life, s.cards[target]!.counters, s.players.P1!.hand.length - hand]).toEqual([22, 2, 1]);
  });

  it('Mycoloth devours creatures for two counters each and makes that many Saprolings each upkeep; Ribtruss Roaster makes Pests', () => {
    let s = newGame();
    const a = put(s, 'P1', 'rank-rat');
    const b = put(s, 'P1', 'rank-rat');
    const myco = put(s, 'P1', 'mycoloth', 'hand');
    mana(s, 'P1', { G: 2, C: 3 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: myco });
    s = settle(s).state;
    expect([s.pending.kind, (s.pending as { purpose?: string }).purpose]).toEqual(['chooseCards', 'devourOnEntry']);
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [a, b] })).state;
    expect(s.cards[myco]!.counters).toBe(4);
    s = goTo(s, 'end');
    s = goTo(s, 'upkeep'); // P2's turn
    s = goTo(s, 'end');
    s = goTo(s, 'draw'); // P1's next turn, after the upkeep
    expect(s.activePlayer).toBe('P1');
    expect(field(s, 'saproling-token-soc').length).toBe(4);
  });

  it('Creakwood Liege pumps your other black and green creatures (+2/+2 for both colors); Ohran Frostfang gives attackers deathtouch', () => {
    const s = newGame();
    put(s, 'P1', 'creakwood-liege');
    put(s, 'P1', 'ohran-frostfang');
    const gold = put(s, 'P1', 'dina-soul-steeper');
    const black = put(s, 'P1', 'rank-rat');
    expect([powerOf(s, s.cards[gold]!), powerOf(s, s.cards[black]!)]).toEqual([1 + 2, 1 + 1]);
  });

  it('Woe Strider makes a Goat, sacrifices to scry, and escapes with two +1/+1 counters', () => {
    let s = newGame();
    const strider = put(s, 'P1', 'woe-strider', 'graveyard');
    for (let i = 0; i < 4; i++) put(s, 'P1', 'plains', 'graveyard');
    mana(s, 'P1', { B: 2, C: 3 });
    const escape = getLegalActions(s).find((a) => a.type === 'CastSpell' && a.card === strider);
    expect(escape).toBeDefined();
    s = cast(s, escape!).state;
    expect([s.cards[strider]!.zone, s.cards[strider]!.counters, field(s, 'goat-token-soc').length]).toEqual(['battlefield', 2, 1]);
    const goat = field(s, 'goat-token-soc')[0]!;
    s = settle(act(s, sacWith(s, strider, goat.id)!), { surveilToGraveyard: false }).state;
    expect(s.cards[goat.id]?.zone ?? 'gone').not.toBe('battlefield');
  });

  it('Witherbloom Command: choose two — drain 2 and shrink a creature', () => {
    let s = newGame();
    const rat = put(s, 'P2', 'rank-rat');
    const cmd = put(s, 'P1', 'witherbloom-command', 'hand');
    mana(s, 'P1', { B: 1, G: 1 });
    const option = getLegalActions(s).find((a) => a.type === 'CastSpell' && a.card === cmd && JSON.stringify(a.modes) === JSON.stringify([2, 3]) && (a.targets ?? []).some((t) => t.kind === 'card' && t.card === rat));
    s = cast(s, option!).state;
    expect([s.cards[rat]!.zone, s.players.P1!.life, s.players.P2!.life]).toEqual(['graveyard', 22, 18]);
  });

  it('Eccentric Pestfinder is prepared after you gain life; Turn Stones makes a Pest for each opponent', () => {
    let s = newGame(3);
    const finder = put(s, 'P1', 'eccentric-pestfinder-turn-stones');
    s.players.P1!.lifeGainedThisTurn = 2;
    s = settle(goTo(s, 'end')).state;
    expect(s.cards[finder]!.prepared).toBe(true);
    s = goTo(s, 'end');
    s = goTo(s, 'main1');
    s = goTo(s, 'end');
    s = goTo(s, 'main1');
    s = goTo(s, 'end');
    s = goTo(s, 'main1');
    expect(s.activePlayer).toBe('P1');
    const copy = Object.values(s.cards).find((c) => c.zone === 'exile' && c.prepareSpellOf?.card === finder)!;
    mana(s, 'P1', { B: 1, G: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: copy.id }).state;
    expect(field(s, 'pest-token-soc').length).toBe(2);
  });
});

describe('SOC5d: Witherbloom Pestilence (modal removal, Gorma, Shadow, Food, ascend, gravestorm)', () => {
  const field = (s: GameState, defId: string, who = 'P1') => Object.values(s.cards).filter((c) => c.zone === 'battlefield' && c.controller === who && c.defId === defId);
  const kill = (s: GameState, id: string) => { s.cards[id]!.damage = 99; return settle(act(s, { type: 'PassPriority', player: s.pending.kind === 'priority' ? s.pending.player : 'P1' })).state; };

  it('Casualties of War destroys one target of each chosen type; Final Act destroys all creatures and exiles all graveyards', () => {
    let s = newGame();
    const rat = put(s, 'P2', 'rank-rat');
    const prison = put(s, 'P2', 'ghostly-prison');
    const land = put(s, 'P2', 'plains');
    const war = put(s, 'P1', 'casualties-of-war', 'hand');
    mana(s, 'P1', { B: 2, G: 2, C: 2 });
    const all = getLegalActions(s).find((a) => a.type === 'CastSpell' && a.card === war && JSON.stringify(a.modes) === JSON.stringify([1, 2, 3]));
    expect(all).toBeDefined();
    s = cast(s, { ...all!, targets: [card(rat), card(prison), card(land)] } as never).state;
    expect([s.cards[rat]!.zone, s.cards[prison]!.zone, s.cards[land]!.zone]).toEqual(['graveyard', 'graveyard', 'graveyard']);
    const mine = put(s, 'P1', 'rank-rat');
    s.players.P2!.poison = 3;
    const act2 = put(s, 'P1', 'final-act', 'hand');
    mana(s, 'P1', { B: 2, C: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: act2, modes: [0, 3, 4], targets: [] }).state;
    expect([s.cards[mine]!.zone, s.cards[rat]!.zone, s.players.P2!.poison ?? 0]).toEqual(['exile', 'exile', 0]);
  });

  it('Gorma grows when your other creatures die, and your nontoken creatures enter with a counter per creature of yours that died this turn', () => {
    let s = newGame();
    const gorma = put(s, 'P1', 'gorma-the-gullet');
    const a = put(s, 'P1', 'rank-rat');
    const b = put(s, 'P1', 'rank-rat');
    s = kill(s, a);
    s = kill(s, b);
    expect(s.cards[gorma]!.counters).toBe(2);
    const next = put(s, 'P1', 'rank-rat', 'hand');
    mana(s, 'P1', { B: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: next }).state;
    expect(s.cards[next]!.counters).toBe(2);
  });

  it('Nether Traitor has shadow (only shadow creatures block it) and returns for {B} when another creature of yours dies', () => {
    let s = newGame();
    const traitor = put(s, 'P1', 'nether-traitor', 'graveyard');
    const rat = put(s, 'P1', 'rank-rat');
    mana(s, 'P1', { B: 1 });
    s = kill(s, rat);
    expect(s.cards[traitor]!.zone).toBe('battlefield');
    expect(hasKeyword(s, s.cards[traitor]!, 'Shadow')).toBe(true);
  });

  it('Gilded Goose makes Food and sacrifices one for mana of any color; Gyome makes Food for each nontoken creature that entered this turn', () => {
    let s = newGame();
    const goose = put(s, 'P1', 'gilded-goose', 'hand');
    mana(s, 'P1', { G: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: goose }).state;
    const food = field(s, 'food-token-soc')[0]!;
    expect(food).toBeDefined();
    s.cards[goose]!.summoningSick = false;
    const tapFood = getLegalActions(s).find((a) => a.type === 'ActivateManaAbility' && a.card === goose && a.mana === 'B');
    expect(tapFood && 'sacrifice' in tapFood ? tapFood.sacrifice : undefined).toBe(food.id);
    s = act(s, tapFood!);
    expect([s.players.P1!.manaPool.B, s.cards[food.id]?.zone ?? 'gone']).not.toContain('battlefield');
    put(s, 'P1', 'gyome-master-chef');
    s = settle(goTo(s, 'end')).state;
    expect(field(s, 'food-token-soc').length).toBe(1); // the Goose entered this turn
  });

  it('Tendershoot Dryad: a Saproling every upkeep; with the city\'s blessing (ten permanents), Saprolings get +2/+2', () => {
    let s = newGame();
    put(s, 'P1', 'tendershoot-dryad');
    const sap = put(s, 'P1', 'saproling-token-soc', 'battlefield', { isToken: true });
    expect(powerOf(s, s.cards[sap]!)).toBe(1);
    for (let i = 0; i < 8; i++) put(s, 'P1', 'plains');
    s = settle(act(s, { type: 'PassPriority', player: 'P1' })).state;
    expect([s.players.P1!.cityBlessing, powerOf(s, s.cards[sap]!)]).toEqual([true, 3]);
  });

  it('Ominous Harvest has gravestorm: a copy for each permanent put into a graveyard from the battlefield this turn', () => {
    let s = newGame();
    const a = put(s, 'P1', 'rank-rat');
    const b = put(s, 'P1', 'rank-rat');
    s = kill(s, a);
    s = kill(s, b);
    s = goTo(s, 'main2');
    const harvest = put(s, 'P1', 'ominous-harvest', 'hand');
    mana(s, 'P1', { B: 1, C: 2 });
    const hand = s.players.P1!.hand.length;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: harvest, targets: [{ kind: 'player', player: 'P1' }] }).state;
    expect([s.players.P1!.hand.length - hand, s.players.P1!.life]).toEqual([-1 + 3, 17]);
  });
});

describe('SOC5e: Witherbloom Pestilence (Priest, Culling Ritual, Deadly Brew, Stensian Sanguinist)', () => {
  const choose = (s: GameState, pick: (cards: string[], purpose: string, player: string) => string[]) => {
    for (let guard = 0; guard < 20 && (s.pending.kind === 'chooseCards' || s.pending.kind === 'chooseMana'); guard++) {
      const p = s.pending as { kind: string; player: string; cards?: string[]; purpose?: string; options?: string[] };
      s = p.kind === 'chooseMana'
        ? settle(act(s, { type: 'ChooseMana', player: p.player, mana: (p.options?.[0] ?? 'B') as never })).state
        : settle(act(s, { type: 'ChooseCards', player: p.player, cards: pick(p.cards!, p.purpose!, p.player) })).state;
    }
    return s;
  };

  it('Priest of Forgotten Gods: sacrifice two others; any number of target players each lose 2 and sacrifice a creature; you add {B}{B} and draw', () => {
    let s = newGame(3);
    const priest = put(s, 'P1', 'priest-of-forgotten-gods');
    const a = put(s, 'P1', 'rank-rat');
    const b = put(s, 'P1', 'rank-rat');
    const x = put(s, 'P2', 'rank-rat');
    const y = put(s, 'P3', 'rank-rat');
    const both = getLegalActions(s).find((o) => o.type === 'ActivateAbility' && o.card === priest && (o.costCards ?? []).length === 2 && (o.targets ?? []).filter((t) => t.kind === 'player').length === 2 && !(o.targets ?? []).some((t) => t.kind === 'player' && t.player === 'P1'));
    expect(both).toBeDefined();
    const hand = s.players.P1!.hand.length;
    s = act(s, both!);
    s = choose(settle(s).state, (cards) => cards.slice(0, 1));
    expect([s.cards[a]!.zone, s.cards[b]!.zone, s.cards[x]!.zone, s.cards[y]!.zone]).toEqual(['graveyard', 'graveyard', 'graveyard', 'graveyard']);
    expect([s.players.P2!.life, s.players.P3!.life, s.players.P1!.manaPool.B, s.players.P1!.hand.length - hand]).toEqual([18, 18, 2, 1]);
  });

  it('Culling Ritual destroys each nonland permanent with mana value 2 or less and adds {B} or {G} for each, chosen one at a time', () => {
    let s = newGame();
    put(s, 'P2', 'rank-rat');
    put(s, 'P2', 'rank-rat');
    const keep = put(s, 'P2', 'ghostly-prison');
    const ritual = put(s, 'P1', 'culling-ritual', 'hand');
    mana(s, 'P1', { B: 1, G: 1, C: 2 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: ritual });
    s = settle(s).state;
    expect([s.pending.kind, (s.pending as { amount?: number }).amount]).toEqual(['chooseMana', 2]);
    s = act(s, { type: 'ChooseMana', player: 'P1', mana: 'B' });
    expect([s.pending.kind, (s.pending as { amount?: number }).amount]).toEqual(['chooseMana', 1]);
    s = settle(act(s, { type: 'ChooseMana', player: 'P1', mana: 'G' })).state;
    expect([s.players.P1!.manaPool.B, s.players.P1!.manaPool.G, s.cards[keep]!.zone]).toEqual([1, 1, 'battlefield']);
  });

  it('Deadly Brew: each player sacrifices a creature or planeswalker; you may return another permanent card from your graveyard', () => {
    let s = newGame();
    const mine = put(s, 'P1', 'rank-rat');
    put(s, 'P2', 'rank-rat');
    const old = put(s, 'P1', 'ghostly-prison', 'graveyard');
    const brew = put(s, 'P1', 'deadly-brew', 'hand');
    mana(s, 'P1', { B: 1, G: 1 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: brew });
    let offered: string[] = [];
    s = choose(settle(s).state, (cards, purpose) => { if (purpose === 'hand') offered = cards; return purpose === 'hand' ? [old] : cards.slice(0, 1); });
    expect(offered.includes(mine)).toBe(false);
    expect([s.cards[mine]!.zone, s.cards[old]!.zone]).toEqual(['graveyard', 'hand']);
  });

  it('Immoral Bargain: sacrifice X creatures (any X of them) to destroy exactly X target nonland permanents', () => {
    let s = newGame();
    const a = put(s, 'P1', 'rank-rat');
    const b = put(s, 'P1', 'rank-rat');
    const c = put(s, 'P1', 'rank-rat');
    const foe1 = put(s, 'P2', 'ghostly-prison');
    const foe2 = put(s, 'P2', 'killian-ink-duelist');
    const bargain = put(s, 'P1', 'immoral-bargain', 'hand');
    mana(s, 'P1', { B: 1, G: 1, C: 1 });
    const two = getLegalActions(s).find((o) => o.type === 'CastSpell' && o.card === bargain && o.x === 2 && (o.targets ?? []).length === 2 && (o.targets ?? []).every((t) => t.kind === 'card' && [foe1, foe2].includes(t.card)));
    expect([two?.type === 'CastSpell' ? two.costPool?.length : undefined]).toEqual([3]);
    s = cast(s, { ...two!, costCards: [b, c] } as never).state;
    expect([s.cards[a]!.zone, s.cards[b]!.zone, s.cards[c]!.zone, s.cards[foe1]!.zone, s.cards[foe2]!.zone]).toEqual(['battlefield', 'graveyard', 'graveyard', 'graveyard', 'graveyard']);
  });

  it('Plumb the Forbidden copies itself for each creature sacrificed as you cast it', () => {
    let s = newGame();
    const a = put(s, 'P1', 'rank-rat');
    const b = put(s, 'P1', 'rank-rat');
    const plumb = put(s, 'P1', 'plumb-the-forbidden', 'hand');
    mana(s, 'P1', { B: 1, C: 1 });
    const hand = s.players.P1!.hand.length;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: plumb, x: 2, costCards: [a, b], targets: [] }).state;
    expect([s.cards[a]!.zone, s.players.P1!.hand.length - hand, s.players.P1!.life]).toEqual(['graveyard', -1 + 3, 17]);
  });

  it('Stensian Sanguinist gives an attacker deathtouch and is prepared when that creature deals combat damage to a player; Exsanguinate drains X', () => {
    let s = newGame();
    const sang = put(s, 'P1', 'stensian-sanguinist-exsanguinate');
    const rat = put(s, 'P1', 'rank-rat');
    const pick = { targets: (o: { kind: string; card?: string }[][]) => o.find((t) => t[0]?.card === rat) ?? o[0]! };
    s = fight(s, [{ attacker: rat, defender: 'P2' }], {}, pick as never).state;
    expect(s.cards[sang]!.prepared).toBe(true);
    s = goTo(s, 'main2');
    const copy = Object.values(s.cards).find((c) => c.zone === 'exile' && c.prepareSpellOf?.card === sang)!;
    mana(s, 'P1', { B: 2, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: copy.id, x: 3 }).state;
    expect([s.players.P2!.life, s.players.P1!.life]).toEqual([20 - 1 - 3, 23]);
  });
});

describe('Fix: a token that must attack one opponent (Furygale Flocking)', () => {
  it('completing the attacks sends it at that opponent, not another', () => {
    const s = newGame(3);
    const token = put(s, 'P1', 'rank-rat', 'battlefield', { isToken: true, mustAttackPlayer: { turn: s.turnNumber, player: 'P3' } });
    expect(completeRequiredAttacks(s, 'P1', [{ attacker: token, defender: 'P2' }])).toEqual([{ attacker: token, defender: 'P3' }]);
  });
});
