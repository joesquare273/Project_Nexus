// What a permanent is right now (rule 613): its printed card, then static
// abilities (including Equipment), "until end of turn" effects and +1/+1
// counters. Every rule that asks about power, toughness, keywords or
// subtypes goes through here, so a buff only has to be described once.
//
// Type and color changes use timestamps in cardface.ts. Ability changes add
// or remove keywords; base power/toughness setters use timestamps, then additive
// modifiers and counters apply in their own layers.

import { currentDefinition } from './cardface.ts';
import { matchesObject } from './filters.ts';
import { colorsOf } from './typerules.ts';
import { objectManaValue } from './typerules.ts';
import type {
  AnyCounter,
  Amount,
  CardDefinition,
  CardInstance,
  CountKind,
  GameState,
  InstanceId,
  Keyword,
  PlayerId,
  StaticSpec,
  TemporaryEffect,
  TemporaryFlag,
} from './types.ts';

/** How many counters of a kind are on a card. */
export function countersOf(c: CardInstance, kind: AnyCounter): number {
  return kind === '+1/+1' ? (c.counters ?? 0) : (c.namedCounters?.[kind] ?? 0);
}

/** Every kind of counter on a card, with how many. */
export function allCounters(c: CardInstance): [AnyCounter, number][] {
  const out: [AnyCounter, number][] = (c.counters ?? 0) > 0 ? [['+1/+1', c.counters!]] : [];
  for (const [kind, n] of Object.entries(c.namedCounters ?? {})) if (n > 0) out.push([kind as AnyCounter, n]);
  return out;
}

export function totalCounters(c: CardInstance): number {
  return allCounters(c).reduce((n, [, k]) => n + k, 0);
}

export interface Characteristics {
  power: number;
  toughness: number;
  keywords: Set<Keyword>;
  subtypes: string[];
  /** Total ward cost: each instance of ward asks for its own payment (rule 702.21b). */
  ward: number;
}

const def = currentDefinition;

function battlefieldCards(s: GameState): CardInstance[] {
  return s.turnOrder.flatMap((pid) => s.players[pid]!.battlefield.map((id) => s.cards[id]!));
}

export function isEquipment(s: GameState, c: CardInstance): boolean {
  return def(s, c).subtypes?.includes('Equipment') ?? false;
}

/** Equipment attached to this creature. */
export function equipmentOn(s: GameState, creature: InstanceId): CardInstance[] {
  return battlefieldCards(s).filter((e) => e.attachedTo === creature && isEquipment(s, e));
}

export function isEquipped(s: GameState, c: CardInstance): boolean {
  return c.zone === 'battlefield' && equipmentOn(s, c.id).length > 0;
}

/** Modifications are checked from the creature's controller's point of view (rule 700.9). */
export function isModified(s: GameState, c: CardInstance): boolean {
  if (c.zone !== 'battlefield' || c.phasedOut) return false;
  return isEquipped(s, c) || totalCounters(c) > 0 || battlefieldCards(s).some(a =>
    a.attachedTo === c.id && a.controller === c.controller && def(s, a).subtypes?.includes('Aura'));
}

/** How many of something there are, from `player`'s point of view. */
export function countOf(s: GameState, kind: CountKind, player: PlayerId, source?: InstanceId): number {
  const yours = () => battlefieldCards(s).filter((c) => c.controller === player);
  const creature = (c: CardInstance) => def(s, c).types.includes('creature');
  switch (kind) {
    case 'OpponentsDamagedBySourceOrDragonThisTurn': {
      const currentObject = source ? (s.cards[source]?.zoneChanges ?? 0) : -1;
      return new Set((s.combatDamageHistory ?? []).filter((hit) =>
        hit.player !== player && !s.players[hit.player]!.eliminated &&
        (hit.dragon || (hit.source === source && hit.sourceObject === currentObject)),
      ).map((hit) => hit.player)).size;
    }
    case 'EquipmentYouControl':
      return yours().filter((c) => isEquipment(s, c)).length;
    case 'CreaturesYouControl':
      return yours().filter(creature).length;
    case 'EquippedCreaturesYouControl':
      return yours().filter((c) => creature(c) && isEquipped(s, c)).length;
    case 'NoncreatureNonlandCardsInYourGraveyard':
      return s.players[player]!.graveyard.filter((id) => {
        const types = def(s, s.cards[id]!).types;
        return !types.includes('creature') && !types.includes('land');
      }).length;
    case 'CreaturesDiedThisTurn':
      return s.creaturesDiedThisTurn;
    case 'CreaturesOnBattlefield':
      return battlefieldCards(s).filter(creature).length;
    case 'CreaturesYouControlWithCounters':
      return yours().filter((c) => creature(c) && (c.counters ?? 0) > 0).length;
    case 'InstantAndSorceryCardsInYourGraveyard':
      return s.players[player]!.graveyard.filter((id) => {
        const types = def(s, s.cards[id]!).types;
        return types.includes('instant') || types.includes('sorcery');
      }).length;
    case 'CreatureCardsInYourGraveyard':
      return s.players[player]!.graveyard.filter((id) => def(s, s.cards[id]!).types.includes('creature')).length;
    case 'CountersAmongCreaturesYouControl':
      return yours().filter(creature).reduce((n, c) => n + totalCounters(c), 0);
    case 'PlayersWhoLostLifeThisTurn':
      return s.turnOrder.filter((pid) => (s.players[pid]!.lifeLostThisTurn ?? 0) > 0).length;
    case 'OpponentsYouAttackedThisCombat': {
      if (s.combat?.declaredOpponents) return (s.combat.declaredOpponents[player] ?? []).length;
      const attacked = (s.combat?.attacks ?? []).filter((a) => s.cards[a.attacker]?.controller === player).map((a) => a.defender);
      return new Set(attacked).size;
    }
    case 'Opponents':
      return s.turnOrder.filter((pid) => pid !== player && !s.players[pid]!.eliminated).length;
    case 'NontokenCreaturesYouControlThatEnteredThisTurn':
      return yours().filter((c) => creature(c) && !c.isToken && c.enteredTurn === s.turnNumber).length;
    case 'GreatestPowerAmongYourCreatures':
      return Math.max(0, ...yours().filter(creature).map((c) => characteristics(s, c).power));
    case 'ColorsAmongYourPermanents': {
      const colors = new Set<string>();
      for (const c of yours()) for (const k of colorsOf(def(s, c))) colors.add(k);
      return colors.size;
    }
    case 'ArtifactsOpponentsControl':
      return battlefieldCards(s).filter((c) => c.controller !== player && def(s, c).types.includes('artifact')).length;
    case 'OpponentsWithPower4Creature':
      return s.turnOrder.filter(
        (pid) =>
          pid !== player &&
          !s.players[pid]!.eliminated &&
          battlefieldCards(s).some((c) => c.controller === pid && creature(c) && characteristics(s, c).power >= 4),
      ).length;
    case 'SoldiersYouControl':
      return yours().filter((c) => creature(c) && (def(s, c).subtypes ?? []).includes('Soldier')).length;
    case 'OpponentsWithMoreCreatures': {
      const creatures = (pid: PlayerId) => battlefieldCards(s).filter((c) => c.controller === pid && creature(c)).length;
      const mine = creatures(player);
      return s.turnOrder.filter((pid) => pid !== player && !s.players[pid]!.eliminated && creatures(pid) > mine).length;
    }
    case 'SoulCountersOnThis':
      return source && s.cards[source] ? countersOf(s.cards[source]!, 'soul') : 0;
    case 'ArtifactsYouControl':
      return yours().filter((c) => def(s, c).types.includes('artifact')).length;
    case 'GreatestManaValueAmongYourArtifacts':
      return Math.max(0, ...yours().filter((c) => def(s, c).types.includes('artifact')).map((c) => objectManaValue(s, c)));
    case 'EquippedAttackingCreaturesYouControl':
      return yours().filter((c) => creature(c) && isEquipped(s, c) && (s.combat?.attacks.some((a) => a.attacker === c.id) ?? false)).length;
  }
}

export function amountOf(s: GameState, amount: Amount | undefined, player: PlayerId, source?: InstanceId): number {
  if (amount === undefined) return 0;
  if (typeof amount === 'number') return amount;
  // Amounts that refer back to earlier in the same spell or ability are worked out while it resolves.
  if ('of' in amount) return 0;
  return amount.count.reduce((n, kind) => n + countOf(s, kind, player, source), 0) * (amount.times ?? 1);
}

/** Cards whose static abilities may apply: permanents, and graveyard cards with abilities that work from there (Anger). */
function staticSources(s: GameState): CardInstance[] {
  const out = battlefieldCards(s);
  for (const pid of s.turnOrder) {
    for (const id of s.players[pid]!.graveyard) {
      const c = s.cards[id]!;
      if (def(s, c).statics?.some((st) => st.zone === 'graveyard')) out.push(c);
    }
  }
  return out;
}

/** Layer 4 subtype additions, independent of ability and power/toughness evaluation. */
export function subtypesOf(s: GameState, c: CardInstance): string[] {
  return [...(def(s, c).subtypes ?? [])];
}

/** Whether a static ability of `source` applies to `c`. */
export function staticAffects(s: GameState, source: CardInstance, spec: StaticSpec, c: CardInstance): boolean {
  // "As long as you control a Mountain" (printed subtypes, so this never asks for characteristics).
  if (spec.ifYouControlSubtype) {
    const yours = battlefieldCards(s).filter((x) => x.controller === source.controller);
    if (!yours.some((x) => def(s, x).subtypes?.includes(spec.ifYouControlSubtype!))) return false;
  }
  if (spec.affects === 'EachMatching') {
    // An ability an Equipment grants to others while attached (Dancer's Chakrams).
    if (spec.conditions?.includes('attached') && !source.attachedTo) return false;
    // Filters avoid power/toughness; subtypes are evaluated separately in layer 4.
    return c.zone === 'battlefield' && matchesObject(s, spec.filter, c, { controller: source.controller, source: source.id });
  }
  return staticApplies(s, source, spec) === c.id;
}

function staticApplies(s: GameState, source: CardInstance, spec: StaticSpec): InstanceId | null {
  const affected = spec.affects === 'Self' ? source.id : source.attachedTo;
  if (!affected) return null;
  for (const condition of spec.conditions ?? []) {
    if (condition === 'yourTurn' && s.activePlayer !== source.controller) return null;
    if (condition === 'equipped' && !isEquipped(s, s.cards[affected]!)) return null;
    if (condition === 'legendary' && !def(s, s.cards[affected]!).supertypes?.includes('Legendary')) return null;
    if (condition === 'twoNoncreatureSpellsThisTurn' && (s.players[source.controller]!.noncreatureSpellsThisTurn ?? 0) < 2) return null;
  }
  return affected;
}

/** The card's current characteristics. Cards off the battlefield are just their printed card. */
export function characteristics(s: GameState, c: CardInstance): Characteristics {
  const d = def(s, c);
  const out: Characteristics = {
    power: d.power ?? 0,
    toughness: d.toughness ?? 0,
    keywords: new Set(d.keywords ?? []),
    subtypes: subtypesOf(s, c),
    ward: d.ward ?? 0,
  };
  if (c.zone !== 'battlefield') return out;

  const removed: Keyword[] = [];
  // Base-setting effects share layer 7b; later timestamps win before additions/counters.
  let baseTimestamp = -1;
  for (const source of staticSources(s)) {
    for (const spec of def(s, source).statics ?? []) {
      if (!spec.basePowerToughness || (spec.zone ?? 'battlefield') !== source.zone || !staticAffects(s, source, spec, c)) continue;
      const timestamp = (spec.affects === 'EquippedCreature' ? source.attachedTimestamp : undefined) ?? source.enteredTimestamp ?? 0;
      if (timestamp >= baseTimestamp) { [out.power, out.toughness] = spec.basePowerToughness; baseTimestamp = timestamp; }
    }
  }
  for (const effect of s.temporaryEffects) {
    if (effect.affected !== c.id || !effect.basePowerToughness || !effectLasts(s, effect)) continue;
    if ((effect.timestamp ?? 0) >= baseTimestamp) {
      [out.power, out.toughness] = effect.basePowerToughness;
      baseTimestamp = effect.timestamp ?? 0;
    }
  }
  for (const source of staticSources(s)) {
    for (const spec of def(s, source).statics ?? []) {
      if ((spec.zone ?? 'battlefield') !== source.zone || !staticAffects(s, source, spec, c)) continue;
      out.power += amountOf(s, spec.power, source.controller, source.id);
      out.toughness += amountOf(s, spec.toughness, source.controller, source.id);
      for (const k of spec.keywords ?? []) out.keywords.add(k);
      out.ward += spec.ward ?? 0;
      removed.push(...(spec.removeKeywords ?? []));
    }
  }
  for (const e of s.temporaryEffects) {
    if (e.affected !== c.id || !effectLasts(s, e)) continue;
    out.power += e.power ?? 0;
    out.toughness += e.toughness ?? 0;
    for (const k of e.keywords ?? []) out.keywords.add(k);
  }
  if (countersOf(c, 'flying') > 0) out.keywords.add('Flying');
  // "Loses flying" wins over grants (a simplification of layer 6 timestamps).
  for (const k of removed) out.keywords.delete(k);
  out.power += c.counters ?? 0;
  out.toughness += c.counters ?? 0;
  return out;
}

export function powerOf(s: GameState, c: CardInstance): number {
  return characteristics(s, c).power;
}

export function toughnessOf(s: GameState, c: CardInstance): number {
  return characteristics(s, c).toughness;
}

export function hasKeyword(s: GameState, c: CardInstance, keyword: Keyword): boolean {
  if (c.zone !== 'battlefield') return def(s, c).keywords?.includes(keyword) ?? false;
  return characteristics(s, c).keywords.has(keyword);
}

/** Whether an "until end of turn" flag such as "can't be blocked" applies to this object. */
export function hasFlag(s: GameState, c: CardInstance, flag: TemporaryFlag): boolean {
  return s.temporaryEffects.some((e) => e.affected === c.id && e.flags?.includes(flag) && effectLasts(s, e));
}

/** "For as long as you control [source]": over once the source leaves or changes control. */
export function effectLasts(s: GameState, e: TemporaryEffect): boolean {
  if (!e.whileControlledBy) return true;
  const source = s.cards[e.source];
  return source?.zone === 'battlefield' && !source.phasedOut && source.controller === e.whileControlledBy;
}
