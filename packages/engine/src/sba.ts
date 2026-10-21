// State-based actions and elimination (PRD 7.1, 7.3; rule 704). Run after
// every action and resolution, before anyone makes the next decision.

import { nextBlockerDecision } from './combat.ts';
import { cleanupDamage, givePriority, startNextTurn } from './turn.ts';
import { alivePlayers, battlefield, defOf, destroy, emptyManaPool, hasKeyword, moveCard, type Ctx } from './state.ts';
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
  ctx.ev.push({ type: 'PlayerEliminated', player: playerId, reason });

  for (const item of [...s.stack]) {
    if (item.controller !== playerId && s.cards[item.card]!.owner !== playerId) continue;
    s.stack.splice(s.stack.indexOf(item), 1);
    moveCard(ctx, item.card, 'exile');
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
    for (const c of battlefield(s)) {
      const def = defOf(s, c);
      if (!def.types.includes('creature')) continue;
      const toughness = def.toughness ?? 0;
      if (toughness <= 0) {
        // Zero toughness isn't destruction, so indestructible doesn't help.
        ctx.ev.push({ type: 'CreatureDied', card: c.id, defId: c.defId, owner: c.owner });
        moveCard(ctx, c.id, 'graveyard');
        changed = true;
      } else if ((c.damage >= toughness || (c.deathtouched && c.damage > 0)) && !hasKeyword(s, c, 'Indestructible')) {
        destroy(ctx, c.id);
        changed = true;
      }
    }
    for (const pid of s.turnOrder) {
      const p = s.players[pid]!;
      if (p.eliminated) continue;
      const reason: EliminationReason | null = p.conceded
        ? 'conceded'
        : p.life <= 0
          ? 'life'
          : p.drewFromEmptyLibrary
            ? 'emptyLibrary'
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
  while (s.stack.length > 0) moveCard(ctx, s.stack.pop()!.card, 'graveyard');
  cleanupDamage(ctx);
  startNextTurn(ctx);
}

/** Runs state-based actions and repairs whose decision it is after eliminations. */
export function stabilize(ctx: Ctx): void {
  const s = ctx.s;
  // Each repeat eliminates a player, so this is bounded; the guard only
  // protects against engine bugs.
  for (let guard = 0; guard < 64; guard++) {
    const eliminated = applyStateBasedActions(ctx);
    if (s.pending.kind === 'gameOver') return;
    if (s.players[s.activePlayer]!.eliminated) {
      abandonTurn(ctx);
      continue;
    }
    if (eliminated) {
      // Restart the priority round so everyone left gets a chance to act.
      if (s.pending.kind === 'priority') givePriority(ctx, s.activePlayer);
      else if (s.pending.kind === 'declareBlockers') nextBlockerDecision(ctx);
    }
    return;
  }
  throw new Error('stabilize did not settle');
}
