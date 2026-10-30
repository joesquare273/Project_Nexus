// Final Fantasy set cards built in S4 (docs/sealed.md), played through the
// engine with their real card data. Each test checks what the card's Oracle
// text says it does.

import { describe, expect, it } from 'vitest';
import { type Target, activatedAbilities, countersOf, currentDefinition, getLegalActions, viewFor, hasKeyword, manaValue, parseManaCost, powerOf, toughnessOf, type GameState } from '@nexus/engine';
import { act, actWithEvents, card, cast, fight, goTo, mana, newGame, put, rejected, settle } from './kit-helpers.ts';

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
    expect(s.cardDefs['summon-bahamut']!.notBuilt).toBe(true);
    const creature = put(s, 'P1', 'summon-bahamut', 'hand');
    mana(s, 'P1', { C: 9 });
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: creature })).toMatch(/isn't built yet|can't be cast/);
    expect(s.cardDefs['lindblum-industrial-regency-mage-siege']!.notBuilt).toBe(true);
    const land = put(s, 'P1', 'lindblum-industrial-regency-mage-siege', 'hand');
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
