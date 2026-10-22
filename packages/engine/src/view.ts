// Per-player filtered views and events (PRD 8). The server sends each
// player only what they are allowed to know. Nothing here assumes a single
// opponent: the filter takes a viewer and treats everyone else the same.

import { characteristics, hasFlag } from './characteristics.ts';
import {
  PUBLIC_ZONES,
  type Keyword,
  type CardInstance,
  type CombatState,
  type GameEvent,
  type GameState,
  type InstanceId,
  type ManaPool,
  type Pending,
  type PlayerId,
  type StackItem,
  type Step,
} from './types.ts';

export interface PlayerView {
  id: PlayerId;
  life: number;
  handCount: number;
  libraryCount: number;
  /** Only present for the viewer's own hand. */
  hand?: InstanceId[];
  battlefield: InstanceId[];
  graveyard: InstanceId[];
  exile: InstanceId[];
  /** The command zone (Commander format). */
  command: InstanceId[];
  /** Times each commander has been cast from the command zone; the tax is {2} per cast. */
  commanderCasts: Record<InstanceId, number>;
  /** Combat damage taken from each commander; 21 from one commander knocks you out. */
  commanderDamage: Record<InstanceId, number>;
  manaPool: ManaPool;
  /** Mana that can only be spent on Equipment spells and equip abilities. */
  equipmentMana: ManaPool;
  eliminated: boolean;
}

/** A permanent's current power, toughness, keywords and subtypes, after counters, Equipment and effects. */
export interface PermanentStats {
  power: number;
  toughness: number;
  keywords: Keyword[];
  subtypes: string[];
  cantBeBlocked: boolean;
  mustBeBlocked: boolean;
}

export interface GameView {
  viewer: PlayerId;
  formatName: string;
  turnOrder: PlayerId[];
  activePlayer: PlayerId;
  turnNumber: number;
  step: Step;
  pending: Pending;
  stack: StackItem[];
  combat: CombatState | null;
  winner?: PlayerId | null;
  players: Record<PlayerId, PlayerView>;
  /** Only cards the viewer can see. */
  cards: Record<InstanceId, CardInstance>;
  /** Current stats of every permanent on the battlefield. */
  stats: Record<InstanceId, PermanentStats>;
  /** The spell or ability partway through resolving, if any. */
  resolving: StackItem | null;
}

/** The game as `viewer` may see it. A viewer who isn't a player sees public information only. */
export function viewFor(s: GameState, viewer: PlayerId): GameView {
  const players: Record<PlayerId, PlayerView> = {};
  const cards: Record<InstanceId, CardInstance> = {};
  for (const pid of s.turnOrder) {
    const p = s.players[pid]!;
    players[pid] = {
      id: pid,
      life: p.life,
      handCount: p.hand.length,
      libraryCount: p.library.length,
      ...(pid === viewer ? { hand: [...p.hand] } : {}),
      // What they control, including permanents they took from someone else.
      battlefield: s.turnOrder.flatMap((owner) => s.players[owner]!.battlefield).filter((id) => s.cards[id]!.controller === pid),
      graveyard: [...p.graveyard],
      exile: [...p.exile],
      command: [...p.command],
      commanderCasts: { ...p.commanderCasts },
      commanderDamage: { ...p.commanderDamage },
      manaPool: { ...p.manaPool },
      equipmentMana: { ...p.equipmentMana },
      eliminated: p.eliminated,
    };
  }
  const stats: Record<InstanceId, PermanentStats> = {};
  const surveilled = s.pending.kind === 'surveil' && s.pending.player === viewer ? s.pending.card : null;
  for (const c of Object.values(s.cards)) {
    const visible = PUBLIC_ZONES.includes(c.zone) || (c.zone === 'hand' && c.owner === viewer) || c.id === surveilled;
    if (visible) cards[c.id] = { ...c };
    if (c.zone === 'battlefield') {
      const ch = characteristics(s, c);
      stats[c.id] = {
        power: ch.power,
        toughness: ch.toughness,
        keywords: [...ch.keywords],
        subtypes: ch.subtypes,
        cantBeBlocked: hasFlag(s, c, 'cantBeBlocked'),
        mustBeBlocked: hasFlag(s, c, 'mustBeBlocked'),
      };
    }
  }
  return {
    viewer,
    formatName: s.format.name,
    turnOrder: [...s.turnOrder],
    activePlayer: s.activePlayer,
    turnNumber: s.turnNumber,
    step: s.step,
    pending:
      s.pending.kind === 'surveil' && s.pending.player !== viewer
        ? { ...s.pending, card: '' }
        : structuredClone(s.pending),
    stack: structuredClone(s.stack),
    combat: structuredClone(s.combat),
    ...(s.winner !== undefined ? { winner: s.winner } : {}),
    players,
    cards,
    stats,
    resolving: s.resolving ? structuredClone(s.resolving.item) : null,
  };
}

/** Strips card identities that `viewer` must not learn. */
export function filterEventsFor(events: readonly GameEvent[], viewer: PlayerId): GameEvent[] {
  return events.map((e) => {
    if (e.type === 'CardDrawn' && e.player !== viewer) {
      return { type: 'CardDrawn', player: e.player };
    }
    if (e.type === 'Surveiled' && e.player !== viewer && !e.toGraveyard) {
      return { type: 'Surveiled', player: e.player, toGraveyard: false };
    }
    if (e.type === 'CardMoved' && e.owner !== viewer && !PUBLIC_ZONES.includes(e.from) && !PUBLIC_ZONES.includes(e.to)) {
      return { type: 'CardMoved', owner: e.owner, from: e.from, to: e.to };
    }
    return e;
  });
}
