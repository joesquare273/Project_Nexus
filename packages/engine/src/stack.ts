// Casting spells, playing lands, mana abilities, and resolving the stack (PRD 7.2).

import { parseManaCost, planPayment } from './cost.ts';
import {
  addMana,
  alivePlayers,
  battlefield,
  card,
  changeLife,
  dealDamage,
  defOf,
  destroy,
  drawCards,
  hasKeyword,
  hasType,
  isCreatureOnBattlefield,
  isPermanentCard,
  moveCard,
  newId,
  player,
  reject,
  tap,
  type Ctx,
} from './state.ts';
import { givePriority } from './turn.ts';
import {
  CHOSEN_TARGET_KINDS,
  MANA_TYPES,
  type AbilityItem,
  type CardDefinition,
  type EffectSpec,
  type GameState,
  type InstanceId,
  type ManaType,
  type PlayerId,
  type SpellItem,
  type StackItem,
  type Target,
  type TargetKind,
  type TriggerSpec,
} from './types.ts';

/** Sorcery timing: your own main phase with an empty stack. */
export function canActAtSorcerySpeed(s: GameState, playerId: PlayerId): boolean {
  return s.activePlayer === playerId && (s.step === 'main1' || s.step === 'main2') && s.stack.length === 0;
}

export function hasInstantTiming(def: CardDefinition): boolean {
  return def.types.includes('instant') || (def.keywords?.includes('Flash') ?? false);
}

/** The effects whose targets are chosen, in order. A spell or ability has one target per such effect. */
export function choosingEffects(effects: readonly EffectSpec[] | undefined): EffectSpec[] {
  return (effects ?? []).filter((e) => CHOSEN_TARGET_KINDS.includes(e.target));
}

export function triggerSpec(s: GameState, item: AbilityItem): TriggerSpec {
  return defOf(s, s.cards[item.source]!).triggers![item.ability]!;
}

/** The effects a stack item applies when it resolves. */
export function effectsOf(s: GameState, item: StackItem): EffectSpec[] {
  if (item.kind === 'ability') return triggerSpec(s, item).effects;
  return defOf(s, s.cards[item.card]!).effects ?? [];
}

export function isLegalTarget(s: GameState, kind: TargetKind, t: Target, controller: PlayerId): boolean {
  if (t.kind === 'player') {
    const p = s.players[t.player];
    if (!p || p.eliminated) return false;
    if (kind === 'TargetOpponent') return t.player !== controller;
    return kind === 'AnyTarget' || kind === 'TargetPlayer';
  }
  const c = s.cards[t.card];
  if (!isCreatureOnBattlefield(s, c)) return false;
  if (kind === 'AnyTarget' || kind === 'TargetCreature') return true;
  if (kind === 'OpponentCreature') return c.controller !== controller;
  return false;
}

/** Every legal choice for one chosen target: living players, then creatures in turn order. */
export function targetOptions(s: GameState, kind: TargetKind, controller: PlayerId): Target[] {
  const all: Target[] = alivePlayers(s).map((p) => ({ kind: 'player', player: p }));
  for (const c of battlefield(s)) all.push({ kind: 'card', card: c.id });
  return all.filter((t) => isLegalTarget(s, kind, t, controller));
}

/** Checks a list of chosen targets against the effects that need them. */
export function checkTargets(s: GameState, effects: readonly EffectSpec[], targets: Target[], controller: PlayerId): void {
  const needs = choosingEffects(effects);
  if (targets.length !== needs.length) reject(`This needs ${needs.length} target(s).`);
  needs.forEach((effect, i) => {
    if (!isLegalTarget(s, effect.target, targets[i]!, controller)) reject(`Target ${i + 1} is not legal.`);
  });
}

/** A spell or ability whose targets have all become illegal doesn't resolve (rule 608.2b). */
function allTargetsIllegal(s: GameState, item: StackItem): boolean {
  const needs = choosingEffects(effectsOf(s, item));
  return needs.length > 0 && needs.every((e, i) => !isLegalTarget(s, e.target, item.targets[i]!, item.controller));
}

export function playLand(ctx: Ctx, playerId: PlayerId, id: InstanceId): void {
  const s = ctx.s;
  const c = card(s, id);
  const p = player(s, playerId);
  if (c.owner !== playerId || c.zone !== 'hand') reject('That card is not in your hand.');
  if (!hasType(s, c, 'land')) reject('Only lands are played this way; cast spells with CastSpell.');
  if (!canActAtSorcerySpeed(s, playerId)) reject('Lands can only be played in your main phase with an empty stack.');
  if (p.landsPlayedThisTurn >= 1) reject('You have already played a land this turn.');
  p.landsPlayedThisTurn += 1;
  moveCard(ctx, id, 'battlefield');
  c.summoningSick = true;
  if (defOf(s, c).entersTapped) c.tapped = true;
}

/** Tap a land for one mana of a type it can produce. Mana abilities don't use the stack. */
export function activateManaAbility(ctx: Ctx, playerId: PlayerId, id: InstanceId, mana: ManaType): void {
  const s = ctx.s;
  const c = card(s, id);
  const def = defOf(s, c);
  if (c.zone !== 'battlefield' || c.controller !== playerId) reject('You do not control that permanent.');
  if (!def.produces?.length) reject('That permanent has no mana ability.');
  if (!def.produces.includes(mana)) reject(`That permanent can't produce {${mana}}.`);
  if (c.tapped) reject('That permanent is already tapped.');
  if (hasType(s, c, 'creature') && c.summoningSick && !hasKeyword(s, c, 'Haste')) {
    reject('Creatures with summoning sickness can’t use tap abilities.');
  }
  tap(ctx, c);
  addMana(ctx, playerId, mana, id);
}

/** Pays a mana cost from the player's pool, or rejects the action. */
export function payMana(ctx: Ctx, playerId: PlayerId, manaCost: string | undefined): void {
  const p = player(ctx.s, playerId);
  const spent = planPayment(p.manaPool, parseManaCost(manaCost));
  if (!spent) reject('Not enough mana in your mana pool.');
  for (const t of MANA_TYPES) p.manaPool[t] -= spent[t] ?? 0;
  if (Object.keys(spent).length > 0) ctx.ev.push({ type: 'ManaSpent', player: playerId, amounts: spent });
}

export function castSpell(ctx: Ctx, playerId: PlayerId, id: InstanceId, targets: Target[] = []): void {
  const s = ctx.s;
  const c = card(s, id);
  const def = defOf(s, c);
  if (c.owner !== playerId || c.zone !== 'hand') reject('That card is not in your hand.');
  if (def.types.includes('land')) reject('Lands are played with PlayLand, not cast.');
  if (!hasInstantTiming(def) && !canActAtSorcerySpeed(s, playerId)) {
    reject('This card can only be cast in your main phase with an empty stack.');
  }
  checkTargets(s, def.effects ?? [], targets, playerId);
  payMana(ctx, playerId, def.manaCost);

  moveCard(ctx, id, 'stack');
  const item: SpellItem = { id: newId(s, 's'), kind: 'spell', card: id, controller: playerId, targets };
  s.stack.push(item);
  ctx.ev.push({ type: 'SpellCast', player: playerId, card: id, defId: c.defId, targets });
  ctx.ev.push({ type: 'StackItemAdded', item: item.id, card: id });
}

function resolveTargets(s: GameState, effect: EffectSpec, item: StackItem, chosen: Target | undefined): Target[] {
  const toPlayers = (ids: PlayerId[]): Target[] => ids.map((id) => ({ kind: 'player', player: id }));
  switch (effect.target) {
    case 'You':
      return toPlayers([item.controller]);
    case 'EachPlayer':
      return toPlayers(alivePlayers(s));
    case 'EachOpponent':
      return toPlayers(alivePlayers(s).filter((id) => id !== item.controller));
    case 'EachOpponentCreature':
      return battlefield(s)
        .filter((c) => c.controller !== item.controller && hasType(s, c, 'creature'))
        .map((c) => ({ kind: 'card', card: c.id }));
    case 'This':
      // "This card" means the same object: it must still be where it was when the ability triggered.
      return item.kind === 'ability' && s.cards[item.source]!.zone === item.sourceZone
        ? [{ kind: 'card', card: item.source }]
        : [];
    default:
      return chosen && isLegalTarget(s, effect.target, chosen, item.controller) ? [chosen] : [];
  }
}

function applyEffect(ctx: Ctx, effect: EffectSpec, source: InstanceId, targets: Target[]): void {
  const amount = effect.amount ?? 0;
  for (const t of targets) {
    switch (effect.effect) {
      case 'DealDamage':
        dealDamage(ctx, source, t, amount, false);
        break;
      case 'DrawCards':
        if (t.kind === 'player') drawCards(ctx, t.player, amount);
        break;
      case 'GainLife':
        if (t.kind === 'player') changeLife(ctx, t.player, amount);
        break;
      case 'LoseLife':
        if (t.kind === 'player') changeLife(ctx, t.player, -amount);
        break;
      case 'Destroy':
        if (t.kind === 'card') destroy(ctx, t.card);
        break;
      case 'Tap': {
        const c = t.kind === 'card' ? ctx.s.cards[t.card]! : null;
        if (c && c.zone === 'battlefield' && !c.tapped) tap(ctx, c);
        break;
      }
      case 'ReturnToHand':
        if (t.kind === 'card') moveCard(ctx, t.card, 'hand');
        break;
    }
  }
}

function applyEffects(ctx: Ctx, item: StackItem, source: InstanceId): void {
  let chosenIndex = 0;
  for (const effect of effectsOf(ctx.s, item)) {
    const chosen = CHOSEN_TARGET_KINDS.includes(effect.target) ? item.targets[chosenIndex++] : undefined;
    applyEffect(ctx, effect, source, resolveTargets(ctx.s, effect, item, chosen));
  }
}

function resolveSpell(ctx: Ctx, item: SpellItem): void {
  const s = ctx.s;
  const c = s.cards[item.card]!;
  const def = defOf(s, c);

  if (isPermanentCard(def)) {
    ctx.ev.push({ type: 'StackItemResolved', item: item.id, card: c.id, fizzled: false });
    moveCard(ctx, c.id, 'battlefield');
    c.controller = item.controller;
    c.summoningSick = true;
    if (def.entersTapped) c.tapped = true;
    return;
  }

  const fizzled = allTargetsIllegal(s, item);
  ctx.ev.push({ type: 'StackItemResolved', item: item.id, card: c.id, fizzled });
  if (!fizzled) applyEffects(ctx, item, c.id);
  moveCard(ctx, c.id, 'graveyard');
}

/**
 * Resolves the top item of the stack, then the active player gets priority.
 * An ability with "you may" or an optional cost stops first to ask its
 * controller (see `decide`), and resolves once they answer.
 */
export function resolveTop(ctx: Ctx): void {
  const s = ctx.s;
  const item = s.stack.at(-1);
  if (!item) return;
  if (item.kind === 'spell') {
    s.stack.pop();
    resolveSpell(ctx, item);
  } else {
    const spec = triggerSpec(s, item);
    const fizzled = allTargetsIllegal(s, item);
    if (!fizzled && (spec.optional || spec.cost) && item.accepted === undefined) {
      s.pending = { kind: 'decide', player: item.controller, item: item.id };
      return;
    }
    s.stack.pop();
    ctx.ev.push({ type: 'StackItemResolved', item: item.id, card: item.source, fizzled });
    if (!fizzled && item.accepted !== false) applyEffects(ctx, item, item.source);
  }
  givePriority(ctx, s.activePlayer);
}

/** Answers the pending "you may" for the ability on top of the stack, paying its cost if accepted. */
export function decide(ctx: Ctx, playerId: PlayerId, accept: boolean): void {
  const s = ctx.s;
  const pending = s.pending;
  if (pending.kind !== 'decide' || pending.player !== playerId) reject('You have no decision to make right now.');
  const item = s.stack.at(-1);
  if (item?.kind !== 'ability' || item.id !== pending.item) throw new Error('The ability being decided is not on top of the stack.');
  const cost = triggerSpec(s, item).cost;
  if (accept && cost) {
    if (cost.life !== undefined && player(s, playerId).life < cost.life) reject("You don't have enough life to pay.");
    if (cost.mana) payMana(ctx, playerId, cost.mana);
    if (cost.life) changeLife(ctx, playerId, -cost.life);
  }
  item.accepted = accept;
  ctx.ev.push({ type: 'Decided', player: playerId, item: item.id, card: item.source, accepted: accept });
  resolveTop(ctx);
}
