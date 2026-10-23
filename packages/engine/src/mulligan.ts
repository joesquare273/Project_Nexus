// Mulligans (rule 103.5), London style: shuffle your hand away and draw a
// fresh seven, then once you keep, put one card on the bottom of your
// library for each mulligan you took. In a multiplayer game the first
// mulligan is free (rule 103.5c).
//
// Players decide one at a time in turn order, starting with the player who
// goes first. (The rules have everyone decide, then all mulligans happen at
// once, repeating; deciding one player at a time gives the same choices.)

import { shuffleInPlace } from './rng.ts';
import { aliveFromActive, drawCards, moveCard, nextAlive, reject, type Ctx } from './state.ts';
import { enterStep } from './turn.ts';
import type { GameState, InstanceId, PlayerId } from './types.ts';

/** How many mulligans don't cost a card: one in multiplayer games (rule 103.5c). */
export function freeMulligans(s: GameState): number {
  return s.turnOrder.length > 2 ? 1 : 0;
}

/** Cards to put on the bottom after keeping a hand following `taken` mulligans. */
export function cardsToBottom(s: GameState, taken: number): number {
  return Math.max(0, taken - freeMulligans(s));
}

/** Asks the first player, in turn order from the starting player, to keep or mulligan. */
export function startMulligans(ctx: Ctx): void {
  const [first, ...rest] = aliveFromActive(ctx.s);
  ctx.s.pending = { kind: 'mulligan', player: first!, taken: 0, queue: rest };
}

/** The Mulligan action. */
export function mulligan(ctx: Ctx, playerId: PlayerId, keep: boolean): void {
  const s = ctx.s;
  const pending = s.pending;
  if (pending.kind !== 'mulligan' || pending.player !== playerId) reject('You are not deciding on your opening hand.');
  const p = s.players[playerId]!;

  if (keep) {
    const bottom = Math.min(p.hand.length, cardsToBottom(s, pending.taken));
    ctx.ev.push({ type: 'HandKept', player: playerId, taken: pending.taken, bottom });
    if (bottom > 0) s.pending = { kind: 'bottomCards', player: playerId, count: bottom, queue: pending.queue };
    else nextPlayer(ctx, pending.queue);
    return;
  }

  // Once you'd have to bottom your whole hand, another mulligan changes nothing.
  if (cardsToBottom(s, pending.taken + 1) > s.format.startingHandSize) {
    reject('You can’t mulligan any further; keep this hand.');
  }
  for (const id of [...p.hand]) moveCard(ctx, id, 'library');
  shuffleInPlace(s, p.library);
  ctx.ev.push({ type: 'LibraryShuffled', player: playerId });
  ctx.ev.push({ type: 'Mulliganed', player: playerId, taken: pending.taken + 1 });
  drawCards(ctx, playerId, s.format.startingHandSize);
  s.pending = { kind: 'mulligan', player: playerId, taken: pending.taken + 1, queue: pending.queue };
}

/** The BottomCards action: these cards go to the bottom, in the order given. */
export function bottomCards(ctx: Ctx, playerId: PlayerId, cards: InstanceId[]): void {
  const s = ctx.s;
  const pending = s.pending;
  if (pending.kind !== 'bottomCards' || pending.player !== playerId) reject('You are not choosing cards to bottom.');
  const hand = s.players[playerId]!.hand;
  if (new Set(cards).size !== cards.length || cards.some((id) => !hand.includes(id))) {
    reject('Choose different cards from your hand.');
  }
  if (cards.length !== pending.count) reject(`Put exactly ${pending.count} card(s) on the bottom.`);
  for (const id of cards) moveCard(ctx, id, 'library');
  ctx.ev.push({ type: 'CardsBottomed', player: playerId, count: cards.length });
  nextPlayer(ctx, pending.queue);
}

/** Moves on to the next player still deciding, or starts the first turn. */
function nextPlayer(ctx: Ctx, queue: PlayerId[]): void {
  const s = ctx.s;
  const [next, ...rest] = queue.filter((id) => !s.players[id]!.eliminated);
  if (next) {
    s.pending = { kind: 'mulligan', player: next, taken: 0, queue: rest };
    return;
  }
  beginFirstTurn(ctx);
}

/** Starts turn 1. Called once every opening hand is settled. */
export function beginFirstTurn(ctx: Ctx): void {
  const s = ctx.s;
  // Opening hands are drawn before the game's first turn; they don't count as draws "this turn".
  for (const pid of s.turnOrder) s.players[pid]!.cardsDrawnThisTurn = 0;
  ctx.ev.push({ type: 'TurnChanged', activePlayer: s.activePlayer, turnNumber: 1 });
  enterStep(ctx, 'untap');
}

/** True while players are still settling opening hands. */
export function isMulliganing(s: GameState): boolean {
  return s.pending.kind === 'mulligan' || s.pending.kind === 'bottomCards';
}

/**
 * Keeps the mulligan phase consistent after someone leaves the game (they
 * can concede while others decide): skip a player who left, and if the
 * starting player left, the next player in turn order goes first.
 */
export function repairMulligans(ctx: Ctx): void {
  const s = ctx.s;
  const pending = s.pending;
  if (pending.kind !== 'mulligan' && pending.kind !== 'bottomCards') return;
  if (s.players[s.activePlayer]!.eliminated) s.activePlayer = nextAlive(s, s.activePlayer);
  if (s.players[pending.player]!.eliminated) nextPlayer(ctx, pending.queue);
}
