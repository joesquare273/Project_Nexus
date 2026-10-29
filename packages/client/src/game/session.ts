// A local game against bots, with no UI code. The board renders `view()` (what
// you're allowed to see), offers `plays()` and the engine's legal actions,
// and sends your choices back with `submit()`. A networked browser client
// would get the same view and send the same actions through a server.

import { eventTargetNotices, targetNotice, type TargetNotice } from './targeting.ts';
import { actionDelay, type AiPace } from './pacing.ts';
import {
  COMMANDER,
  FREE_FOR_ALL,
  LIMITED,
  applyAction,
  createGame,
  filterEventsFor,
  getLegalActions,
  triggerLifeCost,
  triggerSpec,
  viewFor,
  type Action,
  type CardDefId,
  type GameEvent,
  type GameState,
  type GameView,
  type InstanceId,
  type PlayerId,
  type Step,
} from '@nexus/engine';
import { CARD_DEFS, FIN_PRECONS, preconDeck, preconDeckWithCommander, starterKitDeck } from '@nexus/cards';
import { basicAi, planTaps, playableCards, randomBot, type Bot, type CardPlay } from '@nexus/bots';
import type { CardMove } from '../components/Flights.tsx';
import { cardName, describe } from '@nexus/bots/narrate';

export const YOU: PlayerId = 'You';

export type DeckChoice = 'RW' | 'UB';

export interface SessionOptions {
  /** Starter Kit games (60 cards, 20 life), Commander with the precons (100 cards, 40 life), or Limited with drafted decks (40-60 cards, 20 life). */
  format?: 'starter' | 'commander' | 'limited';
  /** Limited: every player's deck, yours first. */
  decks?: CardDefId[][];
  /** Limited: the opponents' names (the AI drafters). */
  opponentNames?: string[];
  /** Starter Kit deck. */
  deck: DeckChoice;
  /** Commander: your precon's name. Opponents get the others. */
  precon?: string;
  /** Commander: which legend from your precon leads it (default: the printed commander). */
  commander?: string;
  opponents: number;
  seed: number;
  bot: 'ai' | 'random';
  /** Show coaching tips as situations come up (the practice game). */
  coaching?: boolean;
}

/** A game that starts from a prepared position instead of a fresh shuffle (the tutorial, online games). */
export interface Scenario {
  state: GameState;
  bots: Record<PlayerId, Bot>;
  /** The other players' ids (default: Bot1, Bot2...). */
  opponents?: PlayerId[];
}

export type { CardPlay, PlayChoice } from '@nexus/bots';

export interface LogEntry {
  id: number;
  text: string;
  /** A turn header line. */
  heading: boolean;
}

/** What `advance` did. */
export type Advance = 'you' | 'over' | 'bot' | 'auto';

/** A dragged permanent's top-left corner, as fractions of your battlefield area's width and height. */
export type Placement = Map<InstanceId, { x: number; y: number }>;



export class GameSession {
  state: GameState;
  readonly options: SessionOptions;
  readonly opponents: PlayerId[];
  readonly log: LogEntry[] = [];
  /** Pause whenever you receive priority, even without playable cards. */
  stopEverywhere = false;
  /** Visible actions and automatic resolutions pause before the next advance. */
  aiPace: AiPace = 'normal';
  presentationDelayMs = 0;
  readonly targetHistory: TargetNotice[] = [];
  /** Priority stops on these steps, on any player's turn. Never skips turn-based actions. */
  readonly phaseStops = new Set<Step>();
  /** Tap mana sources for you when you cast or activate, instead of you choosing which to tap. */
  autoTap = false;
  /** You're partway through paying a cost: keep priority until you finish or cancel. */
  holdPriority = false;
  /** Cards whose abilities triggered, in order, for the board to show (`key` is unique). */
  readonly triggered: { key: number; card: InstanceId }[] = [];
  /** Cards that changed zones, in order, for the board to animate (only what you may see). */
  readonly moves: CardMove[] = [];
  private nextMoveKey = 1;
  private nextTriggerKey = 1;
  /** Cards the last bot action touched, for highlighting. */
  recent = new Set<InstanceId>();
  /** Where you dragged your nonland permanents on your battlefield (board layout only; the engine never sees it). */
  readonly placement: Placement = new Map();
  private readonly bots: Record<PlayerId, Bot>;
  private nextLogId = 1;

  constructor(options: SessionOptions, scenario?: Scenario) {
    this.options = options;
    this.opponents = scenario?.opponents ?? options.opponentNames ?? Array.from({ length: options.opponents }, (_, i) => `Bot${i + 1}`);
    if (scenario) {
      this.bots = scenario.bots;
      this.state = scenario.state;
      return;
    }
    const makeBot = options.bot === 'random' ? randomBot : basicAi;
    this.bots = Object.fromEntries(this.opponents.map((id, i) => [id, makeBot(options.seed + i)]));
    if (options.format === 'limited') {
      const created = createGame({
        format: LIMITED,
        cardDefs: CARD_DEFS,
        seed: options.seed,
        players: [YOU, ...this.opponents].map((id, i) => ({ id, deck: options.decks![i]! })),
        mulligans: true,
      });
      this.state = created.state;
      this.narrate(created.events);
      return;
    }
    if (options.format === 'commander') {
      const mine = FIN_PRECONS.find((p) => p.name === options.precon) ?? FIN_PRECONS[0]!;
      const others = FIN_PRECONS.filter((p) => p !== mine);
      const decks = [preconDeckWithCommander(mine.name, options.commander), ...others.map((p) => preconDeck(p.name))];
      const created = createGame({
        format: COMMANDER,
        cardDefs: CARD_DEFS,
        seed: options.seed,
        players: [YOU, ...this.opponents].map((id, i) => ({ id, ...decks[i]! })),
        mulligans: true,
      });
      this.state = created.state;
      this.narrate(created.events);
      return;
    }
    const decks: Record<PlayerId, ReturnType<typeof starterKitDeck>> = { [YOU]: starterKitDeck(options.deck) };
    this.opponents.forEach((id, i) => {
      decks[id] = starterKitDeck((options.deck === 'RW') === (i % 2 === 0) ? 'UB' : 'RW');
    });
    const created = createGame({
      format: FREE_FOR_ALL,
      cardDefs: CARD_DEFS,
      seed: options.seed,
      players: [YOU, ...this.opponents].map((id) => ({ id, deck: decks[id]! })),
      mulligans: true,
    });
    this.state = created.state;
    this.narrate(created.events);
  }

  view(): GameView {
    return viewFor(this.state, YOU);
  }

  legal(): Action[] {
    return getLegalActions(this.state);
  }

  /**
   * What you can do right now, grouped by card: play a land, cast a spell
   * (from hand, graveyard or exile), or activate an ability. Each choice
   * comes with a suggested set of mana taps that pays for it.
   */
  plays(): CardPlay[] {
    return playableCards(this.state, YOU);
  }

  /** Whether these actions would work right now (nothing changes). */
  canSubmit(actions: Action[]): boolean {
    return !('error' in applyAll(this.state, actions));
  }

  /** Applies your actions all-or-nothing. Returns an error message, or null on success. */
  submit(actions: Action[]): string | null {
    const result = applyAll(this.state, actions);
    if ('error' in result) return readable(this.state, result.error);
    this.state = result.state;
    this.recent.clear();
    const notices = eventTargetNotices(this.state, result.events);
    this.targetHistory.unshift(...notices.reverse()); this.targetHistory.splice(8);
    this.presentationDelayMs = notices.length ? actionDelay(result.events, actions.at(-1)!, false, this.aiPace, true) : 0;
    this.narrate(result.events);
    return null;
  }

  /**
   * Takes one step that doesn't need you: a bot's action, or an automatic
   * pass / no-block / unaffordable "no" for you. Returns 'you' when the game
   * is waiting on your decision.
   */
  advance(): Advance {
    const s = this.state;
    if (s.pending.kind === 'gameOver') return 'over';
    const bot = s.pending.player !== YOU;
    // You're tapping mana to pay for something: don't pass priority under you.
    if (!bot && this.holdPriority && s.pending.kind === 'priority') return 'you';
    const action = bot ? this.bots[s.pending.player]!(s, this.legal()) : this.automaticAction();
    if (!action) return 'you';
    const result = applyAll(s, [action]);
    if ('error' in result) throw new Error(`Automatic action was illegal: ${result.error}`);
    const resolved = result.events.find(e => e.type === 'StackItemResolved');
    const top = resolved?.type === 'StackItemResolved' ? [s.resolving?.item, ...s.stack].find(item => item?.id === resolved.item) : undefined;
    const resolution = top ? targetNotice(s, top.kind === 'spell' ? top.card : top.source, top.controller, top.targets) : null;
    this.state = result.state;
    const notices = eventTargetNotices(this.state, result.events);
    if (resolution) notices.unshift(resolution);
    this.targetHistory.unshift(...notices.reverse()); this.targetHistory.splice(8);
    this.narrate(result.events);
    this.presentationDelayMs = actionDelay(result.events, action, bot, this.aiPace, notices.length > 0);
    if (this.presentationDelayMs > 0) {
      this.recent = touchedCards(result.events);
      return 'bot';
    }
    return 'auto';
  }

  /** Calls `listener` when the game changes on its own (an online opponent moved), with an error to show, if any. */
  subscribe(_listener: (error?: string) => void): () => void {
    return () => {};
  }

  /** Ends the session (an online game disconnects). */
  close(): void {}

  /** A decision that is obvious or not worth stopping for, made for you. */
  protected automaticAction(): Action | null {
    const s = this.state;
    const pending = s.pending;
    switch (pending.kind) {
      case 'priority':
        if (this.stopEverywhere || this.phaseStops.has(s.step)) return null;
        if (this.plays().length === 0 || !this.worthStopping()) return { type: 'PassPriority', player: YOU };
        return null;
      case 'declareBlockers': {
        const canBlock = this.legal().some((a) => a.type === 'DeclareBlockers' && a.blocks.length > 0);
        return canBlock ? null : { type: 'DeclareBlockers', player: YOU, blocks: [] };
      }
      case 'decide': {
        const item = s.stack.at(-1);
        if (item?.kind !== 'ability') return null;
        const cost = triggerSpec(s, item)?.cost;
        const life = triggerLifeCost(s, item);
        const lifeOk = life === undefined || s.players[YOU]!.life >= life;
        return lifeOk && planTaps(s, YOU, cost?.mana) ? null : { type: 'Decide', player: YOU, accept: false };
      }
      default:
        return null;
    }
  }

  /** Stop for your main phases, for spells you might answer, and for steps where instants matter. */
  private worthStopping(): boolean {
    const s = this.state;
    const top = s.stack.at(-1);
    if (top) return top.controller !== YOU;
    if (s.activePlayer === YOU) return s.step === 'main1' || s.step === 'main2';
    return s.step === 'declareAttackers' || s.step === 'declareBlockers' || s.step === 'end';
  }

  protected narrate(events: GameEvent[]): void {
    for (const e of events) if (e.type === 'AbilityTriggered') this.triggered.push({ key: this.nextTriggerKey++, card: e.card });
    let draws = null as { player: PlayerId; names: string[]; hidden: number } | null;
    const flush = () => {
      if (!draws) return;
      const who = draws.player === YOU ? 'You' : draws.player;
      if (draws.names.length > 0) this.push(`${who} drew ${draws.names.join(', ')}.`);
      if (draws.hidden > 0) this.push(`${who} drew ${draws.hidden === 1 ? 'a card' : `${draws.hidden} cards`}.`);
      draws = null;
    };
    for (const e of filterEventsFor(events, YOU)) this.recordMove(e);
    for (const e of filterEventsFor(events, YOU)) {
      if (e.type === 'CardDrawn') {
        if (draws?.player !== e.player) flush();
        draws ??= { player: e.player, names: [], hidden: 0 };
        if (e.card) draws.names.push(cardName(this.state, e.card));
        else draws.hidden += 1;
        continue;
      }
      flush();
      const line = describe(this.state, e, YOU);
      if (line) this.push(line);
    }
    flush();
    if (this.log.length > 400) this.log.splice(0, this.log.length - 400);
  }

  /** A zone change for the board to animate. Tokens appearing and leaving the game aren't flights. */
  private recordMove(e: GameEvent): void {
    const add = (m: Omit<CardMove, 'key'>) => {
      const printing=m.defId && m.card ? this.state.cards[m.card]?.printing : undefined;
      this.moves.push({ key: this.nextMoveKey++, ...m, ...(printing ? {printing:{...printing}} : {}) });
      if (this.moves.length > 200) this.moves.splice(0, this.moves.length - 200);
    };
    if (e.type === 'CardDrawn') {
      add({ ...(e.card ? { card: e.card } : {}), ...(e.defId ? { defId: e.defId } : {}), fromPlayer: e.player, toPlayer: e.player, from: 'library', to: 'hand' });
    } else if (e.type === 'FaceDownExiled') {
      const c = e.card ? this.state.cards[e.card] : undefined;
      add({ ...(e.card ? { card: e.card } : {}), ...(c ? { defId: c.defId } : {}), fromPlayer: e.player, toPlayer: e.player, from: 'library', to: 'exile' });
    } else if (e.type === 'Foretold') {
      // Face down: only its owner sees which card it is.
      const c = this.state.cards[e.card];
      add({ card: e.card, ...(e.player === YOU && c ? { defId: c.defId } : {}), fromPlayer: e.player, toPlayer: e.player, from: 'hand', to: 'exile' });
    } else if (e.type === 'CardMoved' && e.from !== e.to && e.to !== 'void' && e.from !== 'void') {
      const hidden = !e.card || !e.defId;
      // Hidden moves between two hidden zones (an opponent's mulligan) aren't worth showing.
      if (hidden && e.from !== 'library' && e.to !== 'library') return;
      add({
        ...(e.card ? { card: e.card } : {}),
        ...(e.defId ? { defId: e.defId } : {}),
        fromPlayer: e.from === 'battlefield' ? (e.controller ?? e.owner) : e.owner,
        toPlayer: e.to === 'battlefield' && e.card ? (this.state.cards[e.card]?.controller ?? e.owner) : e.owner,
        from: e.from,
        to: e.to,
      });
    }
  }

  protected push(text: string): void {
    const heading = text.startsWith('\n=====');
    const clean = text.replace(/^\n/, '').replace(/=====/g, '').trim();
    this.log.push({ id: this.nextLogId++, text: clean, heading });
  }
}

export function applyAll(s: GameState, actions: Action[]): { state: GameState; events: GameEvent[] } | { error: string } {
  const events: GameEvent[] = [];
  for (const a of actions) {
    const r = applyAction(s, a);
    if (!r.ok) return { error: r.error };
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

/** Engine errors name cards by instance id; show card names instead. */
export function readable(s: GameState, error: string): string {
  return error.replace(/"([ct]\d+)"/g, (_, id: string) => (s.cards[id] ? cardName(s, id) : id));
}

export function touchedCards(events: GameEvent[]): Set<InstanceId> {
  const ids = new Set<InstanceId>();
  for (const e of events) {
    if ('card' in e && typeof e.card === 'string') ids.add(e.card);
    if (e.type === 'AttackDeclared') ids.add(e.attacker);
    if (e.type === 'BlockDeclared') ids.add(e.blocker);
    if (e.type === 'DamageDealt') {
      ids.add(e.source);
      if (e.target.kind === 'card') ids.add(e.target.card);
    }
  }
  return ids;
}
