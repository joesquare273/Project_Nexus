import { describe, expect, it } from 'vitest';
import { COMMANDER, applyAction, characteristics, currentDefinition, getLegalActions, matchesObject, objectManaValue, spellOptions, viewFor, type GameState, type Action, type CostedOption } from '@nexus/engine';
import { CARD_DEFS, validateCardDefinition, validateCardList } from '@nexus/cards';
import { moveCard } from '../../engine/src/state.ts';
import { cleanupDamage, startNextTurn } from '../../engine/src/turn.ts';
import { basicAi, playableCards } from '../src/index.ts';
import { checkInvariants } from '../src/invariants.ts';
import { act, card, mana, newGame, put, rejected, settle } from './kit-helpers.ts';

function spells(s: GameState, player: string) {
  return spellOptions(s, player).filter((o): o is CostedOption & { action: Extract<Action, { type: 'CastSpell' }> } => o.action.type === 'CastSpell');
}
const SPRITE = 'hypnotic-sprite-mesmeric-glare';
const RIDER = 'murderous-rider-swift-end';
const HILDI = 'hildibrand-manderville-gentlemans-rise';
function priority(s: GameState, who: string) {
  for (let n = 0; n < 10 && s.pending.kind === 'priority' && s.pending.player !== who; n++) s = act(s, { type: 'PassPriority', player: s.pending.player });
  return s;
}
function cast(s: GameState, id: string, adventure = false, target?: string) {
  return act(s, { type: 'CastSpell', player: 'P1', card: id, ...(adventure ? { adventure: true } : {}), ...(target ? { targets: [card(target)] } : {}) });
}
function paidGame(players: number) {
  const s = newGame(players);
  mana(s, 'P1', { C: 20, U: 20, B: 20, W: 20 });
  return s;
}
function kill(s: GameState, id: string) {
  const removal = put(s, 'P1', 'murderous-rider-swift-end', 'hand');
  return settle(cast(s, removal, true, id)).state;
}
function nextTurn(s: GameState) {
  startNextTurn({ s, ev: [] });
  return s;
}

describe.each([2, 3, 4])('Adventure batch with %i players', players => {
  it('offers each half separately, with its own mana cost and legal targets', () => {
    let s = paidGame(players);
    const sprite = put(s, 'P1', SPRITE, 'hand');
    const rider = put(s, 'P1', RIDER, 'hand');
    const hildi = put(s, 'P1', HILDI, 'hand');
    put(s, 'P2', 'soldier-token');
    const plays = playableCards(s, 'P1');
    expect(plays.filter(p => p.card === hildi).map(p => p.label)).toEqual(['Cast', "Cast Adventure: Gentleman's Rise ({2}{B})"]);
    expect(plays.filter(p => p.card === rider)).toHaveLength(2);
    expect(plays.filter(p => p.card === sprite)).toHaveLength(1); // no spell to counter
    expect(spells(s, 'P1').find(o => o.action.card === hildi && o.action.adventure)?.cost).toEqual({ generic: 2, B: 1 });
    s = cast(s, hildi);
    const options = spells(s, 'P1').filter(o => o.action.card === sprite);
    expect(options.every(o => o.action.adventure)).toBe(true);
    expect(options[0]?.cost).toEqual({ generic: 2, U: 1 });
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: sprite })).toMatch(/main phase/);
  });

  it('resolves Mesmeric Glare, counters a small spell, then casts the flying creature from exile', () => {
    let s = paidGame(players);
    const sprite = put(s, 'P1', SPRITE, 'hand');
    const spell = put(s, 'P1', 'mind-stone', 'hand');
    s = cast(s, spell);
    s = cast(s, sprite, true, spell);
    expect(currentDefinition(s, s.cards[sprite]!).name).toBe('Mesmeric Glare');
    expect(currentDefinition(s, s.cards[sprite]!).types).toEqual(['instant']);
    expect(characteristics(s, s.cards[sprite]!).keywords.has('Flying')).toBe(false);
    expect(objectManaValue(s, s.cards[sprite]!)).toBe(3);
    expect(matchesObject(s, { types: ['instant'], colors: ['U'] }, s.cards[sprite]!, { controller: 'P1' })).toBe(true);
    expect(viewFor(s, 'P2').stack.at(-1)).toMatchObject({ adventure: true });
    s = settle(s).state;
    expect(s.cards[spell]!.zone).toBe('graveyard');
    expect(s.cards[sprite]).toMatchObject({ zone: 'exile', adventurer: 'P1' });
    expect(objectManaValue(s, s.cards[sprite]!)).toBe(2);
    expect(spells(s, 'P1').filter(o => o.action.card === sprite).every(o => !o.action.adventure)).toBe(true);
    s = settle(cast(s, sprite)).state;
    expect(s.cards[sprite]!.zone).toBe('battlefield');
    expect(characteristics(s, s.cards[sprite]!).keywords.has('Flying')).toBe(true);
    expect(s.cards[sprite]!.adventurer).toBeUndefined();
    expect(checkInvariants(s)).toEqual([]);
  });

  it('uses the chosen X on the stack for Mesmeric Glare targets', () => {
    let s = paidGame(players);
    const sprite = put(s, 'P1', SPRITE, 'hand');
    const ballista = put(s, 'P1', 'walking-ballista', 'hand');
    s = act(s, { type: 'CastSpell', player: 'P1', card: ballista, x: 2 });
    expect(objectManaValue(s, s.cards[ballista]!)).toBe(4);
    expect(spells(s, 'P1').some(o => o.action.card === sprite)).toBe(false);
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: sprite, adventure: true, targets: [card(ballista)] })).toMatch(/target/i);
  });

  it('exiles a resolving Glare even when its legal target cannot be countered', () => {
    let s = paidGame(players);
    s.cardDefs = { ...s.cardDefs, 'mind-stone': { ...s.cardDefs['mind-stone']!, cantBeCountered: true } };
    const sprite = put(s, 'P1', SPRITE, 'hand'), spell = put(s, 'P1', 'mind-stone', 'hand');
    s = settle(cast(cast(s, spell), sprite, true, spell)).state;
    expect(s.cards[spell]!.zone).toBe('battlefield');
    expect(s.cards[sprite]).toMatchObject({ zone: 'exile', adventurer: 'P1' });
  });

  it('Swift End destroys a creature, loses two life, then permits the lifelink creature', () => {
    let s = paidGame(players);
    const rider = put(s, 'P1', RIDER, 'hand'), victim = put(s, 'P2', 'soldier-token');
    const before = s.players.P1!.life;
    s = settle(cast(s, rider, true, victim)).state;
    expect(s.cards[victim]!.zone).toBe('graveyard');
    expect(s.players.P1!.life).toBe(before - 2);
    expect(s.cards[rider]).toMatchObject({ zone: 'exile', adventurer: 'P1' });
    s = settle(cast(s, rider)).state;
    expect(characteristics(s, s.cards[rider]!).keywords.has('Lifelink')).toBe(true);
    expect(characteristics(s, s.cards[rider]!).toughness).toBe(3);
  });

  it('Swift End still loses life and exiles itself against indestructible', () => {
    let s = paidGame(players);
    const rider = put(s, 'P1', RIDER, 'hand'), victim = put(s, 'P2', 'soldier-token');
    s.temporaryEffects.push({ source: victim, affected: victim, keywords: ['Indestructible'] });
    const before = s.players.P1!.life;
    s = settle(cast(s, rider, true, victim)).state;
    expect(s.cards[victim]!.zone).toBe('battlefield');
    expect(s.players.P1!.life).toBe(before - 2);
    expect(s.cards[rider]!.adventurer).toBe('P1');
  });

  it.each([SPRITE, RIDER])('does not exile or grant a creature cast when %s loses all targets', def => {
    let s = paidGame(players);
    const adventure = put(s, 'P1', def, 'hand');
    const victim = put(s, 'P2', 'soldier-token');
    const spell = put(s, 'P1', 'mind-stone', 'hand');
    if (def === SPRITE) s = cast(s, spell);
    const target = def === SPRITE ? spell : victim;
    s = cast(s, adventure, true, target);
    s.stack = s.stack.filter(item => item.kind !== 'spell' || item.card !== target);
    moveCard({ s, ev: [] }, target, 'exile');
    const before = s.players.P1!.life;
    s = settle(s).state;
    expect(s.players.P1!.life).toBe(before);
    expect(s.cards[adventure]!.zone).toBe('graveyard');
    expect(s.cards[adventure]!.adventurer).toBeUndefined();
  });

  it.each([SPRITE, RIDER, HILDI])('countered %s grants no creature permission', def => {
    let s = paidGame(players);
    const adventure = put(s, 'P1', def, 'hand'), counter = put(s, 'P1', SPRITE, 'hand');
    const victim = put(s, 'P2', 'soldier-token'), spell = put(s, 'P1', 'mind-stone', 'hand');
    if (def === SPRITE) s = cast(s, spell);
    s = cast(s, adventure, true, def === RIDER ? victim : def === SPRITE ? spell : undefined);
    s = settle(cast(s, counter, true, adventure)).state;
    expect(s.cards[adventure]!.zone).toBe('graveyard');
    expect(s.cards[adventure]!.adventurer).toBeUndefined();
    expect(s.cards[counter]!.adventurer).toBe('P1');
  });

  it('ordinary exile grants nothing; leaving and reentering exile clears the permission', () => {
    let s = paidGame(players);
    const hildi = put(s, 'P1', HILDI, 'exile');
    expect(spells(s, 'P1').some(o => o.action.card === hildi)).toBe(false);
    moveCard({ s, ev: [] }, hildi, 'hand');
    s = settle(cast(s, hildi, true)).state;
    moveCard({ s, ev: [] }, hildi, 'hand');
    moveCard({ s, ev: [] }, hildi, 'exile');
    expect(s.cards[hildi]!.adventurer).toBeUndefined();
    expect(spells(s, 'P1').some(o => o.action.card === hildi)).toBe(false);
  });

  it('puts a dying Murderous Rider on the bottom of its owner’s library', () => {
    let s = paidGame(players);
    const rider = put(s, 'P2', RIDER);
    s = kill(s, rider);
    expect(s.cards[rider]!.zone).toBe('library');
    expect(s.players.P2!.library.at(-1)).toBe(rider);
    expect(s.players.P1!.library).not.toContain(rider);
  });

  it('Rider’s dies ability cannot follow a different graveyard object', () => {
    let s = paidGame(players);
    const rider = put(s, 'P1', RIDER);
    const removal = put(s, 'P1', RIDER, 'hand');
    s = cast(s, removal, true, rider);
    // Resolve removal only, retaining the death trigger.
    while (s.cards[rider]!.zone === 'battlefield') {
      if (s.pending.kind !== 'priority') throw Error(s.pending.kind);
      s = act(s, { type: 'PassPriority', player: s.pending.player });
    }
    moveCard({ s, ev: [] }, rider, 'exile');
    moveCard({ s, ev: [] }, rider, 'graveyard');
    s = settle(s).state;
    expect(s.cards[rider]!.zone).toBe('graveyard');
  });

  it('Hildibrand buffs only its controller’s creature tokens, including the exact Zombie', () => {
    let s = paidGame(players);
    const hildi = put(s, 'P1', HILDI, 'hand');
    s = settle(cast(s, hildi, true)).state;
    const zombie = s.players.P1!.battlefield.find(id => s.cards[id]!.defId === 'zombie-token')!;
    expect(s.cards[zombie]!.isToken).toBe(true);
    expect(characteristics(s, s.cards[zombie]!).power).toBe(2);
    const other = put(s, 'P2', 'zombie-token', 'battlefield', { isToken: true });
    const body = put(s, 'P1', RIDER);
    s = settle(cast(s, hildi)).state;
    expect(characteristics(s, s.cards[zombie]!)).toMatchObject({ power: 3, toughness: 3 });
    expect(characteristics(s, s.cards[other]!).power).toBe(2);
    expect(characteristics(s, s.cards[body]!).power).toBe(2);
    expect(characteristics(s, s.cards[hildi]!).power).toBe(2);
    expect(CARD_DEFS['zombie-token']!.printing).toEqual({ set: 'tfic', number: '6' });
    expect(checkInvariants(s)).toEqual([]);
  });

  it('Hildibrand’s death enables only its Adventure, at normal cost, and starts the loop again', () => {
    let s = paidGame(players);
    const hildi = put(s, 'P1', HILDI);
    s = kill(s, hildi);
    const options = spells(s, 'P1').filter(o => o.action.card === hildi);
    expect(options.length).toBeGreaterThan(0);
    expect(options.every(o => o.action.adventure)).toBe(true);
    expect(options[0]!.cost).toEqual({ generic: 2, B: 1 });
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: hildi })).toMatch(/hand/);
    s = settle(cast(s, hildi, true)).state;
    expect(s.cards[hildi]).toMatchObject({ zone: 'exile', adventurer: 'P1' });
    expect(s.cards[hildi]!.adventureGraveyard).toBeUndefined();
    s = settle(cast(s, hildi)).state;
    expect(s.cards[hildi]!.zone).toBe('battlefield');
    expect(s.players.P1!.battlefield.filter(id => s.cards[id]!.defId === 'zombie-token')).toHaveLength(1);
  });

  it('countering the graveyard Adventure puts it back in the graveyard without a fresh permission', () => {
    let s = paidGame(players);
    const hildi = put(s, 'P1', HILDI), counter = put(s, 'P1', SPRITE, 'hand');
    s = kill(s, hildi);
    s = settle(cast(cast(s, hildi, true), counter, true, hildi)).state;
    expect(s.cards[hildi]!.zone).toBe('graveyard');
    expect(s.cards[hildi]!.adventureGraveyard).toBeUndefined();
    expect(spells(s, 'P1').some(o => o.action.card === hildi)).toBe(false);
  });

  it('permission lasts through the next own turn, with an eliminated seat skipped', () => {
    let s = paidGame(players);
    const hildi = put(s, 'P1', HILDI);
    s = kill(s, hildi);
    if (players > 2) s.players.P2!.eliminated = true;
    const available = () => spells(s, 'P1').some(o => o.action.card === hildi && o.action.adventure);
    cleanupDamage({ s, ev: [] });
    expect(available()).toBe(true); // current cleanup is too early
    do { nextTurn(s); expect(available()).toBe(true); } while (s.activePlayer !== 'P1');
    expect(s.cards[hildi]!.adventureGraveyard?.expiresOnTurn).toBe(s.turnNumber);
    cleanupDamage({ s, ev: [] });
    expect(available()).toBe(false);
  });

  it('a stolen Hildibrand grants its last controller the graveyard and subsequent exile casts', () => {
    let s = paidGame(players);
    const hildi = put(s, 'P2', HILDI, 'battlefield', { controller: 'P1' });
    s = kill(s, hildi);
    expect(s.cards[hildi]!.adventureGraveyard?.player).toBe('P1');
    expect(spells(s, 'P2').some(o => o.action.card === hildi)).toBe(false);
    s = settle(cast(s, hildi, true)).state;
    s = settle(cast(s, hildi)).state;
    expect(s.cards[hildi]).toMatchObject({ owner: 'P2', controller: 'P1', zone: 'battlefield' });
  });

  it('Hildibrand’s death permission cannot follow a card that left and reentered the graveyard', () => {
    let s = paidGame(players);
    const hildi = put(s, 'P1', HILDI), removal = put(s, 'P1', RIDER, 'hand');
    s = cast(s, removal, true, hildi);
    while (s.cards[hildi]!.zone === 'battlefield') {
      if (s.pending.kind !== 'priority') throw Error(s.pending.kind);
      s = act(s, { type: 'PassPriority', player: s.pending.player });
    }
    moveCard({ s, ev: [] }, hildi, 'exile');
    moveCard({ s, ev: [] }, hildi, 'graveyard');
    s = settle(s).state;
    expect(s.cards[hildi]!.adventureGraveyard).toBeUndefined();
  });

  it('uses the Adventure characteristics for creature-only library permissions and noncreature discounts', () => {
    const s = paidGame(players);
    const sprite = put(s, 'P1', SPRITE, 'library');
    const materia = put(s, 'P1', 'summoning-materia'), host = put(s, 'P1', RIDER);
    s.cards[materia]!.attachedTo = host;
    expect(spells(s, 'P1').filter(o => o.action.card === sprite).every(o => !o.action.adventure)).toBe(true);
    const hildi = put(s, 'P1', HILDI, 'hand');
    put(s, 'P1', 'lyse-hext');
    expect(spells(s, 'P1').find(o => o.action.card === hildi && o.action.adventure)?.cost).toEqual({ generic: 1, B: 1 });
    expect(spells(s, 'P1').find(o => o.action.card === hildi && !o.action.adventure)?.cost).toEqual({ generic: 1, W: 1 });
  });

  it('static graveyard permissions check the chosen spell half, and it resolves into exile', () => {
    let s = paidGame(players);
    // Exercise the generic permission with an instant-only filter. Edgar itself allows artifacts.
    s.cardDefs = { ...s.cardDefs, 'edgar-master-machinist': { ...s.cardDefs['edgar-master-machinist']!, statics: [{ affects: 'Self', castFromGraveyard: { filter: { types: ['instant'] } } }] } };
    put(s, 'P1', 'edgar-master-machinist');
    const hildi = put(s, 'P1', HILDI, 'graveyard');
    expect(spells(s, 'P1').some(o => o.action.card === hildi && o.action.adventure)).toBe(true);
    expect(spells(s, 'P1').some(o => o.action.card === hildi && !o.action.adventure)).toBe(false);
    s = settle(cast(s, hildi, true)).state;
    expect(s.cards[hildi]).toMatchObject({ zone: 'exile', adventurer: 'P1' });
  });

  it('counts an Adventure commander cast for tax and uses creature timing from exile', () => {
    let s = paidGame(players);
    s.format = COMMANDER;
    const hildi = put(s, 'P1', HILDI, 'command', { isCommander: true });
    s.players.P1!.commanderCasts[hildi] = 1;
    expect(spells(s, 'P1').find(o => o.action.card === hildi && o.action.adventure)?.cost).toEqual({ generic: 4, B: 1 });
    s = cast(s, hildi, true);
    expect(s.players.P1!.commanderCasts[hildi]).toBe(2);
    while (s.cards[hildi]!.zone === 'stack') {
      if (s.pending.kind !== 'priority') throw Error(s.pending.kind);
      s = act(s, { type: 'PassPriority', player: s.pending.player });
    }
    expect(s.pending.kind).toBe('commanderZone');
    s = act(s, { type: 'CommanderZone', player: 'P1', toCommand: false });
    s = settle(s).state;
    expect(s.cards[hildi]!.zone).toBe('exile');
    s = priority(s, 'P2');
    expect(rejected(s, { type: 'CastSpell', player: 'P2', card: hildi })).toMatch(/hand/);
  });

  it('AI chooses Swift End as removal, rather than scoring it as a creature', () => {
    const s = newGame(players);
    const rider = put(s, 'P1', RIDER, 'hand');
    put(s, 'P2', 'sephiroth-fallen-hero', 'battlefield', { counters: 8 });
    mana(s, 'P1', { C: 1, B: 2 });
    const choice = basicAi(1)(s, getLegalActions(s));
    expect(choice).toMatchObject({ type: 'CastSpell', card: rider, adventure: true });
  });

  it('rejects Adventure actions for ordinary cards', () => {
    const s = paidGame(players), id = put(s, 'P1', 'mind-stone', 'hand');
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: id, adventure: true })).toMatch(/no Adventure/);
  });
});

describe('Adventure card validation', () => {
  it('validates the second spell and references its exact token', () => {
    const d = CARD_DEFS[HILDI]!;
    expect(validateCardDefinition(d)).toEqual([]);
    expect(validateCardDefinition({ ...d, adventure: { ...d.adventure!, manaCost: '{Q}' } }).join()).toMatch(/Unsupported mana symbol/);
    expect(validateCardList([d]).join()).toMatch(/zombie-token/);
    expect(validateCardDefinition({ ...d, adventure: { ...d.adventure!, effects: [] } }).join()).toMatch(/at least one effect/);
  });
});
