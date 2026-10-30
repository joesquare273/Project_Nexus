// Triggered abilities (rule 603). After each action the engine scans the
// events it produced for anything a triggered ability is waiting for, queues
// those abilities, and puts them on the stack the next time a player would
// receive priority: the active player's first, then the others' in turn order,
// so the last player's resolve first (rule 603.3b).

import { checkTargets, choosingEffects, queuedTriggerSpec, targetOptions } from './stack.ts';
import { randomInt } from './rng.ts';
import { characteristics, countOf } from './characteristics.ts';
import { matchesObject } from './filters.ts';
import { aliveFromActive, battlefield, defOf, newId, reject, type Ctx } from './state.ts';
import { givePriority } from './turn.ts';
import type {
  AbilityItem,
  CardInstance,
  GameEvent,
  CardType,
  DamageSourceSnapshot,
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
  lastTypes?: CardType[];
  damageSource?: DamageSourceSnapshot;
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
  /** CountersAdded: who put them there. */
  by?: PlayerId;
  /** Draws: who drew, and how many cards they've drawn this turn counting this one. */
  drawer?: PlayerId;
  drawNumber?: number;
  /** SpellCast: how many spells its caster had cast this turn, counting it. */
  spellNumber?: number;
  /** YouAttack: how many creatures attacked. */
  attackers?: number;
  /** CombatDamageToPlayer: how much; SpellCast: the mana spent to cast it. */
  amount?: number;
  counter?: string;
  /** Chapter: the lore counters before and after. */
  loreFrom?: number;
  loreTo?: number;
}

function occurrencesIn(s: GameState, events: readonly GameEvent[]): Occurrence[] {
  const out: Occurrence[] = [];
  events.forEach((e, at) => {
    switch (e.type) {
      case 'CoinFlipped':
        if(e.won) out.push({when:'CoinFlipWon',at,subjectController:e.player});
        break;
      case 'AttackersUnblocked':
        out.push({ when: 'AttackersUnblocked', at, subject: e.attackers[0], subjectController: e.player, defender: e.defender });
        break;
      case 'AbilityTargeted':
        out.push({ when: 'AbilityTargetsCreature', at, subject: e.card, subjectController: e.controller });
        break;
      case 'CardMoved':
        if (!e.card) break;
        if (e.to === 'battlefield') {
          out.push({ when: 'EntersBattlefield', at, subject: e.card, subjectController: s.cards[e.card]!.controller, from: e.from });
        } else if (e.from === 'battlefield' && e.to === 'graveyard') {
          out.push({
            when: 'Dies',
            lastTypes: e.lastTypes,
            at,
            subject: e.card,
            subjectController: e.controller ?? e.owner,
            ...(e.equippedBy ? { equippedBy: e.equippedBy } : {}),
          });
        }
        if (e.from === 'battlefield') out.push({ when: 'LeavesBattlefield', at, subject: e.card, subjectController: e.controller ?? e.owner });
        if (e.sacrificed) out.push({ when: 'Sacrificed', at, subject: e.card, subjectController: e.controller ?? e.owner });
        if (e.from === 'graveyard') out.push({ when: 'LeavesGraveyard', at, subject: e.card, subjectController: e.owner });
        break;
      case 'TokenCreated':
        out.push({ when: 'EntersBattlefield', at, subject: e.card, subjectController: e.controller });
        out.push({ when: 'TokensCreated', at, subject: e.card, subjectController: e.controller });
        break;
      case 'CardDrawn':
        out.push({ when: 'Draws', at, drawer: e.player, ...(e.n !== undefined ? { drawNumber: e.n } : {}) });
        break;
      case 'AbilityActivated':
        out.push({ when: 'AbilityActivated', at, subject: e.card, subjectController: e.controller });
        break;
      case 'ManaAdded':
        // A mana ability was activated (one occurrence per source in a batch).
        if (!out.some((o) => o.when === 'AbilityActivated' && o.subject === e.source)) {
          out.push({ when: 'AbilityActivated', at, subject: e.source, subjectController: e.player });
        }
        break;
      case 'LifeChanged':
        if (e.to < e.from) out.push({ when: 'OpponentLosesLife', at, subjectController: e.player });
        break;
      case 'AttackDeclared': {
        const subjectController = s.cards[e.attacker]!.controller;
        out.push({ when: 'Attacks', at, subject: e.attacker, subjectController, defender: e.defendingPlayer });
        break;
      }
      case 'CountersAdded':
        if (e.counter === 'lore' && e.total !== undefined) {
          out.push({ when: 'Chapter', at, subject: e.card, subjectController: s.cards[e.card]!.controller, loreFrom: e.total - e.amount, loreTo: e.total });
        }
        out.push({
          when: 'CountersAdded',
          at,
          subject: e.card,
          subjectController: s.cards[e.card]!.controller,
          ...(e.by ? { by: e.by } : {}),
          ...(e.counter ? { counter: e.counter } : {}),
        });
        break;
      case 'CardsUntapped':
        for (const card of e.cards) out.push({ when: 'BecomesUntapped', at, subject: card, subjectController: s.cards[card]!.controller });
        break;
      case 'LandPlayed':
        out.push({ when: 'LandPlayed', at, subject: e.card, subjectController: e.player, from: e.from });
        break;
      case 'SpellCast':
        out.push({
          when: 'SpellCast',
          from: e.castFrom,
          at,
          subject: e.card,
          subjectController: e.player,
          manaSpent: e.manaSpent,
          amount: e.manaSpent,
          spellNumber: s.players[e.player]!.spellsCastThisTurn ?? 0,
        });
        break;
      case 'DamageDealt':
        if (e.combat) {
          out.push({ when: 'CombatDamage', at, subject: e.source, subjectController: e.sourceController ?? s.cards[e.source]!.controller, amount: e.amount });
        }
        if (e.combat && e.target.kind === 'player') {
          out.push({
            when: 'CombatDamageToPlayer',
            damageSource: e.sourceSnapshot,
            lastTypes: e.sourceSnapshot?.types,
            at,
            subject: e.source,
            subjectController: e.sourceController ?? s.cards[e.source]!.controller,
            defender: e.target.player,
            amount: e.amount,
          });
        }
        break;
      case 'StepChanged':
        if (e.step === 'main2') out.push({ when: 'SecondMain', at, activePlayer: e.activePlayer });
        if (e.step === 'beginCombat') out.push({ when: 'BeginCombat', at, activePlayer: e.activePlayer });
        if (e.step === 'upkeep') out.push({ when: 'Upkeep', at, activePlayer: e.activePlayer });
        if (e.step === 'end') out.push({ when: 'EndStep', at, activePlayer: e.activePlayer });
        break;
    }
  });
  // "Whenever you attack with N or more creatures": one occurrence per attacking player.
  const attackers = new Map<PlayerId, { at: number; n: number }>();
  events.forEach((e, at) => {
    if (e.type !== 'AttackDeclared') return;
    const pid = s.cards[e.attacker]!.controller;
    const seen = attackers.get(pid);
    attackers.set(pid, { at: seen?.at ?? at, n: (seen?.n ?? 0) + 1 });
  });
  for (const [pid, { at, n }] of attackers) out.push({ when: 'YouAttack', at, subjectController: pid, attackers: n });
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
  const subject=o.damageSource?.card ?? s.cards[o.subject]!;
  const viewpoint={controller,source,...(o.damageSource ? {power:o.damageSource.power,toughness:o.damageSource.toughness} : {})};
  const definition=o.lastTypes ? {...(subject.lastDefinition??defOf(s,subject)),types:o.lastTypes} : undefined;
  if (filter.equippedBySource && o.when === 'Dies') {
    // "Whenever equipped creature dies": look back at what was attached when it died (rule 603.10a).
    if (!o.equippedBy?.includes(source)) return false;
    const { equippedBySource: _, ...rest } = filter;
    return matchesObject(s, rest, subject, viewpoint, o.subjectController, definition);
  }
  return matchesObject(s, filter, subject, viewpoint, o.subjectController, definition);
}

/** Intervening "if" conditions about the game rather than the event (rule 603.4). */
function conditionsHold(spec: TriggerSpec, s: GameState, source: InstanceId, controller: PlayerId): boolean {
  const p = s.players[controller]!;
  if (spec.ifYouGainedLifeThisTurn && !((p.lifeGainedThisTurn ?? 0) > 0)) return false;
  if (spec.ifCardLeftYourGraveyardThisTurn && p.cardLeftGraveyardTurn !== s.turnNumber) return false;
  if (spec.ifYouControl) {
    const { filter, atLeast = 1 } = spec.ifYouControl;
    const n = battlefield(s).filter((c) => c.controller === controller && matchesObject(s, filter, c, { controller, source })).length;
    if (n < atLeast) return false;
  }
  if (spec.ifCount && countOf(s, spec.ifCount.count, controller, source) < spec.ifCount.atLeast) return false;
  return true;
}

function triggersOn(spec: TriggerSpec, o: Occurrence, s: GameState, source: InstanceId, controller: PlayerId): boolean {
  if (spec.when !== o.when) return false;
  if (spec.fromZone && spec.fromZone !== o.from) return false;
  if (!conditionsHold(spec, s, source, controller)) return false;
  if (o.when === 'CoinFlipWon') return o.subjectController === controller;
  if (o.when === 'AttackersUnblocked') return o.defender === controller && o.subjectController !== controller;
  // A chapter triggers when a lore counter brings its Saga to that chapter's number (rule 714.2b).
  if (o.when === 'Chapter') {
    return o.subject === source && (spec.chapters ?? []).some((n) => n > (o.loreFrom ?? 0) && n <= (o.loreTo ?? 0));
  }
  // "Whenever one or more opponents lose life".
  if (o.when === 'OpponentLosesLife') return o.subjectController !== undefined && o.subjectController !== controller;
  // Blitz: "When this creature dies, draw a card" only comes with the blitz cost.
  if (spec.ifBlitzed && !s.cards[source]!.blitzed) return false;
  if (spec.ifEvoked && !s.cards[source]!.evoked) return false;
  if (o.when === 'YouAttack') return o.subjectController === controller && (o.attackers ?? 0) >= (spec.attackersAtLeast ?? 1);
  if (o.when === 'Draws') {
    // "Whenever you draw a card", "whenever an opponent draws a card, if it isn't that player's turn".
    if (spec.drawer === 'You' && o.drawer !== controller) return false;
    if (spec.drawer === 'Opponent' && o.drawer === controller) return false;
    if (spec.nthDrawThisTurn !== undefined && o.drawNumber !== spec.nthDrawThisTurn) return false;
    return !spec.notOnDrawersTurn || o.drawer !== s.activePlayer;
  }
  if (o.when === 'BeginCombat' || o.when === 'Upkeep' || o.when === 'EndStep' || o.when === 'SecondMain') {
    if (spec.ifSourceGotCountersThisTurn && s.cards[source]!.countersTurn !== s.turnNumber) return false;
    if (spec.ifYouPutCounterOnCreatureThisTurn && s.players[controller]!.counterOnCreatureTurn !== s.turnNumber) return false;
    // "If a player lost 4 or more life this turn" (an intervening "if", rule 603.4).
    if (
      spec.ifPlayerLostLifeThisTurn !== undefined &&
      !s.turnOrder.some((pid) => (s.players[pid]!.lifeLostThisTurn ?? 0) >= spec.ifPlayerLostLifeThisTurn!)
    ) {
      return false;
    }
    if (spec.turn === 'Each') return true;
    return spec.turn === 'Opponents' ? o.activePlayer !== controller : o.activePlayer === controller;
  }
  // "Entered from a graveyard or was cast from a graveyard".
  if (spec.fromGraveyard && o.subject && o.from !== 'graveyard' && !s.cards[o.subject]!.castFromGraveyard) return false;
  if (spec.byYou && o.by !== controller) return false;
  if (spec.attacksYou && o.defender !== controller) return false;
  if (spec.plusOneCountersOnly && o.counter !== undefined) return false;
  // Evolve: the entering creature has greater power or toughness than this one.
  if (spec.evolve) {
    const me = s.cards[source]!;
    const them = o.subject ? s.cards[o.subject] : undefined;
    if (!them || them.zone !== 'battlefield' || me.zone !== 'battlefield') return false;
    const a = characteristics(s, them);
    const b = characteristics(s, me);
    if (!(a.power > b.power || a.toughness > b.toughness)) return false;
  }
  if (spec.ifSourceGotCountersThisTurn && s.cards[source]!.countersTurn !== s.turnNumber) return false;
  if (spec.ifSubjectControllerHasMoreLands && o.subjectController) {
    const lands = (pid: PlayerId) => battlefield(s).filter((c) => c.controller === pid && defOf(s,c).types.includes('land')).length;
    if (lands(o.subjectController) <= lands(controller)) return false;
  }
  if (spec.nthSpellThisTurn !== undefined && o.spellNumber !== spec.nthSpellThisTurn) return false;
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
    .filter(c=>(c.lastDefinition??defOf(s,c)).triggers?.length);
  const inGraveyards = s.turnOrder.flatMap((pid) => s.players[pid]!.graveyard.map((id) => s.cards[id]!)).filter(withTriggers);

  const found: QueuedTrigger[] = [];
  for (const e of events) {
    if (e.type === 'StepChanged' && e.step === 'end' && s.monarch === e.activePlayer) {
      found.push({ source: '@monarch', sourceZone: 'command', rule: 'monarch', ability: -1, controller: e.activePlayer,
        spec: { when: 'EndStep', effects: [{ effect: 'DrawCards', target: 'You', amount: 1 }] } });
    }
    if (e.type === 'DamageDealt' && e.damagedMonarch) {
      found.push({ source: '@monarch', sourceZone: 'command', rule: 'monarch', ability: -1, controller: e.damagedMonarch,
        subject: e.source, subjectController: e.sourceController, subjectObject: e.sourceObject,
        spec: { when: 'CombatDamageToPlayer', effects: [{ effect: 'BecomeMonarch', target: 'SubjectController' }] } });
    }
    if (e.type === 'SpellCast') {
      for (const unit of e.scryMana ?? []) {
        found.push({ source: unit.source, sourceObject: unit.sourceObject, controller: e.player,
          sourceZone: 'battlefield', ability: -1,
          spec: { when: 'SpellCast', what: { controller: 'You', types: ['creature'] }, effects: [{ effect: 'Scry', target: 'You', amount: 1 }] },
          subject: e.card });
      }
    }
    if (e.type !== 'DamageDealt' || !e.combat || e.target.kind !== 'player') continue;
    for (const spec of e.grantedTriggers ?? []) {
      found.push({ source: e.source, sourceObject: e.sourceObject, controller: e.sourceController!,
        sourceZone: 'battlefield', ability: -1, spec, subject: e.source, defender: e.target.player,
        amount: e.amount, lastSourceCounterKinds: e.sourceCounterKinds });
    }
  }
  const batched = new Set<string>();
  const consider = (c: CardInstance, controller: PlayerId, zone: 'battlefield' | 'graveyard', o: Occurrence) => {
    if (s.players[controller]!.eliminated) return;
    const definition = zone === 'battlefield' && c.zone !== 'battlefield' ? c.lastDefinition ?? defOf(s,c) : defOf(s,c);
    definition.triggers!.forEach((original, ability) => {
      let spec = original;
      if ((spec.zone ?? 'battlefield') !== zone || !triggersOn(spec, o, s, c.id, controller)) return;
      const key = `${c.id}#${ability}`;
      if (spec.oneOrMore) {
        const batchKey=o.when==='CombatDamageToPlayer' ? key+':'+o.defender : key;
        if (batched.has(batchKey)) return;
        batched.add(batchKey);
      }
      if (spec.oncePerTurn) {
        if (s.triggeredThisTurn.includes(key)) return;
        s.triggeredThisTurn.push(key);
      }
      // "Do this only once each turn": marked when the cost is paid (see decide).
      if (spec.oncePerTurnWhenPaid && s.triggeredThisTurn.includes(key)) return;
      if (spec.supportX) {
        const slots = Math.min(c.xPaid ?? 0, battlefield(s).filter(x => x.id !== c.id && defOf(s,x).types.includes('creature')).length);
        spec = { ...spec, supportX: false, effects: Array.from({ length: slots }, () => ({ effect: 'AddCounters', amount: 1, target: 'TargetCreature', filter: { other: true }, upTo: true, group: 'support' })) };
      }
      found.push({
        spec: structuredClone(spec),
        source: c.id,
        sourceObject: c.zoneChanges ?? 0,
        ...(o.subjectController ? { subjectController: o.subjectController } : {}),
        ability,
        controller,
        sourceZone: c.zone,
        ...(o.defender ? { defender: o.defender } : {}),
        ...(o.subject ? { subject: o.subject } : {}),
        ...(o.amount !== undefined ? { amount: o.amount } : {}),
        // "Choose one at random" is decided as it triggers.
        ...(spec.randomModes ? { mode: randomInt(s, spec.randomModes.length) } : {}),
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
      const lookBack = o.when === 'Dies' || o.when === 'LeavesBattlefield';
      const sawIt = lookBack || (m.left! >= o.at && (m.entered === undefined || m.entered <= o.at));
      if (sawIt) consider(c, m.controller ?? c.owner, 'battlefield', o);
    }
    for (const c of inGraveyards) consider(c, c.owner, 'graveyard', o);
    // Delayed triggers work even after their source has left (rule 603.7).
    for (const d of s.delayedTriggers ?? []) {
      if (d.turn !== s.turnNumber || s.players[d.controller]!.eliminated || !triggersOn(d.spec, o, s, d.source, d.controller)) continue;
      found.push({
        spec: structuredClone(d.spec),
        source: d.source,
        sourceObject: d.sourceObject,
        ability: -1,
        controller: d.controller,
        sourceZone: 'battlefield',
        ...(o.subjectController ? { subjectController: o.subjectController } : {}),
        ...(o.defender ? { defender: o.defender } : {}),
        ...(o.subject ? { subject: o.subject } : {}),
        ...(o.amount !== undefined ? { amount: o.amount } : {}),
      });
    }
  }

  // "... triggers an additional time" (Cloud, Midgar Mercenary; Traveling Chocobo): one more copy per applicable ability.
  const doubled = found.flatMap((t) => [t, ...Array.from({ length: extraTriggerCount(s, t) }, () => structuredClone(t))]);
  found.length = 0;
  found.push(...doubled);
  // APNAP order. Each player's own triggers keep the order they were found in.
  const order = aliveFromActive(s);
  const rank = (t: QueuedTrigger) => order.indexOf(t.controller);
  s.triggerQueue.push(...found.filter((t) => rank(t) >= 0).sort((a, b) => rank(a) - rank(b)));
}

/** How many extra times a found trigger triggers, from "triggers an additional time" abilities its controller has. */
function extraTriggerCount(s: GameState, t: QueuedTrigger): number {
  if (t.rule || t.ability < 0) return 0;
  const source = s.cards[t.source];
  const spec = t.spec;
  let extra = 0;
  for (const p of battlefield(s)) {
    if (p.phasedOut || p.controller !== t.controller) continue;
    for (const st of defOf(s, p).statics ?? []) {
      const more = st.extraTriggers;
      if (!more) continue;
      if (more.selfAndEquipment) {
        const equipped = battlefield(s).some((e) => e.attachedTo === p.id && defOf(s, e).subtypes?.includes('Equipment'));
        if (equipped && (t.source === p.id || source?.attachedTo === p.id)) extra++;
      }
      if (more.entering && spec?.when === 'EntersBattlefield' && t.subject) {
        const subject = s.cards[t.subject];
        if (subject && source?.controller === p.controller && matchesObject(s, more.entering, subject, { controller: p.controller, source: p.id })) extra++;
      }
    }
  }
  return extra;
}

function specOf(s: GameState, t: QueuedTrigger): TriggerSpec {
  return queuedTriggerSpec(s, t);
}

function pushAbility(ctx: Ctx, t: QueuedTrigger, targets: Target[]): void {
  const s = ctx.s;
  const item: AbilityItem = {
    id: newId(s, 's'),
    kind: 'ability',
    source: t.source,
    sourceObject: t.sourceObject,
    ...(t.subjectController ? { subjectController: t.subjectController } : {}),
    from: 'trigger',
    ...(t.rule ? { rule: t.rule, subjectObject: t.subjectObject } : {}),
    ...(t.spec ? { spec: t.spec } : {}),
    ...(t.lastSourceCounterKinds !== undefined ? { lastSourceCounterKinds: t.lastSourceCounterKinds } : {}),
    ability: t.ability,
    sourceZone: t.sourceZone,
    controller: t.controller,
    targets,
    targetObjects: targets.map(t=>t.kind==='card' ? s.cards[t.card]?.zoneChanges??0 : null),
    ...(t.modes ? { modes: [...t.modes] } : {}),
    ...(t.defender ? { defender: t.defender } : {}),
    ...(t.subject ? { subject: t.subject } : {}),
    ...(t.amount !== undefined ? { amount: t.amount } : {}),
    ...(t.mode !== undefined ? { mode: t.mode } : {}),
  };
  s.stack.push(item);
  ctx.ev.push({ type: 'AbilityTriggered', item: item.id, card: t.source, ability: t.ability, controller: t.controller, targets });
  ctx.ev.push({ type: 'StackItemAdded', item: item.id, card: t.source });
}

/** Legal choices for each target of a queued trigger, in effect order. */
export function triggerTargetOptions(s: GameState, t: QueuedTrigger): Target[][] {
  const context = { ...(t.defender ? { defender: t.defender } : {}), ...(t.subject ? { subject: t.subject } : {}), triggered: true };
  return choosingEffects(specOf(s, t).effects).map((e) => targetOptions(s, e, t.controller, t.source, context));
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
    if (specOf(s, t).modes && !t.modes) {
      if (triggerModeOptions(s, t).length === 0) {
        s.triggerQueue.shift();
        continue;
      }
      s.pending = { kind: 'chooseModes', player: t.controller, then };
      return;
    }
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

/** The legal single modes and, when allowed, both modes of a queued trigger. */
export function triggerModeOptions(s: GameState, t: QueuedTrigger): number[][] {
  const spec = specOf(s, t);
  if (!spec.modes) return [];
  const choices = spec.modes.map((_, i) => [i]);
  if (spec.bothIfCommander && battlefield(s).some((c) => c.controller === t.controller && c.isCommander)) choices.push(spec.modes.map((_, i) => i));
  return choices.filter((modes) => triggerTargetOptions(s, { ...t, modes }).every((targets) => targets.length > 0));
}

/** Modes are chosen on placement, before targets (603.3c). */
export function chooseTriggerModes(ctx: Ctx, playerId: PlayerId, modes: number[]): void {
  const s = ctx.s;
  const pending = s.pending;
  if (pending.kind !== 'chooseModes' || pending.player !== playerId) reject('You are not choosing modes right now.');
  const t = s.triggerQueue[0]!;
  const sorted = [...modes].sort((a, b) => a - b);
  if (!triggerModeOptions(s, t).some((option) => JSON.stringify(option) === JSON.stringify(sorted))) reject('Choose a legal set of modes.');
  t.modes = sorted;
  givePriority(ctx, pending.then);
  placeTriggers(ctx, pending.then);
}

/** Targets for the first queued trigger. Placement continues afterwards. */
export function chooseTriggerTargets(ctx: Ctx, playerId: PlayerId, targets: Target[]): void {
  const s = ctx.s;
  const pending = s.pending;
  if (pending.kind !== 'chooseTargets' || pending.player !== playerId) reject('You are not choosing targets right now.');
  const t = s.triggerQueue[0]!;
  checkTargets(s, specOf(s, t).effects, targets, playerId, t.source, {
    ...(t.defender ? { defender: t.defender } : {}),
    ...(t.subject ? { subject: t.subject } : {}),
    triggered: true,
  });
  s.triggerQueue.shift();
  pushAbility(ctx, t, targets);
  givePriority(ctx, pending.then);
}
