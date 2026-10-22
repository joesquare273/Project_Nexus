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
] as const;
export type Keyword = (typeof KEYWORDS)[number];

/**
 * Counters other than +1/+1 counters, which are `counters` (rule 122). A
 * shield counter prevents damage or destruction once; a stun counter stops
 * the next untap; a flying counter grants flying.
 */
export const COUNTER_KINDS = ['shield', 'stun', 'flying', 'page', 'soul'] as const;
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
];

export const EFFECT_KINDS = [
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
  /** "gains [keywords] until end of turn". */
  'GrantKeywords',
  /** Special one-turn rules: "can't be blocked this turn", "must be blocked this turn if able", and so on. */
  'GrantFlags',
  /** Exile the target until the source leaves the battlefield. */
  'ExileUntilSourceLeaves',
  /** Exile the top card of your library; you may play it while you control the source. */
  'ExileTopCardToPlay',
  'Mill',
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
] as const;
export type EffectKind = (typeof EFFECT_KINDS)[number];

/** Things whose number an amount can count, from the point of view of the spell or ability's controller. */
export const COUNT_KINDS = [
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
      of: 'previousTargetPower' | 'destroyedThisWay' | 'chosenCount' | 'chosenManaValue' | 'sourcePower' | 'subjectPower' | 'subjectCounters';
      plus?: number;
    };

export const TEMPORARY_FLAGS = [
  'cantBeBlocked',
  'mustBeBlocked',
  /** "If that creature would die this turn, exile it instead." */
  'exileIfWouldDie',
  /** "When that creature dies this turn, return that card to its owner's hand." */
  'returnToHandIfDies',
  /** "If damage would be dealt to that creature this turn, prevent that damage and put that many +1/+1 counters on it." */
  'damageBecomesCounters',
] as const;
export type TemporaryFlag = (typeof TEMPORARY_FLAGS)[number];

export interface EffectSpec {
  effect: EffectKind;
  amount?: Amount;
  target: TargetKind;
  /** For TargetPermanent, TargetCardInGraveyard and SearchLibraryToHand: what qualifies. */
  filter?: ObjectFilter;
  /** CreateToken: the token's card id. */
  token?: CardDefId;
  /** ModifyPT. */
  power?: number;
  toughness?: number;
  /** GrantKeywords. */
  keywords?: Keyword[];
  /** GrantFlags. */
  flags?: TemporaryFlag[];
  /** ReturnToBattlefield: extra +1/+1 counters. */
  counters?: number;
  /** AddCounters, ReturnToBattlefield: a kind of counter other than +1/+1. */
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
  /** Only happens if this is true ("if this spell was cast from a graveyard"). */
  if?: 'castFromGraveyard';
  /** Only happens if the source's power is at least this ("if Cloud has power 7 or greater"). */
  ifSourcePowerAtLeast?: number;
  /** SearchLibraryToBattlefield: the card enters tapped. */
  entersTapped?: boolean;
  /** Exile: also exile every token that player controls with the same name (Legions to Ashes). */
  sameNameTokens?: boolean;
  /** Discard: as many cards as they like. */
  anyNumber?: boolean;
  /** Discard: "may discard their hand": all of it or none. */
  wholeHand?: boolean;
  /** Discard, Sacrifice: "may": up to `amount` instead of exactly. */
  optional?: boolean;
  /** KeepAndSacrificeRest: the spell's controller chooses for each player (Tragic Arrogance). */
  chooser?: 'You';
  /** KeepAndSacrificeRest: keep at most one of each of these types. */
  onePerType?: CardType[];
  /** Only if the last choice picked something ("If you do"), or a creature / noncreature card (Mog). */
  ifChose?: 'any' | 'creature' | 'noncreature';
  /** ExileTopCardToPlay: playable until end of turn, not while you control the source. */
  thisTurn?: boolean;
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
  /** AttachEquipmentTo: which chosen target (by index) is the Equipment. */
  from?: number;
}

/**
 * What a triggered ability waits for (rule 603). "Subject" below is the
 * object the event happened to: the creature that entered, died, attacked or
 * dealt damage, or the spell that was cast.
 */
export const TRIGGER_EVENTS = [
  'EntersBattlefield',
  'Dies',
  'Attacks',
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
] as const;
export type TriggerEvent = (typeof TRIGGER_EVENTS)[number];

/**
 * Which objects qualify, relative to the card that has the ability: for a
 * trigger's subject, a target, or a card to search for.
 */
export interface ObjectFilter {
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
  tapped?: boolean;
  attacking?: boolean;
  /** Is attacking the player whose ability this is ("target creature attacking you"). */
  attackingYou?: boolean;
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
  /** Is (or, with false, isn't) a token ("nontoken creature"). */
  token?: boolean;
}

export interface TriggerSpec {
  when: TriggerEvent;
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
  cost?: { mana?: string; life?: number };
  effects: EffectSpec[];
}

/** A non-mana activated ability: "[cost]: [effect]" (rule 602). */
export interface ActivatedSpec {
  cost: {
    mana?: string;
    tap?: boolean;
    /** Discard this card (cycling, landcycling). */
    discardThis?: boolean;
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
  };
  /** Where the card must be. Defaults to the battlefield. */
  zone?: 'battlefield' | 'hand';
  /** "Activate only as a sorcery" (equip always is). */
  sorcerySpeed?: boolean;
  /** An equip ability: its cost can be reduced by the target (`equipDiscount`), and restricted mana can pay for it. */
  equip?: boolean;
  effects: EffectSpec[];
}

/** A continuous effect from a static ability (rule 604, 611.3). */
export interface StaticSpec {
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
  /**
   * Only while these hold: "during your turn", "as long as it's equipped",
   * "as long as equipped creature is legendary".
   */
  conditions?: ('yourTurn' | 'equipped' | 'legendary')[];
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
    /** "Spend this mana only to cast an Equipment spell or activate an equip ability." */
    onlyForEquipment?: boolean;
    /** Adds this many of the chosen mana instead of one ("{T}: Add {C}{C}"). */
    amount?: number;
    /** Producing one of these deals 1 damage to you (pain lands, Talismans). */
    painFor?: ManaType[];
    /** "Add one mana of any color in your commander's color identity." */
    commanderIdentity?: boolean;
    /** "Add one mana of any color that a land an opponent controls could produce." */
    opponentLandColors?: boolean;
    /** "Add one mana of any type that a land you control could produce." */
    yourLandColors?: boolean;
    /** "If this creature has a +1/+1 counter on it, add three mana instead." */
    amountWithCounters?: number;
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
  /** Equipment: the equip cost. */
  equip?: string;
  /** "Equip abilities you activate that target this cost {N} less." */
  equipDiscount?: number;
  /** "[Type]cycling [cost]": discard from hand to search for a card of that subtype, or a basic land. */
  landcycling?: { subtype?: string; basic?: boolean; cost: string };
  /** "Cycling [cost]": discard from hand to draw a card. */
  cycling?: string;
  /** Flashback cost: cast from the graveyard, then exile it. */
  flashback?: string;
  /**
   * "This spell costs {N} less to cast if it targets a tapped creature", or
   * "costs {N} less for each [count]" (Vanquish the Horde).
   */
  costReduction?: { generic: number; ifTargetsTappedCreature?: true; perCount?: CountKind };
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
  };
  /** "This spell can't be countered." */
  cantBeCountered?: boolean;
  /** "As an additional cost to cast this spell, discard a card": chosen with the action (`costCards`). */
  additionalCost?: { discard: number };
  /** "This creature enters with N +1/+1 counters on it." */
  entersWithCounters?: number;
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

/** A unique physical card, or a token, in a game. */
export interface CardInstance {
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
  /** In exile, and `player` may play it as long as they control `source`. */
  /** `untilTurn`: playable until the end of that turn instead of while `player` controls `source`. */
  playableFromExile?: { player: PlayerId; source: InstanceId; untilTurn?: number };
  /** It was cast from a graveyard (for "entered from a graveyard or was cast from a graveyard"). */
  castFromGraveyard?: boolean;
  /** Its power as it last left the battlefield ("where X is this creature's power", after it died). */
  lastPower?: number;
  /** The turn counters were last put on it. */
  countersTurn?: number;
  /** A commander (Commander format). Stays true whatever zone it's in. */
  isCommander?: boolean;
  /** Its owner chose to leave this commander where it went instead of the command zone (rule 903.9). */
  commanderStays?: boolean;
}

export interface PlayerState {
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
  conceded: boolean;
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
export type Target = { kind: 'player'; player: PlayerId } | { kind: 'card'; card: InstanceId } | { kind: 'none' };

export interface SpellItem {
  id: string;
  kind: 'spell';
  card: InstanceId;
  controller: PlayerId;
  /** One target per effect that requires a choice, in effect order. */
  targets: Target[];
  /** For modal spells, the chosen mode. */
  mode?: number;
  /** For "choose two" / "choose one or more" spells, the chosen modes in printed order. */
  modes?: number[];
  /** Cast for its alternative cost (which may replace its effects). */
  alternative?: boolean;
  /** Where it was cast from. Flashback spells are exiled afterwards. */
  castFrom: 'hand' | 'graveyard' | 'exile' | 'command';
  /** Total mana spent to cast it. */
  manaSpent: number;
}

/** A triggered or activated ability on the stack. The source card stays where it is. */
export interface AbilityItem {
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
  /** The controller's answer to "you may" or an optional cost, once given. */
  accepted?: boolean;
}

export type StackItem = SpellItem | AbilityItem;

/** A triggered ability waiting to be put on the stack. */
export interface QueuedTrigger {
  source: InstanceId;
  ability: number;
  controller: PlayerId;
  sourceZone: ZoneName;
  defender?: PlayerId;
  /** The object the trigger event happened to (the creature that entered, attacked, died...). */
  subject?: InstanceId;
}

/** An "until end of turn" effect on one object (rule 611.2). */
export interface TemporaryEffect {
  source: InstanceId;
  affected: InstanceId;
  power?: number;
  toughness?: number;
  keywords?: Keyword[];
  flags?: TemporaryFlag[];
}

/** A spell or ability partway through resolving, waiting on a choice (surveil). */
export interface Resolving {
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
  /** What each player chose in the last choosing effect. */
  chosen?: { player: PlayerId; cards: InstanceId[] }[];
  /** Mana value of all cards chosen in the last choosing effect, measured as they were chosen. */
  chosenManaValue?: number;
  /** Whether the cards chosen in the last choosing effect included a creature / a noncreature card. */
  chosenTypes?: { creature: boolean; noncreature: boolean };
}

/** One player's choice of cards while a spell or ability resolves. */
export interface CardChoice {
  player: PlayerId;
  /** What happens to the chosen cards: discarded, sacrificed, kept (and the other candidates sacrificed), or put onto the battlefield. */
  purpose: 'discard' | 'sacrifice' | 'keep' | 'battlefield';
  /** The cards to choose from. */
  cards: InstanceId[];
  min: number;
  max: number;
  /** All of `cards` or none (discarding a whole hand). */
  allOrNothing?: boolean;
  /** At most one card of each of these types (Tragic Arrogance). */
  onePerType?: CardType[];
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
  attacks: Attack[];
  /** In declaration order, which is also the damage assignment order for now. */
  blocks: Block[];
  /** Defending players who still have to declare blockers, in turn order. */
  blockersPending: PlayerId[];
}

/** Whose decision the game is waiting on. */
export type Pending =
  | { kind: 'priority'; player: PlayerId; passes: number }
  | { kind: 'declareAttackers'; player: PlayerId }
  | { kind: 'declareBlockers'; player: PlayerId }
  /** Choose targets for the first queued trigger; `then` gets priority once triggers are on the stack. */
  | { kind: 'chooseTargets'; player: PlayerId; then: PlayerId }
  /** Answer "you may" (and pay any cost) for the ability on top of the stack. */
  | { kind: 'decide'; player: PlayerId; item: string }
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
  /** Choose cards while a spell or ability resolves: to discard, to sacrifice, or to keep. */
  | ({ kind: 'chooseCards' } & CardChoice)
  | { kind: 'gameOver' };

export interface GameState {
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
  /** `reveal`: for lands like snarls, reveal a matching card to enter untapped (default: if you can). */
  | { type: 'PlayLand'; player: PlayerId; card: InstanceId; reveal?: boolean }
  /**
   * `mode` for "choose one" spells; `modes` (in printed order) for "choose two"
   * or "choose one or more". `alternative`: pay the card's alternative cost.
   */
  | {
      type: 'CastSpell';
      player: PlayerId;
      card: InstanceId;
      targets?: Target[];
      mode?: number;
      modes?: number[];
      alternative?: boolean;
      /** Cards discarded to pay an additional cost. */
      costCards?: InstanceId[];
    }
  | { type: 'ActivateManaAbility'; player: PlayerId; card: InstanceId; mana: ManaType }
  /** `costCards`: the cards discarded or the permanent sacrificed to pay the cost. */
  | { type: 'ActivateAbility'; player: PlayerId; card: InstanceId; ability: number; targets?: Target[]; costCards?: InstanceId[] }
  | { type: 'PassPriority'; player: PlayerId }
  | { type: 'DeclareAttackers'; player: PlayerId; attacks: Attack[] }
  | { type: 'DeclareBlockers'; player: PlayerId; blocks: Block[] }
  | { type: 'ChooseTargets'; player: PlayerId; targets: Target[] }
  | { type: 'Decide'; player: PlayerId; accept: boolean }
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

export type EliminationReason = 'life' | 'emptyLibrary' | 'conceded' | 'commanderDamage';

export type GameEvent =
  | { type: 'GameStarted'; turnOrder: PlayerId[] }
  | { type: 'LibraryShuffled'; player: PlayerId }
  | { type: 'CardDrawn'; player: PlayerId; card?: InstanceId; defId?: CardDefId }
  | {
      type: 'CardMoved';
      card?: InstanceId;
      defId?: CardDefId;
      owner: PlayerId;
      /** Who controlled it, when it leaves the battlefield. */
      controller?: PlayerId;
      from: ZoneName;
      to: ZoneName;
          /** Leaving the battlefield: the Equipment attached to it at that moment (for look-back triggers). */
      equippedBy?: InstanceId[];
    }
  | { type: 'TokenCreated'; card: InstanceId; defId: CardDefId; controller: PlayerId }
  | { type: 'Discarded'; player: PlayerId; card: InstanceId }
  | { type: 'CardTapped'; card: InstanceId }
  | { type: 'CardsUntapped'; player: PlayerId; cards: InstanceId[] }
  | { type: 'ManaAdded'; player: PlayerId; mana: ManaType; source: InstanceId }
  | { type: 'ManaSpent'; player: PlayerId; amounts: Partial<ManaPool> }
  | { type: 'SpellCast'; player: PlayerId; card: InstanceId; defId: CardDefId; targets: Target[]; manaSpent: number }
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
  | { type: 'CountersAdded'; card: InstanceId; amount: number; by?: PlayerId; counter?: CounterKind }
  | { type: 'CountersRemoved'; card: InstanceId; amount: number; counter: AnyCounter }
  | { type: 'Attached'; equipment: InstanceId; creature: InstanceId | null }
  | { type: 'PriorityPassed'; player: PlayerId }
  | { type: 'AttackDeclared'; attacker: InstanceId; defendingPlayer: PlayerId }
  | { type: 'BlockDeclared'; blocker: InstanceId; attacker: InstanceId }
  | { type: 'DamageDealt'; source: InstanceId; target: Target; amount: number; combat: boolean }
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
