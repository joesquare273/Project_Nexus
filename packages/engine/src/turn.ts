import { currentDefinition } from './cardface.ts';
// Turn structure, steps, and priority (PRD 7.2, 7.4).

import { canAnyAttack, dealCombatDamage, startBlockers } from './combat.ts';
import { effectLasts } from './characteristics.ts';
import { resolveTop } from './stack.ts';
import {
  addCounters,
  alivePlayers,
  battlefield,
  drawCards,
  discard,
  reject,
  emptyAllManaPools,
  moveCard,
  nextAlive,
  phaseInFor,
  player,
  sacrifice,
  untap,
  type Ctx,
} from './state.ts';
import { STEPS, type GameState, type InstanceId, type PlayerId, type Step } from './types.ts';

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
    case 'cleanup': {
      const p = player(s, s.activePlayer);
      const limit = maximumHandSize(s, s.activePlayer);
      const excess = limit === null ? 0 : Math.max(0, p.hand.length - limit);
      if (excess > 0) s.pending = { kind: 'chooseCards', purpose: 'handSize', player: s.activePlayer, cards: [...p.hand], min: excess, max: excess };
      else completeCleanup(ctx);
      return;
    }
    case 'beginCombat':
      s.combatsThisTurn = (s.combatsThisTurn ?? 0) + 1;
      givePriority(ctx, s.activePlayer);
      return;
    case 'main1':
      // Rule 714.3b: each Saga the active player controls gets a lore counter.
      for (const c of battlefield(s)) {
        if (c.controller === s.activePlayer && currentDefinition(s, c).saga) addCounters(ctx, c.id, 1, s.activePlayer, 'lore');
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
        else if (c.blitzed || c.sacrificeAtEndStep) sacrifice(ctx, c.id);
      }
      givePriority(ctx, s.activePlayer);
      return;
  }
}

/** Called when every living player passes in succession with an empty stack. */
export function advanceStep(ctx: Ctx): void {
  const s = ctx.s;
  if (s.step === 'combatDamage' && s.combat?.damageStep === 'first') {
    enterStep(ctx,'combatDamage');
    return;
  }
  // "An additional combat phase after this phase" (Tifa): straight into another combat.
  if (s.step === 'endCombat' && (s.extraCombats ?? 0) > 0) {
    s.extraCombats = s.extraCombats! - 1;
    s.combat = null;
    enterStep(ctx, 'beginCombat');
    return;
  }
  // Rule 514.3a: after exceptional cleanup priority, another cleanup begins.
  if (s.step === 'cleanup') { enterStep(ctx, 'cleanup'); return; }
  let next = STEPS[STEPS.indexOf(s.step) + 1]!;
  const hasAttacks = (s.combat?.attacks.length ?? 0) > 0;
  if ((next === 'declareBlockers' || next === 'combatDamage') && !hasAttacks) next = 'endCombat';
  enterStep(ctx, next);
}

/** The default is seven; "no maximum" is an active continuous ability. */
export function maximumHandSize(s: GameState, playerId: PlayerId): number | null {
  return battlefield(s).some((c) => c.controller === playerId && !c.phasedOut && currentDefinition(s, c).statics?.some((spec) => spec.noMaximumHandSize)) ? null : 7;
}

/** Rule 514.2, followed by the state-based-action/trigger check in stabilize. */
function completeCleanup(ctx: Ctx): void {
  cleanupDamage(ctx);
  ctx.s.cleanupCheck = true;
  givePriority(ctx, ctx.s.activePlayer);
}

export function discardToHandSize(ctx: Ctx, playerId: PlayerId, cards: InstanceId[]): void {
  const s = ctx.s, pending = s.pending;
  if (s.step !== 'cleanup' || pending.kind !== 'chooseCards' || pending.purpose !== 'handSize' || pending.player !== playerId) reject('You are not discarding to your maximum hand size.');
  if (new Set(cards).size !== cards.length || cards.some((id) => !pending.cards.includes(id) || !s.players[playerId]!.hand.includes(id))) reject('Choose cards from your hand.');
  if (cards.length !== pending.min) reject('Choose exactly ' + pending.min + ' cards to discard.');
  for (const id of cards) discard(ctx, id);
  completeCleanup(ctx);
}

export function cleanupDamage(ctx: Ctx): void {
  if (ctx.s.castGroups) ctx.s.castGroups=ctx.s.castGroups.filter(g=>g.turn!==ctx.s.turnNumber);
  for (const c of Object.values(ctx.s.cards)) if (c.adventureGraveyard?.expiresOnTurn === ctx.s.turnNumber) delete c.adventureGraveyard;
  for (const c of Object.values(ctx.s.cards).filter((card) => card.zone === 'battlefield')) {
    if (c.copy?.untilTurn !== undefined && c.copy.untilTurn <= ctx.s.turnNumber) {
      do { c.copy=c.copy.previous; } while(c.copy?.untilTurn !== undefined && c.copy.untilTurn <= ctx.s.turnNumber);
      if(!c.copy) delete c.copy;
      ctx.s.effectTimestamp=(ctx.s.effectTimestamp??0)+1;
      ctx.ev.push({type:'CopyEnded',card:c.id});
    }
    delete c.crewed;
    c.damage = 0;
    c.deathtouched = false;
  }
  // "Until end of turn" effects end at the same time (rule 514.2); "for as long as" effects go on.
  ctx.s.temporaryEffects = ctx.s.temporaryEffects.filter((e) => e.whileControlledBy && effectLasts(ctx.s, e));
  if (ctx.s.delayedTriggers?.length) ctx.s.delayedTriggers = ctx.s.delayedTriggers.filter((d) => d.turn > ctx.s.turnNumber);
  ctx.s.combat = null;
  emptyAllManaPools(ctx.s);
}

export function startNextTurn(ctx: Ctx): void {
  const s = ctx.s;
  delete s.cleanupCheck;
  delete s.cleanupNeedsPriority;
  // An extra turn comes before the normal next turn; the newest is taken first (rule 500.7).
  let extra: PlayerId | undefined;
  while (s.extraTurns?.length && !extra) {
    const pid = s.extraTurns.pop()!;
    if (!s.players[pid]!.eliminated) extra = pid;
  }
  s.activePlayer = extra ?? nextAlive(s, s.activePlayer);
  s.turnNumber += 1;
  for (const c of Object.values(s.cards)) {
    const permission = c.adventureGraveyard;
    if (permission?.player === s.activePlayer && permission.expiresOnTurn === undefined && s.turnNumber > permission.grantedTurn) permission.expiresOnTurn = s.turnNumber;
  }
  s.triggeredThisTurn = [];
  s.creaturesDiedThisTurn = 0;
  s.combatDamageHistory = [];
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
