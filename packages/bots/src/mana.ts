// Works out which lands to tap to pay a cost. Shared by the AI and the
// terminal client's auto-tapper, so neither has to tap lands one by one.

import {
  MANA_TYPES,
  parseManaCost,
  type Action,
  type CardInstance,
  type GameState,
  type InstanceId,
  type ManaType,
  type PlayerId,
} from '@nexus/engine';

export interface ManaTap {
  card: InstanceId;
  mana: ManaType;
}

/** Untapped permanents this player can tap for mana right now. */
export function manaSources(s: GameState, playerId: PlayerId): CardInstance[] {
  return s.players[playerId]!.battlefield
    .map((id) => s.cards[id]!)
    .filter((c) => {
      const def = s.cardDefs[c.defId]!;
      if (!def.produces?.length || c.tapped || c.controller !== playerId) return false;
      const sick = def.types.includes('creature') && c.summoningSick && !def.keywords?.includes('Haste');
      return !sick;
    });
}

/**
 * Picks lands to tap so that the mana pool plus those lands pays `manaCost`,
 * or returns null if it can't be paid. Lands with fewer color options are
 * used first, so dual lands are saved for when they're needed.
 */
export function planTaps(s: GameState, playerId: PlayerId, manaCost: string | undefined): ManaTap[] | null {
  const cost = parseManaCost(manaCost);
  const pool = { ...s.players[playerId]!.manaPool };

  const colored: ManaType[] = [];
  for (const t of MANA_TYPES) {
    for (let i = 0; i < (cost[t] ?? 0); i++) {
      if (pool[t] > 0) pool[t] -= 1;
      else colored.push(t);
    }
  }
  const leftoverInPool = MANA_TYPES.reduce((n, t) => n + pool[t], 0);
  let generic = Math.max(0, cost.generic - leftoverInPool);

  const sources = manaSources(s, playerId).sort(
    (a, b) => s.cardDefs[a.defId]!.produces!.length - s.cardDefs[b.defId]!.produces!.length,
  );
  const used = new Set<InstanceId>();
  const taps: ManaTap[] = [];

  // Depth-first search assigning a source to each colored symbol.
  const assign = (i: number): boolean => {
    if (i === colored.length) return true;
    const want = colored[i]!;
    for (const src of sources) {
      if (used.has(src.id) || !s.cardDefs[src.defId]!.produces!.includes(want)) continue;
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
    taps.push({ card: src.id, mana: s.cardDefs[src.defId]!.produces![0]! });
    generic -= 1;
  }
  return generic === 0 ? taps : null;
}

export function tapActions(playerId: PlayerId, taps: ManaTap[]): Action[] {
  return taps.map((t) => ({ type: 'ActivateManaAbility', player: playerId, card: t.card, mana: t.mana }));
}
