// How good a card is for Limited (draft and sealed), from its engine
// definition: what the AI drafters pick and the AI deckbuilder plays. A rough
// 0-10 scale; cards that can't be used in games yet are worth nothing.
//
// It looks at what the card does, not its name: a creature's stats for its
// cost and its keywords, removal (destroying, exiling or damaging creatures),
// card draw, tokens, counters, and abilities in general.

import { manaValue, parseManaCost, type CardDefinition, type EffectSpec, type Keyword } from '@nexus/engine';

const KEYWORD_VALUE: Partial<Record<Keyword, number>> = {
  Flying: 1.6,
  DoubleStrike: 1.6,
  Indestructible: 1.4,
  Deathtouch: 1.1,
  FirstStrike: 0.8,
  Menace: 0.7,
  Hexproof: 0.7,
  Lifelink: 0.6,
  Trample: 0.5,
  Haste: 0.5,
  Vigilance: 0.3,
  Reach: 0.3,
  Ward: 0.4,
  Defender: -2,
} as Partial<Record<Keyword, number>>;

/** Targets that hit the opponent's side (removal) rather than your own. */
const AT_THEM = new Set(['TargetCreature', 'OpponentCreature', 'TargetPermanent', 'AnyTarget', 'EachOpponentCreature', 'AllPermanents']);

/** What one effect is worth: removal most, then card advantage and board presence. */
function effectValue(e: EffectSpec): number {
  const n = typeof e.amount === 'number' ? e.amount : 1;
  switch (e.effect) {
    case 'Destroy':
    case 'Exile':
    case 'ExileUntilSourceLeaves':
      return AT_THEM.has(e.target) ? (e.target === 'AllPermanents' ? 3 : 4.5) : 0.5;
    case 'DealDamage':
      return e.target === 'EachOpponent' || e.target === 'TargetOpponent' ? 0.6 + 0.2 * n : 2 + 0.6 * Math.min(n, 6);
    case 'DivideDamage':
      return 3.5;
    case 'Fight':
      return 3;
    case 'ModifyPT':
      return (e.toughness ?? 0) < 0 && AT_THEM.has(e.target) ? 3 : 0.6;
    case 'Counter':
      return 1.6;
    case 'DrawCards':
      return e.target === 'You' ? 0.9 * Math.min(n, 4) : 0;
    case 'CreateToken':
    case 'CreateTokenCopy':
      return 1.1 * Math.min(n, 4);
    case 'AddCounters':
      return 0.6;
    case 'ReturnToHand':
      return AT_THEM.has(e.target) ? 1.2 : 0.3;
    case 'Tap':
      return 0.5;
    case 'GainLife':
      return 0.25;
    case 'ReturnToBattlefield':
    case 'SearchLibraryToHand':
    case 'SearchLibraryToBattlefield':
      return 0.9;
    case 'Surveil':
    case 'Scry':
    case 'LookAtTopPutInHand':
    case 'LookAtTopPutMatching':
      return 0.5;
    case 'Discard':
      return e.target === 'You' ? -0.3 : 0.8;
    default:
      return 0.3;
  }
}

const sum = (effects: readonly EffectSpec[] | undefined) => (effects ?? []).reduce((n, e) => n + effectValue(e), 0);

/** A card's Limited value on a rough 0-10 scale (0 for cards the engine can't play yet). */
export function cardRating(def: CardDefinition | undefined, rarity?: string): number {
  if (!def || def.notBuilt || def.uncastable) return 0;
  if (def.supertypes?.includes('Basic')) return 0;
  const mv = manaValue(parseManaCost(def.manaCost));
  let score = 0;
  if (def.types.includes('land')) {
    // Lands that make two colors help a deck; otherwise they're filler.
    score = (def.produces?.length ?? 0) >= 2 ? 2.2 : 1;
    score += 0.6 * ((def.activated?.length ?? 0) + (def.triggers?.length ?? 0));
    return Math.min(10, score);
  }
  if (def.types.includes('creature')) {
    const p = def.power ?? 0;
    const t = def.toughness ?? 0;
    // Stats for the cost: a 2-mana 2/2 is about average.
    score += 3 + (p * 1.0 + t * 0.7) - mv * 1.15;
    for (const k of def.keywords ?? []) score += KEYWORD_VALUE[k] ?? 0.2;
  } else {
    // Noncreature spells and permanents: judged by what they do, with a small base.
    score += 1.2;
  }
  // Effects on resolution, triggers (enters, attacks, dies...) and activated abilities.
  score += sum(def.effects);
  if (def.modes?.length) score += Math.max(...def.modes.map((m) => sum(m))) + 0.4;
  for (const t of def.triggers ?? []) score += 0.4 + sum(t.effects) * (t.when === 'EntersBattlefield' ? 1 : 0.8);
  for (const a of def.activated ?? []) score += 0.2 + sum(a.effects) * 0.35;
  for (const st of def.statics ?? []) score += st.affects === 'EachMatching' ? 0.7 : 0.3;
  if (def.equip) score += 0.8;
  if (def.backFace) score += 0.6;
  // Expensive cards are harder to cast in time.
  if (mv >= 6) score -= 0.4 * (mv - 5);
  if (rarity === 'rare') score += 0.4;
  if (rarity === 'mythic') score += 0.6;
  return Math.max(0.1, Math.min(10, score));
}
