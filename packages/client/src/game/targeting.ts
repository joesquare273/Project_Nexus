import type { GameEvent, GameState, Target } from '@nexus/engine';
import { cardName } from '@nexus/bots/narrate';
export interface TargetNotice { source: string; controller: string; sourceCard: string; targets: Target[]; labels: string[] }
/** Keep public names readable even after a target leaves the battlefield. */
export function targetNotice(s: GameState, source: string, controller: string, targets: Target[]): TargetNotice | null {
 const actual = targets.filter(t => t.kind !== 'none');
 if (!actual.length) return null;
 const labels = actual.map(t => {
  if (t.kind === 'player') return t.player;
  if (t.kind === 'card') return (s.cards[t.card]?.controller ?? s.cards[t.card]?.owner ?? '?') + ' · ' + cardName(s,t.card);
  if (t.kind === 'ability') {
   const item = s.stack.find(i => i.id === t.ability);
   return item ? item.controller + ' · ' + cardName(s,item.kind === 'spell' ? item.card : item.source) + ' (ability)' : 'Stack ability';
  }
  return '';
 });
 return { source:cardName(s,source), controller, sourceCard:source, targets:structuredClone(actual), labels };
}
export function eventTargetNotices(s: GameState, events: GameEvent[]): TargetNotice[] {
 return events.flatMap(e => {
  if (e.type === 'AttackDeclared' || e.type === 'BlockDeclared') {
   const source = e.type === 'AttackDeclared' ? e.attacker : e.blocker;
   const target: Target = e.type === 'AttackDeclared' ? { kind:'player', player:e.defendingPlayer } : { kind:'card', card:e.attacker };
   const n = targetNotice(s,source,s.cards[source]!.controller,[target]);
   if (n) n.source += e.type === 'AttackDeclared' ? ' attacks' : ' blocks';
   return n ? [n] : [];
  }
  if (e.type !== 'SpellCast' && e.type !== 'AbilityActivated' && e.type !== 'AbilityTriggered') return [];
  const n = targetNotice(s,e.card,e.type === 'SpellCast' ? e.player : e.controller,e.targets);
  return n ? [n] : [];
 });
}
