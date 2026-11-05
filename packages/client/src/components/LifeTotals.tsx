import { useState, type CSSProperties, type ReactNode } from 'react';
import type { GameView, PlayerId } from '@nexus/engine';
import { defOf } from '../game/cards.ts';
import { Life } from './Zones.tsx';

/** Commander damage a player has taken, from each commander (21 from one knocks them out). */
export function CommanderDamageBreakdown({ view, target }: { view: GameView; target: string }) {
  const damage = view.players[target]!.commanderDamage;
  const hasCommanders = view.turnOrder.some((pid) => view.players[pid]!.commanders.length);
  if (!hasCommanders) return <p className="hub-note">No commanders in this game.</p>;
  return (
    <>
      {view.turnOrder.map((owner) => {
        const commanders = view.players[owner]!.commanders;
        if (!commanders.length || owner === target) return null;
        return commanders.map((c) => {
          const n = damage[c.id] ?? 0;
          return (
            <div className={n >= 15 ? 'commander-damage-row danger' : 'commander-damage-row'} key={c.id}>
              <span title={defOf(c.defId).name}>
                {owner}: {defOf(c.defId).name.split(',')[0]}
              </span>
              <strong>{n}/21</strong>
              <meter min={0} max={21} value={Math.min(n, 21)} aria-label={`${defOf(c.defId).name} commander damage`} />
            </div>
          );
        });
      })}
    </>
  );
}

/** The most commander damage a player has taken from any one commander. */
const worstCommanderDamage = (view: GameView, pid: PlayerId) => Math.max(0, ...Object.values(view.players[pid]!.commanderDamage));

/** Each seat's panel color, by turn order (as a life-counter app colors its players). */
const SEAT_COLORS = ['#8c2f39', '#2f5f8c', '#3f7a3a', '#8a6a24'];
const seatColor = (view: GameView, pid: PlayerId) => SEAT_COLORS[Math.max(0, view.turnOrder.indexOf(pid)) % SEAT_COLORS.length]!;

/** Commander damage one player has taken from another player's commanders. */
const damageFrom = (view: GameView, target: PlayerId, source: PlayerId) =>
  view.players[source]!.commanders.map((c) => ({ id: c.id, name: defOf(c.defId).name.split(',')[0]!, n: view.players[target]!.commanderDamage[c.id] ?? 0 }));

/**
 * The middle of the table, laid out like a life-counter app: one colored
 * panel per player where they sit (top row, bottom row, as the zones are),
 * meeting in the center. In Commander, clicking a panel turns the square into
 * a map of the table showing the commander damage that player has taken from
 * each seat; click again (or Back) to return. The stack sits just below.
 */
export function CenterHub({ view, top, bottom, stack }: { view: GameView; top: PlayerId[]; bottom: PlayerId[]; stack: ReactNode }) {
  const [selected, setSelected] = useState<PlayerId | null>(null);
  const commander = view.turnOrder.some((pid) => view.players[pid]!.commanders.length);
  const target = selected && view.players[selected] ? selected : null;
  const tile = (pid: PlayerId) => {
    const p = view.players[pid]!;
    const style = { '--seat': seatColor(view, pid) } as CSSProperties;
    const classes = `hub-tile ${view.activePlayer === pid ? 'active' : ''} ${p.eliminated ? 'eliminated' : ''}`;
    if (target) {
      // The map: this seat's commander damage to the selected player.
      if (pid === target)
        return (
          <button key={pid} className={`${classes} target`} style={style} onClick={() => setSelected(null)} aria-label={`${pid}: back to life totals`}>
            <span className="hub-name">{pid}</span>
            <span className="hub-caption">took</span>
          </button>
        );
      const from = damageFrom(view, target, pid);
      return (
        <div key={pid} className={`${classes} source`} style={style} title={from.map((d) => `${d.name}: ${d.n}/21`).join(', ') || 'No commander'}>
          <span className="hub-name">{pid}</span>
          {from.length ? (
            from.map((d) => (
              <strong key={d.id} className={`hub-dmg ${d.n >= 15 ? 'danger' : ''}`} aria-label={`${d.name} commander damage to ${target}: ${d.n} of 21`}>
                {d.n}
              </strong>
            ))
          ) : (
            <span className="hub-caption">—</span>
          )}
        </div>
      );
    }
    const worst = worstCommanderDamage(view, pid);
    return (
      <button
        key={pid}
        className={classes}
        style={style}
        aria-label={`${pid}, ${p.life} life${commander ? '. Show commander damage taken' : ''}`}
        onClick={() => commander && setSelected(pid)}
      >
        <span className="hub-name">{pid}</span>
        <Life life={p.life} />
        {((p.poison ?? 0) > 0 || (commander && worst > 0)) && (
          <span className="hub-extras">
            {(p.poison ?? 0) > 0 && <span className="poison-count" title="Poison counters (ten loses the game)">☠{p.poison}</span>}
            {commander && worst > 0 && (
              <span className={`hub-cmdr ${worst >= 15 ? 'danger' : ''}`} title="Most commander damage from one commander">
                ⚔{worst}
              </span>
            )}
          </span>
        )}
      </button>
    );
  };
  return (
    <div className={`center-hub ${target ? 'detail' : ''}`} aria-label={target ? `${target}: commander damage taken` : 'Life totals'}>
      {target && (
        <div className="hub-detail-title">
          <span>
            Commander damage to <strong>{target}</strong>
          </span>
          <button className="ghost" onClick={() => setSelected(null)} autoFocus>
            Back
          </button>
        </div>
      )}
      <div className="hub-square">
        <div className={`hub-row n${top.length}`}>{top.map(tile)}</div>
        <div className={`hub-row n${bottom.length}`}>{bottom.map(tile)}</div>
        <span className="hub-gem" aria-hidden="true" />
      </div>
      <div className="hub-stack" data-pile="stack">
        {stack}
      </div>
    </div>
  );
}
