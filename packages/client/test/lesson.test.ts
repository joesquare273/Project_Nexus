// Walks through the "Learn to play" lesson the way a player would, checking
// each step allows the move it teaches and finishes when it should.

import { describe, expect, it } from 'vitest';
import type { Action } from '@nexus/engine';
import { GameSession, YOU } from '../src/game/session.ts';
import { TUTOR, firstLesson } from '../src/tutorial/lesson.ts';
import { currentTip } from '../src/tutorial/tips.ts';

function start() {
  const lesson = firstLesson();
  const session = new GameSession({ deck: 'RW', opponents: 1, bot: 'ai', seed: 0 }, lesson.scenario);
  const settle = () => {
    for (let i = 0; i < 500; i++) {
      const r = session.advance();
      if (r === 'you' || r === 'over') return;
    }
    throw new Error('the game never came back to you');
  };
  settle();
  return { lesson, session, settle };
}

describe('Learn to play', () => {
  it('can be played from start to finish, ending in a win', () => {
    const { lesson, session, settle } = start();
    const [intro, land, equip, hero, slash, attack] = lesson.steps;
    const s = () => session.state;
    const doMove = (actions: Action[]) => {
      expect(session.submit(actions)).toBeNull();
      settle();
    };
    const playFor = (defId: string) => session.plays().find((p) => s().cards[p.card]!.defId === defId)!;

    expect(lesson.steps).toHaveLength(6);
    expect(intro!.allows).toBeUndefined();

    // Play a land.
    const landPlay = playFor('plains').choices[0]!;
    expect(land!.allows!(landPlay.action, s())).toBe(true);
    expect(land!.done!(s())).toBe(false);
    doMove([landPlay.action]);
    expect(land!.done!(s())).toBe(true);

    // Cast the Katana: the Hero arrives with it attached.
    const katana = playFor('samurais-katana').choices[0]!;
    expect(equip!.allows!(katana.action, s())).toBe(true);
    expect(equip!.allows!(playFor('slash-of-light').choices[0]!.action, s())).toBe(false);
    doMove([...katana.taps, katana.action]);
    expect(equip!.done!(s())).toBe(true);
    expect(hero!.focus(s())).toHaveLength(1);

    // Slash of Light on Shinra Reinforcements.
    const shinra = s().players[TUTOR]!.battlefield.find((id) => s().cards[id]!.defId === 'shinra-reinforcements')!;
    const choices = playFor('slash-of-light').choices;
    const onShinra = choices.find((c) => c.targets.some((t) => t.kind === 'card' && t.card === shinra))!;
    const elsewhere = choices.find((c) => c !== onShinra);
    expect(slash!.allows!(onShinra.action, s())).toBe(true);
    if (elsewhere) expect(slash!.allows!(elsewhere.action, s())).toBe(false);
    doMove([...onShinra.taps, onShinra.action]);
    expect(slash!.done!(s())).toBe(true);

    // Attack with both for exactly 5.
    expect(s().pending).toEqual({ kind: 'declareAttackers', player: YOU });
    const attackers = attack!.focus(s());
    const partial: Action = { type: 'DeclareAttackers', player: YOU, attacks: [{ attacker: attackers[0]!, defender: TUTOR }] };
    expect(attack!.allows!(partial, s())).toBe(false);
    const all: Action = {
      type: 'DeclareAttackers',
      player: YOU,
      attacks: attackers.map((attacker) => ({ attacker, defender: TUTOR })),
    };
    expect(attack!.allows!(all, s())).toBe(true);
    doMove([all]);
    expect(attack!.done!(s())).toBe(true);
    expect(s().winner).toBe(YOU);
  });
});

describe('Practice game tips', () => {
  it('explain the first land drop, attacks and blocks, once each', () => {
    const session = new GameSession({ deck: 'RW', opponents: 1, bot: 'ai', seed: 4, coaching: true });
    const s = session.state;
    s.activePlayer = YOU;
    s.step = 'main1';
    s.pending = { kind: 'priority', player: YOU, passes: 0 };
    const seen = new Set<string>(['welcome']);
    expect(currentTip(s, seen, true, true)?.id).toBe('land');
    seen.add('land');
    expect(currentTip(s, seen, false, true)?.id).toBe('cast');
    s.pending = { kind: 'declareAttackers', player: YOU };
    expect(currentTip(s, seen, false, false)?.id).toBe('attack');
    seen.add('attack');
    expect(currentTip(s, seen, false, false)).toBeNull();
  });
});
