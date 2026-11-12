// What just happened, shown where it happened: damage, life gained or lost and
// counters float up from the card or player they landed on, and a line runs
// from a spell or ability to its targets so nobody has to guess where an
// effect came from (friend's playtest notes; Hodent: signs and feedback).

import { useLayoutEffect, useRef, useState } from 'react';
import type { InstanceId, PlayerId, Target } from '@nexus/engine';
import type { Impact } from '../game/session.ts';
import type { TargetNotice } from '../game/targeting.ts';

const FLOAT_MS = 1700;
const LINK_MS = 2600;
/** At most this many numbers from one batch (a board wipe shouldn't fill the screen). */
const MAX_FLOATS = 16;

const cardEl = (id: InstanceId) => document.querySelector<HTMLElement>(`[data-card="${CSS.escape(id)}"]`);
const playerEl = (pid: PlayerId) => document.querySelector<HTMLElement>(`[data-player="${CSS.escape(pid)}"] .avatar`) ?? document.querySelector<HTMLElement>(`[data-player="${CSS.escape(pid)}"]`);
const targetEl = (t: Target) => (t.kind === 'card' ? cardEl(t.card) : t.kind === 'player' ? playerEl(t.player) : null);
/** On screen and drawn (a card in a closed pile or a hidden hand has no box). */
const visibleBox = (el: HTMLElement | null) => {
  const r = el?.getBoundingClientRect();
  return r && r.width > 0 && r.height > 0 ? r : null;
};
const reduceMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

interface Float {
  key: number;
  kind: Impact['kind'];
  text: string;
  x: number;
  y: number;
  delay: number;
}

interface Link {
  key: number;
  from: { x: number; y: number };
  to: { x: number; y: number }[];
  trigger: boolean;
}

export function Impacts({ impacts, notices }: { impacts: readonly Impact[]; notices: readonly TargetNotice[] }) {
  // Impacts from before the board appeared don't show.
  const seen = useRef(impacts.length);
  const lastNotice = useRef(notices[0]);
  const nextLink = useRef(1);
  const [floats, setFloats] = useState<Float[]>([]);
  const [links, setLinks] = useState<Link[]>([]);

  useLayoutEffect(() => {
    const fresh = impacts.slice(seen.current);
    seen.current = impacts.length;
    // Damage (or life) to the same card or player in one batch shows as one total: two attackers hitting for 2 and 4 show -6.
    const merged: Impact[] = [];
    for (const i of fresh) {
      const same = i.kind !== 'counter' ? merged.find((m) => m.kind === i.kind && m.card === i.card && m.player === i.player) : undefined;
      if (same) same.text = `${i.kind === 'gain' ? '+' : '-'}${Math.abs(Number(same.text)) + Math.abs(Number(i.text))}`;
      else merged.push({ ...i });
    }
    const added: Float[] = [];
    const perSpot = new Map<string, number>();
    for (const i of merged.slice(-MAX_FLOATS)) {
      const el = i.card ? cardEl(i.card) : i.player ? playerEl(i.player) : null;
      const r = visibleBox(el);
      if (!r || !el) continue;
      // Several numbers on one spot stack upward instead of overlapping.
      const spot = i.card ?? i.player ?? '';
      const n = perSpot.get(spot) ?? 0;
      perSpot.set(spot, n + 1);
      // Kept clear of the window's edges.
      const x = Math.min(window.innerWidth - 50, Math.max(50, r.left + r.width / 2));
      const y = Math.max(40, r.top + r.height / 2 - n * 34);
      added.push({ key: i.key, kind: i.kind, text: i.text, x, y, delay: n * 250 });
      if (i.kind === 'damage' || i.kind === 'loss') {
        el.classList.remove('impact-hit');
        void el.offsetWidth; // restart the animation
        el.classList.add('impact-hit');
        window.setTimeout(() => el.classList.remove('impact-hit'), 800);
      }
    }
    if (added.length > 0) {
      setFloats((f) => [...f, ...added]);
      window.setTimeout(() => setFloats((f) => f.filter((x) => !added.includes(x))), FLOAT_MS + 400);
    }

    // New spells, abilities, triggers, attacks and blocks with targets: a line from each to its targets.
    const end = notices.indexOf(lastNotice.current!);
    const newer = (end === -1 ? notices.slice(0, 1) : notices.slice(0, end)).slice(0, 6);
    lastNotice.current = notices[0];
    const made: Link[] = [];
    for (const notice of newer) {
      const from = visibleBox(cardEl(notice.sourceCard));
      const to = notice.targets.map((t) => visibleBox(targetEl(t))).filter((r): r is DOMRect => !!r);
      if (!from || to.length === 0 || reduceMotion()) continue;
      made.push({
        key: nextLink.current++,
        from: { x: from.left + from.width / 2, y: from.top + from.height / 2 },
        to: to.map((r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 })),
        trigger: !!notice.trigger,
      });
    }
    if (made.length > 0) {
      setLinks((l) => [...l.slice(-4), ...made]);
      window.setTimeout(() => setLinks((l) => l.filter((x) => !made.includes(x))), LINK_MS);
    }
  });

  return (
    <div className="impacts" aria-hidden="true">
      {links.length > 0 && (
        <svg className="target-links" width="100%" height="100%">
          <defs>
            <marker id="target-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--target-line)" />
            </marker>
          </defs>
          {links.flatMap((l) =>
            l.to.map((t, i) => {
              // A gentle arc, so lines to several targets don't sit on top of each other.
              const mx = (l.from.x + t.x) / 2, my = (l.from.y + t.y) / 2 - 40 - i * 12;
              return <path key={`${l.key}-${i}`} className={`target-link ${l.trigger ? 'trigger' : ''}`} d={`M${l.from.x},${l.from.y} Q${mx},${my} ${t.x},${t.y}`} markerEnd="url(#target-arrow)" />;
            }),
          )}
        </svg>
      )}
      {floats.map((f) => (
        <span key={f.key} className={`impact-float ${f.kind}`} style={{ left: f.x, top: f.y, animationDelay: `${f.delay}ms` }}>
          {f.text}
        </span>
      ))}
    </div>
  );
}
