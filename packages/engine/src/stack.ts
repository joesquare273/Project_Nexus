// Casting spells, playing lands, mana abilities, and resolving the stack (PRD 7.2).

import { parseManaCost, planPayment } from './cost.ts';
import {
  addMana,
  alivePlayers,
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
import {
  CHOSEN_TARGET_KINDS,
  MANA_TYPES,
  type CardDefinition,
  type EffectSpec,
  type GameState,
  type InstanceId,
  type ManaType,
  type PlayerId,
  type StackItem,
  type Target,
  type TargetKind,
} from './types.ts';

/** Sorcery timing: your own main phase with an empty stack. */
export function canActAtSorcerySpeed(s: GameState, playerId: PlayerId): boolean {
  return s.activePlayer === playerId && (s.step === 'main1' || s.step === 'main2') && s.stack.length === 0;
}

export function hasInstantTiming(def: CardDefinition): boolean {
  return def.types.includes('instant') || (def.keywords?.includes('Flash') ?? false);
}

export function choosingEffects(def: CardDefinition): EffectSpec[] {
  return (def.effects ?? []).filter((e) => CHOSEN_TARGET_KINDS.includes(e.target));
}

export function isLegalTarget(s: GameState, kind: TargetKind, t: Target, controller: PlayerId): boolean {
  if (t.kind === 'player') {
    const p = s.players[t.player];
    return !!p && !p.eliminated && (kind === 'AnyTarget' || kind === 'TargetPlayer');
  }
  const c = s.cards[t.card];
  if (!isCreatureOnBattlefield(s, c)) return false;
  if (kind === 'AnyTarget' || kind === 'TargetCreature') return true;
  if (kind === 'OpponentCreature') return c.controller !== controller;
  return false;
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

export function castSpell(ctx: Ctx, playerId: PlayerId, id: InstanceId, targets: Target[] = []): void {
  const s = ctx.s;
  const c = card(s, id);
  const def = defOf(s, c);
  const p = player(s, playerId);
  if (c.owner !== playerId || c.zone !== 'hand') reject('That card is not in your hand.');
  if (def.types.includes('land')) reject('Lands are played with PlayLand, not cast.');
  if (!hasInstantTiming(def) && !canActAtSorcerySpeed(s, playerId)) {
    reject('This card can only be cast in your main phase with an empty stack.');
  }

  const needs = choosingEffects(def);
  if (targets.length !== needs.length) reject(`This spell needs ${needs.length} target(s).`);
  needs.forEach((effect, i) => {
    if (!isLegalTarget(s, effect.target, targets[i]!, playerId)) reject(`Target ${i + 1} is not legal.`);
  });

  const spent = planPayment(p.manaPool, parseManaCost(def.manaCost));
  if (!spent) reject('Not enough mana in your mana pool.');
  for (const t of MANA_TYPES) p.manaPool[t] -= spent[t] ?? 0;
  if (Object.keys(spent).length > 0) ctx.ev.push({ type: 'ManaSpent', player: playerId, amounts: spent });

  moveCard(ctx, id, 'stack');
  const item: StackItem = { id: newId(s, 's'), kind: 'spell', card: id, controller: playerId, targets };
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
      case 'Destroy':
        if (t.kind === 'card') destroy(ctx, t.card);
        break;
    }
  }
}

/** Resolves the top item of the stack. */
export function resolveTop(ctx: Ctx): void {
  const s = ctx.s;
  const item = s.stack.pop();
  if (!item) return;
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

  // A spell whose targets have all become illegal doesn't resolve.
  const needs = choosingEffects(def);
  const fizzled =
    needs.length > 0 && needs.every((e, i) => !isLegalTarget(s, e.target, item.targets[i]!, item.controller));
  ctx.ev.push({ type: 'StackItemResolved', item: item.id, card: c.id, fizzled });
  if (!fizzled) {
    let chosenIndex = 0;
    for (const effect of def.effects ?? []) {
      const chosen = CHOSEN_TARGET_KINDS.includes(effect.target) ? item.targets[chosenIndex++] : undefined;
      applyEffect(ctx, effect, c.id, resolveTargets(s, effect, item, chosen));
    }
  }
  moveCard(ctx, c.id, 'graveyard');
}
