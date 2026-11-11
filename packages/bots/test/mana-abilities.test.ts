// Every built card with a mana ability: tapping it works and adds mana, both
// in the real game and on an online board's own copy (where hidden cards
// are placeholders). A mana ability that moves a hidden card (Millikin mills
// one) can't be shown on that copy, so the online board sends it to the
// server at once instead of holding it with the spell it pays for.

import { describe, expect, it } from 'vitest';
import { AliasBook, applyAction, getLegalActions, materialize, playerUpdate, HIDDEN_CARD, type Action } from '@nexus/engine';
import { CARD_DEFS } from '@nexus/cards';
import { goTo, newGame, put } from './kit-helpers.ts';

/** Cards whose mana ability needs something this setup doesn't have (a commander, five lands, a chosen color, an untapped artifact). */
const NEEDS_MORE = new Set(['arcane-signet', 'commanders-sphere', 'temple-of-the-false-god', 'crossroads-village', 'urza-lord-high-artificer']);
/** Mana abilities that move a hidden card. */
const MOVES_HIDDEN = new Set(['millikin']);

describe('mana abilities', () => {
  it('every built card with one: it can be tapped, adds mana, and works on an online board’s copy', () => {
    const problems: string[] = [];
    for (const def of Object.values(CARD_DEFS)) {
      if ((!def.produces && !def.manaAbility) || def.notBuilt) continue;
      let s = newGame();
      const id = put(s, 'P1', def.id, 'battlefield', { counters: 1, namedCounters: { charge: 2 } });
      put(s, 'P1', 'forest');
      put(s, 'P1', 'mountain');
      s = goTo(s, 'main1');
      s.players.P1!.manaPool = { W: 2, U: 2, B: 2, R: 2, G: 2, C: 2 };
      const ways = getLegalActions(s).filter((a): a is Extract<Action, { type: 'ActivateManaAbility' }> => a.type === 'ActivateManaAbility' && a.card === id);
      if (ways.length === 0) {
        if (!NEEDS_MORE.has(def.id) && (!def.types.includes('land') || def.produces?.length)) problems.push(`${def.id}: can't be tapped for mana`);
        continue;
      }
      // Restricted mana (only for Equipment, artifacts or noncreature spells) has its own pools.
      const pool = (st: typeof s) => {
        const p = st.players.P1!;
        return [p.manaPool, p.equipmentMana, p.artifactMana ?? {}, p.noncreatureSpellMana, ...Object.values(p.restrictedMana ?? {})].flatMap((m) => Object.values(m) as number[]).reduce((x, y) => x + y, 0);
      };
      for (const a of ways) {
        const r = applyAction(s, a);
        if (!r.ok) problems.push(`${def.id}: ${r.error}`);
        else if (a.payWith === undefined && pool(r.state) <= pool(s)) problems.push(`${def.id}: no mana added`);
        let n = 0;
        const u = playerUpdate(s, 'P1', new AliasBook(() => `a${n++}`));
        const local = materialize(u.state, CARD_DEFS);
        const mine = u.legal.find((x) => x.type === 'ActivateManaAbility' && x.mana === a.mana && x.output === a.output && x.payWith === a.payWith && !!x.sacrifice === !!a.sacrifice);
        if (!mine) continue;
        const lr = applyAction(local, mine);
        const shown = lr.ok && Object.values(lr.state.cards).some((c) => c.defId === HIDDEN_CARD.id && c.zone !== 'library' && c.zone !== 'hand');
        if (shown !== MOVES_HIDDEN.has(def.id)) problems.push(`${def.id}: hidden card ${shown ? 'shown' : 'not moved'} on the board's copy`);
      }
    }
    expect(problems).toEqual([]);
  });
});
