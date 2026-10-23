import { describe, expect, it } from 'vitest';
import { getLegalActions, playableZone, visibleLibraryTop, viewFor, type GameState } from '@nexus/engine';
import { moveCard, phaseOut } from '../../engine/src/state.ts';
import { basicAi, playableCards } from '../src/index.ts';
import { planTaps, tapActions } from '../src/mana.ts';
import { checkInvariants } from '../src/invariants.ts';
import { act, card, cast, goTo, mana, newGame, put, rejected, settle } from './kit-helpers.ts';
const MATERIA = 'summoning-materia';
function setup(players: number, attached = true) {
  const s = newGame(players);
  const host = put(s, 'P1', 'soldier-token');
  const materia = put(s, 'P1', MATERIA, 'battlefield', attached ? { attachedTo: host } : {});
  return { s, host, materia };
}
describe.each([2,3,4])('Summoning Materia with %i players', players => {
  it('casts for {2}{G}, equips for {2}, and grants +2/+2 and vigilance', () => {
    let s = newGame(players);
    const materia = put(s, 'P1', MATERIA, 'hand'), host = put(s, 'P1', 'soldier-token');
    mana(s, 'P1', { G: 1, C: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: materia }).state;
    expect(s.cards[materia]!.attachedTo).toBeUndefined();
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: materia, ability: 0, targets: [card(host)] }).state;
    expect(s.cards[materia]!.attachedTo).toBe(host);
    expect(viewFor(s, 'P1').stats[host]).toMatchObject({ power: 3, toughness: 3, keywords: expect.arrayContaining(['Vigilance']) });
    s = goTo(s, 'declareAttackers');
    s = act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: host, defender: 'P2' }] });
    expect(s.cards[host]!.tapped).toBe(false);
    expect(checkInvariants(s)).toEqual([]);
  });
  it('privately shows only the current top card, even unattached and without priority', () => {
    const { s } = setup(players, false);
    const top = put(s, 'P1', 'sol-ring', 'library');
    s.pending = { kind: 'priority', player: 'P2', passes: 0 };
    const mine = viewFor(s, 'P1');
    expect(mine.players.P1!.libraryTop).toBe(top);
    expect(mine.cards[top]!.defId).toBe('sol-ring');
    expect(mine.cards[s.players.P1!.library[1]!]).toBeUndefined();
    for (const viewer of ['P2', 'spectator']) {
      const other = viewFor(s, viewer);
      expect(other.cards[top]).toBeUndefined();
      expect(other.players.P1!.libraryTop).toBeUndefined();
    }
    expect(playableZone(s, 'P1', s.cards[top]!)).toBeNull();
    expect(s.players.P1!.hand).toHaveLength(0);
  });
  it('casts a creature from the top at normal cost and reveals the next top only in its own view', () => {
    let { s } = setup(players);
    const top = put(s, 'P1', 'bugenhagen-wise-elder', 'library');
    const next = s.players.P1!.library[1]!;
    expect(playableZone(s, 'P1', s.cards[top]!)).toBe('library');
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: top })).toMatch(/mana/);
    mana(s, 'P1', { G: 1, C: 1 });
    const before = structuredClone(s);
    s = act(s, { type: 'CastSpell', player: 'P1', card: top });
    expect(before.cards[top]!.zone).toBe('library');
    expect(s.stack[0]).toMatchObject({ kind: 'spell', card: top, castFrom: 'library' });
    expect(s.players.P1!.hand).toHaveLength(0);
    expect(visibleLibraryTop(s, 'P1')).toBe(next);
    expect(viewFor(s, 'P2').cards[next]).toBeUndefined();
    s = settle(s).state;
    expect(s.cards[top]!.zone).toBe('battlefield');
    expect(checkInvariants(s)).toEqual([]);
  });
  it('rejects lower library cards, opponents\' cards, noncreatures and playing a land from the top', () => {
    const { s } = setup(players);
    const lower = put(s, 'P1', 'bugenhagen-wise-elder', 'library');
    const top = put(s, 'P1', 'island', 'library');
    const enemy = put(s, 'P2', 'bugenhagen-wise-elder', 'library');
    mana(s, 'P1', { G: 20, C: 20 });
    for (const id of [lower, top, enemy]) expect(rejected(s, { type: 'CastSpell', player: 'P1', card: id })).toBeTruthy();
    expect(rejected(s, { type: 'PlayLand', player: 'P1', card: top })).toBeTruthy();
    expect(viewFor(s, 'P1').cards[top]).toBeDefined();
  });
  it('keeps ordinary timing rules and permits a flash creature on an opponent\'s turn', () => {
    let { s } = setup(players);
    const top = put(s, 'P1', 'bugenhagen-wise-elder', 'library');
    s.activePlayer = 'P2';
    mana(s, 'P1', { G: 2, U: 2, C: 10 });
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: top })).toMatch(/main phase/);
    const flash = put(s, 'P1', 'torrential-gearhulk', 'library');
    s = cast(s, { type: 'CastSpell', player: 'P1', card: flash }).state;
    expect(s.cards[flash]!.zone).toBe('battlefield');
    expect(checkInvariants(s)).toEqual([]);
  });
  it('requires attachment for casting and loses all permissions when the source leaves', () => {
    const { s, materia } = setup(players, false);
    const top = put(s, 'P1', 'bugenhagen-wise-elder', 'library');
    mana(s, 'P1', { G: 2, C: 10 });
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: top })).toBeTruthy();
    expect(viewFor(s, 'P1').cards[top]).toBeDefined();
    moveCard({ s, ev: [] }, materia, 'graveyard');
    expect(viewFor(s, 'P1').cards[top]).toBeUndefined();
    expect(playableZone(s, 'P1', s.cards[top]!)).toBeNull();
  });
  it('gives the equipped creature a separate one-green mana ability that does not use the stack', () => {
    const { s, host, materia } = setup(players);
    const a = getLegalActions(s).find(a => a.type === 'ActivateManaAbility' && a.card === host)!;
    expect(a).toMatchObject({ mana: 'G', grantedBy: materia });
    const r = act(s, a);
    expect(r.players.P1!.manaPool.G).toBe(1);
    expect(r.cards[host]!.tapped).toBe(true);
    expect(r.cards[materia]!.tapped).toBe(false);
    expect(r.stack).toHaveLength(0);
    expect(rejected(s, { type: 'ActivateManaAbility', player: 'P1', card: host, mana: 'U', grantedBy: materia })).toBeTruthy();
    expect(checkInvariants(r)).toEqual([]);
  });
  it('enforces summoning sickness and removes the granted ability when detached', () => {
    const { s, host, materia } = setup(players);
    s.cards[host]!.summoningSick = true;
    expect(rejected(s, { type: 'ActivateManaAbility', player: 'P1', card: host, mana: 'G', grantedBy: materia })).toBeTruthy();
    expect(planTaps(s, 'P1', '{G}')).toBeNull();
    const boots = put(s, 'P1', 'lightning-greaves', 'battlefield', { attachedTo: host });
    expect(act(s, { type: 'ActivateManaAbility', player: 'P1', card: host, mana: 'G', grantedBy: materia }).players.P1!.manaPool.G).toBe(1);
    moveCard({ s, ev: [] }, boots, 'graveyard');
    s.cards[host]!.summoningSick = false;
    delete s.cards[materia]!.attachedTo;
    expect(rejected(s, { type: 'ActivateManaAbility', player: 'P1', card: host, mana: 'G', grantedBy: materia })).toBeTruthy();
  });
  it('assigns casting permission to the Equipment controller and mana to the creature controller', () => {
    const { s, host, materia } = setup(players);
    s.cards[host]!.controller = 'P2';
    const top = put(s, 'P1', 'bugenhagen-wise-elder', 'library');
    expect(playableZone(s, 'P1', s.cards[top]!)).toBe('library');
    s.pending = { kind: 'priority', player: 'P2', passes: 0 };
    const r = act(s, { type: 'ActivateManaAbility', player: 'P2', card: host, mana: 'G', grantedBy: materia });
    expect(r.players.P2!.manaPool.G).toBe(1);
    expect(r.players.P1!.manaPool.G).toBe(0);
    expect(checkInvariants(r)).toEqual([]);
  });
  it('distinguishes the granted mana ability from a creature\'s three-mana or delayed-counter ability', () => {
    const s = newGame(players);
    const druid = put(s, 'P1', 'incubation-druid', 'battlefield', { counters: 1 });
    const materia = put(s, 'P1', MATERIA, 'battlefield', { attachedTo: druid });
    put(s, 'P1', 'forest');
    expect(act(s, { type: 'ActivateManaAbility', player: 'P1', card: druid, mana: 'G' }).players.P1!.manaPool.G).toBe(3);
    expect(act(s, { type: 'ActivateManaAbility', player: 'P1', card: druid, mana: 'G', grantedBy: materia }).players.P1!.manaPool.G).toBe(1);
    const yuna = put(s, 'P1', 'yuna-grand-summoner'); s.cards[materia]!.attachedTo = yuna;
    const r = act(s, { type: 'ActivateManaAbility', player: 'P1', card: yuna, mana: 'G', grantedBy: materia });
    expect(r.players.P1!.nextCreatureCounters).toBeUndefined();
  });
  it('auto-pays for a creature from the library using the equipped creature\'s mana', () => {
    let { s, host, materia } = setup(players);
    const top = put(s, 'P1', 'bugenhagen-wise-elder', 'library');
    mana(s, 'P1', { C: 1 });
    const play = playableCards(s, 'P1').find(p => p.card === top)!;
    expect(play).toBeDefined();
    const choice = play.choices[0]!;
    expect(choice.taps).toContainEqual(expect.objectContaining({ card: host, grantedBy: materia }));
    expect(basicAi(1)(s, getLegalActions(s))).toMatchObject({ type: 'ActivateManaAbility', card: host, grantedBy: materia });
    for (const action of [...choice.taps, choice.action]) s = act(s, action);
    expect(settle(s).state.cards[top]!.zone).toBe('battlefield');
  });
  it('never counts a creature twice through multiple Materia or its own mana ability', () => {
    const { s, host } = setup(players);
    put(s, 'P1', MATERIA, 'battlefield', { attachedTo: host });
    expect(planTaps(s, 'P1', '{G}{G}')).toBeNull();
    const taps = planTaps(s, 'P1', '{G}')!;
    expect(taps).toHaveLength(1);
    expect(act(s, tapActions('P1', taps)[0]!).players.P1!.manaPool.G).toBe(1);
  });
  it('phasing the Equipment out suspends preview, casting, bonuses and granted mana', () => {
    const { s, host, materia } = setup(players);
    const top = put(s, 'P1', 'bugenhagen-wise-elder', 'library');
    phaseOut({ s, ev: [] }, materia);
    expect(viewFor(s, 'P1').cards[top]).toBeUndefined();
    expect(viewFor(s, 'P1').stats[host]!.power).toBe(1);
    expect(playableZone(s, 'P1', s.cards[top]!)).toBeNull();
    expect(planTaps(s, 'P1', '{G}')).toBeNull();
  });
  it('casts artifact creatures and X creatures from the top with normal entry behavior', () => {
    let { s } = setup(players);
    const strix = put(s, 'P1', 'baleful-strix', 'library');
    mana(s, 'P1', { U: 1, B: 1, C: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: strix }).state;
    expect(s.players.P1!.hand).toHaveLength(1);
    const ballista = put(s, 'P1', 'walking-ballista', 'library');
    s = cast(s, { type: 'CastSpell', player: 'P1', card: ballista, x: 1 }).state;
    expect(s.cards[ballista]).toMatchObject({ zone: 'battlefield', counters: 1 });
    expect(checkInvariants(s)).toEqual([]);
  });
  it('handles an empty library and does not treat the top card as being in hand', () => {
    const { s } = setup(players);
    const grinder = put(s, 'P1', 'ruin-grinder', 'library');
    const actions = getLegalActions(s);
    expect(actions.some(a => a.type === 'ActivateAbility' && a.card === grinder)).toBe(false);
    for (const id of [...s.players.P1!.library]) moveCard({ s, ev: [] }, id, 'exile');
    expect(visibleLibraryTop(s, 'P1')).toBeUndefined();
    expect(viewFor(s, 'P1').players.P1!.libraryTop).toBeUndefined();
  });
});
