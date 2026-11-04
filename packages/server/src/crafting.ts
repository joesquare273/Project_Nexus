// Dismantling and crafting (docs/economy.md, "Crafting"). The browser only
// names a printing and a request id: the server works out the rarity from the
// card data (@nexus/cards/crafting) and the amounts from the economy settings
// (economy.ts), and the account store applies the change in one step, once
// per request id.
//
// - GET  /api/fragments: balances and the rules ({ fragments, rules }).
// - POST /api/dismantle { requestId, card, finish }: one copy for its fragments.
// - POST /api/craft     { requestId, card }: one non-foil copy for its rarity's fragments.

import { z } from 'zod';
import { craftable, dismantleRarity, printing, printingsNamed, type Fragments } from '@nexus/cards/crafting';
import { CraftingError, type AccountService } from './accounts.ts';
import { ECONOMY, craftCost, dismantleReward } from './economy.ts';
import { FINISHES } from './collection.ts';

const ScryfallId = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const DismantleInput = z.strictObject({ requestId: z.uuid(), card: ScryfallId, finish: z.enum(FINISHES) });
const CraftInput = z.strictObject({ requestId: z.uuid(), card: ScryfallId });

export type CraftingAnswer = { status: number; body: { fragments: Fragments; applied: boolean; card: string } | { error: string } };

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

/** Crafts one non-foil copy of a craftable printing with fragments of its rarity. */
export async function craftRoute(accounts: AccountService, userId: string, raw: unknown): Promise<CraftingAnswer> {
  const parsed = CraftInput.safeParse(raw);
  if (!parsed.success) return { status: 400, body: { error: 'That request could not be read.' } };
  const { requestId, card } = parsed.data;
  const c = craftable(card);
  if (!c) return { status: 400, body: { error: 'That card can’t be crafted.' } };
  return settle(() => accounts.craft(userId, { ref: requestId, card, rarity: c.rarity, cost: craftCost(c.rarity) }), card);
}
