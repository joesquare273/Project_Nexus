// The connection to an online draft event, kept outside the page so it
// survives switching to the game board and back: an event runs through the
// draft, deckbuilding and several games on one connection.
//
// Game updates go to the game being played (its OnlineSession); an update
// for a game nobody is playing yet (the next game of a match, or after
// coming back to the page) waits in `pendingGame` until the page starts it.

import type { ClientMessage, EventView, ServerMessage } from '@nexus/server/protocol';
import { accessToken } from '../account/AccountBar.tsx';
import { OnlineConnection, OnlineSession, type GameLink } from '../game/online.ts';

type Update = Extract<ServerMessage, { type: 'update' }>;

const LAST_EVENT = 'nexus:lastEvent';
export function rememberedEvent(): string | null {
  try {
    return sessionStorage.getItem(LAST_EVENT);
  } catch {
    return null;
  }
}
function remember(code: string | null): void {
  try {
    if (code) sessionStorage.setItem(LAST_EVENT, code);
    else sessionStorage.removeItem(LAST_EVENT);
  } catch {
    // Rejoining by code still works.
  }
}

const gameKey = (m: Update) => `${m.match ?? ''}:${m.game ?? 0}`;

class EventLink {
  private conn: OnlineConnection | null = null;
  view: EventView | null = null;
  /** Your clock minus the server's (for the pick and deckbuilding timers). */
  offset = 0;
  error: string | null = null;
  connecting = false;
  pendingGame: Update | null = null;
  private sessionKey: string | null = null;
  private sessionListener: ((m: ServerMessage) => void) | null = null;
  private readonly subscribers = new Set<() => void>();

  subscribe(fn: () => void): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  private notify(): void {
    for (const fn of this.subscribers) fn();
  }

  get active(): boolean {
    return !!this.conn;
  }

  /** Opens the connection with a create or join message (signed in). */
  async open(first: (token: string) => ClientMessage): Promise<void> {
    this.error = null;
    const token = await accessToken();
    if (!token) {
      this.error = 'Your sign-in has expired. Sign in with Discord again.';
      return this.notify();
    }
    this.close();
    const c = new OnlineConnection();
    this.conn = c;
    this.connecting = true;
    this.notify();
    c.onClose = () => {
      if (this.conn !== c) return;
      this.reset('Lost the connection to the game server. Rejoin with the event code.');
    };
    c.listen((m) => this.receive(m));
    c.send(first(token));
  }

  private receive(m: ServerMessage): void {
    if (m.type === 'event') {
      this.connecting = false;
      this.view = m.event;
      this.offset = Date.now() - m.event.serverNow;
      remember(m.event.code);
    } else if (m.type === 'update') {
      if (this.sessionListener && this.sessionKey === gameKey(m)) return this.sessionListener(m);
      this.pendingGame = m;
    } else if (m.type === 'error') {
      if (this.sessionListener && m.seq !== undefined) return this.sessionListener(m);
      if (!this.view) {
        if (m.code === 'no-event') remember(null);
        return this.reset(m.message);
      }
      this.error = m.message;
    }
    this.notify();
  }

  send(m: ClientMessage): void {
    this.error = null;
    this.conn?.send(m);
    this.notify();
  }

  /** The waiting game as a session on the board; its moves go through this connection. */
  takeGame(): OnlineSession | null {
    const first = this.pendingGame;
    if (!first || !this.conn) return null;
    this.pendingGame = null;
    const link: GameLink = {
      send: (m) => this.conn?.send(m),
      listen: (l) => {
        this.sessionListener = l;
      },
      // Leaving the board leaves the event connection open.
      close: () => {
        this.sessionListener = null;
        this.sessionKey = null;
      },
      onClose: () => {},
    };
    this.sessionKey = gameKey(first);
    return new OnlineSession(link, first, 'RW', 'limited');
  }

  /** Leave the event page for good (the server keeps your seat once the draft has started). */
  leave(): void {
    if (this.view?.phase === 'lobby') this.conn?.send({ type: 'eventLeave' });
    remember(null);
    this.reset(null);
  }

  private reset(error: string | null): void {
    this.close();
    this.view = null;
    this.pendingGame = null;
    this.connecting = false;
    this.error = error;
    this.notify();
  }

  private close(): void {
    const c = this.conn;
    this.conn = null;
    this.sessionListener = null;
    this.sessionKey = null;
    c?.close();
  }
}

/** The one event connection for this tab. */
export const eventLink = new EventLink();
