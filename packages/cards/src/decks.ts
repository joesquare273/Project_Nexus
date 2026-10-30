// A saved deck (owned printings with finishes, basic land counts and their
// chosen art, a commander) turned into what a game is set up with: card
// definitions, each card's printing, and its finish (only finishes the player
// owns, since saved decks are checked against the collection by the server).

import type { CardDefId, CardFinish } from '@nexus/engine';
import { BOOSTER_CARDS, SECRET_LAIR_CARDS, finishLook, type Finish } from './boosters.ts';
import { CARD_IDS_BY_NAME, SCRYFALL_PRINTINGS } from './index.ts';

export interface SavedDeckCards {
  cards: { id: string; finish: Finish; count: number }[];
  basics: Record<'W' | 'U' | 'B' | 'R' | 'G', number> & { printings?: Partial<Record<'W' | 'U' | 'B' | 'R' | 'G', { id: string; finish: Finish }>> };
  commander?: string | null;
}

export interface GameDeck {
  deck: CardDefId[];
  /** Undefined: the card's default art (basic lands without a chosen printing). */
  deckPrintings: ({ set: string; number: string } | undefined)[];
  deckFinishes: (CardFinish | undefined)[];
  commander?: CardDefId;
  commanderPrinting?: { set: string; number: string };
  commanderFinish?: CardFinish;
}

interface Printing {
  name: string;
  set: string;
  number: string;
  promoTypes?: string[];
}

/** Every printing the game knows, by Scryfall id. */
const PRINTINGS = new Map<string, Printing>([
  ...Object.values(SCRYFALL_PRINTINGS).flatMap((p): [string, Printing][] => (p.scryfallId ? [[p.scryfallId, { name: p.name, set: p.set, number: p.number }]] : [])),
  ...[...BOOSTER_CARDS, ...SECRET_LAIR_CARDS].map((c): [string, Printing] => [c.id, c]),
]);

const BASIC_IDS = { W: 'plains', U: 'island', B: 'swamp', R: 'mountain', G: 'forest' } as const;

/** The game deck for a saved deck, or why it can't be played (a card the game doesn't know). */
export function gameDeck(saved: SavedDeckCards): GameDeck | { problem: string } {
  const out: GameDeck = { deck: [], deckPrintings: [], deckFinishes: [] };
  const add = (defId: CardDefId, printing: Printing | undefined, finish: Finish, count: number) => {
    for (let i = 0; i < count; i++) {
      out.deck.push(defId);
      out.deckPrintings.push(printing ? { set: printing.set, number: printing.number } : undefined);
      out.deckFinishes.push(printing ? finishLook(printing, finish) : undefined);
    }
  };
  for (const c of saved.cards) {
    const printing = PRINTINGS.get(c.id);
    const defId = printing && CARD_IDS_BY_NAME[printing.name];
    if (!printing || !defId) return { problem: 'The deck has a card the game doesn’t know yet.' };
    let count = c.count;
    // The commander starts in the command zone, not the library.
    if (saved.commander === c.id && !out.commander) {
      out.commander = defId;
      out.commanderPrinting = { set: printing.set, number: printing.number };
      const look = finishLook(printing, c.finish);
      if (look) out.commanderFinish = look;
      count--;
    }
    add(defId, printing, c.finish, count);
  }
  for (const color of ['W', 'U', 'B', 'R', 'G'] as const) {
    const n = saved.basics[color];
    if (!n) continue;
    const chosen = saved.basics.printings?.[color];
    const printing = chosen && PRINTINGS.get(chosen.id);
    add(BASIC_IDS[color], printing, chosen?.finish ?? 'nonfoil', n);
  }
  return out;
}
