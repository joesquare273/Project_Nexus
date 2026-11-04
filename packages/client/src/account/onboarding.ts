// First-time help a player has finished (the menu tour and the "Learn to play"
// lesson), kept on the account by the game server (/api/onboarding), so it
// doesn't come back in another browser or a private window.

import { useEffect, useState } from 'react';
import { accessToken, supabase } from './AccountBar.tsx';

export interface Onboarding {
  tour?: boolean;
  lesson?: boolean;
}
export type OnboardingStep = keyof Onboarding;

/** Where an older version of the menu remembered the tour, per account, in this browser only. */
const LEGACY_TOUR_KEY = 'nexus.tour.v1.';

let loaded: Promise<Onboarding | null> | null = null;
const EVENT = 'nexus:onboarding';

async function fetchOnboarding(): Promise<Onboarding | null> {
  const token = await accessToken();
  if (!token) return null;
  const res = await fetch('/api/onboarding', { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const state = (await res.json()) as Onboarding;
  // The tour finished before it was saved on the account: save it now.
  if (!state.tour) {
    const userId = (await supabase?.auth.getSession())?.data.session?.user.id;
    let legacy = false;
    try {
      legacy = !!userId && localStorage.getItem(LEGACY_TOUR_KEY + userId) === 'done';
    } catch {
      // Storage blocked: nothing to carry over.
    }
    if (legacy) return (await finishOnboarding('tour')) ?? { ...state, tour: true };
  }
  return state;
}

/** What the player has finished; null when the server can't say (then nothing is shown automatically). */
export function loadOnboarding(): Promise<Onboarding | null> {
  loaded ??= fetchOnboarding().catch(() => null);
  return loaded;
}

/** Records a finished step on the account and tells the menu. */
export async function finishOnboarding(step: OnboardingStep): Promise<Onboarding | null> {
  const token = await accessToken();
  if (!token) return null;
  try {
    const res = await fetch('/api/onboarding', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ step }),
    });
    if (!res.ok) return null;
    const { reward, ...state } = (await res.json()) as Onboarding & { reward?: { label: string; amount: number; balance: number } };
    // Finishing the lesson pays a one-time reward (the server decides).
    if (reward) {
      window.dispatchEvent(new CustomEvent<number>('nexus:shards', { detail: reward.balance }));
      window.dispatchEvent(new CustomEvent('nexus:reward', { detail: { label: reward.label, amount: reward.amount } }));
    }
    loaded = Promise.resolve(state);
    window.dispatchEvent(new CustomEvent<Onboarding>(EVENT, { detail: state }));
    return state;
  } catch {
    return null;
  }
}

/** The player's onboarding state, updating when a step is finished; null until known. */
export function useOnboarding(): Onboarding | null {
  const [state, setState] = useState<Onboarding | null>(null);
  useEffect(() => {
    let live = true;
    void loadOnboarding().then((s) => live && setState(s ?? {}));
    const update = (e: Event) => setState((e as CustomEvent<Onboarding>).detail);
    window.addEventListener(EVENT, update);
    return () => {
      live = false;
      window.removeEventListener(EVENT, update);
    };
  }, []);
  return state;
}
