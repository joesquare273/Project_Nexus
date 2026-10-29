// The free starter (economy step E1c): a new player picks one of the four
// Final Fantasy Commander precons. It's granted once per account (ledger ref
// 'starter', whichever precon they pick): its exact printings go into the
// collection and it's saved as a Commander deck.

import { FIN_PRECONS, SCRYFALL_PRINTINGS, type KitCard } from '@nexus/cards';
import type { AccountService, AccountUser } from './accounts.ts';
import type { OwnedCard, SavedDeck } from './collection.ts';

export const STARTER_REF = 'starter';

export interface StarterChoice {
  name: string;
  commander: string;
  colorIdentity: string[];
}

export const STARTER_CHOICES: StarterChoice[] = FIN_PRECONS.map((p) => ({ name: p.name, commander: p.commander.name, colorIdentity: p.colorIdentity }));

const printingId = (c: KitCard): string => {
  const id = SCRYFALL_PRINTINGS[`${c.set}/${c.number}`]?.scryfallId;
  if (!id) throw new Error(`No Scryfall printing for ${c.name} (${c.set}/${c.number}).`);
  return id;
};

/** A precon's cards (one entry per printing, nonfoil) and its commander's printing id. */
export function preconCards(name: string): { cards: OwnedCard[]; commander: string } | null {
  const precon = FIN_PRECONS.find((p) => p.name === name);
  if (!precon) return null;
  const counts = new Map<string, number>();
  for (const c of [precon.commander, ...precon.cards]) counts.set(printingId(c), (counts.get(printingId(c)) ?? 0) + c.count);
  return { cards: [...counts].map(([id, count]) => ({ id, finish: 'nonfoil', count })), commander: printingId(precon.commander) };
}

/**
 * Grants the chosen precon if the player hasn't had their starter yet, and
 * saves it as a deck. Null if the name isn't a precon; `granted: false` if
 * they already had one.
 */
export async function claimStarter(accounts: AccountService, user: AccountUser, name: string): Promise<{ granted: boolean; deck: SavedDeck | null } | null> {
  const precon = preconCards(name);
  if (!precon) return null;
  await accounts.ensure(user);
  const { applied } = await accounts.grantCards(user.id, { kind: 'starter_precon', ref: STARTER_REF, cost: 0, cards: precon.cards });
  if (!applied) return { granted: false, deck: null };
  const deck = await accounts.saveDeck(user.id, {
    name: name.replace(/\s*\(.*\)$/, '').slice(0, 40),
    format: 'commander',
    cards: precon.cards,
    basics: { W: 0, U: 0, B: 0, R: 0, G: 0 },
    commander: precon.commander,
  });
  return { granted: true, deck };
}
