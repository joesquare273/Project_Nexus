// The first sign-in tour (economy step E1c): a few steps that point at the
// parts of the menu, one at a time. It runs once per account in this browser
// (after the free precon pick), can be skipped, and the account bar's "Tour"
// button replays it.

import { useEffect, useLayoutEffect, useState } from 'react';
import { starterSettled } from './StarterPick.tsx';
import { supabase } from './AccountBar.tsx';

interface Step {
  /** What to point at; null for a step in the middle of the screen. */
  target: string | null;
  title: string;
  text: string;
}

const STEPS: Step[] = [
  { target: null, title: 'Welcome to Project Nexus', text: 'A quick look around. You can skip this, and replay it any time with the Tour button.' },
  { target: '.account-bar', title: 'Your account', text: 'Your Discord name and your Aether Shards. You earn shards by playing and spend them on packs and events.' },
  { target: '.menu-tabs button:nth-child(1)', title: 'Play', text: 'Play against the computer: the Final Fantasy Starter Kits, or a Commander game with the precons. Turn on tips for a guided lesson.' },
  { target: '.menu-tabs button:nth-child(2)', title: 'Online', text: 'Play a friend: both of you enter the same room code.' },
  { target: '.menu-tabs button:nth-child(3)', title: 'Draft', text: 'Open six Play Boosters, pick a card from each pack as they pass around the table, then build a 40 to 60 card deck.' },
  { target: '.menu-tabs button:nth-child(4)', title: 'Packs', text: 'Buy and open boosters, browse your collection, and build your own decks (your free precon is there too).' },
  { target: '.menu-tabs button:nth-child(5)', title: 'Store', text: 'Buy exclusive printings one at a time, such as the Chocobo Track foils, set by set.' },
];

const KEY = 'nexus.tour.v1.';

function seen(userId: string): boolean {
  try {
    return localStorage.getItem(KEY + userId) === 'done';
  } catch {
    return true;
  }
}

function markSeen(userId: string): void {
  try {
    localStorage.setItem(KEY + userId, 'done');
  } catch {
    // Not saved; it may show again next time.
  }
}

/** Asks the tour to start again (the account bar's Tour button). */
export function replayTour(): void {
  window.dispatchEvent(new Event('nexus:tour'));
}

export function Tour() {
  const [userId, setUserId] = useState<string | null>(null);
  const [step, setStep] = useState<number | null>(null);
  const [box, setBox] = useState<DOMRect | null>(null);

  // Start once the precon pick is out of the way, if this account hasn't seen it.
  useEffect(() => {
    let stopped = false;
    void supabase?.auth.getSession().then(({ data }) => {
      const id = data.session?.user.id;
      if (!id || stopped) return;
      setUserId(id);
      if (seen(id)) return;
      const wait = window.setInterval(() => {
        if (!starterSettled() || document.querySelector('.starter-pick')) return;
        window.clearInterval(wait);
        if (!stopped) setStep(0);
      }, 400);
    });
    const replay = () => setStep(0);
    window.addEventListener('nexus:tour', replay);
    return () => {
      stopped = true;
      window.removeEventListener('nexus:tour', replay);
    };
  }, []);

  const current = step === null ? null : STEPS[step]!;
  useLayoutEffect(() => {
    if (!current?.target) return setBox(null);
    const place = () => setBox(document.querySelector(current.target!)?.getBoundingClientRect() ?? null);
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [current]);

  if (!current || step === null) return null;
  const finish = () => {
    if (userId) markSeen(userId);
    setStep(null);
  };
  const last = step === STEPS.length - 1;
  const cardTop = box ? Math.min(box.bottom + 12, window.innerHeight - 220) : undefined;

  return (
    <div className="tour" role="dialog" aria-label={current.title}>
      {box && <div className="tour-spot" style={{ top: box.top - 6, left: box.left - 6, width: box.width + 12, height: box.height + 12 }} />}
      <div className={`tour-card ${box ? '' : 'center'}`} style={box ? { top: cardTop, left: Math.max(16, Math.min(box.left, window.innerWidth - 336)) } : undefined}>
        <h3>{current.title}</h3>
        <p>{current.text}</p>
        <div className="tour-buttons">
          <span className="fineprint">
            {step + 1} / {STEPS.length}
          </span>
          <button onClick={finish}>Skip</button>
          {step > 0 && <button onClick={() => setStep(step - 1)}>Back</button>}
          <button className="primary" onClick={() => (last ? finish() : setStep(step + 1))}>
            {last ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
