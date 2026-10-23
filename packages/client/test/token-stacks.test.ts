import { describe, expect, it } from 'vitest';
import { countOf, viewFor, type GameState } from '@nexus/engine';
import { createToken } from '../../engine/src/state.ts';
import { newGame, put } from '../../bots/test/kit-helpers.ts';
import { checkInvariants } from '../../bots/src/invariants.ts';
import { groupTokenCards, tokenStackKey } from '../src/game/tokenStacks.ts';

function soldiers(s: GameState, n: number, owner = 'P1') { return Array.from({ length: n }, () => createToken({ s, ev: [] }, 'soldier-token', owner)); }
const grouped = (s: GameState, ids: string[]) => groupTokenCards(ids, (id) => tokenStackKey(s, id));

describe.each([2, 3, 4])('token displays with %i players', (players) => {
  it('keeps five separate and groups six without merging engine objects', () => {
    const s = newGame(players);
    const ids = soldiers(s, 5);
    expect(grouped(s, ids)).toHaveLength(5);
    ids.push(...soldiers(s, 1));
    const before = structuredClone(s);
    expect(grouped(s, ids)).toEqual([{ id: ids[0], members: ids, key: tokenStackKey(s, ids[0]!) }]);
    expect(s).toEqual(before);
    expect(countOf(s, 'CreaturesYouControl', 'P1')).toBe(6);
    expect(viewFor(s, 'P2').players.P1!.battlefield).toEqual(ids);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('keeps individually modified tokens apart from six plain tokens', () => {
    const s = newGame(players);
    const plain = soldiers(s, 6);
    const modified = soldiers(s, 6);
    s.cards[modified[0]!]!.counters = 1;
    s.cards[modified[1]!]!.namedCounters = { shield: 1 };
    s.cards[modified[2]!]!.damage = 1;
    s.cards[modified[3]!]!.tapped = true;
    s.temporaryEffects.push({ source: modified[4]!, affected: modified[4]!, keywords: ['Flying'] });
    put(s, 'P1', 'lightning-greaves', 'battlefield', { attachedTo: modified[5] });
    expect(modified.map((id) => tokenStackKey(s, id))).toEqual(Array(6).fill(null));
    const groups = grouped(s, [...plain, ...modified]);
    expect(groups).toHaveLength(7);
    expect(groups[0]!.members).toEqual(plain);
    expect(groups.flatMap((g) => g.members)).toEqual([...plain, ...modified]);
  });

  it('keeps tokens with printed keywords or abilities separate', () => {
    const s = newGame(players);
    const keyword = Object.values(s.cardDefs).find((d) => d.token && d.keywords?.length)!;
    expect(keyword).toBeDefined();
    const ids = Array.from({ length: 6 }, () => createToken({ s, ev: [] }, keyword.id, 'P1'));
    expect(grouped(s, ids)).toHaveLength(6);
    const treasures = Array.from({ length: 6 }, () => createToken({ s, ev: [] }, 'treasure-token', 'P1'));
    expect(grouped(s, treasures)).toHaveLength(6);
  });

  it('unfolds a group when the eligible remainder falls to five', () => {
    const s = newGame(players);
    const ids = soldiers(s, 6);
    expect(grouped(s, ids)).toHaveLength(1);
    s.cards[ids[0]!]!.counters = 1;
    expect(grouped(s, ids)).toHaveLength(6);
  });

  it('does not combine token types, owners, or summoning-sickness states', () => {
    const s = newGame(players);
    const ready = soldiers(s, 6);
    for (const id of ready) s.cards[id]!.summoningSick = false;
    const sick = soldiers(s, 6);
    const opponents = soldiers(s, 6, 'P2');
    const heroes = Array.from({ length: 6 }, () => createToken({ s, ev: [] }, 'hero-token', 'P1'));
    const groups = grouped(s, [...ready, ...sick, ...opponents, ...heroes]);
    expect(groups.map((g) => g.members)).toEqual([ready, sick, opponents, heroes]);
  });

  it('keeps combat roles, special flags and continuous effects separate', () => {
    const s = newGame(players);
    const ids = soldiers(s, 6);
    s.combat = { attacks: [{ attacker: ids[0]!, defender: 'P2' }], blocks: [], blockersPending: [] };
    s.cards[ids[1]!]!.unearthed = true;
    s.cards[ids[2]!]!.monstrous = true;
    s.temporaryEffects.push({ source: ids[3]!, affected: ids[3]!, flags: ['cantBeBlocked'] });
    expect(ids.slice(0, 4).map((id) => tokenStackKey(s, id))).toEqual(Array(4).fill(null));
    put(s, 'P1', 'hardened-scales');
    expect(ids.map((id) => tokenStackKey(s, id))).toEqual(Array(6).fill(null));
  });
});
