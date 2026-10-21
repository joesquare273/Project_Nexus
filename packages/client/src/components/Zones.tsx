import type { CSSProperties } from 'react';
import type { GameView, InstanceId, PlayerId } from '@nexus/engine';
import { defOf, isCreature } from '../game/cards.ts';
import { YOU } from '../game/session.ts';
import { CardBack, CardFace, ManaCost } from './Card.tsx';

/** How a card or player should be highlighted right now. */
export type Mark =
  | 'playable'
  | 'target'
  | 'can-attack'
  | 'attacking'
  | 'can-block'
  | 'blocking'
  | 'selected'
  | 'recent'
  | 'defender';

export interface ZoneHandlers {
  markCard: (id: InstanceId) => Mark[];
  markPlayer: (id: PlayerId) => Mark[];
  /** A short label under a card, e.g. "→ Bot1" or "blocks Bear". */
  cardNote: (id: InstanceId) => string | null;
  onCard: (id: InstanceId) => void;
  onPlayer: (id: PlayerId) => void;
  onHover: (id: InstanceId | null) => void;
}

/** Marks a Starter Kit card whose abilities aren't built yet. */
function NotBuiltBadge() {
  return (
    <div className="badge not-built" title="Not built yet: only its power, toughness and keywords work, or it can't be cast">
      not built yet
    </div>
  );
}

export function BattlefieldCard({ view, id, h }: { view: GameView; id: InstanceId; h: ZoneHandlers }) {
  const c = view.cards[id]!;
  const def = defOf(c.defId);
  const marks = h.markCard(id);
  const note = h.cardNote(id);
  const sick = c.summoningSick && isCreature(def) && !def.keywords?.includes('Haste');
  return (
    <div
      className={`bf-card ${c.tapped ? 'tapped' : ''} ${def.types.includes('land') ? 'land' : ''} ${marks.join(' ')}`}
      onClick={() => h.onCard(id)}
      onMouseEnter={() => h.onHover(id)}
      onMouseLeave={() => h.onHover(null)}
    >
      <div className="bf-inner">
        <CardFace defId={c.defId} size="small" />
        {def.notBuilt && <NotBuiltBadge />}
        {c.damage > 0 && <div className="badge damage">{c.damage}</div>}
        {sick && (
          <div className="badge sick" title="Summoning sick: can't attack or tap this turn">
            z
          </div>
        )}
      </div>
      {note && <div className="card-note">{note}</div>}
    </div>
  );
}

function Battlefield({ view, pid, h }: { view: GameView; pid: PlayerId; h: ZoneHandlers }) {
  const ids = view.players[pid]!.battlefield;
  const lands = ids.filter((id) => defOf(view.cards[id]!.defId).types.includes('land'));
  const others = ids.filter((id) => !lands.includes(id));
  return (
    <div className="battlefield">
      <div className="row creatures">
        {others.map((id) => (
          <BattlefieldCard key={id} view={view} id={id} h={h} />
        ))}
        {others.length === 0 && <div className="empty-row">No creatures</div>}
      </div>
      <div className="row lands">
        {lands.map((id) => (
          <BattlefieldCard key={id} view={view} id={id} h={h} />
        ))}
      </div>
    </div>
  );
}

function ManaPool({ pool }: { pool: GameView['players'][string]['manaPool'] }) {
  const symbols = Object.entries(pool).flatMap(([t, n]) => Array.from({ length: n }, () => `{${t}}`));
  if (symbols.length === 0) return null;
  return (
    <span className="pool" title="Mana pool">
      <ManaCost cost={symbols.join('')} size={13} />
    </span>
  );
}

export function PlayerHeader({ view, pid, h }: { view: GameView; pid: PlayerId; h: ZoneHandlers }) {
  const p = view.players[pid]!;
  const marks = h.markPlayer(pid);
  const active = view.activePlayer === pid;
  const graveTop = p.graveyard.at(-1);
  return (
    <div className={`player-header ${marks.join(' ')} ${active ? 'active' : ''}`} onClick={() => h.onPlayer(pid)}>
      <div className="avatar">{pid === YOU ? 'You' : pid.replace('Bot', 'B')}</div>
      <div className="who">
        <div className="name">
          {pid === YOU ? 'You' : pid}
          {active && <span className="turn-pill">Turn</span>}
        </div>
        <div className="counts">
          <span title="Cards in hand">✋ {p.handCount}</span>
          <span title="Cards in library">📚 {p.libraryCount}</span>
          <span title="Cards in graveyard">🪦 {p.graveyard.length}</span>
          <ManaPool pool={p.manaPool} />
        </div>
      </div>
      <div className={`life ${p.life <= 5 ? 'low' : ''}`} title="Life">
        {p.life}
      </div>
      {graveTop && (
        <div
          className="grave-top"
          title="Top of graveyard"
          onMouseEnter={() => h.onHover(graveTop)}
          onMouseLeave={() => h.onHover(null)}
        >
          <CardFace defId={view.cards[graveTop]!.defId} size="small" />
        </div>
      )}
      {p.eliminated && <div className="out">Out of the game</div>}
    </div>
  );
}

export function OpponentZone({ view, pid, h }: { view: GameView; pid: PlayerId; h: ZoneHandlers }) {
  const p = view.players[pid]!;
  return (
    <section className={`zone opponent ${p.eliminated ? 'eliminated' : ''}`}>
      <PlayerHeader view={view} pid={pid} h={h} />
      <div className="opp-hand">
        {Array.from({ length: Math.min(p.handCount, 10) }, (_, i) => (
          <CardBack key={i} />
        ))}
      </div>
      <Battlefield view={view} pid={pid} h={h} />
    </section>
  );
}

export function YourZone({ view, h }: { view: GameView; h: ZoneHandlers }) {
  return (
    <section className="zone you">
      <Battlefield view={view} pid={YOU} h={h} />
    </section>
  );
}

export function Hand({ view, h }: { view: GameView; h: ZoneHandlers }) {
  const hand = view.players[YOU]!.hand ?? [];
  return (
    <div className="hand">
      {hand.map((id, i) => {
        const marks = h.markCard(id);
        const tilt = (i - (hand.length - 1) / 2) * 2;
        return (
          <div
            key={id}
            className={`hand-card ${marks.join(' ')}`}
            style={{ '--tilt': `${tilt}deg` } as CSSProperties}
            onClick={() => h.onCard(id)}
            onMouseEnter={() => h.onHover(id)}
            onMouseLeave={() => h.onHover(null)}
          >
            <CardFace defId={view.cards[id]!.defId} size="normal" />
            {defOf(view.cards[id]!.defId).notBuilt && <NotBuiltBadge />}
          </div>
        );
      })}
      {hand.length === 0 && <div className="empty-row">Your hand is empty</div>}
    </div>
  );
}
