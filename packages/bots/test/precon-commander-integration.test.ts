import { describe, expect, it } from 'vitest';
import { COMMANDER, MANA_TYPES, createGame, parseManaCost, type GameState } from '@nexus/engine';
import { CARD_DEFS, FIN_PRECONS, preconCommanders, preconDeck, preconDeckWithCommander } from '@nexus/cards';
import { act, card, cast, mana, put, rejected, settle } from './kit-helpers.ts';
import { checkInvariants } from '../src/invariants.ts';

function printedMana(s: GameState, commander: string): void {
  const cost = parseManaCost(s.cardDefs[s.cards[commander]!.defId]!.manaCost);
  for (const type of MANA_TYPES) s.players.P1!.manaPool[type] = cost[type] ?? 0;
  s.players.P1!.manaPool.C += cost.generic;
}

function finishChoices(s: GameState): GameState {
  for (let i = 0; i < 20 && s.pending.kind === 'chooseCards'; i++) {
    s = settle(act(s, { type: 'ChooseCards', player: s.pending.player, cards: s.pending.cards.slice(0, s.pending.min) })).state;
  }
  return s;
}

describe.each([2, 3, 4])('%i-player precon commander integration', (players) => {
  for (const precon of FIN_PRECONS) for (const choice of preconCommanders(precon.name)) {
    it(`${choice.name}: exact precon setup, command-zone cast, death, return, tax, recast`, () => {
      const setups = Array.from({ length: players }, (_, i) => ({
        id: `P${i + 1}`,
        ...(i === 0 ? preconDeckWithCommander(precon.name, choice.name)
          : preconDeck(FIN_PRECONS[(FIN_PRECONS.indexOf(precon) + i) % FIN_PRECONS.length]!.name)),
      }));
      let s = createGame({ format: COMMANDER, cardDefs: CARD_DEFS, seed: 17, players: setups }).state;
      const commander = s.players.P1!.command[0]!;
      expect(s.cards[commander]!.defId).toBe(choice.defId);
      expect(s.cardDefs[choice.defId]!.notBuilt).not.toBe(true);
      for (const pid of s.turnOrder) expect(s.players[pid]!.life).toBe(40);
      s.activePlayer = 'P1';
      s.step = 'main1';
      s.pending = { kind: 'priority', player: 'P1', passes: 0 };
      printedMana(s, commander);
      s = finishChoices(cast(s, { type: 'CastSpell', player: 'P1', card: commander, targets: [] }).state);
      expect(s.cards[commander]!.zone).toBe('battlefield');
      expect(s.players.P1!.commanderCasts[commander]).toBe(1);
      expect(checkInvariants(s)).toEqual([]);
      const destroy = put(s, 'P1', 'vindicate', 'hand');
      mana(s, 'P1', { W: 1, B: 1, C: 1 });
      s = cast(s, { type: 'CastSpell', player: 'P1', card: destroy, targets: [card(commander)] }).state;
      expect(s.cards[commander]!.zone).toBe('command');
      printedMana(s, commander);
      expect(rejected(s, { type: 'CastSpell', player: 'P1', card: commander, targets: [] })).toMatch(/mana/);
      mana(s, 'P1', { C: 2 });
      s = finishChoices(cast(s, { type: 'CastSpell', player: 'P1', card: commander, targets: [] }).state);
      expect(s.cards[commander]!.zone).toBe('battlefield');
      expect(s.players.P1!.commanderCasts[commander]).toBe(2);
      expect(checkInvariants(s)).toEqual([]);
    });
  }
});
