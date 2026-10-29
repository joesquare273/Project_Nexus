import { describe, expect, it } from 'vitest';
import { CARD_DEFS } from '../src/index.ts';
import { aiPick, cardColors, createDraft, defIdOf, lockPick, type DraftCard, type DraftState } from '../src/draft.ts';
import { COLORS, LAND_TARGET, aiDeck, deckList, deckProblem, deckSize, noBasics, suggestBasics } from '../src/limited.ts';

function draftedPools(players: number, seed: number): Record<string, DraftCard[]> {
  let s: DraftState = createDraft(Array.from({ length: players }, (_, i) => `P${i + 1}`), seed);
  while (!s.done) for (const seat of s.seats) if (s.packs[seat] && !s.locked[seat]) s = lockPick(s, seat, aiPick(s, seat));
  return s.picks;
}

const pools = draftedPools(4, 21);

describe('Limited decks', () => {
  it("the AI builds a legal 40-card deck from its picks: two colors, 17 lands", () => {
    for (const pool of Object.values(pools)) {
      const deck = aiDeck(pool);
      expect(deckProblem(deck, pool)).toBeNull();
      expect(deckSize(deck)).toBe(40);
      const list = deckList(deck, pool);
      expect(list).toHaveLength(40);
      const defs = list.map((id) => CARD_DEFS[id]!);
      expect(defs.filter((d) => d.types.includes('land'))).toHaveLength(LAND_TARGET);
      const colors = new Set(defs.flatMap((d) => (d.types.includes('land') ? [] : cardColors(d))));
      expect(colors.size).toBeLessThanOrEqual(2);
      // It never plays spells it can't cast.
      for (const d of defs) expect(d.uncastable || (d.notBuilt && !d.types.includes('creature') && !d.types.includes('land'))).toBeFalsy();
    }
  });

  it('suggests basic lands by colored mana symbols, adding up exactly', () => {
    const pool = pools.P1!;
    const deck = { cards: pool.filter((c) => !CARD_DEFS[defIdOf(c.card)!]!.types.includes('land')).slice(0, 23).map((c) => c.uid), basics: noBasics() };
    const basics = suggestBasics(deck, pool);
    expect(COLORS.reduce((n, c) => n + basics[c], 0)).toBe(17);
    // Colors with no symbols in the deck get no basics.
    const used = new Set(deck.cards.flatMap((uid) => [...(CARD_DEFS[defIdOf(pool.find((c) => c.uid === uid)!.card)!]!.manaCost ?? '').matchAll(/\{([WUBRG])\}/g)].map((m) => m[1])));
    for (const c of COLORS) if (!used.has(c)) expect(basics[c]).toBe(0);
    // A deck with no colored symbols gets Plains.
    expect(suggestBasics({ cards: [], basics: noBasics() }, pool)).toMatchObject({ W: 40 });
  });

  it('checks the deck: 40 to 60 cards, only cards from your pool, each once', () => {
    const pool = pools.P2!;
    const ok = aiDeck(pool);
    expect(deckProblem({ ...ok, cards: ok.cards.slice(5) }, pool)).toMatch(/at least 40/);
    expect(deckProblem({ ...ok, cards: [...ok.cards, ok.cards[0]!] }, pool)).toMatch(/twice/);
    expect(deckProblem({ ...ok, cards: [...ok.cards, pools.P3![0]!.uid] }, pool)).toMatch(/not in your pool/);
    expect(deckProblem({ ...ok, basics: { ...ok.basics, U: -1 } }, pool)).toMatch(/whole numbers/);
    // Any number of basic lands, up to 60 cards in all.
    const room = 60 - ok.cards.length - Object.values(ok.basics).reduce((n, k) => n + k, 0);
    expect(deckProblem({ ...ok, basics: { ...ok.basics, G: ok.basics.G + room } }, pool)).toBeNull();
    expect(deckProblem({ ...ok, basics: { ...ok.basics, G: ok.basics.G + room + 1 } }, pool)).toMatch(/at most 60/);
  });
});
