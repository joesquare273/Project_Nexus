// State-based actions and elimination (PRD 7.1, 7.3; rule 704). Run after
// every action and resolution, before anyone makes the next decision.

import { isMulliganing, repairMulligans } from './mulligan.ts';
import { nextBlockerDecision } from './combat.ts';
import { detectTriggers, placeTriggers } from './triggers.ts';
import { cleanupDamage, givePriority, startNextTurn } from './turn.ts';
import { toughnessOf } from './characteristics.ts';
import {
  aliveFromActive,
  alivePlayers,
  battlefield,
  defOf,
  destroy,
  emptyManaPool,
  hasKeyword,
  moveCard,
  putIntoGraveyard,
  sacrifice,
  reject,
  type Ctx,
} from './state.ts';
import { shuffleInPlace } from './rng.ts';
import { isLegendary } from './typerules.ts';
import { resumeResolving } from './stack.ts';
import type { EliminationReason, PlayerId } from './types.ts';

/**
 * A player leaving a multiplayer game takes everything they own with them
 * (rule 800.4a). Their spells leave the stack and their permanents are exiled
 * so the event log still shows where the cards went.
 */
function eliminatePlayer(ctx: Ctx, playerId: PlayerId, reason: EliminationReason): void {
  const s = ctx.s;
  const p = s.players[playerId]!;
  p.eliminated = true;
  p.manaPool = emptyManaPool();
  p.equipmentMana = emptyManaPool();
  if (s.resolving?.item.controller === playerId) {
    const item = s.resolving.item;
    s.resolving = null;
    if (item.kind === 'spell' && s.cards[item.card]!.zone === 'stack') moveCard(ctx, item.card, 'exile');
  }
  ctx.ev.push({ type: 'PlayerEliminated', player: playerId, reason });

  for (const item of [...s.stack]) {
    if (item.kind === 'ability') {
      if (item.controller === playerId) s.stack.splice(s.stack.indexOf(item), 1);
      continue;
    }
    if (item.controller !== playerId && s.cards[item.card]!.owner !== playerId) continue;
    s.stack.splice(s.stack.indexOf(item), 1);
    moveCard(ctx, item.card, 'exile');
  }
  s.triggerQueue = s.triggerQueue.filter((t) => t.controller !== playerId);
  // Their phased-out permanents leave too.
  for (const pid of s.turnOrder) {
    for (const id of [...(s.players[pid]!.phasedOut ?? [])]) {
      const c = s.cards[id]!;
      if (c.owner === playerId || c.controller === playerId) moveCard(ctx, id, 'exile');
    }
  }
  for (const c of battlefield(s)) {
    if (c.owner === playerId || c.controller === playerId) moveCard(ctx, c.id, 'exile');
  }

  if (s.combat) {
    const onBattlefield = (id: string) => s.cards[id]!.zone === 'battlefield';
    s.combat.attacks = s.combat.attacks.filter((a) => a.defender !== playerId && onBattlefield(a.attacker));
    s.combat.blocks = s.combat.blocks.filter((b) => onBattlefield(b.blocker) && onBattlefield(b.attacker));
    s.combat.blockersPending = s.combat.blockersPending.filter((pid) => pid !== playerId);
  }
}

/**
 * Applies state-based actions until nothing changes, then ends the game if
 * one player or fewer remains. Returns true if anyone was eliminated.
 */
export function applyStateBasedActions(ctx: Ctx): boolean {
  const s = ctx.s;
  let eliminatedAny = false;
  for (;;) {
    let changed = false;
    // Toughness and damage are checked all at once, then the permanents leave together (rule 704.3).
    const zeroToughness: string[] = [];
    const lethal: string[] = [];
    for (const c of battlefield(s)) {
      if (!defOf(s, c).types.includes('creature')) continue;
      const toughness = toughnessOf(s, c);
      if (toughness <= 0) zeroToughness.push(c.id);
      else if ((c.damage >= toughness || (c.deathtouched && c.damage > 0)) && !hasKeyword(s, c, 'Indestructible')) {
        lethal.push(c.id);
      }
    }
    // Zero toughness isn't destruction, so indestructible doesn't help (rule 704.5f).
    for (const id of zeroToughness) putIntoGraveyard(ctx, id);
    for (const id of lethal) destroy(ctx, id);
    if (zeroToughness.length + lethal.length > 0) changed = true;

    // A Saga with at least its final chapter's lore counters, and no chapter ability waiting, is sacrificed (rule 714.4).
    for (const c of battlefield(s)) {
      const final = defOf(s, c).saga;
      if (!final || (c.namedCounters?.lore ?? 0) < final) continue;
      const waiting =
        s.stack.some((i) => i.kind === 'ability' && i.source === c.id) ||
        s.triggerQueue.some((t) => t.source === c.id) ||
        (s.resolving?.item.kind === 'ability' && s.resolving.item.source === c.id);
      if (waiting) continue;
      sacrifice(ctx, c.id);
      changed = true;
    }

    // Tokens that left the battlefield cease to exist (704.5d). They can only be where effects put them.
    for (const pid of s.turnOrder) {
      const p = s.players[pid]!;
      for (const id of [...p.graveyard, ...p.exile, ...p.hand, ...p.library]) {
        if (s.cards[id]!.isToken) moveCard(ctx, id, 'void', { silent: true });
      }
    }
    for (const pid of s.turnOrder) {
      const p = s.players[pid]!;
      if (p.eliminated) continue;
      const threshold = s.format.commanderDamageThreshold;
      const commanderDamage = threshold !== undefined && Object.values(p.commanderDamage).some((n) => n >= threshold);
      const reason: EliminationReason | null = p.conceded
        ? 'conceded'
        : p.lostToEffect
          ? 'effect'
        : p.life <= 0
          ? 'life'
          : p.drewFromEmptyLibrary
            ? 'emptyLibrary'
            : commanderDamage
              ? 'commanderDamage'
              : null;
      if (reason) {
        eliminatePlayer(ctx, pid, reason);
        eliminatedAny = true;
        changed = true;
      }
    }
    if (!changed) break;
  }

  const alive = alivePlayers(s);
  if (alive.length <= 1 && s.pending.kind !== 'gameOver') {
    s.winner = alive[0] ?? null;
    s.pending = { kind: 'gameOver' };
    ctx.ev.push({ type: 'GameEnded', winner: s.winner });
  }
  return eliminatedAny;
}

/**
 * If the active player leaves, the rest of their turn is skipped (rule
 * 800.4i is more nuanced; this is a deliberate simplification): remaining
 * spells go to their owners' graveyards and the next living player starts.
 */
function abandonTurn(ctx: Ctx): void {
  const s = ctx.s;
  const resolving = s.resolving?.item;
  s.resolving = null;
  if (resolving?.kind === 'spell' && s.cards[resolving.card]!.zone === 'stack') moveCard(ctx, resolving.card, 'graveyard');
  while (s.stack.length > 0) {
    const item = s.stack.pop()!;
    if (item.kind === 'spell') moveCard(ctx, item.card, 'graveyard');
  }
  s.triggerQueue = [];
  cleanupDamage(ctx);
  startNextTurn(ctx);
}

/** After eliminations, makes sure the game waits on a decision that still exists. */
function repairPending(ctx: Ctx): void {
  const s = ctx.s;
  const pending = s.pending;
  switch (pending.kind) {
    case 'priority':
      // Restart the priority round so everyone left gets a chance to act.
      givePriority(ctx, s.activePlayer);
      break;
    case 'declareBlockers':
      nextBlockerDecision(ctx);
      break;
    case 'chooseModes':
    case 'chooseTargets':
      // The trigger left the queue with its controller; carry on placing the rest.
      if (s.players[pending.player]!.eliminated) givePriority(ctx, pending.then);
      break;
    case 'decide':
      if (s.stack.at(-1)?.id !== pending.item) givePriority(ctx, s.activePlayer);
      break;
    case 'surveil':
      // The resolving spell or ability left with its controller.
      if (!s.resolving) givePriority(ctx, s.activePlayer);
      break;
    case 'chooseCards':
      // A player who left doesn't choose; the spell or ability carries on without them.
      if (pending.purpose === 'handSize') break;
      if (!s.resolving) givePriority(ctx, s.activePlayer);
      else if (s.players[pending.player]!.eliminated) resumeResolving(ctx);
      break;
    case 'chooseLegend':
    case 'commanderZone':
      if (s.players[pending.player]!.eliminated) givePriority(ctx, s.activePlayer);
      break;
  }
}

/**
 * Legend rule (704.5j): a player who controls two or more legendary
 * permanents with the same name chooses one to keep. Asks the first such
 * player in turn order, starting with the active player. Returns true if the
 * game is now waiting on that choice.
 */
function checkLegendRule(ctx: Ctx): boolean {
  const s = ctx.s;
  if (s.pending.kind === 'chooseLegend' || s.pending.kind === 'gameOver') return s.pending.kind === 'chooseLegend';
  for (const pid of aliveFromActive(s)) {
    const byName = new Map<string, string[]>();
    for (const id of s.players[pid]!.battlefield) {
      const c = s.cards[id]!;
      if (c.controller !== pid || !isLegendary(defOf(s, c))) continue;
      const name = defOf(s, c).name;
      byName.set(name, [...(byName.get(name) ?? []), id]);
    }
    for (const [name, cards] of byName) {
      if (cards.length < 2) continue;
      s.pending = { kind: 'chooseLegend', player: pid, name, cards, resume: s.pending };
      return true;
    }
  }
  return false;
}

/**
 * A commander that went to a graveyard, exile, a hand or a library: its
 * owner chooses whether to move it to the command zone (rules 903.9a-b).
 * Returns true if the game is now waiting on that choice.
 */
function checkCommanderZone(ctx: Ctx): boolean {
  const s = ctx.s;
  if (s.pending.kind === 'commanderZone') return true;
  if (s.pending.kind === 'gameOver') return false;
  for (const pid of aliveFromActive(s)) {
    const p = s.players[pid]!;
    for (const zone of ['graveyard', 'exile', 'hand', 'library'] as const) {
      const id = p[zone].find((x) => s.cards[x]!.isCommander && !s.cards[x]!.commanderStays);
      if (id) {
        s.pending = { kind: 'commanderZone', player: pid, card: id, zone, resume: s.pending };
        return true;
      }
    }
  }
  return false;
}

/** The CommanderZone action: to the command zone, or leave it where it went. */
export function chooseCommanderZone(ctx: Ctx, playerId: PlayerId, toCommand: boolean): void {
  const s = ctx.s;
  const pending = s.pending;
  if (pending.kind !== 'commanderZone' || pending.player !== playerId) reject('You have no commander to move right now.');
  const c = s.cards[pending.card]!;
  ctx.ev.push({ type: 'CommanderZoneChosen', player: playerId, card: c.id, from: c.zone, toCommand });
  if (toCommand) {
    if (c.zone === 'library') shuffleInPlace(s, s.players[c.owner]!.library);
    moveCard(ctx, c.id, 'command');
  } else {
    c.commanderStays = true;
  }
  s.pending = pending.resume;
}

/** The ChooseLegend action: keep one, and the others go to the graveyard. */
export function chooseLegend(ctx: Ctx, playerId: PlayerId, keep: string): void {
  const s = ctx.s;
  const pending = s.pending;
  if (pending.kind !== 'chooseLegend' || pending.player !== playerId) reject('You are not choosing a legend right now.');
  if (!pending.cards.includes(keep)) reject(`Choose one of your ${pending.name} permanents to keep.`);
  const others = pending.cards.filter((id) => id !== keep && s.cards[id]!.zone === 'battlefield');
  ctx.ev.push({ type: 'LegendChosen', player: playerId, kept: keep, others });
  // Not destruction, so indestructible doesn't help (rule 704.5j).
  for (const id of others) putIntoGraveyard(ctx, id);
  s.pending = pending.resume;
}

/**
 * Runs before anyone makes the next decision (rule 117.5): state-based
 * actions, then triggered abilities go on the stack. Also repairs whose
 * decision it is after eliminations.
 */
export function stabilize(ctx: Ctx, opts: { holdTriggers?: boolean } = {}): void {
  const s = ctx.s;
  let scanned = 0;
  // Repeats also cover the next turn after an uneventful cleanup.
  // The guard protects against a failure to settle.
  for (let guard = 0; guard < 64; guard++) {
    const beforeSba = ctx.ev.length;
    const eliminated = applyStateBasedActions(ctx);
    if (s.cleanupCheck && ctx.ev.length > beforeSba) s.cleanupNeedsPriority = true;
    if (s.pending.kind === 'gameOver') return;
    if (isMulliganing(s)) {
      // No turn has started yet: just skip anyone who left.
      repairMulligans(ctx);
      if (isMulliganing(s)) return;
      scanned = ctx.ev.length;
      continue;
    }
    if (s.players[s.activePlayer]!.eliminated) {
      // Nothing from the abandoned turn triggers; the next turn's events still can.
      scanned = ctx.ev.length;
      abandonTurn(ctx);
      continue;
    }
    if (eliminated) repairPending(ctx);
    detectTriggers(ctx, ctx.ev.slice(scanned));
    scanned = ctx.ev.length;
    // These need a choice; triggers go on the stack after it's made.
    if (checkCommanderZone(ctx) || checkLegendRule(ctx)) {
      if (s.cleanupCheck) s.cleanupNeedsPriority = true;
      return;
    }
    if (s.pending.kind === 'priority' && s.triggerQueue.length > 0) {
      if (opts.holdTriggers) s.triggersHeld = true;
      else placeTriggers(ctx, s.pending.player);
    }
    if (s.triggerQueue.length === 0) delete s.triggersHeld;
    if (s.cleanupCheck) {
      if (s.cleanupNeedsPriority || s.stack.length > 0 || s.triggerQueue.length > 0 || s.pending.kind !== 'priority') {
        delete s.cleanupCheck;
        delete s.cleanupNeedsPriority;
      } else {
        startNextTurn(ctx);
        continue;
      }
    }
    return;
  }
  throw new Error('stabilize did not settle');
}
