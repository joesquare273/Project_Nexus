// Display helpers for cards: definitions, colors, Scryfall info and text.

import { parseManaCost, manaProduced, COLORS, type CardDefinition, type CardDefId, type Color } from '@nexus/engine';
import { CARD_DEFS, SCRYFALL, SCRYFALL_PRINTINGS, type ScryfallInfo } from '@nexus/cards';
import { BOOSTER_CARDS, SECRET_LAIR_CARDS, type BoosterCard } from '@nexus/cards/boosters';
import { rulesSummary } from '@nexus/bots/narrate';

export function defOf(defId: CardDefId): CardDefinition {
  const def = CARD_DEFS[defId];
  if (!def) throw new Error(`Unknown card "${defId}"`);
  return def;
}

/** Pack and Secret Lair printings (variant arts), by "set/number", for printings Scryfall data doesn't cover. */
const OTHER_PRINTINGS = new Map<string, BoosterCard>([...BOOSTER_CARDS, ...SECRET_LAIR_CARDS].map((c) => [`${c.set}/${c.number}`, c]));

/**
 * The card's Scryfall details: for a deck's printing, that printing's
 * image (a variant art pulled from a pack included), or nothing when the
 * printing is unknown.
 */
export function scryfallOf(defId: CardDefId, printing?: CardDefinition['printing']): ScryfallInfo | undefined {
  if (!printing) return SCRYFALL[defId];
  const key = printing.set.toLowerCase() + '/' + printing.number;
  const exact = SCRYFALL_PRINTINGS[key];
  if (exact) return exact;
  const other = OTHER_PRINTINGS.get(key);
  const base = SCRYFALL[defId];
  // An unknown printing draws a frame rather than showing another printing's art.
  if (!other?.images[0]) return undefined;
  const { small, normal, large, artCrop } = other.images[0];
  return { ...(base ?? { typeLine: other.typeLine, oracleText: '', scryfallUri: '' }), name: other.name, set: other.set, number: other.number, ...(other.artist ? { artist: other.artist } : {}), image: { small, normal, large, artCrop } };
}

/** The printing of the card a meld card melds into: the one matching the deck's printing ("381" melds into "381b") when it exists. */
export function meldedPrinting(def: CardDefinition, printing?: CardDefinition['printing']): CardDefinition['printing'] | undefined {
  if (!def.meld) return undefined;
  if (printing) {
    const matching = { set: printing.set.toLowerCase(), number: `${printing.number}b` };
    if (SCRYFALL_PRINTINGS[`${matching.set}/${matching.number}`] || OTHER_PRINTINGS.has(`${matching.set}/${matching.number}`)) return matching;
  }
  return def.meld.resultPrinting;
}

/** Colors from the mana cost, or from the mana a land makes. */
export function colorsOf(def: CardDefinition): Color[] {
  if (def.types.includes('land')) return manaProduced(def).filter((m): m is Color => m !== 'C');
  const cost = parseManaCost(def.manaCost);
  return COLORS.filter((c) => (cost[c] ?? 0) > 0);
}

/** A CSS class for the card frame color: single color, gold, or colorless. */
export function frameClass(def: CardDefinition): string {
  const colors = colorsOf(def);
  if (def.types.includes('land') && colors.length !== 1) return 'frame-land';
  if (colors.length === 0) return 'frame-C';
  if (colors.length > 1) return 'frame-gold';
  return `frame-${colors[0]}`;
}

/** Mana symbols such as ["2", "R", "W"], in the order they're printed. */
export function costSymbols(manaCost: string | undefined): string[] {
  return [...(manaCost ?? '').matchAll(/\{([^}]+)\}/g)].map((m) => m[1]!);
}

/** Scryfall's official mana symbol images (served from *.scryfall.io, no rate limit). */
export function symbolUrl(symbol: string): string {
  return `https://svgs.scryfall.io/card-symbols/${symbol.replace('/', '')}.svg`;
}

export function typeLine(def: CardDefinition): string {
  const left = [...(def.supertypes ?? []), ...def.types.map((t) => t[0]!.toUpperCase() + t.slice(1))].join(' ');
  return def.subtypes?.length ? `${left} — ${def.subtypes.join(' ')}` : left;
}

/** Rules text: Oracle text for real cards, otherwise generated from the card's data. */
export function rulesText(def: CardDefinition): string {
  const oracle = scryfallOf(def.id)?.oracleText;
  if (oracle !== undefined) return oracle;
  return rulesSummary(def).replace(/^\d+\/\d+\s*/, '');
}

export function isCreature(def: CardDefinition): boolean {
  return def.types.includes('creature');
}
