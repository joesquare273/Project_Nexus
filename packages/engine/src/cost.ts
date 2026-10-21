// Mana costs: parsing "{2}{R}{W}" notation and paying from a mana pool.

import { MANA_TYPES, type ManaCost, type ManaPool, type ManaType } from './types.ts';

const SYMBOL = /\{([^}]+)\}/g;

/** Parses standard notation. Throws on symbols the engine doesn't support yet (X, hybrid, Phyrexian). */
export function parseManaCost(text: string | undefined): ManaCost {
  const cost: ManaCost = { generic: 0 };
  if (!text) return cost;
  const leftover = text.replace(SYMBOL, '');
  if (leftover.trim() !== '') throw new Error(`Malformed mana cost "${text}".`);
  for (const [, symbol] of text.matchAll(SYMBOL)) {
    if (/^\d+$/.test(symbol!)) cost.generic += Number(symbol);
    else if ((MANA_TYPES as readonly string[]).includes(symbol!)) {
      const t = symbol as ManaType;
      cost[t] = (cost[t] ?? 0) + 1;
    } else throw new Error(`Unsupported mana symbol {${symbol}} in "${text}".`);
  }
  return cost;
}

/** Mana value (total mana in the cost). */
export function manaValue(cost: ManaCost): number {
  return MANA_TYPES.reduce((sum, t) => sum + (cost[t] ?? 0), cost.generic);
}

/**
 * Works out what to take from the pool to pay `cost`, or null if it can't be
 * paid. Colored and colorless-specific symbols are paid first, then generic
 * from colorless before colors, in fixed order, so the result is deterministic.
 */
export function planPayment(pool: ManaPool, cost: ManaCost): Partial<ManaPool> | null {
  const remaining = { ...pool };
  const spent: Partial<ManaPool> = {};
  const take = (t: ManaType, n: number) => {
    remaining[t] -= n;
    spent[t] = (spent[t] ?? 0) + n;
  };
  for (const t of MANA_TYPES) {
    const need = cost[t] ?? 0;
    if (need === 0) continue;
    if (remaining[t] < need) return null;
    take(t, need);
  }
  let generic = cost.generic;
  for (const t of ['C', 'W', 'U', 'B', 'R', 'G'] as const) {
    if (generic === 0) break;
    const n = Math.min(remaining[t], generic);
    if (n > 0) take(t, n);
    generic -= n;
  }
  return generic === 0 ? spent : null;
}

export function canPay(pool: ManaPool, cost: ManaCost): boolean {
  return planPayment(pool, cost) !== null;
}
