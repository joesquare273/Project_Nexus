// Matching objects against an ObjectFilter: trigger subjects ("another
// creature you control"), targets ("target nonland permanent an opponent
// controls") and searches ("a Plains card").

import { characteristics, isEquipped } from './characteristics.ts';
import { categoriesOf } from './typerules.ts';
import type { CardInstance, GameState, InstanceId, ObjectFilter, PlayerId } from './types.ts';

/** Who is asking: the controller of the spell or ability, and its source card if any. */
export interface FilterViewpoint {
  controller: PlayerId;
  source?: InstanceId;
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
  if (f.controller === 'You' && objController !== from.controller) return false;
  if (f.controller === 'Opponent' && objController === from.controller) return false;
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
  if (f.equipped !== undefined && isEquipped(s, obj) !== f.equipped) return false;
  if (f.equippedBySource && (!from.source || s.cards[from.source]?.attachedTo !== obj.id)) return false;
  return true;
}
