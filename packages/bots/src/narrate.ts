// Turns engine events into readable lines for terminal output. Pass events
// already filtered for the viewer, so hidden cards stay hidden.

import type { CardDefinition, EffectSpec, GameEvent, GameState, Target } from '@nexus/engine';

const TARGET_TEXT: Record<EffectSpec['target'], string> = {
  AnyTarget: 'any target',
  EachOpponent: 'each opponent',
  EachPlayer: 'each player',
  OpponentCreature: 'target creature an opponent controls',
  TargetCreature: 'target creature',
  TargetPlayer: 'target player',
  You: 'you',
};

/** A plain summary of what a card does, generated from its data. */
export function rulesSummary(def: CardDefinition): string {
  const parts: string[] = [];
  if (def.keywords?.length) parts.push(def.keywords.join(', ').replace('FirstStrike', 'First strike').replace('DoubleStrike', 'Double strike'));
  if (def.entersTapped) parts.push('Enters tapped');
  for (const e of def.effects ?? []) {
    const who = TARGET_TEXT[e.target];
    if (e.effect === 'DealDamage') parts.push(`Deal ${e.amount} damage to ${who}`);
    if (e.effect === 'Destroy') parts.push(`Destroy ${who}`);
    if (e.effect === 'DrawCards') parts.push(`${who === 'you' ? 'Draw' : `${who} draws`} ${e.amount === 1 ? 'a card' : `${e.amount} cards`}`);
    if (e.effect === 'GainLife') parts.push(`${who === 'you' ? 'You gain' : `${who} gains`} ${e.amount} life`);
  }
  const body = parts.join('. ');
  const stats = def.types.includes('creature') ? `${def.power}/${def.toughness}` : '';
  return [stats, body && `${body}.`].filter(Boolean).join(' ');
}

const STEP_NAMES: Record<string, string> = {
  untap: 'Untap',
  upkeep: 'Upkeep',
  draw: 'Draw',
  main1: 'Main phase 1',
  beginCombat: 'Beginning of combat',
  declareAttackers: 'Declare attackers',
  declareBlockers: 'Declare blockers',
  combatDamage: 'Combat damage',
  endCombat: 'End of combat',
  main2: 'Main phase 2',
  end: 'End step',
  cleanup: 'Cleanup',
};

export function stepName(step: string): string {
  return STEP_NAMES[step] ?? step;
}

export function cardName(s: GameState, id: string | undefined): string {
  if (!id) return 'a card';
  return s.cardDefs[s.cards[id]?.defId ?? '']?.name ?? id;
}

export function targetName(s: GameState, t: Target, viewer?: string): string {
  if (t.kind === 'player') return t.player === viewer ? 'you' : t.player;
  return cardName(s, t.card);
}

/** One line per notable event, or null for events not worth showing. */
export function describe(s: GameState, e: GameEvent, viewer?: string): string | null {
  const who = (p: string) => (p === viewer ? 'You' : p);
  switch (e.type) {
    case 'TurnChanged':
      return `\n===== Turn ${e.turnNumber}: ${e.activePlayer === viewer ? 'your' : `${e.activePlayer}'s`} turn =====`;
    case 'CardDrawn':
      if (!viewer) return null;
      return e.card ? `${who(e.player)} drew ${cardName(s, e.card)}.` : `${who(e.player)} drew a card.`;
    case 'SpellCast': {
      const targets = e.targets.length ? ` targeting ${e.targets.map((t) => targetName(s, t, viewer)).join(', ')}` : '';
      return `${who(e.player)} cast ${cardName(s, e.card)}${targets}.`;
    }
    case 'StackItemResolved':
      return e.fizzled ? `${cardName(s, e.card)} has no legal targets and does nothing.` : null;
    case 'CardMoved':
      if (e.from === 'hand' && e.to === 'battlefield') return `${who(e.owner)} played ${cardName(s, e.card)}.`;
      return null;
    case 'AttackDeclared':
      return `  ${cardName(s, e.attacker)} attacks ${e.defendingPlayer === viewer ? 'you' : e.defendingPlayer}.`;
    case 'BlockDeclared':
      return `  ${cardName(s, e.blocker)} blocks ${cardName(s, e.attacker)}.`;
    case 'DamageDealt':
      return `  ${cardName(s, e.source)} deals ${e.amount} damage to ${targetName(s, e.target, viewer)}.`;
    case 'CreatureDied':
      return `  ${cardName(s, e.card)} dies.`;
    case 'PermanentDestroyed':
      return `  ${cardName(s, e.card)} is destroyed.`;
    case 'LifeChanged':
      return `  ${who(e.player)}: ${e.from} -> ${e.to} life.`;
    case 'PlayerEliminated':
      return `*** ${who(e.player)} ${e.player === viewer ? 'lose' : 'loses'} the game (${
        { life: 'no life left', emptyLibrary: 'drew from an empty library', conceded: 'conceded' }[e.reason]
      }).`;
    case 'GameEnded':
      return `\n*** Game over. ${e.winner === null ? 'It is a draw.' : e.winner === viewer ? 'You win!' : `${e.winner} wins.`}`;
    default:
      return null;
  }
}
