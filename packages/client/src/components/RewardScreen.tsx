// The end of a game: the result, what you earned (each reward in turn, the
// total counting up, your new balance) and your quest progress, then
// Continue. The server sends the rewards just after the game ends; a game
// that earns nothing says why.

import { useEffect, useState } from 'react';
import { ShardIcon } from '../account/AccountBar.tsx';
import { Quests } from '../account/Rewards.tsx';

export interface RewardScreenProps {
  result: 'win' | 'loss' | 'draw';
  /** Who won, when it wasn't you. */
  winner: string | null;
  turn: number;
  rewards: { lines: { label: string; amount: number }[]; balance: number | null } | null;
  /** Whether this game could pay (it ran on the game server): practice games can't. */
  earnsRewards: boolean;
  continueLabel: string;
  onContinue: () => void;
  /** Hide the screen to look at the final board. */
  onViewBoard: () => void;
}

/** How long to wait for the server's rewards before saying the game earned none. */
const WAIT_MS = 6000;
const LINE_MS = 450;

export function RewardScreen({ result, winner, turn, rewards, earnsRewards, continueLabel, onContinue, onViewBoard }: RewardScreenProps) {
  const [waited, setWaited] = useState(false);
  /** The banner art didn't load: the word instead. */
  const [bannerFailed, setBannerFailed] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setWaited(true), WAIT_MS);
    return () => window.clearTimeout(t);
  }, []);
  const lines = rewards?.lines ?? [];
  const total = lines.reduce((n, l) => n + l.amount, 0);
  const counted = useCountUp(total, lines.length * LINE_MS);
  const waiting = earnsRewards && !rewards && !waited;

  return (
    <div className="reward-screen" role="dialog" aria-modal="true" aria-label="Game results">
      <div className={`reward-card ${result}`}>
        {result === 'draw' || bannerFailed ? (
          <div className="reward-result">{result === 'win' ? 'Victory' : result === 'draw' ? 'Draw' : 'Defeat'}</div>
        ) : (
          <img
            className="reward-banner"
            src={result === 'win' ? '/results/victory.webp' : '/results/defeat.webp'}
            alt={result === 'win' ? 'Victory' : 'Defeat'}
            onError={() => setBannerFailed(true)}
          />
        )}
        <p className="reward-sub">
          {result === 'loss' && winner ? `${winner} won` : result === 'win' ? 'You won' : 'Nobody won'} · turn {turn}
        </p>

        {waiting ? (
          <p className="reward-wait" aria-live="polite">
            Adding up your rewards…
          </p>
        ) : lines.length > 0 ? (
          <>
            <h3>You earned</h3>
            <ul className="reward-lines">
              {lines.map((l, i) => (
                <li key={l.label} style={{ animationDelay: `${i * LINE_MS}ms` }}>
                  <span>{l.label}</span>
                  <strong>
                    <ShardIcon size={18} /> +{l.amount.toLocaleString()}
                  </strong>
                </li>
              ))}
            </ul>
            <div className="reward-total" aria-live="polite">
              <span>Total</span>
              <strong>
                <ShardIcon size={24} /> +{counted.toLocaleString()}
              </strong>
            </div>
            {rewards?.balance !== null && rewards?.balance !== undefined && <p className="fineprint">Your balance: {rewards.balance.toLocaleString()} Aether Shards</p>}
          </>
        ) : (
          <p className="reward-none">
            {earnsRewards
              ? 'This game earned no shards: games pay once every player has had two turns, and never to a player who conceded.'
              : 'A practice game: no rewards. Sign in and play the computer with one of your saved decks, or play online, to earn Aether Shards.'}
          </p>
        )}

        {/* Quest progress, fresh from the server once the rewards are in. */}
        {earnsRewards && !waiting && <Quests compact />}

        <div className="reward-buttons">
          <button className="ghost" onClick={onViewBoard}>
            View the board
          </button>
          <button className="primary big" onClick={onContinue} autoFocus>
            {continueLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** A number counting up to `to` over `ms` (straight to it with reduced motion). */
function useCountUp(to: number, ms: number): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (to === 0 || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setN(to);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / Math.max(300, ms));
      setN(Math.round(to * (1 - (1 - k) ** 3)));
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [to, ms]);
  return n;
}
