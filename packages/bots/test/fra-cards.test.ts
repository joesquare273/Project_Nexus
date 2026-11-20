// Reality Fracture main set (FRA), built group by group (docs/reality-fracture.md).

import { describe, expect, it } from 'vitest';
import { currentDefinition, getLegalActions, hasKeyword, powerOf, toughnessOf, type GameState } from '@nexus/engine';
import { act, cast, fight, goTo, mana, newGame, put, settle } from './kit-helpers.ts';
import { canAttack } from '../../engine/src/combat.ts';

const zone = (s: GameState, id: string) => s.cards[id]!.zone;
const card = (id: string) => ({ kind: 'card' as const, card: id });
const manaFrom = (s: GameState, id: string) => [...new Set(getLegalActions(s).filter((a) => a.type === 'ActivateManaAbility' && a.card === id).map((a) => (a as { mana: string }).mana))].sort();

describe('F1: lands', () => {
  it('the Commons and Annexes enter tapped unless you control a planeswalker', () => {
    let s = newGame();
    const annex = put(s, 'P1', 'fatehold-annex', 'hand');
    s = act(s, { type: 'PlayLand', player: 'P1', card: annex });
    expect(s.cards[annex]!.tapped).toBe(true);
    s.cards[annex]!.tapped = false;
    expect(manaFrom(s, annex)).toEqual(['U', 'W']);
    let u = newGame();
    put(u, 'P1', 'elspeth-suns-champion', 'battlefield', { namedCounters: { loyalty: 4 } });
    const commons = put(u, 'P1', 'dedicated-commons', 'hand');
    u = act(u, { type: 'PlayLand', player: 'P1', card: commons });
    expect(u.cards[commons]!.tapped).toBe(false);
  });

  it('the portal view lands enter tapped unless you control two or more other lands', () => {
    let s = newGame();
    put(s, 'P1', 'plains');
    const beach = put(s, 'P1', 'deserted-beach', 'hand');
    s = act(s, { type: 'PlayLand', player: 'P1', card: beach });
    expect(s.cards[beach]!.tapped).toBe(true);
    let u = newGame();
    put(u, 'P1', 'plains');
    put(u, 'P1', 'island');
    const ridge = put(u, 'P1', 'haunted-ridge', 'hand');
    u = act(u, { type: 'PlayLand', player: 'P1', card: ridge });
    expect(u.cards[ridge]!.tapped).toBe(false);
  });

  it("Theorist's Sanctum: behold a Jace (one you control, or one revealed from your hand) or it enters tapped; {2}{U}, {T}: empower Jace 2", () => {
    let s = newGame();
    const sanctum = put(s, 'P1', 'theorists-sanctum', 'hand');
    s = act(s, { type: 'PlayLand', player: 'P1', card: sanctum });
    expect(s.cards[sanctum]!.tapped).toBe(true);
    // A Jace card in hand to reveal.
    let u = newGame();
    put(u, 'P1', 'jace-multiverse-architect', 'hand');
    const sanctum2 = put(u, 'P1', 'theorists-sanctum', 'hand');
    u = act(u, { type: 'PlayLand', player: 'P1', card: sanctum2, reveal: true });
    expect(u.cards[sanctum2]!.tapped).toBe(false);
    expect(manaFrom(u, sanctum2)).toEqual(['U']);
    mana(u, 'P1', { U: 1, C: 2 });
    u = cast(u, { type: 'ActivateAbility', player: 'P1', card: sanctum2, ability: 0, targets: [] }).state;
    const jace = u.players.P1!.battlefield.map((id) => u.cards[id]!).find((c) => c.defId === 'jace-token-fra')!;
    expect(jace.namedCounters?.loyalty).toBe(2);
  });

  it('Room of Refuge taps for the chosen color and sacrifices for two +1/+1 counters', () => {
    let s = newGame();
    const room = put(s, 'P1', 'room-of-refuge', 'battlefield', { chosenColor: 'G' });
    expect(manaFrom(s, room)).toEqual(['G']);
    const bear = put(s, 'P1', 'thawbringer');
    mana(s, 'P1', { C: 5 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: room, ability: 0, targets: [card(bear)] }).state;
    expect([zone(s, room), s.cards[bear]!.counters]).toEqual(['graveyard', 2]);
  });

  it('Roiling Canopy pumps a creature when a Forest enters while you control five other Forests', () => {
    let s = newGame();
    put(s, 'P1', 'roiling-canopy');
    for (let i = 0; i < 4; i++) put(s, 'P1', 'forest');
    const bear = put(s, 'P1', 'thawbringer');
    const fifth = put(s, 'P1', 'forest', 'hand');
    s = cast(s, { type: 'PlayLand', player: 'P1', card: fifth }).state;
    expect(powerOf(s, s.cards[bear]!)).toBe(currentDefinition(s, s.cards[bear]!).power); // only four other Forests then
    s.players.P1!.landsPlayedThisTurn = 0;
    const sixth = put(s, 'P1', 'forest', 'hand');
    s = cast(s, { type: 'PlayLand', player: 'P1', card: sixth }).state;
    expect(powerOf(s, s.cards[bear]!)).toBe((currentDefinition(s, s.cards[bear]!).power ?? 0) + 3);
  });

  it('Hall of Echoes becomes a copy of your creature until end of turn, and the legend rule is off for you this turn', () => {
    let s = newGame();
    const hall = put(s, 'P1', 'hall-of-echoes');
    const legend = put(s, 'P1', 'tamiyo-upriser-crowned');
    mana(s, 'P1', { C: 5 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: hall, ability: 0, targets: [card(legend)] }).state;
    expect(currentDefinition(s, s.cards[hall]!).name).toBe('Tamiyo, Upriser Crowned');
    // Two Tamiyos, both kept.
    expect([zone(s, hall), zone(s, legend)]).toEqual(['battlefield', 'battlefield']);
    expect(toughnessOf(s, s.cards[hall]!)).toBe(toughnessOf(s, s.cards[legend]!));
    s.turnNumber++;
    expect(currentDefinition(s, s.cards[hall]!).name).toBe('Hall of Echoes');
  });
});

describe('F2: empower Jace', () => {
  const jace = (s: GameState) => s.players.P1!.battlefield.map((id) => s.cards[id]!).find((c) => c.defId === 'jace-token-fra');
  const loyalty = (s: GameState) => jace(s)?.namedCounters?.loyalty ?? 0;

  it('creatures that empower as they enter or attack, and Campus Crier from the graveyard', () => {
    let s = newGame();
    const oculus = put(s, 'P1', 'mindseeker-oculus', 'hand');
    mana(s, 'P1', { U: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: oculus }).state;
    expect(loyalty(s)).toBe(4);
    const crier = put(s, 'P1', 'campus-crier', 'graveyard');
    mana(s, 'P1', { C: 1 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: crier, ability: 0, targets: [] }).state;
    expect([zone(s, crier), loyalty(s)]).toEqual(['exile', 6]);
    // Repurposed Enforcer: X is the number of creatures you control (Oculus and itself).
    const enforcer = put(s, 'P1', 'repurposed-enforcer');
    s = fight(s, [{ attacker: enforcer, defender: 'P2' }]).state;
    expect(loyalty(s)).toBe(8);
  });

  it('Overwrite the Multiverse exiles all creatures and empowers once for each', () => {
    let s = newGame();
    put(s, 'P1', 'thawbringer');
    put(s, 'P2', 'thawbringer');
    put(s, 'P2', 'archon-of-cruelty');
    const spell = put(s, 'P1', 'overwrite-the-multiverse', 'hand');
    mana(s, 'P1', { B: 2, C: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell }).state;
    expect(loyalty(s)).toBe(3);
    expect(s.players.P2!.battlefield.filter((id) => s.cards[id]!.zone === 'battlefield' && currentDefinition(s, s.cards[id]!).types.includes('creature'))).toHaveLength(0);
  });

  it('Violent Echoes empowers Jace by the excess damage only', () => {
    let s = newGame();
    const small = put(s, 'P2', 'thawbringer');
    const spell = put(s, 'P1', 'violent-echoes', 'hand');
    mana(s, 'P1', { R: 2, C: 2 });
    const toughness = toughnessOf(s, s.cards[small]!);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(small)] }).state;
    expect([zone(s, small), loyalty(s)]).toEqual(['graveyard', 6 - toughness]);
    // No excess: no Jace.
    let u = newGame();
    const big = put(u, 'P2', 'archon-of-cruelty');
    const spell2 = put(u, 'P1', 'violent-echoes', 'hand');
    mana(u, 'P1', { R: 2, C: 2 });
    u = cast(u, { type: 'CastSpell', player: 'P1', card: spell2, targets: [card(big)] }).state;
    expect(jace(u)).toBeUndefined();
  });

  it("Theorist's Proxy: the next spell you cast this turn can't be countered", () => {
    let s = newGame();
    const proxy = put(s, 'P1', 'theorists-proxy');
    mana(s, 'P1', { U: 1 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: proxy, ability: 0, targets: [] }).state;
    expect(zone(s, proxy)).toBe('graveyard');
    const bolt = put(s, 'P1', 'no-admittance', 'hand');
    mana(s, 'P1', { R: 1, C: 1 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: bolt, targets: [{ kind: 'player', player: 'P2' }] });
    expect(s.stack.find((i) => i.kind === 'spell')).toMatchObject({ uncounterable: true });
  });

  it("Inspired Tethermage grows whenever you put loyalty counters on a planeswalker; Vraska's Final Mercy can empower 6", () => {
    let s = newGame();
    const tethermage = put(s, 'P1', 'inspired-tethermage');
    const mercy = put(s, 'P1', 'vraskas-final-mercy', 'hand');
    mana(s, 'P1', { B: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: mercy, targets: [], mode: 1 }).state;
    expect([loyalty(s), s.players.P1!.life, s.cards[tethermage]!.counters]).toEqual([6, 18, 1]);
  });

  it("Tam's Resistance costs {1}{G/U} and Solve for Disappointment takes a nonland permanent card", () => {
    let s = newGame();
    expect(currentDefinition(s, s.cards[put(s, 'P1', 'tams-resistance', 'hand')]!).manaCost).toBe('{1}{G/U}');
    const land = put(s, 'P2', 'plains', 'hand');
    const creature = put(s, 'P2', 'thawbringer', 'hand');
    const solve = put(s, 'P1', 'solve-for-disappointment', 'hand');
    mana(s, 'P1', { B: 1, C: 1 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: solve, targets: [{ kind: 'player', player: 'P2' }] });
    s = act(act(s, { type: 'PassPriority', player: 'P1' }), { type: 'PassPriority', player: 'P2' });
    expect(s.pending.kind).toBe('chooseCards');
    expect((s.pending as { cards: string[] }).cards).toEqual([creature]);
    s = act(s, { type: 'ChooseCards', player: 'P1', cards: [creature] });
    expect([zone(s, creature), zone(s, land), loyalty(s)]).toEqual(['graveyard', 'hand', 1]);
  });
});

describe('F3: planeswalkers you control have ...', () => {
  const jace = (s: GameState) => s.players.P1!.battlefield.map((id) => s.cards[id]!).find((c) => c.defId === 'jace-token-fra')!;
  const loyaltyOf = (s: GameState, id: string) => s.cards[id]!.namedCounters?.loyalty ?? 0;
  const abilities = (s: GameState, id: string) => currentDefinition(s, s.cards[id]!).activated ?? [];

  it('Way of the Wildspeaker empowers Jace 7, and every planeswalker you control gains "[−4]: Create a 4/4 Beast"', () => {
    let s = newGame();
    const way = put(s, 'P1', 'way-of-the-wildspeaker', 'hand');
    mana(s, 'P1', { G: 1, C: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: way }).state;
    const token = jace(s).id;
    expect(loyaltyOf(s, token)).toBe(7);
    // The Jace token's own two abilities, then the granted one.
    expect(abilities(s, token).map((a) => a.loyalty)).toEqual([-1, -3, -4]);
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: token, ability: 2, targets: [] }).state;
    expect([loyaltyOf(s, token), s.players.P1!.battlefield.some((id) => s.cards[id]!.defId === 'beast-token-fra')]).toEqual([3, true]);
    // An opponent's planeswalker doesn't get it.
    const theirs = put(s, 'P2', 'elspeth-suns-champion', 'battlefield', { namedCounters: { loyalty: 4 } });
    expect(abilities(s, theirs).map((a) => a.loyalty)).toEqual([1, -3, -7]);
  });

  it('Way of the Mind Sculptor draws when a loyalty ability removes two or more counters; Way of the Paradox gains life and an extra land', () => {
    let s = newGame();
    put(s, 'P1', 'way-of-the-mind-sculptor');
    put(s, 'P1', 'way-of-the-paradox');
    const elspeth = put(s, 'P1', 'elspeth-suns-champion', 'battlefield', { namedCounters: { loyalty: 7 } });
    const hand = s.players.P1!.hand.length;
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: elspeth, ability: 1, targets: [] }).state; // −3
    expect([s.players.P1!.hand.length, s.players.P1!.life]).toEqual([hand + 1, 21]);
    expect(s.players.P1!.extraLandDrops).toEqual({ turn: s.turnNumber, count: 1 });
  });

  it('Way of the Necromancer: whenever a creature you control dies, each planeswalker you control gets a loyalty counter', () => {
    let s = newGame();
    put(s, 'P1', 'way-of-the-necromancer');
    put(s, 'P1', 'way-of-the-mentor');
    const elspeth = put(s, 'P1', 'elspeth-suns-champion', 'battlefield', { namedCounters: { loyalty: 4 } });
    const bear = put(s, 'P1', 'thawbringer');
    const bolt = put(s, 'P1', 'no-admittance', 'hand');
    mana(s, 'P1', { R: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: bolt, targets: [card(bear)] }).state;
    expect(zone(s, bear)).toBe('graveyard');
    expect(loyaltyOf(s, elspeth)).toBe(5);
  });

  it('Way of the Mentor: whenever you gain life, each planeswalker you control gets a loyalty counter', () => {
    let s = newGame();
    put(s, 'P1', 'way-of-the-mentor');
    const elspeth = put(s, 'P1', 'elspeth-suns-champion', 'battlefield', { namedCounters: { loyalty: 4 } });
    put(s, 'P1', 'sanctum-lurker');
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: elspeth, ability: 3, targets: [] }).state; // the Lurker's +2: you gain 1 life
    expect(loyaltyOf(s, elspeth)).toBe(4 + 2 + 1);
  });

  it('Sanctum Lurker: your planeswalkers survive at 0 loyalty and gain "[+2]: 1 damage to each opponent, gain 1 life"', () => {
    let s = newGame();
    put(s, 'P1', 'sanctum-lurker');
    const elspeth = put(s, 'P1', 'elspeth-suns-champion', 'battlefield', { namedCounters: { loyalty: 3 } });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: elspeth, ability: 1, targets: [] }).state; // −3: to 0
    expect([zone(s, elspeth), loyaltyOf(s, elspeth)]).toEqual(['battlefield', 0]);
    s.turnNumber++;
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: elspeth, ability: 3, targets: [] }).state; // the granted +2
    expect([loyaltyOf(s, elspeth), s.players.P2!.life, s.players.P1!.life]).toEqual([2, 19, 21]);
  });

  it('Kiora of Salt and Sand: after a loyalty ability this turn, attacking untaps one attacker and makes it unblockable', () => {
    let s = newGame();
    put(s, 'P1', 'kiora-of-salt-and-sand');
    const elspeth = put(s, 'P1', 'elspeth-suns-champion', 'battlefield', { namedCounters: { loyalty: 4 } });
    const bear = put(s, 'P1', 'thawbringer');
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: elspeth, ability: 0, targets: [] }).state; // +1
    const r = fight(s, [{ attacker: bear, defender: 'P2' }]);
    expect(r.events.some((e) => e.type === 'CardsUntapped' && e.cards.includes(bear))).toBe(true);
  });
});

describe('F4: prepared', () => {
  const copyOf = (s: GameState, creature: string) => Object.values(s.cards).find((c) => c.zone === 'exile' && c.prepareSpellOf?.card === creature);
  const castPrepared = (s: GameState, creature: string) => getLegalActions(s).filter((a) => a.type === 'CastSpell' && a.card === copyOf(s, creature)?.id);

  it('a creature enters prepared; casting the copy of its spell unprepares it, and the creature stays', () => {
    let s = newGame();
    const angel = put(s, 'P1', 'blossom-blessed-angel-seed-suture', 'hand');
    mana(s, 'P1', { W: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: angel }).state;
    expect(s.cards[angel]!.prepared).toBe(true);
    const copy = copyOf(s, angel)!;
    expect(currentDefinition(s, copy)).toMatchObject({ name: 'Seed Suture', types: ['sorcery'], manaCost: '{G/W}' });
    // Cast Seed Suture on the Angel itself.
    mana(s, 'P1', { G: 1 });
    const option = castPrepared(s, angel).find((a) => a.type === 'CastSpell' && a.targets?.[0]?.kind === 'card' && a.targets[0].card === angel)!;
    expect(option).toBeDefined();
    s = cast(s, option).state;
    expect([s.cards[angel]!.prepared, s.cards[angel]!.counters, s.players.P1!.life, zone(s, angel)]).toEqual([undefined, 1, 21, 'battlefield']);
    // The copy is gone and can't be cast again.
    expect(copyOf(s, angel)).toBeUndefined();
    expect(s.players.P1!.graveyard.some((id) => s.cards[id]!.prepareSpellOf)).toBe(false);
  });

  it("only the creature's controller can cast it, at sorcery speed for a sorcery; leaving the battlefield removes the copy", () => {
    let s = newGame();
    const medic = put(s, 'P1', 'emergency-phytomedic-seed-suture', 'hand');
    mana(s, 'P1', { G: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: medic }).state;
    const copy = copyOf(s, medic)!.id;
    // P2 can't cast it, and P1 can't on P2's turn (a sorcery).
    s.players.P2!.manaPool.G = 1;
    s.players.P1!.manaPool.G = 1;
    s.activePlayer = 'P2';
    s.pending = { kind: 'priority', player: 'P2', passes: 0 };
    expect(getLegalActions(s).some((a) => a.type === 'CastSpell' && a.card === copy)).toBe(false);
    s.pending = { kind: 'priority', player: 'P1', passes: 0 };
    expect(getLegalActions(s).some((a) => a.type === 'CastSpell' && a.card === copy)).toBe(false);
    // The creature dies: the copy ceases to exist.
    s.activePlayer = 'P1';
    const bolt = put(s, 'P1', 'no-admittance', 'hand');
    mana(s, 'P1', { R: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: bolt, targets: [card(medic)] }).state;
    expect([zone(s, medic), s.cards[medic]!.prepared, zone(s, copy)]).toEqual(['graveyard', undefined, 'void']);
  });

  it('creatures that become prepared at your upkeep, and Hexhaven Dueling Arena', () => {
    let s = newGame();
    const voxmancer = put(s, 'P1', 'stingerquill-voxmancer-vicious-verse');
    expect(s.cards[voxmancer]!.prepared).toBeUndefined();
    const arena = put(s, 'P1', 'hexhaven-dueling-arena');
    mana(s, 'P1', { C: 4 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: arena, ability: 1, targets: [card(voxmancer)] }).state;
    expect(s.cards[voxmancer]!.prepared).toBe(true);
    // Vicious Verse: 1 damage to the opponent.
    mana(s, 'P1', { R: 1 });
    s = cast(s, castPrepared(s, voxmancer)[0]!).state;
    expect([s.players.P2!.life, s.cards[voxmancer]!.prepared]).toEqual([19, undefined]);
    // A creature without a prepare spell can't become prepared.
    const bear = put(s, 'P1', 'thawbringer');
    s.cards[arena]!.tapped = false;
    mana(s, 'P1', { C: 4 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: arena, ability: 1, targets: [card(bear)] }).state;
    expect(s.cards[bear]!.prepared).toBeUndefined();
  });

  it('Codie copies a prepared spell you cast, and makes each creature you control prepared', () => {
    let s = newGame();
    const codie = put(s, 'P1', 'codie-ravenous-codex');
    const voxmancer = put(s, 'P1', 'stingerquill-voxmancer-vicious-verse');
    mana(s, 'P1', { W: 1, U: 1, B: 1, R: 1, G: 1 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: codie, ability: 0, targets: [] }).state;
    expect(s.cards[voxmancer]!.prepared).toBe(true);
    mana(s, 'P1', { R: 1 });
    s = cast(s, castPrepared(s, voxmancer)[0]!).state;
    expect(s.players.P2!.life).toBe(18); // the spell and its copy
  });

  it('Infinite Coursework taps the creature, unprepares it and removes its abilities', () => {
    let s = newGame();
    const angel = put(s, 'P2', 'blossom-blessed-angel-seed-suture', 'hand');
    s.activePlayer = 'P2';
    s.pending = { kind: 'priority', player: 'P2', passes: 0 };
    mana(s, 'P2', { W: 1, C: 3 });
    s = act(s, { type: 'CastSpell', player: 'P2', card: angel });
    s = act(act(s, { type: 'PassPriority', player: 'P2' }), { type: 'PassPriority', player: 'P1' });
    expect(s.cards[angel]!.prepared).toBe(true);
    s.activePlayer = 'P1';
    s.pending = { kind: 'priority', player: 'P1', passes: 0 };
    const aura = put(s, 'P1', 'infinite-coursework', 'hand');
    mana(s, 'P1', { U: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: aura, targets: [card(angel)] }).state;
    expect([s.cards[angel]!.tapped, s.cards[angel]!.prepared]).toEqual([true, undefined]);
    expect(currentDefinition(s, s.cards[angel]!).keywords ?? []).toEqual([]);
  });

  it('threshold creatures, Whiplash Wordsmith after noncombat damage, and Molten Tide', () => {
    let s = newGame();
    const metamage = put(s, 'P1', 'theorix-metamage-omit-variables');
    expect(powerOf(s, s.cards[metamage]!)).toBe(2);
    for (let i = 0; i < 7; i++) put(s, 'P1', 'island', 'graveyard');
    expect(powerOf(s, s.cards[metamage]!)).toBe(3);
    const wordsmith = put(s, 'P1', 'whiplash-wordsmith-vicious-verse');
    expect(hasKeyword(s, s.cards[wordsmith]!, 'Flying')).toBe(false);
    const bolt = put(s, 'P1', 'no-admittance', 'hand');
    mana(s, 'P1', { R: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: bolt, targets: [{ kind: 'player', player: 'P2' }] }).state;
    expect(s.players.P2!.noncombatDamageTurn).toBe(s.turnNumber);
    expect([hasKeyword(s, s.cards[wordsmith]!, 'Flying'), hasKeyword(s, s.cards[wordsmith]!, 'Haste')]).toEqual([true, true]);
    // Molten Tide: a Mountain makes an extra {R} this turn.
    const rhymer = put(s, 'P1', 'pyre-rhymer-molten-tide', 'hand');
    const mountain = put(s, 'P1', 'mountain');
    mana(s, 'P1', { R: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: rhymer }).state;
    mana(s, 'P1', { R: 1 });
    s = cast(s, castPrepared(s, rhymer)[0]!).state;
    const before = s.players.P1!.manaPool.R;
    s = act(s, getLegalActions(s).find((a) => a.type === 'ActivateManaAbility' && a.card === mountain)!);
    expect(s.players.P1!.manaPool.R).toBe(before + 2);
  });

  it('Arc of Fortune: each player may discard their hand and draw seven', () => {
    let s = newGame();
    const chaser = put(s, 'P1', 'variable-chaser-arc-of-fortune');
    put(s, 'P1', 'island', 'hand');
    const kept = put(s, 'P2', 'island', 'hand');
    const arena = put(s, 'P1', 'hexhaven-dueling-arena');
    mana(s, 'P1', { C: 4 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: arena, ability: 1, targets: [card(chaser)] }).state;
    mana(s, 'P1', { U: 1, C: 2 });
    s = act(s, castPrepared(s, chaser)[0]!);
    // The Chaser's prowess trigger resolves first, then Arc of Fortune.
    for (let i = 0; i < 6 && s.pending.kind === 'priority' && s.stack.length; i++) s = act(s, { type: 'PassPriority', player: s.pending.player });
    expect(s.pending).toMatchObject({ kind: 'chooseCards', player: 'P1', purpose: 'wheel' });
    s = act(s, { type: 'ChooseCards', player: 'P1', cards: [...(s.pending as { cards: string[] }).cards] });
    s = act(s, { type: 'ChooseCards', player: 'P2', cards: [] });
    expect([s.players.P1!.hand.length, s.players.P2!.hand, zone(s, kept)]).toEqual([7, [kept], 'hand']);
  });
});

describe('F5: white', () => {
  it('Kindred Judgment: choose a creature type as it resolves; every creature not of that type is destroyed', () => {
    let s = newGame();
    const soldier = put(s, 'P1', 'repurposed-enforcer'); // Human Soldier
    const angel = put(s, 'P2', 'blossom-blessed-angel-seed-suture'); // Angel Cleric
    const spell = put(s, 'P1', 'kindred-judgment', 'hand');
    mana(s, 'P1', { W: 2, C: 5 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: spell });
    s = act(act(s, { type: 'PassPriority', player: 'P1' }), { type: 'PassPriority', player: 'P2' });
    expect(s.pending).toMatchObject({ kind: 'chooseOption', forResolution: 'creatureType' });
    expect((s.pending as { options: string[] }).options).toEqual(expect.arrayContaining(['Soldier', 'Angel', 'Another type']));
    s = act(s, { type: 'ChooseOption', player: 'P1', option: 'Soldier' });
    expect([zone(s, soldier), zone(s, angel), zone(s, spell)]).toEqual(['battlefield', 'graveyard', 'graveyard']);
  });

  it("Prophesied End: its controller draws a card unless it was attacking", () => {
    let s = newGame();
    const bear = put(s, 'P2', 'thawbringer');
    const spell = put(s, 'P1', 'prophesied-end', 'hand');
    mana(s, 'P1', { W: 1, C: 1 });
    const hand = s.players.P2!.hand.length;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(bear)] }).state;
    expect([zone(s, bear), s.players.P2!.hand.length]).toEqual(['graveyard', hand + 1]);
  });

  it('Enlightened Confidant: after you gained life, surveil 1, and a cheap enough card goes to your hand instead', () => {
    let s = newGame();
    put(s, 'P1', 'enlightened-confidant');
    const cheap = put(s, 'P1', 'unsummon', 'library'); // mana value 1
    s.players.P1!.lifeGainedThisTurn = 2;
    s.step = 'main2';
    s = act(s, { type: 'PassPriority', player: 'P1' });
    s = act(s, { type: 'PassPriority', player: 'P2' });
    for (let i = 0; i < 6 && s.pending.kind === 'priority' && s.stack.length; i++) s = act(s, { type: 'PassPriority', player: s.pending.player });
    expect(s.pending).toMatchObject({ kind: 'surveil', card: cheap });
    s = act(s, { type: 'Surveil', player: 'P1', toGraveyard: true });
    expect(zone(s, cheap)).toBe('hand');
  });

  it('Graft Surgeon enters with a counter and passes its counters on as it dies; Guiding Hydra spreads one', () => {
    let s = newGame();
    const surgeon = put(s, 'P1', 'graft-surgeon', 'hand');
    const bear = put(s, 'P1', 'thawbringer');
    mana(s, 'P1', { W: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: surgeon }).state;
    expect(s.cards[surgeon]!.counters).toBe(1);
    const bolt = put(s, 'P1', 'no-admittance', 'hand');
    mana(s, 'P1', { R: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: bolt, targets: [card(surgeon)] }).state;
    expect([zone(s, surgeon), s.cards[bear]!.counters]).toEqual(['graveyard', 1]);
    const hydra = put(s, 'P1', 'guiding-hydra', 'battlefield', { counters: 3 });
    s.step = 'main1';
    s = goTo(s, 'beginCombat');
    expect([s.cards[hydra]!.counters, s.cards[bear]!.counters]).toEqual([2, 2]);
  });

  it('Memory Trap exiles a nonland permanent until it leaves; Your Fate Ends Here needs mana value 3 or more', () => {
    let s = newGame();
    const theirs = put(s, 'P2', 'archon-of-cruelty');
    const trap = put(s, 'P1', 'memory-trap', 'hand');
    mana(s, 'P1', { W: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: trap }).state;
    expect(zone(s, theirs)).toBe('exile');
    const small = put(s, 'P2', 'diviner-of-victory-unwind-history'); // mana value 1
    const fate = put(s, 'P1', 'your-fate-ends-here', 'hand');
    mana(s, 'P1', { W: 1, C: 2 });
    expect(getLegalActions(s).some((a) => a.type === 'CastSpell' && a.card === fate && a.targets?.some((t) => t.kind === 'card' && t.card === small))).toBe(false);
  });
});

describe('F6: blue', () => {
  it('Countersculpt: behold a Jace (a Jace card in hand counts) or pay {1}, then counter and empower', () => {
    let s = newGame();
    const theirs = put(s, 'P2', 'no-admittance', 'hand');
    s.activePlayer = 'P2';
    s.pending = { kind: 'priority', player: 'P2', passes: 0 };
    mana(s, 'P2', { R: 1, C: 1 });
    s = act(s, { type: 'CastSpell', player: 'P2', card: theirs, targets: [{ kind: 'player', player: 'P1' }] });
    const counter = put(s, 'P1', 'countersculpt', 'hand');
    const jace = put(s, 'P1', 'jace-multiverse-architect', 'hand');
    s.pending = { kind: 'priority', player: 'P1', passes: 0 };
    mana(s, 'P1', { U: 2 });
    const ways = getLegalActions(s).filter((a) => a.type === 'CastSpell' && a.card === counter);
    // With only {U}{U}: beholding the Jace is the way (paying {1} more isn't possible).
    expect(ways.map((a) => (a.type === 'CastSpell' ? a.costCards ?? [] : []))).toEqual([[jace]]);
    s = cast(s, ways[0]!).state;
    expect([zone(s, theirs), zone(s, jace), s.players.P1!.life]).toEqual(['graveyard', 'hand', 20]);
  });

  it('Cruel Calculations draws one card for each card put into the target player\'s graveyard from their library this turn', () => {
    let s = newGame();
    const mill = put(s, 'P1', 'void-extrapolator-omit-variables'); // enters prepared: Omit Variables mills three
    void mill;
    s.players.P2!.libraryToGraveyard = { turn: s.turnNumber, count: 3 };
    const spell = put(s, 'P1', 'cruel-calculations', 'hand');
    mana(s, 'P1', { U: 1, C: 2 });
    const hand = s.players.P1!.hand.length;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [{ kind: 'player', player: 'P2' }] }).state;
    expect(s.players.P1!.hand.length).toBe(hand - 1 + 3);
  });

  it('a mill counts for this turn', () => {
    let s = newGame();
    const spell = put(s, 'P1', 'something-worth-saving', 'hand');
    void spell;
    const before = s.players.P1!.libraryToGraveyard;
    expect(before).toBeUndefined();
    const voidEx = put(s, 'P1', 'void-extrapolator-omit-variables', 'hand');
    mana(s, 'P1', { B: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: voidEx }).state;
    const copy = Object.values(s.cards).find((c) => c.prepareSpellOf?.card === voidEx)!;
    mana(s, 'P1', { U: 1 });
    s = cast(s, getLegalActions(s).find((a) => a.type === 'CastSpell' && a.card === copy.id)!).state;
    expect(s.players.P1!.libraryToGraveyard).toEqual({ turn: s.turnNumber, count: 3 });
  });

  it('Surveillance Phantasm can attack once you have surveilled this turn', () => {
    let s = newGame();
    const phantasm = put(s, 'P1', 'surveillance-phantasm');
    expect(canAttack(s, s.cards[phantasm]!, 'P1')).toBe(false);
    mana(s, 'P1', { U: 1, C: 3 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: phantasm, ability: 0, targets: [] }).state;
    if (s.pending.kind === 'surveil') s = act(s, { type: 'Surveil', player: 'P1', toGraveyard: false });
    expect(s.players.P1!.scriedOrSurveiledTurn).toBe(s.turnNumber);
    expect(canAttack(s, s.cards[phantasm]!, 'P1')).toBe(true);
  });

  it('Seasoned Cryomancer: draw two, discard two, then tap and stun up to one creature per nonland card discarded', () => {
    let s = newGame();
    const theirs = put(s, 'P2', 'thawbringer');
    const cryo = put(s, 'P1', 'seasoned-cryomancer', 'hand');
    const spell1 = put(s, 'P1', 'unsummon', 'hand');
    const land = put(s, 'P1', 'plains', 'hand');
    mana(s, 'P1', { U: 2, C: 1 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: cryo });
    for (let i = 0; i < 6 && s.pending.kind === 'priority'; i++) s = act(s, { type: 'PassPriority', player: s.pending.player });
    expect(s.pending).toMatchObject({ kind: 'chooseCards', purpose: 'discard' });
    s = act(s, { type: 'ChooseCards', player: 'P1', cards: [spell1, land] });
    expect(s.pending).toMatchObject({ kind: 'chooseCards', purpose: 'mark', max: 1 });
    s = act(s, { type: 'ChooseCards', player: 'P1', cards: [theirs] });
    expect([s.cards[theirs]!.tapped, s.cards[theirs]!.namedCounters?.stun]).toEqual([true, 1]);
  });

  it("Sphinx's Approach: with four more in the graveyard, it exiles them and itself to put a Sphinx onto the battlefield", () => {
    let s = newGame();
    for (let i = 0; i < 4; i++) put(s, 'P1', 'sphinxs-approach', 'graveyard');
    const sphinx = put(s, 'P1', 'sphinx-of-false-conclusions', 'library');
    put(s, 'P1', 'island', 'library'); // the two cards it draws first
    put(s, 'P1', 'island', 'library');
    const spell = put(s, 'P1', 'sphinxs-approach', 'hand');
    mana(s, 'P1', { U: 2, C: 1 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: spell });
    s = act(act(s, { type: 'PassPriority', player: 'P1' }), { type: 'PassPriority', player: 'P2' });
    expect(s.pending).toMatchObject({ kind: 'chooseCards', purpose: 'search' });
    s = act(s, { type: 'ChooseCards', player: 'P1', cards: [sphinx] });
    expect([zone(s, sphinx), zone(s, spell), s.players.P1!.graveyard.length]).toEqual(['battlefield', 'exile', 0]);
  });
});

describe('F7: black', () => {
  it('Break Under Pressure: the opponent sacrifices the creature or planeswalker with the greatest mana value; you gain 2', () => {
    let s = newGame();
    const small = put(s, 'P2', 'rank-rat');
    const big = put(s, 'P2', 'apex-witchstalker');
    const spell = put(s, 'P1', 'break-under-pressure', 'hand');
    mana(s, 'P1', { B: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [{ kind: 'player', player: 'P2' }] }).state;
    expect([zone(s, small), zone(s, big), s.players.P1!.life]).toEqual(['battlefield', 'graveyard', 22]);
  });

  it('Break Under Pressure: on a tie the opponent chooses', () => {
    let s = newGame();
    const a = put(s, 'P2', 'rank-rat');
    const b = put(s, 'P2', 'rank-rat');
    const spell = put(s, 'P1', 'break-under-pressure', 'hand');
    mana(s, 'P1', { B: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [{ kind: 'player', player: 'P2' }] }).state;
    expect(s.pending).toMatchObject({ kind: 'chooseCards', player: 'P2', purpose: 'sacrifice' });
    s = act(s, { type: 'ChooseCards', player: 'P2', cards: [b] });
    expect([zone(s, a), zone(s, b)]).toEqual(['battlefield', 'graveyard']);
  });

  it('Dark Matter Manipulator gets +2/+0 for every seven cards in your graveyard', () => {
    const s = newGame();
    const dm = put(s, 'P1', 'dark-matter-manipulator');
    for (let i = 0; i < 6; i++) put(s, 'P1', 'island', 'graveyard');
    expect(powerOf(s, s.cards[dm]!)).toBe(1);
    put(s, 'P1', 'island', 'graveyard');
    expect(powerOf(s, s.cards[dm]!)).toBe(3);
    for (let i = 0; i < 7; i++) put(s, 'P1', 'island', 'graveyard');
    expect([powerOf(s, s.cards[dm]!), toughnessOf(s, s.cards[dm]!)]).toEqual([5, 2]);
  });

  it('Darklight Phoenix returns at the beginning of your combat if two or more creatures died this turn', () => {
    let s = newGame();
    const phoenix = put(s, 'P1', 'darklight-phoenix', 'graveyard');
    s.creaturesDiedThisTurn = 1;
    s = goTo(s, 'beginCombat');
    expect(zone(s, phoenix)).toBe('graveyard');
    let u = newGame();
    const again = put(u, 'P1', 'darklight-phoenix', 'graveyard');
    u.creaturesDiedThisTurn = 2;
    u = goTo(u, 'beginCombat');
    u = settle(u).state;
    expect(zone(u, again)).toBe('battlefield');
    expect(hasKeyword(u, u.cards[again]!, 'Haste')).toBe(true);
  });

  it('Extrapolate the Impossible: reveal two sideboard cards; an opponent chooses the one you put into your hand', () => {
    let s = newGame();
    const outside = (defId: string) => {
      const id = `o${s.nextId++}`;
      s.cards[id] = { id, defId, owner: 'P1', controller: 'P1', zone: 'void', tapped: false, summoningSick: false, damage: 0, deathtouched: false, outsideGame: true };
      return id;
    };
    const a = outside('last-gasp');
    const b = outside('rank-rat');
    outside('rank-rat');
    const spell = put(s, 'P1', 'extrapolate-the-impossible', 'hand');
    mana(s, 'P1', { B: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell }).state;
    expect(s.pending).toMatchObject({ kind: 'chooseCards', player: 'P1', purpose: 'revealOutside' });
    expect(() => act(s, { type: 'ChooseCards', player: 'P1', cards: [a] })).toThrow();
    s = act(s, { type: 'ChooseCards', player: 'P1', cards: [a, b] });
    expect(s.pending).toMatchObject({ kind: 'chooseCards', player: 'P2', purpose: 'pickOutside', cards: [a, b] });
    s = act(s, { type: 'ChooseCards', player: 'P2', cards: [b] });
    expect([zone(s, a), zone(s, b), s.cards[b]!.outsideGame]).toEqual(['void', 'hand', undefined]);
  });

  it("Lich's Relic: pay {2} as it enters to destroy up to one creature or planeswalker each opponent controls", () => {
    let s = newGame(3);
    const r2 = put(s, 'P2', 'rank-rat');
    const r3 = put(s, 'P3', 'rank-rat');
    const relic = put(s, 'P1', 'lichs-relic', 'hand');
    mana(s, 'P1', { B: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: relic }, { targets: (options) => options[0]! }).state;
    expect([zone(s, r2), zone(s, r3)]).toEqual(['graveyard', 'graveyard']);
  });

  it('Rise of the Deathbringer: draw cards equal to the greatest power among your creatures, and lose that much life', () => {
    let s = newGame();
    put(s, 'P1', 'apex-witchstalker');
    const spell = put(s, 'P1', 'rise-of-the-deathbringer', 'hand');
    mana(s, 'P1', { B: 1, C: 4 });
    const hand = s.players.P1!.hand.length;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, mode: 0 }).state;
    expect([s.players.P1!.hand.length, s.players.P1!.life]).toEqual([hand - 1 + 6, 14]);
  });

  it('Silence the Echo: sacrifice a creature or pay {3} more', () => {
    const s = newGame();
    put(s, 'P2', 'rank-rat');
    const fodder = put(s, 'P1', 'rank-rat');
    const spell = put(s, 'P1', 'silence-the-echo', 'hand');
    mana(s, 'P1', { B: 1, C: 1 });
    const ways = getLegalActions(s).filter((a) => a.type === 'CastSpell' && a.card === spell);
    expect(ways.length).toBeGreaterThan(0);
    expect(ways.every((a) => a.type === 'CastSpell' && (a.costCards ?? []).includes(fodder))).toBe(true);
  });

  it('Terminal Criticism only destroys a blue or red creature or planeswalker', () => {
    const s = newGame();
    put(s, 'P2', 'rank-rat');
    const blue = put(s, 'P2', 'sphinx-of-false-conclusions');
    const spell = put(s, 'P1', 'terminal-criticism', 'hand');
    mana(s, 'P1', { B: 1, C: 1 });
    const targets = getLegalActions(s).filter((a) => a.type === 'CastSpell' && a.card === spell).flatMap((a) => (a.type === 'CastSpell' ? a.targets ?? [] : []));
    expect(targets).toEqual([card(blue)]);
  });

  it('Theoretical Necromancer exiles itself from your graveyard to return another creature card', () => {
    let s = newGame();
    const necro = put(s, 'P1', 'theoretical-necromancer', 'graveyard');
    const rat = put(s, 'P1', 'rank-rat', 'graveyard');
    mana(s, 'P1', { B: 1, C: 3 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: necro, ability: 0, targets: [card(rat)] }).state;
    expect([zone(s, necro), zone(s, rat)]).toEqual(['exile', 'hand']);
  });
});

describe('F8: red', () => {
  const castFirst = (s: GameState, card: string, opts: Parameters<typeof cast>[2] = {}) => cast(s, getLegalActions(s).find((a) => a.type === 'CastSpell' && a.card === card)!, opts).state;

  it("Ajani's Anguish deals X damage as it enters, and your creatures have trample", () => {
    let s = newGame();
    const rat = put(s, 'P1', 'rank-rat');
    const anguish = put(s, 'P1', 'ajanis-anguish', 'hand');
    mana(s, 'P1', { R: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: anguish, x: 3 }, { targets: (options) => options.find((t) => t[0]?.kind === 'player' && t[0].player === 'P2')! }).state;
    expect(s.players.P2!.life).toBe(17);
    expect(hasKeyword(s, s.cards[rat]!, 'Trample')).toBe(true);
  });

  it('Command the Stage: a Cadet, a counter on each other Wizard token, and it returns after noncombat damage last turn', () => {
    let s = newGame();
    const heart = put(s, 'P1', 'heartstring-puller', 'hand');
    mana(s, 'P1', { R: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: heart }).state;
    const first = Object.values(s.cards).find((c) => c.defId === 'cadet-token-fra')!.id;
    const spell = put(s, 'P1', 'command-the-stage', 'hand');
    mana(s, 'P1', { R: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell }).state;
    const cadets = Object.values(s.cards).filter((c) => c.defId === 'cadet-token-fra');
    expect(cadets.map((c) => c.counters ?? 0).sort()).toEqual([0, 1]);
    expect(s.cards[first]!.counters).toBe(1);
    expect(zone(s, spell)).toBe('graveyard');
    // An opponent dealt noncombat damage this turn: it comes back at the next upkeep.
    s.players.P2!.noncombatDamageTurn = s.turnNumber;
    s = goTo(s, 'upkeep');
    s = settle(s).state;
    expect(zone(s, spell)).toBe('hand');
  });

  it('Curse-Marred Demon searches for any card, then you discard a card at random', () => {
    let s = newGame();
    const wanted = put(s, 'P1', 'last-gasp', 'library');
    const demon = put(s, 'P1', 'curse-marred-demon', 'hand');
    mana(s, 'P1', { R: 2, C: 2 });
    const hand = s.players.P1!.hand.length;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: demon }).state;
    // The search put a card into the hand, then one card at random was discarded.
    expect(zone(s, wanted)).not.toBe('library');
    expect(s.players.P1!.hand.length).toBe(hand - 1);
    expect(s.players.P1!.graveyard.length).toBe(1);
  });

  it('Draconic Visitor: artifact tokens you would create are 5/5 flying Dragons instead', () => {
    let s = newGame();
    put(s, 'P1', 'draconic-visitor');
    const rat = put(s, 'P1', 'rank-rat');
    const dispute = put(s, 'P1', 'deadly-dispute', 'hand');
    mana(s, 'P1', { B: 1, C: 1 });
    s = cast(s, getLegalActions(s).find((a) => a.type === 'CastSpell' && a.card === dispute && a.costCards?.includes(rat))!).state;
    const made = Object.values(s.cards).filter((c) => c.isToken);
    expect(made.map((c) => c.defId)).toEqual(['dragon-token-fra']);
    expect([powerOf(s, made[0]!), hasKeyword(s, made[0]!, 'Flying')]).toEqual([5, true]);
  });

  it('Essence Burn: 5 damage to a black or green creature, exiled if it would die', () => {
    let s = newGame();
    const rat = put(s, 'P2', 'rank-rat');
    put(s, 'P2', 'heartstring-puller');
    const burn = put(s, 'P1', 'essence-burn', 'hand');
    mana(s, 'P1', { R: 1, C: 1 });
    const targets = getLegalActions(s).filter((a) => a.type === 'CastSpell' && a.card === burn).flatMap((a) => (a.type === 'CastSpell' ? a.targets ?? [] : []));
    expect(targets).toEqual([card(rat)]);
    s = castFirst(s, burn);
    expect(zone(s, rat)).toBe('exile');
  });

  it('Face Yourself copies each creature the target player controls, with haste, sacrificed at the end step without a planeswalker', () => {
    let s = newGame();
    put(s, 'P2', 'rank-rat');
    put(s, 'P2', 'apex-witchstalker');
    const face = put(s, 'P1', 'face-yourself', 'hand');
    mana(s, 'P1', { R: 2, C: 5 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: face, targets: [{ kind: 'player', player: 'P2' }] }).state;
    const copies = Object.values(s.cards).filter((c) => c.isToken && c.controller === 'P1');
    expect(copies.map((c) => c.copy?.copiedName).sort()).toEqual(['Apex Witchstalker', 'Rank Rat']);
    expect(copies.every((c) => hasKeyword(s, c, 'Haste'))).toBe(true);
    s = goTo(s, 'end');
    s = settle(s).state;
    expect(Object.values(s.cards).filter((c) => c.isToken && c.zone === 'battlefield' && c.controller === 'P1')).toEqual([]);
  });

  it('Master of Barbs: creatures you control get +1/+0 once when opponents are dealt noncombat damage', () => {
    let s = newGame(3);
    const barbs = put(s, 'P1', 'master-of-barbs');
    const spell = put(s, 'P1', 'cast-away-doubt', 'hand');
    mana(s, 'P1', { B: 1, C: 2 });
    s = castFirst(s, spell);
    expect(powerOf(s, s.cards[barbs]!)).toBe(3);
  });

  it('Skilled Battlecarver has first strike only during your turn', () => {
    const s = newGame();
    const carver = put(s, 'P1', 'skilled-battlecarver');
    expect(hasKeyword(s, s.cards[carver]!, 'FirstStrike')).toBe(true);
    s.activePlayer = 'P2';
    expect(hasKeyword(s, s.cards[carver]!, 'FirstStrike')).toBe(false);
  });

  it('Stingcaster Mage gives an instant or sorcery in your graveyard flashback for its mana cost this turn', () => {
    let s = newGame();
    const gasp = put(s, 'P1', 'last-gasp', 'graveyard');
    const rat = put(s, 'P2', 'rank-rat');
    const mage = put(s, 'P1', 'stingcaster-mage', 'hand');
    mana(s, 'P1', { R: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: mage }).state;
    expect(s.cards[gasp]!.flashbackTurn).toBe(s.turnNumber);
    mana(s, 'P1', { B: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: gasp, targets: [card(rat)] }).state;
    expect([zone(s, rat), zone(s, gasp)]).toEqual(['graveyard', 'exile']);
  });

  it('Tether Technician: discard a card as it enters to deal 2 damage', () => {
    let s = newGame();
    const tech = put(s, 'P1', 'tether-technician', 'hand');
    put(s, 'P1', 'island', 'hand');
    mana(s, 'P1', { R: 1, C: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: tech }, { targets: (options) => options.find((t) => t[0]?.kind === 'player' && t[0].player === 'P2')! }).state;
    if (s.pending.kind === 'chooseCards') s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [s.pending.cards[0]!] }), { targets: (options) => options.find((t) => t[0]?.kind === 'player' && t[0].player === 'P2')! }).state;
    expect(s.players.P2!.life).toBe(18);
    expect(s.players.P1!.graveyard.length).toBe(1);
  });

  it('Wrath of the Bloodmane costs {1} less while you control a legendary creature', () => {
    const s = newGame();
    put(s, 'P2', 'rank-rat');
    const wrath = put(s, 'P1', 'wrath-of-the-bloodmane', 'hand');
    mana(s, 'P1', { R: 1, C: 1 });
    expect(getLegalActions(s).some((a) => a.type === 'CastSpell' && a.card === wrath)).toBe(false);
    put(s, 'P1', 'akroma-angel-of-fury');
    expect(getLegalActions(s).some((a) => a.type === 'CastSpell' && a.card === wrath)).toBe(true);
  });

  it('Identity Echo exiles your creature and reveals until a creature or planeswalker card, putting it onto the battlefield', () => {
    let s = newGame();
    const echo = put(s, 'P1', 'identity-echo');
    const rat = put(s, 'P1', 'rank-rat');
    const found = put(s, 'P1', 'apex-witchstalker', 'library');
    put(s, 'P1', 'island', 'library');
    mana(s, 'P1', { R: 1, C: 3 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: echo, ability: 0, targets: [card(rat)] }).state;
    expect([zone(s, rat), zone(s, found)]).toEqual(['exile', 'battlefield']);
  });
});

describe('F9: green', () => {
  it('Budding Insurgent: sacrifice it to destroy an artifact or enchantment, drawing if it was a legendary enchantment', () => {
    let s = newGame();
    const insurgent = put(s, 'P1', 'budding-insurgent');
    const anguish = put(s, 'P2', 'ajanis-anguish');
    const hand = s.players.P1!.hand.length;
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: insurgent, ability: 0, targets: [card(anguish)] }).state;
    expect([zone(s, insurgent), zone(s, anguish), s.players.P1!.hand.length]).toEqual(['graveyard', 'graveyard', hand]);
  });

  it('Compel Brutality: your planeswalker deals damage equal to its loyalty', () => {
    let s = newGame();
    const walker = put(s, 'P1', 'elspeth-suns-champion', 'battlefield', { namedCounters: { loyalty: 4 } });
    const witch = put(s, 'P2', 'apex-witchstalker');
    const spell = put(s, 'P1', 'compel-brutality', 'hand');
    mana(s, 'P1', { G: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, mode: 1, targets: [card(walker), card(witch)] }).state;
    expect(zone(s, witch)).toBe('graveyard');
  });

  it('Flourishing Grapple: the red or white permanent loses its abilities, then your creature deals damage equal to its power to it', () => {
    let s = newGame();
    const mine = put(s, 'P1', 'apex-witchstalker');
    const theirs = put(s, 'P2', 'skilled-battlecarver');
    put(s, 'P2', 'rank-rat');
    const spell = put(s, 'P1', 'flourishing-grapple', 'hand');
    mana(s, 'P1', { G: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(mine), card(theirs)] }).state;
    expect([zone(s, theirs), s.cards[mine]!.damage]).toEqual(['graveyard', 0]);
  });

  it('Gardenize gets a charge counter when your creature dies and adds {G} for each at your first main phase', () => {
    let s = newGame();
    const garden = put(s, 'P1', 'gardenize');
    const rat = put(s, 'P1', 'rank-rat');
    const gasp = put(s, 'P2', 'last-gasp', 'hand');
    s.pending = { kind: 'priority', player: 'P2', passes: 0 };
    mana(s, 'P2', { B: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P2', card: gasp, targets: [card(rat)] }).state;
    expect(s.cards[garden]!.namedCounters?.charge).toBe(1);
  });

  it('Hungering Puppetbeast: sacrifice another artifact for a counter and your choice of trample, hexproof or haste', () => {
    let s = newGame();
    const beast = put(s, 'P1', 'hungering-puppetbeast', 'hand');
    mana(s, 'P1', { G: 2, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: beast }).state;
    const heartwood = Object.values(s.cards).find((c) => c.defId === 'heartwood-token-fra')!.id;
    mana(s, 'P1', { C: 1 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: beast, ability: 0, targets: [], costCards: [heartwood] }).state;
    expect(s.pending).toMatchObject({ kind: 'chooseOption', forResolution: 'keyword', options: ['Trample', 'Hexproof', 'Haste'] });
    s = settle(act(s, { type: 'ChooseOption', player: 'P1', option: 'Hexproof' })).state;
    expect([s.cards[beast]!.counters, hasKeyword(s, s.cards[beast]!, 'Hexproof'), zone(s, heartwood)]).toEqual([1, true, 'void']);
  });

  it('Omnipresence: spells from your hand with mana value up to your creature count are free', () => {
    const s = newGame();
    put(s, 'P1', 'omnipresence');
    put(s, 'P1', 'rank-rat');
    put(s, 'P1', 'rank-rat');
    const cheap = put(s, 'P1', 'last-gasp', 'hand');
    const dear = put(s, 'P1', 'cast-away-doubt', 'hand');
    put(s, 'P2', 'rank-rat');
    const castable = (id: string) => getLegalActions(s).some((a) => a.type === 'CastSpell' && a.card === id);
    expect([castable(cheap), castable(dear)]).toEqual([true, false]);
  });

  it('Puppet Crafting makes the enchanted artifact a 5/5 Construct creature', () => {
    let s = newGame();
    const relic = put(s, 'P1', 'lichs-relic');
    const aura = put(s, 'P1', 'puppet-crafting', 'hand');
    mana(s, 'P1', { G: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: aura, targets: [card(relic)] }).state;
    const def = currentDefinition(s, s.cards[relic]!);
    expect([def.types.includes('creature'), def.subtypes?.includes('Construct'), powerOf(s, s.cards[relic]!), toughnessOf(s, s.cards[relic]!)]).toEqual([true, true, 5, 5]);
  });

  it('Something Worth Saving mills four and returns a permanent card milled this way', () => {
    let s = newGame();
    for (let i = 0; i < 4; i++) put(s, 'P1', 'rank-rat', 'library');
    const spell = put(s, 'P1', 'something-worth-saving', 'hand');
    mana(s, 'P1', { G: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell }).state;
    if (s.pending.kind === 'chooseCards') s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [s.pending.cards[0]!] })).state;
    expect(s.players.P1!.graveyard.filter((id) => s.cards[id]!.defId === 'rank-rat').length).toBe(3);
    expect(s.players.P1!.life).toBe(21);
  });

  it('Sureshot Sower can be discarded from hand to destroy a creature with flying', () => {
    let s = newGame();
    const sower = put(s, 'P1', 'sureshot-sower', 'hand');
    const flyer = put(s, 'P2', 'screeching-soulbreaker');
    mana(s, 'P1', { G: 1, C: 3 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: sower, ability: 0, targets: [card(flyer)] }).state;
    expect([zone(s, sower), zone(s, flyer)]).toEqual(['graveyard', 'graveyard']);
  });

  it('Tarmogoyf counts the card types among cards in all graveyards', () => {
    const s = newGame();
    const goyf = put(s, 'P1', 'tarmogoyf');
    expect([powerOf(s, s.cards[goyf]!), toughnessOf(s, s.cards[goyf]!)]).toEqual([0, 1]);
    put(s, 'P1', 'rank-rat', 'graveyard');
    put(s, 'P2', 'last-gasp', 'graveyard');
    put(s, 'P2', 'craterclaw-colossus', 'graveyard'); // artifact creature
    expect([powerOf(s, s.cards[goyf]!), toughnessOf(s, s.cards[goyf]!)]).toEqual([3, 4]);
  });

  it('Hexhaven Invigorator: when dealt damage, search for up to that many lands onto the battlefield tapped', () => {
    let s = newGame();
    const beast = put(s, 'P1', 'hexhaven-invigorator');
    const lands = [put(s, 'P1', 'forest', 'library'), put(s, 'P1', 'forest', 'library'), put(s, 'P1', 'forest', 'library')];
    const gasp = put(s, 'P2', 'wrath-of-the-bloodmane', 'hand');
    s.pending = { kind: 'priority', player: 'P2', passes: 0 };
    mana(s, 'P2', { R: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P2', card: gasp, targets: [card(beast)] }).state;
    // 4 damage: up to four lands, and the library has three.
    const found = lands.filter((id) => zone(s, id) === 'battlefield');
    expect(found.length).toBe(3);
    expect(found.every((id) => s.cards[id]!.tapped)).toBe(true);
  });

  it("Verdant Kraken makes a Forest Tentacle at each player's upkeep", () => {
    let s = newGame();
    put(s, 'P1', 'verdant-kraken');
    s = goTo(s, 'upkeep');
    s = settle(s).state;
    const tentacles = Object.values(s.cards).filter((c) => c.defId === 'forest-tentacle-token-fra');
    expect(tentacles.length).toBe(1);
    expect(currentDefinition(s, tentacles[0]!).types).toEqual(['land', 'creature']);
  });
});

describe('F10a: multicolor', () => {
  it('Prowess: +1/+1 until end of turn whenever you cast a noncreature spell (Grim Repriser)', () => {
    let s = newGame();
    const repriser = put(s, 'P1', 'grim-repriser');
    const gasp = put(s, 'P1', 'last-gasp', 'hand');
    const rat = put(s, 'P2', 'rank-rat');
    mana(s, 'P1', { B: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: gasp, targets: [card(rat)] }).state;
    expect([powerOf(s, s.cards[repriser]!), toughnessOf(s, s.cards[repriser]!)]).toEqual([3, 3]);
  });

  it('Grim Repriser returns from the graveyard with a finality counter only after an opponent was dealt noncombat damage', () => {
    let s = newGame();
    const repriser = put(s, 'P1', 'grim-repriser', 'graveyard');
    mana(s, 'P1', { B: 1, R: 1 });
    expect(getLegalActions(s).some((a) => a.type === 'ActivateAbility' && a.card === repriser)).toBe(false);
    s.players.P2!.noncombatDamageTurn = s.turnNumber;
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: repriser, ability: 0, targets: [] }).state;
    expect([zone(s, repriser), s.cards[repriser]!.namedCounters?.finality]).toEqual(['battlefield', 1]);
  });

  it('Clash of Elements: the owner chooses; on top of their library they take 2 damage, otherwise it goes on the bottom', () => {
    let s = newGame();
    const rat = put(s, 'P2', 'rank-rat');
    const spell = put(s, 'P1', 'clash-of-elements', 'hand');
    mana(s, 'P1', { U: 1, R: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(rat)] }).state;
    expect(s.pending).toMatchObject({ kind: 'chooseCards', player: 'P2', purpose: 'library' });
    s = settle(act(s, { type: 'ChooseCards', player: 'P2', cards: [] })).state;
    expect([s.players.P2!.library[0], s.players.P2!.life]).toEqual([rat, 18]);
    let u = newGame();
    const other = put(u, 'P2', 'rank-rat');
    const again = put(u, 'P1', 'clash-of-elements', 'hand');
    mana(u, 'P1', { U: 1, R: 1, C: 1 });
    u = cast(u, { type: 'CastSpell', player: 'P1', card: again, targets: [card(other)] }).state;
    u = settle(act(u, { type: 'ChooseCards', player: 'P2', cards: [other] })).state;
    expect([u.players.P2!.library.at(-1), u.players.P2!.life]).toEqual([other, 20]);
  });

  it('Craftwork Crusher chooses two of its three modes', () => {
    let s = newGame();
    const crusher = put(s, 'P1', 'craftwork-crusher', 'hand');
    mana(s, 'P1', { R: 2, G: 2, C: 3 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: crusher });
    s = settle(s).state;
    for (let i = 0; i < 5 && s.pending.kind !== 'chooseModes'; i++) s = act(s, { type: 'PassPriority', player: (s.pending as { player: string }).player });
    const options = getLegalActions(s).filter((a) => a.type === 'ChooseModes').map((a) => (a as { modes: number[] }).modes);
    // Any two of the three (the damage can only target the Crusher itself here).
    expect(options).toEqual([[0, 1], [0, 2], [1, 2]]);
    const hand = s.players.P1!.hand.length;
    s = settle(act(s, { type: 'ChooseModes', player: 'P1', modes: [1, 2] })).state;
    expect(s.players.P1!.hand.length).toBe(hand + 1);
    expect(Object.values(s.cards).some((c) => c.defId === 'cadet-token-fra')).toBe(true);
  });

  it('Desperate Futurescribe: +1/+1 until end of turn, or a +1/+1 counter if you scried or surveilled this turn', () => {
    let s = newGame();
    put(s, 'P1', 'desperate-futurescribe');
    const rat = put(s, 'P1', 'rank-rat');
    s = goTo(s, 'beginCombat');
    s = settle(s).state;
    expect([powerOf(s, s.cards[rat]!), s.cards[rat]!.counters ?? 0]).toEqual([2, 0]);
    let u = newGame();
    put(u, 'P1', 'desperate-futurescribe');
    const other = put(u, 'P1', 'rank-rat');
    u.players.P1!.scriedOrSurveiledTurn = u.turnNumber;
    u = goTo(u, 'beginCombat');
    u = settle(u).state;
    expect(u.cards[other]!.counters).toBe(1);
  });

  it('Entrust the Spark: sacrifice a planeswalker to search for one and put it onto the battlefield', () => {
    let s = newGame();
    const old = put(s, 'P1', 'elspeth-suns-champion', 'battlefield', { namedCounters: { loyalty: 4 } });
    const next = put(s, 'P1', 'jace-multiverse-architect', 'library');
    const spell = put(s, 'P1', 'entrust-the-spark', 'hand');
    mana(s, 'P1', { G: 1, U: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell }).state;
    if (s.pending.kind === 'chooseCards') s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [old] })).state;
    expect([zone(s, old), zone(s, next)]).toEqual(['graveyard', 'battlefield']);
  });

  it('Ferocity of the Hunt returns the enchanted creature tapped when it dies', () => {
    let s = newGame();
    const rat = put(s, 'P1', 'rank-rat');
    const aura = put(s, 'P1', 'ferocity-of-the-hunt', 'hand');
    mana(s, 'P1', { B: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: aura, targets: [card(rat)] }).state;
    expect([powerOf(s, s.cards[rat]!), hasKeyword(s, s.cards[rat]!, 'Deathtouch')]).toEqual([2, true]);
    const gasp = put(s, 'P2', 'last-gasp', 'hand');
    s.pending = { kind: 'priority', player: 'P2', passes: 0 };
    mana(s, 'P2', { B: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P2', card: gasp, targets: [card(rat)] }).state;
    expect([zone(s, rat), s.cards[rat]!.tapped]).toEqual(['battlefield', true]);
  });

  it('Kwia, Vigorbloom makes one Lotus the first time you gain life each turn', () => {
    let s = newGame();
    put(s, 'P1', 'kwia-vigorbloom');
    for (let i = 0; i < 2; i++) {
      const spell = put(s, 'P1', 'restore-with-empathy', 'hand');
      put(s, 'P1', 'rank-rat', 'graveyard');
      mana(s, 'P1', { G: 1, C: 2 });
      s = cast(s, getLegalActions(s).find((a) => a.type === 'CastSpell' && a.card === spell)!).state;
    }
    expect(Object.values(s.cards).filter((c) => c.defId === 'lotus-token-fra').length).toBe(1);
  });

  it('Mind Meanderer has vigilance while you control a Jace planeswalker', () => {
    const s = newGame();
    const bird = put(s, 'P1', 'mind-meanderer');
    expect(hasKeyword(s, s.cards[bird]!, 'Vigilance')).toBe(false);
    put(s, 'P1', 'jace-multiverse-architect', 'battlefield', { namedCounters: { loyalty: 4 } });
    expect(hasKeyword(s, s.cards[bird]!, 'Vigilance')).toBe(true);
  });

  it('Null Summoner exiles a nonland card from the opponent\'s hand, castable while you have threshold', () => {
    let s = newGame();
    const theirs = put(s, 'P2', 'last-gasp', 'hand');
    const summoner = put(s, 'P1', 'null-summoner', 'hand');
    mana(s, 'P1', { U: 1, B: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: summoner }, { targets: (options) => options.find((t) => t[0]?.kind === 'player' && t[0].player === 'P2')! }).state;
    expect(s.pending).toMatchObject({ kind: 'chooseCards', player: 'P1', purpose: 'discard' });
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [theirs] })).state;
    expect(zone(s, theirs)).toBe('exile');
    put(s, 'P2', 'rank-rat');
    mana(s, 'P1', { G: 2 });
    const castable = () => getLegalActions(s).some((a) => a.type === 'CastSpell' && a.card === theirs);
    expect(castable()).toBe(false);
    for (let i = 0; i < 7; i++) put(s, 'P1', 'island', 'graveyard');
    expect(castable()).toBe(true);
  });

  it('Recursive Recruitment: two Cadets, with counters for every three cards in your graveyard when cast with flashback', () => {
    let s = newGame();
    const spell = put(s, 'P1', 'recursive-recruitment', 'graveyard');
    for (let i = 0; i < 6; i++) put(s, 'P1', 'island', 'graveyard');
    mana(s, 'P1', { U: 1, B: 1, C: 6 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell }).state;
    const cadets = Object.values(s.cards).filter((c) => c.defId === 'cadet-token-fra');
    // Six islands in the graveyard as it resolves (the spell itself is on the stack): two counters each.
    expect(cadets.map((c) => c.counters)).toEqual([2, 2]);
    expect(zone(s, spell)).toBe('exile');
  });
});

describe('F10b: multicolor and artifacts', () => {
  it('Solitary Cell exiles a nonland permanent with mana value 3 or less until it leaves', () => {
    let s = newGame();
    const rat = put(s, 'P2', 'rank-rat');
    const big = put(s, 'P2', 'apex-witchstalker');
    const cell = put(s, 'P1', 'solitary-cell', 'hand');
    mana(s, 'P1', { R: 1, W: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: cell }).state;
    expect([zone(s, rat), zone(s, big)]).toEqual(['exile', 'battlefield']);
  });

  it('Stinging Vitriol: 2 damage, then you choose a nonland card from their hand to discard', () => {
    let s = newGame();
    const theirs = put(s, 'P2', 'last-gasp', 'hand');
    put(s, 'P2', 'island', 'hand');
    const spell = put(s, 'P1', 'stinging-vitriol', 'hand');
    mana(s, 'P1', { B: 1, R: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [{ kind: 'player', player: 'P2' }] }).state;
    expect(s.pending).toMatchObject({ kind: 'chooseCards', player: 'P1', purpose: 'discard', cards: [theirs] });
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [theirs] })).state;
    expect([zone(s, theirs), s.players.P2!.life]).toEqual(['graveyard', 18]);
  });

  it('Twinned Vision draws two with flashback, which also costs a discard', () => {
    let s = newGame();
    const vision = put(s, 'P1', 'twinned-vision', 'graveyard');
    const fodder = put(s, 'P1', 'island', 'hand');
    mana(s, 'P1', { U: 2, C: 1 });
    const way = getLegalActions(s).find((a) => a.type === 'CastSpell' && a.card === vision);
    expect(way && way.type === 'CastSpell' ? way.costCards : undefined).toEqual([fodder]);
    const hand = s.players.P1!.hand.length;
    s = cast(s, way!).state;
    expect([zone(s, fodder), zone(s, vision), s.players.P1!.hand.length]).toEqual(['graveyard', 'exile', hand - 1 + 2]);
  });

  it('Twisted Fates destroys a nonland permanent and puts a counter on each creature the target player controls', () => {
    let s = newGame();
    const victim = put(s, 'P2', 'rank-rat');
    const a = put(s, 'P1', 'rank-rat');
    const b = put(s, 'P1', 'rank-rat');
    const spell = put(s, 'P1', 'twisted-fates', 'hand');
    mana(s, 'P1', { W: 2, B: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(victim), { kind: 'player', player: 'P1' }] }).state;
    expect([zone(s, victim), s.cards[a]!.counters, s.cards[b]!.counters]).toEqual(['graveyard', 1, 1]);
  });

  it('Vindictive Triumph steals a permanent with mana value 3 or less until the end step', () => {
    let s = newGame();
    const rat = put(s, 'P2', 'rank-rat');
    const spell = put(s, 'P1', 'vindictive-triumph', 'hand');
    mana(s, 'P1', { W: 1, B: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(rat)] }).state;
    expect([zone(s, rat), s.cards[rat]!.controller, s.cards[rat]!.tapped]).toEqual(['battlefield', 'P1', true]);
    s = goTo(s, 'end');
    s = settle(s).state;
    expect(zone(s, rat)).toBe('exile');
  });

  it("Warriors' Blades: equip costs {1} less for each +1/+1 counter on the target", () => {
    const s = newGame();
    const blades = put(s, 'P1', 'warriors-blades');
    const big = put(s, 'P1', 'rank-rat', 'battlefield', { counters: 2 });
    mana(s, 'P1', { C: 1 });
    expect(getLegalActions(s).some((a) => a.type === 'ActivateAbility' && a.card === blades && a.targets?.[0]?.kind === 'card' && a.targets[0].card === big)).toBe(true);
  });

  it('Eye of Jace surveils, then with seven cards in your graveyard sacrifices itself to drain', () => {
    let s = newGame();
    const eye = put(s, 'P1', 'eye-of-jace');
    for (let i = 0; i < 7; i++) put(s, 'P1', 'island', 'graveyard');
    // P1's next upkeep.
    for (let i = 0; i < 4 && !(s.step === 'upkeep' && s.activePlayer === 'P1'); i++) s = settle(goTo(s, s.step === 'upkeep' ? 'draw' : 'upkeep')).state;
    expect([zone(s, eye), s.players.P2!.life, s.players.P1!.life]).toEqual(['graveyard', 18, 22]);
  });

  it('The Echoverse Fulcrum exiles itself to destroy all creatures', () => {
    let s = newGame();
    const fulcrum = put(s, 'P1', 'the-echoverse-fulcrum');
    const a = put(s, 'P1', 'rank-rat');
    const b = put(s, 'P2', 'rank-rat');
    mana(s, 'P1', { C: 5 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: fulcrum, ability: 0, targets: [] }).state;
    expect([zone(s, fulcrum), zone(s, a), zone(s, b)]).toEqual(['exile', 'graveyard', 'graveyard']);
  });

  it('Theorix Charm can counter a noncreature spell unless its controller pays {2}', () => {
    let s = newGame();
    const theirs = put(s, 'P2', 'last-gasp', 'hand');
    const rat = put(s, 'P1', 'rank-rat');
    s.activePlayer = 'P2';
    s.pending = { kind: 'priority', player: 'P2', passes: 0 };
    mana(s, 'P2', { B: 1, C: 1 });
    s = act(s, { type: 'CastSpell', player: 'P2', card: theirs, targets: [card(rat)] });
    const charm = put(s, 'P1', 'theorix-charm', 'hand');
    s.pending = { kind: 'priority', player: 'P1', passes: 0 };
    mana(s, 'P1', { U: 1, B: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: charm, mode: 0, targets: [card(theirs)] }).state;
    // P2 has no mana left to pay {2}.
    if (s.pending.kind === 'chooseCards') s = settle(act(s, { type: 'ChooseCards', player: 'P2', cards: [] })).state;
    expect([zone(s, theirs), zone(s, rat)]).toEqual(['graveyard', 'battlefield']);
  });
});

describe('F11a: white echoed-pairs legends', () => {
  it('Danitha, Sword of Hope draws once a turn for a spell that targets your creature', () => {
    let s = newGame();
    put(s, 'P1', 'danitha-sword-of-hope');
    const rat = put(s, 'P1', 'rank-rat');
    const hand = s.players.P1!.hand.length;
    for (let i = 0; i < 2; i++) {
      const spell = put(s, 'P1', 'tethermages-advantage', 'hand');
      mana(s, 'P1', { G: 1 });
      s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(rat)] }).state;
    }
    expect(s.players.P1!.hand.length).toBe(hand + 1);
  });

  it('Ghalta, the Immovable costs less by your greatest toughness; your creatures attack despite defender and deal damage by toughness', () => {
    const s = newGame();
    put(s, 'P1', 'rank-rat', 'battlefield', { counters: 6 }); // 7/7
    const ghalta = put(s, 'P1', 'ghalta-the-immovable', 'hand');
    mana(s, 'P1', { W: 1, C: 1 });
    expect(getLegalActions(s).some((a) => a.type === 'CastSpell' && a.card === ghalta)).toBe(true);
    const wall = put(s, 'P1', 'surveillance-phantasm'); // defender
    put(s, 'P1', 'ghalta-the-immovable');
    expect(canAttack(s, s.cards[wall]!, 'P1')).toBe(true);
  });

  it("Gideon's Memorial gives creature tokens +1/+0 and vigilance, and its mana only casts planeswalker spells", () => {
    let s = newGame();
    const memorial = put(s, 'P1', 'gideons-memorial');
    const heart = put(s, 'P1', 'heartstring-puller', 'hand');
    mana(s, 'P1', { R: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: heart }).state;
    const cadet = Object.values(s.cards).find((c) => c.defId === 'cadet-token-fra')!;
    expect([powerOf(s, cadet), hasKeyword(s, cadet, 'Vigilance')]).toEqual([3, true]);
    const tap = getLegalActions(s).find((a) => a.type === 'ActivateManaAbility' && a.card === memorial)!;
    s = act(s, tap);
    expect(Object.values(s.players.P1!.restrictedMana?.planeswalkerSpell ?? {}).reduce((a, b) => a + b, 0)).toBe(1);
  });

  it('Thalia, the Survivor makes opponents\' noncreature spells cost {1} more', () => {
    const s = newGame();
    put(s, 'P2', 'thalia-the-survivor');
    put(s, 'P2', 'rank-rat');
    const gasp = put(s, 'P1', 'last-gasp', 'hand');
    mana(s, 'P1', { B: 1, C: 1 });
    expect(getLegalActions(s).some((a) => a.type === 'CastSpell' && a.card === gasp)).toBe(false);
    mana(s, 'P1', { C: 1 });
    expect(getLegalActions(s).some((a) => a.type === 'CastSpell' && a.card === gasp)).toBe(true);
  });

  it('Teyo, Lightshield Expert: hexproof, plus a +1/+1 counter on a creature or a loyalty counter on a planeswalker', () => {
    let s = newGame();
    const walker = put(s, 'P1', 'elspeth-suns-champion', 'battlefield', { namedCounters: { loyalty: 4 } });
    const teyo = put(s, 'P1', 'teyo-lightshield-expert', 'hand');
    mana(s, 'P1', { W: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: teyo }, { targets: (options) => options.find((t) => t[0]?.kind === 'card' && t[0].card === walker)! }).state;
    expect(s.cards[walker]!.namedCounters?.loyalty).toBe(5);
  });

  it('Yoshimaru puts one more +1/+1 counter on your creatures', () => {
    let s = newGame();
    put(s, 'P1', 'yoshimaru-beloved-companion');
    const rat = put(s, 'P1', 'rank-rat');
    const spell = put(s, 'P1', 'vinelasher-adept', 'hand');
    mana(s, 'P1', { G: 2, C: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell }, { targets: (options) => options.find((t) => t[0]?.kind === 'card' && t[0].card === rat)! }).state;
    expect(s.cards[rat]!.counters).toBe(4);
  });

  it('Yuriko, Blade of the Mighty: no spells or nonmana abilities during combat', () => {
    let s = newGame();
    put(s, 'P1', 'yuriko-blade-of-the-mighty');
    const attacker = put(s, 'P1', 'rank-rat');
    const gasp = put(s, 'P1', 'last-gasp', 'hand');
    put(s, 'P2', 'rank-rat');
    mana(s, 'P1', { B: 1, C: 1 });
    expect(getLegalActions(s).some((a) => a.type === 'CastSpell' && a.card === gasp)).toBe(true);
    s = goTo(s, 'declareAttackers');
    s = act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker, defender: 'P2' }] });
    s = settle(s).state;
    expect(hasKeyword(s, s.cards[attacker]!, 'DoubleStrike')).toBe(true);
    mana(s, 'P1', { B: 1, C: 1 });
    expect(getLegalActions(s).some((a) => a.type === 'CastSpell' && a.card === gasp)).toBe(false);
  });

  it('Tomik, Orzhov Lawmage: no more than one creature can attack each of your planeswalkers', () => {
    let s = newGame();
    put(s, 'P2', 'tomik-orzhov-lawmage');
    const walker = put(s, 'P2', 'elspeth-suns-champion', 'battlefield', { namedCounters: { loyalty: 4 } });
    const a = put(s, 'P1', 'rank-rat');
    const b = put(s, 'P1', 'rank-rat');
    s = goTo(s, 'declareAttackers');
    expect(() => act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: a, defender: 'P2', planeswalker: walker }, { attacker: b, defender: 'P2', planeswalker: walker }] })).toThrow(/one creature/);
  });
});
