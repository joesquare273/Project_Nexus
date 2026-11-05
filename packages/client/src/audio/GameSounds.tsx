// Plays the board's sounds as it draws each batch of events (the same
// moment the card flights start), and switches the background sound to
// in-game ambience while the board is up.

import { useEffect, useLayoutEffect, useRef } from 'react';
import type { SoundCue } from './cues.ts';
import { playCues, setScene } from './mixer.ts';

export function GameSounds({ sounds }: { sounds: readonly { key: number; cues: SoundCue[] }[] }) {
  // Sounds from before the board appeared (the opening hands) don't play.
  const seen = useRef(sounds.at(-1)?.key ?? 0);
  useLayoutEffect(() => {
    const fresh = sounds.filter((s) => s.key > seen.current);
    if (!fresh.length) return;
    seen.current = fresh.at(-1)!.key;
    // Several batches at once (a fast computer turn): only the latest few.
    playCues(fresh.slice(-2).flatMap((s) => s.cues).slice(0, 5));
  });
  useEffect(() => {
    setScene('game');
    return () => setScene('menu');
  }, []);
  return null;
}
