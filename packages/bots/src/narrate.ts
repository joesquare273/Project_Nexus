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
  AllPermanents: 'all permanents',
  TriggeringObject: 'that creature',
  TriggeringCard: 'that card',
  ActivePlayer: 'that player',
  EachPlayerWhoChose: 'each player who did',
  EachOpponentWhoChose: 'each opponent who did',
  EachOpponentWhoDidNotChoose: "each opponent who didn't",
  EachOpponentWhoLostLifeThisTurn: 'each opponent who lost life this turn',
  EachOtherOpponent: 'each other opponent',
  TargetSpell: 'target spell',
  AllGraveyardCards: 'all cards in all graveyards',
  You: 'you',
};

const COUNT_TEXT: Record<string, string> = {
  EquipmentYouControl: 'Equipment you control',
  CreaturesYouControl: 'creatures you control',
  EquippedCreaturesYouControl: 'equipped creatures you control',
  NoncreatureNonlandCardsInYourGraveyard: 'noncreature, nonland cards in your graveyard',
  CreaturesDiedThisTurn: 'creatures that died this turn',
  CreaturesOnBattlefield: 'creatures on the battlefield',
  EquippedAttackingCreaturesYouControl: 'equipped attacking creatures you control',
  CreaturesYouControlWithCounters: 'creatures you control with +1/+1 counters on them',
  CreatureCardsInYourGraveyard: 'creature cards in your graveyard',
  CountersAmongCreaturesYouControl: 'counters among creatures you control',
  PlayersWhoLostLifeThisTurn: 'players who lost life this turn',
  SoulCountersOnThis: 'soul counters on this',
};

/** "a +1/+1 counter", "2 shield counters". */
function countersText(n: string | number, kind: string = '+1/+1'): string {
  return String(n) === '1' ? `a ${kind} counter` : `${n} ${kind} counters`;
}

function amountText(a: Amount | undefined): string {
  if (a === undefined) return '0';
  if (typeof a === 'number') return String(a);
  if ('of' in a) {
    if (a.of === 'previousTargetPower' || a.of === 'subjectPower') return 'its power';
    if (a.of === 'sourcePower') return "this creature's power";
    if (a.of === 'subjectCounters') return 'that many';
    return 'the number of permanents destroyed this way';
  }
  const times = a.times && a.times !== 1 ? `${a.times === 2 ? 'twice' : `${a.times} times`} ` : '';
  return `X (${times}the number of ${a.count.map((k) => COUNT_TEXT[k] ?? k).join(' plus ')})`;
}

function targetText(e: EffectSpec): string {
  if (e.target === 'AllPermanents' && e.filter) return `all ${subjectText(e.filter, 'permanent', true)}`;
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
      return `exile ${who}${e.sameNameTokens ? ' and all tokens that player controls with the same name' : ''}`;
    case 'ExileGraveyard':
      return e.target === 'EachPlayer' ? 'exile all graveyards' : `exile ${who === 'you' ? 'your' : `${who}'s`} graveyard`;
    case 'SacrificeGreatestPower':
      return `${who} sacrifices a creature with the greatest power among creatures they control`;
    case 'Discard':
      if (e.wholeHand) return `${who} may discard their hand`;
      return `${you ? 'discard' : `${who} discards`} ${e.anyNumber ? 'any number of cards' : (e.optional ? 'up to ' : '') + plural('card')}`;
    case 'Sacrifice': {
      const what = subjectText({ ...e.filter, controller: undefined }, 'permanent');
      return `${you ? (e.optional ? 'you may sacrifice' : 'sacrifice') : `${who} ${e.optional ? 'may sacrifice' : 'sacrifices'}`} a ${what}`;
    }
    case 'MoveCounters':
      return `move a counter onto ${who}`;
    case 'ChooseTarget':
      return `choose ${who}`;
    case 'AttachEquipmentTo':
      return `attach the Equipment to ${who}`;
    case 'PutFromHand':
      return `${you ? 'you may put' : `${who} may put`} a ${subjectText({ ...e.filter, controller: undefined }, 'card')} from your hand onto the battlefield`;
    case 'KeepAndSacrificeRest': {
      const kept = e.onePerType ? `one ${e.onePerType.join(', one ')}` : `${n} ${subjectText({ ...e.filter, controller: undefined }, 'permanent', true)}`;
      return `${who} keeps ${kept} and sacrifices the rest`;
    }
    case 'ShuffleIntoLibraryReveal':
      return `the owner of ${who} shuffles it into their library, then reveals the top card; if it's a permanent card, they put it onto the battlefield`;
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
      if (e.monstrosity) return `monstrosity ${n}`;
      if (e.ifSourceHasNoCounters) return `adapt ${n}`;
      return `put ${countersText(n, e.counter)} on ${who}`;
    case 'PutLastCounters':
      return `put ${e.countersOf ? "that permanent's" : "this card's"} counters on ${who}`;
    case 'RevealUntil':
      return `reveal cards from the top of your library until you reveal a ${subjectText({ ...e.filter, controller: undefined }, 'card')}; put it into your hand and the rest on the bottom`;
    case 'Explore':
      return `${who} explores`;
    case 'ReturnGreatestManaValue':
      return `${who} returns a creature with the greatest mana value they control to its owner's hand`;
    case 'PreventDamageToYouThisTurn':
      return 'prevent all damage that would be dealt to you this turn';
    case 'ChooseAndDestroy':
      return `for each of ${who}, destroy a ${subjectText({ ...e.filter, controller: undefined }, 'permanent')} of your choice they control`;
    case 'Counter':
      return `counter ${who}`;
    case 'AttackTaxUntilYourNextTurn':
      return `until your next turn, creatures can't attack you unless their controller pays {${n}} for each`;
    case 'AdditionalCombat':
      return `there is an additional combat phase after this phase${e.onlyFirstCombat ? " if it's the first combat phase of your turn" : ''}`;
    case 'GainControl':
      return `gain control of ${who}`;
    case 'WinGame':
      return `${you ? 'you win' : `${who} wins`} the game`;
    case 'AttachLastEquipment':
      return `attach an Equipment that was attached to this to ${who}`;
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
              : f === 'cantBlock'
                ? `${who} can't block this turn`
                : f === 'damageBecomesCounters'
                ? `if damage would be dealt to ${who} this turn, prevent it and put that many +1/+1 counters on it`
                : f === 'returnToHandIfDies'
                  ? `when ${who} dies this turn, return it to its owner's hand`
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
      if (e.target === 'PreviousTargetController') {
        return `its controller searches their library for a basic land card and puts it onto the battlefield${e.entersTapped ? ' tapped' : ''}`;
      }
      return `search your library for a ${e.filter?.supertypes?.includes('Basic') ? 'basic land' : (e.filter?.subtypes?.join(' or ') ?? '')} card and put it onto the battlefield${e.entersTapped ? ' tapped' : ''}`;
    case 'ReturnToBattlefield':
      return `return ${who} to the battlefield${e.counters ? ` with ${countersText(e.counters, e.counter)} on it` : ''}`;
    case 'Attach':
      return `attach this to ${who}`;
    case 'AttachAllEquipment':
      return `attach any number of Equipment you control to ${who}`;
    case 'AttachToThis':
      return `attach ${who} to this creature`;
    case 'Untap':
      return `untap ${who}`;
    case 'Proliferate':
      return 'proliferate';
    case 'PutTopCardIfLand':
      return `look at the top card of your library; if it's a land card, put it onto the battlefield${e.entersTapped ? ' tapped' : ''}`;
    case 'SearchLibraryToHand':
      return `search your library for a ${e.filter?.subtypes?.join(' or ') ?? ''} card and put it into your hand${e.toBattlefieldIfBehindOnLands ? ' (onto the battlefield tapped if an opponent controls more lands)' : ''}`;
  }
}

/** How a keyword is written on cards: "first strike", "nonbasic landwalk". */
export function keywordName(k: string): string {
  return k === 'FirstStrike' ? 'first strike' : k === 'DoubleStrike' ? 'double strike' : k === 'NonbasicLandwalk' ? 'nonbasic landwalk' : k.toLowerCase();
}

function keywordText(keywords: readonly string[]): string {
  return keywords.map(keywordName).join(', ');
}

/** A plain summary of an activated ability, e.g. "{1}{W}, {T}: tap target creature". */
export function activatedText(a: ActivatedSpec): string {
  const cost = [a.cost.mana, a.cost.tap && '{T}', a.cost.discardThis && 'discard this card'].filter(Boolean).join(', ');
  const body = a.equip ? 'Equip' : a.effects.map(effectText).join(' and ');
  return a.equip ? `${body} ${a.cost.mana}` : `${cost}: ${body}`;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const COLOR_NAMES: Record<string, string> = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' };

/**
 * "creature or artifact you control", "noncreature spell", "nonblack creature",
 * "creatures with power 4 or greater", "non-Dragon creatures", ...
 */
function subjectText(f: ObjectFilter, noun: string, plural = false): string {
  const s = plural ? 's' : '';
  const prefix = [
    ...(f.colors ?? []).map((c) => `${COLOR_NAMES[c]} `),
    ...(f.nonColors ?? []).map((c) => `non${COLOR_NAMES[c]} `),
    ...(f.subtypes ?? []).map((t) => `${t} `),
    ...(f.nonSubtypes ?? []).map((t) => `non-${t} `),
    ...(f.nonTypes ?? []).map((t) => `non${t} `),
    f.tapped ? 'tapped ' : '',
  ].join('');
  // Categories name the noun: "nonland permanent", "nonpermanent spell".
  const base = f.categories?.length ? f.categories.join(' ') : noun;
  const nouns = f.types?.length ? f.types.map((t) => `${prefix}${t}${s}`).join(' or ') : `${prefix}${base}${s}`;
  const owner = f.controller === 'You' ? ' you control' : f.controller === 'Opponent' ? (plural ? ' your opponents control' : ' an opponent controls') : '';
  const qualities = [
    f.powerAtLeast !== undefined && `power ${f.powerAtLeast} or greater`,
    f.toughnessAtLeast !== undefined && `toughness ${f.toughnessAtLeast} or greater`,
    f.manaValueAtMost !== undefined && `mana value ${f.manaValueAtMost} or less`,
    f.manaValueAtLeast !== undefined && `mana value ${f.manaValueAtLeast} or greater`,
    f.hasCounters && `a +1/+1 counter on ${plural ? 'them' : 'it'}`,
  ].filter(Boolean);
  const withText = qualities.length ? ` with ${qualities.join(' and ')}` : '';
  const counters = f.noCounters ? ` with no counters on ${plural ? 'them' : 'it'}` : '';
  return `${nouns}${owner}${withText}${counters}`;
}

function triggerCondition(t: TriggerSpec): string {
  if (t.when === 'BeginCombat') return t.turn === 'Each' ? 'At the beginning of each combat' : 'At the beginning of combat on your turn';
  if (t.when === 'Upkeep') return t.turn === 'Each' ? "At the beginning of each player's upkeep" : 'At the beginning of your upkeep';
  if (t.when === 'EndStep') {
    return t.turn === 'Each'
      ? 'At the beginning of each end step'
      : t.turn === 'Opponents'
        ? "At the beginning of each opponent's end step"
        : 'At the beginning of your end step';
  }
  const verb = {
    EntersBattlefield: 'enters',
    Dies: 'dies',
    Attacks: 'attacks',
    SpellCast: '',
    CombatDamageToPlayer: 'deals combat damage to a player',
    CountersAdded: 'gets counters',
    BecomesUntapped: 'becomes untapped',
    LeavesBattlefield: 'leaves the battlefield',
    Draws: '',
    LeavesGraveyard: 'leaves your graveyard',
    YouAttack: '',
    Chapter: '',
    Sacrificed: 'is sacrificed',
  }[t.when] ?? '';
  if (t.when === 'Chapter') return `Chapter ${(t.chapters ?? []).map((n) => ['', 'I', 'II', 'III', 'IV', 'V', 'VI'][n] ?? n).join(', ')}`;
  if (t.when === 'YouAttack') return `Whenever you attack with ${t.attackersAtLeast ?? 1} or more creatures`;
  if (t.when === 'Draws') {
    const who = t.drawer === 'Opponent' ? 'an opponent draws' : t.drawer === 'You' ? 'you draw' : 'a player draws';
    return `Whenever ${who} a card${t.notOnDrawersTurn ? ", if it isn't that player's turn" : ''}`;
  }
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
    ? `you may pay ${[t.cost.mana, t.cost.life && `${t.cost.life} life`, t.cost.lifeOf && "life equal to that spell's mana value"].filter(Boolean).join(' and ')}. If you do, ${effects}`
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
  if (def.keywords?.length) parts.push(capitalize(keywordText(def.keywords)));
  if (def.entersTapped) parts.push('Enters tapped');
  if (def.costReduction?.perCount) {
    parts.push(`Costs {${def.costReduction.generic}} less for each of the ${COUNT_TEXT[def.costReduction.perCount] ?? def.costReduction.perCount}`);
  }
  for (const e of def.effects ?? []) parts.push(capitalize(effectText(e)));
  if (def.modes && def.chooseModes) {
    const { min, max } = def.chooseModes;
    parts.push(min === max ? `Choose ${min}` : max === def.modes.length ? `Choose ${min} or more` : `Choose ${min} to ${max}`);
  }
  for (const [i, mode] of (def.modes ?? []).entries()) parts.push(`Mode ${i + 1}: ${mode.map(effectText).join(' and ')}`);
  if (def.alternativeCost) {
    const alt = def.alternativeCost;
    const pay = [alt.mana, alt.life && `${alt.life} life`].filter(Boolean).join(' and ');
    const condition = alt.ifControls ? ` if you control a ${subjectText(alt.ifControls, 'permanent')}` : '';
    const instead = alt.effects ? `: ${alt.effects.map(effectText).join(' and ')}` : ' instead of its mana cost';
    parts.push(`${alt.label}: pay ${pay}${condition}${instead}`);
  }
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
  if (t.kind === 'none') return 'no target';
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
    case 'Mulliganed':
      return `${who(e.player)} took a mulligan${e.taken > 1 ? ` (${e.taken} so far)` : ''} and drew a new hand.`;
    case 'HandKept': {
      const kept = e.player === viewer ? 'kept' : 'keeps';
      if (e.taken === 0) return `${who(e.player)} ${kept} the opening hand.`;
      return `${who(e.player)} ${kept} after ${e.taken} mulligan${e.taken === 1 ? '' : 's'}${e.bottom > 0 ? '' : ' (the first one is free)'}.`;
    }
    case 'CardsBottomed':
      return `  ${who(e.player)} put ${e.count === 1 ? 'a card' : `${e.count} cards`} on the bottom of the library.`;
    case 'TokenCreated':
      return `  ${who(e.controller)} created a ${cardName(s, e.card)} token.`;
    case 'CountersAdded':
      return `  ${cardName(s, e.card)} gets ${countersText(e.amount, e.counter)}.`;
    case 'CountersRemoved':
      return `  ${cardName(s, e.card)} loses ${countersText(e.amount, e.counter)}.`;
    case 'Foretold':
      return `  ${who(e.player)} foretold a card.`;
    case 'SpellCountered':
      return `  ${cardName(s, e.card)} is countered by ${cardName(s, e.by)}.`;
    case 'ControlChanged':
      return `  ${who(e.controller)} gains control of ${cardName(s, e.card)}.`;
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
          effect: 'a card says so',
        }[e.reason]
      }).`;
    case 'GameEnded':
      return `\n*** Game over. ${e.winner === null ? 'It is a draw.' : e.winner === viewer ? 'You win!' : `${e.winner} wins.`}`;
    default:
      return null;
  }
}
