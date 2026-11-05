// Dismantling and crafting (docs/economy.md, "Crafting"). The browser only
// names a printing and a request id: the server works out the rarity from the
// card data (@nexus/cards/crafting) and the amounts from the economy settings
// (economy.ts), and the account store applies the change in one step, once
// per request id.
//
// - GET  /api/fragments: balances and the rules ({ fragments, rules }).
// - POST /api/dismantle { requestId, card, finish }: one copy for its fragments.
// - POST /api/dismantle/batch { requestId, items: [{ card, finish, count }] }:
//   a list of cards at once, all or nothing.
// - POST /api/craft     { requestId, card }: one non-foil copy for its rarity's fragments.

import { z } from 'zod';
import { craftable, dismantleRarity, printing, printingsNamed, type Fragments } from '@nexus/cards/crafting';
import { CraftingError, type AccountService } from './accounts.ts';
import { ECONOMY, craftCost, dismantleReward } from './economy.ts';
import { FINISHES } from './collection.ts';

const ScryfallId = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const DismantleInput = z.strictObject({ requestId: z.uuid(), card: ScryfallId, finish: z.enum(FINISHES) });
/** Most distinct cards, and copies of one, in a bulk dismantle. */
export const BATCH_LIMITS = { items: 200, copies: 999 };
const DismantleBatchInput = z.strictObject({
  requestId: z.uuid(),
  items: z.array(z.strictObject({ card: ScryfallId, finish: z.enum(FINISHES), count: z.int().min(1).max(BATCH_LIMITS.copies) })).min(1).max(BATCH_LIMITS.items),
});
const CraftInput = z.strictObject({ requestId: z.uuid(), card: ScryfallId });

export type CraftingAnswer = { status: number; body: { fragments: Fragments; applied: boolean; card: string } | { error: string } };
export type BatchAnswer = { status: number; body: { fragments: Fragments; applied: boolean; copies: number } | { error: string } };

/** The rules the browser shows (the server applies them itself). */
export const craftingRules = () => ({ ...ECONOMY.crafting });

const MESSAGES: Record<CraftingError['code'], string> = {
  not_owned: 'You don’t own that card.',
  last_copy: 'That’s your last copy of this card, so it can’t be dismantled.',
  not_enough: 'You don’t have enough fragments for that card.',
};

async function settle(run: () => Promise<{ fragments: Fragments; applied: boolean }>, card: string): Promise<CraftingAnswer> {
  try {
    const { fragments, applied } = await run();
    return { status: 200, body: { fragments, applied, card } };
  } catch (e) {
    if (e instanceof CraftingError) return { status: 409, body: { error: MESSAGES[e.code] } };
    throw e;
  }
}

/** Dismantles one copy: owned, a game card with a fragment rarity, not the last copy (if protected). */
export async function dismantleRoute(accounts: AccountService, userId: string, raw: unknown): Promise<CraftingAnswer> {
  const parsed = DismantleInput.safeParse(raw);
  if (!parsed.success) return { status: 400, body: { error: 'That request could not be read.' } };
  const { requestId, card, finish } = parsed.data;
  const rarity = dismantleRarity(card);
  if (!rarity) return { status: 400, body: { error: 'That card can’t be dismantled.' } };
  const named = printingsNamed(printing(card)!.name);
  return settle(
    () => accounts.dismantle(userId, { ref: requestId, card, finish, rarity, amount: dismantleReward(rarity, finish), named, protectLast: ECONOMY.crafting.protectLastCopy }),
    card,
  );
}

/** Dismantles a list of cards in one step: every card is checked first, and nothing changes if one can't go. */
export async function dismantleBatchRoute(accounts: AccountService, userId: string, raw: unknown): Promise<BatchAnswer> {
  const parsed = DismantleBatchInput.safeParse(raw);
  if (!parsed.success) return { status: 400, body: { error: 'That request could not be read.' } };
  const { requestId, items } = parsed.data;
  if (new Set(items.map((i) => `${i.card}|${i.finish}`)).size !== items.length) return { status: 400, body: { error: 'A card is listed twice.' } };
  const out = [];
  for (const i of items) {
    const rarity = dismantleRarity(i.card);
    if (!rarity) return { status: 400, body: { error: `${printing(i.card)?.name ?? 'A card'} can’t be dismantled.` } };
    out.push({ ...i, rarity, amount: dismantleReward(rarity, i.finish), named: printingsNamed(printing(i.card)!.name) });
  }
  try {
    const { fragments, applied } = await accounts.dismantleMany(userId, { ref: requestId, items: out, protectLast: ECONOMY.crafting.protectLastCopy });
    return { status: 200, body: { fragments, applied, copies: items.reduce((n, i) => n + i.count, 0) } };
  } catch (e) {
    if (!(e instanceof CraftingError)) throw e;
    const name = (e.card && printing(e.card)?.name) ?? 'a card';
    const error =
      e.code === 'last_copy' ? `That would dismantle your last copy of ${name}, so nothing was dismantled.` : e.code === 'not_owned' ? `You don’t have that many copies of ${name}, so nothing was dismantled.` : MESSAGES[e.code];
    return { status: 409, body: { error } };
  }
}

/** Crafts one non-foil copy of a craftable printing with fragments of its rarity. */
export async function craftRoute(accounts: AccountService, userId: string, raw: unknown): Promise<CraftingAnswer> {
  const parsed = CraftInput.safeParse(raw);
  if (!parsed.success) return { status: 400, body: { error: 'That request could not be read.' } };
  const { requestId, card } = parsed.data;
  const c = craftable(card);
  if (!c) return { status: 400, body: { error: 'That card can’t be crafted.' } };
  return settle(() => accounts.craft(userId, { ref: requestId, card, rarity: c.rarity, cost: craftCost(c.rarity) }), card);
}
