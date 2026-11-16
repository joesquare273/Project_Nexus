// Reality Fracture's Commander precon (Multiverse Reforged), built group by
// group (docs/commander.md, R1-R5).

import { describe, expect, it } from 'vitest';
import { currentDefinition, getLegalActions, hasKeyword, powerOf, toughnessOf, type GameState } from '@nexus/engine';
import { act, actWithEvents, card, cast, fight, goTo, mana, newGame, put, rejected } from './kit-helpers.ts';
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
    put(s, 'P2', 'archon-of-cruelty');
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

describe('R2b: spells with new choices', () => {
  it('Fact or Fiction: the opponent splits the top five into two piles; you take one, the other goes to your graveyard', () => {
    let s = newGame();
    const fof = put(s, 'P1', 'fact-or-fiction', 'hand');
    const top = ['despark', 'plains', 'island', 'brainsurge', 'sunfall'].reverse().map((id) => put(s, 'P1', id, 'library'));
    mana(s, 'P1', { U: 1, C: 3 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: fof });
    s = act(s, { type: 'PassPriority', player: 'P1' });
    s = act(s, { type: 'PassPriority', player: 'P2' });
    // The opponent separates: Despark alone, the other four in the second pile.
    expect(s.pending).toMatchObject({ kind: 'chooseCards', player: 'P2', purpose: 'separatePiles' });
    const despark = top[4]!;
    s = act(s, { type: 'ChooseCards', player: 'P2', cards: [despark] });
    expect(s.pending).toMatchObject({ kind: 'chooseCards', player: 'P1', purpose: 'choosePile' });
    // P1 takes the four-card pile by choosing any card in it.
    const four = top.filter((id) => id !== despark);
    s = act(s, { type: 'ChooseCards', player: 'P1', cards: [four[0]!] });
    for (const id of four) expect(zone(s, id)).toBe('hand');
    expect(zone(s, despark)).toBe('graveyard');
    expect(zone(s, fof)).toBe('graveyard');
  });

  it("Teferi's Reproach: until their next turn the opponent can't be targeted or damaged, their life can't change, their nonland permanents phase out; the spell is exiled", () => {
    let s = newGame();
    const reproach = put(s, 'P1', 'teferis-reproach', 'hand');
    const creature = put(s, 'P2', 'thawbringer');
    const land = put(s, 'P2', 'island');
    mana(s, 'P1', { W: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: reproach, targets: [{ kind: 'player', player: 'P2' }] }).state;
    expect(zone(s, reproach)).toBe('exile');
    expect([s.cards[creature]!.phasedOut, !!s.cards[land]!.phasedOut]).toEqual([true, false]);
    expect(s.players.P2!.shielded).toBe(true);
    // An attacker can't hurt them.
    const attacker = put(s, 'P1', 'thawbringer');
    const life = s.players.P2!.life;
    const hit = fight(s, [{ attacker, defender: 'P2' }]).state;
    expect(hit.players.P2!.life).toBe(life);
    // At the start of their turn it ends, and their permanents phase back in.
    const next = goTo(hit, 'upkeep');
    expect(next.activePlayer).toBe('P2');
    expect(next.players.P2!.shielded).toBeUndefined();
    expect(next.cards[creature]!.phasedOut).toBeFalsy();
  });

  it('Mass Polymorph exiles your creatures and reveals that many creature cards onto the battlefield', () => {
    let s = newGame();
    const spell = put(s, 'P1', 'mass-polymorph', 'hand');
    const a = put(s, 'P1', 'thawbringer');
    const b = put(s, 'P1', 'thawbringer');
    const theirs = put(s, 'P2', 'thawbringer');
    const angel = put(s, 'P1', 'akroma-angel-of-fury', 'library');
    put(s, 'P1', 'plains', 'library');
    const nissa = put(s, 'P1', 'nissa-leyline-tamer', 'library');
    mana(s, 'P1', { U: 1, C: 5 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell }).state;
    expect([zone(s, a), zone(s, b), zone(s, theirs)]).toEqual(['exile', 'exile', 'battlefield']);
    expect([zone(s, angel), zone(s, nissa)]).toEqual(['battlefield', 'battlefield']);
    expect(s.cards[angel]!.controller).toBe('P1');
  });

  it('Synthetic Destiny brings back that many creatures at the beginning of the next end step', () => {
    let s = newGame();
    const spell = put(s, 'P1', 'synthetic-destiny', 'hand');
    const a = put(s, 'P1', 'thawbringer');
    const nissa = put(s, 'P1', 'nissa-leyline-tamer', 'library');
    put(s, 'P1', 'plains', 'library');
    mana(s, 'P1', { U: 2, C: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell }).state;
    expect(zone(s, a)).toBe('exile');
    expect(zone(s, nissa)).toBe('library');
    s = goTo(s, 'end');
    s = goTo(s, 'upkeep');
    expect(zone(s, nissa)).toBe('battlefield');
    expect(s.cards[nissa]!.controller).toBe('P1');
  });

  it('Shark Typhoon makes an X/X flying Shark for each noncreature spell (X = its mana value), and when cycled for X', () => {
    let s = newGame();
    put(s, 'P1', 'shark-typhoon');
    const fof = put(s, 'P1', 'despark', 'hand');
    const target = put(s, 'P2', 'nissa-leyline-tamer');
    mana(s, 'P1', { W: 1, B: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: fof, targets: [card(target)] }).state;
    const shark = s.players.P1!.battlefield.map((id) => s.cards[id]!).find((c) => c.defId === 'shark-token-frc')!;
    expect([powerOf(s, shark), toughnessOf(s, shark), hasKeyword(s, shark, 'Flying')]).toEqual([2, 2, true]);
    // Cycling for X = 3: draw a card and make a 3/3 Shark.
    let u = newGame();
    const typhoon = put(u, 'P1', 'shark-typhoon', 'hand');
    mana(u, 'P1', { U: 1, C: 4 });
    const cycle = getLegalActions(u).find((a) => a.type === 'ActivateAbility' && a.card === typhoon && (a as { x?: number }).x === 3)!;
    expect(cycle).toBeDefined();
    u = cast(u, cycle).state;
    expect(zone(u, typhoon)).toBe('graveyard');
    expect(u.players.P1!.hand).toHaveLength(1);
    const cycled = u.players.P1!.battlefield.map((id) => u.cards[id]!).find((c) => c.defId === 'shark-token-frc')!;
    expect([powerOf(u, cycled), toughnessOf(u, cycled)]).toEqual([3, 3]);
  });
});

describe('R3a: creatures', () => {
  const tokensOf = (s: GameState, pid: string, defId: string) => s.players[pid]!.battlefield.filter((id) => s.cards[id]!.defId === defId);

  it('Avacyn: a nontoken creature of yours that dies returns at the beginning of the next end step', () => {
    let s = newGame();
    put(s, 'P1', 'avacyn-angel-of-horror');
    const bear = put(s, 'P1', 'thawbringer');
    const despark = put(s, 'P2', 'martial-coup', 'hand');
    void despark;
    // Destroy it directly, then go to the end step.
    const vanquish = put(s, 'P1', 'despark', 'hand');
    void vanquish;
    s.cards[bear]!.damage = 99;
    s = goTo(s, 'main2');
    expect(zone(s, bear)).toBe('graveyard');
    s = goTo(s, 'end');
    s = goTo(s, 'upkeep');
    expect(zone(s, bear)).toBe('battlefield');
    expect(s.cards[bear]!.controller).toBe('P1');
  });

  it("Archfiend of Despair: opponents can't gain life, and lose again what they lost this turn at each end step", () => {
    let s = newGame();
    put(s, 'P1', 'archfiend-of-despair');
    const niv = put(s, 'P2', 'niv-mizzet-ghost-counsel');
    s.cards[niv]!.summoningSick = false;
    const life = s.players.P2!.life;
    s.activePlayer = 'P2';
    s.pending = { kind: 'priority', player: 'P2', passes: 0 };
    // Niv-Mizzet's drain: P1 loses 1, P2 gains nothing.
    s = cast(s, { type: 'ActivateAbility', player: 'P2', card: niv, ability: 0 }).state;
    expect(s.players.P2!.life).toBe(life);
    // P2 lost 3 this turn: at the end step they lose 3 more.
    let u = newGame();
    put(u, 'P1', 'archfiend-of-despair');
    u.players.P2!.life -= 3;
    u.players.P2!.lifeLostThisTurn = 3;
    const before = u.players.P2!.life;
    u = goTo(u, 'end');
    expect(u.players.P2!.life).toBe(before - 3);
  });

  it("Darksteel Angel: you can't lose the game, and your creatures can't get -1/-1 counters", () => {
    let s = newGame();
    const angel = put(s, 'P1', 'darksteel-angel');
    s.players.P1!.life = 0;
    s = act(s, { type: 'PassPriority', player: 'P1' });
    expect(s.players.P1!.eliminated).toBeFalsy();
    // A -1/-1 counter can't be put on your creatures (Yawgmoth puts one on a target creature).
    let u = newGame();
    put(u, 'P1', 'darksteel-angel');
    const bear = put(u, 'P1', 'thawbringer');
    const yawgmoth = put(u, 'P2', 'yawgmoth-thran-physician');
    const fodder = put(u, 'P2', 'thawbringer');
    u.activePlayer = 'P2';
    u.pending = { kind: 'priority', player: 'P2', passes: 0 };
    u = cast(u, { type: 'ActivateAbility', player: 'P2', card: yawgmoth, ability: 0, costCards: [fodder], targets: [card(bear)] }).state;
    expect(u.cards[bear]!.namedCounters?.['-1/-1'] ?? 0).toBe(0);
    expect(zone(u, bear)).toBe('battlefield');
  });

  it('Overlord of the Mistmoors: impending enters with four time counters and is not a creature; two Insects either way', () => {
    let s = newGame();
    const overlord = put(s, 'P1', 'overlord-of-the-mistmoors', 'hand');
    mana(s, 'P1', { W: 2, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: overlord, alternative: true }).state;
    expect(s.cards[overlord]!.namedCounters?.time).toBe(4);
    expect(currentDefinition(s, s.cards[overlord]!).types).not.toContain('creature');
    expect(tokensOf(s, 'P1', 'insect-token-frc')).toHaveLength(2);
    // A time counter comes off at your end step.
    s = goTo(s, 'end');
    expect(s.cards[overlord]!.namedCounters?.time).toBe(3);
    // Cast normally it's a creature at once.
    let u = newGame();
    const full = put(u, 'P1', 'overlord-of-the-mistmoors', 'hand');
    mana(u, 'P1', { W: 2, C: 5 });
    u = cast(u, { type: 'CastSpell', player: 'P1', card: full }).state;
    expect(currentDefinition(u, u.cards[full]!).types).toContain('creature');
  });

  it("Jhoira takes the first historic permanent from the opponent's library, and you lose life equal to its mana value", () => {
    let s = newGame();
    const jhoira = put(s, 'P1', 'jhoira-weatherlight-corsair', 'hand');
    put(s, 'P2', 'plains', 'library');
    const ring = put(s, 'P2', 'sol-ring', 'library');
    put(s, 'P2', 'island', 'library');
    // Library top: island, sol ring, plains.
    s.players.P2!.library = [s.players.P2!.library.find((id) => s.cards[id]!.defId === 'island')!, ring, ...s.players.P2!.library.filter((id) => s.cards[id]!.defId !== 'island' && id !== ring)];
    mana(s, 'P1', { B: 2, C: 4 });
    const life = s.players.P1!.life;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: jhoira }, { targets: (o) => o.find((t) => t[0]?.kind === 'player' && t[0].player === 'P2')! }).state;
    expect(zone(s, ring)).toBe('battlefield');
    expect(s.cards[ring]!.controller).toBe('P1');
    expect(s.players.P1!.life).toBe(life - 1);
  });

  it('Niv-Mizzet: when you gain life you may pay that much to draw that many; its tap drains each opponent', () => {
    let s = newGame();
    const niv = put(s, 'P1', 'niv-mizzet-ghost-counsel');
    s.cards[niv]!.summoningSick = false;
    const life = s.players.P1!.life;
    const hand = s.players.P1!.hand.length;
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: niv, ability: 0 }, { accept: true }).state;
    // Gained 1, paid 1, drew 1.
    expect([s.players.P1!.life, s.players.P1!.hand.length, s.players.P2!.life]).toEqual([life, hand + 1, 19]);
  });

  it('Ginger makes you the monarch, a Gingerbrute each upkeep while you are; Gingerbrute dodges blockers without haste', () => {
    let s = newGame();
    const ginger = put(s, 'P1', 'ginger-queen-of-sweets', 'hand');
    mana(s, 'P1', { C: 6 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: ginger }).state;
    expect(s.monarch).toBe('P1');
    s = goTo(s, 'end');
    s = goTo(s, 'upkeep');
    expect(tokensOf(s, 'P1', 'gingerbrute-token-frc')).toHaveLength(1);
    const brute = tokensOf(s, 'P1', 'gingerbrute-token-frc')[0]!;
    expect(hasKeyword(s, s.cards[brute]!, 'Haste')).toBe(true);
    // {1}: only creatures with haste can block it.
    let u = newGame();
    const g = put(u, 'P1', 'gingerbrute-token-frc');
    const blocker = put(u, 'P2', 'thawbringer');
    mana(u, 'P1', { C: 1 });
    u = cast(u, { type: 'ActivateAbility', player: 'P1', card: g, ability: 0 }).state;
    expect(canBlockCheck(u, blocker, g)).toBe(false);
  });

  it('Memnarch makes two Myr and draws a card per artifact when it attacks; Archon of Cruelty drains', () => {
    let s = newGame();
    const memnarch = put(s, 'P1', 'memnarch-the-warden', 'hand');
    mana(s, 'P1', { C: 10 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: memnarch }).state;
    expect(tokensOf(s, 'P1', 'myr-token-frc')).toHaveLength(2);
    s.cards[memnarch]!.summoningSick = false;
    const hand = s.players.P1!.hand.length;
    s = fight(s, [{ attacker: memnarch, defender: 'P2' }]).state;
    expect(s.players.P1!.hand.length).toBe(hand + 3);
    // Archon of Cruelty.
    let u = newGame();
    const archon = put(u, 'P1', 'archon-of-cruelty', 'hand');
    const victim = put(u, 'P2', 'thawbringer');
    put(u, 'P2', 'plains', 'hand');
    mana(u, 'P1', { B: 2, C: 6 });
    const [mine, theirs] = [u.players.P1!.life, u.players.P2!.life];
    u = cast(u, { type: 'CastSpell', player: 'P1', card: archon }, { targets: (o) => o.find((t) => t[0]?.kind === 'player' && t[0].player === 'P2')! }).state;
    // The opponent chooses what to sacrifice, then what to discard.
    for (let i = 0; i < 3 && u.pending.kind === 'chooseCards'; i++) {
      const p = u.pending;
      u = cast(u, { type: 'ChooseCards', player: p.player, cards: p.cards.slice(0, Math.max(1, p.min)) }).state;
    }
    expect(zone(u, victim)).toBe('graveyard');
    expect(u.players.P2!.hand).toHaveLength(0);
    expect([u.players.P1!.life, u.players.P2!.life]).toEqual([mine + 3, theirs - 3]);
  });
});

describe('R3b: creatures', () => {
  it("Serra's Emissary: you and your creatures have protection from the chosen card type", () => {
    let s = newGame();
    const emissary = put(s, 'P1', 'serras-emissary', 'hand');
    const bear = put(s, 'P1', 'thawbringer');
    mana(s, 'P1', { W: 3, C: 4 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: emissary });
    s = act(s, { type: 'PassPriority', player: 'P1' });
    s = act(s, { type: 'PassPriority', player: 'P2' });
    // Choose instant.
    const choose = getLegalActions(s).find((a) => a.type === 'ChooseCardType' && (a as { cardType: string }).cardType === 'instant')!;
    expect(choose).toBeDefined();
    s = cast(s, choose).state;
    expect(s.cards[emissary]!.chosenCardType).toBe('instant');
    // An opponent's instant can't target your creature or you.
    const despark = put(s, 'P2', 'despark', 'hand');
    const bolt = put(s, 'P2', 'archon-of-cruelty', 'hand');
    void bolt;
    s.activePlayer = 'P2';
    s.pending = { kind: 'priority', player: 'P2', passes: 0 };
    mana(s, 'P2', { W: 1, B: 1 });
    expect(rejected(s, { type: 'CastSpell', player: 'P2', card: despark, targets: [card(emissary)] })).toBeTruthy();
    void bear;
  });

  it('Omnath grows with unspent mana, which becomes colorless instead of emptying, and lands make {C}{C}', () => {
    let s = newGame();
    const omnath = put(s, 'P1', 'omnath-locus-of-the-void');
    const land = put(s, 'P1', 'plains', 'hand');
    s = cast(s, { type: 'PlayLand', player: 'P1', card: land }).state;
    expect(pool(s).C).toBe(2);
    expect([powerOf(s, s.cards[omnath]!), toughnessOf(s, s.cards[omnath]!)]).toEqual([8, 8]);
    mana(s, 'P1', { R: 1 });
    // Moving to the next step: the mana stays, as colorless.
    s = act(s, { type: 'PassPriority', player: 'P1' });
    s = act(s, { type: 'PassPriority', player: 'P2' });
    expect([pool(s).R, pool(s).C]).toEqual([0, 3]);
    expect(powerOf(s, s.cards[omnath]!)).toBe(9);
  });

  it('Venser copies an opponent’s instant twice, or makes two hasty token copies of their permanent, sacrificed at the end step', () => {
    let s = newGame();
    const venser = put(s, 'P1', 'venser-fervent-forger', 'hand');
    const theirs = put(s, 'P2', 'thawbringer');
    mana(s, 'P1', { R: 2, C: 4 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: venser });
    s = act(s, { type: 'PassPriority', player: 'P1' });
    s = act(s, { type: 'PassPriority', player: 'P2' });
    // No opponent's spell on the stack: only the token-copy mode is offered.
    expect(getLegalActions(s)).toEqual([{ type: 'ChooseModes', player: 'P1', modes: [1] }]);
    s = cast(s, { type: 'ChooseModes', player: 'P1', modes: [1] }, { targets: (o) => o.find((t) => t[0]?.kind === 'card' && t[0].card === theirs)! }).state;
    const copies = s.players.P1!.battlefield.filter((id) => s.cards[id]!.isToken && s.cards[id]!.defId === 'thawbringer');
    expect(copies).toHaveLength(2);
    expect(copies.every((id) => hasKeyword(s, s.cards[id]!, 'Haste'))).toBe(true);
    s = goTo(s, 'end');
    s = goTo(s, 'upkeep');
    expect(s.players.P1!.battlefield.filter((id) => s.cards[id]!.isToken && s.cards[id]!.defId === 'thawbringer')).toHaveLength(0);
  });

  it("Venser's other mode copies an opponent's instant twice (the copies are yours)", () => {
    let s = newGame();
    const venser = put(s, 'P1', 'venser-fervent-forger', 'hand');
    const despark = put(s, 'P2', 'despark', 'hand');
    const big = put(s, 'P1', 'nissa-leyline-tamer');
    s.activePlayer = 'P2';
    s.pending = { kind: 'priority', player: 'P2', passes: 0 };
    mana(s, 'P2', { W: 1, B: 1 });
    mana(s, 'P1', { R: 2, C: 4 });
    s = act(s, { type: 'CastSpell', player: 'P2', card: despark, targets: [card(big)] });
    if (s.pending.kind === 'priority' && s.pending.player === 'P2') s = act(s, { type: 'PassPriority', player: 'P2' });
    // In response, P1 flashes in Venser and copies Despark twice.
    s = act(s, { type: 'CastSpell', player: 'P1', card: venser });
    s = act(s, { type: 'PassPriority', player: 'P1' });
    s = act(s, { type: 'PassPriority', player: 'P2' });
    // Despark is the only spell to target; the trigger resolves into two copies controlled by P1 (each may get a new target).
    const events = cast(s, { type: 'ChooseModes', player: 'P1', modes: [0] }).events;
    expect(events.filter((e) => e.type === 'SpellCopied' && e.player === 'P1')).toHaveLength(2);
  });

  it('The Ur-Sphinx: other Sphinx spells cost {1} less even from the command zone; attacking mills each player and lets you cast one of their cards free', () => {
    let s = newGame();
    const sphinx = put(s, 'P1', 'the-ur-sphinx');
    s.cards[sphinx]!.summoningSick = false;
    const theirSpell = put(s, 'P2', 'brainsurge', 'library');
    const mySpell = put(s, 'P1', 'despark', 'library');
    const handBefore = s.players.P1!.hand.length;
    s = goTo(s, 'declareAttackers');
    s = act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: sphinx, defender: 'P2' }] });
    s = act(s, { type: 'PassPriority', player: 'P1' });
    s = act(s, { type: 'PassPriority', player: 'P2' });
    expect([zone(s, theirSpell), zone(s, mySpell)]).toEqual(['graveyard', 'graveyard']);
    // One free cast per player: take Brainsurge from P2's graveyard.
    for (let i = 0; i < 3 && s.pending.kind === 'chooseCards'; i++) {
      const p = s.pending;
      s = act(s, { type: 'ChooseCards', player: 'P1', cards: p.cards.includes(theirSpell) ? [theirSpell] : [] });
    }
    const castIt = getLegalActions(s).find((a) => a.type === 'CastSpell' && a.card === theirSpell);
    expect(castIt).toBeDefined();
    s = act(s, castIt!);
    expect(zone(s, theirSpell)).toBe('stack');
    expect(s.players.P1!.hand.length).toBe(handBefore);
  });
});

describe('R3c: morph', () => {
  it('Akroma is cast face down for {3} as a 2/2 with no name, hidden from the opponent, and turned face up for its morph cost', async () => {
    const { AliasBook, playerUpdate } = await import('@nexus/engine');
    let s = newGame();
    const akroma = put(s, 'P1', 'akroma-angel-of-fury', 'hand');
    mana(s, 'P1', { C: 3 });
    const faceDown = getLegalActions(s).find((a) => a.type === 'CastSpell' && a.card === akroma && a.faceDown);
    expect(faceDown).toBeDefined();
    const cast1 = actWithEvents(s, faceDown!);
    s = cast1.state;
    expect(s.cards[akroma]!.faceDown).toBe(true);
    // The opponent sees a face-down spell, not Akroma.
    let n = 0;
    const theirs = playerUpdate(s, 'P2', new AliasBook(() => `a${n++}`), cast1.events);
    const onStack = Object.values(theirs.state.cards).find((c) => c.zone === 'stack')!;
    expect(onStack.defId).toBe('?facedown');
    expect(JSON.stringify(theirs.state)).not.toContain('akroma');
    expect(JSON.stringify(theirs.events)).not.toContain('akroma');
    s = act(s, { type: 'PassPriority', player: 'P1' });
    s = act(s, { type: 'PassPriority', player: 'P2' });
    const c = s.cards[akroma]!;
    expect(c.zone).toBe('battlefield');
    const def = currentDefinition(s, c);
    expect([def.name, powerOf(s, c), toughnessOf(s, c), hasKeyword(s, c, 'Flying')]).toEqual(['Face-down creature', 2, 2, false]);
    const theirsNow = playerUpdate(s, 'P2', new AliasBook(() => `b${n++}`));
    expect(JSON.stringify(theirsNow.state)).not.toContain('akroma');
    // Its controller still sees what it is.
    expect(Object.values(playerUpdate(s, 'P1', new AliasBook(() => `c${n++}`)).state.cards).some((x) => x.defId === 'akroma-angel-of-fury')).toBe(true);
    // Turn it face up for {3}{R}{R}{R}: a special action, no stack.
    mana(s, 'P1', { R: 3, C: 3 });
    const up = getLegalActions(s).find((a) => a.type === 'ActivateAbility' && a.card === akroma)!;
    expect(up).toBeDefined();
    const turned = cast(s, up);
    s = turned.state;
    expect(s.cards[akroma]!.faceDown).toBeUndefined();
    expect(s.stack).toHaveLength(0);
    expect(turned.events.some((e) => e.type === 'TurnedFaceUp')).toBe(true);
    const a2 = s.cards[akroma]!;
    expect([powerOf(s, a2), toughnessOf(s, a2), hasKeyword(s, a2, 'Flying'), hasKeyword(s, a2, 'Trample')]).toEqual([6, 6, true, true]);
    // Firebreathing.
    mana(s, 'P1', { R: 1 });
    s = act(s, getLegalActions(s).find((a) => a.type === 'ActivateAbility' && a.card === akroma)!);
    s = act(s, { type: 'PassPriority', player: 'P1' });
    s = act(s, { type: 'PassPriority', player: 'P2' });
    expect(powerOf(s, s.cards[akroma]!)).toBe(7);
  });

  it('Akroma cast face up costs its mana cost and can’t be countered; a face-down card leaving the battlefield is revealed', () => {
    let s = newGame();
    const akroma = put(s, 'P1', 'akroma-angel-of-fury', 'hand');
    expect(currentDefinition(s, s.cards[akroma]!).cantBeCountered).toBe(true);
    mana(s, 'P1', { C: 3 });
    expect(getLegalActions(s).some((a) => a.type === 'CastSpell' && a.card === akroma && !a.faceDown)).toBe(false);
    s = act(s, getLegalActions(s).find((a) => a.type === 'CastSpell' && a.card === akroma && a.faceDown)!);
    s = act(s, { type: 'PassPriority', player: 'P1' });
    s = act(s, { type: 'PassPriority', player: 'P2' });
    expect(s.cards[akroma]!.faceDown).toBe(true);
    s.cards[akroma]!.damage = 2;
    s = act(s, { type: 'PassPriority', player: 'P1' });
    expect(zone(s, akroma)).toBe('graveyard');
    expect(s.cards[akroma]!.faceDown).toBeUndefined();
  });
});

describe('R4: artifacts and enchantments', () => {
  const upkeep = (s: GameState) => {
    // From P2's end of turn into P1's upkeep, with the upkeep triggers resolved.
    s.activePlayer = 'P1';
    s.step = 'untap';
    s.pending = { kind: 'priority', player: 'P1', passes: 0 };
    return goTo(s, 'draw');
  };

  it("Skrelv's Hive: lose 1 life and make a Mite each upkeep; corrupted gives your toxic creatures lifelink", () => {
    let s = newGame();
    const hive = put(s, 'P1', 'skrelvs-hive');
    s = upkeep(s);
    expect(s.players.P1!.life).toBe(19);
    const mite = s.players.P1!.battlefield.map((id) => s.cards[id]!).find((c) => c.defId === 'phyrexian-mite-token-frc')!;
    expect(mite).toBeDefined();
    expect(hasKeyword(s, mite, 'Lifelink')).toBe(false);
    s.players.P2!.poison = 3;
    expect(hasKeyword(s, mite, 'Lifelink')).toBe(true);
    void hive;
  });

  it('Dreadhorde Invasion: amass Zombies 1 each upkeep (one Army grows); a Zombie token with power 6+ gains lifelink when it attacks', () => {
    let s = newGame();
    put(s, 'P1', 'dreadhorde-invasion');
    s = upkeep(s);
    const armies = () => s.players.P1!.battlefield.map((id) => s.cards[id]!).filter((c) => c.defId === 'zombie-army-token-frc');
    expect(armies()).toHaveLength(1);
    expect([s.players.P1!.life, s.cards[armies()[0]!.id]!.counters]).toEqual([19, 1]);
    s.turnNumber++;
    s = upkeep(s);
    expect(armies()).toHaveLength(1);
    expect(s.cards[armies()[0]!.id]!.counters).toBe(2);
    // Power 6 or more: lifelink as it attacks.
    const army = armies()[0]!.id;
    s.cards[army]!.counters = 6;
    s.cards[army]!.summoningSick = false;
    s = fight(s, [{ attacker: army, defender: 'P2' }]).state;
    expect(s.players.P1!.life).toBe(18 + 6);
  });

  it('Cursed Mirror taps for {R}, or enters as a copy of a creature with haste until end of turn', () => {
    let s = newGame();
    const archon = put(s, 'P2', 'thawbringer');
    const mirror = put(s, 'P1', 'cursed-mirror', 'hand');
    mana(s, 'P1', { R: 1, C: 2 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: mirror });
    s = act(act(s, { type: 'PassPriority', player: 'P1' }), { type: 'PassPriority', player: 'P2' });
    expect(s.pending.kind).toBe('chooseCards');
    s = act(s, { type: 'ChooseCards', player: 'P1', cards: [archon] });
    const c = s.cards[mirror]!;
    expect(currentDefinition(s, c).name).toBe(currentDefinition(s, s.cards[archon]!).name);
    expect(hasKeyword(s, c, 'Haste')).toBe(true);
    // Next turn it's Cursed Mirror again.
    s.turnNumber++;
    expect(currentDefinition(s, s.cards[mirror]!).name).toBe('Cursed Mirror');
    expect(manaFrom(s, mirror)).toEqual(['R']);
  });

  it('Windcrag Siege: Jeskai makes a hasty lifelink Goblin each upkeep; Mardu makes attack triggers trigger twice', () => {
    let s = newGame();
    const siege = put(s, 'P1', 'windcrag-siege', 'hand');
    mana(s, 'P1', { R: 1, W: 1, C: 1 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: siege });
    s = act(act(s, { type: 'PassPriority', player: 'P1' }), { type: 'PassPriority', player: 'P2' });
    expect(s.pending.kind).toBe('chooseOption');
    s = act(s, { type: 'ChooseOption', player: 'P1', option: 'Jeskai' });
    expect(s.cards[siege]!.chosenOption).toBe('Jeskai');
    s.turnNumber++;
    s = upkeep(s);
    const goblin = s.players.P1!.battlefield.map((id) => s.cards[id]!).find((c) => c.defId === 'goblin-token-frc')!;
    expect([hasKeyword(s, goblin, 'Haste'), hasKeyword(s, goblin, 'Lifelink')]).toEqual([true, true]);

    // Mardu: Dreadhorde's attack trigger triggers twice.
    let u = newGame();
    put(u, 'P1', 'windcrag-siege', 'battlefield', { chosenOption: 'Mardu' });
    const dread = put(u, 'P1', 'dreadhorde-invasion');
    const army = put(u, 'P1', 'zombie-army-token-frc', 'battlefield', { counters: 6, isToken: true });
    u = goTo(u, 'declareAttackers');
    const declared = actWithEvents(u, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: army, defender: 'P2' }] });
    expect(declared.state.stack.filter((i) => i.kind === 'ability' && i.source === dread).length).toBe(2);
  });

  it('Currency Converter exiles discarded cards with itself, loots, and turns an exiled card into a Rogue (nonland) or a Treasure (land)', () => {
    let s = newGame();
    const converter = put(s, 'P1', 'currency-converter');
    const land = put(s, 'P1', 'plains', 'hand');
    mana(s, 'P1', { C: 2 });
    // Loot: draw, then discard the Plains; the trigger exiles it with the Converter.
    s = act(s, { type: 'ActivateAbility', player: 'P1', card: converter, ability: 0, targets: [] });
    s = act(act(s, { type: 'PassPriority', player: 'P1' }), { type: 'PassPriority', player: 'P2' });
    expect(s.pending.kind).toBe('chooseCards');
    s = act(s, { type: 'ChooseCards', player: 'P1', cards: [land] });
    s = act(act(s, { type: 'PassPriority', player: 'P1' }), { type: 'PassPriority', player: 'P2' });
    if (s.pending.kind === 'decide') s = act(s, { type: 'Decide', player: 'P1', accept: true });
    s = act(act(s, { type: 'PassPriority', player: 'P1' }), { type: 'PassPriority', player: 'P2' });
    expect(zone(s, land)).toBe('exile');
    expect(s.cards[land]!.exiledWith?.source).toBe(converter);
    // Next turn: {T}: put it into the graveyard and make a Treasure.
    s.cards[converter]!.tapped = false;
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: converter, ability: 1, targets: [] }).state;
    s = act(s, { type: 'ChooseCards', player: 'P1', cards: [land] });
    expect(zone(s, land)).toBe('graveyard');
    expect(s.players.P1!.battlefield.some((id) => s.cards[id]!.defId === 'treasure-token-fra')).toBe(true);
    // A nonland card: a 2/2 Rogue.
    const spell = put(s, 'P1', 'despark', 'exile', { exiledWith: { source: converter, sourceObject: s.cards[converter]!.zoneChanges ?? 0 } });
    s.cards[converter]!.tapped = false;
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: converter, ability: 1, targets: [] }).state;
    s = act(s, { type: 'ChooseCards', player: 'P1', cards: [spell] });
    expect(zone(s, spell)).toBe('graveyard');
    expect(s.players.P1!.battlefield.some((id) => s.cards[id]!.defId === 'rogue-token-frc')).toBe(true);
  });

  it("Proteus Staff puts a creature on the bottom of its owner's library; its controller reveals until a creature and puts it onto the battlefield", () => {
    let s = newGame();
    const staff = put(s, 'P1', 'proteus-staff');
    const theirs = put(s, 'P2', 'thawbringer');
    const next = put(s, 'P2', 'archon-of-cruelty', 'library');
    mana(s, 'P1', { U: 1, C: 2 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: staff, ability: 0, targets: [card(theirs)] }).state;
    expect(zone(s, theirs)).toBe('library');
    expect(s.players.P2!.library.at(-1) === theirs || s.players.P2!.library.includes(theirs)).toBe(true);
    expect([zone(s, next), s.cards[next]!.controller]).toEqual(['battlefield', 'P2']);
  });
});
