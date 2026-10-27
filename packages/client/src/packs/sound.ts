// Small synthesized sounds for opening packs (no audio files): a tear, a
// card flip and a chime for big pulls. Off unless the player turns it on.

const KEY = 'nexus.packs.sound';
let ctx: AudioContext | null = null;

export function soundOn(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}

export function setSoundOn(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // Remembered for this visit only.
  }
}

export function sound(kind: 'tear' | 'flip' | 'chime'): void {
  if (!soundOn()) return;
  try {
    ctx ??= new AudioContext();
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    if (kind === 'chime') {
      for (const [i, f] of [660, 880, 1320].entries()) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.frequency.value = f;
        g.gain.setValueAtTime(0, now + i * 0.08);
        g.gain.linearRampToValueAtTime(0.12, now + i * 0.08 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.9);
        osc.connect(g).connect(ctx.destination);
        osc.start(now + i * 0.08);
        osc.stop(now + i * 0.08 + 1);
      }
      return;
    }
    // Tear and flip: filtered noise bursts.
    const length = kind === 'tear' ? 0.35 : 0.08;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * length), ctx.sampleRate);
    const ch = buffer.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = kind === 'tear' ? 'bandpass' : 'highpass';
    filter.frequency.value = kind === 'tear' ? 2400 : 3000;
    gain.gain.value = kind === 'tear' ? 0.25 : 0.15;
    src.connect(filter).connect(gain);
    src.start(now);
  } catch {
    // No audio available.
  }
}
