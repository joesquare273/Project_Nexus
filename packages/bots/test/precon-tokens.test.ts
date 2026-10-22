// Step 4 of the precon card work: cards that make new tokens (Clue, Spirit,
// Squid, Bird, Wizard, Soldier, Human Soldier), plus the triggers they need:
// "whenever you draw a card", "whenever you sacrifice a Clue" and "if you put
// a counter on a creature this turn". Checked against the Oracle text with
// the real card data.

import { describe, expect, it } from 'vitest';
import { characteristics, type GameState, type Target } from '@nexus/engine';
import { act, card, cast, goTo, mana, newGame, nextStep, put, rejected, settle } from './kit-helpers.ts';

const RAT = 'undercity-dire-rat';
const tokensOf = (s: GameState, pid: string, defId: string) =>
  s.players[pid]!.battlefield.filter((id) => s.cards[id]!.defId === defId);
const pick = (want: Target[]) => (options: Target[][]) => {
  const found = options.find((o) => JSON.stringify(o) === JSON.stringify(want));
  if (!found) throw new Error(`No such target choice: ${JSON.stringify(want)}`);
  return found;
};
/** P1 kills one of their own creatures with Sephiroth's Intervention (destroy, gain 2 life). */
function kill(s: GameState, victim: string): GameState {
  const spell = put(s, 'P1', 'sephiroths-intervention', 'hand');
  mana(s, 'P1', { B: 1, C: 3 });
  return cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(victim)] }).state;
}

describe('Death triggers that make tokens or drain', () => {
  it('Pitiless Plunderer: another creature you control dies, create a Treasure', () => {
    let s = newGame();
    put(s, 'P1', 'pitiless-plunderer');
    s = kill(s, put(s, 'P1', 'zack-fair')); // no death trigger of its own
    expect(tokensOf(s, 'P1', 'treasure-token')).toHaveLength(1);
  });

  it('Bastion of Remembrance: a Human Soldier when it enters; each creature of yours dying drains 1', () => {
    let s = newGame(3);
    const bastion = put(s, 'P1', 'bastion-of-remembrance', 'hand');
    mana(s, 'P1', { B: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: bastion, targets: [] }).state;
    const [soldier] = tokensOf(s, 'P1', 'human-soldier-token');
    expect(soldier).toBeDefined();
    s = kill(s, soldier!);
    expect([s.players.P2!.life, s.players.P3!.life, s.players.P1!.life]).toEqual([19, 19, 20 + 2 + 1]);
  });

  it('Chasm Skulker: a +1/+1 counter for each card you draw; dies into that many Squids with islandwalk', () => {
    let s = newGame();
    const skulker = put(s, 'P1', 'chasm-skulker');
    put(s, 'P1', 'island', 'library');
    put(s, 'P1', 'island', 'library');
    const tataru = put(s, 'P1', 'tataru-taru', 'hand');
    put(s, 'P2', 'island', 'library');
    mana(s, 'P1', { W: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: tataru, targets: [] }).state; // you draw a card
    expect(s.cards[skulker]!.counters).toBe(1);
    s.cards[skulker]!.counters = 2;
    s = kill(s, skulker);
    const squids = tokensOf(s, 'P1', 'squid-token');
    expect(squids).toHaveLength(2);
    expect(characteristics(s, s.cards[squids[0]!]!).keywords.has('Islandwalk')).toBe(true);
  });

  it('Islandwalk: a Squid can’t be blocked while the defending player controls an Island', () => {
    let s = newGame();
    const squid = put(s, 'P1', 'squid-token', 'battlefield', { isToken: true });
    const blocker = put(s, 'P2', RAT);
    put(s, 'P2', 'island');
    s = goTo(s, 'declareAttackers', { accept: false });
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: squid, defender: 'P2' }] })).state;
    s = nextStep(s);
    expect(s.pending.kind).toBe('declareBlockers');
    expect(rejected(s, { type: 'DeclareBlockers', player: 'P2', blocks: [{ blocker, attacker: squid }] })).toBeTruthy();
  });
});

describe('Spells that make tokens', () => {
  it('Lingering Souls: two 1/1 flying Spirits, and two more with flashback', () => {
    let s = newGame();
    const souls = put(s, 'P1', 'lingering-souls', 'hand');
    mana(s, 'P1', { W: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: souls, targets: [] }).state;
    expect(tokensOf(s, 'P1', 'spirit-token')).toHaveLength(2);
    mana(s, 'P1', { B: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: souls, targets: [] }).state;
    expect(tokensOf(s, 'P1', 'spirit-token')).toHaveLength(4);
    expect(s.cards[souls]!.zone).toBe('exile');
  });

  it('Circle of Power: draw two, lose 2, a Wizard token; Wizards get +1/+0 and lifelink', () => {
    let s = newGame();
    for (let i = 0; i < 2; i++) put(s, 'P1', 'island', 'library');
    const circle = put(s, 'P1', 'circle-of-power', 'hand');
    mana(s, 'P1', { B: 1, C: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: circle, targets: [] }).state;
    expect([s.players.P1!.hand.length, s.players.P1!.life]).toEqual([2, 18]);
    const [wizard] = tokensOf(s, 'P1', 'wizard-token');
    const now = characteristics(s, s.cards[wizard!]!);
    expect([now.power, now.toughness, now.keywords.has('Lifelink')]).toEqual([1, 1, true]);
  });

  it('The Wizard token pings each opponent whenever you cast a noncreature spell', () => {
    let s = newGame(3);
    put(s, 'P1', 'wizard-token', 'battlefield', { isToken: true });
    const spell = put(s, 'P1', 'protection-magic', 'hand');
    mana(s, 'P1', { W: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [{ kind: 'none' }, { kind: 'none' }, { kind: 'none' }] }).state;
    expect([s.players.P2!.life, s.players.P3!.life]).toEqual([19, 19]);
  });
});

describe('Creatures that make tokens', () => {
  it('Hermes: a 1/1 flying, vigilant Bird for each noncreature spell; attacking with Birds scries 2', () => {
    let s = newGame();
    put(s, 'P1', 'hermes-overseer-of-elpis');
    const spell = put(s, 'P1', 'protection-magic', 'hand');
    mana(s, 'P1', { W: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [{ kind: 'none' }, { kind: 'none' }, { kind: 'none' }] }).state;
    const birds = tokensOf(s, 'P1', 'bird-token');
    expect(birds).toHaveLength(1);
    s.cards[birds[0]!]!.summoningSick = false;
    for (let i = 0; i < 2; i++) put(s, 'P1', 'island', 'library');
    s = goTo(s, 'declareAttackers', { accept: false });
    const events = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: birds[0]!, defender: 'P2' }] })).events;
    expect(events.filter((e) => e.type === 'Surveiled' && e.scry)).toHaveLength(2); // scry 2
  });

  it('Tireless Tracker: landfall makes a Clue; sacrificing a Clue grows it', () => {
    let s = newGame();
    const tracker = put(s, 'P1', 'tireless-tracker');
    const forest = put(s, 'P1', 'forest', 'hand');
    put(s, 'P1', 'island', 'library');
    s = settle(act(s, { type: 'PlayLand', player: 'P1', card: forest })).state;
    const [clue] = tokensOf(s, 'P1', 'clue-token');
    expect(clue).toBeDefined();
    mana(s, 'P1', { C: 2 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: clue!, ability: 0, targets: [] }).state;
    expect([s.players.P1!.hand.length, s.cards[tracker]!.counters]).toEqual([1, 1]);
  });

  it('Lord Jyscal Guado: investigates at each end step if you put a counter on a creature this turn', () => {
    let s = newGame();
    put(s, 'P1', 'lord-jyscal-guado');
    let quiet = goTo(s, 'end');
    quiet = settle(quiet).state;
    expect(tokensOf(quiet, 'P1', 'clue-token')).toHaveLength(0);

    put(s, 'P1', 'tireless-tracker');
    const clue = put(s, 'P1', 'clue-token', 'battlefield', { isToken: true });
    mana(s, 'P1', { C: 2 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: clue, ability: 0, targets: [] }).state;
    s = goTo(s, 'end');
    s = settle(s).state;
    expect(tokensOf(s, 'P1', 'clue-token')).toHaveLength(1);
  });

  it('Heidegger: +X/+0 for the Soldiers you control; Soldiers for each opponent with more creatures', () => {
    let s = newGame(3);
    const heidegger = put(s, 'P1', 'heidegger-shinra-executive');
    put(s, 'P1', 'soldier-token', 'battlefield', { isToken: true });
    put(s, 'P2', RAT);
    put(s, 'P2', RAT);
    put(s, 'P2', RAT);
    s = goTo(s, 'beginCombat', { targets: pick([card(heidegger)]) });
    s = settle(s, { targets: pick([card(heidegger)]) }).state;
    expect(characteristics(s, s.cards[heidegger]!).power).toBe(3 + 2);
    s = goTo(s, 'end', { targets: pick([card(heidegger)]) });
    s = settle(s).state;
    expect(tokensOf(s, 'P1', 'soldier-token')).toHaveLength(2); // only P2 has more creatures
  });

  it('Tataru Taru: you and an opponent draw; an opponent drawing on your turn makes a tapped Treasure, once a turn', () => {
    let s = newGame();
    put(s, 'P1', 'island', 'library');
    put(s, 'P2', 'island', 'library');
    const tataru = put(s, 'P1', 'tataru-taru', 'hand');
    mana(s, 'P1', { W: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: tataru, targets: [] }).state;
    expect([s.players.P1!.hand.length, s.players.P2!.hand.length]).toEqual([1, 1]);
    const treasures = tokensOf(s, 'P1', 'treasure-token');
    expect(treasures).toHaveLength(1);
    expect(s.cards[treasures[0]!]!.tapped).toBe(true);
    // P2's own draw step doesn't count.
    s = goTo(s, 'end');
    s = goTo(s, 'main1');
    expect(s.activePlayer).toBe('P2');
    expect(tokensOf(s, 'P1', 'treasure-token')).toHaveLength(1);
  });
});
