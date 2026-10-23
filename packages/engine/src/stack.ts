// Casting spells, playing lands, activating abilities, and resolving the
// stack (PRD 7.2).

import { spellDefinition } from './cardface.ts';
import { allCounters, amountOf, characteristics, countOf, countersOf, isEquipment, powerOf, totalCounters } from './characteristics.ts';
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
  newTimestamp,
  phaseOut,
  player,
  reject,
  removeCounters,
  sacrifice,
  tap,
  untap,
  type Ctx,
} from './state.ts';
import { givePriority } from './turn.ts';
import { canReveal, colorsOf, entersTapped, isPermanentCard, isSpellCard, manaAbilityAmount, grantedManaAbilities, canCastLibraryTop, legendaryManaCreatures, manaChoices, objectManaValue } from './typerules.ts';
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
  type StaticSpec,
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
  // "Equip legendary creature {3}" (Wrecking Ball Arm).
  if (def.equipLegendary) {
    out.push({
      cost: { mana: def.equipLegendary },
      sorcerySpeed: true,
      equip: true,
      effects: [{ effect: 'Attach', target: 'TargetPermanent', filter: { types: ['creature'], controller: 'You', supertypes: ['Legendary'] } }],
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
  if (def.unearth) {
    out.push({
      cost: { mana: def.unearth },
      zone: 'graveyard',
      sorcerySpeed: true,
      effects: [{ effect: 'ReturnToBattlefield', target: 'This', unearth: true }],
    });
  }
  return out;
}

/** What a triggered or activated ability on the stack does. */
export function abilitySpec(s: GameState, item: AbilityItem): TriggerSpec | ActivatedSpec {
  const def = defOf(s, s.cards[item.source]!);
  return item.from === 'trigger' ? withMode(def.triggers![item.ability]!, item.mode, item.modes) : activatedAbilities(def)[item.ability]!;
}

/** "Choose one at random": the trigger with the mode that came up as its effects. */
export function withMode(spec: TriggerSpec, mode: number | undefined, modes?: number[]): TriggerSpec {
  if (spec.modes && modes) return { ...spec, effects: [...modes].sort((a, b) => a - b).flatMap((i) => spec.modes![i] ?? []) };
  return spec.randomModes && mode !== undefined ? { ...spec, effects: spec.randomModes[mode] ?? [] } : spec;
}

/** The trigger behind a queued trigger, with its random mode. */
export function queuedTriggerSpec(s: GameState, t: { source: InstanceId; ability: number; mode?: number; modes?: number[] }): TriggerSpec {
  return withMode(defOf(s, s.cards[t.source]!).triggers![t.ability]!, t.mode, t.modes);
}

/** The trigger behind an ability item, if it is a triggered ability. */
export function triggerSpec(s: GameState, item: AbilityItem): TriggerSpec | undefined {
  return item.from === 'trigger' ? (abilitySpec(s, item) as TriggerSpec) : undefined;
}

/** How a spell is being cast: its mode or modes, and whether for its alternative cost. */
export interface SpellChoice {
  adventure?: boolean;
  improvise?: InstanceId[];
  graveyardSource?: InstanceId;
  /** The value chosen for {X}. */
  x?: number;
  mode?: number;
  modes?: number[];
  alternative?: boolean;
  /** Cards discarded to pay an additional cost. */
  costCards?: InstanceId[];
  /** Convoke: creatures tapped to help pay. */
  convoke?: InstanceId[];
  /** Delve: graveyard cards exiled to help pay. */
  delve?: InstanceId[];
  /** Times kicker or multikicker is paid. */
  kicks?: number;
  /** Escalate: creatures tapped, one per mode beyond the first. */
  tapCreatures?: InstanceId[];
}

/**
 * A spell's effects for the way it's cast: an alternative cost's own effects
 * (overload), the chosen modes in printed order (rule 700.2), or its effects.
 */
export function spellEffects(def: CardDefinition, choice: SpellChoice = {}): EffectSpec[] {
  def = spellDefinition(def, choice.adventure);
  if (choice.alternative && def.alternativeCost?.effects) return def.alternativeCost.effects;
  if (def.modes && def.chooseModes) return [...(choice.modes ?? [])].sort((a, b) => a - b).flatMap((m) => def.modes![m] ?? []);
  if (def.modes) return def.modes[choice.mode ?? 0] ?? [];
  return def.effects ?? [];
}

/** The effects a stack item applies when it resolves. */
export function effectsOf(s: GameState, item: StackItem): EffectSpec[] {
  if (item.kind === 'ability') {
    const spec = abilitySpec(s, item);
    const discard = item.from === 'trigger' ? (spec as TriggerSpec).cost?.discard : undefined;
    return discard ? [{ effect: 'Discard', target: 'You', amount: discard }, ...spec.effects] : spec.effects;
  }
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
  /**
   * For a triggered ability. Ward is simplified: an opponent's triggered
   * ability can't target a permanent with ward (as if its ward cost went unpaid).
   */
  triggered?: boolean;
  /** For a triggered ability: the object the event happened to (the spell that was cast). */
  subject?: InstanceId;
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
  if (t.kind === 'ability') return kind === 'TargetAbility' && s.stack.some((item) => item.kind === 'ability' && item.id === t.ability);
  const c = s.cards[t.card];
  if (!c) return false;
  const viewpoint = {
    controller,
    ...(source ? { source } : {}),
    ...(context.defender ? { defender: context.defender } : {}),
    ...(context.subject ? { subject: context.subject } : {}),
  };
  if (kind === 'TargetSpellPermanentOrGraveyardCard') {
    if (c.zone === 'graveyard') return !s.players[c.owner]!.eliminated;
    if (c.zone === 'stack') return c.id !== source && s.stack.some((i) => i.kind === 'spell' && i.card === c.id);
    return !defOf(s, c).types.includes('land') && isLegalTarget(s, { ...effect, target: 'TargetPermanent' }, t, controller, source, context);
  }
  if (kind === 'TargetSpell') {
    // A spell on the stack (not the spell or ability doing the targeting).
    const spell = s.stack.find((i) => i.kind === 'spell' && i.card === c.id);
    return !!spell && c.id !== source && matchesObject(s, effect.filter, c, viewpoint, spell.controller);
  }
  if (kind === 'TargetCardInGraveyard') {
    // A player who left the game took their cards with them (rule 800.4a).
    return c.zone === 'graveyard' && !s.players[c.owner]!.eliminated && matchesObject(s, effect.filter, c, viewpoint);
  }
  if (c.zone !== 'battlefield' || c.phasedOut) return false;
  if (context.triggered && c.controller !== controller && characteristics(s, c).ward > 0) return false;
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
  if (effect.target === 'TargetCardInGraveyard' || effect.target === 'TargetSpellPermanentOrGraveyardCard') {
    for (const pid of s.turnOrder) for (const id of s.players[pid]!.graveyard) all.push({ kind: 'card', card: id });
  }
  if (effect.target === 'TargetSpell' || effect.target === 'TargetSpellPermanentOrGraveyardCard') {
    for (const item of s.stack) if (item.kind === 'spell') all.push({ kind: 'card', card: item.card });
  }
  if (effect.target === 'TargetAbility') {
    for (const item of s.stack) if (item.kind === 'ability') all.push({ kind: 'ability', ability: item.id });
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
  if (item.kind !== 'ability') return {};
  return {
    ...(item.defender ? { defender: item.defender } : {}),
    ...(item.from === 'trigger' ? { triggered: true } : {}),
    ...(item.subject ? { subject: item.subject } : {}),
  };
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
  tapCreature?: InstanceId,
  grantedBy?: InstanceId,
): void {
  const s = ctx.s;
  const c = card(s, id);
  const def = defOf(s, c);
  if (c.zone !== 'battlefield' || c.phasedOut || c.controller !== playerId) reject('You do not control that permanent.');
  if (grantedBy !== undefined) {
    if (tapCreature !== undefined || output !== undefined || !grantedManaAbilities(s, c).some((ability) => ability.source === grantedBy && ability.mana.includes(mana))) reject('That granted mana ability is not available.');
    if (c.tapped || (c.summoningSick && !hasKeyword(s, c, 'Haste'))) reject('That creature cannot tap for mana right now.');
    tap(ctx, c);
    addMana(ctx, playerId, mana, id);
    return;
  }
  if (tapCreature !== undefined) {
    if (output !== undefined || !legendaryManaCreatures(s, c).some((candidate) => candidate.id === tapCreature)) reject('Tap an untapped legendary creature you control.');
    if (!['W', 'U', 'B', 'R', 'G'].includes(mana)) reject('Choose a color of mana.');
    tap(ctx, card(s, tapCreature));
    addMana(ctx, playerId, mana, id);
    return;
  }
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
  const amount = manaAbilityAmount(c, def);
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
  adventure = false,
): 'hand' | 'graveyard' | 'exile' | 'command' | 'library' | null {
  if (c.owner === playerId && c.zone === 'hand') return 'hand';
  if (canCastLibraryTop(s, playerId, c, spellDefinition(defOf(s, c), adventure))) return 'library';
  // Commanders are cast from the command zone (rule 903.8).
  if (c.owner === playerId && c.zone === 'command' && c.isCommander) return 'command';
  if (graveyardWay(s, playerId, c, adventure)) return 'graveyard';
  if (c.zone === 'exile' && c.adventurer === playerId && !adventure) return 'exile';
  // Rebound, or another permission to cast it this turn.
  if (c.zone === 'exile' && c.castPermission?.player === playerId && c.castPermission.turn === s.turnNumber) return 'exile';
  // A foretold card can be cast on a later turn than the one it was foretold on.
  if (c.owner === playerId && c.zone === 'exile' && c.foretoldTurn !== undefined) return c.foretoldTurn < s.turnNumber ? 'exile' : null;
  const p = c.playableFromExile;
  if (c.zone === 'exile' && p?.player === playerId) {
    // "You may play that card this turn."
    if (p.untilTurn !== undefined) return s.turnNumber <= p.untilTurn ? 'exile' : null;
    // "Until you exile another card with this enchantment" (Furious Rise).
    if (p.untilReplaced) return 'exile';
    const source = s.cards[p.source];
    if (source?.zone === 'battlefield' && source.controller === playerId) return 'exile';
  }
  return null;
}

function addCosts(a: ManaCost, b: ManaCost): ManaCost {
  const out: ManaCost = { ...a, generic: a.generic + b.generic };
  for (const t of MANA_TYPES) if (b[t]) out[t] = (out[t] ?? 0) + b[t]!;
  return out;
}

/** How a card in a graveyard can be cast: flashback, blitz (Sabin), a permission (Gearhulk, Emet-Selch), or Edgar's static. */
export type GraveyardWay = 'flashback' | 'blitz' | 'permission' | 'static' | 'adventure';

export function graveyardWay(s: GameState, playerId: PlayerId, c: CardInstance, adventure = false): GraveyardWay | null {
  if (c.zone !== 'graveyard') return null;
  if (adventure && c.adventureGraveyard?.player === playerId && (c.adventureGraveyard.expiresOnTurn === undefined || s.turnNumber <= c.adventureGraveyard.expiresOnTurn)) return 'adventure';
  if (c.castPermission?.player === playerId && c.castPermission.turn === s.turnNumber) return 'permission';
  if (c.owner !== playerId) return null;
  const def = spellDefinition(defOf(s, c), adventure);
  if (def.flashback) return 'flashback';
  if (def.alternativeCost?.fromGraveyard) return 'blitz';
  if (graveyardCastStatic(s, playerId, c, undefined, adventure)) return 'static';
  return null;
}

/** Each independent permanent granting a once-per-turn graveyard permission. */
export function graveyardCastSources(s: GameState, playerId: PlayerId, c: CardInstance, adventure = false): InstanceId[] {
  if (s.activePlayer !== playerId || !isSpellCard(defOf(s, c))) return [];
  const out: InstanceId[] = [];
  for (const source of battlefield(s)) {
    if (source.controller !== playerId || source.graveyardCastTurn === s.turnNumber) continue;
    for (const spec of defOf(s, source).statics ?? []) {
      const allow = spec.castFromGraveyard;
      if (allow && matchesObject(s, allow.filter, c, { controller: playerId, source: source.id }, c.owner, spellDefinition(defOf(s, c), adventure))) { out.push(source.id); break; }
    }
  }
  return out;
}

function graveyardCastStatic(s: GameState, playerId: PlayerId, c: CardInstance, selected?: InstanceId, adventure = false): (NonNullable<StaticSpec['castFromGraveyard']> & { source: InstanceId }) | undefined {
  const sources = graveyardCastSources(s, playerId, c, adventure);
  const source = selected ?? sources[0];
  if (!source || !sources.includes(source)) return undefined;
  const allow = defOf(s, s.cards[source]!).statics!.map((spec) => spec.castFromGraveyard)
    .find((permission) => permission && matchesObject(s, permission.filter, c, { controller: playerId, source }, c.owner, spellDefinition(defOf(s, c), adventure)));
  return allow ? { ...allow, source } : undefined;
}

/**
 * Ward, simplified to an additional cost: targeting permanents with ward that
 * an opponent of `playerId` controls costs their ward on top (rule 702.21 counters
 * the spell or ability unless that's paid).
 */
export function wardCost(s: GameState, targets: readonly Target[], playerId: PlayerId): number {
  const seen = new Set<InstanceId>();
  let total = 0;
  for (const t of targets) {
    if (t.kind !== 'card' || seen.has(t.card)) continue;
    seen.add(t.card);
    const c = s.cards[t.card];
    if (c?.zone === 'battlefield' && c.controller !== playerId) total += characteristics(s, c).ward;
  }
  return total;
}

const COLOR_MANA: Record<string, ManaType> = { W: 'W', U: 'U', B: 'B', R: 'R', G: 'G' };

/**
 * Convoke: each creature pays for one mana of its color if the cost still has
 * some, or else {1}. Null if a creature would have nothing left to pay for.
 */
export function convokeCost(s: GameState, cost: ManaCost, creatures: readonly CardInstance[]): ManaCost | null {
  let out = { ...cost };
  for (const c of creatures) {
    const color = colorsOf(defOf(s, c)).map((k) => COLOR_MANA[k]!).find((t) => (out[t] ?? 0) > 0);
    if (color) out = { ...out, [color]: out[color]! - 1 };
    else if (out.generic > 0) out = { ...out, generic: out.generic - 1 };
    else return null;
  }
  return out;
}

/** Untapped creatures a player could tap for convoke, in battlefield order. */
export function convokeCandidates(s: GameState, playerId: PlayerId): CardInstance[] {
  return s.players[playerId]!.battlefield.map((id) => s.cards[id]!).filter((c) => c.controller === playerId && !c.tapped && isCreatureOnBattlefield(s, c));
}

export function hasImprovise(s: GameState, playerId: PlayerId, c: CardInstance): boolean {
  if (defOf(s, c).improvise) return true;
  return battlefield(s).some((source) => source.controller === playerId &&
    defOf(s, source).statics?.some((spec) => spec.grantImprovise && matchesObject(s, spec.grantImprovise, c, { controller: playerId, source: source.id }, playerId)));
}

export function improviseCandidates(s: GameState, playerId: PlayerId): CardInstance[] {
  return battlefield(s).filter((c) => c.controller === playerId && !c.tapped && hasType(s, c, 'artifact'));
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
  from: 'hand' | 'graveyard' | 'exile' | 'command' | 'library',
  targets: Target[],
  card?: CardInstance,
  alternative = false,
  x = 0,
  extra: { kicks?: number; mode?: number } = {},
): ManaCost {
  const permission = card?.castPermission && card.castPermission.turn === s.turnNumber && (from === 'graveyard' || from === 'exile')
    ? card.castPermission
    : undefined;
  const way = from === 'graveyard' && card ? graveyardWay(s, card.owner, card) : null;
  const base = permission?.free
    ? undefined
    : alternative
      ? def.alternativeCost?.mana
      : way === 'flashback'
        ? def.flashback
        : from === 'exile' && card?.foretoldTurn !== undefined
          ? def.foretell
          : def.manaCost;
  let cost = parseManaCost(base);
  // Ward on the targets (an additional cost here, see wardCost).
  if (card) cost = { ...cost, generic: cost.generic + wardCost(s, targets, card.owner) };
  // {X}: each X symbol costs the chosen value (rule 107.3).
  if (cost.x) cost = { ...cost, generic: cost.generic + x * cost.x };
  // Kicker, multikicker and tiered modes add to the cost (rules 601.2f, 702.33).
  const kicker = def.kicker ?? def.multikicker;
  for (let i = 0; i < (extra.kicks ?? 0) && kicker; i++) cost = addCosts(cost, parseManaCost(kicker));
  const tier = extra.mode !== undefined ? def.modeCosts?.[extra.mode] : undefined;
  if (tier) cost = addCosts(cost, parseManaCost(tier));
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
        if (!r || !matchesObject(s, r.filter, card, { controller: source.controller, source: source.id }, card.owner, def)) continue;
        // "Spells you cast from your graveyard cost {2} less" (Emet-Selch).
        if (r.fromGraveyard && from !== 'graveyard') continue;
        // "The second spell you cast each turn": this would be spell number (cast so far + 1).
        if (r.nthSpell !== undefined && (s.players[card.owner]!.spellsCastThisTurn ?? 0) + 1 !== r.nthSpell) continue;
        cost = reduceGeneric(cost, r.generic);
      }
    }
  }
  return cost;
}

/** Conqueror's Flail: whether an opponent's attached Flail stops this player casting spells right now. */
export function castingForbidden(s: GameState, playerId: PlayerId): boolean {
  if (s.activePlayer === playerId) return false;
  return battlefield(s).some(
    (source) =>
      source.controller === s.activePlayer &&
      source.attachedTo !== undefined &&
      (defOf(s, source).statics ?? []).some((st) => st.opponentsCantCastDuringYourTurn),
  );
}

export function castSpell(ctx: Ctx, playerId: PlayerId, id: InstanceId, targets: Target[] = [], choice: SpellChoice = {}): void {
  const s = ctx.s;
  const c = card(s, id);
  const printed = defOf(s, c);
  if (choice.adventure && !printed.adventure) reject('That card has no Adventure.');
  const def = spellDefinition(printed, choice.adventure);
  if (castingForbidden(s, playerId)) reject("You can't cast spells during this player's turn (Conqueror's Flail).");
  const from = playableZone(s, playerId, c, choice.adventure);
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
  // From a graveyard, blitz is the only alternative cost that works, and the only way for Sabin (rule 118.9a).
  const way = from === 'graveyard' ? (choice.graveyardSource ? 'static' : graveyardWay(s, playerId, c, choice.adventure)) : null;
  if (choice.graveyardSource && (from !== 'graveyard' || c.owner !== playerId || !graveyardCastStatic(s, playerId, c, choice.graveyardSource, choice.adventure))) reject('That graveyard-casting permission is not available.');
  if (way === 'blitz' && !alternative) reject(`${def.name} can only be cast from your graveyard for its blitz cost.`);
  if (from === 'graveyard' && alternative && way !== 'blitz') reject("That alternative cost can't be used from the graveyard.");
  const permission = (from === 'graveyard' || from === 'exile') && c.castPermission?.player === playerId && c.castPermission.turn === s.turnNumber
    ? c.castPermission
    : undefined;
  checkTargets(s, spellEffects(def, choice), targets, playerId, id);
  const costCards = choice.costCards ?? [];
  const discardCount = (def.additionalCost?.discard ?? 0) + (alternative ? (def.alternativeCost?.discard ?? 0) : 0);
  checkDiscardCost(s, playerId, discardCount, costCards, id);
  const x = choice.x ?? 0;
  if (!Number.isInteger(x) || x < 0) reject('X must be a whole number, 0 or more.');
  if (x > 0 && permission?.free) reject('X is 0 when a spell is cast without paying its mana cost.');
  const kicks = choice.kicks ?? 0;
  if (!Number.isInteger(kicks) || kicks < 0) reject('Kick a whole number of times.');
  if (kicks > 0 && !def.kicker && !def.multikicker) reject(`${def.name} has no kicker.`);
  if (kicks > 1 && !def.multikicker) reject('Kicker can be paid only once.');
  // Escalate: tap an untapped creature you control for each mode beyond the first.
  const escalated = (choice.tapCreatures ?? []).map((cid) => card(s, cid));
  const extraModes = def.escalateTapCreature ? Math.max(0, (choice.modes?.length ?? 1) - 1) : 0;
  if (escalated.length !== extraModes) reject(extraModes ? `Tap ${extraModes} untapped creature(s) you control to escalate.` : 'Nothing needs to be tapped.');
  if (new Set(escalated).size !== escalated.length || escalated.some((k) => !convokeCandidates(s, playerId).includes(k))) {
    reject('Escalate with different untapped creatures you control.');
  }
  let cost = spellCost(s, def, from, targets, c, alternative, x, { kicks, ...(choice.mode !== undefined ? { mode: choice.mode } : {}) });
  // Convoke and delve pay part of the cost with creatures and graveyard cards.
  const convoked = (choice.convoke ?? []).map((cid) => card(s, cid));
  if (convoked.length > 0) {
    if (!def.convoke) reject(`${def.name} doesn't have convoke.`);
    const able = convokeCandidates(s, playerId);
    if (new Set(convoked).size !== convoked.length || convoked.some((k) => !able.includes(k))) {
      reject('Convoke with different untapped creatures you control.');
    }
    cost = convokeCost(s, cost, convoked) ?? reject('That is more creatures than the spell needs.');
  }
  const delved = choice.delve ?? [];
  const improvised = (choice.improvise ?? []).map((id) => card(s, id));
  if (improvised.length > 0) {
    if (!hasImprovise(s, playerId, c)) reject("That spell doesn't have improvise.");
    const able = improviseCandidates(s, playerId);
    if (new Set(improvised).size !== improvised.length || improvised.some((a) => !able.includes(a) || convoked.includes(a) || escalated.includes(a))) reject('Improvise with different untapped artifacts you control, tapping each only once.');
    if (improvised.length > cost.generic) reject('Improvise can pay only generic mana.');
    cost = { ...cost, generic: cost.generic - improvised.length };
  }
  if (delved.length > 0) {
    if (!def.delve) reject(`${def.name} doesn't have delve.`);
    const graveyard = player(s, playerId).graveyard;
    if (new Set(delved).size !== delved.length || delved.some((g) => g === id || !graveyard.includes(g))) {
      reject('Delve exiles different other cards from your graveyard.');
    }
    if (delved.length > cost.generic) reject('That is more cards than the spell needs.');
    cost = { ...cost, generic: cost.generic - delved.length };
  }
  const manaSpent = payMana(ctx, playerId, cost, isEquipment(s, c));
  if (alternative && def.alternativeCost?.life) changeLife(ctx, playerId, -def.alternativeCost.life);
  for (const discarded of costCards) discard(ctx, discarded);
  for (const k of convoked) tap(ctx, k);
  for (const k of escalated) tap(ctx, k);
  for (const a of improvised) tap(ctx, a);
  for (const g of delved) moveCard(ctx, g, 'exile');
  // Edgar's permission is used up for this turn.
  const edgar = way === 'static' ? graveyardCastStatic(s, playerId, c, choice.graveyardSource, choice.adventure) : undefined;
  if (edgar) s.cards[edgar.source]!.graveyardCastTurn = s.turnNumber;
  if (from === 'command') {
    const casts = player(s, c.owner).commanderCasts;
    casts[id] = (casts[id] ?? 0) + 1;
  }

  moveCard(ctx, id, 'stack');
  if (choice.adventure) c.adventureSpell = true;
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
    ...(choice.adventure ? { adventure: true } : {}),
    card: id,
    controller: playerId,
    targets,
    ...(choice.mode !== undefined ? { mode: choice.mode } : {}),
    ...(choice.modes ? { modes: [...choice.modes].sort((a, b) => a - b) } : {}),
    ...(alternative ? { alternative } : {}),
    castFrom: from,
    manaSpent,
    ...(x > 0 ? { x } : {}),
    ...(convoked.length > 0 ? { convoked: convoked.map((k) => k.id) } : {}),
    ...(kicks > 0 ? { kicks } : {}),
    ...(permission?.exileAfter ? { exileAfter: true } : {}),
    ...(edgar?.entersTapped ? { entersTapped: true } : {}),
  };
  s.stack.push(item);
  ctx.ev.push({ type: 'SpellCast', player: playerId, card: id, defId: c.defId, targets, manaSpent });
  ctx.ev.push({ type: 'StackItemAdded', item: item.id, card: id });
}

/** What foretelling costs (rule 702.143a). */
export const FORETELL_COST: ManaCost = { generic: 2 };

/** Why this player can't foretell this card right now, or null if they can. */
export function foretellProblem(s: GameState, playerId: PlayerId, c: CardInstance): string | null {
  if (c.owner !== playerId || c.zone !== 'hand') return 'That card is not in your hand.';
  if (!defOf(s, c).foretell) return `${defOf(s, c).name} doesn't have foretell.`;
  if (s.activePlayer !== playerId) return 'You can only foretell during your turn.';
  if (!canPayFromPool(s, playerId, FORETELL_COST)) return 'Foretelling costs {2}. Add the mana first.';
  return null;
}

/** Foretell: pay {2} and exile the card face down (a special action, rule 116.2h). */
export function foretell(ctx: Ctx, playerId: PlayerId, id: InstanceId): void {
  const s = ctx.s;
  const c = card(s, id);
  const problem = foretellProblem(s, playerId, c);
  if (problem) reject(problem);
  payMana(ctx, playerId, FORETELL_COST);
  moveCard(ctx, id, 'exile', { silent: true });
  c.foretoldTurn = s.turnNumber;
  ctx.ev.push({ type: 'Foretold', player: playerId, card: id });
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
  if (source) {
    const who = source.controller;
    if (s.activePlayer === who && player(s, who).friendlyTargetAbilityTurn !== s.turnNumber &&
        targets.some((t) => t.kind === 'card' && isCreatureOnBattlefield(s, s.cards[t.card]) && s.cards[t.card]!.controller === who)) {
      for (const permanent of battlefield(s).filter((c) => c.controller === who)) {
        for (const st of defOf(s, permanent).statics ?? []) cost = reduceGeneric(cost, st.firstFriendlyTargetActivationDiscount ?? 0);
      }
    }
    cost = { ...cost, generic: cost.generic + wardCost(s, targets, who) };
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
  if (zone === 'graveyard' && (c.zone !== 'graveyard' || c.owner !== playerId)) return 'That card is not in your graveyard.';
  if (spec.cost.life !== undefined && player(s, playerId).life < spec.cost.life) return "You don't have enough life to pay.";
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
  const sourceObject = c.zoneChanges ?? 0;
  const spec = activatedAbilities(defOf(s, c))[index];
  if (!spec) reject('That card has no such ability.');
  const problem = activationProblem(s, playerId, c, spec);
  if (problem) reject(problem);
  checkTargets(s, spec.effects, targets, playerId, id);
  const creatureTargets = [...new Set(targets.flatMap((t) => t.kind === 'card' && isCreatureOnBattlefield(s, s.cards[t.card]) ? [t.card] : []))];
  for (const target of creatureTargets) ctx.ev.push({ type: 'AbilityTargeted', card: target, controller: s.cards[target]!.controller, source: id });
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
  if (creatureTargets.some((target) => s.cards[target]!.controller === playerId)) player(s, playerId).friendlyTargetAbilityTurn = s.turnNumber;
  if (spec.cost.life) changeLife(ctx, playerId, -spec.cost.life);
  if (spec.cost.tap) tap(ctx, c);
  if (rc) {
    const from = s.cards[rc.from ? costCards[0]! : id]!;
    removeCounters(ctx, from.id, counterToRemove(from, rc.counter)!, 1);
  }
  if (spec.cost.sacrifice) sacrifice(ctx, costCards[0]!);
  else if (!rc?.from) for (const discarded of costCards) discard(ctx, discarded);
  if (spec.cost.sacrificeThis) sacrifice(ctx, id);
  if (spec.cost.discardThis) moveCard(ctx, id, 'graveyard');
  if (spec.cost.exileThis) moveCard(ctx, id, 'exile');

  const item: AbilityItem = {
    id: newId(s, 's'),
    kind: 'ability',
    source: id,
    from: 'activated',
    sourceObject,
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
  if (t.kind === 'ability') return s.stack.find((item) => item.kind === 'ability' && item.id === t.ability)?.controller ?? null;
  if (t.kind === 'player') return t.player;
  const c = s.cards[t.card];
  if (!c) return null;
  if (c.zone === 'stack') return s.stack.find((i) => i.kind === 'spell' && i.card === c.id)?.controller ?? c.owner;
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
    case 'ConvokedCreatures':
      return item.kind === 'spell'
        ? (item.convoked ?? []).filter((id) => isCreatureOnBattlefield(s, s.cards[id])).map((id) => ({ kind: 'card', card: id }))
        : [];
    case 'CreatedTokens':
      return r.createdTokens.filter((id) => s.cards[id]!.zone === 'battlefield').map((id) => ({ kind: 'card', card: id }));
    case 'ActivePlayer':
      return s.players[s.activePlayer]!.eliminated ? [] : toPlayers([s.activePlayer]);
    case 'CreaturesPreviousTargetControls': {
      const who = controllerOfTarget(s, r.previousTarget);
      return who ? creatures((c) => c.controller === who) : [];
    }
    case 'EquippedCreature': {
      const attached = s.cards[sourceOf(item)]?.attachedTo;
      return attached && s.cards[attached]?.zone === 'battlefield' ? [{ kind: 'card', card: attached }] : [];
    }
    case 'SubjectController': {
      if (item.kind === 'ability' && item.subjectController) return s.players[item.subjectController]!.eliminated ? [] : toPlayers([item.subjectController]);
      const subject = item.kind === 'ability' && item.subject ? s.cards[item.subject] : undefined;
      if (!subject) return [];
      const who = subject.zone === 'battlefield' ? subject.controller : subject.owner;
      return s.players[who]!.eliminated ? [] : toPlayers([who]);
    }
    case 'EachOtherOpponent': {
      const defender = item.kind === 'ability' ? item.defender : undefined;
      return toPlayers(alivePlayers(s).filter((id) => id !== item.controller && id !== defender));
    }
    case 'AllGraveyardCards': {
      const viewpoint = { controller: item.controller, source: sourceOf(item) };
      return alivePlayers(s)
        .flatMap((pid) => s.players[pid]!.graveyard)
        .filter((id) => matchesObject(s, effect.filter, s.cards[id]!, viewpoint))
        .map((id) => ({ kind: 'card', card: id }));
    }
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
                      : a.of === 'subjectManaValue'
                        ? subjectManaValue(s, r.item)
                        : a.of === 'previousTargetPowerOverSubject'
                          ? powerOver(s, r)
                        : a.of === 'damageDealt'
                          ? (r.item.kind === 'ability' ? (r.item.amount ?? 0) : 0)
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
    // Each player picks among their own permanents, or the spell's controller picks for them (Tragic Arrogance, Meteor).
    const chooser = effect.chooser === 'You' || effect.effect === 'ChooseAndDestroy' ? r.item.controller : pid;
    const cards = battlefield(s)
      .filter((c) => c.controller === pid && matchesObject(s, effect.filter, c, { controller: pid, source }))
      .map((c) => c.id);
    if (cards.length === 0) continue;
    if (effect.effect === 'Sacrifice' || effect.effect === 'ChooseAndDestroy') {
      const max = Math.min(Math.max(1, amount), cards.length);
      const purpose = effect.effect === 'Sacrifice' ? 'sacrifice' : 'destroy';
      r.choiceQueue = [...(r.choiceQueue ?? []), { player: chooser, purpose, cards, min: effect.optional ? 0 : max, max }];
    } else {
      const max = effect.onePerType ? effect.onePerType.length : Math.min(amount, cards.length);
      r.choiceQueue = [
        ...(r.choiceQueue ?? []),
        {
          player: chooser,
          purpose: effect.counter === 'vow' ? 'keepVow' : 'keep',
          cards,
          min: effect.counter === 'vow' ? 1 : 0,
          max,
          ...(effect.onePerType ? { onePerType: effect.onePerType } : {}),
        },
      ];
    }
  }
}

/** Why a set of chosen cards doesn't fit a choice, or null if it does. */
export function choiceProblem(s: GameState, choice: CardChoice, cards: InstanceId[]): string | null {
  if (choice.purpose === 'distributeCounter' && cards.some((id) => !isCreatureOnBattlefield(s, s.cards[id]))) return 'Choose a creature still on the battlefield.';
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

/** The life a triggered ability's optional cost asks for, if any: a fixed amount or the triggering spell's mana value. */
export function triggerLifeCost(s: GameState, item: AbilityItem): number | undefined {
  const cost = triggerSpec(s, item)?.cost;
  if (cost?.life !== undefined) return cost.life;
  if (cost?.lifeOf === 'subjectManaValue') {
    const subject = item.subject ? s.cards[item.subject] : undefined;
    return subject ? objectManaValue(s, subject) : 0;
  }
  return undefined;
}

/** "This creature's power": now, or as it last was on the battlefield if it has left (rule 608.2h). */
function sourcePower(s: GameState, item: StackItem): number {
  const c = s.cards[sourceOf(item)]!;
  if (c.zone === 'battlefield') return Math.max(0, powerOf(s, c));
  return Math.max(0, c.lastPower ?? defOf(s, c).power ?? 0);
}

/** How much more power the previous target had than the triggering creature (Conformer Shuriken). */
function powerOver(s: GameState, r: Resolving): number {
  const subject = r.item.kind === 'ability' && r.item.subject ? s.cards[r.item.subject] : undefined;
  if (!subject || subject.zone !== 'battlefield') return 0;
  return Math.max(0, (r.previousTargetPower ?? 0) - powerOf(s, subject));
}

function subjectManaValue(s: GameState, item: StackItem): number {
  const c = item.kind === 'ability' && item.subject ? s.cards[item.subject] : undefined;
  return c ? objectManaValue(s, c) : 0;
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
const HELPFUL_COUNTERS: AnyCounter[] = ['+1/+1', 'shield', 'flying', 'page', 'soul', 'stun', 'lore', 'charge', 'vow'];
const HARMFUL_COUNTERS: AnyCounter[] = ['stun', 'page', 'soul', 'flying', 'shield', '+1/+1', 'lore', 'charge', 'vow'];

/** The players among an effect's targets (searches act for these players). */
function targetPlayers(targets: Target[]): PlayerId[] {
  return targets.flatMap((t) => (t.kind === 'player' ? [t.player] : []));
}

function applyEffect(ctx: Ctx, effect: EffectSpec, r: Resolving, targets: Target[]): void {
  const s = ctx.s;
  const item = r.item;
  const source = sourceOf(item);
  if (effect.sameObject && item.kind === 'ability' && (s.cards[source]?.zoneChanges ?? 0) !== item.sourceObject) return;
  const amount = resolvedAmount(s, effect, r);
  const cards = targets.flatMap((t) => (t.kind === 'card' ? [t.card] : []));
  const onBattlefield = cards.filter((id) => s.cards[id]!.zone === 'battlefield');
  switch (effect.effect) {
    case 'ChooseCounterRecipients': {
      const candidates = battlefield(s).filter((c) => matchesObject(s, effect.filter, c, { controller: item.controller, source })).map((c) => c.id);
      if (candidates.length) r.choiceQueue = [{ player: item.controller, purpose: 'addCounters', cards: candidates, min: 0, max: Math.min(amount, candidates.length) }];
      return;
    }
    case 'DistributeCounters': {
      const from = s.cards[source]!;
      if (from.zone !== 'battlefield' || !(from.counters && from.counters > 0)) return;
      const candidates = battlefield(s).filter((c) => matchesObject(s, effect.filter, c, { controller: item.controller, source })).map((c) => c.id);
      if (!candidates.length) return;
      r.distribution = { source, remaining: from.counters, assigned: {} };
      r.choiceQueue = [{ player: item.controller, purpose: 'distributeCounter', cards: candidates, min: 0, max: 1, counterCount: from.counters }];
      return;
    }
    case 'ChooseGraveyardCards': {
      r.chosen = [];
      const order = alivePlayers(s);
      const start = order.indexOf(item.controller);
      const opponents = [...order.slice(start + 1), ...order.slice(0, start)];
      const candidates = player(s, item.controller).graveyard.filter((id) => matchesObject(s, effect.filter, s.cards[id]!, { controller: item.controller }));
      r.choiceQueue = opponents.map((pid) => ({ player: pid, purpose: 'reanimate', cards: [...candidates], min: 1, max: 1 }));
      return;
    }
    case 'ReturnChosenToBattlefield':
      for (const id of (r.chosen ?? []).flatMap((choice) => choice.cards)) {
        if (s.cards[id]?.zone !== 'graveyard') continue;
        moveCard(ctx, id, 'battlefield');
        s.cards[id]!.controller = item.controller;
        s.cards[id]!.summoningSick = true;
        if (entersTapped(s, s.cards[id]!)) s.cards[id]!.tapped = true;
      }
      return;
    case 'PutOnLibraryBottom':
      for (const id of cards) if (s.cards[id]!.zone === 'graveyard') moveCard(ctx, id, 'library');
      return;
    case 'AllowAdventureFromGraveyard':
      for (const id of cards) if (s.cards[id]!.zone === 'graveyard') s.cards[id]!.adventureGraveyard = { player: item.controller, grantedTurn: s.turnNumber };
      return;
    case 'PutIntoLibrary':
      r.choiceQueue = cards.map((id) => ({ player: s.cards[id]!.owner, purpose: 'library', cards: [id], min: 0, max: 1 }));
      return;
    case 'OfferDrawOrMillDamage':
      r.choiceQueue = targetPlayers(targets).map((pid) => ({ player: pid, purpose: 'offerDraw', cards: [source], min: 0, max: 1 }));
      return;
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
      // "Discard your hand": no choice to make.
      if (effect.entireHand) {
        for (const pid of targetPlayers(targets)) for (const id of [...s.players[pid]!.hand]) discard(ctx, id);
        return;
      }
      queueChoices(s, effect, r, targetPlayers(targets), amount);
      return;
    case 'Sacrifice':
    case 'KeepAndSacrificeRest':
      queueChoices(s, effect, r, targetPlayers(targets), amount);
      return;
    case 'Fight': {
      // Both must still be creatures on the battlefield (rule 701.14b).
      const src = s.cards[source];
      if (!isCreatureOnBattlefield(s, src)) return;
      for (const id of onBattlefield) {
        const other = s.cards[id]!;
        if (!isCreatureOnBattlefield(s, other) || other.id === src.id) continue;
        const theirs = powerOf(s, other);
        dealDamage(ctx, src.id, { kind: 'card', card: id }, powerOf(s, src), false);
        dealDamage(ctx, id, { kind: 'card', card: src.id }, theirs, false);
      }
      return;
    }
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
      if (effect.optional) {
        if (onBattlefield.length) r.choiceQueue = [...(r.choiceQueue ?? []), { player: item.controller, purpose: 'addCounters', cards: onBattlefield, min: 0, max: onBattlefield.length, ...(effect.counter ? { counter: effect.counter } : {}) }];
        return;
      }
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
    case 'Explore':
      for (const id of onBattlefield) {
        const explorer = s.cards[id]!;
        const top = s.players[explorer.controller]!.library[0];
        if (top === undefined) {
          addCounters(ctx, id, 1, item.controller);
          continue;
        }
        ctx.ev.push({ type: 'CardRevealed', player: explorer.controller, card: top, defId: s.cards[top]!.defId });
        if (hasType(s, s.cards[top]!, 'land')) moveCard(ctx, top, 'hand');
        else addCounters(ctx, id, 1, item.controller);
      }
      return;
    case 'ReturnGreatestManaValue':
      for (const pid of targetPlayers(targets)) {
        const theirs = battlefield(s).filter((c) => c.controller === pid && hasType(s, c, 'creature'));
        if (theirs.length === 0) continue;
        const greatest = Math.max(...theirs.map((c) => objectManaValue(s, c)));
        // On a tie the player would choose; the engine returns the one that has been there longest.
        moveCard(ctx, theirs.find((c) => objectManaValue(s, c) === greatest)!.id, 'hand');
      }
      return;
    case 'AdditionalCombat':
      if (effect.onlyFirstCombat && (s.combatsThisTurn ?? 0) !== 1) return;
      s.extraCombats = (s.extraCombats ?? 0) + 1;
      return;
    case 'GainControl': {
      const receiver = effect.giveTo === 'SubjectController' ? (item.kind === 'ability' ? item.subjectController : undefined) : item.controller;
      if (!receiver || s.players[receiver]!.eliminated) return;
      for (const id of onBattlefield) {
        const c = s.cards[id]!;
        if (c.controller === receiver) continue;
        c.controller = receiver;
        c.summoningSick = true;
        if (c.attachedTo) delete c.attachedTo;
        ctx.ev.push({ type: 'ControlChanged', card: id, controller: receiver });
      }
      return;
    }
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
    case 'CreateToken': {
      // "Create a number of tokens equal to ..." can be zero. "Its controller creates": under the target player.
      const players = targetPlayers(targets);
      for (const pid of players.length > 0 ? players : [item.controller]) {
        for (let i = 0; i < amount; i++) {
          const id = createToken(ctx, effect.token!, pid);
          if (effect.entersTapped) s.cards[id]!.tapped = true;
          r.createdTokens.push(id);
        }
      }
      return;
    }
    case 'Counter':
      for (const target of targets) {
        if (target.kind !== 'ability') continue;
        const index = s.stack.findIndex((item) => item.kind === 'ability' && item.id === target.ability);
        if (index < 0) continue;
        const countered = s.stack[index] as AbilityItem;
        s.stack.splice(index, 1);
        ctx.ev.push({ type: 'AbilityCountered', ability: countered.id, source: countered.source, by: source });
      }
      for (const id of cards) {
        const index = s.stack.findIndex((i) => i.kind === 'spell' && i.card === id);
        if (index < 0 || defOf(s, s.cards[id]!).cantBeCountered) continue;
        const countered = s.stack[index] as SpellItem;
        s.stack.splice(index, 1);
        ctx.ev.push({ type: 'SpellCountered', card: id, defId: s.cards[id]!.defId, by: source });
        // A flashback spell is exiled instead (rule 702.34a), and so is one cast with a permission that says so.
        const flashback = countered.castFrom === 'graveyard' && !!defOf(s, s.cards[id]!).flashback;
        moveCard(ctx, id, flashback || countered.exileAfter ? 'exile' : 'graveyard');
      }
      return;
    case 'PhaseOut':
      for (const id of onBattlefield) phaseOut(ctx, id);
      return;
    case 'Connive': {
      // Simplified: the creatures connive together: draw one card each, discard as many, then each
      // nonland card discarded puts a +1/+1 counter on the next of them.
      const connivers = onBattlefield.filter((id) => isCreatureOnBattlefield(s, s.cards[id]));
      if (connivers.length === 0) return;
      const who = s.cards[connivers[0]!]!.controller;
      drawCards(ctx, who, connivers.length);
      const hand = s.players[who]!.hand;
      if (hand.length === 0) return;
      const n = Math.min(connivers.length, hand.length);
      r.conniving = connivers;
      r.choiceQueue = [...(r.choiceQueue ?? []), { player: who, purpose: 'discard', cards: [...hand], min: n, max: n }];
      return;
    }
    case 'LookAtTopPutInHand': {
      const top = topOfLibrary(s, item.controller, amount);
      if (top.length === 0) return;
      const keep = Math.min(effect.keep ?? 1, top.length);
      r.choiceQueue = [...(r.choiceQueue ?? []), { player: item.controller, purpose: 'hand', cards: top, min: keep, max: keep }];
      return;
    }
    case 'AllowCastFromGraveyard':
      for (const id of cards) {
        const c = s.cards[id]!;
        if (c.zone !== 'graveyard') continue;
        c.castPermission = { player: item.controller, turn: s.turnNumber, exileAfter: true, ...(effect.free ? { free: true } : {}) };
      }
      return;
    case 'PreventDamageToYouThisTurn':
      player(s, item.controller).preventDamageTurn = s.turnNumber;
      return;
    case 'ChooseAndDestroy':
      queueChoices(s, effect, r, targetPlayers(targets), amount);
      return;
    case 'AttackTaxUntilYourNextTurn': {
      const p = player(s, item.controller);
      p.attackTaxes = [...(p.attackTaxes ?? []), amount];
      return;
    }
    case 'CreateTokenCopy':
      // The copy uses the original's printed card (its copiable values, rule 707.2).
      for (const id of onBattlefield) {
        for (let i = 0; i < (effect.amount === undefined ? 1 : amount); i++) r.createdTokens.push(createToken(ctx, s.cards[id]!.defId, item.controller));
      }
      return;
    case 'SetBasePT': {
      const timestamp = newTimestamp(s);
      for (const id of onBattlefield) s.temporaryEffects.push({ source, affected: id, basePowerToughness: [effect.power!, effect.toughness!], timestamp });
      return;
    }
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
          ...(effect.toughness !== undefined || effect.toughnessFromAmount
            ? { toughness: (effect.toughness ?? 0) + (effect.toughnessFromAmount ? amount : 0) }
            : {}),
          ...(effect.keywords ? { keywords: [...effect.keywords] } : {}),
          ...(effect.flags ? { flags: [...effect.flags] } : {}),
          ...(effect.whileYouControlSource ? { whileControlledBy: item.controller } : {}),
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
    case 'ExileTopCardToPlay': {
      // "Until you exile another card with this": the earlier card can't be played any more.
      if (effect.untilNextFromSource) {
        for (const c of Object.values(s.cards)) {
          if (c.zone === 'exile' && c.playableFromExile?.source === source && c.playableFromExile.untilReplaced) delete c.playableFromExile;
        }
      }
      for (const id of topOfLibrary(s, item.controller, Math.max(1, amount))) {
        moveCard(ctx, id, 'exile');
        r.revealedManaValue = manaValue(parseManaCost(defOf(s, s.cards[id]!).manaCost));
        s.cards[id]!.playableFromExile = {
          player: item.controller,
          source,
          ...(effect.thisTurn ? { untilTurn: s.turnNumber } : {}),
          ...(effect.untilNextFromSource ? { untilReplaced: true } : {}),
        };
      }
      return;
    }
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
        const defenders = effect.attacking && s.combat ? alivePlayers(s).filter((p) => p !== item.controller) : [];
        if (defenders.length > 1 && !r.attackingDefender) {
          s.pending = { kind: 'chooseDefender', player: item.controller, card: id, defenders };
          return;
        }
        const defender = r.attackingDefender ?? defenders[0];
        moveCard(ctx, id, 'battlefield');
        if (effect.underYourControl) c.controller = item.controller;
        c.summoningSick = true;
        if (effect.entersTapped || entersTapped(s, c)) c.tapped = true;
        if (effect.attacking && s.combat && defender && defenders.includes(defender)) {
          s.combat.attacks.push({ attacker: id, defender });
          ctx.ev.push({ type: 'CreatureEnteredAttacking', card: id, defender });
        }
        delete r.attackingDefender;
        addCounters(ctx, id, effect.counters ?? 0, item.controller, effect.counter);
        if (effect.unearth) {
          c.unearthed = true;
          s.temporaryEffects.push({ source: id, affected: id, keywords: ['Haste'] });
        }
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
function finishResolving(ctx: Ctx, item: StackItem, resolved = true): void {
  const s = ctx.s;
  if (item.kind === 'spell' && s.cards[item.card]!.zone === 'stack') {
    const c = s.cards[item.card]!;
    if (item.adventure && resolved) {
      moveCard(ctx, item.card, 'exile');
      c.adventurer = item.controller;
    } else if ((item.castFrom === 'graveyard' && !!defOf(s, c).flashback) || item.exileAfter) moveCard(ctx, item.card, 'exile');
    else if (defOf(s, c).rebound && item.castFrom === 'hand') {
      // Rebound (rule 702.88a): exiled, to be cast again during its owner's next upkeep.
      moveCard(ctx, item.card, 'exile');
      c.rebounding = true;
    } else moveCard(ctx, item.card, 'graveyard');
  }
  givePriority(ctx, s.activePlayer);
}

/** Applies effects in order until done, or until a choice (surveil) is needed. */
function continueResolving(ctx: Ctx): void {
  const s = ctx.s;
  const r = s.resolving!;
  const item = r.item;
  const effects = effectsOf(s, item);
  for (;;) {
    // Rejoin the Fight: later opponents choose from the cards not already chosen.
    if (r.choiceQueue?.[0]?.purpose === 'reanimate') {
      const reserved = new Set((r.chosen ?? []).flatMap((choice) => choice.cards));
      r.choiceQueue = r.choiceQueue.map((choice) => choice.purpose === 'reanimate'
        ? { ...choice, cards: choice.cards.filter((id) => s.cards[id]?.zone === 'graveyard' && !reserved.has(id)) }
        : choice).filter((choice) => choice.purpose !== 'reanimate' || choice.cards.length > 0);
    }
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
    if (effect.if === 'castFromExile' && !(item.kind === 'spell' && item.castFrom === 'exile')) continue;
    if (effect.if === 'castFromHand' && !(item.kind === 'spell' && item.castFrom === 'hand')) continue;
    const kicked = item.kind === 'spell' && (item.kicks ?? 0) > 0;
    if ((effect.if === 'kicked' && !kicked) || (effect.if === 'notKicked' && kicked)) continue;
    // "If you do": something was chosen in the last choice (of the right kind, for Mog).
    if (effect.ifSacrificed && !r.sacrificedAny) continue;
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
    if (effect.subjectPowerVsSource) {
      // Compared once, before any of these effects change either creature.
      if (r.subjectWasWeaker === undefined) {
        const subject = item.kind === 'ability' && item.subject ? s.cards[item.subject] : undefined;
        const src = s.cards[sourceOf(item)]!;
        r.subjectWasWeaker = !!subject && subject.zone === 'battlefield' && src.zone === 'battlefield' && powerOf(s, subject) < powerOf(s, src);
      }
      if ((effect.subjectPowerVsSource === 'less') !== r.subjectWasWeaker) continue;
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
    if (s.pending.kind === 'chooseDefender') return;
  }
  s.resolving = null;
  finishResolving(ctx, item);
}

function startResolving(ctx: Ctx, item: StackItem, applyEffects: boolean): void {
  if (!applyEffects) {
    finishResolving(ctx, item, false);
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
      if (def.entersWithCountersPerKick) addCounters(ctx, c.id, item.kicks ?? 0, item.controller, def.entersWithCountersPerKick);
      if (item.castFrom === 'graveyard') c.castFromGraveyard = true;
      c.controller = item.controller;
      c.summoningSick = true;
      if (entersTapped(s, c) || item.entersTapped) c.tapped = true;
      addCounters(ctx, c.id, extra, item.controller);
      // Blitz: it gains haste, and is sacrificed at the next end step (see enterStep).
      if (item.alternative && def.alternativeCost?.blitz) {
        c.blitzed = true;
        s.temporaryEffects.push({ source: c.id, affected: c.id, keywords: ['Haste'] });
      }
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
  const spec = triggerSpec(s, item);
  const cost = spec?.cost;
  if (accept && cost) {
    if (player(s, playerId).hand.length < (cost.discard ?? 0)) reject("You don't have enough cards to discard for that cost.");
    const life = triggerLifeCost(s, item);
    if (life !== undefined && player(s, playerId).life < life) reject("You don't have enough life to pay.");
    if (cost.mana) payMana(ctx, playerId, parseManaCost(cost.mana));
    if (life) changeLife(ctx, playerId, -life);
  }
  // "Do this only once each turn" (G'raha Tia, Emet-Selch): done, so not again this turn.
  if (accept && spec?.oncePerTurnWhenPaid) s.triggeredThisTurn.push(`${item.source}#${item.ability}`);
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
  if (pending.purpose === 'addCounters') {
    for (const id of cards) if (s.cards[id]!.zone === 'battlefield') addCounters(ctx, id, 1, r.item.controller, pending.counter);
  } else if (pending.purpose === 'distributeCounter') {
    const distribution = r.distribution!;
    const recipient = cards[0];
    const assigned = recipient ? { ...distribution.assigned, [recipient]: (distribution.assigned[recipient] ?? 0) + 1 } : distribution.assigned;
    const remaining = distribution.remaining - (recipient ? 1 : 0);
    r.distribution = { ...distribution, assigned, remaining };
    if (recipient && remaining > 0) r.choiceQueue = [{ ...pending, cards: [...pending.cards], counterCount: remaining }, ...(r.choiceQueue ?? [])];
    else {
      const moved = Object.values(assigned).reduce((total, n) => total + n, 0);
      let available = removeCounters(ctx, distribution.source, '+1/+1', moved);
      for (const [to, n] of Object.entries(assigned)) {
        const movedToRecipient = Math.min(n, available);
        addCounters(ctx, to, movedToRecipient, r.item.controller);
        available -= movedToRecipient;
      }
      delete r.distribution;
    }
  } else if (pending.purpose === 'reanimate') {
    // Reserve the card until all opponents have chosen; all enter together afterwards.
  } else if (pending.purpose === 'library') {
    const id = pending.cards[0]!;
    const c = s.cards[id]!;
    s.stack = s.stack.filter((entry) => !(entry.kind === 'spell' && entry.card === id));
    moveCard(ctx, id, 'library');
    if (cards.length === 0) {
      const library = player(s, c.owner).library;
      library.splice(library.indexOf(id), 1);
      library.unshift(id);
    }
  } else if (pending.purpose === 'offerDraw') {
    if (cards.length > 0) drawCards(ctx, r.item.controller, 3);
    else {
      const milled = topOfLibrary(s, r.item.controller, 3);
      const damage = milled.reduce((sum, id) => sum + manaValue(parseManaCost(defOf(s, s.cards[id]!).manaCost)), 0);
      for (const id of milled) moveCard(ctx, id, 'graveyard');
      dealDamage(ctx, sourceOf(r.item), { kind: 'player', player: pending.player }, damage, false);
    }
  } else if (pending.purpose === 'discard') {
    for (const id of cards) discard(ctx, id);
    if (r.conniving) {
      const nonland = cards.filter((id) => !hasType(s, s.cards[id]!, 'land')).length;
      for (const id of r.conniving.slice(0, nonland)) addCounters(ctx, id, 1, pending.player);
      delete r.conniving;
    }
  } else if (pending.purpose === 'hand') {
    // The rest go on the bottom of the library, in the order shown.
    const library = player(s, pending.player).library;
    for (const id of cards) moveCard(ctx, id, 'hand');
    for (const id of pending.cards) {
      if (cards.includes(id) || !library.includes(id)) continue;
      library.splice(library.indexOf(id), 1);
      library.push(id);
    }
  }
  else if (pending.purpose === 'battlefield') {
    for (const id of cards) {
      moveCard(ctx, id, 'battlefield');
      const c = s.cards[id]!;
      c.controller = pending.player;
      c.summoningSick = true;
      if (entersTapped(s, c)) c.tapped = true;
    }
  }
  else if (pending.purpose === 'sacrifice') {
    for (const id of cards) sacrifice(ctx, id);
    if (cards.length > 0) r.sacrificedAny = true;
  }
  else if (pending.purpose === 'destroy') {
    for (const id of cards) if (destroy(ctx, id)) r.destroyedCount = (r.destroyedCount ?? 0) + 1;
  }
  else {
    if (pending.purpose === 'keepVow') for (const id of cards) {
      addCounters(ctx, id, 1, r.item.controller, 'vow');
      s.cards[id]!.vowTo = [...(s.cards[id]!.vowTo ?? []), r.item.controller];
    }
    for (const id of pending.cards) if (!cards.includes(id) && s.cards[id]!.zone === 'battlefield') sacrifice(ctx, id);
  }
  // Whose cards they were: the chooser's own, except when the spell's controller chose for everyone.
  const owner = cards.length ? s.cards[cards[0]!]!.owner : pending.player;
  r.chosen = [...(r.chosen ?? []), { player: pending.purpose === 'keep' ? owner : pending.player, cards }];
  continueResolving(ctx);
}

/** Choosing what a returning creature attacks is part of resolution, not targeting. */
export function chooseDefender(ctx: Ctx, playerId: PlayerId, defender: PlayerId): void {
  const s = ctx.s, pending = s.pending;
  if (pending.kind !== 'chooseDefender' || pending.player !== playerId || !s.resolving) reject('You have no defending player to choose.');
  if (!pending.defenders.includes(defender) || !s.players[defender] || s.players[defender]!.eliminated || defender === playerId) reject('Choose an opponent still in the game.');
  s.resolving.attackingDefender = defender;
  // Retry the paused ReturnToBattlefield effect after this non-target choice.
  s.resolving.next--;
  s.pending = { kind: 'priority', player: playerId, passes: 0 };
  resumeResolving(ctx);
}

/** Carries on resolving after a decision, including when a chooser leaves the game. */
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
