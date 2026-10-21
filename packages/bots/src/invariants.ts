// Invariants that must hold after every action in any game. Used by the
// fuzz tests and the long fuzz script (PRD 16).

import { MANA_TYPES, type GameState } from '@nexus/engine';

/** Returns a list of broken invariants. Empty means the state is consistent. */
export function checkInvariants(s: GameState): string[] {
  const problems: string[] = [];
  const seen = new Map<string, number>();
  const note = (id: string) => seen.set(id, (seen.get(id) ?? 0) + 1);

  for (const pid of s.turnOrder) {
    const p = s.players[pid]!;
    for (const zone of ['library', 'hand', 'battlefield', 'graveyard', 'exile'] as const) {
      for (const id of p[zone]) {
        note(id);
        const c = s.cards[id];
        if (!c) problems.push(`${pid}.${zone} lists unknown card ${id}`);
        else if (c.zone !== zone || c.owner !== pid) problems.push(`${id} listed in ${pid}.${zone} but is ${c.owner}.${c.zone}`);
      }
    }
    for (const t of MANA_TYPES) if (p.manaPool[t] < 0) problems.push(`${pid} has negative ${t} mana`);
    if (!Number.isInteger(p.life)) problems.push(`${pid} life is ${p.life}`);
    if (p.eliminated && p.battlefield.length > 0) problems.push(`eliminated ${pid} still has permanents`);
  }
  for (const item of s.stack) {
    note(item.card);
    if (s.cards[item.card]?.zone !== 'stack') problems.push(`stack item ${item.id} card is not on the stack`);
  }
  for (const c of Object.values(s.cards)) {
    const n = seen.get(c.id) ?? 0;
    if (n !== 1) problems.push(`${c.id} appears in ${n} zones`);
    if (c.damage < 0) problems.push(`${c.id} has negative damage`);
    if (c.zone !== 'battlefield' && (c.tapped || c.damage > 0)) problems.push(`${c.id} carries battlefield state in ${c.zone}`);
  }
  if (s.pending.kind !== 'gameOver' && s.players[s.pending.player]!.eliminated) {
    problems.push(`waiting on eliminated player ${s.pending.player}`);
  }
  if (s.pending.kind !== 'gameOver' && s.players[s.activePlayer]!.eliminated) {
    problems.push(`active player ${s.activePlayer} is eliminated`);
  }
  return problems;
}
