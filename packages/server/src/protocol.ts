// The messages between the browser and the game server, shared by both. The
// server checks every incoming message against these zod schemas before
// looking at it; anything else gets an `error` message back.

import { z } from 'zod';
import type { PlayerUpdate } from '@nexus/engine';
import { DRAFT_SET_CODES } from '@nexus/cards/draftSets';

/** The two Starter Kit decks. */
export const DECKS = ['RW', 'UB'] as const;
export type Deck = (typeof DECKS)[number];

/** A room code: 3-12 letters or digits (not case-sensitive). */
export const RoomCode = z
  .string()
  .regex(/^[A-Za-z0-9]{3,12}$/, 'Use 3-12 letters or digits.')
  .transform((c) => c.toUpperCase());

/** An engine Action, checked for shape here and for legality by the engine. */
export const ActionPayload = z.looseObject({
  type: z.string().min(1).max(40),
  player: z.string().min(1).max(40),
});

/** A Limited deck: drafted cards by their draft id, plus basic lands by color. */
const LimitedDeckPayload = z.strictObject({
  cards: z.array(z.string().min(1).max(20)).max(84),
  basics: z.strictObject({ W: z.number().int().min(0).max(60), U: z.number().int().min(0).max(60), B: z.number().int().min(0).max(60), R: z.number().int().min(0).max(60), G: z.number().int().min(0).max(60) }),
});

export const ClientMessage = z.discriminatedUnion('type', [
  /**
   * Draft events (docs/sealed.md, S3): the host makes one with `players`
   * seats for players (the host included) and `bots` seats for bots, 2-4 in
   * all, and the set to draft (prizes may depend on it).
   */
  z.strictObject({ type: z.literal('eventCreate'), token: z.string().min(1).max(8192), players: z.number().int().min(1).max(4), bots: z.number().int().min(0).max(3), set: z.enum(DRAFT_SET_CODES) }),
  /** The host changes the seats or the set before the draft starts. */
  z.strictObject({ type: z.literal('eventSettings'), players: z.number().int().min(1).max(4), bots: z.number().int().min(0).max(3), set: z.enum(DRAFT_SET_CODES).optional() }),
  /** Join an event by its code, or come back to one you're in (after a reload or a lost connection). */
  z.strictObject({ type: z.literal('eventJoin'), token: z.string().min(1).max(8192), code: RoomCode }),
  /** The event's creator starts the draft. */
  z.strictObject({ type: z.literal('eventStart') }),
  /** Select a card (not yet locked in): if the 30 seconds run out, it's the one you get. */
  z.strictObject({ type: z.literal('eventSelect'), uid: z.string().min(1).max(20) }),
  /** Lock in a card from the pack in front of you. */
  z.strictObject({ type: z.literal('eventPick'), uid: z.string().min(1).max(20) }),
  /** Save your deck (any size while building; a legal deck between games). */
  z.strictObject({ type: z.literal('eventDeck'), deck: LimitedDeckPayload }),
  z.strictObject({ type: z.literal('eventReady'), ready: z.boolean() }),
  /** After losing a game: play first (true) or draw (false) in the next. */
  z.strictObject({ type: z.literal('eventPlayDraw'), play: z.boolean() }),
  /** Leave an event that hasn't started. */
  z.strictObject({ type: z.literal('eventLeave') }),
  /** Commander tables (tables.ts): the host makes one with seats for players and for bots, 2-4 in all. */
  z.strictObject({ type: z.literal('tableCreate'), token: z.string().min(1).max(8192), players: z.number().int().min(1).max(4), bots: z.number().int().min(0).max(3) }),
  /** Join a table by its code, or come back to your seat at it. */
  z.strictObject({ type: z.literal('tableJoin'), token: z.string().min(1).max(8192), code: RoomCode }),
  z.strictObject({ type: z.literal('tableSettings'), players: z.number().int().min(1).max(4), bots: z.number().int().min(0).max(3) }),
  /** Play one of your saved Commander decks (its id). */
  z.strictObject({ type: z.literal('tableDeck'), deck: z.string().min(1).max(64) }),
  /** The host starts the game. */
  z.strictObject({ type: z.literal('tableStart') }),
  z.strictObject({ type: z.literal('tableLeave') }),
  /** Players join with their Discord sign-in (a Supabase access token); the server takes their name from it. No guests. */
  z.strictObject({ type: z.literal('join'), token: z.string().min(1).max(8192), room: RoomCode }),
  z.strictObject({ type: z.literal('pickDeck'), deck: z.enum(DECKS) }),
  z.strictObject({
    type: z.literal('actions'),
    /** Increases with every batch this client sends; a repeat is a duplicate. */
    seq: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    /** The game version the actions were chosen against; an older one is stale. */
    version: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    /**
     * Applied in order, all or nothing, as one change ("tap these lands, then
     * cast this"): if any is illegal, none is applied.
     */
    actions: z.array(ActionPayload).min(1).max(64),
  }),
]);
export type ClientMessage = z.input<typeof ClientMessage>;

/** Seats are the engine's player ids (P3 and P4 only at Commander tables). */
export type Seat = 'P1' | 'P2' | 'P3' | 'P4';

export interface LobbyPlayer {
  seat: Seat;
  name: string;
  deck: Deck | null;
  connected: boolean;
}

export type ErrorCode =
  | 'bad-json'
  | 'bad-message'
  | 'not-joined'
  | 'already-joined'
  | 'room-full'
  | 'not-signed-in'
  | 'same-player'
  | 'already-started'
  | 'not-started'
  | 'game-over'
  | 'duplicate'
  | 'stale'
  | 'not-your-decision'
  | 'wrong-player'
  | 'illegal'
  | 'no-event'
  | 'event-full'
  | 'event-rule';

export type ServerMessage =
  | { type: 'joined'; room: string; seat: Seat; name: string }
  | { type: 'lobby'; room: string; players: LobbyPlayer[] }
  /**
   * The game as this player may see it, after every change. `ackSeq`: the last
   * of your batches that was applied. `match`: the draft event match it
   * belongs to, for event games (seats are P1/P2 in every game).
   */
  | { type: 'update'; version: number; seat: Seat; names: Partial<Record<Seat, string>>; ackSeq: number; update: PlayerUpdate; match?: string; game?: number }
  /** A draft event as this player may see it, after every change. */
  | { type: 'event'; event: EventView }
  /** A Commander table as this player may see it, after every change. */
  | { type: 'table'; table: TableView }
  /** The table was closed (its host left the lobby, or it finished long ago). */
  | { type: 'tableClosed'; code: string }
  | { type: 'error'; code: ErrorCode; message: string; seq?: number }
  | { type: 'opponentLeft'; seat: Seat; name: string };

/** A Commander table: its seats (players and bots), each player's chosen deck, and the game's phase. */
export interface TableView {
  code: string;
  format: 'commander';
  /** Seats for players (the host included) and for bots. */
  players: number;
  bots: number;
  host: Seat;
  you: Seat;
  phase: 'lobby' | 'playing' | 'finished';
  seats: { id: Seat; name: string; bot: boolean; connected: boolean; deck: { name: string; commander: string | null } | null }[];
  /** Who won, once the game is over (null: a draw, or not over). */
  winner: Seat | null;
}

/** One seat of an event, as everyone sees it. */
export interface EventSeatView {
  id: string;
  name: string;
  bot: boolean;
  connected: boolean;
  ready: boolean;
  picks: number;
}

export interface EventMatchView {
  id: string;
  round: number;
  a: string;
  b: string | null;
  games: { winner: string | null; first: string }[];
  /** Who chooses play or draw for the next game, while waiting on that choice. */
  chooser: string | null;
  nextFirst: string | null;
  done: boolean;
  /** A game of this match is being played now. */
  live: boolean;
}

/** A draft event as one player may see it: their own pack, picks and deck, and everyone's progress and results. */
export interface EventView {
  code: string;
  size: number;
  /** Seats for players (the host included) and for bots, set by the host. */
  players: number;
  bots: number;
  /** The set being drafted. */
  set: { code: string; name: string };
  phase: 'lobby' | 'drafting' | 'building' | 'playing' | 'finished';
  /** Your seat. */
  you: string;
  /** The seat that made the event (it starts the draft). */
  host: string;
  seats: EventSeatView[];
  /** Your view of the draft (your pack and picks), while it runs and after. */
  draft: import('@nexus/cards/draft').DraftView | null;
  /** Your saved deck. */
  deck: import('@nexus/cards/limited').LimitedDeck | null;
  /** When deckbuilding ends, and the server's clock now (ms since the epoch). */
  buildEndsAt: number | null;
  /** When this pick's 30 seconds are up (while you still have to choose). */
  pickEndsAt: number | null;
  /** The card you selected but haven't confirmed. */
  selected: string | null;
  serverNow: number;
  rounds: number;
  round: number;
  matches: EventMatchView[];
  standings: { player: string; points: number; wins: number; losses: number; draws: number }[];
  /** Your drafted cards were added to your collection. */
  poolSaved: boolean;
}
