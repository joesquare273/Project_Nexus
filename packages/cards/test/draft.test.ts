import { describe, expect, it } from 'vitest';
import { CARD_DEFS } from '../src/index.ts';
import { PACKS_PER_PLAYER, aiPick, cardColors, createDraft, defIdOf, draftView, lockPick, nextSeat, pickProblem, type DraftState } from '../src/draft.ts';

/** One pick for everyone: each seat locks in the AI's choice. */
function everyonePicks(s: DraftState): DraftState {
  for (const seat of s.seats) if (s.packs[seat] && !s.locked[seat]) s = lockPick(s, seat, aiPick(s, seat));
  return s;
}

function runDraft(s: DraftState): DraftState {
  for (let guard = 0; !s.done && guard < 10_000; guard++) s = everyonePicks(s);
  return s;
}

describe.each([2, 3, 4])('a %i-player draft', (players) => {
  const seats = Array.from({ length: players }, (_, i) => `P${i + 1}`);

  it('deals six real Play Boosters each: 14 cards from the main set and Through the Ages', () => {
    const s = createDraft(seats, 7);
    expect(s.packSize).toBe(14);
    for (const seat of seats) {
      expect(s.packs[seat]!.cards).toHaveLength(14);
      expect(s.unopened[seat]).toHaveLength(PACKS_PER_PLAYER - 1);
    }
    const all = [...Object.values(s.unopened).flat(), ...Object.values(s.packs)].flatMap((p) => p!.cards);
    expect(all).toHaveLength(players * PACKS_PER_PLAYER * 14);
    for (const c of all) {
      expect(['fin', 'fca']).toContain(c.card.set);
      expect(defIdOf(c.card), c.card.name).toBeDefined();
    }
  });

  it('packs rotate clockwise only once everyone has locked in', () => {
    let s = createDraft(seats, 8);
    const pack = s.packs.P1!;
    const taken = pack.cards[3]!.uid;
    s = lockPick(s, 'P1', taken);
    // Locked in, but nothing moves until the others confirm too.
    expect(s.packs.P1!.id).toBe(pack.id);
    expect(s.picks.P1).toHaveLength(0);
    expect(pickProblem(s, 'P1', pack.cards[0]!.uid)).toMatch(/already locked in/);
    s = everyonePicks(s);
    expect(s.picks.P1!.map((c) => c.uid)).toEqual([taken]);
    const next = nextSeat(s, 'P1');
    expect(next).toBe('P2');
    const passed = s.packs[next]!;
    expect(passed.id).toBe(pack.id);
    expect(passed.cards).toHaveLength(13);
    expect(passed.cards.some((c) => c.uid === taken)).toBe(false);
    // The last seat passes back to the first.
    expect(nextSeat(s, seats.at(-1)!)).toBe('P1');
  });

  it('every card is drafted exactly once, and everyone ends with 84 cards', () => {
    const start = createDraft(seats, 9);
    const dealt = [...Object.values(start.unopened).flat(), ...Object.values(start.packs)].flatMap((p) => p!.cards.map((c) => c.uid));
    const end = runDraft(start);
    expect(end.done).toBe(true);
    const picked = seats.flatMap((seat) => end.picks[seat]!.map((c) => c.uid));
    expect(picked.sort()).toEqual([...dealt].sort());
    for (const seat of seats) expect(end.picks[seat]).toHaveLength(PACKS_PER_PLAYER * 14);
    expect(draftView(end, 'P1')).toMatchObject({ done: true, pack: null });
  });

  it('a player sees only their own pack and picks', () => {
    let s = createDraft(seats, 10);
    for (let i = 0; i < 3; i++) s = everyonePicks(s);
    // P2 has locked in a card: P1 sees that P2 is ready, not which card.
    const p2Card = aiPick(s, 'P2');
    s = lockPick(s, 'P2', p2Card);
    const view = draftView(s, 'P1');
    expect(view.seats.find((x) => x.seat === 'P2')!.locked).toBe(true);
    expect(JSON.stringify(view).includes(`"${p2Card}"`)).toBe(false);
    const json = JSON.stringify(view);
    for (const seat of seats.slice(1)) {
      for (const c of s.picks[seat]!) expect(json.includes(`"${c.uid}"`), `${seat}'s pick`).toBe(false);
      for (const c of s.packs[seat]?.cards ?? []) expect(json.includes(`"${c.uid}"`)).toBe(false);
    }
    expect(view.seats.map((x) => x.picks)).toEqual(seats.map((x) => s.picks[x]!.length));
    expect(view.picks).toHaveLength(3);
  });

  it('refuses picks from a pack that is not in front of you', () => {
    const s = createDraft(seats, 11);
    const other = s.packs.P2!.cards[0]!.uid;
    expect(pickProblem(s, 'P1', other)).toMatch(/not in the pack/);
    expect(() => lockPick(s, 'P1', other)).toThrow();
    const done = runDraft(s);
    expect(pickProblem(done, 'P1', 'd0')).toMatch(/over/);
  });
});

describe('the AI drafter', () => {
  it('prefers cards the engine can play, and settles into two colors', () => {
    const s = runDraft(createDraft(['P1', 'P2', 'P3', 'P4'], 12));
    for (const seat of s.seats) {
      const defs = s.picks[seat]!.map((c) => CARD_DEFS[defIdOf(c.card)!]!);
      const counts: Record<string, number> = {};
      for (const d of defs.slice(20)) for (const c of cardColors(d)) counts[c] = (counts[c] ?? 0) + 1;
      const top2 = Object.values(counts).sort((a, b) => b - a).slice(0, 2).reduce((n, k) => n + k, 0);
      const all = Object.values(counts).reduce((n, k) => n + k, 0);
      // Most colored picks after the first twenty are in its two main colors.
      expect(top2 / all).toBeGreaterThan(0.6);
    }
  });
});
