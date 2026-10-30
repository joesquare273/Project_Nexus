// Per-player filtered views and events (PRD 8). The server sends each
// player only what they are allowed to know. Nothing here assumes a single
// opponent: the filter takes a viewer and treats everyone else the same.

import { goadedBy } from './combat.ts';
import { currentDefinition } from './cardface.ts';
import { colorsOf } from './typerules.ts';
import { visibleLibraryTop } from './typerules.ts';
import { maximumHandSize } from './turn.ts';
import { characteristics, hasFlag } from './characteristics.ts';
import {
  PUBLIC_ZONES,
  type CardDefinition,
  type Keyword,
  type CardType,
  type Color,
  type CardInstance,
  type CardDefId,
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
  /** Commander identities are public even while their current zone is hidden. */
  commanders: { id: InstanceId; defId: CardDefId }[];
  id: PlayerId;
  life: number;
  handCount: number;
  /** null means an effect removes the maximum. Checked during this player's cleanup. */
  maximumHandSize: number | null;
  libraryCount: number;
  /** Only shown to this player while an ability lets them look at their library top. */
  libraryTop?: InstanceId;
  /** Only present for the viewer's own hand. */
  hand?: InstanceId[];
  battlefield: InstanceId[];
  graveyard: InstanceId[];
  exile: InstanceId[];
  /** The command zone (Commander format). */
  command: InstanceId[];
  /** Phased-out permanents this player controls: treated as though they don't exist until their next turn. */
  phasedOut: InstanceId[];
  /** Times each commander has been cast from the command zone; the tax is {2} per cast. */
  commanderCasts: Record<InstanceId, number>;
  /** Combat damage taken from each commander; 21 from one commander knocks you out. */
  commanderDamage: Record<InstanceId, number>;
  manaPool: ManaPool;
  /** Mana that can only be spent on Equipment spells and equip abilities. */
  equipmentMana: ManaPool;
  /** Mana that can only be spent to cast noncreature spells. */
  noncreatureSpellMana: ManaPool;
  eliminated: boolean;
}

/** A permanent's current power, toughness, keywords and subtypes, after counters, Equipment and effects. */
export interface PermanentStats {
  definition?: CardDefinition;
  mustAttack?: boolean;
  types?: CardType[];
  colors?: Color[];
  goadedBy?: PlayerId[];
  power: number;
  toughness: number;
  keywords: Keyword[];
  subtypes: string[];
  cantBeBlocked: boolean;
  mustBeBlocked: boolean;
}

export interface GameView {
  monarch?: PlayerId;
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
      maximumHandSize: maximumHandSize(s, pid),
      libraryCount: p.library.length,
      ...(pid === viewer && visibleLibraryTop(s, viewer) ? { libraryTop: visibleLibraryTop(s, viewer) } : {}),
      ...(pid === viewer ? { hand: [...p.hand] } : {}),
      // What they control, including permanents they took from someone else.
      commanders: Object.values(s.cards).filter(c=>c.isCommander && c.owner===pid).map(c=>({id:c.id,defId:c.defId})),
      battlefield: s.turnOrder.flatMap((owner) => s.players[owner]!.battlefield).filter((id) => s.cards[id]!.controller === pid),
      graveyard: [...p.graveyard],
      exile: [...p.exile],
      command: [...p.command],
      phasedOut: s.turnOrder.flatMap((owner) => s.players[owner]!.phasedOut ?? []).filter((id) => s.cards[id]!.controller === pid),
      commanderCasts: { ...p.commanderCasts },
      commanderDamage: { ...p.commanderDamage },
      manaPool: { ...p.manaPool },
      equipmentMana: { ...p.equipmentMana },
      noncreatureSpellMana: { ...p.noncreatureSpellMana },
      eliminated: p.eliminated,
    };
  }
  const stats: Record<InstanceId, PermanentStats> = {};
  const surveilled = (s.pending.kind === 'surveil' || s.pending.kind === 'exileTop') && s.pending.player === viewer ? s.pending.card : null;
  // Cards being looked at to choose from ("look at the top seven cards of your library", a library search).
  const lookingAt = s.pending.kind === 'chooseCards' && s.pending.player === viewer && ['hand', 'search', 'digLands', 'discard'].includes(s.pending.purpose) ? s.pending.cards : [];
  for (const c of Object.values(s.cards)) {
    const faceDown = c.zone === 'exile' && ((c.foretoldTurn !== undefined && c.owner !== viewer) || (c.linkedExile !== undefined && !c.linkedExile.lookers.includes(viewer)));
    const visible = !faceDown && (c.id === players[viewer]?.libraryTop || PUBLIC_ZONES.includes(c.zone) || (c.zone === 'hand' && c.owner === viewer) || c.id === surveilled || lookingAt.includes(c.id));
    if (visible) cards[c.id] = { ...c };
    if (c.zone === 'battlefield') {
      const ch = characteristics(s, c);
      stats[c.id] = {
        ...(c.copy ? {definition: currentDefinition(s,c)} : {}),
        mustAttack: hasFlag(s,c,'mustAttack'),
        types: [...currentDefinition(s,c).types],
        colors: colorsOf(currentDefinition(s,c)),
        goadedBy: goadedBy(s,c),
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
    ...(s.monarch ? { monarch: s.monarch } : {}),
    formatName: s.format.name,
    turnOrder: [...s.turnOrder],
    activePlayer: s.activePlayer,
    turnNumber: s.turnNumber,
    step: s.step,
    pending:
      s.pending.kind === 'chooseCards' && s.pending.purpose === 'handSize' && s.pending.player !== viewer
        ? { ...s.pending, cards: [] }
        : (s.pending.kind === 'surveil' || s.pending.kind === 'exileTop') && s.pending.player !== viewer
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
    if (e.type === 'FaceDownExiled' && e.player !== viewer) return { type: 'FaceDownExiled', player: e.player };
    if (e.type === 'CardMoved' && e.visibleTo && !e.visibleTo.includes(viewer)) return { type: 'CardMoved', owner: e.owner, from: e.from, to: e.to };
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
