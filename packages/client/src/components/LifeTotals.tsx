import { useState, type ReactNode } from 'react';
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

/**
 * The middle of the table: each player's life total where they sit (top row,
 * bottom row, as the zones are laid out), with the stack between them. Click
 * a player to see the commander damage they've taken, right here.
 */
export function CenterHub({ view, top, bottom, stack }: { view: GameView; top: PlayerId[]; bottom: PlayerId[]; stack: ReactNode }) {
  const [selected, setSelected] = useState<PlayerId | null>(null);
  const commander = view.turnOrder.some((pid) => view.players[pid]!.commanders.length);
  const tile = (pid: PlayerId) => {
    const p = view.players[pid]!;
    const worst = worstCommanderDamage(view, pid);
    return (
      <button
        key={pid}
        className={`hub-tile ${view.activePlayer === pid ? 'active' : ''} ${p.eliminated ? 'eliminated' : ''}`}
        aria-label={`${pid}, ${p.life} life${commander ? '. Show commander damage taken' : ''}`}
        onClick={() => commander && setSelected(pid)}
      >
        <span className="hub-name">{pid}</span>
        <Life life={p.life} />
        <span className="hub-extras">
          {(p.poison ?? 0) > 0 && <span className="poison-count" title="Poison counters (ten loses the game)">☠ {p.poison}</span>}
          {commander && worst > 0 && (
            <span className={`hub-cmdr ${worst >= 15 ? 'danger' : ''}`} title="Most commander damage from one commander">
              ⚔ {worst}
            </span>
          )}
        </span>
      </button>
    );
  };
  const stackPile = (
    <div className="hub-stack" data-pile="stack">
      {stack}
    </div>
  );
  if (selected && view.players[selected]) {
    return (
      <div className="center-hub detail" aria-label="Life totals">
        <div className="hub-detail" aria-label={`${selected}: commander damage taken`}>
          <div className="hub-detail-title">
            <strong>{selected}</strong>
            <span>commander damage taken</span>
            <button className="ghost" onClick={() => setSelected(null)} autoFocus>
              Back
            </button>
          </div>
          <CommanderDamageBreakdown view={view} target={selected} />
        </div>
        {stackPile}
      </div>
    );
  }
  return (
    <div className="center-hub" aria-label="Life totals">
      <div className={`hub-row n${top.length}`}>{top.map(tile)}</div>
      {stackPile}
      <div className={`hub-row n${bottom.length}`}>{bottom.map(tile)}</div>
    </div>
  );
}
