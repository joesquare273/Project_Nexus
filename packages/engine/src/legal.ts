// Enumerates legal actions for whoever the game is waiting on. Used by bots,
// fuzz tests, and (later) the client to highlight playable cards.
//
// The list is a useful sample, not every combination: attack and block
// declarations are limited to "none", single assignments, double blocks on
// menace attackers, and "everything at one player", which keeps the list
// small in pods.

import { canPay, parseManaCost } from './cost.ts';
import { attackersFor, canBlock } from './combat.ts';
import { canActAtSorcerySpeed, canEverCast, choosingEffects, hasInstantTiming, targetOptions, triggerSpec } from './stack.ts';
import { alivePlayers, hasKeyword } from './state.ts';
import { triggerTargetOptions } from './triggers.ts';
import { manaProduced } from './typerules.ts';
import type { Action, Block, GameState, PlayerId, Target } from './types.ts';

const MAX_TARGET_COMBOS = 32;

/** Every combination of one choice per target, up to a limit. */
function combine(options: Target[][]): Target[][] {
  let combos: Target[][] = [[]];
  for (const choices of options) {
    combos = combos.flatMap((combo) => choices.map((t) => [...combo, t])).slice(0, MAX_TARGET_COMBOS);
  }
  return combos;
}

function targetCombos(s: GameState, playerId: PlayerId, cardId: string): Target[][] {
  const def = s.cardDefs[s.cards[cardId]!.defId]!;
  return combine(choosingEffects(def.effects).map((e) => targetOptions(s, e.target, playerId)));
}

/** Mana abilities the player could activate right now. */
function manaAbilities(s: GameState, player: PlayerId): Action[] {
  const actions: Action[] = [];
  for (const id of s.players[player]!.battlefield) {
    const c = s.cards[id]!;
    const def = s.cardDefs[c.defId]!;
    const sick = def.types.includes('creature') && c.summoningSick && !hasKeyword(s, c, 'Haste');
    const produced = manaProduced(def);
    if (produced.length === 0 || c.tapped || c.controller !== player || sick) continue;
    for (const mana of produced) actions.push({ type: 'ActivateManaAbility', player, card: id, mana });
  }
  return actions;
}

export function getLegalActions(s: GameState): Action[] {
  const pending = s.pending;
  switch (pending.kind) {
    case 'gameOver':
      return [];

    case 'chooseTargets': {
      const player = pending.player;
      return combine(triggerTargetOptions(s, s.triggerQueue[0]!)).map(
        (targets): Action => ({ type: 'ChooseTargets', player, targets }),
      );
    }

    case 'decide': {
      const player = pending.player;
      const item = s.stack.at(-1)!;
      const cost = item.kind === 'ability' ? triggerSpec(s, item).cost : undefined;
      const p = s.players[player]!;
      const affordable =
        (cost?.life === undefined || p.life >= cost.life) && (!cost?.mana || canPay(p.manaPool, parseManaCost(cost.mana)));
      const actions: Action[] = [{ type: 'Decide', player, accept: false }];
      if (affordable) actions.push({ type: 'Decide', player, accept: true });
      // While paying, lands can be tapped for mana.
      if (cost?.mana) actions.push(...manaAbilities(s, player));
      return actions;
    }

    case 'declareAttackers': {
      const player = pending.player;
      const attackers = attackersFor(s, player);
      const defenders = alivePlayers(s).filter((id) => id !== player);
      const actions: Action[] = [{ type: 'DeclareAttackers', player, attacks: [] }];
      for (const defender of defenders) {
        for (const a of attackers) {
          actions.push({ type: 'DeclareAttackers', player, attacks: [{ attacker: a.id, defender }] });
        }
        if (attackers.length > 1) {
          actions.push({
            type: 'DeclareAttackers',
            player,
            attacks: attackers.map((a) => ({ attacker: a.id, defender })),
          });
        }
      }
      return actions;
    }

    case 'declareBlockers': {
      const player = pending.player;
      const actions: Action[] = [{ type: 'DeclareBlockers', player, blocks: [] }];
      const attacks = s.combat?.attacks.filter((a) => a.defender === player) ?? [];
      const myCreatures = s.players[player]!.battlefield.map((id) => s.cards[id]!);
      for (const a of attacks) {
        const attacker = s.cards[a.attacker]!;
        if (attacker.zone !== 'battlefield') continue;
        const able = myCreatures.filter((b) => canBlock(s, b, attacker));
        if (hasKeyword(s, attacker, 'Menace')) {
          if (able.length >= 2) {
            const blocks: Block[] = able.slice(0, 2).map((b) => ({ blocker: b.id, attacker: a.attacker }));
            actions.push({ type: 'DeclareBlockers', player, blocks });
          }
        } else {
          for (const b of able) {
            actions.push({ type: 'DeclareBlockers', player, blocks: [{ blocker: b.id, attacker: a.attacker }] });
          }
        }
      }
      return actions;
    }

    case 'priority': {
      const player = pending.player;
      const p = s.players[player]!;
      const actions: Action[] = [{ type: 'PassPriority', player }, ...manaAbilities(s, player)];
      const sorcerySpeed = canActAtSorcerySpeed(s, player);
      for (const id of p.hand) {
        const def = s.cardDefs[s.cards[id]!.defId]!;
        if (def.types.includes('land')) {
          if (sorcerySpeed && p.landsPlayedThisTurn < 1) actions.push({ type: 'PlayLand', player, card: id });
          continue;
        }
        if (!canEverCast(def) || (!hasInstantTiming(def) && !sorcerySpeed)) continue;
        if (!canPay(p.manaPool, parseManaCost(def.manaCost))) continue;
        for (const targets of targetCombos(s, player, id)) {
          actions.push({ type: 'CastSpell', player, card: id, targets });
        }
      }
      return actions;
    }
  }
}
