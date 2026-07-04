/**
 * Tiny synthesized sound effects via WebAudio — no audio files needed.
 * Audio contexts must be created after a user gesture, so we lazily
 * initialize on the first sound.
 */

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, duration: number, type: OscillatorType, volume: number, delay = 0): void {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  osc.connect(gain).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + duration);
}

function noise(duration: number, volume: number): void {
  const a = ac();
  if (!a) return;
  const buffer = a.createBuffer(1, a.sampleRate * duration, a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  }
  const src = a.createBufferSource();
  const gain = a.createGain();
  src.buffer = buffer;
  gain.gain.value = volume;
  src.connect(gain).connect(a.destination);
  src.start();
}

export const sfx = {
  drop(): void {
    tone(500, 0.12, 'triangle', 0.12);
    tone(300, 0.15, 'triangle', 0.1, 0.05);
  },
  correct(): void {
    tone(660, 0.1, 'sine', 0.16);
    tone(880, 0.12, 'sine', 0.16, 0.08);
    tone(1320, 0.18, 'sine', 0.12, 0.16);
  },
  wrong(): void {
    noise(0.35, 0.22);
    tone(90, 0.4, 'sawtooth', 0.2);
  },
  levelUp(): void {
    tone(523, 0.1, 'square', 0.1);
    tone(659, 0.1, 'square', 0.1, 0.09);
    tone(784, 0.1, 'square', 0.1, 0.18);
    tone(1047, 0.22, 'square', 0.1, 0.27);
  },
  gameOver(): void {
    tone(400, 0.25, 'sawtooth', 0.12);
    tone(300, 0.25, 'sawtooth', 0.12, 0.2);
    tone(200, 0.5, 'sawtooth', 0.12, 0.4);
  },
};
