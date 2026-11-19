// Reality Fracture main set (FRA), built group by group (docs/reality-fracture.md).

import { describe, expect, it } from 'vitest';
import { currentDefinition, getLegalActions, hasKeyword, powerOf, toughnessOf, type GameState } from '@nexus/engine';
import { act, cast, fight, goTo, mana, newGame, put } from './kit-helpers.ts';

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
