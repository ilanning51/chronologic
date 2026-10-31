import { expect, test } from 'vitest';
import { invertProgress, progress } from './motion';

test('the profile starts and ends at rest and is pinned at the fifths', () => {
  expect(progress(0)).toBe(0);
  expect(progress(1)).toBe(1);
  expect(progress(0.2)).toBeCloseTo(0.125);
  expect(progress(0.5)).toBeCloseTo(0.5);
  expect(progress(0.8)).toBeCloseTo(0.875);
  expect(progress(-1)).toBe(0);
  expect(progress(7)).toBe(1);
});
test('progress is monotone and invertProgress is its inverse', () => {
  for (let i = 0; i <= 100; i++) {
    const tau = i / 100;
    expect(invertProgress(progress(tau))).toBeCloseTo(tau, 9);
    if (i > 0) expect(progress(tau)).toBeGreaterThan(progress((i - 1) / 100));
  }
});
