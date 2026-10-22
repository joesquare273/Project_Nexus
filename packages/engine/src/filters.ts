// Matching objects against an ObjectFilter: trigger subjects ("another
// creature you control"), targets ("target nonland permanent an opponent
// controls") and searches ("a Plains card").

import { characteristics, isEquipped, totalCounters } from './characteristics.ts';
import { categoriesOf, colorsOf, manaValueOf } from './typerules.ts';
import type { CardInstance, GameState, InstanceId, ObjectFilter, PlayerId } from './types.ts';

/** Who is asking: the controller of the spell or ability, and its source card if any. */
export interface FilterViewpoint {
  controller: PlayerId;
  source?: InstanceId;
  /** For attack and combat damage triggers: the player attacked or dealt damage. */
  defender?: PlayerId;
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
): boolean {
  if (!f) return true;
  const def = s.cardDefs[obj.defId]!;
  if (f.other && obj.id === from.source) return false;
  if (f.self && obj.id !== from.source) return false;
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
    const subtypes = obj.zone === 'battlefield' ? characteristics(s, obj).subtypes : (def.subtypes ?? []);
    if (!f.subtypes.some((t) => subtypes.includes(t))) return false;
  }
  if (f.supertypes && !f.supertypes.every((t) => def.supertypes?.includes(t))) return false;
  if (f.tapped !== undefined && obj.tapped !== f.tapped) return false;
  if (f.attacking !== undefined) {
    const attacking = s.combat?.attacks.some((a) => a.attacker === obj.id) ?? false;
    if (attacking !== f.attacking) return false;
  }
  if (f.enteredThisTurn !== undefined && (obj.zone === 'battlefield' && obj.enteredTurn === s.turnNumber) !== f.enteredThisTurn) return false;
  if (f.attackingYou && !s.combat?.attacks.some((a) => a.attacker === obj.id && a.defender === from.controller)) return false;
  if (f.equipped !== undefined && isEquipped(s, obj) !== f.equipped) return false;
  if (f.equippedBySource && (!from.source || s.cards[from.source]?.attachedTo !== obj.id)) return false;
  if (f.colors || f.nonColors) {
    const colors = colorsOf(def);
    if (f.colors && !f.colors.some((c) => colors.includes(c))) return false;
    if (f.nonColors?.some((c) => colors.includes(c))) return false;
  }
  if (f.nonSubtypes) {
    const subtypes = obj.zone === 'battlefield' ? characteristics(s, obj).subtypes : (def.subtypes ?? []);
    if (f.nonSubtypes.some((t) => subtypes.includes(t))) return false;
  }
  if (f.powerAtLeast !== undefined || f.powerAtMost !== undefined || f.toughnessAtLeast !== undefined) {
    const ch = characteristics(s, obj);
    if (f.powerAtLeast !== undefined && ch.power < f.powerAtLeast) return false;
    if (f.powerAtMost !== undefined && ch.power > f.powerAtMost) return false;
    if (f.toughnessAtLeast !== undefined && ch.toughness < f.toughnessAtLeast) return false;
  }
  if (f.manaValueAtMost !== undefined && manaValueOf(def) > f.manaValueAtMost) return false;
  if (f.manaValueAtLeast !== undefined && manaValueOf(def) < f.manaValueAtLeast) return false;
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
  if (f.token !== undefined && !!obj.isToken !== f.token) return false;
  return true;
}
