import { describe, expect, it } from 'vitest';
import { BOOSTER_CARDS, COLLECTOR_BOOSTER, EOE_PLAY_BOOSTER, FRA_ECHOED_PAIRS, FRA_PLAY_BOOSTER, PLAY_BOOSTER, buildEoeSheets, buildFraSheets, buildSheets, openPack, openSetPack, SOS_BOOSTERS, SOS_POSITIONS, sheetsForVariant, otherFace, packOdds, setPackOdds } from '../src/boosters.ts';

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

describe('the other side of a pulled card', () => {
  const byNumber = (n: string) => BOOSTER_CARDS.find((c) => c.set === 'fin' && c.number === n)!;
  it('a transforming card shows its back face', () => {
    const dion = byNumber('16');
    expect(otherFace(dion)).toEqual({ name: 'Bahamut, Warden of Light', image: dion.images[1] });
  });
  it('Fang and Vanille each show Ragnarok, Divine Deliverance, naming the other half', () => {
    const ragnarok = byNumber('99b');
    expect(otherFace(byNumber('99'))).toEqual({ name: ragnarok.name, image: ragnarok.images[0], meld: { partner: 'Vanille, Cheerful l’Cie'.replace('’', "'") } });
    expect(otherFace(byNumber('211'))).toEqual({ name: ragnarok.name, image: ragnarok.images[0], meld: { partner: "Fang, Fearless l'Cie" } });
  });
  it('each variant printing of the pair shows its own Ragnarok printing', () => {
    for (const [half, result] of [['381', '381b'], ['392', '381b'], ['446', '446b'], ['475', '446b'], ['526', '526b'], ['537', '526b']] as const) {
      expect(otherFace(byNumber(half))?.image).toEqual(byNumber(result).images[0]);
    }
  });
  it('single-faced cards, Adventures and the melded card itself have no other side', () => {
    for (const n of ['1', '283', '99b']) expect(otherFace(byNumber(n))).toBeUndefined();
  });
});

describe('Edge of Eternities boosters', () => {
  const sheets = buildEoeSheets();
  const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

  it('sorts the printings into the sheets Wizards describes', () => {
    expect([sheets.commons.length, sheets.uncommons.length, sheets.rares.length, sheets.mythics.length]).toEqual([81, 100, 60, 20]);
    expect([sheets.extended.rare.length, sheets.extended.mythic.length]).toEqual([33, 7]);
    expect([sheets.triumphant.rare.length, sheets.triumphant.mythic.length]).toEqual([12, 4]);
    expect([sheets.surreal.rare.length, sheets.surreal.mythic.length]).toEqual([11, 3]);
    expect([sheets.commanderBorderless.length, sheets.commanderExtended.length]).toEqual([4, 20]);
    expect(sheets.specialGuests).toHaveLength(10);
    expect(sheets.japan).toHaveLength(10);
    expect(sheets.artCards).toHaveLength(54);
    for (const list of [sheets.stellar, sheets.stellarPoster, sheets.galaxyStellar, sheets.galaxyStellarPoster]) expect(list.rare.length + list.mythic.length).toBe(45);
    for (const c of sheets.galaxyStellar.rare) expect(c.promoTypes).toContain('galaxyfoil');
  });

  it('a Play Booster: 14 Magic cards and a token, only from Edge of Eternities sheets', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const pack = openSetPack('eoe', 'play', seeded(seed));
      expect(pack.set).toBe('eoe');
      expect(pack.cards).toHaveLength(EOE_PLAY_BOOSTER.length);
      expect(pack.cards.filter((p) => p.card.set !== 'teoe')).toHaveLength(14);
      for (const p of pack.cards) expect(['eoe', 'eos', 'spg', 'teoe']).toContain(p.card.set);
      expect(pack.cards.filter((p) => p.finish === 'foil').length).toBeLessThanOrEqual(2); // the foil slot, and a foil land
      // The commons never repeat.
      const commons = pack.cards.slice(0, 7).map((p) => p.card.id);
      expect(new Set(commons).size).toBe(7);
    }
  });

  it('a Collector Booster: 15 Magic cards (10+ foils, a Stellar Sights land, a Commander card) and an art card or foil token', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const pack = openSetPack('eoe', 'collector', seeded(seed));
      expect(pack.cards).toHaveLength(16);
      expect(pack.cards.filter((p) => p.card.set === 'eos')).toHaveLength(1);
      expect(pack.cards.filter((p) => p.card.set === 'eoc')).toHaveLength(1);
      expect(pack.cards.filter((p) => p.finish === 'foil' && p.card.set !== 'teoe').length).toBeGreaterThanOrEqual(10);
    }
  });

  it("each slot's odds add up to 100%, and the listed numbers are Wizards'", () => {
    for (const kind of ['play', 'collector'] as const) {
      for (const slot of setPackOdds('eoe', kind)) expect(slot.outcomes.reduce((n, x) => n + x.percent, 0)).toBeCloseTo(100, 5);
    }
    const wildcard = setPackOdds('eoe', 'play').find((s) => s.slot === 'Wildcard')!;
    expect(wildcard.outcomes.find((x) => x.label === 'Stellar Sights rare')!.percent).toBeCloseTo(10, 5);
    expect(wildcard.outcomes.find((x) => x.label === 'Uncommon')!.percent).toBeCloseTo(62.5, 5);
    // Stellar Sights in 1 of 8 Play Boosters.
    const stellar = wildcard.outcomes.filter((x) => x.label.startsWith('Stellar Sights')).reduce((n, x) => n + x.percent, 0);
    expect(stellar).toBeCloseTo(12.5, 5);
  });

  it('Final Fantasy packs are unchanged by the second set', () => {
    expect(openSetPack('fin', 'play', seeded(7))).toEqual(openPack('play', seeded(7)));
    expect(setPackOdds('fin', 'collector')).toEqual(packOdds('collector'));
  });
});

describe('Reality Fracture boosters', () => {
  const sheets = buildFraSheets();
  const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const pairOf = new Map<string, string>();
  for (const list of [...Object.values(sheets.pairs), ...Object.values(sheets.borderlessPairs)]) for (const [a, b] of list) (pairOf.set(a.id, b.id), pairOf.set(b.id, a.id));

  it('sorts the printings into the sheets Wizards describes', () => {
    expect([sheets.uncommons.length, sheets.rares.length, sheets.mythics.length]).toEqual([43, 50, 20]);
    expect([sheets.duals.length, sheets.basics.length, sheets.towers.length]).toEqual([10, 10, 15]);
    // 43 echoed pairs: 66 uncommon, 14 rare and 6 mythic cards; each pair is one rarity; every card of 195-280 is in exactly one pair.
    expect(FRA_ECHOED_PAIRS).toHaveLength(43);
    expect(new Set(FRA_ECHOED_PAIRS.flat()).size).toBe(86);
    expect([sheets.echoed.uncommon.length, sheets.echoed.rare.length, sheets.echoed.mythic.length]).toEqual([66, 14, 6]);
    expect([sheets.borderlessEchoed.uncommon.length, sheets.borderlessEchoed.rare.length, sheets.borderlessEchoed.mythic.length]).toEqual([10, 14, 6]);
    for (const list of Object.values(sheets.pairs)) for (const [a, b] of list) expect(a.rarity).toBe(b.rarity);
    expect([sheets.shattered.rare.length, sheets.shattered.mythic.length]).toEqual([5, 8]);
    expect([sheets.facetShattered.rare.length, sheets.facetShattered.mythic.length]).toEqual([5, 8]);
    expect([sheets.stronghold.rare.length, sheets.stronghold.mythic.length]).toEqual([18, 7]);
    expect([sheets.braintwister.uncommon.length, sheets.braintwister.rare.length, sheets.braintwister.mythic.length]).toEqual([5, 15, 3]);
    expect([sheets.portal.length, sheets.headliner.length, sheets.japan.length, sheets.fractureJapan.length]).toEqual([5, 1, 10, 10]);
    expect([sheets.commanderBorderless.length, sheets.commanderExtended.length, sheets.specialGuests.length]).toEqual([2, 16, 10]);
    expect([sheets.tokens.length, sheets.artCards.length]).toEqual([18, 54]);
  });

  it('a Play Booster: 14 Magic cards and a token, with two halves of one echoed pair', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const pack = openSetPack('fra', 'play', seeded(seed));
      expect(pack.set).toBe('fra');
      expect(pack.cards).toHaveLength(FRA_PLAY_BOOSTER.length);
      expect(pack.cards.filter((p) => p.card.set !== 'tfra')).toHaveLength(14);
      for (const p of pack.cards) expect(['fra', 'spg', 'tfra']).toContain(p.card.set);
      const echoed = pack.cards.filter((p) => /echoed pairs/i.test(p.slot));
      expect(echoed).toHaveLength(3);
      expect(pairOf.get(echoed[0]!.card.id)).toBe(echoed[1]!.card.id);
      expect(echoed[0]!.card.rarity).toBe(echoed[1]!.card.rarity);
      const commons = pack.cards.slice(0, 6).map((p) => p.card.id);
      expect(new Set(commons).size).toBe(6);
    }
  });

  it('a Collector Booster: 15 Magic cards (a foil echoed pair, a braintwister or Commander card, three Booster Fun cards) and a foil token or art card', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const pack = openSetPack('fra', 'collector', seeded(seed));
      expect(pack.cards).toHaveLength(16);
      const echoed = pack.cards.filter((p) => /echoed pairs/i.test(p.slot));
      expect(pairOf.get(echoed[0]!.card.id)).toBe(echoed[1]!.card.id);
      expect(pack.cards.filter((p) => p.finish === 'foil' && p.card.set !== 'tfra').length).toBeGreaterThanOrEqual(11);
    }
  });

  it("each slot's odds add up to 100%, and the listed numbers are Wizards'", () => {
    for (const kind of ['play', 'collector'] as const) {
      for (const slot of setPackOdds('fra', kind)) expect(slot.outcomes.reduce((n, x) => n + x.percent, 0)).toBeCloseTo(100, 5);
    }
    const rare = setPackOdds('fra', 'play').find((s) => s.slot === 'Rare')!;
    expect(rare.outcomes.find((x) => x.label === 'Rare')!.percent).toBeCloseTo(74.4, 5);
    const land = setPackOdds('fra', 'play').find((s) => s.slot === 'Land')!;
    expect(land.outcomes.find((x) => x.label === 'Common dual land')!.percent).toBeCloseTo(43.6, 5);
    const commander = setPackOdds('fra', 'collector').find((s) => s.slot === 'Braintwister or Commander card')!;
    // Wizards' numbers for this slot add up to 100.1%, so each is scaled very slightly.
    expect(commander.outcomes.find((x) => x.label === 'Commander extended-art rare')!.percent).toBeCloseTo(47.8, 1);
  });
});

describe('Secrets of Strixhaven boosters', () => {
  it("every pack layout fills each position from MTGJSON's sheets, card for card", () => {
    for (const kind of ['play', 'collector'] as const) {
      for (const v of SOS_BOOSTERS[kind].variants) expect(sheetsForVariant(SOS_POSITIONS[kind], v.contents)).toHaveLength(kind === 'play' ? 14 : 15);
    }
    const ids = new Set(BOOSTER_CARDS.map((c) => c.id));
    for (const kind of ['play', 'collector'] as const) for (const sheet of Object.values(SOS_BOOSTERS[kind].sheets)) for (const [id] of sheet.cards) expect(ids.has(id)).toBe(true);
  });

  it('opens Play Boosters: 14 cards, a rare or mythic, a Mystical Archive card and one foil', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const pack = openSetPack('sos', 'play', seeded(seed));
      expect(pack.set).toBe('sos');
      expect(pack.cards).toHaveLength(14);
      for (const p of pack.cards) expect(['sos', 'soa', 'spg']).toContain(p.card.set);
      expect(pack.cards[10]!.card.rarity).toMatch(/rare|mythic/);
      expect(pack.cards[11]!.card.set).toBe('soa');
      expect(pack.cards.at(-1)!.finish).toBe('foil');
      const commons = pack.cards.slice(0, 5).map((p) => p.card.id);
      expect(new Set(commons).size).toBe(5);
    }
  });

  it('opens Collector Boosters: 15 cards, 10+ foils, three Mystical Archive cards (more from Booster Fun) and a Commander card', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const pack = openSetPack('sos', 'collector', seeded(seed));
      expect(pack.cards).toHaveLength(15);
      expect(pack.cards.filter((p) => p.finish === 'foil').length).toBeGreaterThanOrEqual(10);
      expect(pack.cards.slice(8, 11).every((p) => p.card.set === 'soa')).toBe(true);
      expect(pack.cards.at(-1)!.card.set).toBe('soc');
    }
  });

  it("each position's odds add up to 100%", () => {
    for (const kind of ['play', 'collector'] as const) {
      for (const slot of setPackOdds('sos', kind)) expect(slot.outcomes.reduce((n, x) => n + x.percent, 0)).toBeCloseTo(100, 5);
    }
    const play = setPackOdds('sos', 'play');
    expect(play.find((s) => s.slot === 'Common')!.count).toBe(5);
    // 5 of 275 packs have a Special Guest.
    const guest = play.find((s) => s.slot === 'Common or Special Guest')!;
    expect(guest.outcomes.find((x) => x.label === 'Special Guest')!.percent).toBeCloseTo((100 * 5) / 275, 5);
  });
});
