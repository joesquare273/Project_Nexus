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
