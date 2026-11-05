// Sound on/off and the three volumes (Effects, Ambience, Music), for the
// in-game settings panel and the account menu.

import { useEffect, useState } from 'react';
import { audioSettings, onAudioSettings, play, setAudioSettings, type AudioSettings } from './mixer.ts';

const GROUPS: [keyof Omit<AudioSettings, 'on'>, string, string][] = [
  ['effects', 'Effects', 'Cards, combat, life'],
  ['ambience', 'Ambience', 'Background sound during games'],
  ['music', 'Music', 'Menus (and games without ambience)'],
];

export function SoundSettings() {
  const [s, setS] = useState(audioSettings());
  useEffect(() => onAudioSettings(() => setS(audioSettings())), []);
  return (
    <fieldset className="sound-settings">
      <legend>Sound</legend>
      <label>
        <input type="checkbox" checked={s.on} onChange={(e) => setAudioSettings({ on: e.target.checked })} /> Sound on
      </label>
      {GROUPS.map(([key, label, help]) => (
        <label key={key} className="sound-slider" title={help}>
          <span>{label}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={s[key]}
            disabled={!s.on}
            aria-label={`${label} volume`}
            onChange={(e) => setAudioSettings({ [key]: Number(e.target.value) })}
            onPointerUp={() => key === 'effects' && void play('cast')}
          />
        </label>
      ))}
    </fieldset>
  );
}
