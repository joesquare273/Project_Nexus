// Loading screens: before an online game opens on the board (a Commander
// table, a draft event game) and while a draft event gets going. A game's
// screen runs the precheck (game/precheck.ts): the cards are known, the
// board can read the game, and the card images are loaded. It stays up for
// a moment at least, so who's playing (and who moved up) can be read.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { GameSession } from '../game/session.ts';
import { precheckGame, type PrecheckResult } from '../game/precheck.ts';

export interface LoadingStep {
  label: string;
  state: 'waiting' | 'working' | 'done' | 'failed';
  detail?: string;
}

/** A full-page loading screen with a title, what's happening, and a progress bar. */
export function LoadingScreen({ title, subtitle, steps, progress, children }: { title: string; subtitle?: ReactNode; steps: LoadingStep[]; progress?: number; children?: ReactNode }) {
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="loading-card">
        <div className="loading-sigil" aria-hidden="true">
          ✦
        </div>
        <h1>{title}</h1>
        {subtitle && <div className="loading-subtitle">{subtitle}</div>}
        <ul className="loading-steps">
          {steps.map((s) => (
            <li key={s.label} className={`step-${s.state}`}>
              <span className="step-mark" aria-hidden="true">
                {s.state === 'done' ? '✓' : s.state === 'failed' ? '!' : s.state === 'working' ? '◌' : '·'}
              </span>
              {s.label}
              {s.detail && <span className="step-detail"> {s.detail}</span>}
            </li>
          ))}
        </ul>
        {progress !== undefined && (
          <div className="loading-bar" aria-hidden="true">
            <div style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }} />
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/**
 * The screen before an online game: runs the precheck, then hands the game
 * to the board. If something would break the board, it says so and lets the
 * player continue anyway or go back.
 */
export function GameLoading({ session, title, subtitle, minMs = 1200, onReady, onCancel }: { session: GameSession; title: string; subtitle?: ReactNode; minMs?: number; onReady: () => void; onCancel?: () => void }) {
  const [progress, setProgress] = useState({ loaded: 0, total: 0 });
  const [result, setResult] = useState<PrecheckResult | null>(null);
  const started = useRef(Date.now());
  const ready = useRef(onReady);
  ready.current = onReady;
  useEffect(() => {
    let live = true;
    void precheckGame(session, (p) => live && setProgress(p)).then((r) => {
      if (!live) return;
      setResult(r);
      if (r.problems.length === 0) window.setTimeout(() => live && ready.current(), Math.max(0, minMs - (Date.now() - started.current)));
    });
    return () => {
      live = false;
    };
  }, [session, minMs]);
  const imagesDone = result !== null;
  const steps: LoadingStep[] = [
    { label: 'Game received from the server', state: 'done' },
    { label: 'Cards checked', state: result ? (result.problems.length ? 'failed' : 'done') : 'working' },
    {
      label: 'Card images',
      state: imagesDone ? 'done' : 'working',
      detail: progress.total ? `${progress.loaded}/${progress.total}${result?.failed ? ` (${result.failed} will show as frames)` : ''}` : undefined,
    },
  ];
  return (
    <LoadingScreen title={title} subtitle={subtitle} steps={steps} progress={progress.total ? progress.loaded / progress.total : imagesDone ? 1 : 0}>
      {result && result.problems.length > 0 && (
        <div className="loading-problems">
          {result.problems.map((p) => (
            <p key={p} className="online-error">
              {p}
            </p>
          ))}
          <div className="format-choices">
            <button className="primary" onClick={onReady}>
              Continue anyway
            </button>
            {onCancel && <button onClick={onCancel}>Back</button>}
          </div>
        </div>
      )}
    </LoadingScreen>
  );
}
