// Low-level helpers shared by the rules modules. They mutate a working copy
// of the state (`ctx.s`) and record events in order (`ctx.ev`). applyAction
// clones the input first, so callers never see partial mutations.

import { backFaceDefinition, currentDefinition as defOf } from './cardface.ts';
import { allCounters, characteristics, countersOf, hasFlag, hasKeyword, protectedFrom, staticAffects, powerOf } from './characteristics.ts';
import { matchesObject } from './filters.ts';
import { entersTapped } from './typerules.ts';
import {
  MANA_TYPES,
  type AnyCounter,
  type CardDefId,
  type CardDefinition,
  type CardInstance,
  type CardType,
  type GameEvent,
  type DamageSourceSnapshot,
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
      ...(p.creatureScryMana ? { creatureScryMana: [...p.creatureScryMana] } : {}),
      equipmentMana: { ...p.equipmentMana },
      noncreatureSpellMana: { ...p.noncreatureSpellMana },
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
      ...s.combat,
      ...(s.combat.declaredOpponents ? { declaredOpponents: Object.fromEntries(Object.entries(s.combat.declaredOpponents).map(([pid,ids])=>[pid,[...ids]])) } : {}),
      ...(s.combat.firstStrikeParticipants ? { firstStrikeParticipants: {...s.combat.firstStrikeParticipants} } : {}),
      attacks: s.combat.attacks.map((a) => ({ ...a })),
      blocks: s.combat.blocks.map((b) => ({ ...b })),
      blockersPending: [...s.combat.blockersPending],
    },
    pending: { ...s.pending },
  };
}

/** Assign a timestamp when a permanent enters, an Equipment attaches, or a base-setting effect starts. */
export function newTimestamp(s: GameState): number {
  s.effectTimestamp = (s.effectTimestamp ?? 0) + 1;
  return s.effectTimestamp;
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

export { currentDefinition as defOf } from './cardface.ts';

export function hasType(s: GameState, c: CardInstance, type: CardType): boolean {
  return defOf(s, c).types.includes(type);
}

export function isCreatureOnBattlefield(s: GameState, c: CardInstance | undefined): c is CardInstance {
  return !!c && c.zone === 'battlefield' && !c.phasedOut && hasType(s, c, 'creature');
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
export function moveCard(ctx: Ctx, id: InstanceId, to: ZoneName, opts: { silent?: boolean; sacrificed?: boolean; controller?: PlayerId; transformed?: boolean } = {}): void {
  const s = ctx.s;
  const c = card(s, id);
  const from = c.zone;
  const lastDefinition = from === 'battlefield' && (c.copy || c.transformed) ? defOf(s,c) : undefined;
  const lastTypes = from === 'battlefield' ? [...defOf(s, c).types] : undefined;
  const lastPower = from === 'battlefield' && lastTypes?.includes('creature') ? powerOf(s, c) : undefined;
  delete c.graveyardCastTurn;
  delete c.activatedTurns;
  // A double-faced card is front face up everywhere but where it was transformed (rule 712.14).
  delete c.transformed;
  c.zoneChanges = (c.zoneChanges ?? 0) + 1;
  // Unearth: "exile it if it would leave the battlefield" (rule 702.84a).
  if (from === 'battlefield' && c.unearthed && to !== 'exile') to = 'exile';
  // A finality counter: "if it would be put into a graveyard from the battlefield, exile it instead" (rule 122.1h).
  if (from === 'battlefield' && to === 'graveyard' && (c.namedCounters?.finality ?? 0) > 0) to = 'exile';
  if (c.phasedOut) phaseIn(ctx, c, true);
  const fromList = zoneList(s, c.owner, from);
  if (fromList) {
    const i = fromList.indexOf(id);
    if (i >= 0) fromList.splice(i, 1);
  }
  const toList = zoneList(s, c.owner, to);
  if (toList) toList.push(id);
  const visibleTo = c.linkedExile && (to === 'hand' || to === 'library') ? [...new Set([...c.linkedExile.lookers, c.owner])] : undefined;
  const controller = c.controller;
  const equippedBy = from === 'battlefield' ? battlefield(s).filter((e) => e.attachedTo === id).map((e) => e.id) : [];
  const lastCounters = from === 'battlefield' ? Object.fromEntries(allCounters(c)) : undefined;
  if (from === 'battlefield') {
    for (const item of [...s.stack, ...s.triggerQueue, ...(s.resolving ? [s.resolving.item] : [])]) {
      if ('rule' in item && item.rule === 'monarch' && item.subject === id && item.subjectObject === c.zoneChanges! - 1) item.subjectController = controller;
      if ('source' in item && item.source === id && (item.sourceObject ?? 0) === c.zoneChanges! - 1) item.lastSourceCounterKinds = allCounters(c).length;
    }
  }
  const lastKeywords = from === 'battlefield' ? [...characteristics(s, c).keywords] : undefined;
  if (from === 'graveyard') player(s, c.owner).cardLeftGraveyardTurn = s.turnNumber;
  if (s.triggeredThisTurn.length > 0) {
    // A new object: its once-each-turn abilities can trigger again.
    s.triggeredThisTurn = s.triggeredThisTurn.filter((key) => !key.startsWith(`${id}#`));
  }
  if (from === 'battlefield' && to === 'graveyard' && lastTypes?.includes('creature')) s.creaturesDiedThisTurn += 1;
  c.zone = to;
  if (to === 'graveyard') c.graveyardArrival = { turn: s.turnNumber, from };
  else delete c.graveyardArrival;
  c.tapped = false;
  c.summoningSick = false;
  c.damage = 0;
  c.deathtouched = false;
  c.controller = to === 'battlefield' ? (opts.controller ?? c.owner) : c.owner;
  if (from === 'battlefield') { if (lastDefinition) c.lastDefinition=lastDefinition; else delete c.lastDefinition; }
  if (to === 'battlefield') delete c.lastDefinition;
  delete c.copy;
  delete c.counters;
  delete c.namedCounters;
  delete c.vowTo;
  delete c.monstrous;
  delete c.extraCountersOnEnter;
  delete c.xPaid;
  delete c.foretoldTurn;
  delete c.linkedExile;
  delete c.crewed;
  delete c.attachedTo;
  delete c.attachedTimestamp;
  delete c.exiledUntilLeaves;
  delete c.exiledUntilOpponentMonarch;
  delete c.playableFromExile;
  delete c.castFromGraveyard;
  delete c.countersTurn;
  delete c.castPermission;
  delete c.unearthed;
  delete c.rebounding;
  delete c.adventureSpell;
  delete c.adventurer;
  delete c.adventureGraveyard;
  if (to === 'battlefield') {
    delete c.blitzed;
    delete c.evoked;
  }
  if (from === 'battlefield') delete c.sacrificeAtEndStep;
  if (from === 'battlefield') c.lastPower = lastPower;
  else delete c.lastPower;
  // What it was like as it left, for abilities that look back (rule 608.2h). Kept until it enters again.
  if (from === 'battlefield') {
    c.lastCounters = lastCounters;
    c.lastKeywords = lastKeywords;
    c.lastEquippedBy = equippedBy;
  } else if (to === 'battlefield') {
    delete c.lastCounters;
    delete c.lastKeywords;
    delete c.lastEquippedBy;
  }
  delete c.commanderStays;
  delete c.controlWhile;
  if (!opts.silent) {
    ctx.ev.push({
      type: 'CardMoved',
      ...(visibleTo ? { visibleTo } : {}),
      card: id,
      defId: c.defId,
      owner: c.owner,
      ...(from === 'battlefield' ? { controller, lastTypes } : {}),
      ...(equippedBy.length > 0 ? { equippedBy } : {}),
      ...(opts.sacrificed ? { sacrificed: true } : {}),
      from,
      to,
    });
  }
  if (from === 'battlefield') leftBattlefield(ctx, id);
  // A double-faced card put onto the battlefield transformed enters back face up (rule 712.14a),
  // so its back face's "as this enters" rules apply (a Saga back face gets its lore counter).
  if (to === 'battlefield' && opts.transformed && s.cardDefs[c.defId]!.backFace) c.transformed = true;
  // "Enters with N +1/+1 counters on it" (rule 614.1c).
  const d = c.transformed ? backFaceDefinition(s.cardDefs[c.defId]!) : s.cardDefs[c.defId]!;
  if (to === 'battlefield') { c.enteredTurn = s.turnNumber; c.enteredTimestamp = newTimestamp(s); }
  if (to === 'battlefield' && d.entersWithCounters) addCounters(ctx, id, d.entersWithCounters, undefined, d.entersWithCounterKind);
  // "As this Saga enters, add a lore counter" (rule 714.3a).
  if (to === 'battlefield' && d.saga) addCounters(ctx, id, 1, c.controller, 'lore');
  // Tromell: "each other nontoken creature you control enters with an additional +1/+1 counter".
  if (to === 'battlefield') {
    for (const source of battlefield(s)) {
      if (source.id === id) continue;
      for (const spec of defOf(s, source).statics ?? []) {
        if (spec.entersWithExtraCounters && staticAffects(s, source, spec, c)) addCounters(ctx, id, spec.entersWithExtraCounters);
      }
    }
  }
}

/**
 * Phases a permanent out (rule 702.26): it leaves its owner's battlefield
 * list but keeps its state, and so does everything attached to it.
 */
export function phaseOut(ctx: Ctx, id: InstanceId): void {
  const s = ctx.s;
  const c = card(s, id);
  if (c.zone !== 'battlefield' || c.phasedOut) return;
  const p = player(s, c.owner);
  p.battlefield.splice(p.battlefield.indexOf(id), 1);
  p.phasedOut = [...(p.phasedOut ?? []), id];
  c.phasedOut = true;
  ctx.ev.push({ type: 'PhasedOut', card: id });
  // "Indirectly": Equipment attached to it phases out with it (rule 702.26g).
  for (const other of battlefield(s)) if (other.attachedTo === id) phaseOut(ctx, other.id);
}

/** Phases a permanent back in, as it was. `silent` when it's about to move anyway. */
export function phaseIn(ctx: Ctx, c: CardInstance, silent = false): void {
  const p = player(ctx.s, c.owner);
  p.phasedOut = (p.phasedOut ?? []).filter((x) => x !== c.id);
  if (p.phasedOut.length === 0) delete p.phasedOut;
  delete c.phasedOut;
  p.battlefield.push(c.id);
  if (!silent) ctx.ev.push({ type: 'PhasedIn', card: c.id });
}

/** The untap step: permanents the active player controls phase in (rule 502.1). */
export function phaseInFor(ctx: Ctx, controller: PlayerId): void {
  for (const pid of ctx.s.turnOrder) {
    for (const id of [...(ctx.s.players[pid]!.phasedOut ?? [])]) {
      const c = ctx.s.cards[id]!;
      if (c.controller === controller) phaseIn(ctx, c);
    }
  }
}

/** Things that happen the moment a permanent leaves the battlefield. */
function leftBattlefield(ctx: Ctx, id: InstanceId): void {
  const s = ctx.s;
  removeFromCombat(s,id);
  if (s.temporaryEffects.length > 0) s.temporaryEffects = s.temporaryEffects.filter((e) => e.affected !== id);
  // Phased-out Equipment counts too: it isn't in the battlefield list, but it's still attached.
  const phasedOut = s.turnOrder.flatMap((pid) => (s.players[pid]!.phasedOut ?? []).map((x) => s.cards[x]!));
  for (const other of [...battlefield(s), ...phasedOut]) {
    if (other.attachedTo !== id) continue;
    // Equipment stays on the battlefield, unattached (rule 301.5c); a phased-out one phases in unattached.
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
    p.cardsDrawnThisTurn = (p.cardsDrawnThisTurn ?? 0) + 1;
    ctx.ev.push({ type: 'CardDrawn', player: playerId, card: top, defId: ctx.s.cards[top]!.defId, n: p.cardsDrawnThisTurn });
  }
}

export function changeLife(ctx: Ctx, playerId: PlayerId, delta: number): void {
  const p = player(ctx.s, playerId);
  if (delta === 0 || p.eliminated) return;
  const from = p.life;
  p.life += delta;
  if (delta < 0) p.lifeLostThisTurn = (p.lifeLostThisTurn ?? 0) - delta;
  else p.lifeGainedThisTurn = (p.lifeGainedThisTurn ?? 0) + delta;
  ctx.ev.push({ type: 'LifeChanged', player: playerId, from, to: p.life });
}

/** Deals damage from a source, applying deathtouch and lifelink. */
export function damageSourceSnapshot(s: GameState, source: CardInstance): DamageSourceSnapshot {
  const ch=characteristics(s,source);
  return {card:structuredClone(source),types:[...defOf(s,source).types],power:ch.power,toughness:ch.toughness};
}

export function dealDamage(ctx: Ctx, sourceId: InstanceId, target: Target, amount: number, combat: boolean, frozen?: DamageSourceSnapshot): void {
  if (amount <= 0 || target.kind === 'ability') return;
  const s = ctx.s;
  const source = s.cards[sourceId]!;
  // "Prevent all damage that would be dealt to you this turn" (Ultimate Magic: Holy).
  if (target.kind === 'player' && s.players[target.player]!.preventDamageTurn === s.turnNumber) return;
  if (target.kind === 'card' && s.cards[target.card]!.zone === 'battlefield') {
    const victim = s.cards[target.card]!;
    // Protection prevents damage from sources of that color (rule 702.16e).
    if (protectedFrom(s, victim, source)) return;
    // A shield counter is removed instead (rule 122.1c).
    if (countersOf(victim, 'shield') > 0) {
      removeCounters(ctx, victim.id, 'shield', 1);
      return;
    }
    // Gatta and Luzzu: prevent it and put that many +1/+1 counters on it.
    const into = s.temporaryEffects.find((e) => e.affected === victim.id && e.flags?.includes('damageBecomesCounters'));
    if (into) {
      addCounters(ctx, victim.id, amount, s.cards[into.source]?.controller);
      return;
    }
  }
  const grantedTriggers = combat && target.kind === 'player'
    ? s.temporaryEffects.filter(e => e.affected === sourceId && e.trigger?.when === 'CombatDamageToPlayer').map(e => e.trigger!)
    : [];
  const damagedMonarch = combat && target.kind === 'player' && s.monarch === target.player && hasType(s, source, 'creature') ? target.player : undefined;
  const sourceSnapshot=combat && target.kind==='player' ? frozen ?? damageSourceSnapshot(s,source) : undefined;
  ctx.ev.push({ type: 'DamageDealt', source: sourceId, target, amount, combat,
    ...(sourceSnapshot ? {sourceSnapshot,sourceController:sourceSnapshot.card.controller} : {}),
    ...(damagedMonarch ? { damagedMonarch } : {}),
    ...(grantedTriggers.length || damagedMonarch ? { grantedTriggers, sourceController: source.controller, sourceObject: source.zoneChanges ?? 0, sourceCounterKinds: allCounters(source).length } : {}),
  });
  if (target.kind === 'none') return;
  if (target.kind === 'player') {
    if (combat) s.combatDamageHistory = [...(s.combatDamageHistory ?? []), {
      source: sourceId, sourceObject: source.zoneChanges ?? 0, player: target.player,
      dragon: characteristics(s, source).subtypes.includes('Dragon'),
    }];
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
export function putIntoGraveyard(ctx: Ctx, id: InstanceId, sacrificed = false): void {
  const s = ctx.s;
  const c = s.cards[id]!;
  const backToHand = hasFlag(s, c, 'returnToHandIfDies');
  if (hasFlag(s, c, 'exileIfWouldDie') || c.unearthed) {
    moveCard(ctx, id, 'exile', { sacrificed });
    return;
  }
  if (hasType(s, c, 'creature')) ctx.ev.push({ type: 'CreatureDied', card: id, defId: c.defId, owner: c.owner });
  moveCard(ctx, id, 'graveyard', { sacrificed });
  // "When that creature dies this turn, return that card to its owner's hand."
  if (backToHand && c.zone === 'graveyard') moveCard(ctx, id, 'hand');
}

/** Destroys a permanent unless it is indestructible. Returns whether it was destroyed. */
export function destroy(ctx: Ctx, id: InstanceId): boolean {
  const c = ctx.s.cards[id]!;
  if (c.zone !== 'battlefield' || hasKeyword(ctx.s, c, 'Indestructible')) return false;
  // A shield counter is removed instead (rule 122.1c).
  if (countersOf(c, 'shield') > 0) {
    removeCounters(ctx, id, 'shield', 1);
    return false;
  }
  if (!hasType(ctx.s, c, 'creature')) ctx.ev.push({ type: 'PermanentDestroyed', card: id, defId: c.defId, owner: c.owner });
  putIntoGraveyard(ctx, id);
  return true;
}

/** Sacrifice: put it into its owner's graveyard; indestructible doesn't help (rule 701.17). */
export function sacrifice(ctx: Ctx, id: InstanceId): void {
  putIntoGraveyard(ctx, id, true);
}

export function addCounters(ctx: Ctx, id: InstanceId, amount: number, by?: PlayerId, kind: AnyCounter = '+1/+1'): void {
  const s = ctx.s;
  const c = s.cards[id]!;
  if (c.zone !== 'battlefield' || amount <= 0) return;
  if (kind !== '+1/+1') {
    setCounters(c, kind, countersOf(c, kind) + amount);
    c.countersTurn = s.turnNumber;
    if (by && hasType(s, c, 'creature')) player(s, by).counterOnCreatureTurn = s.turnNumber;
    ctx.ev.push({ type: 'CountersAdded', card: id, amount, ...(by ? { by } : {}), counter: kind, total: countersOf(c, kind) });
    return;
  }
  // Hardened Scales and similar: "that many plus one" (a replacement effect, rule 614).
  for (const source of battlefield(s)) {
    for (const spec of defOf(s, source).statics ?? []) {
      if (spec.extraCounters && staticAffects(s, source, spec, c)) amount += spec.extraCounters;
    }
  }
  c.counters = (c.counters ?? 0) + amount;
  c.countersTurn = s.turnNumber;
  if (by && hasType(s, c, 'creature')) player(s, by).counterOnCreatureTurn = s.turnNumber;
  ctx.ev.push({ type: 'CountersAdded', card: id, amount, ...(by ? { by } : {}) });
}

/** Sets how many counters of a kind a card has, replacing (never changing) its counter object. */
export function setCounters(c: CardInstance, kind: AnyCounter, n: number): void {
  if (kind === '+1/+1') {
    if (n > 0) c.counters = n;
    else delete c.counters;
    return;
  }
  const next = { ...c.namedCounters };
  if (n > 0) next[kind] = n;
  else delete next[kind];
  if (kind === 'vow' && n <= 0) delete c.vowTo;
  if (Object.keys(next).length > 0) c.namedCounters = next;
  else delete c.namedCounters;
}

/** Removes up to `amount` counters of a kind. Returns how many were removed. */
export function removeCounters(ctx: Ctx, id: InstanceId, kind: AnyCounter, amount: number): number {
  const c = ctx.s.cards[id]!;
  const n = Math.min(amount, countersOf(c, kind));
  if (n <= 0) return 0;
  setCounters(c, kind, countersOf(c, kind) - n);
  ctx.ev.push({ type: 'CountersRemoved', card: id, amount: n, counter: kind });
  return n;
}

/** Untaps a permanent, unless a stun counter is removed instead (rule 122.1d). Returns whether it untapped. */
export function untap(ctx: Ctx, c: CardInstance): boolean {
  if (!c.tapped) return false;
  if (countersOf(c, 'stun') > 0) {
    removeCounters(ctx, c.id, 'stun', 1);
    return false;
  }
  c.tapped = false;
  return true;
}

/** Creates a token on the battlefield under `controller`'s control (rule 111). */
export function createToken(ctx: Ctx, defId: CardDefId, controller: PlayerId, copy?: CardInstance['copy']): InstanceId {
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
    ...(copy ? {copy:structuredClone(copy)} : {}),
    enteredTurn: s.turnNumber,
    enteredTimestamp: newTimestamp(s),
  };
  player(s, controller).battlefield.push(id);
  const c=s.cards[id]!, d=defOf(s,c);
  c.tapped=entersTapped(s,c);
  if(d.entersWithCounters) addCounters(ctx,id,d.entersWithCounters,undefined,d.entersWithCounterKind);
  if(d.saga) addCounters(ctx,id,1,controller,'lore');
  for(const source of battlefield(s)) for(const spec of defOf(s,source).statics??[]) {
    if(source.id!==id && spec.entersWithExtraCounters && staticAffects(s,source,spec,c)) addCounters(ctx,id,spec.entersWithExtraCounters);
  }
  ctx.ev.push({ type: 'TokenCreated', card: id, defId, controller });
  return id;
}

/** Becoming monarch is an event even when initiated by a source-less rule ability. */
export function becomeMonarch(ctx: Ctx, playerId: PlayerId): void {
  const s = ctx.s;
  if (!s.players[playerId] || s.players[playerId]!.eliminated || s.monarch === playerId) return;
  const previous = s.monarch;
  s.monarch = playerId;
  ctx.ev.push({ type: 'MonarchChanged', player: playerId, ...(previous ? { previous } : {}) });
  for (const c of Object.values(s.cards)) {
    if (c.zone !== 'exile' || !c.exiledUntilOpponentMonarch || c.exiledUntilOpponentMonarch === playerId || s.players[c.owner]!.eliminated) continue;
    moveCard(ctx, c.id, 'battlefield');
    c.summoningSick = true;
    if (entersTapped(s, c)) c.tapped = true;
  }
}

/** Attachment itself does not target, so shroud and hexproof do not prevent it. */
export function canAttach(s: GameState, attachment: CardInstance, host: CardInstance | undefined): boolean {
  if (!host || host.zone !== 'battlefield' || host.phasedOut || attachment.id === host.id) return false;
  // Protection: not enchanted or equipped by anything of that color (rule 702.16c, d).
  if (protectedFrom(s, host, attachment)) return false;
  const def = defOf(s, attachment);
  if (def.subtypes?.includes('Aura')) return matchesObject(s, def.enchant ?? { types: ['creature'] }, host, { controller: attachment.controller, source: attachment.id });
  return def.subtypes?.includes('Equipment') === true && isCreatureOnBattlefield(s, host) && !hasType(s, attachment, 'creature');
}

export function attach(ctx: Ctx, equipment: InstanceId, creature: InstanceId): void {
  const e = ctx.s.cards[equipment]!;
  if (e.zone !== 'battlefield' || !canAttach(ctx.s, e, ctx.s.cards[creature])) return;
  if (e.attachedTo === creature) return;
  e.attachedTo = creature;
  e.attachedTimestamp = newTimestamp(ctx.s);
  ctx.ev.push({ type: 'Attached', equipment, creature });
}

/** Adds one mana; `restricted` mana goes to its own pool and can only pay for what it says. */
export function addMana(ctx: Ctx, playerId: PlayerId, mana: ManaType, source: InstanceId, restricted?: 'equipment' | 'noncreatureSpell'): void {
  const p = player(ctx.s, playerId);
  if (restricted === 'equipment') p.equipmentMana[mana] += 1;
  else if (restricted === 'noncreatureSpell') p.noncreatureSpellMana[mana] += 1;
  else {
    p.manaPool[mana] += 1;
    const c = ctx.s.cards[source]!;
    if (defOf(ctx.s, c).manaAbility?.scryOnCommanderType) {
      p.creatureScryMana = [...(p.creatureScryMana ?? []), { mana, source, sourceObject: c.zoneChanges ?? 0 }];
    }
  }
  ctx.ev.push({ type: 'ManaAdded', player: playerId, mana, source });
}

/** Mana empties from every pool at the end of each step and phase. */
export function emptyAllManaPools(s: GameState): void {
  for (const id of s.turnOrder) {
    s.players[id]!.manaPool = emptyManaPool();
    delete s.players[id]!.creatureScryMana;
    s.players[id]!.equipmentMana = emptyManaPool();
    s.players[id]!.noncreatureSpellMana = emptyManaPool();
  }
}

/** Discards a card from its owner's hand (rule 701.8). */
export function discard(ctx: Ctx, id: InstanceId): void {
  const c = ctx.s.cards[id]!;
  moveCard(ctx, id, 'graveyard');
  ctx.ev.push({ type: 'Discarded', player: c.owner, card: id });
}

/** An object leaving combat never rejoins merely by returning or becoming a creature again. */
export function removeFromCombat(s: GameState, id: InstanceId): void {
  const combat = s.combat;
  if (!combat) return;
  combat.blockedAttackers = [...new Set([...(combat.blockedAttackers ?? []), ...combat.blocks.map(b=>b.attacker)])];
  combat.attacks = combat.attacks.filter(a=>a.attacker!==id);
  combat.blocks = combat.blocks.filter(b=>b.attacker!==id && b.blocker!==id);
}
