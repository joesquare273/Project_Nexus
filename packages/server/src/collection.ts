// Collections and saved decks (economy step E1b). A collection is the cards a
// player owns, one entry per printing and finish; a deck is a named list of
// owned cards plus free basic lands. The browser sends decks; the server
// checks them against the collection before saving. Whether a deck is legal
// to play (size, copies) is checked when a game starts, so a deck in progress
// can be saved.

import { z } from 'zod';

export const FINISHES = ['nonfoil', 'foil', 'surge'] as const;
export type Finish = (typeof FINISHES)[number];
export const DECK_FORMATS = ['commander', 'limited', 'constructed'] as const;
export type DeckFormat = (typeof DECK_FORMATS)[number];

/** Cards of one printing and finish. `id` is the Scryfall printing id. */
export interface OwnedCard {
  id: string;
  finish: Finish;
  count: number;
}

export const MAX_DECKS = 100;

const ScryfallId = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const Basic = z.number().int().min(0).max(99);

export const DeckInput = z.strictObject({
  /** Present when changing a saved deck. */
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(40),
  format: z.enum(DECK_FORMATS),
  cards: z.array(z.strictObject({ id: ScryfallId, finish: z.enum(FINISHES), count: z.number().int().min(1).max(99) })).max(250),
  basics: z.strictObject({ W: Basic, U: Basic, B: Basic, R: Basic, G: Basic }),
  /** Commander decks: the commander's printing id, which must be in `cards`. */
  commander: ScryfallId.nullable().optional(),
});
export type DeckInput = z.infer<typeof DeckInput>;

export interface SavedDeck extends Omit<DeckInput, 'id' | 'commander'> {
  id: string;
  commander: string | null;
  updatedAt: string;
}

const key = (c: { id: string; finish: string }) => `${c.id}|${c.finish}`;

/** Why a deck can't be saved with this collection, or null if it can. */
export function deckProblem(deck: DeckInput, owned: readonly OwnedCard[]): string | null {
  const have = new Map(owned.map((c) => [key(c), c.count]));
  const want = new Map<string, number>();
  for (const c of deck.cards) want.set(key(c), (want.get(key(c)) ?? 0) + c.count);
  for (const [k, n] of want) {
    if (n > (have.get(k) ?? 0)) return 'The deck uses cards you do not own.';
  }
  if (deck.commander) {
    if (deck.format !== 'commander') return 'Only Commander decks have a commander.';
    if (!deck.cards.some((c) => c.id === deck.commander)) return 'The commander must be one of the deck’s cards.';
  }
  return null;
}

/** Adds cards to a collection list (the in-memory store and tests). */
export function addCards(owned: OwnedCard[], cards: readonly OwnedCard[]): void {
  for (const c of cards) {
    const found = owned.find((o) => key(o) === key(c));
    if (found) found.count += c.count;
    else owned.push({ ...c });
  }
}
