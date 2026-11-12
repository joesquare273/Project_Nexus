// Edge of Eternities main set cards, built group by group (docs/sealed.md).
// Group M1: cards the engine already had the pieces for.

import { describe, expect, it } from 'vitest';
import { applyAction, currentDefinition, getLegalActions, hasKeyword, powerOf, toughnessOf, type GameState } from '@nexus/engine';
import { canBlock } from '../../engine/src/combat.ts';
import { CARD_DEFS } from '@nexus/cards';
import { act, card, cast, goTo, mana, newGame, put, rejected, settle } from './kit-helpers.ts';
import { moveCard } from '../../engine/src/state.ts';

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

describe('M2: shock lands, second spells, Robots', () => {
  it('shock lands: pay 2 life to enter untapped, or enter tapped; both basic land types', () => {
    let s = newGame();
    const pool = put(s, 'P1', 'breeding-pool', 'hand');
    s = goTo(s, 'main1');
    const ways = getLegalActions(s).filter((a) => a.type === 'PlayLand' && a.card === pool);
    expect(ways.map((a) => a.type === 'PlayLand' && a.reveal)).toEqual([true, false]);
    const life = s.players.P1!.life;
    const paid = act(s, { type: 'PlayLand', player: 'P1', card: pool, reveal: true });
    expect([paid.cards[pool]!.tapped, paid.players.P1!.life]).toEqual([false, life - 2]);
    const not = act(s, { type: 'PlayLand', player: 'P1', card: pool, reveal: false });
    expect([not.cards[pool]!.tapped, not.players.P1!.life]).toEqual([true, life]);
    expect(CARD_DEFS['breeding-pool']!.subtypes).toEqual(['Forest', 'Island']);
    // With 1 life the payment isn't offered.
    s.players.P1!.life = 1;
    expect(getLegalActions(s).filter((a) => a.type === 'PlayLand' && a.card === pool).map((a) => a.type === 'PlayLand' && a.reveal)).toEqual([undefined]);
    expect(act(s, { type: 'PlayLand', player: 'P1', card: pool }).cards[pool]!.tapped).toBe(true);
  });

  it('your second spell each turn: Illvoi Operative and Sunstar Lightsmith grow, Uthros Psionicist makes it cost {2} less, Brightspear Zealot gets +2/+0', () => {
    let s = newGame();
    const op = put(s, 'P1', 'illvoi-operative');
    const smith = put(s, 'P1', 'sunstar-lightsmith');
    put(s, 'P1', 'uthros-psionicist');
    const zealot = put(s, 'P1', 'brightspear-zealot');
    const first = put(s, 'P1', 'honor', 'hand');
    const second = put(s, 'P1', 'bombard', 'hand');
    const victim = put(s, 'P2', 'thawbringer');
    s = goTo(s, 'main1');
    const base = powerOf(s, s.cards[zealot]!);
    mana(s, 'P1', { W: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: first, targets: [card(zealot)] }).state;
    expect(s.cards[op]!.counters ?? 0).toBe(0);
    // Bombard costs {2}{R}: as the second spell, {R} is enough.
    mana(s, 'P1', { R: 1 });
    const hand = s.players.P1!.hand.length;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: second, targets: [card(victim)] }).state;
    expect(zone(s, victim)).toBe('graveyard');
    expect([s.cards[op]!.counters, s.cards[smith]!.counters]).toEqual([1, 1]);
    // Bombard left the hand, the Lightsmith drew one.
    expect(s.players.P1!.hand.length).toBe(hand);
    // +1 from Honor's counter, +2 for two spells this turn.
    expect(powerOf(s, s.cards[zealot]!)).toBe(base + 3);
  });

  it('Gigastorm Titan costs {3} less after another spell; Cosmogrand Zenith chooses Soldiers or counters', () => {
    let s = newGame();
    const zenith = put(s, 'P1', 'cosmogrand-zenith');
    const titan = put(s, 'P1', 'gigastorm-titan', 'hand');
    const honor = put(s, 'P1', 'honor', 'hand');
    s = goTo(s, 'main1');
    mana(s, 'P1', { W: 1, U: 1, C: 1 });
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: titan })).toBeTruthy();
    s = cast(s, { type: 'CastSpell', player: 'P1', card: honor, targets: [card(zenith)] }).state;
    s = act(s, { type: 'CastSpell', player: 'P1', card: titan });
    // The second spell: Zenith's trigger asks for a mode.
    expect(s.pending.kind).toBe('chooseModes');
    s = cast(s, { type: 'ChooseModes', player: 'P1', modes: [0] } as never).state;
    expect(s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'human-soldier-token-eoe')).toHaveLength(2);
    expect(zone(s, titan)).toBe('battlefield');
  });

  it('Robots: Gravpack Monoist leaves a tapped one, Mechan Assembler makes one a turn, Melded Moxite loots and becomes one', () => {
    const robots = (s: GameState) => s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'robot-token-eoe');
    let s = newGame();
    const mono = put(s, 'P1', 'gravpack-monoist');
    s = goTo(s, 'main1');
    s.cards[mono]!.damage = 9;
    s = cast(s, { type: 'PassPriority', player: 'P1' }).state;
    expect(robots(s).map((id) => s.cards[id]!.tapped)).toEqual([true]);

    let t = newGame();
    put(t, 'P1', 'mechan-assembler');
    const r1 = put(t, 'P1', 'sol-ring', 'hand');
    const r2 = put(t, 'P1', 'sol-ring', 'hand');
    t = goTo(t, 'main1');
    mana(t, 'P1', { C: 2 });
    t = cast(t, { type: 'CastSpell', player: 'P1', card: r1 }).state;
    t = cast(t, { type: 'CastSpell', player: 'P1', card: r2 }).state;
    // Once each turn (the token entering doesn't make another either).
    expect(robots(t)).toHaveLength(1);

    let u = newGame();
    const moxite = put(u, 'P1', 'melded-moxite', 'hand');
    const junk = put(u, 'P1', 'forest', 'hand');
    u = goTo(u, 'main1');
    mana(u, 'P1', { R: 1, C: 4 });
    const hand = u.players.P1!.hand.length;
    u = act(u, { type: 'CastSpell', player: 'P1', card: moxite });
    for (let i = 0; i < 10 && u.pending.kind !== 'chooseCards'; i++) u = act(u, getLegalActions(u).find((a) => a.type === 'PassPriority') ?? getLegalActions(u)[0]!);
    u = cast(u, { type: 'ChooseCards', player: 'P1', cards: [junk] }).state;
    // Moxite and the discard left the hand; two cards drawn.
    expect(u.players.P1!.hand.length).toBe(hand);
    u = cast(u, { type: 'ActivateAbility', player: 'P1', card: moxite, ability: 0 }).state;
    expect(robots(u).map((id) => u.cards[id]!.tapped)).toEqual([true]);
  });

  it('two or more tapped creatures at your end step: Sami makes a Robot, Flight-Deck Coordinator gains 2, Frontline War-Rager grows', () => {
    for (const tapped of [2, 1]) {
      let s = newGame();
      put(s, 'P1', 'sami-ships-engineer');
      put(s, 'P1', 'flight-deck-coordinator');
      const rager = put(s, 'P1', 'frontline-war-rager');
      for (let i = 0; i < tapped; i++) put(s, 'P1', 'thawbringer', 'battlefield', { tapped: true });
      s = goTo(s, 'main2');
      const life = s.players.P1!.life;
      s = goTo(s, 'end');
      s = cast(s, { type: 'PassPriority', player: 'P1' }).state;
      const made = s.players.P1!.battlefield.some((id) => s.cards[id]!.defId === 'robot-token-eoe');
      expect([made, s.players.P1!.life - life, s.cards[rager]!.counters ?? 0]).toEqual(tapped === 2 ? [true, 2, 1] : [false, 0, 0]);
    }
  });
});

describe('M3: warp', () => {
  it('warp: cast from hand for the warp cost, exiled at the next end step, castable from exile on a later turn for its mana cost', () => {
    let s = newGame();
    const tiger = put(s, 'P1', 'red-tiger-mechan', 'hand');
    s = goTo(s, 'main1');
    mana(s, 'P1', { R: 1, C: 1 });
    // {3}{R} isn't affordable; the warp cost {1}{R} is.
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: tiger })).toBeTruthy();
    s = cast(s, { type: 'CastSpell', player: 'P1', card: tiger, alternative: true }).state;
    expect(zone(s, tiger)).toBe('battlefield');
    expect(s.cards[tiger]!.warped).toBe(true);
    const turn = s.turnNumber;
    s = goTo(s, 'end');
    expect(zone(s, tiger)).toBe('exile');
    // Not this turn, and never for the opponent.
    expect(getLegalActions(s).some((a) => a.type === 'CastSpell' && a.card === tiger)).toBe(false);
    // Your next turn: from exile for {3}{R} (not for the warp cost again).
    for (let i = 0; i < 12 && !(s.activePlayer === 'P1' && s.turnNumber > turn && s.step === 'main1'); i++) s = goTo(goTo(s, 'end'), 'main1');
    expect(s.turnNumber).toBeGreaterThan(turn);
    mana(s, 'P1', { R: 1, C: 1 });
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: tiger, alternative: true })).toMatch(/only from your hand/);
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: tiger })).toBeTruthy();
    mana(s, 'P1', { C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: tiger }).state;
    expect(zone(s, tiger)).toBe('battlefield');
    // Cast normally this time: it stays.
    s = goTo(s, 'end');
    expect(zone(s, tiger)).toBe('battlefield');
  });

  it('cast for its full cost from hand, a warp creature isn’t exiled', () => {
    let s = newGame();
    const wurm = put(s, 'P1', 'germinating-wurm', 'hand');
    s = goTo(s, 'main1');
    mana(s, 'P1', { G: 1, C: 4 });
    const life = s.players.P1!.life;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: wurm }).state;
    expect(s.players.P1!.life).toBe(life + 2);
    s = goTo(s, 'end');
    expect(zone(s, wurm)).toBe('battlefield');
  });

  it('enter triggers work each time: Knight Luminary, Nova Hellkite, Sinister Cryologist, Mechanozoa, Codecracker Hound', () => {
    let s = newGame();
    const knight = put(s, 'P1', 'knight-luminary', 'hand');
    const kite = put(s, 'P1', 'nova-hellkite', 'hand');
    const cryo = put(s, 'P1', 'sinister-cryologist', 'hand');
    const zoa = put(s, 'P1', 'mechanozoa', 'hand');
    const hound = put(s, 'P1', 'codecracker-hound', 'hand');
    const small = put(s, 'P2', 'virus-beetle');
    const big = put(s, 'P2', 'icecave-crasher');
    s = goTo(s, 'main1');
    mana(s, 'P1', { W: 3, U: 6, B: 3, R: 3, G: 3, C: 12 });
    const pick = (id: string) => ({ targets: (o: { kind: string; card?: string }[][]) => o.find((t) => t[0]?.kind === 'card' && t[0].card === id)! }) as never;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: knight, alternative: true }).state;
    expect(s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'human-soldier-token-eoe')).toHaveLength(1);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: kite, alternative: true }, pick(small)).state;
    expect(zone(s, small)).toBe('graveyard');
    const p = powerOf(s, s.cards[big]!);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: cryo, alternative: true }, pick(big)).state;
    expect(powerOf(s, s.cards[big]!)).toBe(p - 3);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: zoa, alternative: true }, pick(big)).state;
    expect([s.cards[big]!.tapped, s.cards[big]!.namedCounters?.stun]).toEqual([true, 1]);
    const [hand, yard] = [s.players.P1!.hand.length, s.players.P1!.graveyard.length];
    s = act(s, { type: 'CastSpell', player: 'P1', card: hound, alternative: true });
    for (let i = 0; i < 10 && s.pending.kind !== 'chooseCards'; i++) s = act(s, getLegalActions(s).find((a) => a.type === 'PassPriority') ?? getLegalActions(s)[0]!);
    expect(s.pending.kind === 'chooseCards' && s.pending.cards.length).toBe(2);
    if (s.pending.kind === 'chooseCards') s = cast(s, { type: 'ChooseCards', player: 'P1', cards: s.pending.cards.slice(0, 1) }).state;
    // The Hound left the hand; one card kept, one into the graveyard.
    expect([s.players.P1!.hand.length, s.players.P1!.graveyard.length]).toEqual([hand, yard + 1]);
  });

  it('statics and triggers: Drix Fatemaker, Memorial Team Leader, Weftstalker Ardent, Susurian Voidborn, Eusocial Engineering, Rayblade Trooper', () => {
    let s = newGame();
    const fate = put(s, 'P1', 'drix-fatemaker');
    const leader = put(s, 'P1', 'memorial-team-leader');
    const ardent = put(s, 'P1', 'weftstalker-ardent');
    put(s, 'P1', 'susurian-voidborn');
    put(s, 'P1', 'eusocial-engineering');
    put(s, 'P1', 'rayblade-trooper');
    const marked = put(s, 'P1', 'thawbringer', 'battlefield', { counters: 1 });
    const land = put(s, 'P1', 'forest', 'hand');
    s = goTo(s, 'main1');
    expect(hasKeyword(s, s.cards[marked]!, 'Trample')).toBe(true);
    expect(hasKeyword(s, s.cards[fate]!, 'Trample')).toBe(false);
    // Your turn: other creatures get +1/+0, the Leader itself doesn't.
    expect(powerOf(s, s.cards[ardent]!)).toBe((CARD_DEFS['weftstalker-ardent']!.power ?? 0) + 1);
    expect(powerOf(s, s.cards[leader]!)).toBe(CARD_DEFS['memorial-team-leader']!.power ?? 0);
    // Landfall makes a Robot (an artifact creature entering): Ardent pings each opponent.
    const life = s.players.P2!.life;
    s = cast(s, { type: 'PlayLand', player: 'P1', card: land }).state;
    expect(s.players.P1!.battlefield.some((id) => s.cards[id]!.defId === 'robot-token-eoe')).toBe(true);
    expect(s.players.P2!.life).toBe(life - 1);
    // A nontoken creature with a +1/+1 counter dies: a Soldier (Rayblade), and a drain (Voidborn).
    const [mine, theirs] = [s.players.P1!.life, s.players.P2!.life];
    s.cards[marked]!.damage = 9;
    s = cast(s, { type: 'PassPriority', player: 'P1' }).state;
    expect(zone(s, marked)).toBe('graveyard');
    expect(s.players.P1!.battlefield.some((id) => s.cards[id]!.defId === 'human-soldier-token-eoe')).toBe(true);
    // The Soldier entering pings again; the death drains 1.
    expect([s.players.P1!.life, s.players.P2!.life]).toEqual([mine + 1, theirs - 2]);
  });

  it('All-Fates Stalker exiles a non-Assassin creature until it leaves (also when it is warped away); Weftblade Enhancer puts two counters', () => {
    let s = newGame();
    const stalker = put(s, 'P1', 'all-fates-stalker', 'hand');
    const enhancer = put(s, 'P1', 'weftblade-enhancer', 'hand');
    const a = put(s, 'P1', 'thawbringer');
    const b = put(s, 'P1', 'virus-beetle');
    const victim = put(s, 'P2', 'icecave-crasher');
    s = goTo(s, 'main1');
    mana(s, 'P1', { W: 2, C: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: stalker, alternative: true }, { targets: (o) => o.find((t) => t[0]?.kind === 'card' && t[0].card === victim)! }).state;
    expect(zone(s, victim)).toBe('exile');
    s = cast(s, { type: 'CastSpell', player: 'P1', card: enhancer, alternative: true }, { targets: (o) => o.find((t) => t[0]?.kind === 'card' && t[0].card === a && t[1]?.kind === 'card' && t[1].card === b)! }).state;
    expect([s.cards[a]!.counters, s.cards[b]!.counters]).toEqual([1, 1]);
    // End step: both warped creatures are exiled, and the Stalker's victim comes back.
    s = goTo(s, 'end');
    expect([zone(s, stalker), zone(s, enhancer), zone(s, victim)]).toEqual(['exile', 'exile', 'battlefield']);
  });

  it('the computer can use warp (it is offered as a play)', () => {
    let s = newGame();
    const colossus = put(s, 'P1', 'bygone-colossus', 'hand');
    s = goTo(s, 'main1');
    mana(s, 'P1', { C: 3 });
    const ways = getLegalActions(s).filter((a) => a.type === 'CastSpell' && a.card === colossus);
    expect(ways.map((a) => a.type === 'CastSpell' && !!a.alternative)).toContain(true);
  });
});

describe('M4: void and Landers', () => {
  const landers = (s: GameState, pid = 'P1') => s.players[pid]!.battlefield.filter((id) => s.cards[id]!.defId === 'lander-token-eoe');
  const pick = (id: string) => ({ targets: (o: { kind: string; card?: string }[][]) => o.find((t) => t[0]?.kind === 'card' && t[0].card === id)! }) as never;
  /** Makes void true this turn: a nonland permanent leaves the battlefield. */
  const voided = (s: GameState): GameState => {
    const fodder = put(s, 'P2', 'virus-beetle');
    moveCard({ s, ev: [] }, fodder, 'graveyard');
    return s;
  };

  it('void turns on when a nonland permanent leaves the battlefield or a spell is warped, not when a land leaves', () => {
    let s = newGame();
    s = goTo(s, 'main1');
    expect(s.voidTurn).not.toBe(s.turnNumber);
    const land = put(s, 'P1', 'forest');
    const scrapper = put(s, 'P1', 'slagdrill-scrapper');
    mana(s, 'P1', { C: 2 });
    let t = cast(s, { type: 'ActivateAbility', player: 'P1', card: scrapper, ability: 0, costCards: [land] }).state;
    expect(t.voidTurn).not.toBe(t.turnNumber);
    t = voided(s);
    expect(t.voidTurn).toBe(t.turnNumber);
    const tiger = put(s, 'P1', 'red-tiger-mechan', 'hand');
    mana(s, 'P1', { R: 1, C: 1 });
    t = act(s, { type: 'CastSpell', player: 'P1', card: tiger, alternative: true });
    expect(t.voidTurn).toBe(t.turnNumber);
  });

  it('void spells: Plasma Bolt 2 or 3, Tragic Trajectory -2/-2 or -10/-10, Decode Transmissions, Hymn of the Faller, Temporal Intervention costs {2} less', () => {
    for (const on of [false, true]) {
      let s = newGame();
      const bolt = put(s, 'P1', 'plasma-bolt', 'hand');
      const traj = put(s, 'P1', 'tragic-trajectory', 'hand');
      const decode = put(s, 'P1', 'decode-transmissions', 'hand');
      const hymn = put(s, 'P1', 'hymn-of-the-faller', 'hand');
      const temporal = put(s, 'P1', 'temporal-intervention', 'hand');
      const big = put(s, 'P2', 'bygone-colossus');
      put(s, 'P2', 'honor', 'hand');
      s = goTo(s, 'main1');
      if (on) s = voided(s);
      mana(s, 'P1', { B: 4, R: 1, C: 5 });
      const [me, them] = [s.players.P1!.life, s.players.P2!.life];
      s = cast(s, { type: 'CastSpell', player: 'P1', card: bolt, targets: [{ kind: 'player', player: 'P2' }] }).state;
      expect(them - s.players.P2!.life).toBe(on ? 3 : 2);
      s = cast(s, { type: 'CastSpell', player: 'P1', card: traj, targets: [card(big)] }).state;
      expect(zone(s, big)).toBe(on ? 'graveyard' : 'battlefield');
      const hand = s.players.P1!.hand.length;
      s = cast(s, { type: 'CastSpell', player: 'P1', card: decode }).state;
      expect(s.players.P1!.hand.length).toBe(hand + 1);
      expect([me - s.players.P1!.life, them - s.players.P2!.life]).toEqual(on ? [0, 5] : [2, 2]);
      const before = s.players.P1!.hand.length;
      s = cast(s, { type: 'CastSpell', player: 'P1', card: hymn }, { surveilToGraveyard: false }).state;
      expect(s.players.P1!.hand.length - before).toBe(on ? 1 : 0);
      // Temporal Intervention: {2}{B}, or {B} with void.
      s.players.P1!.manaPool = { W: 0, U: 0, B: 1, R: 0, G: 0, C: 0 };
      if (on) {
        s = act(s, { type: 'CastSpell', player: 'P1', card: temporal, targets: [{ kind: 'player', player: 'P2' }] });
        for (let i = 0; i < 10 && s.pending.kind !== 'chooseCards'; i++) s = act(s, getLegalActions(s).find((a) => a.type === 'PassPriority') ?? getLegalActions(s)[0]!);
        expect(s.pending.kind === 'chooseCards' && s.pending.player).toBe('P1');
      } else expect(rejected(s, { type: 'CastSpell', player: 'P1', card: temporal, targets: [{ kind: 'player', player: 'P2' }] })).toBeTruthy();
    }
  });

  it('void at your end step: counters (Skittermaw, Skywarden, Interceptor), a card (Voidforged Titan), a Robot (Elegy Acolyte), Hylderblade attaches', () => {
    for (const on of [false, true]) {
      let s = newGame();
      const maw = put(s, 'P1', 'insatiable-skittermaw');
      const warden = put(s, 'P1', 'kavaron-skywarden');
      const mechan = put(s, 'P1', 'interceptor-mechan');
      put(s, 'P1', 'voidforged-titan');
      put(s, 'P1', 'elegy-acolyte');
      const blade = put(s, 'P1', 'hylderblade');
      s = goTo(s, 'main2');
      if (on) s = voided(s);
      const hand = s.players.P1!.hand.length;
      s = goTo(s, 'end', pick(maw));
      s = cast(s, { type: 'PassPriority', player: 'P1' }, pick(maw)).state;
      expect([s.cards[maw]!.counters ?? 0, s.cards[warden]!.counters ?? 0, s.cards[mechan]!.counters ?? 0]).toEqual(on ? [1, 1, 1] : [0, 0, 0]);
      expect(s.players.P1!.hand.length - hand).toBe(on ? 1 : 0);
      expect(s.players.P1!.battlefield.some((id) => s.cards[id]!.defId === 'robot-token-eoe')).toBe(on);
      expect(s.cards[blade]!.attachedTo).toBe(on ? maw : undefined);
      if (on) expect(powerOf(s, s.cards[maw]!)).toBe((CARD_DEFS['insatiable-skittermaw']!.power ?? 0) + 1 + 3);
    }
  });

  it('Landers: made by Galactic Wayfarer, Sami’s Curiosity, Beamsaw Prospector, Edge Rover (each player), Emergency Eject (its controller), Seedship Impact (mana value 2 or less)', () => {
    let s = newGame();
    const way = put(s, 'P1', 'galactic-wayfarer', 'hand');
    const cur = put(s, 'P1', 'samis-curiosity', 'hand');
    const eject = put(s, 'P1', 'emergency-eject', 'hand');
    const impact = put(s, 'P1', 'seedship-impact', 'hand');
    const impact2 = put(s, 'P1', 'seedship-impact', 'hand');
    const prospector = put(s, 'P1', 'beamsaw-prospector');
    const rover = put(s, 'P1', 'edge-rover');
    const theirs = put(s, 'P2', 'thawbringer');
    const ring = put(s, 'P2', 'sol-ring');
    const pricey = put(s, 'P2', 'bygone-colossus');
    s = goTo(s, 'main1');
    mana(s, 'P1', { W: 1, G: 5, C: 8 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: way }).state;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: cur }).state;
    expect(landers(s)).toHaveLength(2);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: eject, targets: [card(theirs)] }).state;
    expect([zone(s, theirs), landers(s, 'P2').length]).toEqual(['graveyard', 1]);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: impact, targets: [card(ring)] }).state;
    expect(landers(s)).toHaveLength(3);
    // Bygone Colossus costs 9: destroyed, but no Lander.
    s = cast(s, { type: 'CastSpell', player: 'P1', card: impact2, targets: [card(pricey)] }).state;
    expect([zone(s, pricey), landers(s).length]).toEqual(['graveyard', 3]);
    s.cards[prospector]!.damage = 9;
    s.cards[rover]!.damage = 9;
    s = cast(s, { type: 'PassPriority', player: 'P1' }).state;
    expect([landers(s).length, landers(s, 'P2').length]).toEqual([5, 2]);
  });

  it('more Landers: Seedship Agrarian, Glacier Godmaw’s landfall, Biotech Specialist pings when a Lander is sacrificed, Dauntless Scrapbot, Scrounge for Eternity', () => {
    let s = newGame();
    const agr = put(s, 'P1', 'seedship-agrarian');
    put(s, 'P1', 'glacier-godmaw');
    put(s, 'P1', 'biotech-specialist');
    const bot = put(s, 'P1', 'dauntless-scrapbot', 'hand');
    const scrounge = put(s, 'P1', 'scrounge-for-eternity', 'hand');
    const dead = put(s, 'P1', 'thawbringer', 'graveyard');
    const fodder = put(s, 'P1', 'virus-beetle');
    put(s, 'P2', 'honor', 'graveyard');
    s = goTo(s, 'declareAttackers');
    s = cast(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: agr, defender: 'P2' }] }).state;
    expect(landers(s)).toHaveLength(1);
    s = goTo(s, 'main2');
    mana(s, 'P1', { B: 1, C: 7 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: bot }).state;
    expect(s.players.P2!.graveyard).toHaveLength(0);
    expect(landers(s)).toHaveLength(2);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: scrounge, costCards: [fodder], targets: [card(dead)] }, { targets: (o) => o.find((t) => t[0]?.kind === 'player' && t[0].player === 'P2') ?? o[0]! }).state;
    expect(zone(s, dead)).toBe('battlefield');
    expect(landers(s)).toHaveLength(3);
    // Crack a Lander: Biotech deals 2, the land enters, Godmaw pumps the team and Agrarian gets a counter.
    const life = s.players.P2!.life;
    put(s, 'P1', 'forest', 'library');
    const base = powerOf(s, s.cards[agr]!);
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: landers(s)[0]!, ability: 0 }, { targets: (o) => o.find((t) => t[0]?.kind === 'player' && t[0].player === 'P2') ?? o[0]! }).state;
    expect(s.players.P2!.life).toBeLessThanOrEqual(life - 2);
    expect(s.cards[agr]!.counters).toBe(1);
    expect(powerOf(s, s.cards[agr]!)).toBe(base + 2);
    expect(hasKeyword(s, s.cards[agr]!, 'Haste')).toBe(true);
  });
});

describe('M5: station, Spacecraft and a Planet', () => {
  const pick = (id: string) => ({ targets: (o: { kind: string; card?: string }[][]) => o.find((t) => t[0]?.kind === 'card' && t[0].card === id)! }) as never;
  const isCreature = (s: GameState, id: string) => (currentDefinition(s, s.cards[id]!).types as string[]).includes('creature');

  it('stationing a Spacecraft: charge counters from a creature’s power, abilities at their levels, a creature at the top one', () => {
    let s = newGame();
    const frigate = put(s, 'P1', 'lumen-class-frigate');
    const crew = put(s, 'P1', 'thawbringer');
    const other = put(s, 'P1', 'virus-beetle');
    s = goTo(s, 'main1');
    const base = powerOf(s, s.cards[other]!);
    // Thawbringer has power 4: four charge counters, past the 2+ level.
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: frigate, ability: 0, costCards: [crew] }).state;
    expect(s.cards[frigate]!.namedCounters?.charge).toBe(CARD_DEFS['thawbringer']!.power);
    expect(s.cards[crew]!.tapped).toBe(true);
    expect(powerOf(s, s.cards[other]!)).toBe(base + 1);
    expect(isCreature(s, frigate)).toBe(false);
    s.cards[frigate]!.namedCounters = { charge: 12 };
    expect(isCreature(s, frigate)).toBe(true);
    expect([hasKeyword(s, s.cards[frigate]!, 'Flying'), hasKeyword(s, s.cards[frigate]!, 'Lifelink')]).toEqual([true, true]);
    // It doesn't pump itself ("other creatures").
    expect(powerOf(s, s.cards[frigate]!)).toBe(CARD_DEFS['lumen-class-frigate']!.power);
  });

  it('enter effects: Wedgelight Rammer, Uthros Scanship, Atmospheric Greenhouse, Wurmwall Sweeper, Warmaker Gunship, Pinnacle Kill-Ship, Debris-Field Crusher', () => {
    let s = newGame();
    const rammer = put(s, 'P1', 'wedgelight-rammer', 'hand');
    const green = put(s, 'P1', 'atmospheric-greenhouse', 'hand');
    const gun = put(s, 'P1', 'warmaker-gunship', 'hand');
    const kill = put(s, 'P1', 'pinnacle-kill-ship', 'hand');
    const crusher = put(s, 'P1', 'debris-field-crusher', 'hand');
    const mine = put(s, 'P1', 'thawbringer');
    const small = put(s, 'P2', 'virus-beetle');
    const big = put(s, 'P2', 'bygone-colossus');
    s = goTo(s, 'main1');
    mana(s, 'P1', { W: 1, R: 3, G: 1, C: 30 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: rammer }).state;
    const robot = s.players.P1!.battlefield.find((id) => s.cards[id]!.defId === 'robot-token-eoe')!;
    expect(robot).toBeDefined();
    s = cast(s, { type: 'CastSpell', player: 'P1', card: green }).state;
    expect([s.cards[mine]!.counters, s.cards[robot]!.counters]).toEqual([1, 1]);
    // Artifacts you control: Rammer, the Robot, the Greenhouse and the Gunship itself.
    s = cast(s, { type: 'CastSpell', player: 'P1', card: gun }, pick(small)).state;
    expect(zone(s, small)).toBe('graveyard');
    s = cast(s, { type: 'CastSpell', player: 'P1', card: kill }, pick(big)).state;
    expect(zone(s, big)).toBe('graveyard');
    const life = s.players.P2!.life;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: crusher }, { targets: (o) => o.find((t) => t[0]?.kind === 'player' && t[0].player === 'P2')! }).state;
    expect(s.players.P2!.life).toBe(life - 3);
    // Its {1}{R} ability needs 8 charge counters.
    mana(s, 'P1', { R: 1, C: 1 });
    expect(rejected(s, { type: 'ActivateAbility', player: 'P1', card: crusher, ability: 0 })).toBeTruthy();
    s.cards[crusher]!.namedCounters = { charge: 8 };
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: crusher, ability: 0 }).state;
    expect(powerOf(s, s.cards[crusher]!)).toBe((CARD_DEFS['debris-field-crusher']!.power ?? 0) + 2);
  });

  it('graveyards and hands: Rescue Skiff, Fell Gravship, Specimen Freighter, Susurian Dirgecraft, Extinguisher Battleship', () => {
    let s = newGame();
    const skiff = put(s, 'P1', 'rescue-skiff', 'hand');
    const freighter = put(s, 'P1', 'specimen-freighter', 'hand');
    const dirge = put(s, 'P1', 'susurian-dirgecraft', 'hand');
    const battleship = put(s, 'P1', 'extinguisher-battleship', 'hand');
    const dead = put(s, 'P1', 'nebula-dragon', 'graveyard');
    const a = put(s, 'P2', 'thawbringer');
    const b = put(s, 'P2', 'virus-beetle');
    const ring = put(s, 'P2', 'sol-ring');
    s = goTo(s, 'main1');
    mana(s, 'P1', { W: 1, U: 1, B: 1, C: 30 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: skiff }, pick(dead)).state;
    expect(zone(s, dead)).toBe('battlefield');
    s = cast(s, { type: 'CastSpell', player: 'P1', card: freighter }, { targets: (o) => o.find((t) => t[0]?.kind === 'card' && t[0].card === a && t[1]?.kind === 'card' && t[1].card === dead) ?? o.find((t) => t[0]?.kind === 'card' && t[0].card === a)! }).state;
    expect(zone(s, a)).toBe('hand');
    // Each opponent sacrifices a nontoken creature.
    s = cast(s, { type: 'CastSpell', player: 'P1', card: dirge }).state;
    if (s.pending.kind === 'chooseCards') s = cast(s, { type: 'ChooseCards', player: s.pending.player, cards: [b] }).state;
    expect(zone(s, b)).toBe('graveyard');
    // Destroys a noncreature permanent, then 4 damage to each creature.
    const mine = put(s, 'P1', 'virus-beetle');
    s = cast(s, { type: 'CastSpell', player: 'P1', card: battleship }, pick(ring)).state;
    expect([zone(s, ring), zone(s, mine)]).toEqual(['graveyard', 'graveyard']);
  });

  it('attack triggers need their level: Sledge-Class Seedship puts a creature from hand, Dawnsire deals 100, Specimen Freighter mills four', () => {
    let s = newGame();
    const seed = put(s, 'P1', 'sledge-class-seedship', 'battlefield', { namedCounters: { charge: 7 } });
    const dawn = put(s, 'P1', 'dawnsire-sunstar-dreadnought', 'battlefield', { namedCounters: { charge: 10 } });
    const freighter = put(s, 'P1', 'specimen-freighter', 'battlefield', { namedCounters: { charge: 9 } });
    const guest = put(s, 'P1', 'nebula-dragon', 'hand');
    const victim = put(s, 'P2', 'bygone-colossus');
    // Dawnsire isn't a creature at 10 (it needs 20), but its "whenever you attack" works.
    expect(isCreature(s, dawn)).toBe(false);
    s = goTo(s, 'declareAttackers');
    const lib = s.players.P2!.library.length;
    s = act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: seed, defender: 'P2' }, { attacker: freighter, defender: 'P2' }] });
    for (let i = 0; i < 40 && s.step === 'declareAttackers'; i++) {
      const p = s.pending;
      if (p.kind === 'chooseTargets') {
        const legal = getLegalActions(s).filter((x) => x.type === 'ChooseTargets');
        s = act(s, legal.find((x) => x.type === 'ChooseTargets' && x.targets[0]?.kind === 'card' && x.targets[0].card === victim) ?? legal[0]!);
      } else if (p.kind === 'chooseCards') s = act(s, { type: 'ChooseCards', player: p.player, cards: p.cards.includes(guest) ? [guest] : p.cards.slice(0, p.min) });
      else if (p.kind === 'priority' && s.stack.length > 0) s = act(s, { type: 'PassPriority', player: p.player });
      else break;
    }
    expect(zone(s, victim)).toBe('graveyard');
    expect(zone(s, guest)).toBe('battlefield');
    expect(s.players.P2!.library.length).toBe(lib - 4);
  });

  it('The Seriema finds a legendary creature; Larval Scoutlander trades a land for two basics; Kavaron, Memorial World needs 12 counters', () => {
    let s = newGame();
    const seriema = put(s, 'P1', 'the-seriema', 'hand');
    const scout = put(s, 'P1', 'larval-scoutlander', 'hand');
    const planet = put(s, 'P1', 'kavaron-memorial-world');
    const legend = put(s, 'P1', 'mmmenon-uthros-exile', 'library');
    const land = put(s, 'P1', 'forest');
    s = goTo(s, 'main1');
    mana(s, 'P1', { W: 2, G: 1, R: 1, C: 6 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: seriema });
    for (let i = 0; i < 10 && s.pending.kind !== 'chooseCards'; i++) s = act(s, getLegalActions(s).find((a) => a.type === 'PassPriority') ?? getLegalActions(s)[0]!);
    expect(s.pending.kind === 'chooseCards' && s.pending.cards).toEqual([legend]);
    s = cast(s, { type: 'ChooseCards', player: 'P1', cards: [legend] }).state;
    expect(zone(s, legend)).toBe('hand');
    const lands = () => s.players.P1!.battlefield.filter((id) => (CARD_DEFS[s.cards[id]!.defId]!.types as string[]).includes('land')).length;
    const before = lands();
    s = act(s, { type: 'CastSpell', player: 'P1', card: scout });
    for (let i = 0; i < 10 && s.pending.kind !== 'chooseCards'; i++) s = act(s, getLegalActions(s).find((a) => a.type === 'PassPriority') ?? getLegalActions(s)[0]!);
    s = act(s, { type: 'ChooseCards', player: 'P1', cards: [land] });
    for (let i = 0; i < 10 && s.pending.kind !== 'chooseCards'; i++) s = act(s, getLegalActions(s).find((a) => a.type === 'PassPriority') ?? getLegalActions(s)[0]!);
    if (s.pending.kind === 'chooseCards') s = cast(s, { type: 'ChooseCards', player: 'P1', cards: s.pending.cards.slice(0, 2) }).state;
    expect(lands()).toBe(before + 1);
    // The Planet: a land with station; its ability unlocks at 12.
    expect(rejected(s, { type: 'ActivateAbility', player: 'P1', card: planet, ability: 0, costCards: [planet] })).toBeTruthy();
    expect(isCreature(s, planet)).toBe(false);
    s.cards[planet]!.namedCounters = { charge: 12 };
    expect(isCreature(s, planet)).toBe(false);
    const fodder = s.players.P1!.battlefield.find((id) => id !== planet && (CARD_DEFS[s.cards[id]!.defId]!.types as string[]).includes('land'))!;
    mana(s, 'P1', { R: 1, C: 1 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: planet, ability: 0, costCards: [fodder] }).state;
    expect(s.players.P1!.battlefield.some((id) => s.cards[id]!.defId === 'robot-token-eoe')).toBe(true);
  });
});

describe('M6: more spells and creatures', () => {
  const pick = (id: string) => ({ targets: (o: { kind: string; card?: string }[][]) => o.find((t) => t[0]?.kind === 'card' && t[0].card === id)! }) as never;
  const base = (id: string) => CARD_DEFS[id]!.power ?? 0;

  it('removal: Vote Out (convoke), Shattered Wings, Embrace Oblivion, Lost in Space, Invasive Maneuvers 3 or 5, Ruinous Rampage, Reroute Systems, Drill Too Deep', () => {
    let s = newGame();
    const vote = put(s, 'P1', 'vote-out', 'hand');
    const wings = put(s, 'P1', 'shattered-wings', 'hand');
    const embrace = put(s, 'P1', 'embrace-oblivion', 'hand');
    const lost = put(s, 'P1', 'lost-in-space', 'hand');
    const inv = put(s, 'P1', 'invasive-maneuvers', 'hand');
    const inv2 = put(s, 'P1', 'invasive-maneuvers', 'hand');
    const helpers = [put(s, 'P1', 'virus-beetle'), put(s, 'P1', 'virus-beetle')];
    const fodder = put(s, 'P1', 'virus-beetle');
    const flyer = put(s, 'P2', 'nebula-dragon');
    const ground = put(s, 'P2', 'thawbringer');
    const five = put(s, 'P2', 'atmospheric-greenhouse', 'battlefield', { namedCounters: { charge: 8 } });
    const four = put(s, 'P2', 'icecave-crasher');
    const tucked = put(s, 'P2', 'sol-ring');
    s = goTo(s, 'main1');
    // Vote Out costs {3}{B}: two creatures convoke two of it.
    mana(s, 'P1', { B: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: vote, targets: [card(ground)], convoke: helpers }).state;
    expect(zone(s, ground)).toBe('graveyard');
    mana(s, 'P1', { U: 1, B: 1, R: 2, G: 1, C: 9 });
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: wings, targets: [card(four)] })).toBeTruthy();
    s = cast(s, { type: 'CastSpell', player: 'P1', card: wings, targets: [card(flyer)] }).state;
    expect(zone(s, flyer)).toBe('graveyard');
    // 3 damage doesn't kill a 4-toughness creature; with a Spacecraft it's 5.
    s = cast(s, { type: 'CastSpell', player: 'P1', card: inv, targets: [card(four)] }).state;
    expect(zone(s, four)).toBe('battlefield');
    s.cards[four]!.damage = 0;
    put(s, 'P1', 'wurmwall-sweeper');
    s = cast(s, { type: 'CastSpell', player: 'P1', card: inv2, targets: [card(four)] }).state;
    expect(zone(s, four)).toBe('graveyard');
    s = cast(s, { type: 'CastSpell', player: 'P1', card: embrace, costCards: [fodder], targets: [card(five)] }).state;
    expect([zone(s, fodder), zone(s, five)]).toEqual(['graveyard', 'graveyard']);
    s = act(s, { type: 'CastSpell', player: 'P1', card: lost, targets: [card(tucked)] });
    for (let i = 0; i < 12 && zone(s, tucked) === 'battlefield'; i++) {
      const p = s.pending;
      if (p.kind === 'chooseCards') s = act(s, { type: 'ChooseCards', player: p.player, cards: [] });
      else s = act(s, getLegalActions(s).find((a) => a.type === 'PassPriority') ?? getLegalActions(s)[0]!);
    }
    expect(zone(s, tucked)).toBe('library');

    let t = newGame();
    const rampage = put(t, 'P1', 'ruinous-rampage', 'hand');
    const reroute = put(t, 'P1', 'reroute-systems', 'hand');
    const drill = put(t, 'P1', 'drill-too-deep', 'hand');
    const cheap = put(t, 'P2', 'sol-ring');
    const dear = put(t, 'P2', 'bygone-colossus');
    const tapped = put(t, 'P2', 'intrepid-tenderfoot', 'battlefield', { tapped: true });
    const ship = put(t, 'P1', 'wurmwall-sweeper');
    t = goTo(t, 'main1');
    mana(t, 'P1', { W: 1, R: 3, C: 4 });
    t = cast(t, { type: 'CastSpell', player: 'P1', card: rampage, mode: 1 }).state;
    expect([zone(t, cheap), zone(t, dear), zone(t, ship)]).toEqual(['exile', 'battlefield', 'exile']);
    t = cast(t, { type: 'CastSpell', player: 'P1', card: reroute, mode: 1, targets: [card(tapped)] }).state;
    expect(zone(t, tapped)).toBe('graveyard');
    const ship2 = put(t, 'P1', 'wurmwall-sweeper');
    t = cast(t, { type: 'CastSpell', player: 'P1', card: drill, mode: 0, targets: [card(ship2)] }).state;
    expect(t.cards[ship2]!.namedCounters?.charge).toBe(5);
  });

  it('tricks and card flow: Biosynthic Burst, Dual-Sun Technique, Cerebral Download, Alpharael, Vaultguard Trooper', () => {
    let s = newGame();
    const burst = put(s, 'P1', 'biosynthic-burst', 'hand');
    const tech = put(s, 'P1', 'dual-sun-technique', 'hand');
    const dl = put(s, 'P1', 'cerebral-download', 'hand');
    const bear = put(s, 'P1', 'thawbringer', 'battlefield', { tapped: true });
    put(s, 'P1', 'sol-ring');
    s = goTo(s, 'main1');
    mana(s, 'P1', { W: 1, U: 1, G: 1, C: 6 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: burst, targets: [card(bear)] }).state;
    expect([s.cards[bear]!.counters, s.cards[bear]!.tapped, hasKeyword(s, s.cards[bear]!, 'Indestructible')]).toEqual([1, false, true]);
    const hand = s.players.P1!.hand.length;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: tech, targets: [card(bear)] }).state;
    expect(hasKeyword(s, s.cards[bear]!, 'DoubleStrike')).toBe(true);
    // It has a +1/+1 counter: the Technique left the hand and drew one.
    expect(s.players.P1!.hand.length).toBe(hand);
    const before = s.players.P1!.hand.length;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: dl }, { surveilToGraveyard: false }).state;
    expect(s.players.P1!.hand.length).toBe(before - 1 + 3);

    let t = newGame();
    const alph = put(t, 'P1', 'alpharael-dreaming-acolyte', 'hand');
    const art = put(t, 'P1', 'sol-ring', 'hand');
    t = goTo(t, 'main1');
    mana(t, 'P1', { U: 1, B: 1, C: 1 });
    const h = t.players.P1!.hand.length;
    t = act(t, { type: 'CastSpell', player: 'P1', card: alph });
    for (let i = 0; i < 10 && t.pending.kind !== 'chooseCards'; i++) t = act(t, getLegalActions(t).find((a) => a.type === 'PassPriority') ?? getLegalActions(t)[0]!);
    // Discarding the one artifact card is enough.
    t = cast(t, { type: 'ChooseCards', player: 'P1', cards: [art] }).state;
    expect(t.players.P1!.hand.length).toBe(h - 1 + 2 - 1);
    expect(hasKeyword(t, t.cards[alph]!, 'Deathtouch')).toBe(true);
  });

  it('creatures: Cloudsculpt Technician and Gravblade Heavy with an artifact, Harmonious Grovestrider, Exosuit Savior, Syr Vondam, Meltstrider’s Gear, Banishing Light', () => {
    let s = newGame();
    const tech = put(s, 'P1', 'cloudsculpt-technician');
    const heavy = put(s, 'P1', 'gravblade-heavy');
    const strider = put(s, 'P1', 'harmonious-grovestrider');
    const savior = put(s, 'P1', 'exosuit-savior', 'hand');
    const vondam = put(s, 'P1', 'syr-vondam-the-lucent', 'hand');
    const gear = put(s, 'P1', 'meltstriders-gear', 'hand');
    const light = put(s, 'P1', 'banishing-light', 'hand');
    const theirs = put(s, 'P2', 'thawbringer');
    for (let i = 0; i < 3; i++) put(s, 'P1', 'forest');
    expect([powerOf(s, s.cards[tech]!), powerOf(s, s.cards[heavy]!), hasKeyword(s, s.cards[heavy]!, 'Deathtouch')]).toEqual([base('cloudsculpt-technician'), base('gravblade-heavy'), false]);
    expect(powerOf(s, s.cards[strider]!)).toBe(3);
    s = goTo(s, 'main1');
    mana(s, 'P1', { W: 4, B: 2, G: 1, C: 8 });
    // Meltstrider's Gear (an artifact) enters and attaches itself.
    s = cast(s, { type: 'CastSpell', player: 'P1', card: gear }, pick(tech)).state;
    expect(s.cards[gear]!.attachedTo).toBe(tech);
    expect(powerOf(s, s.cards[tech]!)).toBe(base('cloudsculpt-technician') + 1 + 2);
    expect([powerOf(s, s.cards[heavy]!), hasKeyword(s, s.cards[heavy]!, 'Deathtouch')]).toEqual([base('gravblade-heavy') + 1, true]);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: vondam }).state;
    expect([powerOf(s, s.cards[heavy]!), powerOf(s, s.cards[vondam]!)]).toEqual([base('gravblade-heavy') + 2, base('syr-vondam-the-lucent')]);
    expect(hasKeyword(s, s.cards[strider]!, 'Deathtouch')).toBe(true);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: light }, pick(theirs)).state;
    expect(zone(s, theirs)).toBe('exile');
    // Exosuit Savior returns Banishing Light: the exiled creature comes back.
    s = cast(s, { type: 'CastSpell', player: 'P1', card: savior }, pick(light)).state;
    expect([zone(s, light), zone(s, theirs)]).toEqual(['hand', 'battlefield']);
  });

  it('triggers: Nanoform Sentinel, Swarm Culler, Comet Crawler, Hemosymbic Mite, Oreplate Pangolin', () => {
    let s = newGame();
    const sentinel = put(s, 'P1', 'nanoform-sentinel');
    const culler = put(s, 'P1', 'swarm-culler');
    const crawler = put(s, 'P1', 'comet-crawler');
    const mite = put(s, 'P1', 'hemosymbic-mite', 'battlefield', { counters: 2 });
    const pangolin = put(s, 'P1', 'oreplate-pangolin');
    const land = put(s, 'P1', 'forest', 'battlefield', { tapped: true });
    const f1 = put(s, 'P1', 'virus-beetle');
    const f2 = put(s, 'P1', 'virus-beetle');
    const ring = put(s, 'P1', 'sol-ring', 'hand');
    s = goTo(s, 'main1');
    mana(s, 'P1', { C: 2 });
    // An artifact enters: pay {1} for a counter on the Pangolin.
    s = cast(s, { type: 'CastSpell', player: 'P1', card: ring }, { accept: true }).state;
    expect(s.cards[pangolin]!.counters).toBe(1);
    s = goTo(s, 'declareAttackers');
    const hand = s.players.P1!.hand.length;
    s = act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [sentinel, culler, crawler, mite].map((attacker) => ({ attacker, defender: 'P2' })) });
    for (let i = 0; i < 60 && (s.stack.length > 0 || s.triggerQueue.length > 0 || s.pending.kind !== 'priority'); i++) {
      const p = s.pending;
      if (p.kind === 'chooseTargets') {
        const legal = getLegalActions(s).filter((x) => x.type === 'ChooseTargets');
        const want = s.triggerQueue[0]?.source === sentinel ? land : crawler;
        s = act(s, legal.find((x) => x.type === 'ChooseTargets' && x.targets[0]?.kind === 'card' && x.targets[0].card === want) ?? legal[0]!);
      } else if (p.kind === 'chooseCards') s = act(s, { type: 'ChooseCards', player: p.player, cards: [p.cards.includes(f1) ? f1 : f2] });
      else if (p.kind === 'priority') s = act(s, { type: 'PassPriority', player: p.player });
      else s = act(s, getLegalActions(s)[0]!);
      if (s.step !== 'declareAttackers') break;
    }
    expect(s.cards[land]!.tapped).toBe(false);
    expect([zone(s, f1), zone(s, f2)]).toEqual(['graveyard', 'graveyard']);
    expect(s.players.P1!.hand.length).toBe(hand + 1);
    // Comet Crawler: +2 for its sacrifice, +3 from the Mite (1 and two counters).
    expect(powerOf(s, s.cards[crawler]!)).toBe(base('comet-crawler') + 2 + base('hemosymbic-mite') + 2);
  });
});

describe('M7: conditions and counts', () => {
  const costs = (s: GameState, id: string, pool: Record<string, number>, extra: object = {}) => {
    s.players.P1!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool };
    return applyAction(s, { type: 'CastSpell', player: 'P1', card: id, ...extra } as never).ok;
  };

  it('cost reductions: Lashwhip Predator, Mental Modulation, Fungal Colossus, Dark Endurance', () => {
    let s = newGame();
    const whip = put(s, 'P1', 'lashwhip-predator', 'hand');
    const mod = put(s, 'P1', 'mental-modulation', 'hand');
    const colossus = put(s, 'P1', 'fungal-colossus', 'hand');
    const target = put(s, 'P2', 'thawbringer');
    s = goTo(s, 'main1');
    // Lashwhip {4}{G}{G}: {2} less with three opposing creatures.
    expect(costs(s, whip, { G: 2, C: 2 })).toBe(false);
    put(s, 'P2', 'virus-beetle');
    put(s, 'P2', 'virus-beetle');
    expect(costs(s, whip, { G: 2, C: 2 })).toBe(true);
    // Mental Modulation {1}{U}: {U} on your turn.
    expect(costs(s, mod, { U: 1 }, { targets: [card(target)] })).toBe(true);
    // Fungal Colossus {6}{G}: one less for each differently named land (two Forests count once).
    put(s, 'P1', 'forest');
    put(s, 'P1', 'forest');
    put(s, 'P1', 'mountain');
    expect(costs(s, colossus, { G: 1, C: 3 })).toBe(false);
    expect(costs(s, colossus, { G: 1, C: 4 })).toBe(true);
  });

  it('Dark Endurance costs {1} less on a blocking creature; Mental Modulation costs full on an opponent’s turn', () => {
    let s = newGame();
    const attacker = put(s, 'P1', 'thawbringer');
    const blocker = put(s, 'P2', 'icecave-crasher');
    const endure = put(s, 'P2', 'dark-endurance', 'hand');
    const mod = put(s, 'P2', 'mental-modulation', 'hand');
    s = goTo(s, 'declareAttackers');
    s = act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker, defender: 'P2' }] });
    for (let i = 0; i < 10 && s.pending.kind !== 'declareBlockers'; i++) s = act(s, getLegalActions(s).find((a) => a.type === 'PassPriority') ?? getLegalActions(s)[0]!);
    s = act(s, { type: 'DeclareBlockers', player: 'P2', blocks: [{ blocker, attacker }] });
    for (let i = 0; i < 6 && !(s.pending.kind === 'priority' && s.pending.player === 'P2'); i++) s = act(s, getLegalActions(s).find((a) => a.type === 'PassPriority') ?? getLegalActions(s)[0]!);
    const pay = (id: string, pool: Record<string, number>, t: string) => {
      s.players.P2!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool };
      return applyAction(s, { type: 'CastSpell', player: 'P2', card: id, targets: [card(t)] }).ok;
    };
    expect(pay(endure, { B: 1 }, attacker)).toBe(false);
    expect(pay(endure, { B: 1 }, blocker)).toBe(true);
    expect(pay(mod, { U: 1 }, attacker)).toBe(false);
    expect(pay(mod, { U: 1, C: 1 }, attacker)).toBe(true);
  });

  it('counts: Cosmogoyf, Emissary Escort, Luxknight Breacher, Space-Time Anomaly, All-Fates Scroll', () => {
    let s = newGame();
    const goyf = put(s, 'P1', 'cosmogoyf');
    const escort = put(s, 'P1', 'emissary-escort');
    const breacher = put(s, 'P1', 'luxknight-breacher', 'hand');
    const anomaly = put(s, 'P1', 'space-time-anomaly', 'hand');
    const scroll = put(s, 'P1', 'all-fates-scroll');
    put(s, 'P1', 'forest');
    put(s, 'P1', 'mountain');
    put(s, 'P1', 'honor', 'exile');
    put(s, 'P1', 'honor', 'exile');
    put(s, 'P2', 'honor', 'exile');
    expect([powerOf(s, s.cards[goyf]!), toughnessOf(s, s.cards[goyf]!)]).toEqual([2, 3]);
    // All-Fates Scroll (mana value 3) is the greatest among the Escort's other artifacts.
    expect(powerOf(s, s.cards[escort]!)).toBe(3);
    s = goTo(s, 'main1');
    mana(s, 'P1', { W: 2, U: 1, C: 12 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: breacher }).state;
    // Other creatures and artifacts: Cosmogoyf, the Escort, the Scroll.
    expect(s.cards[breacher]!.counters).toBe(3);
    s.players.P1!.life = 5;
    const lib = s.players.P2!.library.length;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: anomaly, targets: [{ kind: 'player', player: 'P2' }] }).state;
    expect(s.players.P2!.library.length).toBe(lib - 5);
    const hand = s.players.P1!.hand.length;
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: scroll, ability: 0 }).state;
    expect(s.players.P1!.hand.length).toBe(hand + 2);
  });

  it('Illvoi Infiltrator can’t be blocked after two spells; Station Monitor makes a Drone that blocks only flyers; Depressurize; Chrome Companion', () => {
    let s = newGame();
    const inf = put(s, 'P1', 'illvoi-infiltrator');
    put(s, 'P1', 'station-monitor');
    const comp = put(s, 'P1', 'chrome-companion');
    const h1 = put(s, 'P1', 'honor', 'hand');
    const dep = put(s, 'P1', 'depressurize', 'hand');
    const wall = put(s, 'P2', 'icecave-crasher');
    const weak = put(s, 'P2', 'thawbringer', 'battlefield', { counters: 0 });
    const buried = put(s, 'P2', 'honor', 'graveyard');
    s = goTo(s, 'main1');
    expect(canBlock(s, s.cards[wall]!, s.cards[inf]!)).toBe(true);
    mana(s, 'P1', { W: 1, B: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: h1, targets: [card(inf)] }).state;
    // Icecave Crasher has power 4: -3/-0 leaves 1 and it lives; nothing is destroyed.
    s = cast(s, { type: 'CastSpell', player: 'P1', card: dep, targets: [card(wall)] }).state;
    expect(zone(s, wall)).toBe('battlefield');
    expect(canBlock(s, s.cards[wall]!, s.cards[inf]!)).toBe(false);
    const drone = s.players.P1!.battlefield.find((id) => s.cards[id]!.defId === 'drone-token-eoe')!;
    expect(drone).toBeDefined();
    // The Drone can't block a ground creature, but can block a flyer.
    const flyer = put(s, 'P2', 'nebula-dragon');
    expect([canBlock(s, s.cards[drone]!, s.cards[weak]!), canBlock(s, s.cards[drone]!, s.cards[flyer]!)]).toEqual([false, true]);
    const life = s.players.P1!.life;
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: comp, ability: 0, targets: [card(buried)] }).state;
    expect(zone(s, buried)).toBe('library');
    expect(s.players.P2!.library.at(-1)).toBe(buried);
    expect(s.players.P1!.life).toBe(life + 1);
  });

  it('Depressurize destroys a creature whose power drops to 0 or less', () => {
    let s = newGame();
    const dep = put(s, 'P1', 'depressurize', 'hand');
    const small = put(s, 'P2', 'meltstrider-eulogist');
    s = goTo(s, 'main1');
    mana(s, 'P1', { B: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: dep, targets: [card(small)] }).state;
    expect(zone(s, small)).toBe('graveyard');
  });
});

describe('M8: more warp cards', () => {
  const pick = (id: string) => ({ targets: (o: { kind: string; card?: string }[][]) => o.find((t) => t[0]?.kind === 'card' && t[0].card === id)! }) as never;

  it('Haliya gains life as creatures and artifacts enter, and draws at end step after 3 or more life gained', () => {
    let s = newGame();
    put(s, 'P1', 'haliya-guided-by-light');
    const rings = [0, 1, 2].map(() => put(s, 'P1', 'sol-ring', 'hand'));
    s = goTo(s, 'main1');
    mana(s, 'P1', { C: 3 });
    const life = s.players.P1!.life;
    for (const r of rings.slice(0, 2)) s = cast(s, { type: 'CastSpell', player: 'P1', card: r }).state;
    expect(s.players.P1!.life).toBe(life + 2);
    // Two life gained: no card at the end step. With a third, one.
    const before = s.players.P1!.hand.length;
    let t = goTo(s, 'end');
    t = cast(t, { type: 'PassPriority', player: 'P1' }).state;
    expect(t.players.P1!.hand.length).toBe(before);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: rings[2]! }).state;
    const hand = s.players.P1!.hand.length;
    s = goTo(s, 'end');
    s = cast(s, { type: 'PassPriority', player: 'P1' }).state;
    expect(s.players.P1!.hand.length).toBe(hand + 1);
  });

  it('Starfield Shepherd finds a basic Plains or a cheap creature; Quantum Riddler draws one more with an empty hand', () => {
    let s = newGame();
    const shepherd = put(s, 'P1', 'starfield-shepherd', 'hand');
    const plains = put(s, 'P1', 'plains', 'library');
    const cheap = put(s, 'P1', 'edge-rover', 'library');
    const dear = put(s, 'P1', 'nebula-dragon', 'library');
    s = goTo(s, 'main1');
    mana(s, 'P1', { W: 1, C: 1 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: shepherd, alternative: true });
    for (let i = 0; i < 10 && s.pending.kind !== 'chooseCards'; i++) s = act(s, getLegalActions(s).find((a) => a.type === 'PassPriority') ?? getLegalActions(s)[0]!);
    const offered = s.pending.kind === 'chooseCards' ? s.pending.cards : [];
    expect([offered.includes(plains), offered.includes(cheap), offered.includes(dear)]).toEqual([true, true, false]);

    let t = newGame();
    const riddler = put(t, 'P1', 'quantum-riddler', 'hand');
    t = goTo(t, 'main1');
    for (const id of t.players.P1!.hand.filter((x) => x !== riddler)) moveCard({ s: t, ev: [] }, id, 'exile');
    mana(t, 'P1', { U: 2, C: 3 });
    t = cast(t, { type: 'CastSpell', player: 'P1', card: riddler }).state;
    // Its own enter trigger draws with an empty hand: two cards.
    expect(t.players.P1!.hand.length).toBe(2);
  });

  it('Exalted Sunborn doubles tokens; Loading Zone doubles counters; Mightform Harmonizer doubles power', () => {
    let s = newGame();
    put(s, 'P1', 'exalted-sunborn');
    put(s, 'P1', 'loading-zone');
    put(s, 'P1', 'mightform-harmonizer');
    const knight = put(s, 'P1', 'knight-luminary', 'hand');
    const honor = put(s, 'P1', 'honor', 'hand');
    const land = put(s, 'P1', 'forest', 'hand');
    const ship = put(s, 'P1', 'wurmwall-sweeper');
    const crew = put(s, 'P1', 'meltstrider-eulogist');
    s = goTo(s, 'main1');
    mana(s, 'P1', { W: 3, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: knight }).state;
    expect(s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'human-soldier-token-eoe')).toHaveLength(2);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: honor, targets: [card(knight)] }).state;
    expect(s.cards[knight]!.counters).toBe(2);
    // Station with a 3-power creature: six charge counters.
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: ship, ability: 0, costCards: [crew] }).state;
    expect(s.cards[ship]!.namedCounters?.charge).toBe(6);
    const p = powerOf(s, s.cards[knight]!);
    s = cast(s, { type: 'PlayLand', player: 'P1', card: land }, pick(knight)).state;
    expect(powerOf(s, s.cards[knight]!)).toBe(p * 2);
  });

  it('Broodguard Elite: X counters (warp for {X}{G} too), passed on when it leaves; Perigee Beckoner’s gift returns a creature that dies', () => {
    let s = newGame();
    const elite = put(s, 'P1', 'broodguard-elite', 'hand');
    const heir = put(s, 'P1', 'virus-beetle');
    const beckoner = put(s, 'P1', 'perigee-beckoner', 'hand');
    s = goTo(s, 'main1');
    mana(s, 'P1', { G: 1, B: 1, C: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: elite, alternative: true, x: 3 }).state;
    expect(s.cards[elite]!.counters).toBe(3);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: beckoner, alternative: true }, pick(heir)).state;
    s.cards[heir]!.damage = 9;
    s = cast(s, { type: 'PassPriority', player: 'P1' }).state;
    expect([zone(s, heir), s.cards[heir]!.tapped]).toEqual(['battlefield', true]);
    // End step: the warped Elite is exiled and its counters go to a creature you control.
    s = goTo(s, 'end', pick(heir));
    s = cast(s, { type: 'PassPriority', player: 'P1' }, pick(heir)).state;
    expect(zone(s, elite)).toBe('exile');
    expect(s.cards[heir]!.counters).toBe(3);
  });

  it('Possibility Technician’s exiled card stays playable while you control a Kavu; Timeline Culler warps from the graveyard for {B} and 2 life', () => {
    let s = newGame();
    const tech = put(s, 'P1', 'possibility-technician', 'hand');
    const other = put(s, 'P1', 'molecular-modifier');
    s = goTo(s, 'main1');
    const top = s.players.P1!.library[0]!;
    mana(s, 'P1', { R: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: tech, alternative: true }).state;
    expect(zone(s, top)).toBe('exile');
    const playable = (st: GameState) => getLegalActions(st).some((a) => (a.type === 'PlayLand' || a.type === 'CastSpell') && a.card === top);
    expect(playable(s)).toBe(true);
    // The Technician is warped away, but another Kavu (Molecular Modifier) keeps the card playable; with none, it isn't.
    moveCard({ s, ev: [] }, tech, 'exile');
    expect(playable(s)).toBe(true);
    moveCard({ s, ev: [] }, other, 'graveyard');
    expect(playable(s)).toBe(false);

    let t = newGame();
    const culler = put(t, 'P1', 'timeline-culler', 'graveyard');
    t = goTo(t, 'main1');
    mana(t, 'P1', { B: 1 });
    const life = t.players.P1!.life;
    expect(rejected(t, { type: 'CastSpell', player: 'P1', card: culler })).toBeTruthy();
    t = cast(t, { type: 'CastSpell', player: 'P1', card: culler, alternative: true }).state;
    expect([zone(t, culler), t.players.P1!.life]).toEqual(['battlefield', life - 2]);
    t = goTo(t, 'end');
    expect(zone(t, culler)).toBe('exile');
  });

  it('Starwinder: draw cards equal to the combat damage a creature of yours deals to a player', () => {
    let s = newGame();
    put(s, 'P1', 'starwinder');
    const hitter = put(s, 'P1', 'meltstrider-eulogist');
    s = goTo(s, 'declareAttackers');
    const hand = s.players.P1!.hand.length;
    s = act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: hitter, defender: 'P2' }] });
    for (let i = 0; i < 40 && s.step !== 'main2'; i++) {
      const p = s.pending;
      if (p.kind === 'decide') s = act(s, { type: 'Decide', player: p.player, accept: true });
      else if (p.kind === 'declareBlockers') s = act(s, { type: 'DeclareBlockers', player: p.player, blocks: [] });
      else s = act(s, getLegalActions(s).find((a) => a.type === 'PassPriority') ?? getLegalActions(s)[0]!);
    }
    expect(s.players.P1!.hand.length).toBe(hand + 3);
  });
});

// Group M9: Lander cards, void and warp leftovers.
describe('M9: Landers, void and warp', () => {
  const landers = (s: GameState, pid = 'P1') => s.players[pid]!.battlefield.filter((id) => s.cards[id]!.defId === 'lander-token-eoe');
  const passUntilChoice = (s: GameState) => {
    for (let i = 0; i < 8 && s.pending.kind === 'priority'; i++) s = act(s, { type: 'PassPriority', player: s.pending.player });
    return s;
  };

  it('Kav Landseeker’s Lander is sacrificed at the end step of your next turn, not this one', () => {
    let s = newGame();
    const kav = put(s, 'P1', 'kav-landseeker', 'hand');
    s = goTo(s, 'main1');
    mana(s, 'P1', { R: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: kav }).state;
    expect(landers(s)).toHaveLength(1);
    s = goTo(s, 'end');
    expect(landers(s)).toHaveLength(1);
    s = goTo(goTo(s, 'main1'), 'end');
    expect([s.activePlayer, landers(s).length]).toEqual(['P2', 1]);
    s = goTo(goTo(s, 'main1'), 'end');
    expect([s.activePlayer, landers(s).length]).toEqual(['P1', 0]);
  });

  it('Sunstar Expansionist makes a Lander only if an opponent has more lands, and gets +1/+0 on landfall', () => {
    let s = newGame();
    const sunstar = put(s, 'P1', 'sunstar-expansionist', 'hand');
    const land = put(s, 'P1', 'plains', 'hand');
    put(s, 'P2', 'forest');
    s = goTo(s, 'main1');
    mana(s, 'P1', { W: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: sunstar }).state;
    expect(landers(s)).toHaveLength(1);
    s = cast(s, { type: 'PlayLand', player: 'P1', card: land }).state;
    expect(powerOf(s, s.cards[sunstar]!)).toBe(3);

    let t = newGame();
    const other = put(t, 'P1', 'sunstar-expansionist', 'hand');
    put(t, 'P1', 'plains');
    put(t, 'P2', 'forest');
    t = goTo(t, 'main1');
    mana(t, 'P1', { W: 1, C: 1 });
    t = cast(t, { type: 'CastSpell', player: 'P1', card: other }).state;
    expect(landers(t)).toHaveLength(0);
  });

  it('Bioengineered Future: a Lander, and creatures enter with a counter for each land that entered this turn', () => {
    let s = newGame();
    const future = put(s, 'P1', 'bioengineered-future', 'hand');
    const land = put(s, 'P1', 'forest', 'hand');
    const bear = put(s, 'P1', 'meltstrider-eulogist', 'hand');
    s = goTo(s, 'main1');
    mana(s, 'P1', { G: 3, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: future }).state;
    expect(landers(s)).toHaveLength(1);
    s = cast(s, { type: 'PlayLand', player: 'P1', card: land }).state;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: bear }).state;
    expect(s.cards[bear]!.counters).toBe(1);
  });

  it('Lithobraking: a Lander, then sacrificing an artifact deals 2 damage to each creature', () => {
    let s = newGame();
    const litho = put(s, 'P1', 'lithobraking', 'hand');
    const ring = put(s, 'P1', 'sol-ring');
    const mine = put(s, 'P1', 'thawbringer');
    const theirs = put(s, 'P2', 'meltstrider-eulogist');
    s = goTo(s, 'main1');
    mana(s, 'P1', { R: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: litho }).state;
    expect(s.pending).toMatchObject({ kind: 'chooseCards', purpose: 'sacrifice' });
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [ring] })).state;
    expect([zone(s, ring), zone(s, mine), s.cards[theirs]!.damage, landers(s).length]).toEqual(['graveyard', 'graveyard', 2, 1]);
  });

  it('Orbital Plunge makes a Lander only when the 6 damage is more than lethal', () => {
    let s = newGame();
    const plunge = put(s, 'P1', 'orbital-plunge', 'hand');
    const small = put(s, 'P2', 'icecave-crasher');
    s = goTo(s, 'main1');
    mana(s, 'P1', { R: 1, C: 3 });
    let t = cast(s, { type: 'CastSpell', player: 'P1', card: plunge, targets: [card(small)] }).state;
    expect([zone(t, small), landers(t).length]).toEqual(['graveyard', 1]);
    const big = put(s, 'P2', 'quantum-riddler');
    t = cast(s, { type: 'CastSpell', player: 'P1', card: plunge, targets: [card(big)] }).state;
    expect([zone(t, big), landers(t).length]).toEqual(['graveyard', 0]);
  });

  it('Divert Disaster: if the caster pays {2}, the spell resolves and you get a Lander; otherwise it’s countered', () => {
    let s = newGame();
    const ring = put(s, 'P1', 'sol-ring', 'hand');
    const divert = put(s, 'P2', 'divert-disaster', 'hand');
    s = goTo(s, 'main1');
    mana(s, 'P1', { C: 3 });
    mana(s, 'P2', { U: 1, C: 1 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: ring });
    s = act(s, { type: 'PassPriority', player: 'P1' });
    s = act(s, { type: 'CastSpell', player: 'P2', card: divert, targets: [card(ring)] });
    s = passUntilChoice(s);
    expect(s.pending).toMatchObject({ kind: 'chooseCards', purpose: 'payToAvoidCounter', player: 'P1', payGeneric: 2 });
    let t = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [ring] })).state;
    t = passUntilChoice(t);
    t = settle(t).state;
    expect([zone(t, ring), landers(t, 'P2').length]).toEqual(['battlefield', 1]);
    t = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [] })).state;
    expect([zone(t, ring), landers(t, 'P2').length]).toEqual(['graveyard', 0]);
  });

  it('Anticausal Vestige: leaving draws, then puts a permanent card with mana value up to your lands onto the battlefield tapped', () => {
    let s = newGame();
    const vestige = put(s, 'P1', 'anticausal-vestige', 'hand');
    put(s, 'P1', 'forest');
    put(s, 'P1', 'forest');
    const ring = put(s, 'P1', 'sol-ring', 'hand');
    const riddler = put(s, 'P1', 'quantum-riddler', 'hand');
    s = goTo(s, 'main1');
    mana(s, 'P1', { C: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: vestige, alternative: true }).state;
    expect(zone(s, vestige)).toBe('battlefield');
    const hand = s.players.P1!.hand.length;
    s = goTo(s, 'end');
    s = settle(s).state;
    expect(s.pending).toMatchObject({ kind: 'chooseCards', purpose: 'battlefield' });
    const offered = (s.pending as { cards: string[] }).cards;
    expect(s.players.P1!.hand.length).toBe(hand + 1);
    expect(offered).toContain(ring);
    expect(offered).not.toContain(riddler);
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [ring] })).state;
    expect([zone(s, vestige), zone(s, ring), s.cards[ring]!.tapped]).toEqual(['exile', 'battlefield', true]);
  });

  it('Alpharael: ward makes an opponent discard at random; with void, its attack halves the defender’s life, rounded up', () => {
    let s = newGame();
    const alpha = put(s, 'P1', 'alpharael-stonechosen');
    const bolt = put(s, 'P2', 'invasive-maneuvers', 'hand');
    s = goTo(s, 'main1');
    s = act(s, { type: 'PassPriority', player: 'P1' });
    mana(s, 'P2', { R: 1, C: 1 });
    s.players.P2!.hand = [bolt];
    expect(rejected(s, { type: 'CastSpell', player: 'P2', card: bolt, targets: [card(alpha)] })).toMatch(/discard/);
    const spare = put(s, 'P2', 'plasma-bolt', 'hand');
    const t = act(s, { type: 'CastSpell', player: 'P2', card: bolt, targets: [card(alpha)] });
    expect([zone(t, spare), t.players.P2!.hand.length]).toEqual(['graveyard', 0]);

    // No void yet: the attack does nothing; then void, and 15 life loses 8.
    let u = newGame();
    const alpha2 = put(u, 'P1', 'alpharael-stonechosen');
    u = goTo(u, 'declareAttackers');
    u.players.P2!.life = 15;
    let a = settle(act(u, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: alpha2, defender: 'P2' }] })).state;
    expect(a.players.P2!.life).toBe(15);
    const gone = put(u, 'P2', 'meltstrider-eulogist');
    moveCard({ s: u, ev: [] }, gone, 'graveyard');
    a = settle(act(u, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: alpha2, defender: 'P2' }] })).state;
    expect(a.players.P2!.life).toBe(7);
  });

  it('Roving Actuator: with void, exiles a cheap instant or sorcery from your graveyard to cast free right away', () => {
    let s = newGame();
    const actuator = put(s, 'P1', 'roving-actuator', 'hand');
    const bolt = put(s, 'P1', 'plasma-bolt', 'graveyard');
    const gone = put(s, 'P1', 'meltstrider-eulogist');
    s = goTo(s, 'main1');
    moveCard({ s, ev: [] }, gone, 'graveyard');
    mana(s, 'P1', { R: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: actuator }).state;
    expect(zone(s, bolt)).toBe('exile');
    const castBolt = getLegalActions(s).find((a) => a.type === 'CastSpell' && a.card === bolt);
    expect(castBolt).toBeTruthy();
    const life = s.players.P2!.life;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: bolt, targets: [{ kind: 'player', player: 'P2' }] }).state;
    s = settle(passUntilChoice(s)).state;
    expect(s.players.P2!.life).toBe(life - 3);
    expect(zone(s, bolt)).toBe('exile');
  });
});

// Group M10: hybrid mana, Equipment and more creatures and spells.
describe('M10: hybrid mana, Equipment, creatures and spells', () => {
  const pick = (id: string) => ({ targets: (o: { kind: string; card?: string }[][]) => o.find((t) => t[0]?.kind === 'card' && t[0].card === id)! }) as never;
  const tokens = (s: GameState, defId: string, pid = 'P1') => s.players[pid]!.battlefield.filter((id) => s.cards[id]!.defId === defId);

  it('Pinnacle Emissary warps for {U/R} (blue or red) and makes a Drone for each artifact spell', () => {
    let s = newGame();
    const emissary = put(s, 'P1', 'pinnacle-emissary', 'hand');
    const ring = put(s, 'P1', 'sol-ring', 'hand');
    s = goTo(s, 'main1');
    mana(s, 'P1', { G: 1 });
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: emissary, alternative: true })).toBeTruthy();
    mana(s, 'P1', { R: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: emissary, alternative: true }).state;
    expect(zone(s, emissary)).toBe('battlefield');
    s = cast(s, { type: 'CastSpell', player: 'P1', card: ring }).state;
    expect(tokens(s, 'drone-token-eoe')).toHaveLength(1);
    let t = newGame();
    const other = put(t, 'P1', 'pinnacle-emissary', 'hand');
    t = goTo(t, 'main1');
    mana(t, 'P1', { U: 1 });
    t = cast(t, { type: 'CastSpell', player: 'P1', card: other, alternative: true }).state;
    expect(zone(t, other)).toBe('battlefield');
  });

  it('Auxiliary Boosters makes a Robot wearing it (+1/+2, flying); Squire’s Lightblade attaches and grants first strike', () => {
    let s = newGame();
    const boosters = put(s, 'P1', 'auxiliary-boosters', 'hand');
    const blade = put(s, 'P1', 'squires-lightblade', 'hand');
    const bear = put(s, 'P1', 'meltstrider-eulogist');
    s = goTo(s, 'main1');
    mana(s, 'P1', { W: 2, C: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: boosters }).state;
    const robot = tokens(s, 'robot-token-eoe')[0]!;
    expect([s.cards[boosters]!.attachedTo, powerOf(s, s.cards[robot]!), toughnessOf(s, s.cards[robot]!), hasKeyword(s, s.cards[robot]!, 'Flying')]).toEqual([robot, 3, 4, true]);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: blade }, pick(bear)).state;
    expect([s.cards[blade]!.attachedTo, powerOf(s, s.cards[bear]!), hasKeyword(s, s.cards[bear]!, 'FirstStrike')]).toEqual([bear, 4, true]);
  });

  it('Seam Rip exiles a cheap opponent permanent until it leaves; Nutrient Block draws when it goes to the graveyard', () => {
    let s = newGame();
    const rip = put(s, 'P1', 'seam-rip', 'hand');
    const ring = put(s, 'P2', 'sol-ring');
    const block = put(s, 'P1', 'nutrient-block');
    s = goTo(s, 'main1');
    mana(s, 'P1', { W: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: rip }, pick(ring)).state;
    expect(zone(s, ring)).toBe('exile');
    const hand = s.players.P1!.hand.length;
    const life = s.players.P1!.life;
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: block, ability: 0 }).state;
    expect([zone(s, block), s.players.P1!.life, s.players.P1!.hand.length]).toEqual(['graveyard', life + 3, hand + 1]);
  });

  it('Cryogen Relic draws on entering and leaving; Dubious Delicacy shrinks a creature on entering', () => {
    let s = newGame();
    const relic = put(s, 'P1', 'cryogen-relic', 'hand');
    const delicacy = put(s, 'P1', 'dubious-delicacy', 'hand');
    const foe = put(s, 'P2', 'meltstrider-eulogist');
    s = goTo(s, 'main1');
    mana(s, 'P1', { U: 2, B: 1, C: 4 });
    const hand = s.players.P1!.hand.length;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: relic }).state;
    expect(s.players.P1!.hand.length).toBe(hand);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: delicacy }, pick(foe)).state;
    expect(zone(s, foe)).toBe('graveyard');
    const tapped = put(s, 'P2', 'meltstrider-eulogist', 'battlefield', { tapped: true });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: relic, ability: 0, targets: [card(tapped)] }).state;
    expect([zone(s, relic), s.cards[tapped]!.namedCounters?.stun, s.players.P1!.hand.length]).toEqual(['graveyard', 1, hand]);
  });

  it('Diplomatic Relations: +1/+0 and vigilance, then it deals damage equal to its power; Full Bore adds trample and haste only to a warped creature', () => {
    let s = newGame();
    const relations = put(s, 'P1', 'diplomatic-relations', 'hand');
    const mine = put(s, 'P1', 'meltstrider-eulogist');
    const foe = put(s, 'P2', 'icecave-crasher');
    s = goTo(s, 'main1');
    mana(s, 'P1', { G: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: relations, targets: [card(mine), card(foe)] }).state;
    expect([zone(s, foe), hasKeyword(s, s.cards[mine]!, 'Vigilance'), s.cards[mine]!.damage]).toEqual(['graveyard', true, 0]);

    let t = newGame();
    const bore = put(t, 'P1', 'full-bore', 'hand');
    const bore2 = put(t, 'P1', 'full-bore', 'hand');
    const warper = put(t, 'P1', 'rayblade-trooper', 'hand');
    const plain = put(t, 'P1', 'meltstrider-eulogist');
    t = goTo(t, 'main1');
    mana(t, 'P1', { R: 2, W: 1, C: 1 });
    t = cast(t, { type: 'CastSpell', player: 'P1', card: warper, alternative: true }, pick(plain)).state;
    t = cast(t, { type: 'CastSpell', player: 'P1', card: bore, targets: [card(warper)] }).state;
    t = cast(t, { type: 'CastSpell', player: 'P1', card: bore2, targets: [card(plain)] }).state;
    expect([hasKeyword(t, t.cards[warper]!, 'Haste'), hasKeyword(t, t.cards[warper]!, 'Trample'), hasKeyword(t, t.cards[plain]!, 'Trample'), powerOf(t, t.cards[plain]!)]).toEqual([true, true, false, 7]);
  });

  it('Ouroboroid puts X counters on each creature at combat; Tannuk, Memorial Ensign pings and draws on the second landfall', () => {
    let s = newGame();
    const ouro = put(s, 'P1', 'ouroboroid');
    const bear = put(s, 'P1', 'meltstrider-eulogist');
    const tannuk = put(s, 'P1', 'tannuk-memorial-ensign');
    const lands = [put(s, 'P1', 'forest', 'hand'), put(s, 'P1', 'mountain', 'hand')];
    s = goTo(s, 'main1');
    const life = s.players.P2!.life;
    const hand = s.players.P1!.hand.length;
    s = cast(s, { type: 'PlayLand', player: 'P1', card: lands[0]! }).state;
    expect([s.players.P2!.life, s.players.P1!.hand.length]).toEqual([life - 1, hand - 1]);
    // A second land this turn: the ability's second resolution draws.
    s.players.P1!.landsPlayedThisTurn = 0;
    s = cast(s, { type: 'PlayLand', player: 'P1', card: lands[1]! }).state;
    expect([s.players.P2!.life, s.players.P1!.hand.length]).toEqual([life - 2, hand - 1]);
    s = goTo(s, 'beginCombat');
    s = settle(s).state;
    expect([s.cards[ouro]!.counters, s.cards[bear]!.counters, s.cards[tannuk]!.counters]).toEqual([1, 1, 1]);
  });

  it('Mouth of the Storm: opponents’ creatures get -3/-0 until your next turn; Selfcraft Mechan sacrifices an artifact to grow and draw', () => {
    let s = newGame();
    const mouth = put(s, 'P1', 'mouth-of-the-storm', 'hand');
    const foe = put(s, 'P2', 'icecave-crasher');
    s = goTo(s, 'main1');
    mana(s, 'P1', { U: 1, C: 6 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: mouth }).state;
    expect(powerOf(s, s.cards[foe]!)).toBe(1);
    s = goTo(goTo(goTo(s, 'end'), 'main1'), 'end');
    expect([s.activePlayer, powerOf(s, s.cards[foe]!)]).toEqual(['P2', 1]);
    s = goTo(s, 'upkeep');
    expect(powerOf(s, s.cards[foe]!)).toBe(4);

    let t = newGame();
    const mechan = put(t, 'P1', 'selfcraft-mechan', 'hand');
    const ring = put(t, 'P1', 'sol-ring');
    const bear = put(t, 'P1', 'meltstrider-eulogist');
    t = goTo(t, 'main1');
    mana(t, 'P1', { U: 1, C: 3 });
    const hand = t.players.P1!.hand.length;
    t = cast(t, { type: 'CastSpell', player: 'P1', card: mechan }, pick(bear)).state;
    expect(t.pending).toMatchObject({ kind: 'chooseCards', purpose: 'sacrifice' });
    t = settle(act(t, { type: 'ChooseCards', player: 'P1', cards: [ring] }), pick(bear)).state;
    expect([zone(t, ring), t.cards[bear]!.counters, t.players.P1!.hand.length]).toEqual(['graveyard', 1, hand]);
  });

  it('Archenemy’s Charm returns two creature cards; Zealous Display untaps only on an opponent’s turn; Scour for Scrap can do both', () => {
    let s = newGame();
    const charm = put(s, 'P1', 'archenemys-charm', 'hand');
    const a = put(s, 'P1', 'meltstrider-eulogist', 'graveyard');
    const b = put(s, 'P1', 'thawbringer', 'graveyard');
    s = goTo(s, 'main1');
    mana(s, 'P1', { B: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: charm, mode: 1, targets: [card(a), card(b)] } as never).state;
    expect([zone(s, a), zone(s, b)]).toEqual(['hand', 'hand']);

    let t = newGame();
    const display = put(t, 'P1', 'zealous-display', 'hand');
    const bear = put(t, 'P1', 'meltstrider-eulogist', 'battlefield', { tapped: true });
    t = goTo(t, 'main1');
    mana(t, 'P1', { W: 1, C: 2 });
    t = cast(t, { type: 'CastSpell', player: 'P1', card: display }).state;
    expect([powerOf(t, t.cards[bear]!), t.cards[bear]!.tapped]).toEqual([5, true]);

    let u = newGame();
    const scour = put(u, 'P1', 'scour-for-scrap', 'hand');
    const yard = put(u, 'P1', 'sol-ring', 'graveyard');
    put(u, 'P1', 'sol-ring', 'library');
    u = goTo(u, 'main1');
    mana(u, 'P1', { U: 1, C: 3 });
    const hand = u.players.P1!.hand.length;
    u = cast(u, { type: 'CastSpell', player: 'P1', card: scour, modes: [0, 1], targets: [card(yard)] } as never).state;
    expect([zone(u, yard), u.players.P1!.hand.length]).toEqual(['hand', hand + 1]);
  });

  it('Virulent Silencer: nontoken artifact creatures give two poison counters; Dawnstrike Vanguard grows the others with two tapped creatures', () => {
    let s = newGame();
    put(s, 'P1', 'virulent-silencer');
    const bot = put(s, 'P1', 'roving-actuator');
    const vanguard = put(s, 'P1', 'dawnstrike-vanguard');
    s = goTo(s, 'declareAttackers');
    s = act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: bot, defender: 'P2' }, { attacker: vanguard, defender: 'P2' }] });
    for (let i = 0; i < 60 && s.step !== 'end'; i++) {
      const p = s.pending;
      if (p.kind === 'declareBlockers') s = act(s, { type: 'DeclareBlockers', player: p.player, blocks: [] });
      else if (p.kind === 'declareAttackers') s = act(s, { type: 'DeclareAttackers', player: p.player, attacks: [] });
      else {
        s = settle(s).state;
        if (s.pending.kind === 'priority') s = act(s, { type: 'PassPriority', player: s.pending.player });
      }
    }
    s = settle(s).state;
    expect(s.players.P2!.poison).toBe(2);
    expect([s.cards[bot]!.counters, s.cards[vanguard]!.counters ?? 0]).toEqual([1, 0]);
  });
});

// Group M11: activated cost reductions, end-of-combat Robots and more spells.
describe('M11: cost reductions, combat Robots and spells', () => {
  const pick = (id: string) => ({ targets: (o: { kind: string; card?: string }[][]) => o.find((t) => t[0]?.kind === 'card' && t[0].card === id)! }) as never;
  const robots = (s: GameState) => s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'robot-token-eoe');
  const passTo = (s: GameState, step: string) => {
    for (let i = 0; i < 60 && s.step !== step; i++) {
      const p = s.pending;
      if (p.kind === 'declareBlockers') s = act(s, { type: 'DeclareBlockers', player: p.player, blocks: [] });
      else if (p.kind === 'priority') s = act(s, { type: 'PassPriority', player: p.player });
      else s = settle(s).state;
    }
    return s;
  };

  it('Kavaron Harrier: pay {2} as it attacks for a tapped, attacking Robot that’s sacrificed at end of combat', () => {
    let s = newGame();
    const harrier = put(s, 'P1', 'kavaron-harrier');
    s = goTo(s, 'declareAttackers');
    mana(s, 'P1', { C: 2 });
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: harrier, defender: 'P2' }] }), { accept: true }).state;
    const [robot] = robots(s);
    expect(robot).toBeTruthy();
    expect(s.combat?.attacks.some((a) => a.attacker === robot && a.defender === 'P2')).toBe(true);
    const life = s.players.P2!.life;
    s = passTo(s, 'endCombat');
    expect([s.players.P2!.life, zone(s, robot!)]).toEqual([life - 4, 'void']);
  });

  it('Cut Propulsion: a creature deals damage to itself equal to its power, twice that with flying', () => {
    let s = newGame();
    const cut = put(s, 'P1', 'cut-propulsion', 'hand');
    const flier = put(s, 'P2', 'quantum-riddler');
    const ground = put(s, 'P2', 'icecave-crasher');
    s = goTo(s, 'main1');
    mana(s, 'P1', { R: 1, C: 2 });
    let t = cast(s, { type: 'CastSpell', player: 'P1', card: cut, targets: [card(flier)] }).state;
    expect(zone(t, flier)).toBe('graveyard');
    t = cast(s, { type: 'CastSpell', player: 'P1', card: cut, targets: [card(ground)] }).state;
    expect(zone(t, ground)).toBe('graveyard');
    const tough = put(s, 'P2', 'meltstrider-eulogist');
    s.cards[tough]!.counters = 0;
    t = cast(s, { type: 'CastSpell', player: 'P1', card: cut, targets: [card(tough)] }).state;
    expect(zone(t, tough)).toBe('graveyard');
  });

  it('Faller’s Faithful: the destroyed creature’s controller draws two only if it wasn’t dealt damage this turn', () => {
    let s = newGame();
    const faithful = put(s, 'P1', 'fallers-faithful', 'hand');
    const foe = put(s, 'P2', 'icecave-crasher');
    s = goTo(s, 'main1');
    mana(s, 'P1', { B: 1, C: 2 });
    const hand = s.players.P2!.hand.length;
    let t = cast(s, { type: 'CastSpell', player: 'P1', card: faithful }, pick(foe)).state;
    expect([zone(t, foe), t.players.P2!.hand.length]).toEqual(['graveyard', hand + 2]);
    s.cards[foe]!.damage = 1;
    s.cards[foe]!.damagedTurn = s.turnNumber;
    t = cast(s, { type: 'CastSpell', player: 'P1', card: faithful }, pick(foe)).state;
    expect([zone(t, foe), t.players.P2!.hand.length]).toEqual(['graveyard', hand]);
  });

  it('Desculpting Blast bounces, with a Drone if it was attacking; Singularity Rupture destroys creatures and mills half', () => {
    let s = newGame();
    const blast = put(s, 'P2', 'desculpting-blast', 'hand');
    const attacker = put(s, 'P1', 'icecave-crasher');
    s = goTo(s, 'declareAttackers');
    s = act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker, defender: 'P2' }] });
    s = settle(s).state;
    mana(s, 'P2', { U: 1, C: 1 });
    s = act(s, { type: 'PassPriority', player: 'P1' });
    s = cast(s, { type: 'CastSpell', player: 'P2', card: blast, targets: [card(attacker)] }).state;
    s = settle(passTo(s, 'declareBlockers')).state;
    expect(zone(s, attacker)).toBe('hand');
    expect(s.players.P2!.battlefield.filter((id) => s.cards[id]!.defId === 'drone-token-eoe')).toHaveLength(1);

    let u = newGame();
    const rupture = put(u, 'P1', 'singularity-rupture', 'hand');
    const a = put(u, 'P1', 'meltstrider-eulogist');
    const b = put(u, 'P2', 'icecave-crasher');
    u = goTo(u, 'main1');
    mana(u, 'P1', { U: 1, B: 2, C: 3 });
    const lib = u.players.P2!.library.length;
    u = cast(u, { type: 'CastSpell', player: 'P1', card: rupture, targets: [{ kind: 'player', player: 'P2' }, { kind: 'none' }, { kind: 'none' }, { kind: 'none' }] }).state;
    expect([zone(u, a), zone(u, b), u.players.P2!.library.length]).toEqual(['graveyard', 'graveyard', lib - Math.floor(lib / 2)]);
  });

  it('Starport Security costs {2} less with a countered creature; Thaumaton Torpedo {3} less after a Spacecraft attacks; Survey Mechan less per differently named land', () => {
    let s = newGame();
    const sec = put(s, 'P1', 'starport-security');
    const foe = put(s, 'P2', 'icecave-crasher');
    s = goTo(s, 'main1');
    mana(s, 'P1', { W: 1, C: 1 });
    expect(rejected(s, { type: 'ActivateAbility', player: 'P1', card: sec, ability: 0, targets: [card(foe)] })).toBeTruthy();
    put(s, 'P1', 'meltstrider-eulogist', 'battlefield', { counters: 1 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: sec, ability: 0, targets: [card(foe)] }).state;
    expect(s.cards[foe]!.tapped).toBe(true);

    let t = newGame();
    const torpedo = put(t, 'P1', 'thaumaton-torpedo');
    const target = put(t, 'P2', 'sol-ring');
    t = goTo(t, 'main1');
    mana(t, 'P1', { C: 3 });
    expect(rejected(t, { type: 'ActivateAbility', player: 'P1', card: torpedo, ability: 0, targets: [card(target)] })).toBeTruthy();
    t.players.P1!.spacecraftAttackedTurn = t.turnNumber;
    t = cast(t, { type: 'ActivateAbility', player: 'P1', card: torpedo, ability: 0, targets: [card(target)] }).state;
    expect(zone(t, target)).toBe('graveyard');

    let u = newGame();
    const mechan = put(u, 'P1', 'survey-mechan');
    for (const land of ['plains', 'island', 'swamp', 'mountain']) put(u, 'P1', land);
    u = goTo(u, 'main1');
    mana(u, 'P1', { C: 6 });
    const life = u.players.P2!.life;
    const hand = u.players.P1!.hand.length;
    u = cast(u, { type: 'ActivateAbility', player: 'P1', card: mechan, ability: 0, targets: [{ kind: 'player', player: 'P2' }, { kind: 'player', player: 'P1' }] }).state;
    expect([u.players.P2!.life, u.players.P1!.hand.length, u.players.P1!.life, zone(u, mechan)]).toEqual([life - 3, hand + 3, 23, 'graveyard']);
  });

  it('Sunstar Chaplain: remove a counter to tap; Genemorph Imago’s landfall sets base 3/3; Monoist Circuit-Feeder trades power for toughness', () => {
    let s = newGame();
    const chaplain = put(s, 'P1', 'sunstar-chaplain');
    const grown = put(s, 'P1', 'meltstrider-eulogist', 'battlefield', { counters: 1 });
    const foe = put(s, 'P2', 'icecave-crasher');
    s = goTo(s, 'main1');
    mana(s, 'P1', { C: 2 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: chaplain, ability: 0, targets: [card(foe)], costCards: [grown] }).state;
    expect([s.cards[foe]!.tapped, s.cards[grown]!.counters ?? 0]).toEqual([true, 0]);

    let t = newGame();
    put(t, 'P1', 'genemorph-imago');
    const land = put(t, 'P1', 'forest', 'hand');
    const big = put(t, 'P2', 'quantum-riddler');
    t = goTo(t, 'main1');
    t = cast(t, { type: 'PlayLand', player: 'P1', card: land }, pick(big)).state;
    expect([powerOf(t, t.cards[big]!), toughnessOf(t, t.cards[big]!)]).toEqual([3, 3]);

    let u = newGame();
    const feeder = put(u, 'P1', 'monoist-circuit-feeder', 'hand');
    put(u, 'P1', 'sol-ring');
    put(u, 'P1', 'sol-ring');
    const mine = put(u, 'P1', 'meltstrider-eulogist');
    const theirs = put(u, 'P2', 'meltstrider-eulogist');
    u = goTo(u, 'main1');
    mana(u, 'P1', { B: 2, C: 4 });
    u = cast(u, { type: 'CastSpell', player: 'P1', card: feeder }, { targets: (o: { kind: string; card?: string }[][]) => o.find((x) => x[0]?.kind === 'card' && x[0].card === mine && x[1]?.kind === 'card' && x[1].card === theirs) ?? o[0]! } as never).state;
    // Three artifacts, the Feeder included.
    expect([powerOf(u, u.cards[mine]!), zone(u, theirs)]).toEqual([6, 'graveyard']);
  });
});

// Group M12: Spacecraft, Command Bridge and combat statics.
describe('M12: Spacecraft, Command Bridge and combat statics', () => {
  const pick = (id: string) => ({ targets: (o: { kind: string; card?: string }[][]) => o.find((t) => t[0]?.kind === 'card' && t[0].card === id)! }) as never;
  const charge = (n: number) => ({ namedCounters: { charge: n } }) as never;

  it('Synthesizer Labship (2+) animates another artifact as a 2/2 flier at combat; Mechan Shieldmate attacks once an artifact entered', () => {
    let s = newGame();
    put(s, 'P1', 'synthesizer-labship', 'battlefield', charge(2));
    const ring = put(s, 'P1', 'sol-ring');
    s = goTo(s, 'beginCombat', pick(ring));
    s = settle(s, pick(ring)).state;
    expect([toughnessOf(s, s.cards[ring]!), hasKeyword(s, s.cards[ring]!, 'Flying')]).toEqual([2, true]);

    let t = newGame();
    const mate = put(t, 'P1', 'mechan-shieldmate');
    const ring2 = put(t, 'P1', 'sol-ring', 'hand');
    t = goTo(t, 'main1');
    const attackAll = (st: GameState) => {
      try {
        const a = goTo(structuredClone(st), 'declareAttackers');
        return a.pending.kind === 'declareAttackers' && applyAction(a, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: mate, defender: 'P2' }] }).ok;
      } catch {
        return false;
      }
    };
    expect(attackAll(t)).toBe(false);
    mana(t, 'P1', { C: 1 });
    t = cast(t, { type: 'CastSpell', player: 'P1', card: ring2 }).state;
    expect(attackAll(t)).toBe(true);
  });

  it('Entropic Battlecruiser (8+): attacking makes each opponent discard (losing 3 for it at 1+), or lose 3 if they can’t', () => {
    const attack = (cards: number) => {
      let s = newGame();
      const ship = put(s, 'P1', 'entropic-battlecruiser', 'battlefield', charge(8));
      s.players.P2!.hand = [];
      for (let i = 0; i < cards; i++) put(s, 'P2', 'plasma-bolt', 'hand');
      s = goTo(s, 'declareAttackers');
      const life = s.players.P2!.life;
      s = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: ship, defender: 'P2' }] })).state;
      if (s.pending.kind === 'chooseCards') s = settle(act(s, { type: 'ChooseCards', player: 'P2', cards: [s.pending.cards[0]!] })).state;
      return [life - s.players.P2!.life, s.players.P2!.hand.length];
    };
    expect(attack(1)).toEqual([3, 0]);
    expect(attack(0)).toEqual([3, 0]);
  });

  it('Infinite Guideline Station makes a tapped Robot for each multicolored permanent you control', () => {
    let s = newGame();
    const station = put(s, 'P1', 'infinite-guideline-station', 'hand');
    put(s, 'P1', 'pinnacle-emissary');
    s = goTo(s, 'main1');
    mana(s, 'P1', { W: 1, U: 1, B: 1, R: 1, G: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: station }).state;
    // The Emissary and the Station itself.
    const robots = s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'robot-token-eoe');
    expect([robots.length, robots.every((id) => s.cards[id]!.tapped)]).toEqual([2, true]);
  });

  it('Command Bridge is sacrificed unless you tap an untapped permanent you control', () => {
    let s = newGame();
    const bridge = put(s, 'P1', 'command-bridge', 'hand');
    const ring = put(s, 'P1', 'sol-ring');
    s = goTo(s, 'main1');
    s = cast(s, { type: 'PlayLand', player: 'P1', card: bridge }).state;
    expect(s.pending).toMatchObject({ kind: 'chooseCards', purpose: 'tap' });
    let t = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [ring] })).state;
    expect([zone(t, bridge), t.cards[ring]!.tapped]).toEqual(['battlefield', true]);
    t = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [] })).state;
    expect(zone(t, bridge)).toBe('graveyard');
  });

  it('Skystinger gets +5/+0 blocking a flier; Frenzied Baloth’s creature spells can’t be countered', () => {
    let s = newGame();
    const flier = put(s, 'P1', 'quantum-riddler');
    const stinger = put(s, 'P2', 'skystinger');
    s = goTo(s, 'declareAttackers');
    s = act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: flier, defender: 'P2' }] });
    for (let i = 0; i < 10 && s.pending.kind !== 'declareBlockers'; i++) s = act(s, { type: 'PassPriority', player: (s.pending as { player: string }).player });
    s = settle(act(s, { type: 'DeclareBlockers', player: 'P2', blocks: [{ blocker: stinger, attacker: flier }] })).state;
    expect(powerOf(s, s.cards[stinger]!)).toBe(8);

    let t = newGame();
    put(t, 'P1', 'frenzied-baloth');
    const bear = put(t, 'P1', 'meltstrider-eulogist', 'hand');
    const divert = put(t, 'P2', 'divert-disaster', 'hand');
    t = goTo(t, 'main1');
    mana(t, 'P1', { G: 1, C: 2 });
    mana(t, 'P2', { U: 1, C: 1 });
    t = act(t, { type: 'CastSpell', player: 'P1', card: bear });
    t = act(t, { type: 'PassPriority', player: 'P1' });
    t = act(t, { type: 'CastSpell', player: 'P2', card: divert, targets: [card(bear)] });
    for (let i = 0; i < 6 && t.pending.kind === 'priority'; i++) t = act(t, { type: 'PassPriority', player: t.pending.player });
    t = settle(t).state;
    expect(zone(t, bear)).toBe('battlefield');
  });
});


// Group M13: Planets, The Eternity Elevator, Munitions and Slivers, and more spells.
describe('M13: Planets, new tokens and spells', () => {
  const pick = (id: string) => ({ targets: (o: { kind: string; card?: string }[][]) => o.find((t) => t[0]?.kind === 'card' && t[0].card === id)! }) as never;
  const charge = (n: number) => ({ namedCounters: { charge: n } }) as never;
  const count = (s: GameState, defId: string) => s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === defId).length;

  it('Uthros (12+) adds {U} for each artifact; Evendo adds {G} for each creature; neither works before 12', () => {
    let s = newGame();
    const uthros = put(s, 'P1', 'uthros-titanic-godcore', 'battlefield', charge(12));
    const evendo = put(s, 'P1', 'evendo-waking-haven', 'battlefield', charge(11));
    put(s, 'P1', 'sol-ring');
    put(s, 'P1', 'sol-ring');
    s = goTo(s, 'main1');
    mana(s, 'P1', { U: 1, G: 1 });
    expect(rejected(s, { type: 'ActivateAbility', player: 'P1', card: evendo, ability: 0 })).toBeTruthy();
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: uthros, ability: 0 }).state;
    expect(s.players.P1!.manaPool.U).toBe(2);
  });

  it('Susur Secundi draws cards equal to the sacrificed creature’s power; The Eternity Elevator taps for {C}{C}{C}, and at 20+ for X of one color', () => {
    let s = newGame();
    const susur = put(s, 'P1', 'susur-secundi-void-altar', 'battlefield', charge(12));
    const bear = put(s, 'P1', 'meltstrider-eulogist');
    s = goTo(s, 'main1');
    mana(s, 'P1', { B: 1, C: 1 });
    const hand = s.players.P1!.hand.length;
    const life = s.players.P1!.life;
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: susur, ability: 0, costCards: [bear] }).state;
    expect([zone(s, bear), s.players.P1!.hand.length, s.players.P1!.life]).toEqual(['graveyard', hand + 3, life - 2]);

    let t = newGame();
    const lift = put(t, 'P1', 'the-eternity-elevator', 'battlefield', charge(20));
    t = goTo(t, 'main1');
    let u = act(t, { type: 'ActivateManaAbility', player: 'P1', card: lift, mana: 'C' });
    expect(u.players.P1!.manaPool.C).toBe(3);
    u = cast(t, { type: 'ActivateAbility', player: 'P1', card: lift, ability: 0 }).state;
    expect(u.pending).toMatchObject({ kind: 'chooseMana', amount: 20 });
  });

  it('Weapons Manufacturing makes Munitions that deal 2 damage when they leave; Thrumming Hivepool makes two Slivers with double strike and haste', () => {
    let s = newGame();
    put(s, 'P1', 'weapons-manufacturing');
    const ring = put(s, 'P1', 'sol-ring', 'hand');
    const litho = put(s, 'P1', 'lithobraking', 'hand');
    s = goTo(s, 'main1');
    mana(s, 'P1', { R: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: ring }).state;
    expect(count(s, 'munitions-token-eoe')).toBe(1);
    const token = s.players.P1!.battlefield.find((id) => s.cards[id]!.defId === 'munitions-token-eoe')!;
    const life = s.players.P2!.life;
    const atP2 = { targets: (o: { kind: string; player?: string }[][]) => o.find((x) => x[0]?.kind === 'player' && x[0].player === 'P2')! } as never;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: litho }, atP2).state;
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [token] }), atP2).state;
    for (let i = 0; i < 6 && s.stack.length > 0 && s.pending.kind === 'priority'; i++) s = settle(act(s, { type: 'PassPriority', player: s.pending.player }), atP2).state;
    expect(s.players.P2!.life).toBe(life - 2);

    let t = newGame();
    put(t, 'P1', 'thrumming-hivepool');
    t = goTo(t, 'main1');
    t = goTo(goTo(goTo(t, 'end'), 'main1'), 'end');
    t = goTo(t, 'main1');
    const slivers = t.players.P1!.battlefield.filter((id) => t.cards[id]!.defId === 'sliver-token-eoe');
    expect(slivers).toHaveLength(2);
    expect([hasKeyword(t, t.cards[slivers[0]!]!, 'DoubleStrike'), hasKeyword(t, t.cards[slivers[0]!]!, 'Haste')]).toEqual([true, true]);
  });

  it('Unravel draws only when less mana was spent than the spell’s mana value; Focus Fire counts creatures and Spacecraft', () => {
    let s = newGame();
    const warper = put(s, 'P1', 'quantum-riddler', 'hand');
    const unravel = put(s, 'P2', 'unravel', 'hand');
    s = goTo(s, 'main1');
    mana(s, 'P1', { U: 1, C: 1 });
    mana(s, 'P2', { U: 2, C: 1 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: warper, alternative: true });
    s = act(s, { type: 'PassPriority', player: 'P1' });
    const hand = s.players.P2!.hand.length;
    s = cast(s, { type: 'CastSpell', player: 'P2', card: unravel, targets: [card(warper)] }).state;
    for (let i = 0; i < 6 && s.stack.length > 0; i++) s = settle(act(s, { type: 'PassPriority', player: (s.pending as { player: string }).player })).state;
    expect([zone(s, warper), s.players.P2!.hand.length]).toEqual(['graveyard', hand]);

    let t = newGame();
    const fire = put(t, 'P2', 'focus-fire', 'hand');
    const attacker = put(t, 'P1', 'icecave-crasher');
    put(t, 'P2', 'meltstrider-eulogist');
    put(t, 'P2', 'lumen-class-frigate');
    t = goTo(t, 'declareAttackers');
    t = settle(act(t, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker, defender: 'P2' }] })).state;
    mana(t, 'P2', { W: 1 });
    t = act(t, { type: 'PassPriority', player: 'P1' });
    t = cast(t, { type: 'CastSpell', player: 'P2', card: fire, targets: [card(attacker)] }).state;
    for (let i = 0; i < 6 && t.stack.length > 0 && t.pending.kind === 'priority'; i++) t = settle(act(t, { type: 'PassPriority', player: t.pending.player })).state;
    expect(zone(t, attacker)).toBe('graveyard');
  });

  it('Cryoshatter: -5/-0, and the creature is destroyed when it becomes tapped; Icetill Explorer plays lands from the graveyard and mills on landfall', () => {
    let t = newGame();
    const shatter = put(t, 'P1', 'cryoshatter', 'hand');
    const foe = put(t, 'P2', 'quantum-riddler');
    const tapper = put(t, 'P1', 'starport-security');
    put(t, 'P1', 'meltstrider-eulogist', 'battlefield', { counters: 1 });
    t = goTo(t, 'main1');
    mana(t, 'P1', { U: 1, W: 1, C: 1 });
    t = cast(t, { type: 'CastSpell', player: 'P1', card: shatter, targets: [card(foe)] }).state;
    expect([powerOf(t, t.cards[foe]!), t.cards[shatter]!.attachedTo]).toEqual([-1, foe]);
    t = cast(t, { type: 'ActivateAbility', player: 'P1', card: tapper, ability: 0, targets: [card(foe)] }).state;
    t = settle(t).state;
    expect(zone(t, foe)).toBe('graveyard');

    let u = newGame();
    put(u, 'P1', 'icetill-explorer');
    const land = put(u, 'P1', 'forest', 'graveyard');
    u = goTo(u, 'main1');
    const lib = u.players.P1!.library.length;
    u = cast(u, { type: 'PlayLand', player: 'P1', card: land }).state;
    expect([zone(u, land), u.players.P1!.library.length]).toEqual(['battlefield', lib - 1]);
  });

  it('Pulsar Squadron Ace finds a Spacecraft or gets a counter; Consult the Star Charts keeps two when kicked; Devastating Onslaught makes X hasty copies', () => {
    let s = newGame();
    const ace = put(s, 'P1', 'pulsar-squadron-ace', 'hand');
    s = goTo(s, 'main1');
    const ship = put(s, 'P1', 'lumen-class-frigate', 'library');
    s.players.P1!.library = [ship, ...s.players.P1!.library.filter((id) => id !== ship)];
    mana(s, 'P1', { W: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: ace }).state;
    expect(s.pending).toMatchObject({ kind: 'chooseCards', purpose: 'lookTop' });
    let t = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [ship] })).state;
    expect([zone(t, ship), t.cards[ace]!.counters ?? 0]).toEqual(['hand', 0]);
    t = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [] })).state;
    expect([zone(t, ship), t.cards[ace]!.counters ?? 0]).toEqual(['library', 1]);

    let u = newGame();
    const charts = put(u, 'P1', 'consult-the-star-charts', 'hand');
    for (let i = 0; i < 3; i++) put(u, 'P1', 'island');
    u = goTo(u, 'main1');
    mana(u, 'P1', { U: 2, C: 2 });
    const hand = u.players.P1!.hand.length;
    u = cast(u, { type: 'CastSpell', player: 'P1', card: charts, kicks: 1 }).state;
    expect(u.pending).toMatchObject({ kind: 'chooseCards', purpose: 'hand', min: 2, max: 2 });
    u = settle(act(u, { type: 'ChooseCards', player: 'P1', cards: (u.pending as { cards: string[] }).cards.slice(0, 2) })).state;
    expect(u.players.P1!.hand.length).toBe(hand - 1 + 2);

    let v = newGame();
    const onslaught = put(v, 'P1', 'devastating-onslaught', 'hand');
    const bear = put(v, 'P1', 'meltstrider-eulogist');
    v = goTo(v, 'main1');
    mana(v, 'P1', { R: 1, C: 4 });
    v = cast(v, { type: 'CastSpell', player: 'P1', card: onslaught, x: 2, targets: [card(bear)] }).state;
    const copies = v.players.P1!.battlefield.filter((id) => v.cards[id]!.isToken);
    expect([copies.length, hasKeyword(v, v.cards[copies[0]!]!, 'Haste')]).toEqual([2, true]);
    v = goTo(v, 'end');
    expect(v.players.P1!.battlefield.filter((id) => v.cards[id]!.isToken)).toHaveLength(0);
  });
});

// Group M14: one-off designs.
describe('M14: one-off designs', () => {
  const pick = (id: string) => ({ targets: (o: { kind: string; card?: string }[][]) => o.find((t) => t[0]?.kind === 'card' && t[0].card === id)! }) as never;
  const kill = (s: GameState, id: string, opts: never = {} as never) => {
    s.cards[id]!.damage = 99;
    return cast(s, { type: 'PassPriority', player: 'P1' }, opts).state;
  };

  it('Syr Vondam grows and gains life when another creature of yours dies; dying with power 4 or more, it destroys a nonland permanent', () => {
    let s = newGame();
    const syr = put(s, 'P1', 'syr-vondam-sunstar-exemplar');
    const a = put(s, 'P1', 'meltstrider-eulogist');
    const b = put(s, 'P1', 'meltstrider-eulogist');
    const ring = put(s, 'P2', 'sol-ring');
    s = goTo(s, 'main1');
    const life = s.players.P1!.life;
    s = kill(s, a);
    expect([s.cards[syr]!.counters, s.players.P1!.life]).toEqual([1, life + 1]);
    // Power 3: nothing happens when it dies.
    let t = kill(structuredClone(s), syr, pick(ring));
    t = settle(t, pick(ring)).state;
    expect(zone(t, ring)).toBe('battlefield');
    s = kill(s, b);
    s = kill(s, syr, pick(ring));
    for (let i = 0; i < 6 && s.stack.length > 0 && s.pending.kind === 'priority'; i++) s = settle(act(s, { type: 'PassPriority', player: s.pending.player }), pick(ring)).state;
    expect(zone(s, ring)).toBe('graveyard');
  });

  it('The Endstone draws for lands and spells, and sets your life to half the starting total at your end step', () => {
    let s = newGame();
    put(s, 'P1', 'the-endstone');
    const land = put(s, 'P1', 'forest', 'hand');
    const ring = put(s, 'P1', 'sol-ring', 'hand');
    s = goTo(s, 'main1');
    const hand = s.players.P1!.hand.length;
    s = cast(s, { type: 'PlayLand', player: 'P1', card: land }).state;
    mana(s, 'P1', { C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: ring }).state;
    expect(s.players.P1!.hand.length).toBe(hand);
    s.players.P1!.life = 3;
    s = settle(goTo(s, 'end')).state;
    for (let i = 0; i < 4 && s.stack.length > 0; i++) s = settle(act(s, { type: 'PassPriority', player: (s.pending as { player: string }).player })).state;
    expect(s.players.P1!.life).toBe(10);
  });

  it('Memorial Vault exiles one plus the sacrificed artifact’s mana value to play this turn; Territorial Bruntar’s landfall exiles to a nonland card you may cast', () => {
    let s = newGame();
    const vault = put(s, 'P1', 'memorial-vault');
    const ring = put(s, 'P1', 'sol-ring');
    s = goTo(s, 'main1');
    const top = s.players.P1!.library.slice(0, 2);
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: vault, ability: 0, costCards: [ring] }).state;
    expect(top.map((id) => zone(s, id))).toEqual(['exile', 'exile']);
    expect(top.every((id) => s.cards[id]!.playableFromExile?.untilTurn === s.turnNumber)).toBe(true);

    let t = newGame();
    put(t, 'P1', 'territorial-bruntar');
    const land = put(t, 'P1', 'forest', 'hand');
    t = goTo(t, 'main1');
    const spell = put(t, 'P1', 'sol-ring', 'library');
    const buried = put(t, 'P1', 'forest', 'library');
    t.players.P1!.library = [buried, spell, ...t.players.P1!.library.filter((id) => id !== spell && id !== buried)];
    t = cast(t, { type: 'PlayLand', player: 'P1', card: land }).state;
    expect([zone(t, buried), zone(t, spell)]).toEqual(['exile', 'exile']);
    expect(rejected(t, { type: 'CastSpell', player: 'P1', card: spell })).toBeTruthy();
    mana(t, 'P1', { C: 1 });
    t = cast(t, { type: 'CastSpell', player: 'P1', card: spell }).state;
    expect(zone(t, spell)).toBe('battlefield');
  });

  it('Hardlight Containment exiles an opponent’s creature while it’s on your artifact, which gets ward {1}', () => {
    let s = newGame();
    const aura = put(s, 'P1', 'hardlight-containment', 'hand');
    const ring = put(s, 'P1', 'sol-ring');
    const foe = put(s, 'P2', 'icecave-crasher');
    s = goTo(s, 'main1');
    mana(s, 'P1', { W: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: aura, targets: [card(ring)] }, pick(foe)).state;
    expect([s.cards[aura]!.attachedTo, zone(s, foe)]).toEqual([ring, 'exile']);
    moveCard({ s, ev: [] }, aura, 'graveyard');
    s = settle(act(s, { type: 'PassPriority', player: 'P1' })).state;
    expect(zone(s, foe)).toBe('battlefield');
  });

  it('Terrapact Intimidator: the opponent gives you two Landers, or it gets two +1/+1 counters', () => {
    let s = newGame();
    const kavu = put(s, 'P1', 'terrapact-intimidator', 'hand');
    s = goTo(s, 'main1');
    mana(s, 'P1', { R: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: kavu }).state;
    expect(s.pending).toMatchObject({ kind: 'chooseCards', player: 'P2', purpose: 'mark' });
    let t = settle(act(s, { type: 'ChooseCards', player: 'P2', cards: [kavu] })).state;
    expect([t.players.P1!.battlefield.filter((id) => t.cards[id]!.defId === 'lander-token-eoe').length, t.cards[kavu]!.counters ?? 0]).toEqual([2, 0]);
    t = settle(act(s, { type: 'ChooseCards', player: 'P2', cards: [] })).state;
    expect([t.players.P1!.battlefield.filter((id) => t.cards[id]!.defId === 'lander-token-eoe').length, t.cards[kavu]!.counters]).toEqual([0, 2]);
  });

  it('Astelli Reclaimer returns a noncreature permanent card with mana value up to the mana spent; Scout for Survivors returns up to three small creatures with counters', () => {
    let s = newGame();
    const angel = put(s, 'P1', 'astelli-reclaimer', 'hand');
    const cheap = put(s, 'P1', 'sol-ring', 'graveyard');
    const pricey = put(s, 'P1', 'the-endstone', 'graveyard');
    s = goTo(s, 'main1');
    mana(s, 'P1', { W: 1, C: 2 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: angel, alternative: true });
    s = settle(act(s, { type: 'PassPriority', player: 'P1' })).state;
    for (let i = 0; i < 4 && s.pending.kind === 'priority' && s.stack.length > 0; i++) s = settle(act(s, { type: 'PassPriority', player: s.pending.player })).state;
    expect([zone(s, cheap), zone(s, pricey)]).toEqual(['battlefield', 'graveyard']);

    let t = newGame();
    const scout = put(t, 'P1', 'scout-for-survivors', 'hand');
    const a = put(t, 'P1', 'starport-security', 'graveyard');
    const b = put(t, 'P1', 'starport-security', 'graveyard');
    const big = put(t, 'P1', 'quantum-riddler', 'graveyard');
    t = goTo(t, 'main1');
    mana(t, 'P1', { W: 1, C: 2 });
    t = cast(t, { type: 'CastSpell', player: 'P1', card: scout }).state;
    expect(rejected(t, { type: 'ChooseCards', player: 'P1', cards: [big] })).toBeTruthy();
    t = settle(act(t, { type: 'ChooseCards', player: 'P1', cards: [a, b] })).state;
    for (let i = 0; i < 4 && t.pending.kind === 'chooseCards'; i++) t = settle(act(t, { type: 'ChooseCards', player: 'P1', cards: [] })).state;
    expect([zone(t, a), zone(t, b), t.cards[a]!.counters, t.cards[b]!.counters]).toEqual(['battlefield', 'battlefield', 1, 1]);
  });
});

// Group M15: Auras, affinity and more one-offs.
describe('M15: Auras, affinity and more one-offs', () => {
  const pick = (id: string) => ({ targets: (o: { kind: string; card?: string }[][]) => o.find((t) => t[0]?.kind === 'card' && t[0].card === id)! }) as never;
  const atP2 = { targets: (o: { kind: string; player?: string }[][]) => o.find((x) => x[0]?.kind === 'player' && x[0].player === 'P2')! } as never;
  const charge = (n: number) => ({ namedCounters: { charge: n } }) as never;

  it('Starfield Vocalist: an entering permanent’s trigger happens twice; Sami gives every spell affinity for artifacts', () => {
    let s = newGame();
    put(s, 'P1', 'starfield-vocalist');
    const captain = put(s, 'P1', 'honored-knight-captain', 'hand');
    s = goTo(s, 'main1');
    mana(s, 'P1', { W: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: captain }).state;
    for (let i = 0; i < 4 && s.stack.length > 0 && s.pending.kind === 'priority'; i++) s = settle(act(s, { type: 'PassPriority', player: s.pending.player })).state;
    expect(s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'human-soldier-token-eoe')).toHaveLength(2);

    let t = newGame();
    put(t, 'P1', 'sami-wildcat-captain');
    put(t, 'P1', 'sol-ring');
    put(t, 'P1', 'sol-ring');
    const bear = put(t, 'P1', 'meltstrider-eulogist', 'hand');
    t = goTo(t, 'main1');
    mana(t, 'P1', { G: 1 });
    t = cast(t, { type: 'CastSpell', player: 'P1', card: bear }).state;
    expect(zone(t, bear)).toBe('battlefield');
  });

  it('Rust Harvester exiles an artifact card to grow and deal damage equal to its power; Gene Pollinator taps another permanent for any color', () => {
    let s = newGame();
    const harvester = put(s, 'P1', 'rust-harvester');
    const scrap = put(s, 'P1', 'sol-ring', 'graveyard');
    const bug = put(s, 'P1', 'gene-pollinator');
    const land = put(s, 'P1', 'forest');
    s = goTo(s, 'main1');
    mana(s, 'P1', { C: 2 });
    const life = s.players.P2!.life;
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: harvester, ability: 0, costCards: [scrap], targets: [{ kind: 'player', player: 'P2' }] }).state;
    expect([zone(s, scrap), s.cards[harvester]!.counters, s.players.P2!.life]).toEqual(['exile', 1, life - 2]);
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: bug, ability: 0, costCards: [land] }).state;
    expect([s.pending.kind, s.cards[land]!.tapped, s.cards[bug]!.tapped]).toEqual(['chooseMana', true, true]);
  });

  it('Systems Override steals until end of turn; a Spacecraft gets ten charge counters that are removed at the end step', () => {
    let s = newGame();
    const override = put(s, 'P1', 'systems-override', 'hand');
    const ship = put(s, 'P2', 'lumen-class-frigate', 'battlefield', charge(3));
    s = goTo(s, 'main1');
    mana(s, 'P1', { R: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: override, targets: [card(ship)] }).state;
    expect([s.cards[ship]!.controller, s.cards[ship]!.namedCounters?.charge, hasKeyword(s, s.cards[ship]!, 'Haste')]).toEqual(['P1', 13, true]);
    s = goTo(s, 'end');
    expect(s.cards[ship]!.namedCounters?.charge).toBe(3);
    s = goTo(s, 'main1');
    expect(s.cards[ship]!.controller).toBe('P2');
  });

  it('Terrasymbiosis draws that many cards, once each turn; Adagia (12+) makes a legendary copy', () => {
    let s = newGame();
    put(s, 'P1', 'terrasymbiosis');
    const bear = put(s, 'P1', 'meltstrider-eulogist');
    const honor = put(s, 'P1', 'archenemys-charm', 'hand');
    s = goTo(s, 'main1');
    mana(s, 'P1', { B: 3 });
    const hand = s.players.P1!.hand.length;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: honor, mode: 2, targets: [card(bear)] } as never, { accept: true }).state;
    expect([s.cards[bear]!.counters, s.players.P1!.hand.length]).toEqual([2, hand - 1 + 2]);

    let t = newGame();
    const adagia = put(t, 'P1', 'adagia-windswept-bastion', 'battlefield', charge(12));
    const ring = put(t, 'P1', 'sol-ring');
    t = goTo(t, 'main1');
    mana(t, 'P1', { W: 1, C: 3 });
    t = cast(t, { type: 'ActivateAbility', player: 'P1', card: adagia, ability: 0, targets: [card(ring)] }).state;
    const copy = t.players.P1!.battlefield.find((id) => t.cards[id]!.isToken)!;
    expect(currentDefinition(t, t.cards[copy]!).supertypes).toContain('Legendary');
    expect(currentDefinition(t, t.cards[copy]!).name).toBe('Sol Ring');
  });

  it('Tractor Beam taps and takes the creature, which doesn’t untap; it goes back when the Aura leaves', () => {
    let s = newGame();
    const beam = put(s, 'P1', 'tractor-beam', 'hand');
    const foe = put(s, 'P2', 'icecave-crasher');
    s = goTo(s, 'main1');
    mana(s, 'P1', { U: 2, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: beam, targets: [card(foe)] }).state;
    expect([s.cards[foe]!.controller, s.cards[foe]!.tapped, s.cards[beam]!.attachedTo]).toEqual(['P1', true, foe]);
    s = goTo(goTo(goTo(goTo(s, 'end'), 'main1'), 'end'), 'main1');
    expect([s.activePlayer, s.cards[foe]!.tapped]).toEqual(['P1', true]);
    moveCard({ s, ev: [] }, beam, 'graveyard');
    s = settle(act(s, { type: 'PassPriority', player: 'P1' })).state;
    expect(s.cards[foe]!.controller).toBe('P2');
  });

  it('Meltstrider’s Resolve: the enchanted creature fights, gets +0/+2 and can’t be double-blocked; Pain for All passes damage on to each opponent', () => {
    let s = newGame();
    const resolve = put(s, 'P1', 'meltstriders-resolve', 'hand');
    const mine = put(s, 'P1', 'icecave-crasher');
    const foe = put(s, 'P2', 'meltstrider-eulogist');
    const b1 = put(s, 'P2', 'starport-security');
    const b2 = put(s, 'P2', 'starport-security');
    s = goTo(s, 'main1');
    mana(s, 'P1', { G: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: resolve, targets: [card(mine)] }, pick(foe)).state;
    expect([zone(s, foe), s.cards[mine]!.damage, toughnessOf(s, s.cards[mine]!)]).toEqual(['graveyard', 3, 6]);
    s = goTo(s, 'declareAttackers');
    s = act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: mine, defender: 'P2' }] });
    for (let i = 0; i < 6 && s.pending.kind !== 'declareBlockers'; i++) s = settle(act(s, { type: 'PassPriority', player: (s.pending as { player: string }).player })).state;
    expect(rejected(s, { type: 'DeclareBlockers', player: 'P2', blocks: [{ blocker: b1, attacker: mine }, { blocker: b2, attacker: mine }] })).toMatch(/more than one/);

    let t = newGame();
    const pain = put(t, 'P1', 'pain-for-all', 'hand');
    const host = put(t, 'P1', 'icecave-crasher');
    const bolt = put(t, 'P1', 'plasma-bolt', 'hand');
    t = goTo(t, 'main1');
    mana(t, 'P1', { R: 2, C: 2 });
    const life = t.players.P2!.life;
    t = cast(t, { type: 'CastSpell', player: 'P1', card: pain, targets: [card(host)] }, atP2).state;
    expect(t.players.P2!.life).toBe(life - 4);
    t = cast(t, { type: 'CastSpell', player: 'P1', card: bolt, targets: [card(host)] }).state;
    for (let i = 0; i < 4 && t.stack.length > 0 && t.pending.kind === 'priority'; i++) t = settle(act(t, { type: 'PassPriority', player: t.pending.player })).state;
    expect(t.players.P2!.life).toBe(life - 4 - 2);
  });
});

// Group M16: Xu-Ifit, Chorale of the Void and Secluded Starforge.
describe('M16: three more one-offs', () => {
  const pick = (id: string) => ({ targets: (o: { kind: string; card?: string }[][]) => o.find((t) => t[0]?.kind === 'card' && t[0].card === id)! }) as never;

  it('Xu-Ifit returns a creature card as a Skeleton with no abilities', () => {
    let s = newGame();
    const xu = put(s, 'P1', 'xu-ifit-osteoharmonist');
    const dead = put(s, 'P1', 'quantum-riddler', 'graveyard');
    s = goTo(s, 'main1');
    const hand = s.players.P1!.hand.length;
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: xu, ability: 0, targets: [card(dead)] }).state;
    const def = currentDefinition(s, s.cards[dead]!);
    expect([zone(s, dead), def.subtypes?.includes('Skeleton'), def.subtypes?.includes('Sphinx'), hasKeyword(s, s.cards[dead]!, 'Flying'), s.players.P1!.hand.length, powerOf(s, s.cards[dead]!)]).toEqual(['battlefield', true, true, false, hand, 4]);
  });

  it('Chorale of the Void: the enchanted creature’s attack brings a creature from the defender’s graveyard in attacking; without void the Aura is sacrificed', () => {
    let s = newGame();
    const chorale = put(s, 'P1', 'chorale-of-the-void', 'hand');
    const mine = put(s, 'P1', 'icecave-crasher');
    const theirs = put(s, 'P2', 'meltstrider-eulogist', 'graveyard');
    s = goTo(s, 'main1');
    mana(s, 'P1', { B: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: chorale, targets: [card(mine)] }).state;
    s = goTo(s, 'declareAttackers');
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: mine, defender: 'P2' }] }), pick(theirs)).state;
    for (let i = 0; i < 4 && s.stack.length > 0 && s.pending.kind === 'priority'; i++) s = settle(act(s, { type: 'PassPriority', player: s.pending.player }), pick(theirs)).state;
    expect([zone(s, theirs), s.cards[theirs]!.controller, s.cards[theirs]!.tapped, s.combat?.attacks.some((a) => a.attacker === theirs && a.defender === 'P2')]).toEqual(['battlefield', 'P1', true, true]);
    s = goTo(s, 'end');
    for (let i = 0; i < 4 && s.stack.length > 0 && s.pending.kind === 'priority'; i++) s = settle(act(s, { type: 'PassPriority', player: s.pending.player })).state;
    expect(zone(s, chorale)).toBe('graveyard');
  });

  it('Secluded Starforge: tap X artifacts for +X/+0, or pay {5} for a Robot', () => {
    let s = newGame();
    const forge = put(s, 'P1', 'secluded-starforge');
    const rings = [put(s, 'P1', 'sol-ring'), put(s, 'P1', 'sol-ring')];
    const bear = put(s, 'P1', 'meltstrider-eulogist');
    s = goTo(s, 'main1');
    mana(s, 'P1', { C: 2 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: forge, ability: 0, costCards: rings, targets: [card(bear)] }).state;
    expect([powerOf(s, s.cards[bear]!), rings.every((id) => s.cards[id]!.tapped)]).toEqual([5, true]);
  });
});

// Group M17: sweepers and more one-offs.
describe('M17: sweepers and more one-offs', () => {
  const pick = (id: string) => ({ targets: (o: { kind: string; card?: string }[][]) => o.find((t) => t[0]?.kind === 'card' && t[0].card === id)! }) as never;
  const drain = (s: GameState, opts: never = {} as never) => {
    for (let i = 0; i < 6 && s.stack.length > 0 && s.pending.kind === 'priority'; i++) s = settle(act(s, { type: 'PassPriority', player: s.pending.player }), opts).state;
    return s;
  };

  it('Zero Point Ballad destroys by toughness, costs X life, and at X of 6 or more returns one of the creatures under your control', () => {
    let s = newGame();
    const ballad = put(s, 'P1', 'zero-point-ballad', 'hand');
    const small = put(s, 'P2', 'meltstrider-eulogist');
    const big = put(s, 'P2', 'quantum-riddler');
    s = goTo(s, 'main1');
    mana(s, 'P1', { B: 1, C: 6 });
    const life = s.players.P1!.life;
    let t = cast(s, { type: 'CastSpell', player: 'P1', card: ballad, x: 3 }).state;
    expect([zone(t, small), zone(t, big), t.players.P1!.life]).toEqual(['graveyard', 'battlefield', life - 3]);
    t = cast(s, { type: 'CastSpell', player: 'P1', card: ballad, x: 6 }).state;
    expect(t.pending).toMatchObject({ kind: 'chooseCards', purpose: 'battlefield', min: 1, max: 1 });
    t = settle(act(t, { type: 'ChooseCards', player: 'P1', cards: [big] })).state;
    expect([zone(t, small), zone(t, big), t.cards[big]!.controller, t.players.P1!.life]).toEqual(['graveyard', 'battlefield', 'P1', life - 6]);
  });

  it('Mutinous Massacre destroys the odd (or even) creatures, then takes the rest untapped with haste until end of turn', () => {
    let s = newGame();
    const massacre = put(s, 'P1', 'mutinous-massacre', 'hand');
    const odd = put(s, 'P2', 'meltstrider-eulogist');
    const even = put(s, 'P2', 'icecave-crasher', 'battlefield', { tapped: true });
    s = goTo(s, 'main1');
    mana(s, 'P1', { B: 2, R: 2, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: massacre, mode: 0 }).state;
    expect([zone(s, odd), s.cards[even]!.controller, s.cards[even]!.tapped, hasKeyword(s, s.cards[even]!, 'Haste')]).toEqual(['graveyard', 'P1', false, true]);
    s = goTo(goTo(s, 'end'), 'main1');
    expect(s.cards[even]!.controller).toBe('P2');
  });

  it('Dyadrine enters with counters equal to the mana spent; attacking, two counters buy a card and a Robot', () => {
    let s = newGame();
    const dy = put(s, 'P1', 'dyadrine-synthesis-amalgam', 'hand');
    const other = put(s, 'P1', 'meltstrider-eulogist', 'battlefield', { counters: 1 });
    s = goTo(s, 'main1');
    mana(s, 'P1', { G: 1, W: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: dy, x: 2 }).state;
    expect(s.cards[dy]!.counters).toBe(4);
    s = goTo(s, 'declareAttackers');
    const hand = s.players.P1!.hand.length;
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: other, defender: 'P2' }] }), { accept: true }).state;
    s = drain(s, { accept: true } as never);
    expect(s.pending).toMatchObject({ kind: 'chooseCards', purpose: 'mark', min: 2, max: 2 });
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [dy, other] })).state;
    expect([s.cards[dy]!.counters, s.cards[other]!.counters ?? 0, s.players.P1!.hand.length, s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'robot-token-eoe').length]).toEqual([3, 0, hand + 1, 1]);
  });

  it('Blade of the Swarm: two counters, or an exiled warp card goes to the bottom of its owner’s library', () => {
    let s = newGame();
    const blade = put(s, 'P1', 'blade-of-the-swarm', 'hand');
    const warped = put(s, 'P2', 'quantum-riddler', 'exile');
    s = goTo(s, 'main1');
    mana(s, 'P1', { B: 1, C: 3 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: blade });
    s = act(s, { type: 'PassPriority', player: 'P1' });
    s = act(s, { type: 'PassPriority', player: 'P2' });
    expect(s.pending.kind).toBe('chooseModes');
    const options = getLegalActions(s);
    let t = settle(act(s, options.find((a) => a.type === 'ChooseModes' && a.modes[0] === 0)!)).state;
    t = drain(t);
    expect(t.cards[blade]!.counters).toBe(2);
    t = settle(act(s, options.find((a) => a.type === 'ChooseModes' && a.modes[0] === 1)!), pick(warped)).state;
    t = drain(t, pick(warped));
    expect([zone(t, warped), t.players.P2!.library.at(-1)]).toEqual(['library', warped]);
  });

  it('Pinnacle Starcage exiles cheap artifacts and creatures; its ability buries them and makes a Robot for each', () => {
    let s = newGame();
    const cage = put(s, 'P1', 'pinnacle-starcage', 'hand');
    const ring = put(s, 'P2', 'sol-ring');
    const cheap = put(s, 'P2', 'starport-security');
    const big = put(s, 'P2', 'quantum-riddler');
    s = goTo(s, 'main1');
    mana(s, 'P1', { W: 4, C: 7 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: cage }).state;
    s = drain(s);
    expect([zone(s, ring), zone(s, cheap), zone(s, big)]).toEqual(['exile', 'exile', 'battlefield']);
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: cage, ability: 0 }).state;
    s = drain(s);
    expect([zone(s, ring), zone(s, cheap), zone(s, cage), s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'robot-token-eoe').length]).toEqual(['graveyard', 'graveyard', 'graveyard', 2]);
  });

  it('Sunset Saboteur: ward makes an opponent discard, and its attack puts a counter on an opponent’s creature', () => {
    let s = newGame();
    const sab = put(s, 'P1', 'sunset-saboteur');
    const foe = put(s, 'P2', 'meltstrider-eulogist');
    s = goTo(s, 'declareAttackers');
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: sab, defender: 'P2' }] }), pick(foe)).state;
    s = drain(s, pick(foe));
    expect(s.cards[foe]!.counters).toBe(1);
  });
});

// Group M18: Tannuk, Tapestry Warden and Requiem Monolith.
describe('M18: granted warp, toughness damage and Requiem Monolith', () => {
  it('Tannuk, Steadfast Second: other creatures have haste; artifact and red creature cards in hand have warp {2}{R}', () => {
    let s = newGame();
    put(s, 'P1', 'tannuk-steadfast-second');
    const ring = put(s, 'P1', 'the-endstone', 'hand');
    const green = put(s, 'P1', 'meltstrider-eulogist', 'hand');
    s = goTo(s, 'main1');
    mana(s, 'P1', { R: 1, C: 2 });
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: green, alternative: true })).toBeTruthy();
    s = cast(s, { type: 'CastSpell', player: 'P1', card: ring, alternative: true }).state;
    for (let i = 0; i < 4 && s.stack.length > 0 && s.pending.kind === 'priority'; i++) s = settle(act(s, { type: 'PassPriority', player: s.pending.player })).state;
    expect([zone(s, ring), s.cards[ring]!.warped]).toEqual(['battlefield', true]);
    const bear = put(s, 'P1', 'icecave-crasher');
    expect(hasKeyword(s, s.cards[bear]!, 'Haste')).toBe(true);
    s = goTo(s, 'end');
    expect(zone(s, ring)).toBe('exile');
  });

  it('Tapestry Warden: a creature with more toughness than power deals combat damage equal to its toughness', () => {
    let s = newGame();
    const warden = put(s, 'P1', 'tapestry-warden');
    s = goTo(s, 'declareAttackers');
    const life = s.players.P2!.life;
    s = act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: warden, defender: 'P2' }] });
    for (let i = 0; i < 40 && s.step !== 'main2'; i++) {
      const p = s.pending;
      if (p.kind === 'declareBlockers') s = act(s, { type: 'DeclareBlockers', player: p.player, blocks: [] });
      else if (p.kind === 'priority') s = act(s, { type: 'PassPriority', player: p.player });
      else s = settle(s).state;
    }
    expect(s.players.P2!.life).toBe(life - 4);
  });

  it('Requiem Monolith: the creature’s controller draws and loses life for damage it’s dealt, and may take 1 from the Monolith', () => {
    let s = newGame();
    const monolith = put(s, 'P1', 'requiem-monolith');
    const bear = put(s, 'P1', 'icecave-crasher');
    s = goTo(s, 'main1');
    const hand = s.players.P1!.hand.length;
    const life = s.players.P1!.life;
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: monolith, ability: 0, targets: [card(bear)] }).state;
    expect(s.pending).toMatchObject({ kind: 'chooseCards', player: 'P1', purpose: 'mark' });
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [monolith] })).state;
    expect([s.cards[bear]!.damage, s.players.P1!.hand.length, s.players.P1!.life]).toEqual([1, hand + 1, life - 1]);
  });
});

// Group M19: Close Encounter, Terminal Velocity and Sothera.
describe('M19: Close Encounter, Terminal Velocity and Sothera', () => {
  const drain = (s: GameState) => {
    for (let i = 0; i < 6 && s.stack.length > 0 && s.pending.kind === 'priority'; i++) s = settle(act(s, { type: 'PassPriority', player: s.pending.player })).state;
    return s;
  };

  it('Close Encounter deals damage equal to the power of a creature you control or a warped creature card in exile', () => {
    let s = newGame();
    const spell = put(s, 'P1', 'close-encounter', 'hand');
    const mine = put(s, 'P1', 'icecave-crasher');
    const warped = put(s, 'P1', 'quantum-riddler', 'exile', { warpExiledTurn: 1 });
    const plain = put(s, 'P1', 'quantum-riddler', 'exile');
    const foe = put(s, 'P2', 'quantum-riddler');
    s = goTo(s, 'main1');
    mana(s, 'P1', { G: 1, C: 1 });
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(foe)] })).toBeTruthy();
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(foe)], costCards: [plain] })).toBeTruthy();
    const options = getLegalActions(s).filter((a) => a.type === 'CastSpell' && a.card === spell).map((a) => (a as { costCards?: string[] }).costCards?.[0]);
    expect(new Set(options)).toEqual(new Set([mine, warped]));
    let t = drain(cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(foe)], costCards: [mine] }).state);
    expect([t.cards[foe]!.damage, zone(t, mine)]).toEqual([4, 'battlefield']);
    t = drain(cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(mine)], costCards: [warped] }).state);
    expect([zone(t, mine), zone(t, warped)]).toEqual(['graveyard', 'exile']);
  });

  it('Terminal Velocity: the permanent has haste, is sacrificed at your end step, and then deals damage equal to its mana value to each creature', () => {
    let s = newGame();
    const spell = put(s, 'P1', 'terminal-velocity', 'hand');
    const big = put(s, 'P1', 'mouth-of-the-storm', 'hand');
    const foe = put(s, 'P2', 'quantum-riddler');
    s = goTo(s, 'main1');
    mana(s, 'P1', { R: 2, C: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell }).state;
    expect(s.pending).toMatchObject({ kind: 'chooseCards', purpose: 'battlefield' });
    s = drain(settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [big] })).state);
    expect([zone(s, big), hasKeyword(s, s.cards[big]!, 'Haste')]).toEqual(['battlefield', true]);
    s = drain(settle(goTo(s, 'end')).state);
    expect([zone(s, big), zone(s, foe)]).toEqual(['graveyard', 'graveyard']);
  });

  it('Sothera: when your creature dies, each opponent exiles one of theirs; with a creatureless player at your end step, it trades itself for one of them with two counters', () => {
    let s = newGame();
    const sothera = put(s, 'P1', 'sothera-the-supervoid');
    const mine = put(s, 'P1', 'meltstrider-eulogist');
    const theirs = put(s, 'P2', 'icecave-crasher');
    s = goTo(s, 'main1');
    s.cards[mine]!.damage = 9;
    s = settle(act(s, { type: 'PassPriority', player: 'P1' })).state;
    s = drain(s);
    if (s.pending.kind === 'chooseCards') s = drain(settle(act(s, { type: 'ChooseCards', player: 'P2', cards: [theirs] })).state);
    expect([zone(s, theirs), s.cards[theirs]!.exiledWith?.source]).toEqual(['exile', sothera]);
    s = settle(goTo(s, 'end')).state;
    s = drain(s);
    if (s.pending.kind === 'chooseCards') s = drain(settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [theirs] })).state);
    expect([zone(s, sothera), zone(s, theirs), s.cards[theirs]!.controller, s.cards[theirs]!.counters]).toEqual(['graveyard', 'battlefield', 'P1', 2]);
  });
});

// Group M20: Famished Worldsire, Ragost and Weftwalking.
describe('M20: devour, Foods and Weftwalking', () => {
  const drain = (s: GameState) => {
    for (let i = 0; i < 6 && s.stack.length > 0 && s.pending.kind === 'priority'; i++) s = settle(act(s, { type: 'PassPriority', player: s.pending.player })).state;
    return s;
  };

  it('Famished Worldsire devours lands for three counters each, then puts lands from the top X cards onto the battlefield tapped', () => {
    let s = newGame();
    const sire = put(s, 'P1', 'famished-worldsire', 'hand');
    const lands = [put(s, 'P1', 'forest'), put(s, 'P1', 'forest')];
    s = goTo(s, 'main1');
    const top = put(s, 'P1', 'island', 'library');
    s.players.P1!.library = [top, ...s.players.P1!.library.filter((id) => id !== top)];
    mana(s, 'P1', { G: 3, C: 5 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: sire });
    s = act(s, { type: 'PassPriority', player: 'P1' });
    s = act(s, { type: 'PassPriority', player: 'P2' });
    expect(s.pending).toMatchObject({ kind: 'chooseCards', purpose: 'devourOnEntry' });
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: lands })).state;
    expect([zone(s, sire), s.cards[sire]!.counters, zone(s, lands[0]!)]).toEqual(['battlefield', 6, 'graveyard']);
    s = drain(s);
    expect(s.pending).toMatchObject({ kind: 'chooseCards', purpose: 'lookTop' });
    expect((s.pending as { cards: string[] }).cards).toContain(top);
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [top] })).state;
    expect([zone(s, top), s.cards[top]!.tapped]).toEqual(['battlefield', true]);
  });

  it('Ragost: your artifacts are Foods that can be eaten for 3 life, he throws one for 3 damage, and untaps at end step if you gained life', () => {
    let s = newGame();
    const ragost = put(s, 'P1', 'ragost-deft-gastronaut');
    const a = put(s, 'P1', 'sol-ring');
    const b = put(s, 'P1', 'sol-ring');
    s = goTo(s, 'main1');
    expect(currentDefinition(s, s.cards[a]!).subtypes).toContain('Food');
    mana(s, 'P1', { C: 3 });
    const life = s.players.P1!.life;
    const foe = s.players.P2!.life;
    const eat = currentDefinition(s, s.cards[a]!).activated!.length - 1;
    s = drain(cast(s, { type: 'ActivateAbility', player: 'P1', card: a, ability: eat }).state);
    expect([zone(s, a), s.players.P1!.life]).toEqual(['graveyard', life + 3]);
    s = drain(cast(s, { type: 'ActivateAbility', player: 'P1', card: ragost, ability: 0, costCards: [b] }).state);
    expect([zone(s, b), s.players.P2!.life, s.cards[ragost]!.tapped]).toEqual(['graveyard', foe - 3, true]);
    s = drain(settle(goTo(s, 'end')).state);
    expect(s.cards[ragost]!.tapped).toBe(false);
  });

  it('Weftwalking: cast, it refills your hand; the first spell each player casts on their turn is free', () => {
    let s = newGame();
    const weft = put(s, 'P1', 'weftwalking', 'hand');
    put(s, 'P1', 'sol-ring', 'graveyard');
    s = goTo(s, 'main1');
    mana(s, 'P1', { U: 2, C: 4 });
    s = drain(cast(s, { type: 'CastSpell', player: 'P1', card: weft }).state);
    expect([s.players.P1!.hand.length, s.players.P1!.graveyard.length]).toEqual([7, 0]);
    // P1 already cast a spell this turn: the next one isn't free. On P2's turn, their first spell is.
    const mine = put(s, 'P1', 'quantum-riddler', 'hand');
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: mine })).toBeTruthy();
    moveCard({ s, ev: [] }, mine, 'graveyard');
    const theirs = put(s, 'P2', 'quantum-riddler', 'hand');
    const second = put(s, 'P2', 'quantum-riddler', 'hand');
    s = goTo(goTo(s, 'end'), 'main1');
    expect(s.activePlayer).toBe('P2');
    s = drain(cast(s, { type: 'CastSpell', player: 'P2', card: theirs }).state);
    expect(zone(s, theirs)).toBe('battlefield');
    expect(rejected(s, { type: 'CastSpell', player: 'P2', card: second })).toBeTruthy();
  });
});

// Group M21: restricted mana, token replacement and exile-to-play.
describe('M21: restricted mana, Moonlit Meditation and Lightstall Inquisitor', () => {
  const drain = (s: GameState) => {
    for (let i = 0; i < 6 && s.stack.length > 0 && s.pending.kind === 'priority'; i++) s = settle(act(s, { type: 'PassPriority', player: s.pending.player })).state;
    return s;
  };

  it('Steelswarm Operator: {U} only for artifact spells, or {U}{U} only for abilities of artifacts', () => {
    let s = newGame();
    const op = put(s, 'P1', 'steelswarm-operator');
    const ring = put(s, 'P1', 'sol-ring', 'hand');
    const bear = put(s, 'P1', 'starport-security', 'hand');
    s = goTo(s, 'main1');
    s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: op, mana: 'U' });
    expect([s.players.P1!.manaPool.U, s.players.P1!.restrictedMana?.artifactSpell?.U]).toEqual([0, 1]);
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: bear })).toBeTruthy();
    s = drain(cast(s, { type: 'CastSpell', player: 'P1', card: ring }).state);
    expect([zone(s, ring), s.players.P1!.restrictedMana?.artifactSpell?.U ?? 0]).toEqual(['battlefield', 0]);

    let t = newGame();
    const op2 = put(t, 'P1', 'steelswarm-operator');
    const block = put(t, 'P1', 'nutrient-block');
    const ring2 = put(t, 'P1', 'sol-ring', 'hand');
    t = goTo(t, 'main1');
    t = drain(cast(t, { type: 'ActivateAbility', player: 'P1', card: op2, ability: 0 }).state);
    expect(t.players.P1!.restrictedMana?.artifactAbility?.U).toBe(2);
    expect(rejected(t, { type: 'CastSpell', player: 'P1', card: ring2 })).toBeTruthy();
    t = drain(cast(t, { type: 'ActivateAbility', player: 'P1', card: block, ability: 0 }).state);
    expect(zone(t, block)).toBe('graveyard');
  });

  it('Mmmenon: your artifacts tap for {U} that only pays for spells from outside your hand, like an artifact off the top of your library', () => {
    let s = newGame();
    put(s, 'P1', 'mmmenon-the-right-hand');
    const rock = put(s, 'P1', 'nutrient-block');
    const inHand = put(s, 'P1', 'sol-ring', 'hand');
    s = goTo(s, 'main1');
    const top = put(s, 'P1', 'sol-ring', 'library');
    s.players.P1!.library = [top, ...s.players.P1!.library.filter((id) => id !== top)];
    const grant = getLegalActions(s).find((a) => a.type === 'ActivateManaAbility' && a.card === rock && a.grantedBy)!;
    expect(grant).toBeTruthy();
    s = act(s, grant);
    expect(s.players.P1!.restrictedMana?.notFromHand?.U).toBe(1);
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: inHand })).toBeTruthy();
    s = drain(cast(s, { type: 'CastSpell', player: 'P1', card: top }).state);
    expect(zone(s, top)).toBe('battlefield');
  });

  it('Moonlit Meditation: the first tokens you create each turn are copies of the enchanted permanent instead', () => {
    let s = newGame();
    const aura = put(s, 'P1', 'moonlit-meditation', 'hand');
    const host = put(s, 'P1', 'icecave-crasher');
    const knight = put(s, 'P1', 'knight-luminary', 'hand');
    const captain = put(s, 'P1', 'honored-knight-captain', 'hand');
    s = goTo(s, 'main1');
    mana(s, 'P1', { U: 1, W: 3, C: 6 });
    s = drain(cast(s, { type: 'CastSpell', player: 'P1', card: aura, targets: [card(host)] }).state);
    s = drain(cast(s, { type: 'CastSpell', player: 'P1', card: knight }).state);
    const tokens = () => s.players.P1!.battlefield.filter((id) => s.cards[id]!.isToken).map((id) => currentDefinition(s, s.cards[id]!).name);
    expect(tokens()).toEqual(['Icecave Crasher']);
    s = drain(cast(s, { type: 'CastSpell', player: 'P1', card: captain }).state);
    expect(tokens().sort()).toEqual(['Human Soldier', 'Icecave Crasher']);
  });

  it('Lightstall Inquisitor: each opponent exiles a card they may still play, a spell for {1} more and a land tapped', () => {
    let s = newGame();
    const inq = put(s, 'P1', 'lightstall-inquisitor', 'hand');
    s.players.P2!.hand = [];
    const ring = put(s, 'P2', 'sol-ring', 'hand');
    s = goTo(s, 'main1');
    mana(s, 'P1', { W: 1 });
    s = drain(cast(s, { type: 'CastSpell', player: 'P1', card: inq }).state);
    if (s.pending.kind === 'chooseCards') s = drain(settle(act(s, { type: 'ChooseCards', player: 'P2', cards: [ring] })).state);
    expect([zone(s, ring), s.cards[ring]!.playableFromExile?.costMore]).toEqual(['exile', 1]);
    s = goTo(goTo(s, 'end'), 'main1');
    expect(s.activePlayer).toBe('P2');
    mana(s, 'P2', { C: 1 });
    expect(rejected(s, { type: 'CastSpell', player: 'P2', card: ring })).toBeTruthy();
    mana(s, 'P2', { C: 1 });
    s = drain(cast(s, { type: 'CastSpell', player: 'P2', card: ring }).state);
    expect(zone(s, ring)).toBe('battlefield');

    let t = newGame();
    const inq2 = put(t, 'P1', 'lightstall-inquisitor', 'hand');
    t.players.P2!.hand = [];
    const land = put(t, 'P2', 'forest', 'hand');
    t = goTo(t, 'main1');
    mana(t, 'P1', { W: 1 });
    t = drain(cast(t, { type: 'CastSpell', player: 'P1', card: inq2 }).state);
    if (t.pending.kind === 'chooseCards') t = drain(settle(act(t, { type: 'ChooseCards', player: 'P2', cards: [land] })).state);
    t = goTo(goTo(t, 'end'), 'main1');
    t = cast(t, { type: 'PlayLand', player: 'P2', card: land }).state;
    expect([zone(t, land), t.cards[land]!.tapped]).toEqual(['battlefield', true]);
  });
});

// Planeswalkers: Tezzeret, Cruel Captain.
describe('Planeswalkers: Tezzeret, Cruel Captain', () => {
  const pick = (id: string) => ({ targets: (o: { kind: string; card?: string }[][]) => o.find((t) => t[0]?.kind === 'card' && t[0].card === id)! }) as never;
  const drain = (s: GameState, opts: never = {} as never) => {
    for (let i = 0; i < 6 && s.stack.length > 0 && s.pending.kind === 'priority'; i++) s = settle(act(s, { type: 'PassPriority', player: s.pending.player }), opts).state;
    return s;
  };
  const loyalty = (s: GameState, id: string) => s.cards[id]!.namedCounters?.loyalty ?? 0;

  it('enters with 4 loyalty, gains one for each artifact, and uses one loyalty ability a turn at sorcery speed', () => {
    let s = newGame();
    const tez = put(s, 'P1', 'tezzeret-cruel-captain', 'hand');
    const ring = put(s, 'P1', 'sol-ring', 'hand');
    const robot = put(s, 'P1', 'roving-actuator', 'battlefield', { tapped: true });
    s = goTo(s, 'main1');
    mana(s, 'P1', { C: 4 });
    s = drain(cast(s, { type: 'CastSpell', player: 'P1', card: tez }).state);
    expect([zone(s, tez), loyalty(s, tez)]).toEqual(['battlefield', 4]);
    s = drain(cast(s, { type: 'CastSpell', player: 'P1', card: ring }).state);
    expect(loyalty(s, tez)).toBe(5);
    // 0: untap an artifact creature and give it a counter.
    s = drain(cast(s, { type: 'ActivateAbility', player: 'P1', card: tez, ability: 0, targets: [card(robot)] }).state);
    expect([s.cards[robot]!.tapped, s.cards[robot]!.counters, loyalty(s, tez)]).toEqual([false, 1, 5]);
    expect(rejected(s, { type: 'ActivateAbility', player: 'P1', card: tez, ability: 1 })).toMatch(/one loyalty ability/i);
    expect(rejected(s, { type: 'ActivateAbility', player: 'P1', card: tez, ability: 2 })).toBeTruthy();
  });

  it('−3 searches for a cheap artifact; −7 gives an emblem that grows an artifact each combat and animates it', () => {
    let s = newGame();
    const tez = put(s, 'P1', 'tezzeret-cruel-captain', 'battlefield', { namedCounters: { loyalty: 7 } } as never);
    const ring = put(s, 'P1', 'sol-ring');
    s = goTo(s, 'main1');
    put(s, 'P1', 'sol-ring', 'library');
    const hand = s.players.P1!.hand.length;
    let t = drain(cast(s, { type: 'ActivateAbility', player: 'P1', card: tez, ability: 1 }).state);
    expect([loyalty(t, tez), t.players.P1!.hand.length]).toEqual([4, hand + 1]);
    t = drain(cast(s, { type: 'ActivateAbility', player: 'P1', card: tez, ability: 2 }).state);
    // At 0 loyalty he's put into the graveyard; the emblem stays.
    expect(zone(t, tez)).toBe('graveyard');
    t = goTo(t, 'beginCombat', pick(ring));
    t = drain(settle(t, pick(ring)).state, pick(ring));
    expect([t.cards[ring]!.counters, powerOf(t, t.cards[ring]!), currentDefinition(t, t.cards[ring]!).types.includes('creature')]).toEqual([3, 3, true]);
  });

  it('damage removes loyalty: from a spell with any target, and from a creature that attacks him instead of the player', () => {
    let s = newGame();
    const tez = put(s, 'P2', 'tezzeret-cruel-captain', 'battlefield', { namedCounters: { loyalty: 4 } } as never);
    const bolt = put(s, 'P1', 'plasma-bolt', 'hand');
    const bear = put(s, 'P1', 'meltstrider-eulogist');
    s = goTo(s, 'main1');
    mana(s, 'P1', { R: 1 });
    s = drain(cast(s, { type: 'CastSpell', player: 'P1', card: bolt, targets: [card(tez)] }).state);
    expect(loyalty(s, tez)).toBe(2);
    s = goTo(s, 'declareAttackers');
    const life = s.players.P2!.life;
    expect(rejected(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: bear, defender: 'P2', planeswalker: bear }] })).toBeTruthy();
    s = act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: bear, defender: 'P2', planeswalker: tez }] });
    for (let i = 0; i < 40 && s.step !== 'main2'; i++) {
      const p = s.pending;
      if (p.kind === 'declareBlockers') s = act(s, { type: 'DeclareBlockers', player: p.player, blocks: [] });
      else if (p.kind === 'priority') s = act(s, { type: 'PassPriority', player: p.player });
      else s = settle(s).state;
    }
    expect([zone(s, tez), s.players.P2!.life]).toEqual(['graveyard', life]);
  });
});
