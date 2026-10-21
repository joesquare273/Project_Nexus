// Turns engine events into readable lines for terminal output. Pass events
// already filtered for the viewer, so hidden cards stay hidden.

import type { CardDefinition, EffectSpec, GameEvent, GameState, ObjectFilter, Target, TriggerSpec } from '@nexus/engine';

const TARGET_TEXT: Record<EffectSpec['target'], string> = {
  AnyTarget: 'any target',
  EachOpponent: 'each opponent',
  EachOpponentCreature: 'each creature your opponents control',
  EachPlayer: 'each player',
  OpponentCreature: 'target creature an opponent controls',
  TargetCreature: 'target creature',
  TargetOpponent: 'target opponent',
  TargetPlayer: 'target player',
  This: 'this card',
  You: 'you',
};

function effectText(e: EffectSpec): string {
  const who = TARGET_TEXT[e.target];
  const you = who === 'you';
  switch (e.effect) {
    case 'DealDamage':
      return `deal ${e.amount} damage to ${who}`;
    case 'Destroy':
      return `destroy ${who}`;
    case 'DrawCards':
      return `${you ? 'draw' : `${who} draws`} ${e.amount === 1 ? 'a card' : `${e.amount} cards`}`;
    case 'GainLife':
      return `${you ? 'you gain' : `${who} gains`} ${e.amount} life`;
    case 'LoseLife':
      return `${you ? 'you lose' : `${who} loses`} ${e.amount} life`;
    case 'Tap':
      return `tap ${who}`;
    case 'ReturnToHand':
      return `return ${who} to ${e.target === 'This' ? 'your' : "its owner's"} hand`;
  }
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "creature or artifact you control", "noncreature spell", "creatures or artifacts you control", ... */
function subjectText(f: ObjectFilter, noun: string, plural = false): string {
  const s = plural ? 's' : '';
  const prefix = (f.nonTypes ?? []).map((t) => `non${t} `).join('');
  // Categories name the noun: "nonland permanent", "nonpermanent spell".
  const base = f.categories?.length ? f.categories.join(' ') : noun;
  const nouns = f.types?.length ? f.types.map((t) => `${prefix}${t}${s}`).join(' or ') : `${prefix}${base}${s}`;
  const owner = f.controller === 'You' ? ' you control' : f.controller === 'Opponent' ? ' an opponent controls' : '';
  return `${nouns}${owner}`;
}

function triggerCondition(t: TriggerSpec): string {
  if (t.when === 'BeginCombat') return t.turn === 'Each' ? 'At the beginning of each combat' : 'At the beginning of combat on your turn';
  if (t.when === 'Upkeep') return t.turn === 'Each' ? "At the beginning of each player's upkeep" : 'At the beginning of your upkeep';
  const verb = {
    EntersBattlefield: 'enters',
    Dies: 'dies',
    Attacks: 'attacks',
    SpellCast: '',
    CombatDamageToPlayer: 'deals combat damage to a player',
  }[t.when];
  if (!t.what) return `When this ${verb}`;
  if (t.when === 'SpellCast') return `Whenever ${t.what.controller === 'You' ? 'you cast' : 'a player casts'} a ${subjectText({ ...t.what, controller: undefined }, 'spell')}`;
  if (t.oneOrMore) {
    const plural = verb === 'dies' ? 'die' : verb === 'enters' ? 'enter' : verb === 'attacks' ? 'attack' : verb.replace('deals', 'deal');
    return `Whenever one or more ${t.what.other ? 'other ' : ''}${subjectText(t.what, 'permanent', true)} ${plural}`;
  }
  return `Whenever ${t.what.other ? 'another' : 'this or another'} ${subjectText(t.what, 'permanent')} ${verb}`;
}

/** A plain summary of one triggered ability. */
export function triggerText(t: TriggerSpec): string {
  const effects = t.effects.map(effectText).join(' and ');
  const body = t.cost
    ? `you may pay ${[t.cost.mana, t.cost.life && `${t.cost.life} life`].filter(Boolean).join(' and ')}. If you do, ${effects}`
    : t.optional
      ? `you may ${effects}`
      : effects;
  const where = t.zone === 'graveyard' ? ' This works while the card is in your graveyard.' : '';
  const once = t.oncePerTurn ? ' This triggers only once each turn.' : '';
  return `${triggerCondition(t)}, ${body}.${where}${once}`;
}

/** A plain summary of what a card does, generated from its data. */
export function rulesSummary(def: CardDefinition): string {
  const parts: string[] = [];
  if (def.keywords?.length) parts.push(def.keywords.join(', ').replace('FirstStrike', 'First strike').replace('DoubleStrike', 'Double strike'));
  if (def.entersTapped) parts.push('Enters tapped');
  for (const e of def.effects ?? []) parts.push(capitalize(effectText(e)));
  for (const t of def.triggers ?? []) parts.push(triggerText(t).replace(/\.$/, ''));
  if (def.notBuilt) {
    parts.push(
      def.types.includes('creature')
        ? 'Not built yet: only its power, toughness and keywords work'
        : "Not built yet: can't be cast",
    );
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
    case 'AbilityTriggered': {
      const targets = e.targets.length ? ` targeting ${e.targets.map((t) => targetName(s, t, viewer)).join(', ')}` : '';
      return `  ${cardName(s, e.card)} triggers (${who(e.controller)})${targets}.`;
    }
    case 'Decided':
      return `  ${who(e.player)} ${e.accepted ? 'chose yes' : 'chose no'} for ${cardName(s, e.card)}.`;
    case 'StackItemResolved':
      return e.fizzled ? `${cardName(s, e.card)} has no legal targets and does nothing.` : null;
    case 'CardMoved':
      if (e.from === 'hand' && e.to === 'battlefield') return `${who(e.owner)} played ${cardName(s, e.card)}.`;
      if (e.from === 'graveyard' && e.to === 'hand') return `  ${cardName(s, e.card)} returns to ${who(e.owner)}${e.owner === viewer ? 'r' : "'s"} hand.`;
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
