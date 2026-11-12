// Quests and one-time rewards on the home page (GET /api/rewards), and a short
// notice when the server pays a reward outside a game (finishing the lesson).
// The server decides and pays every reward; this only shows what it says.

import { useEffect, useState } from 'react';
import { accessToken, ShardIcon, useSession } from './AccountBar.tsx';

interface QuestView {
  id: string;
  period: 'daily' | 'weekly';
  label: string;
  target: number;
  reward: number;
  progress: number;
  complete: boolean;
}
interface RewardsView {
  quests: QuestView[];
  milestones: { id: string; label: string; reward: number; done: boolean }[];
  matches: { botMatch: { completion: number; winBonus: number }; friendMatch: { completion: number; winBonus: number } };
}

/** A reward the browser should announce: { label, amount }. */
export const REWARD_EVENT = 'nexus:reward';
export function announceReward(label: string, amount: number): void {
  window.dispatchEvent(new CustomEvent(REWARD_EVENT, { detail: { label, amount } }));
}

export function Quests() {
  const [view, setView] = useState<RewardsView | null>(null);
  // Quests are per account: load them again if the signed-in account changes.
  const userId = useSession().session?.user.id;
  useEffect(() => {
    let live = true;
    setView(null);
    if (!userId) return;
    void accessToken()
      .then(async (token) => {
        if (!token) return;
        const res = await fetch('/api/rewards', { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok && live) setView((await res.json()) as RewardsView);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [userId]);
  if (!view) return null;
  const m = view.matches;
  return (
    <section className="home-quests" aria-label="Quests">
      <div className="home-quests-head">
        <h2>Quests</h2>
        <p className="fineprint">
          Every game on the game server pays: <ShardIcon size={14} /> {m.botMatch.completion} against the computer (+{m.botMatch.winBonus} for a win), {m.friendMatch.completion} with friends (+
          {m.friendMatch.winBonus}).
        </p>
      </div>
      <div className="quest-list">
        {view.quests.map((q) => (
          <div key={q.id} className={`quest ${q.complete ? 'done' : ''}`}>
            <div className="quest-top">
              <span className="quest-period">{q.period === 'daily' ? 'Today' : 'This week'}</span>
              <span className="quest-reward">
                <ShardIcon size={14} /> {q.reward.toLocaleString()}
              </span>
            </div>
            <div className="quest-label">{q.label}</div>
            <div className="quest-bar" role="progressbar" aria-valuemin={0} aria-valuemax={q.target} aria-valuenow={q.progress}>
              <span style={{ width: `${(q.progress / q.target) * 100}%` }} />
            </div>
            <div className="fineprint">{q.complete ? 'Done' : `${q.progress} / ${q.target}`}</div>
          </div>
        ))}
        {view.milestones
          .filter((x) => !x.done)
          .map((x) => (
            <div key={x.id} className="quest once">
              <div className="quest-top">
                <span className="quest-period">Once</span>
                <span className="quest-reward">
                  <ShardIcon size={14} /> {x.reward.toLocaleString()}
                </span>
              </div>
              <div className="quest-label">{x.label}</div>
            </div>
          ))}
      </div>
    </section>
  );
}

/** "+500 Aether Shards: Finished the lesson", for a few seconds. */
export function RewardToast() {
  const [shown, setShown] = useState<{ label: string; amount: number } | null>(null);
  useEffect(() => {
    let timer: number | undefined;
    const on = (e: Event) => {
      setShown((e as CustomEvent<{ label: string; amount: number }>).detail);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setShown(null), 5000);
    };
    window.addEventListener(REWARD_EVENT, on);
    return () => {
      window.removeEventListener(REWARD_EVENT, on);
      window.clearTimeout(timer);
    };
  }, []);
  if (!shown) return null;
  return (
    <div className="reward-toast" role="status">
      <ShardIcon size={18} /> +{shown.amount.toLocaleString()} · {shown.label}
    </div>
  );
}
