// Coaching tips for the practice game: short explanations that appear the
// first time a situation comes up. No UI code here.

import type { GameState } from '@nexus/engine';
import { YOU } from '../game/session.ts';

export interface Tip {
  /** Shown once per game; dismissed tips don't come back. */
  id: string;
  title: string;
  text: string;
}

/** The tip for the current moment, if any, skipping ones already dismissed. */
export function currentTip(s: GameState, dismissed: ReadonlySet<string>, canPlayLand: boolean, hasPlays: boolean): Tip | null {
  const p = s.pending;
  if (p.kind === 'gameOver') return null;
  const candidates: Tip[] = [];
  const yourTurn = s.activePlayer === YOU;
  const main = s.step === 'main1' || s.step === 'main2';

  if (s.turnNumber <= 2) {
    candidates.push({
      id: 'welcome',
      title: 'A fresh game',
      text:
        'You and the AI each start with 20 life and a random hand of 7. Play a land each turn, cast creatures, ' +
        'and attack to bring your opponent to 0. Tips like this one appear as things come up; press "Got it" to hide each.',
    });
  }
  if (p.kind === 'priority' && p.player === YOU && yourTurn && main && canPlayLand) {
    candidates.push({
      id: 'land',
      title: 'Your land for the turn',
      text: 'You can play one land each turn. Click a glowing land in your hand. More lands means bigger spells later.',
    });
  }
  if (p.kind === 'priority' && p.player === YOU && yourTurn && main && hasPlays && !canPlayLand) {
    candidates.push({
      id: 'cast',
      title: 'Casting spells',
      text:
        "Glowing cards are ones you can afford right now. Click one to cast it; your lands tap automatically. " +
        'Hover over a card to read what it does. When you\'re done, press "Go to combat" or "End turn".',
    });
  }
  if (p.kind === 'declareAttackers' && p.player === YOU) {
    candidates.push({
      id: 'attack',
      title: 'Attacking',
      text:
        "Click creatures to attack with them, then press Attack. Creatures that arrived this turn can't attack (\"z\" badge) " +
        "unless they have haste. Attacking taps a creature, so it can't block on your opponent's turn (unless it has vigilance).",
    });
  }
  if (p.kind === 'declareBlockers' && p.player === YOU) {
    candidates.push({
      id: 'block',
      title: 'Blocking',
      text:
        'An attacker is coming at you. Click the attacker, then one of your untapped creatures to block it. ' +
        "Blocked creatures deal damage to each other instead of to you. Flying attackers can only be blocked by flying or reach creatures.",
    });
  }
  if (p.kind === 'priority' && p.player === YOU && s.stack.at(-1) && s.stack.at(-1)!.controller !== YOU) {
    candidates.push({
      id: 'respond',
      title: 'Responding',
      text:
        "Your opponent cast something; it's on the stack (top right). You can answer with an instant (a glowing card), " +
        'or press "Let it resolve".',
    });
  }
  if (p.kind === 'surveil' && p.player === YOU) {
    candidates.push({
      id: 'surveil',
      title: 'Surveil',
      text: "You're looking at the top card of your library. Keep it there to draw it next, or put it into your graveyard.",
    });
  }
  if (p.kind === 'chooseTargets' && p.player === YOU) {
    candidates.push({
      id: 'trigger-targets',
      title: 'Triggered ability',
      text: 'One of your cards triggered and needs a target. Click one of the highlighted cards or players.',
    });
  }
  if (p.kind === 'decide' && p.player === YOU) {
    candidates.push({
      id: 'you-may',
      title: '"You may"',
      text: 'This ability is optional. Choose Yes or No; if it has a cost, your lands tap for it automatically.',
    });
  }
  if (p.kind === 'commanderZone' && p.player === YOU) {
    candidates.push({
      id: 'commander-zone',
      title: 'Your commander left the battlefield',
      text:
        'When your commander would go to your graveyard, exile, hand or library, you may put it back in the ' +
        'command zone instead and cast it again later (for {2} more each time). Usually you want to.',
    });
  }
  if (p.kind === 'chooseLegend' && p.player === YOU) {
    candidates.push({
      id: 'legend',
      title: 'The legend rule',
      text:
        "You control two legendary permanents with the same name, which isn't allowed. Keep the better one " +
        '(counters and Equipment count); the other goes to your graveyard.',
    });
  }
  return candidates.find((t) => !dismissed.has(t.id)) ?? null;
}
