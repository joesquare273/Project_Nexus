// Cards flying from zone to zone (hand to stack, stack to battlefield,
// battlefield to graveyard, library to hand...), so every player can follow
// what just happened and see that an effect has resolved.
//
// The board marks each card it draws with data-card and each zone with
// data-pile ("P1:graveyard", "stack"). After every render this remembers
// where each card was; when the session reports moves, a copy of the card
// glides from its old spot to its new one while the real card waits hidden.

import { useLayoutEffect, useRef, useState } from 'react';
import type { CardDefId, InstanceId, PlayerId, ZoneName } from '@nexus/engine';
import { CardBack, CardFace } from './Card.tsx';

/** One card changing zones, as the viewer may see it. */
export interface CardMove {
  key: number;
  card?: InstanceId;
  /** Absent for a card the viewer can't see (an opponent's draw, a foretold card): it flies face down. */
  defId?: CardDefId;
  /** Whose zone it left and whose zone it went to. */
  fromPlayer: PlayerId;
  toPlayer: PlayerId;
  from: ZoneName;
  to: ZoneName;
}

interface Flight {
  key: number;
  card?: InstanceId;
  defId?: CardDefId;
  from: Box;
  to: Box;
  delay: number;
}

type Box = { left: number; top: number; width: number; height: number };

/** How long a card takes to fly, and the gap between cards moving together. */
const FLIGHT_MS = 520;
const STAGGER_MS = 70;
/** At most this many cards fly from one batch (a board wipe shouldn't take forever). */
const MAX_FLIGHTS = 12;
const CARD_RATIO = 1.4;

const boxOf = (r: DOMRect): Box => ({ left: r.left, top: r.top, width: r.width, height: r.height });

/** A card-sized box in the middle of a zone (a pile, an opponent's hand, the stack area). */
function zoneBox(player: PlayerId, zone: ZoneName): Box | null {
  const el = document.querySelector(`[data-pile="${zone === 'stack' ? 'stack' : `${player}:${zone}`}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const width = Math.min(r.width, 64);
  const height = width * CARD_RATIO;
  return { left: r.left + r.width / 2 - width / 2, top: r.top + r.height / 2 - height / 2, width, height };
}

const cardEl = (id: InstanceId) => document.querySelector<HTMLElement>(`[data-card="${CSS.escape(id)}"]`);

export function CardFlights({ moves }: { moves: readonly CardMove[] }) {
  // Moves from before the board appeared (the opening hands) don't fly.
  const seen = useRef(moves.length);
  const last = useRef(new Map<InstanceId, Box>());
  const [flights, setFlights] = useState<Flight[]>([]);

  useLayoutEffect(() => {
    const fresh = moves.slice(seen.current);
    seen.current = moves.length;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const added: Flight[] = [];
    if (!reduce) {
      for (const m of fresh.slice(-MAX_FLIGHTS)) {
        const from = (m.card && last.current.get(m.card)) || zoneBox(m.fromPlayer, m.from);
        const target = m.card ? cardEl(m.card) : null;
        const to = target ? boxOf(target.getBoundingClientRect()) : zoneBox(m.toPlayer, m.to);
        if (!from || !to || (Math.abs(from.left - to.left) < 4 && Math.abs(from.top - to.top) < 4)) continue;
        // The real card waits, hidden, until its copy lands.
        target?.classList.add('in-flight');
        added.push({ key: m.key, ...(m.card ? { card: m.card } : {}), ...(m.defId ? { defId: m.defId } : {}), from, to, delay: added.length * STAGGER_MS });
      }
    }
    // Remember where every card is now, for the next moves.
    const now = new Map<InstanceId, Box>();
    document.querySelectorAll<HTMLElement>('[data-card]').forEach((el) => now.set(el.dataset.card!, boxOf(el.getBoundingClientRect())));
    last.current = now;
    if (added.length > 0) setFlights((f) => [...f, ...added]);
  });

  const land = (f: Flight) => {
    if (f.card) cardEl(f.card)?.classList.remove('in-flight');
    setFlights((all) => all.filter((x) => x.key !== f.key));
  };
  return (
    <div className="flights" aria-hidden="true">
      {flights.map((f) => (
        <FlightCard key={f.key} flight={f} onLand={() => land(f)} />
      ))}
    </div>
  );
}

function FlightCard({ flight, onLand }: { flight: Flight; onLand: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { from, to } = flight;
    const dx = to.left - from.left;
    const dy = to.top - from.top;
    const sx = to.width / from.width;
    const sy = to.height / from.height;
    const animation = el.animate(
      [
        { transform: 'translate(0, 0) scale(1, 1)', opacity: 1 },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 30}px) scale(${(1 + sx) / 2 + 0.12}, ${(1 + sy) / 2 + 0.12})`, opacity: 1, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 1 },
      ],
      { duration: FLIGHT_MS, delay: flight.delay, easing: 'cubic-bezier(0.3, 0.7, 0.2, 1)', fill: 'both' },
    );
    animation.onfinish = onLand;
    // Animations pause while the page isn't drawn (a background tab); the card must not stay hidden.
    const fallback = window.setTimeout(onLand, flight.delay + FLIGHT_MS + 300);
    // Unmounting (or React's development double-mount) cancels quietly.
    return () => {
      window.clearTimeout(fallback);
      animation.onfinish = null;
      animation.cancel();
    };
    // A flight is set up once, when it starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { from } = flight;
  return (
    <div ref={ref} className="flight-card" style={{ left: from.left, top: from.top, width: from.width, height: from.height }}>
      {flight.defId ? <CardFace defId={flight.defId} size="small" /> : <CardBack />}
    </div>
  );
}
