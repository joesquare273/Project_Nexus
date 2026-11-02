// The first sign-in tour (economy step E1c): a few steps that point at the
// parts of the menu, one at a time. It runs once per account (after the free
// precon pick), wherever the player signs in: finishing or skipping it is
// saved on the account (/api/onboarding). The Tour button replays it.

import { useEffect, useLayoutEffect, useState } from 'react';
import { starterSettled } from './StarterPick.tsx';
import { finishOnboarding, loadOnboarding } from './onboarding.ts';

interface Step {
  /** What to point at; null for a step in the middle of the screen. */
  target: string | null;
  title: string;
  text: string;
}

const STEPS: Step[] = [
  { target: null, title: 'Welcome to Project Nexus', text: 'A quick look around. You can skip this, and replay it any time with the Tour button.' },
  { target: '[data-nav="home"]', title: 'Home', text: 'Start here: the lesson for new players, and shortcuts to everything else.' },
  { target: '[data-nav="play"]', title: 'Play', text: 'Play the computer (Starter Kits or Commander), a friend online, or a booster draft.' },
  { target: '[data-nav="collection"]', title: 'Collection', text: 'Every card you own, with its finishes. Your free precon is in here too.' },
  { target: '[data-nav="decks"]', title: 'Decks', text: 'Build and edit your own decks from your collection.' },
  { target: '[data-nav="shop"]', title: 'Shop', text: 'Open booster packs, and buy exclusive printings in the Store.' },
  { target: '.account-chip', title: 'Your account', text: 'Your Aether Shards. You earn them by playing and spend them on packs and events.' },
];

/** Asks the tour to start again (the Tour button). */
export function replayTour(): void {
  window.dispatchEvent(new Event('nexus:tour'));
}

export function Tour() {
  const [step, setStep] = useState<number | null>(null);
  const [box, setBox] = useState<DOMRect | null>(null);

  // Start once the precon pick is out of the way, if this account hasn't seen it.
  useEffect(() => {
    let stopped = false;
    // Only when the account says it hasn't been seen (not when the server can't be reached).
    void loadOnboarding().then((state) => {
      if (!state || state.tour || stopped) return;
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
    void finishOnboarding('tour');
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
