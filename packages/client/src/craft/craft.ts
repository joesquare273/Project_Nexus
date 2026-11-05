// The Craft tab's requests and rules for showing them. The game server does
// every change (POST /api/dismantle/batch, /api/craft) and answers with the new
// fragment balances; the browser only asks and shows the result. Each
// confirmed action has its own request id, kept for retries, so a repeat
// never pays or crafts twice.

import type { FragmentRarity, Fragments } from '@nexus/cards/crafting';
import type { ECONOMY } from '@nexus/server/economy';
import type { Collection, SavedDeck } from '../packs/collection.ts';

export type CraftingRules = (typeof ECONOMY)['crafting'];

export const RARITY_NAMES: Record<FragmentRarity, string> = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', mythic: 'Mythic' };

async function failure(res: Response, fallback: string): Promise<Error> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return new Error(body.error ?? fallback);
}

export async function fetchFragments(token: string): Promise<{ fragments: Fragments; rules: CraftingRules }> {
  const res = await fetch('/api/fragments', { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw await failure(res, 'Your fragments could not be loaded.');
  return (await res.json()) as { fragments: Fragments; rules: CraftingRules };
}

async function post(token: string, path: string, body: unknown, fallback: string): Promise<{ fragments: Fragments; applied: boolean }> {
  const res = await fetch(path, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw await failure(res, fallback);
  return (await res.json()) as { fragments: Fragments; applied: boolean };
}

/** One card in the dismantle list: `count` copies of a printing in a finish. */
export interface ListEntry {
  card: string;
  finish: string;
  count: number;
  rarity: FragmentRarity;
}

/** Dismantles the whole list in one step (all or nothing). */
export const dismantleList = (token: string, requestId: string, list: readonly ListEntry[]) =>
  post(token, '/api/dismantle/batch', { requestId, items: list.map(({ card, finish, count }) => ({ card, finish, count })) }, 'Those cards could not be dismantled. Try again.');

export const craftCard = (token: string, requestId: string, card: string) => post(token, '/api/craft', { requestId, card }, 'That card could not be crafted. Try again.');

/** Fragments for dismantling one copy (the server's own sum, for the confirmation). */
export const rewardFor = (rules: CraftingRules, rarity: FragmentRarity, finish: string) => rules.dismantle[rarity] + (finish === 'nonfoil' ? 0 : rules.foilBonus);

/** The fragments the whole list gives, by rarity. */
export function listReward(rules: CraftingRules, list: readonly ListEntry[]): Fragments {
  const out: Fragments = { common: 0, uncommon: 0, rare: 0, mythic: 0 };
  for (const e of list) out[e.rarity] += rewardFor(rules, e.rarity, e.finish) * e.count;
  return out;
}

/**
 * The most copies of a printing in a finish the list can hold: what you own
 * of it, and, when your last copy of a card is kept, one copy of the card
 * (any art or finish) left after the rest of the list.
 */
export function listRoom(collection: Collection, named: readonly string[], list: readonly ListEntry[], card: string, finish: string, protectLast: boolean): number {
  const own = collection.cards[card]?.[finish as keyof Collection['cards'][string]] ?? 0;
  if (!protectLast) return own;
  const others = list.filter((e) => named.includes(e.card) && !(e.card === card && e.finish === finish)).reduce((n, e) => n + e.count, 0);
  return Math.max(0, Math.min(own, copiesOfCard(collection, named) - 1 - others));
}

/** Whether a card can be crafted now, and why not when it can't. */
export function craftStatus(rules: CraftingRules, fragments: Fragments, rarity: FragmentRarity): { ok: boolean; reason?: string } {
  const cost = rules.craft[rarity];
  if (fragments[rarity] >= cost) return { ok: true };
  return { ok: false, reason: `Needs ${cost} ${RARITY_NAMES[rarity]} Fragments (you have ${fragments[rarity]}).` };
}

/** The Craft view's owned filter: every card, cards you own (any art or finish), or cards you don't. */
export type Ownership = 'all' | 'owned' | 'unowned';
export const ownershipMatches = (copies: number, ownership: Ownership) => ownership === 'all' || (copies > 0) === (ownership === 'owned');

/** Copies owned of every printing of a card (any art or finish). */
export const copiesOfCard = (collection: Collection, printingIds: readonly string[]) =>
  printingIds.reduce((n, id) => n + Object.values(collection.cards[id] ?? {}).reduce((m, k) => m + (k ?? 0), 0), 0);

/**
 * Warnings before dismantling copies of a printing in a finish: the saved
 * decks that use more copies of it than would be left (the deck can't be
 * played until it's fixed). Dismantling is still allowed (user, 2026-11-04).
 */
export function deckWarnings(decks: readonly SavedDeck[], collection: Collection, card: string, finish: string, removing = 1): string[] {
  const left = (collection.cards[card]?.[finish as keyof Collection['cards'][string]] ?? 0) - removing;
  return decks
    .filter((d) => d.cards.filter((c) => c.id === card && c.finish === finish).reduce((n, c) => n + c.count, 0) > left)
    .map((d) => d.name);
}
