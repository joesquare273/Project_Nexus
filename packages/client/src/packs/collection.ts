// The cards a player has pulled from packs, kept in this browser's local
// storage. Storage can be missing or blocked (private windows), so every
// read and write is guarded and the tab still works without it.

import type { Finish, Pack } from '@nexus/cards/boosters';

const KEY = 'nexus.packs.collection.v1';

export interface Collection {
  /** Copies owned, by Scryfall printing id and finish. */
  cards: Record<string, Partial<Record<Finish, number>>>;
  packsOpened: Partial<Record<Pack['kind'], number>>;
}

const empty = (): Collection => ({ cards: {}, packsOpened: {} });

export function loadCollection(): Collection {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<Collection>;
    return { cards: parsed.cards ?? {}, packsOpened: parsed.packsOpened ?? {} };
  } catch {
    return empty();
  }
}

function save(c: Collection): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    // Not saved; the collection still lasts for this visit.
  }
}

/** Owned copies of a printing, across finishes. */
export const owned = (c: Collection, id: string): number => Object.values(c.cards[id] ?? {}).reduce((n, k) => n + (k ?? 0), 0);

/** Adds a pack to the collection. Returns the new collection and which pulls were new printings. */
export function addPack(c: Collection, pack: Pack): { collection: Collection; fresh: boolean[] } {
  const next: Collection = { cards: { ...c.cards }, packsOpened: { ...c.packsOpened, [pack.kind]: (c.packsOpened[pack.kind] ?? 0) + 1 } };
  const fresh = pack.cards.map((p) => {
    const isNew = owned(next, p.card.id) === 0;
    const entry = { ...next.cards[p.card.id] };
    entry[p.finish] = (entry[p.finish] ?? 0) + 1;
    next.cards[p.card.id] = entry;
    return isNew;
  });
  save(next);
  return { collection: next, fresh };
}

export function resetCollection(): Collection {
  const c = empty();
  save(c);
  return c;
}
