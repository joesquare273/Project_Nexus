// Turn structure, steps, and priority (PRD 7.2, 7.4).

import { canAnyAttack, dealCombatDamage, startBlockers } from './combat.ts';
import { resolveTop } from './stack.ts';
import { alivePlayers, battlefield, drawCards, emptyAllManaPools, nextAlive, player, type Ctx } from './state.ts';
import { STEPS, type PlayerId, type Step } from './types.ts';

export function givePriority(ctx: Ctx, playerId: PlayerId): void {
  if (ctx.s.pending.kind === 'gameOver') return;
  ctx.s.pending = { kind: 'priority', player: playerId, passes: 0 };
}

/** Enters a step and performs its turn-based actions. */
export function enterStep(ctx: Ctx, step: Step): void {
  const s = ctx.s;
  emptyAllManaPools(s);
  s.step = step;
  ctx.ev.push({ type: 'StepChanged', step, activePlayer: s.activePlayer });

  switch (step) {
    case 'untap': {
      const untapped: string[] = [];
      for (const c of battlefield(s)) {
        if (c.controller !== s.activePlayer) continue;
        if (c.tapped) untapped.push(c.id);
        c.tapped = false;
        c.summoningSick = false;
      }
      if (untapped.length > 0) ctx.ev.push({ type: 'CardsUntapped', player: s.activePlayer, cards: untapped });
      player(s, s.activePlayer).landsPlayedThisTurn = 0;
      // Nobody gets priority during the untap step.
      enterStep(ctx, 'upkeep');
      return;
    }
    case 'draw': {
      // In a two-player game the player who goes first skips their first draw (rule 103.8a).
      const skip = s.turnNumber === 1 && s.turnOrder.length === 2;
      if (!skip) drawCards(ctx, s.activePlayer, 1);
      givePriority(ctx, s.activePlayer);
      return;
    }
    case 'declareAttackers':
      if (canAnyAttack(s, s.activePlayer)) {
        s.combat = { attacks: [], blocks: [], blockersPending: [] };
        s.pending = { kind: 'declareAttackers', player: s.activePlayer };
      } else {
        enterStep(ctx, 'endCombat');
      }
      return;
    case 'declareBlockers':
      startBlockers(ctx);
      return;
    case 'combatDamage':
      dealCombatDamage(ctx);
      givePriority(ctx, s.activePlayer);
      return;
    case 'endCombat':
      givePriority(ctx, s.activePlayer);
      return;
    case 'main2':
      s.combat = null;
      givePriority(ctx, s.activePlayer);
      return;
    case 'cleanup':
      // Damage wears off; nobody gets priority (no triggers exist yet that would grant it).
      cleanupDamage(ctx);
      startNextTurn(ctx);
      return;
    case 'upkeep':
    case 'main1':
    case 'beginCombat':
    case 'end':
      givePriority(ctx, s.activePlayer);
      return;
  }
}

/** Called when every living player passes in succession with an empty stack. */
export function advanceStep(ctx: Ctx): void {
  const s = ctx.s;
  let next = STEPS[STEPS.indexOf(s.step) + 1]!;
  const hasAttacks = (s.combat?.attacks.length ?? 0) > 0;
  if ((next === 'declareBlockers' || next === 'combatDamage') && !hasAttacks) next = 'endCombat';
  enterStep(ctx, next);
}

export function cleanupDamage(ctx: Ctx): void {
  for (const c of battlefield(ctx.s)) {
    c.damage = 0;
    c.deathtouched = false;
  }
  ctx.s.combat = null;
  emptyAllManaPools(ctx.s);
}

export function startNextTurn(ctx: Ctx): void {
  const s = ctx.s;
  s.activePlayer = nextAlive(s, s.activePlayer);
  s.turnNumber += 1;
  ctx.ev.push({ type: 'TurnChanged', activePlayer: s.activePlayer, turnNumber: s.turnNumber });
  enterStep(ctx, 'untap');
}

export function passPriority(ctx: Ctx, playerId: PlayerId): void {
  const s = ctx.s;
  if (s.pending.kind !== 'priority') return;
  ctx.ev.push({ type: 'PriorityPassed', player: playerId });
  const passes = s.pending.passes + 1;
  if (passes < alivePlayers(s).length) {
    s.pending = { kind: 'priority', player: nextAlive(s, playerId), passes };
    return;
  }
  // Everyone passed in succession.
  if (s.stack.length > 0) {
    resolveTop(ctx);
    givePriority(ctx, s.activePlayer);
  } else {
    advanceStep(ctx);
  }
}
