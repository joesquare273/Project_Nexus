// The game's sound: three groups (Effects, Ambience, Music), each with its
// own volume, remembered on this device. Off until the player turns it on.
//
// Files come from public/audio/, listed in public/audio/manifest.json, which
// `npm run audio` writes after downloading the free packs (docs/audio.md).
// An effect with no file is synthesized here instead (no files needed), so
// the game has sound even before the packs are downloaded. Ambience and
// music play only from files.

import type { SoundCue, SoundId } from './cues.ts';

export interface AudioSettings {
  on: boolean;
  effects: number;
  ambience: number;
  music: number;
}

export interface AudioManifest {
  effects?: Partial<Record<SoundId, string[]>>;
  ambience?: string[];
  music?: string[];
}

export type Scene = 'menu' | 'game' | 'none';

const KEY = 'nexus.audio';
export const DEFAULT_SETTINGS: AudioSettings = { on: false, effects: 0.7, ambience: 0.35, music: 0.35 };
/** Other players' sounds play at this share of the volume. */
const THEIRS = 0.6;
/** At most this many effects sound at once. */
const MAX_VOICES = 6;

function load(): AudioSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<AudioSettings> | null;
    return { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

let settings = load();
const listeners = new Set<() => void>();

export const audioSettings = (): AudioSettings => settings;

export function setAudioSettings(change: Partial<AudioSettings>): void {
  settings = { ...settings, ...change };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Remembered for this visit only.
  }
  if (settings.on) void unlock();
  applyLoopVolume();
  for (const l of listeners) l();
}

export function onAudioSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ---------- Files ----------

let manifest: AudioManifest | null = null;
let manifestLoading: Promise<AudioManifest> | null = null;

/** The downloaded files, if `npm run audio` has been run (an empty list otherwise). */
export function loadManifest(): Promise<AudioManifest> {
  manifestLoading ??= fetch('/audio/manifest.json')
    .then((r) => (r.ok ? (r.json() as Promise<AudioManifest>) : {}))
    .catch(() => ({}))
    .then((m) => (manifest = m));
  return manifestLoading;
}

let ctx: AudioContext | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();

function context(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    return ctx;
  } catch {
    return null;
  }
}

function buffer(url: string): Promise<AudioBuffer | null> {
  let b = buffers.get(url);
  if (!b) {
    b = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(url))))
      .then((data) => context()!.decodeAudioData(data))
      .catch(() => null);
    buffers.set(url, b);
  }
  return b;
}

// ---------- Effects ----------

let voices = 0;

/** Plays the board's sounds for one batch of events, a few milliseconds apart. */
export function playCues(cues: readonly SoundCue[]): void {
  if (!settings.on || settings.effects <= 0 || !cues.length) return;
  cues.forEach((cue, i) => window.setTimeout(() => void play(cue.id, cue.mine ? 1 : THEIRS), i * 60));
}

export async function play(id: SoundId, share = 1): Promise<void> {
  if (!settings.on || settings.effects <= 0 || voices >= MAX_VOICES) return;
  const c = context();
  if (!c) return;
  if (c.state === 'suspended') void c.resume().catch(() => {});
  const files = (manifest ?? (await loadManifest())).effects?.[id];
  const volume = settings.effects * share;
  voices++;
  window.setTimeout(() => voices--, 400);
  if (files?.length) {
    const b = await buffer(`/audio/${files[Math.floor(Math.random() * files.length)]}`);
    if (b) {
      const src = c.createBufferSource();
      const g = c.createGain();
      g.gain.value = volume;
      src.buffer = b;
      // A small random pitch change keeps repeats from sounding mechanical.
      src.playbackRate.value = 0.94 + Math.random() * 0.12;
      src.connect(g).connect(c.destination);
      src.start();
      return;
    }
  }
  synth(c, id, volume);
}

/** A short synthesized version of each sound, for when its file isn't there. */
function synth(c: AudioContext, id: SoundId, volume: number): void {
  const now = c.currentTime;
  const out = c.createGain();
  out.gain.value = volume * 0.5;
  out.connect(c.destination);
  const noise = (at: number, dur: number, freq: number, q: number, gain: number, type: BiquadFilterType = 'bandpass', sweepTo?: number) => {
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const b = c.createBuffer(1, len, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = b;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, now + at);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, now + at + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0, now + at);
    g.gain.linearRampToValueAtTime(gain, now + at + Math.min(0.012, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.001, now + at + dur);
    src.connect(f).connect(g).connect(out);
    src.start(now + at);
    src.stop(now + at + dur + 0.02);
  };
  const tone = (at: number, dur: number, freq: number, gain: number, type: OscillatorType = 'sine', glideTo?: number) => {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, now + at);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, now + at + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, now + at);
    g.gain.linearRampToValueAtTime(gain, now + at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, now + at + dur);
    o.connect(g).connect(out);
    o.start(now + at);
    o.stop(now + at + dur + 0.02);
  };
  const chord = (at: number, freqs: number[], dur: number, gain: number, step = 0.07) => freqs.forEach((f, i) => tone(at + i * step, dur, f, gain, 'triangle'));
  switch (id) {
    case 'draw': noise(0, 0.12, 2600, 1.2, 0.5, 'bandpass', 1400); break;
    case 'shuffle': for (let i = 0; i < 9; i++) noise(i * 0.035, 0.05, 3000 + (i % 3) * 400, 2, 0.35); break;
    case 'land': noise(0, 0.09, 900, 0.8, 0.7, 'lowpass'); tone(0, 0.12, 140, 0.25); break;
    case 'cast': noise(0, 0.08, 3200, 1.5, 0.4); tone(0.03, 0.35, 520, 0.12, 'sine', 780); break;
    case 'castBig': noise(0, 0.1, 3000, 1.5, 0.45); tone(0.03, 0.6, 330, 0.16, 'triangle', 660); tone(0.08, 0.6, 495, 0.1, 'sine', 990); break;
    case 'commander': chord(0, [392, 494, 587, 784], 0.9, 0.12, 0.09); break;
    case 'permanent': noise(0, 0.1, 600, 0.7, 0.8, 'lowpass'); tone(0, 0.18, 110, 0.35); break;
    case 'resolve': tone(0, 0.3, 880, 0.12, 'sine', 1320); noise(0, 0.2, 5000, 1, 0.15, 'highpass'); break;
    case 'countered': noise(0, 0.25, 1800, 0.8, 0.4, 'lowpass', 300); tone(0, 0.25, 300, 0.12, 'sine', 120); break;
    case 'tap': noise(0, 0.04, 1800, 3, 0.35); break;
    case 'untap': noise(0, 0.1, 2400, 1, 0.25, 'bandpass', 3600); break;
    case 'attack': noise(0, 0.3, 1200, 1.2, 0.35, 'bandpass', 4200); tone(0, 0.25, 180, 0.12, 'sawtooth', 260); break;
    case 'block': noise(0, 0.07, 800, 1, 0.6, 'lowpass'); tone(0, 0.1, 220, 0.2, 'square'); break;
    case 'damage': noise(0, 0.12, 500, 0.8, 0.8, 'lowpass'); tone(0, 0.15, 90, 0.4); break;
    case 'damageBig': noise(0, 0.3, 400, 0.6, 1, 'lowpass'); tone(0, 0.35, 70, 0.5, 'sine', 40); break;
    case 'die': tone(0, 0.4, 200, 0.25, 'sine', 70); noise(0, 0.2, 300, 0.7, 0.4, 'lowpass'); break;
    case 'wipe': noise(0, 0.9, 800, 0.5, 0.9, 'lowpass', 120); tone(0, 0.9, 110, 0.4, 'sawtooth', 40); break;
    case 'exile': noise(0, 0.45, 600, 1, 0.45, 'bandpass', 6000); break;
    case 'lifeGain': chord(0, [523, 659, 784], 0.45, 0.1); break;
    case 'lifeLoss': tone(0, 0.35, 330, 0.15, 'triangle', 196); break;
    case 'counter': tone(0, 0.05, 2400, 0.12, 'square'); noise(0, 0.04, 4000, 3, 0.25); break;
    case 'token': tone(0, 0.12, 660, 0.14, 'sine', 990); break;
    case 'yourTurn': chord(0, [659, 988], 0.6, 0.1, 0.12); break;
    case 'dice': for (let i = 0; i < 5; i++) noise(i * 0.06 + Math.random() * 0.02, 0.04, 2200, 4, 0.4); break;
    case 'coin': tone(0, 0.5, 2100, 0.08, 'sine'); tone(0.01, 0.5, 3150, 0.05, 'sine'); break;
    case 'win': chord(0, [523, 659, 784, 1047], 1.4, 0.14, 0.12); break;
    case 'lose': chord(0, [392, 311, 262], 1.2, 0.12, 0.2); break;
  }
}

// ---------- Ambience and music ----------

let scene: Scene = 'none';
let loop: { el: HTMLAudioElement; group: 'ambience' | 'music'; list: string[]; index: number } | null = null;

const loopVolume = () => (loop && settings.on ? settings[loop.group] * 0.6 : 0);

function applyLoopVolume(): void {
  if (!loop) return void startScene();
  loop.el.volume = Math.min(1, loopVolume());
  if (!settings.on || loopVolume() === 0) loop.el.pause();
  else void loop.el.play().catch(() => {});
}

/** What's going on, for the background sound: music in the menus, ambience in a game. */
export function setScene(next: Scene): void {
  if (next === scene) return;
  scene = next;
  stopLoop();
  void startScene();
}

function stopLoop(): void {
  if (!loop) return;
  const el = loop.el;
  loop = null;
  // A short fade, not a cut.
  const start = el.volume;
  let i = 0;
  const fade = window.setInterval(() => {
    i++;
    el.volume = Math.max(0, start * (1 - i / 10));
    if (i >= 10) {
      window.clearInterval(fade);
      el.pause();
      el.src = '';
    }
  }, 40);
}

async function startScene(): Promise<void> {
  if (!settings.on || scene === 'none' || loop) return;
  const m = manifest ?? (await loadManifest());
  if (loop || (scene as Scene) === 'none') return;
  // In a game: ambience, or the music quietly when there's no ambience.
  const group: 'ambience' | 'music' = scene === 'game' && m.ambience?.length ? 'ambience' : 'music';
  const list = (group === 'ambience' ? m.ambience : m.music) ?? [];
  if (!list.length) return;
  const index = Math.floor(Math.random() * list.length);
  const el = new Audio(`/audio/${list[index]}`);
  el.loop = list.length === 1;
  el.preload = 'auto';
  loop = { el, group, list, index };
  el.onended = () => {
    if (!loop || loop.el !== el) return;
    loop.index = (loop.index + 1) % loop.list.length;
    el.src = `/audio/${loop.list[loop.index]}`;
    void el.play().catch(() => {});
  };
  applyLoopVolume();
}

/** Browsers keep sound off until the first click or key press; start then. */
async function unlock(): Promise<void> {
  const c = context();
  if (c?.state === 'suspended') await c.resume().catch(() => {});
  if (loop) void loop.el.play().catch(() => {});
  else void startScene();
}

if (typeof window !== 'undefined') {
  const first = () => {
    if (settings.on) void unlock();
  };
  window.addEventListener('pointerdown', first, { passive: true });
  window.addEventListener('keydown', first);
}
