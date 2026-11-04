// Card parts built earlier without a test of their own (found by the
// 2026-11-04 audit): each test plays the part the way its Oracle text reads.

import { describe, expect, it } from 'vitest';
import { getLegalActions, hasKeyword, powerOf, toughnessOf, type Action, type GameState } from '@nexus/engine';
import { basicAi } from '../src/ai.ts';
import { act, card, cast, fight, goTo, mana, newGame, player, put, settle } from './kit-helpers.ts';

const answerFirst = (s: GameState): GameState => {
  for (let guard = 0; guard < 8 && s.pending.kind === 'chooseCards'; guard++) {
    s = settle(act(s, { type: 'ChooseCards', player: s.pending.player, cards: s.pending.cards.slice(0, Math.max(1, s.pending.min)) })).state;
  }
  return s;
};
const nextTurnOfP1 = (s: GameState, opts: Parameters<typeof settle>[1] = {}) => {
  const turn = s.turnNumber;
  for (let guard = 0; guard < 8 && !(s.activePlayer === 'P1' && s.turnNumber > turn); guard++) {
    s = answerFirst(settle(goTo(answerFirst(s), 'end', opts), opts).state);
    s = answerFirst(settle(goTo(s, 'main1', opts), opts).state);
  }
  return s;
};
const top = (s: GameState, who: string, ids: string[]) => {
  s.players[who]!.library = [...ids, ...s.players[who]!.library.filter((x) => !ids.includes(x))];
};
const passOnce = (s: GameState) => act(s, { type: 'PassPriority', player: s.pending.kind === 'priority' ? s.pending.player : 'P1' });
const stats = (s: GameState, id: string) => [powerOf(s, s.cards[id]!), toughnessOf(s, s.cards[id]!)];

describe('Syr Konrad, Bruse Tarl, Golbez, Kinnan, Garnet', () => {
  it('Syr Konrad: a creature card leaving your graveyard deals 1 to each opponent', () => {
    let s = newGame(3);
    put(s, 'P1', 'syr-konrad-the-grim');
    const cat = put(s, 'P1', 'coeurl', 'graveyard');
    const down = put(s, 'P1', 'phoenix-down');
    mana(s, 'P1', { W: 1, C: 1 });
    const life = [s.players.P2!.life, s.players.P3!.life];
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: down, ability: 0, targets: [card(cat)] }).state;
    expect(s.cards[cat]!.zone).toBe('battlefield');
    expect([s.players.P2!.life, s.players.P3!.life]).toEqual([life[0]! - 1, life[1]! - 1]);
  });

  it('Bruse Tarl: attacking, a creature you control gains double strike and lifelink', () => {
    let s = newGame();
    const bruse = put(s, 'P1', 'bruse-tarl-boorish-herder');
    const cat = put(s, 'P1', 'coeurl');
    s = goTo(s, 'declareAttackers');
    s = act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: bruse, defender: 'P2' }] });
    s = settle(s, { targets: (o) => o.find((t) => t[0]?.kind === 'card' && t[0].card === cat)! }).state;
    for (let i = 0; i < 4 && s.pending.kind === 'priority' && s.stack.length; i++) s = passOnce(s);
    expect(hasKeyword(s, s.cards[cat]!, 'DoubleStrike')).toBe(true);
    expect(hasKeyword(s, s.cards[cat]!, 'Lifelink')).toBe(true);
  });

  it('Golbez: an artifact entering surveils 1; with four artifacts the end step returns a creature card, eight also drain', () => {
    for (const artifacts of [4, 8]) {
      let s = newGame();
      put(s, 'P1', 'golbez-crystal-collector');
      for (let i = 0; i < artifacts - 1; i++) put(s, 'P1', 'sol-ring');
      const cat = put(s, 'P1', 'coeurl', 'graveyard');
      const ring = put(s, 'P1', 'sol-ring', 'hand');
      mana(s, 'P1', { C: 1 });
      s = act(s, { type: 'CastSpell', player: 'P1', card: ring });
      for (let i = 0; i < 6 && s.pending.kind === 'priority'; i++) s = passOnce(s);
      expect(s.pending.kind).toBe('surveil');
      s = settle(s).state;
      const life = s.players.P2!.life;
      s = goTo(s, 'end', { targets: (o) => o.find((t) => t[0]?.kind === 'card' && t[0].card === cat)! });
      s = settle(s, { targets: (o) => o.find((t) => t[0]?.kind === 'card' && t[0].card === cat)! }).state;
      for (let i = 0; i < 4 && s.pending.kind === 'priority' && s.stack.length; i++) s = passOnce(s);
      expect(s.cards[cat]!.zone).toBe('hand');
      expect(s.players.P2!.life).toBe(artifacts === 8 ? life - 2 : life);
    }
  });

  it('Kinnan: {5}{G}{U}: a non-Human creature card from the top five onto the battlefield', () => {
    let s = newGame();
    const kinnan = put(s, 'P1', 'kinnan-bonder-prodigy');
    const cat = put(s, 'P1', 'coeurl', 'library');
    const human = put(s, 'P1', 'aerith-gainsborough', 'library');
    top(s, 'P1', [human, cat]);
    mana(s, 'P1', { G: 1, U: 1, C: 5 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: kinnan, ability: 0 }).state;
    expect(s.pending).toMatchObject({ kind: 'chooseCards', purpose: 'lookTop', cards: [cat] });
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [cat] })).state;
    expect(s.cards[cat]!.zone).toBe('battlefield');
    expect(s.cards[human]!.zone).toBe('library');
  });

  it('Garnet has lifelink', () => {
    let s = newGame();
    const garnet = put(s, 'P1', 'garnet-princess-of-alexandria');
    const life = s.players.P1!.life;
    s = fight(s, [{ attacker: garnet, defender: 'P2' }]).state;
    expect(s.players.P1!.life).toBe(life + 2);
  });
});

describe('Carpet of Flowers, Strixhaven Stadium, poison, Kefka, Najeela', () => {
  it('Carpet of Flowers: unused in the first main phase, it can add the mana in the second', () => {
    let s = newGame();
    put(s, 'P1', 'carpet-of-flowers');
    put(s, 'P2', 'island');
    put(s, 'P2', 'island');
    s.step = 'beginCombat';
    s.pending = { kind: 'priority', player: 'P1', passes: 0 };
    for (let i = 0; i < 20 && s.step !== 'main2'; i++) {
      if (s.pending.kind === 'declareAttackers') s = act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [] });
      else s = passOnce(s);
    }
    expect(s.step).toBe('main2');
    s = settle(s, { accept: true }).state;
    // "Mana of any one color" equal to their Islands.
    expect(s.pending.kind).toBe('chooseMana');
    s = act(s, { type: 'ChooseMana', player: 'P1', mana: 'U' });
    expect(s.players.P1!.manaPool.U).toBe(2);
  });

  it('Strixhaven Stadium: a creature dealing combat damage to you removes a point counter', () => {
    let s = newGame();
    const stadium = put(s, 'P2', 'strixhaven-stadium', 'battlefield', { namedCounters: { point: 3 } });
    const cat = put(s, 'P1', 'coeurl');
    s = fight(s, [{ attacker: cat, defender: 'P2' }]).state;
    expect(s.cards[stadium]!.namedCounters?.point).toBe(2);
  });

  it('Proliferate gives each opponent with poison another poison counter', () => {
    let s = newGame();
    const yawgmoth = put(s, 'P1', 'yawgmoth-thran-physician');
    const discard = put(s, 'P1', 'forest', 'hand');
    s.players.P2!.poison = 2;
    mana(s, 'P1', { B: 2 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: yawgmoth, ability: 1, costCards: [discard] }).state;
    expect(s.players.P2!.poison).toBe(3);
    expect(s.players.P1!.poison ?? 0).toBe(0);
  });

  it('Kefka, Court Mage: as it enters, each player discards a card; you draw one per card type discarded', () => {
    let s = newGame();
    s.players.P1!.hand = [];
    s.players.P2!.hand = [];
    put(s, 'P1', 'forest', 'hand');
    put(s, 'P2', 'sol-ring', 'hand');
    const kefka = put(s, 'P1', 'kefka-court-mage-kefka-ruler-of-ruin', 'hand');
    mana(s, 'P1', { U: 1, B: 1, R: 1, C: 2 });
    s = answerFirst(cast(s, { type: 'CastSpell', player: 'P1', card: kefka }).state);
    expect(s.players.P2!.hand).toHaveLength(0);
    // A land and an artifact: two card types, two cards.
    expect(s.players.P1!.hand).toHaveLength(2);
  });

  it('Najeela: WUBRG during combat gives an additional combat phase after this one', () => {
    let s = newGame();
    const najeela = put(s, 'P1', 'najeela-the-blade-blossom');
    s = goTo(s, 'declareAttackers');
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: najeela, defender: 'P2' }] }), { accept: false }).state;
    mana(s, 'P1', { W: 1, U: 1, B: 1, R: 1, G: 1 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: najeela, ability: 0 }).state;
    const turn = s.turnNumber;
    let combats = 0;
    for (let i = 0; i < 40 && s.step !== 'main2'; i++) {
      if (s.pending.kind === 'declareAttackers') {
        combats++;
        s = act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [] });
      } else if (s.pending.kind === 'declareBlockers') s = act(s, { type: 'DeclareBlockers', player: s.pending.player, blocks: [] });
      else if (s.pending.kind === 'priority') s = passOnce(s);
      else s = settle(s, { accept: false }).state;
    }
    expect(combats).toBe(1);
    expect(s.turnNumber).toBe(turn);
  });
});

describe('Sephiroth, Alexander, Cecil, Esper Maduin, Sin, Emet-Selch, Bolas’s Citadel', () => {
  it('Sephiroth: entering or attacking, sacrifice another creature to draw; One-Winged Angel sacrifices any number to draw that many', () => {
    let s = newGame();
    const cat = put(s, 'P1', 'coeurl');
    const seph = put(s, 'P1', 'sephiroth-fabled-soldier-sephiroth-one-winged-angel', 'hand');
    mana(s, 'P1', { B: 1, C: 2 });
    const hand = s.players.P1!.hand.length;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: seph }, { targets: (o) => o.find((t) => t[0]?.kind === 'player' && t[0].player === 'P2')! }).state;
    s = settle(act(s, { type: 'ChooseCards', player: 'P1', cards: [cat] }), { targets: (o) => o[0]! }).state;
    expect(s.cards[cat]!.zone).toBe('graveyard');
    expect(s.players.P1!.hand.length).toBe(hand - 1 + 1);
    // The back face: attacking, sacrifice two to draw two.
    let t = newGame();
    const angel = put(t, 'P1', 'sephiroth-fabled-soldier-sephiroth-one-winged-angel', 'battlefield', { transformed: true });
    const two = [put(t, 'P1', 'coeurl'), put(t, 'P1', 'coeurl')];
    t = goTo(t, 'declareAttackers');
    t = settle(act(t, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: angel, defender: 'P2' }] })).state;
    const before = t.players.P1!.hand.length;
    expect(t.pending.kind).toBe('chooseCards');
    t = settle(act(t, { type: 'ChooseCards', player: 'P1', cards: two }), { targets: (o) => o[0]! }).state;
    for (let i = 0; i < 8 && t.pending.kind === 'priority' && t.stack.length; i++) t = passOnce(settle(t, { targets: (o) => o[0]! }).state);
    expect(two.map((id) => t.cards[id]!.zone)).toEqual(['graveyard', 'graveyard']);
    expect(t.players.P1!.hand.length).toBe(before + 2);
  });

  it('Summon: Alexander: chapter III taps all creatures your opponents control', () => {
    let s = newGame();
    put(s, 'P1', 'crystal-fragments-summon-alexander', 'battlefield', { transformed: true, namedCounters: { lore: 2 } });
    const theirs = [put(s, 'P2', 'coeurl'), put(s, 'P2', 'coeurl')];
    const mine = put(s, 'P1', 'coeurl');
    s = nextTurnOfP1(s);
    expect(theirs.map((id) => s.cards[id]!.tapped)).toEqual([true, true]);
    expect(s.cards[mine]!.tapped).toBe(false);
  }, 60_000);

  it('Cecil, Redeemed Paladin: attacking, other attacking creatures gain indestructible', () => {
    let s = newGame();
    const cecil = put(s, 'P1', 'cecil-dark-knight-cecil-redeemed-paladin', 'battlefield', { transformed: true });
    const cat = put(s, 'P1', 'coeurl');
    s = goTo(s, 'declareAttackers');
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: cecil, defender: 'P2' }, { attacker: cat, defender: 'P2' }] })).state;
    for (let i = 0; i < 4 && s.pending.kind === 'priority' && s.stack.length; i++) s = passOnce(s);
    expect(hasKeyword(s, s.cards[cat]!, 'Indestructible')).toBe(true);
    expect(hasKeyword(s, s.cards[cecil]!, 'Lifelink')).toBe(true);
  });

  it('Summon: Esper Maduin: chapter II adds {G}{G}; chapter III gives your other creatures +2/+2 and trample', () => {
    let s = newGame();
    put(s, 'P1', 'esper-origins-summon-esper-maduin', 'battlefield', { transformed: true, namedCounters: { lore: 1 } });
    const cat = put(s, 'P1', 'coeurl');
    s = nextTurnOfP1(s);
    expect(s.players.P1!.manaPool.G).toBe(2);
    s = nextTurnOfP1(s);
    expect(stats(s, cat)).toEqual([4, 4]);
    expect(hasKeyword(s, s.cards[cat]!, 'Trample')).toBe(true);
  }, 60_000);

  it('Sin: attacking exiles a permanent card from your graveyard at random and makes a tapped token copy', () => {
    let s = newGame();
    const sin = put(s, 'P1', 'sin-spiras-punishment');
    const cat = put(s, 'P1', 'coeurl', 'graveyard');
    s = goTo(s, 'declareAttackers');
    s = settle(act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: sin, defender: 'P2' }] })).state;
    for (let i = 0; i < 4 && s.pending.kind === 'priority' && s.stack.length; i++) s = passOnce(s);
    expect(s.cards[cat]!.zone).toBe('exile');
    const token = s.players.P1!.battlefield.map((id) => s.cards[id]!).find((c) => c.isToken && c.defId === 'coeurl');
    expect(token).toMatchObject({ tapped: true });
  });

  it('Emet-Selch, Unsundered: entering, draw a card, then discard a card', () => {
    let s = newGame();
    s.players.P1!.hand = [];
    const emet = put(s, 'P1', 'emet-selch-unsundered-hades-sorcerer-of-eld', 'hand');
    mana(s, 'P1', { U: 1, B: 1, C: 1 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: emet }).state;
    expect(s.pending).toMatchObject({ kind: 'chooseCards', purpose: 'discard' });
    s = answerFirst(s);
    expect(s.players.P1!.hand).toHaveLength(0);
    expect(s.players.P1!.graveyard).toHaveLength(1);
  });

  it('Bolas’s Citadel: {T}, sacrifice ten nonland permanents: each opponent loses 10 life', () => {
    let s = newGame(3);
    const citadel = put(s, 'P1', 'bolass-citadel');
    const fodder = Array.from({ length: 10 }, () => put(s, 'P1', 'sol-ring'));
    put(s, 'P1', 'forest');
    const life = [s.players.P2!.life, s.players.P3!.life];
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: citadel, ability: 0, costCards: fodder }).state;
    expect(fodder.every((id) => s.cards[id]!.zone === 'graveyard')).toBe(true);
    expect([s.players.P2!.life, s.players.P3!.life]).toEqual([life[0]! - 10, life[1]! - 10]);
  });
});

describe('the bot answers the newer choices', () => {
  it('casts the best free spell (castFree) and keeps lore counters (removeLore)', () => {
    const bot = basicAi(1);
    let s = newGame();
    const body = put(s, 'P1', 'coeurl');
    put(s, 'P1', 'buster-sword', 'battlefield', { attachedTo: body });
    const ring = put(s, 'P1', 'sol-ring', 'hand');
    s = fight(s, [{ attacker: body, defender: 'P2' }]).state;
    expect(s.pending).toMatchObject({ kind: 'chooseCards', purpose: 'castFree' });
    const a = bot(s, getLegalActions(s));
    expect(a).toMatchObject({ type: 'ChooseCards', cards: [ring] });

    let t = newGame();
    const garnet = put(t, 'P1', 'garnet-princess-of-alexandria');
    put(t, 'P1', 'summon-choco-mog', 'battlefield', { namedCounters: { lore: 2 } });
    t = goTo(t, 'declareAttackers');
    t = settle(act(t, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: garnet, defender: 'P2' }] })).state;
    for (let i = 0; i < 4 && t.pending.kind === 'priority' && t.stack.length; i++) t = passOnce(t);
    expect(t.pending).toMatchObject({ kind: 'chooseCards', purpose: 'removeLore' });
    const b: Action = bot(t, getLegalActions(t));
    expect(b).toMatchObject({ type: 'ChooseCards', cards: [] });
  });
});

void player;
