// What one player may see, for sending over the network. The server holds
// the real GameState; each player gets a redacted copy built from an
// allowlist: every field of the game, its players and its cards is
// classified below (TypeScript checks that the classification is complete),
// and only what the player may see is copied in.
//
// Card ids are never sent as they are. Real ids say too much: they're handed
// out in library order after the shuffle, and a card keeps its id through
// every zone. Instead each player has an AliasBook of random aliases:
// - a card the player can see gets an alias, kept while it stays in sight;
// - when it goes where the player can't see it (a library, someone else's
//   hand, face down into exile), the alias is dropped, so if it comes back
//   it gets a new one and can't be linked to what it was;
// - cards the player can't see are anonymous placeholders ("?h0", "?h1"...),
//   numbered afresh in every message, with no definition;
// - any other reference to a hidden card is "?".
// Commanders keep one alias for the whole game: their identity is public.
//
// Known limit: object-change counters (`zoneChanges` and the `...Object`
// numbers that refer to them) are sent as they are. They can show how many
// times a visible card has changed zones (for example that it was in a
// mulliganed hand), but never what a hidden card is.

import { getLegalActions } from './legal.ts';
import { visibleLibraryTop } from './typerules.ts';
import { filterEventsFor, viewFor, type GameView } from './view.ts';
import {
  PUBLIC_ZONES,
  type Action,
  type CardDefinition,
  type CardInstance,
  type GameEvent,
  type GameState,
  type InstanceId,
  type PlayerId,
  type PlayerState,
} from './types.ts';

/** The definition of every card a player can't see. */
export const HIDDEN_CARD: CardDefinition = { id: '?hidden', name: 'Hidden card', types: [] };

/** A reference to a card the player can't see. */
export const HIDDEN_REF = '?';

/** The game as one player may see it: no card definitions (the client has them) and no random number state. */
export type RedactedState = Omit<GameState, 'cardDefs' | 'rngState'>;

/** Everything one message tells one player. */
export interface PlayerUpdate {
  view: GameView;
  state: RedactedState;
  /** The player's legal actions; empty unless the game is waiting on them. */
  legal: Action[];
  /** What happened since the last update, as this player may see it. */
  events: GameEvent[];
}

/** One player's random aliases for the cards they can see. Lives on the server, one per player per game. */
export class AliasBook {
  private readonly toAlias = new Map<InstanceId, string>();
  private readonly toReal = new Map<string, InstanceId>();
  private readonly pinned = new Set<InstanceId>();
  private readonly fresh: () => string;
  /** `fresh` makes a new random alias; online games use crypto randomness. */
  constructor(fresh: () => string) {
    this.fresh = fresh;
  }

  has(id: InstanceId): boolean {
    return this.toAlias.has(id);
  }
  alias(id: InstanceId): string {
    let a = this.toAlias.get(id);
    if (a === undefined) {
      do a = this.fresh();
      while (this.toReal.has(a) || a.startsWith('?'));
      this.toAlias.set(id, a);
      this.toReal.set(a, id);
    }
    return a;
  }
  /** An alias used once and not remembered (a card seen only in passing). */
  transient(): string {
    let a: string;
    do a = this.fresh();
    while (this.toReal.has(a) || a.startsWith('?'));
    return a;
  }
  /** Keeps this card's alias for the whole game (commanders). */
  pin(id: InstanceId): void {
    this.alias(id);
    this.pinned.add(id);
  }
  forget(id: InstanceId): void {
    if (this.pinned.has(id)) return;
    const a = this.toAlias.get(id);
    if (a === undefined) return;
    this.toAlias.delete(id);
    this.toReal.delete(a);
  }
  ids(): InstanceId[] {
    return [...this.toAlias.keys()];
  }
  real(alias: string): InstanceId | undefined {
    return this.toReal.get(alias);
  }
}

/** Every card `viewer` may see right now, with the rules that make it visible. */
export function visibleCards(s: GameState, viewer: PlayerId): Set<InstanceId> {
  const visible = new Set<InstanceId>();
  const top = s.players[viewer] ? visibleLibraryTop(s, viewer) : undefined;
  const p = s.pending;
  // Cards a player is looking at to decide: a surveil or scry, Urianger's look, a choice among cards.
  const looking = new Set<InstanceId>(
    (p.kind === 'surveil' || p.kind === 'exileTop') && p.player === viewer
      ? [p.card]
      : p.kind === 'chooseCards' && p.player === viewer
        ? p.cards
        : p.kind === 'chooseLegend' && p.player === viewer
          ? p.cards
          : [],
  );
  for (const c of Object.values(s.cards)) {
    const faceDown =
      c.zone === 'exile' && ((c.foretoldTurn !== undefined && c.owner !== viewer) || (c.linkedExile !== undefined && !c.linkedExile.lookers.includes(viewer)));
    if (faceDown) continue;
    if (PUBLIC_ZONES.includes(c.zone) || (c.zone === 'hand' && c.owner === viewer) || c.id === top || looking.has(c.id)) visible.add(c.id);
  }
  return visible;
}

// ---------------------------------------------------------------------------
// The allowlist
// ---------------------------------------------------------------------------

/** copy: sent as is. refs: sent with card references rewritten. drop: never sent. */
type Rule = 'copy' | 'refs' | 'drop';

const CARD_FIELDS = {
  id: 'drop', // replaced by the alias
  defId: 'copy',
  owner: 'copy',
  controller: 'copy',
  zone: 'copy',
  tapped: 'copy',
  summoningSick: 'copy',
  damage: 'copy',
  deathtouched: 'copy',
  controlWhile: 'refs',
  copy: 'refs',
  lastDefinition: 'refs',
  printing: 'copy',
  crewed: 'copy',
  enteredTimestamp: 'copy',
  attachedTimestamp: 'copy',
  graveyardArrival: 'copy',
  graveyardCastTurn: 'copy',
  activatedTurns: 'copy',
  zoneChanges: 'copy',
  vowTo: 'copy',
  counters: 'copy',
  namedCounters: 'copy',
  monstrous: 'copy',
  lastCounters: 'copy',
  lastKeywords: 'copy',
  lastEquippedBy: 'refs',
  extraCountersOnEnter: 'copy',
  isToken: 'copy',
  attachedTo: 'refs',
  exiledUntilLeaves: 'refs',
  exiledUntilOpponentMonarch: 'copy',
  playableFromExile: 'refs',
  castFromGraveyard: 'copy',
  lastPower: 'copy',
  countersTurn: 'copy',
  enteredTurn: 'copy',
  foretoldTurn: 'copy',
  linkedExile: 'refs',
  xPaid: 'copy',
  isCommander: 'copy',
  commanderStays: 'copy',
  castPermission: 'copy',
  phasedOut: 'copy',
  blitzed: 'copy',
  sacrificeAtEndStep: 'copy',
  unearthed: 'copy',
  rebounding: 'copy',
  adventureSpell: 'copy',
  adventurer: 'copy',
  adventureGraveyard: 'copy',
} satisfies Record<keyof CardInstance, Rule>;

/** `zone`: a zone list where hidden cards become placeholders. */
const PLAYER_FIELDS = {
  id: 'copy',
  life: 'copy',
  library: 'zone',
  hand: 'zone',
  battlefield: 'refs',
  graveyard: 'refs',
  exile: 'zone',
  command: 'refs',
  commanderCasts: 'refs',
  commanderDamage: 'refs',
  creatureScryMana: 'refs',
  manaPool: 'copy',
  equipmentMana: 'copy',
  landsPlayedThisTurn: 'copy',
  eliminated: 'copy',
  drewFromEmptyLibrary: 'copy',
  friendlyTargetAbilityTurn: 'copy',
  lifeLostThisTurn: 'copy',
  nextCreatureCounters: 'copy',
  counterOnCreatureTurn: 'copy',
  lifeGainedThisTurn: 'copy',
  cardLeftGraveyardTurn: 'copy',
  noncreatureSpellsThisTurn: 'copy',
  spellsCastThisTurn: 'copy',
  lostToEffect: 'copy',
  attackTaxes: 'copy',
  preventDamageTurn: 'copy',
  cardsDrawnThisTurn: 'copy',
  conceded: 'copy',
  phasedOut: 'refs',
} satisfies Record<keyof PlayerState, Rule | 'zone'>;

/** `cards` and `players` are built separately; `empty` sends an empty list. */
const GAME_FIELDS = {
  cardDefs: 'drop',
  rngState: 'drop',
  cards: 'special',
  players: 'special',
  // "card#ability" keys: only the engine needs them.
  triggeredThisTurn: 'empty',
  castGroups: 'refs',
  monarch: 'copy',
  effectTimestamp: 'copy',
  cleanupCheck: 'copy',
  cleanupNeedsPriority: 'copy',
  combatDamageHistory: 'refs',
  format: 'copy',
  turnOrder: 'copy',
  activePlayer: 'copy',
  turnNumber: 'copy',
  step: 'copy',
  stack: 'refs',
  resolving: 'refs',
  triggersHeld: 'copy',
  triggerQueue: 'refs',
  delayedTriggers: 'refs',
  temporaryEffects: 'refs',
  creaturesDiedThisTurn: 'copy',
  combatsThisTurn: 'copy',
  extraCombats: 'copy',
  combat: 'refs',
  pending: 'refs',
  winner: 'copy',
  nextId: 'copy',
} satisfies Record<keyof GameState, Rule | 'special' | 'empty'>;

/**
 * Copies a JSON value, rewriting card references: every string that is a
 * card id, and every object key that is one. `map` returns the replacement,
 * or null for a hidden card (a value becomes "?", a key is left out).
 */
function rewrite(value: unknown, isCard: (s: string) => boolean, map: (id: InstanceId) => string | null): unknown {
  if (typeof value === 'string') return isCard(value) ? (map(value) ?? HIDDEN_REF) : value;
  if (Array.isArray(value)) return value.map((v) => rewrite(v, isCard, map));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      let key = k;
      if (isCard(k)) {
        const mapped = map(k);
        if (mapped === null) continue;
        key = mapped;
      }
      out[key] = rewrite(v, isCard, map);
    }
    return out;
  }
  return value;
}

/** Brings a player's aliases up to date: drops cards that went out of sight, adds cards that came into it. */
function reconcile(s: GameState, viewer: PlayerId, book: AliasBook, visible: Set<InstanceId>): void {
  for (const c of Object.values(s.cards)) if (c.isCommander) book.pin(c.id);
  for (const id of book.ids()) if (!visible.has(id)) book.forget(id);
  for (const id of visible) book.alias(id);
}

/** Whether this (filtered) event put a card where `viewer` can no longer see it. */
function hidesCard(e: GameEvent, viewer: PlayerId): InstanceId | undefined {
  if (e.type === 'CardMoved' && e.card && (e.to === 'library' || (e.to === 'hand' && e.owner !== viewer))) return e.card;
  if (e.type === 'Foretold' && e.player !== viewer) return e.card;
  return undefined;
}

/** The redacted game state for `viewer`. Call after the events have been rewritten (see playerUpdate). */
export function redactState(s: GameState, viewer: PlayerId, book: AliasBook, visible = visibleCards(s, viewer)): RedactedState {
  reconcile(s, viewer, book, visible);
  const isCard = (x: string) => Object.hasOwn(s.cards, x);
  const ref = (id: InstanceId) => (visible.has(id) || book.has(id) ? book.alias(id) : null);
  const refs = <T>(v: T): T => rewrite(v, isCard, ref) as T;

  const cards: Record<InstanceId, CardInstance> = {};
  for (const id of visible) {
    const c = s.cards[id]!;
    const out: Record<string, unknown> = {};
    for (const [key, rule] of Object.entries(CARD_FIELDS) as [keyof CardInstance, Rule][]) {
      const v = c[key];
      if (rule === 'drop' || v === undefined) continue;
      out[key] = rule === 'copy' ? structuredClone(v) : refs(v);
    }
    out.id = book.alias(id);
    cards[out.id as string] = out as unknown as CardInstance;
  }

  // Hidden cards in zone lists: anonymous placeholders, numbered afresh in each message.
  let hidden = 0;
  const zone = (list: InstanceId[], owner: PlayerId, zoneName: CardInstance['zone']): InstanceId[] =>
    list.map((id) => {
      if (visible.has(id)) return book.alias(id);
      const placeholder = `?h${hidden++}`;
      cards[placeholder] = { id: placeholder, defId: HIDDEN_CARD.id, owner, controller: owner, zone: zoneName, tapped: false, summoningSick: false, damage: 0, deathtouched: false };
      return placeholder;
    });

  const players: Record<PlayerId, PlayerState> = {};
  for (const pid of s.turnOrder) {
    const p = s.players[pid]!;
    const out: Record<string, unknown> = {};
    for (const [key, rule] of Object.entries(PLAYER_FIELDS) as [keyof PlayerState, Rule | 'zone'][]) {
      const v = p[key];
      if (rule === 'drop' || v === undefined) continue;
      out[key] = rule === 'zone' ? zone(v as InstanceId[], pid, key as CardInstance['zone']) : rule === 'copy' ? structuredClone(v) : refs(v);
    }
    players[pid] = out as unknown as PlayerState;
  }

  const state: Record<string, unknown> = {};
  for (const [key, rule] of Object.entries(GAME_FIELDS) as [keyof GameState, Rule | 'special' | 'empty'][]) {
    const v = s[key];
    if (rule === 'drop' || rule === 'special' || v === undefined) continue;
    state[key] = rule === 'empty' ? [] : rule === 'copy' ? structuredClone(v) : refs(v);
  }
  state.cards = cards;
  state.players = players;
  return state as unknown as RedactedState;
}

/** A redacted state as a GameState the engine's read-only helpers (and viewFor) can use. Never has real hidden cards. */
export function materialize(r: RedactedState, cardDefs: GameState['cardDefs']): GameState {
  return { ...structuredClone(r), cardDefs: { ...cardDefs, [HIDDEN_CARD.id]: HIDDEN_CARD }, rngState: [0, 0, 0, 0] };
}

/**
 * One message for `viewer`: the events since the last update (rewritten in
 * order, so a card keeps its old alias in the event that hides it), then the
 * redacted state, the view built from it, and the player's legal actions.
 */
export function playerUpdate(s: GameState, viewer: PlayerId, book: AliasBook, events: readonly GameEvent[] = []): PlayerUpdate {
  const visible = visibleCards(s, viewer);
  const isCard = (x: string) => Object.hasOwn(s.cards, x);
  const rewritten = filterEventsFor(events, viewer).map((e) => {
    const out = rewrite(e, isCard, (id) => (book.has(id) || visible.has(id) ? book.alias(id) : book.transient())) as GameEvent;
    const gone = hidesCard(e, viewer);
    if (gone) book.forget(gone);
    return out;
  });
  const state = redactState(s, viewer, book, visible);
  const view = viewFor(materialize(state, s.cardDefs), viewer);
  const legal =
    'player' in s.pending && s.pending.player === viewer
      ? getLegalActions(s).map((a) => rewrite(a, isCard, (id) => (visible.has(id) ? book.alias(id) : null)) as Action)
      : [];
  return { view, state, legal, events: rewritten };
}

/** Turns a player's action back into real card ids. Unknown aliases are left as they are, and the engine rejects them. */
export function resolveAction(action: Action, book: AliasBook): Action {
  const back = (v: unknown): unknown => {
    if (typeof v === 'string') return book.real(v) ?? v;
    if (Array.isArray(v)) return v.map(back);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, back(x)]));
    return v;
  };
  return back(action) as Action;
}
