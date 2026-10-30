import { expect, test, vi } from 'vitest';
import { KIND_ORDER } from '../model/kinds';
import { pitchFor, playChord, playTone } from './sound';

interface FakeOscillator {
  type: string;
  frequency: { value: number };
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

function fakeContext() {
  const oscillators: FakeOscillator[] = [];
  const ctx = {
    currentTime: 1,
    destination: {},
    createOscillator: () => {
      const o: FakeOscillator = { type: '', frequency: { value: 0 }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
      oscillators.push(o);
      return o;
    },
    createGain: () => ({
      gain: { value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
    }),
  };
  return { ctx: ctx as unknown as AudioContext, oscillators };
}

test('each kind has its own pitch', () => {
  expect(new Set(KIND_ORDER.map(pitchFor)).size).toBe(4);
  expect(pitchFor('deep')).toBe(262);
});

test('a tone is one short sine at the pitch', () => {
  const { ctx, oscillators } = fakeContext();
  playTone(ctx, 330);
  expect(oscillators).toHaveLength(1);
  expect(oscillators[0].type).toBe('sine');
  expect(oscillators[0].frequency.value).toBe(330);
  expect(oscillators[0].start).toHaveBeenCalledWith(1);
  expect(oscillators[0].stop.mock.calls[0][0]).toBeCloseTo(1.12);
});

test('the chord is three quiet sines held longer', () => {
  const { ctx, oscillators } = fakeContext();
  playChord(ctx);
  expect(oscillators.map((o) => o.frequency.value)).toEqual([262, 330, 392]);
  expect(oscillators[0].stop.mock.calls[0][0]).toBeCloseTo(1.6);
});
