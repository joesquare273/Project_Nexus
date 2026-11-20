import { describe, expect, it } from 'vitest';
import { formatManaCost, manaValue, parseManaCost, planPayment } from '../src/cost.ts';

const pool = (p: Partial<Record<'W' | 'U' | 'B' | 'R' | 'G' | 'C', number>>) => ({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...p });

describe('monocolored hybrid mana ({2/W}, rule 107.4e)', () => {
  const cost = parseManaCost('{2/W}{2/U}');
  it('has mana value 2 per symbol and writes back the same way', () => {
    expect(manaValue(cost)).toBe(4);
    expect(formatManaCost(cost)).toBe('{2/W}{2/U}');
  });
  it('is paid with its color or with two generic mana each', () => {
    expect(planPayment(pool({ W: 1, U: 1 }), cost)).not.toBeNull();
    expect(planPayment(pool({ W: 1, C: 2 }), cost)).not.toBeNull();
    expect(planPayment(pool({ C: 4 }), cost)).not.toBeNull();
    expect(planPayment(pool({ W: 1, C: 1 }), cost)).toBeNull();
  });
});
