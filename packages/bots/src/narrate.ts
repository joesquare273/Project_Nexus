// Turns engine events into readable lines for terminal output. Pass events
// already filtered for the viewer, so hidden cards stay hidden.

import type {
  ActivatedSpec,
  Amount,
  CardDefinition,
  EffectSpec,
  GameEvent,
  GameState,
  ObjectFilter,
  Target,
  TriggerSpec,
} from '@nexus/engine';

const TARGET_TEXT: Record<EffectSpec['target'], string> = {
  AnyTarget: 'any target',
  EachOpponent: 'each opponent',
  EachOpponentCreature: 'each creature your opponents control',
  EachCreatureYouControl: 'each creature you control',
  EachPlayer: 'each player',
  OpponentCreature: 'target creature an opponent controls',
  TargetCreature: 'target creature',
  TargetOpponent: 'target opponent',
  TargetPlayer: 'target player',
  TargetPermanent: 'target permanent',
  TargetCardInGraveyard: 'target card in a graveyard',
  PreviousTarget: 'it',
  PreviousTargetController: "that permanent's controller",
  DefendingPlayer: 'the defending player',
  CreatedTokens: 'the token',
  This: 'this card',
  You: 'you',
};

const COUNT_TEXT: Record<string, string> = {
  EquipmentYouControl: 'Equipment you control',
  CreaturesYouControl: 'creatures you control',
  EquippedCreaturesYouControl: 'equipped creatures you control',
  NoncreatureNonlandCardsInYourGraveyard: 'noncreature, nonland cards in your graveyard',
  CreaturesDiedThisTurn: 'creatures that died this turn',
};

function amountText(a: Amount | undefined): string {
  if (a === undefined) return '0';
  if (typeof a === 'number') return String(a);
  return `X (the number of ${a.count.map((k) => COUNT_TEXT[k] ?? k).join(' plus ')})`;
}

function targetText(e: EffectSpec): string {
  if (e.target === 'TargetPermanent' && e.filter) return `target ${subjectText(e.filter, 'permanent')}`;
  if (e.target === 'TargetCardInGraveyard' && e.filter) {
    return `target ${subjectText({ ...e.filter, controller: undefined }, 'card')} from ${e.filter.controller === 'You' ? 'your' : 'a'} graveyard`;
  }
  return TARGET_TEXT[e.target];
}

function effectText(e: EffectSpec): string {
  const who = targetText(e);
  const you = who === 'you';
  const n = amountText(e.amount);
  const plural = (word: string) => (n === '1' ? `a ${word}` : `${n} ${word}s`);
  switch (e.effect) {
    case 'DealDamage':
      return `deal ${n} damage to ${who}`;
    case 'Destroy':
      return `destroy ${who}`;
    case 'Exile':
      return `exile ${who}`;
    case 'DrawCards':
      return `${you ? 'draw' : `${who} draws`} ${plural('card')}`;
    case 'GainLife':
      return `${you ? 'you gain' : `${who} gains`} ${n} life`;
    case 'LoseLife':
      return `${you ? 'you lose' : `${who} loses`} ${n} life`;
    case 'Tap':
      return `tap ${who}`;
    case 'ReturnToHand':
      return `return ${who} to ${e.target === 'This' ? 'your' : "its owner's"} hand`;
    case 'AddCounters':
      return `put ${n === '1' ? 'a +1/+1 counter' : `${n} +1/+1 counters`} on ${who}`;
    case 'CreateToken':
      return `create ${plural(`${e.token?.replace(/-token$/, '').replace(/-/g, ' ')} token`)}`;
    case 'CreateTokenCopy':
      return `create a token that's a copy of ${who}`;
    case 'ModifyPT': {
      const sign = (v: number | undefined) => `${(v ?? 0) >= 0 ? '+' : ''}${v ?? 0}`;
      return `${who} ${who.startsWith('each') ? 'gets' : 'gets'} ${sign(e.power)}/${sign(e.toughness)} until end of turn`;
    }
    case 'GrantKeywords':
      return `${who} gains ${keywordText(e.keywords ?? [])} until end of turn`;
    case 'GrantFlags':
      return (e.flags ?? [])
        .map((f) =>
          f === 'cantBeBlocked'
            ? `${who} can't be blocked this turn`
            : f === 'mustBeBlocked'
              ? `${who} must be blocked this turn if able`
              : `if ${who} would die this turn, exile it instead`,
        )
        .join(' and ');
    case 'ExileUntilSourceLeaves':
      return `exile ${who} until this leaves the battlefield`;
    case 'ExileTopCardToPlay':
      return 'exile the top card of your library; you may play it for as long as you control this';
    case 'Mill':
      return `mill ${n}`;
    case 'Surveil':
      return `surveil ${n}`;
    case 'Scry':
      return `scry ${n}`;
    case 'SearchLibraryToBattlefield':
      return `search your library for a ${e.filter?.supertypes?.includes('Basic') ? 'basic land' : (e.filter?.subtypes?.join(' or ') ?? '')} card and put it onto the battlefield${e.entersTapped ? ' tapped' : ''}`;
    case 'ReturnToBattlefield':
      return `return ${who} to the battlefield${e.counters ? ` with ${e.counters} extra +1/+1 counters` : ''}`;
    case 'Attach':
      return `attach this to ${who}`;
    case 'AttachAllEquipment':
      return `attach any number of Equipment you control to ${who}`;
    case 'SearchLibraryToHand':
      return `search your library for a ${e.filter?.subtypes?.join(' or ') ?? ''} card and put it into your hand`;
  }
}

function keywordText(keywords: readonly string[]): string {
  return keywords
    .join(', ')
    .replace('FirstStrike', 'first strike')
    .replace('DoubleStrike', 'double strike')
    .toLowerCase();
}

/** A plain summary of an activated ability, e.g. "{1}{W}, {T}: tap target creature". */
export function activatedText(a: ActivatedSpec): string {
  const cost = [a.cost.mana, a.cost.tap && '{T}', a.cost.discardThis && 'discard this card'].filter(Boolean).join(', ');
  const body = a.equip ? 'Equip' : a.effects.map(effectText).join(' and ');
  return a.equip ? `${body} ${a.cost.mana}` : `${cost}: ${body}`;
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
  for (const [i, mode] of (def.modes ?? []).entries()) parts.push(`Mode ${i + 1}: ${mode.map(effectText).join(' and ')}`);
  for (const t of def.triggers ?? []) parts.push(triggerText(t).replace(/\.$/, ''));
  if (def.equip) parts.push(`Equip ${def.equip}`);
  if (def.flashback) parts.push(`Flashback ${def.flashback}`);
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
    case 'AbilityActivated': {
      const targets = e.targets.length ? ` targeting ${e.targets.map((t) => targetName(s, t, viewer)).join(', ')}` : '';
      return `${who(e.controller)} activated ${cardName(s, e.card)}${targets}.`;
    }
    case 'Decided':
      return `  ${who(e.player)} ${e.accepted ? 'chose yes' : 'chose no'} for ${cardName(s, e.card)}.`;
    case 'Surveiled':
      if (e.scry) return `  ${who(e.player)} scried${e.toGraveyard ? ', putting a card on the bottom' : ', keeping the card on top'}.`;
      return `  ${who(e.player)} surveiled${e.toGraveyard ? `, putting ${cardName(s, e.card)} into the graveyard` : ', keeping the card on top'}.`;
    case 'CommanderZoneChosen':
      return e.toCommand
        ? `  ${who(e.player)} put ${cardName(s, e.card)} into the command zone.`
        : `  ${who(e.player)} left ${cardName(s, e.card)} in the ${e.from}.`;
    case 'LegendChosen':
      return `  Legend rule: ${who(e.player)} ${e.player === viewer ? 'keep' : 'keeps'} ${cardName(s, e.kept)}.`;
    case 'TokenCreated':
      return `  ${who(e.controller)} created a ${cardName(s, e.card)} token.`;
    case 'CountersAdded':
      return `  ${cardName(s, e.card)} gets ${e.amount === 1 ? 'a +1/+1 counter' : `${e.amount} +1/+1 counters`}.`;
    case 'Attached':
      return e.creature
        ? `  ${cardName(s, e.equipment)} is attached to ${cardName(s, e.creature)}.`
        : `  ${cardName(s, e.equipment)} becomes unattached.`;
    case 'StackItemResolved':
      return e.fizzled ? `${cardName(s, e.card)} has no legal targets and does nothing.` : null;
    case 'CardMoved':
      if (e.from === 'hand' && e.to === 'battlefield') return `${who(e.owner)} played ${cardName(s, e.card)}.`;
      if (e.from === 'graveyard' && e.to === 'hand') return `  ${cardName(s, e.card)} returns to ${who(e.owner)}${e.owner === viewer ? 'r' : "'s"} hand.`;
      if (e.from === 'graveyard' && e.to === 'battlefield') return `  ${cardName(s, e.card)} returns to the battlefield.`;
      if (e.from === 'battlefield' && e.to === 'exile') return `  ${cardName(s, e.card)} is exiled.`;
      if (e.from === 'exile' && e.to === 'battlefield') return `  ${cardName(s, e.card)} returns from exile.`;
      if (e.from === 'library' && e.to === 'exile') return `  ${cardName(s, e.card)} is exiled from the top of the library.`;
      if (e.from === 'library' && e.to === 'graveyard') return `  ${cardName(s, e.card)} is milled.`;
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
        {
          life: 'no life left',
          emptyLibrary: 'drew from an empty library',
          conceded: 'conceded',
          commanderDamage: '21 commander damage',
        }[e.reason]
      }).`;
    case 'GameEnded':
      return `\n*** Game over. ${e.winner === null ? 'It is a draw.' : e.winner === viewer ? 'You win!' : `${e.winner} wins.`}`;
    default:
      return null;
  }
}
