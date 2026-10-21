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
  | 'defender'
  | 'focus';

export interface ZoneHandlers {
  markCard: (id: InstanceId) => Mark[];
  markPlayer: (id: PlayerId) => Mark[];
  /** A short label under a card, e.g. "→ Bot1" or "blocks Bear". */
  cardNote: (id: InstanceId) => string | null;
  onCard: (id: InstanceId) => void;
  onPlayer: (id: PlayerId) => void;
  onHover: (id: InstanceId | null) => void;
  /** Open a list of a player's graveyard or exile. */
  onZone: (player: PlayerId, zone: 'graveyard' | 'exile') => void;
}

export function BattlefieldCard({ view, id, h }: { view: GameView; id: InstanceId; h: ZoneHandlers }) {
  const c = view.cards[id]!;
  const def = defOf(c.defId);
  const stats = view.stats[id];
  const marks = h.markCard(id);
  const note = h.cardNote(id);
  const creature = isCreature(def);
  const sick = c.summoningSick && creature && !stats?.keywords.includes('Haste');
  const changed = stats && (stats.power !== def.power || stats.toughness !== def.toughness);
  return (
    <div
      className={`bf-card ${c.tapped ? 'tapped' : ''} ${def.types.includes('land') ? 'land' : ''} ${marks.join(' ')}`}
      onClick={() => h.onCard(id)}
      onMouseEnter={() => h.onHover(id)}
      onMouseLeave={() => h.onHover(null)}
    >
      <div className="bf-inner">
        <CardFace defId={c.defId} size="small" />
        {c.isToken && <div className="badge token">token</div>}
        {(c.counters ?? 0) > 0 && <div className="badge counters">+{c.counters}</div>}
        {creature && stats && (
          <div className={`badge pt ${changed ? 'changed' : ''}`}>
            {stats.power}/{stats.toughness}
          </div>
        )}
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
  // Equipment sits right after the creature it's attached to.
  const ordered: InstanceId[] = [];
  for (const id of others) {
    if (view.cards[id]!.attachedTo && others.includes(view.cards[id]!.attachedTo!)) continue;
    ordered.push(id);
    for (const e of others) if (view.cards[e]!.attachedTo === id) ordered.push(e);
  }
  return (
    <div className="battlefield">
      <div className="row creatures">
        {ordered.map((id) => (
          <BattlefieldCard key={id} view={view} id={id} h={h} />
        ))}
        {ordered.length === 0 && <div className="empty-row">No creatures</div>}
      </div>
      <div className="row lands">
        {lands.map((id) => (
          <BattlefieldCard key={id} view={view} id={id} h={h} />
        ))}
      </div>
    </div>
  );
}

function ManaPool({ pool, equipment }: { pool: GameView['players'][string]['manaPool']; equipment: GameView['players'][string]['manaPool'] }) {
  const symbols = (p: typeof pool) => Object.entries(p).flatMap(([t, n]) => Array.from({ length: n }, () => `{${t}}`));
  const normal = symbols(pool);
  const restricted = symbols(equipment);
  if (normal.length + restricted.length === 0) return null;
  return (
    <span className="pool" title="Mana pool">
      <ManaCost cost={normal.join('')} size={13} />
      {restricted.length > 0 && (
        <span className="pool-restricted" title="Only for Equipment spells and equip abilities">
          <ManaCost cost={restricted.join('')} size={13} />
        </span>
      )}
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
          <button
            className="zone-link"
            title="Graveyard"
            onClick={(e) => {
              e.stopPropagation();
              h.onZone(pid, 'graveyard');
            }}
          >
            🪦 {p.graveyard.length}
          </button>
          {p.exile.length > 0 && (
            <button
              className="zone-link"
              title="Exile"
              onClick={(e) => {
                e.stopPropagation();
                h.onZone(pid, 'exile');
              }}
            >
              ⊘ {p.exile.length}
            </button>
          )}
          <ManaPool pool={p.manaPool} equipment={p.equipmentMana} />
          {Object.entries(p.commanderDamage)
            .filter(([, n]) => n > 0)
            .map(([cmd, n]) => (
              <span key={cmd} className={`cmd-damage ${n >= 15 ? 'low' : ''}`} title="Commander damage taken (21 knocks you out)">
                ⚔ {view.cards[cmd] ? defOf(view.cards[cmd]!.defId).name.split(',')[0] : 'Commander'} {n}/21
              </span>
            ))}
        </div>
      </div>
      {p.command.map((id) => {
        const tax = 2 * (p.commanderCasts[id] ?? 0);
        return (
          <div
            key={id}
            className={`command-card ${h.markCard(id).join(' ')}`}
            title={`Commander, in the command zone${tax ? ` (costs {${tax}} more)` : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              h.onCard(id);
            }}
            onMouseEnter={() => h.onHover(id)}
            onMouseLeave={() => h.onHover(null)}
          >
            <CardFace defId={view.cards[id]!.defId} size="small" />
            {tax > 0 && <div className="badge tax">+{tax}</div>}
          </div>
        );
      })}
      <div className={`life ${p.life <= 5 ? 'low' : ''}`} title="Life">
        {p.life}
      </div>
      {graveTop && (
        <div
          className="grave-top"
          title="Top of graveyard (click to see all)"
          onClick={(e) => {
            e.stopPropagation();
            h.onZone(pid, 'graveyard');
          }}
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

function HandCard({
  view,
  id,
  h,
  tilt,
  tag,
}: {
  view: GameView;
  id: InstanceId;
  h: ZoneHandlers;
  tilt: number;
  tag?: string;
}) {
  const marks = h.markCard(id);
  return (
    <div
      className={`hand-card ${marks.join(' ')} ${tag ? 'elsewhere' : ''}`}
      style={{ '--tilt': `${tilt}deg` } as CSSProperties}
      onClick={() => h.onCard(id)}
      onMouseEnter={() => h.onHover(id)}
      onMouseLeave={() => h.onHover(null)}
    >
      <CardFace defId={view.cards[id]!.defId} size="normal" />
      {tag && <div className="badge from-zone">{tag}</div>}
    </div>
  );
}

/** Your hand, plus cards you can cast from elsewhere right now (flashback, cards exiled to play). */
export function Hand({ view, h, elsewhere }: { view: GameView; h: ZoneHandlers; elsewhere: InstanceId[] }) {
  const hand = view.players[YOU]!.hand ?? [];
  const all = [...hand, ...elsewhere];
  return (
    <div className="hand">
      {all.map((id, i) => {
        const tilt = (i - (all.length - 1) / 2) * 2;
        const zone = view.cards[id]!.zone;
        return <HandCard key={id} view={view} id={id} h={h} tilt={tilt} tag={zone === 'hand' ? undefined : `from ${zone}`} />;
      })}
      {all.length === 0 && <div className="empty-row">Your hand is empty</div>}
    </div>
  );
}

/** A full list of a graveyard or exile, or of cards to choose from as targets. */
export function CardList({
  view,
  title,
  ids,
  h,
  onClose,
}: {
  view: GameView;
  title: string;
  ids: InstanceId[];
  h: ZoneHandlers;
  onClose?: () => void;
}) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="card-list" onClick={(e) => e.stopPropagation()}>
        <div className="card-list-head">
          <strong>{title}</strong>
          {onClose && (
            <button className="ghost" onClick={onClose}>
              Close
            </button>
          )}
        </div>
        <div className="card-list-cards">
          {ids.map((id) => (
            <div
              key={id}
              className={`list-card ${h.markCard(id).join(' ')}`}
              onClick={() => h.onCard(id)}
              onMouseEnter={() => h.onHover(id)}
              onMouseLeave={() => h.onHover(null)}
            >
              <CardFace defId={view.cards[id]!.defId} size="normal" />
            </div>
          ))}
          {ids.length === 0 && <div className="empty-row">Empty</div>}
        </div>
      </div>
    </div>
  );
}
