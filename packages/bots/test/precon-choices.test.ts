// The precon cards built on choosing cards (C2, step 1 of the handoff):
// discarding and sacrificing cards of a player's choice, discard and
// sacrifice costs, and "keep N, sacrifice the rest". Each is checked
// against its Oracle text with the real card data.

import { describe, expect, it } from 'vitest';
import { getLegalActions, playableZone, spellOptions, type Action, type GameState, type InstanceId } from '@nexus/engine';
import { CARD_IDS_BY_NAME } from '@nexus/cards';
import { basicAi } from '../src/index.ts';
import { act, card, cast, fight, goTo, mana, newGame, put, rejected, settle } from './kit-helpers.ts';

const id = (name: string) => {
  const found = CARD_IDS_BY_NAME[name];
  if (!found) throw new Error(`No card named ${name}`);
  return found;
};
const zone = (s: GameState, c: string) => s.cards[c]!.zone;
const castSpell = (c: string, extra: Partial<Extract<Action, { type: 'CastSpell' }>> = {}): Action => ({
  type: 'CastSpell',
  player: 'P1',
  card: c,
  targets: [],
  ...extra,
});
/** Answers the pending card choice. */
function choose(s: GameState, cards: InstanceId[]): GameState {
  const p = s.pending;
  if (p.kind !== 'chooseCards') throw new Error(`Expected a card choice, not ${p.kind}`);
  return settle(act(s, { type: 'ChooseCards', player: p.player, cards })).state;
}
const pendingChoice = (s: GameState) => {
  if (s.pending.kind !== 'chooseCards') throw new Error(`Expected a card choice, not ${s.pending.kind}`);
  return s.pending;
};

describe('discard as a cost', () => {
  it('Big Score: discard a card as you cast it, then draw two and make two Treasures', () => {
    let s = newGame();
    const spell = put(s, 'P1', id('Big Score'), 'hand');
    const junk = put(s, 'P1', 'island', 'hand');
    mana(s, 'P1', { R: 1, C: 3 });
    expect(rejected(s, castSpell(spell))).toMatch(/discard/);
    expect(rejected(s, castSpell(spell, { costCards: [spell] }))).toMatch(/other cards/);
    s = cast(s, castSpell(spell, { costCards: [junk] })).state;
    expect(zone(s, junk)).toBe('graveyard');
    expect(s.players.P1!.hand).toHaveLength(2);
    expect(s.players.P1!.battlefield.filter((c) => s.cards[c]!.defId === 'treasure-token')).toHaveLength(2);
    // Each way to pay is its own option.
    const t = newGame();
    const spell2 = put(t, 'P1', id('Big Score'), 'hand');
    put(t, 'P1', 'island', 'hand');
    put(t, 'P1', 'island', 'hand');
    expect(spellOptions(t, 'P1').filter((o) => o.action.card === spell2)).toHaveLength(2);
  });

  it('Laughing Mad: flashback needs the discard too', () => {
    let s = newGame();
    const spell = put(s, 'P1', id('Laughing Mad'), 'graveyard');
    const junk = put(s, 'P1', 'island', 'hand');
    mana(s, 'P1', { R: 1, C: 3 });
    expect(rejected(s, castSpell(spell))).toMatch(/discard/);
    s = cast(s, castSpell(spell, { costCards: [junk] })).state;
    expect(zone(s, spell)).toBe('exile');
    expect(s.players.P1!.hand).toHaveLength(2);
  });
});

describe('discarding cards of your choice', () => {
  it('Syphon Mind: each other player discards a card of their choice; you draw that many', () => {
    let s = newGame(3);
    const spell = put(s, 'P1', id('Syphon Mind'), 'hand');
    const a = put(s, 'P2', 'island', 'hand');
    put(s, 'P2', 'swamp', 'hand');
    const b = put(s, 'P3', 'island', 'hand');
    mana(s, 'P1', { B: 1, C: 3 });
    s = cast(s, castSpell(spell)).state;
    expect(pendingChoice(s)).toMatchObject({ player: 'P2', purpose: 'discard', min: 1, max: 1 });
    expect(rejected(s, { type: 'ChooseCards', player: 'P2', cards: [] })).toMatch(/exactly 1/);
    s = choose(s, [a]);
    s = choose(s, [b]);
    expect([zone(s, a), zone(s, b)]).toEqual(['graveyard', 'graveyard']);
    expect(s.players.P1!.hand).toHaveLength(2);
  });

  it('Celes discards any number and draws that many plus one; creatures returning from a graveyard grow the team', () => {
    let s = newGame();
    const celes = put(s, 'P1', id('Celes, Rune Knight'), 'hand');
    const x = put(s, 'P1', 'island', 'hand');
    const y = put(s, 'P1', 'island', 'hand');
    put(s, 'P1', 'island', 'hand');
    mana(s, 'P1', { R: 1, W: 1, B: 1, C: 1 });
    s = cast(s, castSpell(celes)).state;
    expect(pendingChoice(s)).toMatchObject({ min: 0, max: 3 });
    s = choose(s, [x, y]);
    expect(s.players.P1!.hand).toHaveLength(4); // 3 - 2 + 3

    // Sun Titan returns a creature card from the graveyard: Celes puts a counter on each of your creatures.
    const rat = put(s, 'P1', 'undercity-dire-rat', 'graveyard');
    const titan = put(s, 'P1', id('Sun Titan'), 'hand');
    mana(s, 'P1', { W: 2, C: 4 });
    s = cast(s, castSpell(titan), { targets: (o) => o.find((t) => t[0]!.kind === 'card' && t[0]!.card === rat)! }).state;
    expect(zone(s, rat)).toBe('battlefield');
    expect([s.cards[celes]!.counters, s.cards[titan]!.counters, s.cards[rat]!.counters]).toEqual([1, 1, 1]);
  });

  it('Snort: each player may discard their hand to draw five; opponents who did take 5', () => {
    let s = newGame(3);
    const spell = put(s, 'P1', id('Snort'), 'hand');
    put(s, 'P1', 'island', 'hand');
    const p2 = put(s, 'P2', 'island', 'hand');
    put(s, 'P3', 'island', 'hand');
    mana(s, 'P1', { R: 1, C: 3 });
    s = cast(s, castSpell(spell)).state;
    expect(pendingChoice(s)).toMatchObject({ player: 'P1', allOrNothing: true });
    expect(rejected(s, { type: 'ChooseCards', player: 'P1', cards: [s.players.P1!.hand[0]!, 'nope'] })).toMatch(/offered/);
    s = choose(s, []); // P1 keeps
    s = choose(s, [p2]); // P2 discards
    s = choose(s, []); // P3 keeps
    expect([s.players.P1!.hand.length, s.players.P2!.hand.length, s.players.P3!.hand.length]).toEqual([1, 5, 1]);
    expect([s.players.P2!.life, s.players.P3!.life]).toEqual([15, 20]);
  });

  it('Ruin Grinder: when it dies, each player may discard their hand and draw seven', () => {
    let s = newGame();
    const grinder = put(s, 'P1', id('Ruin Grinder'));
    put(s, 'P1', 'island', 'hand');
    const vindicate = put(s, 'P1', id('Vindicate'), 'hand');
    mana(s, 'P1', { W: 1, B: 1, C: 1 });
    s = cast(s, castSpell(vindicate, { targets: [card(grinder)] })).state;
    // P2's hand is empty, so only P1 is asked.
    s = choose(s, [...s.players.P1!.hand]);
    expect(s.players.P1!.hand).toHaveLength(7);
  });

  it('Mask of Memory: combat damage draws two, then you discard one', () => {
    let s = newGame();
    const mask = put(s, 'P1', id('Mask of Memory'));
    const rat = put(s, 'P1', 'undercity-dire-rat');
    s.cards[mask]!.attachedTo = rat;
    s = fight(s, [{ attacker: rat, defender: 'P2' }]).state;
    const drawn = s.players.P1!.hand;
    expect(drawn).toHaveLength(2);
    s = choose(s, [drawn[0]!]);
    expect(s.players.P1!.hand).toHaveLength(1);
  });

  it('Mog: each player may discard a card; those who do draw; a creature card discarded makes a Moogle', () => {
    let s = newGame();
    put(s, 'P1', id('Mog, Moogle Warrior'));
    const rat = put(s, 'P1', 'undercity-dire-rat', 'hand');
    put(s, 'P2', 'island', 'hand');
    s = goTo(s, 'end');
    s = choose(s, [rat]);
    s = choose(s, []);
    expect(s.players.P1!.hand).toHaveLength(1);
    expect(s.players.P1!.battlefield.filter((c) => s.cards[c]!.defId === 'moogle-token')).toHaveLength(1);
  });
});

describe('sacrificing permanents of your choice', () => {
  it('High Market sacrifices a creature you choose; Scavenger Grounds can sacrifice itself', () => {
    let s = newGame();
    const market = put(s, 'P1', id('High Market'));
    const rat = put(s, 'P1', 'undercity-dire-rat');
    const ring = put(s, 'P1', 'sol-ring');
    const activate = (costCards: InstanceId[]): Action => ({ type: 'ActivateAbility', player: 'P1', card: market, ability: 0, targets: [], costCards });
    expect(rejected(s, activate([ring]))).toMatch(/sacrifice/);
    s = cast(s, activate([rat])).state;
    expect(zone(s, rat)).toBe('graveyard');
    expect(s.players.P1!.life).toBe(21);

    let t = newGame();
    const grounds = put(t, 'P1', id('Scavenger Grounds'));
    const gone = put(t, 'P2', 'island', 'graveyard');
    mana(t, 'P1', { C: 2 });
    t = cast(t, { type: 'ActivateAbility', player: 'P1', card: grounds, ability: 0, targets: [], costCards: [grounds] }).state;
    // Sacrificed first, it was in the graveyard when every graveyard was exiled.
    expect([zone(t, grounds), zone(t, gone)]).toEqual(['exile', 'exile']);
  });

  it('Professional Face-Breaker: sacrifice a Treasure to exile the top card and play it this turn only', () => {
    let s = newGame();
    const breaker = put(s, 'P1', id('Professional Face-Breaker'));
    const treasure = put(s, 'P1', 'treasure-token');
    const top = s.players.P1!.library[0]!;
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: breaker, ability: 0, targets: [], costCards: [treasure] }).state;
    expect(zone(s, top)).toBe('exile');
    expect(getLegalActions(s).some((a) => a.type === 'PlayLand' && a.card === top)).toBe(true);
    // On the next turn it can't be played any more.
    s = goTo(s, 'end');
    s = goTo(s, 'upkeep');
    expect(s.activePlayer).toBe('P2');
    expect(playableZone(s, 'P1', s.cards[top]!)).toBeNull();
  });

  it('Shadow: on combat damage you may sacrifice another nonland permanent to draw two and drain its mana value', () => {
    let s = newGame(3);
    const shadow = put(s, 'P1', id('Shadow, Mysterious Assassin'));
    const ring = put(s, 'P1', 'sol-ring');
    s = fight(s, [{ attacker: shadow, defender: 'P2' }]).state;
    const c = pendingChoice(s);
    expect(c).toMatchObject({ purpose: 'sacrifice', min: 0, max: 1 });
    expect(c.cards).toEqual([ring]);
    s = choose(s, [ring]);
    expect(s.players.P1!.hand).toHaveLength(2);
    expect([s.players.P2!.life, s.players.P3!.life]).toEqual([16, 19]); // 3 combat damage, then 1 each

    let t = newGame();
    const shadow2 = put(t, 'P1', id('Shadow, Mysterious Assassin'));
    put(t, 'P1', 'sol-ring');
    t = fight(t, [{ attacker: shadow2, defender: 'P2' }]).state;
    t = choose(t, []);
    expect(t.players.P1!.hand).toHaveLength(0);
    expect(t.players.P2!.life).toBe(17);
  });
});

describe('keep some, sacrifice the rest', () => {
  it("Archfiend of Depravity: at each opponent's end step they keep two creatures of their choice", () => {
    let s = newGame();
    put(s, 'P1', id('Archfiend of Depravity'));
    const theirs = [put(s, 'P2', 'undercity-dire-rat'), put(s, 'P2', 'undercity-dire-rat'), put(s, 'P2', 'undercity-dire-rat')];
    s.activePlayer = 'P2';
    s.pending = { kind: 'priority', player: 'P2', passes: 0 };
    s = goTo(s, 'end');
    expect(pendingChoice(s)).toMatchObject({ player: 'P2', purpose: 'keep', max: 2 });
    s = choose(s, [theirs[0]!, theirs[2]!]);
    expect(theirs.map((c) => zone(s, c))).toEqual(['battlefield', 'graveyard', 'battlefield']);
  });

  it('Tragic Arrogance: you choose an artifact, a creature and an enchantment for each player; the rest are sacrificed', () => {
    let s = newGame();
    const spell = put(s, 'P1', id('Tragic Arrogance'), 'hand');
    const mine = [put(s, 'P1', 'undercity-dire-rat'), put(s, 'P1', 'undercity-dire-rat')];
    const ring = put(s, 'P2', 'sol-ring');
    const rats = [put(s, 'P2', 'undercity-dire-rat'), put(s, 'P2', 'undercity-dire-rat')];
    const land = put(s, 'P2', 'island');
    mana(s, 'P1', { W: 2, C: 3 });
    s = cast(s, castSpell(spell)).state;
    expect(pendingChoice(s)).toMatchObject({ player: 'P1', purpose: 'keep' });
    s = choose(s, [mine[0]!]);
    // P1 also chooses for P2, and can't keep two creatures.
    expect(pendingChoice(s).player).toBe('P1');
    expect(rejected(s, { type: 'ChooseCards', player: 'P1', cards: rats })).toMatch(/at most one/);
    s = choose(s, [ring, rats[1]!]);
    expect([...mine, ring, ...rats, land].map((c) => zone(s, c))).toEqual([
      'battlefield',
      'graveyard',
      'battlefield',
      'graveyard',
      'battlefield',
      'battlefield',
    ]);
  });

  it("Fandaniel: each opponent may sacrifice a nontoken creature; those who don't lose 2 per instant and sorcery in your graveyard", () => {
    let s = newGame(3);
    put(s, 'P1', id('Fandaniel, Telophoroi Ascian'));
    put(s, 'P1', id('Big Score'), 'graveyard');
    put(s, 'P1', id('Snort'), 'graveyard');
    const rat = put(s, 'P2', 'undercity-dire-rat');
    put(s, 'P3', 'treasure-token');
    s = goTo(s, 'end');
    // P3 has no nontoken creature, so only P2 is asked.
    expect(pendingChoice(s)).toMatchObject({ player: 'P2', cards: [rat], min: 0 });
    s = choose(s, [rat]);
    expect([s.players.P2!.life, s.players.P3!.life]).toEqual([20, 16]);
  });
});

describe('the AI chooses', () => {
  it('discards and sacrifices sensibly', () => {
    const ai = basicAi();
    let s = newGame(3);
    const spell = put(s, 'P1', id('Syphon Mind'), 'hand');
    put(s, 'P2', 'island', 'hand');
    put(s, 'P2', 'island', 'hand');
    put(s, 'P2', 'island', 'hand');
    put(s, 'P2', 'island', 'hand');
    const keepMe = put(s, 'P2', 'undercity-dire-rat', 'hand');
    mana(s, 'P1', { B: 1, C: 3 });
    s = cast(s, castSpell(spell)).state;
    const discard = ai(s, getLegalActions(s));
    expect(discard.type).toBe('ChooseCards');
    expect((discard as Extract<Action, { type: 'ChooseCards' }>).cards).not.toContain(keepMe);
  });
});

describe('paying with mana abilities', () => {
  it('abilities that trigger while you pay (a Treasure sacrificed) go on the stack after the spell is cast', () => {
    let s = newGame(3);
    put(s, 'P1', 'al-bhed-salvagers');
    const treasure = put(s, 'P1', 'treasure-token');
    const ring = put(s, 'P1', 'sol-ring', 'hand');
    s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: treasure, mana: 'B' });
    // Al Bhed Salvagers has triggered, but waits while P1 is still casting.
    expect(s.pending).toMatchObject({ kind: 'priority', player: 'P1' });
    expect(s.triggerQueue).toHaveLength(1);
    s = act(s, castSpell(ring));
    // Now it goes on the stack, above the spell (with two opponents, P1 picks the target).
    expect(s.pending.kind).toBe('chooseTargets');
    s = act(s, { type: 'ChooseTargets', player: 'P1', targets: [{ kind: 'player', player: 'P2' }] });
    expect(s.stack.map((i) => i.kind)).toEqual(['spell', 'ability']);
  });
});
