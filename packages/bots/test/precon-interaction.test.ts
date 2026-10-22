// Counterspells (targeting a spell on the stack) and attack taxes (Propaganda,
// Summon: Yojimbo). Checked against the Oracle text with the real card data.

import { describe, expect, it } from 'vitest';
import { attackTaxFor, getLegalActions, type Action, type GameState } from '@nexus/engine';
import { basicAi } from '../src/index.ts';
import { act, card, goTo, mana, newGame, put, rejected, settle } from './kit-helpers.ts';

const RAT = 'undercity-dire-rat';
const treasures = (s: GameState, pid: string) => s.players[pid]!.battlefield.filter((id) => s.cards[id]!.defId === 'treasure-token');

describe("An Offer You Can't Refuse", () => {
  it('counters a noncreature spell; its controller creates two Treasures', () => {
    let s = newGame();
    for (let i = 0; i < 3; i++) put(s, 'P1', 'island', 'library');
    const harmonize = put(s, 'P1', 'harmonize', 'hand');
    const offer = put(s, 'P2', 'an-offer-you-cant-refuse', 'hand');
    mana(s, 'P1', { G: 2, C: 2 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: harmonize, targets: [] });
    s = act(s, { type: 'PassPriority', player: 'P1' });
    mana(s, 'P2', { U: 1 });
    s = act(s, { type: 'CastSpell', player: 'P2', card: offer, targets: [card(harmonize)] });
    s = settle(s).state;
    expect([s.cards[harmonize]!.zone, s.players.P1!.hand.length, treasures(s, 'P1').length]).toEqual(['graveyard', 0, 2]);
  });

  it("can't target a creature spell, or itself", () => {
    let s = newGame();
    const rat = put(s, 'P1', RAT, 'hand');
    const offer = put(s, 'P2', 'an-offer-you-cant-refuse', 'hand');
    mana(s, 'P1', { B: 1, C: 1 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: rat, targets: [] });
    s = act(s, { type: 'PassPriority', player: 'P1' });
    mana(s, 'P2', { U: 1 });
    expect(getLegalActions(s).some((a) => a.type === 'CastSpell' && a.card === offer)).toBe(false);
    expect(rejected(s, { type: 'CastSpell', player: 'P2', card: offer, targets: [card(rat)] })).toMatch(/not legal/);
  });

  it("the AI counters an opponent's noncreature spell when it can", () => {
    let s = newGame();
    for (let i = 0; i < 3; i++) put(s, 'P1', 'island', 'library');
    const harmonize = put(s, 'P1', 'harmonize', 'hand');
    const offer = put(s, 'P2', 'an-offer-you-cant-refuse', 'hand');
    put(s, 'P2', 'island');
    mana(s, 'P1', { G: 2, C: 2 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: harmonize, targets: [] });
    s = act(s, { type: 'PassPriority', player: 'P1' });
    const bot = basicAi(1);
    for (let i = 0; i < 4 && s.cards[offer]!.zone === 'hand'; i++) s = act(s, bot(s, getLegalActions(s)));
    expect(s.cards[offer]!.zone).toBe('stack');
  });
});

describe('Attack taxes', () => {
  it('Propaganda: attacking its controller costs {2} per creature, paid as attackers are declared', () => {
    let s = newGame();
    put(s, 'P2', 'propaganda');
    const rat = put(s, 'P1', RAT);
    const lands = [put(s, 'P1', 'island'), put(s, 'P1', 'island')];
    s = goTo(s, 'declareAttackers', { accept: false });
    expect(attackTaxFor(s, 'P2')).toBe(2);
    const attack: Action = { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: rat, defender: 'P2' }] };
    expect(rejected(s, attack)).toMatch(/costs \{2\}/);
    // Lands can be tapped while declaring; then the attack is legal.
    for (const land of lands) s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: land, mana: 'U' });
    expect(getLegalActions(s).some((a) => a.type === 'DeclareAttackers' && a.attacks.length === 1)).toBe(true);
    s = act(s, attack);
    expect([s.combat?.attacks.length, s.players.P1!.manaPool.U]).toEqual([1, 0]);
  });

  it('the AI leaves out attacks into a taxed player when it has no mana to pay', () => {
    let s = newGame(3);
    put(s, 'P2', 'propaganda');
    for (let i = 0; i < 3; i++) put(s, 'P1', 'ruin-grinder');
    s = goTo(s, 'declareAttackers', { accept: false });
    const bot = basicAi(1);
    for (let i = 0; i < 6 && s.pending.kind === 'declareAttackers'; i++) s = act(s, bot(s, getLegalActions(s)));
    // With no mana, nothing attacks P2.
    expect(s.combat?.attacks.every((a) => a.defender !== 'P2') ?? true).toBe(true);
  });

  it('Summon: Yojimbo: I exiles an artifact, enchantment or tapped creature; II and III tax attacks until your next turn', () => {
    let s = newGame();
    const untapped = put(s, 'P2', RAT);
    const tapped = put(s, 'P2', RAT, 'battlefield', { tapped: true });
    const yojimbo = put(s, 'P1', 'summon-yojimbo', 'hand');
    mana(s, 'P1', { W: 1, C: 3 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: yojimbo, targets: [] });
    s = settle(s).state;
    expect([s.cards[tapped]!.zone, s.cards[untapped]!.zone]).toEqual(['exile', 'battlefield']);
    s = goTo(s, 'end');
    s = goTo(s, 'main1'); // P2's turn
    s = goTo(s, 'end');
    s = goTo(s, 'main1'); // P1's turn: chapter II
    expect(attackTaxFor(s, 'P1')).toBe(2);
    s = goTo(s, 'end');
    s = goTo(s, 'main1'); // P2's turn: still taxed
    expect(attackTaxFor(s, 'P1')).toBe(2);
    s = goTo(s, 'end');
    s = goTo(s, 'upkeep'); // P1's next turn begins: the chapter II tax is over
    expect(attackTaxFor(s, 'P1')).toBe(0);
  });
});
