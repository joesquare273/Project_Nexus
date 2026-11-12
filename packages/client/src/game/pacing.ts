// Presentation pauses belong to the browser session, never to the rules engine.
import type { Action, GameEvent } from '@nexus/engine';

export type AiPace = 'normal' | 'slow' | 'fast';

/** Let meaningful changes render, including resolutions caused by automatic passes. */
export function actionDelay(events: GameEvent[], action: Action, bot: boolean, pace: AiPace, targeted = false): number {
  let ms = 0;
  if (events.some(e => ['SpellCast', 'AbilityActivated', 'AbilityTriggered', 'StackItemResolved'].includes(e.type))) ms = 2600;
  else if (events.some(e => ['AttackDeclared', 'BlockDeclared', 'DamageDealt'].includes(e.type))) ms = 2200;
  else if (events.some(e => e.type === 'CardMoved' && e.to === 'battlefield')) ms = 1600;
  else if (events.some(e => e.type === 'TurnChanged')) ms = 1300;
  else if (events.some(e => e.type === 'CardDrawn' || e.type === 'CardsUntapped')) ms = 900;
  else if (bot && action.type === 'ActivateManaAbility') ms = 280;
  else if (bot && action.type !== 'PassPriority') ms = 1100;
  if (targeted) ms = Math.max(ms, 3600);
  // Fast is available for familiar games; normal leaves time to read what happened (slowed 2026-11-12: the computer's turns felt rushed).
  return Math.round(ms * (pace === 'slow' ? 1.6 : pace === 'fast' ? 0.3 : 1));
}
