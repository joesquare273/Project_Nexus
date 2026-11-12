// Online games: the same board, fed by the game server instead of a local
// engine. The server sends this player's redacted state, legal actions and
// events (engine/src/redact.ts); the board reads them exactly as it reads a
// local game. Moves go back as all-or-nothing batches of actions.
//
// The board calls you "You". The server calls players by seat (P1-P4), so
// incoming data renames your seat to "You" and the other seats to their
// players' names, and outgoing actions rename them back, only in player
// fields. The same session plays Starter Kit duels and Commander tables.

import { getLegalActions, HIDDEN_CARD, materialize, type Action } from '@nexus/engine';
import { CARD_DEFS } from '@nexus/cards';
import type { ClientMessage, Deck, Seat, ServerMessage } from '@nexus/server/protocol';
import { GameSession, YOU, applyAll, readable, touchedCards, type Advance } from './session.ts';
import { eventTargetNotices } from './targeting.ts';
import { setPlayerAvatars } from './avatars.ts';

type Update = Extract<ServerMessage, { type: 'update' }>;

/** The connection dropped and is trying again, or it's back (and has rejoined your seat). */
export type ConnectionStatus = 'dropped' | 'reconnected';

/** What a game session talks through: the WebSocket itself, or a draft event's link to it (shared between games). */
export interface GameLink {
  send(m: ClientMessage): void;
  listen(listener: (m: ServerMessage) => void): void;
  close(): void;
  /** Called once if the connection is lost for good (reconnecting failed or isn't possible). */
  onClose: () => void;
  /** Called when the connection drops and when it comes back. */
  onStatus?: (status: ConnectionStatus) => void;
  /** Drop the socket and reconnect (and rejoin) now: the game didn't arrive after a reconnection. */
  retry?: () => void;
}

const LOG_KEY = 'nexus:connectionLog';

/** Entries older than this are deleted (user, 2026-11-06). */
const LOG_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The browser's side of the connection log (the server keeps its own in
 * logs/server.log): the last 100 entries from the last 30 days are kept in
 * this browser (localStorage) and printed to the console.
 * `nexusConnectionLog()` in the browser console shows them.
 */
export function connectionLog(event: string, details: Record<string, unknown> = {}): void {
  const entry = { at: new Date().toISOString(), event, ...details };
  console.info('[connection]', entry);
  try {
    const cutoff = Date.now() - LOG_RETENTION_MS;
    const list = (JSON.parse(localStorage.getItem(LOG_KEY) ?? '[]') as { at?: string }[]).filter((e) => Date.parse(e.at ?? '') >= cutoff);
    list.push(entry);
    localStorage.setItem(LOG_KEY, JSON.stringify(list.slice(-100)));
  } catch {
    // The log is a convenience; play goes on without it.
  }
}

/** The saved connection log, oldest first. */
export function savedConnectionLog(): unknown[] {
  try {
    return JSON.parse(localStorage.getItem(LOG_KEY) ?? '[]') as unknown[];
  } catch {
    return [];
  }
}

if (typeof window !== 'undefined') (window as unknown as { nexusConnectionLog: () => unknown[] }).nexusConnectionLog = savedConnectionLog;

/** Waits before each reconnection attempt, in milliseconds (about 80 seconds in all). */
const RETRY_DELAYS = [300, 1000, 2000, 4000, 8000, 15000, 20000, 30000];

/**
 * The WebSocket to the game server, at /ws on the page's own host (Vite
 * forwards it in development). If it drops while `rejoin` is set (you're
 * seated at a table or in a draft event), it reconnects on its own: it opens
 * a new socket, sends the rejoin message first (the server puts you back in
 * your seat and sends the game again), then anything queued meanwhile except
 * game moves (they were for the game as it was; the board asks again).
 */
export class OnlineConnection implements GameLink {
  private ws!: WebSocket;
  private listener: (m: ServerMessage) => void = () => {};
  /** Called once if the connection is lost for good. */
  onClose: () => void = () => {};
  onStatus: (status: ConnectionStatus) => void = () => {};
  private queue: ClientMessage[] = [];
  private rejoin: (() => Promise<ClientMessage | null>) | null = null;
  private closed = false;
  private attempt = 0;
  private reconnecting = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly url: string;
  private readonly onOnline = () => {
    // The network is back: try now rather than waiting out the delay.
    if (this.reconnecting && this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
      this.open();
    }
  };

  constructor(url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`) {
    this.url = url;
    if (typeof window !== 'undefined') window.addEventListener('online', this.onOnline);
    this.open();
  }

  /** Reconnects now (closing the current socket, which then reconnects and rejoins like any drop). */
  retry(): void {
    if (this.closed) return;
    connectionLog('retry', { attempt: this.attempt });
    // The old socket is dropped quietly (its close mustn't start a second reconnection).
    const old = this.ws;
    old.onclose = null;
    old.onmessage = null;
    old.onopen = null;
    try {
      old.close();
    } catch {
      // Already closing.
    }
    this.dropped(4000, 'retry');
  }

  /** How to get your seat back after a drop (a fresh sign-in token and the table or event code). */
  setRejoin(rejoin: (() => Promise<ClientMessage | null>) | null): void {
    this.rejoin = rejoin;
  }

  private open(): void {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => void this.opened(ws);
    ws.onmessage = (e) => {
      try {
        this.listener(JSON.parse(String(e.data)) as ServerMessage);
      } catch {
        // A message we can't read is ignored.
      }
    };
    ws.onclose = (e) => {
      if (this.ws !== ws || this.closed) return;
      this.dropped(e.code, e.reason);
    };
  }

  private async opened(ws: WebSocket): Promise<void> {
    if (this.reconnecting) {
      const message = this.rejoin ? await this.rejoin().catch(() => null) : null;
      if (this.ws !== ws || this.closed) return;
      if (!message) {
        connectionLog('rejoin-impossible', { attempt: this.attempt });
        return this.giveUp();
      }
      ws.send(JSON.stringify(message));
      // Moves made for the game as it was are dropped; the board asks again once the game arrives.
      this.queue = this.queue.filter((m) => m.type !== 'actions');
      connectionLog('reconnected', { attempt: this.attempt, rejoin: message.type });
      this.reconnecting = false;
      this.attempt = 0;
      this.onStatus('reconnected');
    } else connectionLog('connected');
    for (const m of this.queue.splice(0)) ws.send(JSON.stringify(m));
  }

  private dropped(code: number, reason: string): void {
    connectionLog('dropped', { code, reason, reconnecting: !!this.rejoin, attempt: this.attempt });
    if (!this.rejoin || this.attempt >= RETRY_DELAYS.length) return this.giveUp();
    if (!this.reconnecting) {
      this.reconnecting = true;
      this.onStatus('dropped');
    }
    const delay = RETRY_DELAYS[this.attempt++]!;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (!this.closed) this.open();
    }, delay);
  }

  private giveUp(): void {
    connectionLog('gave-up', { attempts: this.attempt });
    this.shutDown();
    this.onClose();
  }

  private shutDown(): void {
    this.closed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (typeof window !== 'undefined') window.removeEventListener('online', this.onOnline);
  }

  /** Who hears the server's messages (the menu, then the game). */
  listen(listener: (m: ServerMessage) => void): void {
    this.listener = listener;
  }

  send(m: ClientMessage): void {
    if (this.ws.readyState === WebSocket.OPEN && !this.reconnecting) this.ws.send(JSON.stringify(m));
    else this.queue.push(m);
  }

  close(): void {
    this.onClose = () => {};
    this.shutDown();
    this.ws.close();
  }
}

/** Fields of an Action that hold player ids. */
const PLAYER_FIELDS = new Set(['player', 'opponent', 'defender']);

export class OnlineSession extends GameSession {
  readonly seat: Seat;
  /** Each seat's name on the board ("You" for yours). */
  private readonly toName: Map<string, string>;
  /** And back: a name on the board to its seat. */
  private readonly toSeat: Map<string, string>;
  /** The game version the server last sent. */
  private version: number;
  private serverLegal: Action[];
  private seq = 0;
  /** A batch is on its way and hasn't been answered yet. */
  private waiting = false;
  /** The connection dropped and is reconnecting: moves wait until the game arrives again. */
  private offline = false;
  /** Just reconnected: the next update is the game as it is now, whatever happened to the last move. */
  private resyncing = false;
  /** Waits for the game after a reconnection; tries again if it doesn't come. */
  private resyncTimer: ReturnType<typeof setTimeout> | null = null;
  private resyncTries = 0;
  /** The server wouldn't take us back (the table is gone, the sign-in is no good): why, shown instead of "Reconnecting". */
  private lost: string | null = null;
  /**
   * Mana abilities you activated while paying for a spell or ability by hand
   * (holdPriority): applied to this board's copy of the game at once, and sent
   * to the server together with what they pay for, as one batch. Sent on their
   * own if you stop paying instead.
   */
  private heldTaps: Action[] = [];
  private readonly listeners = new Set<(error?: string) => void>();
  private readonly connection: GameLink;

  /** Tables and draft games pay on the server; a Starter Kit duel doesn't. */
  override get earnsRewards(): boolean {
    return this.options.format !== 'starter';
  }

  constructor(connection: GameLink, first: Update, deck: Deck = 'RW', format: 'starter' | 'constructed' | 'commander' | 'limited' = 'starter', coaching = false) {
    const seat = first.seat;
    // The other seats in turn order after yours, as the board lists opponents.
    const order = first.update.state.turnOrder as string[];
    const at = Math.max(0, order.indexOf(seat));
    const others = [...order.slice(at + 1), ...order.slice(0, at)];
    const toName = new Map<string, string>([[seat, YOU], ...others.map((x): [string, string] => [x, first.names[x as Seat] ?? x])]);
    const update = renameIncoming(first.update, toName);
    super({ format, deck, opponents: others.length, seed: 0, bot: 'ai', ...(coaching ? { coaching: true } : {}) }, { state: materialize(update.state, CARD_DEFS), bots: {}, opponents: others.map((x) => toName.get(x)!) });
    this.seat = seat;
    this.toName = toName;
    this.toSeat = new Map([...toName].map(([k, v]) => [v, k]));
    // Discord profile pictures for the player icons.
    setPlayerAvatars(Object.entries(first.avatars ?? {}).flatMap(([seat, url]): [string, string][] => (url && toName.has(seat) ? [[toName.get(seat)!, url]] : [])));
    this.version = first.version;
    this.serverLegal = update.legal;
    this.connection = connection;
    this.narrate(update.events);
    connection.listen((m) => this.receive(m));
    connection.onClose = () => this.notify('The connection to the game server was lost. Reload the page and rejoin the table or event.');
    connection.onStatus = (status) => {
      if (status === 'dropped') {
        this.offline = true;
        this.notify('Connection lost. Reconnecting…');
      } else {
        this.resyncing = true;
        this.notify('Reconnected.');
        this.watchResync();
      }
    };
  }

  /** The server's legal actions: it's the authority on what you may do. */
  override legal(): Action[] {
    // With taps held for a payment, the server's list is behind this board's copy of the game.
    return this.heldTaps.length ? getLegalActions(this.state) : this.serverLegal;
  }

  /** Checks the move against your copy of the game (for quick feedback), then sends it. The server decides. */
  override canSubmit(actions: Action[]): boolean {
    return !this.waiting && !this.offline && !this.lost && super.canSubmit(actions);
  }

  /**
   * After a reconnection the server sends the game again. If it hasn't come
   * within 12 seconds, reconnect again (three tries), then say so.
   */
  private watchResync(): void {
    if (this.resyncTimer) clearTimeout(this.resyncTimer);
    this.resyncTimer = setTimeout(() => {
      this.resyncTimer = null;
      if (!this.resyncing) return;
      connectionLog('resync-timeout', { tries: this.resyncTries });
      if (this.resyncTries++ < 3 && this.connection.retry) this.connection.retry();
      else this.giveUp('The game server took us back but didn’t send the game.');
    }, 12_000);
  }

  private giveUp(reason: string): void {
    this.lost = `${reason} Reload the page, then rejoin the table or event from the menu (your seat is kept while the game is on).`;
    this.offline = false;
    this.resyncing = false;
    connectionLog('rejoin-failed', { reason });
    this.notify(this.lost);
  }

  override submit(actions: Action[]): string | null {
    if (this.lost) return this.lost;
    if (this.offline) return 'Reconnecting to the game server…';
    if (this.waiting) return 'Waiting for the server…';
    const tried = applyAll(this.state, actions);
    if ('error' in tried) return readable(this.state, tried.error);
    // Paying by hand: tap now on this board; the server gets the taps with the spell.
    // A mana ability that moves a hidden card (Millikin: "{T}, Mill a card") goes to the server now instead:
    // only the server knows what that card is.
    const touchesHidden = tried.events.some((e) => e.type === 'CardMoved' && (e.from === 'library' || e.from === 'hand'))
      || Object.values(tried.state.cards).some((c) => c.defId === HIDDEN_CARD.id && c.zone !== 'library' && c.zone !== 'hand');
    if (this.holdPriority && actions.every((a) => a.type === 'ActivateManaAbility') && !touchesHidden) {
      this.state = tried.state;
      this.heldTaps.push(...actions);
      this.notify();
      return null;
    }
    this.send([...this.heldTaps.splice(0), ...actions]);
    return null;
  }

  /** The held taps go to the server on their own (you stopped paying). */
  private flushTaps(): void {
    if (this.heldTaps.length && !this.waiting && !this.offline) this.send(this.heldTaps.splice(0));
  }

  /** Your automatic passes and "no blocks" are sent to the server; otherwise the game waits on you or the other player. */
  override advance(): Advance {
    const s = this.state;
    if (s.pending.kind === 'gameOver') return 'over';
    if (this.waiting || this.offline || !this.decidesNow()) return 'you';
    if (this.holdPriority && s.pending.kind === 'priority') return 'you';
    if (this.heldTaps.length) {
      this.flushTaps();
      return 'you';
    }
    const action = this.automaticAction();
    if (action) this.send([action]);
    return 'you';
  }

  override subscribe(listener: (error?: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  override close(): void {
    this.connection.close();
  }

  private send(actions: Action[]): void {
    this.waiting = true;
    this.seq++;
    const out = actions.map((a) => renameOutgoing(a, this.toSeat));
    this.connection.send({ type: 'actions', seq: this.seq, version: this.version, actions: out as never });
  }

  private receive(m: ServerMessage): void {
    if (m.type === 'update') {
      const update = renameIncoming(m.update, this.toName);
      const before = this.state;
      this.state = materialize(update.state, CARD_DEFS);
      // Taps still held for a payment stay on this board's copy (dropped if they no longer apply).
      if (this.heldTaps.length) {
        const again = applyAll(this.state, this.heldTaps);
        if ('error' in again) this.heldTaps = [];
        else this.state = again.state;
      }
      this.version = m.version;
      this.serverLegal = update.legal;
      // After a reconnection the game arrives again: a move lost on the way is simply made again.
      if (m.ackSeq >= this.seq || this.resyncing) this.waiting = false;
      this.resyncing = false;
      this.resyncTries = 0;
      this.offline = false;
      this.lost = null;
      const notices = eventTargetNotices(this.state, update.events);
      this.targetHistory.unshift(...notices.reverse());
      this.targetHistory.splice(8);
      // Highlight what the other player just did.
      this.recent = before.pending.kind !== 'gameOver' && before.pending.player !== YOU ? touchedCards(update.events) : new Set();
      this.narrate(update.events);
      this.notify();
    } else if (m.type === 'error') {
      this.waiting = false;
      // The rejoin was refused (no such table, a sign-in problem): don't keep saying "Reconnecting".
      if (this.resyncing && m.seq === undefined) return this.giveUp(`Couldn’t get back into the game: ${m.message}`);
      this.notify(m.message);
    } else if (m.type === 'rewards') {
      this.rewards = { lines: m.lines, balance: m.balance };
      if (m.balance !== null) window.dispatchEvent(new CustomEvent('nexus:shards', { detail: m.balance }));
      this.notify();
    } else if (m.type === 'opponentLeft') {
      this.push(`${m.name} left the game.`);
      this.notify(`${m.name} left the game.`);
    }
  }

  private notify(error?: string): void {
    for (const l of this.listeners) l(error);
  }
}

/** Server data as the board expects it: your seat becomes "You", the other seats their players' names. */
function renameIncoming<T>(value: T, toName: ReadonlyMap<string, string>): T {
  const name = (x: string) => toName.get(x) ?? x;
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return name(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [name(k), walk(x)]));
    return v;
  };
  return walk(value) as T;
}

/** An action as the server expects it: player fields name seats. */
function renameOutgoing(action: Action, toSeat: ReadonlyMap<string, string>): Action {
  const seatOf = (x: unknown) => (typeof x === 'string' ? (toSeat.get(x) ?? x) : x);
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, PLAYER_FIELDS.has(k) ? seatOf(x) : walk(x)]));
    return v;
  };
  return walk(action) as Action;
}


