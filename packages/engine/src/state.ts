// Low-level helpers shared by the rules modules. They mutate a working copy
// of the state (`ctx.s`) and record events in order (`ctx.ev`). applyAction
// clones the input first, so callers never see partial mutations.

import {
  MANA_TYPES,
  type CardDefinition,
  type CardInstance,
  type CardType,
  type GameEvent,
  type GameState,
  type InstanceId,
  type Keyword,
  type ManaPool,
  type ManaType,
  type PlayerId,
  type PlayerState,
  type Target,
  type ZoneName,
} from './types.ts';

export interface Ctx {
  s: GameState;
  ev: GameEvent[];
}

export class RuleError extends Error {}

/** Throws a RuleError, which applyAction turns into { ok: false }. */
export function reject(message: string): never {
  throw new RuleError(message);
}

/**
 * Copies everything applyAction may mutate. Card definitions and the format
 * are immutable and shared. Much faster than structuredClone; when you add a
 * nested mutable field to GameState, copy it here too (the "does not mutate
 * its input" test will catch a miss).
 */
export function cloneState(s: GameState): GameState {
  const cards: GameState['cards'] = {};
  for (const id in s.cards) cards[id] = { ...s.cards[id]! };
  const players: GameState['players'] = {};
  for (const id in s.players) {
    const p = s.players[id]!;
    players[id] = {
      ...p,
      library: [...p.library],
      hand: [...p.hand],
      battlefield: [...p.battlefield],
      graveyard: [...p.graveyard],
      exile: [...p.exile],
      manaPool: { ...p.manaPool },
    };
  }
  return {
    ...s,
    cards,
    players,
    turnOrder: [...s.turnOrder],
    stack: s.stack.map((item) => ({ ...item, targets: item.targets.map((t) => ({ ...t })) })),
    triggerQueue: s.triggerQueue.map((t) => ({ ...t })),
    triggeredThisTurn: [...s.triggeredThisTurn],
    combat: s.combat && {
      attacks: s.combat.attacks.map((a) => ({ ...a })),
      blocks: s.combat.blocks.map((b) => ({ ...b })),
      blockersPending: [...s.combat.blockersPending],
    },
    pending: { ...s.pending },
  };
}

export function emptyManaPool(): ManaPool {
  const pool = {} as ManaPool;
  for (const t of MANA_TYPES) pool[t] = 0;
  return pool;
}

export function player(s: GameState, id: PlayerId): PlayerState {
  const p = s.players[id];
  if (!p) reject(`Unknown player "${id}".`);
  return p;
}

export function card(s: GameState, id: InstanceId): CardInstance {
  const c = s.cards[id];
  if (!c) reject(`Unknown card "${id}".`);
  return c;
}

export function defOf(s: GameState, c: CardInstance): CardDefinition {
  const d = s.cardDefs[c.defId];
  if (!d) throw new Error(`Missing card definition "${c.defId}".`);
  return d;
}

export function hasType(s: GameState, c: CardInstance, type: CardType): boolean {
  return defOf(s, c).types.includes(type);
}

export function hasKeyword(s: GameState, c: CardInstance, keyword: Keyword): boolean {
  return defOf(s, c).keywords?.includes(keyword) ?? false;
}

export function isPermanentCard(def: CardDefinition): boolean {
  return !def.types.includes('instant') && !def.types.includes('sorcery');
}

export function isCreatureOnBattlefield(s: GameState, c: CardInstance | undefined): c is CardInstance {
  return !!c && c.zone === 'battlefield' && hasType(s, c, 'creature');
}

export function alivePlayers(s: GameState): PlayerId[] {
  return s.turnOrder.filter((id) => !s.players[id]!.eliminated);
}

/** The next player after `from` in turn order who is still in the game. */
export function nextAlive(s: GameState, from: PlayerId): PlayerId {
  const n = s.turnOrder.length;
  const start = s.turnOrder.indexOf(from);
  for (let i = 1; i <= n; i++) {
    const id = s.turnOrder[(start + i) % n]!;
    if (!s.players[id]!.eliminated) return id;
  }
  return from;
}

/** Living players in turn order, starting with the active player. */
export function aliveFromActive(s: GameState): PlayerId[] {
  const order = alivePlayers(s);
  const i = order.indexOf(s.activePlayer);
  return i < 0 ? order : [...order.slice(i), ...order.slice(0, i)];
}

/** Every permanent on the battlefield, in turn order then entry order. */
export function battlefield(s: GameState): CardInstance[] {
  return s.turnOrder.flatMap((pid) => s.players[pid]!.battlefield.map((id) => s.cards[id]!));
}

export function newId(s: GameState, prefix: string): string {
  return `${prefix}${s.nextId++}`;
}

/** The list that holds a card in the given zone. The stack is shared, not per player. */
function zoneList(s: GameState, owner: PlayerId, zone: ZoneName): InstanceId[] | null {
  if (zone === 'stack') return null;
  return player(s, owner)[zone];
}

/**
 * Moves a card between zones. Cards always live in their owner's zones.
 * A card that changes zones becomes a new object, so its per-object state
 * resets. Emits CardMoved unless `silent` is set (draws emit CardDrawn).
 */
export function moveCard(ctx: Ctx, id: InstanceId, to: ZoneName, opts: { silent?: boolean } = {}): void {
  const c = card(ctx.s, id);
  const from = c.zone;
  const fromList = zoneList(ctx.s, c.owner, from);
  if (fromList) {
    const i = fromList.indexOf(id);
    if (i >= 0) fromList.splice(i, 1);
  }
  const toList = zoneList(ctx.s, c.owner, to);
  if (toList) toList.push(id);
  const controller = c.controller;
  if (ctx.s.triggeredThisTurn.length > 0) {
    // A new object: its once-each-turn abilities can trigger again.
    ctx.s.triggeredThisTurn = ctx.s.triggeredThisTurn.filter((key) => !key.startsWith(`${id}#`));
  }
  c.zone = to;
  c.tapped = false;
  c.summoningSick = false;
  c.damage = 0;
  c.deathtouched = false;
  c.controller = c.owner;
  if (!opts.silent) {
    ctx.ev.push({
      type: 'CardMoved',
      card: id,
      defId: c.defId,
      owner: c.owner,
      ...(from === 'battlefield' ? { controller } : {}),
      from,
      to,
    });
  }
}

export function tap(ctx: Ctx, c: CardInstance): void {
  c.tapped = true;
  ctx.ev.push({ type: 'CardTapped', card: c.id });
}

export function drawCards(ctx: Ctx, playerId: PlayerId, count: number): void {
  const p = player(ctx.s, playerId);
  for (let i = 0; i < count; i++) {
    const top = p.library[0];
    if (top === undefined) {
      // Drawing from an empty library makes the player lose at the next state-based check.
      p.drewFromEmptyLibrary = true;
      return;
    }
    moveCard(ctx, top, 'hand', { silent: true });
    ctx.ev.push({ type: 'CardDrawn', player: playerId, card: top, defId: ctx.s.cards[top]!.defId });
  }
}

export function changeLife(ctx: Ctx, playerId: PlayerId, delta: number): void {
  const p = player(ctx.s, playerId);
  if (delta === 0 || p.eliminated) return;
  const from = p.life;
  p.life += delta;
  ctx.ev.push({ type: 'LifeChanged', player: playerId, from, to: p.life });
}

/** Deals damage from a source, applying deathtouch and lifelink. */
export function dealDamage(ctx: Ctx, sourceId: InstanceId, target: Target, amount: number, combat: boolean): void {
  if (amount <= 0) return;
  const s = ctx.s;
  const source = s.cards[sourceId]!;
  ctx.ev.push({ type: 'DamageDealt', source: sourceId, target, amount, combat });
  if (target.kind === 'player') {
    changeLife(ctx, target.player, -amount);
  } else {
    const victim = s.cards[target.card]!;
    victim.damage += amount;
    if (hasKeyword(s, source, 'Deathtouch')) victim.deathtouched = true;
  }
  if (hasKeyword(s, source, 'Lifelink')) changeLife(ctx, source.controller, amount);
}

/** Destroys a permanent unless it is indestructible. */
export function destroy(ctx: Ctx, id: InstanceId): void {
  const c = ctx.s.cards[id]!;
  if (c.zone !== 'battlefield' || hasKeyword(ctx.s, c, 'Indestructible')) return;
  if (hasType(ctx.s, c, 'creature')) ctx.ev.push({ type: 'CreatureDied', card: id, defId: c.defId, owner: c.owner });
  else ctx.ev.push({ type: 'PermanentDestroyed', card: id, defId: c.defId, owner: c.owner });
  moveCard(ctx, id, 'graveyard');
}

export function addMana(ctx: Ctx, playerId: PlayerId, mana: ManaType, source: InstanceId): void {
  player(ctx.s, playerId).manaPool[mana] += 1;
  ctx.ev.push({ type: 'ManaAdded', player: playerId, mana, source });
}

/** Mana empties from every pool at the end of each step and phase. */
export function emptyAllManaPools(s: GameState): void {
  for (const id of s.turnOrder) s.players[id]!.manaPool = emptyManaPool();
}
