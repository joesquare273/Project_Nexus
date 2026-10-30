// Matching objects against an ObjectFilter: trigger subjects ("another
// creature you control"), targets ("target nonland permanent an opponent
// controls") and searches ("a Plains card").

import { currentDefinition } from './cardface.ts';
import { characteristics, subtypesOf, isEquipped, isModified, totalCounters } from './characteristics.ts';
import { categoriesOf, colorsOf, objectManaValue } from './typerules.ts';
import type { CardDefinition, CardInstance, GameState, InstanceId, ObjectFilter, PlayerId } from './types.ts';

/** Who is asking: the controller of the spell or ability, and its source card if any. */
export interface FilterViewpoint {
  controller: PlayerId;
  /** Combat-damage filters use power/toughness at the instant damage was dealt. */
  power?: number;
  toughness?: number;
  source?: InstanceId;
  /** For attack and combat damage triggers: the player attacked or dealt damage. */
  defender?: PlayerId;
  /** For triggered abilities: the object the event happened to (the spell that was cast). */
  subject?: InstanceId;
}

/**
 * Whether `obj` matches. `objController` defaults to its current controller
 * on the battlefield and its owner elsewhere; triggers pass the controller it
 * had when the event happened.
 */
export function matchesObject(
  s: GameState,
  f: ObjectFilter | undefined,
  obj: CardInstance,
  from: FilterViewpoint,
  objController: PlayerId = obj.zone === 'battlefield' ? obj.controller : obj.owner,
  definition?: CardDefinition,
): boolean {
  if (!f) return true;
  if (f.newGraveyardCardNotFromBattlefield && (obj.zone !== 'graveyard' || obj.graveyardArrival?.turn !== s.turnNumber || obj.graveyardArrival.from === 'battlefield')) return false;
  if (f.anyOf && !f.anyOf.some((alt) => matchesObject(s, alt, obj, from, objController, definition))) return false;
  const def = definition ?? currentDefinition(s, obj);
  if (f.other && obj.id === from.source) return false;
  if (f.self && obj.id !== from.source) return false;
  if (f.name !== undefined && def.name !== f.name) return false;
  if (f.historic !== undefined) {
    const historic = def.types.includes('artifact') || !!def.supertypes?.includes('Legendary') || !!def.subtypes?.includes('Saga');
    if (historic !== f.historic) return false;
  }
  if (f.modified !== undefined && isModified(s, obj) !== f.modified) return false;
  if (f.commander !== undefined && !!obj.isCommander !== f.commander) return false;
  if (f.controller === 'You' && objController !== from.controller) return false;
  if (f.controller === 'Opponent' && objController === from.controller) return false;
  if (f.controller === 'DefendingPlayer' && objController !== from.defender) return false;
  if (f.types && !f.types.some((t) => def.types.includes(t))) return false;
  if (f.nonTypes?.some((t) => def.types.includes(t))) return false;
  if (f.categories) {
    const categories = categoriesOf(def);
    if (!f.categories.every((c) => categories.includes(c))) return false;
  }
  if (f.subtypes) {
    const subtypes = subtypesOf(s, obj);
    if (!f.subtypes.some((t) => subtypes.includes(t))) return false;
  }
  if (f.supertypes && !f.supertypes.every((t) => def.supertypes?.includes(t))) return false;
  if (f.nonSupertypes?.some((t) => def.supertypes?.includes(t))) return false;
  if (f.tapped !== undefined && obj.tapped !== f.tapped) return false;
  if (f.attacking !== undefined) {
    const attacking = s.combat?.attacks.some((a) => a.attacker === obj.id) ?? false;
    if (attacking !== f.attacking) return false;
  }
  if (f.powerLessThanSource) {
    const source = from.source ? s.cards[from.source] : undefined;
    if (!source || source.zone !== 'battlefield' || characteristics(s, obj).power >= characteristics(s, source).power) return false;
  }
  if (f.enteredThisTurn !== undefined && (obj.zone === 'battlefield' && obj.enteredTurn === s.turnNumber) !== f.enteredThisTurn) return false;
  if (f.attackingYou && !s.combat?.attacks.some((a) => a.attacker === obj.id && a.defender === from.controller)) return false;
  if (f.equipped !== undefined && isEquipped(s, obj) !== f.equipped) return false;
  if (f.equippedBySource && (!from.source || s.cards[from.source]?.attachedTo !== obj.id)) return false;
  if (f.equippedBySource === false && from.source && s.cards[from.source]?.attachedTo === obj.id) return false;
  if (f.colors || f.nonColors) {
    const colors = colorsOf(def);
    if (f.colors && !f.colors.some((c) => colors.includes(c))) return false;
    if (f.nonColors?.some((c) => colors.includes(c))) return false;
  }
  if (f.nonSubtypes) {
    const subtypes = subtypesOf(s, obj);
    if (f.nonSubtypes.some((t) => subtypes.includes(t))) return false;
  }
  if (f.powerAtLeast !== undefined || f.powerAtMost !== undefined || f.toughnessAtLeast !== undefined) {
    const ch = characteristics(s, obj);
    if (f.powerAtLeast !== undefined && (from.power ?? ch.power) < f.powerAtLeast) return false;
    if (f.powerAtMost !== undefined && (from.power ?? ch.power) > f.powerAtMost) return false;
    if (f.toughnessAtLeast !== undefined && (from.toughness ?? ch.toughness) < f.toughnessAtLeast) return false;
  }
  if (f.manaValueAtMost !== undefined && objectManaValue(s, obj) > f.manaValueAtMost) return false;
  if (f.manaValueEqualsSubject) {
    const subject = from.subject ? s.cards[from.subject] : undefined;
    if (!subject || objectManaValue(s, obj) !== objectManaValue(s, subject)) return false;
  }
  if (f.manaValueAtLeast !== undefined && objectManaValue(s, obj) < f.manaValueAtLeast) return false;
  if (f.noCounters !== undefined || f.hasCounters !== undefined || f.hasAnyCounters !== undefined) {
    // Off the battlefield: the counters it had as it left (for "if it had counters on it").
    const here = obj.zone === 'battlefield';
    const plus = here ? (obj.counters ?? 0) : (obj.lastCounters?.['+1/+1'] ?? 0);
    const total = here ? totalCounters(obj) : Object.values(obj.lastCounters ?? {}).reduce((n, k) => n + k, 0);
    if (f.noCounters && total > 0) return false;
    if (f.hasCounters !== undefined && plus > 0 !== f.hasCounters) return false;
    if (f.hasAnyCounters !== undefined && total > 0 !== f.hasAnyCounters) return false;
  }
  if (f.withoutKeywords) {
    const keywords = obj.zone === 'battlefield' ? [...characteristics(s, obj).keywords] : (obj.lastKeywords ?? def.keywords ?? []);
    if (f.withoutKeywords.some((k) => keywords.includes(k))) return false;
  }
  if (f.withKeywords) {
    const keywords = obj.zone === 'battlefield' ? [...characteristics(s, obj).keywords] : (obj.lastKeywords ?? def.keywords ?? []);
    if (!f.withKeywords.every((k) => keywords.includes(k))) return false;
  }
  if (f.token !== undefined && !!obj.isToken !== f.token) return false;
  return true;
}
