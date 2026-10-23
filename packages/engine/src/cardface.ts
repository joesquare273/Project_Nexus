// Adventurer cards use their normal characteristics everywhere except while
// being cast as an Adventure and on the stack (rule 715).
import type { CardDefinition, CardInstance, GameState } from './types.ts';

export function spellDefinition(def: CardDefinition, adventure = false): CardDefinition {
  if (!adventure || !def.adventure) return def;
  return { id: def.id, ...def.adventure, subtypes: ['Adventure'] };
}

export function currentDefinition(s: GameState, c: CardInstance): CardDefinition {
  const def = s.cardDefs[c.defId];
  if (!def) throw new Error(`Missing card definition "${c.defId}".`);
  return spellDefinition(def, c.zone === 'stack' && !!c.adventureSpell);
}
