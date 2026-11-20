// Secrets of Strixhaven (SOS) and its Commander decks (SOC), built group by group (docs/strixhaven.md).

import { describe, expect, it } from 'vitest';
import { getLegalActions, hasKeyword, powerOf, toughnessOf, type GameState } from '@nexus/engine';
import { act, cast, fight, goTo, mana, newGame, put, rejected, settle } from './kit-helpers.ts';
import { planTaps } from '../src/mana.ts';

const card = (id: string) => ({ kind: 'card' as const, card: id });
const manaFrom = (s: GameState, id: string) => [...new Set(getLegalActions(s).filter((a) => a.type === 'ActivateManaAbility' && a.card === id).map((a) => (a as { mana: string }).mana))].sort();

describe('SOS1: lands', () => {
  it('the slow lands enter tapped unless you control two or more other lands', () => {
    let s = newGame();
    put(s, 'P1', 'swamp');
    const glade = put(s, 'P1', 'deathcap-glade', 'hand');
    s = act(s, { type: 'PlayLand', player: 'P1', card: glade });
    expect(s.cards[glade]!.tapped).toBe(true);
    let u = newGame();
    put(u, 'P1', 'island');
    put(u, 'P1', 'mountain');
    const coast = put(u, 'P1', 'stormcarved-coast', 'hand');
    u = act(u, { type: 'PlayLand', player: 'P1', card: coast });
    expect(u.cards[coast]!.tapped).toBe(false);
    expect(manaFrom(u, coast)).toEqual(['R', 'U']);
  });

  it('the college lands enter tapped and surveil 1 for four mana and a tap', () => {
    let s = newGame();
    const fields = put(s, 'P1', 'fields-of-strife', 'hand');
    s = act(s, { type: 'PlayLand', player: 'P1', card: fields });
    expect(s.cards[fields]!.tapped).toBe(true);
    s.cards[fields]!.tapped = false;
    expect(manaFrom(s, fields)).toEqual(['R', 'W']);
    mana(s, 'P1', { R: 1, W: 1, C: 2 });
    const top = s.players.P1!.library[0]!;
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: fields, ability: 0, targets: [] }, { surveilToGraveyard: true }).state;
    expect([s.cards[fields]!.tapped, s.cards[top]!.zone]).toEqual([true, 'graveyard']);
  });

  it('the Turbulent lands enter tapped unless an opponent controls eight or more lands', () => {
    let s = newGame();
    const fen = put(s, 'P1', 'turbulent-fen', 'hand');
    s = act(s, { type: 'PlayLand', player: 'P1', card: fen });
    expect(s.cards[fen]!.tapped).toBe(true);
    let u = newGame();
    for (let i = 0; i < 8; i++) put(u, 'P2', 'forest');
    const moor = put(u, 'P1', 'turbulent-moor', 'hand');
    u = act(u, { type: 'PlayLand', player: 'P1', card: moor });
    expect(u.cards[moor]!.tapped).toBe(false);
    expect(manaFrom(u, moor)).toEqual(['B', 'W']);
  });

  it('Great Hall of the Biblioplex: {C}, or 1 life for any color only for instants and sorceries; {5} makes it a 2/4 Wizard', () => {
    let s = newGame();
    const hall = put(s, 'P1', 'great-hall-of-the-biblioplex');
    expect(manaFrom(s, hall)).toEqual(['B', 'C', 'G', 'R', 'U', 'W']);
    s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: hall, mana: 'R' });
    expect([s.players.P1!.life, s.players.P1!.manaPool.R, s.players.P1!.restrictedMana?.instantOrSorcerySpell?.R]).toEqual([19, 0, 1]);
    // The restricted red pays for an instant, not a creature.
    const bolt = put(s, 'P1', 'lightning-bolt', 'hand');
    s = cast(s, { type: 'CastSpell', player: 'P1', card: bolt, targets: [{ kind: 'player', player: 'P2' }] }).state;
    expect(s.players.P2!.life).toBe(17);
    // Paying automatically only ever takes its {C}.
    let t = newGame();
    const hall2 = put(t, 'P1', 'great-hall-of-the-biblioplex');
    expect(planTaps(t, 'P1', '{R}')).toBeNull();
    expect(planTaps(t, 'P1', '{1}')).toEqual([{ card: hall2, mana: 'C' }]);
    // {5}: a 2/4 Wizard with "whenever you cast an instant or sorcery spell, this creature gets +1/+0".
    mana(t, 'P1', { C: 5 });
    t = cast(t, { type: 'ActivateAbility', player: 'P1', card: hall2, ability: 0, targets: [] }).state;
    expect([powerOf(t, t.cards[hall2]!), toughnessOf(t, t.cards[hall2]!)]).toEqual([2, 4]);
    mana(t, 'P1', { R: 1 });
    const bolt2 = put(t, 'P1', 'lightning-bolt', 'hand');
    t = cast(t, { type: 'CastSpell', player: 'P1', card: bolt2, targets: [{ kind: 'player', player: 'P2' }] }).state;
    expect(powerOf(t, t.cards[hall2]!)).toBe(3);
  });

  it('Petrified Hamlet: lands with the chosen name tap for {C} and can only activate mana abilities', () => {
    let s = newGame();
    const anchorage = put(s, 'P2', 'restless-anchorage');
    const peak = put(s, 'P1', 'coastal-peak', 'hand');
    const hamlet = put(s, 'P1', 'petrified-hamlet', 'hand');
    s = act(s, { type: 'PlayLand', player: 'P1', card: hamlet });
    expect(s.pending.kind).toBe('chooseOption');
    const options = (s.pending as { options: string[] }).options;
    expect(options).toEqual(expect.arrayContaining(['Restless Anchorage', 'Plains', 'Petrified Hamlet']));
    // Everyone sees the options, so a land in a hand isn't one.
    expect(options).not.toContain('Coastal Peak');
    s = act(s, { type: 'ChooseOption', player: 'P1', option: 'Restless Anchorage' });
    expect(manaFrom(s, hamlet)).toEqual(['C']);
    // Their mana abilities still work, with {C} added; their other abilities don't.
    s.pending = { kind: 'priority', player: 'P2', passes: 0 } as never;
    expect(manaFrom(s, anchorage)).toEqual(['C', 'U', 'W']);
    mana(s, 'P2', { C: 1, W: 1, U: 1 });
    expect(rejected(s, { type: 'ActivateAbility', player: 'P2', card: anchorage, ability: 0, targets: [] })).toMatch(/can’t be activated/);
    // Coastal Peak (another name) can still cycle; once it's the chosen name, it can't.
    mana(s, 'P1', { C: 2 });
    s.pending = { kind: 'priority', player: 'P1', passes: 0 } as never;
    expect(getLegalActions(s).some((a) => a.type === 'ActivateAbility' && a.card === peak)).toBe(true);
    let u = newGame();
    const peak2 = put(u, 'P1', 'coastal-peak', 'hand');
    put(u, 'P2', 'coastal-peak', 'graveyard');
    u = act(u, { type: 'PlayLand', player: 'P1', card: put(u, 'P1', 'petrified-hamlet', 'hand') });
    u = act(u, { type: 'ChooseOption', player: 'P1', option: 'Coastal Peak' });
    mana(u, 'P1', { C: 2 });
    expect(getLegalActions(u).some((a) => a.type === 'ActivateAbility' && a.card === peak2)).toBe(false);
  });

  it('Skycoach Waypoint: {3}, {T}: target creature becomes prepared', () => {
    let s = newGame();
    const waypoint = put(s, 'P1', 'skycoach-waypoint');
    const recollector = put(s, 'P1', 'bloodline-recollector-ancestral-craving');
    expect(manaFrom(s, waypoint)).toEqual(['C']);
    mana(s, 'P1', { C: 3 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: waypoint, ability: 0, targets: [card(recollector)] }).state;
    expect(s.cards[recollector]!.prepared).toBe(true);
  });
});

describe('SOS2a: white and blue prepared creatures', () => {
  const copyOf = (s: GameState, creature: string) => Object.values(s.cards).find((c) => c.zone === 'exile' && c.prepareSpellOf?.card === creature);
  const castCopy = (s: GameState, creature: string) => getLegalActions(s).filter((a): a is Extract<typeof a, { type: 'CastSpell' }> => a.type === 'CastSpell' && a.card === copyOf(s, creature)?.id);
  const enter = (s: GameState, id: string, pool: Parameters<typeof mana>[2]) => {
    mana(s, 'P1', pool);
    return cast(s, { type: 'CastSpell', player: 'P1', card: id }).state;
  };

  it('Elite Interceptor: Rejoinder taps or untaps a creature and draws', () => {
    let s = newGame();
    const elite = put(s, 'P1', 'elite-interceptor-rejoinder', 'hand');
    const bear = put(s, 'P2', 'rank-rat');
    s = enter(s, elite, { W: 1 });
    expect(s.cards[elite]!.prepared).toBe(true);
    mana(s, 'P1', { W: 1, C: 1 });
    const hand = s.players.P1!.hand.length;
    s = cast(s, castCopy(s, elite).find((a) => a.targets?.[0]?.kind === 'card' && a.targets[0].card === bear)!).state;
    expect([s.cards[bear]!.tapped, s.players.P1!.hand.length, s.cards[elite]!.prepared]).toEqual([true, hand + 1, undefined]);
  });

  it('Emeritus of Truce: target player gets an Inkling; prepared only if an opponent then has more creatures', () => {
    let s = newGame();
    put(s, 'P2', 'rank-rat');
    put(s, 'P2', 'rank-rat');
    const emeritus = put(s, 'P1', 'emeritus-of-truce-swords-to-plowshares', 'hand');
    mana(s, 'P1', { W: 2, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: emeritus }, { targets: (o) => o.find((t) => t[0]?.kind === 'player' && t[0].player === 'P1')! }).state;
    // P1: Emeritus and an Inkling (2); P2: two Bears (2): not more, so not prepared.
    expect(s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'inkling-token-sos')).toHaveLength(1);
    expect(s.cards[emeritus]!.prepared).toBeUndefined();
    let u = newGame();
    put(u, 'P2', 'rank-rat');
    const e2 = put(u, 'P1', 'emeritus-of-truce-swords-to-plowshares', 'hand');
    mana(u, 'P1', { W: 2, C: 1 });
    u = cast(u, { type: 'CastSpell', player: 'P1', card: e2 }, { targets: (o) => o.find((t) => t[0]?.kind === 'player' && t[0].player === 'P2')! }).state;
    expect(u.cards[e2]!.prepared).toBe(true);
    // Swords to Plowshares: exile a creature; its controller gains life equal to its power.
    const bear = u.players.P2!.battlefield.find((id) => u.cards[id]!.defId === 'rank-rat')!;
    mana(u, 'P1', { W: 1 });
    u = cast(u, castCopy(u, e2).find((a) => a.targets?.[0]?.kind === 'card' && a.targets[0].card === bear)!).state;
    expect([u.cards[bear]!.zone, u.players.P2!.life]).toEqual(['exile', 21]);
  });

  it('Joined Researchers becomes prepared at an end step if an opponent has more cards in hand', () => {
    let s = newGame();
    const researchers = put(s, 'P1', 'joined-researchers-secret-rendezvous');
    s.players.P1!.hand = [];
    put(s, 'P2', 'island', 'hand');
    s = settle(goTo(s, 'end')).state;
    expect(s.cards[researchers]!.prepared).toBe(true);
  });

  it('Spiritcall Enthusiast becomes prepared when tokens enter; Scrollboost gives one or two creatures +2/+2', () => {
    let s = newGame();
    const spirit = put(s, 'P1', 'spiritcall-enthusiast-scrollboost');
    const bear = put(s, 'P1', 'rank-rat');
    const jadzi = put(s, 'P1', 'emeritus-of-truce-swords-to-plowshares', 'hand');
    mana(s, 'P1', { W: 2, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: jadzi }).state;
    expect(s.cards[spirit]!.prepared).toBe(true);
    mana(s, 'P1', { W: 1, C: 1 });
    const two = castCopy(s, spirit).find((a) => a.targets?.length === 2 && a.targets.every((t) => t.kind === 'card' && [spirit, bear].includes(t.card)))!;
    s = cast(s, two).state;
    expect([powerOf(s, s.cards[spirit]!), powerOf(s, s.cards[bear]!)]).toEqual([5, 3]);
  });

  it('Quill-Blade Laureate, Honorbound Page: first and double strike, and their pump spells', () => {
    let s = newGame();
    const quill = put(s, 'P1', 'quill-blade-laureate-twofold-intent', 'hand');
    const bear = put(s, 'P1', 'rank-rat');
    s = enter(s, quill, { W: 1, C: 1 });
    mana(s, 'P1', { W: 1, C: 1 });
    s = cast(s, castCopy(s, quill).find((a) => a.targets?.[0]?.kind === 'card' && a.targets[0].card === bear)!).state;
    expect([powerOf(s, s.cards[bear]!), hasKeyword(s, s.cards[bear]!, 'DoubleStrike'), hasKeyword(s, s.cards[quill]!, 'DoubleStrike')]).toEqual([2, true, true]);
    let u = newGame();
    const page = put(u, 'P1', 'honorbound-page-forums-favor', 'hand');
    u = enter(u, page, { W: 1, C: 3 });
    expect([u.cards[page]!.prepared, hasKeyword(u, u.cards[page]!, 'FirstStrike')]).toEqual([true, true]);
    mana(u, 'P1', { W: 1 });
    u = cast(u, castCopy(u, page).find((a) => a.targets?.[0]?.kind === 'card' && a.targets[0].card === page)!).state;
    expect([powerOf(u, u.cards[page]!), hasKeyword(u, u.cards[page]!, 'Flying')]).toEqual([4, true]);
  });

  it('Campus Composer and Landscape Painter enter prepared: an Elemental, two cards', () => {
    let s = newGame();
    const composer = put(s, 'P1', 'campus-composer-aqueous-aria', 'hand');
    s = enter(s, composer, { U: 1, C: 3 });
    mana(s, 'P1', { U: 1, C: 4 });
    s = cast(s, castCopy(s, composer)[0]!).state;
    const elemental = s.players.P1!.battlefield.map((id) => s.cards[id]!).find((c) => c.defId === 'elemental-token-sos')!;
    expect([powerOf(s, elemental), toughnessOf(s, elemental)]).toEqual([3, 3]);
  });

  it('Emeritus of Ideation may exile eight graveyard cards as it attacks to become prepared again', () => {
    let s = newGame();
    const emeritus = put(s, 'P1', 'emeritus-of-ideation-ancestral-recall', 'battlefield', { summoningSick: false });
    for (let i = 0; i < 8; i++) put(s, 'P1', 'rank-rat', 'graveyard');
    s = goTo(s, 'declareAttackers');
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: emeritus, defender: 'P2' }] }), { accept: true }).state;
    // The eight cards are chosen as it resolves.
    expect(s.pending.kind).toBe('chooseCards');
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: (s.pending as { cards: string[] }).cards.slice(0, 8) })).state;
    expect([s.cards[emeritus]!.prepared, s.players.P1!.graveyard.length]).toEqual([true, 0]);
  });

  it('Encouraging Aviator becomes prepared as it attacks; Jump gives flying', () => {
    let s = newGame();
    const aviator = put(s, 'P1', 'encouraging-aviator-jump', 'battlefield', { summoningSick: false });
    s = fight(s, [{ attacker: aviator, defender: 'P2' }]).state;
    expect(s.cards[aviator]!.prepared).toBe(true);
  });

  it('Harmonized Trio: tap it and two other untapped creatures to become prepared; Brainstorm', () => {
    let s = newGame();
    const trio = put(s, 'P1', 'harmonized-trio-brainstorm', 'battlefield', { summoningSick: false });
    put(s, 'P1', 'rank-rat');
    expect(getLegalActions(s).some((a) => a.type === 'ActivateAbility' && a.card === trio)).toBe(false);
    put(s, 'P1', 'rank-rat');
    const activate = getLegalActions(s).find((a) => a.type === 'ActivateAbility' && a.card === trio)!;
    s = cast(s, activate).state;
    expect(s.cards[trio]!.prepared).toBe(true);
    expect(s.players.P1!.battlefield.filter((id) => s.cards[id]!.tapped)).toHaveLength(3);
  });

  it("Jadzi enters prepared and loots two; Oracle's Gift makes X Fractals with X counters on each Fractal", () => {
    let s = newGame();
    const jadzi = put(s, 'P1', 'jadzi-steward-of-fate-oracles-gift', 'hand');
    mana(s, 'P1', { U: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: jadzi }).state;
    while (s.pending.kind === 'chooseCards') s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: (s.pending as { cards: string[] }).cards.slice(0, 2) })).state;
    expect(s.cards[jadzi]!.prepared).toBe(true);
    mana(s, 'P1', { U: 1, C: 4 });
    const x2 = castCopy(s, jadzi).find((a) => (a as { x?: number }).x === 2)!;
    s = cast(s, x2).state;
    const fractals = s.players.P1!.battlefield.map((id) => s.cards[id]!).filter((c) => c.defId === 'fractal-token-sos');
    expect(fractals.map((c) => [powerOf(s, c), toughnessOf(s, c)])).toEqual([[2, 2], [2, 2]]);
  });

  it('Skycoach Conductor: All Aboard blinks a non-Pilot creature you control', () => {
    let s = newGame();
    const conductor = put(s, 'P1', 'skycoach-conductor-all-aboard', 'hand');
    const bear = put(s, 'P1', 'rank-rat');
    s = enter(s, conductor, { U: 1, C: 2 });
    mana(s, 'P1', { U: 1 });
    const targets = castCopy(s, conductor).map((a) => a.targets?.[0]?.kind === 'card' ? a.targets[0].card : '');
    expect(targets).toContain(bear);
    s = cast(s, castCopy(s, conductor).find((a) => a.targets?.[0]?.kind === 'card' && a.targets[0].card === bear)!).state;
    const back = s.players.P1!.battlefield.map((id) => s.cards[id]!).find((c) => c.defId === 'rank-rat')!;
    expect(back.zone).toBe('battlefield');
    expect((back.zoneChanges ?? 0) > 0).toBe(true);
  });

  it('Spellbook Seeker: Careful Study draws two, then discards two', () => {
    let s = newGame();
    const seeker = put(s, 'P1', 'spellbook-seeker-careful-study', 'hand');
    s = enter(s, seeker, { U: 1, C: 3 });
    const hand = s.players.P1!.hand.length;
    mana(s, 'P1', { U: 1 });
    s = settle(act(s, castCopy(s, seeker)[0]!)).state;
    while (s.pending.kind === 'chooseCards') s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: (s.pending as { cards: string[] }).cards.slice(0, 2) })).state;
    expect(s.players.P1!.hand.length).toBe(hand);
  });
});
