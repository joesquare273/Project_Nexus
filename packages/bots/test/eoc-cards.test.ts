// Edge of Eternities precon cards, built group by group (docs/commander.md).
// Group 1: station and the Spacecraft (Inspirit, Flagship Vessel; Uthros
// Research Craft; Hearthhull, the Worldseed; Exploration Broodship).

import { describe, expect, it } from 'vitest';
import { activatedAbilities, currentDefinition, getLegalActions, hasKeyword, powerOf, type CardInstance, type GameState } from '@nexus/engine';

const hasType = (s: GameState, c: CardInstance, t: string) => (currentDefinition(s, c).types as string[]).includes(t);
import { act, card, cast, goTo, mana, newGame, put, rejected, settle } from './kit-helpers.ts';

const charge = (s: GameState, id: string) => s.cards[id]!.namedCounters?.charge ?? 0;
/** The Station ability's index on a card (it comes after the printed activated abilities). */
const stationIndex = (s: GameState, id: string) => activatedAbilities(currentDefinition(s, s.cards[id]!)).findIndex((a) => a.cost.station);

describe('Station', () => {
  it('tap another creature (even one that just arrived) as a sorcery: charge counters equal to its power', () => {
    let s = newGame();
    const ship = put(s, 'P1', 'inspirit-flagship-vessel');
    const cat = put(s, 'P1', 'coeurl', 'battlefield', { summoningSick: true });
    expect(hasType(s, s.cards[ship]!, 'creature')).toBe(false);
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: ship, ability: stationIndex(s, ship), costCards: [cat] }).state;
    expect(charge(s, ship)).toBe(powerOf(s, s.cards[cat]!));
    expect(s.cards[cat]!.tapped).toBe(true);
    // Not itself, not a tapped creature, and only as a sorcery.
    expect(rejected(s, { type: 'ActivateAbility', player: 'P1', card: ship, ability: stationIndex(s, ship), costCards: [cat] })).toBeTruthy();
    const other = put(s, 'P1', 'coeurl');
    s.step = 'beginCombat';
    expect(rejected(s, { type: 'ActivateAbility', player: 'P1', card: ship, ability: stationIndex(s, ship), costCards: [other] })).toMatch(/main phase/);
  });

  it('is offered as a legal play for each creature that could be tapped', () => {
    const s = newGame();
    const ship = put(s, 'P1', 'uthros-research-craft');
    const cats = [put(s, 'P1', 'coeurl'), put(s, 'P1', 'coeurl')];
    const ways = getLegalActions(s).filter((a) => a.type === 'ActivateAbility' && a.card === ship).map((a) => a.type === 'ActivateAbility' && a.costCards?.[0]);
    expect(ways.sort()).toEqual([...cats].sort());
  });
});

describe('Inspirit, Flagship Vessel', () => {
  it('at 8+ it is a 5/5 flying artifact creature, and your other artifacts have hexproof and indestructible', () => {
    const s = newGame();
    const ship = put(s, 'P1', 'inspirit-flagship-vessel', 'battlefield', { namedCounters: { charge: 7 } });
    const ring = put(s, 'P1', 'sol-ring');
    expect(hasType(s, s.cards[ship]!, 'creature')).toBe(false);
    expect(hasKeyword(s, s.cards[ring]!, 'Indestructible')).toBe(false);
    s.cards[ship]!.namedCounters = { charge: 8 };
    expect(hasType(s, s.cards[ship]!, 'creature')).toBe(true);
    expect(powerOf(s, s.cards[ship]!)).toBe(5);
    expect(hasKeyword(s, s.cards[ship]!, 'Flying')).toBe(true);
    expect(hasKeyword(s, s.cards[ring]!, 'Hexproof')).toBe(true);
    expect(hasKeyword(s, s.cards[ring]!, 'Indestructible')).toBe(true);
    expect(hasKeyword(s, s.cards[ship]!, 'Indestructible')).toBe(false);
  });

  it('at 1+, each combat on your turn: a +1/+1 counter or two charge counters on another artifact', () => {
    let s = newGame();
    put(s, 'P1', 'inspirit-flagship-vessel', 'battlefield', { namedCounters: { charge: 1 } });
    const other = put(s, 'P1', 'uthros-research-craft');
    s = goTo(s, 'beginCombat');
    expect(s.pending.kind).toBe('chooseModes');
    s = act(s, { type: 'ChooseModes', player: 'P1', modes: [1] });
    s = settle(s, { targets: (o) => o.find((t) => t[0]?.kind === 'card' && t[0].card === other)! }).state;
    for (let i = 0; i < 4 && s.pending.kind === 'priority' && s.stack.length; i++) s = act(s, { type: 'PassPriority', player: s.pending.player });
    expect(charge(s, other)).toBe(2);
  });

  it('without a charge counter, nothing happens at combat', () => {
    let s = newGame();
    put(s, 'P1', 'inspirit-flagship-vessel');
    put(s, 'P1', 'sol-ring');
    s = goTo(s, 'beginCombat');
    expect(s.stack).toHaveLength(0);
    expect(s.pending.kind).toBe('priority');
  });
});

describe('Uthros Research Craft', () => {
  it('at 3+, an artifact spell draws a card and adds a charge counter; at 12+ a flier with +1/+0 per artifact', () => {
    let s = newGame();
    const ship = put(s, 'P1', 'uthros-research-craft', 'battlefield', { namedCounters: { charge: 3 } });
    const ring = put(s, 'P1', 'sol-ring', 'hand');
    const hand = s.players.P1!.hand.length;
    mana(s, 'P1', { C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: ring }).state;
    expect(s.players.P1!.hand.length).toBe(hand); // Sol Ring left, a card came
    expect(charge(s, ship)).toBe(4);
    s.cards[ship]!.namedCounters = { charge: 12 };
    expect(hasType(s, s.cards[ship]!, 'creature')).toBe(true);
    expect(hasKeyword(s, s.cards[ship]!, 'Flying')).toBe(true);
    // Two artifacts: itself and Sol Ring.
    expect(powerOf(s, s.cards[ship]!)).toBe(2);
  });

  it('below 3 charge counters, artifact spells do nothing', () => {
    let s = newGame();
    const ship = put(s, 'P1', 'uthros-research-craft', 'battlefield', { namedCounters: { charge: 2 } });
    const ring = put(s, 'P1', 'sol-ring', 'hand');
    mana(s, 'P1', { C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: ring }).state;
    expect(charge(s, ship)).toBe(2);
  });
});

describe('Hearthhull, the Worldseed', () => {
  it('at 2+: {1}, {T}, sacrifice a land: draw two, and play an additional land this turn', () => {
    let s = newGame();
    const ship = put(s, 'P1', 'hearthhull-the-worldseed', 'battlefield', { namedCounters: { charge: 1 } });
    const land = put(s, 'P1', 'forest');
    mana(s, 'P1', { C: 1 });
    expect(rejected(s, { type: 'ActivateAbility', player: 'P1', card: ship, ability: 0, costCards: [land] })).toMatch(/2 or more charge/);
    s.cards[ship]!.namedCounters = { charge: 2 };
    const hand = s.players.P1!.hand.length;
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: ship, ability: 0, costCards: [land] }).state;
    expect(s.cards[land]!.zone).toBe('graveyard');
    expect(s.players.P1!.hand.length).toBe(hand + 2);
    const lands = [put(s, 'P1', 'forest', 'hand'), put(s, 'P1', 'forest', 'hand')];
    s = act(s, { type: 'PlayLand', player: 'P1', card: lands[0]! });
    s = act(s, { type: 'PlayLand', player: 'P1', card: lands[1]! });
    expect(lands.map((id) => s.cards[id]!.zone)).toEqual(['battlefield', 'battlefield']);
  });

  it('at 8+: a flying, vigilant, hasty creature, and each land you sacrifice drains each opponent for 2', () => {
    let s = newGame(3);
    const ship = put(s, 'P1', 'hearthhull-the-worldseed', 'battlefield', { namedCounters: { charge: 8 }, summoningSick: true });
    const land = put(s, 'P1', 'forest');
    expect(hasType(s, s.cards[ship]!, 'creature')).toBe(true);
    for (const k of ['Flying', 'Vigilance', 'Haste'] as const) expect(hasKeyword(s, s.cards[ship]!, k)).toBe(true);
    const life = [s.players.P2!.life, s.players.P3!.life];
    mana(s, 'P1', { C: 1 });
    // Haste: its {T} ability works the turn it arrives.
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: ship, ability: 0, costCards: [land] }).state;
    expect([s.players.P2!.life, s.players.P3!.life]).toEqual([life[0]! - 2, life[1]! - 2]);
  });
});

describe('Exploration Broodship', () => {
  it('at 3+: an additional land each of your turns', () => {
    let s = newGame();
    put(s, 'P1', 'exploration-broodship', 'battlefield', { namedCounters: { charge: 3 } });
    const lands = [put(s, 'P1', 'forest', 'hand'), put(s, 'P1', 'forest', 'hand'), put(s, 'P1', 'forest', 'hand')];
    s = act(s, { type: 'PlayLand', player: 'P1', card: lands[0]! });
    s = act(s, { type: 'PlayLand', player: 'P1', card: lands[1]! });
    expect(rejected(s, { type: 'PlayLand', player: 'P1', card: lands[2]! })).toMatch(/already played/);
  });

  it('at 8+: once each turn, a permanent spell from your graveyard by sacrificing a land too', () => {
    let s = newGame();
    const ship = put(s, 'P1', 'exploration-broodship', 'battlefield', { namedCounters: { charge: 8 } });
    const cats = [put(s, 'P1', 'coeurl', 'graveyard'), put(s, 'P1', 'coeurl', 'graveyard')];
    const land = put(s, 'P1', 'forest');
    const bolt = put(s, 'P1', 'lightning-bolt', 'graveyard');
    mana(s, 'P1', { W: 1, C: 1 });
    // A land is part of the cost: without one it's refused.
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: cats[0]!, graveyardSource: ship })).toMatch(/Sacrifice a land/);
    expect(getLegalActions(s).some((a) => a.type === 'CastSpell' && a.card === bolt)).toBe(false);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: cats[0]!, graveyardSource: ship, sacrificeLand: land }).state;
    expect(s.cards[cats[0]!]!.zone).toBe('battlefield');
    expect(s.cards[land]!.zone).toBe('graveyard');
    // Once each turn.
    put(s, 'P1', 'forest');
    mana(s, 'P1', { W: 1, C: 1 });
    expect(getLegalActions(s).some((a) => a.type === 'CastSpell' && a.card === cats[1])).toBe(false);
  });
});

void card;

// Group 2: lands sacrificed, and landfall.
describe('E2: sacrificing lands', () => {
  const tokens = (s: GameState, defId: string, who = 'P1') => s.players[who]!.battlefield.filter((id) => s.cards[id]!.defId === defId);
  const libraryOf = (s: GameState, ids: string[]) => { s.players.P1!.library = [...ids, ...s.players.P1!.library.filter((x) => !ids.includes(x))]; };

  it('Hammer of Purphoros: your creatures have haste; {2}{R}, {T}, sacrifice a land: a 3/3 Golem', () => {
    let s = newGame();
    const hammer = put(s, 'P1', 'hammer-of-purphoros');
    const cat = put(s, 'P1', 'coeurl', 'battlefield', { summoningSick: true });
    const land = put(s, 'P1', 'forest');
    expect(hasKeyword(s, s.cards[cat]!, 'Haste')).toBe(true);
    mana(s, 'P1', { R: 1, C: 2 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: hammer, ability: 0, costCards: [land] }).state;
    expect(s.cards[land]!.zone).toBe('graveyard');
    const golem = tokens(s, 'golem-enchantment-token-eoc');
    expect(golem).toHaveLength(1);
    expect(currentDefinition(s, s.cards[golem[0]!]!).types).toEqual(['enchantment', 'artifact', 'creature']);
  });

  it('Uurg: power equal to the land cards in your graveyard; {B}{G}, sacrifice a land: 2 life', () => {
    let s = newGame();
    const uurg = put(s, 'P1', 'uurg-spawn-of-turg');
    put(s, 'P1', 'forest', 'graveyard');
    put(s, 'P1', 'coeurl', 'graveyard');
    expect(powerOf(s, s.cards[uurg]!)).toBe(1);
    const land = put(s, 'P1', 'swamp');
    const life = s.players.P1!.life;
    mana(s, 'P1', { B: 1, G: 1 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: uurg, ability: 0, costCards: [land] }).state;
    expect(s.players.P1!.life).toBe(life + 2);
    expect(powerOf(s, s.cards[uurg]!)).toBe(2);
  });

  it('Sprouting Goblin: kicked, it finds a land with a basic land type; not kicked, nothing', () => {
    for (const kicked of [true, false]) {
      let s = newGame();
      const goblin = put(s, 'P1', 'sprouting-goblin', 'hand');
      const forest = put(s, 'P1', 'forest', 'library');
      mana(s, 'P1', { R: 1, G: 1, C: 1 });
      s = cast(s, { type: 'CastSpell', player: 'P1', card: goblin, ...(kicked ? { kicks: 1 } : {}) }).state;
      expect(s.cards[forest]!.zone).toBe(kicked ? 'hand' : 'library');
    }
  });

  it('Baloth Prime: enters tapped with six stun counters; each land you sacrifice makes a tapped 4/4 Beast and untaps it', () => {
    let s = newGame();
    const baloth = put(s, 'P1', 'baloth-prime', 'hand');
    mana(s, 'P1', { G: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: baloth }).state;
    expect(s.cards[baloth]!.tapped).toBe(true);
    expect(s.cards[baloth]!.namedCounters?.stun).toBe(6);
    const land = put(s, 'P1', 'forest');
    mana(s, 'P1', { C: 4 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: baloth, ability: 0, costCards: [land] }).state;
    const beasts = tokens(s, 'beast-token-eoc');
    expect(beasts).toHaveLength(1);
    expect(s.cards[beasts[0]!]!.tapped).toBe(true);
    // Untapping with a stun counter removes one instead (rule 122.1d).
    expect(s.cards[baloth]!.namedCounters?.stun).toBe(5);
  });

  it('Harrow: sacrifice a land as you cast it for two basic lands untapped; Roiling Regrowth, tapped', () => {
    let s = newGame();
    const harrow = put(s, 'P1', 'harrow', 'hand');
    const land = put(s, 'P1', 'forest');
    const basics = [put(s, 'P1', 'forest', 'library'), put(s, 'P1', 'island', 'library')];
    mana(s, 'P1', { G: 1, C: 2 });
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: harrow, costCards: [land] })).state;
    expect(s.cards[land]!.zone).toBe('graveyard');
    expect(basics.map((id) => [s.cards[id]!.zone, s.cards[id]!.tapped])).toEqual([['battlefield', false], ['battlefield', false]]);
    let t = newGame();
    const regrowth = put(t, 'P1', 'roiling-regrowth', 'hand');
    const own = put(t, 'P1', 'forest');
    const more = [put(t, 'P1', 'forest', 'library'), put(t, 'P1', 'forest', 'library')];
    mana(t, 'P1', { G: 1, C: 2 });
    t = settle(act(t, { type: 'CastSpell', player: 'P1', card: regrowth })).state;
    for (let i = 0; i < 3 && t.pending.kind === 'chooseCards'; i++) t = settle(act(t, { type: 'ChooseCards', player: 'P1', cards: t.pending.cards.slice(0, Math.max(t.pending.min, Math.min(2, t.pending.max))) })).state;
    expect(t.cards[own]!.zone).toBe('graveyard');
    expect(more.map((id) => [t.cards[id]!.zone, t.cards[id]!.tapped])).toEqual([['battlefield', true], ['battlefield', true]]);
  });

  it('Springbloom Druid: if you sacrifice a land as it enters, two basic lands tapped; if not, none', () => {
    for (const sac of [true, false]) {
      let s = newGame();
      const druid = put(s, 'P1', 'springbloom-druid', 'hand');
      const land = put(s, 'P1', 'forest');
      const basics = [put(s, 'P1', 'forest', 'library'), put(s, 'P1', 'forest', 'library')];
      mana(s, 'P1', { G: 1, C: 2 });
      s = cast(s, { type: 'CastSpell', player: 'P1', card: druid }).state;
      expect(s.pending).toMatchObject({ kind: 'chooseCards', min: 0 });
      s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: sac ? [land] : [] })).state;
      if (s.pending.kind === 'chooseCards') s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: s.pending.cards.slice(0, 2) })).state;
      expect(s.cards[land]!.zone).toBe(sac ? 'graveyard' : 'battlefield');
      expect(basics.filter((id) => s.cards[id]!.zone === 'battlefield')).toHaveLength(sac ? 2 : 0);
    }
  });

  it('Scouring Swarm: a sacrificed land makes a tapped 1/1 flying Insect, or a copy with seven land cards in your graveyard', () => {
    for (const lands of [0, 7]) {
      let s = newGame();
      const swarm = put(s, 'P1', 'scouring-swarm');
      for (let i = 0; i < lands; i++) put(s, 'P1', 'forest', 'graveyard');
      const hammer = put(s, 'P1', 'hammer-of-purphoros');
      const land = put(s, 'P1', 'forest');
      mana(s, 'P1', { R: 1, C: 2 });
      s = cast(s, { type: 'ActivateAbility', player: 'P1', card: hammer, ability: 0, costCards: [land] }).state;
      const copies = s.players.P1!.battlefield.filter((id) => id !== swarm && s.cards[id]!.defId === 'scouring-swarm');
      expect(copies).toHaveLength(lands >= 7 ? 1 : 0);
      expect(tokens(s, 'insect-token-eoc')).toHaveLength(lands >= 7 ? 0 : 1);
      for (const id of [...copies, ...tokens(s, 'insect-token-eoc')]) expect(s.cards[id]!.tapped).toBe(true);
    }
  });
});

describe('E2: landfall and lands leaving', () => {
  const tokens = (s: GameState, defId: string) => s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === defId);

  it('Rampaging Baloths: a land entering makes a 4/4 Beast; Omnath, a 5/5 Elemental', () => {
    let s = newGame();
    put(s, 'P1', 'rampaging-baloths');
    put(s, 'P1', 'omnath-locus-of-rage');
    const land = put(s, 'P1', 'forest', 'hand');
    s = settle(act(s, { type: 'PlayLand', player: 'P1', card: land })).state;
    expect(tokens(s, 'beast-token-eoc')).toHaveLength(1);
    expect(tokens(s, 'elemental-5-5-token-eoc')).toHaveLength(1);
  });

  it('Omnath: when it or another Elemental you control dies, 3 damage to any target', () => {
    let s = newGame();
    const omnath = put(s, 'P1', 'omnath-locus-of-rage');
    const life = s.players.P2!.life;
    s.cards[omnath]!.damage = 99;
    s = settle(act(s, { type: 'PassPriority', player: 'P1' }), { targets: (o) => o.find((t) => t[0]?.kind === 'player' && t[0].player === 'P2')! }).state;
    expect(s.cards[omnath]!.zone).toBe('graveyard');
    expect(s.players.P2!.life).toBe(life - 3);
  });

  it('Titania: returns a land card from your graveyard; each land you control going to a graveyard makes a 5/3 Elemental', () => {
    let s = newGame();
    const old = put(s, 'P1', 'forest', 'graveyard');
    const titania = put(s, 'P1', 'titania-protector-of-argoth', 'hand');
    mana(s, 'P1', { G: 2, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: titania }, { targets: (o) => o.find((t) => t[0]?.kind === 'card' && t[0].card === old)! }).state;
    expect(s.cards[old]!.zone).toBe('battlefield');
    const hammer = put(s, 'P1', 'hammer-of-purphoros');
    mana(s, 'P1', { R: 1, C: 2 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: hammer, ability: 0, costCards: [old] }).state;
    expect(tokens(s, 'elemental-5-3-token-eoc')).toHaveLength(1);
  });
});
