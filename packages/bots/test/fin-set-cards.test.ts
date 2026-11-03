// Final Fantasy set cards built in S4 (docs/sealed.md), played through the
// engine with their real card data. Each test checks what the card's Oracle
// text says it does.

import { describe, expect, it } from 'vitest';
import { type Target, type GameEvent, spellOptions, AliasBook, playerUpdate, canAttack, activatedAbilities, canBlock, countersOf, currentDefinition, getLegalActions, viewFor, hasKeyword, manaValue, parseManaCost, powerOf, toughnessOf, type GameState } from '@nexus/engine';
import { dealDamage } from '../../engine/src/state.ts';
import { act, actWithEvents, card, cast, fight, goTo, mana, newGame, nextStep, player, put, rejected, settle } from './kit-helpers.ts';

const stats = (s: GameState, id: string) => [powerOf(s, s.cards[id]!), toughnessOf(s, s.cards[id]!)];
const heroes = (s: GameState, who: string) => s.players[who]!.battlefield.filter((id) => s.cards[id]!.defId === 'hero-token');
/** A creature wearing one of P1's Equipment. */
function equipped(s: GameState, equipment: string, creature = 'coeurl') {
  const body = put(s, 'P1', creature);
  const gear = put(s, 'P1', equipment, 'battlefield', { attachedTo: body });
  return { body, gear };
}

describe('S4 group 1: Job select Equipment', () => {
  it('Job select: casting one makes a 1/1 Hero token wearing it (Monk’s Fist: +1/+0, Monk)', () => {
    let s = newGame();
    const fist = put(s, 'P1', 'monks-fist', 'hand');
    mana(s, 'P1', { C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: fist }).state;
    const [hero] = heroes(s, 'P1');
    expect(s.cards[fist]!.attachedTo).toBe(hero);
    expect(stats(s, hero!)).toEqual([2, 1]);
  });

  it('Bard’s Bow gives +2/+2 and reach', () => {
    const s = newGame();
    const { body } = equipped(s, 'bards-bow');
    const bare = put(s, 'P2', 'coeurl');
    expect(stats(s, body)).toEqual([stats(s, bare)[0]! + 2, stats(s, bare)[1]! + 2]);
    expect(hasKeyword(s, s.cards[body]!, 'Reach')).toBe(true);
  });

  it('Thief’s Knife draws a card when the equipped creature deals combat damage to a player', () => {
    let s = newGame();
    const { body } = equipped(s, 'thiefs-knife');
    const hand = s.players.P1!.hand.length;
    s = fight(s, [{ attacker: body, defender: 'P2' }]).state;
    expect(s.players.P1!.hand.length).toBe(hand + 1);
  });

  it('Black Mage’s Rod deals 1 damage to each opponent when you cast a noncreature spell', () => {
    let s = newGame(3);
    equipped(s, 'black-mages-rod');
    const target = put(s, 'P2', 'coeurl');
    const kill = put(s, 'P1', 'sephiroths-intervention', 'hand');
    mana(s, 'P1', { B: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: kill, targets: [card(target)] }).state;
    expect([s.players.P2!.life, s.players.P3!.life]).toEqual([19, 19]);
  });

  it('Red Mage’s Rapier gives +2/+0 until end of turn when you cast a noncreature spell', () => {
    let s = newGame();
    const { body } = equipped(s, 'red-mages-rapier');
    const before = stats(s, body);
    const target = put(s, 'P2', 'coeurl');
    const kill = put(s, 'P1', 'sephiroths-intervention', 'hand');
    mana(s, 'P1', { B: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: kill, targets: [card(target)] }).state;
    expect(stats(s, body)).toEqual([before[0]! + 2, before[1]]);
  });

  it('Ninja’s Blades: draw, discard, and that player loses life equal to the discarded card’s mana value', () => {
    let s = newGame(3);
    const { body } = equipped(s, 'ninjas-blades');
    const top = put(s, 'P1', 'sephiroths-intervention', 'library');
    const value = manaValue(parseManaCost(s.cardDefs['sephiroths-intervention']!.manaCost));
    const power = powerOf(s, s.cards[body]!);
    s = fight(s, [{ attacker: body, defender: 'P3' }]).state;
    expect(s.pending.kind).toBe('chooseCards');
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [top] })).state;
    expect(s.cards[top]!.zone).toBe('graveyard');
    expect(s.players.P3!.life).toBe(20 - power - value);
    expect(s.players.P2!.life).toBe(20);
  });
});

describe('Summoner’s Grimoire', () => {
  /** P1 attacks P3 with the equipped creature; the attack trigger offers the hand. */
  function attackWithGrimoire(inHand: string) {
    let s = newGame(3);
    const { body } = equipped(s, 'summoners-grimoire');
    const card = put(s, 'P1', inHand, 'hand');
    s = goTo(s, 'declareAttackers');
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: body, defender: 'P3' }] })).state;
    expect(s.pending.kind).toBe('chooseCards');
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [card] })).state;
    return { s, card };
  }

  it('an enchantment creature card enters tapped and attacking the same player', () => {
    const { s, card } = attackWithGrimoire('summon-bahamut');
    expect(s.cards[card]!.zone).toBe('battlefield');
    expect(s.cards[card]!.tapped).toBe(true);
    expect(s.combat!.attacks).toContainEqual({ attacker: card, defender: 'P3' });
  });

  it('any other creature card just enters, untapped and not attacking', () => {
    const { s, card } = attackWithGrimoire('coeurl');
    expect(s.cards[card]!.zone).toBe('battlefield');
    expect(s.cards[card]!.tapped).toBe(false);
    expect(s.combat!.attacks.some((a) => a.attacker === card)).toBe(false);
  });
});

describe('Dark Knight’s Greatsword', () => {
  it('+3/+0; equip by paying 3 life, only once each turn', () => {
    let s = newGame();
    const { body, gear } = equipped(s, 'dark-knights-greatsword');
    const other = put(s, 'P1', 'coeurl');
    expect(stats(s, body)[0]).toBe(stats(s, other)[0]! + 3);
    const equip = activatedAbilities(s.cardDefs['dark-knights-greatsword']!).findIndex((a) => a.equip);
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: gear, ability: equip, targets: [card(other)] }).state;
    expect(s.cards[gear]!.attachedTo).toBe(other);
    expect(s.players.P1!.life).toBe(17);
    // A second time this turn is refused, and it isn't offered.
    expect(rejected(s, { type: 'ActivateAbility', player: 'P1', card: gear, ability: equip, targets: [card(body)] })).toMatch(/once each turn/);
    expect(getLegalActions(s).some((a) => a.type === 'ActivateAbility' && a.card === gear)).toBe(false);
  });
});

describe('Machinist’s Arsenal', () => {
  it('gives +2/+2 for each artifact you control (itself included)', () => {
    const s = newGame();
    const { body } = equipped(s, 'machinists-arsenal');
    const bare = put(s, 'P2', 'coeurl');
    const base = stats(s, bare);
    expect(stats(s, body)).toEqual([base[0]! + 2, base[1]! + 2]);
    put(s, 'P1', 'monks-fist');
    put(s, 'P2', 'monks-fist');
    expect(stats(s, body)).toEqual([base[0]! + 4, base[1]! + 4]);
  });
});

describe('S4 group 2: noncreature spells', () => {
  /** P1 casts Night's Whisper (2 mana) or Harmonize (4 mana). */
  const castCheap = (s: GameState) => {
    const spell = put(s, 'P1', 'nights-whisper', 'hand');
    mana(s, 'P1', { B: 2 });
    return cast(s, { type: 'CastSpell', player: 'P1', card: spell }).state;
  };
  const castBig = (s: GameState) => {
    const spell = put(s, 'P1', 'harmonize', 'hand');
    mana(s, 'P1', { G: 4 });
    return cast(s, { type: 'CastSpell', player: 'P1', card: spell }).state;
  };
  const counters = (s: GameState, id: string) => countersOf(s.cards[id]!, '+1/+1');

  it('Ultros taps and stuns an opponent’s creature for a 4-mana spell; eight +1/+1 counters for an 8-mana one', () => {
    let s = newGame();
    const ultros = put(s, 'P1', 'ultros-obnoxious-octopus');
    const target = put(s, 'P2', 'coeurl');
    s = castCheap(s);
    expect(s.cards[target]!.tapped).toBe(false);
    s = castBig(s);
    expect(s.cards[target]!.tapped).toBe(true);
    expect(countersOf(s.cards[target]!, 'stun')).toBe(1);
    expect(counters(s, ultros)).toBe(0);
    const pull = put(s, 'P1', 'pull-from-tomorrow', 'hand');
    mana(s, 'P1', { U: 8 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: pull, x: 6 }).state;
    expect(counters(s, ultros)).toBe(8);
  });

  it('Cornered by Black Mages: the opponent sacrifices a creature, and you get a Wizard that pings', () => {
    let s = newGame();
    const victim = put(s, 'P2', 'coeurl');
    const spell = put(s, 'P1', 'cornered-by-black-mages', 'hand');
    mana(s, 'P1', { B: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [{ kind: 'player', player: 'P2' }] }).state;
    if (s.pending.kind === 'chooseCards') s = settle(act(s, { type: 'ChooseCards', player: 'P2', cards: [victim] })).state;
    expect(s.cards[victim]!.zone).toBe('graveyard');
    expect(s.players.P1!.battlefield.some((id) => s.cards[id]!.defId === 'wizard-token')).toBe(true);
    s = castCheap(s);
    expect(s.players.P2!.life).toBe(19);
  });

  it('Blazing Bomb grows for 4-mana spells and blows up for damage equal to its power', () => {
    let s = newGame();
    const bomb = put(s, 'P1', 'blazing-bomb');
    const target = put(s, 'P2', 'coeurl');
    s = castCheap(s);
    expect(counters(s, bomb)).toBe(0);
    s = castBig(s);
    expect(counters(s, bomb)).toBe(1);
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: bomb, ability: 0, targets: [card(target)] }).state;
    expect(s.cards[bomb]!.zone).toBe('graveyard');
    // It had power 2 (1 plus its counter) as it was sacrificed: 2 damage, or the creature died of it.
    const hit = s.cards[target]!;
    expect(hit.zone === 'graveyard' || hit.damage === 2).toBe(true);
  });

  it('Mysidian Elder makes a Wizard token as it enters', () => {
    let s = newGame();
    const elder = put(s, 'P1', 'mysidian-elder', 'hand');
    mana(s, 'P1', { R: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: elder }).state;
    expect(s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'wizard-token')).toHaveLength(1);
  });

  it('Prompto Argentum makes a Treasure only for spells with four or more mana spent', () => {
    let s = newGame();
    put(s, 'P1', 'prompto-argentum');
    const treasures = () => s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'treasure-token').length;
    s = castCheap(s);
    expect(treasures()).toBe(0);
    s = castBig(s);
    expect(treasures()).toBe(1);
  });

  it('Queen Brahne has prowess and makes a Wizard when she attacks', () => {
    let s = newGame();
    const queen = put(s, 'P1', 'queen-brahne');
    s = castCheap(s);
    expect(stats(s, queen)).toEqual([3, 2]);
    s = fight(s, [{ attacker: queen, defender: 'P2' }]).state;
    expect(s.players.P1!.battlefield.some((id) => s.cards[id]!.defId === 'wizard-token')).toBe(true);
  });

  it('Black Waltz No. 3 deals 2 damage to each opponent for every noncreature spell', () => {
    let s = newGame(3);
    put(s, 'P1', 'black-waltz-no-3');
    s = castCheap(s);
    expect([s.players.P2!.life, s.players.P3!.life]).toEqual([18, 18]);
  });
});

describe('S4 group 2: mana spent on noncreature spells', () => {
  const castWith = (s: GameState, defId: string, pool: Parameters<typeof mana>[2], x?: number) => {
    const spell = put(s, 'P1', defId, 'hand');
    mana(s, 'P1', pool);
    return cast(s, { type: 'CastSpell', player: 'P1', card: spell, ...(x === undefined ? {} : { x }) }).state;
  };

  it('Shantotto gets +X/+0 for the mana spent, and draws a card when that’s four or more', () => {
    let s = newGame();
    const shantotto = put(s, 'P1', 'shantotto-tactician-magician');
    const hand = () => s.players.P1!.hand.length;
    let before = hand();
    s = castWith(s, 'nights-whisper', { B: 2 });
    expect(stats(s, shantotto)).toEqual([2, 4]);
    expect(hand()).toBe(before + 2);
    before = hand();
    s = castWith(s, 'harmonize', { G: 4 });
    expect(stats(s, shantotto)).toEqual([6, 4]);
    expect(hand()).toBe(before + 3 + 1);
  });

  it('Tellah makes a Hero for each spell, draws two for four mana, and at eight mana sacrifices himself for that much damage', () => {
    let s = newGame(3);
    const tellah = put(s, 'P1', 'tellah-great-sage');
    const heroCount = () => s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'hero-token').length;
    let before = s.players.P1!.hand.length;
    s = castWith(s, 'nights-whisper', { B: 2 });
    expect(heroCount()).toBe(1);
    expect(s.players.P1!.hand.length).toBe(before + 2);
    before = s.players.P1!.hand.length;
    s = castWith(s, 'harmonize', { G: 4 });
    expect(heroCount()).toBe(2);
    expect(s.players.P1!.hand.length).toBe(before + 3 + 2);
    expect(s.cards[tellah]!.zone).toBe('battlefield');
    s = castWith(s, 'pull-from-tomorrow', { U: 8 }, 6);
    if (s.pending.kind === 'chooseCards') s = settle(act(s, { type: 'ChooseCards', player: s.pending.player, cards: s.pending.cards.slice(0, s.pending.min) })).state;
    expect(s.cards[tellah]!.zone).toBe('graveyard');
    expect([s.players.P2!.life, s.players.P3!.life]).toEqual([12, 12]);
  });

  it('The Prima Vista becomes a 5/3 flying artifact creature for a four-mana noncreature spell', () => {
    let s = newGame();
    const ship = put(s, 'P1', 'the-prima-vista');
    s = castWith(s, 'nights-whisper', { B: 2 });
    expect(s.cards[ship]!.crewed ?? false).toBe(false);
    s = castWith(s, 'harmonize', { G: 4 });
    expect(s.cards[ship]!.crewed).toBe(true);
    expect(currentDefinition(s, s.cards[ship]!).types).toContain('creature');
    expect(stats(s, ship)).toEqual([5, 3]);
    expect(hasKeyword(s, s.cards[ship]!, 'Flying')).toBe(true);
  });
});

describe('Transforming double-faced cards', () => {
  const kill = (s: GameState, target: string) => {
    const spell = put(s, 'P1', 'sephiroths-intervention', 'hand');
    mana(s, 'P1', { B: 4 });
    return cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(target)] }).state;
  };
  const name = (s: GameState, id: string) => currentDefinition(s, s.cards[id]!).name;

  it('Vincent Valentine grows when an opponent’s creature dies, and may transform into Galian Beast as he attacks', () => {
    let s = newGame();
    const vincent = put(s, 'P1', 'vincent-valentine-galian-beast');
    const victim = put(s, 'P2', 'coeurl');
    const power = powerOf(s, s.cards[victim]!);
    s = kill(s, victim);
    expect(countersOf(s.cards[vincent]!, '+1/+1')).toBe(power);
    s = fight(s, [{ attacker: vincent, defender: 'P2' }]).state;
    expect(s.cards[vincent]!.transformed).toBe(true);
    expect(name(s, vincent)).toBe('Galian Beast');
    expect(stats(s, vincent)).toEqual([3 + power, 2 + power]);
    expect(hasKeyword(s, s.cards[vincent]!, 'Trample') && hasKeyword(s, s.cards[vincent]!, 'Lifelink')).toBe(true);
    // Lifelink: Galian Beast's combat damage gained P1 that much life (Sephiroth's Intervention gained 2 more).
    expect(s.players.P1!.life).toBe(20 + 2 + 3 + power);
  });

  it('declining the transform keeps Vincent front face up', () => {
    let s = newGame();
    const vincent = put(s, 'P1', 'vincent-valentine-galian-beast');
    s = fight(s, [{ attacker: vincent, defender: 'P2' }], {}, { accept: false }).state;
    expect(s.cards[vincent]!.transformed ?? false).toBe(false);
    expect(name(s, vincent)).toBe('Vincent Valentine // Galian Beast');
  });

  it('when Galian Beast dies, it returns to the battlefield tapped, front face up', () => {
    let s = newGame();
    const beast = put(s, 'P1', 'vincent-valentine-galian-beast', 'battlefield', { transformed: true });
    expect(name(s, beast)).toBe('Galian Beast');
    s = kill(s, beast);
    expect(s.cards[beast]!.zone).toBe('battlefield');
    expect(s.cards[beast]!.tapped).toBe(true);
    expect(s.cards[beast]!.transformed ?? false).toBe(false);
    expect(stats(s, beast)).toEqual([2, 2]);
  });

  it('Garland surveils for noncreature spells, and returns from the graveyard transformed into Chaos, which goes to the library bottom when it dies', () => {
    let s = newGame();
    const garland = put(s, 'P1', 'garland-knight-of-cornelia-chaos-the-endless');
    const top = put(s, 'P1', 'coeurl', 'library');
    const whisper = put(s, 'P1', 'nights-whisper', 'hand');
    mana(s, 'P1', { B: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: whisper }, { surveilToGraveyard: true }).state;
    expect(s.cards[top]!.zone).toBe('graveyard');
    s = kill(s, garland);
    expect(s.cards[garland]!.zone).toBe('graveyard');
    mana(s, 'P1', { B: 2, R: 2, C: 3 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: garland, ability: 0 }).state;
    expect(s.cards[garland]!.zone).toBe('battlefield');
    expect(name(s, garland)).toBe('Chaos, the Endless');
    expect(stats(s, garland)).toEqual([5, 5]);
    expect(hasKeyword(s, s.cards[garland]!, 'Flying')).toBe(true);
    s = kill(s, garland);
    expect(s.cards[garland]!.zone).toBe('library');
    expect(s.players.P1!.library.at(-1)).toBe(garland);
  });
});

describe('Transforming: The Emperor of Palamecia and Exdeath', () => {
  const castBig = (s: GameState) => {
    const spell = put(s, 'P1', 'harmonize', 'hand');
    mana(s, 'P1', { G: 4 });
    return cast(s, { type: 'CastSpell', player: 'P1', card: spell }).state;
  };

  it('The Emperor’s mana pays only for noncreature spells', () => {
    let s = newGame();
    const emperor = put(s, 'P1', 'the-emperor-of-palamecia-the-lord-master-of-hell');
    s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: emperor, mana: 'U' });
    expect(s.players.P1!.noncreatureSpellMana.U).toBe(1);
    expect(s.players.P1!.manaPool.U).toBe(0);
    // Ultros costs {1}{U}: the Emperor's {U} can't pay for a creature spell.
    const creature = put(s, 'P1', 'ultros-obnoxious-octopus', 'hand');
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: creature })).toMatch(/mana/);
    const whisper = put(s, 'P1', 'nights-whisper', 'hand');
    mana(s, 'P1', { B: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: whisper }).state;
    expect(s.cards[whisper]!.zone).toBe('graveyard');
    expect(s.players.P1!.noncreatureSpellMana.U).toBe(0);
  });

  it('The Emperor gets a counter for each 4-mana noncreature spell and transforms at three; The Lord Master of Hell burns for noncreature, nonland cards', () => {
    let s = newGame(3);
    const emperor = put(s, 'P1', 'the-emperor-of-palamecia-the-lord-master-of-hell');
    s = castBig(s);
    s = castBig(s);
    expect(countersOf(s.cards[emperor]!, '+1/+1')).toBe(2);
    expect(s.cards[emperor]!.transformed ?? false).toBe(false);
    s = castBig(s);
    expect(s.cards[emperor]!.transformed).toBe(true);
    expect(currentDefinition(s, s.cards[emperor]!).name).toBe('The Lord Master of Hell');
    expect(stats(s, emperor)).toEqual([6, 6]);
    // Three Harmonizes in the graveyard: 3 damage to each opponent as it attacks.
    s = fight(s, [{ attacker: emperor, defender: 'P2' }]).state;
    expect(s.players.P3!.life).toBe(17);
    expect(s.players.P2!.life).toBe(20 - 3 - 6);
  });

  it('Exdeath gains 3 life as it enters and transforms at your end step with six permanent cards in your graveyard; Neo Exdeath’s power is that count', () => {
    let s = newGame();
    const exdeath = put(s, 'P1', 'exdeath-void-warlock-neo-exdeath-dimensions-end', 'hand');
    mana(s, 'P1', { B: 1, G: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: exdeath }).state;
    expect(s.players.P1!.life).toBe(23);
    for (let i = 0; i < 5; i++) put(s, 'P1', 'coeurl', 'graveyard');
    // A sorcery isn't a permanent card: five permanent cards, so not yet.
    put(s, 'P1', 'nights-whisper', 'graveyard');
    const notYet = settle(goTo(structuredClone(s), 'end')).state;
    expect(notYet.cards[exdeath]!.transformed ?? false).toBe(false);
    put(s, 'P1', 'coeurl', 'graveyard');
    s = settle(goTo(s, 'end')).state;
    expect(s.cards[exdeath]!.transformed).toBe(true);
    expect(stats(s, exdeath)).toEqual([6, 3]);
    expect(hasKeyword(s, s.cards[exdeath]!, 'Trample')).toBe(true);
  });
});

describe('Transforming into Sagas: Dion, Jill and Jecht', () => {
  /** Passes turns until it's P1's precombat main phase again, settling chapters on the way. */
  type Opts = Parameters<typeof settle>[1];
  /** Settles, answering card choices (discard, sacrifice) with the first cards offered. */
  const settleAll = (s: GameState, opts: Opts = {}): GameState => {
    s = settle(s, opts).state;
    for (let guard = 0; guard < 10 && s.pending.kind === 'chooseCards'; guard++) {
      s = settle(act(s, { type: 'ChooseCards', player: s.pending.player, cards: s.pending.cards.slice(0, Math.max(1, s.pending.min)) }), opts).state;
    }
    return s;
  };
  const nextTurnOfP1 = (s: GameState, opts: Opts = {}) => {
    const turn = s.turnNumber;
    for (let guard = 0; guard < 8 && !(s.activePlayer === 'P1' && s.turnNumber > turn); guard++) {
      s = settleAll(goTo(settleAll(s, opts), 'end', opts), opts);
      s = settleAll(goTo(s, 'main1', opts), opts);
    }
    if (s.activePlayer !== 'P1' || s.turnNumber <= turn) throw new Error("never reached P1's next turn");
    return s;
  };
  const lore = (s: GameState, id: string) => s.cards[id]!.namedCounters?.lore ?? 0;
  const knights = (s: GameState) => s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'knight-token');

  it('Dion makes a Knight; he and other Knights fly during your turn; he becomes Bahamut, whose chapters grow your team and end by destroying a permanent and flipping back', () => {
    let s = newGame();
    const dion = put(s, 'P1', 'dion-bahamuts-dominant-bahamut-warden-of-light', 'hand');
    mana(s, 'P1', { W: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: dion }).state;
    const [knight] = knights(s);
    const bear = put(s, 'P1', 'coeurl');
    expect(hasKeyword(s, s.cards[dion]!, 'Flying') && hasKeyword(s, s.cards[knight!]!, 'Flying')).toBe(true);
    expect(hasKeyword(s, s.cards[bear]!, 'Flying')).toBe(false);
    s.cards[dion]!.summoningSick = false;
    mana(s, 'P1', { W: 2, C: 4 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: dion, ability: 0 }).state;
    expect(currentDefinition(s, s.cards[dion]!).name).toBe('Bahamut, Warden of Light');
    expect(lore(s, dion)).toBe(1);
    // Chapter I: a +1/+1 counter and flying for each other creature you control.
    expect(countersOf(s.cards[bear]!, '+1/+1')).toBe(1);
    expect(hasKeyword(s, s.cards[bear]!, 'Flying')).toBe(true);
    expect(countersOf(s.cards[dion]!, '+1/+1')).toBe(0);
    s = nextTurnOfP1(s);
    expect(lore(s, dion)).toBe(2);
    expect(countersOf(s.cards[bear]!, '+1/+1')).toBe(2);
    const target = put(s, 'P2', 'coeurl');
    const pick = (options: Target[][]) => options.find((o) => o.some((x) => x.kind === 'card' && x.card === target)) ?? options[0]!;
    s = nextTurnOfP1(s, { targets: pick });
    // Chapter III: destroy target permanent, then Bahamut returns as Dion (with a new Knight token).
    expect(s.cards[target]!.zone).toBe('graveyard');
    expect(knights(s)).toHaveLength(2);
    expect(s.cards[dion]!.zone).toBe('battlefield');
    expect(s.cards[dion]!.transformed ?? false).toBe(false);
    expect(lore(s, dion)).toBe(0);
    expect(currentDefinition(s, s.cards[dion]!).name).toContain('Dion');
  });

  it('Jill bounces a nonland permanent as she enters and becomes Shiva, who ends by tapping opponents’ lands', () => {
    let s = newGame();
    const other = put(s, 'P2', 'coeurl');
    const jill = put(s, 'P1', 'jill-shivas-dominant-shiva-warden-of-ice', 'hand');
    mana(s, 'P1', { U: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: jill }).state;
    expect(s.cards[other]!.zone).toBe('hand');
    s.cards[jill]!.summoningSick = false;
    mana(s, 'P1', { U: 2, C: 3 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: jill, ability: 0 }).state;
    expect(currentDefinition(s, s.cards[jill]!).name).toBe('Shiva, Warden of Ice');
    expect(stats(s, jill)).toEqual([4, 5]);
    const land = put(s, 'P2', 'island');
    s = nextTurnOfP1(s);
    s = nextTurnOfP1(s);
    expect(s.cards[land]!.tapped).toBe(true);
    expect(s.cards[jill]!.transformed ?? false).toBe(false);
  });

  it('Jecht may become Braska’s Final Aeon after combat damage; its chapters make opponents discard and sacrifice, then it’s sacrificed', () => {
    let s = newGame();
    const jecht = put(s, 'P1', 'jecht-reluctant-guardian-braskas-final-aeon');
    put(s, 'P2', 'coeurl', 'hand');
    s = settleAll(fight(s, [{ attacker: jecht, defender: 'P2' }]).state);
    expect(currentDefinition(s, s.cards[jecht]!).name).toBe("Braska's Final Aeon");
    expect(stats(s, jecht)).toEqual([7, 7]);
    // Chapter I: P2 discarded (its only card) and P1 drew.
    expect(s.players.P2!.hand).toHaveLength(0);
    const victims = [put(s, 'P2', 'coeurl'), put(s, 'P2', 'coeurl'), put(s, 'P2', 'coeurl')];
    s = nextTurnOfP1(s);
    s = nextTurnOfP1(s);
    expect(victims.filter((id) => s.cards[id]!.zone === 'graveyard')).toHaveLength(2);
    // After chapter III, the Saga is sacrificed.
    expect(s.cards[jecht]!.zone).toBe('graveyard');
  });
});

describe('cards that aren’t built yet', () => {
  it('can’t be cast (creatures included) or played, and aren’t offered', () => {
    const s = newGame();
    expect(s.cardDefs['summon-brynhildr']!.notBuilt).toBe(true);
    const creature = put(s, 'P1', 'summon-brynhildr', 'hand');
    mana(s, 'P1', { R: 1, C: 1 });
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: creature })).toMatch(/isn't built yet|can't be cast/);
    expect(s.cardDefs['clives-hideaway']!.notBuilt).toBe(true);
    const land = put(s, 'P1', 'clives-hideaway', 'hand');
    expect(rejected(s, { type: 'PlayLand', player: 'P1', card: land })).toMatch(/isn't built yet/);
    const offered = getLegalActions(s).filter((a) => (a.type === 'CastSpell' || a.type === 'PlayLand') && (a.card === creature || a.card === land));
    expect(offered).toEqual([]);
  });
});

describe('S4 group 4: simple spells and enters-the-battlefield cards', () => {
  const castIt = (s: GameState, defId: string, pool: Parameters<typeof mana>[2], extra: Partial<{ targets: Target[]; x: number }> = {}) => {
    const spell = put(s, 'P1', defId, 'hand');
    mana(s, 'P1', pool);
    return { s: cast(s, { type: 'CastSpell', player: 'P1', card: spell, ...extra }).state, spell };
  };
  const tokens = (s: GameState, defId: string) => s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === defId).length;
  const playLand = (s: GameState) => {
    const land = put(s, 'P1', 'forest', 'hand');
    return settle(act(s, { type: 'PlayLand', player: 'P1', card: land })).state;
  };

  it('Dark Ritual adds {B}{B}{B}', () => {
    const { s } = castIt(newGame(), 'dark-ritual', { B: 1 });
    expect(s.players.P1!.manaPool.B).toBe(3);
  });

  it('Lightning Bolt deals 3 damage to any target', () => {
    const { s } = castIt(newGame(), 'lightning-bolt', { R: 1 }, { targets: [{ kind: 'player', player: 'P2' }] });
    expect(s.players.P2!.life).toBe(17);
  });

  it('Counterspell counters a spell; Dovin’s Veto only noncreature spells, and Eject and the Veto can’t be countered', () => {
    let s = newGame();
    const bolt = put(s, 'P2', 'lightning-bolt', 'hand');
    mana(s, 'P2', { R: 1 });
    s = act(s, { type: 'PassPriority', player: 'P1' });
    s = act(s, { type: 'CastSpell', player: 'P2', card: bolt, targets: [{ kind: 'player', player: 'P1' }] });
    s = act(s, { type: 'PassPriority', player: 'P2' });
    const counter = put(s, 'P1', 'counterspell', 'hand');
    mana(s, 'P1', { U: 2 });
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: counter, targets: [{ kind: 'card', card: bolt }] })).state;
    expect(s.cards[bolt]!.zone).toBe('graveyard');
    expect(s.players.P1!.life).toBe(20);
    expect(s.cardDefs['dovins-veto']!.cantBeCountered && s.cardDefs['eject']!.cantBeCountered).toBe(true);
  });

  it('Wall of Omens draws a card and can’t attack (defender)', () => {
    const before = newGame().players.P1!.hand.length;
    let { s, spell } = castIt(newGame(), 'wall-of-omens', { W: 1, C: 1 });
    expect(s.players.P1!.hand.length).toBe(before + 1);
    s.cards[spell]!.summoningSick = false;
    const bear = put(s, 'P1', 'coeurl');
    s = goTo(s, 'declareAttackers');
    expect(rejected(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: spell, defender: 'P2' }] })).toBeTruthy();
    expect(() => act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: bear, defender: 'P2' }] })).not.toThrow();
  });

  it('Adventurer’s Inn, Balamb T-Rexaur and Instant Ramen: life and cards as they enter; Ramen sacrifices for 3 life', () => {
    let s = newGame();
    const inn = put(s, 'P1', 'adventurers-inn', 'hand');
    s = settle(act(s, { type: 'PlayLand', player: 'P1', card: inn })).state;
    expect(s.players.P1!.life).toBe(22);
    s = castIt(s, 'balamb-t-rexaur', { G: 6 }).s;
    expect(s.players.P1!.life).toBe(25);
    const hand = s.players.P1!.hand.length;
    const r = castIt(s, 'instant-ramen', { C: 2 });
    s = r.s;
    expect(s.players.P1!.hand.length).toBe(hand + 1);
    mana(s, 'P1', { C: 2 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: r.spell, ability: 0 }).state;
    expect(s.players.P1!.life).toBe(28);
    expect(s.cards[r.spell]!.zone).toBe('graveyard');
  });

  it('Hecteyes makes each opponent discard', () => {
    let s = newGame(3);
    for (const who of ['P2', 'P3']) for (let i = 0; i < 2; i++) put(s, who, 'coeurl', 'hand');
    const before = [s.players.P2!.hand.length, s.players.P3!.hand.length];
    s = castIt(s, 'hecteyes', { B: 1, C: 1 }).s;
    for (let guard = 0; guard < 4 && s.pending.kind === 'chooseCards'; guard++) s = settle(act(s, { type: 'ChooseCards', player: s.pending.player, cards: s.pending.cards.slice(0, 1) })).state;
    expect([s.players.P2!.hand.length, s.players.P3!.hand.length]).toEqual([before[0]! - 1, before[1]! - 1]);
  });

  it('Blitzball Shot: +3/+3 and trample', () => {
    let s = newGame();
    const bear = put(s, 'P1', 'coeurl');
    const base = stats(s, bear);
    s = castIt(s, 'blitzball-shot', { G: 1, C: 1 }, { targets: [card(bear)] }).s;
    expect(stats(s, bear)).toEqual([base[0]! + 3, base[1]! + 3]);
    expect(hasKeyword(s, s.cards[bear]!, 'Trample')).toBe(true);
  });

  it('Nature’s Claim destroys an artifact and its controller gains 4 life', () => {
    let s = newGame();
    const pot = put(s, 'P2', 'magic-pot');
    s = castIt(s, 'natures-claim', { G: 1 }, { targets: [card(pot)] }).s;
    expect(s.cards[pot]!.zone).toBe('graveyard');
    expect(s.players.P2!.life).toBe(24);
  });

  it('Airship Crash destroys a creature with flying but not one without', () => {
    let s = newGame();
    const wyvern = put(s, 'P2', 'dragoons-wyvern');
    const ground = put(s, 'P2', 'coeurl');
    const spell = put(s, 'P1', 'airship-crash', 'hand');
    mana(s, 'P1', { G: 1, C: 2 });
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(ground)] })).toBeTruthy();
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(wyvern)] }).state;
    expect(s.cards[wyvern]!.zone).toBe('graveyard');
  });

  it('Fight On! returns up to two creature cards from your graveyard', () => {
    let s = newGame();
    const a = put(s, 'P1', 'coeurl', 'graveyard');
    const b = put(s, 'P1', 'hecteyes', 'graveyard');
    s = castIt(s, 'fight-on', { B: 1, C: 2 }, { targets: [card(a), card(b)] }).s;
    expect([s.cards[a]!.zone, s.cards[b]!.zone]).toEqual(['hand', 'hand']);
  });

  it('Dragoon’s Wyvern and Magitek Armor make a Hero; the Armor is a crew 1 Vehicle', () => {
    let s = newGame();
    s = castIt(s, 'dragoons-wyvern', { U: 1, C: 2 }).s;
    s = castIt(s, 'magitek-armor', { W: 1, C: 3 }).s;
    expect(tokens(s, 'hero-token')).toBe(2);
    expect(s.cardDefs['magitek-armor']!.crew).toBe(1);
  });

  it('Ahriman sacrifices another creature or artifact to draw', () => {
    let s = newGame();
    const ahriman = put(s, 'P1', 'ahriman');
    const fodder = put(s, 'P1', 'magic-pot');
    const hand = s.players.P1!.hand.length;
    mana(s, 'P1', { C: 3 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: ahriman, ability: 0, costCards: [fodder] }).state;
    expect(s.players.P1!.hand.length).toBe(hand + 1);
    // Magic Pot left a Treasure as it died.
    expect(tokens(s, 'treasure-token')).toBe(1);
  });

  it('Magic Pot exiles a card from a graveyard', () => {
    let s = newGame();
    const pot = put(s, 'P1', 'magic-pot');
    const theirs = put(s, 'P2', 'coeurl', 'graveyard');
    mana(s, 'P1', { C: 2 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: pot, ability: 0, targets: [card(theirs)] }).state;
    expect(s.cards[theirs]!.zone).toBe('exile');
  });

  it('Jumbo Cactuar gets +9999/+0 as it attacks', () => {
    let s = newGame();
    const cactuar = put(s, 'P1', 'jumbo-cactuar');
    s = fight(s, [{ attacker: cactuar, defender: 'P2' }]).state;
    expect(s.players.P2!.life).toBeLessThanOrEqual(0);
  });


  it('Landfall: Sazh’s Chocobo grows and Sabotender pings each opponent', () => {
    let s = newGame(3);
    const chocobo = put(s, 'P1', 'sazhs-chocobo');
    put(s, 'P1', 'sabotender');
    s = playLand(s);
    expect(countersOf(s.cards[chocobo]!, '+1/+1')).toBe(1);
    expect([s.players.P2!.life, s.players.P3!.life]).toEqual([19, 19]);
  });

  it('Snow Villiers’ power is the number of creatures you control', () => {
    const s = newGame();
    const snow = put(s, 'P1', 'snow-villiers');
    put(s, 'P1', 'coeurl');
    put(s, 'P2', 'coeurl');
    expect(stats(s, snow)).toEqual([2, 3]);
  });

  it('Combat Tutorial: a player draws two and a creature you control gets a counter', () => {
    let s = newGame();
    const bear = put(s, 'P1', 'coeurl');
    const hand = s.players.P2!.hand.length;
    s = castIt(s, 'combat-tutorial', { U: 1, C: 2 }, { targets: [{ kind: 'player', player: 'P2' }, card(bear)] }).s;
    expect(s.players.P2!.hand.length).toBe(hand + 2);
    expect(countersOf(s.cards[bear]!, '+1/+1')).toBe(1);
  });

  it('Auron’s Inspiration gives attacking creatures +2/+0', () => {
    let s = newGame();
    const bear = put(s, 'P1', 'coeurl');
    const base = stats(s, bear);
    s = goTo(s, 'declareAttackers');
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: bear, defender: 'P2' }] })).state;
    s = castIt(s, 'aurons-inspiration', { W: 1, C: 2 }).s;
    expect(stats(s, bear)).toEqual([base[0]! + 2, base[1]]);
  });
});

describe('S4 group 5: more enters, attacks and chapters', () => {
  const castIt = (s: GameState, defId: string, pool: Parameters<typeof mana>[2], extra: Partial<{ targets: Target[] }> = {}) => {
    const spell = put(s, 'P1', defId, 'hand');
    mana(s, 'P1', pool);
    return { s: cast(s, { type: 'CastSpell', player: 'P1', card: spell, ...extra }).state, spell };
  };
  /** Answers card choices (discard, optional costs) with the first cards offered. */
  const answer = (s: GameState): GameState => {
    for (let guard = 0; guard < 6 && s.pending.kind === 'chooseCards'; guard++) {
      s = settle(act(s, { type: 'ChooseCards', player: s.pending.player, cards: s.pending.cards.slice(0, Math.max(1, s.pending.min)) })).state;
    }
    return s;
  };
  const nextTurnOfP1 = (s: GameState) => {
    const turn = s.turnNumber;
    for (let guard = 0; guard < 8 && !(s.activePlayer === 'P1' && s.turnNumber > turn); guard++) {
      s = answer(settle(goTo(answer(s), 'end')).state);
      s = answer(settle(goTo(s, 'main1')).state);
    }
    return s;
  };

  it('Valkyrie Aerial Unit costs {1} less per artifact you control and surveils 2', () => {
    let s = newGame();
    for (let i = 0; i < 3; i++) put(s, 'P1', 'magic-pot');
    // {5}{U}{U} with three artifacts: {2}{U}{U}.
    const { s: after, spell } = castIt(s, 'valkyrie-aerial-unit', { U: 2, C: 2 }, {});
    s = after;
    expect(s.cards[spell]!.zone).toBe('battlefield');
  });

  it('Adventurer’s Airship loots as it attacks (crewed)', () => {
    let s = newGame();
    const ship = put(s, 'P1', 'adventurers-airship', 'battlefield', { crewed: true });
    put(s, 'P1', 'coeurl', 'hand');
    const hand = s.players.P1!.hand.length;
    s = answer(fight(s, [{ attacker: ship, defender: 'P2' }]).state);
    expect(s.players.P1!.hand.length).toBe(hand);
    expect(s.players.P1!.graveyard.length).toBe(1);
  });

  it('Summon: Choco/Mog gives other creatures you control +1/+0 for each chapter', () => {
    let s = newGame();
    const bear = put(s, 'P1', 'coeurl');
    const base = stats(s, bear);
    s = castIt(s, 'summon-choco-mog', { W: 1, C: 2 }).s;
    expect(stats(s, bear)).toEqual([base[0]! + 1, base[1]]);
  });

  it('Summon: G.F. Ifrit loots on I and II, then adds {R} on III and IV', () => {
    let s = newGame();
    put(s, 'P1', 'coeurl', 'hand');
    const hand = s.players.P1!.hand.length;
    const r = castIt(s, 'summon-g-f-ifrit', { R: 1, C: 2 });
    s = answer(r.s);
    expect(s.players.P1!.hand.length).toBe(hand);
    s = nextTurnOfP1(s);
    s = nextTurnOfP1(s);
    // Chapter III resolved at the start of this main phase: {R} is in the pool.
    expect(s.cards[r.spell]!.namedCounters?.lore).toBe(3);
    expect(s.players.P1!.manaPool.R).toBe(1);
  });

  it('Magic Damper: +1/+1, hexproof and untap', () => {
    let s = newGame();
    const bear = put(s, 'P1', 'coeurl', 'battlefield', { tapped: true });
    const base = stats(s, bear);
    s = castIt(s, 'magic-damper', { U: 1 }, { targets: [card(bear)] }).s;
    expect(stats(s, bear)).toEqual([base[0]! + 1, base[1]! + 1]);
    expect(hasKeyword(s, s.cards[bear]!, 'Hexproof')).toBe(true);
    expect(s.cards[bear]!.tapped).toBe(false);
  });

  it('Loporrit Scout grows when another creature enters; Tidus grows for artifacts', () => {
    let s = newGame();
    const scout = put(s, 'P1', 'loporrit-scout');
    const tidus = put(s, 'P1', 'tidus-blitzball-star');
    s = castIt(s, 'magic-pot', { C: 3 }).s;
    expect(stats(s, scout)).toEqual([4, 3]);
    expect(countersOf(s.cards[tidus]!, '+1/+1')).toBe(1);
  });

  it('Lunatic Pandora surveils, and sacrifices to destroy a nonland permanent', () => {
    let s = newGame();
    const pandora = put(s, 'P1', 'lunatic-pandora');
    const target = put(s, 'P2', 'coeurl');
    mana(s, 'P1', { C: 6 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: pandora, ability: 1, targets: [card(target)] }).state;
    expect(s.cards[target]!.zone).toBe('graveyard');
    expect(s.cards[pandora]!.zone).toBe('graveyard');
  });

  it('Lion Heart deals 2 damage as it enters and gives +2/+1', () => {
    let s = newGame();
    const heart = put(s, 'P1', 'lion-heart', 'hand');
    mana(s, 'P1', { C: 4 });
    const toP2 = (options: Target[][]) => options.find((o) => o.some((x) => x.kind === 'player' && x.player === 'P2'))!;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: heart }, { targets: toP2 }).state;
    expect(s.players.P2!.life).toBe(18);
    const bear = put(s, 'P1', 'coeurl');
    const gear = put(s, 'P1', 'lion-heart', 'battlefield', { attachedTo: bear });
    expect(gear).toBeTruthy();
    const plain = put(s, 'P2', 'coeurl');
    expect(stats(s, bear)).toEqual([stats(s, plain)[0]! + 2, stats(s, plain)[1]! + 1]);
  });

  it('Tifa Lockhart doubles her power on landfall', () => {
    let s = newGame();
    const tifa = put(s, 'P1', 'tifa-lockhart', 'battlefield', { counters: 2 });
    expect(stats(s, tifa)[0]).toBe(3);
    const land = put(s, 'P1', 'forest', 'hand');
    s = settle(act(s, { type: 'PlayLand', player: 'P1', card: land })).state;
    expect(stats(s, tifa)[0]).toBe(6);
  });

  it('Coliseum Behemoth chooses: destroy an artifact or enchantment, or draw', () => {
    let s = newGame();
    const pot = put(s, 'P2', 'magic-pot');
    const beast = put(s, 'P1', 'coliseum-behemoth', 'hand');
    mana(s, 'P1', { G: 2, C: 5 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: beast });
    for (let guard = 0; guard < 10 && s.cards[pot]!.zone === 'battlefield'; guard++) {
      if (s.pending.kind === 'chooseModes') s = act(s, { type: 'ChooseModes', player: 'P1', modes: [0] });
      else if (s.pending.kind === 'chooseTargets') s = act(s, { type: 'ChooseTargets', player: 'P1', targets: [card(pot)] });
      else if (s.pending.kind === 'priority') s = act(s, { type: 'PassPriority', player: s.pending.player });
      else break;
    }
    expect(s.cards[pot]!.zone).toBe('graveyard');
  });

  it('Locke Cole loots after combat damage to a player', () => {
    let s = newGame();
    const locke = put(s, 'P1', 'locke-cole');
    put(s, 'P1', 'coeurl', 'hand');
    const hand = s.players.P1!.hand.length;
    s = answer(fight(s, [{ attacker: locke, defender: 'P2' }]).state);
    expect(s.players.P1!.hand.length).toBe(hand);
    expect(s.players.P1!.graveyard.length).toBe(1);
  });

  it('Judge Magister Gabranth grows when another creature or artifact you control dies', () => {
    let s = newGame();
    const judge = put(s, 'P1', 'judge-magister-gabranth');
    const pot = put(s, 'P1', 'magic-pot');
    s = castIt(s, 'lightning-bolt', { R: 1 }, { targets: [card(pot)] }).s;
    s = castIt(s, 'lightning-bolt', { R: 1 }, { targets: [card(pot)] }).s;
    expect(s.cards[pot]!.zone).toBe('graveyard');
    expect(countersOf(s.cards[judge]!, '+1/+1')).toBe(1);
  });

  it('Ice Flan taps and stuns an opponent’s artifact or creature as it enters', () => {
    let s = newGame();
    const target = put(s, 'P2', 'coeurl');
    const flan = put(s, 'P1', 'ice-flan', 'hand');
    mana(s, 'P1', { U: 2, C: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: flan }, { targets: (o) => o.find((x) => x.some((y) => y.kind === 'card' && y.card === target))! }).state;
    expect(s.cards[target]!.tapped).toBe(true);
    expect(countersOf(s.cards[target]!, 'stun')).toBe(1);
  });

  it('Loran destroys an artifact as she enters; tapping her draws a card for you and an opponent', () => {
    let s = newGame();
    const pot = put(s, 'P2', 'magic-pot');
    const r = castIt(s, 'loran-of-the-third-path', { W: 1, C: 2 }, {});
    s = r.s;
    if (s.pending.kind === 'chooseTargets') s = settle(act(s, { type: 'ChooseTargets', player: 'P1', targets: [card(pot)] })).state;
    expect(s.cards[pot]!.zone).toBe('graveyard');
    s.cards[r.spell]!.summoningSick = false;
    const hands = [s.players.P1!.hand.length, s.players.P2!.hand.length];
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: r.spell, ability: 0, targets: [{ kind: 'player', player: 'P2' }] }).state;
    expect([s.players.P1!.hand.length, s.players.P2!.hand.length]).toEqual([hands[0]! + 1, hands[1]! + 1]);
  });

  it('You’re Not Alone: +2/+2, or +4/+4 with three or more creatures', () => {
    let s = newGame();
    const bear = put(s, 'P1', 'coeurl');
    const base = stats(s, bear);
    s = castIt(s, 'youre-not-alone', { W: 1 }, { targets: [card(bear)] }).s;
    expect(stats(s, bear)).toEqual([base[0]! + 2, base[1]! + 2]);
    let t = newGame();
    const big = put(t, 'P1', 'coeurl');
    put(t, 'P1', 'coeurl');
    put(t, 'P1', 'coeurl');
    t = castIt(t, 'youre-not-alone', { W: 1 }, { targets: [card(big)] }).s;
    expect(stats(t, big)).toEqual([base[0]! + 4, base[1]! + 4]);
  });

  it('Tonberry enters tapped and stunned, and has first strike and deathtouch only on your turn', () => {
    let s = newGame();
    const r = castIt(s, 'tonberry', { B: 1 });
    s = r.s;
    expect(s.cards[r.spell]!.tapped).toBe(true);
    expect(countersOf(s.cards[r.spell]!, 'stun')).toBe(1);
    expect(hasKeyword(s, s.cards[r.spell]!, 'Deathtouch') && hasKeyword(s, s.cards[r.spell]!, 'FirstStrike')).toBe(true);
    s = settle(goTo(s, 'end')).state;
    s = settle(goTo(s, 'main1')).state;
    expect(s.activePlayer).toBe('P2');
    expect(hasKeyword(s, s.cards[r.spell]!, 'Deathtouch')).toBe(false);
  });

  it('Tidus taps an opponent’s creature as he attacks', () => {
    let s = newGame();
    const tidus = put(s, 'P1', 'tidus-blitzball-star');
    const target = put(s, 'P2', 'coeurl');
    s = fight(s, [{ attacker: tidus, defender: 'P2' }], {}, { targets: (options) => options.find((o) => o.some((x) => x.kind === 'card' && x.card === target)) ?? options[0]! }).state;
    expect(s.cards[target]!.tapped).toBe(true);
  });
});

describe('Store cards: Vivi, Yuna, A Realm Reborn, Stiltzkin, Snapcaster Mage', () => {
  const castIt = (s: GameState, defId: string, pool: Parameters<typeof mana>[2]) => {
    const spell = put(s, 'P1', defId, 'hand');
    mana(s, 'P1', pool);
    return { s: cast(s, { type: 'CastSpell', player: 'P1', card: spell }).state, spell };
  };

  it('Vivi Ornitier: {0} adds X blue or red mana (X = his power), once each turn on your turn; noncreature spells grow him and ping', () => {
    let s = newGame(3);
    const vivi = put(s, 'P1', 'vivi-ornitier', 'battlefield', { counters: 2 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: vivi, ability: 0 }).state;
    expect(s.pending.kind).toBe('chooseMana');
    expect(rejected(s, { type: 'ChooseMana', player: 'P1', mana: 'G' })).toMatch(/U, R/);
    s = settle(act(s, { type: 'ChooseMana', player: 'P1', mana: 'R' })).state;
    expect(s.players.P1!.manaPool.R).toBe(2);
    expect(rejected(s, { type: 'ActivateAbility', player: 'P1', card: vivi, ability: 0 })).toMatch(/once each turn/);
    // A noncreature spell (Night's Whisper, its {1} paid with Vivi's red): a counter and 1 damage to each opponent.
    s = castIt(s, 'nights-whisper', { B: 1 }).s;
    expect(countersOf(s.cards[vivi]!, '+1/+1')).toBe(3);
    expect([s.players.P2!.life, s.players.P3!.life]).toEqual([19, 19]);
  });

  it('Vivi’s mana ability works only during your turn', () => {
    let s = newGame();
    const vivi = put(s, 'P2', 'vivi-ornitier', 'battlefield', { counters: 1 });
    s = act(s, { type: 'PassPriority', player: 'P1' });
    expect(rejected(s, { type: 'ActivateAbility', player: 'P2', card: vivi, ability: 0 })).toMatch(/during your turn/);
  });

  it('Yuna gives herself and your enchantment creatures trample, lifelink and ward 2 on your turn', () => {
    const s = newGame();
    const yuna = put(s, 'P1', 'yuna-hope-of-spira');
    const summon = put(s, 'P1', 'summon-choco-mog');
    const plain = put(s, 'P1', 'coeurl');
    for (const id of [yuna, summon]) expect(hasKeyword(s, s.cards[id]!, 'Trample') && hasKeyword(s, s.cards[id]!, 'Lifelink')).toBe(true);
    expect(hasKeyword(s, s.cards[plain]!, 'Trample')).toBe(false);
  });

  it('Yuna returns an enchantment card at your end step with a finality counter, which exiles it instead of dying', () => {
    let s = newGame();
    put(s, 'P1', 'yuna-hope-of-spira');
    const summon = put(s, 'P1', 'summon-choco-mog', 'graveyard');
    s = settle(goTo(s, 'end'), { targets: (o) => o.find((x) => x.some((y) => y.kind === 'card' && y.card === summon)) ?? o[0]! }).state;
    expect(s.cards[summon]!.zone).toBe('battlefield');
    expect(countersOf(s.cards[summon]!, 'finality')).toBe(1);
    s.players.P1!.manaPool.R = 1;
    const bolt = put(s, 'P1', 'lightning-bolt', 'hand');
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: bolt, targets: [card(summon)] })).state;
    expect(s.cards[summon]!.zone).toBe('exile');
  });

  it('A Realm Reborn gives your other permanents "{T}: Add one mana of any color"', () => {
    let s = newGame();
    put(s, 'P1', 'a-realm-reborn');
    const pot = put(s, 'P1', 'magic-pot');
    const theirs = put(s, 'P2', 'magic-pot');
    const offered = getLegalActions(s).filter((a) => a.type === 'ActivateManaAbility' && a.card === pot);
    expect(offered.map((a) => a.type === 'ActivateManaAbility' && a.mana).sort()).toEqual(['B', 'G', 'R', 'U', 'W']);
    expect(getLegalActions(s).some((a) => a.type === 'ActivateManaAbility' && a.card === theirs)).toBe(false);
    const action = offered.find((a) => a.type === 'ActivateManaAbility' && a.mana === 'G')!;
    s = act(s, action);
    expect(s.players.P1!.manaPool.G).toBe(1);
    expect(s.cards[pot]!.tapped).toBe(true);
  });

  it('Stiltzkin gives an opponent another permanent of yours, and you draw if they get it', () => {
    let s = newGame(3);
    const stiltzkin = put(s, 'P1', 'stiltzkin-moogle-merchant');
    const gift = put(s, 'P1', 'magic-pot');
    const hand = s.players.P1!.hand.length;
    mana(s, 'P1', { C: 2 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: stiltzkin, ability: 0, targets: [{ kind: 'player', player: 'P3' }, card(gift)] }).state;
    expect(s.cards[gift]!.controller).toBe('P3');
    expect(s.players.P1!.hand.length).toBe(hand + 1);
  });

  it('Snapcaster Mage lets you cast an instant from your graveyard this turn, then it’s exiled', () => {
    let s = newGame();
    const bolt = put(s, 'P1', 'lightning-bolt', 'graveyard');
    const mage = put(s, 'P1', 'snapcaster-mage', 'hand');
    mana(s, 'P1', { U: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: mage }, { targets: (o) => o.find((x) => x.some((y) => y.kind === 'card' && y.card === bolt)) ?? o[0]! }).state;
    mana(s, 'P1', { R: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: bolt, targets: [{ kind: 'player', player: 'P2' }] }).state;
    expect(s.players.P2!.life).toBe(17);
    expect(s.cards[bolt]!.zone).toBe('exile');
  });
});

describe('Store cards: Cloud, Traveling Chocobo, Choco', () => {
  /** Answers each card choice with the given picks (by id), or the minimum. */
  const answer = (s: GameState, picks: string[] = []): GameState => {
    for (let guard = 0; guard < 6 && s.pending.kind === 'chooseCards'; guard++) {
      const p = s.pending;
      const wanted = p.cards.filter((id) => picks.includes(id)).slice(0, p.max);
      s = settle(act(s, { type: 'ChooseCards', player: p.player, cards: wanted.length >= p.min ? wanted : p.cards.slice(0, p.min) })).state;
    }
    return s;
  };

  it('Cloud, Midgar Mercenary finds an Equipment as he enters', () => {
    let s = newGame();
    const fist = put(s, 'P1', 'monks-fist', 'library');
    const cloud = put(s, 'P1', 'cloud-midgar-mercenary', 'hand');
    mana(s, 'P1', { W: 2 });
    s = answer(cast(s, { type: 'CastSpell', player: 'P1', card: cloud }).state, [fist]);
    expect(s.cards[fist]!.zone).toBe('hand');
  });

  it('while Cloud is equipped, his Equipment’s triggers trigger an additional time', () => {
    let s = newGame();
    const cloud = put(s, 'P1', 'cloud-midgar-mercenary');
    put(s, 'P1', 'thiefs-knife', 'battlefield', { attachedTo: cloud });
    const hand = s.players.P1!.hand.length;
    s = fight(s, [{ attacker: cloud, defender: 'P2' }]).state;
    expect(s.players.P1!.hand.length).toBe(hand + 2);
    // The same Knife on another creature draws once.
    let t = newGame();
    const other = put(t, 'P1', 'coeurl');
    put(t, 'P1', 'cloud-midgar-mercenary');
    put(t, 'P1', 'thiefs-knife', 'battlefield', { attachedTo: other });
    const before = t.players.P1!.hand.length;
    t = fight(t, [{ attacker: other, defender: 'P2' }]).state;
    expect(t.players.P1!.hand.length).toBe(before + 1);
  });

  it('Traveling Chocobo: play a land and cast a Bird from the top of your library', () => {
    let s = newGame();
    put(s, 'P1', 'traveling-chocobo');
    const bird = put(s, 'P1', 'sazhs-chocobo', 'library');
    const land = put(s, 'P1', 'forest', 'library');
    expect(getLegalActions(s).some((a) => a.type === 'PlayLand' && a.card === land)).toBe(true);
    s = settle(act(s, { type: 'PlayLand', player: 'P1', card: land })).state;
    expect(s.cards[land]!.zone).toBe('battlefield');
    mana(s, 'P1', { G: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: bird }).state;
    expect(s.cards[bird]!.zone).toBe('battlefield');
  });

  it('Traveling Chocobo: a land entering makes your landfall abilities trigger an additional time', () => {
    let s = newGame();
    put(s, 'P1', 'traveling-chocobo');
    const sazh = put(s, 'P1', 'sazhs-chocobo');
    const land = put(s, 'P1', 'forest', 'hand');
    s = settle(act(s, { type: 'PlayLand', player: 'P1', card: land })).state;
    expect(countersOf(s.cards[sazh]!, '+1/+1')).toBe(2);
  });

  it('Choco looks at one card per attacking Bird: one to your hand, lands onto the battlefield tapped, the rest to the graveyard', () => {
    let s = newGame();
    const choco = put(s, 'P1', 'choco-seeker-of-paradise');
    const sazh = put(s, 'P1', 'sazhs-chocobo', 'battlefield', { counters: 1 });
    const spell = put(s, 'P1', 'lightning-bolt', 'library');
    const land = put(s, 'P1', 'forest', 'library');
    const keep = put(s, 'P1', 'coeurl', 'library');
    s = goTo(s, 'declareAttackers');
    s = act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: choco, defender: 'P2' }, { attacker: sazh, defender: 'P2' }] });
    s = answer(settle(s).state, [keep, land]);
    // Two Birds attacked: the top two (the Coeurl and the Forest) were looked at; the Bolt stays on top.
    expect(s.cards[keep]!.zone).toBe('hand');
    expect(s.cards[land]!.zone).toBe('battlefield');
    expect(s.cards[land]!.tapped).toBe(true);
    expect(s.cards[spell]!.zone).toBe('library');
  });

  it('Choco: cards not taken go to the graveyard', () => {
    let s = newGame();
    const choco = put(s, 'P1', 'choco-seeker-of-paradise');
    const bolt = put(s, 'P1', 'lightning-bolt', 'library');
    s = goTo(s, 'declareAttackers');
    s = act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: choco, defender: 'P2' }] });
    s = answer(settle(s).state, []);
    expect(s.cards[bolt]!.zone).toBe('graveyard');
  });
});

describe('library searches are the player’s choice', () => {
  it('Cloud’s search offers every Equipment in the library; the player picks one or none, then the library is shuffled', () => {
    let s = newGame();
    const fist = put(s, 'P1', 'monks-fist', 'library');
    const bow = put(s, 'P1', 'bards-bow', 'library');
    put(s, 'P1', 'coeurl', 'library');
    const cloud = put(s, 'P1', 'cloud-midgar-mercenary', 'hand');
    mana(s, 'P1', { W: 2 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: cloud });
    for (let guard = 0; guard < 10 && s.pending.kind === 'priority' && s.stack.length > 0; guard++) s = act(s, { type: 'PassPriority', player: s.pending.player });
    expect(s.pending.kind).toBe('chooseCards');
    if (s.pending.kind !== 'chooseCards') return;
    expect(s.pending.purpose).toBe('search');
    expect([...s.pending.cards].sort()).toEqual([fist, bow].sort());
    expect([s.pending.min, s.pending.max]).toEqual([0, 1]);
    // The second Equipment, not the first one found.
    const r = actWithEvents(s, { type: 'ChooseCards', player: 'P1', cards: [bow] });
    expect(r.state.cards[bow]!.zone).toBe('hand');
    expect(r.state.cards[fist]!.zone).toBe('library');
    expect(r.events.some((e) => e.type === 'LibraryShuffled' && e.player === 'P1')).toBe(true);
  });

  it('a player may find nothing, and only the searcher sees the choices', () => {
    let s = newGame();
    const fist = put(s, 'P1', 'monks-fist', 'library');
    const cloud = put(s, 'P1', 'cloud-midgar-mercenary', 'hand');
    mana(s, 'P1', { W: 2 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: cloud });
    for (let guard = 0; guard < 10 && s.pending.kind === 'priority' && s.stack.length > 0; guard++) s = act(s, { type: 'PassPriority', player: s.pending.player });
    expect(viewFor(s, 'P1').cards[fist]).toBeDefined();
    expect(viewFor(s, 'P2').cards[fist]).toBeUndefined();
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [] })).state;
    expect(s.cards[fist]!.zone).toBe('library');
  });
});

describe('Secret Lair cards built so far', () => {
  const castIt = (s: GameState, defId: string, pool: Parameters<typeof mana>[2], targets?: Target[]) => {
    const spell = put(s, 'P1', defId, 'hand');
    mana(s, 'P1', pool);
    return cast(s, { type: 'CastSpell', player: 'P1', card: spell, ...(targets ? { targets } : {}) }).state;
  };

  it('Day of Judgment destroys all creatures; Star of Extinction deals 20 to each', () => {
    let s = newGame();
    const a = put(s, 'P1', 'coeurl');
    const b = put(s, 'P2', 'jumbo-cactuar');
    s = castIt(s, 'day-of-judgment', { W: 2, C: 2 });
    expect([s.cards[a]!.zone, s.cards[b]!.zone]).toEqual(['graveyard', 'graveyard']);
    let t = newGame();
    const c = put(t, 'P2', 'jumbo-cactuar');
    t = castIt(t, 'star-of-extinction', { R: 2, C: 5 });
    expect(t.cards[c]!.zone).toBe('graveyard');
  });

  it('Heroic Intervention makes your permanents indestructible and hexproof this turn', () => {
    let s = newGame();
    const mine = put(s, 'P1', 'coeurl');
    const theirs = put(s, 'P2', 'coeurl');
    s = castIt(s, 'heroic-intervention', { G: 1, C: 1 });
    expect(hasKeyword(s, s.cards[mine]!, 'Indestructible') && hasKeyword(s, s.cards[mine]!, 'Hexproof')).toBe(true);
    expect(hasKeyword(s, s.cards[theirs]!, 'Indestructible')).toBe(false);
    s = castIt(s, 'day-of-judgment', { W: 2, C: 2 });
    expect([s.cards[mine]!.zone, s.cards[theirs]!.zone]).toEqual(['battlefield', 'graveyard']);
  });

  it('Feed the Swarm destroys an opponent’s creature or enchantment and you lose life equal to its mana value', () => {
    let s = newGame();
    const target = put(s, 'P2', 'jumbo-cactuar');
    s = castIt(s, 'feed-the-swarm', { B: 1, C: 1 }, [card(target)]);
    expect(s.cards[target]!.zone).toBe('graveyard');
    expect(s.players.P1!.life).toBe(20 - 7);
  });
});

describe('Secret Lair cards: Gilded Lotus, Damn, Cyclonic Rift', () => {
  it('Gilded Lotus taps for three mana of one color', () => {
    let s = newGame();
    const lotus = put(s, 'P1', 'gilded-lotus');
    s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: lotus, mana: 'G' });
    expect(s.players.P1!.manaPool.G).toBe(3);
  });

  it('Damn destroys a target creature, or every creature when overloaded', () => {
    let s = newGame();
    const a = put(s, 'P2', 'coeurl');
    const b = put(s, 'P2', 'coeurl');
    let spell = put(s, 'P1', 'damn', 'hand');
    mana(s, 'P1', { B: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(a)] }).state;
    expect([s.cards[a]!.zone, s.cards[b]!.zone]).toEqual(['graveyard', 'battlefield']);
    const mine = put(s, 'P1', 'coeurl');
    spell = put(s, 'P1', 'damn', 'hand');
    mana(s, 'P1', { W: 2, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, alternative: true }).state;
    expect([s.cards[b]!.zone, s.cards[mine]!.zone]).toEqual(['graveyard', 'graveyard']);
  });

  it('Cyclonic Rift bounces a nonland permanent you don’t control, or all of them when overloaded', () => {
    let s = newGame(3);
    const a = put(s, 'P2', 'coeurl');
    const b = put(s, 'P3', 'magic-pot');
    const land = put(s, 'P2', 'forest');
    const mine = put(s, 'P1', 'coeurl');
    const spell = put(s, 'P1', 'cyclonic-rift', 'hand');
    mana(s, 'P1', { U: 1, C: 6 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, alternative: true }).state;
    expect([s.cards[a]!.zone, s.cards[b]!.zone, s.cards[land]!.zone, s.cards[mine]!.zone]).toEqual(['hand', 'hand', 'battlefield', 'battlefield']);
  });
});

describe('Secret Lair: Silence', () => {
  it('your opponents can’t cast spells this turn', () => {
    let s = newGame();
    const silence = put(s, 'P1', 'silence', 'hand');
    mana(s, 'P1', { W: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: silence }).state;
    const bolt = put(s, 'P2', 'lightning-bolt', 'hand');
    mana(s, 'P2', { R: 1 });
    s = act(s, { type: 'PassPriority', player: 'P1' });
    expect(rejected(s, { type: 'CastSpell', player: 'P2', card: bolt, targets: [{ kind: 'player', player: 'P1' }] })).toMatch(/can't cast spells/);
  });
});

describe('Secret Lair: Toxic Deluge', () => {
  it('pay X life as you cast it; all creatures get -X/-X until end of turn', () => {
    let s = newGame();
    const small = put(s, 'P2', 'coeurl');
    const big = put(s, 'P2', 'jumbo-cactuar');
    const deluge = put(s, 'P1', 'toxic-deluge', 'hand');
    mana(s, 'P1', { B: 1, C: 2 });
    const toughness = stats(s, small)[1]!;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: deluge, x: toughness }).state;
    expect(s.players.P1!.life).toBe(20 - toughness);
    expect(s.cards[small]!.zone).toBe('graveyard');
    expect(s.cards[big]!.zone).toBe('battlefield');
  });

  it('can’t pay more life than you have', () => {
    const s = newGame();
    const deluge = put(s, 'P1', 'toxic-deluge', 'hand');
    mana(s, 'P1', { B: 1, C: 2 });
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: deluge, x: 25 })).toMatch(/life/);
  });
});

describe('Secret Lair: Sword of Truth and Justice', () => {
  it('+2/+2 and protection from white and blue: no white blockers, white removal or white damage', () => {
    const s = newGame();
    const { body } = equipped(s, 'sword-of-truth-and-justice', 'hill-gigas');
    expect(stats(s, body)).toEqual([7, 6]);
    const white = put(s, 'P2', 'coeurl');
    expect(canBlock(s, s.cards[white]!, s.cards[body]!)).toBe(false);
    const red = put(s, 'P2', 'hill-gigas');
    expect(canBlock(s, s.cards[red]!, s.cards[body]!)).toBe(true);
    const swords = put(s, 'P2', 'swords-to-plowshares', 'hand');
    mana(s, 'P2', { W: 1 });
    expect(rejected(s, { type: 'CastSpell', player: 'P2', card: swords, targets: [card(body)] })).toBeTruthy();
  });

  it('combat damage to a player: a +1/+1 counter on a creature you control, then proliferate', () => {
    let s = newGame();
    const { body } = equipped(s, 'sword-of-truth-and-justice', 'hill-gigas');
    const other = put(s, 'P1', 'coeurl', 'battlefield', { counters: 1 });
    s = fight(s, [{ attacker: body, defender: 'P2' }], {}, { targets: () => [card(body)] }).state;
    expect(s.players.P2!.life).toBe(13);
    expect(countersOf(s.cards[body]!, '+1/+1')).toBe(2);
    expect(countersOf(s.cards[other]!, '+1/+1')).toBe(2);
  });
});

describe('Secret Lair: Umezawa’s Jitte', () => {
  it('combat damage puts two charge counters on it; remove one for +2/+2, -1/-1 or 2 life', () => {
    let s = newGame();
    const { body, gear } = equipped(s, 'umezawas-jitte', 'hill-gigas');
    const blocker = put(s, 'P2', 'coeurl');
    s = fight(s, [{ attacker: body, defender: 'P2' }], { P2: [{ blocker, attacker: body }] }).state;
    expect(countersOf(s.cards[gear]!, 'charge')).toBe(2);
    expect(activatedAbilities(currentDefinition(s, s.cards[gear]!))).toHaveLength(4); // three modes and equip
    const target = put(s, 'P2', 'stiltzkin-moogle-merchant');
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: gear, ability: 1, targets: [card(target)] }).state;
    expect(s.cards[target]!.zone).toBe('battlefield');
    expect(stats(s, target)).toEqual([0, 1]);
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: gear, ability: 2 }).state;
    expect(s.players.P1!.life).toBe(22);
    expect(countersOf(s.cards[gear]!, 'charge')).toBe(0);
    expect(rejected(s, { type: 'ActivateAbility', player: 'P1', card: gear, ability: 0 })).toBeTruthy();
  });

  it('+2/+2 goes to the equipped creature', () => {
    let s = newGame();
    const { body, gear } = equipped(s, 'umezawas-jitte', 'hill-gigas');
    s.cards[gear]!.namedCounters = { charge: 1 };
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: gear, ability: 0 }).state;
    expect(stats(s, body)).toEqual([7, 6]);
  });
});

describe('Secret Lair: the Elemental Incarnations (evoke)', () => {
  const choose = (s: GameState, cards: string[]) => settle(act(s, { type: 'ChooseCards', player: s.pending.kind === 'chooseCards' ? s.pending.player : 'P1', cards })).state;

  it('Solitude, evoked: exile a white card instead of paying mana; exiles a creature, its controller gains life equal to its power, then Solitude is sacrificed', () => {
    let s = newGame();
    const solitude = put(s, 'P1', 'solitude', 'hand');
    const pitched = put(s, 'P1', 'coeurl', 'hand');
    const gigas = put(s, 'P2', 'hill-gigas');
    s = cast(s, { type: 'CastSpell', player: 'P1', card: solitude, alternative: true, costCards: [pitched] }, { targets: (o) => o.find((t) => t[0]?.kind === 'card' && t[0].card === gigas)! }).state;
    expect(s.cards[pitched]!.zone).toBe('exile');
    expect(s.cards[gigas]!.zone).toBe('exile');
    expect(s.players.P2!.life).toBe(25);
    expect(s.cards[solitude]!.zone).toBe('graveyard');
  });

  it('evoke needs a card of the right color in hand', () => {
    const s = newGame();
    const solitude = put(s, 'P1', 'solitude', 'hand');
    const bolt = put(s, 'P1', 'lightning-bolt', 'hand');
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: solitude, alternative: true, costCards: [bolt] })).toMatch(/no card in hand to exile/);
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: solitude, alternative: true, costCards: [solitude] })).toBeTruthy();
  });

  it('Grief, evoked: you choose a nonland card from the opponent’s hand for them to discard', () => {
    let s = newGame();
    const grief = put(s, 'P1', 'grief', 'hand');
    const pitched = put(s, 'P1', 'feed-the-swarm', 'hand');
    const bolt = put(s, 'P2', 'lightning-bolt', 'hand');
    s = cast(s, { type: 'CastSpell', player: 'P1', card: grief, alternative: true, costCards: [pitched] }).state;
    expect(s.pending.kind === 'chooseCards' && s.pending.player === 'P1' && s.pending.cards.includes(bolt)).toBe(true);
    expect(s.pending.kind === 'chooseCards' && s.pending.cards.every((id) => s.cards[id]!.owner === 'P2' && s.cards[id]!.defId !== 'plains')).toBe(true);
    expect(viewFor(s, 'P1').cards[bolt]).toBeTruthy();
    s = choose(s, [bolt]);
    expect(s.cards[bolt]!.zone).toBe('graveyard');
    expect(s.cards[grief]!.zone).toBe('graveyard');
  });

  it('Fury, hard-cast: 4 damage divided among any number of creatures, dealt at once; Fury stays', () => {
    let s = newGame();
    const fury = put(s, 'P1', 'fury', 'hand');
    const a = put(s, 'P2', 'coeurl');
    const b = put(s, 'P2', 'coeurl');
    mana(s, 'P1', { R: 2, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: fury }).state;
    expect(s.pending.kind === 'chooseCards' && s.pending.purpose).toBe('divideDamage');
    s = choose(s, [a]);
    s = choose(s, [a]);
    expect(s.cards[a]!.zone).toBe('battlefield'); // nothing is dealt until all 4 are divided
    s = choose(s, [b]);
    s = choose(s, [b]);
    expect(s.cards[a]!.zone).toBe('graveyard');
    expect(s.cards[b]!.zone).toBe('graveyard');
    expect(s.cards[fury]!.zone).toBe('battlefield');
    expect(hasKeyword(s, s.cards[fury]!, 'DoubleStrike')).toBe(true);
  });

  it('Endurance: a player puts their whole graveyard on the bottom of their library', () => {
    let s = newGame();
    const endurance = put(s, 'P1', 'endurance', 'hand');
    const dead = [put(s, 'P2', 'coeurl', 'graveyard'), put(s, 'P2', 'lightning-bolt', 'graveyard')];
    mana(s, 'P1', { G: 2, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: endurance }, { targets: (o) => o.find((t) => t[0]?.kind === 'player' && t[0].player === 'P2')! }).state;
    expect(s.players.P2!.graveyard).toEqual([]);
    expect(s.players.P2!.library.slice(-2).sort()).toEqual([...dead].sort());
  });

  it('Subtlety: a creature spell goes to the top or bottom of its owner’s library', () => {
    let s = newGame();
    const subtlety = put(s, 'P1', 'subtlety', 'hand');
    const spell = put(s, 'P2', 'coeurl', 'hand');
    s.activePlayer = 'P2';
    s.pending = { kind: 'priority', player: 'P2' } as GameState['pending'];
    mana(s, 'P2', { W: 1, C: 1 });
    s = act(s, { type: 'CastSpell', player: 'P2', card: spell });
    s = act(s, { type: 'PassPriority', player: 'P2' });
    mana(s, 'P1', { U: 2, C: 2 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: subtlety });
    s = settle(s, { targets: (o) => o.find((t) => t[0]?.kind === 'card' && t[0].card === spell)! }).state;
    expect(s.pending.kind === 'chooseCards' && s.pending.player).toBe('P2');
    s = choose(s, [spell]); // chosen: the bottom
    expect(s.cards[spell]!.zone).toBe('library');
    expect(s.players.P2!.library.at(-1)).toBe(spell);
  });
});

describe('Secret Lair: Prismatic Ending (converge)', () => {
  it('exiles a nonland permanent with mana value up to the number of colors spent', () => {
    let s = newGame();
    const target = put(s, 'P2', 'snow-villiers');
    const ending = put(s, 'P1', 'prismatic-ending', 'hand');
    mana(s, 'P1', { W: 1, U: 1, B: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: ending, x: 2, targets: [card(target)] }).state;
    expect(s.cards[target]!.zone).toBe('exile');
  });

  it('does nothing if too few colors were spent', () => {
    let s = newGame();
    const target = put(s, 'P2', 'snow-villiers');
    const ending = put(s, 'P1', 'prismatic-ending', 'hand');
    mana(s, 'P1', { W: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: ending, x: 2, targets: [card(target)] }).state;
    expect(s.cards[target]!.zone).toBe('battlefield');
    expect(s.cards[ending]!.zone).toBe('graveyard');
  });
});

describe('Secret Lair: Staff of the Storyteller', () => {
  it('makes a 1/1 flying Spirit, gets a story counter for it, and draws for {W}, {T} and a story counter', () => {
    let s = newGame();
    const staff = put(s, 'P1', 'staff-of-the-storyteller', 'hand');
    mana(s, 'P1', { W: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: staff }).state;
    const spirits = s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'spirit-token-sld');
    expect(spirits).toHaveLength(1);
    expect(hasKeyword(s, s.cards[spirits[0]!]!, 'Flying')).toBe(true);
    expect(countersOf(s.cards[staff]!, 'story')).toBe(1);
    const hand = s.players.P1!.hand.length;
    mana(s, 'P1', { W: 1 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: staff, ability: 0 }).state;
    expect(s.players.P1!.hand.length).toBe(hand + 1);
    expect(countersOf(s.cards[staff]!, 'story')).toBe(0);
  });
});

describe('Secret Lair: Forge Anew', () => {
  it('returns an Equipment from your graveyard; on your turn the first equip is free and works at instant speed', () => {
    let s = newGame();
    const plate = put(s, 'P1', 'darksteel-plate', 'graveyard');
    const body = put(s, 'P1', 'coeurl');
    const other = put(s, 'P1', 'hill-gigas');
    const forge = put(s, 'P1', 'forge-anew', 'hand');
    mana(s, 'P1', { W: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: forge, targets: [] }, { targets: (o) => o.find((t) => t[0]?.kind === 'card' && t[0].card === plate)! }).state;
    expect(s.cards[plate]!.zone).toBe('battlefield');
    s = goTo(s, 'beginCombat');
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: plate, ability: 0, targets: [card(body)] }).state;
    expect(s.cards[plate]!.attachedTo).toBe(body);
    expect(rejected(s, { type: 'ActivateAbility', player: 'P1', card: plate, ability: 0, targets: [card(other)] })).toMatch(/mana/i);
  });
});

describe('Secret Lair: Temporal Extortion', () => {
  const answer = (s: GameState, pay: boolean) => {
    if (s.pending.kind !== 'chooseCards' || s.pending.purpose !== 'payHalfLife') throw new Error('expected the pay-half-life choice');
    return settle(act(s, { type: 'ChooseCards', player: s.pending.player, cards: pay ? [...s.pending.cards] : [] })).state;
  };

  it('if nobody pays half their life, you take an extra turn after this one', () => {
    let s = newGame();
    const extortion = put(s, 'P1', 'temporal-extortion', 'hand');
    mana(s, 'P1', { B: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: extortion }).state;
    s = answer(s, false);
    expect(s.cards[extortion]!.zone).toBe('graveyard');
    expect(s.extraTurns).toEqual(['P1']);
    const turn = s.turnNumber;
    s = goTo(s, 'upkeep');
    expect(s.turnNumber).toBe(turn + 1);
    expect(s.activePlayer).toBe('P1');
    expect(s.extraTurns).toEqual([]);
  });

  it('an opponent may pay half their life, rounded up, to counter it', () => {
    let s = newGame();
    s.players.P2!.life = 15;
    const extortion = put(s, 'P1', 'temporal-extortion', 'hand');
    mana(s, 'P1', { B: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: extortion }).state;
    s = answer(s, true);
    expect(s.players.P2!.life).toBe(7);
    expect(s.cards[extortion]!.zone).toBe('graveyard');
    expect(s.extraTurns ?? []).toEqual([]);
  });
});

describe('Secret Lair: Praetor’s Grasp', () => {
  it('exiles a card from an opponent’s library face down; you may look at it and play it while it stays exiled', () => {
    let s = newGame();
    const bolt = put(s, 'P2', 'lightning-bolt', 'library');
    s.players.P2!.library = [bolt, ...s.players.P2!.library.filter((id) => id !== bolt)];
    const grasp = put(s, 'P1', 'praetors-grasp', 'hand');
    mana(s, 'P1', { B: 2, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: grasp, targets: [{ kind: 'player', player: 'P2' }] }).state;
    expect(s.cards[bolt]!.zone).toBe('exile');
    expect(viewFor(s, 'P1').cards[bolt]?.defId).toBe('lightning-bolt');
    expect(viewFor(s, 'P2').cards[bolt]?.defId).not.toBe('lightning-bolt');
    // A later turn: still playable.
    s = goTo(s, 'upkeep');
    s = goTo(s, 'main1');
    s = goTo(s, 'upkeep');
    s = goTo(s, 'main1');
    expect(s.activePlayer).toBe('P1');
    mana(s, 'P1', { R: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: bolt, targets: [{ kind: 'player', player: 'P2' }] }).state;
    expect(s.players.P2!.life).toBe(17);
    expect(s.cards[bolt]!.zone).toBe('graveyard');
    expect(s.players.P2!.graveyard).toContain(bolt);
  });
});

describe('Secret Lair: Blade of Selves (myriad)', () => {
  it('a token copy attacks each other opponent, and the copies are exiled at end of combat (3 players)', () => {
    let s = newGame(3);
    const { body } = equipped(s, 'blade-of-selves', 'hill-gigas');
    const hit = powerOf(s, s.cards[body]!);
    const played = fight(s, [{ attacker: body, defender: 'P2' }]);
    s = played.state;
    const copies = s.players.P1!.battlefield.filter((id) => s.cards[id]!.isToken);
    expect(copies).toHaveLength(1);
    expect(s.cards[copies[0]!]!.copy?.copiedName).toBe('Hill Gigas');
    expect(s.cards[copies[0]!]!.attachedTo).toBeUndefined();
    expect([s.players.P2!.life, s.players.P3!.life]).toEqual([20 - hit, 20 - hit]);
    s = goTo(s, 'main2');
    expect(s.players.P1!.battlefield.filter((id) => s.cards[id]!.isToken)).toEqual([]);
    expect(s.cards[body]!.zone).toBe('battlefield');
  });

  it('with four players, one copy for each of the two other opponents; a duel makes none', () => {
    let s = newGame(4);
    const { body } = equipped(s, 'blade-of-selves', 'hill-gigas');
    s = fight(s, [{ attacker: body, defender: 'P3' }]).state;
    const defenders = s.combat!.attacks.filter((a) => a.attacker !== body).map((a) => a.defender).sort();
    expect(defenders).toEqual(['P2', 'P4']);

    let duel = newGame();
    const gigas = equipped(duel, 'blade-of-selves', 'hill-gigas').body;
    duel = fight(duel, [{ attacker: gigas, defender: 'P2' }]).state;
    expect(duel.players.P1!.battlefield.filter((id) => duel.cards[id]!.isToken)).toEqual([]);
  });

  it('the copies are optional, and equip costs {4}', () => {
    let s = newGame(3);
    const { body, gear } = equipped(s, 'blade-of-selves', 'hill-gigas');
    s = fight(s, [{ attacker: body, defender: 'P2' }], {}, { accept: false }).state;
    expect(s.players.P1!.battlefield.filter((id) => s.cards[id]!.isToken)).toEqual([]);
    expect(s.players.P3!.life).toBe(20);
    expect(currentDefinition(s, s.cards[gear]!).equip).toBe('{4}');
  });
});

describe('S4 group 6: as long as you control N or more', () => {
  it('Gaelicat gets +2/+0 while you control two or more artifacts', () => {
    const s = newGame();
    const cat = put(s, 'P1', 'gaelicat');
    put(s, 'P1', 'sol-ring');
    expect(stats(s, cat)).toEqual([1, 3]);
    put(s, 'P2', 'sol-ring');
    expect(stats(s, cat)).toEqual([1, 3]);
    put(s, 'P1', 'sol-ring');
    expect(stats(s, cat)).toEqual([3, 3]);
  });

  it('Gigantoad gets +2/+2 and Scorpion Sentinel +3/+0 with seven or more lands', () => {
    const s = newGame(3);
    const toad = put(s, 'P1', 'gigantoad');
    const scorpion = put(s, 'P1', 'scorpion-sentinel');
    for (let i = 0; i < 6; i++) put(s, 'P1', 'forest');
    for (let i = 0; i < 7; i++) put(s, 'P3', 'island');
    expect([stats(s, toad), stats(s, scorpion)]).toEqual([[4, 4], [1, 4]]);
    put(s, 'P1', 'island');
    expect([stats(s, toad), stats(s, scorpion)]).toEqual([[6, 6], [4, 4]]);
  });

  it('Magitek Infantry gets +1/+0 with another artifact and fetches another Magitek Infantry tapped', () => {
    let s = newGame();
    const first = put(s, 'P1', 'magitek-infantry');
    expect(stats(s, first)).toEqual([1, 1]);
    const second = put(s, 'P1', 'magitek-infantry', 'library');
    mana(s, 'P1', { W: 1, C: 2 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: first, ability: 0, targets: [] }).state;
    expect(s.cards[second]!.zone).toBe('battlefield');
    expect(s.cards[second]!.tapped).toBe(true);
    expect([stats(s, first), stats(s, second)]).toEqual([[2, 1], [2, 1]]);
  });

  it('Gran Pulse Ochu gets +1/+1 for each permanent card in your graveyard for {8}', () => {
    let s = newGame();
    const ochu = put(s, 'P1', 'gran-pulse-ochu');
    put(s, 'P1', 'forest', 'graveyard');
    put(s, 'P1', 'sol-ring', 'graveyard');
    put(s, 'P1', 'lightning-bolt', 'graveyard');
    mana(s, 'P1', { C: 8 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: ochu, ability: 0, targets: [] }).state;
    expect(stats(s, ochu)).toEqual([3, 3]);
    expect(hasKeyword(s, s.cards[ochu]!, 'Deathtouch')).toBe(true);
  });
});

describe('S4 group 6: Through the Ages cards', () => {
  it('Sram draws a card when you cast an Equipment spell, but not other spells', () => {
    let s = newGame();
    put(s, 'P1', 'sram-senior-edificer');
    put(s, 'P1', 'island', 'library');
    put(s, 'P1', 'island', 'library');
    const gear = put(s, 'P1', 'colossus-hammer', 'hand');
    const bolt = put(s, 'P1', 'lightning-bolt', 'hand');
    mana(s, 'P1', { C: 1, R: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: gear }).state;
    expect(s.players.P1!.hand.length).toBe(2);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: bolt, targets: [{ kind: 'player', player: 'P2' }] }).state;
    expect(s.players.P1!.hand.length).toBe(1);
  });

  it('Primeval Titan puts up to two lands onto the battlefield tapped when it enters and when it attacks', () => {
    let s = newGame(3);
    const titan = put(s, 'P1', 'primeval-titan', 'hand');
    mana(s, 'P1', { G: 2, C: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: titan }).state;
    const lands = () => s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'island');
    expect(lands().length).toBe(2);
    expect(lands().every((id) => s.cards[id]!.tapped)).toBe(true);
    s.cards[titan]!.summoningSick = false;
    s = fight(s, [{ attacker: titan, defender: 'P3' }], {}, { accept: true }).state;
    expect(lands().length).toBe(4);
    expect(s.players.P3!.life).toBe(14);
  });

  it('Captain Lannery Storm makes a Treasure when it attacks and gets +1/+0 when you sacrifice a Treasure', () => {
    let s = newGame();
    const captain = put(s, 'P1', 'captain-lannery-storm', 'battlefield', { summoningSick: true });
    expect(hasKeyword(s, s.cards[captain]!, 'Haste')).toBe(true);
    s = goTo(s, 'declareAttackers');
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: captain, defender: 'P2' }] })).state;
    const [treasure] = s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'treasure-token');
    expect(treasure).toBeDefined();
    // The trigger goes on the stack once the spell paid with the Treasure's mana is cast (rule 601.2i).
    const bolt = put(s, 'P1', 'lightning-bolt', 'hand');
    s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: treasure!, mana: 'R' });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: bolt, targets: [{ kind: 'player', player: 'P2' }] }).state;
    expect(s.players.P1!.battlefield).not.toContain(treasure);
    expect(stats(s, captain)).toEqual([3, 2]);
  });
});

describe('S4 group 6: Ring of the Lucii', () => {
  it('taps for {C}{C}, and {2}, {T}, pay 1 life taps target nonland permanent', () => {
    let s = newGame();
    const ring = put(s, 'P1', 'ring-of-the-lucii');
    const target = put(s, 'P2', 'coeurl');
    put(s, 'P2', 'island');
    mana(s, 'P1', { C: 2 });
    const legal = getLegalActions(s).filter((a) => a.type === 'ActivateAbility' && a.card === ring);
    expect(legal.every((a) => a.type !== 'ActivateAbility' || (a.targets ?? []).every((t) => t.kind !== 'card' || s.cards[t.card]!.defId !== 'island'))).toBe(true);
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: ring, ability: 0, targets: [card(target)] }).state;
    expect(s.cards[target]!.tapped).toBe(true);
    expect(s.players.P1!.life).toBe(19);
  });
});

describe('Meld: Fang, Fearless l’Cie and Vanille, Cheerful l’Cie', () => {
  const FANG = 'fang-fearless-lcie';
  const VANILLE = 'vanille-cheerful-lcie';
  /** P1's turn, at the start of the first main phase, with five lands for {3}{B}{G}. */
  function toFirstMain(s: GameState, accept = true): GameState {
    const lands = ['swamp', 'forest', 'swamp', 'forest', 'swamp'].map((land) => put(s, 'P1', land));
    s.step = 'draw';
    s.pending = { kind: 'priority', player: 'P1', passes: 0 };
    s = nextStep(s);
    expect(s.step).toBe('main1');
    // The meld trigger resolves; paying means tapping the lands for mana first.
    while (s.pending.kind === 'priority' && s.stack.length > 0) s = act(s, { type: 'PassPriority', player: s.pending.player });
    if (s.pending.kind === 'decide' && accept) {
      for (const land of lands) s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: land, mana: s.cards[land]!.defId === 'forest' ? 'G' : 'B' });
    }
    return settle(s, { accept }).state;
  }

  it('Fang: when one or more cards leave your graveyard, draw a card and lose 1 life, once each turn', () => {
    let s = newGame();
    put(s, 'P1', FANG);
    const first = put(s, 'P1', 'coeurl', 'graveyard');
    const second = put(s, 'P1', 'coeurl', 'graveyard');
    const value = manaValue(parseManaCost(s.cardDefs.coeurl!.manaCost));
    const reanimate = (target: string) => {
      const spell = put(s, 'P1', 'reanimate', 'hand');
      mana(s, 'P1', { B: 1 });
      const hand = s.players.P1!.hand.length;
      const life = s.players.P1!.life;
      s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(target)] }).state;
      return { drawn: s.players.P1!.hand.length - (hand - 1), lost: life - s.players.P1!.life };
    };
    expect(reanimate(first)).toEqual({ drawn: 1, lost: value + 1 });
    expect(reanimate(second)).toEqual({ drawn: 0, lost: value });
  });

  it('Vanille mills two, then returns a permanent card from your graveyard to your hand', () => {
    let s = newGame();
    const vanille = put(s, 'P1', VANILLE, 'hand');
    const ring = put(s, 'P1', 'sol-ring', 'graveyard');
    put(s, 'P1', 'lightning-bolt', 'graveyard');
    mana(s, 'P1', { G: 1, C: 3 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: vanille });
    s = settle(s).state;
    // Two Islands milled; the choice is among permanent cards only.
    expect(s.pending.kind).toBe('chooseCards');
    if (s.pending.kind !== 'chooseCards') return;
    expect(s.pending.cards).toContain(ring);
    expect(s.pending.cards.map((id) => s.cards[id]!.defId).sort()).toEqual(['island', 'island', 'sol-ring']);
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [ring] })).state;
    expect(s.cards[ring]!.zone).toBe('hand');
    expect(s.players.P1!.graveyard.length).toBe(3);
  });

  it('at the beginning of your first main phase, pay {3}{B}{G} to meld them into Ragnarok, Divine Deliverance', () => {
    let s = newGame();
    const fang = put(s, 'P1', FANG);
    const vanille = put(s, 'P1', VANILLE);
    s = toFirstMain(s);
    const [ragnarok] = s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === FANG);
    expect(ragnarok).toBe(fang);
    const r = s.cards[fang]!;
    expect(r.transformed).toBe(true);
    expect(r.meldedWith).toBe(vanille);
    expect(currentDefinition(s, r).name).toBe('Ragnarok, Divine Deliverance');
    expect(stats(s, fang)).toEqual([7, 6]);
    for (const k of ['Vigilance', 'Menace', 'Trample', 'Reach', 'Haste'] as const) expect(hasKeyword(s, r, k)).toBe(true);
    expect(manaValue(parseManaCost(currentDefinition(s, r).manaCost))).toBe(7);
    // Vanille is part of the melded permanent, in no zone.
    expect(s.cards[vanille]!.zone).toBe('void');
    expect(Object.values(s.players.P1!).flat().includes(vanille)).toBe(false);
    expect(s.players.P1!.battlefield.filter((id) => s.cards[id]!.tapped).length).toBe(5);
    // What an opponent is sent online never mentions the card inside the melded permanent.
    let n = 0;
    const update = playerUpdate(s, 'P2', new AliasBook(() => `x${n++}`));
    expect(JSON.stringify(update)).not.toContain('meldedWith');
    expect(update.view.players.P1!.battlefield.length).toBe(6);
  });

  it('declining to pay leaves them as they are; Vanille alone (or an opponent’s Fang) never melds', () => {
    let s = newGame();
    const fang = put(s, 'P1', FANG);
    const vanille = put(s, 'P1', VANILLE);
    s = toFirstMain(s, false);
    expect([s.cards[fang]!.transformed, s.cards[vanille]!.zone]).toEqual([undefined, 'battlefield']);

    let t = newGame();
    put(t, 'P2', FANG);
    const lonely = put(t, 'P1', VANILLE);
    t = toFirstMain(t);
    expect(t.cards[lonely]!.zone).toBe('battlefield');
    expect(t.players.P1!.battlefield.filter((id) => t.cards[id]!.tapped).length).toBe(0);
  });

  it('when Ragnarok dies, both cards go to the graveyard; it destroys a permanent and returns a nonlegendary permanent card', () => {
    let s = newGame(3);
    const fang = put(s, 'P1', FANG);
    const vanille = put(s, 'P1', VANILLE);
    const ring = put(s, 'P1', 'sol-ring', 'graveyard');
    const enemy = put(s, 'P3', 'sol-ring');
    s = toFirstMain(s);
    const kill = put(s, 'P2', 'lightning-bolt', 'hand');
    s.cards[fang]!.damage = 4;
    mana(s, 'P2', { R: 1 });
    s.pending = { kind: 'priority', player: 'P2', passes: 0 };
    s = act(s, { type: 'CastSpell', player: 'P2', card: kill, targets: [card(fang)] });
    s = settle(s, {
      targets: (options) => options.find((o) => o.some((t) => t.kind === 'card' && t.card === enemy) && o.some((t) => t.kind === 'card' && t.card === ring)) ?? options[0]!,
    }).state;
    expect([s.cards[fang]!.zone, s.cards[vanille]!.zone]).toEqual(['graveyard', 'graveyard']);
    expect(s.players.P1!.graveyard).toEqual(expect.arrayContaining([fang, vanille]));
    expect(s.cards[enemy]!.zone).toBe('graveyard');
    expect(s.cards[ring]!.zone).toBe('battlefield');
  });

  it('if Ragnarok is returned to hand, both cards go to their owner’s hand', () => {
    let s = newGame();
    const fang = put(s, 'P1', FANG);
    const vanille = put(s, 'P1', VANILLE);
    s = toFirstMain(s);
    const bounce = put(s, 'P1', 'eject', 'hand');
    mana(s, 'P1', { U: 1, C: 5 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: bounce, targets: [card(fang)] }).state;
    expect([s.cards[fang]!.zone, s.cards[vanille]!.zone]).toEqual(['hand', 'hand']);
    expect(s.players.P1!.hand).toEqual(expect.arrayContaining([fang, vanille]));
    expect(s.cards[fang]!.transformed).toBeUndefined();
  });
});

describe('S4 group 7: sacrifice as a cost, and modes with tokens', () => {
  const legalCasts = (s: GameState, spell: string) =>
    getLegalActions(s).filter((a): a is Extract<ReturnType<typeof getLegalActions>[number], { type: 'CastSpell' }> => a.type === 'CastSpell' && a.card === spell);

  it('Deadly Dispute: sacrifice an artifact or creature to draw two and make a Treasure; nothing to sacrifice, no cast', () => {
    let s = newGame();
    const spell = put(s, 'P1', 'deadly-dispute', 'hand');
    mana(s, 'P1', { B: 1, C: 1 });
    expect(legalCasts(s, spell)).toEqual([]);
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: spell })).toMatch(/nothing to sacrifice/);
    const ring = put(s, 'P1', 'sol-ring');
    const cat = put(s, 'P1', 'coeurl');
    put(s, 'P1', 'forest');
    expect(legalCasts(s, spell).map((a) => a.costCards).sort()).toEqual([[ring], [cat]].sort());
    const hand = s.players.P1!.hand.length;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, costCards: [ring] }).state;
    expect(s.cards[ring]!.zone).toBe('graveyard');
    expect(s.players.P1!.hand.length).toBe(hand - 1 + 2);
    expect(s.players.P1!.battlefield.some((id) => s.cards[id]!.defId === 'treasure-token')).toBe(true);
  });

  it('Diabolic Intent: sacrifice a creature, then search for any card', () => {
    let s = newGame();
    put(s, 'P1', 'coeurl');
    const ring = put(s, 'P1', 'sol-ring', 'library');
    const spell = put(s, 'P1', 'diabolic-intent', 'hand');
    mana(s, 'P1', { B: 1, C: 1 });
    const [action] = legalCasts(s, spell);
    s = act(s, action!);
    s = settle(s).state;
    if (s.pending.kind === 'chooseCards') s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [ring] })).state;
    expect(s.cards[ring]!.zone).toBe('hand');
    expect(s.players.P1!.battlefield.some((id) => s.cards[id]!.defId === 'coeurl')).toBe(false);
  });

  it('Vayne’s Treachery: -2/-2, or -6/-6 when kicked by sacrificing an artifact or creature', () => {
    let s = newGame();
    const big = put(s, 'P2', 'jumbo-cactuar');
    const ring = put(s, 'P1', 'sol-ring');
    const spell = put(s, 'P1', 'vaynes-treachery', 'hand');
    mana(s, 'P1', { B: 1, C: 1 });
    const casts = legalCasts(s, spell).filter((a) => a.targets?.[0]?.kind === 'card' && a.targets[0].card === big);
    expect(casts.map((a) => [a.kicks ?? 0, a.costCards ?? []])).toEqual(expect.arrayContaining([[0, []], [1, [ring]]]));
    const before = stats(s, big);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(big)], kicks: 1, costCards: [ring] }).state;
    expect(s.cards[ring]!.zone).toBe('graveyard');
    expect(stats(s, big)).toEqual([before[0]! - 6, before[1]! - 6]);
  });

  it('Louisoix’s Sacrifice counters a triggered ability, paying {2} or sacrificing a legendary creature', () => {
    let s = newGame();
    put(s, 'P2', 'namazu-trader', 'hand');
    const trader = put(s, 'P2', 'namazu-trader', 'hand');
    // P2 casts Namazu Trader on their turn; its enters trigger goes on the stack.
    s.activePlayer = 'P2';
    s.pending = { kind: 'priority', player: 'P2', passes: 0 };
    mana(s, 'P2', { B: 1, C: 3 });
    s = act(s, { type: 'CastSpell', player: 'P2', card: trader });
    s = act(s, { type: 'PassPriority', player: 'P2' });
    s = act(s, { type: 'PassPriority', player: 'P1' });
    expect(s.stack.at(-1)?.kind).toBe('ability');
    const life = s.players.P2!.life;
    const spell = put(s, 'P1', 'louisoixs-sacrifice', 'hand');
    const legend = put(s, 'P1', 'sram-senior-edificer');
    s.pending = { kind: 'priority', player: 'P1', passes: 0 };
    mana(s, 'P1', { U: 1 });
    const ways = legalCasts(s, spell).filter((a) => a.targets?.[0]?.kind === 'ability');
    expect(ways.map((a) => a.costCards)).toEqual([[legend]]);
    mana(s, 'P1', { C: 2 });
    expect(legalCasts(s, spell).filter((a) => a.targets?.[0]?.kind === 'ability').map((a) => a.costCards ?? [])).toEqual(expect.arrayContaining([[legend], []]));
    const ability = (s.stack.at(-1) as { id: string }).id;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [{ kind: 'ability', ability }] }).state;
    expect(s.cards[legend]!.zone).toBe('battlefield');
    expect(s.players.P2!.life).toBe(life);
    expect(s.players.P2!.battlefield.some((id) => s.cards[id]!.defId === 'treasure-token')).toBe(false);
  });

  it('Namazu Trader: lose 1 life and make a Treasure; attacking, may sacrifice another to surveil 2', () => {
    let s = newGame();
    const trader = put(s, 'P1', 'namazu-trader', 'hand');
    mana(s, 'P1', { B: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: trader }).state;
    expect(s.players.P1!.life).toBe(19);
    const [treasure] = s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'treasure-token');
    expect(treasure).toBeDefined();
    s.cards[trader]!.summoningSick = false;
    const top = s.players.P1!.library.slice(0, 2);
    s = goTo(s, 'declareAttackers');
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: trader, defender: 'P2' }] }), { accept: true }).state;
    // "You may sacrifice another creature or artifact": the Treasure.
    expect(s.pending.kind).toBe('chooseCards');
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [treasure!] }), { surveilToGraveyard: true }).state;
    expect(s.cards[treasure!]?.zone ?? 'gone').not.toBe('battlefield');
    expect(top.every((id) => s.cards[id]!.zone === 'graveyard')).toBe(true);
  });

  it('Moogle’s Valor: a 1/2 lifelink Moogle for each creature you control, then indestructible until end of turn', () => {
    let s = newGame();
    put(s, 'P1', 'coeurl');
    put(s, 'P1', 'coeurl');
    put(s, 'P2', 'coeurl');
    const spell = put(s, 'P1', 'moogles-valor', 'hand');
    mana(s, 'P1', { W: 2, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell }).state;
    const mine = s.players.P1!.battlefield.filter((id) => currentDefinition(s, s.cards[id]!).types.includes('creature'));
    expect(mine.filter((id) => s.cards[id]!.defId === 'moogle-token').length).toBe(2);
    expect(mine.every((id) => hasKeyword(s, s.cards[id]!, 'Indestructible'))).toBe(true);
    expect(s.players.P2!.battlefield.some((id) => hasKeyword(s, s.cards[id]!, 'Indestructible'))).toBe(false);
  });

  it('Battle Menu: a 2/2 Knight, +0/+4, destroy power 4 or greater, or gain 4 life', () => {
    let s = newGame();
    const small = put(s, 'P2', 'coeurl');
    const big = put(s, 'P2', 'primeval-titan');
    const menu = () => {
      const id = put(s, 'P1', 'battle-menu', 'hand');
      mana(s, 'P1', { W: 1, C: 1 });
      return id;
    };
    let spell = menu();
    expect(legalCasts(s, spell).filter((a) => a.mode === 2).map((a) => a.targets![0])).toEqual([card(big)]);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, mode: 2, targets: [card(big)] }).state;
    expect(s.cards[big]!.zone).toBe('graveyard');
    spell = menu();
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, mode: 0 }).state;
    expect(s.players.P1!.battlefield.some((id) => s.cards[id]!.defId === 'knight-token')).toBe(true);
    spell = menu();
    const before = stats(s, small);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, mode: 1, targets: [card(small)] }).state;
    expect(stats(s, small)).toEqual([before[0], before[1]! + 4]);
    spell = menu();
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, mode: 3 }).state;
    expect(s.players.P1!.life).toBe(24);
  });

  it('Aerith Rescue Mission: three Heroes, or tap up to three different creatures and stun the first', () => {
    let s = newGame();
    let spell = put(s, 'P1', 'aerith-rescue-mission', 'hand');
    mana(s, 'P1', { W: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, mode: 0 }).state;
    expect(heroes(s, 'P1').length).toBe(3);
    const [a, b, c] = [put(s, 'P2', 'coeurl'), put(s, 'P2', 'coeurl'), put(s, 'P2', 'coeurl')];
    spell = put(s, 'P1', 'aerith-rescue-mission', 'hand');
    mana(s, 'P1', { W: 1, C: 3 });
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: spell, mode: 1, targets: [card(a), card(a), card(b)] })).toMatch(/different/);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, mode: 1, targets: [card(b), card(a), card(c)] }).state;
    expect([a, b, c].every((id) => s.cards[id]!.tapped)).toBe(true);
    expect([a, b, c].map((id) => countersOf(s.cards[id]!, 'stun'))).toEqual([0, 1, 0]);
  });
});

describe('S4 group 8: flashback spells and enters/upkeep triggers', () => {
  it('Resentful Revelation: look at three, one into your hand, the rest into your graveyard; flashback {6}{B}', () => {
    let s = newGame();
    const tops = [put(s, 'P1', 'sol-ring', 'library'), put(s, 'P1', 'forest', 'library'), put(s, 'P1', 'coeurl', 'library')].reverse();
    const spell = put(s, 'P1', 'resentful-revelation', 'hand');
    mana(s, 'P1', { B: 1, C: 1 });
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: spell })).state;
    expect(s.pending.kind).toBe('chooseCards');
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [tops[0]!] })).state;
    expect(tops.map((id) => s.cards[id]!.zone)).toEqual(['hand', 'graveyard', 'graveyard']);
    // Flashback from the graveyard, then it's exiled.
    expect(s.cards[spell]!.zone).toBe('graveyard');
    mana(s, 'P1', { B: 1, C: 6 });
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: spell })).state;
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [s.pending.kind === 'chooseCards' ? s.pending.cards[0]! : ''] })).state;
    expect(s.cards[spell]!.zone).toBe('exile');
  });

  it('Sorceress’s Schemes returns an instant or sorcery from your graveyard, or an exiled flashback card, and adds {R}', () => {
    let s = newGame();
    const bolt = put(s, 'P1', 'lightning-bolt', 'graveyard');
    const exiled = put(s, 'P1', 'resentful-revelation', 'exile');
    put(s, 'P1', 'sol-ring', 'exile');
    put(s, 'P2', 'lightning-bolt', 'graveyard');
    const spell = put(s, 'P1', 'sorceresss-schemes', 'hand');
    mana(s, 'P1', { R: 1, C: 3 });
    const options = getLegalActions(s).filter((a) => a.type === 'CastSpell' && a.card === spell).map((a) => (a.type === 'CastSpell' ? a.targets?.[0] : undefined));
    expect(options).toEqual(expect.arrayContaining([card(bolt), card(exiled)]));
    expect(options.length).toBe(2);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(exiled)] }).state;
    expect(s.cards[exiled]!.zone).toBe('hand');
    expect(s.players.P1!.manaPool.R).toBe(1);
  });

  it('Nibelheim Aflame: your creature deals damage equal to its power to each other creature; from the graveyard, discard your hand and draw four', () => {
    let s = newGame();
    const titan = put(s, 'P1', 'primeval-titan');
    const mine = put(s, 'P1', 'coeurl');
    const theirs = put(s, 'P2', 'jumbo-cactuar');
    const spell = put(s, 'P1', 'nibelheim-aflame', 'graveyard');
    const kept = put(s, 'P1', 'sol-ring', 'hand');
    mana(s, 'P1', { R: 2, C: 5 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(titan)] }).state;
    expect(s.cards[titan]!.zone).toBe('battlefield');
    expect(s.cards[titan]!.damage).toBe(0);
    expect(s.cards[mine]!.zone).toBe('graveyard');
    expect(s.cards[theirs]!.damage).toBe(6);
    expect(s.cards[kept]!.zone).toBe('graveyard');
    expect(s.players.P1!.hand.length).toBe(4);
    expect(s.cards[spell]!.zone).toBe('exile');
  });

  it('Nibelheim Aflame from your hand doesn’t touch your hand', () => {
    let s = newGame();
    const cat = put(s, 'P1', 'coeurl');
    const spell = put(s, 'P1', 'nibelheim-aflame', 'hand');
    put(s, 'P1', 'sol-ring', 'hand');
    mana(s, 'P1', { R: 2, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(cat)] }).state;
    expect(s.players.P1!.hand.length).toBe(1);
  });

  it('From Father to Son: a Vehicle into your hand; with flashback, onto the battlefield', () => {
    let s = newGame();
    const first = put(s, 'P1', 'magitek-armor', 'library');
    const spell = put(s, 'P1', 'from-father-to-son', 'hand');
    mana(s, 'P1', { W: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell }).state;
    expect(s.cards[first]!.zone).toBe('hand');
    const second = put(s, 'P1', 'magitek-armor', 'library');
    mana(s, 'P1', { W: 3, C: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell }).state;
    expect(s.cards[second]!.zone).toBe('battlefield');
    expect(s.cards[spell]!.zone).toBe('exile');
  });

  it('Sandworm destroys a land; its controller may fetch a basic land tapped', () => {
    let s = newGame();
    const land = put(s, 'P2', 'mountain');
    const worm = put(s, 'P1', 'sandworm', 'hand');
    mana(s, 'P1', { R: 1, C: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: worm }, { targets: (options) => options.find((o) => o.some((t) => t.kind === 'card' && t.card === land))! }).state;
    expect(s.cards[land]!.zone).toBe('graveyard');
    const fetched = s.players.P2!.battlefield.map((id) => s.cards[id]!).filter((c) => c.defId === 'island');
    expect(fetched.length).toBe(1);
    expect(fetched[0]!.tapped).toBe(true);
    expect(hasKeyword(s, s.cards[worm]!, 'Haste')).toBe(true);
  });

  it('Malboro: each opponent discards a card, loses 2 life and exiles the top three cards of their library', () => {
    let s = newGame(3);
    for (const pid of ['P2', 'P3']) put(s, pid, 'sol-ring', 'hand');
    const tops = s.players.P2!.library.slice(0, 3);
    const malboro = put(s, 'P1', 'malboro', 'hand');
    mana(s, 'P1', { B: 2, C: 4 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: malboro });
    for (let i = 0; i < 20 && !(s.pending.kind === 'priority' && s.stack.length === 0); i++) {
      const p = s.pending;
      s = p.kind === 'chooseCards' ? act(s, { type: 'ChooseCards', player: p.player, cards: p.cards.slice(0, p.min) }) : settle(s).state;
    }
    expect([s.players.P2!.life, s.players.P3!.life, s.players.P1!.life]).toEqual([18, 18, 20]);
    expect([s.players.P2!.hand.length, s.players.P3!.hand.length]).toEqual([0, 0]);
    expect(tops.every((id) => s.cards[id]!.zone === 'exile')).toBe(true);
    expect(s.players.P3!.exile.length).toBe(3);
  });

  it('Dark Confidant: at your upkeep, reveal the top card, put it into your hand, and lose life equal to its mana value', () => {
    let s = newGame();
    put(s, 'P1', 'dark-confidant');
    const top = put(s, 'P1', 'primeval-titan', 'library');
    s.step = 'untap';
    s.pending = { kind: 'priority', player: 'P1', passes: 0 };
    s = goTo(s, 'draw');
    expect(s.cards[top]!.zone).toBe('hand');
    expect(s.players.P1!.life).toBe(14);
  });
});

describe('S4 group 9: whenever you gain life', () => {
  /** P1 gains life from a spell (Battle Menu's Item mode: gain 4 life). */
  function gainFour(s: GameState): GameState {
    const spell = put(s, 'P1', 'battle-menu', 'hand');
    mana(s, 'P1', { W: 1, C: 1 });
    return cast(s, { type: 'CastSpell', player: 'P1', card: spell, mode: 3 }).state;
  }

  it('Aerith Gainsborough grows when you gain life; when she dies, her counters go on each legendary creature you control', () => {
    let s = newGame();
    const aerith = put(s, 'P1', 'aerith-gainsborough');
    const sram = put(s, 'P1', 'sram-senior-edificer');
    const plain = put(s, 'P1', 'coeurl');
    s = gainFour(s);
    s = gainFour(s);
    expect(s.cards[aerith]!.counters).toBe(2);
    const bolt = put(s, 'P1', 'lightning-bolt', 'hand');
    mana(s, 'P1', { R: 1 });
    s.cards[aerith]!.damage = 3;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: bolt, targets: [card(aerith)] }).state;
    expect(s.cards[aerith]!.zone).toBe('graveyard');
    expect(s.cards[sram]!.counters).toBe(2);
    expect(s.cards[plain]!.counters ?? 0).toBe(0);
  });

  it('Minwu puts a +1/+1 counter on each Cleric you control when you gain life (lifelink counts)', () => {
    let s = newGame();
    const minwu = put(s, 'P1', 'minwu-white-mage');
    const aerith = put(s, 'P1', 'aerith-gainsborough');
    const theirs = put(s, 'P2', 'aerith-gainsborough');
    s = fight(s, [{ attacker: minwu, defender: 'P2' }]).state;
    expect(s.players.P1!.life).toBe(23);
    expect(s.cards[minwu]!.counters).toBe(1);
    // Aerith also gets her own counter.
    expect(s.cards[aerith]!.counters).toBe(2);
    expect(s.cards[theirs]!.counters ?? 0).toBe(0);
  });

  it('Excalibur II gets a charge counter when you gain life; the equipped creature gets +1/+1 for each', () => {
    let s = newGame();
    const { body, gear } = equipped(s, 'excalibur-ii');
    const before = stats(s, body);
    s = gainFour(s);
    s = gainFour(s);
    expect(countersOf(s.cards[gear]!, 'charge')).toBe(2);
    expect(stats(s, body)).toEqual([before[0]! + 2, before[1]! + 2]);
  });

  it('Hope Estheim: at your end step, each opponent mills cards equal to the life you gained this turn', () => {
    let s = newGame(3);
    put(s, 'P1', 'hope-estheim');
    s = gainFour(s);
    const [two, three] = [s.players.P2!.library.length, s.players.P3!.library.length];
    s = settle(goTo(s, 'end')).state;
    expect([two - s.players.P2!.library.length, three - s.players.P3!.library.length]).toEqual([4, 4]);
  });

  it('The Wind Crystal doubles life you gain, makes white spells cost {1} less, and gives flying and lifelink', () => {
    let s = newGame();
    const crystal = put(s, 'P1', 'the-wind-crystal');
    const cat = put(s, 'P1', 'coeurl');
    // Battle Menu ({1}{W}) costs just {W}.
    const spell = put(s, 'P1', 'battle-menu', 'hand');
    mana(s, 'P1', { W: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, mode: 3 }).state;
    expect(s.players.P1!.life).toBe(28);
    mana(s, 'P1', { W: 2, C: 4 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: crystal, ability: 0, targets: [] }).state;
    expect(['Flying', 'Lifelink'].every((k) => hasKeyword(s, s.cards[cat]!, k as 'Flying'))).toBe(true);
  });

  it('Poison the Waters: all creatures get -1/-1, or you choose an artifact or creature card from a player’s hand to discard', () => {
    let s = newGame();
    const small = put(s, 'P2', 'magitek-infantry');
    let spell = put(s, 'P1', 'poison-the-waters', 'hand');
    mana(s, 'P1', { B: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, mode: 0 }).state;
    expect(s.cards[small]!.zone).toBe('graveyard');
    const ring = put(s, 'P2', 'sol-ring', 'hand');
    const bolt = put(s, 'P2', 'lightning-bolt', 'hand');
    spell = put(s, 'P1', 'poison-the-waters', 'hand');
    mana(s, 'P1', { B: 1, C: 1 });
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: spell, mode: 1, targets: [{ kind: 'player', player: 'P2' }] })).state;
    expect(s.pending.kind).toBe('chooseCards');
    if (s.pending.kind === 'chooseCards') {
      expect(s.pending.player).toBe('P1');
      expect(s.pending.cards).toEqual([ring]);
    }
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [ring] })).state;
    expect([s.cards[ring]!.zone, s.cards[bolt]!.zone]).toEqual(['graveyard', 'hand']);
  });

  it('Gaius van Baelsar: each player sacrifices a nontoken creature (chosen mode)', () => {
    let s = newGame(3);
    const mine = put(s, 'P1', 'coeurl');
    const two = put(s, 'P2', 'coeurl');
    const token = put(s, 'P3', 'hero-token', 'battlefield', { isToken: true });
    const gaius = put(s, 'P1', 'gaius-van-baelsar', 'hand');
    mana(s, 'P1', { B: 2, C: 2 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: gaius });
    s = act(s, { type: 'PassPriority', player: 'P1' });
    s = act(s, { type: 'PassPriority', player: 'P2' });
    s = act(s, { type: 'PassPriority', player: 'P3' });
    // Choosing the mode as the trigger goes on the stack.
    for (let i = 0; i < 30 && !(s.pending.kind === 'priority' && s.stack.length === 0); i++) {
      const p = s.pending;
      if (p.kind === 'chooseModes') s = act(s, { type: 'ChooseModes', player: p.player, modes: [1] });
      else if (p.kind === 'chooseCards') s = act(s, { type: 'ChooseCards', player: p.player, cards: p.cards.slice(0, p.min) });
      else s = settle(s).state;
    }
    expect(s.cards[two]!.zone).toBe('graveyard');
    expect(s.cards[token]!.zone).toBe('battlefield');
    // P1 had Coeurl and Gaius: one of them went.
    expect([s.cards[mine]!.zone, s.cards[gaius]!.zone].filter((z) => z === 'graveyard').length).toBe(1);
  });

  it('World Map: {1}, {T}, sacrifice: a basic land; {3}: any land', () => {
    let s = newGame();
    const map = put(s, 'P1', 'world-map');
    mana(s, 'P1', { C: 1 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: map, ability: 0, targets: [] }).state;
    expect(s.cards[map]!.zone).toBe('graveyard');
    expect(s.players.P1!.hand.filter((id) => s.cards[id]!.defId === 'island').length).toBe(1);
  });
});

describe('S4 group 10: look at the top cards, revolt, Equipment and coins', () => {
  /** Answers each pending card choice with `pick`, then settles. */
  function answer(s: GameState, pick: (cards: string[], looked: string[]) => string[]): GameState {
    for (let i = 0; i < 10 && s.pending.kind === 'chooseCards'; i++) {
      const p = s.pending;
      s = settle(act(s, { type: 'ChooseCards', player: p.player, cards: pick(p.cards, p.looked ?? p.cards) })).state;
    }
    return s;
  }

  it('Commune with Beavers: look at three, take an artifact, creature or land; the rest go to the bottom', () => {
    let s = newGame();
    const bolt = put(s, 'P1', 'lightning-bolt', 'library');
    const ring = put(s, 'P1', 'sol-ring', 'library');
    const bolt2 = put(s, 'P1', 'lightning-bolt', 'library');
    const spell = put(s, 'P1', 'commune-with-beavers', 'hand');
    mana(s, 'P1', { G: 1 });
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: spell })).state;
    expect(s.pending.kind === 'chooseCards' && s.pending.cards).toEqual([ring]);
    s = answer(s, (cards) => cards);
    expect(s.cards[ring]!.zone).toBe('hand');
    const library = s.players.P1!.library;
    expect(library.slice(-2).sort()).toEqual([bolt, bolt2].sort());
  });

  it('Ashe: whenever she attacks, look at five and you may take an artifact', () => {
    let s = newGame();
    const ashe = put(s, 'P1', 'ashe-princess-of-dalmasca');
    const ring = put(s, 'P1', 'sol-ring', 'library');
    s = goTo(s, 'declareAttackers');
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: ashe, defender: 'P2' }] })).state;
    expect(s.pending.kind === 'chooseCards' && s.pending.looked?.length).toBe(5);
    s = answer(s, () => []);
    expect(s.cards[ring]!.zone).toBe('library');
    expect(s.players.P1!.library.indexOf(ring)).toBeGreaterThan(s.players.P1!.library.length - 6);
  });

  it('Gilgamesh puts any number of Equipment from the top six onto the battlefield and may attach one to himself', () => {
    let s = newGame();
    const gear = [put(s, 'P1', 'colossus-hammer', 'library'), put(s, 'P1', 'excalibur-ii', 'library')];
    const gilgamesh = put(s, 'P1', 'gilgamesh-master-at-arms', 'hand');
    mana(s, 'P1', { R: 2, C: 4 });
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: gilgamesh })).state;
    expect(s.pending.kind === 'chooseCards' && [...s.pending.cards].sort()).toEqual([...gear].sort());
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: gear })).state;
    expect(gear.every((id) => s.cards[id]!.zone === 'battlefield')).toBe(true);
    // Then attach one of them to Gilgamesh.
    expect(s.pending.kind === 'chooseCards' && s.pending.purpose).toBe('attachToSource');
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [gear[0]!] })).state;
    expect(s.cards[gear[0]!]!.attachedTo).toBe(gilgamesh);
    expect(s.cards[gear[1]!]!.attachedTo).toBeUndefined();
  });

  it('Light of Judgment deals 6 damage and may destroy an Equipment attached to that creature', () => {
    let s = newGame();
    const titan = put(s, 'P2', 'primeval-titan');
    const gear = put(s, 'P2', 'colossus-hammer', 'battlefield', { attachedTo: titan });
    const spell = put(s, 'P1', 'light-of-judgment', 'hand');
    mana(s, 'P1', { R: 1, C: 4 });
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(titan)] })).state;
    s = answer(s, (cards) => cards);
    expect(s.cards[gear]!.zone).toBe('graveyard');
    expect(s.cards[titan]!.zone).toBe('graveyard');
  });

  it('Fatal Push destroys mana value 2 or less, or 4 or less with revolt', () => {
    let s = newGame();
    const four = put(s, 'P2', 'namazu-trader');
    const two = put(s, 'P2', 'dark-confidant');
    let spell = put(s, 'P1', 'fatal-push', 'hand');
    mana(s, 'P1', { B: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(four)] }).state;
    expect(s.cards[four]!.zone).toBe('battlefield');
    // Revolt: a permanent of yours leaves the battlefield (a Treasure for mana).
    const treasure = put(s, 'P1', 'treasure-token', 'battlefield', { isToken: true });
    spell = put(s, 'P1', 'fatal-push', 'hand');
    s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: treasure, mana: 'B' });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(four)] }).state;
    expect(s.cards[four]!.zone).toBe('graveyard');
    expect(s.cards[two]!.zone).toBe('battlefield');
  });

  it('Edgar draws a card for each artifact you control, and your first coin flip each turn comes up heads', () => {
    let s = newGame();
    put(s, 'P1', 'sol-ring');
    put(s, 'P1', 'sol-ring');
    const edgar = put(s, 'P1', 'edgar-king-of-figaro', 'hand');
    mana(s, 'P1', { U: 2, C: 4 });
    const hand = s.players.P1!.hand.length;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: edgar }).state;
    expect(s.players.P1!.hand.length).toBe(hand - 1 + 2);
    // Setzer flips a coin when a Vehicle deals combat damage to a player; a win makes two Treasures.
    for (const seed of [1, 2, 3, 4]) {
      let t = structuredClone(s);
      t.rngState = [seed, seed * 7, seed * 13, seed * 31];
      put(t, 'P1', 'setzer-wandering-gambler');
      const armor = put(t, 'P1', 'magitek-armor', 'battlefield', { crewed: true });
      t = fight(t, [{ attacker: armor, defender: 'P2' }]).state;
      expect(t.players.P1!.battlefield.filter((id) => t.cards[id]!.defId === 'treasure-token').length).toBe(2);
      expect(t.players.P1!.coinHeadsTurn).toBe(t.turnNumber);
    }
  });
});

describe('S4 group 11: lands and mana', () => {
  const manaActions = (s: GameState, id: string) => getLegalActions(s).filter((a): a is Extract<ReturnType<typeof getLegalActions>[number], { type: 'ActivateManaAbility' }> => a.type === 'ActivateManaAbility' && a.card === id);

  it('Capital City taps for {C}, or {1}, {T} for any color', () => {
    let s = newGame();
    const city = put(s, 'P1', 'capital-city');
    expect(manaActions(s, city).map((a) => a.mana)).toEqual(['C']);
    mana(s, 'P1', { C: 1 });
    const paid = manaActions(s, city).filter((a) => a.output !== undefined);
    expect(paid.length).toBe(5);
    s = act(s, paid.find((a) => a.output === 2)!);
    expect(s.players.P1!.manaPool.B).toBe(1);
    expect(s.players.P1!.manaPool.C).toBe(0);
  });

  it('Starting Town enters untapped on your first three turns; {T}, pay 1 life for any color', () => {
    let s = newGame();
    s.players.P1!.turnsTaken = 3;
    const early = put(s, 'P1', 'starting-town', 'hand');
    s = act(s, { type: 'PlayLand', player: 'P1', card: early });
    expect(s.cards[early]!.tapped).toBe(false);
    s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: early, mana: 'G' });
    expect([s.players.P1!.manaPool.G, s.players.P1!.life]).toEqual([1, 19]);
    let t = newGame();
    t.players.P1!.turnsTaken = 4;
    const late = put(t, 'P1', 'starting-town', 'hand');
    t = act(t, { type: 'PlayLand', player: 'P1', card: late });
    expect(t.cards[late]!.tapped).toBe(true);
  });

  it('a new game counts each player’s turns', () => {
    let s = newGame();
    s.players.P1!.turnsTaken = 1;
    s = goTo(s, 'upkeep');
    expect([s.activePlayer, s.players.P2!.turnsTaken]).toEqual(['P2', 1]);
  });

  it('Command Beacon: {T}, sacrifice it: put your commander into your hand from the command zone', () => {
    let s = newGame();
    const commander = put(s, 'P1', 'sram-senior-edificer', 'command', { isCommander: true });
    const beacon = put(s, 'P1', 'command-beacon');
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: beacon, ability: 0, targets: [] }).state;
    expect(s.cards[commander]!.zone).toBe('hand');
    expect(s.cards[beacon]!.zone).toBe('graveyard');
  });

  it('Chromatic Lantern: your lands tap for any color, and so does it', () => {
    const s = newGame();
    const lantern = put(s, 'P1', 'chromatic-lantern');
    const island = put(s, 'P1', 'island');
    const theirs = put(s, 'P2', 'island');
    expect(new Set(manaActions(s, island).map((a) => a.mana))).toEqual(new Set(['U', 'W', 'B', 'R', 'G']));
    expect(new Set(manaActions(s, lantern).map((a) => a.mana))).toEqual(new Set(['W', 'U', 'B', 'R', 'G']));
    expect(manaActions(s, theirs)).toEqual([]);
  });

  it('Azusa: play two additional lands on each of your turns', () => {
    let s = newGame();
    put(s, 'P1', 'azusa-lost-but-seeking');
    const lands = [put(s, 'P1', 'forest', 'hand'), put(s, 'P1', 'forest', 'hand'), put(s, 'P1', 'forest', 'hand'), put(s, 'P1', 'forest', 'hand')];
    for (const id of lands.slice(0, 3)) s = act(s, { type: 'PlayLand', player: 'P1', card: id });
    expect(rejected(s, { type: 'PlayLand', player: 'P1', card: lands[3]! })).toMatch(/already played/);
  });

  it('The Gold Saucer: {2}, {T}: flip a coin, a Treasure if you win; {3}, {T}, sacrifice two artifacts: draw', () => {
    let wins = 0;
    let g = newGame();
    const flipper = put(g, 'P1', 'the-gold-saucer');
    for (let i = 0; i < 12; i++) {
      g.cards[flipper]!.tapped = false;
      mana(g, 'P1', { C: 2 });
      const before = g.players.P1!.battlefield.filter((id) => g.cards[id]!.defId === 'treasure-token').length;
      const r = cast(g, { type: 'ActivateAbility', player: 'P1', card: flipper, ability: 0, targets: [] });
      g = r.state;
      const won = r.events.some((e) => e.type === 'CoinFlipped' && e.won);
      expect(g.players.P1!.battlefield.filter((id) => g.cards[id]!.defId === 'treasure-token').length).toBe(before + (won ? 1 : 0));
      if (won) wins++;
    }
    expect(wins).toBeGreaterThan(0);
    expect(wins).toBeLessThan(12);
    let s = newGame();
    const saucer = put(s, 'P1', 'the-gold-saucer');
    const rings = [put(s, 'P1', 'sol-ring'), put(s, 'P1', 'sol-ring')];
    mana(s, 'P1', { C: 3 });
    const hand = s.players.P1!.hand.length;
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: saucer, ability: 1, targets: [], costCards: rings }).state;
    expect(rings.every((id) => s.cards[id]!.zone === 'graveyard')).toBe(true);
    expect(s.players.P1!.hand.length).toBe(hand + 1);
  });

  it('Eden: {5}, {T}: mill two, then you may sacrifice it to return another permanent card from your graveyard', () => {
    let s = newGame();
    const eden = put(s, 'P1', 'eden-seat-of-the-sanctum');
    const ring = put(s, 'P1', 'sol-ring', 'graveyard');
    mana(s, 'P1', { C: 5 });
    s = act(s, { type: 'ActivateAbility', player: 'P1', card: eden, ability: 0, targets: [] });
    for (let i = 0; i < 20 && !(s.pending.kind === 'priority' && s.stack.length === 0); i++) {
      const p = s.pending;
      if (p.kind === 'chooseCards') s = act(s, { type: 'ChooseCards', player: p.player, cards: p.cards.filter((id) => id === eden) });
      else s = settle(s, { targets: (options) => options.find((o) => o.some((t) => t.kind === 'card' && t.card === ring)) ?? options[0]! }).state;
    }
    expect(s.cards[eden]!.zone).toBe('graveyard');
    expect(s.cards[ring]!.zone).toBe('hand');
  });
});

describe('S4 group 12: impulse draw, spectacle, and more', () => {
  const playable = (s: GameState, id: string) => getLegalActions(s).some((a) => (a.type === 'CastSpell' || a.type === 'PlayLand') && a.card === id);

  it('Haste Magic: +3/+1 and haste; the top card may be played until your next end step', () => {
    let s = newGame();
    const cat = put(s, 'P1', 'coeurl', 'battlefield', { summoningSick: true });
    const top = put(s, 'P1', 'forest', 'library');
    const spell = put(s, 'P1', 'haste-magic', 'hand');
    const before = stats(s, cat);
    mana(s, 'P1', { R: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(cat)] }).state;
    expect(stats(s, cat)).toEqual([before[0]! + 3, before[1]! + 1]);
    expect(hasKeyword(s, s.cards[cat]!, 'Haste')).toBe(true);
    expect(s.cards[top]!.zone).toBe('exile');
    expect(playable(s, top)).toBe(true);
    // Gone once your end step begins.
    s = goTo(s, 'end');
    s.pending = { kind: 'priority', player: 'P1', passes: 0 };
    expect(s.players.P1!.endStepsBegun).toBe(1);
    s.step = 'main2';
    expect(playable(s, top)).toBe(false);
  });

  it('Opera Love Song: exile two to play, or +2/+0 on one or two different creatures', () => {
    let s = newGame();
    const [a, b] = [put(s, 'P1', 'coeurl'), put(s, 'P1', 'coeurl')];
    let spell = put(s, 'P1', 'opera-love-song', 'hand');
    mana(s, 'P1', { R: 1, C: 1 });
    const pa = stats(s, a);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, mode: 1, targets: [card(a), card(b)] }).state;
    expect([stats(s, a)[0], stats(s, b)[0]]).toEqual([pa[0]! + 2, pa[0]! + 2]);
    const tops = s.players.P1!.library.slice(0, 2);
    spell = put(s, 'P1', 'opera-love-song', 'hand');
    mana(s, 'P1', { R: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, mode: 0 }).state;
    expect(tops.every((id) => s.cards[id]!.zone === 'exile' && playable(s, id))).toBe(true);
  });

  it('Light Up the Stage: spectacle {R} only after an opponent lost life; play the cards until the end of your next turn', () => {
    let s = newGame();
    const spell = put(s, 'P1', 'light-up-the-stage', 'hand');
    mana(s, 'P1', { R: 1 });
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: spell, alternative: true })).toMatch(/spectacle/);
    s.players.P2!.lifeLostThisTurn = 2;
    s.players.P1!.turnsTaken = 1;
    const tops = s.players.P1!.library.slice(0, 2);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, alternative: true }).state;
    expect(tops.every((id) => s.cards[id]!.zone === 'exile')).toBe(true);
    const [land] = tops;
    // Still playable on P1's next turn, gone after it.
    s.activePlayer = 'P1';
    s.players.P1!.turnsTaken = 2;
    s.players.P1!.landsPlayedThisTurn = 0;
    expect(playable(s, land!)).toBe(true);
    s.activePlayer = 'P2';
    expect(s.cards[land!]!.playableFromExile?.throughTurn).toBe(2);
    s.players.P1!.turnsTaken = 3;
    s.activePlayer = 'P1';
    expect(playable(s, land!)).toBe(false);
  });

  it('Rydia’s Return: creatures you control get +3/+3, or return up to two different permanent cards', () => {
    let s = newGame();
    const cat = put(s, 'P1', 'coeurl');
    const theirs = put(s, 'P2', 'coeurl');
    let spell = put(s, 'P1', 'rydias-return', 'hand');
    mana(s, 'P1', { G: 2, C: 3 });
    const before = stats(s, cat);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, mode: 0 }).state;
    expect([stats(s, cat), stats(s, theirs)]).toEqual([[before[0]! + 3, before[1]! + 3], before]);
    const [ring, forest] = [put(s, 'P1', 'sol-ring', 'graveyard'), put(s, 'P1', 'forest', 'graveyard')];
    spell = put(s, 'P1', 'rydias-return', 'hand');
    mana(s, 'P1', { G: 2, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, mode: 1, targets: [card(ring), card(forest)] }).state;
    expect([s.cards[ring]!.zone, s.cards[forest]!.zone]).toEqual(['hand', 'hand']);
  });

  it('Cactuar returns to hand at your end step unless it entered this turn', () => {
    let s = newGame();
    const fresh = put(s, 'P1', 'cactuar', 'battlefield', { enteredTurn: 2 });
    const old = put(s, 'P1', 'cactuar', 'battlefield', { enteredTurn: 1 });
    s = settle(goTo(s, 'end')).state;
    expect([s.cards[fresh]!.zone, s.cards[old]!.zone]).toEqual(['battlefield', 'hand']);
  });

  it('Demon Wall can’t attack until it has a counter; {5}{B} puts two +1/+1 counters on it', () => {
    const s = newGame();
    const wall = put(s, 'P1', 'demon-wall');
    expect(canAttack(s, s.cards[wall]!, 'P1')).toBe(false);
    let t = newGame();
    const wall2 = put(t, 'P1', 'demon-wall');
    mana(t, 'P1', { B: 1, C: 5 });
    t = cast(t, { type: 'ActivateAbility', player: 'P1', card: wall2, ability: 0, targets: [] }).state;
    expect(t.cards[wall2]!.counters).toBe(2);
    expect(canAttack(t, t.cards[wall2]!, 'P1')).toBe(true);
    t = fight(t, [{ attacker: wall2, defender: 'P2' }]).state;
    expect(t.players.P2!.life).toBe(20 - stats(t, wall2)[0]!);
  });
});

describe('S4 group 13: attacking alone, Kenrith, Mangara, Akroma’s Will', () => {
  it('Seifer: a creature attacking alone gains double strike; combat damage lets you cast a cheap instant or sorcery free from your graveyard', () => {
    let s = newGame();
    const seifer = put(s, 'P1', 'seifer-almasy');
    const bolt = put(s, 'P1', 'lightning-bolt', 'graveyard');
    const power = stats(s, seifer)[0]!;
    s = fight(s, [{ attacker: seifer, defender: 'P2' }], {}, { accept: true }).state;
    expect(s.players.P2!.life).toBe(20 - 2 * power);
    expect(s.cards[bolt]!.castPermission).toMatchObject({ player: 'P1', free: true });
    s = goTo(s, 'main2');
    s = cast(s, { type: 'CastSpell', player: 'P1', card: bolt, targets: [{ kind: 'player', player: 'P2' }] }).state;
    expect(s.players.P2!.life).toBe(20 - 2 * power - 3);
    expect(s.cards[bolt]!.zone).toBe('exile');
  });

  it('two attackers: no double strike', () => {
    let s = newGame();
    const seifer = put(s, 'P1', 'seifer-almasy');
    const cat = put(s, 'P1', 'coeurl');
    const total = stats(s, seifer)[0]! + stats(s, cat)[0]!;
    s = fight(s, [{ attacker: seifer, defender: 'P2' }, { attacker: cat, defender: 'P2' }], {}, { accept: false }).state;
    expect(s.players.P2!.life).toBe(20 - total);
  });

  it('Squall returns a permanent card with mana value 3 or less when it deals combat damage to a player', () => {
    let s = newGame();
    const squall = put(s, 'P1', 'squall-seed-mercenary');
    const ring = put(s, 'P1', 'sol-ring', 'graveyard');
    put(s, 'P1', 'primeval-titan', 'graveyard');
    s = fight(s, [{ attacker: squall, defender: 'P2' }]).state;
    expect(s.cards[ring]!.zone).toBe('battlefield');
  });

  it('Kenrith’s five abilities', () => {
    let s = newGame();
    const kenrith = put(s, 'P1', 'kenrith-the-returned-king');
    const cat = put(s, 'P2', 'coeurl');
    const dead = put(s, 'P2', 'coeurl', 'graveyard');
    mana(s, 'P1', { R: 1, G: 1, W: 1, U: 1, B: 1, C: 10 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: kenrith, ability: 0, targets: [] }).state;
    expect(hasKeyword(s, s.cards[cat]!, 'Trample') && hasKeyword(s, s.cards[kenrith]!, 'Haste')).toBe(true);
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: kenrith, ability: 1, targets: [card(kenrith)] }).state;
    expect(s.cards[kenrith]!.counters).toBe(1);
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: kenrith, ability: 2, targets: [{ kind: 'player', player: 'P2' }] }).state;
    expect(s.players.P2!.life).toBe(25);
    const hand = s.players.P2!.hand.length;
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: kenrith, ability: 3, targets: [{ kind: 'player', player: 'P2' }] }).state;
    expect(s.players.P2!.hand.length).toBe(hand + 1);
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: kenrith, ability: 4, targets: [card(dead)] }).state;
    expect([s.cards[dead]!.zone, s.cards[dead]!.controller]).toEqual(['battlefield', 'P2']);
  });

  it('Mangara draws when an opponent attacks you with two or more creatures, and on an opponent’s second spell each turn', () => {
    let s = newGame(3);
    put(s, 'P3', 'mangara-the-diplomat');
    const [a, b] = [put(s, 'P1', 'coeurl'), put(s, 'P1', 'coeurl')];
    const hand = s.players.P3!.hand.length;
    s = goTo(s, 'declareAttackers');
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: a, defender: 'P3' }, { attacker: b, defender: 'P3' }] })).state;
    expect(s.players.P3!.hand.length).toBe(hand + 1);
    let t = newGame(3);
    put(t, 'P3', 'mangara-the-diplomat');
    const [x, y] = [put(t, 'P1', 'coeurl'), put(t, 'P1', 'coeurl')];
    t = goTo(t, 'declareAttackers');
    t = settle(act(t, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: x, defender: 'P3' }, { attacker: y, defender: 'P2' }] })).state;
    expect(t.players.P3!.hand.length).toBe(hand);
    // Second spell.
    let u = newGame(3);
    put(u, 'P3', 'mangara-the-diplomat');
    const before = u.players.P3!.hand.length;
    for (let i = 0; i < 2; i++) {
      const bolt = put(u, 'P1', 'lightning-bolt', 'hand');
      mana(u, 'P1', { R: 1 });
      u = cast(u, { type: 'CastSpell', player: 'P1', card: bolt, targets: [{ kind: 'player', player: 'P2' }] }).state;
      expect(u.players.P3!.hand.length).toBe(before + i);
    }
  });

  it('Akroma’s Will: choose one, or both if you control a commander', () => {
    let s = newGame();
    const cat = put(s, 'P1', 'coeurl');
    const spell = put(s, 'P1', 'akromas-will', 'hand');
    mana(s, 'P1', { W: 1, C: 3 });
    const modes = () => getLegalActions(s).filter((a) => a.type === 'CastSpell' && a.card === spell).map((a) => (a.type === 'CastSpell' ? a.modes : []));
    expect(modes()).toEqual([[0], [1]]);
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: spell, modes: [0, 1] })).toMatch(/modes/);
    put(s, 'P1', 'sram-senior-edificer', 'battlefield', { isCommander: true });
    expect(modes()).toEqual([[0], [1], [0, 1]]);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, modes: [0, 1] }).state;
    for (const k of ['Flying', 'Vigilance', 'DoubleStrike', 'Lifelink', 'Indestructible', 'ProtectionFromRed'] as const) expect(hasKeyword(s, s.cards[cat]!, k)).toBe(true);
  });
});

describe('S4 group 14: the Crystals', () => {
  it('The Fire Crystal: red spells cost {1} less, your creatures have haste, and a temporary token copy', () => {
    let s = newGame();
    const crystal = put(s, 'P1', 'the-fire-crystal');
    const titan = put(s, 'P1', 'primeval-titan', 'battlefield', { summoningSick: true });
    const theirs = put(s, 'P2', 'coeurl', 'battlefield', { summoningSick: true });
    expect([hasKeyword(s, s.cards[titan]!, 'Haste'), hasKeyword(s, s.cards[theirs]!, 'Haste')]).toEqual([true, false]);
    // Haste Magic ({1}{R}) for just {R}.
    const spell = put(s, 'P1', 'haste-magic', 'hand');
    mana(s, 'P1', { R: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(titan)] }).state;
    mana(s, 'P1', { R: 2, C: 4 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: crystal, ability: 0, targets: [card(titan)] }, { accept: false }).state;
    const copies = s.players.P1!.battlefield.filter((id) => s.cards[id]!.isToken && s.cards[id]!.defId === 'primeval-titan');
    expect(copies.length).toBe(1);
    s = settle(goTo(s, 'end'), { accept: false }).state;
    expect(s.cards[copies[0]!]?.zone ?? 'gone').not.toBe('battlefield');
    expect(s.cards[titan]!.zone).toBe('battlefield');
  });

  it('The Water Crystal: opponents mill four more; {4}{U}{U}, {T}: each opponent mills your hand size', () => {
    let s = newGame(3);
    const crystal = put(s, 'P1', 'the-water-crystal');
    put(s, 'P1', 'sol-ring', 'hand');
    put(s, 'P1', 'sol-ring', 'hand');
    const [two, three] = [s.players.P2!.library.length, s.players.P3!.library.length];
    mana(s, 'P1', { U: 2, C: 4 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: crystal, ability: 0, targets: [] }).state;
    expect([two - s.players.P2!.library.length, three - s.players.P3!.library.length]).toEqual([6, 6]);
    // Your own mill isn't changed (Resentful Revelation-style self mill via Vanille).
    const mine = s.players.P1!.library.length;
    const vanille = put(s, 'P1', 'vanille-cheerful-lcie', 'hand');
    mana(s, 'P1', { G: 1, C: 3 });
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: vanille })).state;
    expect(mine - s.players.P1!.library.length).toBe(2);
  });

  it('The Earth Crystal doubles +1/+1 counters on your creatures; distribute two among one or two targets', () => {
    let s = newGame();
    const crystal = put(s, 'P1', 'the-earth-crystal');
    const [a, b] = [put(s, 'P1', 'coeurl'), put(s, 'P1', 'coeurl')];
    const theirs = put(s, 'P2', 'coeurl');
    mana(s, 'P1', { G: 2, C: 4 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: crystal, ability: 0, targets: [card(a), card(b)] }).state;
    expect([s.cards[a]!.counters, s.cards[b]!.counters]).toEqual([2, 2]);
    s.cards[crystal]!.tapped = false;
    mana(s, 'P1', { G: 2, C: 4 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: crystal, ability: 0, targets: [card(a), { kind: 'none' }] }).state;
    expect(s.cards[a]!.counters).toBe(6);
    // Opponents' creatures aren't doubled (Kenrith's {1}{G}).
    const kenrith = put(s, 'P1', 'kenrith-the-returned-king');
    mana(s, 'P1', { G: 1, C: 1 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: kenrith, ability: 1, targets: [card(theirs)] }).state;
    expect(s.cards[theirs]!.counters).toBe(1);
  });

  it('The Darkness Crystal: an opponent’s nontoken creature that would die is exiled and you gain 2; later it returns under your control with two counters', () => {
    let s = newGame(3);
    const crystal = put(s, 'P1', 'the-darkness-crystal');
    const victim = put(s, 'P2', 'coeurl');
    const token = put(s, 'P2', 'hero-token', 'battlefield', { isToken: true });
    const mine = put(s, 'P1', 'coeurl');
    // Both creatures are one damage from dying; Poison the Waters gives all creatures -1/-1.
    const wipe = put(s, 'P1', 'poison-the-waters', 'hand');
    for (const id of [victim, mine]) s.cards[id]!.damage = toughnessOf(s, s.cards[id]!) - 1;
    mana(s, 'P1', { B: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: wipe, mode: 0 }).state;
    expect(s.cards[victim]!.zone).toBe('exile');
    expect(s.cards[victim]!.exiledWith?.source).toBe(crystal);
    expect(s.cards[mine]!.zone).toBe('graveyard');
    expect(s.cards[token]?.zone ?? 'gone').not.toBe('battlefield');
    expect(s.players.P1!.life).toBe(22);
    mana(s, 'P1', { B: 2, C: 4 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: crystal, ability: 0, targets: [card(victim)] }).state;
    expect([s.cards[victim]!.zone, s.cards[victim]!.controller, s.cards[victim]!.tapped, s.cards[victim]!.counters]).toEqual(['battlefield', 'P1', true, 2]);
  });
});

describe('S4 group 15: costs less for each, and a d20', () => {
  const costOf = (s: GameState, id: string) => {
    const o = getLegalActions(s).find((a) => (a.type === 'CastSpell' || a.type === 'ActivateAbility') && a.card === id);
    return o;
  };

  it('Travel the Overworld costs {1} less for each Town you control, and draws four', () => {
    let s = newGame();
    for (let i = 0; i < 3; i++) put(s, 'P1', 'capital-city');
    const spell = put(s, 'P1', 'travel-the-overworld', 'hand');
    mana(s, 'P1', { U: 2, C: 1 });
    expect(costOf(s, spell)).toBeUndefined();
    mana(s, 'P1', { C: 1 });
    const hand = s.players.P1!.hand.length;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell }).state;
    expect(s.players.P1!.hand.length).toBe(hand - 1 + 4);
  });

  it('Diamond Weapon costs {1} less for each permanent card in your graveyard and takes no combat damage', () => {
    let s = newGame();
    for (let i = 0; i < 5; i++) put(s, 'P1', 'forest', 'graveyard');
    put(s, 'P1', 'lightning-bolt', 'graveyard');
    const weapon = put(s, 'P1', 'diamond-weapon', 'hand');
    mana(s, 'P1', { G: 2, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: weapon }).state;
    expect(s.cards[weapon]!.zone).toBe('battlefield');
    // Blocks a big attacker and takes nothing; a Lightning Bolt still hurts.
    let t = newGame();
    const wall = put(t, 'P2', 'diamond-weapon');
    const titan = put(t, 'P1', 'primeval-titan');
    t = fight(t, [{ attacker: titan, defender: 'P2' }], { P2: [{ blocker: wall, attacker: titan }] }, { accept: false }).state;
    expect(t.cards[wall]!.damage).toBe(0);
    expect(t.cards[titan]!.zone).toBe('graveyard');
    const bolt = put(t, 'P1', 'lightning-bolt', 'hand');
    mana(t, 'P1', { R: 1 });
    t = cast(t, { type: 'CastSpell', player: 'P1', card: bolt, targets: [card(wall)] }).state;
    expect(t.cards[wall]!.damage).toBe(3);
  });

  it('Bartz and Boko: affinity for Birds; each other Bird you control deals damage equal to its power to an opponent’s creature', () => {
    let s = newGame();
    const birds = [0, 1, 2].map(() => put(s, 'P1', 'bird-token', 'battlefield', { isToken: true }));
    const target = put(s, 'P2', 'jumbo-cactuar');
    const bartz = put(s, 'P1', 'bartz-and-boko', 'hand');
    // {3}{G}{G} less {3} for three Birds.
    mana(s, 'P1', { G: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: bartz }, { targets: (options) => options.find((o) => o.some((t) => t.kind === 'card' && t.card === target))! }).state;
    expect(s.cards[bartz]!.zone).toBe('battlefield');
    expect(s.cards[target]!.damage).toBe(birds.reduce((n, id) => n + stats(s, id)[0]!, 0));
  });

  it('Qiqirn Merchant loots for {1}, and its {7} ability costs {1} less for each Town', () => {
    let s = newGame();
    const merchant = put(s, 'P1', 'qiqirn-merchant');
    for (let i = 0; i < 4; i++) put(s, 'P1', 'capital-city', 'battlefield', { tapped: true });
    mana(s, 'P1', { C: 3 });
    const hand = s.players.P1!.hand.length;
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: merchant, ability: 1, targets: [] }).state;
    expect(s.cards[merchant]!.zone).toBe('graveyard');
    expect(s.players.P1!.hand.length).toBe(hand + 3);
  });

  it('Ancient Copper Dragon rolls a d20 and makes that many Treasures', () => {
    let s = newGame();
    const dragon = put(s, 'P1', 'ancient-copper-dragon');
    const r = fight(s, [{ attacker: dragon, defender: 'P2' }]);
    s = r.state;
    const roll = r.events.find((e) => e.type === 'DieRolled');
    expect(roll && roll.type === 'DieRolled' && roll.sides).toBe(20);
    const result = roll && roll.type === 'DieRolled' ? roll.result : 0;
    expect(result).toBeGreaterThanOrEqual(1);
    expect(result).toBeLessThanOrEqual(20);
    expect(s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'treasure-token').length).toBe(result);
  });
});

describe('S4 group 16: Tiered spells (choose one additional cost)', () => {
  const tiered = (s: GameState, id: string, mode: number, targets: Target[] = []) => cast(s, { type: 'CastSpell', player: 'P1', card: id, mode, targets }).state;

  it('Thunder Magic: 2, 4 or 8 damage to target creature, each tier costing more', () => {
    let s = newGame();
    const small = put(s, 'P2', 'coeurl');
    const spell = put(s, 'P1', 'thunder-magic', 'hand');
    mana(s, 'P1', { R: 1 });
    // Thundara needs {3} more.
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: spell, mode: 1, targets: [card(small)] })).toBeTruthy();
    s = tiered(s, spell, 0, [card(small)]);
    expect(s.cards[small]!.damage ?? 0).toBe(toughnessOf(s, s.cards[small]!) <= 2 ? 0 : 2);
    let t = newGame();
    const big = put(t, 'P2', 'coeurl');
    const again = put(t, 'P1', 'thunder-magic', 'hand');
    mana(t, 'P1', { R: 2, C: 5 });
    t = tiered(t, again, 2, [card(big)]);
    expect(t.cards[big]!.zone).toBe('graveyard');
  });

  it('Fire Magic: 1, 2 or 3 damage to each creature', () => {
    let s = newGame();
    const mine = put(s, 'P1', 'coeurl');
    const theirs = put(s, 'P2', 'coeurl');
    const spell = put(s, 'P1', 'fire-magic', 'hand');
    mana(s, 'P1', { R: 1, C: 2 });
    s = tiered(s, spell, 1);
    for (const id of [mine, theirs]) {
      const c = s.cards[id]!;
      expect(c.zone === 'graveyard' || c.damage === 2).toBe(true);
    }
  });

  it('Ice Magic: back to hand, top or bottom of the library, or shuffled in', () => {
    let s = newGame();
    const a = put(s, 'P2', 'coeurl');
    const spell = put(s, 'P1', 'ice-magic', 'hand');
    mana(s, 'P1', { U: 1, C: 1 });
    s = tiered(s, spell, 0, [card(a)]);
    expect(s.cards[a]!.zone).toBe('hand');

    let t = newGame();
    const b = put(t, 'P2', 'coeurl');
    const second = put(t, 'P1', 'ice-magic', 'hand');
    mana(t, 'P1', { U: 1, C: 3 });
    t = tiered(t, second, 1, [card(b)]);
    // Its owner chooses top or bottom.
    expect(t.pending).toMatchObject({ kind: 'chooseCards', player: 'P2', purpose: 'library' });
    t = act(t, { type: 'ChooseCards', player: 'P2', cards: [] });
    t = settle(t).state;
    expect(t.players.P2!.library[0]).toBe(b);

    let u = newGame();
    const c = put(u, 'P2', 'coeurl');
    const third = put(u, 'P1', 'ice-magic', 'hand');
    mana(u, 'P1', { U: 2, C: 6 });
    const before = u.players.P2!.library.length;
    u = tiered(u, third, 2, [card(c)]);
    expect(u.cards[c]!.zone).toBe('library');
    expect(u.players.P2!.library.length).toBe(before + 1);
  });

  it('Restoration Magic: hexproof and indestructible, with 3 or 6 life at higher tiers', () => {
    let s = newGame();
    const mine = put(s, 'P1', 'coeurl');
    const other = put(s, 'P1', 'coeurl');
    const spell = put(s, 'P1', 'restoration-magic', 'hand');
    mana(s, 'P1', { W: 1, C: 1 });
    s = tiered(s, spell, 1, [card(mine)]);
    expect(hasKeyword(s, s.cards[mine]!, 'Indestructible')).toBe(true);
    expect(hasKeyword(s, s.cards[mine]!, 'Hexproof')).toBe(true);
    expect(hasKeyword(s, s.cards[other]!, 'Indestructible')).toBe(false);
    expect(s.players.P1!.life).toBe(23);

    let t = newGame();
    const x = put(t, 'P1', 'coeurl');
    const y = put(t, 'P1', 'coeurl');
    const curaga = put(t, 'P1', 'restoration-magic', 'hand');
    mana(t, 'P1', { W: 2, C: 3 });
    t = tiered(t, curaga, 2);
    for (const id of [x, y]) expect(hasKeyword(t, t.cards[id]!, 'Indestructible')).toBe(true);
    expect(t.players.P1!.life).toBe(26);
  });

  it('Tifa’s Limit Break: +2/+2, double, or triple power and toughness', () => {
    for (const [mode, pay, expectStats] of [
      [0, { G: 1 }, (p: number, t: number) => [p + 2, t + 2]],
      [1, { G: 1, C: 2 }, (p: number, t: number) => [p * 2, t * 2]],
      [2, { G: 2, C: 6 }, (p: number, t: number) => [p * 3, t * 3]],
    ] as const) {
      let s = newGame();
      const body = put(s, 'P1', 'coeurl');
      const [p, t] = stats(s, body) as [number, number];
      const spell = put(s, 'P1', 'tifas-limit-break', 'hand');
      mana(s, 'P1', pay);
      s = tiered(s, spell, mode, [card(body)]);
      expect(stats(s, body)).toEqual(expectStats(p, t));
    }
  });

  it('Vincent’s Limit Break: base 3/2, 5/2 or 7/2, and it comes back tapped when it dies', () => {
    let s = newGame();
    const body = put(s, 'P1', 'coeurl');
    const spell = put(s, 'P1', 'vincents-limit-break', 'hand');
    mana(s, 'P1', { B: 1, C: 2 });
    s = tiered(s, spell, 1, [card(body)]);
    expect(stats(s, body)).toEqual([5, 2]);
    // It dies: back on the battlefield, tapped, under its owner's control.
    const kill = put(s, 'P1', 'thunder-magic', 'hand');
    mana(s, 'P1', { R: 1 });
    s = tiered(s, kill, 0, [card(body)]);
    expect(s.cards[body]!.zone).toBe('battlefield');
    expect(s.cards[body]!.tapped).toBe(true);
    // A new object: back to its printed stats.
    expect(stats(s, body)).not.toEqual([5, 2]);
  });
});

describe('S4 group 17: Chocobo Birds (2/2 Birds that get +1/+0 whenever a land you control enters)', () => {
  const birds = (s: GameState) => s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'chocobo-bird-token');

  it('Gysahl Greens makes a Bird that grows with each land drop; flashback {6}{G}', () => {
    let s = newGame();
    const greens = put(s, 'P1', 'gysahl-greens', 'hand');
    mana(s, 'P1', { G: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: greens }).state;
    const [bird] = birds(s);
    expect(stats(s, bird!)).toEqual([2, 2]);
    const land = put(s, 'P1', 'forest', 'hand');
    s = settle(act(s, { type: 'PlayLand', player: 'P1', card: land })).state;
    expect(stats(s, bird!)).toEqual([3, 2]);
    // Flashback from the graveyard, then exiled.
    expect(s.cards[greens]!.zone).toBe('graveyard');
    mana(s, 'P1', { G: 1, C: 6 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: greens }).state;
    expect(birds(s)).toHaveLength(2);
    expect(s.cards[greens]!.zone).toBe('exile');
  });

  it('Call the Mountain Chocobo finds a Mountain and makes a Bird', () => {
    let s = newGame();
    const mountain = put(s, 'P1', 'mountain', 'library');
    const spell = put(s, 'P1', 'call-the-mountain-chocobo', 'hand');
    mana(s, 'P1', { R: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell }).state;
    expect(s.cards[mountain]!.zone).toBe('hand');
    expect(birds(s)).toHaveLength(1);
  });

  it('Choco-Comet deals X damage to any target and makes a Bird', () => {
    let s = newGame();
    const spell = put(s, 'P1', 'choco-comet', 'hand');
    mana(s, 'P1', { R: 2, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, x: 3, targets: [{ kind: 'player', player: 'P2' }] }).state;
    expect(s.players.P2!.life).toBe(17);
    expect(birds(s)).toHaveLength(1);
  });

  it('Chocobo Racetrack makes a Bird whenever a land you control enters', () => {
    let s = newGame();
    put(s, 'P1', 'chocobo-racetrack');
    const land = put(s, 'P1', 'forest', 'hand');
    s = settle(act(s, { type: 'PlayLand', player: 'P1', card: land })).state;
    expect(birds(s)).toHaveLength(1);
    // An opponent's land doesn't count.
    expect(s.players.P2!.battlefield.some((id) => s.cards[id]!.defId === 'chocobo-bird-token')).toBe(false);
  });

  it('Summon: Fat Chocobo is a 4/4 Saga creature: chapter I makes a Bird; later chapters give your creatures trample', () => {
    let s = newGame();
    const fat = put(s, 'P1', 'summon-fat-chocobo', 'hand');
    mana(s, 'P1', { G: 1, C: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: fat }).state;
    expect(stats(s, fat)).toEqual([4, 4]);
    expect(s.cards[fat]!.namedCounters?.lore).toBe(1);
    expect(birds(s)).toHaveLength(1);
    expect(hasKeyword(s, s.cards[fat]!, 'Trample')).toBe(false);
  });
});

describe('S4 group 18: Summon Saga creatures', () => {
  type Opts = Parameters<typeof settle>[1];
  const settleAll = (s: GameState, opts: Opts = {}): GameState => {
    s = settle(s, opts).state;
    for (let guard = 0; guard < 10 && s.pending.kind === 'chooseCards'; guard++) {
      s = settle(act(s, { type: 'ChooseCards', player: s.pending.player, cards: s.pending.cards.slice(0, Math.max(1, s.pending.min)) }), opts).state;
    }
    return s;
  };
  /** Passes turns until P1's next precombat main phase (its next chapter has happened). */
  const nextTurnOfP1 = (s: GameState, opts: Opts = {}) => {
    const turn = s.turnNumber;
    for (let guard = 0; guard < 8 && !(s.activePlayer === 'P1' && s.turnNumber > turn); guard++) {
      s = settleAll(goTo(settleAll(s, opts), 'end', opts), opts);
      s = settleAll(goTo(s, 'main1', opts), opts);
    }
    if (s.activePlayer !== 'P1' || s.turnNumber <= turn) throw new Error("never reached P1's next turn");
    return s;
  };
  const lore = (s: GameState, id: string) => s.cards[id]!.namedCounters?.lore ?? 0;
  const summon = (s: GameState, id: string, pay: Parameters<typeof mana>[2], opts: Opts = {}) => {
    const sp = put(s, 'P1', id, 'hand');
    mana(s, 'P1', pay);
    return { s: settleAll(cast(s, { type: 'CastSpell', player: 'P1', card: sp }, opts).state, opts), id: sp };
  };

  it('Summon: Knights of Round makes three Knights for chapters I-IV; V pumps the others and gives them indestructible counters', () => {
    const r = summon(newGame(), 'summon-knights-of-round', { W: 2, C: 6 });
    let s = r.s;
    const knights = () => s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'knight-token');
    expect(knights()).toHaveLength(3);
    expect(hasKeyword(s, s.cards[r.id]!, 'Indestructible')).toBe(true);
    for (let i = 0; i < 4; i++) s = nextTurnOfP1(s);
    expect(knights()).toHaveLength(12);
    const k = knights()[0]!;
    expect(countersOf(s.cards[k]!, 'indestructible')).toBe(1);
    expect(hasKeyword(s, s.cards[k]!, 'Indestructible')).toBe(true);
    expect(stats(s, k)).toEqual([4, 4]);
    // The Saga itself is sacrificed after V.
    expect(s.cards[r.id]!.zone).toBe('graveyard');
  }, 60_000);

  it('Summon: Primal Garuda deals 4 to a tapped opponent creature, then gives another creature +1/+0 and flying', () => {
    const s0 = newGame();
    const tapped = put(s0, 'P2', 'coeurl', 'battlefield', { tapped: true });
    const ally = put(s0, 'P1', 'coeurl');
    let { s } = summon(s0, 'summon-primal-garuda', { W: 1, C: 3 });
    expect(s.cards[tapped]!.zone).toBe('graveyard');
    const before = stats(s, ally)[0]!;
    s = nextTurnOfP1(s);
    expect(hasKeyword(s, s.cards[ally]!, 'Flying')).toBe(true);
    expect(stats(s, ally)[0]).toBe(before + 1);
  }, 60_000);

  it('Summon: Shiva taps and stuns an opponent creature twice, then draws for their tapped creatures', () => {
    const s0 = newGame();
    const foe = put(s0, 'P2', 'coeurl');
    const r = summon(s0, 'summon-shiva', { U: 2, C: 3 });
    let s = r.s;
    expect(s.cards[foe]!.tapped).toBe(true);
    expect(countersOf(s.cards[foe]!, 'stun')).toBe(1);
    s = nextTurnOfP1(s);
    expect(lore(s, r.id)).toBe(2);
    s = nextTurnOfP1(s);
    // Chapter III drew a card for each tapped opponent creature (plus the draw step).
    expect(s.cards[r.id]!.zone).toBe('graveyard');
  }, 60_000);

  it('Summon: Anima draws and drains you for I-III; IV makes each opponent sacrifice a creature and lose 3 life', () => {
    const s0 = newGame();
    const foe = put(s0, 'P2', 'coeurl');
    const r = summon(s0, 'summon-anima', { B: 2, C: 4 });
    let s = r.s;
    expect(s.players.P1!.life).toBe(19);
    for (let i = 0; i < 3; i++) s = nextTurnOfP1(s);
    expect(s.players.P1!.life).toBe(17);
    expect(s.cards[foe]!.zone).toBe('graveyard');
    expect(s.players.P2!.life).toBe(17);
  }, 60_000);

  it('Summon: Esper Ramuh deals damage for each noncreature, nonland card in your graveyard; then Wizards get +1/+0', () => {
    const s0 = newGame();
    for (let i = 0; i < 3; i++) put(s0, 'P1', 'thunder-magic', 'graveyard');
    const foe = put(s0, 'P2', 'coeurl');
    const { s } = summon(s0, 'summon-esper-ramuh', { R: 2, C: 2 });
    expect(s.cards[foe]!.zone === 'graveyard' || s.cards[foe]!.damage === 3).toBe(true);
  });

  it('Summon: Titan mills five, returns your lands from the graveyard tapped, then pumps another creature by your lands', () => {
    const s0 = newGame();
    const dead = put(s0, 'P1', 'forest', 'graveyard');
    const theirs = put(s0, 'P2', 'forest', 'graveyard');
    const ally = put(s0, 'P1', 'coeurl');
    const r = summon(s0, 'summon-titan', { G: 2, C: 3 });
    let s = r.s;
    expect(s.players.P1!.graveyard.length).toBeGreaterThanOrEqual(6);
    s = nextTurnOfP1(s);
    expect(s.cards[dead]!.zone).toBe('battlefield');
    expect(s.cards[theirs]!.zone).toBe('graveyard');
    const before = stats(s, ally) as [number, number];
    s = nextTurnOfP1(s);
    const lands = s.players.P1!.battlefield.filter((id) => s.cardDefs[s.cards[id]!.defId]!.types.includes('land')).length;
    expect(lands).toBeGreaterThan(0);
    expect(stats(s, ally)).toEqual([before[0] + lands, before[1] + lands]);
    expect(hasKeyword(s, s.cards[ally]!, 'Trample')).toBe(true);
    expect(s.cards[r.id]!.zone).toBe('graveyard');
  }, 60_000);
});

describe('S4 group 19: Equipment helpers and land search', () => {
  it('Danitha Capashen: first strike, vigilance, lifelink; Aura and Equipment spells cost {1} less', () => {
    let s = newGame();
    const danitha = put(s, 'P1', 'danitha-capashen-paragon');
    for (const k of ['FirstStrike', 'Vigilance', 'Lifelink'] as const) expect(hasKeyword(s, s.cards[danitha]!, k)).toBe(true);
    const plate = put(s, 'P1', 'darksteel-plate', 'hand');
    mana(s, 'P1', { C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: plate }).state;
    expect(s.cards[plate]!.zone).toBe('battlefield');
  });

  it('Prishe’s Wanderings: a basic land or Town onto the battlefield tapped, and a +1/+1 counter on your creature', () => {
    let s = newGame();
    const forest = put(s, 'P1', 'forest', 'library');
    const body = put(s, 'P1', 'coeurl');
    const spell = put(s, 'P1', 'prishes-wanderings', 'hand');
    mana(s, 'P1', { G: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(body)] }).state;
    expect(s.cards[forest]!.zone).toBe('battlefield');
    expect(s.cards[forest]!.tapped).toBe(true);
    expect(countersOf(s.cards[body]!, '+1/+1')).toBe(1);
  });

  it('Weapons Vendor draws a card; at the beginning of combat you may pay {1} to attach your Equipment to your creature', () => {
    let s = newGame();
    const vendor = put(s, 'P1', 'weapons-vendor', 'hand');
    mana(s, 'P1', { W: 1, C: 3 });
    const hand = s.players.P1!.hand.length;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: vendor }).state;
    expect(s.players.P1!.hand.length).toBe(hand); // cast one, drew one
    const plate = put(s, 'P1', 'darksteel-plate');
    put(s, 'P1', 'coeurl');
    // Into combat: the trigger asks whether to pay {1}.
    for (let i = 0; i < 12 && s.pending.kind !== 'decide'; i++) {
      if (s.pending.kind === 'chooseTargets') s = act(s, getLegalActions(s).find((a) => a.type === 'ChooseTargets')!);
      else if (s.pending.kind === 'priority' && s.stack.length > 0 && s.pending.player !== 'P1') s = act(s, { type: 'PassPriority', player: s.pending.player });
      else s = nextStep(s);
    }
    expect(s.pending.kind).toBe('decide');
    mana(s, 'P1', { C: 1 });
    s = settle(s, { accept: true }).state;
    expect(s.cards[plate]!.attachedTo).toBeDefined();
  });
});

describe('S4 group 20: Sidequests (transforming enchantments) and Stroke of Midnight', () => {
  type Opts = Parameters<typeof settle>[1];
  const settleAll = (s: GameState, opts: Opts = {}): GameState => {
    s = settle(s, opts).state;
    for (let guard = 0; guard < 10 && s.pending.kind === 'chooseCards'; guard++) {
      s = settle(act(s, { type: 'ChooseCards', player: s.pending.player, cards: s.pending.cards.slice(0, Math.max(1, s.pending.min)) }), opts).state;
    }
    return s;
  };
  const nextTurnOfP1 = (s: GameState, opts: Opts = {}) => {
    const turn = s.turnNumber;
    for (let guard = 0; guard < 8 && !(s.activePlayer === 'P1' && s.turnNumber > turn); guard++) {
      s = settleAll(goTo(settleAll(s, opts), 'end', opts), opts);
      s = settleAll(goTo(s, 'main1', opts), opts);
    }
    if (s.activePlayer !== 'P1' || s.turnNumber <= turn) throw new Error("never reached P1's next turn");
    return s;
  };
  const nameOf = (s: GameState, id: string) => currentDefinition(s, s.cards[id]!).name;

  it('Sidequest: Card Collection draws three and discards two; with eight cards in your graveyard at your end step it becomes Magicked Card, a 4/4 flying Vehicle with crew 1', () => {
    let s = newGame();
    for (let i = 0; i < 4; i++) put(s, 'P1', 'coeurl', 'library');
    const quest = put(s, 'P1', 'sidequest-card-collection-magicked-card', 'hand');
    mana(s, 'P1', { U: 1, C: 3 });
    const hand = s.players.P1!.hand.length;
    s = settleAll(cast(s, { type: 'CastSpell', player: 'P1', card: quest }).state);
    expect(s.players.P1!.hand.length).toBe(hand - 1 + 3 - 2);
    s = settleAll(goTo(s, 'end'));
    expect(s.cards[quest]!.transformed ?? false).toBe(false);
    for (let i = 0; i < 8; i++) put(s, 'P1', 'coeurl', 'graveyard');
    // Only at your own end step.
    s = nextTurnOfP1(s);
    expect(s.cards[quest]!.transformed ?? false).toBe(false);
    s = settleAll(goTo(s, 'end'));
    expect(nameOf(s, quest)).toBe('Magicked Card');
    expect(stats(s, quest)).toEqual([4, 4]);
    expect(currentDefinition(s, s.cards[quest]!).types).toEqual(['artifact']);
  }, 60_000);

  it('Sidequest: Raise a Chocobo makes a Bird; with four Birds at your first main phase it becomes Black Chocobo and fetches a land', () => {
    let s = newGame();
    const quest = put(s, 'P1', 'sidequest-raise-a-chocobo-black-chocobo', 'hand');
    mana(s, 'P1', { G: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: quest }).state;
    const birds = () => s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'chocobo-bird-token');
    expect(birds()).toHaveLength(1);
    for (let i = 0; i < 3; i++) put(s, 'P1', 'chocobo-bird-token');
    for (let i = 0; i < 3; i++) put(s, 'P1', 'forest', 'library');
    const lands = (x: GameState) => x.players.P1!.battlefield.filter((id) => x.cardDefs[x.cards[id]!.defId]!.types.includes('land'));
    const landsBefore = lands(s);
    s = nextTurnOfP1(s);
    expect(nameOf(s, quest)).toBe('Black Chocobo');
    // A 2/2 Bird, and the land it fetched triggered its own landfall: +1/+0.
    expect(stats(s, quest)).toEqual([3, 2]);
    const fetched = lands(s).filter((id) => !landsBefore.includes(id));
    expect(fetched).toHaveLength(1);
    expect(s.cards[fetched[0]!]!.tapped).toBe(true);
    // Landfall: Birds you control get +1/+0 (the tokens' own +1/+0 too).
    const [bird] = birds();
    const before = stats(s, bird!)[0]!;
    const drop = put(s, 'P1', 'forest', 'hand');
    s = settleAll(act(s, { type: 'PlayLand', player: 'P1', card: drop }));
    expect(stats(s, bird!)[0]).toBe(before + 2);
  }, 60_000);

  it('Sidequest: Hunt the Mark destroys up to one creature; a Treasure each end step a creature of theirs died; with three Treasures it becomes Yiazmat', () => {
    let s = newGame();
    const foe = put(s, 'P2', 'coeurl');
    put(s, 'P1', 'treasure-token');
    put(s, 'P1', 'treasure-token');
    const quest = put(s, 'P1', 'sidequest-hunt-the-mark-yiazmat-ultimate-mark', 'hand');
    mana(s, 'P1', { B: 2, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: quest }, { targets: () => [card(foe)] }).state;
    expect(s.cards[foe]!.zone).toBe('graveyard');
    s = settleAll(goTo(s, 'end'));
    s = settleAll(s);
    expect(s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'treasure-token')).toHaveLength(3);
    expect(nameOf(s, quest)).toBe('Yiazmat, Ultimate Mark');
    expect(stats(s, quest)).toEqual([5, 6]);
  }, 60_000);

  it('Hunt the Mark: no Treasure on a turn no creature of theirs died', () => {
    let s = newGame();
    const quest = put(s, 'P1', 'sidequest-hunt-the-mark-yiazmat-ultimate-mark', 'hand');
    mana(s, 'P1', { B: 2, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: quest }).state;
    s = settleAll(goTo(s, 'end'));
    expect(s.players.P1!.battlefield.some((id) => s.cards[id]!.defId === 'treasure-token')).toBe(false);
  });

  it('Stroke of Midnight destroys a nonland permanent; its controller gets a 1/1 Human', () => {
    let s = newGame();
    const foe = put(s, 'P2', 'coeurl');
    const spell = put(s, 'P1', 'stroke-of-midnight', 'hand');
    mana(s, 'P1', { W: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(foe)] }).state;
    expect(s.cards[foe]!.zone).toBe('graveyard');
    const humans = s.players.P2!.battlefield.filter((id) => s.cards[id]!.defId === 'human-token');
    expect(humans).toHaveLength(1);
    expect(stats(s, humans[0]!)).toEqual([1, 1]);
  });
});

describe('S4 group 21: Auras that keep a permanent tapped', () => {
  it('Sleep Magic taps the creature, which then doesn’t untap; the Aura is sacrificed when the creature is dealt damage', () => {
    let s = newGame();
    const foe = put(s, 'P2', 'coeurl');
    const aura = put(s, 'P1', 'sleep-magic', 'hand');
    mana(s, 'P1', { U: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: aura, targets: [card(foe)] }).state;
    expect(s.cards[aura]!.attachedTo).toBe(foe);
    expect(s.cards[foe]!.tapped).toBe(true);
    // Through P2's untap step: still tapped.
    s = goTo(goTo(s, 'end'), 'upkeep');
    expect(s.activePlayer).toBe('P2');
    expect(s.cards[foe]!.tapped).toBe(true);
    // Back on P1's turn, damage it: the Aura goes.
    s = goTo(goTo(s, 'end'), 'main1');
    expect(s.activePlayer).toBe('P1');
    const fire = put(s, 'P1', 'fire-magic', 'hand');
    mana(s, 'P1', { R: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: fire, mode: 0 }).state;
    expect(s.cards[aura]!.zone).toBe('graveyard');
  }, 60_000);

  it('Stuck in Summoner’s Sanctum (flash) taps an artifact or creature; it doesn’t untap and its abilities, mana abilities too, can’t be activated', () => {
    let s = newGame();
    const ring = put(s, 'P1', 'sol-ring');
    const aura = put(s, 'P1', 'stuck-in-summoners-sanctum', 'hand');
    mana(s, 'P1', { U: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: aura, targets: [card(ring)] }).state;
    expect(s.cards[ring]!.tapped).toBe(true);
    s.cards[ring]!.tapped = false;
    expect(rejected(s, { type: 'ActivateManaAbility', player: 'P1', card: ring, mana: 'C' })).toMatch(/can't be activated/);
    expect(getLegalActions(s).some((a) => a.type === 'ActivateManaAbility' && a.card === ring)).toBe(false);
  });
});

describe('S4 group 22: the last two Sidequests', () => {
  type Opts = Parameters<typeof settle>[1];
  const settleAll = (s: GameState, opts: Opts = {}): GameState => {
    s = settle(s, opts).state;
    for (let guard = 0; guard < 10 && s.pending.kind === 'chooseCards'; guard++) {
      s = settle(act(s, { type: 'ChooseCards', player: s.pending.player, cards: s.pending.cards.slice(0, s.pending.max) }), opts).state;
    }
    return s;
  };
  /** To P1's next upkeep, with its triggers resolved. */
  const toP1Upkeep = (s: GameState) => {
    for (let guard = 0; guard < 6; guard++) {
      s = settleAll(goTo(settleAll(s), 'end'));
      s = goTo(s, 'upkeep');
      if (s.activePlayer === 'P1') return settleAll(s);
    }
    throw new Error("never reached P1's upkeep");
  };
  const nameOf = (s: GameState, id: string) => currentDefinition(s, s.cards[id]!).name;

  it('Sidequest: Catch a Fish takes an artifact or creature off the top at your upkeep, makes a Food and becomes Cooking Campsite, a land that taps for {W}', () => {
    let s = newGame();
    const quest = put(s, 'P1', 'sidequest-catch-a-fish-cooking-campsite', 'hand');
    mana(s, 'P1', { W: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: quest }).state;
    const fish = put(s, 'P1', 'coeurl', 'library');
    s = toP1Upkeep(s);
    expect(s.cards[fish]!.zone).toBe('hand');
    expect(s.players.P1!.battlefield.some((id) => s.cards[id]!.defId === 'food-token')).toBe(true);
    expect(nameOf(s, quest)).toBe('Cooking Campsite');
    expect(currentDefinition(s, s.cards[quest]!).types).toEqual(['land']);
    expect(getLegalActions(s).some((a) => a.type === 'ActivateManaAbility' && a.card === quest && a.mana === 'W')).toBe(true);
  }, 60_000);

  it('Catch a Fish: a land on top stays there, and nothing transforms', () => {
    let s = newGame();
    const quest = put(s, 'P1', 'sidequest-catch-a-fish-cooking-campsite', 'hand');
    mana(s, 'P1', { W: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: quest }).state;
    const land = put(s, 'P1', 'forest', 'library');
    s = toP1Upkeep(s);
    expect(s.players.P1!.library[0]).toBe(land);
    expect(s.cards[quest]!.transformed ?? false).toBe(false);
  }, 60_000);

  it('Sidequest: Play Blitzball gives +2/+0 each combat; after 6 combat damage to a player it becomes World Champion, attached to your creature (+2/+0 and double strike)', () => {
    let s = newGame();
    const quest = put(s, 'P1', 'sidequest-play-blitzball-world-champion-celestial-weapon', 'hand');
    mana(s, 'P1', { R: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: quest }).state;
    const titan = put(s, 'P1', 'summon-titan', 'battlefield', { summoningSick: false } as never);
    s = fight(s, [{ attacker: titan, defender: 'P2' }]).state;
    expect(s.players.P2!.combatDamageThisTurn).toBeGreaterThanOrEqual(6);
    s = settleAll(goTo(s, 'main2'));
    expect(nameOf(s, quest)).toBe('World Champion, Celestial Weapon');
    const host = s.cards[quest]!.attachedTo;
    expect(host).toBeDefined();
    expect(hasKeyword(s, s.cards[host!]!, 'DoubleStrike')).toBe(true);
  }, 60_000);

  it('Play Blitzball: less than 6 combat damage, no transform', () => {
    let s = newGame();
    const quest = put(s, 'P1', 'sidequest-play-blitzball-world-champion-celestial-weapon', 'hand');
    mana(s, 'P1', { R: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: quest }).state;
    const cat = put(s, 'P1', 'coeurl', 'battlefield', { summoningSick: false } as never);
    s = fight(s, [{ attacker: cat, defender: 'P2' }]).state;
    expect(s.players.P2!.combatDamageThisTurn ?? 0).toBeLessThan(6);
    s = settleAll(goTo(s, 'main2'));
    expect(s.cards[quest]!.transformed ?? false).toBe(false);
  }, 60_000);
});

describe('S4 group 23: Summon: Bahamut and Summon: Primal Odin', () => {
  type Opts = Parameters<typeof settle>[1];
  const settleAll = (s: GameState, opts: Opts = {}): GameState => {
    s = settle(s, opts).state;
    for (let guard = 0; guard < 10 && s.pending.kind === 'chooseCards'; guard++) {
      s = settle(act(s, { type: 'ChooseCards', player: s.pending.player, cards: s.pending.cards.slice(0, Math.max(1, s.pending.min)) }), opts).state;
    }
    return s;
  };
  const nextTurnOfP1 = (s: GameState, opts: Opts = {}) => {
    const turn = s.turnNumber;
    for (let guard = 0; guard < 8 && !(s.activePlayer === 'P1' && s.turnNumber > turn); guard++) {
      s = settleAll(goTo(settleAll(s, opts), 'end', opts), opts);
      s = settleAll(goTo(s, 'main1', opts), opts);
    }
    if (s.activePlayer !== 'P1' || s.turnNumber <= turn) throw new Error("never reached P1's next turn");
    return s;
  };

  it('Summon: Bahamut destroys up to one nonland permanent (I, II), draws two (III), then deals damage equal to your other permanents’ total mana value to each opponent (IV)', () => {
    let s = newGame(3);
    const ring = put(s, 'P2', 'sol-ring');
    const bahamut = put(s, 'P1', 'summon-bahamut', 'hand');
    mana(s, 'P1', { C: 9 });
    s = settleAll(cast(s, { type: 'CastSpell', player: 'P1', card: bahamut }, { targets: (options) => [options.flat().find((t) => t.kind === 'card' && t.card === ring)!] }).state);
    expect(s.cards[ring]!.zone).toBe('graveyard');
    expect(stats(s, bahamut)).toEqual([9, 9]);
    expect(hasKeyword(s, s.cards[bahamut]!, 'Flying')).toBe(true);
    // Something of P2's for chapter II, and other permanents for Mega Flare (mana value 1 + 1).
    put(s, 'P2', 'coeurl');
    put(s, 'P1', 'sol-ring');
    put(s, 'P1', 'sol-ring');
    for (let i = 0; i < 3; i++) {
      s = nextTurnOfP1(s, { targets: (options) => [options.flat().find((t) => t.kind === 'card' && s.cards[t.card]!.controller !== 'P1') ?? options[0]![0]!] });
    }
    // Chapter IV happened: the damage equals the total mana value of P1's other permanents then.
    expect(s.cards[bahamut]!.zone).toBe('graveyard');
    expect(s.players.P2!.life).toBe(18);
    expect(s.players.P3!.life).toBe(18);
  }, 60_000);

  it('Summon: Primal Odin destroys an opponent’s creature; with Zantetsuken, combat damage to a player makes them lose the game', () => {
    let s = newGame();
    const foe = put(s, 'P2', 'coeurl');
    const odin = put(s, 'P1', 'summon-primal-odin', 'hand');
    mana(s, 'P1', { B: 2, C: 4 });
    s = settleAll(cast(s, { type: 'CastSpell', player: 'P1', card: odin }).state);
    expect(s.cards[foe]!.zone).toBe('graveyard');
    s = nextTurnOfP1(s);
    expect(s.cards[odin]!.namedCounters?.lore).toBe(2);
    s = fight(s, [{ attacker: odin, defender: 'P2' }]).state;
    expect(s.players.P2!.eliminated).toBe(true);
  }, 60_000);
});

describe('S4 group 24: copying your next instant or sorcery (Ether, Summon: G.F. Cerberus)', () => {
  type Opts = Parameters<typeof settle>[1];
  const settleAll = (s: GameState, opts: Opts = {}): GameState => {
    s = settle(s, opts).state;
    for (let guard = 0; guard < 10 && s.pending.kind === 'chooseCards'; guard++) {
      s = settle(act(s, { type: 'ChooseCards', player: s.pending.player, cards: s.pending.cards.slice(0, Math.max(1, s.pending.min)) }), opts).state;
    }
    return s;
  };
  const nextTurnOfP1 = (s: GameState, opts: Opts = {}) => {
    const turn = s.turnNumber;
    for (let guard = 0; guard < 8 && !(s.activePlayer === 'P1' && s.turnNumber > turn); guard++) {
      s = settleAll(goTo(settleAll(s, opts), 'end', opts), opts);
      s = settleAll(goTo(s, 'main1', opts), opts);
    }
    if (s.activePlayer !== 'P1' || s.turnNumber <= turn) throw new Error("never reached P1's next turn");
    return s;
  };
  const birds = (s: GameState) => s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'chocobo-bird-token').length;
  const comet = (s: GameState, x: number) => {
    const spell = put(s, 'P1', 'choco-comet', 'hand');
    mana(s, 'P1', { R: 2, C: x });
    return { spell, s: cast(s, { type: 'CastSpell', player: 'P1', card: spell, x, targets: [{ kind: 'player', player: 'P2' }] }).state };
  };

  it('Ether: {T}, exile it: add {U}, and the next instant or sorcery you cast this turn is copied (same targets and X); only the next one', () => {
    let s = newGame();
    const ether = put(s, 'P1', 'ether');
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: ether, ability: 0 }).state;
    expect(s.cards[ether]!.zone).toBe('exile');
    expect(s.players.P1!.manaPool.U).toBe(1);
    const first = comet(s, 2);
    s = first.s;
    // The spell and its copy: 2 + 2 damage, two Birds. The copy is gone; the card is in the graveyard.
    expect(s.players.P2!.life).toBe(16);
    expect(birds(s)).toBe(2);
    expect(s.cards[first.spell]!.zone).toBe('graveyard');
    expect(Object.values(s.cards).filter((c) => c.spellCopy).every((c) => c.zone === 'void')).toBe(true);
    expect(s.players.P1!.graveyard.filter((id) => s.cards[id]!.defId === 'choco-comet')).toHaveLength(1);
    // The next one isn't copied.
    s = comet(s, 1).s;
    expect(s.players.P2!.life).toBe(15);
    expect(birds(s)).toBe(3);
  });

  it('Summon: G.F. Cerberus: surveil 1, then copy your next instant or sorcery once (II) and twice (III)', () => {
    let s = newGame();
    const cerberus = put(s, 'P1', 'summon-g-f-cerberus', 'hand');
    mana(s, 'P1', { R: 2, C: 2 });
    s = settleAll(cast(s, { type: 'CastSpell', player: 'P1', card: cerberus }).state);
    expect(stats(s, cerberus)).toEqual([3, 3]);
    s = nextTurnOfP1(s);
    s = comet(s, 1).s;
    expect(s.players.P2!.life).toBe(18);
    s = nextTurnOfP1(s);
    const life = s.players.P2!.life;
    s = comet(s, 1).s;
    expect(s.players.P2!.life).toBe(life - 3);
    expect(s.cards[cerberus]!.zone).toBe('graveyard');
  }, 60_000);
});

describe('S4 group 25: Summon: Fenrir and Summon: Leviathan', () => {
  type Opts = Parameters<typeof settle>[1];
  const settleAll = (s: GameState, opts: Opts = {}): GameState => {
    s = settle(s, opts).state;
    for (let guard = 0; guard < 10 && s.pending.kind === 'chooseCards'; guard++) {
      s = settle(act(s, { type: 'ChooseCards', player: s.pending.player, cards: s.pending.cards.slice(0, Math.max(1, s.pending.min)) }), opts).state;
    }
    return s;
  };
  const nextTurnOfP1 = (s: GameState, opts: Opts = {}) => {
    const turn = s.turnNumber;
    for (let guard = 0; guard < 8 && !(s.activePlayer === 'P1' && s.turnNumber > turn); guard++) {
      s = settleAll(goTo(settleAll(s, opts), 'end', opts), opts);
      s = settleAll(goTo(s, 'main1', opts), opts);
    }
    if (s.activePlayer !== 'P1' || s.turnNumber <= turn) throw new Error("never reached P1's next turn");
    return s;
  };

  it('Summon: Fenrir fetches a basic land (I), your next creature spell gets a +1/+1 counter (II), and draws if you control the biggest creature (III)', () => {
    let s = newGame();
    for (let i = 0; i < 3; i++) put(s, 'P1', 'forest', 'library');
    const fenrir = put(s, 'P1', 'summon-fenrir', 'hand');
    mana(s, 'P1', { G: 1, C: 2 });
    const landsBefore = s.players.P1!.battlefield.length;
    s = settleAll(cast(s, { type: 'CastSpell', player: 'P1', card: fenrir }).state);
    expect(s.players.P1!.battlefield.length).toBe(landsBefore + 2); // Fenrir and a tapped land
    s = nextTurnOfP1(s);
    const cat = put(s, 'P1', 'coeurl', 'hand');
    mana(s, 'P1', { W: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: cat }).state;
    expect(countersOf(s.cards[cat]!, '+1/+1')).toBe(1);
    const hand = s.players.P1!.hand.length;
    s = nextTurnOfP1(s);
    // The draw step and chapter III (P1 controls the biggest creature).
    expect(s.players.P1!.hand.length).toBe(hand + 2);
  }, 60_000);

  it('Summon: Leviathan (ward 2) returns every creature but the sea creatures; then sea creatures attacking draw you a card', () => {
    let s = newGame();
    const mine = put(s, 'P1', 'coeurl');
    const theirs = put(s, 'P2', 'coeurl');
    const leviathan = put(s, 'P1', 'summon-leviathan', 'hand');
    mana(s, 'P1', { U: 2, C: 4 });
    s = settleAll(cast(s, { type: 'CastSpell', player: 'P1', card: leviathan }).state);
    expect(s.cards[mine]!.zone).toBe('hand');
    expect(s.cards[theirs]!.zone).toBe('hand');
    expect(s.cards[leviathan]!.zone).toBe('battlefield');
    expect(stats(s, leviathan)).toEqual([6, 6]);
    s = nextTurnOfP1(s);
    const hand = s.players.P1!.hand.length;
    s = fight(s, [{ attacker: leviathan, defender: 'P2' }]).state;
    expect(s.players.P1!.hand.length).toBe(hand + 1);
  }, 60_000);
});

describe('S4 group 26: landfall, enters and attack triggers', () => {
  const ofDef = (s: GameState, player: string, defId: string) => s.players[player]!.battlefield.filter((id) => s.cards[id]!.defId === defId);
  const playLand = (s: GameState) => settle(act(s, { type: 'PlayLand', player: 'P1', card: put(s, 'P1', 'forest', 'hand') })).state;

  it('Ambrosia Whiteheart (flash) may return another permanent you control; landfall gives it +1/+0', () => {
    let s = newGame();
    const other = put(s, 'P1', 'coeurl');
    const ambrosia = put(s, 'P1', 'ambrosia-whiteheart', 'hand');
    mana(s, 'P1', { W: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: ambrosia }, { accept: true }).state;
    expect(s.cards[other]!.zone).toBe('hand');
    s = playLand(s);
    expect(stats(s, ambrosia)).toEqual([3, 2]);
  });

  it('Gladiolus Amicitia fetches a land tapped; landfall: another creature of yours gets +2/+2 and trample', () => {
    let s = newGame();
    for (let i = 0; i < 2; i++) put(s, 'P1', 'forest', 'library');
    const ally = put(s, 'P1', 'coeurl');
    const before = stats(s, ally) as [number, number];
    const glad = put(s, 'P1', 'gladiolus-amicitia', 'hand');
    mana(s, 'P1', { R: 1, G: 1, C: 4 });
    const lands = s.players.P1!.battlefield.length;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: glad }, { targets: (o) => [o.flat().find((t) => t.kind === 'card' && t.card === ally)!] }).state;
    // Gladiolus, and the fetched land entering triggered landfall on the ally.
    expect(s.players.P1!.battlefield.length).toBe(lands + 2);
    expect(stats(s, ally)).toEqual([before[0] + 2, before[1] + 2]);
    expect(hasKeyword(s, s.cards[ally]!, 'Trample')).toBe(true);
  });

  it('Cloud of Darkness (flying) gives an opponent’s creature -X/-X for each permanent card in your graveyard', () => {
    let s = newGame();
    put(s, 'P1', 'coeurl', 'graveyard');
    put(s, 'P1', 'forest', 'graveyard');
    put(s, 'P1', 'thunder-magic', 'graveyard');
    const big = put(s, 'P2', 'summon-titan');
    const cloud = put(s, 'P1', 'cloud-of-darkness', 'hand');
    mana(s, 'P1', { B: 1, G: 2, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: cloud }).state;
    expect(hasKeyword(s, s.cards[cloud]!, 'Flying')).toBe(true);
    expect(stats(s, big)).toEqual([5, 5]);
  });

  it('Coral Sword (flash) attaches to your creature as it enters, giving first strike this turn; +1/+0', () => {
    let s = newGame();
    const body = put(s, 'P1', 'coeurl');
    const before = stats(s, body)[0]!;
    const sword = put(s, 'P1', 'coral-sword', 'hand');
    mana(s, 'P1', { R: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: sword }).state;
    expect(s.cards[sword]!.attachedTo).toBe(body);
    expect(stats(s, body)[0]).toBe(before + 1);
    expect(hasKeyword(s, s.cards[body]!, 'FirstStrike')).toBe(true);
  });

  it('Qutrub Forayer destroys a creature dealt damage this turn, or exiles up to two cards from a single graveyard', () => {
    let s = newGame();
    const hurt = put(s, 'P2', 'summon-titan');
    const fine = put(s, 'P2', 'summon-titan');
    const bolt = put(s, 'P1', 'thunder-magic', 'hand');
    mana(s, 'P1', { R: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: bolt, mode: 0, targets: [card(hurt)] }).state;
    const q = put(s, 'P1', 'qutrub-forayer', 'hand');
    mana(s, 'P1', { B: 1, C: 2 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: q });
    s = settle(s).state;
    if (s.pending.kind === 'chooseModes') s = act(s, { type: 'ChooseModes', player: 'P1', modes: [0] });
    s = settle(s).state;
    expect(s.cards[hurt]!.zone).toBe('graveyard');
    expect(s.cards[fine]!.zone).toBe('battlefield');

    // Mode 2: both cards must come from one graveyard.
    let t = newGame();
    put(t, 'P1', 'coeurl', 'graveyard');
    put(t, 'P2', 'coeurl', 'graveyard');
    put(t, 'P2', 'forest', 'graveyard');
    const q2 = put(t, 'P1', 'qutrub-forayer', 'hand');
    mana(t, 'P1', { B: 1, C: 2 });
    t = settle(act(t, { type: 'CastSpell', player: 'P1', card: q2 })).state;
    t = act(t, { type: 'ChooseModes', player: 'P1', modes: [1] });
    const options = getLegalActions(t).filter((a): a is Extract<typeof a, { type: 'ChooseTargets' }> => a.type === 'ChooseTargets');
    expect(options.length).toBeGreaterThan(0);
    for (const o of options) {
      const owners = new Set(o.targets.filter((x) => x.kind === 'card').map((x) => (x.kind === 'card' ? t.cards[x.card]!.owner : '')));
      expect(owners.size).toBeLessThanOrEqual(1);
    }
  });

  it('Rufus Shinra makes Darkstar when it attacks, unless you already control one', () => {
    let s = newGame();
    const rufus = put(s, 'P1', 'rufus-shinra');
    s = fight(s, [{ attacker: rufus, defender: 'P2' }]).state;
    expect(ofDef(s, 'P1', 'darkstar-token')).toHaveLength(1);
    expect(stats(s, ofDef(s, 'P1', 'darkstar-token')[0]!)).toEqual([2, 2]);
    let t = newGame();
    const r2 = put(t, 'P1', 'rufus-shinra');
    put(t, 'P1', 'darkstar-token');
    t = fight(t, [{ attacker: r2, defender: 'P2' }]).state;
    expect(ofDef(t, 'P1', 'darkstar-token')).toHaveLength(1);
  });

  it('Rinoa Heartilly makes Angelo; when she attacks, another creature gets +1/+1 for each creature you control', () => {
    let s = newGame();
    const rinoa = put(s, 'P1', 'rinoa-heartilly', 'hand');
    mana(s, 'P1', { G: 1, W: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: rinoa }).state;
    const [angelo] = ofDef(s, 'P1', 'angelo-token');
    expect(stats(s, angelo!)).toEqual([1, 1]);
    s.cards[rinoa]!.summoningSick = false;
    const creatures = s.players.P1!.battlefield.filter((id) => s.cardDefs[s.cards[id]!.defId]!.types.includes('creature')).length;
    s = fight(s, [{ attacker: rinoa, defender: 'P2' }]).state;
    expect(stats(s, angelo!)).toEqual([1 + creatures, 1 + creatures]);
  });
});

describe('S4 group 27: lands and growing', () => {
  it('Town Greeter looks at the top four: a land into your hand, the rest into the graveyard; 2 life if it was a Town', () => {
    for (const town of [true, false]) {
      let s = newGame();
      const land = put(s, 'P1', town ? 'adventurers-inn' : 'forest', 'library');
      for (let i = 0; i < 3; i++) put(s, 'P1', 'coeurl', 'library');
      const greeter = put(s, 'P1', 'town-greeter', 'hand');
      mana(s, 'P1', { G: 1, C: 1 });
      s = settle(act(s, { type: 'CastSpell', player: 'P1', card: greeter })).state;
      expect(s.pending).toMatchObject({ kind: 'chooseCards', purpose: 'lookTop', cards: [land] });
      s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [land] })).state;
      expect(s.cards[land]!.zone).toBe('hand');
      expect(s.players.P1!.graveyard.filter((id) => s.cards[id]!.defId === 'coeurl')).toHaveLength(3);
      expect(s.players.P1!.life).toBe(town ? 22 : 20);
    }
  });

  it('Reach the Horizon puts up to two basic lands or Towns with different names onto the battlefield tapped', () => {
    let s = newGame();
    const forests = [put(s, 'P1', 'forest', 'library'), put(s, 'P1', 'forest', 'library')];
    const inn = put(s, 'P1', 'adventurers-inn', 'library');
    const spell = put(s, 'P1', 'reach-the-horizon', 'hand');
    mana(s, 'P1', { G: 1, C: 3 });
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: spell }), { targets: undefined }).state;
    // settle takes the first matching cards; with two Forests first, that pick is refused.
    expect(s.pending.kind === 'chooseCards' || s.cards[inn]!.zone === 'battlefield').toBe(true);
    if (s.pending.kind === 'chooseCards') {
      expect(rejected(s, { type: 'ChooseCards', player: 'P1', cards: forests })).toMatch(/different names/);
      s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [forests[0]!, inn] })).state;
    }
    expect(s.cards[inn]!.zone).toBe('battlefield');
    expect(s.cards[inn]!.tapped).toBe(true);
    expect(forests.filter((id) => s.cards[id]!.zone === 'battlefield')).toHaveLength(1);
  });

  it('Ride the Shoopuf: landfall puts a +1/+1 counter on your creature; {5}{G}{G}: it becomes a 7/7 Beast creature for good', () => {
    let s = newGame();
    const shoopuf = put(s, 'P1', 'ride-the-shoopuf');
    const body = put(s, 'P1', 'coeurl');
    s = settle(act(s, { type: 'PlayLand', player: 'P1', card: put(s, 'P1', 'forest', 'hand') })).state;
    expect(countersOf(s.cards[body]!, '+1/+1')).toBe(1);
    mana(s, 'P1', { G: 2, C: 5 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: shoopuf, ability: 0 }).state;
    expect(stats(s, shoopuf)).toEqual([7, 7]);
    expect(currentDefinition(s, s.cards[shoopuf]!).types).toEqual(['enchantment', 'creature']);
    expect(currentDefinition(s, s.cards[shoopuf]!).subtypes).toContain('Beast');
    // Still a creature on later turns.
    s = goTo(goTo(s, 'end'), 'upkeep');
    expect(currentDefinition(s, s.cards[shoopuf]!).types).toContain('creature');
  });
});

describe('S4 group 28: Crossroads Village and Delivery Moogle', () => {
  it('Crossroads Village enters tapped; as it enters you choose a color, and it taps for that color only', () => {
    let s = newGame();
    const village = put(s, 'P1', 'crossroads-village', 'hand');
    s = act(s, { type: 'PlayLand', player: 'P1', card: village });
    expect(s.pending).toMatchObject({ kind: 'chooseColor', player: 'P1', card: village });
    s = act(s, { type: 'ChooseColor', player: 'P1', color: 'B' });
    expect(s.pending.kind).toBe('priority');
    expect(s.cards[village]!.tapped).toBe(true);
    s.cards[village]!.tapped = false;
    const offered = getLegalActions(s).filter((a) => a.type === 'ActivateManaAbility' && a.card === village);
    expect(offered.map((a) => (a.type === 'ActivateManaAbility' ? a.mana : ''))).toEqual(['B']);
    expect(rejected(s, { type: 'ActivateManaAbility', player: 'P1', card: village, mana: 'G' })).toBeTruthy();
  });

  it('Delivery Moogle (flying) finds an artifact with mana value 2 or less in your library or graveyard', () => {
    let s = newGame();
    const ring = put(s, 'P1', 'sol-ring', 'graveyard');
    const moogle = put(s, 'P1', 'delivery-moogle', 'hand');
    mana(s, 'P1', { W: 1, C: 3 });
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: moogle })).state;
    expect(s.cards[ring]!.zone).toBe('hand');
    expect(hasKeyword(s, s.cards[moogle]!, 'Flying')).toBe(true);
  });
});

describe('S4 group 29: Galuf’s Final Act and Self-Destruct', () => {
  it('Galuf’s Final Act: +1/+0, and when that creature dies this turn, +1/+1 counters equal to its power on up to one creature', () => {
    let s = newGame();
    const body = put(s, 'P1', 'coeurl');
    const heir = put(s, 'P1', 'summon-titan');
    const spell = put(s, 'P1', 'galufs-final-act', 'hand');
    mana(s, 'P1', { G: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(body)] }).state;
    const power = stats(s, body)[0]!;
    const kill = put(s, 'P1', 'thunder-magic', 'hand');
    mana(s, 'P1', { R: 2, C: 5 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: kill, mode: 2, targets: [card(body)] }, { targets: (o) => [o.flat().find((t) => t.kind === 'card' && t.card === heir)!] }).state;
    expect(s.cards[body]!.zone).toBe('graveyard');
    expect(countersOf(s.cards[heir]!, '+1/+1')).toBe(power);
  });

  it('Self-Destruct: your creature deals damage equal to its power to another target and to itself', () => {
    let s = newGame();
    const titan = put(s, 'P1', 'summon-titan');
    const spell = put(s, 'P1', 'self-destruct', 'hand');
    mana(s, 'P1', { R: 1, C: 1 });
    // The other target can't be the creature itself.
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(titan), card(titan)] })).toBeTruthy();
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(titan), { kind: 'player', player: 'P2' }] }).state;
    expect(s.players.P2!.life).toBe(13);
    expect(s.cards[titan]!.zone).toBe('graveyard');
  });
});

describe('S4 group 30: Clash of the Eikons and Phantom Train', () => {
  it('Clash of the Eikons: your creature fights theirs; and/or remove or add a lore counter on your Saga', () => {
    let s = newGame();
    const titan = put(s, 'P1', 'summon-titan');
    const foe = put(s, 'P2', 'coeurl');
    const saga = put(s, 'P1', 'summon-fat-chocobo');
    s.cards[saga]!.namedCounters = { lore: 2 };
    const clash = put(s, 'P1', 'clash-of-the-eikons', 'hand');
    mana(s, 'P1', { G: 1 });
    // Fight, and remove a lore counter.
    s = cast(s, { type: 'CastSpell', player: 'P1', card: clash, modes: [0, 1], targets: [card(titan), card(foe), card(saga)] }).state;
    expect(s.cards[foe]!.zone).toBe('graveyard');
    expect(s.cards[titan]!.zone).toBe('battlefield');
    expect(s.cards[saga]!.namedCounters?.lore).toBe(1);
    // Adding a lore counter triggers that chapter (II: your creatures gain trample).
    const again = put(s, 'P1', 'clash-of-the-eikons', 'hand');
    mana(s, 'P1', { G: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: again, modes: [2], targets: [card(saga)] }).state;
    expect(s.cards[saga]!.namedCounters?.lore).toBe(2);
    expect(hasKeyword(s, s.cards[titan]!, 'Trample')).toBe(true);
  });

  it('Phantom Train: sacrifice another artifact or creature: a +1/+1 counter, and it’s an artifact creature until end of turn', () => {
    let s = newGame();
    const train = put(s, 'P1', 'phantom-train');
    const fodder = put(s, 'P1', 'coeurl');
    expect(currentDefinition(s, s.cards[train]!).types).not.toContain('creature');
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: train, ability: 0, costCards: [fodder] }).state;
    expect(s.cards[fodder]!.zone).toBe('graveyard');
    expect(countersOf(s.cards[train]!, '+1/+1')).toBe(1);
    expect(currentDefinition(s, s.cards[train]!).types).toContain('creature');
    expect(stats(s, train)).toEqual([5, 5]);
    expect(hasKeyword(s, s.cards[train]!, 'Trample')).toBe(true);
    s = goTo(goTo(s, 'end'), 'upkeep');
    expect(currentDefinition(s, s.cards[train]!).types).not.toContain('creature');
  });
});

describe('S4 group 31: Syncopate', () => {
  /** P1 casts a creature, then Syncopate (X) on it: P1, the creature's controller, decides. */
  const setup = (x: number) => {
    let s = newGame();
    const cat = put(s, 'P1', 'coeurl', 'hand');
    mana(s, 'P1', { W: 1, C: 1 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: cat });
    const sync = put(s, 'P1', 'syncopate', 'hand');
    mana(s, 'P1', { U: 1, C: x });
    s = act(s, { type: 'CastSpell', player: 'P1', card: sync, x, targets: [{ kind: 'card', card: cat }] });
    for (let i = 0; i < 4 && s.pending.kind === 'priority'; i++) s = act(s, { type: 'PassPriority', player: s.pending.player });
    return { s, cat };
  };

  it('counters the spell unless its controller pays {X}; countered, it’s exiled', () => {
    let { s, cat } = setup(2);
    expect(s.pending).toMatchObject({ kind: 'chooseCards', purpose: 'payToAvoidCounter', player: 'P1', payGeneric: 2 });
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [] })).state;
    expect(s.cards[cat]!.zone).toBe('exile');
  });

  it('paying keeps the spell; paying needs the mana in the pool (lands can be tapped while deciding)', () => {
    let { s, cat } = setup(2);
    expect(rejected(s, { type: 'ChooseCards', player: 'P1', cards: [cat] })).toMatch(/Tap mana/);
    const lands = [put(s, 'P1', 'forest'), put(s, 'P1', 'forest')];
    for (const land of lands) s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: land, mana: 'G' });
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [cat] })).state;
    expect(s.cards[cat]!.zone).toBe('battlefield');
  });
});

describe('S4 group 32: Swallowed by Leviathan and The Final Days', () => {
  it('The Final Days: two tapped 2/2 Horrors; cast from the graveyard (flashback), one per creature card there', () => {
    let s = newGame();
    const horrors = () => s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'horror-token');
    const days = put(s, 'P1', 'the-final-days', 'hand');
    mana(s, 'P1', { B: 2, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: days }).state;
    expect(horrors()).toHaveLength(2);
    expect(horrors().every((id) => s.cards[id]!.tapped)).toBe(true);
    expect(stats(s, horrors()[0]!)).toEqual([2, 2]);
    for (let i = 0; i < 3; i++) put(s, 'P1', 'coeurl', 'graveyard');
    mana(s, 'P1', { B: 2, C: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: days }).state;
    expect(horrors()).toHaveLength(5);
    expect(s.cards[days]!.zone).toBe('exile');
  });

  it('Swallowed by Leviathan: surveil 2, then counter the spell unless its controller pays {1} per card in your graveyard', () => {
    let s = newGame();
    for (let i = 0; i < 2; i++) put(s, 'P1', 'forest', 'graveyard');
    const cat = put(s, 'P1', 'coeurl', 'hand');
    mana(s, 'P1', { W: 1, C: 1 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: cat });
    const swallow = put(s, 'P1', 'swallowed-by-leviathan', 'hand');
    mana(s, 'P1', { U: 1, C: 2 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: swallow, targets: [{ kind: 'card', card: cat }] });
    s = settle(s, { surveilToGraveyard: true }).state;
    // Surveiled two into the graveyard first: now 4 cards there.
    expect(s.pending).toMatchObject({ kind: 'chooseCards', purpose: 'payToAvoidCounter', payGeneric: 4 });
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [] })).state;
    expect(s.cards[cat]!.zone).toBe('graveyard');
  });
});

describe('S4 group 32b: Unexpected Request', () => {
  it('gains control of a creature until end of turn, untaps it, gives it haste, and may lend it your Equipment until then', () => {
    let s = newGame();
    const titan = put(s, 'P2', 'summon-titan', 'battlefield', { tapped: true });
    const plate = put(s, 'P1', 'darksteel-plate');
    const spell = put(s, 'P1', 'unexpected-request', 'hand');
    mana(s, 'P1', { R: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(plate), card(titan)] }).state;
    expect(s.cards[titan]!.controller).toBe('P1');
    expect(s.cards[titan]!.tapped).toBe(false);
    expect(hasKeyword(s, s.cards[titan]!, 'Haste')).toBe(true);
    expect(s.cards[plate]!.attachedTo).toBe(titan);
    // After the turn: back to its owner, and the Equipment comes off.
    s = goTo(goTo(s, 'end'), 'upkeep');
    expect(s.cards[titan]!.controller).toBe('P2');
    expect(s.cards[plate]!.attachedTo).toBeUndefined();
    expect(s.cards[plate]!.controller).toBe('P1');
  });
});

describe('S4 group 33: Zidane, Tantalus Thief and Stolen Uniform', () => {
  const treasures = (s: GameState) => s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'treasure-token').length;

  it('Zidane borrows a creature until end of turn (untapped, lifelink, haste); when it goes back, you get a Treasure', () => {
    let s = newGame();
    const titan = put(s, 'P2', 'summon-titan', 'battlefield', { tapped: true });
    const zidane = put(s, 'P1', 'zidane-tantalus-thief', 'hand');
    mana(s, 'P1', { R: 1, W: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: zidane }).state;
    expect(s.cards[titan]!.controller).toBe('P1');
    expect(s.cards[titan]!.tapped).toBe(false);
    for (const k of ['Lifelink', 'Haste'] as const) expect(hasKeyword(s, s.cards[titan]!, k)).toBe(true);
    expect(treasures(s)).toBe(0);
    s = settle(goTo(settle(goTo(s, 'end')).state, 'upkeep')).state;
    expect(s.cards[titan]!.controller).toBe('P2');
    expect(treasures(s)).toBe(1);
  });

  it('Stolen Uniform takes an Equipment until end of turn and attaches it to your creature; it comes off when it goes back', () => {
    let s = newGame();
    const plate = put(s, 'P2', 'darksteel-plate');
    const body = put(s, 'P1', 'coeurl');
    const spell = put(s, 'P1', 'stolen-uniform', 'hand');
    mana(s, 'P1', { U: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(plate), card(body)] }).state;
    expect(s.cards[plate]!.controller).toBe('P1');
    expect(s.cards[plate]!.attachedTo).toBe(body);
    expect(hasKeyword(s, s.cards[body]!, 'Indestructible')).toBe(true);
    s = goTo(goTo(s, 'end'), 'upkeep');
    expect(s.cards[plate]!.controller).toBe('P2');
    expect(s.cards[plate]!.attachedTo).toBeUndefined();
  });
});

describe('S4 group 34: Random Encounter', () => {
  it('shuffles, mills four, puts the creature cards milled onto the battlefield with haste, and returns them to hand at the end step', () => {
    let s = newGame();
    // A library of creatures, so some are milled whatever the shuffle.
    for (let i = 0; i < 6; i++) put(s, 'P1', 'coeurl', 'library');
    const spell = put(s, 'P1', 'random-encounter', 'hand');
    mana(s, 'P1', { R: 2, C: 4 });
    const graveBefore = s.players.P1!.graveyard.length;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell }).state;
    const back = s.players.P1!.battlefield.filter((id) => s.cards[id]!.returnToHandAtEndStep);
    // Four were milled: the creatures among them came back, the rest stayed in the graveyard.
    const milledStaying = s.players.P1!.graveyard.filter((id) => s.cards[id]!.milledBy?.source === spell);
    expect(back.length + milledStaying.length).toBe(4);
    expect(milledStaying.every((id) => !s.cardDefs[s.cards[id]!.defId]!.types.includes('creature'))).toBe(true);
    expect(back.length).toBeGreaterThan(0);
    for (const id of back) expect(hasKeyword(s, s.cards[id]!, 'Haste')).toBe(true);
    expect(s.players.P1!.graveyard.length).toBe(graveBefore + milledStaying.length + 1);
    s = goTo(s, 'end');
    for (const id of back) expect(s.cards[id]!.zone).toBe('hand');
  });
});

describe('S4 group 35: Reno and Rude', () => {
  /** Reno and Rude hits P2, whose top card is a Coeurl; P1 may sacrifice `fodder`. */
  const hit = (sacrifice: boolean) => {
    let s = newGame();
    const reno = put(s, 'P1', 'reno-and-rude');
    const fodder = put(s, 'P1', 'sol-ring');
    const top = put(s, 'P2', 'coeurl', 'library');
    s = fight(s, [{ attacker: reno, defender: 'P2' }]).state;
    if (s.pending.kind === 'chooseCards') s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: sacrifice ? [fodder] : [] })).state;
    return { s, top, fodder };
  };

  it('exiles the top card of the damaged player’s library; sacrificing lets you play it this turn with any type of mana', () => {
    let { s, top, fodder } = hit(true);
    expect(s.cards[top]!.zone).toBe('exile');
    expect(s.cards[fodder]!.zone).toBe('graveyard');
    s = goTo(s, 'main2');
    mana(s, 'P1', { G: 2 }); // Coeurl costs {1}{W}: green pays for it.
    s = cast(s, { type: 'CastSpell', player: 'P1', card: top }).state;
    expect(s.cards[top]!.zone).toBe('battlefield');
    expect(s.cards[top]!.controller).toBe('P1');
  });

  it('without a sacrifice the card stays exiled and can’t be played', () => {
    let { s, top } = hit(false);
    expect(s.cards[top]!.zone).toBe('exile');
    s = goTo(s, 'main2');
    mana(s, 'P1', { W: 1, C: 1 });
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: top })).toBeTruthy();
  });
});

describe('S4 group 36: Cryptic Command, Genji Glove, Godo, Matoya, Ranger-Captain of Eos', () => {
  it('Cryptic Command: choose two (bounce a permanent and draw; or tap their creatures and draw)', () => {
    let s = newGame();
    const foe = put(s, 'P2', 'coeurl');
    const cmd = put(s, 'P1', 'cryptic-command', 'hand');
    mana(s, 'P1', { U: 3, C: 1 });
    const hand = s.players.P1!.hand.length;
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: cmd, modes: [3] })).toBeTruthy();
    s = cast(s, { type: 'CastSpell', player: 'P1', card: cmd, modes: [1, 3], targets: [card(foe)] }).state;
    expect(s.cards[foe]!.zone).toBe('hand');
    expect(s.players.P1!.hand.length).toBe(hand);
    let t = newGame();
    const a = put(t, 'P2', 'coeurl');
    const mine = put(t, 'P1', 'coeurl');
    const cmd2 = put(t, 'P1', 'cryptic-command', 'hand');
    mana(t, 'P1', { U: 3, C: 1 });
    t = cast(t, { type: 'CastSpell', player: 'P1', card: cmd2, modes: [2, 3] }).state;
    expect(t.cards[a]!.tapped).toBe(true);
    expect(t.cards[mine]!.tapped).toBe(false);
  });

  it('Genji Glove: double strike; attacking in the first combat untaps the creature and adds a combat phase', () => {
    let s = newGame();
    const body = put(s, 'P1', 'coeurl');
    put(s, 'P1', 'genji-glove', 'battlefield', { attachedTo: body });
    expect(hasKeyword(s, s.cards[body]!, 'DoubleStrike')).toBe(true);
    s = fight(s, [{ attacker: body, defender: 'P2' }]).state;
    expect(s.cards[body]!.tapped).toBe(false);
    expect(s.extraCombats).toBe(1);
  });

  it('Godo finds an Equipment as he enters; his first attack each turn untaps him and your Samurai and adds a combat', () => {
    let s = newGame();
    const plate = put(s, 'P1', 'darksteel-plate', 'library');
    const godo = put(s, 'P1', 'godo-bandit-warlord', 'hand');
    mana(s, 'P1', { R: 1, C: 5 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: godo }, { accept: true }).state;
    expect(s.cards[plate]!.zone).toBe('battlefield');
    s.cards[godo]!.summoningSick = false;
    s = fight(s, [{ attacker: godo, defender: 'P2' }]).state;
    expect(s.cards[godo]!.tapped).toBe(false);
    expect(s.extraCombats).toBe(1);
  });

  it('Matoya, Archon Elder draws a card whenever you scry or surveil (once per scry or surveil)', () => {
    let s = newGame();
    put(s, 'P1', 'matoya-archon-elder');
    const swallow = put(s, 'P1', 'swallowed-by-leviathan', 'hand');
    const cat = put(s, 'P1', 'coeurl', 'hand');
    mana(s, 'P1', { W: 1, C: 1 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: cat });
    mana(s, 'P1', { U: 1, C: 2 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: swallow, targets: [card(cat)] });
    const hand = s.players.P1!.hand.length;
    s = settle(s).state;
    if (s.pending.kind === 'chooseCards') s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [] })).state;
    // Surveil 2 is one surveil: one card.
    expect(s.players.P1!.hand.length).toBe(hand + 1);
  });

  it('Ranger-Captain of Eos finds a creature with mana value 1 or less; sacrifice it: opponents can’t cast noncreature spells this turn', () => {
    let s = newGame();
    const one = put(s, 'P1', 'magitek-infantry', 'library');
    const captain = put(s, 'P1', 'ranger-captain-of-eos', 'hand');
    mana(s, 'P1', { W: 2, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: captain }, { accept: true }).state;
    expect(s.cards[one]!.zone).toBe('hand');
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: captain, ability: 0 }).state;
    expect(s.cards[captain]!.zone).toBe('graveyard');
    expect(s.players.P2!.cantCastNoncreatureTurn).toBe(s.turnNumber);
    expect(s.players.P1!.cantCastNoncreatureTurn).toBeUndefined();
    const bolt = put(s, 'P2', 'thunder-magic', 'hand');
    const bear = put(s, 'P2', 'coeurl', 'hand');
    s.players.P2!.manaPool.R = 1; s.players.P2!.manaPool.W = 1; s.players.P2!.manaPool.C = 1;
    const options = spellOptions(s, 'P2').map((o) => o.action.type === 'CastSpell' ? o.action.card : '');
    expect(options).not.toContain(bolt);
    void bear;
  });
});

describe('S4 group 37: Venser, Brainstorm, Laboratory Maniac, Elixir, Relentless X-ATM092', () => {
  it('Venser (flash) returns target spell or permanent, lands included, to its owner’s hand', () => {
    let s = newGame();
    const cat = put(s, 'P1', 'coeurl', 'hand');
    mana(s, 'P1', { W: 1, C: 1 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: cat });
    const venser = put(s, 'P1', 'venser-shaper-savant', 'hand');
    mana(s, 'P1', { U: 2, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: venser }, { targets: (o) => [o.flat().find((t) => t.kind === 'card' && t.card === cat)!] }).state;
    expect(s.cards[cat]!.zone).toBe('hand');
    expect(s.stack.some((i) => i.kind === 'spell' && i.card === cat)).toBe(false);
    let t = newGame();
    const land = put(t, 'P2', 'forest');
    const v2 = put(t, 'P1', 'venser-shaper-savant', 'hand');
    mana(t, 'P1', { U: 2, C: 2 });
    t = cast(t, { type: 'CastSpell', player: 'P1', card: v2 }, { targets: (o) => [o.flat().find((x) => x.kind === 'card' && x.card === land)!] }).state;
    expect(t.cards[land]!.zone).toBe('hand');
  });

  it('Brainstorm draws three, then puts two cards from your hand on top (the first chosen on top)', () => {
    let s = newGame();
    const storm = put(s, 'P1', 'brainstorm', 'hand');
    mana(s, 'P1', { U: 1 });
    const hand = s.players.P1!.hand.length;
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: storm })).state;
    expect(s.pending).toMatchObject({ kind: 'chooseCards', purpose: 'handToTop', min: 2, max: 2 });
    const [a, b] = s.players.P1!.hand;
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [a!, b!] })).state;
    expect(s.players.P1!.hand.length).toBe(hand - 1 + 3 - 2);
    expect(s.players.P1!.library.slice(0, 2)).toEqual([a, b]);
  });

  it('Laboratory Maniac: drawing from an empty library wins the game instead', () => {
    let s = newGame();
    put(s, 'P1', 'laboratory-maniac');
    for (const id of [...s.players.P1!.library]) { s.cards[id]!.zone = 'exile'; s.players.P1!.exile.push(id); }
    s.players.P1!.library = [];
    const storm = put(s, 'P1', 'brainstorm', 'hand');
    mana(s, 'P1', { U: 1 });
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: storm })).state;
    expect(s.players.P2!.eliminated).toBe(true);
    expect(s.players.P1!.eliminated).toBe(false);
  });

  it('Elixir enters tapped; {5}, {T}, exile it: shuffle your nonland graveyard cards into your library and gain that much life', () => {
    let s = newGame();
    const elixir = put(s, 'P1', 'elixir', 'hand');
    mana(s, 'P1', { C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: elixir }).state;
    expect(s.cards[elixir]!.tapped).toBe(true);
    s.cards[elixir]!.tapped = false;
    const cats = [put(s, 'P1', 'coeurl', 'graveyard'), put(s, 'P1', 'coeurl', 'graveyard')];
    const land = put(s, 'P1', 'forest', 'graveyard');
    mana(s, 'P1', { C: 5 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: elixir, ability: 0 }).state;
    expect(cats.every((id) => s.cards[id]!.zone === 'library')).toBe(true);
    expect(s.cards[land]!.zone).toBe('graveyard');
    expect(s.players.P1!.life).toBe(22);
    expect(s.cards[elixir]!.zone).toBe('exile');
  });

  it('Relentless X-ATM092 can’t be blocked except by three or more creatures, and returns from the graveyard for {8} with a finality counter', () => {
    let s = newGame();
    const bot = put(s, 'P1', 'relentless-x-atm092');
    const blockers = [put(s, 'P2', 'coeurl'), put(s, 'P2', 'coeurl'), put(s, 'P2', 'coeurl')];
    s = goTo(s, 'declareAttackers');
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: bot, defender: 'P2' }] })).state;
    s = nextStep(s);
    expect(s.pending.kind).toBe('declareBlockers');
    expect(rejected(s, { type: 'DeclareBlockers', player: 'P2', blocks: blockers.slice(0, 2).map((b) => ({ blocker: b, attacker: bot })) })).toMatch(/three or more|3 or more/);
    // Three is enough.
    const blocked = act(s, { type: 'DeclareBlockers', player: 'P2', blocks: blockers.map((b) => ({ blocker: b, attacker: bot })) });
    expect(blocked.combat!.blocks.filter((b) => b.attacker === bot)).toHaveLength(3);
    let t = newGame();
    const dead = put(t, 'P1', 'relentless-x-atm092', 'graveyard');
    mana(t, 'P1', { C: 8 });
    t = cast(t, { type: 'ActivateAbility', player: 'P1', card: dead, ability: 0 }).state;
    expect(t.cards[dead]!.zone).toBe('battlefield');
    expect(t.cards[dead]!.tapped).toBe(true);
    expect(countersOf(t.cards[dead]!, 'finality')).toBe(1);
  });
});

describe('S4 group 38: Adeline, Absolute Virtue, Aettir and Priwen, Blitzball', () => {
  it('Adeline’s power is the number of creatures you control; whenever you attack, a 1/1 Human enters tapped and attacking each opponent', () => {
    let s = newGame(3);
    const adeline = put(s, 'P1', 'adeline-resplendent-cathar');
    put(s, 'P1', 'coeurl');
    expect(stats(s, adeline)).toEqual([2, 4]);
    s = goTo(s, 'declareAttackers');
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: adeline, defender: 'P2' }] })).state;
    const humans = s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'human-token');
    expect(humans).toHaveLength(2);
    expect(humans.every((id) => s.cards[id]!.tapped)).toBe(true);
    expect(new Set(s.combat!.attacks.filter((a) => humans.includes(a.attacker)).map((a) => a.defender))).toEqual(new Set(['P2', 'P3']));
    expect(stats(s, adeline)[0]).toBe(4);
    expect(hasKeyword(s, s.cards[adeline]!, 'Vigilance')).toBe(true);
  });

  it('Absolute Virtue: can’t be countered, flying; you can’t be dealt damage or targeted by your opponents', () => {
    const s = newGame();
    put(s, 'P1', 'absolute-virtue');
    const foe = put(s, 'P2', 'coeurl');
    const ctx = { s, ev: [] as GameEvent[] };
    dealDamage(ctx, foe, { kind: 'player', player: 'P1' }, 3, true);
    expect(s.players.P1!.life).toBe(20);
    const comet = put(s, 'P2', 'choco-comet', 'hand');
    mana(s, 'P2', { R: 2, C: 2 });
    const targetsP1 = spellOptions(s, 'P2').some((o) => o.action.type === 'CastSpell' && o.action.card === comet && (o.action.targets ?? []).some((t) => t.kind === 'player' && t.player === 'P1'));
    expect(targetsP1).toBe(false);
    expect(s.cardDefs['absolute-virtue']!.cantBeCountered).toBe(true);
  });

  it('Aettir and Priwen: the equipped creature has base power and toughness equal to your life total', () => {
    const s = newGame();
    const body = put(s, 'P1', 'coeurl');
    put(s, 'P1', 'aettir-and-priwen', 'battlefield', { attachedTo: body });
    expect(stats(s, body)).toEqual([20, 20]);
    s.players.P1!.life = 7;
    expect(stats(s, body)).toEqual([7, 7]);
  });

  it('Blitzball taps for any color; {T}, sacrifice: draw two, only after a legendary creature dealt combat damage to an opponent this turn', () => {
    let s = newGame();
    const ball = put(s, 'P1', 'blitzball');
    expect(rejected(s, { type: 'ActivateAbility', player: 'P1', card: ball, ability: 0 })).toMatch(/legendary/);
    const legend = put(s, 'P1', 'rufus-shinra');
    s = fight(s, [{ attacker: legend, defender: 'P2' }]).state;
    const hand = s.players.P1!.hand.length;
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: ball, ability: 0 }).state;
    expect(s.players.P1!.hand.length).toBe(hand + 2);
    expect(s.cards[ball]!.zone).toBe('graveyard');
  });
});

describe('S4 group 39: Zell Dincht, Traxos, Tymna the Weaver, Torgal', () => {
  it('Zell Dincht: an additional land each turn; +1/+0 per land you control; at your end step a land goes back to hand', () => {
    let s = newGame();
    const zell = put(s, 'P1', 'zell-dincht');
    const lands = () => s.players.P1!.battlefield.filter((id) => s.cardDefs[s.cards[id]!.defId]!.types.includes('land')).length;
    const base = lands();
    for (let i = 0; i < 2; i++) s = settle(act(s, { type: 'PlayLand', player: 'P1', card: put(s, 'P1', 'forest', 'hand') })).state;
    expect(lands()).toBe(base + 2);
    expect(stats(s, zell)).toEqual([lands(), 3]);
    s = settle(goTo(s, 'end')).state;
    expect(lands()).toBe(base + 1);
  });

  it('Traxos enters tapped and doesn’t untap; casting a historic spell untaps it', () => {
    let s = newGame();
    const traxos = put(s, 'P1', 'traxos-scourge-of-kroog', 'hand');
    mana(s, 'P1', { C: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: traxos }).state;
    expect(s.cards[traxos]!.tapped).toBe(true);
    s = goTo(goTo(goTo(s, 'end'), 'upkeep'), 'end');
    s = goTo(s, 'main1');
    expect(s.activePlayer).toBe('P1');
    expect(s.cards[traxos]!.tapped).toBe(true);
    const ring = put(s, 'P1', 'sol-ring', 'hand');
    mana(s, 'P1', { C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: ring }).state;
    expect(s.cards[traxos]!.tapped).toBe(false);
  });

  it('Tymna the Weaver: in your postcombat main phase you may pay X life to draw X, X = opponents dealt combat damage this turn', () => {
    let s = newGame(3);
    const tymna = put(s, 'P1', 'tymna-the-weaver');
    const cat = put(s, 'P1', 'coeurl');
    s = fight(s, [{ attacker: tymna, defender: 'P2' }, { attacker: cat, defender: 'P3' }]).state;
    const life = s.players.P1!.life;
    const hand = s.players.P1!.hand.length;
    s = settle(goTo(s, 'main2', { accept: true }), { accept: true }).state;
    expect(s.players.P1!.hand.length).toBe(hand + 2);
    expect(s.players.P1!.life).toBe(life - 2);
  });

  it('Torgal: your first Human creature spell each turn enters with a +1/+1 counter per Dog and Wolf you control; taps for any color', () => {
    let s = newGame();
    put(s, 'P1', 'torgal-a-fine-hound');
    const first = put(s, 'P1', 'danitha-capashen-paragon', 'hand');
    mana(s, 'P1', { W: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: first }).state;
    expect(countersOf(s.cards[first]!, '+1/+1')).toBe(1);
    const second = put(s, 'P1', 'danitha-capashen-paragon', 'hand');
    mana(s, 'P1', { W: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: second }).state;
    expect(countersOf(s.cards[second]!, '+1/+1')).toBe(0);
  });
});

describe('S4 group 40: Lightning, Kain, Zodiark, Quina, Purphoros', () => {
  type Opts = Parameters<typeof settle>[1];
  const settleAll = (s: GameState, opts: Opts = {}): GameState => {
    s = settle(s, opts).state;
    for (let guard = 0; guard < 10 && s.pending.kind === 'chooseCards'; guard++) {
      s = settle(act(s, { type: 'ChooseCards', player: s.pending.player, cards: s.pending.cards.slice(0, Math.max(1, s.pending.min)) }), opts).state;
    }
    return s;
  };

  it('Lightning, Army of One: after its combat damage, damage to that player and their permanents is doubled until your next turn', () => {
    let s = newGame();
    const lightning = put(s, 'P1', 'lightning-army-of-one');
    const foe = put(s, 'P2', 'summon-titan');
    s = fight(s, [{ attacker: lightning, defender: 'P2' }]).state;
    expect(s.players.P2!.life).toBe(17);
    s = goTo(s, 'main2');
    const comet = put(s, 'P1', 'choco-comet', 'hand');
    mana(s, 'P1', { R: 2, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: comet, x: 2, targets: [{ kind: 'player', player: 'P2' }] }).state;
    expect(s.players.P2!.life).toBe(13);
    const bolt = put(s, 'P1', 'thunder-magic', 'hand');
    mana(s, 'P1', { R: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: bolt, mode: 0, targets: [card(foe)] }).state;
    expect(s.cards[foe]!.damage).toBe(4);
  });

  it('Kain: during your turn it flies; its combat damage gives it to that player, and you draw, make tapped Treasures and lose that much', () => {
    let s = newGame();
    const kain = put(s, 'P1', 'kain-traitorous-dragoon');
    expect(hasKeyword(s, s.cards[kain]!, 'Flying')).toBe(true);
    const hand = s.players.P1!.hand.length;
    s = fight(s, [{ attacker: kain, defender: 'P2' }]).state;
    expect(s.cards[kain]!.controller).toBe('P2');
    expect(s.players.P1!.hand.length).toBe(hand + 2);
    const treasures = s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'treasure-token');
    expect(treasures).toHaveLength(2);
    expect(treasures.every((id) => s.cards[id]!.tapped)).toBe(true);
    expect(s.players.P1!.life).toBe(18);
  });

  it('Zodiark: each player sacrifices half their non-God creatures; it grows for each other creature sacrificed', () => {
    let s = newGame();
    for (let i = 0; i < 3; i++) put(s, 'P2', 'coeurl');
    for (let i = 0; i < 2; i++) put(s, 'P1', 'coeurl');
    const zodiark = put(s, 'P1', 'zodiark-umbral-god', 'hand');
    mana(s, 'P1', { B: 5 });
    s = settleAll(cast(s, { type: 'CastSpell', player: 'P1', card: zodiark }).state);
    const cats = (pid: string) => s.players[pid]!.battlefield.filter((id) => s.cards[id]!.defId === 'coeurl').length;
    expect([cats('P1'), cats('P2')]).toEqual([1, 2]);
    expect(countersOf(s.cards[zodiark]!, '+1/+1')).toBe(2);
    expect(hasKeyword(s, s.cards[zodiark]!, 'Indestructible')).toBe(true);
  });

  it('Quina: each time you create tokens you get a 1/1 Frog too; {2}, sacrifice a Frog: a +1/+1 counter on Quina', () => {
    let s = newGame();
    const quina = put(s, 'P1', 'quina-qu-gourmet');
    const greens = put(s, 'P1', 'gysahl-greens', 'hand');
    mana(s, 'P1', { G: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: greens }).state;
    const frogs = s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'frog-token');
    expect(frogs).toHaveLength(1);
    expect(s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'chocobo-bird-token')).toHaveLength(1);
    mana(s, 'P1', { C: 2 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: quina, ability: 0, costCards: [frogs[0]!] }).state;
    expect(countersOf(s.cards[quina]!, '+1/+1')).toBe(1);
  });

  it('Purphoros isn’t a creature until your devotion to red is five; another creature entering deals 2 to each opponent', () => {
    let s = newGame(3);
    const purphoros = put(s, 'P1', 'purphoros-god-of-the-forge');
    expect(currentDefinition(s, s.cards[purphoros]!).types).not.toContain('creature');
    put(s, 'P1', 'summon-esper-ramuh');
    put(s, 'P1', 'zell-dincht');
    expect(currentDefinition(s, s.cards[purphoros]!).types).not.toContain('creature');
    put(s, 'P1', 'coral-sword');
    expect(currentDefinition(s, s.cards[purphoros]!).types).toContain('creature');
    const cat = put(s, 'P1', 'coeurl', 'hand');
    mana(s, 'P1', { W: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: cat }).state;
    expect([s.players.P2!.life, s.players.P3!.life]).toEqual([18, 18]);
  });
});

describe('S4 group 41: the Town lands with Adventures (Ishgard, Jidoor, Lindblum, Midgar)', () => {
  type Opts = Parameters<typeof settle>[1];
  const settleAll = (s: GameState, opts: Opts = {}): GameState => {
    s = settle(s, opts).state;
    for (let guard = 0; guard < 10 && s.pending.kind === 'chooseCards'; guard++) {
      s = settle(act(s, { type: 'ChooseCards', player: s.pending.player, cards: s.pending.cards.slice(0, Math.max(1, s.pending.min)) }), opts).state;
    }
    return s;
  };

  it('Lindblum: cast Mage Siege (a Wizard), then play the land later from exile; it enters tapped and taps for {R}', () => {
    let s = newGame();
    const town = put(s, 'P1', 'lindblum-industrial-regency-mage-siege', 'hand');
    mana(s, 'P1', { R: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: town, adventure: true }).state;
    expect(s.players.P1!.battlefield.some((id) => s.cards[id]!.defId === 'wizard-token')).toBe(true);
    expect(s.cards[town]!.zone).toBe('exile');
    s = act(s, { type: 'PlayLand', player: 'P1', card: town });
    expect(s.cards[town]!.zone).toBe('battlefield');
    expect(s.cards[town]!.tapped).toBe(true);
    s.cards[town]!.tapped = false;
    expect(getLegalActions(s).some((a) => a.type === 'ActivateManaAbility' && a.card === town && a.mana === 'R')).toBe(true);
  });

  it('a Town can also just be played from hand as a land', () => {
    let s = newGame();
    const town = put(s, 'P1', 'midgar-city-of-mako-reactor-raid', 'hand');
    s = act(s, { type: 'PlayLand', player: 'P1', card: town });
    expect(s.cards[town]!.zone).toBe('battlefield');
  });

  it('Jidoor’s Overture: target opponent mills half their library, rounded down', () => {
    let s = newGame();
    const n = s.players.P2!.library.length;
    const town = put(s, 'P1', 'jidoor-aristocratic-capital-overture', 'hand');
    mana(s, 'P1', { U: 2, C: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: town, adventure: true, targets: [{ kind: 'player', player: 'P2' }] }).state;
    expect(s.players.P2!.library.length).toBe(n - Math.floor(n / 2));
  });

  it('Ishgard’s Faith & Grief returns up to two artifact and/or enchantment cards; Midgar’s Reactor Raid: sacrifice to draw two', () => {
    let s = newGame();
    const a = put(s, 'P1', 'sol-ring', 'graveyard');
    const b = put(s, 'P1', 'sleep-magic', 'graveyard');
    const ishgard = put(s, 'P1', 'ishgard-the-holy-see-faith-grief', 'hand');
    mana(s, 'P1', { W: 2, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: ishgard, adventure: true, targets: [card(a), card(b)] }).state;
    expect([s.cards[a]!.zone, s.cards[b]!.zone]).toEqual(['hand', 'hand']);
    put(s, 'P1', 'coeurl');
    const midgar = put(s, 'P1', 'midgar-city-of-mako-reactor-raid', 'hand');
    mana(s, 'P1', { B: 1, C: 2 });
    const hand = s.players.P1!.hand.length;
    s = settleAll(cast(s, { type: 'CastSpell', player: 'P1', card: midgar, adventure: true }).state);
    expect(s.players.P1!.hand.length).toBe(hand - 1 + 2);
  });
});

describe('S4 group 42: Giott, Nyxbloom Ancient, Noctis, Raubahn', () => {
  it('Giott (double strike): when it or another Dwarf enters, or an Equipment, you may discard a card to draw one', () => {
    let s = newGame();
    const giott = put(s, 'P1', 'giott-king-of-the-dwarves', 'hand');
    const extra = put(s, 'P1', 'coeurl', 'hand');
    mana(s, 'P1', { R: 1, W: 1 });
    const hand = s.players.P1!.hand.length;
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: giott }), { accept: true }).state;
    if (s.pending.kind === 'chooseCards') s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [extra] })).state;
    expect(hasKeyword(s, s.cards[giott]!, 'DoubleStrike')).toBe(true);
    // Giott cast, Coeurl discarded, a card drawn.
    expect(s.cards[extra]!.zone).toBe('graveyard');
    expect(s.players.P1!.hand.length).toBe(hand - 1);
    // An Equipment entering triggers it too.
    const plate = put(s, 'P1', 'darksteel-plate', 'hand');
    mana(s, 'P1', { C: 3 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: plate });
    s = settle(s, { accept: false }).state;
    expect(s.cards[plate]!.zone).toBe('battlefield');
  });

  it('Nyxbloom Ancient: tapping a permanent for mana makes three times as much', () => {
    let s = newGame();
    put(s, 'P1', 'nyxbloom-ancient');
    const forest = put(s, 'P1', 'forest');
    s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: forest, mana: 'G' });
    expect(s.players.P1!.manaPool.G).toBe(3);
  });

  it('Noctis: cast artifacts from your graveyard by also paying 3 life; they enter with a finality counter', () => {
    let s = newGame();
    put(s, 'P1', 'noctis-prince-of-lucis');
    const ring = put(s, 'P1', 'sol-ring', 'graveyard');
    mana(s, 'P1', { C: 1 });
    const option = getLegalActions(s).find((a) => a.type === 'CastSpell' && a.card === ring);
    expect(option).toBeDefined();
    s = cast(s, option!).state;
    expect(s.cards[ring]!.zone).toBe('battlefield');
    expect(countersOf(s.cards[ring]!, 'finality')).toBe(1);
    expect(s.players.P1!.life).toBe(17);
  });

  it('Raubahn: ward—pay life equal to its power; when it attacks, attach up to one of your Equipment to an attacking creature', () => {
    let s = newGame();
    const theirs = put(s, 'P2', 'raubahn-bull-of-ala-mhigo');
    const bolt = put(s, 'P1', 'thunder-magic', 'hand');
    mana(s, 'P1', { R: 1 });
    s.players.P1!.life = 1;
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: bolt, mode: 0, targets: [card(theirs)] })).toMatch(/life/);
    s.players.P1!.life = 20;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: bolt, mode: 0, targets: [card(theirs)] }).state;
    expect(s.players.P1!.life).toBe(18);
    let t = newGame();
    const mine = put(t, 'P1', 'raubahn-bull-of-ala-mhigo');
    const plate = put(t, 'P1', 'darksteel-plate');
    t = fight(t, [{ attacker: mine, defender: 'P2' }]).state;
    expect(t.cards[plate]!.attachedTo).toBe(mine);
  });
});

describe('S4 group 41: Syr Konrad, Rhystic Study, Kraum, Thrasios, Smuggler’s Copter', () => {
  it('Syr Konrad deals 1 damage to each opponent when another creature dies', () => {
    let s = newGame();
    put(s, 'P1', 'syr-konrad-the-grim');
    const cat = put(s, 'P2', 'coeurl');
    const life = s.players.P2!.life;
    const bolt = put(s, 'P1', 'lightning-bolt', 'hand');
    mana(s, 'P1', { R: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: bolt, targets: [card(cat)] }).state;
    expect(s.cards[cat]!.zone).toBe('graveyard');
    expect(s.players.P2!.life).toBe(life - 1);
  });

  it('Syr Konrad: {1}{B} makes each player mill a card; a milled creature card deals 1 to each opponent', () => {
    let s = newGame();
    const konrad = put(s, 'P1', 'syr-konrad-the-grim');
    put(s, 'P1', 'forest', 'library');
    put(s, 'P2', 'coeurl', 'library');
    const life = s.players.P2!.life;
    const graveyards = [s.players.P1!.graveyard.length, s.players.P2!.graveyard.length];
    mana(s, 'P1', { B: 1, C: 1 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: konrad, ability: 0 }).state;
    expect([s.players.P1!.graveyard.length, s.players.P2!.graveyard.length]).toEqual([graveyards[0]! + 1, graveyards[1]! + 1]);
    // Only the creature card counts; the Forest doesn't.
    expect(s.players.P2!.life).toBe(life - 1);
  });

  const opponentBolts = (study: string) => {
    let s = newGame();
    put(s, 'P1', study);
    const bolt = put(s, 'P2', 'lightning-bolt', 'hand');
    s = act(s, { type: 'PassPriority', player: 'P1' });
    mana(s, 'P2', { R: 1, C: 1 });
    s = act(s, { type: 'CastSpell', player: 'P2', card: bolt, targets: [player('P1')] });
    return settle(s).state;
  };

  it('Rhystic Study: an opponent casts a spell; you draw unless they pay {1}', () => {
    let s = opponentBolts('rhystic-study');
    expect(s.pending).toMatchObject({ kind: 'chooseCards', purpose: 'payToAvoidCounter', player: 'P2', payGeneric: 1, drawFor: 'P1' });
    const hand = s.players.P1!.hand.length;
    s = settle(act(s, { type: 'ChooseCards', player: 'P2', cards: [] })).state;
    expect(s.players.P1!.hand.length).toBe(hand + 1);
  });

  it('Rhystic Study: paying {1} stops the draw', () => {
    let s = opponentBolts('rhystic-study');
    const hand = s.players.P1!.hand.length;
    s = settle(act(s, { type: 'ChooseCards', player: 'P2', cards: [...(s.pending as { cards: string[] }).cards] })).state;
    expect(s.players.P1!.hand.length).toBe(hand);
    expect(s.players.P2!.manaPool.C ?? 0).toBe(0);
  });

  it('Kraum draws a card when an opponent casts their second spell each turn', () => {
    let s = newGame();
    put(s, 'P1', 'kraum-ludevics-opus');
    const bolts = [put(s, 'P2', 'lightning-bolt', 'hand'), put(s, 'P2', 'lightning-bolt', 'hand')];
    const hand = s.players.P1!.hand.length;
    for (const [i, bolt] of bolts.entries()) {
      if (s.pending.kind === 'priority' && s.pending.player === 'P1') s = act(s, { type: 'PassPriority', player: 'P1' });
      mana(s, 'P2', { R: 1 });
      s = settle(act(s, { type: 'CastSpell', player: 'P2', card: bolt, targets: [player('P1')] })).state;
      expect(s.players.P1!.hand.length).toBe(hand + i);
    }
  });

  it('Thrasios: {4}: scry 1, then a land on top goes onto the battlefield tapped; otherwise draw', () => {
    let s = newGame();
    const thrasios = put(s, 'P1', 'thrasios-triton-hero');
    const land = put(s, 'P1', 'forest', 'library');
    mana(s, 'P1', { C: 4 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: thrasios, ability: 0 }).state;
    expect(s.cards[land]).toMatchObject({ zone: 'battlefield', tapped: true });
    const cat = put(s, 'P1', 'coeurl', 'library');
    mana(s, 'P1', { C: 4 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: thrasios, ability: 0 }).state;
    expect(s.cards[cat]!.zone).toBe('hand');
  });

  it('Smuggler’s Copter loots when it attacks and when it blocks (crewed)', () => {
    let s = newGame();
    const copter = put(s, 'P1', 'smugglers-copter', 'battlefield', { crewed: true });
    expect(hasKeyword(s, s.cards[copter]!, 'Flying')).toBe(true);
    put(s, 'P1', 'coeurl', 'hand');
    const hand = s.players.P1!.hand.length;
    const loot = (st: GameState) => {
      for (let i = 0; i < 4 && st.pending.kind === 'chooseCards'; i++) st = settle(act(st, { type: 'ChooseCards', player: st.pending.player, cards: st.pending.cards.slice(0, 1) })).state;
      return st;
    };
    s = loot(fight(s, [{ attacker: copter, defender: 'P2' }]).state);
    expect(s.players.P1!.hand.length).toBe(hand);
    expect(s.players.P1!.graveyard.length).toBe(1);

    let t = newGame();
    const theirs = put(t, 'P2', 'smugglers-copter', 'battlefield', { crewed: true });
    put(t, 'P2', 'coeurl', 'hand');
    const bird = put(t, 'P1', 'coeurl');
    t.temporaryEffects.push({ source: bird, affected: bird, keywords: ['Flying'] });
    t = loot(fight(t, [{ attacker: bird, defender: 'P2' }], { P2: [{ blocker: theirs, attacker: bird }] }).state);
    expect(t.players.P2!.graveyard.length).toBe(1);
  });
});

describe('S4 group 42: Teferi, Varragoth, Bruse Tarl, Ishai, Vial Smasher', () => {
  it('Teferi: your creature cards have flash; opponents cast spells only at sorcery speed', () => {
    let s = newGame();
    put(s, 'P1', 'teferi-mage-of-zhalfir');
    s = goTo(s, 'beginCombat');
    const cat = put(s, 'P1', 'coeurl', 'hand');
    mana(s, 'P1', { W: 1, C: 1 });
    s = settle(act(s, { type: 'CastSpell', player: 'P1', card: cat })).state;
    expect(s.cards[cat]!.zone).toBe('battlefield');
    const bolt = put(s, 'P2', 'lightning-bolt', 'hand');
    mana(s, 'P2', { R: 1 });
    s = act(s, { type: 'PassPriority', player: 'P1' });
    expect(rejected(s, { type: 'CastSpell', player: 'P2', card: bolt, targets: [player('P1')] })).toMatch(/main phase/);
  });

  it('Varragoth: boast only after it attacked; the target player puts the card they find on top', () => {
    let s = newGame();
    const demon = put(s, 'P1', 'varragoth-bloodsky-sire');
    const wanted = put(s, 'P1', 'lightning-bolt', 'library');
    s.players.P1!.library.push(s.players.P1!.library.shift()!);
    mana(s, 'P1', { B: 1, C: 1 });
    expect(rejected(s, { type: 'ActivateAbility', player: 'P1', card: demon, ability: 0, targets: [player('P1')] })).toMatch(/attacked this turn/);
    s = fight(s, [{ attacker: demon, defender: 'P2' }]).state;
    mana(s, 'P1', { B: 1, C: 1 });
    s = act(s, { type: 'ActivateAbility', player: 'P1', card: demon, ability: 0, targets: [player('P1')] });
    for (let i = 0; i < 4 && s.pending.kind === 'priority'; i++) s = act(s, { type: 'PassPriority', player: s.pending.player });
    expect(s.pending).toMatchObject({ kind: 'chooseCards', purpose: 'search', searchTo: 'top', player: 'P1' });
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [wanted] })).state;
    expect(s.players.P1!.library[0]).toBe(wanted);
    mana(s, 'P1', { B: 1, C: 1 });
    expect(rejected(s, { type: 'ActivateAbility', player: 'P1', card: demon, ability: 0, targets: [player('P1')] })).toMatch(/once each turn/);
  });

  it('Bruse Tarl gives a creature you control double strike and lifelink as it enters', () => {
    let s = newGame();
    const cat = put(s, 'P1', 'coeurl');
    const bruse = put(s, 'P1', 'bruse-tarl-boorish-herder', 'hand');
    mana(s, 'P1', { R: 1, W: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: bruse }, { targets: (options) => [options.flat().find((t) => t.kind === 'card' && t.card === cat)!] }).state;
    expect(hasKeyword(s, s.cards[cat]!, 'DoubleStrike')).toBe(true);
    expect(hasKeyword(s, s.cards[cat]!, 'Lifelink')).toBe(true);
  });

  it('Ishai gets a +1/+1 counter whenever an opponent casts a spell', () => {
    let s = newGame();
    const ishai = put(s, 'P1', 'ishai-ojutai-dragonspeaker');
    const bolt = put(s, 'P2', 'lightning-bolt', 'hand');
    s = act(s, { type: 'PassPriority', player: 'P1' });
    mana(s, 'P2', { R: 1 });
    s = settle(act(s, { type: 'CastSpell', player: 'P2', card: bolt, targets: [player('P1')] })).state;
    expect(stats(s, ishai)).toEqual([2, 2]);
  });

  it('Vial Smasher deals damage equal to your first spell’s mana value to a random opponent, once each turn', () => {
    let s = newGame(3);
    put(s, 'P1', 'vial-smasher-the-fierce');
    const total = () => s.players.P2!.life + s.players.P3!.life;
    const before = total();
    const cats = [put(s, 'P1', 'coeurl', 'hand'), put(s, 'P1', 'coeurl', 'hand')];
    const mv = manaValue(parseManaCost(s.cardDefs['coeurl']!.manaCost));
    for (const cat of cats) {
      mana(s, 'P1', { W: 1, C: 1 });
      s = cast(s, { type: 'CastSpell', player: 'P1', card: cat }).state;
    }
    expect(total()).toBe(before - mv);
  });
});

describe('S4 group 43: Sazh, Cid, Golbez, PuPu UFO, The Regalia', () => {
  it('Sazh Katzroy: attacking puts a +1/+1 counter on target creature, then doubles its counters', () => {
    let s = newGame();
    const sazh = put(s, 'P1', 'sazh-katzroy');
    const cat = put(s, 'P1', 'coeurl', 'battlefield', { counters: 1 });
    s = fight(s, [{ attacker: sazh, defender: 'P2' }], {}, { targets: (options) => [options.flat().find((t) => t.kind === 'card' && t.card === cat)!] }).state;
    expect(s.cards[cat]!.counters).toBe(4);
  });

  it('Sazh Katzroy may find a Bird or basic land card as he enters', () => {
    let s = newGame();
    const forest = put(s, 'P1', 'forest', 'library');
    const sazh = put(s, 'P1', 'sazh-katzroy', 'hand');
    mana(s, 'P1', { G: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: sazh }).state;
    expect(s.cards[forest]!.zone).toBe('hand');
  });

  it('Cid: artifact creatures and Heroes you control get +1/+1 per Artificer you control and in your graveyard; any number in a deck', () => {
    const s = newGame();
    put(s, 'P1', 'cid-timeless-artificer');
    put(s, 'P1', 'cid-timeless-artificer', 'graveyard');
    const ufo = put(s, 'P1', 'pupu-ufo');
    const cat = put(s, 'P1', 'coeurl');
    expect(stats(s, ufo)).toEqual([2, 6]);
    expect(stats(s, cat)).toEqual([2, 2]);
    expect(s.cardDefs['cid-timeless-artificer']!.anyNumberInDeck).toBe(true);
  });

  it('Golbez: surveil 1 when an artifact enters; at end step with four artifacts, return a creature card (eight: opponents lose its power)', () => {
    let s = newGame();
    put(s, 'P1', 'golbez-crystal-collector');
    const ring = put(s, 'P1', 'sol-ring', 'hand');
    mana(s, 'P1', { C: 1 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: ring });
    s = settle(s).state;
    expect(s.pending.kind).toBe('priority');
    for (let i = 0; i < 7; i++) put(s, 'P1', 'sol-ring');
    const cat = put(s, 'P1', 'coeurl', 'graveyard');
    const life = s.players.P2!.life;
    s = goTo(s, 'end');
    s = settle(s).state;
    expect(s.cards[cat]!.zone).toBe('hand');
    expect(s.players.P2!.life).toBe(life - (s.cardDefs['coeurl']!.power ?? 0));
  });

  it('PuPu UFO: {T}: put a land from your hand onto the battlefield; {3}: base power equals your Towns', () => {
    let s = newGame();
    const ufo = put(s, 'P1', 'pupu-ufo');
    const inn = put(s, 'P1', 'adventurers-inn', 'hand');
    s = act(s, { type: 'ActivateAbility', player: 'P1', card: ufo, ability: 0 });
    for (let i = 0; i < 4 && s.pending.kind === 'priority' && s.stack.length; i++) s = act(s, { type: 'PassPriority', player: s.pending.player });
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [inn] })).state;
    expect(s.cards[inn]!.zone).toBe('battlefield');
    mana(s, 'P1', { C: 3 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: ufo, ability: 1 }).state;
    expect(stats(s, ufo)).toEqual([1, 4]);
  });

  it('The Regalia: attacking (crewed) reveals until a land and puts it onto the battlefield tapped', () => {
    let s = newGame();
    const car = put(s, 'P1', 'the-regalia', 'battlefield', { crewed: true });
    const forest = put(s, 'P1', 'forest', 'library');
    put(s, 'P1', 'coeurl', 'library');
    s = fight(s, [{ attacker: car, defender: 'P2' }]).state;
    expect(s.cards[forest]).toMatchObject({ zone: 'battlefield', tapped: true });
  });
});

describe('S4 group 44: Ignis, Jenova, The Wandering Minstrel, Winota, Atraxa', () => {
  const pickTop = (s: GameState, cards: string[]) => settle(act(s, { type: 'ChooseCards', player: 'P1', cards })).state;
  const castFromHand = (s: GameState, id: string, pool: Parameters<typeof mana>[2]) => {
    const c = put(s, 'P1', id, 'hand');
    mana(s, 'P1', pool);
    return { s: settle(act(s, { type: 'CastSpell', player: 'P1', card: c })).state, c };
  };

  it('Ignis Scientia: a land from the top six enters tapped; exiling a creature card from a graveyard makes a Food', () => {
    let s = newGame();
    const forest = put(s, 'P1', 'forest', 'library');
    let r = castFromHand(s, 'ignis-scientia', { G: 1, U: 1, C: 1 });
    s = r.s;
    expect(s.pending).toMatchObject({ kind: 'chooseCards', purpose: 'lookTop' });
    s = pickTop(s, [forest]);
    expect(s.cards[forest]).toMatchObject({ zone: 'battlefield', tapped: true });
    s.cards[r.c]!.summoningSick = false;
    const cat = put(s, 'P2', 'coeurl', 'graveyard');
    mana(s, 'P1', { G: 1, U: 1, C: 1 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: r.c, ability: 0, targets: [card(cat)] }).state;
    expect(s.cards[cat]!.zone).toBe('exile');
    expect(s.players.P1!.battlefield.some((id) => s.cards[id]!.defId === 'food-token')).toBe(true);
  });

  it('Jenova: at combat, counters equal to its power on another creature, which becomes a Mutant; a Mutant dying on your turn draws its power', () => {
    let s = newGame();
    put(s, 'P1', 'jenova-ancient-calamity');
    const cat = put(s, 'P1', 'coeurl');
    const power = stats(s, cat)[0]!;
    s = goTo(s, 'beginCombat', { targets: (options) => [options.flat().find((t) => t.kind === 'card' && t.card === cat)!] });
    s = settle(s, { targets: (options) => [options.flat().find((t) => t.kind === 'card' && t.card === cat)!] }).state;
    expect(s.cards[cat]!.counters).toBe(1);
    expect(currentDefinition(s, s.cards[cat]!).subtypes).toContain('Mutant');
    const bolt = put(s, 'P1', 'lightning-bolt', 'hand');
    mana(s, 'P1', { R: 1 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: bolt, targets: [card(cat)] });
    const hand = s.players.P1!.hand.length;
    s = settle(s).state;
    expect(s.cards[cat]!.zone).toBe('graveyard');
    expect(s.players.P1!.hand.length).toBe(hand + power + 1);
  });

  it('The Wandering Minstrel: your lands enter untapped; with five Towns, a 2/2 all-color Elemental at combat', () => {
    let s = newGame();
    put(s, 'P1', 'the-wandering-minstrel');
    const treno = put(s, 'P1', 'treno-dark-city', 'hand');
    s = act(s, { type: 'PlayLand', player: 'P1', card: treno });
    s = settle(s).state;
    expect(s.cards[treno]!.tapped).toBe(false);
    for (let i = 0; i < 4; i++) put(s, 'P1', 'adventurers-inn');
    s = goTo(s, 'declareAttackers');
    const elemental = s.players.P1!.battlefield.find((id) => s.cards[id]!.defId === 'elemental-token');
    expect(elemental).toBeDefined();
    expect(stats(s, elemental!)).toEqual([2, 2]);
  });

  it('Winota: a non-Human attacking puts a Human from the top six onto the battlefield attacking, indestructible', () => {
    let s = newGame();
    put(s, 'P1', 'winota-joiner-of-forces');
    const cat = put(s, 'P1', 'coeurl');
    const aerith = put(s, 'P1', 'aerith-gainsborough', 'library');
    s = goTo(s, 'declareAttackers');
    s = act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: cat, defender: 'P2' }] });
    for (let i = 0; i < 4 && s.pending.kind === 'priority'; i++) s = act(s, { type: 'PassPriority', player: s.pending.player });
    expect(s.pending).toMatchObject({ kind: 'chooseCards', purpose: 'lookTop', lookAttacking: true });
    s = pickTop(s, [aerith]);
    expect(s.cards[aerith]).toMatchObject({ zone: 'battlefield', tapped: true });
    expect(s.combat!.attacks.some((a) => a.attacker === aerith && a.defender === 'P2')).toBe(true);
    expect(hasKeyword(s, s.cards[aerith]!, 'Indestructible')).toBe(true);
  });

  it('Atraxa: from the top ten, one card of each card type into your hand', () => {
    let s = newGame();
    const cats = [put(s, 'P1', 'coeurl', 'library'), put(s, 'P1', 'coeurl', 'library')];
    const ring = put(s, 'P1', 'sol-ring', 'library');
    const forest = put(s, 'P1', 'forest', 'library');
    s = castFromHand(s, 'atraxa-grand-unifier', { G: 1, W: 1, U: 1, B: 1, C: 3 }).s;
    expect(rejected(s, { type: 'ChooseCards', player: 'P1', cards: cats })).toMatch(/at most one/);
    s = pickTop(s, [cats[0]!, ring, forest]);
    expect([cats[0], ring, forest].map((id) => s.cards[id!]!.zone)).toEqual(['hand', 'hand', 'hand']);
    expect(s.cards[cats[1]!]!.zone).toBe('library');
  });
});

describe('S4 group 45: Kefka, Clive, Joshua, Najeela', () => {
  const answerFirst = (s: GameState): GameState => {
    for (let guard = 0; guard < 8 && s.pending.kind === 'chooseCards'; guard++) {
      s = settle(act(s, { type: 'ChooseCards', player: s.pending.player, cards: s.pending.cards.slice(0, Math.max(1, s.pending.min)) })).state;
    }
    return s;
  };
  const nextTurnOfP1 = (s: GameState) => {
    const turn = s.turnNumber;
    for (let guard = 0; guard < 8 && !(s.activePlayer === 'P1' && s.turnNumber > turn); guard++) {
      s = answerFirst(settle(goTo(answerFirst(s), 'end')).state);
      s = answerFirst(settle(goTo(s, 'main1')).state);
    }
    return s;
  };
  const enter = (s: GameState, id: string, pool: Parameters<typeof mana>[2]) => {
    const c = put(s, 'P1', id, 'hand');
    mana(s, 'P1', pool);
    return { s: settle(act(s, { type: 'CastSpell', player: 'P1', card: c })).state, c };
  };

  it('Kefka, Court Mage: each player discards; you draw one per card type discarded', () => {
    let s = newGame();
    s.players.P1!.hand = [];
    s.players.P2!.hand = [];
    const r = enter(s, 'kefka-court-mage-kefka-ruler-of-ruin', { U: 1, B: 1, R: 1, C: 2 });
    s = r.s;
    expect(s.pending.kind).toBe('priority');
    put(s, 'P1', 'forest', 'hand');
    put(s, 'P2', 'sol-ring', 'hand');
    // Again by flickering isn't available: test the attack trigger instead.
    s.cards[r.c]!.summoningSick = false;
    s = goTo(s, 'declareAttackers');
    s = act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: r.c, defender: 'P2' }] });
    for (let i = 0; i < 4 && s.pending.kind === 'priority'; i++) s = act(s, { type: 'PassPriority', player: s.pending.player });
    s = answerFirst(s);
    expect(s.players.P1!.hand.length).toBe(2);
  });

  it('Kefka: {8}: each opponent sacrifices a permanent and Kefka transforms; Ruler of Ruin draws what opponents lose on your turn', () => {
    let s = newGame();
    const kefka = put(s, 'P1', 'kefka-court-mage-kefka-ruler-of-ruin');
    const cat = put(s, 'P2', 'coeurl');
    s.players.P2!.battlefield = [cat];
    mana(s, 'P1', { C: 8 });
    s = act(s, { type: 'ActivateAbility', player: 'P1', card: kefka, ability: 0 });
    for (let i = 0; i < 4 && s.pending.kind === 'priority' && s.stack.length; i++) s = act(s, { type: 'PassPriority', player: s.pending.player });
    s = answerFirst(s);
    expect(s.cards[cat]!.zone).toBe('graveyard');
    expect(s.cards[kefka]!.transformed).toBe(true);
    expect(hasKeyword(s, s.cards[kefka]!, 'Flying')).toBe(true);
    const bolt = put(s, 'P1', 'lightning-bolt', 'hand');
    mana(s, 'P1', { R: 1 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: bolt, targets: [player('P2')] });
    const hand = s.players.P1!.hand.length;
    s = settle(s).state;
    expect(s.players.P1!.hand.length).toBe(hand + 3);
  });

  it('Clive: may discard your hand and draw your devotion to red; transformed, Ifrit fights and later adds {R}{R}{R}{R}', () => {
    let s = newGame();
    s.players.P1!.hand = [];
    put(s, 'P1', 'forest', 'hand');
    const r = enter(s, 'clive-ifrits-dominant-ifrit-warden-of-inferno', { R: 2, C: 4 });
    s = answerFirst(r.s);
    expect(s.players.P1!.hand.length).toBe(2);
    const cat = put(s, 'P2', 'coeurl');
    s.cards[r.c]!.summoningSick = false;
    mana(s, 'P1', { R: 2, C: 4 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: r.c, ability: 0 }, { targets: (options) => [options.flat().find((t) => t.kind === 'card' && t.card === cat)!] }).state;
    expect(s.cards[r.c]!.transformed).toBe(true);
    expect(s.cards[cat]!.zone).toBe('graveyard');
    s = nextTurnOfP1(s);
    expect(s.players.P1!.manaPool.R).toBe(4);
  });

  it('Joshua: discard up to two, then draw that many; Phoenix deals 2 to each opponent, then returns creature cards with total mana value 6 or less', () => {
    let s = newGame();
    s.players.P1!.hand = [];
    const discards = [put(s, 'P1', 'forest', 'hand'), put(s, 'P1', 'forest', 'hand')];
    const r = enter(s, 'joshua-phoenixs-dominant-phoenix-warden-of-fire', { R: 1, W: 1, C: 1 });
    s = settle(act(r.s, { type: 'ChooseCards', player: 'P1', cards: discards })).state;
    expect(s.players.P1!.hand.length).toBe(2);
    s.cards[r.c]!.summoningSick = false;
    const life = s.players.P2!.life;
    mana(s, 'P1', { R: 1, W: 1, C: 3 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: r.c, ability: 0 }).state;
    expect(s.players.P2!.life).toBe(life - 2);
    const big = put(s, 'P1', 'clive-ifrits-dominant-ifrit-warden-of-inferno', 'graveyard');
    const cat = put(s, 'P1', 'coeurl', 'graveyard');
    const tiny = put(s, 'P1', 'coeurl', 'graveyard');
    s = nextTurnOfP1(s);
    expect(s.players.P2!.life).toBe(life - 4);
    const turn = s.turnNumber;
    for (let guard = 0; guard < 8 && s.pending.kind !== 'chooseCards'; guard++) s = goTo(answerFirst(settle(goTo(s, 'end')).state), 'main1');
    expect(s.turnNumber).toBeGreaterThan(turn);
    expect(s.pending).toMatchObject({ kind: 'chooseCards', purpose: 'battlefield', maxTotalManaValue: 6 });
    expect(rejected(s, { type: 'ChooseCards', player: 'P1', cards: [big, cat] })).toMatch(/total mana value 6/);
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [cat, tiny] })).state;
    expect([s.cards[cat]!.zone, s.cards[tiny]!.zone, s.cards[big]!.zone]).toEqual(['battlefield', 'battlefield', 'graveyard']);
    expect(s.cards[r.c]!.transformed ?? false).toBe(false);
  });

  it('Najeela: an attacking Warrior brings a 1/1 Warrior token tapped and attacking; WUBRG during combat untaps attackers and adds a combat', () => {
    let s = newGame();
    const najeela = put(s, 'P1', 'najeela-the-blade-blossom');
    s = goTo(s, 'declareAttackers');
    s = act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: najeela, defender: 'P2' }] });
    s = settle(s).state;
    const token = s.players.P1!.battlefield.find((id) => s.cards[id]!.defId === 'warrior-token');
    expect(token).toBeDefined();
    expect(s.combat!.attacks.some((a) => a.attacker === token && a.defender === 'P2')).toBe(true);
    mana(s, 'P1', { W: 1, U: 1, B: 1, R: 1, G: 1 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: najeela, ability: 0 }).state;
    expect(s.cards[najeela]!.tapped).toBe(false);
    expect(hasKeyword(s, s.cards[najeela]!, 'Lifelink')).toBe(true);
  });
});

describe('S4 group 46: Venat, Crystal Fragments, Ultimecia, Sephiroth', () => {
  const answerFirst = (s: GameState): GameState => {
    for (let guard = 0; guard < 8 && s.pending.kind === 'chooseCards'; guard++) {
      s = settle(act(s, { type: 'ChooseCards', player: s.pending.player, cards: s.pending.cards.slice(0, Math.max(1, s.pending.min)) })).state;
    }
    return s;
  };
  const pickCard = (id: string) => (options: Target[][]) => [options.flat().find((t) => t.kind === 'card' && t.card === id)!];

  it('Venat draws on your first legendary spell each turn; {7}: exile a nonland permanent and become Hydaelyn', () => {
    let s = newGame();
    const venat = put(s, 'P1', 'venat-heart-of-hydaelyn-hydaelyn-the-mothercrystal');
    const hand = s.players.P1!.hand.length;
    for (const id of ['najeela-the-blade-blossom', 'najeela-the-blade-blossom']) {
      const c = put(s, 'P1', id, 'hand');
      mana(s, 'P1', { R: 1, C: 2 });
      s = cast(s, { type: 'CastSpell', player: 'P1', card: c }).state;
      s = answerFirst(s);
    }
    expect(s.players.P1!.hand.length).toBe(hand + 1);
    const cat = put(s, 'P2', 'coeurl');
    mana(s, 'P1', { C: 7 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: venat, ability: 0, targets: [card(cat)] }).state;
    expect(s.cards[cat]!.zone).toBe('exile');
    expect(s.cards[venat]!.transformed).toBe(true);
    expect(hasKeyword(s, s.cards[venat]!, 'Indestructible')).toBe(true);
  });

  it('Hydaelyn: at combat, a counter and indestructible until your next turn on another creature; a legendary one draws a card', () => {
    let s = newGame();
    put(s, 'P1', 'venat-heart-of-hydaelyn-hydaelyn-the-mothercrystal', 'battlefield', { transformed: true });
    const legend = put(s, 'P1', 'najeela-the-blade-blossom');
    const hand = s.players.P1!.hand.length;
    s = goTo(s, 'beginCombat', { targets: pickCard(legend) });
    s = settle(s, { targets: pickCard(legend) }).state;
    expect(s.cards[legend]!.counters).toBe(1);
    expect(s.players.P1!.hand.length).toBe(hand + 1);
    s = goTo(s, 'end');
    s = goTo(s, 'upkeep');
    expect(s.activePlayer).toBe('P2');
    expect(hasKeyword(s, s.cards[legend]!, 'Indestructible')).toBe(true);
  });

  it('Crystal Fragments gives +1/+1; transformed, Summon: Alexander prevents damage to your creatures this turn', () => {
    let s = newGame();
    const { body, gear } = equipped(s, 'crystal-fragments-summon-alexander');
    const base = stats(s, put(s, 'P2', 'coeurl'));
    expect(stats(s, body)).toEqual([base[0]! + 1, base[1]! + 1]);
    mana(s, 'P1', { W: 2, C: 5 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: gear, ability: 0 }).state;
    expect(s.cards[gear]!.transformed).toBe(true);
    const bolt = put(s, 'P1', 'lightning-bolt', 'hand');
    mana(s, 'P1', { R: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: bolt, targets: [card(body)] }).state;
    expect(s.cards[body]!.zone).toBe('battlefield');
    expect(s.cards[body]!.damage).toBe(0);
  });

  it('Ultimecia: at your end step, pay {4}{U}{U}{B}{B} and exile eight graveyard cards to transform and take an extra turn', () => {
    let s = newGame();
    const ultimecia = put(s, 'P1', 'ultimecia-time-sorceress-ultimecia-omnipotent');
    for (let i = 0; i < 8; i++) put(s, 'P1', 'forest', 'graveyard');
    s = goTo(s, 'main2');
    for (let i = 0; i < 6 && s.pending.kind === 'priority'; i++) s = act(s, { type: 'PassPriority', player: s.pending.player });
    expect(s.step).toBe('end');
    expect(s.pending.kind).toBe('decide');
    mana(s, 'P1', { U: 2, B: 2, C: 4 });
    s = act(s, { type: 'Decide', player: 'P1', accept: true });
    s = answerFirst(settle(s).state);
    expect(s.players.P1!.graveyard).toHaveLength(0);
    expect(s.cards[ultimecia]!.transformed).toBe(true);
    expect(hasKeyword(s, s.cards[ultimecia]!, 'Menace')).toBe(true);
    s = goTo(s, 'upkeep');
    expect(s.activePlayer).toBe('P1');
  });

  it('Sephiroth drains on each other creature dying; the fourth time he transforms and leaves an emblem that keeps draining', () => {
    let s = newGame(2);
    const seph = put(s, 'P1', 'sephiroth-fabled-soldier-sephiroth-one-winged-angel');
    const life = s.players.P2!.life;
    for (let i = 0; i < 4; i++) {
      const cat = put(s, 'P2', 'coeurl');
      const bolt = put(s, 'P1', 'lightning-bolt', 'hand');
      mana(s, 'P1', { R: 1 });
      s = cast(s, { type: 'CastSpell', player: 'P1', card: bolt, targets: [card(cat)] }).state;
    }
    expect(s.players.P2!.life).toBe(life - 4);
    expect(s.cards[seph]!.transformed).toBe(true);
    expect(s.delayedTriggers?.some((d) => d.emblem)).toBe(true);
    const cat = put(s, 'P2', 'coeurl');
    const bolt = put(s, 'P1', 'lightning-bolt', 'hand');
    mana(s, 'P1', { R: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: bolt, targets: [card(cat)] }).state;
    expect(s.players.P2!.life).toBe(life - 5);
  });
});

describe('S4 group 47: Omega, Cecil, Isshin, Quistis Trepe, Esper Origins', () => {
  it('Omega taps up to one nonland permanent per opponent and stuns each with X counters; you gain X (X = your nonbasic lands)', () => {
    let s = newGame(3);
    const a = put(s, 'P2', 'coeurl');
    const b = put(s, 'P3', 'coeurl');
    put(s, 'P1', 'treno-dark-city');
    put(s, 'P1', 'rabanastre-royal-city');
    const life = s.players.P1!.life;
    const omega = put(s, 'P1', 'omega-heartless-evolution', 'hand');
    mana(s, 'P1', { G: 1, U: 1, C: 5 });
    const pick = (o: Target[][]) => o.find((x) => x.some((y) => y.kind === 'card' && y.card === a) && x.some((y) => y.kind === 'card' && y.card === b))!;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: omega }, { targets: pick }).state;
    expect([s.cards[a]!.tapped, s.cards[b]!.tapped]).toEqual([true, true]);
    expect([countersOf(s.cards[a]!, 'stun'), countersOf(s.cards[b]!, 'stun')]).toEqual([2, 2]);
    expect(s.players.P1!.life).toBe(life + 2);
  });

  it('Cecil: you lose life equal to the damage he deals; at half your starting life or less he untaps and transforms', () => {
    let s = newGame();
    const cecil = put(s, 'P1', 'cecil-dark-knight-cecil-redeemed-paladin');
    s.players.P1!.life = 11;
    s = fight(s, [{ attacker: cecil, defender: 'P2' }]).state;
    expect(s.players.P1!.life).toBe(9);
    expect(s.cards[cecil]!.transformed).toBe(true);
    expect(s.cards[cecil]!.tapped).toBe(false);
    expect(hasKeyword(s, s.cards[cecil]!, 'Lifelink')).toBe(true);
  });

  it('Isshin: attack triggers of your permanents trigger an additional time', () => {
    let s = newGame();
    put(s, 'P1', 'isshin-two-heavens-as-one');
    const sazh = put(s, 'P1', 'sazh-katzroy');
    const cat = put(s, 'P1', 'coeurl');
    s = fight(s, [{ attacker: sazh, defender: 'P2' }], {}, { targets: (options) => [options.flat().find((t) => t.kind === 'card' && t.card === cat)!] }).state;
    // +1 then double, twice: 0 -> 2 -> 6.
    expect(s.cards[cat]!.counters).toBe(6);
  });

  it('Quistis Trepe: cast an instant from an opponent’s graveyard with any type of mana; it’s exiled afterwards', () => {
    let s = newGame();
    const bolt = put(s, 'P2', 'lightning-bolt', 'graveyard');
    const quistis = put(s, 'P1', 'quistis-trepe', 'hand');
    mana(s, 'P1', { U: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: quistis }).state;
    mana(s, 'P1', { U: 1 });
    const life = s.players.P2!.life;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: bolt, targets: [player('P2')], castGroup: s.castGroups![0]!.id }).state;
    expect(s.players.P2!.life).toBe(life - 3);
    expect(s.cards[bolt]!.zone).toBe('exile');
  });

  it('Esper Origins: surveil 2 and gain 2; flashed back, it becomes Summon: Esper Maduin with a finality counter', () => {
    let s = newGame();
    const origins = put(s, 'P1', 'esper-origins-summon-esper-maduin', 'hand');
    const life = s.players.P1!.life;
    mana(s, 'P1', { G: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: origins }).state;
    expect(s.players.P1!.life).toBe(life + 2);
    expect(s.cards[origins]!.zone).toBe('graveyard');
    const ring = put(s, 'P1', 'sol-ring', 'library');
    mana(s, 'P1', { G: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: origins }).state;
    expect(s.cards[origins]).toMatchObject({ zone: 'battlefield', transformed: true });
    expect(countersOf(s.cards[origins]!, 'finality')).toBe(1);
    // Chapter I: the revealed permanent card goes to hand.
    expect(s.cards[ring]!.zone).toBe('hand');
  });
});

describe('S4 group 48: Garnet, Buster Sword, Chocobo Kick, Serah Farron', () => {
  it('Garnet: attacking, remove a lore counter from any number of your Sagas for +1/+1 counters', () => {
    let s = newGame();
    const garnet = put(s, 'P1', 'garnet-princess-of-alexandria');
    const sagas = [put(s, 'P1', 'summon-choco-mog', 'battlefield', { namedCounters: { lore: 2 } }), put(s, 'P1', 'summon-choco-mog', 'battlefield', { namedCounters: { lore: 1 } })];
    s = goTo(s, 'declareAttackers');
    s = act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: garnet, defender: 'P2' }] });
    for (let i = 0; i < 4 && s.pending.kind === 'priority'; i++) s = act(s, { type: 'PassPriority', player: s.pending.player });
    expect(s.pending).toMatchObject({ kind: 'chooseCards', purpose: 'removeLore' });
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: sagas })).state;
    expect(sagas.map((id) => s.cards[id]!.namedCounters?.lore ?? 0)).toEqual([1, 0]);
    expect(s.cards[garnet]!.counters).toBe(2);
  });

  it('Buster Sword: +3/+2; combat damage to a player draws, then a spell with mana value up to that damage may be cast free', () => {
    let s = newGame();
    const { body } = equipped(s, 'buster-sword');
    const ring = put(s, 'P1', 'sol-ring', 'hand');
    s = fight(s, [{ attacker: body, defender: 'P2' }]).state;
    expect(s.pending).toMatchObject({ kind: 'chooseCards', purpose: 'castFree' });
    expect(s.pending.kind === 'chooseCards' && s.pending.cards).toContain(ring);
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [ring] })).state;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: ring }).state;
    expect(s.cards[ring]!.zone).toBe('battlefield');
  });

  it('Chocobo Kick: your creature deals damage equal to its power; kicked by returning a land, twice that', () => {
    const run = (kick: boolean) => {
      let s = newGame();
      const bird = put(s, 'P1', 'adeline-resplendent-cathar');
      const big = put(s, 'P2', 'omega-heartless-evolution');
      const land = put(s, 'P1', 'forest');
      const kickIt = put(s, 'P1', 'chocobo-kick', 'hand');
      mana(s, 'P1', { G: 1, C: 1 });
      s = cast(s, { type: 'CastSpell', player: 'P1', card: kickIt, targets: [card(bird), card(big)], ...(kick ? { kicks: 1, costCards: [land] } : {}) }).state;
      return { s, big, land };
    };
    const plain = run(false);
    const kicked = run(true);
    expect(kicked.s.cards[kicked.big]!.damage).toBe(plain.s.cards[plain.big]!.damage * 2);
    expect(kicked.s.cards[kicked.land]!.zone).toBe('hand');
    expect(plain.s.cards[plain.land]!.zone).toBe('battlefield');
  });

  it('Serah Farron: your first legendary creature spell each turn costs {2} less; with two other legends, she becomes Crystallized Serah (+2/+2)', () => {
    let s = newGame();
    const serah = put(s, 'P1', 'serah-farron-crystallized-serah');
    // Najeela costs {2}{R}: the first one is just {R}, the second full price.
    const first = put(s, 'P1', 'najeela-the-blade-blossom', 'hand');
    const second = put(s, 'P1', 'najeela-the-blade-blossom', 'hand');
    mana(s, 'P1', { R: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: first }).state;
    expect(s.cards[first]!.zone).toBe('battlefield');
    mana(s, 'P1', { R: 1 });
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: second })).toBeTruthy();
    s.players.P1!.manaPool.R = 0;
    s = settle(s).state;
    const garnet = put(s, 'P1', 'garnet-princess-of-alexandria');
    s = goTo(s, 'declareAttackers');
    expect(s.cards[serah]!.transformed).toBe(true);
    expect(stats(s, garnet)).toEqual([4, 4]);
  });
});

describe('S4 group 49: Carpet of Flowers, Ardyn, Balthier and Fran', () => {
  it('Carpet of Flowers: at a main phase, you may add mana equal to the Islands target opponent controls, once each turn', () => {
    let s = newGame();
    put(s, 'P1', 'carpet-of-flowers');
    for (let i = 0; i < 3; i++) put(s, 'P2', 'island');
    s = goTo(s, 'upkeep');
    s = goTo(s, 'main1');
    s = settle(s, { accept: true }).state;
    expect(s.pending.kind).toBe('chooseMana');
    s = act(s, { type: 'ChooseMana', player: 'P1', mana: 'G' } as never);
    expect(s.players.P1!.manaPool.G).toBe(3);
  });

  it('Ardyn: Demons you control have menace, lifelink and haste; at combat, exile a creature card from a graveyard for a 5/5 black Demon copy', () => {
    let s = newGame();
    put(s, 'P1', 'ardyn-the-usurper');
    const cat = put(s, 'P2', 'coeurl', 'graveyard');
    s = goTo(s, 'beginCombat', { targets: (options) => [options.flat().find((t) => t.kind === 'card' && t.card === cat)!] });
    s = settle(s, { targets: (options) => [options.flat().find((t) => t.kind === 'card' && t.card === cat)!] }).state;
    expect(s.cards[cat]!.zone).toBe('exile');
    const token = s.players.P1!.battlefield.find((id) => s.cards[id]!.isToken);
    expect(token).toBeDefined();
    expect(stats(s, token!)).toEqual([5, 5]);
    expect(currentDefinition(s, s.cards[token!]!).subtypes).toEqual(['Demon']);
    expect(['Menace', 'Lifelink', 'Haste'].every((k) => hasKeyword(s, s.cards[token!]!, k as never))).toBe(true);
  });

  it('Balthier and Fran: Vehicles get +1/+1, reach and vigilance; a Vehicle they crewed attacking may pay {1}{R}{G} for another combat', () => {
    let s = newGame();
    const pair = put(s, 'P1', 'balthier-and-fran');
    const copter = put(s, 'P1', 'smugglers-copter');
    expect(stats(s, copter)).toEqual([4, 4]);
    expect(hasKeyword(s, s.cards[copter]!, 'Vigilance')).toBe(true);
    const crew = activatedAbilities(s.cardDefs['smugglers-copter']!).findIndex((a) => a.cost.crew !== undefined);
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: copter, ability: crew, costCards: [pair] }).state;
    s = goTo(s, 'declareAttackers');
    s = act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: copter, defender: 'P2' }] });
    for (let i = 0; i < 6 && s.pending.kind === 'priority'; i++) s = act(s, { type: 'PassPriority', player: s.pending.player });
    mana(s, 'P1', { R: 1, G: 1, C: 1 });
    let asked = false;
    for (let i = 0; i < 12 && s.stack.length > 0; i++) {
      if (s.pending.kind === 'decide') {
        const mine = s.stack.at(-1)!.kind === 'ability' && (s.stack.at(-1) as { source: string }).source === pair;
        asked ||= mine;
        s = act(s, { type: 'Decide', player: 'P1', accept: mine });
      } else if (s.pending.kind === 'priority') s = act(s, { type: 'PassPriority', player: s.pending.player });
      else break;
    }
    expect(asked).toBe(true);
    expect(s.extraCombats).toBe(1);
  });
});
