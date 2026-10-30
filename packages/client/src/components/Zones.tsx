import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react';
import type { GameView, InstanceId, PlayerId } from '@nexus/engine';
import { defOf, isCreature } from '../game/cards.ts';
import { YOU, type Placement } from '../game/session.ts';
import { groupTokenCards } from '../game/tokenStacks.ts';
import { FitBoard } from './FitBoard.tsx';
import { CardBack, CardFace, ManaCost } from './Card.tsx';

/** How a card or player should be highlighted right now. */
export type Mark = 'effect-source' | 'effect-target'
  | 'playable'
  | 'target'
  | 'can-attack'
  | 'attacking'
  | 'can-block'
  | 'blocking'
  | 'selected'
  | 'recent'
  | 'defender'
  | 'focus'
  /** A mana source you can tap while paying a cost. */
  | 'mana';

export interface ZoneHandlers {
  tokenStackKey: (id: InstanceId) => string | null;
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
  const def = view.stats[id]?.definition ?? defOf(c.defId);
  const stats = view.stats[id];
  const marks = h.markCard(id);
  const note = h.cardNote(id);
  const creature = stats?.types ? stats.types.includes('creature') : isCreature(def) || !!c.crewed;
  const sick = c.summoningSick && creature && !stats?.keywords.includes('Haste');
  const changed = stats && (stats.power !== def.power || stats.toughness !== def.toughness);
  const indestructible = stats?.keywords.includes('Indestructible');
  const damaged = creature && c.damage > 0;
  const remaining = stats ? Math.max(0, stats.toughness - c.damage) : 0;
  const damageText = stats && damaged
    ? `Actual power/toughness ${stats.power}/${stats.toughness}. ${c.damage} damage marked until cleanup. ${indestructible ? 'Indestructible prevents destruction from damage; damage remains marked.' : `${remaining} more damage would be lethal. The red number shows remaining damage capacity, not a change to toughness.`}`
    : undefined;
  return (
    <div
      data-card={id}
      className={`bf-card ${c.tapped ? 'tapped' : ''} ${def.types.includes('land') ? 'land' : ''} ${damaged ? 'has-damage' : ''} ${marks.join(' ')}`}
      onClick={() => h.onCard(id)}
      onMouseEnter={() => h.onHover(id)}
      onMouseLeave={() => h.onHover(null)}
    >
      <div className="bf-inner">
        <CardFace printing={c.copy?.printing ?? c.printing} defId={c.copy?.artDefId ?? c.defId} size="small" backFace={!!c.transformed && !c.copy} {...(c.finish && !c.copy ? { finish: c.finish } : {})} />
        {c.copy && <div className="badge" title={"Copying " + c.copy.copiedName}>Copy</div>}
        {c.isToken && <div className="badge token">token</div>}
        {(c.counters ?? 0) > 0 && (
          <div key={c.counters} className="badge counters pop">
            +{c.counters}
          </div>
        )}
        {Object.keys(c.namedCounters ?? {}).length > 0 && (
          <div className="named-counters">
            {Object.entries(c.namedCounters ?? {}).map(([kind, n]) => (
              <div key={`${kind}${n}`} className={`badge named-counter ${kind} pop`} title={`${n} ${kind} counter${n === 1 ? '' : 's'}`}>
                {kind}
                {n! > 1 ? ` ×${n}` : ''}
              </div>
            ))}
          </div>
        )}
        {creature && stats && (
          <div className={`badge pt ${changed ? 'changed' : ''} ${damaged && !indestructible ? 'wounded' : ''}`} title={damageText} aria-label={damageText}>
            {stats.power}/<span>{damaged && !indestructible ? remaining : stats.toughness}</span>
            {damaged && !indestructible && <small className="damage-view-label">left</small>}
          </div>
        )}
        {c.damage > 0 && (
          <div key={c.damage} className="badge damage hit" title={damageText ?? `${c.damage} damage marked`} aria-label={`${c.damage} damage marked${indestructible ? '; indestructible' : ''}`}>
            {c.damage}
          </div>
        )}
        {sick && (
          <div className="badge sick" title="Summoning sick: can't attack or use abilities with the tap or untap symbol">
            z
          </div>
        )}
      </div>
      {note && <div className="card-note">{note}</div>}
    </div>
  );
}

/**
 * A permanent with the Equipment (or Auras) attached to it, drawn as one unit:
 * each attachment tucked behind it, peeking out to the right so it can still
 * be clicked and hovered. The group follows whatever is attached right now.
 */
function AttachedGroup({ view, id, attached, h }: { view: GameView; id: InstanceId; attached: InstanceId[]; h: ZoneHandlers }) {
  if (attached.length === 0) return <BattlefieldCard view={view} id={id} h={h} />;
  return (
    <div className="bf-group" style={{ '--attached': attached.length } as CSSProperties}>
      <div className="bf-group-host">
        <BattlefieldCard view={view} id={id} h={h} />
      </div>
      {attached.map((a, i) => (
        <div key={a} className="bf-attachment" style={{ '--i': i + 1 } as CSSProperties}>
          <BattlefieldCard view={view} id={a} h={h} />
        </div>
      ))}
    </div>
  );
}

/** Pixels the pointer must travel before a press becomes a drag (shorter presses are clicks). */
const DRAG_THRESHOLD = 6;

/**
 * One of your nonland permanents, which you can drag anywhere on your
 * battlefield. Until dragged it sits in the row; afterwards at the spot you
 * dropped it. A press without movement is still a click.
 */
function DraggableCard({
  view,
  id,
  attached,
  h,
  area,
  placement,
  onPlaced,
}: {
  view: GameView;
  id: InstanceId;
  /** What's attached to it: moves with it. */
  attached: InstanceId[];
  h: ZoneHandlers;
  area: RefObject<HTMLDivElement | null>;
  placement: Placement;
  onPlaced: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const press = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  /** When a drag ended: the click that ends a drag (only right after it) isn't a click on the card. */
  const draggedAt = useRef(0);
  const [offset, setOffset] = useState<{ x: number; y: number } | null>(null);
  const spot = placement.get(id);

  // The pointer is followed with window listeners, not pointer capture: capture would send the
  // click to this wrapper instead of the card, so clicks (targets, attackers, abilities) would be lost.
  const down = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    press.current = { x: e.clientX, y: e.clientY, moved: false };
    const onMove = (ev: PointerEvent) => move(ev);
    const onEnd = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      up();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  };
  const move = (e: { clientX: number; clientY: number }) => {
    const p = press.current;
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (!p.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    p.moved = true;
    setOffset({ x: dx, y: dy });
  };
  const up = () => {
    const p = press.current;
    press.current = null;
    if (!p?.moved) return;
    if (!ref.current || !area.current) {
      setOffset(null);
      return;
    }
    // Where the card is now, clamped inside the area, as fractions of its size.
    const a = area.current.getBoundingClientRect();
    const r = ref.current.getBoundingClientRect();
    const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), Math.max(max, 0));
    placement.set(id, {
      x: clamp((r.left - a.left) / a.width, (a.width - r.width) / a.width),
      y: clamp((r.top - a.top) / a.height, (a.height - r.height) / a.height),
    });
    draggedAt.current = Date.now();
    setOffset(null);
    onPlaced();
  };

  const style: CSSProperties = {
    ...(spot
      ? {
          position: 'absolute',
          left: `min(${spot.x * 100}%, calc(100% - var(--bf-w)))`,
          top: `min(${spot.y * 100}%, calc(100% - var(--bf-w) * var(--card-ratio)))`,
        }
      : {}),
    ...(offset ? { transform: `translate(${offset.x}px, ${offset.y}px)`, zIndex: 30 } : {}),
  };
  return (
    <div
      ref={ref}
      className={`bf-slot ${offset ? 'dragging' : ''}`}
      style={style}
      onPointerDown={down}
      onClickCapture={(e) => {
        // The click that ends a drag isn't a click on the card.
        if (Date.now() - draggedAt.current > 300) return;
        draggedAt.current = 0;
        e.stopPropagation();
      }}
    >
      <AttachedGroup view={view} id={id} attached={attached} h={h} />
    </div>
  );
}

function Battlefield({
  view,
  pid,
  h,
  placement,
  onPlaced,
}: {
  view: GameView;
  pid: PlayerId;
  h: ZoneHandlers;
  /** Your battlefield: nonland permanents can be dragged around. */
  placement?: Placement;
  onPlaced?: () => void;
}) {
  const area = useRef<HTMLDivElement>(null);
  const [expandedStacks, setExpandedStacks] = useState<Set<string>>(new Set());
  const ids = view.players[pid]!.battlefield;
  const lands = ids.filter((id) => defOf(view.cards[id]!.defId).types.includes('land'));
  const others = ids.filter((id) => !lands.includes(id));
  // Each permanent with what's attached to it right now: one unit, until something is unattached or moved.
  const hosts = others.filter((id) => !(view.cards[id]!.attachedTo && others.includes(view.cards[id]!.attachedTo!)));
  const attachedTo = (id: InstanceId) => others.filter((e) => view.cards[e]!.attachedTo === id);
  const ordered = hosts;
  const groups = groupTokenCards(ordered, (id) => {
    const key = h.tokenStackKey(id);
    // Unfold automatically for targets, combat selection, payments, or manually positioned tokens.
    return key && !expandedStacks.has(key) && !placement?.has(id) && h.markCard(id).every((m) => m === 'recent') ? key : null;
  });
  const tokenStack = (group: (typeof groups)[number]) => {
    const expand = () => setExpandedStacks(new Set([...expandedStacks, group.key!]));
    return <div key={group.id} className="token-stack" role="button" tabIndex={0}
      aria-label={`${group.members.length} ${defOf(view.cards[group.id]!.defId).name} tokens. Expand to choose individual tokens.`}
      onClick={expand}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); expand(); } }}>
      <BattlefieldCard view={view} id={group.id} h={{ ...h, onCard: expand }} />
      <span className="token-stack-count" aria-hidden="true">{group.members.length}</span>
    </div>;
  };
  if (placement) {
    // A card that left (or is now attached to something) keeps its id, so forget where it was.
    for (const id of [...placement.keys()]) if (!hosts.includes(id)) placement.delete(id);
  }
  return (
    <div className="battlefield" aria-label="Battlefield" data-pile={`${pid}:battlefield`}>
      <div className="zone-label">Battlefield{placement && ordered.length > 0 ? ' · drag your permanents to arrange them' : ''}</div>
      {expandedStacks.size > 0 && <button className="stack-tokens-button ghost" onClick={() => setExpandedStacks(new Set())}>Stack tokens</button>}
      {placement ? (
        <div ref={area} className="row creatures free">
          {groups.map((group) => group.members.length > 1 ? tokenStack(group) : (
            <DraggableCard
              key={group.id}
              view={view}
              id={group.id}
              attached={attachedTo(group.id)}
              h={h}
              area={area}
              placement={placement}
              onPlaced={onPlaced ?? (() => {})}
            />
          ))}
          {ordered.length === 0 && <div className="empty-row">No creatures</div>}
        </div>
      ) : (
        <div className="row creatures">
          {groups.map((group) => group.members.length > 1 ? tokenStack(group) : (
            <AttachedGroup key={group.id} view={view} id={group.id} attached={attachedTo(group.id)} h={h} />
          ))}
          {ordered.length === 0 && <div className="empty-row">No creatures</div>}
        </div>
      )}
      <div className="row lands">
        {lands.map((id) => (
          <BattlefieldCard key={id} view={view} id={id} h={h} />
        ))}
      </div>
    </div>
  );
}

function ManaPool({ pool, equipment, noncreature }: { pool: GameView['players'][string]['manaPool']; equipment: GameView['players'][string]['manaPool']; noncreature?: GameView['players'][string]['manaPool'] }) {
  const symbols = (p: typeof pool) => Object.entries(p).flatMap(([t, n]) => Array.from({ length: n }, () => `{${t}}`));
  const normal = symbols(pool);
  const restricted = symbols(equipment);
  const forNoncreature = noncreature ? symbols(noncreature) : [];
  if (normal.length + restricted.length + forNoncreature.length === 0) return null;
  return (
    <span className="pool" title="Mana pool">
      <ManaCost cost={normal.join('')} size={13} />
      {restricted.length > 0 && (
        <span className="pool-restricted" title="Only for Equipment spells and equip abilities">
          <ManaCost cost={restricted.join('')} size={13} />
        </span>
      )}
      {forNoncreature.length > 0 && (
        <span className="pool-restricted" title="Only for noncreature spells">
          <ManaCost cost={forNoncreature.join('')} size={13} />
        </span>
      )}
    </span>
  );
}

/** A life total that flashes and shows how much it changed ("-3" floating up). */
export function Life({ life }: { life: number }) {
  const previous = useRef(life);
  const delta = life - previous.current;
  // Remember the last change until the next one, so a re-render doesn't replay it.
  const shown = useRef({ delta: 0, at: life });
  if (delta !== 0) shown.current = { delta, at: life };
  useEffect(() => {
    previous.current = life;
  }, [life]);
  const change = shown.current.at === life ? shown.current.delta : 0;
  return (
    <div
      key={life}
      className={`life ${life <= 5 ? 'low' : ''} ${change < 0 ? 'down' : change > 0 ? 'up' : ''}`}
      title="Life"
    >
      {life}
      {change !== 0 && (
        <span className={`life-delta ${change < 0 ? 'down' : 'up'}`}>
          {change > 0 ? '+' : ''}
          {change}
        </span>
      )}
    </div>
  );
}

export function PlayerHeader({ view, pid, h }: { view: GameView; pid: PlayerId; h: ZoneHandlers }) {
  const p = view.players[pid]!;
  const marks = h.markPlayer(pid);
  const active = view.activePlayer === pid;
  return (
    <div className={`player-header ${marks.join(' ')} ${active ? 'active' : ''}`} onClick={() => h.onPlayer(pid)}>
      <div className="avatar">{pid === YOU ? 'You' : pid.replace('Bot', 'B')}</div>
      <div className="who">
        <div className="name">
          {pid === YOU ? 'You' : pid}
          {active && <span className="turn-pill">Turn</span>}
          {view.monarch === pid && <span className="turn-pill" title="The monarch draws at their end step; creature combat damage can transfer the crown">Monarch</span>}
        </div>
        <div className="counts">
          <span title={p.maximumHandSize === null ? "Cards in hand: no maximum hand size" : `Cards in hand: discard down to ${p.maximumHandSize} during your cleanup step`}>✋ {p.handCount}/{p.maximumHandSize ?? "∞"}</span>
          <ManaPool pool={p.manaPool} equipment={p.equipmentMana} noncreature={p.noncreatureSpellMana} />
          {Object.entries(p.commanderDamage)
            .filter(([, n]) => n > 0)
            .map(([cmd, n]) => (
              <span key={cmd} className={`cmd-damage ${n >= 15 ? 'low' : ''}`} title="Commander damage taken (21 knocks you out)">
                ⚔ {view.cards[cmd] ? defOf(view.cards[cmd]!.defId).name.split(',')[0] : 'Commander'} {n}/21
              </span>
            ))}
        </div>
      </div>

      {p.eliminated && <div className="out">Out of the game</div>}
    </div>
  );
}

export function CommandZone({view,pid,h}:{view:GameView;pid:PlayerId;h:ZoneHandlers}) {
  const p=view.players[pid]!;
  if(!p.commanders.length) return null;
  return <div className="command-zone" data-pile={pid+':command'}>
    <span className="command-zone-label">Command</span>
      {p.command.map((id) => {
        const tax = 2 * (p.commanderCasts[id] ?? 0);
        return (
          <div
            key={id}
            data-card={id}
            className={`command-card ${h.markCard(id).join(' ')}`}
            title={`Commander, in the command zone${tax ? ` (costs {${tax}} more)` : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              h.onCard(id);
            }}
            onMouseEnter={() => h.onHover(id)}
            onMouseLeave={() => h.onHover(null)}
          >
            <CardFace printing={view.cards[id]!.printing} defId={view.cards[id]!.defId} size="small" />
            {tax > 0 && <div className="badge tax">+{tax}</div>}
          </div>
        );
      })}
    {p.command.length===0 && <span className="command-zone-empty">Empty</span>}
  </div>;
}

export function OpponentZone({ view, pid, h, fit = false }: { view: GameView; pid: PlayerId; h: ZoneHandlers; fit?: boolean }) {
  const p = view.players[pid]!;
  return (
    <section className={`zone opponent ${p.eliminated ? 'eliminated' : ''}`}>
      <div className="zone-top"><CommandZone view={view} pid={pid} h={h} /><PlayerHeader view={view} pid={pid} h={h} /></div>
      <div className="opp-hand" data-pile={`${pid}:hand`}>
        {Array.from({ length: Math.min(p.handCount, 10) }, (_, i) => (
          <CardBack key={i} />
        ))}
      </div>
      <FitBoard enabled={fit}><div className="zone-body">
        <Battlefield view={view} pid={pid} h={h} />
        <ZonePiles view={view} pid={pid} h={h} />
      </div></FitBoard>
    </section>
  );
}

export function YourZone({
  fit = false,
  view,
  h,
  placement,
  onPlaced,
}: {
  view: GameView;
  h: ZoneHandlers;
  placement: Placement;
  onPlaced: () => void;
  fit?: boolean;
}) {
  return (
    <section className={`zone you ${view.players[YOU]!.eliminated ? 'eliminated' : ''}`}>
      <div className="zone-top"><CommandZone view={view} pid={YOU} h={h} /><PlayerHeader view={view} pid={YOU} h={h} /></div>
      <FitBoard enabled={fit}><div className="zone-body">
        <Battlefield view={view} pid={YOU} h={h} placement={fit ? undefined : placement} onPlaced={onPlaced} />
        <ZonePiles view={view} pid={YOU} h={h} />
      </div></FitBoard>
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
      data-card={id}
      tabIndex={0}
      role="button"
      aria-label={defOf(view.cards[id]!.defId).name}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); h.onCard(id); } }}
      onFocus={() => h.onHover(id)}
      onBlur={() => h.onHover(null)}
      className={`hand-card ${marks.join(' ')} ${tag ? 'elsewhere' : ''}`}
      data-choice-label={view.pending.kind === 'chooseCards' ? (['discard', 'handSize'].includes(view.pending.purpose) ? 'Discard' : 'Chosen') : 'Bottom'}
      style={{ '--tilt': `${tilt}deg` } as CSSProperties}
      onClick={() => h.onCard(id)}
      onMouseEnter={() => h.onHover(id)}
      onMouseLeave={() => h.onHover(null)}
    >
      <CardFace printing={view.cards[id]!.printing} defId={view.cards[id]!.defId} size="normal" {...(view.cards[id]!.finish ? { finish: view.cards[id]!.finish } : {})} />
      {tag && <div className="badge from-zone">{tag}</div>}
    </div>
  );
}

/** One pile: a library (face down) or a graveyard or exile (top card face up). Clicking opens the full list. */
function Pile({
  view,
  label,
  count,
  top,
  faceDown,
  onOpen,
  h,
  pile,
}: {
  view: GameView;
  /** Where cards fly to and from: "P1:graveyard". */
  pile: string;
  label: string;
  count: number;
  top?: InstanceId | undefined;
  faceDown?: boolean;
  onOpen?: () => void;
  h: ZoneHandlers;
}) {
  return (
    <div
      data-pile={pile}
      className={`pile ${onOpen ? 'openable' : ''}`}
      title={`${label}: ${count} card${count === 1 ? '' : 's'}${onOpen && count > 0 ? ' (click to see them)' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        if (onOpen && count > 0) onOpen();
      }}
      onMouseEnter={() => top && h.onHover(top)}
      onMouseLeave={() => top && h.onHover(null)}
    >
      {/* Keyed by count: the pile bumps whenever a card goes in or comes out. */}
      <div key={count} className={`pile-card ${count === 0 ? 'empty' : ''} bump`}>
        {count > 0 && faceDown && <CardBack />}
        {count > 0 && !faceDown && top && view.cards[top] && <CardFace printing={view.cards[top]!.printing} defId={view.cards[top]!.defId} size="small" />}
        {/* A foretold card is face down to everyone but its owner. */}
        {count > 0 && !faceDown && top && !view.cards[top] && <CardBack />}
        {count > 1 && <div className="pile-depth" />}
      </div>
      <div className="pile-caption">
        {label} <b>{count}</b>
      </div>
    </div>
  );
}

/** A player's library, graveyard and exile. */
function ZonePiles({ view, pid, h }: { view: GameView; pid: PlayerId; h: ZoneHandlers }) {
  const p = view.players[pid]!;
  return (
    <div className="piles">
      <Pile view={view} pile={`${pid}:library`} label="Library" count={p.libraryCount} faceDown h={h} />
      <Pile
        view={view}
        pile={`${pid}:graveyard`}
        label="Graveyard"
        count={p.graveyard.length}
        top={p.graveyard.at(-1)}
        onOpen={() => h.onZone(pid, 'graveyard')}
        h={h}
      />
      <Pile view={view} pile={`${pid}:exile`} label="Exile" count={p.exile.length} top={p.exile.at(-1)} onOpen={() => h.onZone(pid, 'exile')} h={h} />
      {/* Phased out until their controller's next turn (Clever Concealment). */}
      {p.phasedOut.length > 0 && (
        <Pile view={view} pile={`${pid}:phasedOut`} label="Phased out" count={p.phasedOut.length} top={p.phasedOut.at(-1)} h={h} />
      )}
    </div>
  );
}

/** Your hand, plus cards you can cast from elsewhere right now (flashback, cards exiled to play). */
export function Hand({ view, h, elsewhere }: { view: GameView; h: ZoneHandlers; elsewhere: InstanceId[] }) {
  const hand = view.players[YOU]!.hand ?? [];
  const all = [...hand, ...elsewhere];
  return (
    <div className="hand" style={{ '--hand-count': all.length } as CSSProperties} data-pile={`${YOU}:hand`}>
      {all.map((id, i) => {
        const tilt = (i - (all.length - 1) / 2) * 2;
        const zone = view.cards[id]!.zone;
        return <HandCard key={id} view={view} id={id} h={h} tilt={tilt} tag={zone === 'hand' ? undefined : zone === 'library' ? 'Top of library' : `from ${zone}`} />;
      })}
      {all.length === 0 && <div className="empty-row">Your hand is empty</div>}
    </div>
  );
}

/** One group of exiled cards, with what it means for them. */
interface ExileSection {
  title: string;
  hint: string;
  cards: { id: InstanceId; note?: string }[];
  /** Cards you can't see (an opponent's foretold cards): how many. */
  faceDown?: number;
  castable?: boolean;
}

/**
 * A player's exile, sorted by what each card is doing there: ones you can
 * cast now, foretold ones (castable on a later turn), face-down ones,
 * ones held until a permanent leaves, and the rest. With only one kind there,
 * it's a plain list. Clicking a card you can cast starts casting it.
 */
export function ExileList({
  view,
  pid,
  h,
  castable,
  onClose,
}: {
  view: GameView;
  pid: PlayerId;
  h: ZoneHandlers;
  /** Exiled cards the viewer may cast or play right now (by the rules, whether or not they can pay yet). */
  castable: ReadonlySet<InstanceId>;
  onClose: () => void;
}) {
  const ids = [...view.players[pid]!.exile].reverse();
  const nameOf = (id: InstanceId) => (view.cards[id] ? defOf(view.cards[id]!.defId).name : 'a card');
  const now: ExileSection['cards'] = [];
  const foretold: ExileSection['cards'] = [];
  const held: ExileSection['cards'] = [];
  const rest: ExileSection['cards'] = [];
  let faceDown = 0;
  for (const id of ids) {
    const c = view.cards[id];
    if (!c) {
      faceDown++;
      continue;
    }
    const foretell = defOf(c.defId).foretell;
    if (castable.has(id)) {
      const until = c.playableFromExile?.untilTurn;
      const note =
        c.castPermission?.turn === view.turnNumber && c.castPermission.genericReduction !== undefined
          ? 'Playable until end of turn; spells cost {' + c.castPermission.genericReduction + '} less'
          : c.foretoldTurn !== undefined
          ? `Foretold: you may cast it for ${foretell}`
          : until !== undefined
            ? until === view.turnNumber
              ? 'You may cast it until end of turn'
              : `You may cast it until the end of turn ${until}`
            : `You may cast it while you control ${nameOf(c.playableFromExile?.source ?? '')}`;
      now.push({ id, note });
    } else if (c.foretoldTurn !== undefined) {
      foretold.push({ id, note: `Foretold this turn: you may cast it from your next turn for ${foretell}` });
    } else if (c.linkedExile) {
      rest.push({ id, note: c.castPermission?.player === view.viewer && c.castPermission.turn === view.turnNumber
        ? 'Playable until end of turn; spells cost {' + (c.castPermission.genericReduction ?? 0) + '} less. Normal costs and timing apply.'
        : 'Exiled face down; no play permission this turn' });
    } else if (c.exiledUntilLeaves) {
      held.push({ id, note: `Until ${nameOf(c.exiledUntilLeaves)} leaves the battlefield` });
    } else {
      rest.push({ id });
    }
  }
  const sections: ExileSection[] = [
    { title: 'Play from exile', hint: 'You may play these now. Click one to play it.', cards: now, castable: true },
    { title: 'Foretold', hint: 'Exiled face down; you may cast them on a later turn for their foretell cost.', cards: foretold },
    { title: 'Face down', hint: 'Cards exiled face down; their identities are private.', cards: [], faceDown },
    { title: 'Exiled until a permanent leaves', hint: 'They come back when it leaves the battlefield.', cards: held },
    { title: 'Exiled', hint: '', cards: rest },
  ].filter((sec) => sec.cards.length > 0 || (sec.faceDown ?? 0) > 0);
  // Headings only help when there's more than one kind of exiled card.
  const headed = sections.length > 1;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="card-list" onClick={(e) => e.stopPropagation()}>
        <div className="card-list-head">
          <strong>{pid === YOU ? 'Your' : `${pid}'s`} exile</strong>
          <button className="ghost" onClick={onClose}>
            Close
          </button>
        </div>
        {sections.length === 0 && <div className="empty-row">Empty</div>}
        {sections.map((sec) => (
          <section key={sec.title} className="exile-section">
            {headed && (
              <div className="exile-section-head">
                <strong>{sec.title}</strong>
                {sec.hint && <span>{sec.hint}</span>}
              </div>
            )}
            <div className="card-list-cards">
              {sec.cards.map(({ id, note }) => (
                <div key={id} className="list-entry">
                  <div
                    className={`list-card ${h.markCard(id).join(' ')} ${sec.castable ? 'castable' : ''}`}
                    onClick={() => {
                      // Close the list first so targets and payment are visible on the board.
                      if (sec.castable) onClose();
                      h.onCard(id);
                    }}
                    onMouseEnter={() => h.onHover(id)}
                    onMouseLeave={() => h.onHover(null)}
                  >
                    <CardFace printing={view.cards[id]!.printing} defId={view.cards[id]!.defId} size="normal" />
                  </div>
                  {note && <div className="list-note">{note}</div>}
                </div>
              ))}
              {Array.from({ length: sec.faceDown ?? 0 }, (_, i) => (
                <div key={`down${i}`} className="list-entry">
                  <div className="list-card">
                    <CardBack />
                  </div>
                  {!headed && <div className="list-note">Foretold (face down)</div>}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
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
  actions,
}: {
  view: GameView;
  title: string;
  ids: InstanceId[];
  h: ZoneHandlers;
  onClose?: () => void;
  /** Buttons in the list's header, for choices made in the list (the board's prompt bar is behind it). */
  actions?: ReactNode;
}) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="card-list" onClick={(e) => e.stopPropagation()}>
        <div className="card-list-head">
          <strong>{title}</strong>
          {actions}
          {onClose && (
            <button className="ghost" onClick={onClose}>
              Close
            </button>
          )}
        </div>
        <div className="card-list-cards">
          {/* Face-down cards (foretold, an opponent's) aren't shown. */}
          {ids.filter((id) => view.cards[id]).map((id) => (
            <div
              key={id}
              className={`list-card ${h.markCard(id).join(' ')}`}
              onClick={() => h.onCard(id)}
              onMouseEnter={() => h.onHover(id)}
              onMouseLeave={() => h.onHover(null)}
            >
              <CardFace printing={view.cards[id]!.printing} defId={view.cards[id]!.defId} size="normal" />
            </div>
          ))}
          {ids.length === 0 && <div className="empty-row">Empty</div>}
          {ids.some((id) => !view.cards[id]) && <div className="empty-row">{ids.filter((id) => !view.cards[id]).length} face down</div>}
        </div>
      </div>
    </div>
  );
}
