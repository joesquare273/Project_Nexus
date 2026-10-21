// Works out which permanents to tap to pay a cost. Shared by the AI and the
// clients' auto-tapper, so nobody has to tap lands one by one.

import {
  MANA_TYPES,
  manaProduced,
  parseManaCost,
  type Action,
  type CardInstance,
  type GameState,
  type InstanceId,
  type ManaCost,
  type ManaType,
  type PlayerId,
} from '@nexus/engine';

export interface ManaTap {
  card: InstanceId;
  mana: ManaType;
}

export interface TapOptions {
  /** The mana is for an Equipment spell or an equip ability, so Equipment-only mana counts. */
  forEquipment?: boolean;
}

/** Untapped permanents this player can tap for mana right now. */
export function manaSources(s: GameState, playerId: PlayerId, opts: TapOptions = {}): CardInstance[] {
  return s.players[playerId]!.battlefield
    .map((id) => s.cards[id]!)
    .filter((c) => {
      const def = s.cardDefs[c.defId]!;
      if (manaProduced(def).length === 0 || c.tapped || c.controller !== playerId) return false;
      if (def.manaAbility?.onlyForEquipment && !opts.forEquipment) return false;
      const sick = def.types.includes('creature') && c.summoningSick && !def.keywords?.includes('Haste');
      return !sick;
    });
}

/** How reluctant we are to use a source: lands first, then other permanents, Treasure (sacrificed) last. */
function reluctance(s: GameState, c: CardInstance): number {
  const def = s.cardDefs[c.defId]!;
  if (def.manaAbility?.sacrifice) return 100;
  return (def.types.includes('land') ? 0 : 10) + manaProduced(def).length;
}

/**
 * Picks permanents to tap so that the mana pool plus those taps pays `cost`,
 * or returns null if it can't be paid. Sources with fewer color options are
 * used first, so dual lands and Treasure are saved for when they're needed.
 */
export function planTaps(
  s: GameState,
  playerId: PlayerId,
  cost: string | ManaCost | undefined,
  opts: TapOptions = {},
): ManaTap[] | null {
  const need = typeof cost === 'object' ? cost : parseManaCost(cost);
  const p = s.players[playerId]!;
  const pool = { ...p.manaPool };
  if (opts.forEquipment) for (const t of MANA_TYPES) pool[t] += p.equipmentMana[t];

  const colored: ManaType[] = [];
  for (const t of MANA_TYPES) {
    for (let i = 0; i < (need[t] ?? 0); i++) {
      if (pool[t] > 0) pool[t] -= 1;
      else colored.push(t);
    }
  }
  const leftoverInPool = MANA_TYPES.reduce((n, t) => n + pool[t], 0);
  let generic = Math.max(0, need.generic - leftoverInPool);

  const sources = manaSources(s, playerId, opts).sort((a, b) => reluctance(s, a) - reluctance(s, b));
  const used = new Set<InstanceId>();
  const taps: ManaTap[] = [];

  // Depth-first search assigning a source to each colored symbol.
  const assign = (i: number): boolean => {
    if (i === colored.length) return true;
    const want = colored[i]!;
    for (const src of sources) {
      if (used.has(src.id) || !manaProduced(s.cardDefs[src.defId]!).includes(want)) continue;
      used.add(src.id);
      taps.push({ card: src.id, mana: want });
      if (assign(i + 1)) return true;
      used.delete(src.id);
      taps.pop();
    }
    return false;
  };
  if (!assign(0)) return null;

  for (const src of sources) {
    if (generic === 0) break;
    if (used.has(src.id)) continue;
    used.add(src.id);
    taps.push({ card: src.id, mana: manaProduced(s.cardDefs[src.defId]!)[0]! });
    generic -= 1;
  }
  return generic === 0 ? taps : null;
}

export function tapActions(playerId: PlayerId, taps: ManaTap[]): Action[] {
  return taps.map((t) => ({ type: 'ActivateManaAbility', player: playerId, card: t.card, mana: t.mana }));
}
