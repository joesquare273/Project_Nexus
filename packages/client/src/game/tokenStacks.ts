import { characteristics, staticAffects, type GameState, type InstanceId } from '@nexus/engine';

/** A display-only group. Any individual ability, modification or combat role keeps a token separate. */
export function tokenStackKey(s: GameState, id: InstanceId): string | null {
  const c = s.cards[id];
  if (!c?.isToken || c.zone !== 'battlefield' || c.phasedOut || c.tapped || c.damage || c.deathtouched || c.monstrous || c.blitzed || c.unearthed || c.attachedTo || c.isCommander || c.vowTo?.length) return null;
  if ((c.counters ?? 0) > 0 || Object.values(c.namedCounters ?? {}).some((n) => n > 0)) return null;
  const d = s.cardDefs[c.defId]!;
  if (d.keywords?.length || d.triggers?.length || d.activated?.length || d.statics?.length || d.produces?.length || d.manaAbility || d.equip) return null;
  if (s.temporaryEffects.some((e) => e.affected === id)) return null;
  if (s.combat?.attacks.some((a) => a.attacker === id) || s.combat?.blocks.some((b) => b.blocker === id || b.attacker === id)) return null;
  const sources = Object.values(s.cards).filter((x) => (x.zone === 'battlefield' && !x.phasedOut) || x.zone === 'graveyard');
  if (sources.some((x) => x.attachedTo === id && x.zone === 'battlefield')) return null;
  if (sources.some((x) => s.cardDefs[x.defId]!.statics?.some((st) => (st.zone ?? 'battlefield') === x.zone && staticAffects(s, x, st, c)))) return null;
  const stats = characteristics(s, c);
  if (stats.keywords.size || stats.ward || stats.power !== (d.power ?? 0) || stats.toughness !== (d.toughness ?? 0)) return null;
  return JSON.stringify([c.defId, c.owner, c.controller, c.summoningSick]);
}

/** Six or more eligible tokens share one display; every engine object remains distinct. */
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
    if (!key || members.length <= 5) return [{ id, members: [id], key: null }];
    if (shown.has(key)) return [];
    shown.add(key);
    return [{ id, members, key }];
  });
}
