// Low-level helpers shared by the rules modules. They mutate a working copy
// of the state (`ctx.s`) and record events in order (`ctx.ev`). applyAction
// clones the input first, so callers never see partial mutations.

import { hasFlag, hasKeyword, staticAffects } from './characteristics.ts';
import { entersTapped } from './typerules.ts';
import {
  MANA_TYPES,
  type CardDefId,
  type CardDefinition,
  type CardInstance,
  type CardType,
  type GameEvent,
  type GameState,
  type InstanceId,
  type ManaPool,
  type ManaType,
  type PlayerId,
  type PlayerState,
  type Target,
  type ZoneName,
} from './types.ts';

export { hasKeyword } from './characteristics.ts';

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
      command: [...p.command],
      commanderCasts: { ...p.commanderCasts },
      commanderDamage: { ...p.commanderDamage },
      manaPool: { ...p.manaPool },
      equipmentMana: { ...p.equipmentMana },
    };
  }
  const copyItem = <T extends GameState['stack'][number]>(item: T): T => ({
    ...item,
    targets: item.targets.map((t) => ({ ...t })),
  });
  return {
    ...s,
    cards,
    players,
    turnOrder: [...s.turnOrder],
    stack: s.stack.map(copyItem),
    resolving: s.resolving && {
      ...s.resolving,
      item: copyItem(s.resolving.item),
      ...(s.resolving.previousTarget ? { previousTarget: { ...s.resolving.previousTarget } } : {}),
      createdTokens: [...s.resolving.createdTokens],
      surveilQueue: [...s.resolving.surveilQueue],
    },
    triggerQueue: s.triggerQueue.map((t) => ({ ...t })),
    triggeredThisTurn: [...s.triggeredThisTurn],
    temporaryEffects: s.temporaryEffects.map((e) => ({ ...e })),
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

/** The list that holds a card in the given zone. The stack and the void aren't per player. */
function zoneList(s: GameState, owner: PlayerId, zone: ZoneName): InstanceId[] | null {
  if (zone === 'stack' || zone === 'void') return null;
  return player(s, owner)[zone];
}

/**
 * Moves a card between zones. Cards always live in their owner's zones.
 * A card that changes zones becomes a new object, so its per-object state
 * resets. Emits CardMoved unless `silent` is set (draws emit CardDrawn).
 */
export function moveCard(ctx: Ctx, id: InstanceId, to: ZoneName, opts: { silent?: boolean } = {}): void {
  const s = ctx.s;
  const c = card(s, id);
  const from = c.zone;
  const fromList = zoneList(s, c.owner, from);
  if (fromList) {
    const i = fromList.indexOf(id);
    if (i >= 0) fromList.splice(i, 1);
  }
  const toList = zoneList(s, c.owner, to);
  if (toList) toList.push(id);
  const controller = c.controller;
  const equippedBy = from === 'battlefield' ? battlefield(s).filter((e) => e.attachedTo === id).map((e) => e.id) : [];
  if (s.triggeredThisTurn.length > 0) {
    // A new object: its once-each-turn abilities can trigger again.
    s.triggeredThisTurn = s.triggeredThisTurn.filter((key) => !key.startsWith(`${id}#`));
  }
  if (from === 'battlefield' && to === 'graveyard' && hasType(s, c, 'creature')) s.creaturesDiedThisTurn += 1;
  c.zone = to;
  c.tapped = false;
  c.summoningSick = false;
  c.damage = 0;
  c.deathtouched = false;
  c.controller = c.owner;
  delete c.counters;
  delete c.attachedTo;
  delete c.exiledUntilLeaves;
  delete c.playableFromExile;
  delete c.commanderStays;
  if (!opts.silent) {
    ctx.ev.push({
      type: 'CardMoved',
      card: id,
      defId: c.defId,
      owner: c.owner,
      ...(from === 'battlefield' ? { controller } : {}),
      ...(equippedBy.length > 0 ? { equippedBy } : {}),
      from,
      to,
    });
  }
  if (from === 'battlefield') leftBattlefield(ctx, id);
  // "Enters with N +1/+1 counters on it" (rule 614.1c).
  const enters = s.cardDefs[c.defId]!.entersWithCounters;
  if (to === 'battlefield' && enters) addCounters(ctx, id, enters);
}

/** Things that happen the moment a permanent leaves the battlefield. */
function leftBattlefield(ctx: Ctx, id: InstanceId): void {
  const s = ctx.s;
  if (s.temporaryEffects.length > 0) s.temporaryEffects = s.temporaryEffects.filter((e) => e.affected !== id);
  for (const other of battlefield(s)) {
    if (other.attachedTo !== id) continue;
    // Equipment stays on the battlefield, unattached (rule 301.5c).
    delete other.attachedTo;
    ctx.ev.push({ type: 'Attached', equipment: other.id, creature: null });
  }
  // "Exile ... until this leaves the battlefield": the exiled card comes back (rule 610.3).
  for (const pid of s.turnOrder) {
    for (const exiled of [...s.players[pid]!.exile]) {
      const e = s.cards[exiled]!;
      if (e.exiledUntilLeaves !== id) continue;
      if (s.players[e.owner]!.eliminated) continue;
      moveCard(ctx, exiled, 'battlefield');
      e.summoningSick = true;
      if (entersTapped(s, e)) e.tapped = true;
    }
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
    // Commander damage (rule 903.10a): combat damage from a commander is tracked per commander.
    if (combat && source.isCommander) {
      const taken = player(s, target.player).commanderDamage;
      taken[sourceId] = (taken[sourceId] ?? 0) + amount;
    }
  } else {
    const victim = s.cards[target.card]!;
    victim.damage += amount;
    if (hasKeyword(s, source, 'Deathtouch')) victim.deathtouched = true;
  }
  if (hasKeyword(s, source, 'Lifelink')) changeLife(ctx, source.controller, amount);
}

/**
 * Puts a permanent into its owner's graveyard from the battlefield ("dies"
 * for creatures), unless something says to exile it instead (rule 614).
 */
export function putIntoGraveyard(ctx: Ctx, id: InstanceId): void {
  const s = ctx.s;
  const c = s.cards[id]!;
  if (hasFlag(s, c, 'exileIfWouldDie')) {
    moveCard(ctx, id, 'exile');
    return;
  }
  if (hasType(s, c, 'creature')) ctx.ev.push({ type: 'CreatureDied', card: id, defId: c.defId, owner: c.owner });
  moveCard(ctx, id, 'graveyard');
}

/** Destroys a permanent unless it is indestructible. Returns whether it was destroyed. */
export function destroy(ctx: Ctx, id: InstanceId): boolean {
  const c = ctx.s.cards[id]!;
  if (c.zone !== 'battlefield' || hasKeyword(ctx.s, c, 'Indestructible')) return false;
  if (!hasType(ctx.s, c, 'creature')) ctx.ev.push({ type: 'PermanentDestroyed', card: id, defId: c.defId, owner: c.owner });
  putIntoGraveyard(ctx, id);
  return true;
}

/** Sacrifice: put it into its owner's graveyard; indestructible doesn't help (rule 701.17). */
export function sacrifice(ctx: Ctx, id: InstanceId): void {
  putIntoGraveyard(ctx, id);
}

export function addCounters(ctx: Ctx, id: InstanceId, amount: number): void {
  const s = ctx.s;
  const c = s.cards[id]!;
  if (c.zone !== 'battlefield' || amount <= 0) return;
  // Hardened Scales and similar: "that many plus one" (a replacement effect, rule 614).
  for (const source of battlefield(s)) {
    for (const spec of defOf(s, source).statics ?? []) {
      if (spec.extraCounters && staticAffects(s, source, spec, c)) amount += spec.extraCounters;
    }
  }
  c.counters = (c.counters ?? 0) + amount;
  ctx.ev.push({ type: 'CountersAdded', card: id, amount });
}

/** Creates a token on the battlefield under `controller`'s control (rule 111). */
export function createToken(ctx: Ctx, defId: CardDefId, controller: PlayerId): InstanceId {
  const s = ctx.s;
  if (!s.cardDefs[defId]) throw new Error(`Missing token definition "${defId}".`);
  const id = newId(s, 'k');
  s.cards[id] = {
    id,
    defId,
    owner: controller,
    controller,
    zone: 'battlefield',
    tapped: !!s.cardDefs[defId]!.entersTapped,
    summoningSick: true,
    damage: 0,
    deathtouched: false,
    isToken: true,
  };
  player(s, controller).battlefield.push(id);
  ctx.ev.push({ type: 'TokenCreated', card: id, defId, controller });
  return id;
}

export function attach(ctx: Ctx, equipment: InstanceId, creature: InstanceId): void {
  const e = ctx.s.cards[equipment]!;
  if (e.zone !== 'battlefield' || !isCreatureOnBattlefield(ctx.s, ctx.s.cards[creature])) return;
  if (e.attachedTo === creature) return;
  e.attachedTo = creature;
  ctx.ev.push({ type: 'Attached', equipment, creature });
}

export function addMana(ctx: Ctx, playerId: PlayerId, mana: ManaType, source: InstanceId, onlyForEquipment = false): void {
  const p = player(ctx.s, playerId);
  if (onlyForEquipment) p.equipmentMana[mana] += 1;
  else p.manaPool[mana] += 1;
  ctx.ev.push({ type: 'ManaAdded', player: playerId, mana, source });
}

/** Mana empties from every pool at the end of each step and phase. */
export function emptyAllManaPools(s: GameState): void {
  for (const id of s.turnOrder) {
    s.players[id]!.manaPool = emptyManaPool();
    s.players[id]!.equipmentMana = emptyManaPool();
  }
}
