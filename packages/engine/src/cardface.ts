// Adventurer cards use their normal characteristics everywhere except while
// being cast as an Adventure and on the stack (rule 715).
import { CREATURE_SUBTYPES } from './subtypes.ts';
import type { CardDefId, CardDefinition, CardInstance, GameState, StaticSpec, TriggerSpec } from './types.ts';

export function spellDefinition(def: CardDefinition, adventure = false): CardDefinition {
  if (!adventure || !def.adventure) return def;
  return { id: def.id, ...def.adventure, subtypes: ['Adventure'] };
}

/** Copy effects operate on these values, before type/color changes, buffs, counters or crew. */
const prepareFaces = new WeakMap<CardDefinition, CardDefinition>();
/** A prepare spell's characteristics (the creature card's alternative characteristics). */
export function prepareDefinition(def: CardDefinition): CardDefinition {
  let face = prepareFaces.get(def);
  if (!face) {
    face = { id: def.id, ...def.prepare!, ...(def.printing ? { printing: def.printing } : {}) };
    prepareFaces.set(def, face);
  }
  return face;
}

export function copiableDefinition(s: GameState, c: CardInstance): CardDefinition {
  // The copy of a prepare spell, in exile or on the stack.
  if (c.prepareSpellOf && s.cardDefs[c.defId]?.prepare) return prepareDefinition(s.cardDefs[c.defId]!);
  // A face-down permanent or spell's copiable values are its face-down characteristics (rule 707.2, 708.2).
  if (c.faceDown) return faceDownCharacteristics(c);
  let copy = c.zone === 'battlefield' ? c.copy : undefined;
  while (copy?.untilTurn !== undefined && copy.untilTurn < s.turnNumber) copy = copy.previous;
  if (copy) return copy.definition;
  const def = s.cardDefs[c.defId]!;
  return c.transformed && c.zone === 'battlefield' && def?.backFace ? backFaceDefinition(def) : def;
}

const backFaces = new WeakMap<CardDefinition, CardDefinition>();
/** A transformed permanent's characteristics: the back face, with the front face's mana value (rule 712.8e). */
export function backFaceDefinition(def: CardDefinition): CardDefinition {
  let back = backFaces.get(def);
  if (!back) {
    // A melded permanent's mana value is the total of its front faces' (rule 712.8g).
    const manaCost = def.meld?.manaCost ?? def.manaCost;
    back = { id: def.id, ...def.backFace!, ...(manaCost ? { manaCost } : {}), colors: def.backFace!.colors ?? [] };
    backFaces.set(def, back);
  }
  return back;
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
    copiableDefinition(s,c).statics?.some(st=>st.goaded || st.planeswalkersHave || st.addSubtypes || st.setCreatureTypes || st.setColors || st.losesAllAbilities || st.artifactsAreFoods || st.enchantedBecomesCreature || st.noncreatureIfGraveyardBelow !== undefined));
  sourceCache.set(s,{version,count,defs:s.cardDefs,sources});
  return sources;
}

/** A face-down permanent or spell's characteristics (rule 708.2): online, other players see only this id. */
export const FACE_DOWN_CARD: CardDefinition = { id: '?facedown', name: 'Face-down creature', types: ['creature'], power: 2, toughness: 2, colors: [] };
/** Face down with ward {2}: disguised or cloaked (rules 702.168a, 701.58a). */
export const FACE_DOWN_WARD_CARD: CardDefinition = { ...FACE_DOWN_CARD, id: '?facedown-ward', ward: 2 };
export const FACE_DOWN_IDS: ReadonlySet<string> = new Set([FACE_DOWN_CARD.id, FACE_DOWN_WARD_CARD.id]);

/** The face-down characteristics of this face-down object: copiable values too (rule 707.2). */
export function faceDownCharacteristics(c: CardInstance): CardDefinition {
  return c.faceDownWard ? FACE_DOWN_WARD_CARD : FACE_DOWN_CARD;
}

/**
 * What its controller pays to turn this face-down permanent face up, if anything: its
 * morph or disguise cost, or (manifested or cloaked) a creature card's mana cost (rules 702.37e, 702.168d, 701.34a).
 */
export function turnFaceUpCost(s: GameState, c: CardInstance): string | undefined {
  const def = s.cardDefs[c.defId];
  if (!c.faceDown || !def || FACE_DOWN_IDS.has(def.id)) return undefined;
  if (def.morph) return def.morph;
  if (def.disguise) return def.disguise;
  if (c.manifested && def.types.includes('creature') && def.manaCost) return def.manaCost;
  return undefined;
}

/**
 * The card a copy of this permanent shows, and the id its token copies get (rule 707.2):
 * a copy of a face-down permanent is a face-up nameless 2/2, so it shows nothing of the card.
 */
export function copyLook(s: GameState, c: CardInstance): { defId: CardDefId; artDefId: CardDefId; printing?: CardDefinition['printing'] } {
  if (c.faceDown) {
    const d = faceDownCharacteristics(c);
    if (s.cardDefs[d.id] !== d) s.cardDefs = { ...s.cardDefs, [d.id]: d };
    return { defId: d.id, artDefId: d.id };
  }
  const printing = c.copy?.printing ?? c.printing ?? copiableDefinition(s, c).printing;
  return { defId: c.defId, artDefId: c.copy?.artDefId ?? c.defId, ...(printing ? { printing } : {}) };
}

/** Prowess (rule 702.108a): the triggered ability the keyword stands for. */
const PROWESS_TRIGGER: TriggerSpec = { when: 'SpellCast', what: { nonTypes: ['creature'], controller: 'You' }, effects: [{ effect: 'ModifyPT', power: 1, toughness: 1, target: 'This' }] };

export function currentDefinition(s: GameState, c: CardInstance): CardDefinition {
  let out = definitionWithEffects(s, c);
  // Each instance of prowess triggers separately (Ruric Thar: "Prowess, prowess").
  const prowess = out.keywords?.filter((k) => k === 'Prowess').length ?? 0;
  if (prowess) out = { ...out, triggers: [...(out.triggers ?? []), ...Array<TriggerSpec>(prowess).fill(PROWESS_TRIGGER)] };
  // "Planeswalkers you control have '[−2]: ...'" (the "Way of the ..." enchantments): after its own abilities.
  if (c.zone === 'battlefield' && out.types.includes('planeswalker')) {
    const granted = continuousSources(s).flatMap((src) => (src.controller === c.controller && !src.phasedOut ? (copiableDefinition(s, src).statics ?? []).flatMap((st) => st.planeswalkersHave ?? []) : []));
    if (granted.length) out = { ...out, activated: [...(out.activated ?? []), ...granted] };
  }
  // Turning a face-down permanent face up is a special action (rule 116.2b), not an ability, so nothing removes it.
  if (!c.faceDown || c.zone !== 'battlefield') return out;
  const cost = turnFaceUpCost(s, c);
  return cost ? { ...out, activated: [...(out.activated ?? []), { cost: { mana: cost }, turnFaceUp: true, effects: [] }] } : out;
}

function definitionWithEffects(s: GameState, c: CardInstance): CardDefinition {
  const def = copiableDefinition(s,c);
  if (!def) throw new Error(`Missing card definition "${c.defId}".`);
  if (c.zone !== 'battlefield') return withGrantedWarp(s, c, spellDefinition(def, c.zone === 'stack' && !!c.adventureSpell));
  let out = def;
  const change = () => { if (out === def) out = { ...def }; };
  if (c.crewed) { change(); out.types = [...new Set([...out.types, 'artifact' as const, 'creature' as const])]; }
  // Purphoros: "as long as your devotion to red is less than five, Purphoros isn't a creature" (printed mana costs, rule 700.5).
  if (def.creatureOnlyWithDevotion) {
    const { color, atLeast } = def.creatureOnlyWithDevotion;
    const devotion = Object.values(s.cards).filter((x) => x.zone === 'battlefield' && x.controller === c.controller && !x.phasedOut)
      .reduce((n, x) => n + ((s.cardDefs[x.defId]?.manaCost ?? '').match(new RegExp(`\\{[^}]*${color}[^}]*\\}`, 'g'))?.length ?? 0), 0);
    if (devotion < atLeast) { change(); out.types = out.types.filter((t) => t !== 'creature'); }
  }
  // Impending: not a creature while it has a time counter (rule 702.176).
  if (def.alternativeCost?.impending && (c.namedCounters?.time ?? 0) > 0) { change(); out.types = out.types.filter((t) => t !== 'creature'); }
  // Puppet Crafting: "Enchanted permanent is a Construct creature with base power and toughness 5/5 in addition to its other types."
  for (const aura of continuousSources(s)) {
    if (aura.attachedTo !== c.id || aura.phasedOut) continue;
    for (const st of copiableDefinition(s, aura).statics ?? []) {
      if (!st.enchantedBecomesCreature) continue;
      change();
      out.types = [...new Set([...out.types, 'creature' as const])];
      out.subtypes = [...new Set([...(out.subtypes ?? []), ...(st.enchantedBecomesCreature.subtypes ?? [])])];
      out.power = st.enchantedBecomesCreature.power;
      out.toughness = st.enchantedBecomesCreature.toughness;
    }
  }
  // "Becomes a 7/7 Beast creature in addition to its other types" (Ride the Shoopuf).
  if (c.animated) {
    change();
    out.types = [...new Set([...out.types, 'creature' as const])];
    out.subtypes = [...new Set([...(out.subtypes ?? []), ...(c.animated.subtypes ?? [])])];
    out.power = c.animated.power;
    out.toughness = c.animated.toughness;
    if (c.animated.colors) out.colors = [...c.animated.colors];
    if (c.animated.keywords) out.keywords = [...new Set([...(out.keywords ?? []), ...c.animated.keywords])];
    if (c.animated.statics) out.statics = [...(out.statics ?? []), ...c.animated.statics];
    if (c.animated.triggers) out.triggers = [...(out.triggers ?? []), ...c.animated.triggers];
  }
  // Station (rule 702.184): an artifact creature at its threshold, and abilities that only work with enough charge counters.
  if (def.station) {
    const charge = c.namedCounters?.charge ?? 0;
    change();
    if (def.station.creatureAt !== undefined && charge >= def.station.creatureAt) out.types = [...new Set([...out.types, 'creature' as const])];
    if (out.statics?.some((st) => (st.stationLevel ?? 0) > charge)) out.statics = out.statics.filter((st) => (st.stationLevel ?? 0) <= charge);
  }
  // "As long as this has N or more counters on it" (Gavel of the Righteous).
  if (out.statics?.some((st) => st.ifSourceCountersAtLeast !== undefined)) {
    const n = (c.counters ?? 0) + Object.values(c.namedCounters ?? {}).reduce((a, k) => a + (k ?? 0), 0);
    change();
    out.statics = out.statics!.filter((st) => st.ifSourceCountersAtLeast === undefined || n >= st.ifSourceCountersAtLeast);
  }
  // Xu-Ifit: "It ... has no abilities."
  if (c.lostAbilities || c.lostAbilitiesTurn === s.turnNumber) {
    change();
    const kept: CardDefinition = { id: out.id, name: out.name, types: out.types };
    for (const key of ['supertypes', 'subtypes', 'manaCost', 'colors', 'colorIdentity', 'power', 'toughness', 'printing', 'token'] as const) {
      if (out[key] !== undefined) (kept as unknown as Record<string, unknown>)[key] = out[key];
    }
    out = kept;
  }
  if (c.addedSubtypes) { change(); out.subtypes = [...new Set([...(out.subtypes ?? []), ...c.addedSubtypes])]; }
  if (c.turnSubtypes) { change(); out.subtypes = [...new Set([...(out.subtypes ?? []), ...c.turnSubtypes])]; }
  // Ultima, Origin of Oblivion: "For as long as that land has a blight counter on it, it loses all land types and abilities and has '{T}: Add {C}.'"
  if ((c.namedCounters?.blight ?? 0) > 0 && out.types.includes('land')) {
    change();
    out.subtypes = (out.subtypes ?? []).filter((t) => CREATURE_SUBTYPES.has(t));
    for (const key of ['triggers', 'activated', 'statics', 'keywords', 'manaAbility', 'entersTapped', 'entersTappedUnless', 'landcycling', 'cycling', 'adventure'] as const) delete (out as Partial<CardDefinition>)[key];
    out.produces = ['C'];
  }
  // Ragost: "Artifacts you control are Foods in addition to their other types and have '{2}, {T}, Sacrifice this artifact: You gain 3 life.'"
  if (out.types.includes('artifact') && continuousSources(s).some((src) => src.controller === c.controller && !src.phasedOut && copiableDefinition(s, src).statics?.some((st) => st.artifactsAreFoods))) {
    change();
    out.subtypes = [...new Set([...(out.subtypes ?? []), 'Food'])];
    out.activated = [...(out.activated ?? []), { cost: { mana: '{2}', tap: true, sacrificeThis: true }, effects: [{ effect: 'GainLife', amount: 3, target: 'You' }] }];
  }
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
        condition === 'twoSpellsThisTurn' ? (s.players[source.controller]!.spellsCastThisTurn ?? 0) < 2 :
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

/** Tannuk, Steadfast Second: "Artifact cards and red creature cards in your hand have warp {2}{R}" (kept while the spell is on the stack). */
function withGrantedWarp(s: GameState, c: CardInstance, def: CardDefinition): CardDefinition {
  if ((c.zone !== 'hand' && c.zone !== 'stack') || def.alternativeCost || def.types.includes('land')) return def;
  const red = def.colors ? def.colors.includes('R') : /\{[^}]*R[^}]*\}/.test(def.manaCost ?? '');
  if (!def.types.includes('artifact') && !(def.types.includes('creature') && red)) return def;
  for (const pid of s.turnOrder) {
    for (const id of s.players[pid]!.battlefield) {
      const p = s.cards[id]!;
      if (p.controller !== c.owner || p.phasedOut) continue;
      const mana = s.cardDefs[p.defId]?.statics?.find((st) => st.grantWarpInHand)?.grantWarpInHand;
      if (mana) return { ...def, alternativeCost: { label: 'Warp', mana, warp: true } };
    }
  }
  return def;
}
