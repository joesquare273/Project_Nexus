// Core engine types. Everything here is plain, serializable data so a game
// can be cloned, sent over the wire, saved, and replayed.
//
// N-player rule (PRD 7.1): never assume a fixed player count. Per-player
// values live in maps keyed by PlayerId, and "opponents" is always a list.

import type { FormatConfig } from './format.ts';

export type PlayerId = string;
export type InstanceId = string;
export type CardDefId = string;

export const COLORS = ['W', 'U', 'B', 'R', 'G'] as const;
export type Color = (typeof COLORS)[number];

/** Mana a source can produce: a color or colorless. */
export const MANA_TYPES = [...COLORS, 'C'] as const;
export type ManaType = (typeof MANA_TYPES)[number];
export type ManaPool = Record<ManaType, number>;

/** A parsed mana cost such as {2}{R}{W} -> { generic: 2, R: 1, W: 1 }. */
/** `x` counts {X} symbols. */
export type ManaCost = { generic: number; x?: number } & Partial<Record<ManaType, number>>;

export const CARD_TYPES = ['land', 'creature', 'artifact', 'enchantment', 'instant', 'sorcery'] as const;
export type CardType = (typeof CARD_TYPES)[number];

/**
 * Groupings of card types that rules and card text refer to: a permanent
 * (land, creature, artifact, enchantment) stays on the battlefield; a
 * nonpermanent (instant, sorcery) does its effect and goes to the graveyard;
 * a spell is any card that's cast, which is everything but lands.
 */
export const CARD_CATEGORIES = ['permanent', 'nonpermanent', 'spell'] as const;
export type CardCategory = (typeof CARD_CATEGORIES)[number];

export const SUPERTYPES = ['Basic', 'Legendary'] as const;
export type Supertype = (typeof SUPERTYPES)[number];

export const KEYWORDS = [
  'Flying',
  'Reach',
  'Vigilance',
  'Haste',
  'Flash',
  'FirstStrike',
  'DoubleStrike',
  'Menace',
  'Lifelink',
  'Trample',
  'Deathtouch',
  'Indestructible',
  /** Can't be the target of spells or abilities your opponents control. */
  'Hexproof',
  /** Can't be the target of spells or abilities. */
  'Shroud',
  /** Can't be blocked as long as the defending player controls a nonbasic land. */
  'NonbasicLandwalk',
  /** Can be blocked only by artifact creatures and creatures that share a color with it (rule 702.13). */
  'Intimidate',
  /** Can't be blocked as long as the defending player controls an Island (rule 702.14). */
  'Islandwalk',
] as const;
export type Keyword = (typeof KEYWORDS)[number];

/**
 * Counters other than +1/+1 counters, which are `counters` (rule 122). A
 * shield counter prevents damage or destruction once; a stun counter stops
 * the next untap; a flying counter grants flying.
 */
export const COUNTER_KINDS = ['shield', 'stun', 'flying', 'page', 'soul', 'lore', 'charge', 'vow', 'cell'] as const;
export type CounterKind = (typeof COUNTER_KINDS)[number];
/** Any counter: '+1/+1' or a named kind. */
export type AnyCounter = '+1/+1' | CounterKind;

// ---------------------------------------------------------------------------
// Card data (PRD 10)
// ---------------------------------------------------------------------------

export const TARGET_KINDS = [
  'AnyTarget',
  'EachOpponent',
  'EachOpponentCreature',
  'EachCreatureYouControl',
  'EachPlayer',
  'OpponentCreature',
  'TargetCreature',
  'TargetOpponent',
  'TargetPlayer',
  /** A permanent matching the effect's `filter`, e.g. "target nonland permanent an opponent controls". */
  'TargetPermanent',
  /** A card in a graveyard matching `filter` ("target creature card from your graveyard"). */
  'TargetCardInGraveyard',
  /** A spell on the stack matching `filter` ("counter target noncreature spell"). */
  'TargetSpell',
  /** An activated or triggered ability on the stack, identified separately from its source. */
  'TargetAbility',
  /** A spell, a nonland permanent, or a card in a graveyard (Endless Detour). */
  'TargetSpellPermanentOrGraveyardCard',
  /** The same object (or player) the previous chosen target picked ("it", "that creature"). */
  'PreviousTarget',
  /** The controller of the previous chosen target ("that creature's controller"). */
  'PreviousTargetController',
  /** The player the triggering creature attacked. Attack triggers only. */
  'DefendingPlayer',
  /** Tokens created earlier in the same spell or ability ("then attach this to it"). */
  'CreatedTokens',
  /** The card the ability belongs to. Abilities only. */
  'This',
  /** The object the trigger event happened to ("attach this Equipment to it"). Triggered abilities only. */
  'TriggeringObject',
  /** The card the trigger event happened to, in the graveyard it went to ("return it to the battlefield"). */
  'TriggeringCard',
  /** Every permanent matching the effect's `filter` ("destroy all artifacts", "exile all creatures"). */
  'AllPermanents',
  'You',
  /** The player whose turn it is ("at the beginning of each opponent's end step, that player ..."). */
  'ActivePlayer',
  /** The players who chose at least one card in the last choice ("each player who discarded a card this way"). */
  'EachPlayerWhoChose',
  'EachOpponentWhoChose',
  /** Opponents who chose nothing in the last choice ("each opponent who doesn't [sacrifice]"). */
  'EachOpponentWhoDidNotChoose',
  /** "Each opponent who lost life this turn". */
  'EachOpponentWhoLostLifeThisTurn',
  /** The creature the source Equipment is attached to ("put a +1/+1 counter on this creature" in a granted ability). */
  'EquippedCreature',
  /** The controller of the triggering object ("deals 1 damage to that player"). */
  'SubjectController',
  /** Each opponent other than the one the triggering creature attacked or damaged ("each other opponent"). */
  'EachOtherOpponent',
  /** Each creature controlled by the player the previous chosen target picked ("each creature target player controls"). */
  'CreaturesPreviousTargetControls',
  /** Every card in every graveyard matching `filter` ("all creature cards from all graveyards"). */
  'AllGraveyardCards',
  /** The creatures that convoked the spell (Lethal Scheme). */
  'ConvokedCreatures',
] as const;
export type TargetKind = (typeof TARGET_KINDS)[number];

/** Target kinds chosen when a spell is cast or an ability is put on the stack. The rest are computed. */
export const CHOSEN_TARGET_KINDS: readonly TargetKind[] = [
  'AnyTarget',
  'OpponentCreature',
  'TargetCreature',
  'TargetOpponent',
  'TargetPlayer',
  'TargetPermanent',
  'TargetCardInGraveyard',
  'TargetAbility',
  'TargetSpell',
  'TargetSpellPermanentOrGraveyardCard',
];

export const EFFECT_KINDS = [
  'AnimateVehicle',
  'FlipCoin',
  'ReflexiveTrigger',
  /** Choose up to amount matching permanents on resolution; put a +1/+1 counter on each. */
  'ChooseCounterRecipients',
  'BecomeMonarch',
  'ExileUntilOpponentMonarch',
  'ChooseFate',
  'DistributeCounters',
  'ChooseGraveyardCards',
  'ReturnChosenToBattlefield',
  'PutIntoLibrary',
  'OfferDrawOrMillDamage',
  'DealDamage',
  'DrawCards',
  'GainLife',
  'LoseLife',
  'Destroy',
  'Exile',
  'Tap',
  'ReturnToHand',
  /** Put +1/+1 counters on the target(s). */
  'AddCounters',
  /** Create `amount` copies of the token `token`. */
  'CreateToken',
  /** Create a token that's a copy of the target permanent. */
  'CreateTokenCopy',
  /** "+X/+Y until end of turn" (negative for -X/-Y). */
  'ModifyPT',
  /** Set affected creatures' base power/toughness until end of turn. */
  'SetBasePT',
  /** "gains [keywords] until end of turn". */
  'GrantKeywords',
  /** Grant a self combat-damage-to-player trigger until end of turn. */
  'GrantTrigger',
  /** Special one-turn rules: "can't be blocked this turn", "must be blocked this turn if able", and so on. */
  'GrantFlags',
  /** Exile the target until the source leaves the battlefield. */
  'ExileUntilSourceLeaves',
  /** Exile the top card of your library; you may play it while you control the source. */
  'ExileTopCardToPlay',
  'AddMana',
  /**
   * Each target player exiles cards from the top of their library until they
   * exile one matching `filter`; you may cast that card this turn without
   * paying its mana cost (Strago and Relm; with `hasteSacrifice`, a creature
   * cast this way gains haste and is sacrificed at the next end step).
   */
  'ExileUntilFound',
  /**
   * Exile a card at random from each opponent's graveyard; you may cast the
   * spells among them this turn without paying their mana costs, at any time
   * you have priority, and each one's owner loses life equal to its mana
   * value as you cast it (Kefka).
   */
  'ExileRandomFromOpponentGraveyards',
  /**
   * Hideaway N (rule 702.75): look at the top `amount` cards of your library,
   * exile one face down (linked to this permanent), and put the rest on the
   * bottom in a random order.
   */
  'Hideaway',
  /** Exile one card matching `filter` from each graveyard, linked to this permanent, face up (Summon: Esper Valigarmanda). */
  'ExileFromEachGraveyard',
  /** You may cast one card exiled with this permanent this turn; with `anyManaType`, mana of any type can be spent on it. */
  'GrantLinkedExileCast',
  'CopyCreature',
  /** Mill players, optionally reward any land with one token, and grant one shared cast this turn. */
  'MillAndGrantOneCast',
  'Mill',
  /** Privately look at the top card and optionally exile it face down, linked to this source object. */
  'LookAndExileTop',
  /** Until end of turn play this source object's linked cards, reducing generic spell costs by amount. */
  'PlayLinkedExile',
  /** Look at the top `amount` cards and put any into your graveyard (asks the player). */
  'Surveil',
  /** Look at the top `amount` cards and put any on the bottom of your library (asks the player). */
  'Scry',
  /** Search your library for a card matching `filter`, put it onto the battlefield (tapped if `entersTapped`), then shuffle. */
  'SearchLibraryToBattlefield',
  /** Return the target card from a graveyard to the battlefield, with `counters` +1/+1 counters. */
  'ReturnToBattlefield',
  /** Attach the source Equipment to the target creature. */
  'Attach',
  /** Attach every Equipment you control to the target creature. */
  'AttachAllEquipment',
  /** Attach the target Equipment to the ability's source creature (Cloud, Ex-SOLDIER). */
  'AttachToThis',
  'Untap',
  /** Look at the top card of your library; if it's a land card, put it onto the battlefield (tapped with `entersTapped`). */
  'PutTopCardIfLand',
  /**
   * Proliferate (rule 701.27): another counter on each permanent that has
   * some. The engine chooses the permanents the controller controls.
   */
  'Proliferate',
  /** Search your library for a card matching `filter`, put it into your hand, then shuffle. */
  'SearchLibraryToHand',
  /** Exile every card in the target players' graveyards. */
  'ExileGraveyard',
  /**
   * Each target player sacrifices a creature with the greatest power among
   * creatures they control (Crackling Doom).
   */
  'SacrificeGreatestPower',
  /**
   * The target permanent's owner shuffles it into their library, then reveals
   * the top card; a permanent card is put onto the battlefield (Chaos Warp).
   */
  'ShuffleIntoLibraryReveal',
  /** Attach the Equipment chosen for target `from` to this effect's target creature (Barret). */
  'AttachEquipmentTo',
  /** Does nothing itself: picks a target that a later effect uses (`from`). */
  'ChooseTarget',
  /**
   * Move counters from the permanent chosen for target `from` onto this
   * effect's target: `amount` +1/+1 counters (Tidus), one counter of any kind
   * (`anyKind`), or all of them (`allCounters`).
   */
  'MoveCounters',
  /** Put the counters the source (or, with `countersOf`, the triggering card) had as it left the battlefield on the target (Zack Fair). */
  'PutLastCounters',
  /** Attach an Equipment that was attached to the source as it left the battlefield to the target (Zack Fair). */
  'AttachLastEquipment',
  /** Gain control of the target permanents for the rest of the game (Hellkite Tyrant). */
  'GainControl',
  /** "There is an additional combat phase after this phase" (with `onlyFirstCombat`: only after the turn's first combat). */
  'AdditionalCombat',
  /** Each target player returns a creature with the greatest mana value among creatures they control to its owner's hand (Summon: Valefor). */
  'ReturnGreatestManaValue',
  /** Counter a spell or stack ability instead of letting it resolve (rule 701.5). */
  'Counter',
  /** "Prevent all damage that would be dealt to you this turn." */
  'PreventDamageToYouThisTurn',
  /** For each target player, you choose `amount` permanents matching `filter` they control, then destroy them (Ultimate Magic: Meteor). */
  'ChooseAndDestroy',
  /** "Until your next turn, creatures can't attack you unless their controller pays {amount} for each of those creatures." */
  'AttackTaxUntilYourNextTurn',
  /**
   * The target creature explores (rule 701.44): reveal the top card of your
   * library; a land goes to your hand, otherwise the creature gets a +1/+1
   * counter (the card stays on top).
   */
  'Explore',
  /**
   * Reveal cards from the top of your library until one matches `filter`; put
   * it into your hand and the rest on the bottom in a random order (Yuna's Whistle).
   */
  'RevealUntil',
  /** The target players win the game: every other player loses. */
  'WinGame',
  /** Each target player puts up to `amount` cards matching `filter` from their hand onto the battlefield, their choice. */
  'PutFromHand',
  /**
   * Each target player discards `amount` cards of their choice (`anyNumber`:
   * as many as they like; `wholeHand`: their whole hand or nothing, their
   * choice; `optional`: up to `amount`).
   */
  'Discard',
  /** Each target player sacrifices `amount` permanents matching `filter`, their choice (`optional`: up to `amount`). */
  'Sacrifice',
  /**
   * Each target player keeps up to `amount` permanents matching `filter` and
   * sacrifices the rest. The player chooses, or the spell's controller with
   * `chooser: 'You'` (with `onePerType`: at most one of each of those types).
   */
  'KeepAndSacrificeRest',
  /**
   * The target permanents phase out (rule 702.26): treated as though they
   * don't exist until their controller's next untap step, along with anything
   * attached to them.
   */
  'PhaseOut',
  /**
   * Each target creature connives (rule 701.50): its controller draws a card,
   * then discards a card; a discarded nonland card puts a +1/+1 counter on it.
   */
  'Connive',
  /** Look at the top `amount` cards of your library; put `keep` of them into your hand and the rest on the bottom. */
  'LookAtTopPutInHand',
  /**
   * The target card in your graveyard may be cast this turn (`free`: without
   * paying its mana cost); if it would go to the graveyard afterwards, it's
   * exiled instead (Torrential Gearhulk, Emet-Selch).
   */
  'AllowCastFromGraveyard',
  'AllowAdventureFromGraveyard',
  'PutOnLibraryBottom',
  /** The source creature and the target creature each deal damage equal to their power to the other (rule 701.14). */
  'Fight',
] as const;
export type EffectKind = (typeof EFFECT_KINDS)[number];

/** Things whose number an amount can count, from the point of view of the spell or ability's controller. */
export const COUNT_KINDS = [
  'OpponentsDamagedBySourceOrDragonThisTurn',
  'EquipmentYouControl',
  'CreaturesYouControl',
  'EquippedCreaturesYouControl',
  'NoncreatureNonlandCardsInYourGraveyard',
  'CreaturesDiedThisTurn',
  /** Every creature on the battlefield, whoever controls it. */
  'CreaturesOnBattlefield',
  'EquippedAttackingCreaturesYouControl',
  /** Creatures you control with one or more +1/+1 counters on them. */
  'CreaturesYouControlWithCounters',
  'CreatureCardsInYourGraveyard',
  'InstantAndSorceryCardsInYourGraveyard',
  /** Counters of every kind on creatures you control. */
  'CountersAmongCreaturesYouControl',
  'PlayersWhoLostLifeThisTurn',
  /** Soul counters on the card with the ability (Reaper's Scythe). */
  'SoulCountersOnThis',
  /** Lore counters on the card with the ability (Summon: Esper Valigarmanda). */
  'LoreCountersOnThis',
  'SoldiersYouControl',
  /** Opponents who control a creature with power 4 or greater (Summon: Yojimbo). */
  'OpponentsWithPower4Creature',
  /** Colors among permanents you control (Conqueror's Flail). */
  'ColorsAmongYourPermanents',
  'ArtifactsOpponentsControl',
  /** The greatest power among creatures you control. */
  'GreatestPowerAmongYourCreatures',
  /** Opponents still in the game. */
  'Opponents',
  /** Opponents you're attacking with at least one creature this combat (melee). */
  'OpponentsYouAttackedThisCombat',
  /** Nontoken creatures you control that entered the battlefield this turn (Tromell). */
  'NontokenCreaturesYouControlThatEnteredThisTurn',
  /** Opponents who control more creatures than you. */
  'OpponentsWithMoreCreatures',
  'ArtifactsYouControl',
  /** The greatest mana value among artifacts you control (Edgar). */
  'GreatestManaValueAmongYourArtifacts',
] as const;
export type CountKind = (typeof COUNT_KINDS)[number];

/**
 * A fixed number, the sum of some counts ("the number of creatures you
 * control plus the number of Equipment you control"), or a number from
 * earlier in the same spell or ability: the previous target's power
 * ("life equal to its power") or how many permanents it destroyed.
 */
export type Amount =
  | number
  /** `times` multiplies the total ("twice the number of creature cards in your graveyard"). */
  | { count: CountKind[]; times?: number }
  /**
   * From earlier in the same spell or ability: the previous target's power,
   * permanents destroyed, or the cards chosen in the last choice (how many,
   * their total mana value), plus `plus` ("that many cards plus one").
   */
  /** `subjectPower`, `subjectCounters`: the triggering object's power, or the counters it had as it left the battlefield. */
  | {
      of:
        | 'previousTargetPower'
        | 'destroyedThisWay'
        | 'chosenCount'
        | 'chosenManaValue'
        /** Number of distinct counter kinds on the ability's source. */
        | 'sourceCounterKinds'
        | 'sourcePower'
        | 'subjectPower'
        | 'subjectCounters'
        /** The +1/+1 counters the triggering object had as it left the battlefield. */
        | 'subjectPlusOneCounters'
        /** The previous target's mana value ("you lose life equal to that card's mana value"). */
        | 'previousTargetManaValue'
        /** The value chosen for {X} (for a permanent's abilities, the X it was cast with). */
        | 'x'
        /** Life lost to earlier effects of the same spell ("you gain life equal to the life lost this way"). */
        | 'lifeLostThisWay'
        /** The mana value of the card found by RevealUntil. */
        | 'revealedManaValue'
        /** The triggering spell's mana value (counting X while it's on the stack). */
        | 'subjectManaValue'
        /** How much more power the previous target has than the triggering creature (none if less). */
        | 'previousTargetPowerOverSubject'
        /** The damage dealt in the triggering event ("it deals that much damage"). */
        | 'damageDealt';
      plus?: number;
    };

export const TEMPORARY_FLAGS = [
  'cantBeBlocked',
  'mustBeBlocked',
  'mustAttack',
  /** "If that creature would die this turn, exile it instead." */
  'exileIfWouldDie',
  /** "When that creature dies this turn, return that card to its owner's hand." */
  'returnToHandIfDies',
  /** "If damage would be dealt to that creature this turn, prevent that damage and put that many +1/+1 counters on it." */
  'damageBecomesCounters',
  /** "Can't block this turn." */
  'cantBlock',
] as const;
export type TemporaryFlag = (typeof TEMPORARY_FLAGS)[number];

export interface EffectSpec {
  /** CopyCreature: name exception, duration, retained resolving trigger, and optional buffs to both objects. */
  copyName?: string;
  copyUntilEndOfTurn?: boolean;
  copyKeepTrigger?: boolean;
  copyKeywords?: Keyword[];
  copyBuffBoth?: boolean;
  /** GrantTrigger: the combat damage ability to grant until cleanup. */
  trigger?: TriggerSpec;
  /** GainControl: give the permanent to the player captured by the trigger. */
  giveTo?: 'SubjectController';
  /** Affect the source only if it is still the same object as when it triggered. */
  sameObject?: boolean;
  effect: EffectKind;
  amount?: Amount;
  target: TargetKind;
  /** For TargetPermanent, TargetCardInGraveyard and SearchLibraryToHand: what qualifies. */
  filter?: ObjectFilter;
  /** CreateToken, or the one land-mill reward for MillAndGrantOneCast: token card id. */
  token?: CardDefId;
  /** ModifyPT. */
  power?: number;
  /** ModifyPT: `amount` is added to `power` ("+X/+0, where X is the number of Soldiers you control"). */
  powerFromAmount?: boolean;
  /** ModifyPT: `amount` is added to `toughness` too ("+1/+1 for each opponent you attacked"). */
  toughnessFromAmount?: boolean;
  /** AdditionalCombat: "if it's the first combat phase of your turn". */
  onlyFirstCombat?: boolean;
  /** Only if the triggering creature's power is less than (or, 'notLess', at least) the source's (Shelinda). */
  subjectPowerVsSource?: 'less' | 'notLess';
  /** Only if you gained at least / less than this much life this turn (Aerith). */
  ifLifeGainedThisTurn?: { atLeast?: number; below?: number };
  /** Only if the previous target's mana value is at least this ("if the exiled card's mana value is 4 or greater"). */
  ifPreviousTargetManaValueAtLeast?: number;
  /** Only if your graveyard has at least / fewer than this many cards (threshold). */
  ifYourGraveyard?: { atLeast?: number; below?: number };
  /** Only if you control at least `atLeast` (default 1) permanents matching `filter` (metalcraft). */
  ifYouControl?: { filter: ObjectFilter; atLeast?: number };
  toughness?: number;
  /** GrantKeywords. */
  keywords?: Keyword[];
  /** GrantFlags. */
  flags?: TemporaryFlag[];
  /** ReturnToBattlefield: enter attached to a creature returned for this chosen-target index. */
  attachToReturnedTarget?: number;
  /** ReturnToBattlefield: extra +1/+1 counters. */
  counters?: number;
  /** AddCounters, ReturnToBattlefield, or KeepAndSacrificeRest's vow: a named counter. */
  counter?: CounterKind;
  /** AddCounters: monstrosity (rule 701.37): only if the source isn't monstrous yet, and it becomes monstrous. */
  monstrosity?: boolean;
  /** Adapt (rule 701.46): only if the source has no +1/+1 counters on it. */
  ifSourceHasNoCounters?: boolean;
  /** MoveCounters: one counter of any kind (the engine picks which). */
  anyKind?: boolean;
  /** MoveCounters: every counter. */
  allCounters?: boolean;
  /** PutLastCounters: the triggering card's counters instead of the source's. */
  countersOf?: 'TriggeringCard';
  /** DealDamage: the triggering object deals the damage ("that creature deals damage equal to its power"). */
  damageSource?: 'TriggeringObject';
  /** SearchLibraryToHand: onto the battlefield tapped instead if an opponent controls more lands than you (Scholar of New Horizons). */
  toBattlefieldIfBehindOnLands?: boolean;
  /** Only happens if this is true ("if this spell was cast from a graveyard", "... from exile"). */
  if?: 'castFromGraveyard' | 'castFromExile' | 'castFromHand' | 'kicked' | 'notKicked';
  /** Only happens if the source's power is at least this ("if Cloud has power 7 or greater"). */
  ifSourcePowerAtLeast?: number;
  /** ReturnToBattlefield on This: enter attacking; choose a defending player during resolution. */
  attacking?: boolean;
  /** SearchLibraryToBattlefield or ReturnToBattlefield: the card enters tapped. */
  entersTapped?: boolean;
  /** Exile: also exile every token that player controls with the same name (Legions to Ashes). */
  sameNameTokens?: boolean;
  /** Discard: as many cards as they like. */
  anyNumber?: boolean;
  /** Discard: "may discard their hand": all of it or none. */
  wholeHand?: boolean;
  /** Discard/Sacrifice: up to amount. AddCounters: may put one counter on the chosen target. */
  optional?: boolean;
  /** KeepAndSacrificeRest: the spell's controller chooses for each player (Tragic Arrogance). */
  chooser?: 'You';
  /** KeepAndSacrificeRest: keep at most one of each of these types. */
  onePerType?: CardType[];
  /** Only if the last choice picked something ("If you do"), or a creature / noncreature card (Mog). */
  ifChose?: 'any' | 'creature' | 'noncreature';
  /** ExileTopCardToPlay: playable until end of turn, not while you control the source. */
  thisTurn?: boolean;
  /** ExileTopCardToPlay: playable until another card is exiled with the same source (Furious Rise). */
  untilNextFromSource?: boolean;
  /** Only if a permanent was sacrificed earlier in this spell ("Sacrifice a creature. If you do, ..."). */
  ifSacrificed?: boolean;
  /** "Up to one target": the target may be left out. */
  upTo?: boolean;
  /**
   * Targets of effects sharing a `group` are one "up to N target" phrase, so
   * each must be a different object (rule 115.3). With `groupOwnersDiffer`,
   * the objects must also belong to different players ("for each opponent,
   * up to one target creature card from that player's graveyard").
   */
  group?: string;
  groupOwnersDiffer?: boolean;
  /** ReturnToBattlefield: under your control instead of its owner's. */
  underYourControl?: boolean;
  /** ReturnToBattlefield: unearth (rule 702.84): it gains haste, and is exiled at the next end step or if it would leave. */
  unearth?: boolean;
  /** LookAtTopPutInHand: how many go to your hand. */
  keep?: number;
  /** AllowCastFromGraveyard: without paying its mana cost. */
  free?: boolean;
  /** AddMana: this type, without a choice ("add {R} for each lore counter"). */
  manaType?: ManaType;
  /** ExileUntilFound: a creature cast this way gains haste and is sacrificed at the beginning of the next end step. */
  hasteSacrifice?: boolean;
  /** GrantLinkedExileCast: mana of any type can be spent to cast it. */
  anyManaType?: boolean;
  /** Discard: the whole hand, no choice ("discard your hand"). */
  entireHand?: boolean;
  /** GrantKeywords: for as long as you control the source, not until end of turn (Thancred Waters). */
  whileYouControlSource?: boolean;
  /** AttachEquipmentTo: which chosen target (by index) is the Equipment. */
  from?: number;
}

/**
 * What a triggered ability waits for (rule 603). "Subject" below is the
 * object the event happened to: the creature that entered, died, attacked or
 * dealt damage, or the spell that was cast.
 */
export const TRIGGER_EVENTS = [
  'CoinFlipWon',
  'Reflexive',
  /** Grouped by attacker controller after a defending player declares blockers. */
  'AttackersUnblocked',
  'SecondMain',
  'AbilityTargetsCreature',
  'EntersBattlefield',
  'Dies',
  'Attacks',
  'LandPlayed',
  'SpellCast',
  'CombatDamageToPlayer',
  'BeginCombat',
  'Upkeep',
  /** "At the beginning of your end step". */
  'EndStep',
  /** Counters were put on a permanent (with `byYou`: by a spell or ability you control). */
  'CountersAdded',
  /** The permanent became untapped. */
  'BecomesUntapped',
  /** A permanent left the battlefield for any zone. */
  'LeavesBattlefield',
  /** A player drew a card (`drawer` says who). */
  'Draws',
  /** A card left a graveyard (subject: the card; its owner's graveyard). */
  'LeavesGraveyard',
  /** You attacked with at least `attackersAtLeast` creatures ("whenever you attack with four or more creatures"). */
  'YouAttack',
  /** A Saga's chapter ability (rule 714.2): a lore counter brought it to one of `chapters`. */
  'Chapter',
  /** A permanent was sacrificed. */
  'Sacrificed',
  /** A player activated an ability of a permanent (mana abilities included). Subject: that permanent. */
  'AbilityActivated',
  /** One or more opponents lost life (use with `oneOrMore`). */
  'OpponentLosesLife',
] as const;
export type TriggerEvent = (typeof TRIGGER_EVENTS)[number];

/**
 * Which objects qualify, relative to the card that has the ability: for a
 * trigger's subject, a target, or a card to search for.
 */
export interface ObjectFilter {
  /** A graveyard card that arrived this turn from somewhere other than the battlefield. */
  newGraveyardCardNotFromBattlefield?: boolean;
  /** Matches if any of these filters does ("artifact, enchantment, or tapped creature"); the rest of this filter must hold too. */
  anyOf?: ObjectFilter[];
  /** Excludes the card itself ("another creature"). */
  other?: boolean;
  /** Only the card itself ("when this creature dies, if it had no +1/+1 counters on it"). */
  self?: boolean;
  /** Is a commander ("whenever your commander enters"). */
  commander?: boolean;
  /** DefendingPlayer: the player an attacking creature attacked or damaged ("artifact that player controls"). */
  controller?: 'You' | 'Opponent' | 'DefendingPlayer';
  /** Has at least one of these types. */
  types?: CardType[];
  /** Has none of these types ("noncreature spell"). */
  nonTypes?: CardType[];
  /** Is in all of these categories ("nonland permanent" = permanent + nonTypes land). */
  categories?: CardCategory[];
  /** Has at least one of these subtypes ("a Plains card"). */
  subtypes?: string[];
  /** Has all of these supertypes ("a basic land card"). */
  supertypes?: Supertype[];
  /** Has none of these supertypes ("nonbasic land"). */
  nonSupertypes?: Supertype[];
  tapped?: boolean;
  attacking?: boolean;
  /** Is attacking the player whose ability this is ("target creature attacking you"). */
  attackingYou?: boolean;
  /** Entered the battlefield this turn ("target commander that entered this turn"). */
  enteredThisTurn?: boolean;
  /** Has less power than the card with the ability ("with power less than Auron's power"). */
  powerLessThanSource?: boolean;
  /** Has exactly this name (partner with, "search for a card named ..."). */
  name?: string;
  /** Is modified: equipped, has counters, or has an Aura controlled by its controller (rule 700.9). */
  modified?: boolean;
  /** Is historic: an artifact, legendary, or a Saga (rule 700.6). */
  historic?: boolean;
  /** Has an Equipment attached. */
  equipped?: boolean;
  /** Is the creature the ability's source Equipment is attached to ("equipped creature"). */
  equippedBySource?: boolean;
  /** Is at least one of these colors. */
  colors?: Color[];
  /** Is none of these colors ("nonblack"). */
  nonColors?: Color[];
  /** Has none of these subtypes ("non-Dragon"). */
  nonSubtypes?: string[];
  powerAtLeast?: number;
  powerAtMost?: number;
  toughnessAtLeast?: number;
  manaValueAtMost?: number;
  manaValueAtLeast?: number;
  /** Has no counters on it ("creatures with no counters on them"). */
  noCounters?: boolean;
  /**
   * Has one or more +1/+1 counters on it ("each creature you control with a
   * +1/+1 counter on it"); false: has none. Off the battlefield, the counters
   * it had as it left.
   */
  hasCounters?: boolean;
  /** Has (or, with false, hasn't) counters of any kind on it, or had as it left the battlefield. */
  hasAnyCounters?: boolean;
  /** Has none of these keywords (as it last was, if it left the battlefield: "a creature without flying dies"). */
  withoutKeywords?: Keyword[];
  /** Has the same mana value as the triggering spell (Krile: "with mana value equal to that spell's mana value"). */
  manaValueEqualsSubject?: boolean;
  /** Is (or, with false, isn't) a token ("nontoken creature"). */
  token?: boolean;
}

export interface TriggerSpec {
  /** Support X: target slots are fixed when the entry trigger is queued. */
  supportX?: boolean;
  when: TriggerEvent;
  /** The zone a spell was cast or a land was played from. */
  fromZone?: ZoneName;
  /**
   * Subjects that trigger it. Absent means the card itself ("when this
   * creature enters"). Ignored for BeginCombat and Upkeep.
   */
  what?: ObjectFilter;
  /** BeginCombat, Upkeep and EndStep: on your turn only (the default), on each turn, or on each opponent's turn. */
  turn?: 'Yours' | 'Each' | 'Opponents';
  /** EntersBattlefield: only for permanents that came from a graveyard or were cast from one (Celes). */
  fromGraveyard?: boolean;
  /** CountersAdded: only counters put there by a spell or ability you control. */
  byYou?: boolean;
  /** Attacks: only creatures attacking you ("whenever an opponent attacks you"). */
  attacksYou?: boolean;
  /** Draws: whose draws count. */
  drawer?: 'You' | 'Opponent';
  /** SpellCast: only your Nth spell this turn ("whenever you cast your second spell each turn"). */
  nthSpellThisTurn?: number;
  /** YouAttack: how many attacking creatures it takes. */
  attackersAtLeast?: number;
  /** Draws: only the Nth card the drawer draws this turn ("whenever you draw your third card each turn"). */
  nthDrawThisTurn?: number;
  /** Chapter: the chapter numbers ("II, III" is [2, 3]). */
  chapters?: number[];
  /** Evolve (rule 702.100): the entering creature has greater power or toughness than this one. */
  evolve?: boolean;
  /** CountersAdded: only +1/+1 counters ("whenever a +1/+1 counter is put on this creature"). */
  plusOneCountersOnly?: boolean;
  /** Draws: only draws on someone else's turn ("if it isn't that player's turn"). */
  notOnDrawersTurn?: boolean;
  /** Intervening "if": "if you put a counter on a creature this turn". */
  ifYouPutCounterOnCreatureThisTurn?: boolean;
  /** Intervening "if": you control at least `atLeast` (default 1) permanents matching `filter` ("if you control a creature with power 7 or greater"). */
  ifYouControl?: { filter: ObjectFilter; atLeast?: number };
  /** Intervening "if": "if you gained life this turn". */
  ifYouGainedLifeThisTurn?: boolean;
  /** Intervening "if": "if a card left your graveyard this turn". */
  ifCardLeftYourGraveyardThisTurn?: boolean;
  /** Intervening "if": "if a counter was put on this creature this turn". */
  ifSourceGotCountersThisTurn?: boolean;
  /** Intervening "if": "if a player lost N or more life this turn". */
  ifPlayerLostLifeThisTurn?: number;
  /** Intervening "if": the player who controls the entering permanent controls more lands than you. */
  ifSubjectControllerHasMoreLands?: boolean;
  /** Where the card must be for the ability to work. Defaults to the battlefield. */
  zone?: 'battlefield' | 'graveyard';
  /** "Whenever one or more ...": triggers once per batch of simultaneous events. */
  oneOrMore?: boolean;
  /** "This ability triggers only once each turn." */
  oncePerTurn?: boolean;
  /** Intervening "if" (rule 603.4): SpellCast only, "if at least N mana was spent to cast it". */
  ifManaSpentAtLeast?: number;
  /** "You may ...": the controller chooses on resolution. */
  optional?: boolean;
  /** "You may pay ... If you do, ...": optional, and the effects need the cost paid. */
  /** `lifeOf`: pay life equal to the triggering spell's mana value ("you may pay X life, where X is that spell's mana value"). */
  cost?: { mana?: string; life?: number; lifeOf?: 'subjectManaValue'; discard?: number };
  /** "Do this only once each turn": after its cost is paid once, it doesn't trigger again this turn. */
  oncePerTurnWhenPaid?: boolean;
  /** Dies: only if it was cast for its blitz cost (rule 702.152). */
  ifBlitzed?: boolean;
  /**
   * "Choose one at random": one of these is picked as it triggers, and its
   * effects are used instead of `effects` (which stays empty).
   */
  randomModes?: EffectSpec[][];
  /** Modal trigger: choose one as it goes on the stack; choose both if you control a commander. */
  modes?: EffectSpec[][];
  bothIfCommander?: boolean;
  effects: EffectSpec[];
}

/** A non-mana activated ability: "[cost]: [effect]" (rule 602). */
export interface ActivatedSpec {
  cost: {
    /** Mill this many cards as a cost; a full payment requires that many cards in the library. */
    mill?: number;
    /** Tap other creatures with at least this much total power (crew). */
    crew?: number;
    /** Exile this many matching cards from your graveyard as a cost. */
    exileGraveyard?: { amount: number; filter: ObjectFilter };
    mana?: string;
    tap?: boolean;
    /** Discard this card (cycling, landcycling). */
    discardThis?: boolean;
    /** Exile this permanent (Phoenix Down). */
    exileThis?: boolean;
    /** Sacrifice this permanent. */
    sacrificeThis?: boolean;
    /** "Discard a card": the cards are chosen with the action (`costCards`). */
    discard?: number;
    /** "Sacrifice a creature": one permanent you control matching this, chosen with the action (`costCards`). */
    sacrifice?: ObjectFilter;
    /**
     * "Remove a [page] counter from this": from this permanent, or with
     * `from` from a permanent you control matching it (chosen with the action,
     * `costCards`). Without `counter`, any kind (the engine picks which).
     */
    removeCounter?: { counter?: AnyCounter; from?: ObjectFilter };
    /** "Pay 3 life". */
    life?: number;
  };
  /** Where the card must be. Defaults to the battlefield. */
  zone?: 'battlefield' | 'hand' | 'graveyard';
  /** "Activate only as a sorcery" (equip always is). */
  sorcerySpeed?: boolean;
  /** "Activate only if you control a creature with power 4 or greater." */
  ifYouControl?: ObjectFilter;
  /** An equip ability: its cost can be reduced by the target (`equipDiscount`), and restricted mana can pay for it. */
  equip?: boolean;
  effects: EffectSpec[];
}

/** A continuous effect from a static ability (rule 604, 611.3). */
export interface StaticSpec {
  /** Layer 4: this object is not a creature while its controller has fewer graveyard cards. */
  noncreatureIfGraveyardBelow?: number;
  /** Replace creature subtypes, preserving subtypes of other card types. */
  setCreatureTypes?: string[];
  /** Layer 5: replace all colors. */
  setColors?: Color[];
  /** This affected creature is goaded by this source's controller. */
  goaded?: boolean;
  /** EquippedCreature has a separate tap ability adding one mana of one of these types. */
  grantsMana?: ManaType[];
  /** The source's controller has no maximum hand size (Thought Vessel). */
  noMaximumHandSize?: boolean;
  /** Spells matching this filter have improvise. */
  grantImprovise?: ObjectFilter;
  /** Professor Hojo: your first activated ability targeting your creature on your turn costs less. */
  firstFriendlyTargetActivationDiscount?: number;
  /**
   * Which permanents it changes: this card, the creature this Equipment is
   * attached to, or each permanent matching `filter` ("each creature you
   * control with a +1/+1 counter on it").
   */
  affects: 'Self' | 'EquippedCreature' | 'EachMatching';
  /** For EachMatching, from the point of view of this card's controller. */
  filter?: ObjectFilter;
  /** Hardened Scales: that many extra +1/+1 counters whenever counters are put on an affected creature. */
  extraCounters?: number;
  /** Tromell: each affected permanent enters with this many additional +1/+1 counters. */
  entersWithExtraCounters?: number;
  /**
   * "Noncreature spells you cast cost {1} less": spells you cast matching
   * `filter` cost this much less; with `nthSpell`, only your Nth spell each
   * turn ("the second spell you cast each turn costs {2} less").
   */
  spellCostReduction?: { generic: number; filter?: ObjectFilter; nthSpell?: number; fromGraveyard?: boolean };
  /** Ward (rule 702.21): each affected permanent has ward with this cost (Bronze Guardian). */
  ward?: number;
  /** "Has base power and toughness 7/7" (rule 613.4b): replaces the printed numbers; other changes still apply. */
  basePowerToughness?: [number, number];
  /** "Can't be blocked by creatures with power 2 or less." */
  cantBeBlockedByPowerAtMost?: number;
  /** A blocker with greater power than the affected attacker cannot block it. */
  cantBeBlockedByGreaterPower?: boolean;
  /** Conqueror's Flail: while it applies, its controller's opponents can't cast spells during that player's turn. */
  opponentsCantCastDuringYourTurn?: boolean;
  /**
   * Edgar: "Once during each of your turns, you may cast an artifact spell
   * from your graveyard. If you cast a spell this way, that artifact enters tapped."
   */
  castFromGraveyard?: { filter: ObjectFilter; entersTapped?: boolean };
  /** Metalcraft (Puresteel Paladin): equip abilities of Equipment you control cost `mana` while you control `ifArtifactsAtLeast` artifacts. */
  equipCost?: { mana: string; ifArtifactsAtLeast: number };
  /** Works while the card is in this zone instead of on the battlefield (Anger, from the graveyard). */
  zone?: 'graveyard';
  /** Only while you control a permanent with this subtype ("and you control a Mountain"). */
  ifYouControlSubtype?: string;
  /** Authority of the Consuls: creatures your opponents control enter tapped. */
  opponentCreaturesEnterTapped?: boolean;
  /** Propaganda: creatures can't attack you unless their controller pays this much generic mana for each. */
  attackTax?: number;
  /**
   * Only while these hold: "during your turn", "as long as it's equipped",
   * "as long as equipped creature is legendary".
   */
  /** `attached`: only while this Equipment is attached to a creature (for EachMatching abilities it grants). */
  conditions?: ('yourTurn' | 'equipped' | 'legendary' | 'twoNoncreatureSpellsThisTurn' | 'attached')[];
  power?: Amount;
  toughness?: Amount;
  keywords?: Keyword[];
  /** "is a Knight in addition to its other types". */
  addSubtypes?: string[];
  /** "loses flying". Applied after keywords are granted. */
  removeKeywords?: Keyword[];
}

/** Immutable, shared definition of a card. */
export interface CardDefinition {
  /** Its controller may privately look at the top card of their library. */
  lookAtLibraryTop?: boolean;
  /** While attached to a creature, its controller may cast creature spells from their library's top. */
  castCreaturesFromLibraryTopWhileAttached?: boolean;
  id: CardDefId;
  name: string;
  /** Mana cost in standard notation, e.g. "{2}{R}{W}". Absent for lands and tokens. */
  manaCost?: string;
  types: CardType[];
  supertypes?: Supertype[];
  subtypes?: string[];
  /** Color indicator, for things with no mana cost (tokens). */
  colors?: Color[];
  /** Commander color identity (rule 903.4): every mana symbol in its cost and rules text. */
  colorIdentity?: Color[];
  power?: number;
  toughness?: number;
  keywords?: Keyword[];
  /** "{T}: Add one mana of any of these types." Lands with basic land types get theirs automatically. */
  produces?: ManaType[];
  /** Extras for that mana ability. */
  manaAbility?: {
    /** "{T}, Sacrifice this: Add ..." (Treasure). */
    sacrifice?: boolean;
    /** A separate ability: tap an untapped legendary creature you control for one mana of any color. */
    tapLegendaryCreature?: boolean;
    /** "Spend this mana only to cast an Equipment spell or activate an equip ability." */
    onlyForEquipment?: boolean;
    /** Adds this many of the chosen mana instead of one ("{T}: Add {C}{C}"). */
    amount?: number;
    /** Producing one of these deals 1 damage to you (pain lands, Talismans). */
    painFor?: ManaType[];
    /** "Add one mana of any color in your commander's color identity." */
    commanderIdentity?: boolean;
    /** Spending this mana on a creature sharing a type with your commander causes scry 1. */
    scryOnCommanderType?: boolean;
    /** "Add one mana of any color that a land an opponent controls could produce." */
    opponentLandColors?: boolean;
    /** "Add one mana of any type that a land you control could produce." */
    yourLandColors?: boolean;
    /** "If this creature has a +1/+1 counter on it, add three mana instead." */
    amountWithCounters?: number;
    /** "Add {G} for each +1/+1 counter on this creature" (none when it has no counters). */
    amountPerCounter?: boolean | CounterKind;
    /** "Activate only if you control five or more lands." */
    ifLandsAtLeast?: number;
    /** Spire of Industry: "Add one mana of any color. Activate only if you control an artifact." */
    anyColorIfControls?: ObjectFilter;
    /** Producing one of these costs 1 life ("{T}, Pay 1 life: Add one mana of any color"). */
    lifeFor?: ManaType[];
    /** "{T}, Mill a card: Add {C}." */
    mill?: number;
    /**
     * A mana ability that costs mana: "{1}, {T}: Add {R}{G}", or a filter
     * land's "{R/G}, {T}: Add {R}{R}, {R}{G}, or {G}{G}". `costs` are the
     * ways to pay (a hybrid symbol is two), `outputs` the mana it can add.
     */
    paid?: { costs: string[]; outputs: string[] };
    /** "When you next cast a creature spell this turn, that creature enters with N additional +1/+1 counters." */
    nextCreatureCounters?: number;
  };
  entersTapped?: boolean;
  /** Enters tapped unless one of these holds (checklands, battle lands, snarls). */
  entersTappedUnless?: {
    /** "unless you control a Plains or an Island". */
    controlsSubtypes?: string[];
    /** "unless you control two or more basic lands". */
    basicLands?: number;
    /** "you may reveal a Forest or Plains card from your hand. If you don't, ...". */
    revealSubtypes?: string[];
  };
  /** Effects applied, in order, when an instant or sorcery resolves. */
  effects?: EffectSpec[];
  /** "Choose one —": the caster picks one mode's effects instead of `effects`. */
  modes?: EffectSpec[][];
  /** Triggered abilities. A trigger is referred to by its index in this list. */
  triggers?: TriggerSpec[];
  /** Non-mana activated abilities. Equip and landcycling are added from `equip` and `landcycling`. */
  activated?: ActivatedSpec[];
  /** Static abilities. */
  statics?: StaticSpec[];
  /** Aura enchant restriction; applies to attachment, without targeting. */
  enchant?: ObjectFilter;
  /** Vehicle crew cost; creates an activated ability. */
  crew?: number;
  /** Equipment: the equip cost. */
  equip?: string;
  /** "Equip legendary creature {3}": a second, cheaper equip ability for legendary creatures. */
  equipLegendary?: string;
  /** "Equip abilities you activate that target this cost {N} less." */
  equipDiscount?: number;
  /** "[Type]cycling [cost]": discard from hand to search for a card of that subtype, or a basic land. */
  landcycling?: { subtype?: string; basic?: boolean; cost: string };
  /** "Cycling [cost]": discard from hand to draw a card. */
  cycling?: string;
  /** Flashback cost: cast from the graveyard, then exile it. */
  flashback?: string;
  /** Alternative characteristics used only when casting/resolving the Adventure (rule 715). */
  adventure?: { name: string; manaCost: string; types: ('instant' | 'sorcery')[]; effects: EffectSpec[] };
  /**
   * Foretell cost (rule 702.143): during your turn, pay {2} and exile this
   * card from your hand face down; cast it on a later turn for this cost.
   */
  foretell?: string;
  /**
   * "This spell costs {N} less to cast if it targets a tapped creature", or
   * "costs {N} less for each [count]" (Vanquish the Horde).
   */
  costReduction?: { generic: number; ifTargetsTappedCreature?: true; perCount?: CountKind; ifOpponentGraveyardAtLeast?: number };
  /** "Choose two" / "Choose one or more": how many of `modes` the caster picks. Default: exactly one. */
  chooseModes?: { min: number; max: number };
  /**
   * Another way to cast it: pay life instead of mana (Snuff Out), or a
   * different mana cost with different effects (overload). `label` names it
   * in menus ("Pay 4 life for", "Overload").
   */
  alternativeCost?: {
    label: string;
    mana?: string;
    life?: number;
    /** Only if you control a permanent matching this ("If you control a Swamp"). */
    ifControls?: ObjectFilter;
    /** Replaces the spell's effects when cast this way (overload). */
    effects?: EffectSpec[];
    /** "Discard a card" as part of this cost (blitz); chosen with the action (`costCards`). */
    discard?: number;
    /**
     * Blitz (rule 702.152): the creature gains haste and "When this creature
     * dies, draw a card", and is sacrificed at the beginning of the next end step.
     */
    blitz?: boolean;
    /** "You may cast this card from your graveyard using its blitz ability" (Sabin): this way only. */
    fromGraveyard?: boolean;
  };
  /** "This spell can't be countered." */
  cantBeCountered?: boolean;
  /** "As an additional cost to cast this spell, discard a card": chosen with the action (`costCards`). */
  additionalCost?: { discard: number };
  /** Ward {N} (rule 702.21). */
  ward?: number;
  /** Kicker cost (rule 702.33): pay it once as you cast the spell for an extra effect (`if: 'kicked'`). */
  kicker?: string;
  /** Multikicker cost: may be paid any number of times. */
  multikicker?: string;
  /** "This artifact enters with a [charge] counter on it for each time it was kicked." */
  entersWithCountersPerKick?: CounterKind;
  /** Escalate (rule 702.120): "tap an untapped creature you control" for each mode chosen beyond the first. */
  escalateTapCreature?: boolean;
  /** Tiered (Cloud's Limit Break): the additional mana cost of each mode. */
  modeCosts?: string[];
  /** Convoke (rule 702.51): creatures you tap while casting it each pay for {1} or one mana of their color. */
  convoke?: boolean;
  /** Artifacts you tap pay for generic mana (rule 702.126). */
  improvise?: boolean;
  /** Delve (rule 702.66): each card exiled from your graveyard while casting it pays for {1}. */
  delve?: boolean;
  /** Rebound (rule 702.88): cast from your hand, it's exiled as it resolves and can be cast free during your next turn. */
  rebound?: boolean;
  /** Unearth cost (rule 702.84): an ability that works from the graveyard. */
  unearth?: string;
  /** "This creature enters with N +1/+1 counters on it." */
  entersWithCounters?: number;
  /** "This creature enters with X +1/+1 counters on it" (Walking Ballista). */
  entersWithXCounters?: boolean;
  /** "You may have this creature enter as a copy of any creature on the battlefield" (Altered Ego). */
  entersAsCopy?: boolean;
  /** A Saga (rule 714): its final chapter number. Chapter abilities are triggers with `when: 'Chapter'`. */
  saga?: number;
  /** The kind of those counters, if not +1/+1 ("enters with a page counter on it"). */
  entersWithCounterKind?: CounterKind;
  /** A token's definition, created by effects rather than played from a deck. */
  token?: boolean;
  /**
   * A real card whose abilities aren't built yet. Creatures still play with
   * their cost, power, toughness and printed keywords; other cards can't be
   * cast until they're built.
   */
  notBuilt?: boolean;
  /** Short rules summary for placeholder cards. Real card text comes from Scryfall at build time. */
  text?: string;
  /** Scryfall set code and collector number, for real cards. */
  printing?: { set: string; number: string };
}

// ---------------------------------------------------------------------------
// Game state (PRD 7)
// ---------------------------------------------------------------------------

/**
 * `void` holds tokens that left the battlefield and ceased to exist (rule
 * 704.5d). `command` is the command zone, where commanders start (rule 903.6).
 */
export type ZoneName = 'library' | 'hand' | 'battlefield' | 'graveyard' | 'exile' | 'stack' | 'command' | 'void';

/** Zones whose contents every player may see. */
export const PUBLIC_ZONES: readonly ZoneName[] = ['battlefield', 'graveyard', 'exile', 'stack', 'command'];

/** Layer-1 copy values, with an earlier copy restored when this temporary copy expires. */
export interface BattlefieldCopy {
  definition: CardDefinition;
  artDefId: CardDefId;
  printing?: CardDefinition['printing'];
  copiedName: string;
  untilTurn?: number;
  previous?: BattlefieldCopy;
}

/** A unique physical card, or a token, in a game. */
export interface CardInstance {
  /** Copiable values of a battlefield object; counters, damage, control and attachments remain separate. */
  copy?: BattlefieldCopy;
  /** Copied abilities as the object left the battlefield, for death/leave triggers. */
  lastDefinition?: CardDefinition;
  /** Physical printing selected by the deck, independent of shared rules identity. */
  printing?: CardDefinition['printing'];
  /** Crew animation lasts until cleanup, and ends when this object changes zones. */
  crewed?: boolean;
  enteredTimestamp?: number;
  attachedTimestamp?: number;
  graveyardArrival?: { turn: number; from: ZoneName };
  /** This object's once-per-turn permission to cast from the graveyard was used. */
  graveyardCastTurn?: number;
  /** Distinguishes successive objects represented by this physical card. */
  zoneChanges?: number;
  /** Players this creature cannot attack while its uninterrupted vow counter remains. */
  vowTo?: PlayerId[];
  id: InstanceId;
  defId: CardDefId;
  owner: PlayerId;
  controller: PlayerId;
  zone: ZoneName;
  tapped: boolean;
  /** Came under its controller's control this turn; cleared at their untap step. */
  summoningSick: boolean;
  /** Damage marked this turn. Cleared in the cleanup step. */
  damage: number;
  /** Was dealt damage by a source with deathtouch this turn. */
  deathtouched: boolean;
  /** +1/+1 counters. */
  counters?: number;
  /** Other kinds of counters. Replace the object rather than changing it: state clones are shallow. */
  namedCounters?: Partial<Record<CounterKind, number>>;
  /** Monstrosity has happened to it (rule 701.37b). */
  monstrous?: boolean;
  /** As it last left the battlefield (rule 608.2h): its counters, keywords, and the Equipment attached to it. Kept until it enters again. */
  lastCounters?: Partial<Record<AnyCounter, number>>;
  lastKeywords?: Keyword[];
  lastEquippedBy?: InstanceId[];
  /** A creature spell that will enter with this many additional +1/+1 counters (Yuna, Grand Summoner). */
  extraCountersOnEnter?: number;
  /** A token rather than a card. */
  isToken?: boolean;
  /** For Equipment: the creature it's attached to. */
  attachedTo?: InstanceId;
  /** Exiled "until [source] leaves the battlefield". */
  exiledUntilLeaves?: InstanceId;
  /** Return when someone other than this ability controller becomes monarch. */
  exiledUntilOpponentMonarch?: PlayerId;
  /** In exile, and `player` may play it as long as they control `source`. */
  /** `untilTurn`: playable until the end of that turn ("until end of turn", "until the end of your next turn") instead of while `player` controls `source`. */
  /** `untilReplaced`: playable until `source` exiles another card this way, whether or not `player` still controls it (Furious Rise). */
  playableFromExile?: { player: PlayerId; source: InstanceId; untilTurn?: number; untilReplaced?: boolean };
  /** It was cast from a graveyard (for "entered from a graveyard or was cast from a graveyard"). */
  castFromGraveyard?: boolean;
  /** Its power as it last left the battlefield ("where X is this creature's power", after it died). */
  lastPower?: number;
  /** The turn counters were last put on it. */
  countersTurn?: number;
  /** The turn it last entered the battlefield. */
  enteredTurn?: number;
  /** Foretold: in exile face down since this turn; only its owner sees it. */
  foretoldTurn?: number;
  /** Face-down cards linked to the source object that exiled them. */
  linkedExile?: { source: InstanceId; sourceObject: number; lookers: PlayerId[] };
  /** The value of {X} it was cast with, while it's on the battlefield. */
  xPaid?: number;
  /** A commander (Commander format). Stays true whatever zone it's in. */
  isCommander?: boolean;
  /** Its owner chose to leave this commander where it went instead of the command zone (rule 903.9). */
  commanderStays?: boolean;
  /**
   * `player` may cast this card from its graveyard or exile on `turn`
   * (`free`: without paying its mana cost); with `exileAfter`, it's exiled
   * instead of going to the graveyard afterwards.
   */
  /**
   * `ignoreTiming`: castable whenever its player has priority, even a sorcery
   * (it stands for casting while an ability resolves, rule 608.2g).
   * `hasteSacrifice`: a creature cast this way gains haste and is sacrificed
   * at the next end step (Strago and Relm). `ownerLosesLife`: its owner loses
   * life equal to its mana value as it's cast (Kefka).
   */
  castPermission?: {
    player: PlayerId;
    turn: number;
    free?: boolean;
    exileAfter?: boolean;
    genericReduction?: number;
    ignoreTiming?: boolean;
    hasteSacrifice?: boolean;
    ownerLosesLife?: boolean;
  };
  /** Phased out (rule 702.26): off the battlefield list until its controller's next untap step, keeping its state. */
  phasedOut?: boolean;
  /** Cast for its blitz cost. Kept as it dies (for "when this creature dies, draw a card") until it enters again. */
  blitzed?: boolean;
  /** Sacrificed at the beginning of the next end step (a creature cast with Strago and Relm's permission). */
  sacrificeAtEndStep?: boolean;
  /** Returned with unearth: exiled at the next end step or if it would leave the battlefield. */
  unearthed?: boolean;
  /** Rebound: exiled by its own rebound, waiting for its owner's next upkeep. */
  rebounding?: boolean;
  /** Only on the stack: use the Adventure's characteristics instead of the creature's. */
  adventureSpell?: boolean;
  /** The controller of a resolved Adventure may cast its creature while it stays in exile. */
  adventurer?: PlayerId;
  /** Hildibrand's dies permission; expires during cleanup of that player's next turn. */
  adventureGraveyard?: { player: PlayerId; grantedTurn: number; expiresOnTurn?: number };
}

/** One floating mana carrying a delayed commander-type scry trigger. */
export interface CreatureScryMana {
  mana: ManaType;
  source: InstanceId;
  sourceObject: number;
}

export interface PlayerState {
  /** Last turn this player activated an ability targeting a creature they controlled. */
  friendlyTargetAbilityTurn?: number;
  id: PlayerId;
  life: number;
  /** Index 0 is the top of the library. */
  library: InstanceId[];
  hand: InstanceId[];
  battlefield: InstanceId[];
  graveyard: InstanceId[];
  exile: InstanceId[];
  /** The command zone (Commander format). */
  command: InstanceId[];
  /** Times each of this player's commanders has been cast from the command zone (commander tax, rule 903.8). */
  commanderCasts: Record<InstanceId, number>;
  /** Combat damage this player has taken from each commander (rule 903.10a). */
  commanderDamage: Record<InstanceId, number>;
  /** Floating mana whose scry rider has not yet been spent. */
  creatureScryMana?: CreatureScryMana[];
  manaPool: ManaPool;
  /** Mana that can only be spent on Equipment spells and equip abilities. */
  equipmentMana: ManaPool;
  landsPlayedThisTurn: number;
  eliminated: boolean;
  drewFromEmptyLibrary: boolean;
  /** Life lost this turn ("if a player lost 4 or more life this turn"). Reset as each turn begins. */
  lifeLostThisTurn?: number;
  /** The next creature spell this player casts on `turn` enters with `amount` additional +1/+1 counters. */
  nextCreatureCounters?: { turn: number; amount: number };
  /** The last turn this player put a counter on a creature. */
  counterOnCreatureTurn?: number;
  /** Life gained this turn. Reset as each turn begins. */
  lifeGainedThisTurn?: number;
  /** The last turn a card left this player's graveyard. */
  cardLeftGraveyardTurn?: number;
  /** Noncreature spells this player cast this turn. Reset as each turn begins. */
  noncreatureSpellsThisTurn?: number;
  /** Spells this player cast this turn. Reset as each turn begins. */
  spellsCastThisTurn?: number;
  /** An effect said this player loses the game (someone else's "you win the game"). */
  lostToEffect?: boolean;
  /** "Until your next turn, creatures can't attack you unless their controller pays {N} for each" (Summon: Yojimbo). Ends as this player's next turn begins. */
  attackTaxes?: number[];
  /** "Prevent all damage that would be dealt to you this turn": the turn it applies to. */
  preventDamageTurn?: number;
  /** Cards drawn this turn. Reset as each turn begins. */
  cardsDrawnThisTurn?: number;
  conceded: boolean;
  /** Phased-out permanents this player owns (they're `zone: 'battlefield'` with `phasedOut`). */
  phasedOut?: InstanceId[];
}

/** Steps and phases in turn order. */
export const STEPS = [
  'untap',
  'upkeep',
  'draw',
  'main1',
  'beginCombat',
  'declareAttackers',
  'declareBlockers',
  'combatDamage',
  'endCombat',
  'main2',
  'end',
  'cleanup',
] as const;
export type Step = (typeof STEPS)[number];

/** `none`: an "up to one target" that was left out. */
export type Target = { kind: 'player'; player: PlayerId } | { kind: 'card'; card: InstanceId } | { kind: 'ability'; ability: string } | { kind: 'none' };

export interface SpellItem {
  /** This cast actually used flashback, rather than another permission on a card with flashback. */
  flashback?: boolean;
  adventure?: boolean;
  id: string;
  kind: 'spell';
  card: InstanceId;
  controller: PlayerId;
  /** Card-object identities when a spell chose its targets. */
  targetObjects?: (number | null)[];
  /** entersAsCopy: the creature chosen to copy as it resolves (null: none). */
  entryCopy?: { card: InstanceId; object: number } | null;
  /** One target per effect that requires a choice, in effect order. */
  targets: Target[];
  /** For modal spells, the chosen mode. */
  mode?: number;
  /** For "choose two" / "choose one or more" spells, the chosen modes in printed order. */
  modes?: number[];
  /** Cast for its alternative cost (which may replace its effects). */
  alternative?: boolean;
  /** Where it was cast from. Flashback spells are exiled afterwards. */
  castFrom: 'hand' | 'graveyard' | 'exile' | 'command' | 'library';
  /** Total mana spent to cast it. */
  manaSpent: number;
  /** Cast with Strago and Relm's permission: as a creature it gains haste and is sacrificed at the next end step. */
  sacrificeAtEndStep?: true;
  /** The value chosen for {X}. */
  x?: number;
  /** The creatures that convoked it. */
  convoked?: InstanceId[];
  /** How many times its kicker or multikicker was paid. */
  kicks?: number;
  /** Exiled instead of going to the graveyard (cast with a permission that says so). */
  exileAfter?: boolean;
  /** The permanent enters tapped (Edgar). */
  entersTapped?: boolean;
}

/** A triggered or activated ability on the stack. The source card stays where it is. */
export interface AbilityItem {
  targetObjects?: (number | null)[];
  /** Activated abilities remain independent of subsequent source copies. */
  activatedSpec?: ActivatedSpec;
  /** Cost-exiled objects; later zone changes cannot substitute a new object. */
  exiledAsCost?: { card: InstanceId; object: number }[];
  /** Rule triggers have no physical source; source is the @monarch designation key. */
  rule?: 'monarch';
  subjectObject?: number;
  /** Captured granted or expanded trigger; immutable after queueing. */
  spec?: TriggerSpec;
  /** Last known counter kinds when this ability's source object left. */
  lastSourceCounterKinds?: number;
  sourceObject?: number;
  subjectController?: PlayerId;
  modes?: number[];
  id: string;
  kind: 'ability';
  source: InstanceId;
  /** Triggered abilities index `triggers`; activated ones index `activatedAbilities(def)`. */
  from: 'trigger' | 'activated';
  ability: number;
  /** Where the source was when it triggered or was activated; "this card" effects need it still there. */
  sourceZone: ZoneName;
  controller: PlayerId;
  targets: Target[];
  /** Attack triggers: the player being attacked. */
  defender?: PlayerId;
  /** Triggered abilities: the object the trigger event happened to. */
  subject?: InstanceId;
  /** Damage triggers: how much damage was dealt. */
  amount?: number;
  /** "Choose one at random": which of `randomModes` came up. */
  mode?: number;
  /** The controller's answer to "you may" or an optional cost, once given. */
  accepted?: boolean;
}

export type StackItem = SpellItem | AbilityItem;

/** A triggered ability waiting to be put on the stack. */
export interface QueuedTrigger {
  /** Rule triggers have no physical source; source is the @monarch designation key. */
  rule?: 'monarch';
  subjectObject?: number;
  /** Captured granted or expanded trigger; immutable after queueing. */
  spec?: TriggerSpec;
  /** Last known counter kinds when this ability's source object left. */
  lastSourceCounterKinds?: number;
  sourceObject?: number;
  subjectController?: PlayerId;
  modes?: number[];
  source: InstanceId;
  ability: number;
  controller: PlayerId;
  sourceZone: ZoneName;
  defender?: PlayerId;
  /** The object the trigger event happened to (the creature that entered, attacked, died...). */
  subject?: InstanceId;
  /** Damage triggers: how much damage was dealt. */
  amount?: number;
  /** "Choose one at random": which of `randomModes` came up. */
  mode?: number;
}

/** An "until end of turn" effect on one object (rule 611.2). */
export interface TemporaryEffect {
  trigger?: TriggerSpec;
  basePowerToughness?: [number, number];
  timestamp?: number;
  source: InstanceId;
  affected: InstanceId;
  power?: number;
  toughness?: number;
  keywords?: Keyword[];
  flags?: TemporaryFlag[];
  /** Lasts for as long as this player controls the source instead of until end of turn. */
  whileControlledBy?: PlayerId;
}

/** A spell or ability partway through resolving, waiting on a choice (surveil). */
export interface Resolving {
  /** Objects returned earlier during this resolution, for linked attachments. */
  returnedObjects?: Record<InstanceId, number>;
  /** The non-target defending-player choice for entering attacking. */
  attackingDefender?: PlayerId;
  /** Counter distribution is chosen one counter at a time, then applied in a batch per recipient. */
  distribution?: { source: InstanceId; remaining: number; assigned: Record<InstanceId, number> };
  item: StackItem;
  /** Index of the next effect to apply. */
  next: number;
  /** How many chosen targets the effects so far used. */
  chosenUsed: number;
  previousTarget?: Target;
  /** The previous target's power when it was chosen, for "life equal to its power" after it's gone. */
  previousTargetPower?: number;
  /** Permanents destroyed so far by this spell or ability ("for each permanent destroyed this way"). */
  destroyedCount?: number;
  createdTokens: InstanceId[];
  /** Cards still to look at for the current surveil or scry. */
  surveilQueue: InstanceId[];
  /** The cards being looked at are for a scry (bottom of the library) rather than a surveil (graveyard). */
  scrying?: boolean;
  /** Card choices still to make, in order (discard, sacrifice). */
  choiceQueue?: CardChoice[];
  /** A permanent was sacrificed by an earlier effect of this spell ("If you do"). */
  sacrificedAny?: boolean;
  /** Life players lost to this spell or ability's effects so far. */
  lifeLostThisWay?: number;
  /** The mana value of the card RevealUntil found. */
  revealedManaValue?: number;
  /** Whether the triggering creature had less power than the source, checked once as it starts resolving (Shelinda). */
  subjectWasWeaker?: boolean;
  /** What each player chose in the last choosing effect. */
  chosen?: { player: PlayerId; cards: InstanceId[] }[];
  /** Mana value of all cards chosen in the last choosing effect, measured as they were chosen. */
  chosenManaValue?: number;
  /** Whether the cards chosen in the last choosing effect included a creature / a noncreature card. */
  chosenTypes?: { creature: boolean; noncreature: boolean };
  /** Connive: the creatures conniving; each gets a +1/+1 counter per nonland card discarded, in order. */
  conniving?: InstanceId[];
}

/** One player's card choice during resolution or cleanup. */
export interface CardChoice {
  /** addCounters: a named counter instead of +1/+1. */
  counter?: CounterKind;
  /** Counter-distribution progress for the board. */
  counterCount?: number;
  player: PlayerId;
  /** What happens to the chosen cards: discarded, sacrificed, kept (and the other candidates sacrificed), or put onto the battlefield. */
  purpose: 'hideaway' | 'copyOnEntry' | 'fateBottom' | 'handSize' | 'discard' | 'sacrifice' | 'keep' | 'battlefield' | 'destroy' | 'hand' | 'reanimate' | 'keepVow' | 'library' | 'offerDraw' | 'distributeCounter' | 'addCounters';
  /** The cards to choose from. */
  cards: InstanceId[];
  min: number;
  max: number;
  /** All of `cards` or none (discarding a whole hand). */
  allOrNothing?: boolean;
  /** At most one card of each of these types (Tragic Arrogance). */
  onePerType?: CardType[];
  /** copyOnEntry: the permanent spell waiting on the stack for the choice. */
  item?: string;
}

export interface Attack {
  attacker: InstanceId;
  defender: PlayerId;
}

export interface Block {
  blocker: InstanceId;
  attacker: InstanceId;
}

export interface CombatState {
  /** Being blocked persists even after every blocker leaves combat. */
  blockedAttackers?: InstanceId[];
  /** Declared defenders remain counted after attackers leave or opponents concede. */
  declaredOpponents?: Record<PlayerId, PlayerId[]>;
  damageStep?: 'first' | 'regular';
  /** Objects with first/double strike as the first damage step began. */
  firstStrikeParticipants?: Record<InstanceId, number>;
  attacks: Attack[];
  /** In declaration order, which is also the damage assignment order for now. */
  blocks: Block[];
  /** Defending players who still have to declare blockers, in turn order. */
  blockersPending: PlayerId[];
}

/** Whose decision the game is waiting on. */
export type Pending =
  | { kind: 'copyCreature'; player: PlayerId; source: InstanceId; target: InstanceId; sourceObject: number; targetObject: number; effect: EffectSpec }
  | { kind: 'chooseMana'; player: PlayerId; recipient: PlayerId; amount: number }
  | { kind: 'chooseOpponent'; player: PlayerId; opponents: PlayerId[] }
  | { kind: 'chooseDefender'; player: PlayerId; card: InstanceId; defenders: PlayerId[] }
  | { kind: 'chooseModes'; player: PlayerId; then: PlayerId }
  | { kind: 'priority'; player: PlayerId; passes: number }
  | { kind: 'declareAttackers'; player: PlayerId }
  | { kind: 'declareBlockers'; player: PlayerId }
  /** Choose targets for the first queued trigger; `then` gets priority once triggers are on the stack. */
  | { kind: 'chooseTargets'; player: PlayerId; then: PlayerId }
  /** Answer "you may" (and pay any cost) for the ability on top of the stack. */
  | { kind: 'decide'; player: PlayerId; item: string }
  /** Privately look at a library card and optionally exile it face down. */
  | { kind: 'exileTop'; player: PlayerId; card: InstanceId }
  /** Surveil: keep `card` on top of your library, or put it into your graveyard. With `scry`, the bottom of the library instead. */
  | { kind: 'surveil'; player: PlayerId; card: InstanceId; scry?: boolean }
  /**
   * Legend rule (704.5j): you control two or more legendary permanents named
   * `name`; choose one of `cards` to keep. `resume` is the decision that was
   * due before, which continues afterwards.
   */
  | { kind: 'chooseLegend'; player: PlayerId; name: string; cards: InstanceId[]; resume: Pending }
  /**
   * Your commander went to `zone` (graveyard, exile, hand or library): move it to
   * the command zone, or leave it there (rule 903.9). `resume` continues afterwards.
   */
  | { kind: 'commanderZone'; player: PlayerId; card: InstanceId; zone: ZoneName; resume: Pending }
  /**
   * Before the first turn (rule 103.5): keep this opening hand or mulligan.
   * `taken` mulligans so far; `queue` players still to decide, in turn order.
   */
  | { kind: 'mulligan'; player: PlayerId; taken: number; queue: PlayerId[] }
  /** London mulligan: put `count` cards from your kept hand on the bottom of your library. */
  | { kind: 'bottomCards'; player: PlayerId; count: number; queue: PlayerId[] }
  /** Choose cards during resolution, or discard to maximum hand size during cleanup. */
  | ({ kind: 'chooseCards' } & CardChoice)
  | { kind: 'gameOver' };

/** One casting allowance shared by a group of card objects, independent of other permissions. */
export interface CastGroup {
  id: string;
  source: InstanceId;
  player: PlayerId;
  turn: number;
  cards: { card: InstanceId; object: number; zone: 'graveyard' | 'exile' }[];
  /** Mana of any type can be spent to cast the spell (Summon: Esper Valigarmanda). */
  anyManaType?: boolean;
}

export interface GameState {
  castGroups?: CastGroup[];
  /** The monarch designation persists independently of the cards that created it. */
  monarch?: PlayerId;
  /** Shared ordering for continuous effects that set base power/toughness. */
  effectTimestamp?: number;
  /** Cleanup actions have finished; state-based actions/triggers must be checked before ending the turn. */
  cleanupCheck?: boolean;
  cleanupNeedsPriority?: boolean;
  combatDamageHistory?: { source: InstanceId; sourceObject: number; player: PlayerId; dragon: boolean }[];
  format: FormatConfig;
  cardDefs: Record<CardDefId, CardDefinition>;
  cards: Record<InstanceId, CardInstance>;
  players: Record<PlayerId, PlayerState>;
  /** Fixed seating order. Eliminated players stay in it and are skipped. */
  turnOrder: PlayerId[];
  activePlayer: PlayerId;
  turnNumber: number;
  step: Step;
  /** Last element is the top of the stack. */
  stack: StackItem[];
  /** A spell or ability partway through resolving. */
  resolving: Resolving | null;
  /**
   * The queued triggers came from mana abilities and wait: if the player next
   * casts a spell or activates an ability, they go on the stack above it
   * (paying while casting, rule 601.2i); any other action puts them on the
   * stack first (rule 117.3c).
   */
  triggersHeld?: boolean;
  /** Triggered abilities waiting to go on the stack, in APNAP order. */
  triggerQueue: QueuedTrigger[];
  /** "source#ability" keys of once-each-turn abilities that already triggered this turn. */
  triggeredThisTurn: string[];
  /** "Until end of turn" effects. */
  temporaryEffects: TemporaryEffect[];
  /** Creatures put into a graveyard from the battlefield this turn. */
  creaturesDiedThisTurn: number;
  /** Combat phases begun this turn. */
  combatsThisTurn?: number;
  /** Additional combat phases still to come this turn (each after the current one). */
  extraCombats?: number;
  combat: CombatState | null;
  pending: Pending;
  /** Set when the game ends. null means a draw (everyone left at once). */
  winner?: PlayerId | null;
  /** Seeded generator state. Never sent to clients. */
  rngState: number;
  nextId: number;
}

// ---------------------------------------------------------------------------
// Actions (player intents)
// ---------------------------------------------------------------------------

export type Action =
  | { type: 'CopyCreature'; player: PlayerId; accept: boolean }
  | { type: 'ChooseOpponent'; player: PlayerId; opponent: PlayerId }
  /** `reveal`: for lands like snarls, reveal a matching card to enter untapped (default: if you can). */
  | { type: 'PlayLand'; player: PlayerId; card: InstanceId; reveal?: boolean }
  /**
   * `mode` for "choose one" spells; `modes` (in printed order) for "choose two"
   * or "choose one or more". `alternative`: pay the card's alternative cost.
   */
  | {
      type: 'CastSpell';
      /** Cast the Adventure rather than the creature. */
      adventure?: boolean;
      player: PlayerId;
      card: InstanceId;
      /** Which permanent's graveyard-casting permission is being used. */
      graveyardSource?: InstanceId;
      /** Use this shared one-spell allowance instead of another permission. */
      castGroup?: string;
      targets?: Target[];
      mode?: number;
      modes?: number[];
      alternative?: boolean;
      /** Cards discarded to pay an additional cost. */
      costCards?: InstanceId[];
      /** The value chosen for {X} in its cost. */
      x?: number;
      /** Convoke: untapped creatures you control to tap as part of the payment. */
      convoke?: InstanceId[];
      improvise?: InstanceId[];
      /** Delve: cards in your graveyard to exile as part of the payment. */
      delve?: InstanceId[];
      /** Times kicker (or multikicker) is paid. */
      kicks?: number;
      /** Escalate: untapped creatures you control to tap, one per mode beyond the first. */
      tapCreatures?: InstanceId[];
    }
  /** With `output` (and `payWith`): the card's paid mana ability, adding `manaAbility.paid.outputs[output]`. */
  | { type: 'ActivateManaAbility'; player: PlayerId; card: InstanceId; mana: ManaType; output?: number; payWith?: number; tapCreature?: InstanceId; grantedBy?: InstanceId }
  /** `costCards`: the cards discarded or the permanent sacrificed to pay the cost. */
  | { type: 'ActivateAbility'; player: PlayerId; card: InstanceId; ability: number; targets?: Target[]; costCards?: InstanceId[] }
  /** Foretell: pay {2} and exile a card from your hand face down (a special action during your turn). */
  | { type: 'Foretell'; player: PlayerId; card: InstanceId }
  | { type: 'PassPriority'; player: PlayerId }
  | { type: 'DeclareAttackers'; player: PlayerId; attacks: Attack[] }
  | { type: 'DeclareBlockers'; player: PlayerId; blocks: Block[] }
  | { type: 'ChooseTargets'; player: PlayerId; targets: Target[] }
  | { type: 'ChooseDefender'; player: PlayerId; defender: PlayerId }
  | { type: 'ChooseModes'; player: PlayerId; modes: number[] }
  | { type: 'Decide'; player: PlayerId; accept: boolean }
  | { type: 'ChooseMana'; player: PlayerId; mana: Color }
  | { type: 'ExileTop'; player: PlayerId; exile: boolean }
  | { type: 'Surveil'; player: PlayerId; toGraveyard: boolean }
  | { type: 'ChooseLegend'; player: PlayerId; keep: InstanceId }
  | { type: 'CommanderZone'; player: PlayerId; toCommand: boolean }
  /** Keep your opening hand, or shuffle it away and draw a new one. */
  | { type: 'Mulligan'; player: PlayerId; keep: boolean }
  /** After keeping a mulliganed hand: the cards to put on the bottom, top one first. */
  | { type: 'BottomCards'; player: PlayerId; cards: InstanceId[] }
  /** The cards chosen for a pending `chooseCards`. */
  | { type: 'ChooseCards'; player: PlayerId; cards: InstanceId[] }
  | { type: 'Concede'; player: PlayerId };

// ---------------------------------------------------------------------------
// Events (immutable facts, PRD 9)
// ---------------------------------------------------------------------------

export type EliminationReason = 'life' | 'emptyLibrary' | 'conceded' | 'commanderDamage' | 'effect';

export interface DamageSourceSnapshot {
  card: CardInstance;
  types: CardType[];
  power: number;
  toughness: number;
}

export type GameEvent =
  | { type: 'BecameCopy'; card: InstanceId; copied: InstanceId; name: string }
  | { type: 'CopyEnded'; card: InstanceId }
  | { type: 'CoinFlipped'; player: PlayerId; won: boolean }
  | { type: 'MonarchChanged'; player: PlayerId; previous?: PlayerId }
  | { type: 'AbilityCountered'; ability: string; source: InstanceId; by: InstanceId }
  | { type: 'CreatureEnteredAttacking'; card: InstanceId; defender: PlayerId }
  | { type: 'AbilityTargeted'; card: InstanceId; controller: PlayerId; source: InstanceId }
  | { type: 'GameStarted'; turnOrder: PlayerId[] }
  | { type: 'LibraryShuffled'; player: PlayerId }
  /** `n`: how many cards that player has drawn this turn, counting this one. */
  | { type: 'CardDrawn'; player: PlayerId; card?: InstanceId; defId?: CardDefId; n?: number }
  | {
      type: 'CardMoved';
      /** Private identity when a face-down card moves to another hidden zone. */
      visibleTo?: PlayerId[];
      card?: InstanceId;
      defId?: CardDefId;
      owner: PlayerId;
      /** Who controlled it, when it leaves the battlefield. */
      controller?: PlayerId;
      from: ZoneName;
      to: ZoneName;
          /** Leaving the battlefield: the Equipment attached to it at that moment (for look-back triggers). */
      equippedBy?: InstanceId[];
      /** Types just before leaving, including temporary crew animation. */
      lastTypes?: CardType[];
      /** It was sacrificed. */
      sacrificed?: boolean;
    }
  | { type: 'TokenCreated'; card: InstanceId; defId: CardDefId; controller: PlayerId }
  | { type: 'Discarded'; player: PlayerId; card: InstanceId }
  | { type: 'CardTapped'; card: InstanceId }
  | { type: 'CardsUntapped'; player: PlayerId; cards: InstanceId[] }
  | { type: 'ManaAdded'; player: PlayerId; mana: ManaType; source: InstanceId }
  | { type: 'ManaSpent'; player: PlayerId; amounts: Partial<ManaPool> }
  | { type: 'FaceDownExiled'; player: PlayerId; card?: InstanceId }
  | { type: 'LandPlayed'; player: PlayerId; card: InstanceId; from: ZoneName }
  | { type: 'SpellCast'; castFrom?: ZoneName; player: PlayerId; card: InstanceId; defId: CardDefId; targets: Target[]; manaSpent: number; scryMana?: CreatureScryMana[] }
  | {
      type: 'AbilityTriggered';
      item: string;
      card: InstanceId;
      ability: number;
      controller: PlayerId;
      targets: Target[];
    }
  | { type: 'AbilityActivated'; item: string; card: InstanceId; ability: number; controller: PlayerId; targets: Target[] }
  /** `card` is the spell, or the source of an ability. */
  | { type: 'StackItemAdded'; item: string; card: InstanceId }
  | { type: 'StackItemResolved'; item: string; card: InstanceId; fizzled: boolean }
  | { type: 'Decided'; player: PlayerId; item: string; card: InstanceId; accepted: boolean }
  /** Surveil or scry: `toGraveyard` means "away" (the graveyard, or the bottom of the library when `scry`). */
  | { type: 'Surveiled'; player: PlayerId; card?: InstanceId; toGraveyard: boolean; scry?: boolean }
  | { type: 'LegendChosen'; player: PlayerId; kept: InstanceId; others: InstanceId[] }
  | { type: 'CommanderZoneChosen'; player: PlayerId; card: InstanceId; from: ZoneName; toCommand: boolean }
  /** A player shuffled their hand away and drew a new one; `taken` mulligans so far. */
  | { type: 'Mulliganed'; player: PlayerId; taken: number }
  /** A player kept their hand after `taken` mulligans and will bottom `bottom` cards. */
  | { type: 'HandKept'; player: PlayerId; taken: number; bottom: number }
  /** Cards went from hand to the bottom of the library. Which cards stays hidden. */
  | { type: 'CardsBottomed'; player: PlayerId; count: number }
  /** A card was revealed from a library (Chaos Warp). */
  | { type: 'CardRevealed'; player: PlayerId; card: InstanceId; defId: CardDefId }
  /** `by`: the controller of the spell or ability that put them there. */
  /** `total`: how many of that kind it has afterwards (for Saga chapters). */
  | { type: 'CountersAdded'; card: InstanceId; amount: number; by?: PlayerId; counter?: CounterKind; total?: number }
  | { type: 'CountersRemoved'; card: InstanceId; amount: number; counter: AnyCounter }
  /** A card was foretold: exiled face down. Which card stays hidden. */
  | { type: 'Foretold'; player: PlayerId; card: InstanceId }
  /** A permanent phased out or back in (rule 702.26). */
  | { type: 'PhasedOut'; card: InstanceId }
  | { type: 'PhasedIn'; card: InstanceId }
  /** A spell was countered: it left the stack without resolving. */
  | { type: 'SpellCountered'; card: InstanceId; defId: CardDefId; by: InstanceId }
  | { type: 'Attached'; equipment: InstanceId; creature: InstanceId | null }
  | { type: 'ControlChanged'; card: InstanceId; controller: PlayerId }
  | { type: 'PriorityPassed'; player: PlayerId }
  | { type: 'AttackDeclared'; attacker: InstanceId; defendingPlayer: PlayerId }
  | { type: 'BlockDeclared'; blocker: InstanceId; attacker: InstanceId }
  | { type: 'AttackersUnblocked'; player: PlayerId; defender: PlayerId; attackers: InstanceId[] }
  | { type: 'DamageDealt'; sourceSnapshot?: DamageSourceSnapshot; damagedMonarch?: PlayerId; source: InstanceId; target: Target; amount: number; combat: boolean; grantedTriggers?: TriggerSpec[]; sourceController?: PlayerId; sourceObject?: number; sourceCounterKinds?: number }
  | { type: 'CreatureDied'; card: InstanceId; defId: CardDefId; owner: PlayerId }
  | { type: 'PermanentDestroyed'; card: InstanceId; defId: CardDefId; owner: PlayerId }
  | { type: 'LifeChanged'; player: PlayerId; from: number; to: number }
  | { type: 'StepChanged'; step: Step; activePlayer: PlayerId }
  | { type: 'TurnChanged'; activePlayer: PlayerId; turnNumber: number }
  | { type: 'PlayerEliminated'; player: PlayerId; reason: EliminationReason }
  | { type: 'GameEnded'; winner: PlayerId | null };

export type ActionResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: string };
