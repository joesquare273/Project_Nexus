// The engine is a pure function: (state, action) -> (newState, events).
// The input state is never mutated.

import { declareAttackers, declareBlockers } from './combat.ts';
import { chooseCommanderZone, chooseLegend, stabilize } from './sba.ts';
import { activateAbility, activateManaAbility, castSpell, decide, playLand, surveil } from './stack.ts';
import { chooseTriggerTargets } from './triggers.ts';
import { passPriority } from './turn.ts';
import { bottomCards, mulligan } from './mulligan.ts';
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
        playLand(ctx, action.player, action.card, action.reveal);
        s.pending = { kind: 'priority', player: action.player, passes: 0 };
        break;
      case 'CastSpell':
        requirePriority(s, action.player);
        castSpell(ctx, action.player, action.card, action.targets, action.mode);
        s.pending = { kind: 'priority', player: action.player, passes: 0 };
        break;
      case 'ActivateManaAbility':
        // Mana abilities also work while deciding whether to pay a cost (rule 605.3a).
        if (s.pending.kind === 'decide' && s.pending.player === action.player) {
          activateManaAbility(ctx, action.player, action.card, action.mana);
          break;
        }
        requirePriority(s, action.player);
        activateManaAbility(ctx, action.player, action.card, action.mana);
        s.pending = { kind: 'priority', player: action.player, passes: 0 };
        break;
      case 'ActivateAbility':
        requirePriority(s, action.player);
        activateAbility(ctx, action.player, action.card, action.ability, action.targets);
        s.pending = { kind: 'priority', player: action.player, passes: 0 };
        break;
      case 'Surveil':
        surveil(ctx, action.player, action.toGraveyard);
        break;
      case 'ChooseLegend':
        chooseLegend(ctx, action.player, action.keep);
        break;
      case 'CommanderZone':
        chooseCommanderZone(ctx, action.player, action.toCommand);
        break;
      case 'Mulligan':
        mulligan(ctx, action.player, action.keep);
        break;
      case 'BottomCards':
        bottomCards(ctx, action.player, action.cards);
        break;
      case 'ChooseTargets':
        chooseTriggerTargets(ctx, action.player, action.targets);
        break;
      case 'Decide':
        decide(ctx, action.player, action.accept);
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
