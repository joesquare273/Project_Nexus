// What the board's colors mean, in one place. It opens by itself the first time someone plays (so the
// colors are learned before they matter), and the Key button in the phase bar brings it back.

import { useEffect, useState } from 'react';

const SEEN = 'nexus.colorKeySeen';

export const COLOR_KEY: { swatch: string; kind: 'ring' | 'badge' | 'fill'; label: string; detail: string }[] = [
  { swatch: 'var(--playable)', kind: 'ring', label: 'Green', detail: 'You can play or use it now: cards in hand, abilities, lands to tap for mana.' },
  { swatch: 'var(--target)', kind: 'ring', label: 'Gold', detail: 'Choose it: a legal target or choice. Picked ones get a white outline, then Confirm.' },
  { swatch: '#ffab52', kind: 'ring', label: 'Orange', detail: 'The target of what just happened. An orange arrow runs from the spell, ability or attacker to it (violet for a trigger).' },
  { swatch: '#4aa8f0', kind: 'badge', label: 'Blue number', detail: 'An activated ability on the stack, under the card it came from. 1 resolves first.' },
  { swatch: '#a774ff', kind: 'badge', label: 'Violet number', detail: 'A triggered ability on the stack, under the card that triggered.' },
  { swatch: 'var(--gold)', kind: 'badge', label: 'Gold number', detail: 'A spell on the stack (in the stack panel).' },
  { swatch: 'var(--attack)', kind: 'ring', label: 'Red', detail: 'Attacking (or able to attack while you declare attackers). Red numbers are damage: they pop up where it lands, and stay on creatures until cleanup.' },
  { swatch: 'var(--block)', kind: 'ring', label: 'Teal', detail: 'Blocking (or able to block while you declare blockers).' },
  { swatch: '#2e8f7e', kind: 'fill', label: 'Dark teal badge', detail: 'One player controls another player\'s turn (The Dominion Bracelet).' },
];

/** Whether the key should open by itself (it hasn't been seen on this device). */
export function firstTimeKey(): boolean {
  try {
    return localStorage.getItem(SEEN) !== '1';
  } catch {
    return false;
  }
}

export function ColorKey({ onClose }: { onClose: () => void }) {
  const close = () => {
    try {
      localStorage.setItem(SEEN, '1');
    } catch {
      /* private window: it just opens again next time */
    }
    onClose();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return (
    <aside className="color-key" role="dialog" aria-label="What the colors mean">
      <div className="color-key-head">
        <strong>What the colors mean</strong>
        <button onClick={close} aria-label="Close the color key">✕</button>
      </div>
      <ul>
        {COLOR_KEY.map((k) => (
          <li key={k.label}>
            <span className={`key-swatch key-${k.kind}`} style={{ ['--sw' as string]: k.swatch }} aria-hidden="true">{k.kind === 'badge' ? '1' : ''}</span>
            <span><strong>{k.label}</strong> — {k.detail}</span>
          </li>
        ))}
      </ul>
      <div className="color-key-foot">Hover any card to read it beside the card. The Key button in the phase bar opens this again.</div>
      <button className="primary" onClick={close}>Got it</button>
    </aside>
  );
}

/** The key's open state: open at first, until it's been seen once on this device. */
export function useColorKey(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(firstTimeKey);
  return [open, setOpen];
}
