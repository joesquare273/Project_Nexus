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
export type ManaCost = { generic: number } & Partial<Record<ManaType, number>>;

export const CARD_TYPES = ['land', 'creature', 'artifact', 'enchantment', 'instant', 'sorcery'] as const;
export type CardType = (typeof CARD_TYPES)[number];

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
] as const;
export type Keyword = (typeof KEYWORDS)[number];

// ---------------------------------------------------------------------------
// Card data (PRD 10)
// ---------------------------------------------------------------------------

export const TARGET_KINDS = [
  'AnyTarget',
  'EachOpponent',
  'EachPlayer',
  'OpponentCreature',
  'TargetCreature',
  'TargetPlayer',
  'You',
] as const;
export type TargetKind = (typeof TARGET_KINDS)[number];

/** Target kinds the caster picks when casting. The rest are computed. */
export const CHOSEN_TARGET_KINDS: readonly TargetKind[] = ['AnyTarget', 'OpponentCreature', 'TargetCreature', 'TargetPlayer'];

export const EFFECT_KINDS = ['DealDamage', 'DrawCards', 'GainLife', 'Destroy'] as const;
export type EffectKind = (typeof EFFECT_KINDS)[number];

export interface EffectSpec {
  effect: EffectKind;
  amount?: number;
  target: TargetKind;
}

/** Immutable, shared definition of a card. */
export interface CardDefinition {
  id: CardDefId;
  name: string;
  /** Mana cost in standard notation, e.g. "{2}{R}{W}". Absent for lands. */
  manaCost?: string;
  types: CardType[];
  supertypes?: Supertype[];
  subtypes?: string[];
  power?: number;
  toughness?: number;
  keywords?: Keyword[];
  /** Lands: tap for one mana of any of these types. */
  produces?: ManaType[];
  entersTapped?: boolean;
  /** Effects applied, in order, when an instant or sorcery resolves. */
  effects?: EffectSpec[];
  /** Short rules summary for placeholder cards. Real card text comes from Scryfall at build time. */
  text?: string;
  /** Scryfall set code and collector number, for real cards. */
  printing?: { set: string; number: string };
}

// ---------------------------------------------------------------------------
// Game state (PRD 7)
// ---------------------------------------------------------------------------

export type ZoneName = 'library' | 'hand' | 'battlefield' | 'graveyard' | 'exile' | 'stack';

/** Zones whose contents every player may see. */
export const PUBLIC_ZONES: readonly ZoneName[] = ['battlefield', 'graveyard', 'exile', 'stack'];

/** A unique physical card in a game. */
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
  manaPool: ManaPool;
  landsPlayedThisTurn: number;
  eliminated: boolean;
  drewFromEmptyLibrary: boolean;
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

export type Target = { kind: 'player'; player: PlayerId } | { kind: 'card'; card: InstanceId };

export interface StackItem {
  id: string;
  kind: 'spell';
  card: InstanceId;
  controller: PlayerId;
  /** One target per effect that requires a choice, in effect order. */
  targets: Target[];
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
  | { type: 'PlayLand'; player: PlayerId; card: InstanceId }
  | { type: 'CastSpell'; player: PlayerId; card: InstanceId; targets?: Target[] }
  | { type: 'ActivateManaAbility'; player: PlayerId; card: InstanceId; mana: ManaType }
  | { type: 'PassPriority'; player: PlayerId }
  | { type: 'DeclareAttackers'; player: PlayerId; attacks: Attack[] }
  | { type: 'DeclareBlockers'; player: PlayerId; blocks: Block[] }
  | { type: 'Concede'; player: PlayerId };

// ---------------------------------------------------------------------------
// Events (immutable facts, PRD 9)
// ---------------------------------------------------------------------------

export type EliminationReason = 'life' | 'emptyLibrary' | 'conceded';

export type GameEvent =
  | { type: 'GameStarted'; turnOrder: PlayerId[] }
  | { type: 'LibraryShuffled'; player: PlayerId }
  | { type: 'CardDrawn'; player: PlayerId; card?: InstanceId; defId?: CardDefId }
  | {
      type: 'CardMoved';
      card?: InstanceId;
      defId?: CardDefId;
      owner: PlayerId;
      from: ZoneName;
      to: ZoneName;
    }
  | { type: 'CardTapped'; card: InstanceId }
  | { type: 'CardsUntapped'; player: PlayerId; cards: InstanceId[] }
  | { type: 'ManaAdded'; player: PlayerId; mana: ManaType; source: InstanceId }
  | { type: 'ManaSpent'; player: PlayerId; amounts: Partial<ManaPool> }
  | { type: 'SpellCast'; player: PlayerId; card: InstanceId; defId: CardDefId; targets: Target[] }
  | { type: 'StackItemAdded'; item: string; card: InstanceId }
  | { type: 'StackItemResolved'; item: string; card: InstanceId; fizzled: boolean }
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
