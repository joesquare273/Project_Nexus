// The Secrets of Strixhaven Commander decks (SOC), built deck by deck (docs/strixhaven.md).

import { describe, expect, it } from 'vitest';
import { currentDefinition, getLegalActions, hasKeyword, powerOf, toughnessOf, type GameState } from '@nexus/engine';
import { act, cast, fight, goTo, mana, newGame, nextStep, put, settle } from './kit-helpers.ts';

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
