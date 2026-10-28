// The messages between the browser and the game server, shared by both. The
// server checks every incoming message against these zod schemas before
// looking at it; anything else gets an `error` message back.

import { z } from 'zod';
import type { PlayerUpdate } from '@nexus/engine';

/** The two Starter Kit decks. */
export const DECKS = ['RW', 'UB'] as const;
export type Deck = (typeof DECKS)[number];

/** A guest name: 1-16 letters, digits or spaces, not starting or ending with a space. "You" is reserved for the board. */
export const GuestName = z
  .string()
  .regex(/^[A-Za-z0-9](?:[A-Za-z0-9 ]{0,14}[A-Za-z0-9])?$/, 'Use 1-16 letters, digits or spaces.')
  .refine((n) => n.toLowerCase() !== 'you', 'That name is reserved.');

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

export const ClientMessage = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('join'), name: GuestName, room: RoomCode }),
  z.strictObject({ type: z.literal('pickDeck'), deck: z.enum(DECKS) }),
  z.strictObject({
    type: z.literal('action'),
    /** Increases with every action this client sends; a repeat is a duplicate. */
    seq: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    /** The game version the action was chosen against; an older one is stale. */
    version: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    action: ActionPayload,
  }),
]);
export type ClientMessage = z.input<typeof ClientMessage>;

/** Seats are the engine's player ids. */
export type Seat = 'P1' | 'P2';

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
  | 'name-taken'
  | 'already-started'
  | 'not-started'
  | 'game-over'
  | 'duplicate'
  | 'stale'
  | 'not-your-decision'
  | 'wrong-player'
  | 'illegal';

export type ServerMessage =
  | { type: 'joined'; room: string; seat: Seat; name: string }
  | { type: 'lobby'; room: string; players: LobbyPlayer[] }
  /** The game as this player may see it, after every change. `ackSeq`: the last of your actions that was applied. */
  | { type: 'update'; version: number; seat: Seat; names: Record<Seat, string>; ackSeq: number; update: PlayerUpdate }
  | { type: 'error'; code: ErrorCode; message: string; seq?: number }
  | { type: 'opponentLeft'; seat: Seat; name: string };
