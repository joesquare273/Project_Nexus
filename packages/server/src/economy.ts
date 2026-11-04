// Every Aether Shards value in one place (docs/economy.md). The server reads
// these; anything the browser shows from them is for display only.

export const ECONOMY = {
  playBoosterPrice: 100,
  collectorBoosterPrice: 500,
  /** One free booster of the same type for every `bulkBonusEvery` bought together. */
  bulkBonusEvery: 10,
  bulkBonusPacks: 1,
  rewards: {
    botMatch: { completion: 25, winBonus: 10 },
    friendMatch: { completion: 50, winBonus: 25 },
  },
  dailyQuestReward: 100,
  weeklyQuestReward: 250,
  weeklyQuestMatches: 5,
  /** New accounts start with 5,000 with the bonus below (user, 2026-11-03; accounts made before keep what they had). */
  welcomeGrant: 4000,
  /** Once per account on top of the welcome grant (user, 2026-10-30). */
  welcomeBonus: 1000,
  /** The first sign-in of each day (UTC). */
  dailyLoginReward: 50,
  /** A booster draft's entry: six Play Boosters' worth (user, 2026-11-03). Every player keeps the 84 cards they draft. */
  eventEntry: 600,
  /**
   * Draft prizes in shards by place, 1st to 4th (user, 2026-11-03): paid in
   * full to players whatever the mix of players and bots (a bot's place pays
   * no one). Nets after the entry: +400, +200, 0, -200.
   */
  eventPrizes: [1000, 800, 600, 400],
  /**
   * Store tab prices per item kind (null shows "Price coming soon" and can't
   * be bought). Proposed 2026-10-30: a Collector Booster is 500, so the
   * legendary Chocobo Track foils cost more than two.
   */
  storePrices: {
    chocoboTrackLegendary: 1200 as number | null,
    chocoboTrackOther: 800 as number | null,
    chocoboTrackLandBundle: 500 as number | null,
    /** A whole Secret Lair drop (5 cards and its foil bonus card): cheaper than its cards one by one. */
    secretLairDrop: 3500 as number | null,
    secretLairSingle: 1000 as number | null,
    /** A FINAL FANTASY Commander precon (100 cards, saved as a deck): about two Collector Boosters' worth. */
    precon: 2000 as number | null,
  },
  /**
   * Dismantling and crafting (user spec, 2026-11-04): four fragments of a
   * rarity craft one card of that rarity, a 25% return on dismantled cards.
   * Each rarity has its own fragments; they don't convert.
   */
  crafting: {
    /** Fragments for dismantling one copy, by its printing's rarity. */
    dismantle: { common: 1, uncommon: 1, rare: 1, mythic: 1 },
    /** Extra fragments of the same rarity for a foil (or any finish other than non-foil) copy. */
    foilBonus: 1,
    /** Fragments to craft one non-foil copy, by rarity. */
    craft: { common: 4, uncommon: 4, rare: 4, mythic: 4 },
    /** The player's last copy of a card (any printing or finish) can't be dismantled. */
    protectLastCopy: true as boolean,
  },
} as const;

/** Fragments for dismantling one copy of a printing of this rarity in this finish. */
export function dismantleReward(rarity: keyof typeof ECONOMY.crafting.dismantle, finish: string): number {
  return ECONOMY.crafting.dismantle[rarity] + (finish === 'nonfoil' ? 0 : ECONOMY.crafting.foilBonus);
}

/** Fragments of its rarity to craft one copy. */
export const craftCost = (rarity: keyof typeof ECONOMY.crafting.craft): number => ECONOMY.crafting.craft[rarity];

/** A new account's balance after its first sign-in: the welcome grant and bonus, and that day's login reward. */
export const FIRST_DAY_SHARDS = ECONOMY.welcomeGrant + ECONOMY.welcomeBonus + ECONOMY.dailyLoginReward;

/** Today's login reward reference ("login-2026-10-30", UTC): paid once per account per day. */
export const loginRef = (now = new Date()) => `login-${now.toISOString().slice(0, 10)}`;

/** Packs granted for a purchase: you pay for `bought`, and get a bonus pack for each full ten. */
export function packsForPurchase(bought: number): { paid: number; bonus: number; total: number } {
  const bonus = Math.floor(bought / ECONOMY.bulkBonusEvery) * ECONOMY.bulkBonusPacks;
  return { paid: bought, bonus, total: bought + bonus };
}
