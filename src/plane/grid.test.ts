import { expect, test } from 'vitest';
import { MAX_SCALE, MIN_SCALE } from './camera';
import { formatSeconds, GRID_MIN_PX, gridFor, UNITS } from './grid';

test('the grid picks the smallest unit that draws at least GRID_MIN_PX wide', () => {
  // At 0.01 px per second a minute is 0.6 px and an hour is 36 px: the hour is the first that fits.
  expect(gridFor(0.01)).toEqual({ seconds: 3600, px: 36, label: '1 hour' });
});

test('squares grow with zoom until the next unit fits, then drop back', () => {
  // 15 min at 0.03 is 27 px; zoom in to 0.04 and it is 36 px; at 0.07 the 5 min square is 21 px and takes over.
  expect(gridFor(0.03)).toMatchObject({ seconds: 900, px: 27 });
  expect(gridFor(0.04)).toMatchObject({ seconds: 900, px: 36 });
  const five = gridFor(0.07);
  expect(five.seconds).toBe(300);
  expect(five.px).toBeCloseTo(21, 9);
});

test('every zoom in range draws a square of at least GRID_MIN_PX and the ladder is nice', () => {
  for (let s = MIN_SCALE; s <= MAX_SCALE; s *= 1.05) {
    const g = gridFor(s);
    expect(g.px).toBeGreaterThanOrEqual(GRID_MIN_PX);
    expect(UNITS.map((u) => u.seconds)).toContain(g.seconds);
  }
  expect(gridFor(MAX_SCALE)).toMatchObject({ seconds: 1, label: '1 second' });
  expect(gridFor(MIN_SCALE)).toMatchObject({ seconds: 7 * 86400, label: '1 week' });
});

test('a leg reads as its two largest units, whole, and never as a bare zero', () => {
  expect(formatSeconds(0)).toBe('0 s');
  expect(formatSeconds(45)).toBe('45 s');
  expect(formatSeconds(60)).toBe('1 min');
  expect(formatSeconds(8100)).toBe('2 h 15 min');
  expect(formatSeconds(3600)).toBe('1 h');
  expect(formatSeconds(90_000)).toBe('1 d 1 h');
  expect(formatSeconds(86400 * 9)).toBe('1 w 2 d');
  expect(formatSeconds(8100.7)).toBe('2 h 15 min');
  // Below the second unit nothing is shown rather than a zero.
  expect(formatSeconds(3600 + 20)).toBe('1 h');
});
