// Adventurer cards use their normal characteristics everywhere except while
// being cast as an Adventure and on the stack (rule 715).
import { CREATURE_SUBTYPES } from './subtypes.ts';
import type { CardDefinition, CardInstance, GameState, StaticSpec } from './types.ts';

export function spellDefinition(def: CardDefinition, adventure = false): CardDefinition {
  if (!adventure || !def.adventure) return def;
  return { id: def.id, ...def.adventure, subtypes: ['Adventure'] };
}

/** Copy effects operate on these values, before type/color changes, buffs, counters or crew. */
export function copiableDefinition(s: GameState, c: CardInstance): CardDefinition {
  let copy = c.zone === 'battlefield' ? c.copy : undefined;
  while (copy?.untilTurn !== undefined && copy.untilTurn < s.turnNumber) copy = copy.previous;
  return copy?.definition ?? s.cardDefs[c.defId]!;
}

// A state is cloned for each action. Within that action, index only sources
// with layer-4/5 abilities. Entry/attachment timestamps and battlefield size
// invalidate the index; conditions and source identity are still read live.
const sourceCache = new WeakMap<GameState, { version: number; count: number; defs: GameState['cardDefs']; sources: CardInstance[] }>();
export function continuousSources(s: GameState): CardInstance[] {
  const count = s.turnOrder.reduce((n,p)=>n+s.players[p]!.battlefield.length,0);
  const version = s.effectTimestamp ?? 0;
  const cached = sourceCache.get(s);
  if (cached?.version === version && cached.count === count && cached.defs === s.cardDefs) return cached.sources;
  const sources = s.turnOrder.flatMap(p=>s.players[p]!.battlefield.map(id=>s.cards[id]!)).filter(c=>
    copiableDefinition(s,c).statics?.some(st=>st.goaded || st.addSubtypes || st.setCreatureTypes || st.setColors || st.losesAllAbilities || st.noncreatureIfGraveyardBelow !== undefined));
  sourceCache.set(s,{version,count,defs:s.cardDefs,sources});
  return sources;
}

export function currentDefinition(s: GameState, c: CardInstance): CardDefinition {
  const def = copiableDefinition(s,c);
  if (!def) throw new Error(`Missing card definition "${c.defId}".`);
  if (c.zone !== 'battlefield') return spellDefinition(def, c.zone === 'stack' && !!c.adventureSpell);
  let out = def;
  const change = () => { if (out === def) out = { ...def }; };
  if (c.crewed) { change(); out.types = [...new Set([...out.types, 'artifact' as const, 'creature' as const])]; }
  // Type/color effects never ask for power or abilities, avoiding a recursive layer evaluation.
  const layers: { source: CardInstance; spec: StaticSpec; timestamp: number }[] = [];
  for (const source of continuousSources(s)) {
    if (source.phasedOut || (source.id !== c.id && source.attachedTo !== c.id)) continue;
    for (const spec of copiableDefinition(s,source).statics ?? []) {
      if (spec.zone || spec.affects === 'EachMatching' || !(spec.addSubtypes || spec.setCreatureTypes || spec.setColors || spec.losesAllAbilities || spec.noncreatureIfGraveyardBelow !== undefined)) continue;
      if ((spec.affects === 'Self' ? source.id : source.attachedTo) !== c.id) continue;
      if (spec.conditions?.some(condition =>
        condition === 'yourTurn' ? s.activePlayer !== source.controller :
        condition === 'legendary' ? !def.supertypes?.includes('Legendary') :
        condition === 'twoNoncreatureSpellsThisTurn' ? (s.players[source.controller]!.noncreatureSpellsThisTurn ?? 0) < 2 :
        condition === 'attached' ? !source.attachedTo :
        condition === 'equipped' ? !s.turnOrder.some(p => s.players[p]!.battlefield.some(id => s.cards[id]!.attachedTo === c.id && copiableDefinition(s,s.cards[id]!).subtypes?.includes('Equipment'))) : false)) continue;
      layers.push({ source, spec, timestamp: (spec.affects === 'EquippedCreature' ? source.attachedTimestamp : undefined) ?? source.enteredTimestamp ?? 0 });
    }
  }
  for (const {source,spec} of layers.sort((a,b)=>a.timestamp-b.timestamp)) {
    if (spec.noncreatureIfGraveyardBelow !== undefined && s.players[source.controller]!.graveyard.length < spec.noncreatureIfGraveyardBelow) {
      change(); out.types = out.types.filter(t => t !== 'creature'); out.subtypes = (out.subtypes ?? []).filter(t => !CREATURE_SUBTYPES.has(t));
    }
    if (spec.setCreatureTypes && out.types.includes('creature')) { change(); out.subtypes = [...(out.subtypes ?? []).filter(t=>!CREATURE_SUBTYPES.has(t)), ...spec.setCreatureTypes]; }
    if (spec.addSubtypes) { change(); out.subtypes = [...new Set([...(out.subtypes ?? []), ...spec.addSubtypes])]; }
    if (spec.setColors) { change(); out.colors = [...spec.setColors]; }
    // Layer 6 (rule 613.1f): only its name, types, mana cost, colors and power/toughness remain.
    if (spec.losesAllAbilities) {
      change();
      const kept: CardDefinition = { id: out.id, name: out.name, types: out.types };
      for (const key of ['supertypes', 'subtypes', 'manaCost', 'colors', 'colorIdentity', 'power', 'toughness', 'printing', 'token', 'enchant'] as const) {
        if (out[key] !== undefined) (kept as unknown as Record<string, unknown>)[key] = out[key];
      }
      out = kept;
    }
  }
  return out;
}
