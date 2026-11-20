import { describe, expect, it } from 'vitest';
import { countOf, viewFor, type GameState } from '@nexus/engine';
import { createToken } from '../../engine/src/state.ts';
import { newGame, put } from '../../bots/test/kit-helpers.ts';
import { checkInvariants } from '../../bots/src/invariants.ts';
import { groupTokenCards, tokenStackKey } from '../src/game/tokenStacks.ts';

function soldiers(s: GameState, n: number, owner = 'P1') { return Array.from({ length: n }, () => createToken({ s, ev: [] }, 'soldier-token', owner)); }
const grouped = (s: GameState, ids: string[]) => groupTokenCards(ids, (id) => tokenStackKey(s, id));

describe.each([2, 3, 4])('token stacks with %i players', (players) => {
  it('stacks two or more identical tokens on one card without merging engine objects', () => {
    const s = newGame(players);
    const ids = soldiers(s, 1);
    expect(grouped(s, ids)).toHaveLength(1);
    ids.push(...soldiers(s, 1));
    const before = structuredClone(s);
    expect(grouped(s, ids)).toEqual([{ id: ids[0], members: ids, key: tokenStackKey(s, ids[0]!) }]);
    expect(s).toEqual(before);
    expect(countOf(s, 'CreaturesYouControl', 'P1')).toBe(2);
    expect(viewFor(s, 'P2').players.P1!.battlefield).toEqual(ids);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('splits off a token with counters, damage, something attached or an effect of its own', () => {
    const s = newGame(players);
    const plain = soldiers(s, 2);
    const modified = soldiers(s, 5);
    s.cards[modified[0]!]!.counters = 1;
    s.cards[modified[1]!]!.namedCounters = { shield: 1 };
    s.cards[modified[2]!]!.damage = 1;
    s.temporaryEffects.push({ source: modified[3]!, affected: modified[3]!, keywords: ['Flying'] });
    put(s, 'P1', 'lightning-greaves', 'battlefield', { attachedTo: modified[4] });
    expect(modified.map((id) => tokenStackKey(s, id))).toEqual(Array(5).fill(null));
    const groups = grouped(s, [...plain, ...modified]);
    expect(groups).toHaveLength(6);
    expect(groups[0]!.members).toEqual(plain);
    expect(groups.flatMap((g) => g.members)).toEqual([...plain, ...modified]);
  });

  it('stacks tokens with keywords or abilities too (Treasures), by tapped state', () => {
    const s = newGame(players);
    const keyword = Object.values(s.cardDefs).find((d) => d.token && d.keywords?.length && d.types.includes('creature'))!;
    const flyers = Array.from({ length: 3 }, () => createToken({ s, ev: [] }, keyword.id, 'P1'));
    expect(grouped(s, flyers)).toHaveLength(1);
    const treasures = Array.from({ length: 4 }, () => createToken({ s, ev: [] }, 'treasure-token', 'P1'));
    s.cards[treasures[0]!]!.tapped = true;
    s.cards[treasures[1]!]!.tapped = true;
    expect(grouped(s, treasures).map((g) => g.members)).toEqual([treasures.slice(0, 2), treasures.slice(2)]);
  });

  it('does not combine token types, owners, or summoning-sickness states', () => {
    const s = newGame(players);
    const ready = soldiers(s, 2);
    for (const id of ready) s.cards[id]!.summoningSick = false;
    const sick = soldiers(s, 2);
    const opponents = soldiers(s, 2, 'P2');
    const heroes = Array.from({ length: 2 }, () => createToken({ s, ev: [] }, 'hero-token', 'P1'));
    const groups = grouped(s, [...ready, ...sick, ...opponents, ...heroes]);
    expect(groups.map((g) => g.members)).toEqual([ready, sick, opponents, heroes]);
  });

  it('keeps attackers stacked by whom they attack; blockers and blocked attackers stand alone', () => {
    const s = newGame(players);
    const ids = soldiers(s, 5);
    s.combat = { attacks: [{ attacker: ids[0]!, defender: 'P2' }, { attacker: ids[1]!, defender: 'P2' }, { attacker: ids[2]!, defender: 'P2' }], blocks: [{ blocker: ids[4]!, attacker: ids[2]! }], blockersPending: [] };
    expect(grouped(s, ids).map((g) => g.members)).toEqual([[ids[0], ids[1]], [ids[2]], [ids[3]], [ids[4]]]);
  });

  it('stacks by current power and toughness: an anthem for all of them keeps them together', () => {
    const s = newGame(players);
    const ids = soldiers(s, 3);
    put(s, 'P1', 'hardened-scales');
    expect(grouped(s, ids)).toHaveLength(1);
    s.cards[ids[0]!]!.unearthed = true;
    expect(grouped(s, ids).map((g) => g.members.length)).toEqual([1, 2]);
  });
});
