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
  welcomeGrant: 1000,
  /** Six Play Boosters' worth. */
  eventEntry: 600,
  /** Event prizes in Play Boosters, by place, for a 4-player event. */
  eventPrizes: [2, 1],
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
  },
} as const;

/** Packs granted for a purchase: you pay for `bought`, and get a bonus pack for each full ten. */
export function packsForPurchase(bought: number): { paid: number; bonus: number; total: number } {
  const bonus = Math.floor(bought / ECONOMY.bulkBonusEvery) * ECONOMY.bulkBonusPacks;
  return { paid: bought, bonus, total: bought + bonus };
}
