// Edge of Eternities main set cards, built group by group (docs/sealed.md).
// Group M1: cards the engine already had the pieces for.

import { describe, expect, it } from 'vitest';
import { getLegalActions, hasKeyword, powerOf, type GameState } from '@nexus/engine';
import { CARD_DEFS } from '@nexus/cards';
import { act, card, cast, goTo, mana, newGame, put, rejected } from './kit-helpers.ts';

const zone = (s: GameState, id: string) => s.cards[id]!.zone;
const ANY = { W: 3, U: 3, B: 3, R: 3, G: 3, C: 6 };

describe('M1: removal and tricks', () => {
  it('Bombard deals 4 to a creature; Gravkill exiles a creature or Spacecraft; Annul counters only artifact and enchantment spells', () => {
    let s = newGame();
    const bombard = put(s, 'P1', 'bombard', 'hand');
    const gravkill = put(s, 'P1', 'gravkill', 'hand');
    const big = put(s, 'P2', 'nebula-dragon');
    const ship = put(s, 'P2', 'inspirit-flagship-vessel');
    const ring = put(s, 'P2', 'sol-ring');
    mana(s, 'P1', ANY);
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: gravkill, targets: [card(ring)] })).toBeTruthy();
    let t = cast(s, { type: 'CastSpell', player: 'P1', card: bombard, targets: [card(big)] }).state;
    expect(zone(t, big)).toBe('graveyard');
    t = cast(s, { type: 'CastSpell', player: 'P1', card: gravkill, targets: [card(ship)] }).state;
    expect(zone(t, ship)).toBe('exile');
    // Annul.
    let u = newGame();
    const annul = put(u, 'P2', 'annul', 'hand');
    const myRing = put(u, 'P1', 'sol-ring', 'hand');
    const bear = put(u, 'P1', 'thawbringer', 'hand');
    u = goTo(u, 'main1');
    mana(u, 'P1', ANY);
    mana(u, 'P2', { U: 2 });
    // A creature spell isn't a legal target; an artifact spell is countered.
    let v = act(u, { type: 'CastSpell', player: 'P1', card: bear });
    v = act(v, { type: 'PassPriority', player: 'P1' });
    expect(rejected(v, { type: 'CastSpell', player: 'P2', card: annul, targets: [card(bear)] })).toBeTruthy();
    v = act(u, { type: 'CastSpell', player: 'P1', card: myRing });
    v = act(v, { type: 'PassPriority', player: 'P1' });
    v = cast(v, { type: 'CastSpell', player: 'P2', card: annul, targets: [card(myRing)] }).state;
    expect(zone(v, myRing)).toBe('graveyard');
  });

  it('Beyond the Quiet exiles all creatures and Spacecraft, nothing else', () => {
    let s = newGame();
    const quiet = put(s, 'P1', 'beyond-the-quiet', 'hand');
    const mine = put(s, 'P1', 'thawbringer');
    const ship = put(s, 'P2', 'inspirit-flagship-vessel');
    const ring = put(s, 'P2', 'sol-ring');
    mana(s, 'P1', ANY);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: quiet }).state;
    expect([zone(s, mine), zone(s, ship), zone(s, ring)]).toEqual(['exile', 'exile', 'battlefield']);
  });

  it('Radiant Strike: an artifact or a tapped creature (not an untapped one), and 3 life', () => {
    let s = newGame();
    const strike = put(s, 'P1', 'radiant-strike', 'hand');
    const up = put(s, 'P2', 'thawbringer');
    const down = put(s, 'P2', 'thawbringer', 'battlefield', { tapped: true });
    mana(s, 'P1', ANY);
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: strike, targets: [card(up)] })).toBeTruthy();
    const life = s.players.P1!.life;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: strike, targets: [card(down)] }).state;
    expect(zone(s, down)).toBe('graveyard');
    expect(s.players.P1!.life).toBe(life + 3);
  });

  it('Honor: a +1/+1 counter and a card; Rig for War: +3/+0, reach and first strike', () => {
    let s = newGame();
    const honor = put(s, 'P1', 'honor', 'hand');
    const rig = put(s, 'P1', 'rig-for-war', 'hand');
    const bear = put(s, 'P1', 'thawbringer');
    mana(s, 'P1', ANY);
    const hand = s.players.P1!.hand.length;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: honor, targets: [card(bear)] }).state;
    expect(s.cards[bear]!.counters).toBe(1);
    expect(s.players.P1!.hand.length).toBe(hand);
    const before = powerOf(s, s.cards[bear]!);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: rig, targets: [card(bear)] }).state;
    expect(powerOf(s, s.cards[bear]!)).toBe(before + 3);
    expect([hasKeyword(s, s.cards[bear]!, 'Reach'), hasKeyword(s, s.cards[bear]!, 'FirstStrike')]).toEqual([true, true]);
  });
});

describe('M1: creatures', () => {
  it('Virus Beetle makes each opponent discard; Nebula Dragon deals 3; Blooming Stinger gives another creature deathtouch', () => {
    let s = newGame();
    const beetle = put(s, 'P1', 'virus-beetle', 'hand');
    const dragon = put(s, 'P1', 'nebula-dragon', 'hand');
    const stinger = put(s, 'P1', 'blooming-stinger', 'hand');
    const bear = put(s, 'P1', 'thawbringer');
    mana(s, 'P1', { ...ANY, C: 12 });
    put(s, 'P2', 'forest', 'hand');
    const theirs = s.players.P2!.hand.length;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: beetle }).state;
    // The opponent chooses which card to discard.
    expect(s.pending.kind === 'chooseCards' && s.pending.player).toBe('P2');
    if (s.pending.kind === 'chooseCards') s = cast(s, { type: 'ChooseCards', player: 'P2', cards: s.pending.cards.slice(0, 1) }).state;
    expect(s.players.P2!.hand.length).toBe(theirs - 1);
    const life = s.players.P2!.life;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: dragon }, { targets: (o) => o.find((t) => t[0]?.kind === 'player' && t[0].player === 'P2')! }).state;
    expect(s.players.P2!.life).toBe(life - 3);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: stinger }, { targets: (o) => o.find((t) => t[0]?.kind === 'card' && t[0].card === bear)! }).state;
    expect(hasKeyword(s, s.cards[bear]!, 'Deathtouch')).toBe(true);
  });

  it('landfall: Eumidian Terrabotanist gains 1, Remnant Elemental gets +2/+0, Icecave Crasher +1/+0', () => {
    let s = newGame();
    put(s, 'P1', 'eumidian-terrabotanist');
    const remnant = put(s, 'P1', 'remnant-elemental');
    const crasher = put(s, 'P1', 'icecave-crasher');
    const land = put(s, 'P1', 'forest', 'hand');
    s = goTo(s, 'main1');
    const life = s.players.P1!.life;
    const [r, c] = [powerOf(s, s.cards[remnant]!), powerOf(s, s.cards[crasher]!)];
    s = cast(s, { type: 'PlayLand', player: 'P1', card: land }).state;
    expect(s.players.P1!.life).toBe(life + 1);
    expect([powerOf(s, s.cards[remnant]!), powerOf(s, s.cards[crasher]!)]).toEqual([r + 2, c + 1]);
  });

  it('abilities: Dual-Sun Adepts pumps the team; Intrepid Tenderfoot grows; Kavaron Turbodrone gives +1/+1 and haste; Zookeeper Mechan taps for {R}', () => {
    let s = newGame();
    const adepts = put(s, 'P1', 'dual-sun-adepts');
    const tender = put(s, 'P1', 'intrepid-tenderfoot');
    const drone = put(s, 'P1', 'kavaron-turbodrone');
    const zoo = put(s, 'P1', 'zookeeper-mechan');
    const fresh = put(s, 'P1', 'thawbringer', 'battlefield', { summoningSick: true });
    s = goTo(s, 'main1');
    mana(s, 'P1', { C: 8 });
    const p = powerOf(s, s.cards[fresh]!);
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: adepts, ability: 0 }).state;
    expect(powerOf(s, s.cards[fresh]!)).toBe(p + 1);
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: tender, ability: 0 }).state;
    expect(s.cards[tender]!.counters).toBe(1);
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: drone, ability: 0, targets: [card(fresh)] }).state;
    expect(powerOf(s, s.cards[fresh]!)).toBe(p + 2);
    expect(hasKeyword(s, s.cards[fresh]!, 'Haste')).toBe(true);
    expect(getLegalActions(s).some((a) => a.type === 'ActivateManaAbility' && a.card === zoo && a.mana === 'R')).toBe(true);
  });

  it('dying and sacrificing: Dockworker Drone passes on its counter, Meltstrider Eulogist draws, Lightless Evangel grows, Thawbringer surveils', () => {
    let s = newGame();
    const drone = put(s, 'P1', 'dockworker-drone', 'battlefield', { counters: 1 });
    put(s, 'P1', 'meltstrider-eulogist');
    const heir = put(s, 'P1', 'intrepid-tenderfoot');
    s = goTo(s, 'main1');
    const hand = s.players.P1!.hand.length;
    s.cards[drone]!.damage = 9;
    s = cast(s, { type: 'PassPriority', player: 'P1' }, { targets: (o) => o.find((t) => t[0]?.kind === 'card' && t[0].card === heir) ?? o[0]! }).state;
    expect(zone(s, drone)).toBe('graveyard');
    expect(s.cards[heir]!.counters).toBe(1);
    // The Drone had a +1/+1 counter as it died: the Eulogist draws.
    expect(s.players.P1!.hand.length).toBe(hand + 1);

    let t = newGame();
    const evangel = put(t, 'P1', 'lightless-evangel');
    const zealot = put(t, 'P1', 'umbral-collar-zealot');
    const fodder = put(t, 'P1', 'thawbringer');
    t = goTo(t, 'main1');
    t = cast(t, { type: 'ActivateAbility', player: 'P1', card: zealot, ability: 0, costCards: [fodder] }).state;
    expect(zone(t, fodder)).toBe('graveyard');
    expect(t.cards[evangel]!.counters).toBe(1);
    expect(rejected(t, { type: 'ActivateAbility', player: 'P1', card: zealot, ability: 0, costCards: [zealot] })).toBeTruthy();
  });

  it('Slagdrill Scrapper sacrifices another artifact or land to draw; Mmmenon puts a counter when an artifact enters', () => {
    let s = newGame();
    const scrapper = put(s, 'P1', 'slagdrill-scrapper');
    const land = put(s, 'P1', 'forest');
    const mm = put(s, 'P1', 'mmmenon-uthros-exile');
    const ring = put(s, 'P1', 'sol-ring', 'hand');
    s = goTo(s, 'main1');
    mana(s, 'P1', { C: 3 });
    const hand = s.players.P1!.hand.length;
    expect(rejected(s, { type: 'ActivateAbility', player: 'P1', card: scrapper, ability: 0, costCards: [mm] })).toBeTruthy();
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: scrapper, ability: 0, costCards: [land] }).state;
    expect(s.players.P1!.hand.length).toBe(hand + 1);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: ring }, { targets: (o) => o.find((t) => t[0]?.kind === 'card' && t[0].card === mm)! }).state;
    expect(s.cards[mm]!.counters).toBe(1);
  });

  it('becoming tapped: Mechan Navigator loots and Starfighter Pilot surveils when they attack; Molecular Modifier pumps at combat', () => {
    let s = newGame();
    const nav = put(s, 'P1', 'mechan-navigator');
    const pilot = put(s, 'P1', 'starfighter-pilot');
    const mod = put(s, 'P1', 'molecular-modifier');
    s = goTo(s, 'declareAttackers', { targets: (o) => o.find((t) => t[0]?.kind === 'card' && t[0].card === mod) ?? o[0]! });
    expect(powerOf(s, s.cards[mod]!)).toBe((CARD_DEFS['molecular-modifier']!.power ?? 0) + 1);
    expect(hasKeyword(s, s.cards[mod]!, 'FirstStrike')).toBe(true);
    const [hand, yard] = [s.players.P1!.hand.length, s.players.P1!.graveyard.length];
    s = cast(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: nav, defender: 'P2' }, { attacker: pilot, defender: 'P2' }] }).state;
    // Drew one, then discards one (hand unchanged, a card in the graveyard).
    for (let i = 0; i < 4 && s.pending.kind === 'chooseCards'; i++) {
      const p = s.pending;
      s = cast(s, { type: 'ChooseCards', player: p.player, cards: p.cards.slice(0, p.min) }).state;
    }
    expect(s.players.P1!.hand.length).toBe(hand);
    expect(s.players.P1!.graveyard.length).toBeGreaterThanOrEqual(yard + 1);
  });
});
