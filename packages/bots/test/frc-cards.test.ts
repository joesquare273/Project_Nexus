// Reality Fracture's Commander precon (Multiverse Reforged), built group by
// group (docs/commander.md, R1-R5).

import { describe, expect, it } from 'vitest';
import { currentDefinition, getLegalActions, hasKeyword, powerOf, toughnessOf, type GameState } from '@nexus/engine';
import { act, card, cast, fight, goTo, mana, newGame, put, rejected } from './kit-helpers.ts';
import { canBlock } from '../../engine/src/combat.ts';

const canBlockCheck = (s: GameState, blocker: string, attacker: string) => canBlock(s, s.cards[blocker]!, s.cards[attacker]!);

const zone = (s: GameState, id: string) => s.cards[id]!.zone;
const pool = (s: GameState) => s.players.P1!.manaPool;
const manaFrom = (s: GameState, id: string) => [...new Set(getLegalActions(s).filter((a) => a.type === 'ActivateManaAbility' && a.card === id).map((a) => (a as { mana: string }).mana))].sort();

describe('R1: lands and mana', () => {
  it('the Signets turn {1} into two colors; Mystic Gate filters {W/U} into two', () => {
    let s = newGame();
    const signets = ['azorius-signet', 'dimir-signet', 'izzet-signet', 'rakdos-signet'].map((id) => put(s, 'P1', id));
    const gate = put(s, 'P1', 'mystic-gate');
    // Nothing to pay with: no mana from them (Mystic Gate still makes {C}).
    for (const id of signets) expect(manaFrom(s, id)).toEqual([]);
    expect(manaFrom(s, gate)).toEqual(['C']);
    mana(s, 'P1', { C: 4 });
    for (const id of signets) s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: id, mana: currentDefinition(s, s.cards[id]!).manaAbility!.paid!.outputs[0]!.includes('W') ? 'W' : 'U', output: 0, payWith: 0 });
    expect([pool(s).W, pool(s).U, pool(s).B, pool(s).R, pool(s).C]).toEqual([1, 3, 2, 2, 0]);
    // Mystic Gate: pay {W} (or {U}) for {W}{W}, {W}{U} or {U}{U}.
    s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: gate, mana: 'U', output: 2, payWith: 0 });
    expect([pool(s).W, pool(s).U]).toEqual([0, 5]);
  });

  it('Reflecting Pool makes any type a land you control could make, and nothing alone', () => {
    const s = newGame();
    const reflecting = put(s, 'P1', 'reflecting-pool');
    expect(manaFrom(s, reflecting)).toEqual([]);
    put(s, 'P1', 'plains');
    put(s, 'P1', 'mystic-gate');
    expect(manaFrom(s, reflecting)).toEqual(['C', 'W']);
  });

  it('the Turbulent lands enter tapped unless your opponents control eight or more lands', () => {
    let s = newGame();
    const shore = put(s, 'P1', 'turbulent-shore', 'hand');
    let t = act(s, { type: 'PlayLand', player: 'P1', card: shore });
    expect(t.cards[shore]!.tapped).toBe(true);
    expect(manaFrom({ ...t, cards: { ...t.cards, [shore]: { ...t.cards[shore]!, tapped: false } } }, shore)).toEqual(['U', 'W']);
    for (let i = 0; i < 8; i++) put(s, 'P2', 'island');
    t = act(s, { type: 'PlayLand', player: 'P1', card: shore });
    expect(t.cards[shore]!.tapped).toBe(false);
  });

  it('the Landscapes fetch one of their three basic types, tapped, and cycle', () => {
    let s = newGame();
    const land = put(s, 'P1', 'contaminated-landscape');
    const forest = put(s, 'P1', 'forest', 'library');
    const swamp = put(s, 'P1', 'swamp', 'library');
    expect(manaFrom(s, land)).toEqual(['C']);
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: land, ability: 0 }).state;
    expect([zone(s, land), zone(s, swamp), zone(s, forest)]).toEqual(['graveyard', 'battlefield', 'library']);
    expect(s.cards[swamp]!.tapped).toBe(true);
    // Cycling {U}{R}{W} from the hand.
    let u = newGame();
    const perilous = put(u, 'P1', 'perilous-landscape', 'hand');
    mana(u, 'P1', { U: 1, R: 1, W: 1 });
    const cycle = getLegalActions(u).find((a) => a.type === 'ActivateAbility' && a.card === perilous)!;
    u = cast(u, cycle).state;
    expect(zone(u, perilous)).toBe('graveyard');
    expect(u.players.P1!.hand).toHaveLength(1);
  });

  it('Kher Keep makes a 0/1 red Kobold named Kobolds of Kher Keep', () => {
    let s = newGame();
    const keep = put(s, 'P1', 'kher-keep');
    expect(manaFrom(s, keep)).toEqual(['C']);
    mana(s, 'P1', { R: 1, C: 1 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: keep, ability: 0 }).state;
    const kobold = s.players.P1!.battlefield.map((id) => s.cards[id]!).find((c) => c.defId === 'kobolds-of-kher-keep-token')!;
    expect(currentDefinition(s, kobold)).toMatchObject({ name: 'Kobolds of Kher Keep', colors: ['R'], power: 0, toughness: 1 });
    expect(s.cards[keep]!.tapped).toBe(true);
  });

  it('Restless Anchorage becomes a 2/3 flying Bird until end of turn and makes a Map when it attacks; the Map explores', () => {
    let s = newGame();
    const anchorage = put(s, 'P1', 'restless-anchorage', 'hand');
    let t = act(s, { type: 'PlayLand', player: 'P1', card: anchorage });
    expect(t.cards[anchorage]!.tapped).toBe(true);
    s.players.P1!.hand = [];
    s.players.P1!.battlefield.push(anchorage);
    s.cards[anchorage]!.zone = 'battlefield';
    mana(s, 'P1', { W: 1, U: 1, C: 1 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: anchorage, ability: 0 }).state;
    const c = s.cards[anchorage]!;
    expect(currentDefinition(s, c).types).toEqual(expect.arrayContaining(['land', 'creature']));
    expect([powerOf(s, c), toughnessOf(s, c), hasKeyword(s, c, 'Flying')]).toEqual([2, 3, true]);
    expect(currentDefinition(s, c).colors).toEqual(['W', 'U']);
    t = fight(s, [{ attacker: anchorage, defender: 'P2' }]).state;
    expect(t.players.P2!.life).toBe(s.players.P2!.life - 2);
    const map = t.players.P1!.battlefield.find((id) => t.cards[id]!.defId === 'map-token')!;
    expect(map).toBeDefined();
    // At cleanup it's only a land again.
    t = goTo(t, 'end');
    t = goTo(t, 'upkeep');
    expect(currentDefinition(t, t.cards[anchorage]!).types).toEqual(['land']);
    // The Map: {1}, {T}, sacrifice: target creature you control explores (a land on top goes to the hand).
    let m = newGame();
    const token = put(m, 'P1', 'map-token');
    const bear = put(m, 'P1', 'thawbringer');
    const top = put(m, 'P1', 'plains', 'library');
    mana(m, 'P1', { C: 1 });
    m = cast(m, { type: 'ActivateAbility', player: 'P1', card: token, ability: 0, targets: [card(bear)] }).state;
    expect(zone(m, top)).toBe('hand');
    expect(m.players.P1!.battlefield).not.toContain(token);
  });

  it('Restless Spire becomes a 2/1 Elemental with first strike during your turn only, and scries 1 when it attacks', () => {
    let s = newGame();
    const spire = put(s, 'P1', 'restless-spire');
    mana(s, 'P1', { U: 1, R: 1 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: spire, ability: 0 }).state;
    const c = s.cards[spire]!;
    expect([powerOf(s, c), toughnessOf(s, c), hasKeyword(s, c, 'FirstStrike')]).toEqual([2, 1, true]);
    // On an opponent's turn it has no first strike.
    const theirs = { ...s, activePlayer: 'P2' };
    expect(hasKeyword(theirs, theirs.cards[spire]!, 'FirstStrike')).toBe(false);
    // Not a creature, no first strike, before it's animated.
    const plain = newGame();
    const idle = put(plain, 'P1', 'restless-spire');
    expect(hasKeyword(plain, plain.cards[idle]!, 'FirstStrike')).toBe(false);
    expect(rejected(plain, { type: 'ActivateAbility', player: 'P1', card: idle, ability: 0 })).toBeTruthy();
    const after = fight(s, [{ attacker: spire, defender: 'P2' }], {}, { surveilToGraveyard: false }).state;
    expect(after.players.P2!.life).toBe(s.players.P2!.life - 2);
  });
});

describe('R2a: spells', () => {
  const creaturesOf = (s: GameState, pid: string) => s.players[pid]!.battlefield.filter((id) => currentDefinition(s, s.cards[id]!).types.includes('creature'));

  it('Despark exiles a permanent with mana value 4 or more only; Brainsurge draws four and puts two back', () => {
    let s = newGame();
    const despark = put(s, 'P1', 'despark', 'hand');
    const small = put(s, 'P2', 'thawbringer');
    const big = put(s, 'P2', 'sunfall');
    put(s, 'P2', 'akroma-angel-of-fury');
    const angel = s.players.P2!.battlefield.at(-1)!;
    mana(s, 'P1', { W: 1, B: 1 });
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: despark, targets: [card(small)] })).toBeTruthy();
    s = cast(s, { type: 'CastSpell', player: 'P1', card: despark, targets: [card(angel)] }).state;
    expect(zone(s, angel)).toBe('exile');
    void big;
    // Brainsurge.
    let u = newGame();
    const surge = put(u, 'P1', 'brainsurge', 'hand');
    mana(u, 'P1', { U: 1, C: 2 });
    u = act(u, { type: 'CastSpell', player: 'P1', card: surge });
    u = act(u, { type: 'PassPriority', player: 'P1' });
    u = act(u, { type: 'PassPriority', player: 'P2' });
    expect(u.pending.kind).toBe('chooseCards');
    if (u.pending.kind === 'chooseCards') u = cast(u, { type: 'ChooseCards', player: 'P1', cards: u.pending.cards.slice(0, 2) }).state;
    expect(u.players.P1!.hand).toHaveLength(2);
  });

  it('Flawless Maneuver is free while you control a commander, and gives your creatures indestructible', () => {
    let s = newGame();
    const spell = put(s, 'P1', 'flawless-maneuver', 'hand');
    const bear = put(s, 'P1', 'thawbringer');
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: spell, alternative: true })).toMatch(/condition/);
    put(s, 'P1', 'nissa-leyline-tamer', 'battlefield', { isCommander: true });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, alternative: true }).state;
    expect(hasKeyword(s, s.cards[bear]!, 'Indestructible')).toBe(true);
  });

  it('Secure the Wastes and Grand Crescendo make X tokens; Grand Crescendo also gives indestructible', () => {
    let s = newGame();
    const wastes = put(s, 'P1', 'secure-the-wastes', 'hand');
    const crescendo = put(s, 'P1', 'grand-crescendo', 'hand');
    mana(s, 'P1', { W: 3, C: 6 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: wastes, x: 3 }).state;
    expect(creaturesOf(s, 'P1').filter((id) => s.cards[id]!.defId === 'warrior-token')).toHaveLength(3);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: crescendo, x: 2 }).state;
    const citizens = creaturesOf(s, 'P1').filter((id) => s.cards[id]!.defId === 'citizen-token-frc');
    expect(citizens).toHaveLength(2);
    expect(creaturesOf(s, 'P1').every((id) => hasKeyword(s, s.cards[id]!, 'Indestructible'))).toBe(true);
  });

  it('Martial Coup: X Soldiers; at X 5 or more every other creature is destroyed', () => {
    let s = newGame();
    const coup = put(s, 'P1', 'martial-coup', 'hand');
    const mine = put(s, 'P1', 'thawbringer');
    const theirs = put(s, 'P2', 'thawbringer');
    mana(s, 'P1', { W: 2, C: 3 });
    let t = cast(s, { type: 'CastSpell', player: 'P1', card: coup, x: 3 }).state;
    expect([zone(t, mine), zone(t, theirs)]).toEqual(['battlefield', 'battlefield']);
    expect(creaturesOf(t, 'P1')).toHaveLength(4);
    mana(s, 'P1', { C: 2 });
    t = cast(s, { type: 'CastSpell', player: 'P1', card: coup, x: 5 }).state;
    expect([zone(t, mine), zone(t, theirs)]).toEqual(['graveyard', 'graveyard']);
    expect(creaturesOf(t, 'P1').map((id) => t.cards[id]!.defId)).toEqual(Array(5).fill('soldier-token-frc'));
  });

  it("White Sun's Twilight: X life and X Mites (toxic 1, can't block); at X 5 or more the rest die", () => {
    let s = newGame();
    const twilight = put(s, 'P1', 'white-suns-twilight', 'hand');
    const theirs = put(s, 'P2', 'thawbringer');
    mana(s, 'P1', { W: 2, C: 5 });
    const life = s.players.P1!.life;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: twilight, x: 5 }).state;
    expect(s.players.P1!.life).toBe(life + 5);
    expect(zone(s, theirs)).toBe('graveyard');
    const mites = creaturesOf(s, 'P1');
    expect(mites).toHaveLength(5);
    // A Mite hits: 1 damage and 1 poison counter; it can't block.
    for (const id of mites) s.cards[id]!.summoningSick = false;
    const hit = fight(s, [{ attacker: mites[0]!, defender: 'P2' }]).state;
    expect([hit.players.P2!.life, hit.players.P2!.poison]).toEqual([s.players.P2!.life - 1, 1]);
    const u = newGame();
    const mite = put(u, 'P1', 'phyrexian-mite-token-frc');
    const attacker = put(u, 'P2', 'thawbringer');
    expect(canBlockCheck(u, mite, attacker)).toBe(false);
  });

  it('Sunfall exiles every creature and makes an Incubator with that many +1/+1 counters', () => {
    let s = newGame();
    const sunfall = put(s, 'P1', 'sunfall', 'hand');
    const a = put(s, 'P1', 'thawbringer');
    const b = put(s, 'P2', 'thawbringer');
    const c = put(s, 'P2', 'nissa-leyline-tamer');
    mana(s, 'P1', { W: 2, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: sunfall }).state;
    expect([zone(s, a), zone(s, b), zone(s, c)]).toEqual(['exile', 'exile', 'exile']);
    const incubator = s.players.P1!.battlefield.map((id) => s.cards[id]!).find((x) => x.defId === 'incubator-token-frc')!;
    expect(incubator.counters).toBe(3);
  });

  it('Whirlwind of Thought draws on each noncreature spell; Occult Epiphany makes a Spirit per card type discarded', () => {
    let s = newGame();
    put(s, 'P1', 'whirlwind-of-thought');
    const surge = put(s, 'P1', 'despark', 'hand');
    const target = put(s, 'P2', 'nissa-leyline-tamer');
    const creature = put(s, 'P1', 'thawbringer', 'hand');
    mana(s, 'P1', { W: 1, B: 1, G: 1, C: 2 });
    const hand = s.players.P1!.hand.length;
    void creature;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: surge, targets: [card(target)] }).state;
    expect(s.players.P1!.hand).toHaveLength(hand - 1 + 1);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: creature }).state;
    expect(s.players.P1!.hand).toHaveLength(hand - 1);
    // Occult Epiphany for 2: draw two (a land and an instant), discard them: two card types, two Spirits.
    let u = newGame();
    const epiphany = put(u, 'P1', 'occult-epiphany', 'hand');
    put(u, 'P1', 'despark', 'library');
    put(u, 'P1', 'plains', 'library');
    mana(u, 'P1', { U: 1, C: 2 });
    u = act(u, { type: 'CastSpell', player: 'P1', card: epiphany, x: 2 });
    u = act(u, { type: 'PassPriority', player: 'P1' });
    u = act(u, { type: 'PassPriority', player: 'P2' });
    expect(u.pending.kind).toBe('chooseCards');
    if (u.pending.kind === 'chooseCards') u = cast(u, { type: 'ChooseCards', player: 'P1', cards: u.pending.cards.slice(0, 2) }).state;
    const spirits = u.players.P1!.battlefield.filter((id) => u.cards[id]!.defId === 'spirit-token-frc');
    expect(spirits).toHaveLength(2);
    expect(hasKeyword(u, u.cards[spirits[0]!]!, 'Flying')).toBe(true);
  });
});
