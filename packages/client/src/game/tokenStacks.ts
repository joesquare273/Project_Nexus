import { characteristics, type GameState, type InstanceId } from '@nexus/engine';

/**
 * Token stacks (user rule, 2026-11-19): two or more tokens with the same name and power/toughness
 * share one card on the board with a count. They're the same token (card), controller, current
 * power, toughness and keywords, tapped or untapped, and ready to attack or not. A token that's
 * individually different (counters, damage, something attached, an effect of its own, a blocker or
 * a blocked attacker) shows on its own. Display only: every engine object stays distinct, and
 * choosing "how many" from a stack picks that many individual tokens.
 */
export function tokenStackKey(s: GameState, id: InstanceId): string | null {
  const c = s.cards[id];
  if (!c?.isToken || c.zone !== 'battlefield' || c.phasedOut || c.faceDown) return null;
  if (c.damage || c.deathtouched || c.copy || c.monstrous || c.blitzed || c.unearthed || c.attachedTo || c.isCommander || c.vowTo?.length || c.goadedForever?.length || c.prepared) return null;
  if ((c.counters ?? 0) > 0 || Object.values(c.namedCounters ?? {}).some((n) => n > 0)) return null;
  if (s.temporaryEffects.some((e) => e.affected === id)) return null;
  if (Object.values(s.cards).some((x) => x.zone === 'battlefield' && x.attachedTo === id)) return null;
  // Blockers and blocked attackers each have their own fight; unblocked attackers stack by whom they attack.
  if (s.combat?.blocks.some((b) => b.blocker === id || b.attacker === id)) return null;
  const attack = s.combat?.attacks.find((a) => a.attacker === id);
  const stats = characteristics(s, c);
  return JSON.stringify([c.defId, c.owner, c.controller, c.tapped, c.summoningSick, stats.power, stats.toughness, [...stats.keywords].sort(), stats.ward, attack ? [attack.defender, attack.planeswalker ?? null] : null]);
}

/** Smallest stack: two of the same token share one card. */
export const STACK_AT = 2;

/** Groups eligible tokens into stacks of STACK_AT or more; every engine object remains distinct. */
export function groupTokenCards(ids: InstanceId[], keyOf: (id: InstanceId) => string | null): { id: InstanceId; members: InstanceId[]; key: string | null }[] {
  const keys = new Map(ids.map((id) => [id, keyOf(id)]));
  const groups = new Map<string, InstanceId[]>();
  for (const id of ids) {
    const key = keys.get(id);
    if (key) groups.set(key, [...(groups.get(key) ?? []), id]);
  }
  const shown = new Set<string>();
  return ids.flatMap<{ id: InstanceId; members: InstanceId[]; key: string | null }>((id) => {
    const key = keys.get(id) ?? null;
    const members = key ? groups.get(key)! : [];
    if (!key || members.length < STACK_AT) return [{ id, members: [id], key: null }];
    if (shown.has(key)) return [];
    shown.add(key);
    return [{ id, members, key }];
  });
}
