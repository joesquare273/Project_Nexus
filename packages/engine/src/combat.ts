// Combat for pods: each attacker picks a defending player, and each
// defending player declares their own blockers (PRD 7.4).

import { colorsOf } from './typerules.ts';
import { isBasicLand } from './typerules.ts';
import { applyStateBasedActions } from './sba.ts';
import { enterStep, givePriority } from './turn.ts';
import { hasFlag, powerOf, toughnessOf } from './characteristics.ts';
import {
  aliveFromActive,
  alivePlayers,
  dealDamage,
  hasKeyword,
  isCreatureOnBattlefield,
  reject,
  tap,
  type Ctx,
} from './state.ts';
import type { Attack, Block, CardInstance, GameState, InstanceId, PlayerId, Target } from './types.ts';

export function canAttack(s: GameState, c: CardInstance, playerId: PlayerId): boolean {
  return (
    isCreatureOnBattlefield(s, c) &&
    c.controller === playerId &&
    !c.tapped &&
    (!c.summoningSick || hasKeyword(s, c, 'Haste'))
  );
}

/** Whether `blocker` could block `attacker` on its own (menace is checked per whole declaration). */
export function canBlock(s: GameState, blocker: CardInstance, attacker: CardInstance): boolean {
  if (!isCreatureOnBattlefield(s, blocker) || blocker.tapped) return false;
  if (hasFlag(s, attacker, 'cantBeBlocked')) return false;
  if (hasKeyword(s, attacker, 'Flying') && !hasKeyword(s, blocker, 'Flying') && !hasKeyword(s, blocker, 'Reach')) {
    return false;
  }
  // Landwalk (rule 702.14): unblockable while the defending player controls such a land.
  if (hasKeyword(s, attacker, 'NonbasicLandwalk')) {
    const defenderLands = s.players[blocker.controller]!.battlefield.map((id) => s.cards[id]!);
    if (defenderLands.some((c) => s.cardDefs[c.defId]!.types.includes('land') && !isBasicLand(s.cardDefs[c.defId]!))) return false;
  }
  // Intimidate (rule 702.13): only artifact creatures and creatures that share a color with it.
  if (hasKeyword(s, attacker, 'Intimidate') && !s.cardDefs[blocker.defId]!.types.includes('artifact')) {
    const colors = colorsOf(s.cardDefs[attacker.defId]!);
    if (!colorsOf(s.cardDefs[blocker.defId]!).some((c) => colors.includes(c))) return false;
  }
  return true;
}

export function attackersFor(s: GameState, playerId: PlayerId): CardInstance[] {
  return s.players[playerId]!.battlefield.map((id) => s.cards[id]!).filter((c) => canAttack(s, c, playerId));
}

export function canAnyAttack(s: GameState, playerId: PlayerId): boolean {
  return alivePlayers(s).length > 1 && attackersFor(s, playerId).length > 0;
}

export function declareAttackers(ctx: Ctx, playerId: PlayerId, attacks: Attack[]): void {
  const s = ctx.s;
  if (s.pending.kind !== 'declareAttackers' || s.pending.player !== playerId) {
    reject('You are not declaring attackers right now.');
  }
  const seen = new Set<InstanceId>();
  for (const a of attacks) {
    const c = s.cards[a.attacker];
    if (!c || !canAttack(s, c, playerId)) reject(`"${a.attacker}" can't attack.`);
    if (seen.has(a.attacker)) reject(`"${a.attacker}" is declared twice.`);
    seen.add(a.attacker);
    const d = s.players[a.defender];
    if (!d || d.eliminated || a.defender === playerId) reject(`"${a.defender}" is not a valid defending player.`);
  }
  for (const a of attacks) {
    const c = s.cards[a.attacker]!;
    if (!hasKeyword(s, c, 'Vigilance')) tap(ctx, c);
    ctx.ev.push({ type: 'AttackDeclared', attacker: a.attacker, defendingPlayer: a.defender });
  }
  if (attacks.length === 0) {
    // No attackers: skip declare blockers and combat damage (rule 508.8).
    s.combat = null;
    enterStep(ctx, 'endCombat');
    return;
  }
  s.combat = { attacks: [...attacks], blocks: [], blockersPending: [] };
  givePriority(ctx, playerId);
}

export function startBlockers(ctx: Ctx): void {
  const s = ctx.s;
  const combat = s.combat!;
  combat.blockersPending = aliveFromActive(s).filter(
    (pid) => pid !== s.activePlayer && combat.attacks.some((a) => a.defender === pid),
  );
  nextBlockerDecision(ctx);
}

export function nextBlockerDecision(ctx: Ctx): void {
  const s = ctx.s;
  const next = s.combat?.blockersPending[0];
  if (next !== undefined) s.pending = { kind: 'declareBlockers', player: next };
  else givePriority(ctx, s.activePlayer);
}

/** Blockers needed to block this attacker at all: two for menace. */
export function blockersNeeded(s: GameState, attacker: CardInstance): number {
  return hasKeyword(s, attacker, 'Menace') ? 2 : 1;
}

/** Why a blocking declaration is illegal, or null if it's fine. */
export function blockProblem(s: GameState, playerId: PlayerId, blocks: Block[]): string | null {
  const combat = s.combat;
  if (!combat) return 'There is no combat.';
  const seen = new Set<InstanceId>();
  const blockersPerAttacker = new Map<InstanceId, number>();
  for (const b of blocks) {
    const blocker = s.cards[b.blocker];
    const attacker = s.cards[b.attacker];
    if (!blocker || blocker.controller !== playerId) return `You don't control "${b.blocker}".`;
    if (seen.has(b.blocker)) return `"${b.blocker}" can only block one creature.`;
    seen.add(b.blocker);
    const attack = combat.attacks.find((a) => a.attacker === b.attacker);
    if (!attack || attack.defender !== playerId || !isCreatureOnBattlefield(s, attacker)) {
      return `"${b.attacker}" is not attacking you.`;
    }
    if (!canBlock(s, blocker, attacker)) return `"${b.blocker}" can't block "${b.attacker}".`;
    blockersPerAttacker.set(b.attacker, (blockersPerAttacker.get(b.attacker) ?? 0) + 1);
  }
  for (const [attackerId, count] of blockersPerAttacker) {
    if (count === 1 && hasKeyword(s, s.cards[attackerId]!, 'Menace')) {
      return `"${attackerId}" has menace and can't be blocked except by two or more creatures.`;
    }
  }
  // "Must be blocked this turn if able" (rule 509.1c). Simplified: it's a problem only if enough of
  // your creatures that aren't blocking anything could legally block it (two for menace).
  const mine = s.players[playerId]!.battlefield.map((id) => s.cards[id]!);
  for (const a of combat.attacks) {
    const attacker = s.cards[a.attacker]!;
    if (a.defender !== playerId || !hasFlag(s, attacker, 'mustBeBlocked')) continue;
    if (blockersPerAttacker.has(a.attacker)) continue;
    const free = mine.filter((b) => !seen.has(b.id) && canBlock(s, b, attacker));
    if (free.length >= blockersNeeded(s, attacker)) return `"${a.attacker}" must be blocked if able.`;
  }
  return null;
}

export function declareBlockers(ctx: Ctx, playerId: PlayerId, blocks: Block[]): void {
  const s = ctx.s;
  if (s.pending.kind !== 'declareBlockers' || s.pending.player !== playerId || !s.combat) {
    reject('You are not declaring blockers right now.');
  }
  const combat = s.combat;
  const problem = blockProblem(s, playerId, blocks);
  if (problem) reject(problem);
  for (const b of blocks) {
    combat.blocks.push(b);
    ctx.ev.push({ type: 'BlockDeclared', blocker: b.blocker, attacker: b.attacker });
  }
  combat.blockersPending = combat.blockersPending.filter((pid) => pid !== playerId);
  nextBlockerDecision(ctx);
}

interface Assignment {
  source: InstanceId;
  target: Target;
  amount: number;
}

type DamagePass = 'first' | 'regular' | 'only';

function dealsDamageIn(s: GameState, c: CardInstance, pass: DamagePass): boolean {
  if (pass === 'only') return true;
  const first = hasKeyword(s, c, 'FirstStrike');
  const double = hasKeyword(s, c, 'DoubleStrike');
  return pass === 'first' ? first || double : !first || double;
}

/** Damage counted as lethal for assignment: 1 from a deathtouch source, otherwise remaining toughness. */
function lethalDamage(s: GameState, source: CardInstance, victim: CardInstance): number {
  const remaining = Math.max(0, toughnessOf(s, victim) - victim.damage);
  if (hasKeyword(s, source, 'Deathtouch')) return victim.deathtouched ? 0 : Math.min(1, remaining);
  return remaining;
}

/**
 * One combat damage pass. With no first or double strike involved there is
 * a single pass. Blocked attackers assign lethal damage to blockers in
 * declaration order; the rest goes to the last blocker, or to the defending
 * player with trample. (Choosing the split yourself comes later.)
 */
function damagePass(ctx: Ctx, pass: DamagePass): void {
  const s = ctx.s;
  const combat = s.combat!;
  const participates = (c: CardInstance | undefined): c is CardInstance =>
    isCreatureOnBattlefield(s, c) && dealsDamageIn(s, c, pass) && powerOf(s, c) > 0;

  const assignments: Assignment[] = [];
  for (const attack of combat.attacks) {
    const attacker = s.cards[attack.attacker];
    if (!isCreatureOnBattlefield(s, attacker)) continue;
    const declared = combat.blocks.filter((b) => b.attacker === attack.attacker).map((b) => b.blocker);
    const liveBlockers = declared.map((id) => s.cards[id]).filter((c) => isCreatureOnBattlefield(s, c));
    const defenderAlive = !s.players[attack.defender]!.eliminated;
    const toDefender: Target = { kind: 'player', player: attack.defender };

    if (participates(attacker)) {
      let remaining = powerOf(s, attacker);
      if (declared.length === 0) {
        if (defenderAlive) assignments.push({ source: attacker.id, target: toDefender, amount: remaining });
      } else {
        const trample = hasKeyword(s, attacker, 'Trample');
        liveBlockers.forEach((blocker, i) => {
          const lethal = lethalDamage(s, attacker, blocker);
          const last = i === liveBlockers.length - 1;
          const amount = last && !trample ? remaining : Math.min(remaining, lethal);
          remaining -= amount;
          if (amount > 0) assignments.push({ source: attacker.id, target: { kind: 'card', card: blocker.id }, amount });
        });
        if (trample && remaining > 0 && defenderAlive) {
          assignments.push({ source: attacker.id, target: toDefender, amount: remaining });
        }
      }
    }
    for (const blocker of liveBlockers) {
      if (participates(blocker)) {
        assignments.push({
          source: blocker.id,
          target: { kind: 'card', card: attacker.id },
          amount: powerOf(s, blocker),
        });
      }
    }
  }

  // All combat damage in a pass is dealt at the same time.
  for (const a of assignments) dealDamage(ctx, a.source, a.target, a.amount, true);
}

export function dealCombatDamage(ctx: Ctx): void {
  const s = ctx.s;
  const combat = s.combat;
  if (!combat) return;
  const involved = [...combat.attacks.map((a) => a.attacker), ...combat.blocks.map((b) => b.blocker)];
  const split = involved.some((id) => {
    const c = s.cards[id];
    return isCreatureOnBattlefield(s, c) && (hasKeyword(s, c, 'FirstStrike') || hasKeyword(s, c, 'DoubleStrike'));
  });
  if (!split) {
    damagePass(ctx, 'only');
    return;
  }
  // Simplification: both passes happen in one step, with state-based actions
  // between them but no priority window. Rule 510.4 gives a separate step.
  damagePass(ctx, 'first');
  applyStateBasedActions(ctx);
  if (s.pending.kind === 'gameOver' || s.players[s.activePlayer]!.eliminated) return;
  damagePass(ctx, 'regular');
}
