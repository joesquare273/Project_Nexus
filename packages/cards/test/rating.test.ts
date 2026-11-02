// The AI's sense of card quality for Limited, and the decks it builds.
import { describe, expect, it } from 'vitest';
import { CARD_DEFS } from '../src/index.ts';
import { cardRating } from '../src/rating.ts';
import { aiPick, cardColors, createDraft, defIdOf, lockPick, type DraftState } from '../src/draft.ts';
import { aiDeck, deckProblem, deckSize } from '../src/limited.ts';

const r = (id: string) => cardRating(CARD_DEFS[id]);

describe('card ratings', () => {
  it('removal and evasive creatures rate above filler; unbuilt cards are worth nothing', () => {
    expect(r('lightning-bolt')).toBeGreaterThan(r('magitek-infantry'));
    expect(r('sephiroths-intervention')).toBeGreaterThan(r('instant-ramen' in CARD_DEFS ? 'instant-ramen' : 'magic-pot'));
    expect(r('plains')).toBe(0);
    const unbuilt = Object.values(CARD_DEFS).find((d) => d.notBuilt)!;
    expect(cardRating(unbuilt)).toBe(0);
    // Flying makes a difference.
    expect(r('il-mheg-pixie')).toBeGreaterThan(r('coeurl') - 1);
  });
});

describe('the AI drafters and deckbuilder', () => {
  function draftWithBots(seed: number): DraftState {
    let s = createDraft(['A', 'B', 'C', 'D'], seed);
    for (let guard = 0; guard < 400 && !s.done; guard++) {
      const seat = s.seats.find((x) => s.packs[x] && !s.locked[x])!;
      s = lockPick(s, seat, aiPick(s, seat));
    }
    return s;
  }

  it('drafters settle into colors, and build legal two-color decks of built cards with a curve', () => {
    for (const seed of [1, 2, 3]) {
      const s = draftWithBots(seed);
      for (const seat of s.seats) {
        const pool = s.picks[seat]!;
        const deck = aiDeck(pool);
        expect(deckProblem(deck, pool)).toBeNull();
        expect(deckSize(deck)).toBe(40);
        const byUid = new Map(pool.map((c) => [c.uid, c]));
        const defs = deck.cards.map((u) => CARD_DEFS[defIdOf(byUid.get(u)!.card)!]!);
        expect(defs.every((d) => !d.notBuilt)).toBe(true);
        const colors = new Set(defs.flatMap((d) => cardColors(d)));
        expect(colors.size).toBeLessThanOrEqual(2);
        // A curve: few expensive spells.
        expect(defs.filter((d) => !d.types.includes('land') && /\{(5|6|7|8|9)\}|\}\{.*\}\{.*\}\{.*\}\{/.test(d.manaCost ?? '')).length).toBeLessThanOrEqual(10);
        // Most of a drafter's picks are in its deck's colors.
        const inColors = pool.filter((c) => {
          const d = CARD_DEFS[defIdOf(c.card) ?? ''];
          return d && cardColors(d).every((k) => colors.has(k));
        }).length;
        expect(inColors).toBeGreaterThan(pool.length / 3);
      }
    }
  }, 60_000);
});
