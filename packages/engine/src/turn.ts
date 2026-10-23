// Turn structure, steps, and priority (PRD 7.2, 7.4).

import { canAnyAttack, dealCombatDamage, startBlockers } from './combat.ts';
import { effectLasts } from './characteristics.ts';
import { resolveTop } from './stack.ts';
import {
  addCounters,
  alivePlayers,
  battlefield,
  drawCards,
  emptyAllManaPools,
  moveCard,
  nextAlive,
  phaseInFor,
  player,
  sacrifice,
  untap,
  type Ctx,
} from './state.ts';
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
      // Phasing happens first (rule 502.1).
      phaseInFor(ctx, s.activePlayer);
      const untapped: string[] = [];
      for (const c of battlefield(s)) {
        if (c.controller !== s.activePlayer) continue;
        if (untap(ctx, c)) untapped.push(c.id);
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
      // Damage wears off; nobody gets priority. (Rule 514.3a gives priority if
      // something triggers here; no supported trigger can.)
      cleanupDamage(ctx);
      startNextTurn(ctx);
      return;
    case 'beginCombat':
      s.combatsThisTurn = (s.combatsThisTurn ?? 0) + 1;
      givePriority(ctx, s.activePlayer);
      return;
    case 'main1':
      // Rule 714.3b: each Saga the active player controls gets a lore counter.
      for (const c of battlefield(s)) {
        if (c.controller === s.activePlayer && s.cardDefs[c.defId]!.saga) addCounters(ctx, c.id, 1, s.activePlayer, 'lore');
      }
      givePriority(ctx, s.activePlayer);
      return;
    case 'upkeep':
      // Rebound: "At the beginning of your next upkeep, you may cast this card from exile without paying its mana cost."
      // Simplified: it can be cast free at any time during this turn.
      for (const id of s.players[s.activePlayer]!.exile) {
        const c = s.cards[id]!;
        if (!c.rebounding) continue;
        delete c.rebounding;
        c.castPermission = { player: s.activePlayer, turn: s.turnNumber, free: true };
      }
      givePriority(ctx, s.activePlayer);
      return;
    case 'end':
      // Blitz and unearth: "at the beginning of the next end step" (done as the step begins, without using the stack).
      for (const c of battlefield(s)) {
        if (c.unearthed) moveCard(ctx, c.id, 'exile');
        else if (c.blitzed) sacrifice(ctx, c.id);
      }
      givePriority(ctx, s.activePlayer);
      return;
  }
}

/** Called when every living player passes in succession with an empty stack. */
export function advanceStep(ctx: Ctx): void {
  const s = ctx.s;
  // "An additional combat phase after this phase" (Tifa): straight into another combat.
  if (s.step === 'endCombat' && (s.extraCombats ?? 0) > 0) {
    s.extraCombats = s.extraCombats! - 1;
    s.combat = null;
    enterStep(ctx, 'beginCombat');
    return;
  }
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
  // "Until end of turn" effects end at the same time (rule 514.2); "for as long as" effects go on.
  ctx.s.temporaryEffects = ctx.s.temporaryEffects.filter((e) => e.whileControlledBy && effectLasts(ctx.s, e));
  ctx.s.combat = null;
  emptyAllManaPools(ctx.s);
}

export function startNextTurn(ctx: Ctx): void {
  const s = ctx.s;
  s.activePlayer = nextAlive(s, s.activePlayer);
  s.turnNumber += 1;
  s.triggeredThisTurn = [];
  s.creaturesDiedThisTurn = 0;
  s.combatsThisTurn = 0;
  s.extraCombats = 0;
  delete s.players[s.activePlayer]!.attackTaxes;
  for (const pid of s.turnOrder) {
    const p = s.players[pid]!;
    p.lifeLostThisTurn = 0;
    p.lifeGainedThisTurn = 0;
    p.noncreatureSpellsThisTurn = 0;
    p.cardsDrawnThisTurn = 0;
    p.spellsCastThisTurn = 0;
  }
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
  } else {
    advanceStep(ctx);
  }
}
