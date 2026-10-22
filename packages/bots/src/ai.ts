// A basic AI opponent. It is deliberately simple and readable rather than
// strong: play a land, cast or activate whatever scores best, aim removal at
// the biggest threat and buffs at its own best creature, attack when it's
// safe or lethal, and block to trade up or to survive.

import {
  attackTax,
  attackTaxFor,
  objectManaValue,
  choiceProblem,
  CHOSEN_TARGET_KINDS,
  abilityOptions,
  activatedAbilities,
  amountOf,
  blockProblem,
  canBlock as engineCanBlock,
  hasKeyword,
  isEquipment,
  manaValue,
  matchesObject,
  parseManaCost,
  powerOf,
  spellEffects,
  spellOptions,
  toughnessOf,
  triggerLifeCost,
  triggerSpec,
  type Action,
  type Attack,
  type Block,
  type CardDefinition,
  type CardInstance,
  type CostedOption,
  type EffectSpec,
  type GameState,
  type InstanceId,
  type PlayerId,
  type Target,
} from '@nexus/engine';
import { planTaps, tapActions } from './mana.ts';
import type { Bot } from './index.ts';

const def = (s: GameState, c: CardInstance): CardDefinition => s.cardDefs[c.defId]!;
const power = (s: GameState, c: CardInstance) => powerOf(s, c);
const toughness = (s: GameState, c: CardInstance) => toughnessOf(s, c);
const has = (s: GameState, c: CardInstance, k: Parameters<typeof hasKeyword>[2]) => hasKeyword(s, c, k);

function opponents(s: GameState, me: PlayerId): PlayerId[] {
  return s.turnOrder.filter((id) => id !== me && !s.players[id]!.eliminated);
}

/**
 * Permanents a player controls. Cards stay in their owner's battlefield list,
 * so a creature someone took control of (Sepulchral Primordial) is found by
 * its controller, not by whose list it's in.
 */
function controlled(s: GameState, player: PlayerId): CardInstance[] {
  return s.turnOrder.flatMap((pid) => s.players[pid]!.battlefield.map((id) => s.cards[id]!)).filter((c) => c.controller === player);
}

function creatures(s: GameState, player: PlayerId): CardInstance[] {
  return controlled(s, player).filter((c) => def(s, c).types.includes('creature'));
}

/**
 * What a bot remembers between decisions: how much damage each player has
 * sent its way. Real players hold a grudge.
 */
export interface Memory {
  grudge: Record<PlayerId, number>;
}

/** Damage a creature would deal in combat: power, twice with double strike. */
function hitFor(s: GameState, c: CardInstance): number {
  return Math.max(0, power(s, c)) * (has(s, c, 'DoubleStrike') ? 2 : 1);
}

/** Creatures that could attack on their controller's next turn. */
function attackers(s: GameState, owner: PlayerId): CardInstance[] {
  return creatures(s, owner).filter((c) => power(s, c) > 0);
}

/**
 * How dangerous an opponent is to `me`, the way a player sizes up the table:
 * the damage their board could deal (more for creatures that are hard to
 * block), their mana and cards in hand (what they could do next), how
 * healthy they are, commander damage they've already dealt us, and any grudge.
 */
export function threatOf(s: GameState, me: PlayerId, opp: PlayerId, memory?: Memory): number {
  const p = s.players[opp]!;
  let board = 0;
  for (const c of attackers(s, opp)) {
    const evasive = has(s, c, 'Flying') || has(s, c, 'Menace') || has(s, c, 'Trample') || has(s, c, 'NonbasicLandwalk');
    board += hitFor(s, c) * (evasive ? 1.5 : 1);
  }
  const lands = p.battlefield.filter((id) => def(s, s.cards[id]!).types.includes('land')).length;
  const others = p.battlefield.length - lands - creatures(s, opp).length;
  const commanderDamage = Object.entries(s.players[me]!.commanderDamage)
    .filter(([id]) => s.cards[id]?.owner === opp)
    .reduce((n, [, d]) => n + d, 0);
  return (
    board * 2 +
    lands * 0.5 +
    others * 1 +
    p.hand.length * 0.75 +
    p.life * 0.15 +
    commanderDamage * 0.5 +
    (memory?.grudge[opp] ?? 0) * 0.5
  );
}

/** Untapped creatures of `opp` that could block `attacker`. */
function blockersFor(s: GameState, opp: PlayerId, attacker: CardInstance): CardInstance[] {
  return creatures(s, opp).filter((b) => !b.tapped && canBlock(s, b, attacker));
}

/** Would `blocker` be able to block `attacker`? The engine's own evasion rules. */
function canBlock(s: GameState, blocker: CardInstance, attacker: CardInstance): boolean {
  return engineCanBlock(s, blocker, attacker);
}

/** Does `a` deal lethal damage to `b` in a fight (ignoring first strike order)? */
function kills(s: GameState, a: CardInstance, b: CardInstance): boolean {
  if (has(s, b, 'Indestructible')) return false;
  const dmg = power(s, a) * (has(s, a, 'DoubleStrike') ? 2 : 1);
  return dmg > 0 && (has(s, a, 'Deathtouch') || dmg + b.damage >= toughness(s, b));
}

// ---------------------------------------------------------------------------
// Scoring spells and abilities
// ---------------------------------------------------------------------------

/** Roughly how much a permanent is worth to whoever controls it. */
function value(s: GameState, c: CardInstance): number {
  const d = def(s, c);
  if (d.types.includes('creature')) return 1 + power(s, c) + toughness(s, c) / 2;
  if (d.types.includes('land')) return 1;
  return 2;
}

/** Effects that hurt whatever they target; the rest help it. */
const HARMFUL = new Set([
  'DealDamage',
  'Destroy',
  'Exile',
  'ShuffleIntoLibraryReveal',
  'Tap',
  'ExileUntilSourceLeaves',
  'LoseLife',
]);

/** How good it is for `me` to apply `effect` to `target`. */
function scoreTarget(s: GameState, me: PlayerId, effect: EffectSpec, target: Target): number {
  const amount = amountOf(s, effect.amount, me);
  const harmful =
    HARMFUL.has(effect.effect) || (effect.effect === 'ModifyPT' && (effect.toughness ?? 0) + (effect.power ?? 0) < 0);
  if (target.kind === 'player') {
    const mine = target.player === me;
    if (!harmful) return mine ? 2 : -2;
    if (mine) return -10;
    const life = s.players[target.player]!.life;
    return effect.effect === 'DealDamage' && amount >= life ? 50 : amount / 2 + (20 - life) / 10;
  }
  // Leaving out an "up to one" target: better than a bad target, worse than a good one.
  if (target.kind === 'none') return 0;
  const c = s.cards[target.card]!;
  // A spell on the stack: counter an opponent's (the bigger the better), never your own.
  if (c.zone === 'stack') {
    const caster = s.stack.find((i) => i.kind === 'spell' && i.card === c.id)?.controller;
    return caster === me ? -20 : 2 + objectManaValue(s, c);
  }
  const mine = (c.zone === 'battlefield' ? c.controller : c.owner) === me;
  if (effect.effect === 'CreateTokenCopy') return value(s, c);
  if (effect.effect === 'ReturnToBattlefield') return mine ? value(s, c) : -5;
  if (!harmful) return mine ? value(s, c) : -value(s, c);
  if (mine) return -2 * value(s, c);
  if (effect.effect === 'DealDamage') {
    // Damage only matters if it kills.
    const dies = !has(s, c, 'Indestructible') && amount + c.damage >= toughness(s, c);
    return dies ? value(s, c) + 1 : 0;
  }
  if (effect.effect === 'Destroy' && has(s, c, 'Indestructible')) return 0;
  if (effect.effect === 'Tap') return c.tapped ? 0 : value(s, c) / 3;
  if (effect.effect === 'ModifyPT') return toughness(s, c) + (effect.toughness ?? 0) <= 0 ? value(s, c) + 1 : 1;
  return value(s, c) + 1;
}

/**
 * "Destroy all ..." and similar: what it takes from opponents minus what it
 * costs `me`, with my own losses counting extra, so the AI wipes the board
 * when it's behind rather than when it's ahead.
 */
function massEffectScore(s: GameState, me: PlayerId, effect: EffectSpec, source: InstanceId): number {
  const harmful = HARMFUL.has(effect.effect);
  let score = 0;
  for (const pid of s.turnOrder) {
    for (const id of s.players[pid]!.battlefield) {
      const c = s.cards[id]!;
      if (!matchesObject(s, effect.filter, c, { controller: me, source })) continue;
      if (harmful && effect.effect === 'Destroy' && has(s, c, 'Indestructible')) continue;
      const v = value(s, c);
      if (c.controller === me) score += harmful ? -1.5 * v : v;
      else score += harmful ? v : -v;
    }
  }
  return score;
}

/** A spell or ability's score for `me`: positive means worth doing. */
function scoreOption(s: GameState, me: PlayerId, o: CostedOption): number {
  const a = o.action;
  const card = s.cards[a.card]!;
  const d = def(s, card);
  const targets = a.targets ?? [];
  let effects: EffectSpec[];
  if (a.type === 'CastSpell') {
    if (d.types.includes('creature') || d.types.includes('artifact') || d.types.includes('enchantment')) {
      // Permanents: bigger is better; Equipment needs creatures to be worth much (Job select brings one).
      return 2 + manaValue(o.cost) + (isEquipment(s, card) ? 1 : 0);
    }
    effects = spellEffects(d, a);
  } else {
    effects = activatedAbilities(d)[a.ability]!.effects;
    if (effects.some((e) => e.effect === 'Attach')) return scoreEquip(s, me, card, targets[0]);
    if (effects.some((e) => e.effect === 'SearchLibraryToHand')) return needsLand(s, me) ? 3 : -1;
  }
  let score = 0;
  let i = 0;
  for (const e of effects) {
    if (CHOSEN_TARGET_KINDS.includes(e.target)) {
      score += scoreTarget(s, me, e, targets[i++]!);
      continue;
    }
    if (e.target === 'AllPermanents') {
      score += massEffectScore(s, me, e, card.id);
      continue;
    }
    if (e.effect === 'SacrificeGreatestPower' && e.target === 'EachOpponent') {
      for (const p of opponents(s, me)) {
        const theirs = creatures(s, p);
        if (theirs.length > 0) score += Math.max(...theirs.map((c) => value(s, c)));
      }
      continue;
    }
    const amount = amountOf(s, e.amount, me);
    if (e.effect === 'GainLife' && e.target === 'You') score += s.players[me]!.life <= 12 ? amount / 2 : 0.1;
    if (e.effect === 'DrawCards' && e.target === 'You') score += amount * 1.5;
    if (e.effect === 'CreateToken') score += amount * 2;
    if (e.effect === 'AddCounters' && e.target === 'EachCreatureYouControl') score += creatures(s, me).length;
    if (e.effect === 'Surveil' || e.effect === 'Mill') score += 0.2;
    if (e.effect === 'ModifyPT' && e.target === 'EachOpponentCreature') score += opponents(s, me).length;
  }
  return score;
}

/** Equip is worth it when it moves gear onto a better creature. */
function scoreEquip(s: GameState, me: PlayerId, equipment: CardInstance, target: Target | undefined): number {
  if (target?.kind !== 'card') return -1;
  const creature = s.cards[target.card]!;
  const current = equipment.attachedTo ? s.cards[equipment.attachedTo] : undefined;
  if (current?.id === creature.id) return -1;
  const gain = value(s, creature) - (current ? value(s, current) + 2 : 0);
  return creature.controller === me ? gain : -1;
}

function needsLand(s: GameState, me: PlayerId): boolean {
  const hand = s.players[me]!.hand.map((id) => def(s, s.cards[id]!));
  const lands = controlled(s, me).filter((c) => def(s, c).types.includes('land')).length;
  return lands < 6 && !hand.some((d) => d.types.includes('land'));
}

/**
 * The next action toward the best spell or ability available now: tap a
 * mana source, or cast/activate once the pool can pay. Null if nothing is
 * worth doing.
 */
function bestPlay(s: GameState, me: PlayerId, legal: Action[]): Action | null {
  const options = [...spellOptions(s, me), ...abilityOptions(s, me)]
    .map((o) => ({ o, score: scoreOption(s, me, o) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || manaValue(b.o.cost) - manaValue(a.o.cost));
  for (const { o } of options) {
    const taps = planTaps(s, me, o.cost, { forEquipment: o.forEquipment });
    if (!taps) continue;
    if (taps.length > 0) return tapActions(me, taps)[0]!;
    // Only return actions the engine agrees are legal right now.
    if (legal.some((a) => JSON.stringify(a) === JSON.stringify(o.action))) return o.action;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Combat
// ---------------------------------------------------------------------------

/**
 * Whom to attack, with what (threat assessment). In order:
 *  1. If attacking one opponent with everything is likely lethal, do it
 *     (the most threatening such opponent).
 *  2. Keep back enough blockers if an opponent could kill us next turn.
 *  3. Send each other attacker where it does the most good: at an opponent
 *     who can't profitably block it, weighted by how threatening they are,
 *     how close they are to dying, and any grudge.
 */
function chooseAttacks(s: GameState, me: PlayerId, memory?: Memory): Attack[] {
  const ready = creatures(s, me).filter(
    (c) => !c.tapped && (!c.summoningSick || has(s, c, 'Haste')) && power(s, c) > 0,
  );
  const opps = opponents(s, me);
  if (ready.length === 0 || opps.length === 0) return [];
  const threat = new Map(opps.map((o) => [o, threatOf(s, me, o, memory)]));

  // 1. Lethal: total damage beats their life plus what their blockers could soak up.
  const lethalOn = opps
    .filter((o) => {
      const blockers = creatures(s, o).filter((c) => !c.tapped);
      const total = ready.reduce((n, c) => n + hitFor(s, c), 0);
      const soak = blockers.length * Math.max(2, ...ready.map((c) => hitFor(s, c)));
      return blockers.length === 0 ? total >= s.players[o]!.life : total - soak >= s.players[o]!.life;
    })
    .sort((a, b) => threat.get(b)! - threat.get(a)!);
  if (lethalOn.length > 0) return ready.map((c) => ({ attacker: c.id, defender: lethalOn[0]! }));

  // 2. Defense: the most damage any one opponent could swing at us next turn.
  const myLife = s.players[me]!.life;
  const incoming = Math.max(0, ...opps.map((o) => attackers(s, o).reduce((n, c) => n + hitFor(s, c), 0)));
  const holdBack = new Set<InstanceId>();
  if (incoming >= myLife) {
    // Keep the sturdiest creatures home until the expected damage is survivable.
    let stopped = 0;
    for (const c of [...ready].sort((a, b) => toughness(s, b) - toughness(s, a))) {
      if (incoming - stopped < myLife) break;
      holdBack.add(c.id);
      stopped += Math.max(...opps.flatMap((o) => attackers(s, o).map((a) => hitFor(s, a))), 0);
    }
  }

  // 3. Each remaining attacker picks its best defender.
  const maxThreat = Math.max(1, ...threat.values());
  const attacks: Attack[] = [];
  for (const a of ready) {
    if (holdBack.has(a.id)) continue;
    let best: { defender: PlayerId; score: number } | null = null;
    for (const o of opps) {
      const blockers = blockersFor(s, o, a);
      // A blocker that kills it and survives makes the attack a loss.
      if (blockers.some((b) => kills(s, b, a) && !kills(s, a, b))) continue;
      const getsThrough = blockers.length === 0;
      const life = s.players[o]!.life;
      const score =
        (threat.get(o)! / maxThreat) * 3 + // the biggest threat
        (getsThrough ? hitFor(s, a) / Math.max(1, life) : 0) * 4 + // damage that matters
        (getsThrough ? 1 : 0) +
        Math.max(0, 10 - life) * 0.15; // finishing off a player who's nearly out
      if (!best || score > best.score) best = { defender: o, score };
    }
    if (best) attacks.push({ attacker: a.id, defender: best.defender });
  }
  return attacks;
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

// ---------------------------------------------------------------------------
// Other decisions
// ---------------------------------------------------------------------------

/** Aims a trigger by scoring each legal choice. */
function chooseTriggerTargets(s: GameState, me: PlayerId, legal: Action[]): Action {
  const t = s.triggerQueue[0]!;
  const effects = s.cardDefs[s.cards[t.source]!.defId]!.triggers![t.ability]!.effects.filter((e) =>
    CHOSEN_TARGET_KINDS.includes(e.target),
  );
  const score = (a: Action) =>
    a.type === 'ChooseTargets' ? a.targets.reduce((n, target, i) => n + scoreTarget(s, me, effects[i]!, target), 0) : -1e9;
  return [...legal].sort((a, b) => score(b) - score(a))[0]!;
}

/**
 * "You may" abilities in the kits are upsides, so say yes when the cost is
 * affordable: tap for it first, and keep at least 5 life.
 */
function decideOptional(s: GameState, me: PlayerId, legal: Action[]): Action {
  const item = s.stack.at(-1)!;
  const cost = item.kind === 'ability' ? triggerSpec(s, item)?.cost : undefined;
  const no: Action = { type: 'Decide', player: me, accept: false };
  const life = item.kind === 'ability' ? triggerLifeCost(s, item) : undefined;
  if (life !== undefined && s.players[me]!.life - life < 5) return no;
  if (legal.some((a) => a.type === 'Decide' && a.accept)) return { type: 'Decide', player: me, accept: true };
  const taps = planTaps(s, me, cost?.mana);
  return taps && taps.length > 0 ? tapActions(me, taps)[0]! : no;
}

/**
 * Legend rule: keep the copy that's worth the most right now, counting
 * +1/+1 counters, Equipment and other buffs (they're in its current stats).
 */
function chooseLegendToKeep(s: GameState, me: PlayerId, cards: InstanceId[]): Action {
  const worth = (id: InstanceId) => {
    const c = s.cards[id]!;
    const gear = controlled(s, me).filter((e) => e.attachedTo === id).length;
    return value(s, c) + gear * 2 + (c.tapped ? 0 : 0.5) + (c.summoningSick ? 0 : 0.5);
  };
  const keep = [...cards].sort((a, b) => worth(b) - worth(a))[0]!;
  return { type: 'ChooseLegend', player: me, keep };
}

/** Surveil: bin extra lands once there are plenty; keep everything else. */
function chooseSurveil(s: GameState, me: PlayerId, card: InstanceId): Action {
  const isLand = def(s, s.cards[card]!).types.includes('land');
  const lands = controlled(s, me).filter((c) => def(s, c).types.includes('land')).length;
  return { type: 'Surveil', player: me, toGraveyard: isLand && lands >= 5 };
}

// ---------------------------------------------------------------------------
// Opening hands
// ---------------------------------------------------------------------------

const isLandCard = (s: GameState, id: InstanceId) => def(s, s.cards[id]!).types.includes('land');

/** Keep a hand with 2-5 lands out of 7; after two mulligans, keep whatever comes. */
function chooseMulligan(s: GameState, me: PlayerId, taken: number, legal: Action[]): Action {
  const hand = s.players[me]!.hand;
  const lands = hand.filter((id) => isLandCard(s, id)).length;
  const workable = lands >= 2 && lands <= 5;
  const canMulligan = legal.some((a) => a.type === 'Mulligan' && !a.keep);
  return { type: 'Mulligan', player: me, keep: workable || taken >= 2 || !canMulligan };
}

/**
 * Bottoms cards to leave about 40% lands: surplus lands first if the hand is
 * land-heavy, otherwise the most expensive spells.
 */
function chooseBottom(s: GameState, me: PlayerId, count: number): Action {
  const hand = s.players[me]!.hand;
  const keptSize = hand.length - count;
  const wantLands = Math.max(2, Math.round(keptSize * 0.4));
  const lands = hand.filter((id) => isLandCard(s, id));
  const spells = hand
    .filter((id) => !isLandCard(s, id))
    .sort((a, b) => manaValue(parseManaCost(def(s, s.cards[b]!).manaCost)) - manaValue(parseManaCost(def(s, s.cards[a]!).manaCost)));
  const bottom: InstanceId[] = [];
  const surplusLands = lands.slice(wantLands);
  for (const id of [...surplusLands, ...spells, ...lands]) {
    if (bottom.length === count) break;
    if (!bottom.includes(id)) bottom.push(id);
  }
  return { type: 'BottomCards', player: me, cards: bottom };
}

/**
 * Choosing cards while something resolves. Discard: like bottoming after a
 * mulligan (surplus lands, then the most expensive spells); a whole hand only
 * when it's small. Sacrifice: the least valuable ("may": nothing). Keep: the
 * most valuable of our own, the least valuable of an opponent's.
 */
function chooseCardsToPick(s: GameState, me: PlayerId, legal: Action[]): Action {
  const p = s.pending;
  if (p.kind !== 'chooseCards') return legal[0]!;
  const pick = (cards: InstanceId[]): Action => ({ type: 'ChooseCards', player: me, cards });
  if (p.allOrNothing) return pick(p.cards.length <= 2 ? [...p.cards] : []);
  if (p.purpose === 'discard') {
    if (p.max === 0) return pick([]);
    // "Any number": only cards we'd rather not have (surplus lands).
    const n = p.min === 0 ? Math.min(p.max, Math.max(0, p.cards.filter((id) => isLandCard(s, id)).length - 2)) : p.min;
    if (n === 0) return pick([]);
    const ranked = (chooseBottom(s, me, n) as Extract<Action, { type: 'BottomCards' }>).cards;
    return pick(ranked.filter((id) => p.cards.includes(id)).slice(0, n));
  }
  const byValue = [...p.cards].sort((a, b) => value(s, s.cards[a]!) - value(s, s.cards[b]!));
  if (p.purpose === 'sacrifice') return pick(byValue.slice(0, p.min));
  // Destroying an opponent's permanent of our choice: their best.
  if (p.purpose === 'destroy') return pick([...byValue].reverse().slice(0, p.max));
  // Putting lands onto the battlefield for free: always.
  if (p.purpose === 'battlefield') return pick(byValue.reverse().slice(0, p.max));
  // Keep: our best, or an opponent's worst when we choose for them. Respect "one of each type".
  const ours = s.cards[p.cards[0]!]!.controller === me;
  const order = ours ? byValue.reverse() : byValue;
  const kept: InstanceId[] = [];
  for (const id of order) {
    if (kept.length === p.max) break;
    if (!choiceProblem(s, p, [...kept, id])) kept.push(id);
  }
  return pick(kept);
}

/** The basic AI. `seed` is accepted for symmetry with other bots; this one is deterministic. */
export function basicAi(_seed = 0): Bot {
  const memory: Memory = { grudge: {} };
  const remembered = new Set<string>();
  return (s, legal) => {
    const pending = s.pending;
    // Remember who attacked us (once per attack), to pay them back later.
    for (const a of s.combat?.attacks ?? []) {
      const key = `${s.turnNumber}:${a.attacker}`;
      const attacker = s.cards[a.attacker];
      if (pending.kind === 'gameOver' || !attacker || remembered.has(key) || a.defender !== pending.player) continue;
      remembered.add(key);
      memory.grudge[attacker.controller] = (memory.grudge[attacker.controller] ?? 0) + hitFor(s, attacker);
    }
    if (pending.kind === 'declareAttackers') {
      const me = pending.player;
      let attacks = chooseAttacks(s, me, memory);
      // Propaganda and friends: tap for the tax first, or leave out the attacks it can't pay for.
      const tax = attackTax(s, attacks);
      if (tax > 0) {
        const taps = planTaps(s, me, { generic: tax });
        if (taps && taps.length > 0) return tapActions(me, taps)[0]!;
        if (!taps) attacks = attacks.filter((a) => attackTaxFor(s, a.defender) === 0);
      }
      return { type: 'DeclareAttackers', player: me, attacks };
    }
    if (pending.kind === 'declareBlockers') {
      const blocks = chooseBlocks(s, pending.player);
      // Fall back to a legal declaration if a "must be blocked" requirement isn't met.
      if (!blockProblem(s, pending.player, blocks)) return { type: 'DeclareBlockers', player: pending.player, blocks };
      return legal.at(-1)!;
    }
    if (pending.kind === 'chooseTargets') return chooseTriggerTargets(s, pending.player, legal);
    if (pending.kind === 'decide') return decideOptional(s, pending.player, legal);
    if (pending.kind === 'surveil') return chooseSurveil(s, pending.player, pending.card);
    if (pending.kind === 'chooseLegend') return chooseLegendToKeep(s, pending.player, pending.cards);
    // A commander is almost always worth having back in the command zone.
    if (pending.kind === 'commanderZone') return { type: 'CommanderZone', player: pending.player, toCommand: true };
    if (pending.kind === 'mulligan') return chooseMulligan(s, pending.player, pending.taken, legal);
    if (pending.kind === 'bottomCards') return chooseBottom(s, pending.player, pending.count);
    if (pending.kind === 'chooseCards') return chooseCardsToPick(s, pending.player, legal);
    if (pending.kind !== 'priority') return legal[0]!;
    const me = pending.player;

    // Prefer a land that enters untapped when we could use the mana this turn.
    // (Snarls: reveal so they enter untapped.)
    const lands = legal.filter((a): a is Extract<Action, { type: 'PlayLand' }> => a.type === 'PlayLand' && a.reveal !== false);
    if (lands.length > 0) {
      const untapped = lands.find((a) => !s.cardDefs[s.cards[a.card]!.defId]!.entersTapped);
      return untapped ?? lands[0]!;
    }
    return bestPlay(s, me, legal) ?? { type: 'PassPriority', player: me };
  };
}
