// The Secrets of Strixhaven Commander decks (SOC), built deck by deck (docs/strixhaven.md).

import { describe, expect, it } from 'vitest';
import { getLegalActions, hasKeyword, powerOf, type GameState } from '@nexus/engine';
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
