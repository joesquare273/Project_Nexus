// Casting spells, playing lands, activating abilities, and resolving the
// stack (PRD 7.2).

import { amountOf, isEquipment } from './characteristics.ts';
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
import { isPermanentCard, isSpellCard, manaProduced } from './typerules.ts';
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
    out.push({
      cost: { mana: def.landcycling.cost, discardThis: true },
      zone: 'hand',
      effects: [{ effect: 'SearchLibraryToHand', target: 'You', filter: { subtypes: [def.landcycling.subtype] } }],
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

/** A spell's effects, given the mode chosen for modal spells. */
export function spellEffects(def: CardDefinition, mode: number | undefined): EffectSpec[] {
  if (def.modes) return def.modes[mode ?? 0] ?? [];
  return def.effects ?? [];
}

/** The effects a stack item applies when it resolves. */
export function effectsOf(s: GameState, item: StackItem): EffectSpec[] {
  if (item.kind === 'ability') return abilitySpec(s, item).effects;
  return spellEffects(defOf(s, s.cards[item.card]!), item.mode);
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
  const produced = manaProduced(def);
  if (produced.length === 0) reject('That permanent has no mana ability.');
  if (!produced.includes(mana)) reject(`That permanent can't produce {${mana}}.`);
  if (c.tapped) reject('That permanent is already tapped.');
  if (hasType(s, c, 'creature') && c.summoningSick && !hasKeyword(s, c, 'Haste')) {
    reject('Creatures with summoning sickness can’t use tap abilities.');
  }
  tap(ctx, c);
  if (def.manaAbility?.sacrifice) sacrifice(ctx, id);
  addMana(ctx, playerId, mana, id, def.manaAbility?.onlyForEquipment ?? false);
}

// ---------------------------------------------------------------------------
// Playing cards and activating abilities
// ---------------------------------------------------------------------------

/** Where a player could play or cast this card from right now, or null. */
export function playableZone(s: GameState, playerId: PlayerId, c: CardInstance): 'hand' | 'graveyard' | 'exile' | null {
  if (c.owner === playerId && c.zone === 'hand') return 'hand';
  if (c.owner === playerId && c.zone === 'graveyard' && defOf(s, c).flashback) return 'graveyard';
  const p = c.playableFromExile;
  if (c.zone === 'exile' && p?.player === playerId) {
    const source = s.cards[p.source];
    if (source?.zone === 'battlefield' && source.controller === playerId) return 'exile';
  }
  return null;
}

export function playLand(ctx: Ctx, playerId: PlayerId, id: InstanceId): void {
  const s = ctx.s;
  const c = card(s, id);
  const p = player(s, playerId);
  const from = playableZone(s, playerId, c);
  if (from !== 'hand' && from !== 'exile') reject('That card is not in your hand.');
  if (!hasType(s, c, 'land')) reject('Only lands are played this way; cast spells with CastSpell.');
  if (!canActAtSorcerySpeed(s, playerId)) reject('Lands can only be played in your main phase with an empty stack.');
  if (p.landsPlayedThisTurn >= 1) reject('You have already played a land this turn.');
  p.landsPlayedThisTurn += 1;
  moveCard(ctx, id, 'battlefield');
  c.controller = playerId;
  c.summoningSick = true;
  if (defOf(s, c).entersTapped) c.tapped = true;
}

/** What it costs to cast a spell with these targets: its flashback cost from the graveyard, minus any reduction. */
export function spellCost(
  s: GameState,
  def: CardDefinition,
  from: 'hand' | 'graveyard' | 'exile',
  targets: Target[],
): ManaCost {
  let cost = parseManaCost(from === 'graveyard' ? def.flashback : def.manaCost);
  if (def.costReduction?.ifTargetsTappedCreature) {
    const tapped = targets.some((t) => t.kind === 'card' && isCreatureOnBattlefield(s, s.cards[t.card]) && s.cards[t.card]!.tapped);
    if (tapped) cost = reduceGeneric(cost, def.costReduction.generic);
  }
  return cost;
}

export function castSpell(ctx: Ctx, playerId: PlayerId, id: InstanceId, targets: Target[] = [], mode?: number): void {
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
  if (def.modes && (mode === undefined || !def.modes[mode])) reject(`Choose a mode for ${def.name}.`);
  checkTargets(s, spellEffects(def, mode), targets, playerId, id);
  const manaSpent = payMana(ctx, playerId, spellCost(s, def, from, targets), isEquipment(s, c));

  moveCard(ctx, id, 'stack');
  const item: SpellItem = {
    id: newId(s, 's'),
    kind: 'spell',
    card: id,
    controller: playerId,
    targets,
    ...(mode !== undefined ? { mode } : {}),
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
    case 'CreatedTokens':
      return r.createdTokens.filter((id) => s.cards[id]!.zone === 'battlefield').map((id) => ({ kind: 'card', card: id }));
    default:
      return chosen && isLegalTarget(s, effect, chosen, item.controller, sourceOf(item)) ? [chosen] : [];
  }
}

function topOfLibrary(s: GameState, playerId: PlayerId, n: number): InstanceId[] {
  return s.players[playerId]!.library.slice(0, n);
}

function applyEffect(ctx: Ctx, effect: EffectSpec, r: Resolving, targets: Target[]): void {
  const s = ctx.s;
  const item = r.item;
  const source = sourceOf(item);
  const amount = amountOf(s, effect.amount, item.controller);
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
      for (const id of onBattlefield) destroy(ctx, id);
      return;
    case 'Exile':
      for (const id of onBattlefield) moveCard(ctx, id, 'exile');
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
      r.surveilQueue.push(...topOfLibrary(s, item.controller, amount));
      return;
    case 'ReturnToBattlefield':
      for (const id of cards) {
        const c = s.cards[id]!;
        if (c.zone !== 'graveyard') continue;
        moveCard(ctx, id, 'battlefield');
        c.summoningSick = true;
        if (defOf(s, c).entersTapped) c.tapped = true;
        addCounters(ctx, id, effect.counters ?? 0);
      }
      return;
    case 'Attach':
      for (const id of onBattlefield) attach(ctx, source, id);
      return;
    case 'AttachAllEquipment':
      for (const id of onBattlefield) {
        for (const e of battlefield(s)) {
          if (e.controller === item.controller && isEquipment(s, e)) attach(ctx, e.id, id);
        }
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
      s.pending = { kind: 'surveil', player: item.controller, card: next };
      return;
    }
    if (r.next >= effects.length) break;
    const effect = effects[r.next++]!;
    const chosen = CHOSEN_TARGET_KINDS.includes(effect.target) ? item.targets[r.chosenUsed++] : undefined;
    if (chosen) r.previousTarget = chosen;
    if (effect.if === 'castFromGraveyard' && !(item.kind === 'spell' && item.castFrom === 'graveyard')) continue;
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
      if (def.entersTapped) c.tapped = true;
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
  if (toGraveyard) moveCard(ctx, id, 'graveyard');
  ctx.ev.push({ type: 'Surveiled', player: playerId, card: id, toGraveyard });
  continueResolving(ctx);
}
