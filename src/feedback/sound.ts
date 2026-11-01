import { PALETTE } from '../model/palette';

/** One short tone per completion, in its track's pitch. */
const TONE_SECONDS = 0.12;
const TONE_GAIN = 0.2;
const RAMP_SECONDS = 0.02;

/** One quiet chord when the pie empties: C, E, G. */
const CHORD_HZ = [262, 330, 392];
const CHORD_SECONDS = 0.6;
const CHORD_GAIN = 0.15;

export function pitchFor(color: number): number {
  return PALETTE[color % PALETTE.length].pitchHz;
}

function sine(ctx: AudioContext, hz: number, seconds: number, level: number): void {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = hz;
  const t = ctx.currentTime;
  gain.gain.setValueAtTime(level, t);
  gain.gain.setValueAtTime(level, t + seconds - RAMP_SECONDS);
  gain.gain.linearRampToValueAtTime(0, t + seconds);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(t);
  oscillator.stop(t + seconds);
}

export function playTone(ctx: AudioContext, hz: number): void {
  sine(ctx, hz, TONE_SECONDS, TONE_GAIN);
}

export function playChord(ctx: AudioContext): void {
  for (const hz of CHORD_HZ) sine(ctx, hz, CHORD_SECONDS, CHORD_GAIN);
}
