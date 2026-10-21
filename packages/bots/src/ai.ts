// A basic AI opponent. It is deliberately simple and readable rather than
// strong: play a land, cast the biggest thing it can afford, aim removal at
// the biggest threat, attack when it's safe or lethal, and block to trade
// up or to survive.

import {
  CHOSEN_TARGET_KINDS,
  canEverCast,
  manaValue,
  parseManaCost,
  triggerSpec,
  type Action,
  type Attack,
  type Block,
  type CardDefinition,
  type CardInstance,
  type EffectSpec,
  type GameState,
  type InstanceId,
  type PlayerId,
  type Target,
} from '@nexus/engine';
import { planTaps, tapActions } from './mana.ts';
import type { Bot } from './index.ts';

const def = (s: GameState, c: CardInstance): CardDefinition => s.cardDefs[c.defId]!;
const power = (s: GameState, c: CardInstance) => def(s, c).power ?? 0;
const toughness = (s: GameState, c: CardInstance) => def(s, c).toughness ?? 0;
const has = (s: GameState, c: CardInstance, k: string) => def(s, c).keywords?.includes(k as never) ?? false;

function opponents(s: GameState, me: PlayerId): PlayerId[] {
  return s.turnOrder.filter((id) => id !== me && !s.players[id]!.eliminated);
}

function creatures(s: GameState, owner: PlayerId): CardInstance[] {
  return s.players[owner]!.battlefield.map((id) => s.cards[id]!).filter((c) => def(s, c).types.includes('creature'));
}

function weakestOpponent(s: GameState, me: PlayerId): PlayerId {
  return opponents(s, me).sort((a, b) => s.players[a]!.life - s.players[b]!.life)[0]!;
}

/** Would `blocker` be able to block `attacker`? Mirrors the engine's evasion rules. */
function canBlock(s: GameState, blocker: CardInstance, attacker: CardInstance): boolean {
  if (blocker.tapped) return false;
  if (has(s, attacker, 'Flying') && !has(s, blocker, 'Flying') && !has(s, blocker, 'Reach')) return false;
  return true;
}

/** Does `a` deal lethal damage to `b` in a fight (ignoring first strike order)? */
function kills(s: GameState, a: CardInstance, b: CardInstance): boolean {
  if (has(s, b, 'Indestructible')) return false;
  const dmg = power(s, a) * (has(s, a, 'DoubleStrike') ? 2 : 1);
  return dmg > 0 && (has(s, a, 'Deathtouch') || dmg + b.damage >= toughness(s, b));
}

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

/** Chooses a target for one effect, or null if there's no good one. */
function chooseTarget(s: GameState, me: PlayerId, effect: NonNullable<CardDefinition['effects']>[number]): Target | null {
  const enemyCreatures = opponents(s, me).flatMap((p) => creatures(s, p));
  const amount = effect.amount ?? 0;
  if (effect.effect === 'Destroy') {
    const best = enemyCreatures
      .filter((c) => !has(s, c, 'Indestructible'))
      .sort((a, b) => power(s, b) - power(s, a))[0];
    return best ? { kind: 'card', card: best.id } : null;
  }
  if (effect.effect === 'DealDamage') {
    const victim = opponents(s, me).find((p) => s.players[p]!.life <= amount);
    if (victim && effect.target === 'AnyTarget') return { kind: 'player', player: victim };
    const killable = enemyCreatures
      .filter((c) => !has(s, c, 'Indestructible') && amount + c.damage >= toughness(s, c))
      .sort((a, b) => power(s, b) - power(s, a))[0];
    if (killable) return { kind: 'card', card: killable.id };
    if (effect.target === 'AnyTarget') return { kind: 'player', player: weakestOpponent(s, me) };
    return null;
  }
  if (effect.target === 'TargetOpponent') return { kind: 'player', player: weakestOpponent(s, me) };
  // Draw and life gain help the caster.
  return effect.target === 'TargetPlayer' ? { kind: 'player', player: me } : null;
}

function chooseTargets(s: GameState, me: PlayerId, effects: readonly EffectSpec[] | undefined): Target[] | null {
  const targets: Target[] = [];
  for (const effect of effects ?? []) {
    if (!CHOSEN_TARGET_KINDS.includes(effect.target)) continue;
    const t = chooseTarget(s, me, effect);
    if (!t) return null;
    targets.push(t);
  }
  return targets;
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

function isWorthCasting(s: GameState, me: PlayerId, card: CardDefinition): boolean {
  const effects = card.effects ?? [];
  if (effects.some((e) => e.effect === 'GainLife') && effects.every((e) => e.effect === 'GainLife')) {
    return s.players[me]!.life <= 12;
  }
  const lifeCost = effects.filter((e) => e.effect === 'LoseLife' && e.target === 'You').reduce((n, e) => n + (e.amount ?? 0), 0);
  if (lifeCost > 0 && s.players[me]!.life <= lifeCost + 3) return false;
  if (effects.some((e) => e.target === 'EachPlayer' && e.effect === 'DealDamage')) {
    return opponents(s, me).every((p) => s.players[p]!.life < s.players[me]!.life);
  }
  return true;
}

/**
 * The next action toward casting the best spell available now: tap a land,
 * or cast once the pool can pay. Returns null if nothing is worth casting.
 */
function castStep(s: GameState, me: PlayerId, legal: Action[]): Action | null {
  const sorcerySpeed =
    s.activePlayer === me && (s.step === 'main1' || s.step === 'main2') && s.stack.length === 0;
  const hand = s.players[me]!.hand.map((id) => s.cards[id]!);
  const candidates = hand
    .map((c) => ({ c, d: def(s, c) }))
    .filter(({ d }) => canEverCast(d))
    .filter(({ d }) => sorcerySpeed || d.types.includes('instant') || d.keywords?.includes('Flash'))
    .filter(({ d }) => isWorthCasting(s, me, d))
    .sort((a, b) => manaValue(parseManaCost(b.d.manaCost)) - manaValue(parseManaCost(a.d.manaCost)));

  for (const { c, d } of candidates) {
    const targets = chooseTargets(s, me, d.effects);
    if (!targets) continue;
    const taps = planTaps(s, me, d.manaCost);
    if (!taps) continue;
    if (taps.length > 0) return tapActions(me, taps)[0]!;
    const cast: Action = { type: 'CastSpell', player: me, card: c.id, targets };
    // Only return casts the engine agrees are legal right now.
    if (legal.some((a) => a.type === 'CastSpell' && a.card === c.id)) return cast;
  }
  return null;
}

function chooseAttacks(s: GameState, me: PlayerId): Attack[] {
  const defender = weakestOpponent(s, me);
  const ready = creatures(s, me).filter(
    (c) => !c.tapped && (!c.summoningSick || has(s, c, 'Haste')) && power(s, c) > 0,
  );
  const blockers = creatures(s, defender).filter((c) => !c.tapped);
  const total = ready.reduce((n, c) => n + power(s, c), 0);
  // Swing with everything if that's likely lethal against an empty board.
  if (blockers.length === 0 || total >= s.players[defender]!.life + blockers.length * 2) {
    return ready.map((c) => ({ attacker: c.id, defender }));
  }
  // Otherwise attack only with creatures no single blocker can kill without dying.
  return ready
    .filter((a) => !blockers.some((b) => canBlock(s, b, a) && kills(s, b, a) && !kills(s, a, b)))
    .map((c) => ({ attacker: c.id, defender }));
}

function chooseBlocks(s: GameState, me: PlayerId): Block[] {
  const incoming = (s.combat?.attacks ?? [])
    .filter((a) => a.defender === me)
    .map((a) => s.cards[a.attacker]!)
    .filter((c) => c.zone === 'battlefield')
    .sort((a, b) => power(s, b) - power(s, a));
  const available = new Set<InstanceId>(creatures(s, me).filter((c) => !c.tapped).map((c) => c.id));
  const blocks: Block[] = [];
  let unblockedDamage = incoming.reduce((n, c) => n + power(s, c), 0);

  for (const attacker of incoming) {
    if (has(s, attacker, 'Menace')) continue;
    const options = [...available].map((id) => s.cards[id]!).filter((b) => canBlock(s, b, attacker));
    // Best: kill it and survive. Next: trade with something cheaper or equal.
    const safe = options.find((b) => kills(s, b, attacker) && !kills(s, attacker, b));
    const trade = options.find((b) => kills(s, b, attacker) && power(s, b) <= power(s, attacker));
    const wall = options.find((b) => !kills(s, attacker, b));
    const pick = safe ?? wall ?? trade;
    if (pick) {
      blocks.push({ blocker: pick.id, attacker: attacker.id });
      available.delete(pick.id);
      unblockedDamage -= power(s, attacker);
    }
  }
  // Chump block the biggest remaining attackers if the damage would be lethal.
  for (const attacker of incoming) {
    if (unblockedDamage < s.players[me]!.life) break;
    if (has(s, attacker, 'Menace') || blocks.some((b) => b.attacker === attacker.id)) continue;
    const chump = [...available].map((id) => s.cards[id]!).find((b) => canBlock(s, b, attacker));
    if (!chump) continue;
    blocks.push({ blocker: chump.id, attacker: attacker.id });
    available.delete(chump.id);
    unblockedDamage -= power(s, attacker);
  }
  return blocks;
}

/** Aims a trigger the same way as a spell, falling back to the first legal choice. */
function chooseTriggerTargets(s: GameState, me: PlayerId, legal: Action[]): Action {
  const t = s.triggerQueue[0]!;
  const effects = s.cardDefs[s.cards[t.source]!.defId]!.triggers![t.ability]!.effects;
  const wanted = chooseTargets(s, me, effects);
  const same = (a: Target, b: Target) => JSON.stringify(a) === JSON.stringify(b);
  const match = legal.find(
    (a) => a.type === 'ChooseTargets' && wanted !== null && a.targets.every((t, i) => same(t, wanted[i]!)),
  );
  return match ?? legal[0]!;
}

/**
 * "You may" abilities in the supported cards are all upsides, so say yes when
 * the cost is affordable: tap lands for it first, and keep at least 5 life.
 */
function decideOptional(s: GameState, me: PlayerId, legal: Action[]): Action {
  const item = s.stack.at(-1)!;
  const cost = item.kind === 'ability' ? triggerSpec(s, item).cost : undefined;
  const no: Action = { type: 'Decide', player: me, accept: false };
  if (cost?.life !== undefined && s.players[me]!.life - cost.life < 5) return no;
  if (legal.some((a) => a.type === 'Decide' && a.accept)) return { type: 'Decide', player: me, accept: true };
  const taps = planTaps(s, me, cost?.mana);
  return taps && taps.length > 0 ? tapActions(me, taps)[0]! : no;
}

/** The basic AI. `seed` is accepted for symmetry with other bots; this one is deterministic. */
export function basicAi(_seed = 0): Bot {
  return (s, legal) => {
    const pending = s.pending;
    if (pending.kind === 'declareAttackers') {
      return { type: 'DeclareAttackers', player: pending.player, attacks: chooseAttacks(s, pending.player) };
    }
    if (pending.kind === 'declareBlockers') {
      return { type: 'DeclareBlockers', player: pending.player, blocks: chooseBlocks(s, pending.player) };
    }
    if (pending.kind === 'chooseTargets') return chooseTriggerTargets(s, pending.player, legal);
    if (pending.kind === 'decide') return decideOptional(s, pending.player, legal);
    if (pending.kind !== 'priority') return legal[0]!;
    const me = pending.player;

    // Prefer a land that enters untapped when we could use the mana this turn.
    const lands = legal.filter((a): a is Extract<Action, { type: 'PlayLand' }> => a.type === 'PlayLand');
    if (lands.length > 0) {
      const untapped = lands.find((a) => !s.cardDefs[s.cards[a.card]!.defId]!.entersTapped);
      return untapped ?? lands[0]!;
    }
    return castStep(s, me, legal) ?? { type: 'PassPriority', player: me };
  };
}
