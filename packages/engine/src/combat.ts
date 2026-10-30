// Combat for pods: each attacker picks a defending player, and each
// defending player declares their own blockers (PRD 7.4).

import { canPayFromPool, payMana } from './stack.ts';
import { continuousSources, currentDefinition } from './cardface.ts';
import { colorsOf } from './typerules.ts';
import { isBasicLand } from './typerules.ts';
import { enterStep, givePriority } from './turn.ts';
import { hasFlag, powerOf, staticAffects, toughnessOf } from './characteristics.ts';
import { battlefield, aliveFromActive,
  alivePlayers,
  dealDamage,
  damageSourceSnapshot,
  hasKeyword,
  isCreatureOnBattlefield,
  reject,
  tap,
  type Ctx,
} from './state.ts';
import type { Attack, Block, CardInstance, GameState, InstanceId, PlayerId, Target } from './types.ts';

/** "Can't attack or block" from a static ability (Observed Stasis). */
function cantAttackOrBlock(s: GameState, c: CardInstance): boolean {
  return battlefield(s).some((source) => (currentDefinition(s, source).statics ?? []).some((spec) => spec.cantAttackOrBlock && staticAffects(s, source, spec, c)));
}

export function canAttack(s: GameState, c: CardInstance, playerId: PlayerId): boolean {
  return (
    isCreatureOnBattlefield(s, c) &&
    !cantAttackOrBlock(s, c) &&
    !hasKeyword(s, c, 'Defender') &&
    c.controller === playerId &&
    !c.tapped &&
    (!c.summoningSick || hasKeyword(s, c, 'Haste'))
  );
}

/** Whether `blocker` could block `attacker` on its own (menace is checked per whole declaration). */
export function canBlock(s: GameState, blocker: CardInstance, attacker: CardInstance): boolean {
  if (!isCreatureOnBattlefield(s, blocker) || blocker.tapped) return false;
  if (hasFlag(s, blocker, 'cantBlock') || cantAttackOrBlock(s, blocker)) return false;
  if (hasFlag(s, attacker, 'cantBeBlocked')) return false;
  for (const source of battlefield(s)) {
    for (const spec of currentDefinition(s, source).statics ?? []) {
      if (spec.cantBeBlockedByGreaterPower && staticAffects(s, source, spec, attacker) && powerOf(s, blocker) > powerOf(s, attacker)) return false;
      const most = spec.cantBeBlockedByPowerAtMost;
      if (most !== undefined && staticAffects(s, source, spec, attacker) && powerOf(s, blocker) <= most) return false;
    }
  }
  if (hasKeyword(s, attacker, 'Flying') && !hasKeyword(s, blocker, 'Flying') && !hasKeyword(s, blocker, 'Reach')) {
    return false;
  }
  // Landwalk (rule 702.14): unblockable while the defending player controls such a land.
  if (hasKeyword(s, attacker, 'NonbasicLandwalk')) {
    const defenderLands = s.players[blocker.controller]!.battlefield.map((id) => s.cards[id]!);
    if (defenderLands.some((c) => currentDefinition(s, c).types.includes('land') && !isBasicLand(currentDefinition(s, c)))) return false;
  }
  if (hasKeyword(s, attacker, 'Islandwalk')) {
    const defenderLands = s.players[blocker.controller]!.battlefield.map((id) => s.cards[id]!);
    if (defenderLands.some((c) => currentDefinition(s, c).subtypes?.includes('Island'))) return false;
  }
  // Intimidate (rule 702.13): only artifact creatures and creatures that share a color with it.
  if (hasKeyword(s, attacker, 'Intimidate') && !currentDefinition(s, blocker).types.includes('artifact')) {
    const colors = colorsOf(currentDefinition(s, attacker));
    if (!colorsOf(currentDefinition(s, blocker)).some((c) => colors.includes(c))) return false;
  }
  return true;
}

export function attackersFor(s: GameState, playerId: PlayerId): CardInstance[] {
  return battlefield(s).filter((c) => canAttack(s, c, playerId));
}

export function canAnyAttack(s: GameState, playerId: PlayerId): boolean {
  return alivePlayers(s).length > 1 && attackersFor(s, playerId).length > 0;
}

/** A surviving Promise of Loyalty creature cannot attack the spell's controller. */
export function canAttackPlayer(s: GameState, c: CardInstance, defender: PlayerId): boolean {
  return !c.vowTo?.includes(defender);
}

/** Each continuous goad effect imposes attack and defender requirements, rather than a restriction. */
export function hasGoad(s: GameState): boolean {
  return continuousSources(s).some(source=>!source.phasedOut && currentDefinition(s, source).statics?.some(st=>st.goaded));
}

export function hasAttackRequirements(s: GameState): boolean {
  return hasGoad(s) || s.temporaryEffects.some(e=>e.flags?.includes('mustAttack'));
}

export function goadedBy(s: GameState, c: CardInstance): PlayerId[] {
  const players = new Set<PlayerId>();
  for (const source of continuousSources(s)) {
    if (source.phasedOut) continue;
    for (const spec of currentDefinition(s, source).statics ?? []) {
      if (spec.goaded && staticAffects(s, source, spec, c)) players.add(source.controller);
    }
  }
  return [...players];
}

function goadScore(goaders: PlayerId[], defender: PlayerId): number {
  return goaders.length ? 1 + goaders.filter(p=>p!==defender).length : 0;
}

/** Best free attacks: a player is never required to pay an attack tax to meet a requirement. */
export function requiredAttackDefenders(s: GameState, c: CardInstance): PlayerId[] {
  const goaders = goadedBy(s,c);
  if ((!goaders.length && !hasFlag(s,c,'mustAttack')) || !canAttack(s,c,c.controller)) return [];
  const free = alivePlayers(s).filter(p=>p!==c.controller && canAttackPlayer(s,c,p) && attackTaxFor(s,p)===0);
  const best = Math.max(0,...free.map(p=>goadScore(goaders,p)));
  return free.filter(p=>goadScore(goaders,p)===best);
}

/** The attacks must satisfy as many requirements as possible (rule 508.1d). */
export function attackRequirementProblem(s: GameState, player: PlayerId, attacks: readonly Attack[]): string | null {
  if (!hasAttackRequirements(s)) return null;
  for (const c of attackersFor(s,player)) {
    const required = requiredAttackDefenders(s,c);
    if (!required.length) continue;
    const attack = attacks.find(a=>a.attacker===c.id);
    if (!attack) return 'A creature required to attack must attack this combat if able.';
    if (goadScore(goadedBy(s,c),attack.defender) < goadScore(goadedBy(s,c),required[0]!)) return 'A goaded creature must attack a player other than its goader if able.';
  }
  return null;
}

/** Complete a sampled or AI attack with obligatory free attacks, preserving valid chosen defenders. */
export function completeRequiredAttacks(s: GameState, player: PlayerId, attacks: readonly Attack[]): Attack[] {
  const out = attacks.map(a=>({...a}));
  if (!hasAttackRequirements(s)) return out;
  for (const c of attackersFor(s,player)) {
    const required=requiredAttackDefenders(s,c);
    if (!required.length) continue;
    const a=out.find(a=>a.attacker===c.id);
    if (!a) out.push({attacker:c.id,defender:required[0]!});
    else if(goadScore(goadedBy(s,c),a.defender)<goadScore(goadedBy(s,c),required[0]!)) a.defender=required[0]!;
  }
  return out;
}

/** What attacking this player costs for each creature (Propaganda, Summon: Yojimbo). */
export function attackTaxFor(s: GameState, defender: PlayerId): number {
  let tax = (s.players[defender]!.attackTaxes ?? []).reduce((n, k) => n + k, 0);
  for (const c of s.players[defender]!.battlefield.map((id) => s.cards[id]!)) {
    if (c.controller !== defender) continue;
    for (const st of currentDefinition(s, c).statics ?? []) tax += st.attackTax ?? 0;
  }
  return tax;
}

/** The total generic mana a set of attacks costs. */
export function attackTax(s: GameState, attacks: readonly Attack[]): number {
  return attacks.reduce((n, a) => n + (s.players[a.defender] ? attackTaxFor(s, a.defender) : 0), 0);
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
    if (!canAttackPlayer(s, c, a.defender)) reject('A vow prevents that creature from attacking this player.');
  }
  const required = attackRequirementProblem(s, playerId, attacks);
  if (required) reject(required);
  // "Creatures can't attack you unless their controller pays {2} for each" (rule 508.1g).
  const tax = attackTax(s, attacks);
  if (tax > 0) {
    if (!canPayFromPool(s, playerId, { generic: tax })) reject(`Attacking there costs {${tax}}. Add the mana first.`);
    payMana(ctx, playerId, { generic: tax });
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
  s.combat = { attacks: [...attacks], blocks: [], blockersPending: [], declaredOpponents: { [playerId]: [...new Set(attacks.map(a=>a.defender))] } };
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
  combat.blockedAttackers = [...new Set([...(combat.blockedAttackers ?? []), ...blocks.map(b=>b.attacker)])];
  for (const b of blocks) {
    combat.blocks.push(b);
    ctx.ev.push({ type: 'BlockDeclared', blocker: b.blocker, attacker: b.attacker });
  }
  // "Attacks you and isn't blocked" is checked after blockers are declared, before damage.
  const unblocked = new Map<PlayerId, InstanceId[]>();
  for (const a of combat.attacks) {
    const attacker = s.cards[a.attacker];
    if (a.defender !== playerId || !isCreatureOnBattlefield(s, attacker) || combat.blocks.some((b) => b.attacker === a.attacker)) continue;
    unblocked.set(attacker.controller, [...(unblocked.get(attacker.controller) ?? []), a.attacker]);
  }
  for (const [attacker, attackers] of unblocked) ctx.ev.push({ type: 'AttackersUnblocked', player: attacker, defender: playerId, attackers });
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
  return pass === 'first' ? first || double : s.combat?.firstStrikeParticipants?.[c.id] !== (c.zoneChanges ?? 0) || double;
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
      if (declared.length === 0 && !combat.blockedAttackers?.includes(attacker.id)) {
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
  const snapshots = new Map(assignments.map(a=>[a.source,damageSourceSnapshot(s,s.cards[a.source]!)]));
  for (const a of assignments) dealDamage(ctx, a.source, a.target, a.amount, true, snapshots.get(a.source));
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
  if (!split && !combat.damageStep) {
    damagePass(ctx, 'only');
    return;
  }
  if (!combat.damageStep) {
    combat.firstStrikeParticipants=Object.fromEntries(involved.filter(id=>{
      const c=s.cards[id];return isCreatureOnBattlefield(s,c) && (hasKeyword(s,c,'FirstStrike')||hasKeyword(s,c,'DoubleStrike'));
    }).map(id=>[id,s.cards[id]!.zoneChanges??0]));
    combat.damageStep='first';
    damagePass(ctx,'first');
  } else {
    combat.damageStep='regular';
    damagePass(ctx,'regular');
  }
}
