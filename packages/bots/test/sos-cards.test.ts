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

describe('SOS2b: black and red prepared creatures', () => {
  const copyOf = (s: GameState, creature: string) => Object.values(s.cards).find((c) => c.zone === 'exile' && c.prepareSpellOf?.card === creature);
  const castCopy = (s: GameState, creature: string) => getLegalActions(s).filter((a): a is Extract<typeof a, { type: 'CastSpell' }> => a.type === 'CastSpell' && a.card === copyOf(s, creature)?.id);
  const at = (a: { targets?: { kind: string; card?: string; player?: string }[] }, id: string) => a.targets?.[0]?.card === id || a.targets?.[0]?.player === id;
  const enter = (s: GameState, id: string, pool: Parameters<typeof mana>[2]) => {
    mana(s, 'P1', pool);
    return cast(s, { type: 'CastSpell', player: 'P1', card: id }).state;
  };

  it('Adventurous Eater, Cheerful Osteomancer: Have a Bite, Raise Dead', () => {
    let s = newGame();
    const eater = put(s, 'P1', 'adventurous-eater-have-a-bite', 'hand');
    s = enter(s, eater, { B: 1, C: 2 });
    mana(s, 'P1', { B: 1 });
    s = cast(s, castCopy(s, eater).find((a) => at(a, eater))!).state;
    expect([s.cards[eater]!.counters, s.players.P1!.life]).toEqual([1, 21]);
    const osteo = put(s, 'P1', 'cheerful-osteomancer-raise-dead', 'hand');
    const dead = put(s, 'P1', 'rank-rat', 'graveyard');
    s = enter(s, osteo, { B: 1, C: 3 });
    mana(s, 'P1', { B: 1 });
    s = cast(s, castCopy(s, osteo).find((a) => at(a, dead))!).state;
    expect(s.cards[dead]!.zone).toBe('hand');
  });

  it('Emeritus of Woe becomes prepared at your end step if two creatures died this turn', () => {
    let s = newGame();
    const woe = put(s, 'P1', 'emeritus-of-woe-demonic-tutor');
    s.creaturesDiedThisTurn = 2;
    s = settle(goTo(s, 'end')).state;
    expect(s.cards[woe]!.prepared).toBe(true);
    let u = newGame();
    const woe2 = put(u, 'P1', 'emeritus-of-woe-demonic-tutor');
    u.creaturesDiedThisTurn = 1;
    u = settle(goTo(u, 'end')).state;
    expect(u.cards[woe2]!.prepared).toBeUndefined();
  });

  it('Grave Researcher surveils at upkeep, then is prepared with three creature cards in your graveyard; Reanimate', () => {
    let s = newGame();
    const researcher = put(s, 'P1', 'grave-researcher-reanimate');
    for (let i = 0; i < 3; i++) put(s, 'P1', 'rank-rat', 'graveyard');
    s.turnNumber = 2;
    s.activePlayer = 'P2';
    s = settle(goTo(s, 'upkeep')).state;
    for (let i = 0; i < 3 && s.activePlayer !== 'P1'; i++) s = settle(goTo(s, 'upkeep')).state;
    expect(s.cards[researcher]!.prepared).toBe(true);
  });

  it('Leech Collector becomes prepared the first time you gain life each turn; Bloodletting', () => {
    let s = newGame();
    const leech = put(s, 'P1', 'leech-collector-bloodletting');
    const eater = put(s, 'P1', 'adventurous-eater-have-a-bite', 'hand');
    s = enter(s, eater, { B: 1, C: 2 });
    mana(s, 'P1', { B: 1 });
    s = cast(s, castCopy(s, eater).find((a) => at(a, eater))!).state;
    expect(s.cards[leech]!.prepared).toBe(true);
    mana(s, 'P1', { B: 1 });
    s = cast(s, castCopy(s, leech)[0]!).state;
    expect(s.players.P2!.life).toBe(18);
    // Gaining life again this turn doesn't prepare it again.
    const eater2 = put(s, 'P1', 'adventurous-eater-have-a-bite', 'hand');
    s = enter(s, eater2, { B: 1, C: 2 });
    mana(s, 'P1', { B: 1 });
    s = cast(s, castCopy(s, eater2).find((a) => at(a, eater2))!).state;
    expect([s.players.P1!.life, s.cards[leech]!.prepared]).toEqual([22, undefined]);
  });

  it('Scathing Shadelock becomes prepared in your first main phase; Venomous Words', () => {
    let s = newGame();
    const shade = put(s, 'P1', 'scathing-shadelock-venomous-words');
    // Its controller's next turn: first the opponent's (no trigger), then P1's.
    s = settle(goTo(s, 'end')).state;
    s = settle(goTo(s, 'main1')).state;
    expect([s.activePlayer, s.cards[shade]!.prepared]).toEqual(['P2', undefined]);
    s = settle(goTo(s, 'end')).state;
    s = settle(goTo(s, 'main1')).state;
    expect([s.activePlayer, s.cards[shade]!.prepared]).toEqual(['P1', true]);
    // Venomous Words: +2/+0 and deathtouch for a creature you control.
    mana(s, 'P1', { B: 1 });
    s = cast(s, castCopy(s, shade).find((a) => at(a, shade))!).state;
    expect([powerOf(s, s.cards[shade]!), hasKeyword(s, s.cards[shade]!, 'Deathtouch')]).toEqual([6, true]);
  });

  it('Scheming Silvertongue: ward-free flier; prepared in your second main phase after gaining 2 life; Sign in Blood', () => {
    let s = newGame();
    const tongue = put(s, 'P1', 'scheming-silvertongue-sign-in-blood');
    s.players.P1!.lifeGainedThisTurn = 2;
    s = settle(goTo(s, 'main2')).state;
    expect(s.cards[tongue]!.prepared).toBe(true);
    mana(s, 'P1', { B: 2 });
    const hand = s.players.P2!.hand.length;
    s = cast(s, castCopy(s, tongue).find((a) => at(a, 'P2'))!).state;
    expect([s.players.P2!.hand.length, s.players.P2!.life]).toEqual([hand + 2, 18]);
  });

  it('Blazing Firesinger: Seething Song adds five red', () => {
    let s = newGame();
    const singer = put(s, 'P1', 'blazing-firesinger-seething-song', 'hand');
    s = enter(s, singer, { R: 1, C: 2 });
    mana(s, 'P1', { R: 1, C: 2 });
    s = settle(act(s, castCopy(s, singer)[0]!)).state;
    expect(s.players.P1!.manaPool.R).toBe(5);
  });

  it('Emeritus of Conflict becomes prepared on your third spell each turn; Lightning Bolt', () => {
    let s = newGame();
    const conflict = put(s, 'P1', 'emeritus-of-conflict-lightning-bolt');
    for (let i = 0; i < 3; i++) {
      expect(s.cards[conflict]!.prepared).toBeUndefined();
      const bolt = put(s, 'P1', 'lightning-bolt', 'hand');
      mana(s, 'P1', { R: 1 });
      s = cast(s, { type: 'CastSpell', player: 'P1', card: bolt, targets: [{ kind: 'player', player: 'P2' }] }).state;
    }
    expect(s.cards[conflict]!.prepared).toBe(true);
  });

  it('Goblin Glasswright, Maelstrom Artisan: a Treasure; destroy a nonbasic land', () => {
    let s = newGame();
    const goblin = put(s, 'P1', 'goblin-glasswright-craft-with-pride', 'hand');
    s = enter(s, goblin, { R: 1, C: 1 });
    mana(s, 'P1', { R: 1 });
    s = cast(s, castCopy(s, goblin)[0]!).state;
    expect(s.players.P1!.battlefield.some((id) => s.cards[id]!.defId === 'treasure-token-sos')).toBe(true);
    const artisan = put(s, 'P1', 'maelstrom-artisan-rocket-volley', 'hand');
    const basic = put(s, 'P2', 'island');
    const fen = put(s, 'P2', 'turbulent-fen');
    s = enter(s, artisan, { R: 2, C: 1 });
    mana(s, 'P1', { R: 1, C: 1 });
    expect(castCopy(s, artisan).some((a) => at(a, basic))).toBe(false);
    s = cast(s, castCopy(s, artisan).find((a) => at(a, fen))!).state;
    expect(s.cards[fen]!.zone).toBe('graveyard');
  });

  it('Pigment Wrangler: Striking Palette copies your next instant or sorcery this turn', () => {
    let s = newGame();
    const wrangler = put(s, 'P1', 'pigment-wrangler-striking-palette', 'hand');
    s = enter(s, wrangler, { R: 1, C: 4 });
    mana(s, 'P1', { R: 1 });
    s = cast(s, castCopy(s, wrangler)[0]!).state;
    const bolt = put(s, 'P1', 'lightning-bolt', 'hand');
    mana(s, 'P1', { R: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: bolt, targets: [{ kind: 'player', player: 'P2' }] }).state;
    expect(s.players.P2!.life).toBe(14);
  });

  it('Strife Scholar: ward—pay 2 life; Awaken the Ages makes two 2/2 Spirits', () => {
    let s = newGame();
    const scholar = put(s, 'P1', 'strife-scholar-awaken-the-ages', 'hand');
    s = enter(s, scholar, { R: 1, C: 2 });
    mana(s, 'P1', { R: 1, C: 5 });
    s = cast(s, castCopy(s, scholar)[0]!).state;
    expect(s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'spirit-token-sos')).toHaveLength(2);
    // An opponent's Lightning Bolt at it costs 2 life more.
    const bolt = put(s, 'P2', 'lightning-bolt', 'hand');
    s.players.P2!.manaPool.R = 1;
    s.pending = { kind: 'priority', player: 'P2', passes: 0 } as never;
    s = act(s, { type: 'CastSpell', player: 'P2', card: bolt, targets: [{ kind: 'card', card: scholar }] });
    expect(s.players.P2!.life).toBe(18);
  });
});

describe('SOS2c: green, multicolor and colorless prepared cards', () => {
  const copyOf = (s: GameState, creature: string) => Object.values(s.cards).find((c) => c.zone === 'exile' && c.prepareSpellOf?.card === creature);
  const castCopy = (s: GameState, creature: string) => getLegalActions(s).filter((a): a is Extract<typeof a, { type: 'CastSpell' }> => a.type === 'CastSpell' && a.card === copyOf(s, creature)?.id);
  const at = (a: { targets?: { kind: string; card?: string; player?: string }[] }, id: string) => a.targets?.[0]?.card === id || a.targets?.[0]?.player === id;
  const enter = (s: GameState, id: string, pool: Parameters<typeof mana>[2]) => {
    mana(s, 'P1', pool);
    return cast(s, { type: 'CastSpell', player: 'P1', card: id }).state;
  };

  it('Emeritus of Abundance: prepared again as it attacks with eight lands; Regrowth', () => {
    let s = newGame();
    const emeritus = put(s, 'P1', 'emeritus-of-abundance-regrowth', 'battlefield', { summoningSick: false });
    for (let i = 0; i < 8; i++) put(s, 'P1', 'forest');
    s = fight(s, [{ attacker: emeritus, defender: 'P2' }]).state;
    expect(s.cards[emeritus]!.prepared).toBe(true);
    let u = newGame();
    const e2 = put(u, 'P1', 'emeritus-of-abundance-regrowth', 'battlefield', { summoningSick: false });
    for (let i = 0; i < 7; i++) put(u, 'P1', 'forest');
    u = fight(u, [{ attacker: e2, defender: 'P2' }]).state;
    expect(u.cards[e2]!.prepared).toBeUndefined();
    const gone = put(s, 'P1', 'island', 'graveyard');
    s = settle(goTo(s, 'main2')).state;
    mana(s, 'P1', { G: 1, C: 1 });
    s = cast(s, castCopy(s, emeritus).find((a) => at(a, gone))!).state;
    expect(s.cards[gone]!.zone).toBe('hand');
  });

  it('Infirmary Healer: Stream of Life gains X life', () => {
    let s = newGame();
    const healer = put(s, 'P1', 'infirmary-healer-stream-of-life', 'hand');
    s = enter(s, healer, { G: 1, C: 1 });
    mana(s, 'P1', { G: 1, C: 4 });
    s = cast(s, castCopy(s, healer).find((a) => at(a, 'P1') && (a as { x?: number }).x === 4)!).state;
    expect(s.players.P1!.life).toBe(24);
  });

  it('Studious First-Year: Rampant Growth puts a basic land onto the battlefield tapped', () => {
    let s = newGame();
    const bear = put(s, 'P1', 'studious-first-year-rampant-growth', 'hand');
    const forest = put(s, 'P1', 'forest', 'library');
    s = enter(s, bear, { G: 1 });
    mana(s, 'P1', { G: 1, C: 1 });
    s = cast(s, castCopy(s, bear)[0]!).state;
    const land = s.players.P1!.battlefield.map((id) => s.cards[id]!).find((c) => c.defId === 'forest')!;
    expect([land.tapped, forest !== undefined]).toEqual([true, true]);
  });

  it('Vastlands Scavenger: Bind to Life mills seven and puts a creature card from among them onto the battlefield', () => {
    let s = newGame();
    const scav = put(s, 'P1', 'vastlands-scavenger-bind-to-life', 'hand');
    const older = put(s, 'P1', 'rank-rat', 'graveyard');
    s.players.P1!.library = [];
    for (let i = 0; i < 6; i++) put(s, 'P1', 'island', 'library');
    const rat = put(s, 'P1', 'rank-rat', 'library');
    s = enter(s, scav, { G: 2, C: 1 });
    mana(s, 'P1', { G: 1, C: 4 });
    s = settle(act(s, castCopy(s, scav)[0]!)).state;
    // Only the milled creature card, not the one already there.
    expect(s.pending.kind).toBe('chooseCards');
    expect((s.pending as { cards: string[] }).cards).toEqual([rat]);
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [rat] })).state;
    expect([s.cards[rat]!.zone, s.cards[older]!.zone]).toEqual(['battlefield', 'graveyard']);
  });

  it('Abigale becomes prepared when you cast a creature spell; Heroic Stanza', () => {
    let s = newGame();
    const abigale = put(s, 'P1', 'abigale-poet-laureate-heroic-stanza');
    const rat = put(s, 'P1', 'rank-rat', 'hand');
    s = enter(s, rat, { B: 1, C: 1 });
    expect(s.cards[abigale]!.prepared).toBe(true);
    mana(s, 'P1', { W: 1, C: 1 });
    s = cast(s, castCopy(s, abigale).find((a) => at(a, abigale))!).state;
    expect(s.cards[abigale]!.counters).toBe(1);
  });

  it('Kirol becomes prepared when cards leave your graveyard; Pack a Punch', () => {
    let s = newGame();
    const kirol = put(s, 'P1', 'kirol-history-buff-pack-a-punch');
    const osteo = put(s, 'P1', 'cheerful-osteomancer-raise-dead', 'hand');
    const dead = put(s, 'P1', 'rank-rat', 'graveyard');
    s = enter(s, osteo, { B: 1, C: 3 });
    mana(s, 'P1', { B: 1 });
    s = cast(s, castCopy(s, osteo).find((a) => at(a, dead))!).state;
    expect(s.cards[kirol]!.prepared).toBe(true);
    mana(s, 'P1', { R: 1, W: 1, C: 1 });
    s = cast(s, castCopy(s, kirol).find((a) => at(a, kirol))!).state;
    expect([s.cards[kirol]!.counters, hasKeyword(s, s.cards[kirol]!, 'Trample'), s.players.P1!.graveyard.length]).toEqual([2, true, 1]);
  });

  it('Lluwen: exile a creature card from your graveyard to become prepared; Pest Friend', () => {
    let s = newGame();
    const lluwen = put(s, 'P1', 'lluwen-exchange-student-pest-friend', 'hand');
    s = enter(s, lluwen, { B: 1, G: 1, C: 2 });
    mana(s, 'P1', { B: 1 });
    s = cast(s, castCopy(s, lluwen)[0]!).state;
    expect(s.players.P1!.battlefield.some((id) => s.cards[id]!.defId === 'pest-token-sos')).toBe(true);
    expect(getLegalActions(s).some((a) => a.type === 'ActivateAbility' && a.card === lluwen)).toBe(false);
    const dead = put(s, 'P1', 'rank-rat', 'graveyard');
    s = cast(s, getLegalActions(s).find((a) => a.type === 'ActivateAbility' && a.card === lluwen)!).state;
    expect([s.cards[lluwen]!.prepared, s.cards[dead]!.zone]).toEqual([true, 'exile']);
  });

  it('Sanar: a Treasure only after an instant or sorcery this turn; Wild Idea finds one', () => {
    let s = newGame();
    const sanar = put(s, 'P1', 'sanar-unfinished-genius-wild-idea', 'battlefield', { summoningSick: false });
    expect(getLegalActions(s).some((a) => a.type === 'ActivateAbility' && a.card === sanar)).toBe(false);
    const bolt = put(s, 'P1', 'lightning-bolt', 'hand');
    mana(s, 'P1', { R: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: bolt, targets: [{ kind: 'player', player: 'P2' }] }).state;
    s = cast(s, getLegalActions(s).find((a) => a.type === 'ActivateAbility' && a.card === sanar)!).state;
    expect(s.players.P1!.battlefield.some((id) => s.cards[id]!.defId === 'treasure-token-sos')).toBe(true);
  });

  it('Tam becomes prepared on landfall; Deep Sight', () => {
    let s = newGame();
    const tam = put(s, 'P1', 'tam-observant-sequencer-deep-sight');
    const land = put(s, 'P1', 'forest', 'hand');
    s = settle(act(s, { type: 'PlayLand', player: 'P1', card: land })).state;
    expect(s.cards[tam]!.prepared).toBe(true);
    mana(s, 'P1', { G: 1, U: 1 });
    const hand = s.players.P1!.hand.length;
    s = cast(s, castCopy(s, tam)[0]!).state;
    expect([s.players.P1!.hand.length, s.players.P1!.life]).toEqual([hand + 1, 21]);
  });

  it('Biblioplex Tomekeeper prepares or unprepares up to one creature as it enters', () => {
    let s = newGame();
    const tam = put(s, 'P1', 'tam-observant-sequencer-deep-sight');
    const keeper = put(s, 'P1', 'biblioplex-tomekeeper', 'hand');
    mana(s, 'P1', { C: 4 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: keeper });
    s = settle(s).state;
    if (s.pending.kind === 'chooseModes') s = settle(act(s, { type: 'ChooseModes', player: 'P1', modes: [0] }), { targets: (o) => o.find((t) => t[0]?.kind === 'card' && t[0].card === tam)! }).state;
    expect(s.cards[tam]!.prepared).toBe(true);
  });
});

describe('SOS3a: Opus', () => {
  /** Casts a cheap instant (1 mana) or a big sorcery (6 mana) for P1. */
  const small = (s: GameState) => {
    const bolt = put(s, 'P1', 'lightning-bolt', 'hand');
    mana(s, 'P1', { R: 1 });
    return cast(s, { type: 'CastSpell', player: 'P1', card: bolt, targets: [{ kind: 'player', player: 'P2' }] }, { targets: (o) => o.find((t) => t[0]?.kind === 'player' && t[0].player === 'P2') ?? o[0]! }).state;
  };
  const big = (s: GameState) => {
    const blessing = put(s, 'P1', 'lifestreams-blessing', 'hand');
    mana(s, 'P1', { G: 2, C: 4 });
    return cast(s, { type: 'CastSpell', player: 'P1', card: blessing }, { targets: (o) => o.find((t) => t[0]?.kind === 'player' && t[0].player === 'P2') ?? o[0]! }).state;
  };
  const pt = (s: GameState, id: string) => [powerOf(s, s.cards[id]!), toughnessOf(s, s.cards[id]!)];

  it('Deluge Virtuoso taps and stuns an opponent’s creature as it enters; +1/+1, or +2/+2 with five mana spent', () => {
    let s = newGame();
    const rat = put(s, 'P2', 'rank-rat');
    const virtuoso = put(s, 'P1', 'deluge-virtuoso', 'hand');
    mana(s, 'P1', { U: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: virtuoso }).state;
    expect([s.cards[rat]!.tapped, s.cards[rat]!.namedCounters?.stun]).toEqual([true, 1]);
    s = small(s);
    expect(pt(s, virtuoso)).toEqual([3, 3]);
    s = big(s);
    expect(pt(s, virtuoso)).toEqual([5, 5]);
  });

  it('Exhibition Tidecaller: target player mills three, or ten', () => {
    let s = newGame();
    put(s, 'P1', 'exhibition-tidecaller');
    const before = s.players.P2!.library.length;
    s = small(s);
    expect(s.players.P2!.library.length).toBe(before - 3);
    s = big(s);
    expect(s.players.P2!.library.length).toBe(before - 13);
  });

  it('Muse Seeker draws, then discards unless five mana was spent', () => {
    let s = newGame();
    put(s, 'P1', 'muse-seeker');
    const hand = s.players.P1!.hand.length;
    s = small(s);
    while (s.pending.kind === 'chooseCards') s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: (s.pending as { cards: string[] }).cards.slice(0, 1) })).state;
    expect(s.players.P1!.hand.length).toBe(hand);
    s = big(s);
    expect(s.players.P1!.hand.length).toBeGreaterThan(hand);
  });

  it('Expressive Firedancer gets +1/+1, and double strike with five mana spent', () => {
    let s = newGame();
    const dancer = put(s, 'P1', 'expressive-firedancer');
    s = small(s);
    expect([...pt(s, dancer), hasKeyword(s, s.cards[dancer]!, 'DoubleStrike')]).toEqual([3, 3, false]);
    s = big(s);
    expect([...pt(s, dancer), hasKeyword(s, s.cards[dancer]!, 'DoubleStrike')]).toEqual([4, 4, true]);
  });

  it('Molten-Core Maestro gets a counter; with five mana spent, red mana equal to its power', () => {
    let s = newGame();
    const maestro = put(s, 'P1', 'molten-core-maestro');
    s = small(s);
    expect([s.cards[maestro]!.counters, s.players.P1!.manaPool.R]).toEqual([1, 0]);
    s = big(s);
    expect([s.cards[maestro]!.counters, s.players.P1!.manaPool.R]).toEqual([2, 4]);
  });

  it('Tackle Artist, Spectacular Skywhale: one or two counters; +3/+0 or three counters', () => {
    let s = newGame();
    const artist = put(s, 'P1', 'tackle-artist');
    const whale = put(s, 'P1', 'spectacular-skywhale');
    s = small(s);
    expect([s.cards[artist]!.counters, ...pt(s, whale)]).toEqual([1, 4, 4]);
    s = big(s);
    expect([s.cards[artist]!.counters, s.cards[whale]!.counters]).toEqual([3, 3]);
  });

  it('Thunderdrum Soloist deals 1, or 3, to each opponent', () => {
    let s = newGame();
    put(s, 'P1', 'thunderdrum-soloist');
    s = small(s);
    expect(s.players.P2!.life).toBe(16);
    s = big(s);
    expect(s.players.P2!.life).toBe(13);
  });

  it('Colorstorm Stallion makes a token copy of itself with five mana spent', () => {
    let s = newGame();
    const horse = put(s, 'P1', 'colorstorm-stallion');
    s = big(s);
    const copies = s.players.P1!.battlefield.filter((id) => id !== horse && s.cards[id]!.defId === 'colorstorm-stallion');
    expect(copies).toHaveLength(1);
    expect(s.cards[copies[0]!]!.isToken).toBe(true);
  });

  it('Elemental Mascot exiles the top card to play with five mana spent', () => {
    let s = newGame();
    const mascot = put(s, 'P1', 'elemental-mascot');
    const top = s.players.P1!.library[0]!;
    s = small(s);
    expect([powerOf(s, s.cards[mascot]!), s.cards[top]!.zone]).toEqual([2, 'library']);
    s = big(s);
    expect(s.cards[top]!.zone).toBe('exile');
  });
});

describe('SOS3b: Increment', () => {
  const bolt = (s: GameState) => {
    const b = put(s, 'P1', 'lightning-bolt', 'hand');
    mana(s, 'P1', { R: 1 });
    return cast(s, { type: 'CastSpell', player: 'P1', card: b, targets: [{ kind: 'player', player: 'P2' }] }).state;
  };
  const big = (s: GameState) => {
    const blessing = put(s, 'P1', 'lifestreams-blessing', 'hand');
    mana(s, 'P1', { G: 2, C: 4 });
    return cast(s, { type: 'CastSpell', player: 'P1', card: blessing }, { targets: (o) => o[0]! }).state;
  };

  it('Increment: a counter when the mana spent is greater than its power or toughness', () => {
    let s = newGame();
    const graffalon = put(s, 'P1', 'hungry-graffalon'); // 3/4
    s = bolt(s);
    expect(s.cards[graffalon]!.counters ?? 0).toBe(0);
    s = big(s);
    expect(s.cards[graffalon]!.counters).toBe(1);
    // A 1/1 grows from a one-mana spell? No: 1 is not greater than 1.
    const colony = put(s, 'P1', 'cuboid-colony');
    s = bolt(s);
    expect(s.cards[colony]!.counters ?? 0).toBe(0);
    // Two mana is greater than 1.
    const healer = put(s, 'P1', 'infirmary-healer-stream-of-life', 'hand');
    mana(s, 'P1', { G: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: healer }).state;
    expect(s.cards[colony]!.counters).toBe(1);
  });

  it('Pensive Professor draws when it gets +1/+1 counters; Textbook Tabulator surveils 2', () => {
    let s = newGame();
    const prof = put(s, 'P1', 'pensive-professor'); // 0/2
    const hand = s.players.P1!.hand.length;
    s = bolt(s);
    expect([s.cards[prof]!.counters, s.players.P1!.hand.length]).toEqual([1, hand + 1]);
    const tab = put(s, 'P1', 'textbook-tabulator', 'hand');
    mana(s, 'P1', { U: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: tab }, { surveilToGraveyard: true }).state;
    expect(s.players.P1!.graveyard.length).toBeGreaterThanOrEqual(2);
  });

  it('Ambitious Augmenter: when it dies with counters, a Fractal gets them', () => {
    let s = newGame();
    const aug = put(s, 'P1', 'ambitious-augmenter', 'battlefield', { counters: 2 });
    const kill = put(s, 'P2', 'lightning-bolt', 'hand');
    s.players.P2!.manaPool.R = 1;
    s.pending = { kind: 'priority', player: 'P2', passes: 0 } as never;
    s = settle(act(s, { type: 'CastSpell', player: 'P2', card: kill, targets: [{ kind: 'card', card: aug }] })).state;
    expect(s.cards[aug]!.zone).toBe('graveyard');
    const fractal = s.players.P1!.battlefield.map((id) => s.cards[id]!).find((c) => c.defId === 'fractal-token-sos')!;
    expect([powerOf(s, fractal), toughnessOf(s, fractal)]).toEqual([2, 2]);
    // Without counters: no Fractal.
    let u = newGame();
    const a2 = put(u, 'P1', 'ambitious-augmenter');
    const k2 = put(u, 'P2', 'lightning-bolt', 'hand');
    u.players.P2!.manaPool.R = 1;
    u.pending = { kind: 'priority', player: 'P2', passes: 0 } as never;
    u = settle(act(u, { type: 'CastSpell', player: 'P2', card: k2, targets: [{ kind: 'card', card: a2 }] })).state;
    expect(u.players.P1!.battlefield.some((id) => u.cards[id]!.defId === 'fractal-token-sos')).toBe(false);
  });

  it('Topiary Lecturer taps for {G} equal to its power', () => {
    const s = newGame();
    const lecturer = put(s, 'P1', 'topiary-lecturer', 'battlefield', { counters: 2, summoningSick: false });
    const t = act(s, { type: 'ActivateManaAbility', player: 'P1', card: lecturer, mana: 'G' });
    expect(t.players.P1!.manaPool.G).toBe(3);
  });

  it('Berta adds a mana when it gets counters, and makes a Fractal with X counters', () => {
    let s = newGame();
    const berta = put(s, 'P1', 'berta-wise-extrapolator', 'battlefield', { summoningSick: false }); // 1/4
    s = big(s);
    expect(s.cards[berta]!.counters).toBe(1);
    while (s.pending.kind === 'chooseMana') s = settle(act(s, { type: 'ChooseMana', player: 'P1', mana: 'G' })).state;
    expect(s.players.P1!.manaPool.G).toBeGreaterThanOrEqual(1);
    mana(s, 'P1', { C: 3 });
    const x3 = getLegalActions(s).find((a) => a.type === 'ActivateAbility' && a.card === berta && (a as { x?: number }).x === 3)!;
    s = cast(s, x3).state;
    const fractal = s.players.P1!.battlefield.map((id) => s.cards[id]!).find((c) => c.defId === 'fractal-token-sos')!;
    expect(fractal.counters).toBe(3);
  });

  it('Fractal Tender makes a 3/3 Fractal at an end step if it got a counter this turn', () => {
    let s = newGame();
    const tender = put(s, 'P1', 'fractal-tender'); // 3/3
    s = big(s);
    expect(s.cards[tender]!.counters).toBe(1);
    s = settle(goTo(s, 'end')).state;
    const fractal = s.players.P1!.battlefield.map((id) => s.cards[id]!).find((c) => c.defId === 'fractal-token-sos')!;
    expect(fractal.counters).toBe(3);
  });
});

describe('SOS4a: Repartee', () => {
  /** P1 casts Lightning Bolt at a creature (or at P2 when `at` is omitted). */
  const boltAt = (s: GameState, at?: string, opts: Parameters<typeof cast>[2] = {}) => {
    const b = put(s, 'P1', 'lightning-bolt', 'hand');
    mana(s, 'P1', { R: 1 });
    return cast(s, { type: 'CastSpell', player: 'P1', card: b, targets: [at ? { kind: 'card', card: at } : { kind: 'player', player: 'P2' }] }, opts).state;
  };

  it('triggers only on an instant or sorcery that targets a creature', () => {
    let s = newGame();
    const scorn = put(s, 'P1', 'lecturing-scornmage');
    s = boltAt(s);
    expect(s.cards[scorn]!.counters ?? 0).toBe(0);
    const rat = put(s, 'P2', 'rank-rat');
    s = boltAt(s, rat);
    expect(s.cards[scorn]!.counters).toBe(1);
  });

  it('Graduation Day, Stirring Hopesinger: counters on your creatures', () => {
    let s = newGame();
    put(s, 'P1', 'graduation-day');
    const singer = put(s, 'P1', 'stirring-hopesinger');
    const mine = put(s, 'P1', 'rank-rat');
    const theirs = put(s, 'P2', 'rank-rat');
    s = boltAt(s, theirs, { targets: (o) => o.find((t) => t[0]?.kind === 'card' && t[0].card === mine) ?? o[0]! });
    expect([s.cards[singer]!.counters, s.cards[mine]!.counters]).toEqual([1, 2]);
  });

  it('Informed Inkwright makes an Inkling; Rehearsed Debater and Inkshape Demonstrator pump', () => {
    let s = newGame();
    put(s, 'P1', 'informed-inkwright');
    const debater = put(s, 'P1', 'rehearsed-debater');
    const demo = put(s, 'P1', 'inkshape-demonstrator');
    s = boltAt(s, put(s, 'P2', 'rank-rat'));
    expect(s.players.P1!.battlefield.some((id) => s.cards[id]!.defId === 'inkling-token-sos')).toBe(true);
    expect([powerOf(s, s.cards[debater]!), powerOf(s, s.cards[demo]!), hasKeyword(s, s.cards[demo]!, 'Lifelink')]).toEqual([4, 4, true]);
  });

  it('Forum Necroscribe returns a creature card from your graveyard; ward—discard a card', () => {
    let s = newGame();
    const scribe = put(s, 'P1', 'forum-necroscribe');
    const dead = put(s, 'P1', 'rank-rat', 'graveyard');
    s = boltAt(s, put(s, 'P2', 'rank-rat'), { targets: (o) => o.find((t) => t[0]?.kind === 'card' && t[0].card === dead) ?? o[0]! });
    expect(s.cards[dead]!.zone).toBe('battlefield');
    expect(s.cards[scribe]!.zone).toBe('battlefield');
  });

  it("Melancholic Poet drains 1; Inkling Mascot flies and surveils", () => {
    let s = newGame();
    put(s, 'P1', 'melancholic-poet');
    const mascot = put(s, 'P1', 'inkling-mascot');
    s = boltAt(s, put(s, 'P2', 'rank-rat'));
    expect([s.players.P2!.life, s.players.P1!.life, hasKeyword(s, s.cards[mascot]!, 'Flying')]).toEqual([19, 21, true]);
  });

  it("Conciliator's Duelist: draw and everyone loses 1; exile a creature until the next end step", () => {
    let s = newGame();
    const duelist = put(s, 'P1', 'conciliators-duelist', 'hand');
    mana(s, 'P1', { W: 2, B: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: duelist }).state;
    expect([s.players.P1!.life, s.players.P2!.life]).toEqual([19, 19]);
    const big = put(s, 'P2', 'hungry-graffalon');
    const rat = put(s, 'P2', 'rank-rat');
    s = boltAt(s, rat, { targets: (o) => o.find((t) => t[0]?.kind === 'card' && t[0].card === big) ?? o[0]! });
    expect(s.cards[big]!.zone).toBe('exile');
    s = settle(goTo(s, 'end')).state;
    expect([s.cards[big]!.zone, s.cards[big]!.controller]).toEqual(['battlefield', 'P2']);
  });

  it('Scolding Administrator grows, and moves its counters when it dies', () => {
    let s = newGame();
    const admin = put(s, 'P1', 'scolding-administrator');
    const friend = put(s, 'P1', 'hungry-graffalon');
    s = boltAt(s, put(s, 'P2', 'rank-rat'));
    expect(s.cards[admin]!.counters).toBe(1);
    // An opponent's Bolt (P1's own would trigger Repartee and grow it to 4/4 first).
    const kill = put(s, 'P2', 'lightning-bolt', 'hand');
    s.players.P2!.manaPool.R = 1;
    s.pending = { kind: 'priority', player: 'P2', passes: 0 } as never;
    s = settle(act(s, { type: 'CastSpell', player: 'P2', card: kill, targets: [{ kind: 'card', card: admin }] }), { targets: (o) => o.find((t) => t[0]?.kind === 'card' && t[0].card === friend) ?? o[0]! }).state;
    expect([s.cards[admin]!.zone, s.cards[friend]!.counters]).toEqual(['graveyard', 1]);
  });

  it("Snooping Page can't be blocked this turn, and draws when it hits a player", () => {
    let s = newGame();
    const page = put(s, 'P1', 'snooping-page', 'battlefield', { summoningSick: false });
    const blocker = put(s, 'P2', 'hungry-graffalon');
    s = boltAt(s, put(s, 'P2', 'rank-rat'));
    const hand = s.players.P1!.hand.length;
    expect(() => fight(s, [{ attacker: page, defender: 'P2' }], { P2: [{ blocker, attacker: page }] })).toThrow(/can't block/);
    s = fight(s, [{ attacker: page, defender: 'P2' }]).state;
    expect([s.players.P2!.life, s.players.P1!.hand.length, s.players.P1!.life]).toEqual([18, hand + 1, 19]);
  });
});

describe('SOS4b: Infusion', () => {
  const gained = (s: GameState, n = 1) => { s.players.P1!.lifeGainedThisTurn = n; };

  it('Foolish Fate destroys a creature; with life gained, its controller loses 3', () => {
    let s = newGame();
    const rat = put(s, 'P2', 'rank-rat');
    let fate = put(s, 'P1', 'foolish-fate', 'hand');
    mana(s, 'P1', { B: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: fate, targets: [{ kind: 'card', card: rat }] }).state;
    expect([s.cards[rat]!.zone, s.players.P2!.life]).toEqual(['graveyard', 20]);
    const rat2 = put(s, 'P2', 'rank-rat');
    fate = put(s, 'P1', 'foolish-fate', 'hand');
    gained(s);
    mana(s, 'P1', { B: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: fate, targets: [{ kind: 'card', card: rat2 }] }).state;
    expect(s.players.P2!.life).toBe(17);
  });

  it('Moseo makes a Pest, and returns a creature card with mana value up to the life you gained', () => {
    let s = newGame();
    const moseo = put(s, 'P1', 'moseo-veins-new-dean', 'hand');
    const cheap = put(s, 'P1', 'rank-rat', 'graveyard');
    const pricey = put(s, 'P1', 'hungry-graffalon', 'graveyard');
    mana(s, 'P1', { B: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: moseo }).state;
    expect(s.players.P1!.battlefield.some((id) => s.cards[id]!.defId === 'pest-token-sos')).toBe(true);
    gained(s, 2);
    s = goTo(s, 'end');
    expect(getLegalActions(s).some((a) => a.type === 'ChooseTargets' && a.targets.some((t) => t.kind === 'card' && t.card === pricey))).toBe(false);
    s = settle(s, { targets: (o) => o.find((t) => t[0]?.kind === 'card' && t[0].card === cheap)! }).state;
    expect(s.cards[cheap]!.zone).toBe('battlefield');
  });

  it("Poisoner's Apprentice gives -4/-4 only if you gained life", () => {
    let s = newGame();
    const big = put(s, 'P2', 'hungry-graffalon');
    const app = put(s, 'P1', 'poisoners-apprentice', 'hand');
    gained(s);
    mana(s, 'P1', { B: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: app }).state;
    expect(s.cards[big]!.zone).toBe('graveyard');
  });

  it('Tragedy Feaster: sacrifice a permanent at your end step unless you gained life', () => {
    let s = newGame();
    put(s, 'P1', 'tragedy-feaster');
    put(s, 'P1', 'forest');
    const before = s.players.P1!.battlefield.length;
    s = goTo(s, 'end');
    s = settle(s).state;
    while (s.pending.kind === 'chooseCards') s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: (s.pending as { cards: string[] }).cards.slice(0, 1) })).state;
    expect(s.players.P1!.battlefield.length).toBe(before - 1);
    let u = newGame();
    put(u, 'P1', 'tragedy-feaster');
    const n = u.players.P1!.battlefield.length;
    gained(u);
    u = settle(goTo(u, 'end')).state;
    expect(u.players.P1!.battlefield.length).toBe(n);
  });

  it('Ulna Alley Shopkeep, Tenured Concocter, Thornfist Striker: bigger while you have gained life this turn', () => {
    const s = newGame();
    const ulna = put(s, 'P1', 'ulna-alley-shopkeep');
    const tenured = put(s, 'P1', 'tenured-concocter');
    put(s, 'P1', 'thornfist-striker');
    const rat = put(s, 'P1', 'rank-rat');
    expect([powerOf(s, s.cards[ulna]!), powerOf(s, s.cards[tenured]!), powerOf(s, s.cards[rat]!), hasKeyword(s, s.cards[rat]!, 'Trample')]).toEqual([2, 4, 1, false]);
    gained(s);
    expect([powerOf(s, s.cards[ulna]!), powerOf(s, s.cards[tenured]!), powerOf(s, s.cards[rat]!), hasKeyword(s, s.cards[rat]!, 'Trample')]).toEqual([5, 7, 2, true]);
  });

  it('Withering Curse: -2/-2, or destroy all creatures with life gained', () => {
    let s = newGame();
    const big = put(s, 'P2', 'hungry-graffalon');
    let curse = put(s, 'P1', 'withering-curse', 'hand');
    mana(s, 'P1', { B: 2, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: curse }).state;
    expect([s.cards[big]!.zone, powerOf(s, s.cards[big]!)]).toEqual(['battlefield', 1]);
    curse = put(s, 'P1', 'withering-curse', 'hand');
    gained(s);
    mana(s, 'P1', { B: 2, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: curse }).state;
    expect(s.cards[big]!.zone).toBe('graveyard');
  });

  it('Efflorescence: two counters, and trample and indestructible with life gained; Old-Growth Educator', () => {
    let s = newGame();
    const rat = put(s, 'P1', 'rank-rat');
    const eff = put(s, 'P1', 'efflorescence', 'hand');
    gained(s);
    mana(s, 'P1', { G: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: eff, targets: [{ kind: 'card', card: rat }] }).state;
    expect([s.cards[rat]!.counters, hasKeyword(s, s.cards[rat]!, 'Trample'), hasKeyword(s, s.cards[rat]!, 'Indestructible')]).toEqual([2, true, true]);
    const tree = put(s, 'P1', 'old-growth-educator', 'hand');
    mana(s, 'P1', { B: 1, G: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: tree }).state;
    expect(s.cards[tree]!.counters).toBe(2);
  });

  it('Follow the Lumarets takes one creature or land card, or two with life gained', () => {
    let s = newGame();
    s.players.P1!.library = [];
    for (let i = 0; i < 4; i++) put(s, 'P1', 'forest', 'library');
    const follow = put(s, 'P1', 'follow-the-lumarets', 'hand');
    gained(s);
    mana(s, 'P1', { G: 1, C: 1 });
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: follow })).state;
    expect(s.pending.kind).toBe('chooseCards');
    expect((s.pending as { max: number }).max).toBe(2);
  });

  it("Lumaret's Favor copies itself if you gained life", () => {
    let s = newGame();
    const rat = put(s, 'P1', 'rank-rat');
    const favor = put(s, 'P1', 'lumarets-favor', 'hand');
    gained(s);
    mana(s, 'P1', { G: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: favor, targets: [{ kind: 'card', card: rat }] }).state;
    expect([powerOf(s, s.cards[rat]!), toughnessOf(s, s.cards[rat]!)]).toEqual([5, 9]);
  });
});

describe('SOS5a: Converge', () => {
  const five = { W: 1, U: 1, B: 1, R: 1, G: 1 } as const;

  it('Rancorous Archaic enters with a counter for each color spent', () => {
    let s = newGame();
    const archaic = put(s, 'P1', 'rancorous-archaic', 'hand');
    mana(s, 'P1', { W: 1, U: 1, B: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: archaic }).state;
    expect(s.cards[archaic]!.counters).toBe(3);
  });

  it('Sundering Archaic exiles a nonland permanent with mana value up to the colors spent', () => {
    let s = newGame();
    const cheap = put(s, 'P2', 'rank-rat'); // mana value 2
    const big = put(s, 'P2', 'hungry-graffalon'); // mana value 4
    const archaic = put(s, 'P1', 'sundering-archaic', 'hand');
    mana(s, 'P1', { W: 1, U: 1, C: 4 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: archaic });
    s = settle(s, { targets: (o) => { expect(o.some((t) => t[0]?.kind === 'card' && t[0].card === big)).toBe(false); return o.find((t) => t[0]?.kind === 'card' && t[0].card === cheap)!; } }).state;
    expect([s.cards[cheap]!.zone, s.cards[big]!.zone]).toEqual(['exile', 'battlefield']);
  });

  it('Together as One: draw, damage and life equal to the colors spent', () => {
    let s = newGame();
    const spell = put(s, 'P1', 'together-as-one', 'hand');
    mana(s, 'P1', { ...five, C: 1 });
    const hand = s.players.P1!.hand.length;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [{ kind: 'player', player: 'P1' }, { kind: 'player', player: 'P2' }] }).state;
    expect([s.players.P1!.hand.length, s.players.P2!.life, s.players.P1!.life]).toEqual([hand - 1 + 5, 15, 25]);
  });

  it('Transcendent Archaic may draw X, then discards two if it drew', () => {
    let s = newGame();
    const archaic = put(s, 'P1', 'transcendent-archaic', 'hand');
    mana(s, 'P1', { W: 1, U: 1, B: 1, C: 4 });
    const hand = s.players.P1!.hand.length;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: archaic }, { accept: true }).state;
    while (s.pending.kind === 'chooseCards') s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: (s.pending as { cards: string[] }).cards.slice(0, 2) })).state;
    expect(s.players.P1!.hand.length).toBe(hand - 1 + 3 - 2);
  });

  it('Arcane Omens: target player discards X', () => {
    let s = newGame();
    for (let i = 0; i < 4; i++) put(s, 'P2', 'island', 'hand');
    const omens = put(s, 'P1', 'arcane-omens', 'hand');
    mana(s, 'P1', { B: 1, R: 1, C: 3 });
    const hand = s.players.P2!.hand.length;
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: omens, targets: [{ kind: 'player', player: 'P2' }] })).state;
    while (s.pending.kind === 'chooseCards') s = settle(act(s, { type: 'ChooseCards', player: (s.pending as { player: string }).player, cards: (s.pending as { cards: string[] }).cards.slice(0, 2) })).state;
    expect(s.players.P2!.hand.length).toBe(hand - 2);
  });

  it("Archaic's Agony deals X to a creature and exiles cards equal to the excess to play", () => {
    let s = newGame();
    const rat = put(s, 'P2', 'rank-rat'); // 1/1
    const agony = put(s, 'P1', 'archaics-agony', 'hand');
    mana(s, 'P1', { W: 1, U: 1, R: 1, C: 2 });
    const top = s.players.P1!.library.slice(0, 3);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: agony, targets: [{ kind: 'card', card: rat }] }).state;
    expect(s.cards[rat]!.zone).toBe('graveyard');
    expect(top.map((id) => s.cards[id]!.zone)).toEqual(['exile', 'exile', 'library']);
  });

  it('Snarl Song: two Fractals with X counters each, and X life', () => {
    let s = newGame();
    const song = put(s, 'P1', 'snarl-song', 'hand');
    mana(s, 'P1', { G: 1, U: 1, C: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: song }).state;
    const fractals = s.players.P1!.battlefield.map((id) => s.cards[id]!).filter((c) => c.defId === 'fractal-token-sos');
    expect([fractals.map((c) => c.counters), s.players.P1!.life]).toEqual([[2, 2], 22]);
  });

  it('Magmablood Archaic: {2/R} costs; your creatures get +1/+0 per color of your instants and sorceries', () => {
    let s = newGame();
    const archaic = put(s, 'P1', 'magmablood-archaic', 'hand');
    mana(s, 'P1', { R: 1, C: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: archaic }).state;
    expect([s.cards[archaic]!.zone, s.cards[archaic]!.counters]).toEqual(['battlefield', 1]);
    const rat = put(s, 'P1', 'rank-rat');
    const spell = put(s, 'P1', 'together-as-one', 'hand');
    mana(s, 'P1', { W: 1, U: 1, C: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [{ kind: 'player', player: 'P1' }, { kind: 'player', player: 'P2' }] }).state;
    expect(powerOf(s, s.cards[rat]!)).toBe(3);
  });

  it('Wildgrowth Archaic: your creature spells enter with a counter per color spent', () => {
    let s = newGame();
    const archaic = put(s, 'P1', 'wildgrowth-archaic', 'hand');
    mana(s, 'P1', { G: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: archaic }).state;
    expect(s.cards[archaic]!.counters).toBe(1);
    const rancor = put(s, 'P1', 'rancorous-archaic', 'hand');
    mana(s, 'P1', { W: 1, U: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: rancor }).state;
    expect(s.cards[rancor]!.counters).toBe(4);
  });
});
