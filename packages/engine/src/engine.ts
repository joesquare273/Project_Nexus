// The engine is a pure function: (state, action) -> (newState, events).
// The input state is never mutated.

import { declareAttackers, declareBlockers } from './combat.ts';
import { chooseCommanderZone, chooseLegend, stabilize } from './sba.ts';
import { activateAbility, activateManaAbility, castSpell, decide, foretell, playLand, chooseMana, exileTop, surveil, chooseCards, chooseDefender, chooseOpponent } from './stack.ts';
import { chooseTriggerModes, chooseTriggerTargets, placeTriggers } from './triggers.ts';
import { discardToHandSize, passPriority } from './turn.ts';
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

    // Triggers held from mana abilities: anything but casting, activating or more mana puts
    // them on the stack first, and the player gets priority back instead (rule 117.3c).
    const continuesPaying = ['ActivateManaAbility', 'CastSpell', 'ActivateAbility', 'Concede'].includes(action.type);
    if (s.triggersHeld && !continuesPaying && s.pending.kind === 'priority' && s.pending.player === action.player) {
      delete s.triggersHeld;
      placeTriggers(ctx, action.player);
      stabilize(ctx);
      return { ok: true, state: s, events: ctx.ev };
    }

    switch (action.type) {
      case 'ChooseOpponent':
        chooseOpponent(ctx, action.player, action.opponent);
        break;
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
        castSpell(ctx, action.player, action.card, action.targets, {
          ...(action.mode !== undefined ? { mode: action.mode } : {}),
          ...(action.modes ? { modes: action.modes } : {}),
          ...(action.costCards ? { costCards: action.costCards } : {}),
          ...(action.alternative ? { alternative: true } : {}),
          ...(action.adventure ? { adventure: true } : {}),
          ...(action.x !== undefined ? { x: action.x } : {}),
          ...(action.convoke ? { convoke: action.convoke } : {}),
          ...(action.improvise ? { improvise: action.improvise } : {}),
          ...(action.delve ? { delve: action.delve } : {}),
          ...(action.graveyardSource ? { graveyardSource: action.graveyardSource } : {}),
          ...(action.castGroup !== undefined ? { castGroup: action.castGroup } : {}),
          ...(action.kicks ? { kicks: action.kicks } : {}),
          ...(action.tapCreatures ? { tapCreatures: action.tapCreatures } : {}),
        });
        s.pending = { kind: 'priority', player: action.player, passes: 0 };
        break;
      case 'ActivateManaAbility':
        // Mana abilities also work while deciding whether to pay a cost, or paying to attack (rule 605.3a).
        if ((s.pending.kind === 'decide' || s.pending.kind === 'declareAttackers') && s.pending.player === action.player) {
          activateManaAbility(ctx, action.player, action.card, action.mana, action.output, action.payWith, action.tapCreature, action.grantedBy);
          break;
        }
        requirePriority(s, action.player);
        activateManaAbility(ctx, action.player, action.card, action.mana, action.output, action.payWith, action.tapCreature, action.grantedBy);
        s.pending = { kind: 'priority', player: action.player, passes: 0 };
        break;
      case 'Foretell':
        requirePriority(s, action.player);
        foretell(ctx, action.player, action.card);
        s.pending = { kind: 'priority', player: action.player, passes: 0 };
        break;
      case 'ActivateAbility':
        requirePriority(s, action.player);
        activateAbility(ctx, action.player, action.card, action.ability, action.targets, action.costCards);
        s.pending = { kind: 'priority', player: action.player, passes: 0 };
        break;
      case 'ChooseMana':
        chooseMana(ctx, action.player, action.mana);
        break;
      case 'ExileTop':
        exileTop(ctx, action.player, action.exile);
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
      case 'ChooseCards':
        if (s.pending.kind === 'chooseCards' && s.pending.purpose === 'handSize') discardToHandSize(ctx, action.player, action.cards);
        else chooseCards(ctx, action.player, action.cards);
        break;
      case 'BottomCards':
        bottomCards(ctx, action.player, action.cards);
        break;
      case 'ChooseTargets':
        chooseTriggerTargets(ctx, action.player, action.targets);
        break;
      case 'ChooseDefender':
        chooseDefender(ctx, action.player, action.defender);
        break;
      case 'ChooseModes':
        chooseTriggerModes(ctx, action.player, action.modes);
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
    // Abilities that trigger while you pay for something (a Treasure sacrificed for mana) wait
    // until the spell is cast, then go on the stack above it (rule 601.2i).
    stabilize(ctx, { holdTriggers: action.type === 'ActivateManaAbility' });
    return { ok: true, state: s, events: ctx.ev };
  } catch (e) {
    if (e instanceof RuleError) return { ok: false, error: e.message };
    throw e;
  }
}
