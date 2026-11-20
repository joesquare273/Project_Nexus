// Edge of Eternities precon cards, built group by group (docs/commander.md).
// Group 1: station and the Spacecraft (Inspirit, Flagship Vessel; Uthros
// Research Craft; Hearthhull, the Worldseed; Exploration Broodship). Later
// groups follow below (E2-E5, docs/commander.md).

import { describe, expect, it } from 'vitest';
import { activatedAbilities, applyAction, currentDefinition, getLegalActions, hasFlag, hasKeyword, powerOf, type CardInstance, type GameState } from '@nexus/engine';
import { viewFor } from '../../engine/src/view.ts';

const hasType = (s: GameState, c: CardInstance, t: string) => (currentDefinition(s, c).types as string[]).includes(t);
import { act, card, cast, fight, goTo, mana, newGame, put, rejected, settle } from './kit-helpers.ts';
import { planTaps } from '../src/mana.ts';
import { moveCard } from '../../engine/src/state.ts';
import { basicAi } from '../src/index.ts';

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

  it('Sprouting Goblin: a land with a basic land type, two-type lands included; never one without', () => {
    let s = newGame();
    const goblin = put(s, 'P1', 'sprouting-goblin', 'hand');
    const typed = [put(s, 'P1', 'canyon-slough', 'library'), put(s, 'P1', 'forest', 'library')];
    const untyped = ['evolving-wilds', 'command-tower', 'myriad-landscape'].map((id) => put(s, 'P1', id, 'library'));
    mana(s, 'P1', { R: 1, G: 1, C: 1 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: goblin, kicks: 1 });
    for (let i = 0; i < 30 && s.pending.kind !== 'chooseCards'; i++) s = act(s, getLegalActions(s).find((a) => a.type === 'PassPriority') ?? getLegalActions(s)[0]!);
    const offered = s.pending.kind === 'chooseCards' ? s.pending.cards : [];
    expect(typed.every((id) => offered.includes(id))).toBe(true);
    expect(untyped.some((id) => offered.includes(id))).toBe(false);
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

// Group 3: removal, board wipes and lands.
describe('E3: removal and board wipes', () => {
  const all = (s: GameState, defId: string) => Object.values(s.cards).filter((c) => c.zone === 'battlefield' && c.defId === defId);

  it('Infernal Grasp destroys a creature and you lose 2; Putrefy an artifact or creature', () => {
    let s = newGame();
    const cat = put(s, 'P2', 'coeurl');
    const grasp = put(s, 'P1', 'infernal-grasp', 'hand');
    const life = s.players.P1!.life;
    mana(s, 'P1', { B: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: grasp, targets: [card(cat)] }).state;
    expect(s.cards[cat]!.zone).toBe('graveyard');
    expect(s.players.P1!.life).toBe(life - 2);
    const ring = put(s, 'P2', 'sol-ring');
    const putrefy = put(s, 'P1', 'putrefy', 'hand');
    mana(s, 'P1', { B: 1, G: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: putrefy, targets: [card(ring)] }).state;
    expect(s.cards[ring]!.zone).toBe('graveyard');
  });

  it('Beast Within: destroy any permanent; its controller gets a 3/3 Beast', () => {
    let s = newGame();
    const land = put(s, 'P2', 'forest');
    const spell = put(s, 'P1', 'beast-within', 'hand');
    mana(s, 'P1', { G: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(land)] }).state;
    expect(s.cards[land]!.zone).toBe('graveyard');
    expect(all(s, 'beast-3-3-token-eoc').map((c) => c.controller)).toEqual(['P2']);
  });

  it('Swan Song counters an instant, sorcery or enchantment spell; its controller gets a 2/2 flying Bird', () => {
    let s = newGame();
    const bolt = put(s, 'P2', 'lightning-bolt', 'hand');
    s.activePlayer = 'P2';
    s.pending = { kind: 'priority', player: 'P2', passes: 0 };
    mana(s, 'P2', { R: 1 });
    s = act(s, { type: 'CastSpell', player: 'P2', card: bolt, targets: [{ kind: 'player', player: 'P1' }] });
    s = act(s, { type: 'PassPriority', player: 'P2' });
    const song = put(s, 'P1', 'swan-song', 'hand');
    mana(s, 'P1', { U: 1 });
    const life = s.players.P1!.life;
    s = act(s, { type: 'CastSpell', player: 'P1', card: song, targets: [card(bolt)] });
    s = settle(s).state;
    expect(s.cards[bolt]!.zone).toBe('graveyard');
    expect(s.players.P1!.life).toBe(life);
    expect(all(s, 'bird-token-eoc').map((c) => c.controller)).toEqual(['P2']);
    // Not a creature spell.
    const cat = put(s, 'P2', 'coeurl', 'hand');
    s.pending = { kind: 'priority', player: 'P2', passes: 0 };
    mana(s, 'P2', { W: 1, C: 1 });
    s = act(s, { type: 'CastSpell', player: 'P2', card: cat });
    s = act(s, { type: 'PassPriority', player: 'P2' });
    const song2 = put(s, 'P1', 'swan-song', 'hand');
    mana(s, 'P1', { U: 1 });
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: song2, targets: [card(cat)] })).toBeTruthy();
  });

  it('Fumigate destroys all creatures and gains 1 life for each; Organic Extinction spares artifact creatures', () => {
    let s = newGame();
    for (let i = 0; i < 3; i++) put(s, i % 2 ? 'P1' : 'P2', 'coeurl');
    const spell = put(s, 'P1', 'fumigate', 'hand');
    const life = s.players.P1!.life;
    mana(s, 'P1', { W: 2, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell }).state;
    expect(all(s, 'coeurl')).toHaveLength(0);
    expect(s.players.P1!.life).toBe(life + 3);
    let t = newGame();
    const cat = put(t, 'P2', 'coeurl');
    const bot = put(t, 'P2', 'armory-automaton');
    const ext = put(t, 'P1', 'organic-extinction', 'hand');
    mana(t, 'P1', { W: 2, C: 8 });
    t = cast(t, { type: 'CastSpell', player: 'P1', card: ext }).state;
    expect([t.cards[cat]!.zone, t.cards[bot]!.zone]).toEqual(['graveyard', 'battlefield']);
  });

  it('Blasphemous Act costs {1} less per creature and deals 13 to each; Chain Reaction deals the number of creatures', () => {
    let s = newGame();
    for (let i = 0; i < 4; i++) put(s, 'P2', 'coeurl');
    const act13 = put(s, 'P1', 'blasphemous-act', 'hand');
    mana(s, 'P1', { R: 1, C: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: act13 }).state;
    expect(all(s, 'coeurl')).toHaveLength(0);
    let t = newGame();
    const big = put(t, 'P2', 'baloth-prime');
    const cats = [put(t, 'P1', 'coeurl'), put(t, 'P2', 'coeurl')];
    const chain = put(t, 'P1', 'chain-reaction', 'hand');
    mana(t, 'P1', { R: 2, C: 2 });
    t = cast(t, { type: 'CastSpell', player: 'P1', card: chain }).state;
    // Three creatures: 3 damage each.
    expect(cats.map((id) => t.cards[id]!.zone)).toEqual(['graveyard', 'graveyard']);
    expect(t.cards[big]!.damage).toBe(3);
  });

  it('Splendid Reclamation returns all your land cards tapped; Wake the Past your artifacts with haste', () => {
    let s = newGame();
    const lands = [put(s, 'P1', 'forest', 'graveyard'), put(s, 'P1', 'island', 'graveyard')];
    const cat = put(s, 'P1', 'coeurl', 'graveyard');
    const spell = put(s, 'P1', 'splendid-reclamation', 'hand');
    mana(s, 'P1', { G: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell }).state;
    expect(lands.map((id) => [s.cards[id]!.zone, s.cards[id]!.tapped])).toEqual([['battlefield', true], ['battlefield', true]]);
    expect(s.cards[cat]!.zone).toBe('graveyard');
    let t = newGame();
    const bot = put(t, 'P1', 'armory-automaton', 'graveyard');
    const wake = put(t, 'P1', 'wake-the-past', 'hand');
    mana(t, 'P1', { R: 1, W: 1, C: 5 });
    t = cast(t, { type: 'CastSpell', player: 'P1', card: wake }).state;
    expect(t.cards[bot]!.zone).toBe('battlefield');
    expect(hasKeyword(t, t.cards[bot]!, 'Haste')).toBe(true);
  });
});

describe('E3: lands', () => {
  it('the Bridges enter tapped, are indestructible and tap for either color', () => {
    let s = newGame();
    const bridge = put(s, 'P1', 'razortide-bridge', 'hand');
    s = act(s, { type: 'PlayLand', player: 'P1', card: bridge });
    expect(s.cards[bridge]!.tapped).toBe(true);
    expect(hasKeyword(s, s.cards[bridge]!, 'Indestructible')).toBe(true);
    s.cards[bridge]!.tapped = false;
    const colors = getLegalActions(s).filter((a) => a.type === 'ActivateManaAbility' && a.card === bridge).map((a) => (a as { mana: string }).mana);
    expect(colors.sort()).toEqual(['U', 'W']);
  });

  it('filter lands and Viridescent Bog: pay to make two mana', () => {
    let s = newGame();
    const mire = put(s, 'P1', 'twilight-mire');
    const bog = put(s, 'P1', 'viridescent-bog');
    mana(s, 'P1', { B: 1, C: 1 });
    s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: mire, mana: 'B', output: 1, payWith: 0 });
    expect([s.players.P1!.manaPool.B, s.players.P1!.manaPool.G]).toEqual([1, 1]);
    s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: bog, mana: 'B', output: 0, payWith: 0 });
    expect([s.players.P1!.manaPool.B, s.players.P1!.manaPool.G, s.players.P1!.manaPool.C]).toEqual([2, 2, 0]);
  });

  it('Mountain Valley fetches a Mountain or Forest untapped; Escape Tunnel a basic tapped, or makes a small creature unblockable', () => {
    let s = newGame();
    const valley = put(s, 'P1', 'mountain-valley');
    const forest = put(s, 'P1', 'forest', 'library');
    s = settle(act(s, { type: 'ActivateAbility', player: 'P1', card: valley, ability: 0 })).state;
    expect([s.cards[valley]!.zone, s.cards[forest]!.zone, s.cards[forest]!.tapped]).toEqual(['graveyard', 'battlefield', false]);
    let t = newGame();
    const tunnel = put(t, 'P1', 'escape-tunnel');
    const cat = put(t, 'P1', 'coeurl');
    t = cast(t, { type: 'ActivateAbility', player: 'P1', card: tunnel, ability: 1, targets: [card(cat)] }).state;
    expect(t.cards[tunnel]!.zone).toBe('graveyard');
    expect(t.temporaryEffects.some((e) => e.affected === cat && e.flags?.includes('cantBeBlocked'))).toBe(true);
  });

  it('Bojuka Bog exiles a graveyard; Buried Ruin returns an artifact card; Karn’s Bastion proliferates', () => {
    let s = newGame();
    const dead = [put(s, 'P2', 'coeurl', 'graveyard'), put(s, 'P2', 'forest', 'graveyard')];
    const bog = put(s, 'P1', 'bojuka-bog', 'hand');
    s = settle(act(s, { type: 'PlayLand', player: 'P1', card: bog }), { targets: (o) => o.find((x) => x[0]?.kind === 'player' && x[0].player === 'P2')! }).state;
    expect(dead.map((id) => s.cards[id]!.zone)).toEqual(['exile', 'exile']);
    const ruin = put(s, 'P1', 'buried-ruin');
    const ring = put(s, 'P1', 'sol-ring', 'graveyard');
    mana(s, 'P1', { C: 2 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: ruin, ability: 0, targets: [card(ring)] }).state;
    expect(s.cards[ring]!.zone).toBe('hand');
    const bastion = put(s, 'P1', 'karns-bastion');
    const ship = put(s, 'P1', 'uthros-research-craft', 'battlefield', { namedCounters: { charge: 2 } });
    mana(s, 'P1', { C: 4 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: bastion, ability: 0 }).state;
    expect(s.cards[ship]!.namedCounters?.charge).toBe(3);
  });

  it('the Courtyards: sacrificed as they enter, then a basic of their types tapped and 1 life', () => {
    let s = newGame();
    const court = put(s, 'P1', 'cabaretti-courtyard', 'hand');
    const plains = put(s, 'P1', 'plains', 'library');
    const life = s.players.P1!.life;
    s = settle(act(s, { type: 'PlayLand', player: 'P1', card: court })).state;
    expect(s.cards[court]!.zone).toBe('graveyard');
    expect([s.cards[plains]!.zone, s.cards[plains]!.tapped]).toEqual(['battlefield', true]);
    expect(s.players.P1!.life).toBe(life + 1);
  });
});

// Group 4: counters and proliferate.
describe('E4: proliferate', () => {
  it('Kilo proliferates whenever it becomes tapped (attacking, here); a permanent that enters tapped doesn’t count', () => {
    let s = newGame();
    const kilo = put(s, 'P1', 'kilo-apogee-mind');
    const ship = put(s, 'P1', 'uthros-research-craft', 'battlefield', { namedCounters: { charge: 2 } });
    s = goTo(s, 'declareAttackers');
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: kilo, defender: 'P2' }] })).state;
    for (let i = 0; i < 4 && s.pending.kind === 'priority' && s.stack.length; i++) s = act(s, { type: 'PassPriority', player: s.pending.player });
    expect(charge(s, ship)).toBe(3);
  });

  it('Surge Conductor: another nontoken artifact of yours entering proliferates; Thrummingbird: combat damage to a player', () => {
    let s = newGame();
    put(s, 'P1', 'surge-conductor');
    const ship = put(s, 'P1', 'uthros-research-craft', 'battlefield', { namedCounters: { charge: 1 } });
    const ring = put(s, 'P1', 'sol-ring', 'hand');
    mana(s, 'P1', { C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: ring }).state;
    expect(charge(s, ship)).toBe(2);
    let t = newGame();
    const bird = put(t, 'P1', 'thrummingbird');
    const ship2 = put(t, 'P1', 'uthros-research-craft', 'battlefield', { namedCounters: { charge: 1 } });
    t = fight(t, [{ attacker: bird, defender: 'P2' }]).state;
    expect(charge(t, ship2)).toBe(2);
  });

  it('Experimental Augury: one of the top three to your hand, then proliferate', () => {
    let s = newGame();
    const top = [put(s, 'P1', 'coeurl', 'library'), put(s, 'P1', 'forest', 'library'), put(s, 'P1', 'island', 'library')];
    s.players.P1!.library = [...top, ...s.players.P1!.library.filter((x) => !top.includes(x))];
    const ship = put(s, 'P1', 'uthros-research-craft', 'battlefield', { namedCounters: { charge: 1 } });
    const augury = put(s, 'P1', 'experimental-augury', 'hand');
    mana(s, 'P1', { U: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: augury }).state;
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [top[0]!] })).state;
    expect(s.cards[top[0]!]!.zone).toBe('hand');
    expect(charge(s, ship)).toBe(2);
  });
});

describe('E4: charge counters', () => {
  const tokens = (s: GameState, defId: string) => s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === defId);

  it('Lux Cannon: {T}: a charge counter; {T}, remove three: destroy target permanent', () => {
    let s = newGame();
    const cannon = put(s, 'P1', 'lux-cannon', 'battlefield', { namedCounters: { charge: 2 } });
    const target = put(s, 'P2', 'coeurl');
    expect(rejected(s, { type: 'ActivateAbility', player: 'P1', card: cannon, ability: 1, targets: [card(target)] })).toMatch(/counters/);
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: cannon, ability: 0 }).state;
    expect(charge(s, cannon)).toBe(3);
    s.cards[cannon]!.tapped = false;
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: cannon, ability: 1, targets: [card(target)] }).state;
    expect(s.cards[target]!.zone).toBe('graveyard');
    expect(charge(s, cannon)).toBe(0);
  });

  it('Titan Forge makes a 9/9 Golem for three charge counters; Golem Foundry a 3/3 one, charging on artifact spells', () => {
    let s = newGame();
    const forge = put(s, 'P1', 'titan-forge', 'battlefield', { namedCounters: { charge: 3 } });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: forge, ability: 1 }).state;
    expect(tokens(s, 'golem-9-9-token-eoc')).toHaveLength(1);
    const foundry = put(s, 'P1', 'golem-foundry', 'battlefield', { namedCounters: { charge: 2 } });
    const ring = put(s, 'P1', 'sol-ring', 'hand');
    mana(s, 'P1', { C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: ring }, { accept: true }).state;
    expect(charge(s, foundry)).toBe(3);
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: foundry, ability: 0 }).state;
    expect(tokens(s, 'golem-3-3-token-eoc')).toHaveLength(1);
  });

  it('Coretapper charges another artifact; Steel Overseer grows your artifact creatures; Insight Engine draws per counter', () => {
    let s = newGame();
    const tapper = put(s, 'P1', 'coretapper');
    const cannon = put(s, 'P1', 'lux-cannon');
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: tapper, ability: 0, targets: [card(cannon)] }).state;
    expect(charge(s, cannon)).toBe(1);
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: tapper, ability: 1, targets: [card(cannon)] }).state;
    expect(charge(s, cannon)).toBe(3);
    const overseer = put(s, 'P1', 'steel-overseer');
    const bot = put(s, 'P1', 'armory-automaton');
    const cat = put(s, 'P1', 'coeurl');
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: overseer, ability: 0 }).state;
    expect([s.cards[bot]!.counters, s.cards[overseer]!.counters, s.cards[cat]!.counters ?? 0]).toEqual([1, 1, 0]);
    const engine = put(s, 'P1', 'insight-engine', 'battlefield', { namedCounters: { charge: 1 } });
    const hand = s.players.P1!.hand.length;
    mana(s, 'P1', { C: 2 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: engine, ability: 0 }).state;
    expect(s.players.P1!.hand.length).toBe(hand + 2);
  });

  it('Hangarback Walker enters with X counters and leaves that many Thopters; Mindless Automaton draws for two counters', () => {
    let s = newGame();
    const walker = put(s, 'P1', 'hangarback-walker', 'hand');
    mana(s, 'P1', { C: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: walker, x: 2 }).state;
    expect(s.cards[walker]!.counters).toBe(2);
    s.cards[walker]!.damage = 99;
    s = settle(act(s, { type: 'PassPriority', player: 'P1' })).state;
    expect(tokens(s, 'thopter-token-eoc')).toHaveLength(2);
    const automaton = put(s, 'P1', 'mindless-automaton', 'battlefield', { counters: 2 });
    const hand = s.players.P1!.hand.length;
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: automaton, ability: 1 }).state;
    expect(s.players.P1!.hand.length).toBe(hand + 1);
    expect(s.cards[automaton]!.counters ?? 0).toBe(0);
  });

  it('Darksteel Reactor: indestructible; twenty charge counters win the game', () => {
    let s = newGame();
    const reactor = put(s, 'P1', 'darksteel-reactor', 'battlefield', { namedCounters: { charge: 19 } });
    expect(hasKeyword(s, s.cards[reactor]!, 'Indestructible')).toBe(true);
    const tapper = put(s, 'P1', 'coretapper');
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: tapper, ability: 0, targets: [card(reactor)] }).state;
    expect(s.pending.kind).toBe('gameOver');
    expect(s.winner).toBe('P1');
  });
});

// Group 5: sacrifice payoffs, and lands from the graveyard.
describe('E5: sacrifice payoffs and lands from the graveyard', () => {
  const toP2 = { targets: (o: { kind: string; player?: string }[][]) => o.find((t) => t[0]?.kind === 'player' && t[0].player === 'P2')! } as Parameters<typeof settle>[1];
  /** Sacrifice a land with Hammer of Purphoros ({2}{R}, {T}). */
  const sacLand = (s: GameState, opts: Parameters<typeof settle>[1] = {}) => {
    const hammer = put(s, 'P1', 'hammer-of-purphoros');
    const land = put(s, 'P1', 'forest');
    mana(s, 'P1', { R: 1, C: 2 });
    return { state: cast(s, { type: 'ActivateAbility', player: 'P1', card: hammer, ability: 0, costCards: [land] }, opts).state, land };
  };

  it('Juri grows when you sacrifice, Mayhem Devil pings when anyone does, Mazirek grows your team for another permanent', () => {
    let s = newGame();
    const juri = put(s, 'P1', 'juri-master-of-the-revue');
    const devil = put(s, 'P1', 'mayhem-devil');
    const mazirek = put(s, 'P1', 'mazirek-kraul-death-priest');
    const theirs = put(s, 'P2', 'coeurl');
    const life = s.players.P2!.life;
    s = sacLand(s, toP2).state;
    expect(s.players.P2!.life).toBe(life - 1);
    expect(s.cards[juri]!.counters).toBe(2); // its own trigger, and Mazirek's
    expect(s.cards[devil]!.counters).toBe(1);
    expect(s.cards[mazirek]!.counters).toBe(1);
    expect(s.cards[theirs]!.counters ?? 0).toBe(0);
  });

  it('Mayhem Devil and Mazirek see an opponent sacrifice too; Juri does not', () => {
    let s = newGame();
    const juri = put(s, 'P1', 'juri-master-of-the-revue');
    put(s, 'P1', 'mayhem-devil');
    const mazirek = put(s, 'P1', 'mazirek-kraul-death-priest');
    const hammer = put(s, 'P2', 'hammer-of-purphoros');
    const land = put(s, 'P2', 'forest');
    s.activePlayer = 'P2';
    s.pending = { kind: 'priority', player: 'P2', passes: 0 };
    mana(s, 'P2', { R: 1, C: 2 });
    const life = s.players.P2!.life;
    s = cast(s, { type: 'ActivateAbility', player: 'P2', card: hammer, ability: 0, costCards: [land] }, toP2).state;
    expect(s.players.P2!.life).toBe(life - 1);
    expect(s.cards[mazirek]!.counters).toBe(1);
    expect(s.cards[juri]!.counters).toBe(1); // only from Mazirek
  });

  it('Juri, dying, deals damage equal to its power', () => {
    let s = newGame();
    const juri = put(s, 'P1', 'juri-master-of-the-revue', 'battlefield', { counters: 3 });
    const life = s.players.P2!.life;
    s.cards[juri]!.damage = 99;
    s = settle(act(s, { type: 'PassPriority', player: 'P1' }), toP2).state;
    expect(s.cards[juri]!.zone).toBe('graveyard');
    expect(s.players.P2!.life).toBe(life - 4);
  });

  it('Korvold sacrifices another permanent as it enters, then grows and draws', () => {
    let s = newGame();
    const korvold = put(s, 'P1', 'korvold-fae-cursed-king', 'hand');
    const land = put(s, 'P1', 'forest');
    mana(s, 'P1', { B: 1, R: 1, G: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: korvold }).state;
    const hand = s.players.P1!.hand.length;
    expect(s.pending.kind).toBe('chooseCards');
    if (s.pending.kind !== 'chooseCards') return;
    expect(s.pending.cards).not.toContain(korvold);
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [land] })).state;
    expect(s.cards[land]!.zone).toBe('graveyard');
    expect(s.cards[korvold]!.counters).toBe(1);
    expect(s.players.P1!.hand.length).toBe(hand + 1);
  });

  it('Szarel: play lands from your graveyard; sacrificing another nontoken permanent on your turn puts its power in counters on another creature', () => {
    let s = newGame();
    const szarel = put(s, 'P1', 'szarel-genesis-shepherd');
    const cat = put(s, 'P1', 'coeurl');
    const old = put(s, 'P1', 'mountain', 'graveyard');
    expect(getLegalActions(s).some((a) => a.type === 'PlayLand' && a.card === old)).toBe(true);
    s = sacLand(s, { targets: (o) => o.find((t) => t[0]?.kind === 'card' && t[0].card === cat)! }).state;
    expect(s.cards[cat]!.counters).toBe(powerOf(s, s.cards[szarel]!));
    expect(s.cards[szarel]!.counters ?? 0).toBe(0);
  });

  it('Groundskeeper returns a basic land card from your graveyard; Aftermath Analyst mills three, then returns every land', () => {
    let s = newGame();
    const keeper = put(s, 'P1', 'groundskeeper');
    const basic = put(s, 'P1', 'forest', 'graveyard');
    const nonbasic = put(s, 'P1', 'buried-ruin', 'graveyard');
    mana(s, 'P1', { G: 1, C: 1 });
    const offered = getLegalActions(s).filter((a) => a.type === 'ActivateAbility' && a.card === keeper).flatMap((a) => (a.type === 'ActivateAbility' ? (a.targets ?? []) : []));
    expect(offered.some((t) => t.kind === 'card' && t.card === nonbasic)).toBe(false);
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: keeper, ability: 0, targets: [card(basic)] }).state;
    expect(s.cards[basic]!.zone).toBe('hand');

    const analyst = put(s, 'P1', 'aftermath-analyst', 'hand');
    const top = [put(s, 'P1', 'island', 'library'), put(s, 'P1', 'swamp', 'library'), put(s, 'P1', 'coeurl', 'library')];
    mana(s, 'P1', { G: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: analyst }).state;
    for (const id of top) expect(s.cards[id]!.zone).toBe('graveyard');
    mana(s, 'P1', { G: 1, C: 3 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: analyst, ability: 0 }).state;
    for (const id of [top[0]!, top[1]!, nonbasic]) {
      expect(s.cards[id]!.zone).toBe('battlefield');
      expect(s.cards[id]!.tapped).toBe(true);
    }
    expect(s.cards[top[2]!]!.zone).toBe('graveyard');
    expect(s.cards[analyst]!.zone).toBe('graveyard');
  });

  it('Satyr Wayfinder: a land from the top four into your hand, the rest into your graveyard', () => {
    let s = newGame();
    const satyr = put(s, 'P1', 'satyr-wayfinder', 'hand');
    const top = [put(s, 'P1', 'coeurl', 'library'), put(s, 'P1', 'forest', 'library'), put(s, 'P1', 'coeurl', 'library'), put(s, 'P1', 'island', 'library')];
    mana(s, 'P1', { G: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: satyr }).state;
    expect(s.pending.kind).toBe('chooseCards');
    if (s.pending.kind !== 'chooseCards') return;
    expect([...s.pending.cards].sort()).toEqual([top[1]!, top[3]!].sort());
    // The board shows you all four cards (it once hid them, so there was nothing to pick); your opponent sees none.
    expect(top.every((id) => viewFor(s, 'P1').cards[id])).toBe(true);
    expect(top.some((id) => viewFor(s, 'P2').cards[id])).toBe(false);
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [top[3]!] })).state;
    expect(s.cards[top[3]!]!.zone).toBe('hand');
    for (const id of [top[0]!, top[1]!, top[2]!]) expect(s.cards[id]!.zone).toBe('graveyard');
  });
});

// Group 6: artifacts and cost reduction.
describe('E6: artifacts and cost reduction', () => {
  it('Etherium Sculptor and Enthusiastic Mechanaut each make artifact spells cost {1} less, and nothing else', () => {
    let s = newGame();
    put(s, 'P1', 'etherium-sculptor');
    put(s, 'P1', 'enthusiastic-mechanaut');
    const cannon = put(s, 'P1', 'lux-cannon', 'hand');
    mana(s, 'P1', { C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: cannon }).state;
    expect(s.cards[cannon]!.zone).toBe('battlefield');
    const grasp = put(s, 'P1', 'infernal-grasp', 'hand');
    put(s, 'P2', 'coeurl');
    mana(s, 'P1', { B: 1 });
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: grasp, targets: [card(s.players.P2!.battlefield[0]!)] })).toBeTruthy();
  });

  it('Thought Monitor: affinity for artifacts, and it draws two', () => {
    let s = newGame();
    for (let i = 0; i < 4; i++) put(s, 'P1', 'sol-ring');
    const monitor = put(s, 'P1', 'thought-monitor', 'hand');
    const hand = s.players.P1!.hand.length;
    mana(s, 'P1', { U: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: monitor }).state;
    expect(s.cards[monitor]!.zone).toBe('battlefield');
    expect(s.players.P1!.hand.length).toBe(hand - 1 + 2);
  });

  it('Universal Surveillance: improvise pays for X; draw X', () => {
    let s = newGame();
    const rings = [put(s, 'P1', 'lux-cannon'), put(s, 'P1', 'lux-cannon')];
    const spell = put(s, 'P1', 'universal-surveillance', 'hand');
    const hand = s.players.P1!.hand.length;
    mana(s, 'P1', { U: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, x: 2, targets: [], improvise: rings }).state;
    expect(s.players.P1!.hand.length).toBe(hand - 1 + 2);
    for (const id of rings) expect(s.cards[id]!.tapped).toBe(true);
  });

  it('Jhoira draws for each historic spell you cast (an artifact), not for others', () => {
    let s = newGame();
    put(s, 'P1', 'jhoira-weatherlight-captain');
    const ring = put(s, 'P1', 'sol-ring', 'hand');
    let hand = s.players.P1!.hand.length;
    mana(s, 'P1', { C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: ring }).state;
    expect(s.players.P1!.hand.length).toBe(hand - 1 + 1);
    const cat = put(s, 'P2', 'coeurl');
    const grasp = put(s, 'P1', 'infernal-grasp', 'hand');
    hand = s.players.P1!.hand.length;
    mana(s, 'P1', { B: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: grasp, targets: [card(cat)] }).state;
    expect(s.players.P1!.hand.length).toBe(hand - 1);
  });

  it('Kappa Cannoneer: ward 4; it and each other artifact entering give it a +1/+1 counter and make it unblockable this turn', () => {
    let s = newGame();
    const kappa = put(s, 'P1', 'kappa-cannoneer', 'hand');
    const rings = [put(s, 'P1', 'sol-ring'), put(s, 'P1', 'sol-ring')];
    mana(s, 'P1', { U: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: kappa, targets: [], improvise: rings }).state;
    expect(s.cards[kappa]!.counters).toBe(1);
    expect(hasFlag(s, s.cards[kappa]!, 'cantBeBlocked')).toBe(true);
    expect(currentDefinition(s, s.cards[kappa]!).ward).toBe(4);
    const ring = put(s, 'P1', 'sol-ring', 'hand');
    mana(s, 'P1', { C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: ring }).state;
    expect(s.cards[kappa]!.counters).toBe(2);
  });

  it('Emry: affinity, mills four, and lets you cast an artifact card from your graveyard this turn (it is not exiled later)', () => {
    let s = newGame();
    put(s, 'P1', 'sol-ring');
    put(s, 'P1', 'sol-ring');
    const emry = put(s, 'P1', 'emry-lurker-of-the-loch', 'hand');
    const milled = [0, 1, 2, 3].map(() => put(s, 'P1', 'forest', 'library'));
    mana(s, 'P1', { U: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: emry }).state;
    for (const id of milled) expect(s.cards[id]!.zone).toBe('graveyard');
    const cannon = put(s, 'P1', 'lux-cannon', 'graveyard');
    expect(getLegalActions(s).some((a) => a.type === 'CastSpell' && a.card === cannon)).toBe(false);
    s.cards[emry]!.summoningSick = false; // a turn later
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: emry, ability: 0, targets: [card(cannon)] }).state;
    expect(s.cards[cannon]!.castPermission?.exileAfter).toBeUndefined();
    mana(s, 'P1', { C: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: cannon }).state;
    expect(s.cards[cannon]!.zone).toBe('battlefield');
  });

  it('Thirst for Knowledge: draw three, then discard two cards, or one artifact card instead', () => {
    let s = newGame();
    const spell = put(s, 'P1', 'thirst-for-knowledge', 'hand');
    const land = put(s, 'P1', 'forest', 'hand');
    const ring = put(s, 'P1', 'sol-ring', 'hand');
    mana(s, 'P1', { U: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell }).state;
    expect(s.pending.kind).toBe('chooseCards');
    const choices = getLegalActions(s).flatMap((a) => (a.type === 'ChooseCards' ? [a.cards] : []));
    expect(choices).toContainEqual([ring]);
    expect(choices).not.toContainEqual([land]);
    expect(choices.some((c) => c.length === 2)).toBe(true);
    expect(rejected(s, { type: 'ChooseCards', player: 'P1', cards: [land] })).toBeTruthy();
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [ring] })).state;
    expect(s.cards[ring]!.zone).toBe('graveyard');
    expect(s.cards[land]!.zone).toBe('hand');
  });

  it('the computer answers Thirst for Knowledge legally: an artifact card if it has one, otherwise two cards', () => {
    for (const withArtifact of [true, false]) {
      let s = newGame();
      const spell = put(s, 'P1', 'thirst-for-knowledge', 'hand');
      put(s, 'P1', 'forest', 'hand');
      put(s, 'P1', 'coeurl', 'hand');
      const ring = withArtifact ? put(s, 'P1', 'sol-ring', 'hand') : undefined;
      mana(s, 'P1', { U: 1, C: 2 });
      s = cast(s, { type: 'CastSpell', player: 'P1', card: spell }).state;
      const choice = basicAi(1)(s, getLegalActions(s));
      expect(applyAction(s, choice).ok).toBe(true);
      if (choice.type !== 'ChooseCards') throw new Error(choice.type);
      expect(choice.cards).toEqual(ring ? [ring] : expect.arrayContaining([expect.any(String), expect.any(String)]));
      if (!ring) expect(choice.cards).toHaveLength(2);
    }
  });
});

// Group 7: charge counters and mana artifacts.
describe('E7: sunburst, converge and mana from counters', () => {
  const pool = (s: GameState) => s.players.P1!.manaPool;
  const manaAction = (s: GameState, id: string) => getLegalActions(s).some((a) => a.type === 'ActivateManaAbility' && a.card === id);

  it('Pentad Prism: sunburst charge counters; remove one for any color, even while tapped', () => {
    let s = newGame();
    const prism = put(s, 'P1', 'pentad-prism', 'hand');
    mana(s, 'P1', { W: 1, U: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: prism }).state;
    expect(charge(s, prism)).toBe(2);
    s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: prism, mana: 'R' });
    expect(pool(s).R).toBe(1);
    expect(charge(s, prism)).toBe(1);
    s.cards[prism]!.tapped = true;
    expect(manaAction(s, prism)).toBe(true);
    s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: prism, mana: 'G' });
    expect(pool(s).G).toBe(1);
    expect(manaAction(s, prism)).toBe(false);
    expect(rejected(s, { type: 'ActivateManaAbility', player: 'P1', card: prism, mana: 'G' })).toBeTruthy();
  });

  it('automatic payment uses a tapped Pentad Prism, and a summoning-sick Crystalline Crawler, for a colored cost', () => {
    const s = newGame();
    const prism = put(s, 'P1', 'pentad-prism', 'battlefield', { tapped: true, namedCounters: { charge: 1 } });
    const crawler = put(s, 'P1', 'crystalline-crawler', 'battlefield', { summoningSick: true, counters: 1 });
    const taps = planTaps(s, 'P1', '{U}{R}');
    expect(taps?.map((t) => t.card).sort()).toEqual([crawler, prism].sort());
  });

  it('sunburst counts colors only: generic paid with colorless adds nothing', () => {
    let s = newGame();
    const prism = put(s, 'P1', 'pentad-prism', 'hand');
    mana(s, 'P1', { C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: prism }).state;
    expect(charge(s, prism)).toBe(0);
  });

  it('Etched Oracle: sunburst +1/+1 counters; {1} and four counters: a player draws three', () => {
    let s = newGame();
    const oracle = put(s, 'P1', 'etched-oracle', 'hand');
    mana(s, 'P1', { W: 1, U: 1, B: 1, R: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: oracle }).state;
    expect(s.cards[oracle]!.counters).toBe(4);
    expect(powerOf(s, s.cards[oracle]!)).toBe(4);
    const hand = s.players.P1!.hand.length;
    mana(s, 'P1', { C: 1 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: oracle, ability: 0, targets: [{ kind: 'player', player: 'P1' }] }).state;
    expect(s.players.P1!.hand.length).toBe(hand + 3);
    expect(s.cards[oracle]!.zone).toBe('graveyard'); // a 0/0 with no counters left
  });

  it('Crystalline Crawler: converge counters; remove one for mana while summoning sick; {T} for a counter', () => {
    let s = newGame();
    const crawler = put(s, 'P1', 'crystalline-crawler', 'hand');
    mana(s, 'P1', { W: 1, U: 1, B: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: crawler }).state;
    expect(s.cards[crawler]!.counters).toBe(3);
    expect(s.cards[crawler]!.summoningSick).toBe(true);
    s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: crawler, mana: 'G' });
    expect(pool(s).G).toBe(1);
    expect(s.cards[crawler]!.counters).toBe(2);
    expect(rejected(s, { type: 'ActivateAbility', player: 'P1', card: crawler, ability: 0 })).toMatch(/summoning sickness/);
    s.cards[crawler]!.summoningSick = false;
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: crawler, ability: 0 }).state;
    expect(s.cards[crawler]!.counters).toBe(3);
  });

  it('Astral Cornucopia: {X}{X}{X} for X charge counters; tap for that much of one color', () => {
    let s = newGame();
    const horn = put(s, 'P1', 'astral-cornucopia', 'hand');
    mana(s, 'P1', { C: 6 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: horn, x: 2 }).state;
    expect(charge(s, horn)).toBe(2);
    s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: horn, mana: 'G' });
    expect(pool(s).G).toBe(2);
  });

  it('Empowered Autogenerator: enters tapped; each tap adds a charge counter, then that much mana', () => {
    let s = newGame();
    const gen = put(s, 'P1', 'empowered-autogenerator', 'hand');
    mana(s, 'P1', { C: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: gen }).state;
    expect(s.cards[gen]!.tapped).toBe(true);
    s.cards[gen]!.tapped = false;
    s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: gen, mana: 'U' });
    expect(pool(s).U).toBe(1);
    expect(charge(s, gen)).toBe(1);
    s.cards[gen]!.tapped = false;
    s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: gen, mana: 'U' });
    expect(pool(s).U).toBe(3);
    expect(charge(s, gen)).toBe(2);
  });
});

// Group 8: World Shaper's lands and removal.
describe('E8: lands, graveyards and removal', () => {
  const lands = (s: GameState, who: string) => s.players[who]!.battlefield.filter((id) => (currentDefinition(s, s.cards[id]!).types as string[]).includes('land'));

  it('Oracle of Mul Daya: an extra land each turn, played from the top of your library', () => {
    let s = newGame();
    put(s, 'P1', 'oracle-of-mul-daya');
    const top = put(s, 'P1', 'forest', 'library');
    const inHand = put(s, 'P1', 'island', 'hand');
    expect(getLegalActions(s).some((a) => a.type === 'PlayLand' && a.card === top)).toBe(true);
    s = act(s, { type: 'PlayLand', player: 'P1', card: top });
    expect(s.cards[top]!.zone).toBe('battlefield');
    // A second land this turn.
    s = act(s, { type: 'PlayLand', player: 'P1', card: inHand });
    expect(s.cards[inHand]!.zone).toBe('battlefield');
    const third = put(s, 'P1', 'swamp', 'hand');
    expect(rejected(s, { type: 'PlayLand', player: 'P1', card: third })).toBeTruthy();
  });

  it('Escape to the Wilds: exile the top five, play them until the end of your next turn, and an extra land now', () => {
    let s = newGame();
    const spell = put(s, 'P1', 'escape-to-the-wilds', 'hand');
    const top = [0, 1, 2, 3, 4].map(() => put(s, 'P1', 'forest', 'library'));
    s.players.P1!.landsPlayedThisTurn = 1;
    mana(s, 'P1', { R: 1, G: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell }).state;
    for (const id of top) expect(s.cards[id]!.zone).toBe('exile');
    s = act(s, { type: 'PlayLand', player: 'P1', card: top[0]! });
    expect(s.cards[top[0]!]!.zone).toBe('battlefield');
  });

  it('Planetary Annihilation: each player keeps six lands and sacrifices the rest, then 6 damage to each creature', () => {
    let s = newGame();
    const mine = Array.from({ length: 8 }, () => put(s, 'P1', 'mountain'));
    const theirs = Array.from({ length: 3 }, () => put(s, 'P2', 'forest'));
    const cat = put(s, 'P2', 'coeurl');
    const spell = put(s, 'P1', 'planetary-annihilation', 'hand');
    mana(s, 'P1', { R: 2, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell }).state;
    for (let guard = 0; guard < 4 && s.pending.kind === 'chooseCards'; guard++) {
      const p = s.pending;
      s = settle(act(s, { type: 'ChooseCards', player: p.player, cards: p.cards.slice(0, p.max) })).state;
    }
    expect(lands(s, 'P1')).toHaveLength(6);
    expect(mine.filter((id) => s.cards[id]!.zone === 'graveyard')).toHaveLength(2);
    expect(lands(s, 'P2')).toHaveLength(3);
    for (const id of theirs) expect(s.cards[id]!.zone).toBe('battlefield');
    expect(s.cards[cat]!.zone).toBe('graveyard');
  });

  it('Soul-Guide Lantern: exiles a graveyard card as it enters; sacrifice it to exile each opponent graveyard, or to draw', () => {
    let s = newGame();
    const old = put(s, 'P2', 'coeurl', 'graveyard');
    const other = put(s, 'P2', 'forest', 'graveyard');
    const lantern = put(s, 'P1', 'soul-guide-lantern', 'hand');
    mana(s, 'P1', { C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: lantern }, { targets: (o) => o.find((t) => t[0]?.kind === 'card' && t[0].card === old)! }).state;
    expect(s.cards[old]!.zone).toBe('exile');
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: lantern, ability: 0 }).state;
    expect(s.cards[other]!.zone).toBe('exile');
    expect(s.cards[lantern]!.zone).toBe('graveyard');
    const second = put(s, 'P1', 'soul-guide-lantern');
    const hand = s.players.P1!.hand.length;
    mana(s, 'P1', { C: 1 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: second, ability: 1 }).state;
    expect(s.players.P1!.hand.length).toBe(hand + 1);
  });

  it('Eumidian Hatchery: pay 1 life for {B} and a hatchling counter; when it goes to the graveyard, a flying Insect per counter', () => {
    let s = newGame();
    const hatchery = put(s, 'P1', 'eumidian-hatchery');
    const life = s.players.P1!.life;
    s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: hatchery, mana: 'B' });
    expect(s.players.P1!.manaPool.B).toBe(1);
    expect(s.players.P1!.life).toBe(life - 1);
    expect(s.cards[hatchery]!.namedCounters?.hatchling).toBe(1);
    s.cards[hatchery]!.namedCounters = { hatchling: 3 };
    const hammer = put(s, 'P1', 'hammer-of-purphoros');
    mana(s, 'P1', { R: 1, C: 2 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: hammer, ability: 0, costCards: [hatchery] }).state;
    const insects = s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'insect-token-eoc');
    expect(insects).toHaveLength(3);
    expect(hasKeyword(s, s.cards[insects[0]!]!, 'Flying')).toBe(true);
  });

  it('Rakdos Charm: exile a graveyard, destroy an artifact, or each creature deals 1 damage to its controller', () => {
    let s = newGame();
    put(s, 'P1', 'coeurl');
    put(s, 'P2', 'coeurl');
    put(s, 'P2', 'coeurl');
    const charm = put(s, 'P1', 'rakdos-charm', 'hand');
    const mine = s.players.P1!.life;
    const theirs = s.players.P2!.life;
    mana(s, 'P1', { B: 1, R: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: charm, mode: 2 }).state;
    expect(s.players.P1!.life).toBe(mine - 1);
    expect(s.players.P2!.life).toBe(theirs - 2);
    const ring = put(s, 'P2', 'sol-ring');
    const second = put(s, 'P1', 'rakdos-charm', 'hand');
    mana(s, 'P1', { B: 1, R: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: second, mode: 1, targets: [card(ring)] }).state;
    expect(s.cards[ring]!.zone).toBe('graveyard');
  });

  it('Fabled Passage: a basic land, tapped; untapped if you then control four or more lands', () => {
    for (const [others, untapped] of [[2, false], [3, true]] as const) {
      let s = newGame();
      for (let i = 0; i < others; i++) put(s, 'P1', 'forest');
      const passage = put(s, 'P1', 'fabled-passage');
      const basic = put(s, 'P1', 'mountain', 'library');
      s = cast(s, { type: 'ActivateAbility', player: 'P1', card: passage, ability: 0 }).state;
      expect(s.cards[basic]!.zone).toBe('battlefield');
      expect(s.cards[basic]!.tapped).toBe(!untapped);
    }
  });
});

// Group 9: artifact creatures, counters and crimes.
describe('E9: artifact creatures, counters and crimes', () => {
  const isCreature = (s: GameState, id: string) => (currentDefinition(s, s.cards[id]!).types as string[]).includes('creature');

  it('Cyberdrive Awakener: noncreature artifacts become 4/4s until end of turn; other artifact creatures have flying', () => {
    let s = newGame();
    const ring = put(s, 'P1', 'sol-ring');
    const theirs = put(s, 'P2', 'sol-ring');
    const golem = put(s, 'P1', 'mindless-automaton', 'battlefield', { counters: 2 });
    const awakener = put(s, 'P1', 'cyberdrive-awakener', 'hand');
    mana(s, 'P1', { U: 1, C: 5 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: awakener }).state;
    expect(isCreature(s, ring)).toBe(true);
    expect(powerOf(s, s.cards[ring]!)).toBe(4);
    expect(hasKeyword(s, s.cards[ring]!, 'Flying')).toBe(true);
    expect(hasKeyword(s, s.cards[golem]!, 'Flying')).toBe(true);
    expect(isCreature(s, theirs)).toBe(false);
    // At cleanup it's an artifact again (the next turn has begun).
    s = settle(goTo(s, 'end')).state;
    s = settle(goTo(s, 'main1')).state;
    expect(s.activePlayer).toBe('P2');
    expect(isCreature(s, ring)).toBe(false);
  });

  it('a permanent it animated, leaving and returning, is a new object: no longer a creature', () => {
    const s = newGame();
    const ring = put(s, 'P1', 'sol-ring');
    s.cards[ring]!.animated = { power: 4, toughness: 4 };
    expect(isCreature(s, ring)).toBe(true);
    moveCard({ s, ev: [] }, ring, 'hand');
    moveCard({ s, ev: [] }, ring, 'battlefield');
    expect(isCreature(s, ring)).toBe(false);
  });

  it('Alibou: other artifact creatures have haste; attacking with artifact creatures deals X and scries X (tapped artifacts)', () => {
    let s = newGame();
    put(s, 'P1', 'alibou-ancient-witness');
    const golem = put(s, 'P1', 'mindless-automaton', 'battlefield', { counters: 2, summoningSick: true });
    put(s, 'P1', 'sol-ring', 'battlefield', { tapped: true });
    expect(hasKeyword(s, s.cards[golem]!, 'Haste')).toBe(true);
    const life = s.players.P2!.life;
    s = goTo(s, 'declareAttackers');
    s = act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: golem, defender: 'P2' }] });
    s = settle(s, { targets: (o) => o.find((t) => t[0]?.kind === 'player' && t[0].player === 'P2')! }).state;
    // The attacking golem (tapped) and the tapped Sol Ring: 2.
    expect(s.players.P2!.life).toBe(life - 2);
  });

  it('Threefold Thunderhulk: enters with three counters and makes Gnomes equal to its power; grows by sacrificing artifacts', () => {
    let s = newGame();
    const hulk = put(s, 'P1', 'threefold-thunderhulk', 'hand');
    mana(s, 'P1', { C: 7 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: hulk }).state;
    expect(s.cards[hulk]!.counters).toBe(3);
    const gnomes = () => s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'gnome-token-eoc');
    expect(gnomes()).toHaveLength(3);
    mana(s, 'P1', { C: 2 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: hulk, ability: 0, costCards: [gnomes()[0]!] }).state;
    expect(s.cards[hulk]!.counters).toBe(4);
    expect(gnomes()).toHaveLength(2);
  });

  it('Deepglow Skate doubles the counters on your permanents (and stun counters on theirs)', () => {
    let s = newGame();
    const mine = put(s, 'P1', 'coeurl', 'battlefield', { counters: 2 });
    const rock = put(s, 'P1', 'sol-ring', 'battlefield', { namedCounters: { charge: 3 } });
    const theirs = put(s, 'P2', 'coeurl', 'battlefield', { counters: 1, namedCounters: { stun: 1 } });
    const skate = put(s, 'P1', 'deepglow-skate', 'hand');
    mana(s, 'P1', { U: 1, C: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: skate }).state;
    expect(s.cards[mine]!.counters).toBe(4);
    expect(s.cards[rock]!.namedCounters?.charge).toBe(6);
    expect(s.cards[theirs]!.counters).toBe(1);
    expect(s.cards[theirs]!.namedCounters?.stun).toBe(2);
  });

  it('Patrolling Peacemaker: enters with two counters; proliferates whenever an opponent commits a crime, not for your own', () => {
    let s = newGame();
    const cop = put(s, 'P1', 'patrolling-peacemaker', 'hand');
    mana(s, 'P1', { W: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: cop }).state;
    expect(s.cards[cop]!.counters).toBe(2);
    // Your own spell targeting an opponent's creature: your crime, no trigger.
    const target = put(s, 'P2', 'coeurl');
    const grasp = put(s, 'P1', 'infernal-grasp', 'hand');
    mana(s, 'P1', { B: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: grasp, targets: [card(target)] }).state;
    expect(s.cards[cop]!.counters).toBe(2);
    // An opponent targets your creature: a crime, so it proliferates.
    const bolt = put(s, 'P2', 'infernal-grasp', 'hand');
    const victim = put(s, 'P1', 'coeurl');
    s.activePlayer = 'P2';
    s.pending = { kind: 'priority', player: 'P2', passes: 0 };
    mana(s, 'P2', { B: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P2', card: bolt, targets: [card(victim)] }).state;
    expect(s.cards[cop]!.counters).toBe(3);
  });
});

// Group 10: any number of permanents, and X.
describe('E10: any number of permanents, and X', () => {
  const isCreature = (s: GameState, id: string) => (currentDefinition(s, s.cards[id]!).types as string[]).includes('creature');

  it('Depthshaker Titan: the noncreature artifacts you choose become 3/3s until the next end step; artifact creatures get trample, haste and melee', () => {
    let s = newGame();
    const [ringA, ringB] = [put(s, 'P1', 'sol-ring'), put(s, 'P1', 'sol-ring')];
    const titan = put(s, 'P1', 'depthshaker-titan', 'hand');
    mana(s, 'P1', { R: 2, C: 5 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: titan }).state;
    expect(s.pending.kind).toBe('chooseCards');
    if (s.pending.kind !== 'chooseCards') return;
    expect([...s.pending.cards].sort()).toEqual([ringA, ringB].sort());
    expect(getLegalActions(s).some((a) => a.type === 'ChooseCards' && a.cards.length === 0)).toBe(true);
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [ringA] })).state;
    expect(isCreature(s, ringA)).toBe(true);
    expect(powerOf(s, s.cards[ringA]!)).toBe(3);
    expect(hasKeyword(s, s.cards[ringA]!, 'Haste') && hasKeyword(s, s.cards[ringA]!, 'Trample')).toBe(true);
    expect(isCreature(s, ringB)).toBe(false);
    // Melee: attacking one opponent, +1/+1.
    s = goTo(s, 'declareAttackers');
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: ringA, defender: 'P2' }] })).state;
    expect(powerOf(s, s.cards[ringA]!)).toBe(4);
    s = settle(goTo(s, 'end')).state;
    expect(s.cards[ringA]!.zone).toBe('graveyard');
    expect(s.cards[ringB]!.zone).toBe('battlefield');
  });

  it('the computer animates none of its artifacts with Depthshaker Titan (they would be sacrificed)', () => {
    let s = newGame();
    put(s, 'P1', 'sol-ring');
    const titan = put(s, 'P1', 'depthshaker-titan', 'hand');
    mana(s, 'P1', { R: 2, C: 5 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: titan }).state;
    const choice = basicAi(1)(s, getLegalActions(s));
    expect(choice).toEqual({ type: 'ChooseCards', player: 'P1', cards: [] });
  });

  it('Ripples of Potential: proliferate, then phase out any of your permanents that got a counter this way', () => {
    let s = newGame();
    const cat = put(s, 'P1', 'coeurl', 'battlefield', { counters: 1 });
    const plain = put(s, 'P1', 'coeurl');
    const rock = put(s, 'P1', 'sol-ring', 'battlefield', { namedCounters: { charge: 1 } });
    const spell = put(s, 'P1', 'ripples-of-potential', 'hand');
    mana(s, 'P1', { U: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell }).state;
    expect(s.cards[cat]!.counters).toBe(2);
    expect(s.pending.kind).toBe('chooseCards');
    if (s.pending.kind !== 'chooseCards') return;
    expect([...s.pending.cards].sort()).toEqual([cat, rock].sort());
    expect(s.pending.cards).not.toContain(plain);
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [cat] })).state;
    expect(s.cards[cat]!.phasedOut).toBe(true);
    expect(s.cards[rock]!.phasedOut).toBeFalsy();
  });

  it('Gaze of Granite destroys each nonland permanent with mana value X or less', () => {
    let s = newGame();
    const cheap = put(s, 'P2', 'sol-ring'); // mana value 1
    const mid = put(s, 'P2', 'mindless-automaton', 'battlefield', { counters: 2 }); // mana value 4
    const land = put(s, 'P2', 'forest');
    const mine = put(s, 'P1', 'sol-ring');
    const gaze = put(s, 'P1', 'gaze-of-granite', 'hand');
    mana(s, 'P1', { B: 2, G: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: gaze, x: 3 }).state;
    expect(s.cards[cheap]!.zone).toBe('graveyard');
    expect(s.cards[mine]!.zone).toBe('graveyard');
    expect(s.cards[mid]!.zone).toBe('battlefield');
    expect(s.cards[land]!.zone).toBe('battlefield');
  });
});

// Group 11: Phyrexian mana of every color.
describe('E11: Phyrexian mana, copies and proliferating twice', () => {
  it("Tezzeret's Gambit: {U/P} is paid with blue mana when there is some, or 2 life when there isn't; draw two, then proliferate", () => {
    for (const withBlue of [true, false]) {
      let s = newGame();
      const cat = put(s, 'P1', 'coeurl', 'battlefield', { counters: 1 });
      const spell = put(s, 'P1', 'tezzerets-gambit', 'hand');
      const life = s.players.P1!.life;
      const hand = s.players.P1!.hand.length;
      mana(s, 'P1', withBlue ? { U: 1, C: 3 } : { C: 3 });
      s = cast(s, { type: 'CastSpell', player: 'P1', card: spell }).state;
      expect(s.players.P1!.life).toBe(withBlue ? life : life - 2);
      expect(s.players.P1!.hand.length).toBe(hand - 1 + 2);
      expect(s.cards[cat]!.counters).toBe(2);
    }
  });

  it("can't be paid with life you don't have", () => {
    const s = newGame();
    const spell = put(s, 'P1', 'tezzerets-gambit', 'hand');
    s.players.P1!.life = 1;
    mana(s, 'P1', { C: 3 });
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: spell })).toBeTruthy();
    expect(getLegalActions(s).some((a) => a.type === 'CastSpell' && a.card === spell)).toBe(false);
  });

  it('Phyrexian Metamorph enters as a copy of an artifact or a creature, and is an artifact either way', () => {
    let s = newGame();
    const ring = put(s, 'P2', 'sol-ring');
    const cat = put(s, 'P2', 'coeurl');
    const metamorph = put(s, 'P1', 'phyrexian-metamorph', 'hand');
    mana(s, 'P1', { U: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: metamorph }).state;
    expect(s.pending.kind).toBe('chooseCards');
    if (s.pending.kind !== 'chooseCards') return;
    expect([...s.pending.cards].sort()).toEqual([ring, cat].sort());
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [ring] })).state;
    expect(currentDefinition(s, s.cards[metamorph]!).name).toBe('Sol Ring');
    expect(getLegalActions(s).some((a) => a.type === 'ActivateManaAbility' && a.card === metamorph)).toBe(true);

    const second = put(s, 'P1', 'phyrexian-metamorph', 'hand');
    mana(s, 'P1', { U: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: second }).state;
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [cat] })).state;
    const def = currentDefinition(s, s.cards[second]!);
    expect(def.name).toBe('Coeurl');
    expect(def.types).toEqual(expect.arrayContaining(['artifact', 'creature']));
  });

  it('Tekuthal: you proliferate twice; remove three counters from among your other artifacts and creatures for an indestructible counter', () => {
    let s = newGame();
    const tek = put(s, 'P1', 'tekuthal-inquiry-dominus');
    const cat = put(s, 'P1', 'coeurl', 'battlefield', { counters: 2 });
    const rock = put(s, 'P1', 'sol-ring', 'battlefield', { namedCounters: { charge: 1 } });
    const spell = put(s, 'P1', 'tezzerets-gambit', 'hand');
    mana(s, 'P1', { U: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell }).state;
    expect(s.cards[cat]!.counters).toBe(4);
    expect(s.cards[rock]!.namedCounters?.charge).toBe(3);
    // {1}{U/P}{U/P} with no blue: {1} and 4 life.
    const life = s.players.P1!.life;
    mana(s, 'P1', { C: 1 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: tek, ability: 0 }).state;
    expect(s.players.P1!.life).toBe(life - 4);
    expect(s.cards[tek]!.namedCounters?.indestructible).toBe(1);
    expect((s.cards[cat]!.counters ?? 0) + (s.cards[rock]!.namedCounters?.charge ?? 0)).toBe(7 - 3);
    expect(hasKeyword(s, s.cards[tek]!, 'Indestructible')).toBe(true);
  });

  it("Tekuthal's ability needs three counters among your other permanents", () => {
    const s = newGame();
    const tek = put(s, 'P1', 'tekuthal-inquiry-dominus', 'battlefield', { counters: 5 });
    put(s, 'P1', 'coeurl', 'battlefield', { counters: 2 });
    mana(s, 'P1', { U: 2, C: 1 });
    expect(rejected(s, { type: 'ActivateAbility', player: 'P1', card: tek, ability: 0 })).toMatch(/counters/);
  });
});

// Group 12: World Shaper's land creatures.
describe('E12: land creatures', () => {
  /** Passes to P1's next upkeep (through P2's turn). */
  const toMyUpkeep = (s: GameState) => {
    s = settle(goTo(s, 'end')).state;
    s = settle(goTo(s, 'main1')).state; // P2's turn
    s = settle(goTo(s, 'end')).state;
    return goTo(s, 'upkeep');
  };

  it('The Gitrog Monster: each upkeep sacrifice a land or it; a land card going to your graveyard draws a card; an extra land each turn', () => {
    for (const keep of [true, false]) {
      let s = newGame();
      const frog = put(s, 'P1', 'the-gitrog-monster');
      const land = put(s, 'P1', 'forest');
      s = toMyUpkeep(s);
      expect(s.activePlayer).toBe('P1');
      expect(s.pending.kind).toBe('chooseCards');
      if (s.pending.kind !== 'chooseCards') return;
      const hand = s.players.P1!.hand.length;
      s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: keep ? [land] : [] })).state;
      expect(s.cards[frog]!.zone).toBe(keep ? 'battlefield' : 'graveyard');
      expect(s.cards[land]!.zone).toBe(keep ? 'graveyard' : 'battlefield');
      // The sacrificed land drew a card.
      expect(s.players.P1!.hand.length).toBe(hand + (keep ? 1 : 0));
    }
    let s = newGame();
    put(s, 'P1', 'the-gitrog-monster');
    const [a, b] = [put(s, 'P1', 'forest', 'hand'), put(s, 'P1', 'swamp', 'hand')];
    s = act(s, { type: 'PlayLand', player: 'P1', card: a });
    s = act(s, { type: 'PlayLand', player: 'P1', card: b });
    expect(s.cards[b]!.zone).toBe('battlefield');
  });

  it('the computer keeps its Gitrog Monster by sacrificing a spare land', () => {
    let s = newGame();
    put(s, 'P1', 'the-gitrog-monster');
    const lands = [put(s, 'P1', 'forest'), put(s, 'P1', 'forest'), put(s, 'P1', 'swamp')];
    s = toMyUpkeep(s);
    const choice = basicAi(1)(s, getLegalActions(s));
    expect(choice.type).toBe('ChooseCards');
    if (choice.type === 'ChooseCards') {
      expect(choice.cards).toHaveLength(1);
      expect(lands).toContain(choice.cards[0]);
    }
  });

  it('Multani: +1/+1 for each land you control and land card in your graveyard; return two lands to bring it back from the graveyard', () => {
    let s = newGame();
    const multani = put(s, 'P1', 'multani-yavimayas-avatar');
    const lands = [put(s, 'P1', 'forest'), put(s, 'P1', 'forest'), put(s, 'P1', 'forest')];
    put(s, 'P1', 'swamp', 'graveyard');
    expect(powerOf(s, s.cards[multani]!)).toBe(4);
    moveCard({ s, ev: [] }, multani, 'graveyard');
    mana(s, 'P1', { G: 1, C: 1 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: multani, ability: 0, costCards: [lands[0]!, lands[1]!] }).state;
    expect(s.cards[multani]!.zone).toBe('hand');
    expect(s.cards[lands[0]!]!.zone).toBe('hand');
    expect(s.cards[lands[2]!]!.zone).toBe('battlefield');
  });

  it('Centaur Vinecrasher: enters with a counter per land card in all graveyards; returns to hand for {G}{G} when a land card hits a graveyard', () => {
    let s = newGame();
    put(s, 'P1', 'forest', 'graveyard');
    put(s, 'P2', 'island', 'graveyard');
    const crasher = put(s, 'P1', 'centaur-vinecrasher', 'hand');
    mana(s, 'P1', { G: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: crasher }).state;
    expect(s.cards[crasher]!.counters).toBe(2);
    expect(powerOf(s, s.cards[crasher]!)).toBe(3);
    s.cards[crasher]!.damage = 99;
    s = settle(act(s, { type: 'PassPriority', player: 'P1' })).state;
    expect(s.cards[crasher]!.zone).toBe('graveyard');
    // An opponent's land going to their graveyard counts too.
    const hammer = put(s, 'P2', 'hammer-of-purphoros');
    const theirLand = put(s, 'P2', 'mountain');
    s.activePlayer = 'P2';
    s.pending = { kind: 'priority', player: 'P2', passes: 0 };
    mana(s, 'P2', { R: 1, C: 2 });
    mana(s, 'P1', { G: 2 });
    s = cast(s, { type: 'ActivateAbility', player: 'P2', card: hammer, ability: 0, costCards: [theirLand] }, { accept: true }).state;
    expect(s.cards[crasher]!.zone).toBe('hand');
  });

  it('World Breaker: casting it exiles an artifact, enchantment or land; {2}{C} and a land bring it back from the graveyard', () => {
    let s = newGame();
    const ring = put(s, 'P2', 'sol-ring');
    const breaker = put(s, 'P1', 'world-breaker', 'hand');
    mana(s, 'P1', { G: 1, C: 6 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: breaker }, { targets: (o) => o.find((t) => t[0]?.kind === 'card' && t[0].card === ring)! }).state;
    expect(s.cards[ring]!.zone).toBe('exile');
    expect(s.cards[breaker]!.zone).toBe('battlefield');
    expect(currentDefinition(s, s.cards[breaker]!).colors).toEqual([]);
    moveCard({ s, ev: [] }, breaker, 'graveyard');
    const land = put(s, 'P1', 'forest');
    mana(s, 'P1', { C: 3 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: breaker, ability: 0, costCards: [land] }).state;
    expect(s.cards[breaker]!.zone).toBe('hand');
  });

  it('Augur of Autumn: play lands from the top; with three creatures of different powers, cast creatures from the top too', () => {
    let s = newGame();
    put(s, 'P1', 'augur-of-autumn'); // power 2
    const top = put(s, 'P1', 'coeurl', 'library');
    mana(s, 'P1', { W: 3, U: 3, B: 3, R: 3, G: 3, C: 3 });
    expect(getLegalActions(s).some((a) => a.type === 'CastSpell' && a.card === top)).toBe(false);
    put(s, 'P1', 'mindless-automaton', 'battlefield', { counters: 3 }); // 3
    put(s, 'P1', 'juri-master-of-the-revue'); // 1
    expect(getLegalActions(s).some((a) => a.type === 'CastSpell' && a.card === top)).toBe(true);
    const land = put(s, 'P1', 'forest', 'library');
    expect(getLegalActions(s).some((a) => a.type === 'PlayLand' && a.card === land)).toBe(true);
  });
});

// Group 13: Counter Intelligence's remaining artifacts.
describe('E13: card type choice, sunburst grants, equipment counters and copies', () => {
  it('Cloud Key: choose a card type as it enters; spells of that type cost {1} less (the computer picks a type too)', () => {
    let s = newGame();
    const key = put(s, 'P1', 'cloud-key', 'hand');
    mana(s, 'P1', { C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: key }).state;
    expect(s.pending.kind).toBe('chooseCardType');
    const options = getLegalActions(s).flatMap((a) => (a.type === 'ChooseCardType' ? [a.cardType] : []));
    expect(options).toEqual(['artifact', 'creature', 'enchantment', 'instant', 'sorcery']);
    expect(basicAi(1)(s, getLegalActions(s)).type).toBe('ChooseCardType');
    s = settle(act(s, { type: 'ChooseCardType', player: 'P1', cardType: 'artifact' })).state;
    expect(s.cards[key]!.chosenCardType).toBe('artifact');
    const ring = put(s, 'P1', 'sol-ring', 'hand');
    s = cast(s, { type: 'CastSpell', player: 'P1', card: ring }).state; // {1} less: free
    expect(s.cards[ring]!.zone).toBe('battlefield');
    const grasp = put(s, 'P1', 'infernal-grasp', 'hand');
    const cat = put(s, 'P2', 'coeurl');
    mana(s, 'P1', { B: 1 });
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: grasp, targets: [card(cat)] })).toBeTruthy();
  });

  it('Gavel of the Righteous: a charge counter each combat; +1/+1 per counter; double strike at four; equip by removing a counter', () => {
    let s = newGame();
    const gavel = put(s, 'P1', 'gavel-of-the-righteous', 'battlefield', { namedCounters: { charge: 3 } });
    const cat = put(s, 'P1', 'coeurl');
    const base = powerOf(s, s.cards[cat]!);
    mana(s, 'P1', { C: 3 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: gavel, ability: 0, targets: [card(cat)] }).state;
    expect(powerOf(s, s.cards[cat]!)).toBe(base + 3);
    expect(hasKeyword(s, s.cards[cat]!, 'DoubleStrike')).toBe(false);
    s = goTo(s, 'beginCombat');
    s = settle(s).state;
    expect(s.cards[gavel]!.namedCounters?.charge).toBe(4);
    expect(powerOf(s, s.cards[cat]!)).toBe(base + 4);
    expect(hasKeyword(s, s.cards[cat]!, 'DoubleStrike')).toBe(true);
    // Equip by removing a counter (main phase).
    let t = newGame();
    const g2 = put(t, 'P1', 'gavel-of-the-righteous', 'battlefield', { namedCounters: { charge: 2 } });
    const other = put(t, 'P1', 'coeurl');
    t = cast(t, { type: 'ActivateAbility', player: 'P1', card: g2, ability: 1, targets: [card(other)] }).state;
    expect(t.cards[g2]!.attachedTo).toBe(other);
    expect(t.cards[g2]!.namedCounters?.charge).toBe(1);
  });

  it('Solar Array: its mana gives your next artifact spell this turn sunburst', () => {
    let s = newGame();
    const array = put(s, 'P1', 'solar-array');
    s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: array, mana: 'R' });
    const cannon = put(s, 'P1', 'lux-cannon', 'hand');
    mana(s, 'P1', { W: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: cannon }).state;
    expect(charge(s, cannon)).toBe(2); // red and white
    const second = put(s, 'P1', 'lux-cannon', 'hand');
    mana(s, 'P1', { G: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: second }).state;
    expect(charge(s, second)).toBe(0); // only the next one
  });

  it('Lux Artillery: artifact creature spells gain sunburst; thirty counters at your end step deal 10 to each opponent', () => {
    let s = newGame();
    put(s, 'P1', 'lux-artillery');
    const golem = put(s, 'P1', 'mindless-automaton', 'hand');
    mana(s, 'P1', { W: 1, U: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: golem }).state;
    expect(s.cards[golem]!.counters).toBe(2 + 2);
    const life = s.players.P2!.life;
    s.cards[golem]!.counters = 30;
    s = settle(goTo(s, 'end')).state;
    expect(s.players.P2!.life).toBe(life - 10);
  });

  it('The Mycosynth Gardens: taps for {C}, or {1} for any color; {X}: becomes a copy of your nontoken artifact with mana value X', () => {
    let s = newGame();
    const gardens = put(s, 'P1', 'the-mycosynth-gardens');
    const ring = put(s, 'P1', 'sol-ring');
    expect(getLegalActions(s).some((a) => a.type === 'ActivateManaAbility' && a.card === gardens && a.mana === 'C')).toBe(true);
    // X = 2 doesn't match Sol Ring's mana value: nothing happens.
    mana(s, 'P1', { C: 2 });
    let t = cast(structuredClone(s), { type: 'ActivateAbility', player: 'P1', card: gardens, ability: 0, x: 2, targets: [card(ring)] }).state;
    expect(currentDefinition(t, t.cards[gardens]!).name).toBe('The Mycosynth Gardens');
    s.players.P1!.manaPool.C = 1;
    t = cast(s, { type: 'ActivateAbility', player: 'P1', card: gardens, ability: 0, x: 1, targets: [card(ring)] }).state;
    expect(currentDefinition(t, t.cards[gardens]!).name).toBe('Sol Ring');
    expect((currentDefinition(t, t.cards[gardens]!).types as string[]).includes('land')).toBe(false);
  });
});

describe('E14: World Shaper removal, retrace and lands', () => {
  /** Plays until the pending choice is a card choice (a library search), passing priority. */
  const untilChoice = (s: GameState): GameState => {
    for (let i = 0; i < 30 && s.pending.kind !== 'chooseCards'; i++) s = act(s, getLegalActions(s).find((a) => a.type === 'PassPriority') ?? getLegalActions(s)[0]!);
    return s;
  };

  it('Tear Asunder: an artifact or enchantment; kicked, any nonland permanent', () => {
    let s = newGame();
    const tear = put(s, 'P1', 'tear-asunder', 'hand');
    const bear = put(s, 'P2', 'coeurl');
    const ring = put(s, 'P2', 'sol-ring');
    mana(s, 'P1', { G: 1, B: 1, C: 2 });
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: tear, targets: [card(bear)] })).toBeTruthy();
    let t = cast(s, { type: 'CastSpell', player: 'P1', card: tear, targets: [card(ring)] }).state;
    expect(t.cards[ring]!.zone).toBe('exile');
    t = cast(s, { type: 'CastSpell', player: 'P1', card: tear, kicks: 1, targets: [card(bear)] }).state;
    expect(t.cards[bear]!.zone).toBe('exile');
    // Kicked, a land still isn't a legal target.
    const land = put(s, 'P2', 'forest');
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: tear, kicks: 1, targets: [card(land)] })).toBeTruthy();
  });

  it("Windgrace's Judgment: one nonland permanent for each of any number of opponents", () => {
    let s = newGame(3);
    const judgment = put(s, 'P1', 'windgraces-judgment', 'hand');
    const a = put(s, 'P2', 'coeurl');
    const b = put(s, 'P2', 'sol-ring');
    const c = put(s, 'P3', 'coeurl');
    mana(s, 'P1', { B: 1, G: 1, C: 3 });
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: judgment, targets: [card(a), card(b), { kind: 'none' }] })).toMatch(/different players/);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: judgment, targets: [card(a), card(c), { kind: 'none' }] }).state;
    expect([a, b, c].map((id) => s.cards[id]!.zone)).toEqual(['graveyard', 'battlefield', 'graveyard']);
  });

  it('Binding the Old Gods: I destroys a nonland permanent an opponent controls, II fetches a Forest tapped', () => {
    let s = newGame();
    const saga = put(s, 'P1', 'binding-the-old-gods', 'hand');
    const bear = put(s, 'P2', 'coeurl');
    const forest = put(s, 'P1', 'forest', 'library');
    mana(s, 'P1', { B: 1, G: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: saga }).state;
    expect(s.cards[bear]!.zone).toBe('graveyard');
    expect(s.cards[saga]!.namedCounters?.lore).toBe(1);
    // Chapter II after P1's next draw step (the Forest at the bottom, so it isn't drawn).
    const lib = s.players.P1!.library;
    lib.splice(lib.indexOf(forest), 1);
    lib.push(forest);
    const turn = s.turnNumber;
    for (let guard = 0; guard < 10 && !(s.activePlayer === 'P1' && s.turnNumber > turn && s.step === 'main1'); guard++) s = goTo(goTo(s, 'end'), 'main1');
    expect(s.cards[saga]!.namedCounters?.lore).toBe(2);
    expect(s.cards[forest]!.zone).toBe('battlefield');
    expect(s.cards[forest]!.tapped).toBe(true);
  });

  it('Myriad Landscape: up to two basic lands that share a land type, tapped', () => {
    let s = newGame();
    const myriad = put(s, 'P1', 'myriad-landscape');
    const forest = put(s, 'P1', 'forest', 'library');
    const mountain = put(s, 'P1', 'mountain', 'library');
    mana(s, 'P1', { C: 2 });
    s = untilChoice(act(s, { type: 'ActivateAbility', player: 'P1', card: myriad, ability: 0 }));
    expect(s.pending.kind).toBe('chooseCards');
    expect(rejected(s, { type: 'ChooseCards', player: 'P1', cards: [forest, mountain] })).toMatch(/share a land type/);
    const islands = s.players.P1!.library.filter((id) => s.cards[id]!.defId === 'island').slice(0, 2);
    s = act(s, { type: 'ChooseCards', player: 'P1', cards: islands });
    expect(islands.map((id) => [s.cards[id]!.zone, s.cards[id]!.tapped])).toEqual([['battlefield', true], ['battlefield', true]]);
    expect(s.cards[myriad]!.zone).toBe('graveyard');
  });

  it('Soul of Windgrace: enters and returns a land card from any graveyard; discards a land card to gain life', () => {
    let s = newGame();
    const soul = put(s, 'P1', 'soul-of-windgrace', 'hand');
    const theirs = put(s, 'P2', 'forest', 'graveyard');
    mana(s, 'P1', { B: 1, R: 1, G: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: soul }).state;
    expect(s.cards[theirs]!.zone).toBe('battlefield');
    expect(s.cards[theirs]!.controller).toBe('P1');
    expect(s.cards[theirs]!.tapped).toBe(true);
    const spell = put(s, 'P1', 'sol-ring', 'hand');
    const land = put(s, 'P1', 'mountain', 'hand');
    mana(s, 'P1', { G: 1 });
    expect(rejected(s, { type: 'ActivateAbility', player: 'P1', card: soul, ability: 0, costCards: [spell] })).toMatch(/matching card/);
    const life = s.players.P1!.life;
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: soul, ability: 0, costCards: [land] }).state;
    expect(s.players.P1!.life).toBe(life + 3);
    expect(s.cards[land]!.zone).toBe('graveyard');
  });

  it('Formless Genesis: an X/X deathtouch Shapeshifter (land cards in your graveyard); retrace casts it again by discarding a land', () => {
    let s = newGame();
    const genesis = put(s, 'P1', 'formless-genesis', 'hand');
    for (let i = 0; i < 3; i++) put(s, 'P1', 'forest', 'graveyard');
    put(s, 'P2', 'forest', 'graveyard');
    mana(s, 'P1', { G: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: genesis }).state;
    const shapes = () => s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'shapeshifter-token-eoc');
    expect(shapes()).toHaveLength(1);
    expect([powerOf(s, s.cards[shapes()[0]!]!), hasKeyword(s, s.cards[shapes()[0]!]!, 'Deathtouch')]).toEqual([3, true]);
    expect(s.cards[genesis]!.zone).toBe('graveyard');
    // Retrace: from the graveyard, discarding a land card; it goes back to the graveyard.
    const land = put(s, 'P1', 'mountain', 'hand');
    const spell = put(s, 'P1', 'sol-ring', 'hand');
    mana(s, 'P1', { G: 1, C: 2 });
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: genesis })).toBeTruthy();
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: genesis, costCards: [spell] })).toBeTruthy();
    expect(getLegalActions(s).some((a) => a.type === 'CastSpell' && a.card === genesis && a.costCards?.[0] === land)).toBe(true);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: genesis, costCards: [land] }).state;
    expect(shapes()).toHaveLength(2);
    // The second counts the discarded Mountain too.
    expect(powerOf(s, s.cards[shapes()[1]!]!)).toBe(4);
    expect(s.cards[genesis]!.zone).toBe('graveyard');
  });
});

describe('E15: World Shaper sacrifice, X targets and lands from the graveyard', () => {
  /** Answers the pending card choices in order with these picks (by a function of the offered cards). */
  const answer = (s: GameState, ...picks: ((offered: readonly string[]) => string[])[]): GameState => {
    for (const pick of picks) {
      for (let i = 0; i < 30 && s.pending.kind !== 'chooseCards'; i++) s = act(s, getLegalActions(s).find((a) => a.type === 'PassPriority') ?? getLegalActions(s)[0]!);
      if (s.pending.kind !== 'chooseCards') throw new Error(`no choice pending (${s.pending.kind})`);
      s = act(s, { type: 'ChooseCards', player: s.pending.player, cards: pick(s.pending.cards) });
    }
    return settle(s).state;
  };

  it('Braids: sacrifice a land; an opponent who sacrifices a land is spared, one who doesn’t loses 2 and you draw', () => {
    let s = newGame(3);
    const braids = put(s, 'P1', 'braids-arisen-nightmare');
    const mine = put(s, 'P1', 'forest');
    const p2land = put(s, 'P2', 'forest');
    put(s, 'P3', 'forest');
    const p3bear = put(s, 'P3', 'coeurl');
    s = goTo(s, 'end');
    const hand = s.players.P1!.hand.length;
    const [life2, life3] = [s.players.P2!.life, s.players.P3!.life];
    // P1 sacrifices the Forest; P2 sacrifices a land, P3 declines (its creature isn't offered: no shared type).
    s = answer(s, (o) => { expect(o).toContain(braids); return [mine]; }, (o) => { expect(o).toEqual([p2land]); return [p2land]; }, (o) => { expect(o).not.toContain(p3bear); return []; });
    expect(s.cards[mine]!.zone).toBe('graveyard');
    expect(s.cards[p2land]!.zone).toBe('graveyard');
    expect([s.players.P2!.life, s.players.P3!.life]).toEqual([life2, life3 - 2]);
    expect(s.players.P1!.hand.length).toBe(hand + 1);
  });

  it('Braids: nothing happens if you don’t sacrifice', () => {
    let s = newGame();
    put(s, 'P1', 'braids-arisen-nightmare');
    put(s, 'P1', 'forest');
    s = goTo(s, 'end');
    const life = s.players.P2!.life;
    s = answer(s, () => []);
    expect(s.players.P2!.life).toBe(life);
  });

  it('God-Eternal Bontu: sacrifice any number of other permanents and draw that many; when it dies, third from the top', () => {
    let s = newGame();
    const bontu = put(s, 'P1', 'god-eternal-bontu', 'hand');
    const a = put(s, 'P1', 'forest');
    const b = put(s, 'P1', 'sol-ring');
    put(s, 'P1', 'mountain');
    mana(s, 'P1', { B: 2, C: 3 });
    const hand = s.players.P1!.hand.length;
    s = act(s, { type: 'CastSpell', player: 'P1', card: bontu });
    s = answer(s, (o) => { expect(o).not.toContain(bontu); return [a, b]; });
    expect([s.cards[a]!.zone, s.cards[b]!.zone]).toEqual(['graveyard', 'graveyard']);
    expect(s.players.P1!.hand.length).toBe(hand - 1 + 2);
    // Dies (lethal damage): you may put it into your library third from the top.
    s.cards[bontu]!.damage = 6;
    s = cast(s, { type: 'PassPriority', player: 'P1' }).state;
    expect(s.players.P1!.library.indexOf(bontu)).toBe(2);
    // Exiled from the battlefield: the same.
    const again = put(s, 'P1', 'god-eternal-bontu');
    const tear = put(s, 'P2', 'tear-asunder', 'hand');
    mana(s, 'P2', { G: 1, B: 1, C: 2 });
    s.pending = { kind: 'priority', player: 'P2', passes: 0 };
    s = cast(s, { type: 'CastSpell', player: 'P2', card: tear, kicks: 1, targets: [card(again)] }).state;
    expect(s.players.P1!.library.indexOf(again)).toBe(2);
  });

  it('Loamcrafter Faun: discard land cards to return that many nonland permanent cards from your graveyard', () => {
    let s = newGame();
    const faun = put(s, 'P1', 'loamcrafter-faun', 'hand');
    const l1 = put(s, 'P1', 'forest', 'hand');
    const l2 = put(s, 'P1', 'mountain', 'hand');
    const spell = put(s, 'P1', 'sol-ring', 'hand');
    const g1 = put(s, 'P1', 'coeurl', 'graveyard');
    const g2 = put(s, 'P1', 'sol-ring', 'graveyard');
    const g3 = put(s, 'P1', 'forest', 'graveyard');
    mana(s, 'P1', { G: 1, C: 2 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: faun });
    s = answer(s, (o) => { expect(o).not.toContain(spell); return [l1, l2]; }, (o) => { expect(o).not.toContain(g3); expect(o).toHaveLength(2); return [g1, g2]; });
    expect([g1, g2].map((id) => s.cards[id]!.zone)).toEqual(['hand', 'hand']);
    expect([l1, l2].map((id) => s.cards[id]!.zone)).toEqual(['graveyard', 'graveyard']);
  });

  it('Pest Infestation: up to X artifacts and enchantments, and twice X Pests that gain life when they die', () => {
    let s = newGame();
    const pests = put(s, 'P1', 'pest-infestation', 'hand');
    const r1 = put(s, 'P2', 'sol-ring');
    const r2 = put(s, 'P2', 'sol-ring');
    mana(s, 'P1', { G: 1, C: 4 });
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: pests, x: 2, targets: [card(r1), card(r1)] })).toBeTruthy();
    s = cast(s, { type: 'CastSpell', player: 'P1', card: pests, x: 2, targets: [card(r1), card(r2)] }).state;
    expect([s.cards[r1]!.zone, s.cards[r2]!.zone]).toEqual(['graveyard', 'graveyard']);
    const tokens = s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'pest-token-eoc');
    expect(tokens).toHaveLength(4);
    const life = s.players.P1!.life;
    s.cards[tokens[0]!]!.damage = 1;
    s = cast(s, { type: 'PassPriority', player: 'P1' }).state;
    expect(s.players.P1!.life).toBe(life + 1);
  });

  it("Worldsoul's Rage: X damage, and up to X land cards from hand and graveyard onto the battlefield tapped", () => {
    let s = newGame();
    const rage = put(s, 'P1', 'worldsouls-rage', 'hand');
    const fromHand = put(s, 'P1', 'forest', 'hand');
    const fromYard = put(s, 'P1', 'mountain', 'graveyard');
    const extra = put(s, 'P1', 'swamp', 'graveyard');
    mana(s, 'P1', { R: 1, G: 1, C: 2 });
    const life = s.players.P2!.life;
    s = act(s, { type: 'CastSpell', player: 'P1', card: rage, x: 2, targets: [{ kind: 'player', player: 'P2' }] });
    s = answer(s, (o) => { expect(o).toEqual(expect.arrayContaining([fromHand, fromYard, extra])); return [fromHand, fromYard]; });
    expect(s.players.P2!.life).toBe(life - 2);
    expect([fromHand, fromYard].map((id) => [s.cards[id]!.zone, s.cards[id]!.tapped])).toEqual([['battlefield', true], ['battlefield', true]]);
    expect(s.cards[extra]!.zone).toBe('graveyard');
  });
});

describe('E16: discover, incubate, remove X counters, Landers', () => {
  const attackEach = (s: GameState, attacks: { attacker: string; defender: string }[]): GameState => {
    s = goTo(s, 'declareAttackers');
    return settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks })).state;
  };

  it('Long-Range Sensor: a charge counter for each player you attack; two of them discover 4', () => {
    let s = newGame(3);
    const sensor = put(s, 'P1', 'long-range-sensor');
    const a = put(s, 'P1', 'coeurl');
    const b = put(s, 'P1', 'coeurl');
    s = attackEach(s, [{ attacker: a, defender: 'P2' }, { attacker: b, defender: 'P3' }]);
    expect(s.cards[sensor]!.namedCounters?.charge).toBe(2);
    // Discover 4 in the next main phase: lands and bigger cards go to the bottom; Sol Ring is found.
    s = goTo(s, 'main2');
    const lib = s.players.P1!.library;
    const ring = put(s, 'P1', 'sol-ring', 'library');
    const big = put(s, 'P1', 'god-eternal-bontu', 'library');
    const land = put(s, 'P1', 'forest', 'library');
    expect(lib.slice(0, 3)).toEqual([land, big, ring]);
    mana(s, 'P1', { C: 1 });
    s = act(s, { type: 'ActivateAbility', player: 'P1', card: sensor, ability: 0 });
    s = settle(s).state;
    // The found card may be cast free right away; passing instead puts it into your hand.
    expect(s.cards[ring]!.zone).toBe('exile');
    expect(getLegalActions(s).some((x) => x.type === 'CastSpell' && x.card === ring)).toBe(true);
    const cast2 = act(s, { type: 'CastSpell', player: 'P1', card: ring });
    expect(settle(cast2).state.cards[ring]!.zone).toBe('battlefield');
    const passed = act(s, { type: 'PassPriority', player: 'P1' });
    expect(passed.cards[ring]!.zone).toBe('hand');
    expect([passed.cards[big]!.zone, passed.cards[land]!.zone]).toEqual(['library', 'library']);
    expect(passed.players.P1!.library.slice(-2).sort()).toEqual([big, land].sort());
    expect(passed.cards[sensor]!.namedCounters?.charge ?? 0).toBe(0);
  });

  it('Chrome Host Seedshark: a noncreature spell incubates its mana value; {2} transforms the Incubator into a Phyrexian', () => {
    let s = newGame();
    put(s, 'P1', 'chrome-host-seedshark');
    const ring = put(s, 'P1', 'sol-ring', 'hand');
    mana(s, 'P1', { C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: ring }).state;
    const inc = s.players.P1!.battlefield.find((id) => s.cards[id]!.defId === 'incubator-token-eoc')!;
    expect(s.cards[inc]!.counters).toBe(1);
    expect(hasType(s, s.cards[inc]!, 'creature')).toBe(false);
    mana(s, 'P1', { C: 2 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: inc, ability: 0 }).state;
    expect(currentDefinition(s, s.cards[inc]!).name).toBe('Phyrexian');
    expect([powerOf(s, s.cards[inc]!), hasType(s, s.cards[inc]!, 'creature')]).toEqual([1, true]);
    // A creature spell doesn't incubate.
    const bear = put(s, 'P1', 'coeurl', 'hand');
    mana(s, 'P1', { W: 1, C: 1 });
    const before = s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'incubator-token-eoc').length;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: bear }).state;
    expect(s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'incubator-token-eoc').length).toBe(before);
  });

  it('Moxite Refinery: remove X counters from one of your artifacts or creatures to put X charge or +1/+1 counters', () => {
    let s = newGame();
    const refinery = put(s, 'P1', 'moxite-refinery');
    const gavel = put(s, 'P1', 'gavel-of-the-righteous', 'battlefield', { namedCounters: { charge: 3 } });
    const bear = put(s, 'P1', 'coeurl');
    mana(s, 'P1', { C: 2 });
    expect(rejected(s, { type: 'ActivateAbility', player: 'P1', card: refinery, ability: 1, costCards: [gavel], x: 4, targets: [card(bear)] })).toMatch(/aren't 4 counters/);
    expect(getLegalActions(s).filter((a) => a.type === 'ActivateAbility' && a.card === refinery && a.ability === 1 && a.costCards?.[0] === gavel).map((a) => a.type === 'ActivateAbility' && a.x)).toEqual([1, 2, 3]);
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: refinery, ability: 1, costCards: [gavel], x: 2, targets: [card(bear)] }).state;
    expect(s.cards[gavel]!.namedCounters?.charge).toBe(1);
    expect(s.cards[bear]!.counters).toBe(2);
  });

  it('Horizon Explorer: a Lander for each player you attack, and lands you control enter untapped (even from a Lander)', () => {
    let s = newGame(3);
    put(s, 'P1', 'horizon-explorer');
    const a = put(s, 'P1', 'coeurl');
    const b = put(s, 'P1', 'coeurl');
    s = attackEach(s, [{ attacker: a, defender: 'P2' }, { attacker: b, defender: 'P3' }]);
    const landers = s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'lander-token-eoe');
    expect(landers).toHaveLength(2);
    s = goTo(s, 'main2');
    put(s, 'P1', 'forest', 'library');
    mana(s, 'P1', { C: 2 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: landers[0]!, ability: 0 }).state;
    expect(s.cards[landers[0]!]!.zone).not.toBe('battlefield');
    const found = s.players.P1!.battlefield.find((id) => s.cards[id]!.defId === 'forest' || s.cards[id]!.defId === 'island');
    expect(found).toBeDefined();
    expect(s.cards[found!]!.tapped).toBe(false);
  });
});

describe('E17: extra combats, dredge, encore and sacrifice-fuelled exile', () => {
  const passUntil = (s: GameState, done: (s: GameState) => boolean): GameState => {
    for (let i = 0; i < 60 && !done(s); i++) {
      const legal = getLegalActions(s);
      s = act(s, legal.find((a) => a.type === 'PassPriority') ?? legal[0]!);
    }
    return s;
  };

  it('Moraug: a land in the first main phase adds a combat that untaps your creatures; +1/+0 per attack this turn', () => {
    let s = newGame();
    put(s, 'P1', 'moraug-fury-of-akoum');
    const bear = put(s, 'P1', 'coeurl');
    const land = put(s, 'P1', 'mountain', 'hand');
    s = goTo(s, 'main1');
    s = settle(act(s, { type: 'PlayLand', player: 'P1', card: land })).state;
    expect(s.extraCombats).toBe(1);
    s = goTo(s, 'declareAttackers');
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: bear, defender: 'P2' }] })).state;
    expect(powerOf(s, s.cards[bear]!)).toBe(3);
    // The second combat: the creature untaps, attacks again and has attacked twice.
    s = passUntil(s, (t) => t.pending.kind === 'declareAttackers' && (t.combatsThisTurn ?? 0) === 2);
    expect(s.cards[bear]!.tapped).toBe(false);
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: bear, defender: 'P2' }] })).state;
    expect(powerOf(s, s.cards[bear]!)).toBe(4);
    s = passUntil(s, (t) => t.step === 'main2');
    expect(s.step).toBe('main2');
  });

  it('Moraug: a land in the second main phase gives a combat after it, then the end step', () => {
    let s = newGame();
    put(s, 'P1', 'moraug-fury-of-akoum');
    const bear = put(s, 'P1', 'coeurl', 'battlefield', { tapped: true });
    const land = put(s, 'P1', 'mountain', 'hand');
    s = goTo(s, 'main2');
    s = settle(act(s, { type: 'PlayLand', player: 'P1', card: land })).state;
    s = passUntil(s, (t) => t.step === 'declareAttackers' || t.step === 'end');
    expect(s.step).toBe('declareAttackers');
    expect(s.cards[bear]!.tapped).toBe(false);
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [] })).state;
    s = passUntil(s, (t) => t.step === 'end' || t.step === 'main2');
    expect(s.step).toBe('end');
  });

  it('Dakmor Salvage: dredge 2 instead of the draw-step draw, or draw as usual', () => {
    let s = newGame();
    const salvage = put(s, 'P1', 'dakmor-salvage', 'graveyard');
    s = passUntil(s, (t) => t.pending.kind === 'chooseCards' && t.pending.purpose === 'dredge');
    expect(s.pending.kind === 'chooseCards' && [s.pending.player, s.pending.cards]).toEqual(['P1', [salvage]]);
    const [hand, yard] = [s.players.P1!.hand.length, s.players.P1!.graveyard.length];
    const drew = act(s, { type: 'ChooseCards', player: 'P1', cards: [] });
    expect([drew.players.P1!.hand.length, drew.cards[salvage]!.zone]).toEqual([hand + 1, 'graveyard']);
    const dredged = act(s, { type: 'ChooseCards', player: 'P1', cards: [salvage] });
    expect(dredged.cards[salvage]!.zone).toBe('hand');
    expect(dredged.players.P1!.hand.length).toBe(hand + 1);
    // Two milled, the Salvage gone: one more card in the graveyard.
    expect(dredged.players.P1!.graveyard.length).toBe(yard + 1);
  });

  it('Evendo Brushrazer: sacrificing a nontoken permanent exiles the top card, playable on your turn after such a sacrifice', () => {
    let s = newGame();
    const razer = put(s, 'P1', 'evendo-brushrazer');
    const land = put(s, 'P1', 'mountain');
    s = goTo(s, 'main1');
    const top = s.players.P1!.library[0]!;
    // {T}, Sacrifice a land: Add {R}{R}.
    const ways = getLegalActions(s).filter((a) => a.type === 'ActivateManaAbility' && a.card === razer);
    expect(ways.map((a) => a.type === 'ActivateManaAbility' && a.sacrifice)).toEqual([land]);
    s = act(s, ways[0]!);
    expect(s.players.P1!.manaPool.R).toBe(2);
    // The trigger waits for the mana ability to finish, then goes on the stack with the next action.
    s = passUntil(s, (t) => t.cards[top]!.zone === 'exile');
    expect(s.cards[land]!.zone).toBe('graveyard');
    expect(s.cards[top]!.zone).toBe('exile');
    // An Island: playable now (a nontoken permanent was sacrificed this turn, on your turn).
    expect(getLegalActions(s).some((a) => a.type === 'PlayLand' && a.card === top)).toBe(true);
    // Next turn, without a sacrifice: not playable.
    const later = { ...s, turnNumber: s.turnNumber + 2 };
    expect(getLegalActions(later).some((a) => a.type === 'PlayLand' && a.card === top)).toBe(false);
  });

  it('Eumidian Wastewaker: you and the defending player each discard or sacrifice; a card for each land card', () => {
    let s = newGame();
    const waker = put(s, 'P1', 'eumidian-wastewaker');
    const myLand = put(s, 'P1', 'forest', 'hand');
    const theirLand = put(s, 'P2', 'forest');
    s = goTo(s, 'declareAttackers');
    s = act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: waker, defender: 'P2' }] });
    s = passUntil(s, (t) => t.pending.kind === 'chooseCards' && t.pending.purpose === 'discardOrSacrifice');
    expect(s.pending.kind === 'chooseCards' && s.pending.player).toBe('P1');
    s = act(s, { type: 'ChooseCards', player: 'P1', cards: [myLand] });
    expect(s.pending.kind === 'chooseCards' && s.pending.player).toBe('P2');
    const hand = s.players.P1!.hand.length;
    s = act(s, { type: 'ChooseCards', player: 'P2', cards: [theirLand] });
    s = settle(s).state;
    expect([s.cards[myLand]!.zone, s.cards[theirLand]!.zone]).toEqual(['graveyard', 'graveyard']);
    expect(s.players.P1!.hand.length).toBe(hand + 2);
  });

  it('Eumidian Wastewaker: encore makes a hasty copy for each opponent that must attack that opponent', () => {
    let s = newGame(3);
    const waker = put(s, 'P1', 'eumidian-wastewaker', 'graveyard');
    s = goTo(s, 'main1');
    mana(s, 'P1', { B: 2, C: 6 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: waker, ability: 0 }).state;
    expect(s.cards[waker]!.zone).toBe('exile');
    const copies = s.players.P1!.battlefield.filter((id) => s.cards[id]!.isToken && currentDefinition(s, s.cards[id]!).name === 'Eumidian Wastewaker');
    expect(copies).toHaveLength(2);
    expect(copies.map((id) => hasKeyword(s, s.cards[id]!, 'Haste'))).toEqual([true, true]);
    const targets = copies.map((id) => s.cards[id]!.mustAttackPlayer!.player).sort();
    expect(targets).toEqual(['P2', 'P3']);
    s = goTo(s, 'declareAttackers');
    const p2copy = copies.find((id) => s.cards[id]!.mustAttackPlayer!.player === 'P2')!;
    const p3copy = copies.find((id) => s.cards[id]!.mustAttackPlayer!.player === 'P3')!;
    expect(rejected(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: p2copy, defender: 'P3' }, { attacker: p3copy, defender: 'P3' }] })).toMatch(/opponent it was made for/);
    expect(rejected(s, { type: 'DeclareAttackers', player: 'P1', attacks: [] })).toBeTruthy();
    expect(applyAction(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: p2copy, defender: 'P2' }, { attacker: p3copy, defender: 'P3' }] }).ok).toBe(true);
  });
});

describe('Tear Asunder', () => {
  it('exiles an artifact or enchantment; kicked, any nonland permanent', () => {
    let s = newGame();
    const tear = put(s, 'P1', 'tear-asunder', 'hand');
    const bear = put(s, 'P2', 'meltstrider-eulogist');
    const ring = put(s, 'P2', 'sol-ring');
    mana(s, 'P1', { G: 2, B: 2, C: 4 });
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: tear, targets: [{ kind: 'card', card: bear }] })).toBeTruthy();
    let t = cast(s, { type: 'CastSpell', player: 'P1', card: tear, targets: [{ kind: 'card', card: ring }] }).state;
    expect(t.cards[ring]!.zone).toBe('exile');
    t = cast(s, { type: 'CastSpell', player: 'P1', card: tear, kicks: 1, targets: [{ kind: 'card', card: bear }] }).state;
    expect(t.cards[bear]!.zone).toBe('exile');
  });
});
