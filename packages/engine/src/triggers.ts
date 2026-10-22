// Triggered abilities (rule 603). After each action the engine scans the
// events it produced for anything a triggered ability is waiting for, queues
// those abilities, and puts them on the stack the next time a player would
// receive priority: the active player's first, then the others' in turn order,
// so the last player's resolve first (rule 603.3b).

import { checkTargets, choosingEffects, targetOptions } from './stack.ts';
import { matchesObject } from './filters.ts';
import { aliveFromActive, battlefield, defOf, newId, reject, type Ctx } from './state.ts';
import { givePriority } from './turn.ts';
import type {
  AbilityItem,
  CardInstance,
  GameEvent,
  GameState,
  InstanceId,
  ObjectFilter,
  PlayerId,
  QueuedTrigger,
  Target,
  TriggerEvent,
  TriggerSpec,
} from './types.ts';

/** One thing that happened that an ability might be waiting for. */
interface Occurrence {
  when: TriggerEvent;
  /** Index of the event, to tell which permanents were on the battlefield at the time. */
  at: number;
  subject?: InstanceId;
  subjectController?: PlayerId;
  /** BeginCombat and Upkeep: whose turn it is. */
  activePlayer?: PlayerId;
  /** Attacks: the player being attacked. */
  defender?: PlayerId;
  /** SpellCast: mana spent to cast it. */
  manaSpent?: number;
  /** Dies: the Equipment attached to it as it left the battlefield. */
  equippedBy?: InstanceId[];
  /** EntersBattlefield: the zone it came from. */
  from?: string;
}

function occurrencesIn(s: GameState, events: readonly GameEvent[]): Occurrence[] {
  const out: Occurrence[] = [];
  events.forEach((e, at) => {
    switch (e.type) {
      case 'CardMoved':
        if (!e.card) break;
        if (e.to === 'battlefield') {
          out.push({ when: 'EntersBattlefield', at, subject: e.card, subjectController: s.cards[e.card]!.controller, from: e.from });
        } else if (e.from === 'battlefield' && e.to === 'graveyard') {
          out.push({
            when: 'Dies',
            at,
            subject: e.card,
            subjectController: e.controller ?? e.owner,
            ...(e.equippedBy ? { equippedBy: e.equippedBy } : {}),
          });
        }
        break;
      case 'TokenCreated':
        out.push({ when: 'EntersBattlefield', at, subject: e.card, subjectController: e.controller });
        break;
      case 'AttackDeclared': {
        const subjectController = s.cards[e.attacker]!.controller;
        out.push({ when: 'Attacks', at, subject: e.attacker, subjectController, defender: e.defendingPlayer });
        break;
      }
      case 'SpellCast':
        out.push({ when: 'SpellCast', at, subject: e.card, subjectController: e.player, manaSpent: e.manaSpent });
        break;
      case 'DamageDealt':
        if (e.combat && e.target.kind === 'player') {
          out.push({ when: 'CombatDamageToPlayer', at, subject: e.source, subjectController: s.cards[e.source]!.controller });
        }
        break;
      case 'StepChanged':
        if (e.step === 'beginCombat') out.push({ when: 'BeginCombat', at, activePlayer: e.activePlayer });
        if (e.step === 'upkeep') out.push({ when: 'Upkeep', at, activePlayer: e.activePlayer });
        if (e.step === 'end') out.push({ when: 'EndStep', at, activePlayer: e.activePlayer });
        break;
    }
  });
  return out;
}

function matchesFilter(
  s: GameState,
  filter: ObjectFilter | undefined,
  source: InstanceId,
  controller: PlayerId,
  o: Occurrence,
): boolean {
  if (o.subject === undefined) return false;
  if (!filter) return o.subject === source;
  if (filter.equippedBySource && o.when === 'Dies') {
    // "Whenever equipped creature dies": look back at what was attached when it died (rule 603.10a).
    if (!o.equippedBy?.includes(source)) return false;
    const { equippedBySource: _, ...rest } = filter;
    return matchesObject(s, rest, s.cards[o.subject]!, { controller, source }, o.subjectController);
  }
  return matchesObject(s, filter, s.cards[o.subject]!, { controller, source }, o.subjectController);
}

function triggersOn(spec: TriggerSpec, o: Occurrence, s: GameState, source: InstanceId, controller: PlayerId): boolean {
  if (spec.when !== o.when) return false;
  if (o.when === 'BeginCombat' || o.when === 'Upkeep' || o.when === 'EndStep') {
    if (spec.turn === 'Each') return true;
    return spec.turn === 'Opponents' ? o.activePlayer !== controller : o.activePlayer === controller;
  }
  // "Entered from a graveyard or was cast from a graveyard".
  if (spec.fromGraveyard && o.subject && o.from !== 'graveyard' && !s.cards[o.subject]!.castFromGraveyard) return false;
  // Intervening "if" (rule 603.4).
  if (spec.ifManaSpentAtLeast !== undefined && (o.manaSpent ?? 0) < spec.ifManaSpentAtLeast) return false;
  return matchesFilter(s, spec.what, source, controller, o);
}

/** Where a card was in this batch of events: when it entered and left the battlefield, and who controlled it. */
interface Movement {
  entered?: number;
  left?: number;
  controller?: PlayerId;
}

/**
 * Finds the abilities that `events` trigger and adds them to the queue.
 *
 * Which permanents "see" an event: those on the battlefield when it happened.
 * Abilities that trigger on dying look back in time (rule 603.10a), so a
 * permanent that left the battlefield anywhere in the same batch still sees
 * a death, which covers creatures that die at the same time.
 */
export function detectTriggers(ctx: Ctx, events: readonly GameEvent[]): void {
  const s = ctx.s;
  const occurrences = occurrencesIn(s, events);
  if (occurrences.length === 0) return;

  const moved = new Map<InstanceId, Movement>();
  events.forEach((e, at) => {
    if (e.type === 'TokenCreated') {
      moved.set(e.card, { ...moved.get(e.card), entered: at });
      return;
    }
    if (e.type !== 'CardMoved' || !e.card) return;
    const m = moved.get(e.card) ?? {};
    if (e.to === 'battlefield') m.entered = at;
    if (e.from === 'battlefield') {
      m.left = at;
      m.controller = e.controller;
    }
    moved.set(e.card, m);
  });

  const withTriggers = (c: CardInstance) => (defOf(s, c).triggers?.length ?? 0) > 0;
  const onBattlefield = battlefield(s).filter(withTriggers);
  const leftBattlefield = [...moved]
    .filter(([id, m]) => m.left !== undefined && s.cards[id]!.zone !== 'battlefield')
    .map(([id]) => s.cards[id]!)
    .filter(withTriggers);
  const inGraveyards = s.turnOrder.flatMap((pid) => s.players[pid]!.graveyard.map((id) => s.cards[id]!)).filter(withTriggers);

  const found: QueuedTrigger[] = [];
  const batched = new Set<string>();
  const consider = (c: CardInstance, controller: PlayerId, zone: 'battlefield' | 'graveyard', o: Occurrence) => {
    if (s.players[controller]!.eliminated) return;
    defOf(s, c).triggers!.forEach((spec, ability) => {
      if ((spec.zone ?? 'battlefield') !== zone || !triggersOn(spec, o, s, c.id, controller)) return;
      const key = `${c.id}#${ability}`;
      if (spec.oneOrMore) {
        if (batched.has(key)) return;
        batched.add(key);
      }
      if (spec.oncePerTurn) {
        if (s.triggeredThisTurn.includes(key)) return;
        s.triggeredThisTurn.push(key);
      }
      found.push({
        source: c.id,
        ability,
        controller,
        sourceZone: c.zone,
        ...(o.defender ? { defender: o.defender } : {}),
        ...(o.subject ? { subject: o.subject } : {}),
      });
    });
  };

  for (const o of occurrences) {
    for (const c of onBattlefield) {
      // Skip permanents that entered after this happened.
      const m = moved.get(c.id);
      if (m?.entered !== undefined && m.entered > o.at) continue;
      consider(c, c.controller, 'battlefield', o);
    }
    for (const c of leftBattlefield) {
      const m = moved.get(c.id)!;
      const sawIt = o.when === 'Dies' || (m.left! >= o.at && (m.entered === undefined || m.entered <= o.at));
      if (sawIt) consider(c, m.controller ?? c.owner, 'battlefield', o);
    }
    for (const c of inGraveyards) consider(c, c.owner, 'graveyard', o);
  }

  // APNAP order. Each player's own triggers keep the order they were found in.
  const order = aliveFromActive(s);
  const rank = (t: QueuedTrigger) => order.indexOf(t.controller);
  s.triggerQueue.push(...found.filter((t) => rank(t) >= 0).sort((a, b) => rank(a) - rank(b)));
}

function specOf(s: GameState, t: QueuedTrigger): TriggerSpec {
  return defOf(s, s.cards[t.source]!).triggers![t.ability]!;
}

function pushAbility(ctx: Ctx, t: QueuedTrigger, targets: Target[]): void {
  const s = ctx.s;
  const item: AbilityItem = {
    id: newId(s, 's'),
    kind: 'ability',
    source: t.source,
    from: 'trigger',
    ability: t.ability,
    sourceZone: t.sourceZone,
    controller: t.controller,
    targets,
    ...(t.defender ? { defender: t.defender } : {}),
    ...(t.subject ? { subject: t.subject } : {}),
  };
  s.stack.push(item);
  ctx.ev.push({ type: 'AbilityTriggered', item: item.id, card: t.source, ability: t.ability, controller: t.controller, targets });
  ctx.ev.push({ type: 'StackItemAdded', item: item.id, card: t.source });
}

/** Legal choices for each target of a queued trigger, in effect order. */
export function triggerTargetOptions(s: GameState, t: QueuedTrigger): Target[][] {
  return choosingEffects(specOf(s, t).effects).map((e) => targetOptions(s, e, t.controller, t.source));
}

/**
 * Puts queued triggers on the stack, then gives `then` priority. Targets are
 * picked automatically when there is only one choice; otherwise this stops
 * and asks the trigger's controller. An ability with no legal target is
 * removed (rule 603.3d).
 */
export function placeTriggers(ctx: Ctx, then: PlayerId): void {
  const s = ctx.s;
  let placed = false;
  while (s.triggerQueue.length > 0) {
    const t = s.triggerQueue[0]!;
    const options = triggerTargetOptions(s, t);
    if (options.some((o) => o.length === 0)) {
      s.triggerQueue.shift();
      continue;
    }
    if (options.some((o) => o.length > 1)) {
      s.pending = { kind: 'chooseTargets', player: t.controller, then };
      return;
    }
    s.triggerQueue.shift();
    pushAbility(ctx, t, options.map((o) => o[0]!));
    placed = true;
  }
  if (placed) givePriority(ctx, then);
}

/** The ChooseTargets action: targets for the first queued trigger. Placement continues afterwards. */
export function chooseTriggerTargets(ctx: Ctx, playerId: PlayerId, targets: Target[]): void {
  const s = ctx.s;
  const pending = s.pending;
  if (pending.kind !== 'chooseTargets' || pending.player !== playerId) reject('You are not choosing targets right now.');
  const t = s.triggerQueue[0]!;
  checkTargets(s, specOf(s, t).effects, targets, playerId, t.source);
  s.triggerQueue.shift();
  pushAbility(ctx, t, targets);
  givePriority(ctx, pending.then);
}
