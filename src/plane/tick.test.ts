import { expect, test } from 'vitest';
import { V } from '../model/motion';
import { MAX_SCALE, MIN_SCALE } from './camera';
import { tickMsFor } from './tick';

test('the tick is one screen pixel of cruise motion, clamped to 16 ms and a minute', () => {
  expect(tickMsFor(MAX_SCALE)).toBe(40);
  expect(tickMsFor(1)).toBe(1000 / V);
  expect(tickMsFor(0.01)).toBe(60_000);
  expect(tickMsFor(MIN_SCALE)).toBe(60_000);
  expect(tickMsFor(1000)).toBe(16);
});
