// Enumerates legal actions for whoever the game is waiting on. Used by bots,
// fuzz tests, and the client to highlight playable cards.
//
// The list is a useful sample, not every combination: attack and block
// declarations are limited to "none", single assignments, double blocks on
// menace attackers, and "everything at one player", which keeps the list
// small in pods.

import { isEquipment } from './characteristics.ts';
import { attackersFor, blockersNeeded, blockProblem, canBlock } from './combat.ts';
import { hasFlag } from './characteristics.ts';
import { canPay, parseManaCost } from './cost.ts';
import {
  abilityCost,
  activatedAbilities,
  activationProblem,
  canActAtSorcerySpeed,
  canEverCast,
  canPayFromPool,
  choosingEffects,
  hasInstantTiming,
  playableZone,
  spellCost,
  spellEffects,
  targetOptions,
  triggerSpec,
} from './stack.ts';
import { alivePlayers, hasKeyword } from './state.ts';
import { triggerTargetOptions } from './triggers.ts';
import { manaChoices } from './typerules.ts';
import type { Action, Block, CardInstance, EffectSpec, GameState, ManaCost, PlayerId, Target } from './types.ts';

const MAX_TARGET_COMBOS = 32;

/** Every combination of one choice per target, up to a limit. */
function combine(options: Target[][]): Target[][] {
  let combos: Target[][] = [[]];
  for (const choices of options) {
    combos = combos.flatMap((combo) => choices.map((t) => [...combo, t])).slice(0, MAX_TARGET_COMBOS);
  }
  return combos;
}

function targetCombos(s: GameState, effects: EffectSpec[], playerId: PlayerId, source: string): Target[][] {
  return combine(choosingEffects(effects).map((e) => targetOptions(s, e, playerId, source)));
}

/** A spell or ability someone could use now if they had the mana, with what it would cost. */
export interface CostedOption {
  action: Extract<Action, { type: 'CastSpell' } | { type: 'ActivateAbility' }>;
  cost: ManaCost;
  /** Mana that can only be spent on Equipment can pay for it. */
  forEquipment: boolean;
}

/** Every spell the player could cast right now, ignoring mana: from hand, graveyard (flashback) or exile. */
export function spellOptions(s: GameState, playerId: PlayerId): CostedOption[] {
  const out: CostedOption[] = [];
  const sorcerySpeed = canActAtSorcerySpeed(s, playerId);
  const candidates: CardInstance[] = [];
  const p = s.players[playerId]!;
  for (const id of [...p.hand, ...p.graveyard, ...p.command]) candidates.push(s.cards[id]!);
  for (const pid of s.turnOrder) for (const id of s.players[pid]!.exile) candidates.push(s.cards[id]!);
  for (const c of candidates) {
    const def = s.cardDefs[c.defId]!;
    const from = playableZone(s, playerId, c);
    if (!from || !canEverCast(def) || (!hasInstantTiming(def) && !sorcerySpeed)) continue;
    const modes = def.modes ? def.modes.map((_, i) => i) : [undefined];
    for (const mode of modes) {
      for (const targets of targetCombos(s, spellEffects(def, mode), playerId, c.id)) {
        out.push({
          action: { type: 'CastSpell', player: playerId, card: c.id, targets, ...(mode !== undefined ? { mode } : {}) },
          cost: spellCost(s, def, from, targets, c),
          forEquipment: isEquipment(s, c),
        });
      }
    }
  }
  return out;
}

/** Every non-mana ability the player could activate right now, ignoring mana. */
export function abilityOptions(s: GameState, playerId: PlayerId): CostedOption[] {
  const out: CostedOption[] = [];
  const p = s.players[playerId]!;
  const cards = [...p.battlefield, ...p.hand].map((id) => s.cards[id]!);
  for (const c of cards) {
    activatedAbilities(s.cardDefs[c.defId]!).forEach((spec, ability) => {
      if (activationProblem(s, playerId, c, spec)) return;
      for (const targets of targetCombos(s, spec.effects, playerId, c.id)) {
        out.push({
          action: { type: 'ActivateAbility', player: playerId, card: c.id, ability, targets },
          cost: abilityCost(s, spec, targets),
          forEquipment: spec.equip ?? false,
        });
      }
    });
  }
  return out;
}

/** Mana abilities the player could activate right now. */
function manaAbilities(s: GameState, player: PlayerId): Action[] {
  const actions: Action[] = [];
  for (const id of s.players[player]!.battlefield) {
    const c = s.cards[id]!;
    const def = s.cardDefs[c.defId]!;
    const sick = def.types.includes('creature') && c.summoningSick && !hasKeyword(s, c, 'Haste');
    const produced = manaChoices(s, c);
    if (produced.length === 0 || c.tapped || c.controller !== player || sick) continue;
    for (const mana of produced) actions.push({ type: 'ActivateManaAbility', player, card: id, mana });
  }
  return actions;
}

function blockActions(s: GameState, player: PlayerId): Action[] {
  const candidates: Block[][] = [[]];
  const attacks = s.combat?.attacks.filter((a) => a.defender === player) ?? [];
  const myCreatures = s.players[player]!.battlefield.map((id) => s.cards[id]!);
  for (const a of attacks) {
    const attacker = s.cards[a.attacker]!;
    if (attacker.zone !== 'battlefield') continue;
    const able = myCreatures.filter((b) => canBlock(s, b, attacker));
    if (hasKeyword(s, attacker, 'Menace')) {
      if (able.length >= 2) candidates.push(able.slice(0, 2).map((b) => ({ blocker: b.id, attacker: a.attacker })));
    } else {
      for (const b of able) candidates.push([{ blocker: b.id, attacker: a.attacker }]);
    }
  }
  // One declaration that blocks everything it can, "must be blocked" attackers first, so their
  // requirements can always be met.
  const forced: Block[] = [];
  const live = attacks.map((a) => s.cards[a.attacker]!).filter((c) => c.zone === 'battlefield');
  const ordered = [...live.filter((c) => hasFlag(s, c, 'mustBeBlocked')), ...live.filter((c) => !hasFlag(s, c, 'mustBeBlocked'))];
  for (const attacker of ordered) {
    const free = myCreatures.filter((b) => !forced.some((f) => f.blocker === b.id) && canBlock(s, b, attacker));
    const needed = blockersNeeded(s, attacker);
    if (free.length >= needed) forced.push(...free.slice(0, needed).map((b) => ({ blocker: b.id, attacker: attacker.id })));
  }
  candidates.push(forced);
  const seen = new Set<string>();
  const actions: Action[] = [];
  for (const blocks of candidates) {
    const key = JSON.stringify(blocks);
    if (seen.has(key) || blockProblem(s, player, blocks)) continue;
    seen.add(key);
    actions.push({ type: 'DeclareBlockers', player, blocks });
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
      const cost = item.kind === 'ability' ? triggerSpec(s, item)?.cost : undefined;
      const p = s.players[player]!;
      const affordable =
        (cost?.life === undefined || p.life >= cost.life) && (!cost?.mana || canPay(p.manaPool, parseManaCost(cost.mana)));
      const actions: Action[] = [{ type: 'Decide', player, accept: false }];
      if (affordable) actions.push({ type: 'Decide', player, accept: true });
      // While paying, lands can be tapped for mana.
      if (cost?.mana) actions.push(...manaAbilities(s, player));
      return actions;
    }

    case 'chooseLegend':
      return pending.cards.map((keep): Action => ({ type: 'ChooseLegend', player: pending.player, keep }));

    case 'surveil':
      return [
        { type: 'Surveil', player: pending.player, toGraveyard: false },
        { type: 'Surveil', player: pending.player, toGraveyard: true },
      ];

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

    case 'declareBlockers':
      return blockActions(s, pending.player);

    case 'priority': {
      const player = pending.player;
      const p = s.players[player]!;
      const actions: Action[] = [{ type: 'PassPriority', player }, ...manaAbilities(s, player)];
      if (canActAtSorcerySpeed(s, player) && p.landsPlayedThisTurn < 1) {
        const lands = [...p.hand, ...s.turnOrder.flatMap((pid) => s.players[pid]!.exile)].filter((id) => {
          const c = s.cards[id]!;
          const zone = playableZone(s, player, c);
          return (zone === 'hand' || zone === 'exile') && s.cardDefs[c.defId]!.types.includes('land');
        });
        for (const card of lands) actions.push({ type: 'PlayLand', player, card });
      }
      for (const o of [...spellOptions(s, player), ...abilityOptions(s, player)]) {
        if (canPayFromPool(s, player, o.cost, o.forEquipment)) actions.push(o.action);
      }
      return actions;
    }
  }
}
