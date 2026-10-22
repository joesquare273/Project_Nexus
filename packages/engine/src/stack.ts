// Casting spells, playing lands, activating abilities, and resolving the
// stack (PRD 7.2).

import { allCounters, amountOf, countOf, countersOf, isEquipment, powerOf, totalCounters } from './characteristics.ts';
import { parseManaCost, planPayment, reduceGeneric, totalMana, manaValue } from './cost.ts';
import { matchesObject } from './filters.ts';
import { shuffleInPlace } from './rng.ts';
import {
  addCounters,
  addMana,
  aliveFromActive,
  alivePlayers,
  attach,
  battlefield,
  card,
  changeLife,
  createToken,
  dealDamage,
  defOf,
  destroy,
  discard,
  drawCards,
  hasKeyword,
  hasType,
  isCreatureOnBattlefield,
  moveCard,
  newId,
  player,
  reject,
  removeCounters,
  sacrifice,
  tap,
  untap,
  type Ctx,
} from './state.ts';
import { givePriority } from './turn.ts';
import { canReveal, entersTapped, isPermanentCard, isSpellCard, manaChoices } from './typerules.ts';
import {
  CHOSEN_TARGET_KINDS,
  MANA_TYPES,
  type AbilityItem,
  type AnyCounter,
  type ActivatedSpec,
  type CardChoice,
  type CardDefinition,
  type CardInstance,
  type EffectSpec,
  type GameState,
  type InstanceId,
  type ManaCost,
  type ManaType,
  type ObjectFilter,
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
  /** The value chosen for {X}. */
  x?: number;
  mode?: number;
  modes?: number[];
  alternative?: boolean;
  /** Cards discarded to pay an additional cost. */
  costCards?: InstanceId[];
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
/** For triggered abilities: the player attacked or damaged ("artifact that player controls"). */
export interface TargetContext {
  defender?: PlayerId;
}

export function isLegalTarget(
  s: GameState,
  effect: EffectSpec,
  t: Target,
  controller: PlayerId,
  source?: InstanceId,
  context: TargetContext = {},
): boolean {
  if (t.kind === 'none') return !!effect.upTo;
  const kind = effect.target;
  if (t.kind === 'player') {
    const p = s.players[t.player];
    if (!p || p.eliminated) return false;
    if (kind === 'TargetOpponent') return t.player !== controller;
    return kind === 'AnyTarget' || kind === 'TargetPlayer';
  }
  const c = s.cards[t.card];
  if (!c) return false;
  const viewpoint = { controller, ...(source ? { source } : {}), ...(context.defender ? { defender: context.defender } : {}) };
  if (kind === 'TargetCardInGraveyard') {
    // A player who left the game took their cards with them (rule 800.4a).
    return c.zone === 'graveyard' && !s.players[c.owner]!.eliminated && matchesObject(s, effect.filter, c, viewpoint);
  }
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
export function targetOptions(
  s: GameState,
  effect: EffectSpec,
  controller: PlayerId,
  source?: InstanceId,
  context: TargetContext = {},
): Target[] {
  const all: Target[] = alivePlayers(s).map((p) => ({ kind: 'player', player: p }));
  for (const c of battlefield(s)) all.push({ kind: 'card', card: c.id });
  if (effect.target === 'TargetCardInGraveyard') {
    for (const pid of s.turnOrder) for (const id of s.players[pid]!.graveyard) all.push({ kind: 'card', card: id });
  }
  // "Up to one": leaving it out is a choice too.
  if (effect.upTo) all.push({ kind: 'none' });
  return all.filter((t) => isLegalTarget(s, effect, t, controller, source, context));
}

/** Checks a list of chosen targets against the effects that need them. */
export function checkTargets(
  s: GameState,
  effects: readonly EffectSpec[],
  targets: Target[],
  controller: PlayerId,
  source?: InstanceId,
  context: TargetContext = {},
): void {
  const needs = choosingEffects(effects);
  const grouped = groupProblem(s, needs, targets);
  if (grouped) reject(grouped);
  if (targets.length !== needs.length) reject(`This needs ${needs.length} target(s).`);
  needs.forEach((effect, i) => {
    if (!isLegalTarget(s, effect, targets[i]!, controller, source, context)) reject(`Target ${i + 1} is not legal.`);
  });
}

/**
 * Targets from one "up to N targets" phrase (the same `group`) must be
 * different objects, and with `groupOwnersDiffer` belong to different players.
 */
export function groupProblem(s: GameState, needs: readonly EffectSpec[], targets: readonly Target[]): string | null {
  const seen = new Map<string, { cards: Set<string>; owners: Set<string> }>();
  for (let i = 0; i < needs.length; i++) {
    const group = needs[i]!.group;
    const t = targets[i];
    if (!group || t?.kind !== 'card') continue;
    const g = seen.get(group) ?? { cards: new Set(), owners: new Set() };
    if (g.cards.has(t.card)) return 'Choose different targets.';
    const owner = s.cards[t.card]?.owner ?? '';
    if (needs[i]!.groupOwnersDiffer && g.owners.has(owner)) return 'Choose targets belonging to different players.';
    g.cards.add(t.card);
    g.owners.add(owner);
    seen.set(group, g);
  }
  return null;
}

/** A stack item's trigger context. */
function contextOf(item: StackItem): TargetContext {
  return item.kind === 'ability' && item.defender ? { defender: item.defender } : {};
}

function sourceOf(item: StackItem): InstanceId {
  return item.kind === 'ability' ? item.source : item.card;
}

/** A spell or ability whose targets have all become illegal doesn't resolve (rule 608.2b). */
function allTargetsIllegal(s: GameState, item: StackItem): boolean {
  const needs = choosingEffects(effectsOf(s, item));
  return (
    needs.length > 0 &&
    needs.every((e, i) => !isLegalTarget(s, e, item.targets[i]!, item.controller, sourceOf(item), contextOf(item)))
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

/**
 * A paid mana ability ("{1}, {T}: Add {R}{G}"): pays `costs[payWith]` from the
 * pool, taps, and adds `outputs[output]`.
 */
function activatePaidManaAbility(ctx: Ctx, playerId: PlayerId, c: CardInstance, output: number, payWith: number): void {
  const paid = defOf(ctx.s, c).manaAbility?.paid;
  if (!paid) reject('That permanent has no such mana ability.');
  const out = paid.outputs[output];
  const cost = paid.costs[payWith];
  if (out === undefined || cost === undefined) reject('That permanent has no such mana ability.');
  payMana(ctx, playerId, parseManaCost(cost));
  tap(ctx, c);
  const made = parseManaCost(out);
  for (const t of MANA_TYPES) for (let i = 0; i < (made[t] ?? 0); i++) addMana(ctx, playerId, t, c.id);
}

/** "{T}: Add ...", plus Treasure's sacrifice and Freya's Equipment-only mana. Mana abilities don't use the stack. */
export function activateManaAbility(
  ctx: Ctx,
  playerId: PlayerId,
  id: InstanceId,
  mana: ManaType,
  output?: number,
  payWith = 0,
): void {
  const s = ctx.s;
  const c = card(s, id);
  const def = defOf(s, c);
  if (c.zone !== 'battlefield' || c.controller !== playerId) reject('You do not control that permanent.');
  if (output !== undefined) {
    if (c.tapped) reject('That permanent is already tapped.');
    if (hasType(s, c, 'creature') && c.summoningSick && !hasKeyword(s, c, 'Haste')) {
      reject('Creatures with summoning sickness can’t use tap abilities.');
    }
    activatePaidManaAbility(ctx, playerId, c, output, payWith);
    return;
  }
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
  const amount = ability?.amountWithCounters && (c.counters ?? 0) > 0 ? ability.amountWithCounters : (ability?.amount ?? 1);
  for (let i = 0; i < amount; i++) addMana(ctx, playerId, mana, id, ability?.onlyForEquipment ?? false);
  // Yuna, Grand Summoner: "When you next cast a creature spell this turn, that creature enters with N additional +1/+1 counters."
  if (ability?.nextCreatureCounters) {
    const p = player(s, playerId);
    const before = p.nextCreatureCounters?.turn === s.turnNumber ? p.nextCreatureCounters.amount : 0;
    p.nextCreatureCounters = { turn: s.turnNumber, amount: before + ability.nextCreatureCounters };
  }
  // Pain lands and Talismans: "This land deals 1 damage to you."
  if (ability?.painFor?.includes(mana)) dealDamage(ctx, id, { kind: 'player', player: playerId }, 1, false);
  if (ability?.lifeFor?.includes(mana)) changeLife(ctx, playerId, -1);
  // Millikin: "{T}, Mill a card".
  for (const top of s.players[playerId]!.library.slice(0, ability?.mill ?? 0)) moveCard(ctx, top, 'graveyard');
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
    // "You may play that card this turn."
    if (p.untilTurn !== undefined) return p.untilTurn === s.turnNumber ? 'exile' : null;
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
  x = 0,
): ManaCost {
  const base = alternative ? def.alternativeCost?.mana : from === 'graveyard' ? def.flashback : def.manaCost;
  let cost = parseManaCost(base);
  // {X}: each X symbol costs the chosen value (rule 107.3).
  if (cost.x) cost = { ...cost, generic: cost.generic + x * cost.x };
  // Commander tax: {2} more for each earlier cast from the command zone (rule 903.8).
  if (from === 'command' && card) {
    cost = { ...cost, generic: cost.generic + 2 * (s.players[card.owner]!.commanderCasts[card.id] ?? 0) };
  }
  if (def.costReduction?.ifTargetsTappedCreature) {
    const tapped = targets.some((t) => t.kind === 'card' && isCreatureOnBattlefield(s, s.cards[t.card]) && s.cards[t.card]!.tapped);
    if (tapped) cost = reduceGeneric(cost, def.costReduction.generic);
  }
  // "Costs {3} less to cast if an opponent has seven or more cards in their graveyard."
  const opponentGraveyard = def.costReduction?.ifOpponentGraveyardAtLeast;
  if (opponentGraveyard !== undefined && card) {
    const opponents = s.turnOrder.filter((pid) => pid !== card.owner && !s.players[pid]!.eliminated);
    if (opponents.some((pid) => s.players[pid]!.graveyard.length >= opponentGraveyard)) cost = reduceGeneric(cost, def.costReduction!.generic);
  }
  if (def.costReduction?.perCount && card) {
    cost = reduceGeneric(cost, def.costReduction.generic * countOf(s, def.costReduction.perCount, card.owner));
  }
  // "Noncreature spells you cast cost {1} less" (Lyse Hext).
  if (card) {
    for (const source of battlefield(s)) {
      if (source.controller !== card.owner) continue;
      for (const spec of defOf(s, source).statics ?? []) {
        const r = spec.spellCostReduction;
        if (!r || !matchesObject(s, r.filter, card, { controller: source.controller, source: source.id })) continue;
        // "The second spell you cast each turn": this would be spell number (cast so far + 1).
        if (r.nthSpell !== undefined && (s.players[card.owner]!.spellsCastThisTurn ?? 0) + 1 !== r.nthSpell) continue;
        cost = reduceGeneric(cost, r.generic);
      }
    }
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
  const costCards = choice.costCards ?? [];
  checkDiscardCost(s, playerId, def.additionalCost?.discard ?? 0, costCards, id);
  const x = choice.x ?? 0;
  if (!Number.isInteger(x) || x < 0) reject('X must be a whole number, 0 or more.');
  const manaSpent = payMana(ctx, playerId, spellCost(s, def, from, targets, c, alternative, x), isEquipment(s, c));
  if (alternative && def.alternativeCost?.life) changeLife(ctx, playerId, -def.alternativeCost.life);
  for (const discarded of costCards) discard(ctx, discarded);
  if (from === 'command') {
    const casts = player(s, c.owner).commanderCasts;
    casts[id] = (casts[id] ?? 0) + 1;
  }

  moveCard(ctx, id, 'stack');
  if (from === 'graveyard') c.castFromGraveyard = true;
  const caster = player(s, playerId);
  caster.spellsCastThisTurn = (caster.spellsCastThisTurn ?? 0) + 1;
  if (!def.types.includes('creature')) caster.noncreatureSpellsThisTurn = (caster.noncreatureSpellsThisTurn ?? 0) + 1;
  const next = player(s, playerId).nextCreatureCounters;
  if (next && def.types.includes('creature')) {
    if (next.turn === s.turnNumber) c.extraCountersOnEnter = next.amount;
    delete player(s, playerId).nextCreatureCounters;
  }
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
    ...(x > 0 ? { x } : {}),
  };
  s.stack.push(item);
  ctx.ev.push({ type: 'SpellCast', player: playerId, card: id, defId: c.defId, targets, manaSpent });
  ctx.ev.push({ type: 'StackItemAdded', item: item.id, card: id });
}

/** What activating an ability costs with these targets (equip discounts depend on the target). */
export function abilityCost(s: GameState, spec: ActivatedSpec, targets: Target[], source?: CardInstance): ManaCost {
  let cost = parseManaCost(spec.cost.mana);
  // Puresteel Paladin's metalcraft: "Equipment you control have equip {0}".
  if (spec.equip && source) {
    const yours = battlefield(s).filter((c) => c.controller === source.controller);
    const artifacts = yours.filter((c) => hasType(s, c, 'artifact')).length;
    for (const other of yours) {
      const e = (defOf(s, other).statics ?? []).find((st) => st.equipCost)?.equipCost;
      if (e && artifacts >= e.ifArtifactsAtLeast) cost = parseManaCost(e.mana);
    }
  }
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
  if (spec.ifYouControl) {
    const meets = (x: CardInstance) => x.controller === playerId && matchesObject(s, spec.ifYouControl, x, { controller: playerId, source: c.id });
    if (!battlefield(s).some(meets)) return "You don't meet the condition to activate that.";
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

/** Which counter a "remove a counter" cost takes when any kind will do: the least useful one first. */
const COUNTER_COST_ORDER: AnyCounter[] = ['stun', 'page', 'soul', '+1/+1', 'flying', 'shield'];

function counterToRemove(c: CardInstance, kind: AnyCounter | undefined): AnyCounter | undefined {
  if (kind) return countersOf(c, kind) > 0 ? kind : undefined;
  return COUNTER_COST_ORDER.find((k) => countersOf(c, k) > 0);
}

/** Permanents a player could remove a counter from for a "remove a counter from a permanent you control" cost. */
export function counterCostCandidates(s: GameState, playerId: PlayerId, spec: ActivatedSpec, source: InstanceId): InstanceId[] {
  const rc = spec.cost.removeCounter;
  if (!rc?.from) return [];
  return battlefield(s)
    .filter((c) => c.controller === playerId && matchesObject(s, rc.from, c, { controller: playerId, source }) && counterToRemove(c, rc.counter))
    .map((c) => c.id);
}

/** Why an ability's discard or sacrifice cost can't be paid right now, or null. */
export function costCardProblem(s: GameState, playerId: PlayerId, c: CardInstance, spec: ActivatedSpec): string | null {
  const rc = spec.cost.removeCounter;
  if (rc && (rc.from ? counterCostCandidates(s, playerId, spec, c.id).length === 0 : !counterToRemove(c, rc.counter))) {
    return 'There is no counter to remove for that.';
  }
  if (spec.cost.sacrifice && sacrificeCandidates(s, playerId, spec.cost.sacrifice, c.id).length === 0) return 'You have nothing to sacrifice for that.';
  const n = spec.cost.discard ?? 0;
  if (n > 0 && player(s, playerId).hand.filter((id) => id !== c.id).length < n) return "You don't have enough cards to discard.";
  return null;
}

/** Activates a non-mana ability: pay its costs and put it on the stack (rule 602). */
/** Checks the cards chosen to pay a "discard N cards" cost: other cards in your hand. */
function checkDiscardCost(s: GameState, playerId: PlayerId, count: number, cards: InstanceId[], source: InstanceId): void {
  if (cards.length !== count) reject(count ? `Choose ${count} card(s) to discard.` : 'Nothing needs to be discarded.');
  const hand = player(s, playerId).hand;
  if (new Set(cards).size !== cards.length || cards.some((c) => c === source || !hand.includes(c))) {
    reject('The cards to discard must be other cards in your hand.');
  }
}

/** Permanents a player could sacrifice for a "Sacrifice a ..." cost (the source itself counts if it matches). */
export function sacrificeCandidates(s: GameState, playerId: PlayerId, filter: ObjectFilter, source: InstanceId): InstanceId[] {
  return battlefield(s)
    .filter((c) => c.controller === playerId && matchesObject(s, filter, c, { controller: playerId, source }))
    .map((c) => c.id);
}

/** Ways to pay an ability's "discard" or "sacrifice a ..." cost: one list of cards per way. */
export function costCardChoices(s: GameState, playerId: PlayerId, spec: ActivatedSpec, source: InstanceId): InstanceId[][] {
  // No way to pay at all (no counter to remove, nothing to sacrifice, too few cards to discard).
  if (costCardProblem(s, playerId, s.cards[source]!, spec)) return [];
  if (spec.cost.sacrifice) return sacrificeCandidates(s, playerId, spec.cost.sacrifice, source).map((id) => [id]);
  if (spec.cost.removeCounter?.from) return counterCostCandidates(s, playerId, spec, source).map((id) => [id]);
  const n = spec.cost.discard ?? 0;
  if (n === 0) return [[]];
  return subsets(player(s, playerId).hand.filter((id) => id !== source), n, n);
}

/** Every subset of `items` with between `min` and `max` elements, in order (capped for huge hands). */
export function subsets<T>(items: readonly T[], min: number, max: number, cap = 200): T[][] {
  const out: T[][] = [];
  const walk = (start: number, picked: T[]) => {
    if (out.length >= cap) return;
    if (picked.length >= min) out.push([...picked]);
    if (picked.length === max) return;
    for (let i = start; i < items.length; i++) walk(i + 1, [...picked, items[i]!]);
  };
  walk(0, []);
  return out;
}

export function activateAbility(
  ctx: Ctx,
  playerId: PlayerId,
  id: InstanceId,
  index: number,
  targets: Target[] = [],
  costCards: InstanceId[] = [],
): void {
  const s = ctx.s;
  const c = card(s, id);
  const spec = activatedAbilities(defOf(s, c))[index];
  if (!spec) reject('That card has no such ability.');
  const problem = activationProblem(s, playerId, c, spec);
  if (problem) reject(problem);
  checkTargets(s, spec.effects, targets, playerId, id);
  const rc = spec.cost.removeCounter;
  if (spec.cost.sacrifice) {
    if (costCards.length !== 1 || !sacrificeCandidates(s, playerId, spec.cost.sacrifice, id).includes(costCards[0]!)) {
      reject('Choose one permanent you control to sacrifice for that.');
    }
  } else if (rc?.from) {
    if (costCards.length !== 1 || !counterCostCandidates(s, playerId, spec, id).includes(costCards[0]!)) {
      reject('Choose a permanent you control to remove a counter from.');
    }
  } else {
    checkDiscardCost(s, playerId, spec.cost.discard ?? 0, costCards, id);
  }
  if (rc && !rc.from && !counterToRemove(c, rc.counter)) reject('There is no counter to remove for that.');
  payMana(ctx, playerId, abilityCost(s, spec, targets, c), spec.equip ?? false);
  if (spec.cost.tap) tap(ctx, c);
  if (rc) {
    const from = s.cards[rc.from ? costCards[0]! : id]!;
    removeCounters(ctx, from.id, counterToRemove(from, rc.counter)!, 1);
  }
  if (spec.cost.sacrifice) sacrifice(ctx, costCards[0]!);
  else if (!rc?.from) for (const discarded of costCards) discard(ctx, discarded);
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
  if (!t || t.kind === 'none') return null;
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
    case 'TriggeringCard': {
      const subject = item.kind === 'ability' ? item.subject : undefined;
      return subject && s.cards[subject]?.zone === 'graveyard' ? [{ kind: 'card', card: subject }] : [];
    }
    case 'CreatedTokens':
      return r.createdTokens.filter((id) => s.cards[id]!.zone === 'battlefield').map((id) => ({ kind: 'card', card: id }));
    case 'ActivePlayer':
      return s.players[s.activePlayer]!.eliminated ? [] : toPlayers([s.activePlayer]);
    case 'EachOpponentWhoLostLifeThisTurn':
      return toPlayers(alivePlayers(s).filter((id) => id !== item.controller && (s.players[id]!.lifeLostThisTurn ?? 0) > 0));
    case 'EachPlayerWhoChose':
    case 'EachOpponentWhoChose':
    case 'EachOpponentWhoDidNotChoose': {
      const chose = (pid: PlayerId) => (r.chosen ?? []).some((c) => c.player === pid && c.cards.length > 0);
      const alive = alivePlayers(s);
      if (effect.target === 'EachPlayerWhoChose') return toPlayers(alive.filter(chose));
      const opponents = alive.filter((id) => id !== item.controller);
      return toPlayers(effect.target === 'EachOpponentWhoChose' ? opponents.filter(chose) : opponents.filter((id) => !chose(id)));
    }
    case 'AllPermanents': {
      const viewpoint = { controller: item.controller, source: sourceOf(item), ...contextOf(item) };
      return battlefield(s)
        .filter((c) => matchesObject(s, effect.filter, c, viewpoint))
        .map((c) => ({ kind: 'card', card: c.id }));
    }
    default:
      return chosen && isLegalTarget(s, effect, chosen, item.controller, sourceOf(item), contextOf(item)) ? [chosen] : [];
  }
}

function topOfLibrary(s: GameState, playerId: PlayerId, n: number): InstanceId[] {
  return s.players[playerId]!.library.slice(0, n);
}

/** An effect's amount, including ones that refer back to earlier in the same spell or ability. */
function resolvedAmount(s: GameState, effect: EffectSpec, r: Resolving): number {
  const a = effect.amount;
  if (a !== undefined && typeof a === 'object' && 'of' in a) {
    const base =
      a.of === 'previousTargetPower'
        ? Math.max(0, r.previousTargetPower ?? 0)
        : a.of === 'destroyedThisWay'
          ? (r.destroyedCount ?? 0)
          : a.of === 'chosenCount'
            ? (r.chosen ?? []).reduce((n, c) => n + c.cards.length, 0)
            : a.of === 'sourcePower'
              ? sourcePower(s, r.item)
              : a.of === 'previousTargetManaValue'
                ? previousManaValue(s, r)
                : a.of === 'x'
                  ? r.item.kind === 'spell'
                    ? (r.item.x ?? 0)
                    : (s.cards[r.item.source]!.xPaid ?? 0)
                  : a.of === 'lifeLostThisWay'
                    ? (r.lifeLostThisWay ?? 0)
                    : a.of === 'revealedManaValue'
                      ? (r.revealedManaValue ?? 0)
              : a.of === 'subjectPower' || a.of === 'subjectCounters' || a.of === 'subjectPlusOneCounters'
                ? subjectAmount(s, r.item, a.of)
                : (r.chosenManaValue ?? 0);
    return base + (a.plus ?? 0);
  }
  return amountOf(s, a, r.item.controller, sourceOf(r.item));
}

/**
 * Queues each player's choice for Discard, Sacrifice and KeepAndSacrificeRest,
 * in turn order from the active player. continueResolving asks for them
 * before the next effect.
 */
function queueChoices(s: GameState, effect: EffectSpec, r: Resolving, players: PlayerId[], amount: number): void {
  r.chosen = [];
  r.chosenManaValue = 0;
  r.chosenTypes = { creature: false, noncreature: false };
  const order = aliveFromActive(s).filter((pid) => players.includes(pid));
  const source = sourceOf(r.item);
  for (const pid of order) {
    if (effect.effect === 'PutFromHand') {
      const cards = s.players[pid]!.hand.filter((id) => matchesObject(s, effect.filter, s.cards[id]!, { controller: pid }));
      if (cards.length === 0) continue;
      const max = Math.min(Math.max(1, amount), cards.length);
      r.choiceQueue = [...(r.choiceQueue ?? []), { player: pid, purpose: 'battlefield', cards, min: effect.optional ? 0 : max, max }];
      continue;
    }
    if (effect.effect === 'Discard') {
      const hand = s.players[pid]!.hand;
      if (hand.length === 0) continue;
      if (effect.wholeHand) r.choiceQueue = [...(r.choiceQueue ?? []), { player: pid, purpose: 'discard', cards: [...hand], min: 0, max: hand.length, allOrNothing: true }];
      else {
        const max = effect.anyNumber ? hand.length : Math.min(amount, hand.length);
        const min = effect.anyNumber || effect.optional ? 0 : max;
        r.choiceQueue = [...(r.choiceQueue ?? []), { player: pid, purpose: 'discard', cards: [...hand], min, max }];
      }
      continue;
    }
    // Each player picks among their own permanents, or the spell's controller picks for them (Tragic Arrogance).
    const chooser = effect.chooser === 'You' ? r.item.controller : pid;
    const cards = battlefield(s)
      .filter((c) => c.controller === pid && matchesObject(s, effect.filter, c, { controller: pid, source }))
      .map((c) => c.id);
    if (cards.length === 0) continue;
    if (effect.effect === 'Sacrifice') {
      const max = Math.min(amount, cards.length);
      r.choiceQueue = [...(r.choiceQueue ?? []), { player: chooser, purpose: 'sacrifice', cards, min: effect.optional ? 0 : max, max }];
    } else {
      const max = effect.onePerType ? effect.onePerType.length : Math.min(amount, cards.length);
      r.choiceQueue = [
        ...(r.choiceQueue ?? []),
        {
          player: chooser,
          purpose: 'keep',
          cards,
          min: 0,
          max,
          ...(effect.onePerType ? { onePerType: effect.onePerType } : {}),
        },
      ];
    }
  }
}

/** Why a set of chosen cards doesn't fit a choice, or null if it does. */
export function choiceProblem(s: GameState, choice: CardChoice, cards: InstanceId[]): string | null {
  if (new Set(cards).size !== cards.length || cards.some((id) => !choice.cards.includes(id))) return 'Choose from the cards offered.';
  if (choice.allOrNothing) return cards.length === 0 || cards.length === choice.cards.length ? null : 'Choose all of them or none.';
  if (cards.length < choice.min || cards.length > choice.max) {
    return choice.min === choice.max ? `Choose exactly ${choice.min}.` : `Choose between ${choice.min} and ${choice.max}.`;
  }
  if (choice.onePerType) {
    // Each chosen card must stand for a different one of the types.
    const types = choice.onePerType;
    const fits = (i: number, used: Set<string>): boolean =>
      i === cards.length ||
      types.some((t) => !used.has(t) && hasType(s, s.cards[cards[i]!]!, t) && fits(i + 1, new Set([...used, t])));
    if (!fits(0, new Set())) return `Choose at most one ${types.join(', one ')}.`;
  }
  return null;
}

/** "This creature's power": now, or as it last was on the battlefield if it has left (rule 608.2h). */
function sourcePower(s: GameState, item: StackItem): number {
  const c = s.cards[sourceOf(item)]!;
  if (c.zone === 'battlefield') return Math.max(0, powerOf(s, c));
  return Math.max(0, c.lastPower ?? defOf(s, c).power ?? 0);
}

function previousManaValue(s: GameState, r: Resolving): number {
  const t = r.previousTarget;
  const c = t?.kind === 'card' ? s.cards[t.card] : undefined;
  return c ? manaValue(parseManaCost(defOf(s, c).manaCost)) : 0;
}

/** The triggering object's power, or how many counters it had as it left the battlefield. */
function subjectAmount(s: GameState, item: StackItem, of: 'subjectPower' | 'subjectCounters' | 'subjectPlusOneCounters'): number {
  const c = item.kind === 'ability' && item.subject ? s.cards[item.subject] : undefined;
  if (!c) return 0;
  if (of === 'subjectPlusOneCounters') return c.zone === 'battlefield' ? (c.counters ?? 0) : (c.lastCounters?.['+1/+1'] ?? 0);
  if (of === 'subjectPower') return Math.max(0, c.zone === 'battlefield' ? powerOf(s, c) : (c.lastPower ?? defOf(s, c).power ?? 0));
  return c.zone === 'battlefield' ? totalCounters(c) : Object.values(c.lastCounters ?? {}).reduce((n, k) => n + k, 0);
}

/**
 * Which one counter "move a counter" takes. The engine chooses: onto an
 * opponent's permanent, a stun counter if there is one; otherwise the most
 * useful counter for its new controller.
 */
const HELPFUL_COUNTERS: AnyCounter[] = ['+1/+1', 'shield', 'flying', 'page', 'soul', 'stun'];
const HARMFUL_COUNTERS: AnyCounter[] = ['stun', 'page', 'soul', 'flying', 'shield', '+1/+1'];

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
    case 'DealDamage': {
      // "That creature deals damage equal to its power" (Flayer of the Hatebound).
      const subject = item.kind === 'ability' ? item.subject : undefined;
      const from = effect.damageSource === 'TriggeringObject' && subject ? subject : source;
      for (const t of targets) dealDamage(ctx, from, t, amount, false);
      return;
    }
    case 'DrawCards':
      for (const t of targets) if (t.kind === 'player') drawCards(ctx, t.player, amount);
      return;
    case 'GainLife':
      for (const t of targets) if (t.kind === 'player') changeLife(ctx, t.player, amount);
      return;
    case 'LoseLife':
      for (const t of targets) {
        if (t.kind !== 'player') continue;
        const before = s.players[t.player]!.life;
        changeLife(ctx, t.player, -amount);
        r.lifeLostThisWay = (r.lifeLostThisWay ?? 0) + (before - s.players[t.player]!.life);
      }
      return;
    case 'Destroy':
      for (const id of onBattlefield) if (destroy(ctx, id)) r.destroyedCount = (r.destroyedCount ?? 0) + 1;
      return;
    case 'Exile':
      // A card in a graveyard ("exile target creature card from a graveyard").
      for (const id of cards) if (s.cards[id]!.zone === 'graveyard') moveCard(ctx, id, 'exile');
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
    case 'Discard':
    case 'Sacrifice':
    case 'KeepAndSacrificeRest':
      queueChoices(s, effect, r, targetPlayers(targets), amount);
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
    case 'AddCounters': {
      const src = s.cards[source]!;
      // Adapt: only if it has no +1/+1 counters. Monstrosity: only once.
      if (effect.ifSourceHasNoCounters && (src.counters ?? 0) > 0) return;
      if (effect.monstrosity) {
        if (src.zone !== 'battlefield' || src.monstrous) return;
        src.monstrous = true;
      }
      for (const id of onBattlefield) addCounters(ctx, id, amount, item.controller, effect.counter);
      return;
    }
    case 'PutLastCounters': {
      const from = effect.countersOf === 'TriggeringCard' && item.kind === 'ability' ? item.subject : source;
      const last = from ? s.cards[from]?.lastCounters : undefined;
      for (const id of onBattlefield) {
        for (const [kind, n] of Object.entries(last ?? {})) addCounters(ctx, id, n, item.controller, kind as AnyCounter);
      }
      return;
    }
    case 'RevealUntil': {
      const library = s.players[item.controller]!.library;
      const revealed: InstanceId[] = [];
      let found: InstanceId | undefined;
      for (const id of library) {
        revealed.push(id);
        ctx.ev.push({ type: 'CardRevealed', player: item.controller, card: id, defId: s.cards[id]!.defId });
        if (matchesObject(s, effect.filter, s.cards[id]!, { controller: item.controller })) {
          found = id;
          break;
        }
      }
      const rest = revealed.filter((id) => id !== found);
      if (found) {
        r.revealedManaValue = manaValue(parseManaCost(defOf(s, s.cards[found]!).manaCost));
        moveCard(ctx, found, 'hand');
      }
      // The rest go on the bottom in a random order.
      for (const id of rest) library.splice(library.indexOf(id), 1);
      shuffleInPlace(s, rest);
      library.push(...rest);
      return;
    }
    case 'GainControl':
      for (const id of onBattlefield) {
        const c = s.cards[id]!;
        if (c.controller === item.controller) continue;
        c.controller = item.controller;
        c.summoningSick = true;
        if (c.attachedTo) delete c.attachedTo;
        ctx.ev.push({ type: 'ControlChanged', card: id, controller: item.controller });
      }
      return;
    case 'WinGame':
      for (const pid of targetPlayers(targets)) {
        for (const other of alivePlayers(s)) if (other !== pid) s.players[other]!.lostToEffect = true;
      }
      return;
    case 'AttachLastEquipment': {
      const equipment = (s.cards[source]!.lastEquippedBy ?? [])
        .map((id) => s.cards[id]!)
        .find((e) => e.zone === 'battlefield' && e.controller === item.controller && !e.attachedTo);
      if (equipment && onBattlefield[0]) attach(ctx, equipment.id, onBattlefield[0]);
      return;
    }
    case 'CreateToken':
      // "Create a number of tokens equal to ..." can be zero.
      for (let i = 0; i < amount; i++) {
        const id = createToken(ctx, effect.token!, item.controller);
        if (effect.entersTapped) s.cards[id]!.tapped = true;
        r.createdTokens.push(id);
      }
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
          ...(effect.power !== undefined || effect.powerFromAmount
            ? { power: (effect.power ?? 0) + (effect.powerFromAmount ? amount : 0) }
            : {}),
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
        s.cards[id]!.playableFromExile = {
          player: item.controller,
          source,
          ...(effect.thisTurn ? { untilTurn: s.turnNumber } : {}),
        };
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
        if (effect.underYourControl) c.controller = item.controller;
        c.summoningSick = true;
        if (effect.entersTapped || entersTapped(s, c)) c.tapped = true;
        addCounters(ctx, id, effect.counters ?? 0, item.controller, effect.counter);
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
    case 'Untap': {
      const untapped = onBattlefield.filter((id) => untap(ctx, s.cards[id]!));
      if (untapped.length > 0) ctx.ev.push({ type: 'CardsUntapped', player: item.controller, cards: untapped });
      return;
    }
    case 'ChooseTarget':
      return;
    case 'MoveCounters': {
      const t = effect.from !== undefined ? item.targets[effect.from] : undefined;
      const fromCard = t?.kind === 'card' ? s.cards[t.card] : undefined;
      if (!fromCard || fromCard.zone !== 'battlefield') return;
      for (const id of onBattlefield) {
        if (id === fromCard.id) continue;
        let moves: [AnyCounter, number][];
        if (effect.allCounters) moves = allCounters(fromCard);
        else if (effect.anyKind) {
          const order = s.cards[id]!.controller === item.controller ? HELPFUL_COUNTERS : HARMFUL_COUNTERS;
          const kind = order.find((k) => countersOf(fromCard, k) > 0);
          moves = kind ? [[kind, 1]] : [];
        } else moves = [['+1/+1', Math.min(Math.max(1, amount), fromCard.counters ?? 0)]];
        for (const [kind, n] of moves) {
          const moved = removeCounters(ctx, fromCard.id, kind, n);
          addCounters(ctx, id, moved, item.controller, kind);
        }
      }
      return;
    }
    case 'AttachEquipmentTo': {
      const t = effect.from !== undefined ? item.targets[effect.from] : undefined;
      const equipment = t?.kind === 'card' ? s.cards[t.card] : undefined;
      if (!equipment || equipment.zone !== 'battlefield' || equipment.controller !== item.controller) return;
      for (const id of onBattlefield) attach(ctx, equipment.id, id);
      return;
    }
    case 'PutFromHand':
      queueChoices(s, effect, r, targetPlayers(targets), amount);
      return;
    case 'Proliferate':
      // The engine chooses: every kind on your own permanents except stun counters, and stun counters on opponents'.
      // "Proliferate X times": `amount` rounds.
      for (let round = 0; round < (effect.amount === undefined ? 1 : amount); round++)
      for (const pid of targetPlayers(targets)) {
        for (const c of battlefield(s)) {
          for (const [kind] of allCounters(c)) {
            if (c.controller === pid ? kind !== 'stun' : kind === 'stun') addCounters(ctx, c.id, 1, pid, kind);
          }
        }
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
        // One card, or up to `amount` ("up to X basic land cards"; simplified: as many as possible).
        const howMany = effect.amount === undefined ? 1 : amount;
        const found = p.library.filter((id) => matchesObject(s, effect.filter, s.cards[id]!, { controller: searcher })).slice(0, howMany);
        for (const id of found) {
          moveCard(ctx, id, 'battlefield');
          const c = s.cards[id]!;
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
      const howMany = effect.amount === undefined ? 1 : amount;
      const found = p.library.filter((id) => matchesObject(s, effect.filter, s.cards[id]!, { controller: item.controller })).slice(0, howMany);
      const lands = (pid: PlayerId) => battlefield(s).filter((c) => c.controller === pid && hasType(s, c, 'land')).length;
      const behind = effect.toBattlefieldIfBehindOnLands && alivePlayers(s).some((pid) => lands(pid) > lands(item.controller));
      for (const id of found) {
        moveCard(ctx, id, behind ? 'battlefield' : 'hand');
        if (!behind) continue;
        const c = s.cards[id]!;
        c.controller = item.controller;
        c.summoningSick = true;
        c.tapped = true;
      }
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
    // Players still to choose cards (discard, sacrifice) for the last effect.
    const choice = (r.choiceQueue ?? []).find((c) => !s.players[c.player]!.eliminated);
    r.choiceQueue = (r.choiceQueue ?? []).filter((c) => !s.players[c.player]!.eliminated);
    if (choice) {
      s.pending = { kind: 'chooseCards', ...choice };
      return;
    }
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
    // "If you do": something was chosen in the last choice (of the right kind, for Mog).
    if (effect.ifChose) {
      const any = (r.chosen ?? []).some((c) => c.cards.length > 0);
      const ok = effect.ifChose === 'any' ? any : !!r.chosenTypes?.[effect.ifChose];
      if (!ok) continue;
    }
    if (effect.ifLifeGainedThisTurn) {
      const gained = s.players[item.controller]!.lifeGainedThisTurn ?? 0;
      const { atLeast, below } = effect.ifLifeGainedThisTurn;
      if ((atLeast !== undefined && gained < atLeast) || (below !== undefined && gained >= below)) continue;
    }
    if (effect.ifPreviousTargetManaValueAtLeast !== undefined) {
      const t = r.previousTarget;
      const c = t?.kind === 'card' ? s.cards[t.card] : undefined;
      if (!c || manaValue(parseManaCost(defOf(s, c).manaCost)) < effect.ifPreviousTargetManaValueAtLeast) continue;
    }
    if (effect.ifYourGraveyard) {
      const n = s.players[item.controller]!.graveyard.length;
      const { atLeast, below } = effect.ifYourGraveyard;
      if ((atLeast !== undefined && n < atLeast) || (below !== undefined && n >= below)) continue;
    }
    if (effect.ifYouControl) {
      const { filter, atLeast = 1 } = effect.ifYouControl;
      const viewpoint = { controller: item.controller, source: sourceOf(item) };
      if (battlefield(s).filter((c) => c.controller === item.controller && matchesObject(s, filter, c, viewpoint)).length < atLeast) continue;
    }
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
      const extra = c.extraCountersOnEnter ?? 0;
      moveCard(ctx, c.id, 'battlefield');
      if (item.x) c.xPaid = item.x;
      if (def.entersWithXCounters) addCounters(ctx, c.id, item.x ?? 0, item.controller);
      if (item.castFrom === 'graveyard') c.castFromGraveyard = true;
      c.controller = item.controller;
      c.summoningSick = true;
      if (entersTapped(s, c)) c.tapped = true;
      addCounters(ctx, c.id, extra, item.controller);
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

/** The ChooseCards action: the chosen cards are discarded, sacrificed, or kept (and the others sacrificed). */
export function chooseCards(ctx: Ctx, playerId: PlayerId, cards: InstanceId[]): void {
  const s = ctx.s;
  const pending = s.pending;
  if (pending.kind !== 'chooseCards' || pending.player !== playerId || !s.resolving) reject('You are not choosing cards right now.');
  const problem = choiceProblem(s, pending, cards);
  if (problem) reject(problem);
  const r = s.resolving;
  r.choiceQueue = (r.choiceQueue ?? []).slice(1);
  for (const id of cards) {
    const c = s.cards[id]!;
    r.chosenManaValue = (r.chosenManaValue ?? 0) + manaValue(parseManaCost(defOf(s, c).manaCost));
    const kinds = r.chosenTypes ?? { creature: false, noncreature: false };
    r.chosenTypes = hasType(s, c, 'creature') ? { ...kinds, creature: true } : { ...kinds, noncreature: true };
  }
  if (pending.purpose === 'discard') for (const id of cards) discard(ctx, id);
  else if (pending.purpose === 'battlefield') {
    for (const id of cards) {
      moveCard(ctx, id, 'battlefield');
      const c = s.cards[id]!;
      c.controller = pending.player;
      c.summoningSick = true;
      if (entersTapped(s, c)) c.tapped = true;
    }
  }
  else if (pending.purpose === 'sacrifice') for (const id of cards) sacrifice(ctx, id);
  else for (const id of pending.cards) if (!cards.includes(id) && s.cards[id]!.zone === 'battlefield') sacrifice(ctx, id);
  // Whose cards they were: the chooser's own, except when the spell's controller chose for everyone.
  const owner = cards.length ? s.cards[cards[0]!]!.owner : pending.player;
  r.chosen = [...(r.chosen ?? []), { player: pending.purpose === 'keep' ? owner : pending.player, cards }];
  continueResolving(ctx);
}

/** Carries on resolving after the player who had to choose left the game. */
export function resumeResolving(ctx: Ctx): void {
  continueResolving(ctx);
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
