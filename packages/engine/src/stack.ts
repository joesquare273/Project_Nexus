// Casting spells, playing lands, activating abilities, and resolving the
// stack (PRD 7.2).

import { amountOf, countOf, isEquipment, powerOf } from './characteristics.ts';
import { parseManaCost, planPayment, reduceGeneric, totalMana } from './cost.ts';
import { matchesObject } from './filters.ts';
import { shuffleInPlace } from './rng.ts';
import {
  addCounters,
  addMana,
  alivePlayers,
  attach,
  battlefield,
  card,
  changeLife,
  createToken,
  dealDamage,
  defOf,
  destroy,
  drawCards,
  hasKeyword,
  hasType,
  isCreatureOnBattlefield,
  moveCard,
  newId,
  player,
  reject,
  sacrifice,
  tap,
  type Ctx,
} from './state.ts';
import { givePriority } from './turn.ts';
import { canReveal, entersTapped, isPermanentCard, isSpellCard, manaChoices } from './typerules.ts';
import {
  CHOSEN_TARGET_KINDS,
  MANA_TYPES,
  type AbilityItem,
  type ActivatedSpec,
  type CardDefinition,
  type CardInstance,
  type EffectSpec,
  type GameState,
  type InstanceId,
  type ManaCost,
  type ManaType,
  type PlayerId,
  type Resolving,
  type SpellItem,
  type StackItem,
  type Target,
  type TriggerSpec,
} from './types.ts';

/** Sorcery timing: your own main phase with an empty stack. */
export function canActAtSorcerySpeed(s: GameState, playerId: PlayerId): boolean {
  return (
    s.activePlayer === playerId && (s.step === 'main1' || s.step === 'main2') && s.stack.length === 0 && !s.resolving
  );
}

/** Unbuilt creatures can be cast as their body; other unbuilt cards can't be cast yet. */
export function canEverCast(def: CardDefinition): boolean {
  return isSpellCard(def) && (!def.notBuilt || def.types.includes('creature'));
}

export function hasInstantTiming(def: CardDefinition): boolean {
  return def.types.includes('instant') || (def.keywords?.includes('Flash') ?? false);
}

/** The effects whose targets are chosen, in order. A spell or ability has one target per such effect. */
export function choosingEffects(effects: readonly EffectSpec[] | undefined): EffectSpec[] {
  return (effects ?? []).filter((e) => CHOSEN_TARGET_KINDS.includes(e.target));
}

/** A card's activated abilities, including the ones its equip cost and landcycling stand for. */
export function activatedAbilities(def: CardDefinition): ActivatedSpec[] {
  const out = [...(def.activated ?? [])];
  if (def.equip) {
    out.push({
      cost: { mana: def.equip },
      sorcerySpeed: true,
      equip: true,
      effects: [{ effect: 'Attach', target: 'TargetPermanent', filter: { types: ['creature'], controller: 'You' } }],
    });
  }
  if (def.landcycling) {
    const { subtype, basic, cost } = def.landcycling;
    out.push({
      cost: { mana: cost, discardThis: true },
      zone: 'hand',
      effects: [
        {
          effect: 'SearchLibraryToHand',
          target: 'You',
          filter: basic ? { types: ['land'], supertypes: ['Basic'] } : { subtypes: [subtype!] },
        },
      ],
    });
  }
  if (def.cycling) {
    out.push({
      cost: { mana: def.cycling, discardThis: true },
      zone: 'hand',
      effects: [{ effect: 'DrawCards', amount: 1, target: 'You' }],
    });
  }
  return out;
}

/** What a triggered or activated ability on the stack does. */
export function abilitySpec(s: GameState, item: AbilityItem): TriggerSpec | ActivatedSpec {
  const def = defOf(s, s.cards[item.source]!);
  return item.from === 'trigger' ? def.triggers![item.ability]! : activatedAbilities(def)[item.ability]!;
}

/** The trigger behind an ability item, if it is a triggered ability. */
export function triggerSpec(s: GameState, item: AbilityItem): TriggerSpec | undefined {
  return item.from === 'trigger' ? (abilitySpec(s, item) as TriggerSpec) : undefined;
}

/** How a spell is being cast: its mode or modes, and whether for its alternative cost. */
export interface SpellChoice {
  mode?: number;
  modes?: number[];
  alternative?: boolean;
}

/**
 * A spell's effects for the way it's cast: an alternative cost's own effects
 * (overload), the chosen modes in printed order (rule 700.2), or its effects.
 */
export function spellEffects(def: CardDefinition, choice: SpellChoice = {}): EffectSpec[] {
  if (choice.alternative && def.alternativeCost?.effects) return def.alternativeCost.effects;
  if (def.modes && def.chooseModes) return [...(choice.modes ?? [])].sort((a, b) => a - b).flatMap((m) => def.modes![m] ?? []);
  if (def.modes) return def.modes[choice.mode ?? 0] ?? [];
  return def.effects ?? [];
}

/** The effects a stack item applies when it resolves. */
export function effectsOf(s: GameState, item: StackItem): EffectSpec[] {
  if (item.kind === 'ability') return abilitySpec(s, item).effects;
  return spellEffects(defOf(s, s.cards[item.card]!), item);
}

/** Problems with a choice of modes, or null if it's fine. */
export function modeProblem(def: CardDefinition, choice: SpellChoice): string | null {
  if (!def.modes) return null;
  if (def.chooseModes) {
    const modes = choice.modes ?? [];
    const { min, max } = def.chooseModes;
    if (new Set(modes).size !== modes.length || modes.some((m) => !def.modes![m])) return `Choose different modes for ${def.name}.`;
    if (modes.length < min || modes.length > max) {
      return min === max ? `Choose ${min} modes for ${def.name}.` : `Choose ${min} to ${max} modes for ${def.name}.`;
    }
    return null;
  }
  return choice.mode === undefined || !def.modes[choice.mode] ? `Choose a mode for ${def.name}.` : null;
}

/** Why a player can't use a card's alternative cost right now, or null if they can. */
export function alternativeCostProblem(s: GameState, def: CardDefinition, playerId: PlayerId): string | null {
  const alt = def.alternativeCost;
  if (!alt) return `${def.name} has no alternative cost.`;
  const meets = (c: CardInstance) => c.controller === playerId && matchesObject(s, alt.ifControls, c, { controller: playerId });
  if (alt.ifControls && !battlefield(s).some(meets)) {
    return `You don't meet the condition for ${def.name}'s alternative cost.`;
  }
  if (alt.life !== undefined && s.players[playerId]!.life < alt.life) return "You don't have enough life to pay.";
  return null;
}

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

/** Whether `t` is a legal choice for one chosen target of `effect`. */
export function isLegalTarget(
  s: GameState,
  effect: EffectSpec,
  t: Target,
  controller: PlayerId,
  source?: InstanceId,
): boolean {
  const kind = effect.target;
  if (t.kind === 'player') {
    const p = s.players[t.player];
    if (!p || p.eliminated) return false;
    if (kind === 'TargetOpponent') return t.player !== controller;
    return kind === 'AnyTarget' || kind === 'TargetPlayer';
  }
  const c = s.cards[t.card];
  if (!c) return false;
  const viewpoint = { controller, ...(source ? { source } : {}) };
  if (kind === 'TargetCardInGraveyard') return c.zone === 'graveyard' && matchesObject(s, effect.filter, c, viewpoint);
  if (c.zone !== 'battlefield') return false;
  // Shroud: nobody can target it. Hexproof: its controller's opponents can't (rules 702.11, 702.18).
  if (hasKeyword(s, c, 'Shroud')) return false;
  if (hasKeyword(s, c, 'Hexproof') && c.controller !== controller) return false;
  if (kind === 'TargetPermanent') return matchesObject(s, effect.filter, c, viewpoint);
  if (!isCreatureOnBattlefield(s, c)) return false;
  if (kind === 'AnyTarget' || kind === 'TargetCreature') return true;
  if (kind === 'OpponentCreature') return c.controller !== controller;
  return false;
}

/** Every legal choice for one chosen target: living players, then permanents, then graveyard cards. */
export function targetOptions(s: GameState, effect: EffectSpec, controller: PlayerId, source?: InstanceId): Target[] {
  const all: Target[] = alivePlayers(s).map((p) => ({ kind: 'player', player: p }));
  for (const c of battlefield(s)) all.push({ kind: 'card', card: c.id });
  if (effect.target === 'TargetCardInGraveyard') {
    for (const pid of s.turnOrder) for (const id of s.players[pid]!.graveyard) all.push({ kind: 'card', card: id });
  }
  return all.filter((t) => isLegalTarget(s, effect, t, controller, source));
}

/** Checks a list of chosen targets against the effects that need them. */
export function checkTargets(
  s: GameState,
  effects: readonly EffectSpec[],
  targets: Target[],
  controller: PlayerId,
  source?: InstanceId,
): void {
  const needs = choosingEffects(effects);
  if (targets.length !== needs.length) reject(`This needs ${needs.length} target(s).`);
  needs.forEach((effect, i) => {
    if (!isLegalTarget(s, effect, targets[i]!, controller, source)) reject(`Target ${i + 1} is not legal.`);
  });
}

function sourceOf(item: StackItem): InstanceId {
  return item.kind === 'ability' ? item.source : item.card;
}

/** A spell or ability whose targets have all become illegal doesn't resolve (rule 608.2b). */
function allTargetsIllegal(s: GameState, item: StackItem): boolean {
  const needs = choosingEffects(effectsOf(s, item));
  return (
    needs.length > 0 &&
    needs.every((e, i) => !isLegalTarget(s, e, item.targets[i]!, item.controller, sourceOf(item)))
  );
}

// ---------------------------------------------------------------------------
// Mana
// ---------------------------------------------------------------------------

function poolFor(s: GameState, playerId: PlayerId, forEquipment: boolean) {
  const p = s.players[playerId]!;
  const pool = { ...p.manaPool };
  if (forEquipment) for (const t of MANA_TYPES) pool[t] += p.equipmentMana[t];
  return pool;
}

/**
 * Pays a cost from the player's mana pool, or rejects the action. Mana that
 * can only be spent on Equipment is used first when `forEquipment` is set.
 * Returns how much mana was spent.
 */
export function payMana(ctx: Ctx, playerId: PlayerId, cost: ManaCost, forEquipment = false): number {
  const p = player(ctx.s, playerId);
  const spent = planPayment(poolFor(ctx.s, playerId, forEquipment), cost);
  if (!spent) reject('Not enough mana in your mana pool.');
  for (const t of MANA_TYPES) {
    let n = spent[t] ?? 0;
    if (forEquipment) {
      const restricted = Math.min(n, p.equipmentMana[t]);
      p.equipmentMana[t] -= restricted;
      n -= restricted;
    }
    p.manaPool[t] -= n;
  }
  if (Object.keys(spent).length > 0) ctx.ev.push({ type: 'ManaSpent', player: playerId, amounts: spent });
  return totalMana(spent);
}

/** Whether the pool can pay a cost (counting Equipment-only mana when it's allowed). */
export function canPayFromPool(s: GameState, playerId: PlayerId, cost: ManaCost, forEquipment = false): boolean {
  return planPayment(poolFor(s, playerId, forEquipment), cost) !== null;
}

/** "{T}: Add ...", plus Treasure's sacrifice and Freya's Equipment-only mana. Mana abilities don't use the stack. */
export function activateManaAbility(ctx: Ctx, playerId: PlayerId, id: InstanceId, mana: ManaType): void {
  const s = ctx.s;
  const c = card(s, id);
  const def = defOf(s, c);
  if (c.zone !== 'battlefield' || c.controller !== playerId) reject('You do not control that permanent.');
  const produced = manaChoices(s, c);
  if (produced.length === 0) reject('That permanent has no mana ability.');
  if (!produced.includes(mana)) reject(`That permanent can't produce {${mana}}.`);
  if (c.tapped) reject('That permanent is already tapped.');
  if (hasType(s, c, 'creature') && c.summoningSick && !hasKeyword(s, c, 'Haste')) {
    reject('Creatures with summoning sickness can’t use tap abilities.');
  }
  tap(ctx, c);
  const ability = def.manaAbility;
  if (ability?.sacrifice) sacrifice(ctx, id);
  for (let i = 0; i < (ability?.amount ?? 1); i++) addMana(ctx, playerId, mana, id, ability?.onlyForEquipment ?? false);
  // Pain lands and Talismans: "This land deals 1 damage to you."
  if (ability?.painFor?.includes(mana)) dealDamage(ctx, id, { kind: 'player', player: playerId }, 1, false);
}

// ---------------------------------------------------------------------------
// Playing cards and activating abilities
// ---------------------------------------------------------------------------

/** Where a player could play or cast this card from right now, or null. */
export function playableZone(
  s: GameState,
  playerId: PlayerId,
  c: CardInstance,
): 'hand' | 'graveyard' | 'exile' | 'command' | null {
  if (c.owner === playerId && c.zone === 'hand') return 'hand';
  // Commanders are cast from the command zone (rule 903.8).
  if (c.owner === playerId && c.zone === 'command' && c.isCommander) return 'command';
  if (c.owner === playerId && c.zone === 'graveyard' && defOf(s, c).flashback) return 'graveyard';
  const p = c.playableFromExile;
  if (c.zone === 'exile' && p?.player === playerId) {
    const source = s.cards[p.source];
    if (source?.zone === 'battlefield' && source.controller === playerId) return 'exile';
  }
  return null;
}

export function playLand(ctx: Ctx, playerId: PlayerId, id: InstanceId, reveal?: boolean): void {
  const s = ctx.s;
  const c = card(s, id);
  const p = player(s, playerId);
  const from = playableZone(s, playerId, c);
  if (from !== 'hand' && from !== 'exile') reject('That card is not in your hand.');
  if (!hasType(s, c, 'land')) reject('Only lands are played this way; cast spells with CastSpell.');
  if (!canActAtSorcerySpeed(s, playerId)) reject('Lands can only be played in your main phase with an empty stack.');
  if (p.landsPlayedThisTurn >= 1) reject('You have already played a land this turn.');
  if (reveal && !canReveal(s, c, playerId)) reject('You have no card to reveal for that land.');
  p.landsPlayedThisTurn += 1;
  moveCard(ctx, id, 'battlefield');
  c.controller = playerId;
  c.summoningSick = true;
  if (entersTapped(s, c, reveal)) c.tapped = true;
}

/**
 * The mana it costs to cast a spell with these targets: its mana cost, its
 * flashback cost from the graveyard, or its alternative cost's mana, plus
 * commander tax, minus any reduction.
 */
export function spellCost(
  s: GameState,
  def: CardDefinition,
  from: 'hand' | 'graveyard' | 'exile' | 'command',
  targets: Target[],
  card?: CardInstance,
  alternative = false,
): ManaCost {
  const base = alternative ? def.alternativeCost?.mana : from === 'graveyard' ? def.flashback : def.manaCost;
  let cost = parseManaCost(base);
  // Commander tax: {2} more for each earlier cast from the command zone (rule 903.8).
  if (from === 'command' && card) {
    cost = { ...cost, generic: cost.generic + 2 * (s.players[card.owner]!.commanderCasts[card.id] ?? 0) };
  }
  if (def.costReduction?.ifTargetsTappedCreature) {
    const tapped = targets.some((t) => t.kind === 'card' && isCreatureOnBattlefield(s, s.cards[t.card]) && s.cards[t.card]!.tapped);
    if (tapped) cost = reduceGeneric(cost, def.costReduction.generic);
  }
  if (def.costReduction?.perCount && card) {
    cost = reduceGeneric(cost, def.costReduction.generic * countOf(s, def.costReduction.perCount, card.owner));
  }
  return cost;
}

export function castSpell(ctx: Ctx, playerId: PlayerId, id: InstanceId, targets: Target[] = [], choice: SpellChoice = {}): void {
  const s = ctx.s;
  const c = card(s, id);
  const def = defOf(s, c);
  const from = playableZone(s, playerId, c);
  if (!from) reject('That card is not in your hand.');
  if (def.types.includes('land')) reject('Lands are played with PlayLand, not cast.');
  if (!canEverCast(def)) reject(`${def.name} isn't built yet, so it can't be cast.`);
  if (!hasInstantTiming(def) && !canActAtSorcerySpeed(s, playerId)) {
    reject('This card can only be cast in your main phase with an empty stack.');
  }
  const modes = modeProblem(def, choice);
  if (modes) reject(modes);
  const alternative = choice.alternative ?? false;
  if (alternative) {
    const problem = alternativeCostProblem(s, def, playerId);
    if (problem) reject(problem);
  }
  checkTargets(s, spellEffects(def, choice), targets, playerId, id);
  const manaSpent = payMana(ctx, playerId, spellCost(s, def, from, targets, c, alternative), isEquipment(s, c));
  if (alternative && def.alternativeCost?.life) changeLife(ctx, playerId, -def.alternativeCost.life);
  if (from === 'command') {
    const casts = player(s, c.owner).commanderCasts;
    casts[id] = (casts[id] ?? 0) + 1;
  }

  moveCard(ctx, id, 'stack');
  const item: SpellItem = {
    id: newId(s, 's'),
    kind: 'spell',
    card: id,
    controller: playerId,
    targets,
    ...(choice.mode !== undefined ? { mode: choice.mode } : {}),
    ...(choice.modes ? { modes: [...choice.modes].sort((a, b) => a - b) } : {}),
    ...(alternative ? { alternative } : {}),
    castFrom: from,
    manaSpent,
  };
  s.stack.push(item);
  ctx.ev.push({ type: 'SpellCast', player: playerId, card: id, defId: c.defId, targets, manaSpent });
  ctx.ev.push({ type: 'StackItemAdded', item: item.id, card: id });
}

/** What activating an ability costs with these targets (equip discounts depend on the target). */
export function abilityCost(s: GameState, spec: ActivatedSpec, targets: Target[]): ManaCost {
  let cost = parseManaCost(spec.cost.mana);
  const t = targets[0];
  if (spec.equip && t?.kind === 'card' && s.cards[t.card]) {
    cost = reduceGeneric(cost, defOf(s, s.cards[t.card]!).equipDiscount ?? 0);
  }
  return cost;
}

/** Why this ability can't be activated right now, ignoring mana and targets, or null if it can. */
export function activationProblem(s: GameState, playerId: PlayerId, c: CardInstance, spec: ActivatedSpec): string | null {
  const zone = spec.zone ?? 'battlefield';
  if (zone === 'battlefield' && (c.zone !== 'battlefield' || c.controller !== playerId)) {
    return 'You do not control that permanent.';
  }
  if (zone === 'hand' && (c.zone !== 'hand' || c.owner !== playerId)) return 'That card is not in your hand.';
  if (spec.sorcerySpeed && !canActAtSorcerySpeed(s, playerId)) {
    return 'That can only be activated in your main phase with an empty stack.';
  }
  if (spec.cost.tap) {
    if (c.tapped) return 'That permanent is already tapped.';
    if (hasType(s, c, 'creature') && c.summoningSick && !hasKeyword(s, c, 'Haste')) {
      return 'Creatures with summoning sickness can’t use tap abilities.';
    }
  }
  if (defOf(s, c).notBuilt) return `${defOf(s, c).name} isn't built yet.`;
  return null;
}

/** Activates a non-mana ability: pay its costs and put it on the stack (rule 602). */
export function activateAbility(ctx: Ctx, playerId: PlayerId, id: InstanceId, index: number, targets: Target[] = []): void {
  const s = ctx.s;
  const c = card(s, id);
  const spec = activatedAbilities(defOf(s, c))[index];
  if (!spec) reject('That card has no such ability.');
  const problem = activationProblem(s, playerId, c, spec);
  if (problem) reject(problem);
  checkTargets(s, spec.effects, targets, playerId, id);
  payMana(ctx, playerId, abilityCost(s, spec, targets), spec.equip ?? false);
  if (spec.cost.tap) tap(ctx, c);
  if (spec.cost.sacrificeThis) sacrifice(ctx, id);
  if (spec.cost.discardThis) moveCard(ctx, id, 'graveyard');

  const item: AbilityItem = {
    id: newId(s, 's'),
    kind: 'ability',
    source: id,
    from: 'activated',
    ability: index,
    sourceZone: c.zone,
    controller: playerId,
    targets,
  };
  s.stack.push(item);
  ctx.ev.push({ type: 'AbilityActivated', item: item.id, card: id, ability: index, controller: playerId, targets });
  ctx.ev.push({ type: 'StackItemAdded', item: item.id, card: id });
}

// ---------------------------------------------------------------------------
// Resolving
// ---------------------------------------------------------------------------

function controllerOfTarget(s: GameState, t: Target | undefined): PlayerId | null {
  if (!t) return null;
  if (t.kind === 'player') return t.player;
  const c = s.cards[t.card];
  if (!c) return null;
  return c.zone === 'battlefield' ? c.controller : c.owner;
}

/** The objects and players one effect applies to. */
function resolveTargets(s: GameState, effect: EffectSpec, r: Resolving, chosen: Target | undefined): Target[] {
  const item = r.item;
  const toPlayers = (ids: PlayerId[]): Target[] => ids.map((id) => ({ kind: 'player', player: id }));
  const creatures = (pick: (c: CardInstance) => boolean): Target[] =>
    battlefield(s)
      .filter((c) => hasType(s, c, 'creature') && pick(c))
      .map((c) => ({ kind: 'card', card: c.id }));
  switch (effect.target) {
    case 'You':
      return toPlayers([item.controller]);
    case 'EachPlayer':
      return toPlayers(alivePlayers(s));
    case 'EachOpponent':
      return toPlayers(alivePlayers(s).filter((id) => id !== item.controller));
    case 'EachOpponentCreature':
      return creatures((c) => c.controller !== item.controller);
    case 'EachCreatureYouControl':
      return creatures((c) => c.controller === item.controller);
    case 'This':
      // "This card" means the same object: it must still be where it was when the ability triggered.
      return item.kind === 'ability' && s.cards[item.source]!.zone === item.sourceZone
        ? [{ kind: 'card', card: item.source }]
        : [];
    case 'PreviousTarget':
      return r.previousTarget ? [r.previousTarget] : [];
    case 'PreviousTargetController': {
      const who = controllerOfTarget(s, r.previousTarget);
      return who && !s.players[who]!.eliminated ? toPlayers([who]) : [];
    }
    case 'DefendingPlayer':
      return item.kind === 'ability' && item.defender && !s.players[item.defender]!.eliminated
        ? toPlayers([item.defender])
        : [];
    case 'TriggeringObject': {
      const subject = item.kind === 'ability' ? item.subject : undefined;
      return subject && s.cards[subject]?.zone === 'battlefield' ? [{ kind: 'card', card: subject }] : [];
    }
    case 'CreatedTokens':
      return r.createdTokens.filter((id) => s.cards[id]!.zone === 'battlefield').map((id) => ({ kind: 'card', card: id }));
    case 'AllPermanents': {
      const viewpoint = { controller: item.controller, source: sourceOf(item) };
      return battlefield(s)
        .filter((c) => matchesObject(s, effect.filter, c, viewpoint))
        .map((c) => ({ kind: 'card', card: c.id }));
    }
    default:
      return chosen && isLegalTarget(s, effect, chosen, item.controller, sourceOf(item)) ? [chosen] : [];
  }
}

function topOfLibrary(s: GameState, playerId: PlayerId, n: number): InstanceId[] {
  return s.players[playerId]!.library.slice(0, n);
}

/** An effect's amount, including ones that refer back to earlier in the same spell or ability. */
function resolvedAmount(s: GameState, effect: EffectSpec, r: Resolving): number {
  const a = effect.amount;
  if (a !== undefined && typeof a === 'object' && 'of' in a) {
    return a.of === 'previousTargetPower' ? Math.max(0, r.previousTargetPower ?? 0) : (r.destroyedCount ?? 0);
  }
  return amountOf(s, a, r.item.controller);
}

/** The players among an effect's targets (searches act for these players). */
function targetPlayers(targets: Target[]): PlayerId[] {
  return targets.flatMap((t) => (t.kind === 'player' ? [t.player] : []));
}

function applyEffect(ctx: Ctx, effect: EffectSpec, r: Resolving, targets: Target[]): void {
  const s = ctx.s;
  const item = r.item;
  const source = sourceOf(item);
  const amount = resolvedAmount(s, effect, r);
  const cards = targets.flatMap((t) => (t.kind === 'card' ? [t.card] : []));
  const onBattlefield = cards.filter((id) => s.cards[id]!.zone === 'battlefield');
  switch (effect.effect) {
    case 'DealDamage':
      for (const t of targets) dealDamage(ctx, source, t, amount, false);
      return;
    case 'DrawCards':
      for (const t of targets) if (t.kind === 'player') drawCards(ctx, t.player, amount);
      return;
    case 'GainLife':
      for (const t of targets) if (t.kind === 'player') changeLife(ctx, t.player, amount);
      return;
    case 'LoseLife':
      for (const t of targets) if (t.kind === 'player') changeLife(ctx, t.player, -amount);
      return;
    case 'Destroy':
      for (const id of onBattlefield) if (destroy(ctx, id)) r.destroyedCount = (r.destroyedCount ?? 0) + 1;
      return;
    case 'Exile':
      for (const id of onBattlefield) {
        const c = s.cards[id]!;
        const { name } = defOf(s, c);
        const controller = c.controller;
        moveCard(ctx, id, 'exile');
        if (!effect.sameNameTokens) continue;
        for (const other of battlefield(s)) {
          if (other.isToken && other.controller === controller && defOf(s, other).name === name) moveCard(ctx, other.id, 'exile');
        }
      }
      return;
    case 'ExileGraveyard':
      for (const pid of targetPlayers(targets)) for (const id of [...s.players[pid]!.graveyard]) moveCard(ctx, id, 'exile');
      return;
    case 'SacrificeGreatestPower':
      for (const pid of targetPlayers(targets)) {
        const theirs = battlefield(s).filter((c) => c.controller === pid && hasType(s, c, 'creature'));
        if (theirs.length === 0) continue;
        const greatest = Math.max(...theirs.map((c) => powerOf(s, c)));
        // On a tie the player would choose; the engine sacrifices the one that has been there longest.
        sacrifice(ctx, theirs.find((c) => powerOf(s, c) === greatest)!.id);
      }
      return;
    case 'ShuffleIntoLibraryReveal':
      for (const id of onBattlefield) {
        const owner = s.cards[id]!.owner;
        const library = s.players[owner]!.library;
        moveCard(ctx, id, 'library');
        shuffleInPlace(s, library);
        ctx.ev.push({ type: 'LibraryShuffled', player: owner });
        const top = library[0];
        if (top === undefined) continue;
        const revealed = s.cards[top]!;
        ctx.ev.push({ type: 'CardRevealed', player: owner, card: top, defId: revealed.defId });
        if (isPermanentCard(defOf(s, revealed))) {
          moveCard(ctx, top, 'battlefield');
          revealed.controller = owner;
          revealed.summoningSick = true;
          if (entersTapped(s, revealed)) revealed.tapped = true;
        }
      }
      return;
    case 'Tap':
      for (const id of onBattlefield) if (!s.cards[id]!.tapped) tap(ctx, s.cards[id]!);
      return;
    case 'ReturnToHand':
      for (const id of cards) moveCard(ctx, id, 'hand');
      return;
    case 'AddCounters':
      for (const id of onBattlefield) addCounters(ctx, id, amount);
      return;
    case 'CreateToken':
      for (let i = 0; i < Math.max(1, amount); i++) r.createdTokens.push(createToken(ctx, effect.token!, item.controller));
      return;
    case 'CreateTokenCopy':
      // The copy uses the original's printed card (its copiable values, rule 707.2).
      for (const id of onBattlefield) r.createdTokens.push(createToken(ctx, s.cards[id]!.defId, item.controller));
      return;
    case 'ModifyPT':
    case 'GrantKeywords':
    case 'GrantFlags':
      for (const id of onBattlefield) {
        s.temporaryEffects.push({
          source,
          affected: id,
          ...(effect.power !== undefined ? { power: effect.power } : {}),
          ...(effect.toughness !== undefined ? { toughness: effect.toughness } : {}),
          ...(effect.keywords ? { keywords: [...effect.keywords] } : {}),
          ...(effect.flags ? { flags: [...effect.flags] } : {}),
        });
      }
      return;
    case 'ExileUntilSourceLeaves':
      // If the source already left, nothing is exiled (rule 610.3c).
      if (s.cards[source]!.zone !== 'battlefield') return;
      for (const id of onBattlefield) {
        moveCard(ctx, id, 'exile');
        s.cards[id]!.exiledUntilLeaves = source;
      }
      return;
    case 'ExileTopCardToPlay':
      for (const id of topOfLibrary(s, item.controller, Math.max(1, amount))) {
        moveCard(ctx, id, 'exile');
        s.cards[id]!.playableFromExile = { player: item.controller, source };
      }
      return;
    case 'Mill':
      for (const t of targets) {
        if (t.kind !== 'player') continue;
        for (const id of topOfLibrary(s, t.player, amount)) moveCard(ctx, id, 'graveyard');
      }
      return;
    case 'Surveil':
    case 'Scry':
      r.surveilQueue.push(...topOfLibrary(s, item.controller, amount));
      r.scrying = effect.effect === 'Scry';
      return;
    case 'ReturnToBattlefield':
      for (const id of cards) {
        const c = s.cards[id]!;
        if (c.zone !== 'graveyard') continue;
        moveCard(ctx, id, 'battlefield');
        c.summoningSick = true;
        if (entersTapped(s, c)) c.tapped = true;
        addCounters(ctx, id, effect.counters ?? 0);
      }
      return;
    case 'Attach':
      for (const id of onBattlefield) attach(ctx, source, id);
      return;
    case 'AttachToThis':
      // The ability's source must still be a creature on the battlefield.
      if (!isCreatureOnBattlefield(s, s.cards[source])) return;
      for (const id of onBattlefield) attach(ctx, id, source);
      return;
    case 'Untap':
      for (const id of onBattlefield) s.cards[id]!.tapped = false;
      return;
    case 'Proliferate':
      for (const pid of targetPlayers(targets)) {
        for (const c of battlefield(s)) if (c.controller === pid && (c.counters ?? 0) > 0) addCounters(ctx, c.id, 1);
      }
      return;
    case 'PutTopCardIfLand':
      for (const pid of targetPlayers(targets)) {
        const top = s.players[pid]!.library[0];
        if (top === undefined) continue;
        const c = s.cards[top]!;
        ctx.ev.push({ type: 'CardRevealed', player: pid, card: top, defId: c.defId });
        if (!defOf(s, c).types.includes('land')) continue;
        moveCard(ctx, top, 'battlefield');
        c.controller = pid;
        if (effect.entersTapped || entersTapped(s, c)) c.tapped = true;
      }
      return;
    case 'AttachAllEquipment':
      for (const id of onBattlefield) {
        for (const e of battlefield(s)) {
          if (e.controller === item.controller && isEquipment(s, e)) attach(ctx, e.id, id);
        }
      }
      return;
    case 'SearchLibraryToBattlefield':
      // Usually "you search"; Path to Exile has the exiled creature's controller search.
      for (const searcher of targetPlayers(targets)) {
        const p = s.players[searcher]!;
        const found = p.library.find((id) => matchesObject(s, effect.filter, s.cards[id]!, { controller: searcher }));
        if (found) {
          moveCard(ctx, found, 'battlefield');
          const c = s.cards[found]!;
          c.controller = searcher;
          c.summoningSick = true;
          if (effect.entersTapped || entersTapped(s, c)) c.tapped = true;
        }
        shuffleInPlace(s, p.library);
        ctx.ev.push({ type: 'LibraryShuffled', player: searcher });
      }
      return;
    case 'SearchLibraryToHand': {
      const p = s.players[item.controller]!;
      const found = p.library.find((id) => matchesObject(s, effect.filter, s.cards[id]!, { controller: item.controller }));
      if (found) moveCard(ctx, found, 'hand');
      shuffleInPlace(s, p.library);
      ctx.ev.push({ type: 'LibraryShuffled', player: item.controller });
      return;
    }
  }
}

/** After the effects: instants and sorceries go to the graveyard, or exile if cast with flashback. */
function finishResolving(ctx: Ctx, item: StackItem): void {
  if (item.kind === 'spell' && ctx.s.cards[item.card]!.zone === 'stack') {
    moveCard(ctx, item.card, item.castFrom === 'graveyard' ? 'exile' : 'graveyard');
  }
  givePriority(ctx, ctx.s.activePlayer);
}

/** Applies effects in order until done, or until a choice (surveil) is needed. */
function continueResolving(ctx: Ctx): void {
  const s = ctx.s;
  const r = s.resolving!;
  const item = r.item;
  const effects = effectsOf(s, item);
  for (;;) {
    const next = r.surveilQueue[0];
    if (next !== undefined) {
      s.pending = { kind: 'surveil', player: item.controller, card: next, ...(r.scrying ? { scry: true } : {}) };
      return;
    }
    if (r.next >= effects.length) break;
    const effect = effects[r.next++]!;
    const chosen = CHOSEN_TARGET_KINDS.includes(effect.target) ? item.targets[r.chosenUsed++] : undefined;
    if (chosen) {
      r.previousTarget = chosen;
      // Remember its power now: "life equal to its power" still works after it's exiled (rule 608.2h).
      const c = chosen.kind === 'card' ? s.cards[chosen.card] : undefined;
      if (c?.zone === 'battlefield') r.previousTargetPower = powerOf(s, c);
    }
    if (effect.if === 'castFromGraveyard' && !(item.kind === 'spell' && item.castFrom === 'graveyard')) continue;
    if (effect.ifSourcePowerAtLeast !== undefined) {
      const src = s.cards[sourceOf(item)]!;
      if (src.zone !== 'battlefield' || powerOf(s, src) < effect.ifSourcePowerAtLeast) continue;
    }
    applyEffect(ctx, effect, r, resolveTargets(s, effect, r, chosen));
  }
  s.resolving = null;
  finishResolving(ctx, item);
}

function startResolving(ctx: Ctx, item: StackItem, applyEffects: boolean): void {
  if (!applyEffects) {
    finishResolving(ctx, item);
    return;
  }
  ctx.s.resolving = { item, next: 0, chosenUsed: 0, createdTokens: [], surveilQueue: [] };
  continueResolving(ctx);
}

/**
 * Resolves the top item of the stack, then the active player gets priority.
 * An ability with "you may" or an optional cost stops first to ask its
 * controller (see `decide`). Surveil stops partway through to ask (see
 * `surveil`).
 */
export function resolveTop(ctx: Ctx): void {
  const s = ctx.s;
  const item = s.stack.at(-1);
  if (!item) return;
  const fizzled = allTargetsIllegal(s, item);

  if (item.kind === 'spell') {
    s.stack.pop();
    const c = s.cards[item.card]!;
    const def = defOf(s, c);
    const permanent = isPermanentCard(def);
    ctx.ev.push({ type: 'StackItemResolved', item: item.id, card: c.id, fizzled: fizzled && !permanent });
    if (permanent) {
      moveCard(ctx, c.id, 'battlefield');
      c.controller = item.controller;
      c.summoningSick = true;
      if (entersTapped(s, c)) c.tapped = true;
      givePriority(ctx, s.activePlayer);
      return;
    }
    startResolving(ctx, item, !fizzled);
    return;
  }

  const trigger = triggerSpec(s, item);
  if (!fizzled && trigger && (trigger.optional || trigger.cost) && item.accepted === undefined) {
    s.pending = { kind: 'decide', player: item.controller, item: item.id };
    return;
  }
  s.stack.pop();
  ctx.ev.push({ type: 'StackItemResolved', item: item.id, card: item.source, fizzled });
  startResolving(ctx, item, !fizzled && item.accepted !== false);
}

/** Answers the pending "you may" for the ability on top of the stack, paying its cost if accepted. */
export function decide(ctx: Ctx, playerId: PlayerId, accept: boolean): void {
  const s = ctx.s;
  const pending = s.pending;
  if (pending.kind !== 'decide' || pending.player !== playerId) reject('You have no decision to make right now.');
  const item = s.stack.at(-1);
  if (item?.kind !== 'ability' || item.id !== pending.item) {
    throw new Error('The ability being decided is not on top of the stack.');
  }
  const cost = triggerSpec(s, item)?.cost;
  if (accept && cost) {
    if (cost.life !== undefined && player(s, playerId).life < cost.life) reject("You don't have enough life to pay.");
    if (cost.mana) payMana(ctx, playerId, parseManaCost(cost.mana));
    if (cost.life) changeLife(ctx, playerId, -cost.life);
  }
  item.accepted = accept;
  ctx.ev.push({ type: 'Decided', player: playerId, item: item.id, card: item.source, accepted: accept });
  resolveTop(ctx);
}

/** Answers a surveil: keep the card on top of the library, or put it into the graveyard. */
export function surveil(ctx: Ctx, playerId: PlayerId, toGraveyard: boolean): void {
  const s = ctx.s;
  const pending = s.pending;
  if (pending.kind !== 'surveil' || pending.player !== playerId || !s.resolving) {
    reject('You are not surveilling right now.');
  }
  const id = s.resolving.surveilQueue.shift()!;
  const scry = !!s.resolving.scrying;
  if (toGraveyard && scry) {
    // Scry: to the bottom of the library (no zone change).
    const library = player(s, playerId).library;
    library.splice(library.indexOf(id), 1);
    library.push(id);
  } else if (toGraveyard) {
    moveCard(ctx, id, 'graveyard');
  }
  ctx.ev.push({ type: 'Surveiled', player: playerId, card: id, toGraveyard, ...(scry ? { scry } : {}) });
  continueResolving(ctx);
}
