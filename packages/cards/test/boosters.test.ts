import { describe, expect, it } from 'vitest';
import { BOOSTER_CARDS, COLLECTOR_BOOSTER, PLAY_BOOSTER, buildSheets, openPack, packOdds } from '../src/boosters.ts';

/** A small seeded generator (mulberry32), so the tests are repeatable. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sheets = buildSheets();

describe('Final Fantasy booster data', () => {
  it('has every set the packs draw from', () => {
    const sets = new Set(BOOSTER_CARDS.map((c) => c.set));
    for (const set of ['fin', 'fca', 'fic', 'tfin', 'afin', 'afic']) expect(sets.has(set), set).toBe(true);
    for (const c of BOOSTER_CARDS) expect(c.images.length, c.name).toBeGreaterThan(0);
  });

  it('sorts the printings into sheets that match the printed set', () => {
    // 109, as Wizards lists: the Ragnarok meld result ("99b") is not a pack card.
    expect(sheets.uncommons).toHaveLength(109);
    expect(sheets.rares).toHaveLength(75);
    expect(sheets.mythics).toHaveLength(20);
    expect(sheets.cid).toHaveLength(14);
    expect(sheets.basics.length).toBeGreaterThanOrEqual(15);
    expect(sheets.scene).toHaveLength(24);
    expect(sheets.throughTheAges.uncommon.length + sheets.throughTheAges.rare.length + sheets.throughTheAges.mythic.length).toBe(65);
    for (const c of sheets.commons) expect(c.rarity).toBe('common');
  });
});

describe('Play Booster', () => {
  it('holds 14 Magic cards and a token or art card, with one rare slot and one foil', () => {
    const rng = seeded(7);
    for (let i = 0; i < 200; i++) {
      const pack = openPack('play', rng, sheets);
      expect(pack.cards).toHaveLength(15);
      expect(pack.cards.filter((p) => p.finish !== 'nonfoil').length).toBeGreaterThanOrEqual(1);
      const last = pack.cards.at(-1)!;
      expect(['tfin', 'afin', 'afic']).toContain(last.card.set);
      const commons = pack.cards.slice(0, 6).map((p) => p.card.id);
      expect(new Set(commons).size).toBe(6);
    }
  });

  it('pulls about the printed odds over many packs', () => {
    const rng = seeded(11);
    const n = 4000;
    let mythicSlot = 0, throughTheAges = 0, scene = 0;
    for (let i = 0; i < n; i++) {
      const pack = openPack('play', rng, sheets);
      if (pack.cards[11]!.card.rarity === 'mythic') mythicSlot++;
      if (pack.cards[6]!.card.set === 'fca') throughTheAges++;
      if (pack.cards.some((p) => p.slot === 'Scene Box card')) scene++;
    }
    // Rare slot: 11.5% mythic (10% default frame, 1.5% borderless).
    expect(mythicSlot / n).toBeGreaterThan(0.09);
    expect(mythicSlot / n).toBeLessThan(0.14);
    // A Through the Ages card in about one pack in three.
    expect(throughTheAges / n).toBeGreaterThan(0.29);
    expect(throughTheAges / n).toBeLessThan(0.38);
    expect(scene / n).toBeGreaterThan(0.004);
    expect(scene / n).toBeLessThan(0.02);
  });

  it('shows odds that add up to 100% per slot', () => {
    const odds = packOdds('play', sheets);
    expect(odds.reduce((n, s) => n + s.count, 0)).toBe(PLAY_BOOSTER.length);
    for (const s of odds) expect(s.outcomes.reduce((n, x) => n + x.percent, 0)).toBeCloseTo(100, 6);
  });
});

describe('Collector Booster', () => {
  it('holds 15 Magic cards and a foil token, at least 8 of them foil, with at most one foil Booster Fun rare', () => {
    const rng = seeded(3);
    for (let i = 0; i < 300; i++) {
      const pack = openPack('collector', rng, sheets);
      expect(pack.cards).toHaveLength(16);
      expect(pack.cards.slice(0, 15).filter((p) => p.finish !== 'nonfoil').length).toBeGreaterThanOrEqual(8);
      const funRares = pack.cards.slice(10, 13);
      expect(funRares.filter((p) => p.finish !== 'nonfoil').length).toBeLessThanOrEqual(1);
      expect(new Set(funRares.map((p) => p.card.id)).size).toBe(3);
      expect(pack.cards.slice(0, 3).every((p) => p.finish === 'foil' && p.card.rarity === 'common')).toBe(true);
      expect(pack.cards[13]!.card.set).toBe('fca');
      expect(pack.cards[15]!.card.set).toBe('tfin');
      expect(pack.cards[15]!.finish).not.toBe('nonfoil');
    }
  });

  it('pulls about the printed odds over many packs', () => {
    const rng = seeded(5);
    const n = 3000;
    let surgePremium = 0, foilTta = 0, commanderFun = 0;
    for (let i = 0; i < n; i++) {
      const pack = openPack('collector', rng, sheets);
      if (pack.cards[14]!.finish === 'surge') surgePremium++;
      if (pack.cards[13]!.finish === 'foil') foilTta++;
      commanderFun += pack.cards.slice(10, 13).filter((p) => p.card.set === 'fic').length;
    }
    // Premium slot: 18.1% surge foil (of 104 weight, with our Scene Box 4).
    expect(surgePremium / n).toBeGreaterThan(0.14);
    expect(surgePremium / n).toBeLessThan(0.21);
    expect(foilTta / n).toBeGreaterThan(0.45);
    expect(foilTta / n).toBeLessThan(0.55);
    // Each Booster Fun rare slot is a Commander card about half the time.
    expect(commanderFun / (3 * n)).toBeGreaterThan(0.4);
    expect(commanderFun / (3 * n)).toBeLessThan(0.6);
  });

  it('has no empty outcome, and odds that add up to 100% per slot', () => {
    const odds = packOdds('collector', sheets);
    expect(odds.reduce((n, s) => n + s.count, 0)).toBe(COLLECTOR_BOOSTER.length);
    for (const s of odds) {
      expect(s.outcomes.reduce((n, x) => n + x.percent, 0)).toBeCloseTo(100, 6);
      for (const x of s.outcomes) expect(x.cards, x.label).toBeGreaterThan(0);
    }
  });
});
