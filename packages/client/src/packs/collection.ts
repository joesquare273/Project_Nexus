// The cards a player owns, from their account on the game server
// (GET /api/collection). Packs are bought and opened by the server
// (POST /api/packs/open), which adds the cards; the browser only shows them.

import type { Finish, Pack, PackKind } from '@nexus/cards/boosters';

export interface Collection {
  /** Copies owned, by Scryfall printing id and finish. */
  cards: Record<string, Partial<Record<Finish, number>>>;
}

/** Owned copies of a printing, across finishes. */
export const owned = (c: Collection, id: string): number => Object.values(c.cards[id] ?? {}).reduce((n, k) => n + (k ?? 0), 0);

/** Adds a pack the server opened to the shown collection. Returns the new collection and which pulls were new printings. */
export function addPack(c: Collection, pack: Pack): { collection: Collection; fresh: boolean[] } {
  const next: Collection = { cards: { ...c.cards } };
  const fresh = pack.cards.map((p) => {
    const isNew = owned(next, p.card.id) === 0;
    const entry = { ...next.cards[p.card.id] };
    entry[p.finish] = (entry[p.finish] ?? 0) + 1;
    next.cards[p.card.id] = entry;
    return isNew;
  });
  return { collection: next, fresh };
}

/** An error the player should see, with the server's message when it sent one. */
async function failure(res: Response, fallback: string): Promise<Error> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return new Error(body.error ?? fallback);
}

export async function fetchCollection(token: string): Promise<Collection> {
  const res = await fetch('/api/collection', { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw await failure(res, 'Your collection could not be loaded.');
  const body = (await res.json()) as { cards: { id: string; finish: Finish; count: number }[] };
  const c: Collection = { cards: {} };
  for (const card of body.cards) c.cards[card.id] = { ...c.cards[card.id], [card.finish]: card.count };
  return c;
}

/** Buys and opens one booster on the server. */
export async function buyPack(token: string, kind: PackKind): Promise<{ pack: Pack; balance: number }> {
  const res = await fetch('/api/packs/open', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind }),
  });
  if (!res.ok) throw await failure(res, 'The pack could not be opened. Try again.');
  return (await res.json()) as { pack: Pack; balance: number };
}

export type DeckFormat = 'commander' | 'limited' | 'constructed';
export type Basics = { W: number; U: number; B: number; R: number; G: number };

/** A deck saved on the account (GET/POST /api/decks). */
export interface SavedDeck {
  id: string;
  name: string;
  format: DeckFormat;
  cards: { id: string; finish: Finish; count: number }[];
  basics: Basics;
  commander: string | null;
  updatedAt: string;
}

export type DeckDraft = Omit<SavedDeck, 'id' | 'updatedAt'> & { id?: string };

export async function fetchDecks(token: string): Promise<SavedDeck[]> {
  const res = await fetch('/api/decks', { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw await failure(res, 'Your decks could not be loaded.');
  return ((await res.json()) as { decks: SavedDeck[] }).decks;
}

export async function saveDeck(token: string, deck: DeckDraft): Promise<SavedDeck> {
  const res = await fetch('/api/decks', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(deck),
  });
  if (!res.ok) throw await failure(res, 'The deck could not be saved.');
  return (await res.json()) as SavedDeck;
}

export async function deleteDeck(token: string, id: string): Promise<void> {
  const res = await fetch(`/api/decks/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw await failure(res, 'The deck could not be deleted.');
}
