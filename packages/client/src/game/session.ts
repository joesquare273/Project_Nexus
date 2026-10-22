// A local game against bots, with no UI code. The board renders `view()` (what
// you're allowed to see), offers `plays()` and the engine's legal actions,
// and sends your choices back with `submit()`. A networked or Godot client
// would get the same view and send the same actions through a server.

import {
  COMMANDER,
  FREE_FOR_ALL,
  applyAction,
  createGame,
  filterEventsFor,
  getLegalActions,
  triggerSpec,
  viewFor,
  type Action,
  type GameEvent,
  type GameState,
  type GameView,
  type InstanceId,
  type PlayerId,
} from '@nexus/engine';
import { CARD_DEFS, FIN_PRECONS, preconDeck, starterKitDeck } from '@nexus/cards';
import { basicAi, planTaps, playableCards, randomBot, type Bot, type CardPlay } from '@nexus/bots';
import { cardName, describe } from '@nexus/bots/narrate';

export const YOU: PlayerId = 'You';

export type DeckChoice = 'RW' | 'UB';

export interface SessionOptions {
  /** Starter Kit games (60 cards, 20 life) or Commander with the precons (100 cards, 40 life). */
  format?: 'starter' | 'commander';
  /** Starter Kit deck. */
  deck: DeckChoice;
  /** Commander: your precon's name. Opponents get the others. */
  precon?: string;
  opponents: number;
  seed: number;
  bot: 'ai' | 'random';
  /** Show coaching tips as situations come up (the practice game). */
  coaching?: boolean;
}

/** A game that starts from a prepared position instead of a fresh shuffle (the tutorial). */
export interface Scenario {
  state: GameState;
  bots: Record<PlayerId, Bot>;
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

const QUIET_ACTIONS = new Set<Action['type']>(['PassPriority', 'ActivateManaAbility']);

export class GameSession {
  state: GameState;
  readonly options: SessionOptions;
  readonly opponents: PlayerId[];
  readonly log: LogEntry[] = [];
  /** Stop at every step instead of passing automatically when nothing important is happening. */
  stopEverywhere = false;
  /** Cards the last bot action touched, for highlighting. */
  recent = new Set<InstanceId>();
  private readonly bots: Record<PlayerId, Bot>;
  private nextLogId = 1;

  constructor(options: SessionOptions, scenario?: Scenario) {
    this.options = options;
    this.opponents = Array.from({ length: options.opponents }, (_, i) => `Bot${i + 1}`);
    if (scenario) {
      this.bots = scenario.bots;
      this.state = scenario.state;
      return;
    }
    const makeBot = options.bot === 'random' ? randomBot : basicAi;
    this.bots = Object.fromEntries(this.opponents.map((id, i) => [id, makeBot(options.seed + i)]));
    if (options.format === 'commander') {
      const mine = FIN_PRECONS.find((p) => p.name === options.precon) ?? FIN_PRECONS[0]!;
      const others = FIN_PRECONS.filter((p) => p !== mine);
      const decks = [mine, ...others].map((p) => preconDeck(p.name));
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
   * (from hand, graveyard or exile), or activate an ability. Mana sources tap
   * automatically.
   */
  plays(): CardPlay[] {
    return playableCards(this.state, YOU);
  }

  /** Applies your actions all-or-nothing. Returns an error message, or null on success. */
  submit(actions: Action[]): string | null {
    const result = applyAll(this.state, actions);
    if ('error' in result) return readable(this.state, result.error);
    this.state = result.state;
    this.recent.clear();
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
    if (s.pending.player !== YOU) {
      const action = this.bots[s.pending.player]!(s, this.legal());
      const result = applyAll(s, [action]);
      if ('error' in result) throw new Error(`Bot chose an illegal action: ${result.error}`);
      this.state = result.state;
      this.narrate(result.events);
      if (QUIET_ACTIONS.has(action.type)) return 'auto';
      this.recent = touchedCards(result.events);
      return 'bot';
    }
    const auto = this.automaticAction();
    if (!auto) return 'you';
    this.submit([auto]);
    return 'auto';
  }

  /** A decision that is obvious or not worth stopping for, made for you. */
  private automaticAction(): Action | null {
    const s = this.state;
    const pending = s.pending;
    switch (pending.kind) {
      case 'priority':
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
        const lifeOk = cost?.life === undefined || s.players[YOU]!.life >= cost.life;
        return lifeOk && planTaps(s, YOU, cost?.mana) ? null : { type: 'Decide', player: YOU, accept: false };
      }
      default:
        return null;
    }
  }

  /** Stop for your main phases, for spells you might answer, and for steps where instants matter. */
  private worthStopping(): boolean {
    const s = this.state;
    if (this.stopEverywhere) return true;
    const top = s.stack.at(-1);
    if (top) return top.controller !== YOU;
    if (s.activePlayer === YOU) return s.step === 'main1' || s.step === 'main2';
    return s.step === 'declareAttackers' || s.step === 'declareBlockers' || s.step === 'end';
  }

  private narrate(events: GameEvent[]): void {
    let draws = null as { player: PlayerId; names: string[]; hidden: number } | null;
    const flush = () => {
      if (!draws) return;
      const who = draws.player === YOU ? 'You' : draws.player;
      if (draws.names.length > 0) this.push(`${who} drew ${draws.names.join(', ')}.`);
      if (draws.hidden > 0) this.push(`${who} drew ${draws.hidden === 1 ? 'a card' : `${draws.hidden} cards`}.`);
      draws = null;
    };
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

  private push(text: string): void {
    const heading = text.startsWith('\n=====');
    const clean = text.replace(/^\n/, '').replace(/=====/g, '').trim();
    this.log.push({ id: this.nextLogId++, text: clean, heading });
  }
}

function applyAll(s: GameState, actions: Action[]): { state: GameState; events: GameEvent[] } | { error: string } {
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
function readable(s: GameState, error: string): string {
  return error.replace(/"([ct]\d+)"/g, (_, id: string) => (s.cards[id] ? cardName(s, id) : id));
}

function touchedCards(events: GameEvent[]): Set<InstanceId> {
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
