// The engine is a pure function: (state, action) -> (newState, events).
// The input state is never mutated.

import { declareAttackers, declareBlockers } from './combat.ts';
import { stabilize } from './sba.ts';
import { activateManaAbility, castSpell, playLand } from './stack.ts';
import { passPriority } from './turn.ts';
import { cloneState, reject, RuleError, type Ctx } from './state.ts';
import type { Action, ActionResult, GameState } from './types.ts';

function requirePriority(s: GameState, playerId: string): void {
  if (s.pending.kind !== 'priority' || s.pending.player !== playerId) reject('You do not have priority.');
}

export function applyAction(state: GameState, action: Action): ActionResult {
  if (state.pending.kind === 'gameOver') return { ok: false, error: 'The game is over.' };
  const ctx: Ctx = { s: cloneState(state), ev: [] };
  const s = ctx.s;
  try {
    const p = s.players[action.player];
    if (!p) reject(`Unknown player "${action.player}".`);
    if (p.eliminated) reject('You have left the game.');

    switch (action.type) {
      case 'Concede':
        // Allowed at any time, not only with priority (rule 104.3a).
        p.conceded = true;
        break;
      case 'PassPriority':
        requirePriority(s, action.player);
        passPriority(ctx, action.player);
        break;
      case 'PlayLand':
        requirePriority(s, action.player);
        playLand(ctx, action.player, action.card);
        s.pending = { kind: 'priority', player: action.player, passes: 0 };
        break;
      case 'CastSpell':
        requirePriority(s, action.player);
        castSpell(ctx, action.player, action.card, action.targets);
        s.pending = { kind: 'priority', player: action.player, passes: 0 };
        break;
      case 'ActivateManaAbility':
        requirePriority(s, action.player);
        activateManaAbility(ctx, action.player, action.card, action.mana);
        s.pending = { kind: 'priority', player: action.player, passes: 0 };
        break;
      case 'DeclareAttackers':
        declareAttackers(ctx, action.player, action.attacks);
        break;
      case 'DeclareBlockers':
        declareBlockers(ctx, action.player, action.blocks);
        break;
      default:
        reject(`Unknown action type "${(action as { type: string }).type}".`);
    }
    stabilize(ctx);
    return { ok: true, state: s, events: ctx.ev };
  } catch (e) {
    if (e instanceof RuleError) return { ok: false, error: e.message };
    throw e;
  }
}
