// The Final Fantasy Commander precon removal cards (C2, removal group), each
// checked against its Oracle text with the real card data.

import { describe, expect, it } from 'vitest';
import { getLegalActions, spellOptions, type Action, type GameState } from '@nexus/engine';
import { CARD_IDS_BY_NAME } from '@nexus/cards';
import { basicAi } from '../src/index.ts';
import { act, card, cast, mana, newGame, player, put, rejected } from './kit-helpers.ts';

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

describe('single-target removal', () => {
  it('Bedevil destroys target artifact or creature, not a land', () => {
    const s = newGame();
    const rat = put(s, 'P2', 'undercity-dire-rat');
    const ring = put(s, 'P2', 'sol-ring');
    const swamp = put(s, 'P2', 'swamp');
    const spell = put(s, 'P1', id('Bedevil'), 'hand');
    mana(s, 'P1', { B: 2, R: 1 });
    expect(rejected(s, castSpell(spell, { targets: [card(swamp)] }))).toMatch(/not legal/);
    expect(zone(cast(s, castSpell(spell, { targets: [card(rat)] })).state, rat)).toBe('graveyard');
    const s2 = newGame();
    const ring2 = put(s2, 'P2', 'sol-ring');
    const spell2 = put(s2, 'P1', id('Bedevil'), 'hand');
    mana(s2, 'P1', { B: 2, R: 1 });
    expect(zone(cast(s2, castSpell(spell2, { targets: [card(ring2)] })).state, ring2)).toBe('graveyard');
    expect(ring).toBeTruthy();
  });

  it('Mortify destroys a creature or an enchantment, not an artifact', () => {
    const s = newGame();
    const bastion = put(s, 'P2', 'bastion-of-remembrance');
    const ring = put(s, 'P2', 'sol-ring');
    const spell = put(s, 'P1', id('Mortify'), 'hand');
    mana(s, 'P1', { W: 1, B: 1, C: 1 });
    expect(rejected(s, castSpell(spell, { targets: [card(ring)] }))).toMatch(/not legal/);
    expect(zone(cast(s, castSpell(spell, { targets: [card(bastion)] })).state, bastion)).toBe('graveyard');
  });

  it('Vindicate destroys any permanent, including a land', () => {
    const s = newGame();
    const swamp = put(s, 'P2', 'swamp');
    const spell = put(s, 'P1', id('Vindicate'), 'hand');
    mana(s, 'P1', { W: 1, B: 1, C: 1 });
    expect(zone(cast(s, castSpell(spell, { targets: [card(swamp)] })).state, swamp)).toBe('graveyard');
  });

  it('Void Rend destroys a nonland permanent, not a land', () => {
    const s = newGame();
    const swamp = put(s, 'P2', 'swamp');
    const ring = put(s, 'P2', 'sol-ring');
    const spell = put(s, 'P1', id('Void Rend'), 'hand');
    mana(s, 'P1', { W: 1, U: 1, B: 1 });
    expect(rejected(s, castSpell(spell, { targets: [card(swamp)] }))).toMatch(/not legal/);
    expect(zone(cast(s, castSpell(spell, { targets: [card(ring)] })).state, ring)).toBe('graveyard');
  });

  it('Decimate needs an artifact, a creature, an enchantment and a land, and destroys all four', () => {
    const s = newGame();
    const [ring, rat, bastion, swamp] = ['sol-ring', 'undercity-dire-rat', 'bastion-of-remembrance', 'swamp'].map((c) => put(s, 'P2', c));
    const spell = put(s, 'P1', id('Decimate'), 'hand');
    mana(s, 'P1', { R: 1, G: 1, C: 2 });
    // You can't cast it without a legal choice for every target.
    const noLand = newGame();
    for (const c of ['sol-ring', 'undercity-dire-rat', 'bastion-of-remembrance']) put(noLand, 'P2', c);
    const spell2 = put(noLand, 'P1', id('Decimate'), 'hand');
    expect(spellOptions(noLand, 'P1').filter((o) => o.action.card === spell2)).toEqual([]);
    const r = cast(s, castSpell(spell, { targets: [card(ring!), card(rat!), card(bastion!), card(swamp!)] }));
    for (const c of [ring!, rat!, bastion!, swamp!]) expect(zone(r.state, c)).toBe('graveyard');
  });

  it('Meteor Golem destroys a nonland permanent an opponent controls when it enters', () => {
    let s = newGame();
    const ring = put(s, 'P2', 'sol-ring');
    put(s, 'P1', 'sol-ring');
    const golem = put(s, 'P1', id('Meteor Golem'), 'hand');
    mana(s, 'P1', { C: 7 });
    s = cast(s, castSpell(golem), {
      targets: (options) => {
        // Only the opponent's nonland permanents are legal.
        expect(options.flat().every((t) => t.kind === 'card' && s.cards[t.card]?.controller === 'P2')).toBe(true);
        return [card(ring)];
      },
    }).state;
    expect(zone(s, ring)).toBe('graveyard');
  });

  it('Snuff Out destroys a nonblack creature, and can be cast for 4 life if you control a Swamp', () => {
    const s = newGame();
    const coeurl = put(s, 'P2', 'coeurl');
    const rat = put(s, 'P2', 'undercity-dire-rat');
    const spell = put(s, 'P1', id('Snuff Out'), 'hand');
    expect(rejected(s, castSpell(spell, { targets: [card(coeurl)], alternative: true }))).toMatch(/condition/);
    put(s, 'P1', 'swamp');
    expect(rejected(s, castSpell(spell, { targets: [card(rat)], alternative: true }))).toMatch(/not legal/);
    const r = cast(s, castSpell(spell, { targets: [card(coeurl)], alternative: true }));
    expect(zone(r.state, coeurl)).toBe('graveyard');
    expect(r.state.players.P1!.life).toBe(16);
  });

  it('Swords to Plowshares exiles a creature and its controller gains life equal to its power', () => {
    const s = newGame();
    const barret = put(s, 'P2', 'barret-wallace');
    const spell = put(s, 'P1', id('Swords to Plowshares'), 'hand');
    mana(s, 'P1', { W: 1 });
    const r = cast(s, castSpell(spell, { targets: [card(barret)] }));
    expect(zone(r.state, barret)).toBe('exile');
    expect(r.state.players.P2!.life).toBe(24);
    expect(r.state.players.P1!.life).toBe(20);
  });

  it('Path to Exile exiles a creature and its controller puts a basic land onto the battlefield tapped', () => {
    const s = newGame();
    const rat = put(s, 'P2', 'undercity-dire-rat');
    const lands = s.players.P2!.battlefield.length;
    const spell = put(s, 'P1', id('Path to Exile'), 'hand');
    mana(s, 'P1', { W: 1 });
    const r = cast(s, castSpell(spell, { targets: [card(rat)] }));
    expect(zone(r.state, rat)).toBe('exile');
    const p2 = r.state.players.P2!;
    expect(p2.battlefield).toHaveLength(lands); // the rat left, an Island arrived
    const island = p2.battlefield.find((c) => r.state.cards[c]!.defId === 'island')!;
    expect(r.state.cards[island]!.tapped).toBe(true);
    expect(r.state.players.P1!.battlefield).toHaveLength(0);
  });

  it('Destroy Evil: a creature with toughness 4 or greater, or an enchantment', () => {
    const s = newGame();
    const graha = put(s, 'P2', 'graha-tia');
    const coeurl = put(s, 'P2', 'coeurl');
    const bastion = put(s, 'P2', 'bastion-of-remembrance');
    const spell = put(s, 'P1', id('Destroy Evil'), 'hand');
    mana(s, 'P1', { W: 1, C: 1 });
    expect(rejected(s, castSpell(spell, { targets: [card(coeurl)], mode: 0 }))).toMatch(/not legal/);
    expect(zone(cast(s, castSpell(spell, { targets: [card(graha)], mode: 0 })).state, graha)).toBe('graveyard');
    expect(zone(cast(s, castSpell(spell, { targets: [card(bastion)], mode: 1 })).state, bastion)).toBe('graveyard');
  });

  it('Legions to Ashes exiles a nonland permanent and that player’s tokens with the same name', () => {
    const s = newGame();
    const heroes = [0, 1, 2].map(() => put(s, 'P2', 'hero-token', 'battlefield', { isToken: true }));
    const mine = put(s, 'P1', 'hero-token', 'battlefield', { isToken: true });
    const spell = put(s, 'P1', id('Legions to Ashes'), 'hand');
    mana(s, 'P1', { W: 1, B: 1, C: 1 });
    const r = cast(s, castSpell(spell, { targets: [card(heroes[0]!)] }));
    for (const h of heroes) expect(r.state.cards[h]?.zone ?? 'gone').not.toBe('battlefield');
    expect(zone(r.state, mine)).toBe('battlefield');
  });

  it('Chaos Warp shuffles a permanent into its owner’s library and puts a revealed permanent card onto the battlefield', () => {
    const s = newGame();
    const barret = put(s, 'P2', 'barret-wallace');
    const spell = put(s, 'P1', id('Chaos Warp'), 'hand');
    mana(s, 'P1', { R: 1, C: 2 });
    const r = cast(s, castSpell(spell, { targets: [card(barret)] }));
    const revealed = r.events.find((e) => e.type === 'CardRevealed');
    expect(revealed).toMatchObject({ type: 'CardRevealed', player: 'P2' });
    // P2's library is all Islands plus Barret, so whatever is revealed is a permanent card and enters.
    const revealedId = revealed && revealed.type === 'CardRevealed' ? revealed.card : '';
    expect(zone(r.state, revealedId)).toBe('battlefield');
    if (revealedId !== barret) expect(zone(r.state, barret)).toBe('library');
  });
});

describe('board wipes', () => {
  function board(s: GameState) {
    return {
      rat: put(s, 'P2', 'undercity-dire-rat'),
      barret: put(s, 'P1', 'barret-wallace'),
      ring: put(s, 'P2', 'sol-ring'),
      bastion: put(s, 'P2', 'bastion-of-remembrance'),
      swamp: put(s, 'P2', 'swamp'),
      dragon: put(s, 'P2', 'hellkite-tyrant'),
    };
  }

  it('Final Judgment exiles all creatures', () => {
    const s = newGame(3);
    const b = board(s);
    const third = put(s, 'P3', 'coeurl');
    const spell = put(s, 'P1', id('Final Judgment'), 'hand');
    mana(s, 'P1', { W: 2, C: 4 });
    const r = cast(s, castSpell(spell));
    for (const c of [b.rat, b.barret, b.dragon, third]) expect(zone(r.state, c)).toBe('exile');
    for (const c of [b.ring, b.bastion, b.swamp]) expect(zone(r.state, c)).toBe('battlefield');
  });

  it('Ruinous Ultimatum destroys only nonland permanents your opponents control', () => {
    const s = newGame(3);
    const b = board(s);
    const third = put(s, 'P3', 'sol-ring');
    const spell = put(s, 'P1', id('Ruinous Ultimatum'), 'hand');
    mana(s, 'P1', { R: 2, W: 3, B: 2 });
    const r = cast(s, castSpell(spell));
    for (const c of [b.rat, b.ring, b.bastion, b.dragon, third]) expect(zone(r.state, c)).toBe('graveyard');
    expect(zone(r.state, b.barret)).toBe('battlefield');
    expect(zone(r.state, b.swamp)).toBe('battlefield');
  });

  it('Cleansing Nova: all creatures, or all artifacts and enchantments', () => {
    const s = newGame();
    const b = board(s);
    const spell = put(s, 'P1', id('Cleansing Nova'), 'hand');
    mana(s, 'P1', { W: 2, C: 3 });
    const creatures = cast(s, castSpell(spell, { mode: 0 })).state;
    expect([b.rat, b.barret, b.dragon].map((c) => zone(creatures, c))).toEqual(['graveyard', 'graveyard', 'graveyard']);
    expect(zone(creatures, b.ring)).toBe('battlefield');
    const things = cast(s, castSpell(spell, { mode: 1 })).state;
    expect([b.ring, b.bastion].map((c) => zone(things, c))).toEqual(['graveyard', 'graveyard']);
    expect(zone(things, b.rat)).toBe('battlefield');
  });

  it('Crux of Fate: all Dragons, or all non-Dragon creatures', () => {
    const s = newGame();
    const b = board(s);
    const spell = put(s, 'P1', id('Crux of Fate'), 'hand');
    mana(s, 'P1', { B: 2, C: 3 });
    const dragons = cast(s, castSpell(spell, { mode: 0 })).state;
    expect(zone(dragons, b.dragon)).toBe('graveyard');
    expect(zone(dragons, b.rat)).toBe('battlefield');
    const others = cast(s, castSpell(spell, { mode: 1 })).state;
    expect(zone(others, b.dragon)).toBe('battlefield');
    expect([b.rat, b.barret].map((c) => zone(others, c))).toEqual(['graveyard', 'graveyard']);
  });

  it('Damning Verdict destroys creatures with no counters on them', () => {
    const s = newGame();
    const b = board(s);
    const countered = put(s, 'P2', 'coeurl', 'battlefield', { counters: 1 });
    const spell = put(s, 'P1', id('Damning Verdict'), 'hand');
    mana(s, 'P1', { W: 2, C: 3 });
    const r = cast(s, castSpell(spell)).state;
    expect(zone(r, b.rat)).toBe('graveyard');
    expect(zone(r, countered)).toBe('battlefield');
  });

  it('Austere Command: choose exactly two modes, applied in printed order', () => {
    const s = newGame();
    const b = board(s);
    const small = b.rat; // mana value 2
    const big = b.barret; // mana value 4
    const spell = put(s, 'P1', id('Austere Command'), 'hand');
    mana(s, 'P1', { W: 2, C: 4 });
    expect(rejected(s, castSpell(spell, { modes: [0] }))).toMatch(/Choose 2 modes/);
    expect(rejected(s, castSpell(spell, { modes: [1, 1] }))).toMatch(/different modes/);
    const r = cast(s, castSpell(spell, { modes: [2, 0] })).state; // creatures with mana value 3 or less, and artifacts
    expect(zone(r, small)).toBe('graveyard');
    expect(zone(r, b.ring)).toBe('graveyard');
    expect(zone(r, big)).toBe('battlefield');
    expect(zone(r, b.bastion)).toBe('battlefield');
    // The legal-action list offers every pair.
    const pairs = spellOptions(s, 'P1').filter((o) => o.action.card === spell);
    expect(pairs).toHaveLength(6);
  });

  it('Farewell: choose one or more, including exiling all graveyards', () => {
    const s = newGame(3);
    const b = board(s);
    const dead = put(s, 'P2', 'coeurl', 'graveyard');
    const mine = put(s, 'P1', 'coeurl', 'graveyard');
    const spell = put(s, 'P1', id('Farewell'), 'hand');
    mana(s, 'P1', { W: 2, C: 4 });
    expect(spellOptions(s, 'P1').filter((o) => o.action.card === spell)).toHaveLength(15);
    const r = cast(s, castSpell(spell, { modes: [1, 3] })).state; // creatures and graveyards
    for (const c of [b.rat, b.barret, dead, mine]) expect(zone(r, c)).toBe('exile');
    expect(zone(r, b.ring)).toBe('battlefield');
    // Farewell itself goes to the graveyard after resolving.
    expect(zone(r, spell)).toBe('graveyard');
  });

  it('Vanquish the Horde costs {1} less for each creature on the battlefield', () => {
    const s = newGame();
    for (let i = 0; i < 6; i++) put(s, i % 2 ? 'P1' : 'P2', 'coeurl');
    const spell = put(s, 'P1', id('Vanquish the Horde'), 'hand');
    mana(s, 'P1', { W: 2 }); // {6}{W}{W} minus 6
    const r = cast(s, castSpell(spell)).state;
    expect(r.players.P1!.battlefield.concat(r.players.P2!.battlefield).filter((c) => r.cards[c]!.zone === 'battlefield')).toHaveLength(0);
  });

  it('Crackling Doom deals 2 to each opponent and each sacrifices its greatest-power creature', () => {
    const s = newGame(3);
    const small = put(s, 'P2', 'coeurl');
    const big = put(s, 'P2', 'barret-wallace');
    const indestructibleDoesntMatter = put(s, 'P3', 'graha-tia');
    const mine = put(s, 'P1', 'barret-wallace');
    const spell = put(s, 'P1', id('Crackling Doom'), 'hand');
    mana(s, 'P1', { R: 1, W: 1, B: 1 });
    const r = cast(s, castSpell(spell)).state;
    expect([r.players.P2!.life, r.players.P3!.life, r.players.P1!.life]).toEqual([18, 18, 20]);
    expect(zone(r, big)).toBe('graveyard');
    expect(zone(r, small)).toBe('battlefield');
    expect(zone(r, indestructibleDoesntMatter)).toBe('graveyard');
    expect(zone(r, mine)).toBe('battlefield');
  });

  it('Vandalblast destroys an artifact you don’t control, or with overload every one', () => {
    const s = newGame(3);
    const theirs = put(s, 'P2', 'sol-ring');
    const others = put(s, 'P3', 'arcane-signet');
    const mine = put(s, 'P1', 'sol-ring');
    const spell = put(s, 'P1', id('Vandalblast'), 'hand');
    mana(s, 'P1', { R: 1 });
    expect(rejected(s, castSpell(spell, { targets: [card(mine)] }))).toMatch(/not legal/);
    expect(zone(cast(s, castSpell(spell, { targets: [card(theirs)] })).state, theirs)).toBe('graveyard');
    expect(rejected(s, castSpell(spell, { alternative: true }))).toMatch(/mana/);
    mana(s, 'P1', { C: 4 });
    const r = cast(s, castSpell(spell, { alternative: true })).state;
    expect([theirs, others].map((c) => zone(r, c))).toEqual(['graveyard', 'graveyard']);
    expect(zone(r, mine)).toBe('battlefield');
  });
});

describe('creatures with removal abilities', () => {
  it('Sun Titan may return a permanent card with mana value 3 or less from your graveyard when it enters', () => {
    let s = newGame();
    const small = put(s, 'P1', 'coeurl', 'graveyard');
    put(s, 'P1', 'barret-wallace', 'graveyard'); // mana value 4: not a legal target
    put(s, 'P1', id('Swords to Plowshares'), 'graveyard'); // not a permanent card
    const titan = put(s, 'P1', id('Sun Titan'), 'hand');
    mana(s, 'P1', { W: 2, C: 4 });
    s = cast(s, castSpell(titan), {
      targets: (options) => {
        expect(options).toEqual([[card(small)]]);
        return [card(small)];
      },
    }).state;
    expect(zone(s, small)).toBe('battlefield');
  });

  it('Bane of Progress destroys all artifacts and enchantments and gets a counter for each', () => {
    const s = newGame(3);
    put(s, 'P2', 'sol-ring');
    put(s, 'P3', 'bastion-of-remembrance');
    put(s, 'P1', 'arcane-signet');
    const bane = put(s, 'P1', id('Bane of Progress'), 'hand');
    mana(s, 'P1', { G: 2, C: 4 });
    const r = cast(s, castSpell(bane)).state;
    expect(r.cards[bane]!.counters).toBe(3);
    const left = Object.values(r.cards).filter((c) => c.zone === 'battlefield' && ['sol-ring', 'arcane-signet', 'bastion-of-remembrance'].includes(c.defId));
    expect(left).toHaveLength(0);
  });
});

describe('the AI and the board can use them', () => {
  it('the AI casts a board wipe when it is behind, not when it is ahead', () => {
    const ai = basicAi();
    const behind = newGame();
    for (let i = 0; i < 3; i++) put(behind, 'P2', 'barret-wallace');
    const judgment = put(behind, 'P1', id('Final Judgment'), 'hand');
    mana(behind, 'P1', { W: 2, C: 4 });
    expect(ai(behind, getLegalActions(behind))).toMatchObject({ type: 'CastSpell', card: judgment });

    const ahead = newGame();
    for (let i = 0; i < 3; i++) put(ahead, 'P1', 'barret-wallace');
    put(ahead, 'P2', 'coeurl');
    const judgment2 = put(ahead, 'P1', id('Final Judgment'), 'hand');
    mana(ahead, 'P1', { W: 2, C: 4 });
    expect(ai(ahead, getLegalActions(ahead))).not.toMatchObject({ type: 'CastSpell', card: judgment2 });
  });

  it('lists mode combinations and alternative costs as separate legal casts', () => {
    const s = newGame();
    put(s, 'P1', 'swamp');
    put(s, 'P2', 'coeurl');
    const snuff = put(s, 'P1', id('Snuff Out'), 'hand');
    mana(s, 'P1', { B: 1, C: 3 });
    const casts = getLegalActions(s).filter((a): a is Extract<Action, { type: 'CastSpell' }> => a.type === 'CastSpell' && a.card === snuff);
    expect(casts.map((a) => a.alternative ?? false).sort()).toEqual([false, true]);
    expect(player('P1')).toEqual({ kind: 'player', player: 'P1' });
    expect(act(s, casts.find((a) => a.alternative)!)).toBeTruthy();
  });
});
