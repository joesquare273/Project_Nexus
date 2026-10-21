// Per-player filtered views and events (PRD 8). The server sends each
// player only what they are allowed to know. Nothing here assumes a single
// opponent: the filter takes a viewer and treats everyone else the same.

import {
  PUBLIC_ZONES,
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
  manaPool: ManaPool;
  eliminated: boolean;
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
      battlefield: [...p.battlefield],
      graveyard: [...p.graveyard],
      exile: [...p.exile],
      manaPool: { ...p.manaPool },
      eliminated: p.eliminated,
    };
  }
  for (const c of Object.values(s.cards)) {
    const visible = PUBLIC_ZONES.includes(c.zone) || (c.zone === 'hand' && c.owner === viewer);
    if (visible) cards[c.id] = { ...c };
  }
  return {
    viewer,
    formatName: s.format.name,
    turnOrder: [...s.turnOrder],
    activePlayer: s.activePlayer,
    turnNumber: s.turnNumber,
    step: s.step,
    pending: structuredClone(s.pending),
    stack: structuredClone(s.stack),
    combat: structuredClone(s.combat),
    ...(s.winner !== undefined ? { winner: s.winner } : {}),
    players,
    cards,
  };
}

/** Strips card identities that `viewer` must not learn. */
export function filterEventsFor(events: readonly GameEvent[], viewer: PlayerId): GameEvent[] {
  return events.map((e) => {
    if (e.type === 'CardDrawn' && e.player !== viewer) {
      return { type: 'CardDrawn', player: e.player };
    }
    if (e.type === 'CardMoved' && e.owner !== viewer && !PUBLIC_ZONES.includes(e.from) && !PUBLIC_ZONES.includes(e.to)) {
      return { type: 'CardMoved', owner: e.owner, from: e.from, to: e.to };
    }
    return e;
  });
}
