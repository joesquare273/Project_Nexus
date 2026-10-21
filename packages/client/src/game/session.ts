// A local game against bots, with no UI code. The board renders `view()` (what
// you're allowed to see), offers `plays()` and the engine's legal actions,
// and sends your choices back with `submit()`. A networked or Godot client
// would get the same view and send the same actions through a server.

import {
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
import { CARD_DEFS, starterKitDeck } from '@nexus/cards';
import { basicAi, planTaps, randomBot, tapActions, type Bot } from '@nexus/bots';
import { cardName, describe } from '@nexus/bots/narrate';

export const YOU: PlayerId = 'You';

export type DeckChoice = 'RW' | 'UB';

export interface SessionOptions {
  deck: DeckChoice;
  opponents: number;
  seed: number;
  bot: 'ai' | 'random';
}

export type CastAction = Extract<Action, { type: 'CastSpell' }>;

/** Something you can do with a card in your hand right now. */
export type Play =
  | { kind: 'land'; card: InstanceId; action: Action }
  /** `taps` pays for it; each cast in `casts` is one legal choice of targets after tapping. */
  | { kind: 'spell'; card: InstanceId; taps: Action[]; casts: CastAction[] };

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

  constructor(options: SessionOptions) {
    this.options = options;
    this.opponents = Array.from({ length: options.opponents }, (_, i) => `Bot${i + 1}`);
    const makeBot = options.bot === 'random' ? randomBot : basicAi;
    this.bots = Object.fromEntries(this.opponents.map((id, i) => [id, makeBot(options.seed + i)]));
    const decks: Record<PlayerId, ReturnType<typeof starterKitDeck>> = { [YOU]: starterKitDeck(options.deck) };
    this.opponents.forEach((id, i) => {
      decks[id] = starterKitDeck((options.deck === 'RW') === (i % 2 === 0) ? 'UB' : 'RW');
    });
    const created = createGame({
      format: FREE_FOR_ALL,
      cardDefs: CARD_DEFS,
      seed: options.seed,
      players: [YOU, ...this.opponents].map((id) => ({ id, deck: decks[id]! })),
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

  /** Your playable hand cards while you have priority. Lands tap automatically for spells. */
  plays(): Map<InstanceId, Play> {
    const s = this.state;
    const plays = new Map<InstanceId, Play>();
    if (s.pending.kind !== 'priority' || s.pending.player !== YOU) return plays;
    for (const a of this.legal()) {
      if (a.type === 'PlayLand') plays.set(a.card, { kind: 'land', card: a.card, action: a });
    }
    for (const id of s.players[YOU]!.hand) {
      const def = CARD_DEFS[s.cards[id]!.defId]!;
      if (def.types.includes('land')) continue;
      const taps = planTaps(s, YOU, def.manaCost);
      if (!taps) continue;
      const paid = applyAll(s, tapActions(YOU, taps));
      if ('error' in paid) continue;
      const casts = getLegalActions(paid.state).filter((a): a is CastAction => a.type === 'CastSpell' && a.card === id);
      if (casts.length > 0) plays.set(id, { kind: 'spell', card: id, taps: tapActions(YOU, taps), casts });
    }
    return plays;
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
        if (this.plays().size === 0 || !this.worthStopping()) return { type: 'PassPriority', player: YOU };
        return null;
      case 'declareBlockers': {
        const canBlock = this.legal().some((a) => a.type === 'DeclareBlockers' && a.blocks.length > 0);
        return canBlock ? null : { type: 'DeclareBlockers', player: YOU, blocks: [] };
      }
      case 'decide': {
        const item = s.stack.at(-1);
        if (item?.kind !== 'ability') return null;
        const cost = triggerSpec(s, item).cost;
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
