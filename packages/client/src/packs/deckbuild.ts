// Deckbuilding rules for the deck editor, as pure functions: grouping owned
// printings by card, choosing which art each copy uses (owned arts only, user
// decision 2026-11-03), the commander and its color identity, and the curve.
// A deck card is one owned printing in one finish; arts are just printings.

import type { BoosterCard, Finish } from '@nexus/cards/boosters';
import { finishName } from '@nexus/cards/boosters';
import { CARD_DEFS, CARD_IDS_BY_NAME } from '@nexus/cards';
import { canBeCommander, canPartner, manaValue, parseManaCost } from '@nexus/engine';
import type { Collection, DeckDraft } from './collection.ts';

/** One owned printing in one finish, and how many copies the player has. */
export interface Owned {
  id: string;
  finish: Finish;
  count: number;
  card: BoosterCard;
}

/** Every owned copy of one card (by name), across its arts and finishes. */
export interface CardGroup {
  name: string;
  arts: Owned[];
  total: number;
  types: string[];
  colorIdentity: string[];
  manaValue: number;
  legendaryCreature: boolean;
}

const definition = (name: string) => CARD_DEFS[CARD_IDS_BY_NAME[name] ?? ''];

/** "Borderless", "Extended art", "Starter Kit"... what makes a printing's art different. */
export function artLabel(card: BoosterCard): string {
  const kind = card.promoTypes?.includes('starterdeck')
    ? 'Starter Kit'
    : card.border === 'borderless'
      ? 'Borderless'
      : card.frameEffects?.includes('extendedart')
        ? 'Extended art'
        : card.fullArt
          ? 'Full art'
          : card.set === 'fca'
            ? 'Through the Ages'
            : /^sl/.test(card.set)
              ? 'Secret Lair'
              : 'Regular';
  return `${kind} · ${card.set.toUpperCase()} #${card.number}`;
}

/** A printing and finish, for buttons and tooltips: "Borderless · FIN #381 · Foil". */
export function artAndFinish(o: { card: BoosterCard; finish: Finish }): string {
  return `${artLabel(o.card)} · ${finishName(o.card, o.finish)}`;
}

const isBasic = (card: BoosterCard) => /Basic Land/.test(card.typeLine);

/** The player's cards for deckbuilding (basic lands are separate: free and unlimited), one group per card name. */
export function groupCollection(collection: Collection, byId: Map<string, BoosterCard>): CardGroup[] {
  const groups = new Map<string, CardGroup>();
  for (const [id, finishes] of Object.entries(collection.cards)) {
    const card = byId.get(id);
    if (!card || isBasic(card)) continue;
    for (const [finish, count] of Object.entries(finishes) as [Finish, number][]) {
      if (!count) continue;
      let g = groups.get(card.name);
      if (!g) {
        const def = definition(card.name);
        g = {
          name: card.name,
          arts: [],
          total: 0,
          types: def?.types ?? [],
          colorIdentity: def?.colorIdentity ?? [],
          manaValue: def ? manaValue(parseManaCost(def.manaCost)) : 0,
          // Anything that can be a commander: legendary creatures, Vehicles and Spacecraft (rule 903.3).
          legendaryCreature: def ? canBeCommander(def) : /Legendary/.test(card.typeLine) && /Creature/.test(card.typeLine),
        };
        groups.set(card.name, g);
      }
      g.arts.push({ id, finish, count, card });
      g.total += count;
    }
  }
  for (const g of groups.values()) g.arts.sort(artOrder);
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Regular non-foil art first, then by set and collector number, non-foil before foils. */
function artOrder(a: Owned, b: Owned): number {
  const special = (o: Owned) => (artLabel(o.card).startsWith('Regular') ? 0 : 1);
  const finish = (o: Owned) => (o.finish === 'nonfoil' ? 0 : o.finish === 'foil' ? 1 : 2);
  return special(a) - special(b) || a.card.set.localeCompare(b.card.set) || parseInt(a.card.number, 10) - parseInt(b.card.number, 10) || finish(a) - finish(b);
}

/** How many copies of this printing and finish the deck uses. */
export function inDeck(deck: DeckDraft, o: { id: string; finish: Finish }): number {
  return deck.cards.find((c) => c.id === o.id && c.finish === o.finish)?.count ?? 0;
}

/** How many copies of a card (by name, any art) the deck uses. */
export function copiesInDeck(deck: DeckDraft, g: CardGroup): number {
  return g.arts.reduce((n, o) => n + inDeck(deck, o), 0);
}

/** Sets how many copies of one art the deck uses (0 removes it), within what's owned. Keeps the commander in place. */
export function setArtCount(deck: DeckDraft, o: Owned, count: number): DeckDraft {
  const n = Math.max(0, Math.min(o.count, Math.floor(count)));
  const at = deck.cards.findIndex((c) => c.id === o.id && c.finish === o.finish);
  const cards = [...deck.cards];
  if (at >= 0) {
    if (n > 0) cards[at] = { ...cards[at]!, count: n };
    else cards.splice(at, 1);
  } else if (n > 0) cards.push({ id: o.id, finish: o.finish, count: n });
  const commander = deck.commander && cards.some((c) => c.id === deck.commander) ? deck.commander : null;
  const partner = commander && deck.partner && cards.some((c) => c.id === deck.partner) ? deck.partner : null;
  return { ...deck, cards, commander, partner };
}

/**
 * Adds one copy of a card: in the art the deck already uses most for it (so a
 * playset stays matching), or else the first owned art with a copy free.
 */
export function addOne(deck: DeckDraft, g: CardGroup, identity?: readonly string[] | null): DeckDraft {
  if (!canAdd(deck, g, identity)) return deck;
  const free = g.arts.filter((o) => o.count - inDeck(deck, o) > 0);
  if (!free.length) return deck;
  const pick = [...free].sort((a, b) => inDeck(deck, b) - inDeck(deck, a))[0]!;
  return setArtCount(deck, pick, inDeck(deck, pick) + 1);
}

/** Every card in the deck, basic lands included. */
export function deckTotal(deck: DeckDraft): number {
  return deck.cards.reduce((n, c) => n + c.count, 0) + (['W', 'U', 'B', 'R', 'G'] as const).reduce((n, k) => n + deck.basics[k], 0);
}

/** 60-card decks: at most four copies of a card other than basic lands. */
export const MAX_COPIES = 4;
/** The smallest 60-card deck. */
export const CONSTRUCTED_DECK_SIZE = 60;

/** A Commander deck is 100 cards, commander included (rule 903.5a). */
export const COMMANDER_DECK_SIZE = 100;

/**
 * Whether another copy can go in: one you own is free; Commander decks have
 * one of each card (rule 903.5b), only cards in the commander's colors
 * (rule 903.5c), and no more than 100 cards.
 */
export function canAdd(deck: DeckDraft, g: CardGroup, identity?: readonly string[] | null): boolean {
  // 60-card decks: at most four of each card (basic lands aren't in groups; they're unlimited).
  if (deck.format === 'constructed' && copiesInDeck(deck, g) >= MAX_COPIES) return false;
  if (deck.format === 'commander') {
    if (copiesInDeck(deck, g) >= 1 || deckTotal(deck) >= COMMANDER_DECK_SIZE) return false;
    if (identity && !fitsIdentity(g, identity)) return false;
  }
  return g.total - copiesInDeck(deck, g) > 0;
}

/** Basic lands of a color can go in a Commander deck only if the commander has that color. */
export function basicAllowed(deck: DeckDraft, color: string, identity: readonly string[] | null): boolean {
  return deck.format !== 'commander' || (!!identity && identity.includes(color));
}

/** Sets how many basic lands of a color the deck has, within 0-99 and, in Commander, the 100-card limit. */
export function setBasics(deck: DeckDraft, color: 'W' | 'U' | 'B' | 'R' | 'G', n: number): DeckDraft {
  let count = Math.max(0, Math.min(99, Math.floor(n)));
  if (deck.format === 'commander') count = Math.min(count, deck.basics[color] + Math.max(0, COMMANDER_DECK_SIZE - deckTotal(deck)));
  return { ...deck, basics: { ...deck.basics, [color]: count } };
}

/** Takes out every card (and basic land) outside the commander's colors. */
export function removeOffColor(deck: DeckDraft, groups: readonly CardGroup[], identity: readonly string[]): DeckDraft {
  let d = deck;
  for (const g of groups) if (!fitsIdentity(g, identity)) for (const o of g.arts) if (inDeck(d, o)) d = setArtCount(d, o, 0);
  const basics = { ...d.basics };
  for (const k of ['W', 'U', 'B', 'R', 'G'] as const) if (!identity.includes(k)) basics[k] = 0;
  return { ...d, basics };
}

/** Removes one copy of a card, from the art with the fewest copies (never the commander's own copy while another is there). */
export function removeOne(deck: DeckDraft, g: CardGroup): DeckDraft {
  const used = g.arts.filter((o) => inDeck(deck, o) > 0).sort((a, b) => inDeck(deck, a) - inDeck(deck, b) || (a.id === deck.commander ? 1 : 0) - (b.id === deck.commander ? 1 : 0));
  const from = used[0];
  return from ? setArtCount(deck, from, inDeck(deck, from) - 1) : deck;
}

/**
 * Makes this printing and finish the commander: its card goes to the front of
 * the deck list (the game takes the commander's finish from the first entry
 * with its printing), and in Commander the other copies of that card leave.
 */
export function chooseCommander(deck: DeckDraft, g: CardGroup, o: Owned, partnerName?: string): DeckDraft {
  const others = new Set(g.arts.map((a) => `${a.id}|${a.finish}`));
  const rest = deck.cards.filter((c) => !others.has(`${c.id}|${c.finish}`));
  const partnerCard = deck.partner ? rest.find((c) => c.id === deck.partner) : undefined;
  // A partner that can't lead with the new commander stops being one (it stays in the deck).
  const keepsPartner = !!partnerCard && deck.partner !== o.id && partnersWith(o.card.name, partnerName);
  return { ...deck, format: 'commander', commander: o.id, partner: keepsPartner ? deck.partner! : null, cards: [{ id: o.id, finish: o.finish, count: 1 }, ...rest] };
}

/** Whether a card can be the partner of the named commander (both have Partner, or "Partner with" each other). */
export function partnersWith(commanderName: string, candidateName: string | undefined): boolean {
  const a = definition(commanderName);
  const b = candidateName ? definition(candidateName) : undefined;
  return !!a && !!b && canPartner(a, b);
}

/** Whether this commander can have a partner at all. */
export function hasPartner(commanderName: string): boolean {
  const d = definition(commanderName);
  return !!d && (!!d.partner || !!d.partnerWith);
}

/**
 * Makes this printing the second commander (rule 702.124): it goes second in
 * the deck list, and the other copies of that card leave.
 */
export function choosePartner(deck: DeckDraft, g: CardGroup, o: Owned): DeckDraft {
  const others = new Set(g.arts.map((a) => `${a.id}|${a.finish}`));
  const rest = deck.cards.filter((c) => !others.has(`${c.id}|${c.finish}`));
  const [first, ...after] = rest;
  const entry = { id: o.id, finish: o.finish, count: 1 };
  return { ...deck, partner: o.id, cards: first && first.id === deck.commander ? [first, entry, ...after] : [entry, ...rest] };
}

/** Takes the partner out of the command zone (its card leaves the deck too). */
export function removePartner(deck: DeckDraft): DeckDraft {
  if (!deck.partner) return deck;
  const at = deck.cards.findIndex((c, i) => c.id === deck.partner && i > 0);
  const cards = [...deck.cards];
  if (at >= 0) {
    if (cards[at]!.count > 1) cards[at] = { ...cards[at]!, count: cards[at]!.count - 1 };
    else cards.splice(at, 1);
  }
  return { ...deck, cards, partner: null };
}

/** The commander's color identity (both commanders' with a partner), or null without one. */
export function commanderIdentity(deck: DeckDraft, byId: Map<string, BoosterCard>): string[] | null {
  const card = deck.commander ? byId.get(deck.commander) : undefined;
  if (!card) return null;
  const partner = deck.partner ? byId.get(deck.partner) : undefined;
  return [...new Set([...(definition(card.name)?.colorIdentity ?? []), ...(partner ? (definition(partner.name)?.colorIdentity ?? []) : [])])];
}

/** Whether a card can go in a deck with this color identity (rule 903.4). */
export function fitsIdentity(g: CardGroup, identity: readonly string[]): boolean {
  return g.colorIdentity.every((c) => identity.includes(c));
}

/**
 * The section a card is listed under, in the collection grid and the deck.
 * A card with several types goes by the first that applies: an artifact,
 * enchantment or land creature is a Creature.
 */
export function section(g: { types: string[] }): string {
  const t = g.types;
  if (t.includes('creature')) return 'Creatures';
  if (t.includes('planeswalker')) return 'Planeswalkers';
  if (t.includes('land')) return 'Lands';
  if (t.includes('instant')) return 'Instants';
  if (t.includes('sorcery')) return 'Sorceries';
  if (t.includes('artifact')) return 'Artifacts';
  if (t.includes('enchantment')) return 'Enchantments';
  return 'Other';
}
export const SECTIONS = ['Creatures', 'Planeswalkers', 'Instants', 'Sorceries', 'Artifacts', 'Enchantments', 'Lands', 'Other'];

/** Nonland cards by mana value, 0 to 6 and 7+, for the curve. */
export function curve(deck: DeckDraft, groups: readonly CardGroup[]): number[] {
  const out = [0, 0, 0, 0, 0, 0, 0, 0];
  for (const g of groups) {
    if (g.types.includes('land')) continue;
    const n = copiesInDeck(deck, g);
    if (n) out[Math.min(7, g.manaValue)]! += n;
  }
  return out;
}

/** Cards the deck uses that aren't in the commander's colors. */
export function offColor(deck: DeckDraft, groups: readonly CardGroup[], identity: readonly string[]): string[] {
  const names = { W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest' } as const;
  const lands = (['W', 'U', 'B', 'R', 'G'] as const).filter((k) => deck.basics[k] > 0 && !identity.includes(k)).map((k) => names[k]);
  return [...groups.filter((g) => copiesInDeck(deck, g) > 0 && !fitsIdentity(g, identity)).map((g) => g.name), ...lands];
}
