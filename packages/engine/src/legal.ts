// Enumerates legal actions for whoever the game is waiting on. Used by bots,
// fuzz tests, and the client to highlight playable cards.
//
// The list is a useful sample, not every combination: attack and block
// declarations are limited to "none", single assignments, double blocks on
// menace attackers, and "everything at one player", which keeps the list
// small in pods.

import { canAttackPlayer } from './combat.ts';
import { isEquipment } from './characteristics.ts';
import { attackTaxFor, attackersFor, blockersNeeded, blockProblem, canBlock } from './combat.ts';
import { hasFlag } from './characteristics.ts';
import { canPay, manaValue, parseManaCost } from './cost.ts';
import {
  abilityCost,
  activatedAbilities,
  activationProblem,
  alternativeCostProblem,
  canActAtSorcerySpeed,
  canEverCast,
  canPayFromPool,
  choosingEffects,
  hasInstantTiming,
  playableZone,
  spellCost,
  spellEffects,
  targetOptions,
  triggerLifeCost,
  triggerSpec,
  type SpellChoice,
  choiceProblem,
  costCardChoices,
  castingForbidden,
  convokeCandidates,
  convokeCost,
  hasImprovise,
  improviseCandidates,
  foretellProblem,
  graveyardWay,
  graveyardCastSources,
  queuedTriggerSpec,
  subsets,
  groupProblem,
} from './stack.ts';
import { alivePlayers, hasKeyword } from './state.ts';
import { cardsToBottom } from './mulligan.ts';
import { triggerModeOptions, triggerTargetOptions } from './triggers.ts';
import { canReveal, manaAbilityAmount, manaChoices } from './typerules.ts';
import { MANA_TYPES, type Action, type Block, type CardDefinition, type CardInstance, type EffectSpec, type GameState, type InstanceId, type ManaCost, type PlayerId, type Target } from './types.ts';

const MAX_TARGET_COMBOS = 96;
const MAX_BOTTOM_CHOICES = 8;

/**
 * Every combination of one choice per target, up to a limit. `valid` drops
 * a partial combination as soon as it breaks a rule (the same object twice in
 * an "up to N targets" phrase), so the limit only ever cuts legal ones.
 */
function combine(options: Target[][], valid: (partial: Target[]) => boolean = () => true): Target[][] {
  let combos: Target[][] = [[]];
  for (const choices of options) {
    combos = combos
      .flatMap((combo) => choices.map((t) => [...combo, t]))
      .filter(valid)
      .slice(0, MAX_TARGET_COMBOS);
  }
  return combos;
}

function targetCombos(s: GameState, effects: EffectSpec[], playerId: PlayerId, source: string): Target[][] {
  const needs = choosingEffects(effects);
  return combine(
    needs.map((e) => targetOptions(s, e, playerId, source)),
    (ts) => !groupProblem(s, needs, ts),
  );
}

/** A spell or ability someone could use now if they had the mana, with what it would cost. */
export interface CostedOption {
  action: Extract<Action, { type: 'CastSpell' } | { type: 'ActivateAbility' }>;
  cost: ManaCost;
  /** Mana that can only be spent on Equipment can pay for it. */
  forEquipment: boolean;
}

/**
 * The ways to choose modes: each mode for "choose one", and every allowed
 * combination for "choose two" or "choose one or more".
 */
function modeChoices(def: CardDefinition): SpellChoice[] {
  if (!def.modes) return [{}];
  if (!def.chooseModes) return def.modes.map((_, mode) => ({ mode }));
  const { min, max } = def.chooseModes;
  const out: SpellChoice[] = [];
  for (let mask = 1; mask < 1 << def.modes.length; mask++) {
    const modes = def.modes.map((_, i) => i).filter((i) => mask & (1 << i));
    if (modes.length >= min && modes.length <= max) out.push({ modes });
  }
  return out;
}

/** Every spell the player could cast right now, ignoring mana: from hand, graveyard (flashback) or exile. */
export function spellOptions(s: GameState, playerId: PlayerId): CostedOption[] {
  const out: CostedOption[] = [];
  const sorcerySpeed = canActAtSorcerySpeed(s, playerId);
  const candidates: CardInstance[] = [];
  const p = s.players[playerId]!;
  if (castingForbidden(s, playerId)) return out;
  for (const id of [...p.hand, ...p.graveyard, ...p.command]) candidates.push(s.cards[id]!);
  for (const pid of s.turnOrder) for (const id of s.players[pid]!.exile) candidates.push(s.cards[id]!);
  for (const c of candidates) {
    const def = s.cardDefs[c.defId]!;
    const from = playableZone(s, playerId, c);
    if (!from || !canEverCast(def) || (!hasInstantTiming(def) && !sorcerySpeed)) continue;
    // Flashback is itself an alternative cost, and two can't be combined (rule 118.9a);
    // Sabin can only be cast from the graveyard for its blitz cost.
    const way = from === 'graveyard' ? graveyardWay(s, playerId, c) : null;
    const permissions = way === 'static' ? graveyardCastSources(s, playerId, c).map((graveyardSource) => ({ graveyardSource })) : [{}];
    for (const permission of permissions) {
    const alternatives = way === 'blitz' ? [true] : [false];
    if (def.alternativeCost && from !== 'graveyard' && !alternativeCostProblem(s, def, playerId)) alternatives.push(true);
    // Cast without paying its mana cost: X is 0.
    const free = (from === 'graveyard' || from === 'exile') && c.castPermission?.turn === s.turnNumber && !!c.castPermission.free;
    for (const modes of modeChoices(def)) {
      for (const alternative of alternatives) {
       for (const x of free ? [undefined] : xChoices(s, playerId, def, alternative, c)) {
        for (const kicks of kickChoices(s, playerId, def, c)) {
        // Escalate: the first untapped creatures that don't make mana, one per extra mode.
        const extraModes = def.escalateTapCreature ? Math.max(0, (modes.modes?.length ?? 1) - 1) : 0;
        const tappable = convokeCandidates(s, playerId).filter((k) => manaChoices(s, k).length === 0);
        if (tappable.length < extraModes) continue;
        const tapCreatures = tappable.slice(0, extraModes).map((k) => k.id);
        const choice: SpellChoice = {
          ...permission,
          ...modes,
          ...(alternative ? { alternative: true } : {}),
          ...(x !== undefined ? { x } : {}),
          ...(kicks > 0 ? { kicks } : {}),
          ...(extraModes > 0 ? { tapCreatures } : {}),
        };
        // "As an additional cost, discard a card" (or blitz's discard): each way to pay it.
        const discard = (def.additionalCost?.discard ?? 0) + (alternative ? (def.alternativeCost?.discard ?? 0) : 0);
        const discards = discard > 0 ? subsets(p.hand.filter((id) => id !== c.id), discard, discard) : [[]];
        for (const targets of targetCombos(s, spellEffects(def, choice), playerId, c.id)) {
          const cost = spellCost(s, def, from, targets, c, alternative, x ?? 0, { kicks, ...(modes.mode !== undefined ? { mode: modes.mode } : {}) });
          for (const costCards of discards) {
            for (const pay of helpedPayments(s, playerId, def, c, cost, tapCreatures)) {
              out.push({
                action: { type: 'CastSpell', player: playerId, card: c.id, targets, ...choice, ...(costCards.length ? { costCards } : {}), ...pay.extra },
                cost: pay.cost,
                forEquipment: isEquipment(s, c),
              });
            }
          }
        }
        }
       }
      }
    }
  }
  }
  return out;
}

/** Most times multikicker is ever offered. */
const MAX_KICKS = 6;

/** How many times kicker could be paid: 0 or 1, or for multikicker up to what the player's mana could pay. */
function kickChoices(s: GameState, playerId: PlayerId, def: CardDefinition, c: CardInstance): number[] {
  if (def.kicker) return [0, 1];
  if (!def.multikicker) return [0];
  const each = manaValue(parseManaCost(def.multikicker));
  const spare = availableMana(s, playerId, c) - manaValue(parseManaCost(def.manaCost));
  const most = Math.min(MAX_KICKS, each > 0 ? Math.floor(spare / each) : MAX_KICKS);
  return Array.from({ length: Math.max(0, most) + 1 }, (_, i) => i);
}

/**
 * Ways to pay with convoke or delve: none, then more and more creatures (not
 * ones that make mana, which are better tapped for it) or graveyard cards.
 */
function helpedPayments(
  s: GameState,
  playerId: PlayerId,
  def: CardDefinition,
  c: CardInstance,
  cost: ManaCost,
  reserved: InstanceId[] = [],
): { extra: Pick<SpellChoice, 'convoke' | 'delve' | 'improvise'>; cost: ManaCost }[] {
  const out: { extra: Pick<SpellChoice, 'convoke' | 'delve' | 'improvise'>; cost: ManaCost }[] = [{ extra: {}, cost }];
  if (def.convoke) {
    const picked: CardInstance[] = [];
    for (const creature of convokeCandidates(s, playerId).filter((k) => manaChoices(s, k).length === 0)) {
      if (picked.length >= manaValue(cost)) break;
      const next = convokeCost(s, cost, [...picked, creature]);
      if (!next) continue;
      picked.push(creature);
      out.push({ extra: { convoke: picked.map((k) => k.id) }, cost: next });
    }
  }
  if (def.delve) {
    const graveyard = s.players[playerId]!.graveyard.filter((id) => id !== c.id);
    for (let n = 1; n <= Math.min(cost.generic, graveyard.length); n++) {
      out.push({ extra: { delve: graveyard.slice(0, n) }, cost: { ...cost, generic: cost.generic - n } });
    }
  }
  if (hasImprovise(s, playerId, c)) {
    for (const option of [...out]) {
      const excluded = new Set([...reserved, ...(option.extra.convoke ?? [])]);
      const artifacts = improviseCandidates(s, playerId).filter((a) => !excluded.has(a.id))
        .sort((a, b) => Number(manaChoices(s, a).length > 0) - Number(manaChoices(s, b).length > 0));
      for (let n = 1; n <= Math.min(option.cost.generic, artifacts.length); n++) {
        out.push({ extra: { ...option.extra, improvise: artifacts.slice(0, n).map((a) => a.id) }, cost: { ...option.cost, generic: option.cost.generic - n } });
      }
    }
  }
  return out;
}

/** Mana the player has in their pool plus what their untapped mana sources could make. */
function availableMana(s: GameState, playerId: PlayerId, improvisedSpell?: CardInstance): number {
  const p = s.players[playerId]!;
  let available = MANA_TYPES.reduce((n, t) => n + p.manaPool[t], 0);
  for (const id of p.battlefield) {
    const c = s.cards[id]!;
    const d = s.cardDefs[c.defId]!;
    if (c.tapped || c.controller !== playerId) continue;
    if (d.types.includes('creature') && c.summoningSick && !hasKeyword(s, c, 'Haste')) continue;
    if (manaChoices(s, c).length > 0) available += manaAbilityAmount(c, d);
    else if (d.manaAbility?.paid) available += 1;
  }
  if (improvisedSpell && hasImprovise(s, playerId, improvisedSpell)) available += improviseCandidates(s, playerId)
    .filter((a) => {
      const d = s.cardDefs[a.defId]!;
      const sick = d.types.includes('creature') && a.summoningSick && !hasKeyword(s, a, 'Haste');
      return sick || (manaChoices(s, a).length === 0 && !d.manaAbility?.paid);
    }).length;
  return available;
}

/** Most X ever offered, to keep the list of choices short. */
const MAX_X = 12;

/**
 * The values of {X} worth offering: 1 up to what the player's pool and
 * untapped mana sources could pay. [undefined] for spells without X.
 */
function xChoices(s: GameState, playerId: PlayerId, def: CardDefinition, alternative: boolean, c: CardInstance): (number | undefined)[] {
  const cost = parseManaCost(alternative ? def.alternativeCost?.mana : def.manaCost);
  if (!cost.x) return [undefined];
  const available = availableMana(s, playerId, c);
  const base = cost.generic + MANA_TYPES.reduce((n, t) => n + (cost[t] ?? 0), 0);
  const most = Math.min(MAX_X, Math.floor((available - base) / cost.x));
  return Array.from({ length: Math.max(0, most) }, (_, i) => i + 1);
}

/** Every non-mana ability the player could activate right now, ignoring mana. */
export function abilityOptions(s: GameState, playerId: PlayerId): CostedOption[] {
  const out: CostedOption[] = [];
  const p = s.players[playerId]!;
  // Unearth works from the graveyard.
  const cards = [...p.battlefield, ...p.hand, ...p.graveyard].map((id) => s.cards[id]!);
  for (const c of cards) {
    activatedAbilities(s.cardDefs[c.defId]!).forEach((spec, ability) => {
      if (activationProblem(s, playerId, c, spec)) return;
      for (const targets of targetCombos(s, spec.effects, playerId, c.id)) {
        for (const costCards of costCardChoices(s, playerId, spec, c.id)) {
          out.push({
            action: { type: 'ActivateAbility', player: playerId, card: c.id, ability, targets, ...(costCards.length ? { costCards } : {}) },
            cost: abilityCost(s, spec, targets, c),
            forEquipment: spec.equip ?? false,
          });
        }
      }
    });
  }
  return out;
}

/** Mana abilities the player could activate right now. */
function manaAbilities(s: GameState, player: PlayerId): Action[] {
  const actions: Action[] = [];
  for (const c of Object.values(s.cards).filter((card) => card.zone === 'battlefield' && card.controller === player)) {
    const id = c.id;
    const def = s.cardDefs[c.defId]!;
    const sick = def.types.includes('creature') && c.summoningSick && !hasKeyword(s, c, 'Haste');
    if (c.tapped || c.controller !== player || sick) continue;
    for (const mana of manaChoices(s, c)) actions.push({ type: 'ActivateManaAbility', player, card: id, mana });
    // Paid mana abilities, for each way to pay that the pool covers.
    const paid = def.manaAbility?.paid;
    if (!paid) continue;
    paid.costs.forEach((cost, payWith) => {
      if (!canPayFromPool(s, player, parseManaCost(cost))) return;
      paid.outputs.forEach((out, output) => {
        const mana = MANA_TYPES.find((t) => (parseManaCost(out)[t] ?? 0) > 0)!;
        actions.push({ type: 'ActivateManaAbility', player, card: id, mana, output, payWith });
      });
    });
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

/** Some ways to choose `count` cards from `hand`: a sample, not every combination. */
function bottomChoices(hand: InstanceId[], count: number): InstanceId[][] {
  const out: InstanceId[][] = [];
  for (let start = 0; start < hand.length && out.length < MAX_BOTTOM_CHOICES; start++) {
    const pick = [...hand.slice(start), ...hand.slice(0, start)].slice(0, count);
    if (pick.length === count) out.push(pick);
  }
  return out;
}

export function getLegalActions(s: GameState): Action[] {
  const pending = s.pending;
  switch (pending.kind) {
    case 'gameOver':
      return [];

    case 'chooseModes':
      return triggerModeOptions(s, s.triggerQueue[0]!).map((modes): Action => ({ type: 'ChooseModes', player: pending.player, modes }));
    case 'chooseTargets': {
      const player = pending.player;
      const t = s.triggerQueue[0]!;
      const needs = choosingEffects(queuedTriggerSpec(s, t).effects);
      return combine(triggerTargetOptions(s, t), (ts) => !groupProblem(s, needs, ts)).map((targets): Action => ({ type: 'ChooseTargets', player, targets }));
    }

    case 'decide': {
      const player = pending.player;
      const item = s.stack.at(-1)!;
      const cost = item.kind === 'ability' ? triggerSpec(s, item)?.cost : undefined;
      const p = s.players[player]!;
      const life = item.kind === 'ability' ? triggerLifeCost(s, item) : undefined;
      const affordable = p.hand.length >= (cost?.discard ?? 0) && (life === undefined || p.life >= life) && (!cost?.mana || canPay(p.manaPool, parseManaCost(cost.mana)));
      const actions: Action[] = [{ type: 'Decide', player, accept: false }];
      if (affordable) actions.push({ type: 'Decide', player, accept: true });
      // While paying, lands can be tapped for mana.
      if (cost?.mana) actions.push(...manaAbilities(s, player));
      return actions;
    }

    case 'commanderZone':
      return [
        { type: 'CommanderZone', player: pending.player, toCommand: true },
        { type: 'CommanderZone', player: pending.player, toCommand: false },
      ];

    case 'chooseLegend':
      return pending.cards.map((keep): Action => ({ type: 'ChooseLegend', player: pending.player, keep }));

    case 'mulligan': {
      const actions: Action[] = [{ type: 'Mulligan', player: pending.player, keep: true }];
      if (cardsToBottom(s, pending.taken + 1) <= s.format.startingHandSize) {
        actions.push({ type: 'Mulligan', player: pending.player, keep: false });
      }
      return actions;
    }

    case 'bottomCards':
      return bottomChoices(s.players[pending.player]!.hand, pending.count).map(
        (cards): Action => ({ type: 'BottomCards', player: pending.player, cards }),
      );

    case 'chooseCards':
      return (pending.allOrNothing ? [[], [...pending.cards]] : subsets(pending.cards, pending.min, pending.max))
        .filter((cards) => !choiceProblem(s, pending, cards))
        .map((cards): Action => ({ type: 'ChooseCards', player: pending.player, cards }));

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
      const pool = MANA_TYPES.reduce((n, t) => n + s.players[player]!.manaPool[t], 0);
      let taxed = false;
      for (const defender of defenders) {
        const tax = attackTaxFor(s, defender);
        if (tax > 0) taxed = true;
        // Attacks into Propaganda are listed once the mana for them is in the pool.
        const affordable = tax === 0 ? attackers.length : Math.floor(pool / tax);
        for (const a of affordable > 0 ? attackers.filter((c) => canAttackPlayer(s, c, defender)) : []) {
          actions.push({ type: 'DeclareAttackers', player, attacks: [{ attacker: a.id, defender }] });
        }
        if (attackers.length > 1 && affordable >= attackers.length && attackers.every((c) => canAttackPlayer(s, c, defender))) {
          actions.push({
            type: 'DeclareAttackers',
            player,
            attacks: attackers.map((a) => ({ attacker: a.id, defender })),
          });
        }
      }
      if (taxed) actions.push(...manaAbilities(s, player));
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
        for (const card of lands) {
          // Snarls: reveal to enter untapped, or play it tapped anyway.
          if (canReveal(s, s.cards[card]!, player)) {
            actions.push({ type: 'PlayLand', player, card, reveal: true });
            actions.push({ type: 'PlayLand', player, card, reveal: false });
          } else {
            actions.push({ type: 'PlayLand', player, card });
          }
        }
      }
      for (const o of [...spellOptions(s, player), ...abilityOptions(s, player)]) {
        if (canPayFromPool(s, player, o.cost, o.forEquipment)) actions.push(o.action);
      }
      for (const id of s.players[player]!.hand) {
        if (!foretellProblem(s, player, s.cards[id]!)) actions.push({ type: 'Foretell', player, card: id });
      }
      return actions;
    }
  }
}
