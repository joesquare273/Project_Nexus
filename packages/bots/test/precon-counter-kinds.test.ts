// Step 3 of the precon card work: counters other than +1/+1 (shield, stun,
// flying, page, soul), counters as a cost, moving counters, and abilities
// that look back at the counters a permanent had as it left. Each card is
// checked against its Oracle text with the real card data.

import { describe, expect, it } from 'vitest';
import { characteristics, getLegalActions, type GameState, type Target } from '@nexus/engine';
import { act, card, cast, fight, goTo, mana, newGame, player, put, rejected, settle } from './kit-helpers.ts';

const zone = (s: GameState, c: string) => s.cards[c]!.zone;
const named = (s: GameState, c: string) => s.cards[c]!.namedCounters ?? {};
const pick = (want: Target[]) => (options: Target[][]) => {
  const found = options.find((o) => JSON.stringify(o) === JSON.stringify(want));
  if (!found) throw new Error(`No such target choice: ${JSON.stringify(want)}`);
  return found;
};
const RAT = 'undercity-dire-rat';

describe('Protection Magic and shield counters', () => {
  it('puts a shield counter on each of up to three target creatures', () => {
    let s = newGame();
    const a = put(s, 'P1', RAT);
    const b = put(s, 'P2', RAT);
    const spell = put(s, 'P1', 'protection-magic', 'hand');
    mana(s, 'P1', { W: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(a), card(b), { kind: 'none' }] }).state;
    expect([named(s, a), named(s, b)]).toEqual([{ shield: 1 }, { shield: 1 }]);
  });

  it('a shield counter is removed instead of damage being dealt or the creature being destroyed', () => {
    let s = newGame();
    const rat = put(s, 'P2', RAT, 'battlefield', { namedCounters: { shield: 2 } });
    const bolt = put(s, 'P1', 'judgment-bolt', 'hand');
    const kill = put(s, 'P1', 'sephiroths-intervention', 'hand');
    mana(s, 'P1', { R: 1, B: 1, C: 6 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: bolt, targets: [card(rat)] }).state;
    expect([zone(s, rat), s.cards[rat]!.damage, named(s, rat)]).toEqual(['battlefield', 0, { shield: 1 }]);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: kill, targets: [card(rat)] }).state;
    expect([zone(s, rat), named(s, rat)]).toEqual(['battlefield', {}]);
  });
});

describe('Lulu, Stern Guardian and stun counters', () => {
  it('whenever an opponent attacks you, a creature attacking you gets a stun counter; it stays tapped once', () => {
    let s = newGame();
    put(s, 'P1', 'lulu-stern-guardian');
    const attacker = put(s, 'P2', RAT);
    s = goTo(s, 'end');
    s = goTo(s, 'declareAttackers'); // P2's turn
    expect(s.activePlayer).toBe('P2');
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P2', attacks: [{ attacker, defender: 'P1' }] })).state;
    expect(named(s, attacker)).toEqual({ stun: 1 });
    // P2's next untap step: the stun counter is removed instead of untapping.
    s = goTo(s, 'end');
    s = goTo(s, 'main1'); // P1's turn
    s = goTo(s, 'end');
    s = goTo(s, 'main1'); // P2's turn
    expect(s.activePlayer).toBe('P2');
    expect([s.cards[attacker]!.tapped, named(s, attacker)]).toEqual([true, {}]);
  });

  it('{3}{U}: proliferate adds to your counters and to stun counters on opponents’ permanents', () => {
    let s = newGame();
    const lulu = put(s, 'P1', 'lulu-stern-guardian');
    const mine = put(s, 'P1', RAT, 'battlefield', { counters: 1, namedCounters: { stun: 1 } });
    const theirs = put(s, 'P2', RAT, 'battlefield', { counters: 1, namedCounters: { stun: 1 } });
    mana(s, 'P1', { U: 1, C: 3 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: lulu, ability: 0, targets: [] }).state;
    expect([s.cards[mine]!.counters, named(s, mine)]).toEqual([2, { stun: 1 }]);
    expect([s.cards[theirs]!.counters, named(s, theirs)]).toEqual([1, { stun: 2 }]);
  });
});

describe('Luminous Broodmoth, Zack Fair and Resourceful Defense', () => {
  it('Zack: sacrifice him to give a creature indestructible, his counters and his Equipment', () => {
    let s = newGame();
    const zack = put(s, 'P1', 'zack-fair', 'battlefield', { counters: 1 });
    const boots = put(s, 'P1', 'swiftfoot-boots', 'battlefield', { attachedTo: zack });
    const rat = put(s, 'P1', RAT);
    mana(s, 'P1', { C: 1 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: zack, ability: 0, targets: [card(rat)] }).state;
    expect(zone(s, zack)).toBe('graveyard');
    expect(s.cards[rat]!.counters).toBe(1);
    expect(s.cards[boots]!.attachedTo).toBe(rat);
    expect(s.temporaryEffects.some((e) => e.affected === rat && e.keywords?.includes('Indestructible'))).toBe(true);
  });

  it('Broodmoth returns a creature without flying with a flying counter; with flying it stays dead', () => {
    let s = newGame();
    put(s, 'P1', 'luminous-broodmoth');
    const zack = put(s, 'P1', 'zack-fair');
    const rat = put(s, 'P1', RAT);
    mana(s, 'P1', { C: 2 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: zack, ability: 0, targets: [card(rat)] }).state;
    expect(zone(s, zack)).toBe('battlefield');
    expect(named(s, zack)).toEqual({ flying: 1 });
    expect(s.cards[zack]!.counters).toBe(1); // it enters with a +1/+1 counter again
    expect(getLegalActions(s).length).toBeGreaterThan(0);
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: zack, ability: 0, targets: [card(rat)] }).state;
    expect(zone(s, zack)).toBe('graveyard');
  });

  it('Resourceful Defense: a permanent that leaves with counters passes them on', () => {
    let s = newGame();
    put(s, 'P1', 'resourceful-defense');
    const zack = put(s, 'P1', 'zack-fair', 'battlefield', { counters: 1, namedCounters: { shield: 1 } });
    const rat = put(s, 'P1', RAT);
    mana(s, 'P1', { C: 1 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: zack, ability: 0, targets: [card(rat)] }, { targets: pick([card(rat)]) }).state;
    // Once from Resourceful Defense, once from Zack himself.
    expect([s.cards[rat]!.counters, named(s, rat)]).toEqual([2, { shield: 2 }]);
  });

  it('Resourceful Defense: {4}{W} moves every counter from one permanent you control to another', () => {
    let s = newGame();
    const defense = put(s, 'P1', 'resourceful-defense');
    const from = put(s, 'P1', RAT, 'battlefield', { counters: 2, namedCounters: { flying: 1 } });
    const to = put(s, 'P1', RAT);
    mana(s, 'P1', { W: 1, C: 4 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: defense, ability: 0, targets: [card(from), card(to)] }).state;
    expect([s.cards[from]!.counters, named(s, from)]).toEqual([undefined, {}]);
    expect([s.cards[to]!.counters, named(s, to)]).toEqual([2, { flying: 1 }]);
  });
});

describe('Counters as a cost', () => {
  it('Tome of Legends: page counters from your commander entering or attacking, removed to draw', () => {
    let s = newGame();
    const tome = put(s, 'P1', 'tome-of-legends', 'battlefield', { namedCounters: { page: 1 } });
    const commander = put(s, 'P1', 'zack-fair', 'battlefield', { isCommander: true });
    put(s, 'P1', 'island', 'library');
    mana(s, 'P1', { C: 2 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: tome, ability: 0, targets: [] }).state;
    expect([s.players.P1!.hand.length, named(s, tome)]).toEqual([1, {}]);
    s.cards[tome]!.tapped = false;
    expect(rejected(s, { type: 'ActivateAbility', player: 'P1', card: tome, ability: 0, targets: [] })).toMatch(/no counter/);
    s = fight(s, [{ attacker: commander, defender: 'P2' }]).state;
    expect(named(s, tome)).toEqual({ page: 1 });
  });

  it("O'aka: remove a counter from a nonland permanent you control to draw (a stun counter first)", () => {
    let s = newGame();
    const oaka = put(s, 'P1', 'oaka-traveling-merchant');
    const rat = put(s, 'P1', RAT, 'battlefield', { counters: 1, namedCounters: { stun: 1 } });
    put(s, 'P1', 'island', 'library');
    const options = getLegalActions(s).filter((a) => a.type === 'ActivateAbility' && a.card === oaka);
    expect(options.map((a) => (a.type === 'ActivateAbility' ? a.costCards : []))).toEqual([[rat]]);
    s = cast(s, options[0]!).state;
    expect([s.players.P1!.hand.length, s.cards[rat]!.counters, named(s, rat)]).toEqual([1, 1, {}]);
  });

  it('Scholar of New Horizons: the Plains goes onto the battlefield tapped only if an opponent has more lands', () => {
    for (const behind of [false, true]) {
      let s = newGame();
      const scholar = put(s, 'P1', 'scholar-of-new-horizons', 'battlefield', { counters: 1 });
      const plains = put(s, 'P1', 'plains', 'library');
      if (behind) put(s, 'P2', 'island');
      s = cast(s, { type: 'ActivateAbility', player: 'P1', card: scholar, ability: 0, targets: [], costCards: [scholar] }).state;
      expect(s.cards[scholar]!.counters).toBeUndefined();
      expect(zone(s, plains)).toBe(behind ? 'battlefield' : 'hand');
      if (behind) expect(s.cards[plains]!.tapped).toBe(true);
    }
  });
});

describe('Moving counters', () => {
  it('Rikku: steal a counter from an opponent’s creature; the creature can’t be blocked this turn', () => {
    let s = newGame();
    const rikku = put(s, 'P1', 'rikku-resourceful-guardian');
    const theirs = put(s, 'P2', RAT, 'battlefield', { counters: 2 });
    const mine = put(s, 'P1', RAT);
    mana(s, 'P1', { C: 1 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: rikku, ability: 0, targets: [card(theirs), card(mine)] }).state;
    expect([s.cards[theirs]!.counters, s.cards[mine]!.counters]).toEqual([1, 1]);
    expect(s.temporaryEffects.some((e) => e.affected === mine && e.flags?.includes('cantBeBlocked'))).toBe(true);
  });

  it('Nesting Grounds: moves a stun counter onto an opponent’s permanent', () => {
    let s = newGame();
    const grounds = put(s, 'P1', 'nesting-grounds');
    const mine = put(s, 'P1', RAT, 'battlefield', { counters: 1, namedCounters: { stun: 1 } });
    const theirs = put(s, 'P2', RAT);
    mana(s, 'P1', { C: 1 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: grounds, ability: 0, targets: [card(mine), card(theirs)] }).state;
    expect([named(s, mine), named(s, theirs), s.cards[mine]!.counters]).toEqual([{}, { stun: 1 }, 1]);
  });
});

describe('+1/+1 counter cards', () => {
  it('Maester Seymour: counters equal to his power at combat; monstrosity counts every counter, once', () => {
    let s = newGame();
    const seymour = put(s, 'P1', 'maester-seymour');
    const rat = put(s, 'P1', RAT, 'battlefield', { namedCounters: { shield: 1 } });
    s = goTo(s, 'beginCombat');
    s = settle(s).state;
    expect(s.cards[rat]!.counters).toBe(1);
    s = goTo(s, 'main2');
    mana(s, 'P1', { G: 4, C: 6 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: seymour, ability: 0, targets: [] }).state;
    expect(s.cards[seymour]!.counters).toBe(2); // the +1/+1 and the shield counter on the rat
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: seymour, ability: 0, targets: [] }).state;
    expect(s.cards[seymour]!.counters).toBe(2);
  });

  it('Incubation Druid: mana a land you control could make, three with a +1/+1 counter; adapt 3', () => {
    let s = newGame();
    const druid = put(s, 'P1', 'incubation-druid');
    put(s, 'P1', 'forest');
    expect(rejected(s, { type: 'ActivateManaAbility', player: 'P1', card: druid, mana: 'R' })).toMatch(/can't produce/);
    let t = act(s, { type: 'ActivateManaAbility', player: 'P1', card: druid, mana: 'G' });
    expect(t.players.P1!.manaPool.G).toBe(1);
    mana(s, 'P1', { G: 2, C: 3 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: druid, ability: 0, targets: [] }).state;
    expect(s.cards[druid]!.counters).toBe(3);
    mana(s, 'P1', { G: 2, C: 3 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: druid, ability: 0, targets: [] }).state;
    expect(s.cards[druid]!.counters).toBe(3); // adapt does nothing with counters already there
    t = act(s, { type: 'ActivateManaAbility', player: 'P1', card: druid, mana: 'G' });
    expect(t.players.P1!.manaPool.G).toBe(3);
  });

  it("Reaper's Scythe: a soul counter for each player who lost life; +1/+1 each and an Assassin", () => {
    let s = newGame(3);
    const rat = put(s, 'P1', RAT);
    const scythe = put(s, 'P1', 'reapers-scythe', 'battlefield', { attachedTo: rat });
    s.players.P2!.lifeLostThisTurn = 2;
    s.players.P3!.lifeLostThisTurn = 1;
    s = goTo(s, 'end');
    s = settle(s).state;
    expect(named(s, scythe)).toEqual({ soul: 2 });
    const now = characteristics(s, s.cards[rat]!);
    const base = s.cardDefs[RAT]!;
    expect([now.power, now.toughness]).toEqual([base.power! + 2, base.toughness! + 2]);
    expect(now.subtypes).toContain('Assassin');
  });

  it('Yuna: her mana makes the next creature spell enter with two more +1/+1 counters', () => {
    let s = newGame();
    const yuna = put(s, 'P1', 'yuna-grand-summoner');
    const rat = put(s, 'P1', RAT, 'hand');
    s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: yuna, mana: 'B' });
    mana(s, 'P1', { C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: rat, targets: [] }).state;
    expect([zone(s, rat), s.cards[rat]!.counters]).toEqual(['battlefield', 2]);
    expect(s.players.P1!.nextCreatureCounters).toBeUndefined();
  });

  it('Yuna: when another permanent you control with counters goes to the graveyard, that many counters on target creature', () => {
    let s = newGame();
    const yuna = put(s, 'P1', 'yuna-grand-summoner');
    const zack = put(s, 'P1', 'zack-fair', 'battlefield', { counters: 2, namedCounters: { shield: 1 } });
    const rat = put(s, 'P1', RAT);
    mana(s, 'P1', { C: 1 });
    s = cast(
      s,
      { type: 'ActivateAbility', player: 'P1', card: zack, ability: 0, targets: [card(rat)] },
      { targets: pick([card(yuna)]) },
    ).state;
    expect(s.cards[yuna]!.counters).toBe(3);
    expect([s.cards[rat]!.counters, named(s, rat)]).toEqual([2, { shield: 1 }]);
  });

  it('Flayer of the Hatebound: undying, and it deals damage equal to its power as it comes back', () => {
    let s = newGame();
    const flayer = put(s, 'P1', 'flayer-of-the-hatebound');
    const kill = put(s, 'P1', 'sephiroths-intervention', 'hand');
    mana(s, 'P1', { B: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: kill, targets: [card(flayer)] }, { targets: pick([player('P2')]) }).state;
    expect([zone(s, flayer), s.cards[flayer]!.counters]).toEqual(['battlefield', 1]);
    expect(s.players.P2!.life).toBe(20 - 5);
    // With a +1/+1 counter on it, undying doesn't return it.
    const again = put(s, 'P1', 'sephiroths-intervention', 'hand');
    mana(s, 'P1', { B: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: again, targets: [card(flayer)] }).state;
    expect(zone(s, flayer)).toBe('graveyard');
  });

  it('Gatta and Luzzu: damage to the chosen creature becomes +1/+1 counters this turn', () => {
    let s = newGame();
    const rat = put(s, 'P1', RAT);
    const gatta = put(s, 'P1', 'gatta-and-luzzu', 'hand');
    const bolt = put(s, 'P2', 'judgment-bolt', 'hand');
    mana(s, 'P1', { W: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: gatta, targets: [] }, { targets: pick([card(rat)]) }).state;
    mana(s, 'P2', { R: 1, C: 3 });
    s = act(s, { type: 'PassPriority', player: 'P1' });
    expect(s.pending).toMatchObject({ kind: 'priority', player: 'P2' });
    s = cast(s, { type: 'CastSpell', player: 'P2', card: bolt, targets: [card(rat)] }).state;
    expect([zone(s, rat), s.cards[rat]!.damage, s.cards[rat]!.counters]).toEqual(['battlefield', 0, 5]);
  });
});
